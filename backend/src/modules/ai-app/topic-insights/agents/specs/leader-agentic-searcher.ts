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
      "你是维度级研究的 agentic 探索者。",
      "每轮基于已有证据 + gap summary，决定：",
      "- suggestedQueries: 1-5 条新查询（具体、有可执行性，避免与已有重复）",
      "- shortlistSummaries: 0-5 条对当前证据的短评（title/url/rationale）",
      "- nextIteration: stop（信息已饱和）/ refine（要聚焦已有方向深挖）/ expand（要拓展新主题）",
      "- reasoning: 为什么这么选",
      "输出严格 JSON，符合 LeaderAgenticSearchResultSchema。",
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
