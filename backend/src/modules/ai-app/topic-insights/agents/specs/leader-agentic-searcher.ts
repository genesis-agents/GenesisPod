/**
 * AG-19-LAS · LeaderAgenticSearcher spec (F6.3)
 *
 * Drives an iterative "search-read-refine" loop for a single dimension:
 * given the current evidence shortlist + gap analysis, proposes the next
 * batch of queries OR decides to stop. Used by ST-02-RESEARCH's agentic
 * mode (mode: "agentic") — static mode continues to use the fixed per-dim
 * query list from Leader plan.
 *
 * Integration is scoped to the pipeline's mode switch; this spec exists so
 * the capability snapshot / AgentRegistry can discover it. ST-02 wiring is
 * follow-up work beyond F6.
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";

import { buildPersona } from "./defaults";
import {
  LeaderAgenticSearchResultSchema,
  type LeaderAgenticSearchResult,
} from "./schemas";
// ★ 复用 Apr 21 baseline 的 GAP_SEARCH_QUERY_PROMPT（研究策略专家 → 补充搜索查询，同源概念）
import { GAP_SEARCH_QUERY_PROMPT } from "@/modules/ai-app/topic-insights/prompts/research-depth.prompt";

export interface LeaderAgenticSearcherInput {
  readonly missionId: string;
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly topicName: string;
  readonly iteration: number;
  readonly maxIterations: number;
  readonly evidenceShortlist: ReadonlyArray<{
    readonly title: string;
    readonly url: string;
    readonly snippet: string;
    readonly credibility?: number;
  }>;
  readonly gapSummary?: string;
}

export const LEADER_AGENTIC_SEARCHER_SPEC: IAgentSpec<
  LeaderAgenticSearcherInput,
  LeaderAgenticSearchResult
> = {
  identity: {
    role: {
      id: "AG-19-LAS",
      name: "Leader Agentic Searcher",
      description:
        "按迭代驱动维度级搜索：依据现有证据 / 缺口判断产出下一批 queries 或决定收敛。",
      workStyle: "adaptive",
    },
    persona: buildPersona("研究探索者"),
    goal: {
      summary: "每轮产出下一组搜索 queries + shortlist + 迭代决策",
      successCriteria: [
        "suggestedQueries ≥ 1",
        "nextIteration 明确 stop / refine / expand",
      ],
    },
    constraints: {
      maxIterations: 3,
      maxTokens: 8_000,
      maxWallTimeMs: 40_000,
      safetyLevel: "standard",
    },
    tools: ["rag-search", "knowledge-graph", "TL-04-DIMMEM"],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "medium", outputLength: "short" },
  outputSchema: LeaderAgenticSearchResultSchema,

  buildSystemPrompt: () =>
    [
      // ★ 复用 Apr 21 baseline 的 GAP_SEARCH_QUERY_PROMPT（同源：证据→搜索策略）
      GAP_SEARCH_QUERY_PROMPT,
      "",
      "## 【关键覆盖】本 spec 是迭代式探索，输出 JSON：",
      "```json",
      "{",
      '  "missionId": "复制 input.missionId 原值",',
      '  "dimensionId": "复制 input.dimensionId 原值",',
      '  "suggestedQueries": ["查询 1", "查询 2"],  // ≥1 条；≥2 字',
      '  "shortlistSummaries": [                  // 0-5 条对当前证据的短评',
      "    {",
      '      "title": "≥2 字",',
      '      "url": "≥4 字",',
      '      "rationale": "≥10 字"',
      "    }",
      "  ],",
      '  "nextIteration": "refine",              // enum: stop | refine | expand',
      '  "reasoning": "≥10 字的决策理由"',
      "}",
      "```",
      "",
      "决策语义：stop=信息已饱和；refine=聚焦已有方向深挖；expand=拓展新主题。",
      "⚠️ 查询必须具体可执行，避免与已有重复；严格 JSON。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    return [
      `missionId: ${input.missionId}`,
      `dimensionId: ${input.dimensionId}`,
      `dimensionName: ${input.dimensionName}`,
      `topicName: ${input.topicName}`,
      `iteration: ${input.iteration}/${input.maxIterations}`,
      input.gapSummary ? `gapSummary: ${input.gapSummary}` : "",
      "",
      `现有证据（${input.evidenceShortlist.length} 条）:`,
      ...input.evidenceShortlist
        .slice(0, 10)
        .map(
          (e, i) =>
            `  (${i + 1}) ${e.title} [${e.url}] cred=${
              e.credibility ?? "-"
            } | ${e.snippet.slice(0, 120)}`,
        ),
      "",
      "请输出 LeaderAgenticSearchResult JSON。",
    ]
      .filter(Boolean)
      .join("\n");
  },

  stubFn: async (ctx) => {
    const { input } = ctx;
    const nextIteration =
      input.iteration >= input.maxIterations
        ? ("stop" as const)
        : input.evidenceShortlist.length >= 8
          ? ("refine" as const)
          : ("expand" as const);
    return {
      missionId: input.missionId,
      dimensionId: input.dimensionId,
      suggestedQueries: [
        `${input.topicName} ${input.dimensionName} 深入`,
        `${input.topicName} ${input.dimensionName} 最新进展`,
      ],
      shortlistSummaries: input.evidenceShortlist.slice(0, 3).map((e) => ({
        title: e.title,
        url: e.url,
        rationale: `证据片段有效 (stub): ${e.snippet.slice(0, 80)}`,
      })),
      nextIteration,
      reasoning: `stub: iteration=${input.iteration} shortlist=${input.evidenceShortlist.length}`,
    };
  },
};
