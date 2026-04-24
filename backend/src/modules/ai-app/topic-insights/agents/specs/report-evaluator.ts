/**
 * AG-13-RE · ReportEvaluator spec (LLM judge, 10-dim rubric)
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { ReportEvalResultSchema, type ReportEvalResult } from "./schemas";

export interface ReportEvaluatorInput {
  readonly reportMarkdown: string;
  readonly expectedDimensions: number;
  readonly expectedEvidenceCount: number;
}

export const REPORT_EVALUATOR_SPEC: IAgentSpec<
  ReportEvaluatorInput,
  ReportEvalResult
> = {
  identity: {
    role: {
      id: "AG-13-RE",
      name: "Report Evaluator",
      description: "10 维 rubric 对 report 打分（0-100）。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "LLM 评审官" },
    goal: { summary: "产出 ReportEvalResult（rubric + verdict + reasoning）" },
    constraints: {
      maxIterations: 2,
      maxTokens: 15_000,
      maxWallTimeMs: 60_000,
      safetyLevel: "standard",
    },
    tools: [],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "deterministic", outputLength: "short" },
  outputSchema: ReportEvalResultSchema,

  buildSystemPrompt: () =>
    [
      "你是客观的研究报告评分员。按 10 维度 rubric（每维 0-10）对 report 打分：",
      "1. contentCompleteness - 内容完整度",
      "2. analysisDepth - 分析深度",
      "3. evidenceUse - 证据使用",
      "4. logicCoherence - 逻辑连贯",
      "5. wordCount - 字数达标",
      "6. planAlignment - 计划匹配",
      "7. writingQuality - 写作质量",
      "8. figuresUse - 图表使用",
      "9. sectionTransitions - 章节衔接",
      "10. independentAnalysis - 独立分析",
      "",
      "约束：",
      "- totalScore = 10 维分数之和（0-100）",
      "- verdict: excellent ≥85 / good ≥70 / acceptable ≥50 / poor <50",
      "- reasoning ≥ 10 字，总结主要扣分点",
      "- 严格 JSON 输出。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    return [
      `expectedDimensions: ${input.expectedDimensions}`,
      `expectedEvidenceCount: ${input.expectedEvidenceCount}`,
      "",
      "report markdown (first 8k chars):",
      input.reportMarkdown.slice(0, 8000),
      "",
      "请输出 ReportEvalResult JSON。",
    ].join("\n");
  },

  stubFn: async () => ({
    rubric: {
      contentCompleteness: 7,
      analysisDepth: 7,
      evidenceUse: 7,
      logicCoherence: 7,
      wordCount: 7,
      planAlignment: 7,
      writingQuality: 7,
      figuresUse: 6,
      sectionTransitions: 7,
      independentAnalysis: 7,
    },
    totalScore: 69,
    verdict: "acceptable" as const,
    reasoning: "stub evaluation: all axes at 7 (baseline)",
  }),
};
