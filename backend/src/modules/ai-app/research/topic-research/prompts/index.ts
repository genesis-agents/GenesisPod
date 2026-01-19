/**
 * Topic Research Prompts
 *
 * 导出所有 Prompt 模板
 */

export {
  DIMENSION_RESEARCH_SYSTEM_PROMPT,
  DIMENSION_RESEARCH_USER_PROMPT_TEMPLATE,
  formatEvidenceForPrompt,
  renderPromptTemplate,
} from "./dimension-research.prompt";

export {
  REPORT_SYNTHESIS_SYSTEM_PROMPT,
  REPORT_SYNTHESIS_USER_PROMPT_TEMPLATE,
  formatDimensionOverview,
  formatDimensionDetails,
  formatEvidenceList,
  renderReportSynthesisPrompt,
} from "./report-synthesis.prompt";

export {
  REPORT_EDITING_SYSTEM_PROMPT,
  REPORT_EDIT_OPERATION_PROMPTS,
  TARGET_STYLE_NAMES,
  getStylePrompt,
  buildEditPrompt,
  buildEnhancedEditPrompt,
  type EnhancedEditPromptOptions,
} from "./report-editing.prompt";
