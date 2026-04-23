/**
 * Stage 间的数据契约（跨 stage 传递）
 *
 * 这里定义每个 stage 的 Input / Output 类型。prepare() 从上游 StageResults
 * 组装 Input；execute() 返回 Output 并由 StageResults.set 存储。
 */

import type {
  DimensionMeta,
  LeaderPlan,
  QualityReview,
  SectionResult,
  SectionReview,
  SynthesisResult,
} from "../agents/schemas";

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

// ST-03-WRITE
export interface WriteStageOutput {
  readonly sections: ReadonlyArray<SectionResult>;
}

// ST-04-REVIEW
export interface ReviewStageOutput {
  readonly reviews: ReadonlyArray<SectionReview>;
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
