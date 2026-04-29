/**
 * ai-engine/llm/output-utils —— LLM 输出后处理工具（沉淀自 topic-insights, 2026-04-29）
 *
 * 纯函数 utility（0 DI，0 LLM）。所有 ai-app 都可用。
 *
 * - sanitize-output: 白名单铁墙清理 LLM 输出（13 个正交修复函数）
 *
 * TI 仍使用 ai-app/topic-insights/utils/sanitize-output.utils.ts。
 */

export {
  sanitizeSectionOutput,
  stripLeadingBulletLists,
  stripAnalyticalInlineBullets,
  stripSectionOpeningShortLines,
  stripCitationStacking,
  replaceMarketingLanguage,
  repairBrokenBoldPairs,
  normalizeTransitionHeadings,
  normalizeBoldStyle,
  convertOrdinalBulletsToParagraphs,
  fixOrdinalBoldPosition,
  convertLongListItemsToParagraphs,
  removeOrphanCitations,
} from "./sanitize-output.utils";
