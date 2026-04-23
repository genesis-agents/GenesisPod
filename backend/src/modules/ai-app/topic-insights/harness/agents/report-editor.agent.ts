/**
 * AG-15-RED · ReportEditor
 *
 * 做纯文本编辑（格式统一、术语一致、拼写）。不改内容逻辑。
 * Access matrix：无工具。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import { EditedReportSchema, type EditedReport } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

export interface ReportEditorInput {
  readonly fullMarkdown: string;
  readonly editingInstructions?: ReadonlyArray<string>;
}

@Injectable()
export class ReportEditorAgent extends BaseAgentRunner<
  ReportEditorInput,
  EditedReport
> {
  readonly id = "AG-15-RED";
  readonly name = "Report Editor";
  readonly tools: ReadonlyArray<AccessToolId> = [];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = EditedReportSchema;
  protected readonly taskProfile: TaskProfile = {
    creativity: "deterministic",
    outputLength: "extended",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(
    _ctx: AgentRunContext<ReportEditorInput>,
  ): string {
    return [
      "你是报告编辑员。对 markdown 做格式统一 / 术语一致 / 拼写修正。",
      "严禁改变任何事实、数字、引用编号、结构 / 章节层级。",
      "editsApplied 简要列出你做的编辑类别。",
      "严格 JSON 输出。",
    ].join("\n");
  }

  protected buildUserPrompt(ctx: AgentRunContext<ReportEditorInput>): string {
    const { input } = ctx;
    const instr = input.editingInstructions?.length
      ? "\n\n指令:\n" + input.editingInstructions.join("\n")
      : "";
    return `请编辑下列 markdown:${instr}\n\n---\n${input.fullMarkdown.slice(0, 8000)}`;
  }

  protected stubOutput(
    ctx: AgentRunContext<ReportEditorInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    const md = input.fullMarkdown;
    const result: EditedReport = {
      fullMarkdown: md,
      editsApplied: ["stub: no edits applied"],
      wordCount: md.length,
    };
    return Promise.resolve({ output: result, tokensUsed: 0, costUsd: 0 });
  }
}
