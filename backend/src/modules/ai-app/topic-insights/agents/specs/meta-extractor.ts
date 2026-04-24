/**
 * AG-05-ME · DimensionMetaExtractor spec
 * Pure LLM summarization; no tools; evidenceCount passthrough authoritative.
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { DimensionMetaSchema, type DimensionMeta } from "./schemas";
// ★ baseline DIMENSION_RESEARCH_SYSTEM_PROMPT 的分析深度/洞察力要求
//   用在维度级 meta 提取（保持同源质量）
import { DIMENSION_RESEARCH_SYSTEM_PROMPT } from "@/modules/ai-app/topic-insights/prompts/dimension-research.prompt";

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
      // ★ 复用 Apr 21 baseline DIMENSION_RESEARCH_SYSTEM_PROMPT 的分析深度/洞察力要求
      //   （baseline 原本一次产出整个 dimension 分析，harness 拆为 section-write + meta-extract 两步；
      //   此 spec 是第二步——基于已整合章节提炼 meta，沿用同样的"深度/洞察力/证据支撑"质量准绳）
      DIMENSION_RESEARCH_SYSTEM_PROMPT,
      "",
      "## 【关键覆盖】本次调用只做 meta 提取（不重新生成长文）",
      "基于已整合的章节合集，提炼 dimension 级别的 summary / keyFindings / trends / challenges / opportunities。",
      "",
      "输出 JSON：",
      "```json",
      "{",
      '  "dimensionId": "复制 input.dimensionId 原值",',
      '  "dimensionName": "复制 input.dimensionName 原值",',
      '  "summary": "≥30 字且 ≤300 字的核心概括（遵循上方深度/洞察力要求）",',
      '  "keyFindings": ["≥1 条核心发现"],',
      '  "trends": ["趋势数组，可空"],',
      '  "challenges": ["挑战数组，可空"],',
      '  "opportunities": ["机会数组，可空"],',
      '  "evidenceCount": 12            // integer ≥0，必须原样填 input.evidenceCount',
      "}",
      "```",
      "",
      "⚠️ 不创造新内容，只做总结提炼；evidenceCount 必须是给定值；number 是数字不是字符串；严格 JSON。",
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
