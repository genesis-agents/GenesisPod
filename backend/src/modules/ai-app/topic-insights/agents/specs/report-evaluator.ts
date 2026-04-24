/**
 * AG-13-RE · ReportEvaluator spec (LLM judge, 10-dim rubric)
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { ReportEvalResultSchema, type ReportEvalResult } from "./schemas";
// ★ 复用 Apr 21 baseline 的 LEADER_REVIEW_PROMPT（报告级质量评审同源）
import { LEADER_REVIEW_PROMPT } from "@/modules/ai-app/topic-insights/prompts/research-leader.prompt";

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
      // ★ 复用 Apr 21 baseline 的 LEADER_REVIEW_PROMPT（报告级质量评审同源）
      LEADER_REVIEW_PROMPT,
      "",
      "## 【关键覆盖】本 spec 按 10 维 rubric 客观打分，输出 JSON：",
      "```json",
      "{",
      '  "rubric": {                          // 每维 number 0-10',
      '    "contentCompleteness": 8,           // 内容完整度',
      '    "analysisDepth": 7,                 // 分析深度',
      '    "evidenceUse": 8,                   // 证据使用',
      '    "logicCoherence": 9,                // 逻辑连贯',
      '    "wordCount": 7,                     // 字数达标',
      '    "planAlignment": 8,                 // 计划匹配',
      '    "writingQuality": 8,                // 写作质量',
      '    "figuresUse": 6,                    // 图表使用',
      '    "sectionTransitions": 7,            // 章节衔接',
      '    "independentAnalysis": 8            // 独立分析',
      "  },",
      '  "totalScore": 76,                    // number 0-100，必须 = 10 维之和',
      '  "verdict": "good",                   // enum: excellent (≥85) | good (≥70) | acceptable (≥50) | poor (<50)',
      '  "reasoning": "≥10 字的主要扣分点总结"',
      "}",
      "```",
      "",
      "⚠️ totalScore 必须等于 rubric 10 维之和；verdict 按区间判定；数字是数字不是字符串；严格 JSON。",
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
