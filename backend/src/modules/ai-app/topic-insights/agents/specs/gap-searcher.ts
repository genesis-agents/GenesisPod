/**
 * AG-08-GS · GapSearcher spec
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { GapSearcherResultSchema, type GapSearcherResult } from "./schemas";
// ★ 直接复用 Apr 21 baseline 的 GAP_SEARCH_QUERY_PROMPT
import { GAP_SEARCH_QUERY_PROMPT } from "@/modules/ai-app/topic-insights/prompts/research-depth.prompt";

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
      // ★ 直接复用 Apr 21 baseline 的 GAP_SEARCH_QUERY_PROMPT 原文
      GAP_SEARCH_QUERY_PROMPT,
      "",
      "## 【关键覆盖】本次调用输出 JSON：",
      "```json",
      "{",
      '  "dimensionId": "复制 input.dimensionId 原值",',
      '  "gaps": [                   // 可空数组',
      "    {",
      '      "id": "gap-1",            // 短 id',
      '      "dimensionId": "复制 input.dimensionId 原值",',
      '      "gapStatement": "≥10 字的空白描述",',
      '      "suggestedQueries": ["补充查询 1"],  // ≥1 条',
      '      "priority": 8            // number 0-10（10=最关键）',
      "    }",
      "  ]",
      "}",
      "```",
      "",
      "⚠️ dimensionId 原样回传；priority 是数字；严格 JSON。",
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
