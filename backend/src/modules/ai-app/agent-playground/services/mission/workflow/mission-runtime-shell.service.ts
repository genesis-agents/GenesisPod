/**
 * MissionRuntimeShellService — playground 业务 adapter + thin wrapper
 *
 * 2026-05-08 PR-E0：原 ~260 行 lifecycle 框架已上提到
 * `ai-harness/teams/business-team/lifecycle/mission-runtime-shell.framework.ts`。
 * 本文件保留作为 playground 业务 adapter（提供 event namespace / store schema /
 * billing moduleType / wallTime/credits 解析），调用 framework.openSession 完成 lifecycle 装配。
 */

import { Injectable } from "@nestjs/common";
import {
  MissionRuntimeShellFramework,
  type IMissionRuntimeAdapter,
  type MissionRuntimeSession,
} from "@/modules/ai-harness/facade";
import {
  resolveBudgetMultiplier,
  resolveMissionCredits,
  resolveMissionWallTimeMs,
  type RunMissionInput,
} from "../../../dto/run-mission.dto";
import { MissionStore } from "../lifecycle/mission-store.service";
import { AgentInvoker } from "../../roles";

export type { MissionRuntimeSession };

@Injectable()
export class MissionRuntimeShellService {
  constructor(
    private readonly framework: MissionRuntimeShellFramework,
    private readonly invoker: AgentInvoker,
    private readonly store: MissionStore,
  ) {}

  async openSession(args: {
    missionId: string;
    input: RunMissionInput;
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
      "agent-playground",
      "team",
      fn,
    );
  }

  /** Playground 业务 adapter：注入业务专属决策给 framework */
  private buildAdapter(): IMissionRuntimeAdapter<RunMissionInput> {
    const store = this.store;
    const invoker = this.invoker;
    return {
      eventNamespace: "agent-playground",
      billingModuleType: "agent-playground",
      resolveWallTimeMs: (input) => resolveMissionWallTimeMs(input),
      resolveMaxCredits: (input) => resolveMissionCredits(input),
      resolveBudgetMultiplier: (input) => resolveBudgetMultiplier(input),
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
          topic: input.topic,
          depth: input.depth,
          language: input.language,
          maxCredits: effectiveMaxCredits,
          userProfile: {
            depth: input.depth,
            language: input.language,
            budgetProfile: input.budgetProfile,
            styleProfile: input.styleProfile,
            lengthProfile: input.lengthProfile,
            audienceProfile: input.audienceProfile,
            withFigures: input.withFigures,
            auditLayers: input.auditLayers,
            concurrency: input.concurrency,
            viewMode: input.viewMode,
            searchTimeRange: input.searchTimeRange,
            // ★ P4 (2026-05-06): maxCredits / budgetMultiplierOverride 已在 row 字段
            //   存储，userProfile 不再双写（行字段是权威源）；wallTimeMs /
            //   knowledgeBaseIds / inheritFromMissionId 仅存于此 JSON
            wallTimeMs: input.wallTimeMs,
            knowledgeBaseIds: input.knowledgeBaseIds,
            inheritFromMissionId: input.inheritFromMissionId,
          } as Record<string, unknown>,
        });
      },
      refreshHeartbeat: async (missionId, podId) => {
        await store.refreshHeartbeat(missionId, podId);
      },
      emitMissionEvent: async ({ type, missionId, userId, payload }) => {
        await invoker.emitEvent({ type, missionId, userId, payload });
      },
    };
  }
}
