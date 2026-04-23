/**
 * AG-03-SW · SectionWriter spec
 * Writes a single section given plan + evidence; strong word-count + citation rules.
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import {
  SectionResultSchema,
  type SectionResult,
} from "../harness/agents/schemas";

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

  buildSystemPrompt: () =>
    [
      "你是章节研究写作员。给定 sectionPlan 和 evidenceSummary，请完成该 section 深度写作。",
      "要求：",
      "1. wordCount 须达到 targetWords × 0.85 - 1.15",
      "2. keyFindings ≥ sectionPlan.keyPoints.length 个；每个至少关联 2 个 evidenceRefs",
      "3. citationCount ≥ keyFindings.length × 1.5",
      "4. 正文必须引用提供的证据（[1][2] 格式）",
      "5. evidenceIdsUsed 列出所有用到的 evidence id",
      "",
      "严格 JSON 输出，不要 markdown fence。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    const plan = input.sectionPlan;
    return [
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
