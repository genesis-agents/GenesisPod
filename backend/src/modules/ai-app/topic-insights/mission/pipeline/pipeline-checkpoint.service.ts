/**
 * PipelineCheckpointService — stage-level checkpoint persistence for H2 resume.
 *
 * Design:
 * - One row per mission (unique index on missionId). Each stage.persist success
 *   triggers an upsert: merge the new stage output into stageResults, append the
 *   stageId to completedStages, refresh budgetSnapshot.
 * - On resume, load the row, rehydrate the StageResults map, and pass
 *   completedStages back so the orchestrator skips them.
 * - identitySnapshot captures the re-runnable identity slice (depth, mode,
 *   capabilities, reportId, userId) so resume doesn't need a separate caller
 *   to reconstruct context. AbortController + PipelineBudget are runtime
 *   objects, not persisted.
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import type { BudgetUsage } from "./types/budget";
import type { StageId } from "./types/stage";
import type { PipelineIdentityContext } from "./types/identity-context";

type BudgetSnapshot = Readonly<BudgetUsage>;

export interface PersistableIdentitySnapshot {
  readonly reportId: string;
  readonly userId: string;
  readonly cachePrefix: string;
  readonly depth: PipelineIdentityContext["depth"];
  readonly mode: PipelineIdentityContext["mode"];
  readonly degradationMode: boolean;
  readonly capabilities?: PipelineIdentityContext["capabilities"];
}

export interface Checkpoint {
  readonly missionId: string;
  readonly completedStages: readonly StageId[];
  /** stageId -> arbitrary stage output JSON */
  readonly stageResults: Record<string, unknown>;
  readonly budgetSnapshot: BudgetSnapshot;
  readonly identitySnapshot: PersistableIdentitySnapshot;
  readonly lastStageId: StageId | null;
  readonly updatedAt: Date;
}

@Injectable()
export class PipelineCheckpointService {
  private readonly logger = new Logger(PipelineCheckpointService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async saveStage(
    identity: PipelineIdentityContext,
    stageId: StageId,
    stageOutput: unknown,
    completedStages: readonly StageId[],
    accumulatedResults: Record<string, unknown>,
  ): Promise<void> {
    if (!this.prisma) return; // unit-test safe

    const identitySnapshot: PersistableIdentitySnapshot = {
      reportId: identity.reportId,
      userId: identity.userId,
      cachePrefix: identity.cachePrefix,
      depth: identity.depth,
      mode: identity.mode,
      degradationMode: identity.degradationMode,
      capabilities: identity.capabilities,
    };

    const merged = { ...accumulatedResults, [stageId]: stageOutput };

    try {
      await this.prisma.pipelineRunCheckpoint.upsert({
        where: { missionId: identity.missionId },
        create: {
          missionId: identity.missionId,
          completedStages: toPrismaJson(completedStages),
          stageResults: toPrismaJson(merged),
          budgetSnapshot: toPrismaJson(identity.budget.snapshot()),
          identitySnapshot: toPrismaJson(identitySnapshot),
          lastStageId: stageId,
        },
        update: {
          completedStages: toPrismaJson(completedStages),
          stageResults: toPrismaJson(merged),
          budgetSnapshot: toPrismaJson(identity.budget.snapshot()),
          identitySnapshot: toPrismaJson(identitySnapshot),
          lastStageId: stageId,
        },
      });
    } catch (err) {
      this.logger.warn(
        `[saveStage] mission=${identity.missionId} stage=${stageId} persist failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async load(missionId: string): Promise<Checkpoint | null> {
    if (!this.prisma) return null;
    try {
      const row = await this.prisma.pipelineRunCheckpoint.findUnique({
        where: { missionId },
      });
      if (!row) return null;
      return {
        missionId: row.missionId,
        completedStages: row.completedStages as unknown as StageId[],
        stageResults: row.stageResults as unknown as Record<string, unknown>,
        budgetSnapshot: row.budgetSnapshot as unknown as BudgetSnapshot,
        identitySnapshot:
          row.identitySnapshot as unknown as PersistableIdentitySnapshot,
        lastStageId: row.lastStageId as StageId | null,
        updatedAt: row.updatedAt,
      };
    } catch (err) {
      this.logger.warn(
        `[load] mission=${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /** Called on terminal success/fail — checkpoint no longer needed for resume. */
  async clear(missionId: string): Promise<void> {
    if (!this.prisma) return;
    try {
      await this.prisma.pipelineRunCheckpoint.deleteMany({
        where: { missionId },
      });
    } catch (err) {
      this.logger.warn(
        `[clear] mission=${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
