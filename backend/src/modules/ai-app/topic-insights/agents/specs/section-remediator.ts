/**
 * AG-12-SREM · SectionRemediator spec
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { RemediatedSectionSchema, type RemediatedSection } from "./schemas";
// ★ 直接复用 Apr 21 baseline 的 SOTA section 修订 prompt（SECTION_WRITING 同源的质量准绳）
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

export interface SectionRemediatorInput {
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly originalContent: string;
  readonly issues: ReadonlyArray<string>;
  readonly revisionInstructions: ReadonlyArray<string>;
  readonly targetWords: number;
}

export const SECTION_REMEDIATOR_SPEC: IAgentSpec<
  SectionRemediatorInput,
  RemediatedSection
> = {
  identity: {
    role: {
      id: "AG-12-SREM",
      name: "Section Remediator",
      description: "对单个 section 基于 issues 做修订。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "资深编辑" },
    goal: { summary: "产出 RemediatedSection（newContent + resolvedIssues）" },
    constraints: {
      maxIterations: 4,
      maxTokens: 40_000,
      maxWallTimeMs: 120_000,
      safetyLevel: "standard",
    },
    tools: ["rag-search"],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "medium", outputLength: "long" },
  outputSchema: RemediatedSectionSchema,

  buildSystemPrompt: () => {
    // ★ 复用 baseline SECTION_WRITING_SYSTEM_PROMPT 的同源质量准绳
    //   （baseline 修订和写作用同样的 system prompt，user prompt 换成修订模板）
    const baseline = renderPromptTemplate(SECTION_WRITING_SYSTEM_PROMPT, {
      languageInstruction: getLanguageInstruction("zh"),
      externalContentNotice: getExternalContentNotice("zh"),
      writingStandards: getWritingStandards("zh"),
      researchStandards: getDimensionResearchStandards("zh"),
    });
    return [
      baseline,
      "",
      "## 【关键覆盖】本次调用是「修订」不是新写",
      "基于 issues + revisionInstructions 修改原 section，保留原引用编号[N]。输出 JSON：",
      "```json",
      "{",
      '  "sectionId": "复制 input.sectionId 原值",',
      '  "newContent": "≥50 字的修订后 Markdown 正文（遵循上方所有写作质量规则）",',
      '  "wordCount": 600,               // integer ≥0',
      '  "resolvedIssues": ["issue-1"]   // 你解决的问题索引/名称',
      "}",
      "```",
      "",
      "⚠️ 保留原 section 的 [N] 引用编号（不得改/删）；不创造新 evidence；wordCount 接近 targetWords ±15%；数字是数字；严格 JSON。",
    ].join("\n");
  },

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    return [
      `sectionId: ${input.sectionId}`,
      `title: ${input.sectionTitle}`,
      `targetWords: ${input.targetWords}`,
      "",
      "issues:",
      ...input.issues.map((i, idx) => `  ${idx + 1}. ${i}`),
      "",
      "revisionInstructions:",
      ...input.revisionInstructions.map((i, idx) => `  ${idx + 1}. ${i}`),
      "",
      "originalContent:",
      input.originalContent.slice(0, 6000),
      "",
      "请输出 RemediatedSection JSON。",
    ].join("\n");
  },

  stubFn: async (ctx) => {
    const { input } = ctx;
    return {
      sectionId: input.sectionId,
      newContent: input.originalContent + "\n\n（stub 修订：已处理 issues）",
      wordCount: input.originalContent.length + 30,
      resolvedIssues: input.issues.map((_, i) => String(i + 1)),
    };
  },
};
