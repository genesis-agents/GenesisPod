/**
 * AG-08-GS · GapSearcher spec
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { GapSearcherResultSchema, type GapSearcherResult } from "./schemas";

export interface GapSearcherInput {
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly dimensionSummary: string;
  readonly existingKeyFindings: ReadonlyArray<string>;
  readonly existingEvidenceCount: number;
}

export const GAP_SEARCHER_SPEC: IAgentSpec<
  GapSearcherInput,
  GapSearcherResult
> = {
  identity: {
    role: {
      id: "AG-08-GS",
      name: "Gap Searcher",
      description: "识别研究空白，产出补充搜索 queries。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "研究策略分析师" },
    goal: { summary: "产出 GapSearcherResult（gaps + suggestedQueries）" },
    constraints: {
      maxIterations: 2,
      maxTokens: 8_000,
      maxWallTimeMs: 30_000,
      safetyLevel: "standard",
    },
    tools: [],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "medium", outputLength: "short" },
  outputSchema: GapSearcherResultSchema,

  buildSystemPrompt: () =>
    [
      "你是研究空白识别员。基于已有 summary + key findings + evidence count，指出：",
      "1. 哪些关键问题尚未被回答（gapStatement）",
      "2. 每个 gap 建议的补充搜索 queries（≥1）",
      "3. priority 0-10（10=最关键）",
      "",
      "只输出当前证据不足以支撑但对结论必要的 gap。严格 JSON 输出。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    return [
      `dimension: ${input.dimensionName} (id=${input.dimensionId})`,
      `evidenceCount: ${input.existingEvidenceCount}`,
      "",
      "已有 key findings:",
      ...input.existingKeyFindings.map((kf, i) => `  ${i + 1}. ${kf}`),
      "",
      "summary:",
      input.dimensionSummary.slice(0, 2000),
      "",
      "请输出 GapSearcherResult JSON。",
    ].join("\n");
  },

  stubFn: async (ctx) => {
    const { input } = ctx;
    return {
      dimensionId: input.dimensionId,
      gaps:
        input.existingEvidenceCount < 5
          ? [
              {
                id: `${input.dimensionId}-gap-1`,
                dimensionId: input.dimensionId,
                gapStatement: `${input.dimensionName} 证据不足（仅 ${input.existingEvidenceCount} 条），关键数据缺失。`,
                suggestedQueries: [
                  `${input.dimensionName} 2026 最新数据`,
                  `${input.dimensionName} 行业报告`,
                ],
                priority: 8,
              },
            ]
          : [],
    };
  },
};
