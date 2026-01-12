/**
 * Report Editing Prompts
 *
 * AI 编辑报告的提示词模板
 */

/**
 * 报告编辑系统提示词
 */
export const REPORT_EDITING_SYSTEM_PROMPT =
  "你是一位专业的研究报告编辑。请根据用户的要求编辑报告内容。只输出编辑后的内容，不要添加任何解释或前言。";

/**
 * 编辑操作提示词映射
 */
export const REPORT_EDIT_OPERATION_PROMPTS: Record<string, string> = {
  rewrite: "完全重写以下内容，保持核心信息但使用全新的表达方式",
  polish: "润色以下内容，改善语言表达和流畅度，但不要改变核心含义",
  expand: "扩展以下内容，添加更多细节、例子和解释",
  compress: "压缩以下内容，保留核心信息但使其更简洁",
};

/**
 * 目标风格名称映射
 */
export const TARGET_STYLE_NAMES: Record<string, string> = {
  academic: "学术",
  business: "商业",
  casual: "通俗",
  technical: "技术",
};

/**
 * 获取风格调整提示词
 */
export function getStylePrompt(targetStyle: string): string {
  const styleName = TARGET_STYLE_NAMES[targetStyle] || targetStyle;
  return `将以下内容调整为${styleName}风格`;
}

/**
 * 构建完整的编辑提示词
 */
export function buildEditPrompt(
  operation: "rewrite" | "polish" | "expand" | "compress" | "style",
  content: string,
  options?: {
    targetStyle?: string;
    customInstruction?: string;
  },
): string {
  let operationPrompt: string;

  if (operation === "style" && options?.targetStyle) {
    operationPrompt = getStylePrompt(options.targetStyle);
  } else {
    operationPrompt = REPORT_EDIT_OPERATION_PROMPTS[operation] || "";
  }

  const customPart = options?.customInstruction
    ? `。额外要求：${options.customInstruction}`
    : "";

  return `${operationPrompt}${customPart}：\n\n${content}`;
}
