/**
 * Deterministic Review Scoring
 *
 * 来源：baseline `38347e2a7:services/core/task-executors/review-dimension.executor.ts:L442-L580`
 * 原"确定性质量审核模式（无 LLM 调用）"。
 *
 * 用途：st-04-review 在 AI runner 失败时的 fallback — 基于启发式规则打分，
 * 避免整条 pipeline 因 Reviewer LLM 失效而崩溃。
 *
 * 业务不变量（baseline 硬编码权重与阈值）：
 *   - 权重：breadth 0.25 + depth 0.25 + evidence 0.25 + coherence 0.15 + currency 0.1
 *   - currency 默认 75
 *   - overallScore ≥ 90 EXCELLENT / ≥75 GOOD / ≥60 ACCEPTABLE / ≥40 NEEDS_REVISION / else REJECTED
 */

export interface DeterministicReviewInput {
  readonly contentLength: number;
  readonly keyFindingsCount: number;
  readonly trendsCount?: number;
  readonly challengesCount?: number;
  readonly opportunitiesCount?: number;
  readonly evidenceCount: number;
  /** 是否有 summary 字段（非空） */
  readonly hasSummary?: boolean;
  /** 是否有 confidenceLevel 字段（非空） */
  readonly hasConfidenceLevel?: boolean;
}

export interface DeterministicReviewScores {
  readonly breadth: number;
  readonly depth: number;
  readonly evidence: number;
  readonly coherence: number;
  readonly currency: number;
}

export type DeterministicQualityLevel =
  | "excellent"
  | "good"
  | "acceptable"
  | "needs_revision"
  | "rejected";

export interface DeterministicReviewResult {
  readonly scores: DeterministicReviewScores;
  readonly overallScore: number;
  readonly qualityLevel: DeterministicQualityLevel;
  readonly issues: ReadonlyArray<{
    readonly type: "shallow_analysis" | "missing_coverage" | "weak_evidence";
    readonly severity: "minor" | "major";
    readonly description: string;
  }>;
}

/** baseline L513-L519 权重 */
const WEIGHTS = {
  breadth: 0.25,
  depth: 0.25,
  evidence: 0.25,
  coherence: 0.15,
  currency: 0.1,
} as const;

const DEFAULT_CURRENCY_SCORE = 75;

/**
 * 计算确定性审核分数（baseline L477-L519 完整对齐）。
 */
export function scoreDeterministically(
  input: DeterministicReviewInput,
): DeterministicReviewResult {
  const {
    contentLength,
    keyFindingsCount,
    trendsCount = 0,
    challengesCount = 0,
    opportunitiesCount = 0,
    evidenceCount,
    hasSummary = false,
    hasConfidenceLevel = false,
  } = input;

  const breadth = Math.min(
    100,
    (keyFindingsCount >= 5 ? 40 : keyFindingsCount * 8) +
      (trendsCount >= 3 ? 20 : trendsCount * 7) +
      (challengesCount >= 2 ? 20 : challengesCount * 10) +
      (opportunitiesCount >= 2 ? 20 : opportunitiesCount * 10),
  );

  const depth = Math.min(
    100,
    (contentLength >= 3000 ? 50 : Math.round(contentLength / 60)) +
      (keyFindingsCount >= 3 ? 30 : keyFindingsCount * 10) +
      (evidenceCount >= 5 ? 20 : evidenceCount * 4),
  );

  const evidence = Math.min(
    100,
    evidenceCount >= 10
      ? 90
      : evidenceCount >= 5
        ? 70
        : evidenceCount >= 3
          ? 50
          : evidenceCount * 15,
  );

  const coherence = Math.min(
    100,
    (hasSummary ? 30 : 0) +
      (keyFindingsCount > 0 ? 30 : 0) +
      (contentLength >= 500 ? 20 : 0) +
      (hasConfidenceLevel ? 20 : 0),
  );

  const currency = DEFAULT_CURRENCY_SCORE;

  const overallScore = Math.round(
    breadth * WEIGHTS.breadth +
      depth * WEIGHTS.depth +
      evidence * WEIGHTS.evidence +
      coherence * WEIGHTS.coherence +
      currency * WEIGHTS.currency,
  );

  const qualityLevel: DeterministicQualityLevel =
    overallScore >= 90
      ? "excellent"
      : overallScore >= 75
        ? "good"
        : overallScore >= 60
          ? "acceptable"
          : overallScore >= 40
            ? "needs_revision"
            : "rejected";

  const issues: Array<{
    type: "shallow_analysis" | "missing_coverage" | "weak_evidence";
    severity: "minor" | "major";
    description: string;
  }> = [];
  if (contentLength < 500) {
    issues.push({
      type: "shallow_analysis",
      severity: "major",
      description: `内容较短（${contentLength} 字符），建议充实分析内容`,
    });
  }
  if (keyFindingsCount < 3) {
    issues.push({
      type: "missing_coverage",
      severity: "major",
      description: `关键发现较少（${keyFindingsCount} 条），建议覆盖更多方面`,
    });
  }
  if (evidenceCount < 3) {
    issues.push({
      type: "weak_evidence",
      severity: "major",
      description: `证据支撑不足（${evidenceCount} 条），建议增加数据来源`,
    });
  }

  return {
    scores: { breadth, depth, evidence, coherence, currency },
    overallScore,
    qualityLevel,
    issues,
  };
}
