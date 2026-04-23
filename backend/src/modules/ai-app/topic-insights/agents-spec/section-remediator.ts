/**
 * AG-12-SREM · SectionRemediator spec
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { RemediatedSectionSchema, type RemediatedSection } from "./schemas";

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

  buildSystemPrompt: () =>
    [
      "你是 section 修订员。基于 issues + revisionInstructions 修改原 section。",
      "约束：",
      "1. 保留原 section 的引用 [N]，不得删除或改编号",
      "2. 不创造新 evidence（只能基于原 content 的引用）",
      "3. resolvedIssues 列出你实际解决的问题编号",
      "4. wordCount 必须接近 targetWords（± 15%）",
      "",
      "严格 JSON 输出。",
    ].join("\n"),

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
