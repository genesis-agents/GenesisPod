/**
 * AG-06-QR · QualityReviewer spec (discriminated by scope)
 * scope='dimension' → review per-dimension; 'overall' → review all dimensions + mission.
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import {
  QualityReviewSchema,
  type DimensionMeta,
  type QualityReview,
  type SectionReview,
} from "./schemas";

export type QualityReviewerInput =
  | {
      scope: "dimension";
      dimensionId: string;
      dimensionName: string;
      dimensionMeta: DimensionMeta;
      sectionReviews: ReadonlyArray<SectionReview>;
    }
  | {
      scope: "overall";
      missionId: string;
      dimensionMetas: ReadonlyArray<DimensionMeta>;
    };

export const QUALITY_REVIEWER_SPEC: IAgentSpec<
  QualityReviewerInput,
  QualityReview
> = {
  identity: {
    role: {
      id: "AG-06-QR",
      name: "Quality Reviewer",
      description:
        "维度级 + 整体级质量审核，产出打分 / issues / recommendations。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "同行审稿人" },
    goal: { summary: "产出 QualityReview（scope-discriminated）" },
    constraints: {
      maxIterations: 3,
      maxTokens: 20_000,
      maxWallTimeMs: 60_000,
      safetyLevel: "standard",
    },
    tools: ["rag-search", "TL-04-DIMMEM"],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "low", outputLength: "medium" },
  outputSchema: QualityReviewSchema,

  buildSystemPrompt: (ctx) => {
    const scope = ctx.input.scope;
    if (scope === "dimension") {
      return [
        "你是维度质量审核员（dimension scope）。",
        "基于提供的 DimensionMeta + 子章节 reviews 对本维度打 overallScore（0-10），列出 issues / recommendations，判断 needsReresearch。",
        "严格 JSON 输出，scope 字段必须为 'dimension'。",
      ].join("\n");
    }
    return [
      "你是跨维度综合审核员（overall scope）。",
      "基于所有 DimensionMeta 产出整体 overallScore、crossDimensionIssues、recommendations。",
      "needsReresearch 为 true 时必须列出 dimensionsToReresearch（可以为空数组）。",
      "严格 JSON 输出，scope 字段必须为 'overall'。",
    ].join("\n");
  },

  buildUserPrompt: (ctx) => {
    const input = ctx.input;
    if (input.scope === "dimension") {
      return [
        `scope: dimension`,
        `dimensionId: ${input.dimensionId}`,
        `dimensionName: ${input.dimensionName}`,
        `dimensionMeta.summary: ${input.dimensionMeta.summary}`,
        `dimensionMeta.evidenceCount: ${input.dimensionMeta.evidenceCount}`,
        `sectionReviews.overallScores: ${input.sectionReviews.map((r) => r.overallScore).join(", ")}`,
        "",
        "请输出 QualityReview JSON（scope=dimension）。",
      ].join("\n");
    }
    return [
      `scope: overall`,
      `missionId: ${input.missionId}`,
      "dimensionMetas:",
      ...input.dimensionMetas.map(
        (m, i) =>
          `  (${i + 1}) ${m.dimensionName} | summary=${m.summary.slice(0, 100)}... | evidenceCount=${m.evidenceCount}`,
      ),
      "",
      "请输出 QualityReview JSON（scope=overall）。",
    ].join("\n");
  },

  stubFn: async (ctx) => {
    const { input } = ctx;
    if (input.scope === "dimension") {
      const avgSection =
        input.sectionReviews.length > 0
          ? input.sectionReviews.reduce((a, r) => a + r.overallScore, 0) /
            input.sectionReviews.length
          : 7;
      return {
        scope: "dimension" as const,
        dimensionId: input.dimensionId,
        overallScore: Math.round(avgSection * 10) / 10,
        issues: ["stub: 无重大问题"],
        recommendations: ["补充交叉引用", "加强数据图表"],
        needsReresearch: avgSection < 5,
      };
    }
    const avg =
      input.dimensionMetas.length > 0
        ? input.dimensionMetas.reduce(
            (a, m) => a + (m.evidenceCount > 0 ? 7 : 5),
            0,
          ) / input.dimensionMetas.length
        : 7;
    return {
      scope: "overall" as const,
      missionId: input.missionId,
      overallScore: Math.round(avg * 10) / 10,
      crossDimensionIssues: ["stub: 维度间逻辑一致性良好"],
      recommendations: ["加强跨维度因果推导", "补充长期趋势"],
      needsReresearch: avg < 5,
      dimensionsToReresearch: [],
    };
  },
};
