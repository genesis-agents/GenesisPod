/**
 * AG-03-SW · SectionWriter spec
 * Writes a single section given plan + evidence; strong word-count + citation rules.
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { SectionResultSchema, type SectionResult } from "./schemas";
// ★ 直接复用 Apr 21 baseline 的 SOTA prompt 常量
//   (baseline path: services/dimension/section-writer.service.ts 使用同样的 import)
import {
  SECTION_WRITING_SYSTEM_PROMPT,
  getLanguageInstruction,
  renderPromptTemplate,
} from "@/modules/ai-app/topic-insights/prompts/dimension-research.prompt";
import { getExternalContentNotice } from "@/modules/ai-app/topic-insights/shared/utils/external-content-wrapper.utils";
import {
  getWritingStandards,
  getDimensionResearchStandards,
} from "@/modules/ai-app/shared/report-template";

export interface SectionWriterInput {
  readonly topicId: string;
  readonly topicName: string;
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly sectionPlan: {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly targetWords: number;
    readonly keyPoints: ReadonlyArray<string>;
  };
  readonly evidenceSummary: string;
  readonly language: string;
  /**
   * 模型能力层级自适应（Apr 21 baseline 的 TIER_ADAPTATIONS 迁移）。
   * 由 ST-03-WRITE 根据 capabilities.env 里的默认 CHAT 模型 tier 决定后注入。
   * 为空（未注入 / STANDARD tier）时等价于基线行为，不改提示词。
   */
  readonly tierHint?: {
    readonly promptSuffix: string;
  };
}

export const SECTION_WRITER_SPEC: IAgentSpec<
  SectionWriterInput,
  SectionResult
