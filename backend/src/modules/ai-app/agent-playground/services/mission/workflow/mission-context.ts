/**
 * MissionContext —— 跨 stage 共享的可变状态包
 *
 * runMission() 主剧本在装配阶段构造一个 MissionContext，每个 stage 函数读取
 * 之前 stage 的产物 + 写入自己的产物到 ctx，最后由 persist stage 落盘 + 返回。
 *
 * 设计决策 (Phase Lead-Stages):
 *   • ctx 是 mutable —— stage 通过 ctx.X = ... 写产物，不返回独立结构
 *   • readonly 字段在装配后不可变（mission lifetime 不变量）
 *   • 可变字段为 optional —— 表示"尚未到达该 stage"
 *   • 不放 mission 自身（leader/billing/pool/abortRegistry 等基础设施）—— 那些是 dep
 *
 * 用法:
 *   const ctx = await assembleContext(input, userId, missionId);
 *   await runLeaderPlanStage(ctx, deps);
 *   await runResearcherDispatchStage(ctx, deps);
 *   // ...
 *   return await runPersistStage(ctx, deps);
 */

import type { SupervisedMission } from "../../roles";
import type {
  LeaderForewordOutput,
  LeaderPlanOutput,
  LeaderSignoffOutput,
} from "../../../agents/leader/leader.agent";
import type { MissionBudgetPool } from "../../../../../ai-harness/facade";
import type { ReportArtifact } from "@/modules/ai-harness/facade";
import type {
  RunMissionInput,
  ResearchReport,
} from "../../../dto/run-mission.dto";
import type { BillingRuntimeEnvAdapter } from "../../../../../ai-harness/facade";
import type { QualityTraceContext } from "../../../../../ai-harness/facade";

export interface MissionContext {
  // ── 不变量（装配时确定）──
  readonly missionId: string;
  readonly userId: string;
  readonly input: RunMissionInput;
  readonly t0: number;

  // 基础设施 dep（mission 内长生命周期）
  readonly billing: BillingRuntimeEnvAdapter;
  readonly pool: MissionBudgetPool;
  readonly leader: SupervisedMission;
  readonly budgetMultiplier: number;

  // ── Stage 间产物（按 stage 顺序填充）──

  /** 10-leader-plan.stage.ts */
  plan?: {
    themeSummary: string;
    dimensions: {
      id: string;
      name: string;
      rationale: string;
      toolHint?: {
        categories: string[];
        preferIds?: string[];
      };
      dependsOn?: string[];
    }[];
    goals: LeaderPlanOutput["goals"];
    initialRisks: LeaderPlanOutput["initialRisks"];
  };

  /** 20-researcher-dispatch.stage.ts */
  researcherResults?: {
    dimension: string;
    findings: { claim: string; evidence: string; source: string }[];
    summary: string;
    figureCandidates?: unknown[];
  }[];

  /** 40-reconciler.stage.ts */
  reconciliationReport?: {
    factTable: unknown[];
    conflicts: unknown[];
    overlaps: unknown[];
    gaps: unknown[];
    figureCandidates: unknown[];
    reconciliationReport: string;
  } | null;

  /** 50-analyst.stage.ts */
  analystOutput?: unknown;

  /** 60-writer.stage.ts —— ResearchReport v1 + ReportArtifact v2 */
  report?: ResearchReport;
  reportArtifact?: ReportArtifact;
  reviewScore?: number;
  verifierVerdicts?: unknown[];

  /** 80-leader-foreword.stage.ts (M6) */
  leaderForeword?: LeaderForewordOutput & { generatedAt: string };

  /** 90-leader-signoff.stage.ts (M7) */
  leaderSignOff?: LeaderSignoffOutput;

  /** 99-persist.stage.ts */
  trajectoryStored?: number;

  /**
   * ★ P0-5 (2026-04-29): S4 patch 轮次计数 —— 防止 stage 被反复重入导致 wall-time 爆炸。
   * 每进入一次 dispatchAssessActions（patch/redirect 决策）+1，第二轮起强制降级 retry 为 accept-degraded。
   */
  s4PatchRound?: number;

  /**
   * ★ P0-LIVE-PATCH-SILENT (2026-04-30): S4 dispatch 失败的 retry job 真因记录。
   *
   * 之前 dispatchAssessActions 内 DAGExecutor catch 静默 swallow，patch 失败
   * 完全不上报 → mission 主流程不知道 Leader 觉得"必须 patch"的 dim 实际没补到，
   * 继续走 S5/S6/S7/S8 → 用残缺/陈旧 findings 起草报告 → S10 Leader 仍可能签字
   * 因为不知道这些 patch 失败了。
   *
   * 现在显式落到 ctx：S4 失败一次 push 一条；下游 S10 leader signoff 必须读这个
   * 字段，patchFailures.length > 0 时强制 mission 至少 quality-degraded。
   */
  s4PatchFailures?: {
    dimensionId: string;
    dimensionName: string;
    retryLabel: string;
    reason: string;
    error: string;
    occurredAt: number;
  }[];

  // ★ P1-R5-I (2026-04-30): s10RevisionRound 之前是死字段 — 注释承诺"第 2 次拒签
  //   markFailed 避免无限 revision"未实现。当下 S10 路径 leader signoff 失败直接发
  //   mission:failed，没有 revision 循环；字段无消费方。删除直至真正实现。

  /** ★ 沉淀消费 v3 (2026-04-29): 全链路质量 trace 收集 */
  qualityTraceCtx?: QualityTraceContext;
  /** ★ 沉淀消费 v3 (2026-04-29): 10 维结构化报告评审结果 */
  reportEvaluation?: import("../../../../../ai-harness/facade").EvaluationResult;
  /**
   * ★ P1-E (2026-04-29): S7 outline 真消费
   * thorough+ 档位下 S7 产出的 mission-level chapter outline，由 S8 SingleShotWriter
   * 严格按 sectionId/heading/thesis/keyPoints/targetWords 起草，提升长文兑现率。
   * 之前是死字段（仅 emit 给前端 trace）。
   */
  outlinePlan?: {
    chapterOutlines: {
      sectionId: string;
      heading: string;
      subheadings: string[];
      thesis: string;
      keyPointsToCover: string[];
    }[];
    targetWordsPerChapter: Record<string, number>;
    factAllocation: Record<string, string[]>;
  };
}
