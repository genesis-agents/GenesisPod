/**
 * ai-engine/content/figure —— 图表/图片抽取（沉淀自 <consumer>, 2026-04-29）
 *
 * 公共能力：从 HTML 内容中抽取 <img> / <figure> / <picture> → 验证 URL 可访问 →
 * 输出 ExtractedFigure[]。不含语义相关性判断（那部分在 ai-harness/governance/figure）。
 *
 * 调用方：<consumer> 通过 ai-engine/facade.FigureExtractorService 复用。
 * TI 仍在使用 ai-app/<consumer>/services/report/figure-extractor.service.ts，
 * 待 <consumer> 验证稳定后再考虑切换。
 */

export {
  FigureExtractorService,
  type ExtractedFigure,
} from "./figure-extractor.service";
