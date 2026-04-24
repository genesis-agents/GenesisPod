/**
 * Topic Insights 17 agent 声明式 spec 聚合入口
 *
 * 目标架构 v2（docs/design/topic-insights-harness-redesign/11-target-architecture.md）：
 * topic-insights.module.ts onModuleInit 遍历 TOPIC_INSIGHTS_AGENT_SPECS，
 * 调 L2 AgentFactory.create(spec) → L2 AgentRegistry.register(agent)。
 *
 * 17/17 specs 已就位。P2-2 将在 topic-insights.module 里注册到 L2。
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";

// F1 · Shared persona / workStyle / safety defaults. Re-exported so new specs
// import from the barrel. See __tests__/defaults.spec.ts for the consistency
// assertion that locks all 17 specs to these values.
export {
  TOPIC_INSIGHTS_PERSONA_DEFAULTS,
  TOPIC_INSIGHTS_WORK_STYLE,
  TOPIC_INSIGHTS_SAFETY_LEVEL,
  buildPersona,
} from "./defaults";

// Core 6
import { LEADER_PLANNER_SPEC } from "./leader-planner";
import { SECTION_WRITER_SPEC } from "./section-writer";
import { SECTION_REVIEWER_SPEC } from "./section-reviewer";
import { META_EXTRACTOR_SPEC } from "./meta-extractor";
import { QUALITY_REVIEWER_SPEC } from "./quality-reviewer";
import { SYNTHESIZER_SPEC } from "./synthesizer";

// Enhancement 5
import { DIMENSION_PLANNER_SPEC } from "./dimension-planner";
import { FACT_CHECKER_SPEC } from "./fact-checker";
import { GAP_SEARCHER_SPEC } from "./gap-searcher";
import { HYPOTHESIS_VERIFIER_SPEC } from "./hypothesis-verifier";
import { FACT_EXTRACTOR_SPEC } from "./fact-extractor";

// Advanced 6
import { SECTION_REMEDIATOR_SPEC } from "./section-remediator";
import { REPORT_EVALUATOR_SPEC } from "./report-evaluator";
import { REPORT_EDITOR_SPEC } from "./report-editor";
import { LATEX_REPAIR_SPEC } from "./latex-repair";
import { MISSION_ADJUSTER_SPEC } from "./mission-adjuster";
import { LEADER_DISPATCHER_SPEC } from "./leader-dispatcher";

// F2 · Interactions
import { LEADER_INTENT_SPEC } from "./leader-intent";

// F6.3 · Agentic search
import { LEADER_AGENTIC_SEARCHER_SPEC } from "./leader-agentic-searcher";

// Re-export specs + input types
export {
  LEADER_PLANNER_SPEC,
  SECTION_WRITER_SPEC,
  SECTION_REVIEWER_SPEC,
  META_EXTRACTOR_SPEC,
  QUALITY_REVIEWER_SPEC,
  SYNTHESIZER_SPEC,
  DIMENSION_PLANNER_SPEC,
  FACT_CHECKER_SPEC,
  GAP_SEARCHER_SPEC,
  HYPOTHESIS_VERIFIER_SPEC,
  FACT_EXTRACTOR_SPEC,
  SECTION_REMEDIATOR_SPEC,
  REPORT_EVALUATOR_SPEC,
  REPORT_EDITOR_SPEC,
  LATEX_REPAIR_SPEC,
  MISSION_ADJUSTER_SPEC,
  LEADER_DISPATCHER_SPEC,
  LEADER_INTENT_SPEC,
  LEADER_AGENTIC_SEARCHER_SPEC,
};

export type { LeaderPlannerInput } from "./leader-planner";
export type { SectionWriterInput } from "./section-writer";
export type { SectionReviewerInput } from "./section-reviewer";
export type { MetaExtractorInput } from "./meta-extractor";
export type { QualityReviewerInput } from "./quality-reviewer";
export type { SynthesizerInput } from "./synthesizer";
export type { DimensionPlannerInput } from "./dimension-planner";
export type { FactCheckerInput } from "./fact-checker";
export type { GapSearcherInput } from "./gap-searcher";
export type { HypothesisVerifierInput } from "./hypothesis-verifier";
export type { FactExtractorInput } from "./fact-extractor";
export type { SectionRemediatorInput } from "./section-remediator";
export type { ReportEvaluatorInput } from "./report-evaluator";
export type { ReportEditorInput } from "./report-editor";
export type { LatexRepairInput } from "./latex-repair";
export type { MissionAdjusterInput } from "./mission-adjuster";
export type { LeaderDispatcherInput } from "./leader-dispatcher";
export type { LeaderIntentInput } from "./leader-intent";
export type { LeaderIntentDecision } from "./schemas";
export type { LeaderAgenticSearcherInput } from "./leader-agentic-searcher";
export type { LeaderAgenticSearchResult } from "./schemas";

/**
 * 全部 17 个 topic-insights agent spec。
 * Order doesn't matter (registry 用 id 查找)，但保持"Core → Enhancement → Advanced"便于阅读。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TOPIC_INSIGHTS_AGENT_SPECS: ReadonlyArray<IAgentSpec<any, any>> = [
  // Core 6
  LEADER_PLANNER_SPEC,
  SECTION_WRITER_SPEC,
  SECTION_REVIEWER_SPEC,
  META_EXTRACTOR_SPEC,
  QUALITY_REVIEWER_SPEC,
  SYNTHESIZER_SPEC,
  // Enhancement 5
  DIMENSION_PLANNER_SPEC,
  FACT_CHECKER_SPEC,
  GAP_SEARCHER_SPEC,
  HYPOTHESIS_VERIFIER_SPEC,
  FACT_EXTRACTOR_SPEC,
  // Advanced 6
  SECTION_REMEDIATOR_SPEC,
  REPORT_EVALUATOR_SPEC,
  REPORT_EDITOR_SPEC,
  LATEX_REPAIR_SPEC,
  MISSION_ADJUSTER_SPEC,
  LEADER_DISPATCHER_SPEC,
  // F2 · Interactions
  LEADER_INTENT_SPEC,
  // F6.3 · Agentic search
  LEADER_AGENTIC_SEARCHER_SPEC,
];
