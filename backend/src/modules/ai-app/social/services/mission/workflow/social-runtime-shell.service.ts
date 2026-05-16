/**
 * SocialRuntimeShellService — social 业务 adapter + thin wrapper
 *
 * 复用 ai-harness MissionRuntimeShellFramework 完成 mission lifecycle 装配
 * （billing context / MissionBudgetPool / AbortController / heartbeat / wallTimer
 *  / model+credit 预检），通过 IMissionRuntimeAdapter 注入 social 业务专属语义：
 *
 *   - eventNamespace="social"        ：让 framework 发出 social.mission:* 事件
 *   - billingModuleType="ai-social"  ：BillingContext.run 正确分类
 *   - resolveWallTimeMs / resolveMaxCredits / resolveBudgetMultiplier
 *                                    ：social 业务档位映射
 *   - createMissionRow              ：调 SocialMissionStore.create
 *   - refreshHeartbeat              ：调 SocialMissionStore.refreshHeartbeat
 *   - emitMissionEvent              ：经 DomainEventBus → 走 buffer + socket adapter
 *
 * Mirror of agent-playground/services/mission/workflow/mission-runtime-shell.service.ts，
 * 但 social 版本 simpler：无 inheritFromMissionId / userProfile JSON 持久化 / leader
 * supervisor 注入。
 */

import { Injectable } from "@nestjs/common";
import {
  DomainEventBus,
  MissionRuntimeShellFramework,
  type IMissionRuntimeAdapter,
  type MissionRuntimeSession,
} from "@/modules/ai-harness/facade";
import { SocialMissionStore } from "../lifecycle/social-mission-store.service";
import type { RunSocialMissionInput } from "./mission-context";

export type { MissionRuntimeSession };

const WALL_TIME_BY_DEPTH: Record<RunSocialMissionInput["depth"], number> = {
  quick: 15 * 60_000, //  15 min
  standard: 30 * 60_000, // 30 min
  deep: 60 * 60_000, // 60 min
};

const MAX_CREDITS_BY_PROFILE: Record<
  RunSocialMissionInput["budgetProfile"],
  number
> = {
  lean: 8,
  standard: 20,
  rich: 50,
};

const BUDGET_MULTIPLIER_BY_PROFILE: Record<
  RunSocialMissionInput["budgetProfile"],
  number
> = {
  lean: 0.6,
  standard: 1.0,
  rich: 1.6,
};

@Injectable()
export class SocialRuntimeShellService {
  constructor(
    private readonly framework: MissionRuntimeShellFramework,
    private readonly store: SocialMissionStore,
    private readonly eventBus: DomainEventBus,
  ) {}

  async openSession(args: {
    missionId: string;
    input: RunSocialMissionInput;
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
    return this.framework.runWithinContext(session, "ai-social", "team", fn);
  }

  private buildAdapter(): IMissionRuntimeAdapter<RunSocialMissionInput> {
    const store = this.store;
    const eventBus = this.eventBus;
    return {
      eventNamespace: "social",
      billingModuleType: "ai-social",
      resolveWallTimeMs: (input) =>
        WALL_TIME_BY_DEPTH[input.depth] ?? 30 * 60_000,
      resolveMaxCredits: (input) =>
        MAX_CREDITS_BY_PROFILE[input.budgetProfile] ?? 20,
      resolveBudgetMultiplier: (input) =>
        BUDGET_MULTIPLIER_BY_PROFILE[input.budgetProfile] ?? 1.0,
      createMissionRow: async ({
        missionId,
        userId,
        workspaceId,
        input,
        effectiveMaxCredits,
      }) => {
        await store.create({
          id: missionId,
          userId,
          workspaceId,
          contentId: input.contentId,
          platforms: input.platforms,
          maxCredits: effectiveMaxCredits,
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
            // schema 校验失败由 DomainEventBus 自己 log，这里不阻断
          });
      },
    };
  }
}
