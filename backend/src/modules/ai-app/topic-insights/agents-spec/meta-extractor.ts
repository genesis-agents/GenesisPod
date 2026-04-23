/**
 * AG-05-ME · DimensionMetaExtractor spec
 * Pure LLM summarization; no tools; evidenceCount passthrough authoritative.
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { DimensionMetaSchema, type DimensionMeta } from "./schemas";

export interface MetaExtractorInput {
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly integratedSections: string;
  readonly evidenceCount: number;
}

export const META_EXTRACTOR_SPEC: IAgentSpec<
  MetaExtractorInput,
  DimensionMeta
> = {
  identity: {
    role: {
      id: "AG-05-ME",
      name: "Dimension Meta Extractor",
      description:
        "从 section 合集提取 dimension 级 meta（summary / keyFindings / trends）。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "资深研究分析师" },
    goal: { summary: "产出 DimensionMeta（summary + keyFindings + trends）" },
    constraints: {
      maxIterations: 3,
      maxTokens: 20_000,
      maxWallTimeMs: 60_000,
      safetyLevel: "standard",
    },
    tools: [],
  },
  taskProfile: { creativity: "low", outputLength: "medium" },
  outputSchema: DimensionMetaSchema,

  buildSystemPrompt: () =>
    [
      "你是维度元信息提取员。从整合后的章节合集中提取 dimension 级：summary（30+ 字）/ keyFindings（≥ 1）/ trends / challenges / opportunities。",
      "约束：",
      "1. 不创造新内容，只做总结提炼",
      "2. evidenceCount 必须使用给定值（不自报）",
      "3. summary 不超过 300 字",
      "",
      "严格 JSON 输出。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    return [
      `dimensionId: ${input.dimensionId}`,
      `dimensionName: ${input.dimensionName}`,
      `evidenceCount: ${input.evidenceCount}（必须原样填入 output.evidenceCount）`,
      "",
      "integratedSections（可能较长，需概括）：",
      input.integratedSections.slice(0, 8000),
      "",
      "请输出 DimensionMeta JSON。",
    ].join("\n");
  },

  stubFn: async (ctx) => {
    const { input } = ctx;
    return {
      dimensionId: input.dimensionId,
      dimensionName: input.dimensionName,
      summary: `${input.dimensionName} 维度的研究表明：关键结构与趋势已识别（stub summary）。整合章节规模 ${input.integratedSections.length} 字符。`,
      keyFindings: [
        `${input.dimensionName} 发现 1（stub）`,
        `${input.dimensionName} 发现 2（stub）`,
        `${input.dimensionName} 发现 3（stub）`,
      ],
      trends: [
        `${input.dimensionName} 趋势 A`,
        `${input.dimensionName} 趋势 B`,
      ],
      challenges: [`${input.dimensionName} 挑战 1`],
      opportunities: [`${input.dimensionName} 机会 1`],
      evidenceCount: input.evidenceCount,
    };
  },
};
