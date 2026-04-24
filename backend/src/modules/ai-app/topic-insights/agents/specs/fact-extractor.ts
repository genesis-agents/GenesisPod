/**
 * AG-10-FX · FactExtractor spec
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { FactExtractorResultSchema, type FactExtractorResult } from "./schemas";

export interface FactExtractorInput {
  readonly dimensions: ReadonlyArray<{
    id: string;
    name: string;
    summary: string;
    keyFindings: ReadonlyArray<string>;
  }>;
  readonly evidenceIds: ReadonlyArray<string>;
}

export const FACT_EXTRACTOR_SPEC: IAgentSpec<
  FactExtractorInput,
  FactExtractorResult
> = {
  identity: {
    role: {
      id: "AG-10-FX",
      name: "Fact Extractor",
      description:
        "跨维度抽取结构化 facts（trend / data_point / insight / risk）。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "研究归纳员" },
    goal: { summary: "产出 FactExtractorResult（categorized facts）" },
    constraints: {
      maxIterations: 3,
      maxTokens: 20_000,
      maxWallTimeMs: 60_000,
      safetyLevel: "standard",
    },
    tools: ["TL-04-DIMMEM"],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "low", outputLength: "medium" },
  outputSchema: FactExtractorResultSchema,

  buildSystemPrompt: () =>
    [
      "你是跨维度事实抽取员。从各维度 summary + key findings 中抽取结构化 facts。",
      "约束：",
      "1. 每个 fact 分类为 trend / data_point / insight / risk 之一",
      "2. 绑定来源 dimensionId + evidenceIds",
      "3. statement 尽量量化（含数字、时间、主体）",
      "4. 只抽实质性事实，不重复 key findings 原文",
      "",
      "严格 JSON 输出。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    return [
      "dimensions:",
      ...input.dimensions.map(
        (d) =>
          `  - ${d.name} (id=${d.id})\n    summary: ${d.summary.slice(0, 300)}\n    findings: ${d.keyFindings.join(" | ")}`,
      ),
      "",
      `evidence pool size: ${input.evidenceIds.length}`,
      "",
      "请输出 FactExtractorResult JSON。",
    ].join("\n");
  },

  stubFn: async (ctx) => {
    const { input } = ctx;
    return {
      facts: input.dimensions.slice(0, 4).map((d, idx) => ({
        id: `fact-${d.id}-1`,
        dimensionId: d.id,
        statement: `${d.name}：${d.keyFindings[0] ?? "关键发现（stub）"}`,
        evidenceIds: input.evidenceIds.slice(idx * 2, idx * 2 + 2),
        category:
          idx % 4 === 0
            ? ("trend" as const)
            : idx % 4 === 1
              ? ("data_point" as const)
              : idx % 4 === 2
                ? ("insight" as const)
                : ("risk" as const),
      })),
    };
  },
};
