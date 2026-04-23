/**
 * Topic Insights 能力契约（目标架构 v2 · 2026-04-23）
 *
 * L3 App 专属语义，基于 L2 RuntimeEnvironmentService 的 EnvironmentSnapshot 做裁剪。
 * 设计文档：docs/design/topic-insights-harness-redesign/11-target-architecture.md
 */

import type { EnvironmentSnapshot } from "@/modules/ai-engine/facade";
import type { ResearchDepth } from "../pipeline/types";

export type TopicInsightsDegradationKind =
  | "critical_table_missing"
  | "optional_table_missing"
  | "core_agent_missing"
  | "enhancement_agent_missing"
  | "advanced_agent_missing"
  | "chat_model_missing"
  | "reasoning_model_missing"
  | "key_unavailable"
  | "depth_downgrade";

export interface TopicInsightsDegradation {
  readonly kind: TopicInsightsDegradationKind;
  readonly detail: string;
  readonly severity: "info" | "warn" | "error";
}

export interface TopicInsightsCapabilitySnapshot {
  /** L2 环境客观事实（原样透出，便于 Leader prompt 引用） */
  readonly env: EnvironmentSnapshot;

  /** Topic Insights 对齐后的结果 */
  readonly topicInsights: {
    readonly requiredTablesPresent: Readonly<Record<string, boolean>>;
    readonly missingCoreAgents: ReadonlyArray<string>;
    readonly missingEnhancementAgents: ReadonlyArray<string>;
    readonly missingAdvancedAgents: ReadonlyArray<string>;
  };

  /** 按真实能力裁剪后的 depth（≤ 用户请求） */
  readonly recommendedDepth: ResearchDepth;

  /** 用户原始请求 depth */
  readonly requestedDepth: ResearchDepth;

  /** degradation 汇总（error → runWithHarness 入口 fail；warn / info → 日志） */
  readonly degradations: ReadonlyArray<TopicInsightsDegradation>;
}

export interface ReconcileParams {
  readonly userId: string;
  readonly requestedDepth: ResearchDepth;
  readonly force?: boolean;
}
