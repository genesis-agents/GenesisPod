/**
 * SocialBusinessOrchestrator —— 业务编排（buildHooksForStep + STAGE_NUMBER）
 *
 * 从 dispatcher 抽出"业务编排"职责（mirror agent-playground/
 * playground-business-orchestrator.service.ts）。dispatcher 留 runtime-glue：
 * sessions Map / runMission 主入口 / cleanup。
 *
 * 关系：dispatcher inject 此 service，onModuleInit 调 `bindSessionLookup` 注入
 * sessions Map 访问器；hook closures 在执行时通过 sessionLookup(missionId)
 * 拿 SessionEntry，再 delegate 到既有 stage adapter（runXxxStage(ctx, deps)）。
 *
 * 单向依赖：dispatcher → business-orchestrator。business-orchestrator 不引用
 * dispatcher 运行时类（只 type-import SessionEntry）。
 *
 * Stage 全部用 persist primitive（hooks.persist({ ctx, ... })），原因：
 *   - social 12 个 stage 都是 side-effect 操作（写浏览器 / 远端 API / DB）
 *   - persist 是无 LLM primitive，hook 形态最贴合 stage adapter (ctx, deps)
 *   - LLM 调用 / agent 执行仍由 SocialAgentInvoker → AgentRunner 在 stage
 *     adapter 内部完成；这层 hook 只是把 orchestrator 的 generic step run
 *     接到 social mission state（SessionEntry.ctx）
 */

import { Injectable } from "@nestjs/common";
import { StageAbortError } from "@/modules/ai-harness/facade";
import type {
  ResolvedStageHooks,
  StageRunArgs,
} from "@/modules/ai-harness/facade";
import {
  runMissionBudgetEvalStage,
  runPlatformProbeStage,
  runContentTransformStage,
  runLeaderAssessTransformStage,
  runCoverCraftStage,
  runBodyComposeStage,
  runPolishReviewStage,
  runPublishExecuteStage,
  runPublishRetryStage,
  runPublishVerifyStage,
  runLeaderSignoffStage,
  runMissionPersistStage,
} from "./stages";
import type { SessionEntry } from "./social-pipeline-dispatcher.service";

type SessionLookup = (missionId: string) => SessionEntry;

/** stepId → DB stage number（s8b 同 s8 阶段，s12 不入 stage 计数） */
const STAGE_NUMBER: Record<string, number> = {
  "s1-mission-budget-eval": 1,
  "s2-platform-probe": 2,
  "s3-content-transform": 3,
  "s4-leader-assess-transform": 4,
  "s5-cover-craft": 5,
  "s6-body-compose": 6,
  "s7-polish-review": 7,
  "s8-publish-execute": 8,
  "s8b-publish-retry": 8,
  "s9-publish-verify": 9,
  "s10-leader-signoff": 10,
  "s11-mission-persist": 11,
};

@Injectable()
export class SocialBusinessOrchestrator {
  private sessionLookup?: SessionLookup;

  readonly STAGE_NUMBER = STAGE_NUMBER;

  /**
   * dispatcher.onModuleInit 调一次，把 sessions Map lookup 注入。
   */
  bindSessionLookup(lookup: SessionLookup): void {
    this.sessionLookup = lookup;
  }

  /**
   * 主入口：为 stepId 构造 stage hooks（dispatcher.buildPipelineWithHooks 调用）。
   */
  buildHooksForStep(stepId: string, _primitive: string): ResolvedStageHooks {
    const hookFn = this.resolveStageRunner(stepId);
    if (!hookFn) {
      throw new Error(
        `[social-business-orch] no stage runner for "${stepId}". ` +
          `All steps in SOCIAL_PIPELINE.steps must have an explicit branch.`,
      );
    }
    // ResolvedStageHooks = { [hookName: string]: StageHookFn | undefined }；
    // 直接以 ResolvedStageHooks 类型字面量构造，避免 `as unknown as` 强转
    // （Round-3 Reviewer E P1：收紧 type bridge）。
    const hooks: ResolvedStageHooks = {
      persist: async (args: unknown): Promise<void> => {
        const a = args as {
          ctx: StageRunArgs["ctx"];
          previousOutputs: StageRunArgs["previousOutputs"];
          crossStageState: StageRunArgs["crossStageState"];
        };
        // signal 检查：abort 立即抛 StageAbortError（orchestrator 自然 mission:aborted）
        if (a.ctx.signal?.aborted) {
          throw new StageAbortError(
            stepId,
            "mission cancelled (signal aborted)",
          );
        }
        const entry = this.getEntry(a.ctx.missionId);
        await hookFn(entry);
      },
    };
    return hooks;
  }

  private resolveStageRunner(
    stepId: string,
  ): ((entry: SessionEntry) => Promise<void>) | null {
    const deps = (entry: SessionEntry) => entry.deps;
    const ctx = (entry: SessionEntry) => entry.ctx;
    switch (stepId) {
      case "s1-mission-budget-eval":
        return async (e) => {
          await runMissionBudgetEvalStage(ctx(e), deps(e));
        };
      case "s2-platform-probe":
        return async (e) => {
          await runPlatformProbeStage(ctx(e), deps(e));
        };
      case "s3-content-transform":
        return async (e) => {
          await runContentTransformStage(ctx(e), deps(e));
        };
      case "s4-leader-assess-transform":
        return async (e) => {
          await runLeaderAssessTransformStage(ctx(e), deps(e));
        };
      case "s5-cover-craft":
        return async (e) => {
          await runCoverCraftStage(ctx(e), deps(e));
        };
      case "s6-body-compose":
        return async (e) => {
          await runBodyComposeStage(ctx(e), deps(e));
        };
      case "s7-polish-review":
        return async (e) => {
          await runPolishReviewStage(ctx(e), deps(e));
        };
      case "s8-publish-execute":
        return async (e) => {
          await runPublishExecuteStage(ctx(e), deps(e));
        };
      case "s8b-publish-retry":
        return async (e) => {
          await runPublishRetryStage(ctx(e), deps(e));
        };
      case "s9-publish-verify":
        return async (e) => {
          await runPublishVerifyStage(ctx(e), deps(e));
        };
      case "s10-leader-signoff":
        return async (e) => {
          await runLeaderSignoffStage(ctx(e), deps(e));
        };
      case "s11-mission-persist":
        return async (e) => {
          await runMissionPersistStage(ctx(e), deps(e));
        };
      default:
        return null;
    }
  }

  private getEntry(missionId: string): SessionEntry {
    if (!this.sessionLookup) {
      throw new Error(
        `[social-business-orch] sessionLookup not bound; ` +
          `dispatcher must call bindSessionLookup() in onModuleInit`,
      );
    }
    return this.sessionLookup(missionId);
  }
}
