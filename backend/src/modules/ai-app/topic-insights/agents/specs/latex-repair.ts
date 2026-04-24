/**
 * AG-14-LX · LatexRepair spec
 *
 * NOTE: Apr 21 baseline 没有独立的 LaTeX 修复 prompt（LaTeX 修复在 baseline
 * 是 latex-repair.service.ts 直接写的 prompt）。harness 新 spec 保留本地
 * prompt（已经是 pure JSON schema 格式，无需 baseline 对齐）。
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { LatexRepairResultSchema, type LatexRepairResult } from "./schemas";

export interface LatexRepairInput {
  readonly markdown: string;
  readonly detectedIssues: ReadonlyArray<string>;
}

export const LATEX_REPAIR_SPEC: IAgentSpec<
  LatexRepairInput,
  LatexRepairResult
> = {
  identity: {
    role: {
      id: "AG-14-LX",
      name: "Latex Repair",
      description: "语义化修复 LaTeX 语法错误。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "技术编辑" },
    goal: {
      summary: "产出 LatexRepairResult（repairedMarkdown + issuesFixed）",
    },
    constraints: {
      maxIterations: 2,
      maxTokens: 40_000,
      maxWallTimeMs: 120_000,
      safetyLevel: "standard",
    },
    tools: [],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "deterministic", outputLength: "extended" },
  outputSchema: LatexRepairResultSchema,

  buildSystemPrompt: () =>
    [
      "你是 LaTeX 修复专家。输入 markdown 可能含错误 LaTeX：未配对 $ / $$、错误 \\( \\[ 配对、\\n 代替 \\\\ 换行、特殊字符未转义（% & _ 等）。",
      "",
      "## 输出 JSON 格式（严格遵守字段名/类型/必填）",
      "```json",
      "{",
      '  "repairedMarkdown": "≥50 字的修复后完整 markdown",',
      '  "issuesFixed": ["修复项描述 1", "修复项描述 2"]',
      "}",
      "```",
      "",
      "⚠️ 只改 LaTeX 语法，不改变公式的数学语义；保留所有原 markdown 结构；严格 JSON，不要 fence 包裹输出。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
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
  },

  stubFn: async (ctx) => ({
    repairedMarkdown: ctx.input.markdown,
    issuesFixed: [],
  }),
};
