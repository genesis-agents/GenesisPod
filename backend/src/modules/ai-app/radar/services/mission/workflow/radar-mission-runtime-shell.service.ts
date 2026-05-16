/**
 * RadarMissionRuntimeShell —— Radar 业务 adapter（thin wrapper to framework）
 *
 * 完全对齐 agent-playground/MissionRuntimeShellService 范式：
 *   - 不再自己实现 lifecycle（wallTimer / heartbeat / abort / cleanup）
 *   - 通过 IMissionRuntimeAdapter 注入业务专属决策，剩下让框架处理
 *   - 复用 ai-harness/teams/business-team/lifecycle/mission-runtime-shell.framework
 */
import { Injectable } from "@nestjs/common";
import {
  DomainEventBus,
  MissionRuntimeShellFramework,
  type IMissionRuntimeAdapter,
  type MissionRuntimeSession,
} from "@/modules/ai-harness/facade";
import { RadarMissionStore } from "../lifecycle/radar-mission-store.service";
import {
  RunRadarRefreshMissionInput,
  resolveRadarBudgetMultiplier,
  resolveRadarMaxCredits,
  resolveRadarMissionWallTimeMs,
} from "../../../dto/run-radar-refresh-mission.dto";
import { RadarRunTrigger } from "@prisma/client";

export type { MissionRuntimeSession };

const RADAR_EVENT_NAMESPACE = "ai-radar";
const RADAR_BILLING_MODULE_TYPE = "ai-radar";

@Injectable()
export class RadarMissionRuntimeShell {
  constructor(
    private readonly framework: MissionRuntimeShellFramework,
    private readonly store: RadarMissionStore,
    private readonly eventBus: DomainEventBus,
  ) {}

  async openSession(args: {
    missionId: string;
    input: RunRadarRefreshMissionInput;
    userId: string;
    workspaceId?: string;
  }): Promise<MissionRuntimeSession> {
    return this.framework.openSession({
      missionId: args.missionId,
      input: args.input,
      userId: args.userId,
      workspaceId: args.workspaceId,
      adapter: this.buildAdapter(),
    });
  }

  async runWithinContext<T>(
    session: MissionRuntimeSession,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.framework.runWithinContext(
      session,
      RADAR_EVENT_NAMESPACE,
      RADAR_BILLING_MODULE_TYPE,
      fn,
    );
  }

  /** Radar 业务 adapter：注入业务专属决策给 framework */
  private buildAdapter(): IMissionRuntimeAdapter<RunRadarRefreshMissionInput> {
    const store = this.store;
    const eventBus = this.eventBus;
    return {
      eventNamespace: RADAR_EVENT_NAMESPACE,
      billingModuleType: RADAR_BILLING_MODULE_TYPE,
      resolveWallTimeMs: () => resolveRadarMissionWallTimeMs(),
      resolveMaxCredits: () => resolveRadarMaxCredits(),
      resolveBudgetMultiplier: () => resolveRadarBudgetMultiplier(),
      createMissionRow: async ({
        missionId,
        userId,
        workspaceId,
        input,
        effectiveMaxCredits,
      }) => {
        await store.createAtomic({
          id: missionId,
          topicId: input.topicId,
          userId,
          workspaceId,
          trigger: mapTrigger(input.trigger),
          maxCredits: effectiveMaxCredits,
          wallTimeMs: resolveRadarMissionWallTimeMs(),
          payload: {
            topicName: input.topicName,
            description: input.description ?? null,
            keywords: input.keywords,
            entityType: input.entityType ?? null,
            refreshCron: input.refreshCron,
            trigger: input.trigger,
          },
        });
      },
      refreshHeartbeat: async (missionId, podId) => {
        await store.refreshHeartbeat(missionId, podId);
      },
      emitMissionEvent: async ({ type, missionId, userId, payload }) => {
        await eventBus
          .emit({
            type,
            scope: { missionId, userId },
            payload,
            timestamp: Date.now(),
          })
          .catch(() => {
            // eventBus 自己 log + drop，这里再吞一次防 framework wallTimer
            // 闭包 throw 不可控
          });
      },
    };
  }
}

function mapTrigger(
  trigger: "MANUAL" | "SCHEDULED" | "FIRST_RUN",
): RadarRunTrigger {
  switch (trigger) {
    case "SCHEDULED":
      return RadarRunTrigger.SCHEDULED;
    case "FIRST_RUN":
      return RadarRunTrigger.FIRST_RUN;
    default:
      return RadarRunTrigger.MANUAL;
  }
}