> = {
  identity: {
    role: {
      id: "AG-03-SW",
      name: "Section Writer",
      description: "给定 sectionPlan + evidence，完成单章节的深度写作。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "研究写作员" },
    goal: {
      summary: "产出 SectionResult，wordCount 接近 targetWords，citations 充足",
    },
    constraints: {
      maxIterations: 6,
      maxTokens: 60_000,
      maxWallTimeMs: 180_000,
      safetyLevel: "standard",
    },
    tools: [
      "TL-06-SEARCHMULTI",
      "rag-search",
      "knowledge-graph",
      "TL-03-FIGEXT",
      "TL-02-EVSAVE",
      "short-term-memory",
    ],
  },
  taskProfile: { creativity: "medium", outputLength: "long" },
  outputSchema: SectionResultSchema,

  buildSystemPrompt: (ctx) => {
    // ★ 直接复用 Apr 21 baseline 的 SOTA system prompt 原文
    // baseline 调用方式（services/dimension/section-writer.service.ts 原文）：
    //   renderPromptTemplate(SECTION_WRITING_SYSTEM_PROMPT, {
    //     languageInstruction, externalContentNotice,
    //     writingStandards, researchStandards,
    //   })
    const language = ctx.input.language || "zh";
    const baselineSystemPrompt = renderPromptTemplate(
      SECTION_WRITING_SYSTEM_PROMPT,
      {
        languageInstruction: getLanguageInstruction(language),
        externalContentNotice: getExternalContentNotice(language),
        writingStandards: getWritingStandards(language),
        researchStandards: getDimensionResearchStandards(language),
      },
    );
    // ★ 输出格式覆盖：baseline prompt 产出 Markdown + ---CHARTS--- + JSON 混合，
    // 新 spec 的 Zod schema 只接受 pure JSON。在 baseline prompt 末尾追加一段
    // **权威覆盖**指令，强制 LLM 把原本放在 markdown 主体的内容塞到 content
    // 字段里，原本的 ---CHARTS--- JSON 不输出（图表由下游另走 TL-03-FIGEXT）。
    const jsonOverride = [
      "",
      "## 【关键覆盖】输出格式说明（本次调用覆盖 baseline 的 Markdown+CHARTS 输出格式）",
      "",
      "本次调用要求你输出**纯 JSON 对象**（不要 Markdown 主体，不要 ---CHARTS--- 分隔符）。",
      "原本 baseline 里你要写的 Markdown 章节内容，现在整个放进 JSON 的 `content` 字段里；原本的 CHARTS JSON 本次不输出。",
      "",
      "输出 JSON schema（严格遵守字段名/类型/必填）：",
      "```json",
      "{",
      '  "sectionId": "复制 input.sectionPlan.id 原值",',
      '  "dimensionId": "复制 input.dimensionId 原值",',
      '  "title": "章节标题",',
      '  "content": "完整 Markdown 正文字符串（遵循上方所有写作质量规则：段落 100-300 字、内联加粗、引用 [N]、禁止短句独行、禁止字数注释等）",',
      '  "wordCount": 600,              // integer ≥0；建议达到 targetWords × 0.85-1.15',
      '  "keyFindings": [               // ≥sectionPlan.keyPoints.length 条',
      "    {",
      '      "statement": "≥10 字的核心发现陈述",',
      '      "evidenceRefs": ["ev-id-1", "ev-id-2"],  // ≥2 项',
      '      "confidence": 0.85           // number 0-1（不是字符串 "0.85"）',
      "    }",
      "  ],",
      '  "citationCount": 12,           // integer ≥0；正文里 [N] 引用出现次数；必须 ≥ keyFindings.length × 1.5',
      '  "evidenceIdsUsed": ["ev-id-1", "ev-id-2"]',
      "}",
      "```",
      "",
      "⚠️ 关键红线：",
      "- sectionId 和 dimensionId 原样回传 input 中的值，不要自造",
      "- number 字段（wordCount / confidence / citationCount）必须是 JSON 数字，不是字符串",
      "- 不输出 ---CHARTS--- 分隔符；不输出 ```json 外层 fence 包裹整个 JSON",
      "- content 字段字符串必须是原生 Markdown（换行用 \\n 转义），不要再包 ```markdown fence",
    ].join("\n");
    return baselineSystemPrompt + "\n" + jsonOverride;
  },

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    const plan = input.sectionPlan;
    const base = [
      `topic: ${input.topicName}（id=${input.topicId}）`,
      `dimension: ${input.dimensionName}（id=${input.dimensionId}）`,
      `language: ${input.language}`,
      "",
      `sectionPlan:`,
      `  id=${plan.id}`,
      `  title=${plan.title}`,
      `  description=${plan.description}`,
      `  targetWords=${plan.targetWords}`,
      `  keyPoints: ${plan.keyPoints.map((k, i) => `(${i + 1}) ${k}`).join(" / ")}`,
      "",
      `evidenceSummary:`,
      input.evidenceSummary,
      "",
      "请输出 SectionResult JSON。",
    ].join("\n");
    // Tier 自适应提示（强模型鼓励综合推理；弱模型强制结构化写作）
    const suffix = input.tierHint?.promptSuffix ?? "";
    return suffix ? base + suffix : base;
  },

  validateBusinessRules: (output, ctx) => {
    const target = ctx.input.sectionPlan.targetWords;
    if (output.wordCount < Math.floor(target * 0.85)) {
      throw new Error(
        `[AG-03-SW] wordCount=${output.wordCount} below 85% of target=${target}`,
      );
    }
    const minCites = Math.ceil(output.keyFindings.length * 1.5);
    if (output.citationCount < minCites) {
      throw new Error(
        `[AG-03-SW] citationCount=${output.citationCount} below min=${minCites}`,
      );
    }
  },

  stubFn: async (ctx) => {
    const { input } = ctx;
    const plan = input.sectionPlan;
    const wordCount = Math.floor(plan.targetWords);
    const content =
      `### ${plan.title}\n\n` +
      plan.keyPoints
        .map((kp, idx) => `**要点 ${idx + 1}**: ${kp} [${idx + 1}]`)
        .join("\n\n") +
      `\n\n${plan.description} 这是 ${input.dimensionName} 维度下 ${plan.title} 的 stub 正文，` +
      "A".repeat(Math.max(0, wordCount - 200)) +
      ".";

    const keyFindings = plan.keyPoints.map((kp, idx) => ({
      statement: `关于 ${kp} 的核心发现 ${idx + 1}（stub）`,
      evidenceRefs: [`ev-${idx + 1}`, `ev-${idx + 2}`],
      confidence: 0.8,
    }));

    return {
      sectionId: plan.id,
      dimensionId: input.dimensionId,
      title: plan.title,
      content,
      wordCount,
      keyFindings,
      citationCount: plan.keyPoints.length * 2,
      evidenceIdsUsed: plan.keyPoints.flatMap((_, idx) => [
        `ev-${idx + 1}`,
        `ev-${idx + 2}`,
      ]),
    };
  },
};
