/**
 * ★ 统一的 figure URL 有效性校验（单一真相源）
 *
 * 在以下位置使用：
 * - FigureExtractorService.validateSingleFigure (提取阶段)
 * - ReportSynthesisService.collectAllCharts (收集阶段)
 * - SectionWriterService.buildChartAllocations (写作阶段)
 *
 * 拒绝的 URL 类型（基于数据库真实数据分析 2026-03-13）：
 * - base64 data URLs: 占异常数据的 93%，来自 FigureExtractor v5 的 downloadAndInlineImage
 * - placeholder strings: LLM 幻觉的 "[base64-image:chart]" 等
 * - fabricated URLs: LLM 伪造的含 "xxxx" 的假 URL
 * - PDF links: 论文 PDF 被误识别为图片
 * - non-HTTP URLs: 相对路径、file:// 等
 */
export function isValidFigureUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  if (url.startsWith("data:")) return false;
  if (url.startsWith("[base64-image") || url.startsWith("base64-image"))
    return false;
  if (url.includes("xxxx")) return false;
  if (/\.pdf(\?|$)/i.test(url)) return false;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
  return true;
}
