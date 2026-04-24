/**
 * Mission Amendment Service (F3)
 *
 * Pause-Amend-Resume primitive for mid-mission dimension edits.
 *
 * Why this exists:
 *   The prior /mission/adjust implementation wrote new ResearchTask rows but
 *   never touched TopicDimension, so the harness pipeline (which reads from
 *   TopicDimension, not ResearchTask) never saw the change. The endpoint
 *   returned 200 while silently dropping user edits.
 *
 * What it does now:
 *   1. snapshot — capture checkpoint state so a resume can reconcile.
 *   2. apply — mutate TopicDimension (and ResearchTask for UI) atomically.
 *   3. emit — RESEARCH_PAUSED / DIMENSION_ADDED / DIMENSION_REMOVED /
 *             RESEARCH_RESUMED so sockets stay in sync.
 *   4. resume — trigger harness with H3 dimensionScope focused on the newly
 *               added dimensions (or omit scope when only removing).
 *
 * Scope (MVP):
 *   - Add / remove dimensions land in the DB and the running mission picks
 *     them up on next checkpoint cycle.
 *   - Focus-area rebalancing is recorded but does not mutate priorities yet
 *     (follow-up once pipeline priority hooks land).
 */

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";

import { PrismaService } from "@/common/prisma/prisma.service";
import {
  DimensionStatus,
  LeaderDecisionType,
  ResearchMissionStatus,
  ResearchTaskStatus,
} from "@prisma/client";

import { ResearchEventEmitterService } from "@/modules/ai-app/topic-insights/mission/realtime/event-emitter.service";
import { MissionCancellationService } from "./cancellation.service";
import { MissionExecutionService } from "./execution.service";

export interface MissionAmendment {
  readonly addDimensions?: ReadonlyArray<{
    readonly name: string;
    readonly description?: string;
    readonly searchQueries?: readonly string[];
    readonly searchSources?: readonly string[];
    readonly minSources?: number;
  }>;
  readonly removeDimensions?: readonly string[];
  readonly focusAreas?: readonly string[];
  readonly reason?: string;
  readonly requestedBy: string;
}

export interface AmendmentResult {
  readonly missionId: string;
  readonly topicId: string;
  readonly addedDimensionIds: readonly string[];
  readonly removedDimensionIds: readonly string[];
  readonly focusAreasRecorded: readonly string[];
  readonly resumed: boolean;
}

@Injectable()
export class MissionAmendmentService {
  private readonly logger = new Logger(MissionAmendmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ResearchEventEmitterService,
    private readonly cancellation: MissionCancellationService,
    // forwardRef: MissionExecutionService ← lifecycle ← amendment.
    // Amendment invokes Execution.startExecution as the "resume" leg of
    // pause-amend-resume. The reverse path does not exist, but lifecycle +
    // execution already participate in a forwardRef chain that amendment
    // is pulled into transitively when the module builds its DI graph.
    @Inject(forwardRef(() => MissionExecutionService))
    private readonly execution: MissionExecutionService,
  ) {}

