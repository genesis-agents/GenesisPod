/**
 * AG-13-RE · ReportEvaluator (LLM judge)
 *
 * 对最终 report 做 10 维 rubric 评分（与 ST-09-EVAL 启发式版平行）。
 * 本 agent 真走 LLM，用于 PR-0.4 golden judge 场景。
 * Access matrix：无工具（纯 LLM 评分）。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import { ReportEvalResultSchema, type ReportEvalResult } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

export interface ReportEvaluatorInput {
  readonly reportMarkdown: string;
  readonly expectedDimensions: number;
  readonly expectedEvidenceCount: number;
}

@Injectable()
export class ReportEvaluatorAgent extends BaseAgentRunner<
  ReportEvaluatorInput,
  ReportEvalResult
> {
  readonly id = "AG-13-RE";
  readonly name = "Report Evaluator";
  readonly tools: ReadonlyArray<AccessToolId> = [];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = ReportEvalResultSchema;
  protected readonly taskProfile: TaskProfile = {
    creativity: "deterministic",
    outputLength: "short",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(
    _ctx: AgentRunContext<ReportEvaluatorInput>,
  ): string {
    return [
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
    ].join("\n");
  }

  protected buildUserPrompt(
    ctx: AgentRunContext<ReportEvaluatorInput>,
  ): string {
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
  }

  protected stubOutput(
    _ctx: AgentRunContext<ReportEvaluatorInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const result: ReportEvalResult = {
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
    };
    return Promise.resolve({ output: result, tokensUsed: 0, costUsd: 0 });
  }
}
