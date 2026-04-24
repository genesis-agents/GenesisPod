/**
 * Stage 间的数据契约（跨 stage 传递）
 *
 * 这里定义每个 stage 的 Input / Output 类型。prepare() 从上游 StageResults
 * 组装 Input；execute() 返回 Output 并由 StageResults.set 存储。
 */

import type {
  DimensionMeta,
  DimensionOutline,
  LeaderPlan,
  QualityReview,
  SectionResult,
  SectionReview,
  SynthesisResult,
} from "@/modules/ai-app/topic-insights/agents/specs/schemas";

// ST-00-INIT
export interface InitStageOutput {
  readonly draftReportId: string;
  readonly cachePrefix: string;
  readonly startedAt: string;
}

// ST-01-PLAN
export interface PlanStageOutput {
  readonly plan: LeaderPlan;
}

// ST-02-RESEARCH
export interface DimensionResearchOutcome {
  readonly dimensionId: string;
  readonly dimensionName: string;
  /** 搜集到的 evidence id（实际是 DB 里真实的证据 id，此处占位用 stub 编号） */
  readonly evidenceIds: ReadonlyArray<string>;
  readonly evidenceCount: number;
}

export interface ResearchStageOutput {
  readonly byDimension: ReadonlyArray<DimensionResearchOutcome>;
}

// ST-02B-OUTLINE
export interface OutlineStageOutput {
  /**
   * 按 dimensionId 索引的每维度章节大纲（AG-02-DP 产出）。
   * ST-03-WRITE 消费此数据按 Leader 规划的 sections 写作；
   * 缺失 dim 时 st-03 fallback 硬编码"子章节 1/2"。
   */
  readonly outlinesByDimension: Record<string, DimensionOutline>;
}

// ST-03-WRITE
export interface WriteStageOutput {
  readonly sections: ReadonlyArray<SectionResult>;
}

// ST-04-REVIEW
export interface ReviewStageOutput {
  readonly reviews: ReadonlyArray<SectionReview>;
  /** baseline determineRevisionTargets：需要重研究的维度 */
  readonly revisionTargets: ReadonlyArray<{
    readonly taskId: string;
    readonly dimensionId: string;
    readonly dimensionName: string;
    readonly score: number;
    readonly feedback: string;
  }>;
  /** 当前修订轮次（硬上限 2） */
  readonly revisionRound: number;
  /**
   * ★ baseline section-writer QC + remediation loop：
   * review 阶段对 needsRevision=true 的 section 调 AG-12-SREM 修订，
   * 产出替换 section.content（保留 sectionId/dimensionId/title/keyFindings）。
   * 下游 ST-05-INTEGRATE / ST-07-SYNTH 优先用此数组。
   * 空数组 = 本轮无 remediation（全部 section 已达标 或 AG-12-SREM 失败 fallback 原文）。
   */
  readonly remediatedSections: ReadonlyArray<SectionResult>;
  /** RemediationTrace 审计：remediation 前后状态追踪 */
  readonly remediationTrace: ReadonlyArray<{
    readonly sectionId: string;
    readonly beforeScore: number;
    readonly afterWordCount: number;
    readonly resolvedIssues: ReadonlyArray<string>;
  }>;
}

// ST-05-INTEGRATE
export interface IntegrateStageOutput {
  readonly dimensionMetas: ReadonlyArray<DimensionMeta>;
  readonly qualityReview?: QualityReview;
}

// ST-07-SYNTH
export interface SynthStageOutput {
  readonly synthesis: SynthesisResult;
}

// ST-11-ASM
export interface AssemblyStageOutput {
  readonly fullMarkdown: string;
  readonly executiveSummary: string;
  readonly wordCount: number;
  readonly sectionCount: number;
}

// ST-08-QGATE
export interface QualityGateStageOutput {
  /** overall score 0-100 */
  readonly score: number;
  /** 各维度分项得分 */
  readonly breakdown: {
    readonly citationDensity: number;
    readonly sectionStructure: number;
    readonly wordCount: number;
    readonly evidenceCoverage: number;
  };
  /** fail 时需要 remediate（保留 flag 供未来 remediate loop） */
  readonly needsRemediate: boolean;
  readonly verdict: "pass" | "warn" | "fail";
  readonly issues: ReadonlyArray<string>;
}

// ST-13-PERSIST
export interface PersistStageOutput {
  readonly reportId: string;
  readonly totalTokens: number;
  readonly totalSources: number;
  readonly totalDimensions: number;
  readonly generationTimeMs: number;
}

// ST-14-CLEANUP
export interface CleanupStageOutput {
  readonly analysisIdBackfilled: number;
  readonly cacheReleased: boolean;
}

// ST-06-COGLOOP
export interface CogLoopStageOutput {
  readonly gapsByDimension: Record<string, ReadonlyArray<unknown>>;
  readonly hypotheses: ReadonlyArray<unknown>;
  readonly facts: ReadonlyArray<unknown>;
}

// ST-09-EVAL (10-dim rubric)
export interface EvalStageOutput {
  readonly rubricScores: Record<string, number>;
  readonly totalScore: number;
  readonly verdict: "excellent" | "good" | "acceptable" | "poor";
  readonly notes: ReadonlyArray<string>;
}

// ST-10-FACT
export interface FactCheckStageOutput {
  readonly accuracyScore: number;
  readonly issueCount: number;
  readonly overallAssessment: string;
}

// ST-12-LATEX
export interface LatexStageOutput {
  readonly fullMarkdown: string;
  readonly repaired: boolean;
  readonly issuesFound: number;
}
