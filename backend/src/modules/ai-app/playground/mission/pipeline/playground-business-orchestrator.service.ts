/**
 * PlaygroundBusinessOrchestrator —— Stage 1 / S1-1 拆分(2026-05-09)
 *
 * ★ #16b/#16c 硬切后（2026-06-09）：playground 已硬切到能力轨唯一执行（消费 deep-insight
 *   能力核），私有 14 阶段 hooks 全部退役。本 service 原持有的 11 个 build*Hooks /
 *   buildHooksForStep / buildReviewHooks / CHECKPOINT_AT / PRIMARY_HOOK_BY_PRIMITIVE /
 *   buildStageInvariants / recordForesightPredictions 已成为不可达死代码并删除（连带
 *   stageBindings / missionCheckpoint / store / predictionCalibration 注入一并移除）。
 *
 *   现仅保留 dispatcher 仍消费的 runtime-glue：
 *     - STAGE_NUMBER：crash-resume 排序（dispatcher.runMission）。
 *     - resolveTriggerType：报告版本触发类型（dispatcher.handleMissionFailure saveReportVersion）。
 *     - resolveStageRunner：framework 抽象方法实现（返回 null，playground 不走 default adapter）。
 *     - bindSessionLookup / getEntry：来自 BusinessTeamOrchestratorFramework 基类（继承）。
 *
 * 关系：dispatcher inject 本 service，onModuleInit 调 bindSessionLookup 注入 session 访问器。
 * **单向依赖**：dispatcher → business-orchestrator（只 type-import SessionEntry）。
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  BusinessTeamOrchestratorFramework,
  type BusinessTeamStageRunner,
} from "@/modules/ai-harness/facade";
import type { SessionEntry } from "./playground.pipeline";

// stepId → DB stageNumber(与 legacy team.mission.ts 对齐)
// 用于 markStageComplete + missionCheckpoint.save 的进度索引（crash-resume 排序）
const STAGE_NUMBER: Record<string, number> = {
  "s1-budget": 1,
  "s2-leader-plan": 2,
  "s3-researcher-collect": 3,
  "s4-leader-assess": 4,
  "s5-reconciler": 5,
  "s6-analyst": 6,
  "s7-writer-outline": 7,
  "s8-writer": 8,
  "s8b-quality-enhancement": 8, // 同 s8(quality 增强)
  "s9-critic": 9,
  "s9b-objective-eval": 9,
  "s10-leader-foreword-signoff": 10,
  "s11-persist": 11,
  // s12 在 legacy 不入 stage 计数(fire-and-forget)
};

@Injectable()
export class PlaygroundBusinessOrchestrator extends BusinessTeamOrchestratorFramework<SessionEntry> {
  protected readonly log = new Logger(PlaygroundBusinessOrchestrator.name);

  // 暴露给 dispatcher（this.businessOrch.STAGE_NUMBER）—— crash-resume 排序。
  readonly STAGE_NUMBER = STAGE_NUMBER;

  constructor() {
    super({ namespace: "playground", stageNumber: STAGE_NUMBER });
  }

  /**
   * Framework 要求实现 resolveStageRunner（抽象方法）；playground 不走 framework 默认
   * single-runner adapter（能力轨在能力核内编排），返回 null 保持 "no runner" 语义自洽。
   */
  protected resolveStageRunner(
    _stepId: string,
  ): BusinessTeamStageRunner<SessionEntry> | null {
    return null;
  }

  /**
   * 从 entry.input 推导版本触发类型：inheritFromMissionId 存在 → rerun；否则 initial。
   * dispatcher.handleMissionFailure 的 saveReportVersion 失败路径复用。
   */
  resolveTriggerType(entry: SessionEntry): string {
    return entry.input.inheritFromMissionId ? "rerun-fresh" : "initial";
  }
}