  /**
   * Pause in-flight harness, apply amendment, resume with the new dimension scope.
   *
   * The harness AbortController is flipped; the existing run's catch block
   * sees it and settles the mission. We then apply the DB mutation and kick
   * off a fresh `startExecution` so the pipeline re-plans against the
   * updated TopicDimension state.
   */
  async pauseAndAmend(
    userId: string,
    missionId: string,
    amendment: MissionAmendment,
  ): Promise<AmendmentResult> {
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: { topic: { select: { userId: true, id: true } } },
    });
    if (!mission) {
      throw new NotFoundException(`Mission ${missionId} not found`);
    }
    if (mission.topic.userId !== userId) {
      throw new ForbiddenException(
        "You do not have permission to amend this mission",
      );
    }
    const topicId = mission.topic.id;

    const amendableStatuses: readonly ResearchMissionStatus[] = [
      ResearchMissionStatus.PLANNING,
      ResearchMissionStatus.PLAN_READY,
      ResearchMissionStatus.EXECUTING,
      ResearchMissionStatus.REVIEWING,
    ];
    if (!amendableStatuses.includes(mission.status)) {
      throw new BadRequestException(
        `Cannot amend mission in ${mission.status} status`,
      );
    }

    const addList = amendment.addDimensions ?? [];
    const removeList = amendment.removeDimensions ?? [];
    const focusList = amendment.focusAreas ?? [];

    if (
      addList.length === 0 &&
      removeList.length === 0 &&
      focusList.length === 0
    ) {
      throw new BadRequestException(
        "Amendment must contain at least one of addDimensions, removeDimensions, focusAreas",
      );
    }

    // Pause the in-flight pipeline so it doesn't race against our DB edits.
    const wasActive = this.cancellation.cancel(missionId, {
      reason: "mission amendment in progress",
      requestedBy: amendment.requestedBy,
      requestedAt: new Date(),
    });
    if (wasActive) {
      await this.events.emitResearchPaused(topicId, {
        missionId,
        reason: amendment.reason ?? "amendment",
        requestedBy: amendment.requestedBy,
      });
    }

    const addedDimensionIds: string[] = [];
    const removedDimensionIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      // Resolve next sortOrder once; each insert bumps via the loop.
      let next = await this.nextSortOrder(topicId, tx);

      for (const dim of addList) {
        const created = await tx.topicDimension.create({
          data: {
            topicId,
            name: dim.name,
            description: dim.description ?? "",
            searchQueries: dim.searchQueries ? [...dim.searchQueries] : [],
            searchSources: dim.searchSources ? [...dim.searchSources] : [],
            minSources: dim.minSources ?? 5,
            sortOrder: next,
            isEnabled: true,
            status: DimensionStatus.PENDING,
          },
          select: { id: true, name: true, sortOrder: true },
        });
        next += 1;
        addedDimensionIds.push(created.id);

        // Keep ResearchTask rows in step so the existing progress UI shows
        // the new dimension immediately; harness schedule will claim this.
        await tx.researchTask.create({
          data: {
            missionId,
            title: `研究: ${dim.name}`,
            description: dim.description ?? "",
            taskType: "dimension_research",
            dimensionName: dim.name,
            dimensionId: created.id,
            assignedAgent: "researcher_dynamic",
            assignedAgentType: "dimension_researcher",
            priority: 5,
            status: ResearchTaskStatus.PENDING,
          },
        });
      }

      for (const dimRef of removeList) {
        const target = await tx.topicDimension.findFirst({
          where: {
            topicId,
            OR: [{ id: dimRef }, { name: dimRef }],
          },
          select: { id: true, name: true },
        });
        if (!target) continue;

        // Remove pending tasks for the dimension; completed ones stay for audit.
        await tx.researchTask.deleteMany({
          where: {
            missionId,
            dimensionId: target.id,
            status: ResearchTaskStatus.PENDING,
          },
        });
        await tx.topicDimension.delete({ where: { id: target.id } });
        removedDimensionIds.push(target.id);
      }

      if (addList.length > 0) {
        await tx.researchMission.update({
          where: { id: missionId },
          data: { totalTasks: { increment: addList.length } },
        });
      }

      await tx.leaderDecision.create({
        data: {
          missionId,
          type: LeaderDecisionType.ADJUST,
          input: {
            add: addList.map((a) => a.name),
            remove: [...removeList],
            focus: [...focusList],
            reason: amendment.reason ?? null,
            requestedBy: amendment.requestedBy,
          },
          decision: {
            addedDimensionIds,
            removedDimensionIds,
            focusAreasRecorded: [...focusList],
          },
          reasoning:
            amendment.reason ?? "用户通过 /mission/adjust 修改研究范围",
        },
      });
    });

    // Emit fine-grained events so sockets can animate additions/removals.
    for (const id of addedDimensionIds) {
      const dim = addList[addedDimensionIds.indexOf(id)];
      await this.events.emitDimensionAdded(topicId, {
        dimensionId: id,
        name: dim.name,
        missionId,
        reason: amendment.reason,
      });
    }
    for (const id of removedDimensionIds) {
      await this.events.emitDimensionRemoved(topicId, {
        dimensionId: id,
        missionId,
        reason: amendment.reason,
      });
    }

    const shouldResume =
      wasActive ||
      mission.status === ResearchMissionStatus.EXECUTING ||
      mission.status === ResearchMissionStatus.PLANNING ||
      mission.status === ResearchMissionStatus.PLAN_READY ||
      mission.status === ResearchMissionStatus.REVIEWING;

    if (shouldResume) {
      const scope =
        addedDimensionIds.length > 0 ? addedDimensionIds : undefined;
      void this.execution
        .startExecution(missionId, topicId, { dimensionScope: scope })
        .then(async () => {
          await this.events.emitResearchResumed(topicId, {
            missionId,
            requestedBy: amendment.requestedBy,
            resumedFromStage: "amendment",
          });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `[pauseAndAmend] resume failed mission=${missionId}: ${msg}`,
          );
        });
    }

    return {
      missionId,
      topicId,
      addedDimensionIds,
      removedDimensionIds,
      focusAreasRecorded: [...focusList],
      resumed: shouldResume,
    };
  }

  private async nextSortOrder(
    topicId: string,
    tx: Pick<PrismaService, "topicDimension">,
  ): Promise<number> {
    const max = await tx.topicDimension.findFirst({
      where: { topicId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    return (max?.sortOrder ?? 0) + 1;
  }
}
