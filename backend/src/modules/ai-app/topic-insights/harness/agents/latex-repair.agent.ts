/**
 * AG-14-LX · LatexRepair (LLM-based)
 *
 * 语义化修复 LaTeX（未配对 delimiter、错字符、\\ 用 \n 等）。
 * 与 validateLatexDelimiters utility 区别：utility 只做结构修复，本 agent
 * 在上下文理解下做语义修复。
 *
 * Access matrix：无工具。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import { LatexRepairResultSchema, type LatexRepairResult } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

export interface LatexRepairInput {
  readonly markdown: string;
  readonly detectedIssues: ReadonlyArray<string>;
}

@Injectable()
export class LatexRepairAgent extends BaseAgentRunner<
  LatexRepairInput,
  LatexRepairResult
> {
  readonly id = "AG-14-LX";
  readonly name = "Latex Repair";
  readonly tools: ReadonlyArray<AccessToolId> = [];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = LatexRepairResultSchema;
  protected readonly taskProfile: TaskProfile = {
    creativity: "deterministic",
    outputLength: "extended",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(_ctx: AgentRunContext<LatexRepairInput>): string {
    return [
      "你是 LaTeX 修复专家。输入 markdown 可能含错误 LaTeX：",
      "- 未配对的 $ / $$",
      "- 错误的 \\( / \\) / \\[ / \\] 配对",
      "- \\n 代替 \\\\ 换行",
      "- 特殊字符未转义（% & _ 等）",
      "",
      "约束：",
      "- 只改 LaTeX 语法；不改变公式的数学语义",
      "- issuesFixed 描述修复内容",
      "- 严格 JSON 输出",
    ].join("\n");
  }

  protected buildUserPrompt(ctx: AgentRunContext<LatexRepairInput>): string {
    const { input } = ctx;
    return [
      "detectedIssues:",
      ...input.detectedIssues.map((i, idx) => `  ${idx + 1}. ${i}`),
      "",
      "markdown:",
      input.markdown.slice(0, 8000),
      "",
      "请输出 LatexRepairResult JSON。",
    ].join("\n");
  }

  protected stubOutput(
    ctx: AgentRunContext<LatexRepairInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    return Promise.resolve({
      output: {
        repairedMarkdown: input.markdown,
        issuesFixed: [],
      },
      tokensUsed: 0,
      costUsd: 0,
    });
  }
}
