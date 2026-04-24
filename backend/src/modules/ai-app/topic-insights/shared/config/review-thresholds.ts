/**
 * Review Revision Thresholds & Round Parsing
 *
 * 来源：baseline `38347e2a7:services/core/task-executors/review-dimension.executor.ts`
 *   - parseRevisionRound (L732-L739)
 *   - determineRevisionTargets (L741-L827)
 *
 * 用途：st-04-review.stage 消费 SectionReview 后判定是否需要整维度重研究，
 * 输出 revisionTargets 供上游 pipeline orchestrator 决定是否重跑 ST-02-RESEARCH。
 *
 * 业务不变量（baseline 硬编码阈值，严禁擅自调整）：
 *   - currentRound >= 2 → needsRevision=false（硬上限 2 轮）
 *   - overallScore < 60 → fails
 *   - evidence < 40 → fails
 *   - depth < 35 → fails
 *   - breadth < 35 → fails
 *   - coherence < 30 → fails
 */

/**
 * 从 task.description 中解析当前修订轮次
 * 格式：描述末尾追加 " [revision:N]"
 * baseline L736-L739
 */
export function parseRevisionRound(
  description: string | null | undefined,
): number {
  if (!description) return 1;
  const match = /\[revision:(\d+)\]/.exec(description);
  return match ? parseInt(match[1], 10) : 1;
}

/** baseline L744-L749 硬编码阈值 */
export const REVIEW_FAILURE_THRESHOLDS = {
  overall: 60,
  evidence: 40,
  depth: 35,
  breadth: 35,
  coherence: 30,
} as const;

/** 最大修订轮次（>= 此值不再修订，强制降级通过） */
export const MAX_REVISION_ROUNDS = 2;

export interface DimensionRevisionTarget {
  readonly taskId: string;
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly score: number;
  readonly feedback: string;
}

export interface RevisionDecision {
  readonly needsRevision: boolean;
  readonly targets: ReadonlyArray<DimensionRevisionTarget>;
}

export interface DimensionReviewLite {
  readonly dimensionId: string;
  readonly dimensionName?: string;
  readonly overallScore: number;
  readonly scores: {
    readonly evidence?: number;
    readonly depth?: number;
    readonly breadth?: number;
    readonly coherence?: number;
  };
  readonly suggestions?: ReadonlyArray<string>;
}

export interface TaskLite {
  readonly id: string;
  readonly dimensionId: string | null;
}

/**
 * 决定哪些维度需要重研究。
 * baseline L741-L827 完整语义对齐（硬阈值 + round hard cap + feedback 组装）。
 */
export function determineRevisionTargets(
  dimensionReviews: ReadonlyArray<DimensionReviewLite>,
  completedTasks: ReadonlyArray<TaskLite>,
  currentRound: number,
): RevisionDecision {
  if (currentRound >= MAX_REVISION_ROUNDS) {
    return { needsRevision: false, targets: [] };
  }

  const T = REVIEW_FAILURE_THRESHOLDS;
  const targets: DimensionRevisionTarget[] = [];

  for (const review of dimensionReviews) {
    const failsOverall = review.overallScore < T.overall;
    const failsEvidence = (review.scores.evidence ?? 100) < T.evidence;
    const failsDepth = (review.scores.depth ?? 100) < T.depth;
    const failsBreadth = (review.scores.breadth ?? 100) < T.breadth;
    const failsCoherence = (review.scores.coherence ?? 100) < T.coherence;

    const needs =
      failsOverall ||
      failsEvidence ||
      failsDepth ||
      failsBreadth ||
      failsCoherence;
    if (!needs) continue;

    const matchingTask = completedTasks.find(
      (t) => t.dimensionId === review.dimensionId,
    );
    if (!matchingTask) continue;

    const reasons: string[] = [];
    if (failsOverall)
      reasons.push(`总分 ${review.overallScore} < ${T.overall}`);
    if (failsEvidence)
      reasons.push(`证据分 ${review.scores.evidence} < ${T.evidence}`);
    if (failsDepth) reasons.push(`深度分 ${review.scores.depth} < ${T.depth}`);
    if (failsBreadth)
      reasons.push(`广度分 ${review.scores.breadth} < ${T.breadth}`);
    if (failsCoherence)
      reasons.push(`连贯分 ${review.scores.coherence} < ${T.coherence}`);

    const topSuggestions = (review.suggestions ?? []).slice(0, 3).join("；");
    const feedback = `质量不达标（${reasons.join("，")}）。改进建议：${topSuggestions || "请补充证据和深度分析"}`;

    targets.push({
      taskId: matchingTask.id,
      dimensionId: review.dimensionId,
      dimensionName: review.dimensionName || review.dimensionId,
      score: review.overallScore,
      feedback,
    });
  }

  return { needsRevision: targets.length > 0, targets };
}
