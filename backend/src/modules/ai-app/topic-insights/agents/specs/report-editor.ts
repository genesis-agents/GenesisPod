/**
 * AG-15-RED · ReportEditor spec
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { EditedReportSchema, type EditedReport } from "./schemas";
// ★ 直接复用 Apr 21 baseline 的 REPORT_EDITING_SYSTEM_PROMPT
import { REPORT_EDITING_SYSTEM_PROMPT } from "@/modules/ai-app/topic-insights/prompts/report-editing.prompt";

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
      // ★ 直接复用 Apr 21 baseline 的 REPORT_EDITING_SYSTEM_PROMPT 原文
      REPORT_EDITING_SYSTEM_PROMPT,
      "",
      "## 【关键覆盖】本次调用输出 JSON：",
      "```json",
      "{",
      '  "fullMarkdown": "≥100 字的编辑后完整 markdown",',
      '  "editsApplied": ["编辑类别 1"],',
      '  "wordCount": 5000          // integer ≥0',
      "}",
      "```",
      "",
      "⚠️ 严禁改变事实、数字、引用编号、结构/章节层级；wordCount 是数字；严格 JSON。",
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
