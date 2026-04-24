/**
 * AG-15-RED · ReportEditor spec
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { EditedReportSchema, type EditedReport } from "./schemas";

export interface ReportEditorInput {
  readonly fullMarkdown: string;
  readonly editingInstructions?: ReadonlyArray<string>;
}

export const REPORT_EDITOR_SPEC: IAgentSpec<ReportEditorInput, EditedReport> = {
  identity: {
    role: {
      id: "AG-15-RED",
      name: "Report Editor",
      description: "纯文本编辑：格式 / 术语 / 拼写。不改内容逻辑。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "资深编辑" },
    goal: { summary: "产出 EditedReport（fullMarkdown + editsApplied）" },
    constraints: {
      maxIterations: 2,
      maxTokens: 60_000,
      maxWallTimeMs: 180_000,
      safetyLevel: "standard",
    },
    tools: [],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "deterministic", outputLength: "extended" },
  outputSchema: EditedReportSchema,

  buildSystemPrompt: () =>
    [
      "你是报告编辑员。对 markdown 做格式统一 / 术语一致 / 拼写修正。",
      "严禁改变任何事实、数字、引用编号、结构 / 章节层级。",
      "editsApplied 简要列出你做的编辑类别。",
      "严格 JSON 输出。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    const instr = input.editingInstructions?.length
      ? "\n\n指令:\n" + input.editingInstructions.join("\n")
      : "";
    return `请编辑下列 markdown:${instr}\n\n---\n${input.fullMarkdown.slice(0, 8000)}`;
  },

  stubFn: async (ctx) => {
    const md = ctx.input.fullMarkdown;
    return {
      fullMarkdown: md,
      editsApplied: ["stub: no edits applied"],
      wordCount: md.length,
    };
  },
};
