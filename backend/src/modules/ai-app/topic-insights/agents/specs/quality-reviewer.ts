/**
 * AG-06-QR · QualityReviewer spec (discriminated by scope)
 * scope='dimension' → review per-dimension; 'overall' → review all dimensions + mission.
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
// ★ 直接复用 Apr 21 baseline 的 SOTA LEADER_REVIEW_PROMPT
import { LEADER_REVIEW_PROMPT } from "@/modules/ai-app/topic-insights/prompts/research-leader.prompt";
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
        // ★ 直接复用 Apr 21 baseline 的 LEADER_REVIEW_PROMPT 原文（维度级别语义同源）
        LEADER_REVIEW_PROMPT,
        "",
        '## 【关键覆盖】本次调用 scope="dimension"，输出 JSON：',
        "```json",
        "{",
        '  "scope": "dimension",          // 固定字面量',
        '  "dimensionId": "复制 input.dimensionId 原值",',
        '  "overallScore": 7.5,           // number 0-10',
        '  "issues": ["问题清单，可空"],',
        '  "recommendations": ["改进建议，可空"],',
        '  "needsReresearch": false       // boolean',
        "}",
        "```",
        "⚠️ number 不是字符串；严格 JSON。",
      ].join("\n");
    }
    return [
      LEADER_REVIEW_PROMPT,
      "",
      '## 【关键覆盖】本次调用 scope="overall"，输出 JSON：',
      "```json",
      "{",
      '  "scope": "overall",            // 固定字面量',
      '  "missionId": "复制 input.missionId 原值",',
      '  "overallScore": 7.5,           // number 0-10',
      '  "crossDimensionIssues": ["跨维度问题，可空"],',
      '  "recommendations": ["改进建议，可空"],',
      '  "needsReresearch": false,      // boolean',
      '  "dimensionsToReresearch": []   // needsReresearch=true 时必须列',
      "}",
      "```",
      "⚠️ number 不是字符串；严格 JSON。",
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
