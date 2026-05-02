/**
 * AI Office 共享模块
 * 为 Slides 提供统一的类型定义和工具
 */

// ============================================================================
// 模块
// ============================================================================

export { AIOfficeCommonModule } from "./common.module";

// ============================================================================
// 类型定义
// ============================================================================

// 内容分析类型 (PR-X25: shim removed, point to canonical content-analysis/)
export * from "../content-analysis/content-analysis.types";

// 主题系统类型
export * from "./theme.types";

// 模板选择引擎类型
export * from "./template-selection.types";

// ============================================================================
// 服务
// ============================================================================

// 内容分析服务 (PR-X25: shim removed, point to canonical content-analysis/)
export { ContentAnalysisService } from "../content-analysis/content-analysis.service";

// 模板选择服务
export {
  TemplateSelectionService,
  type SlidePlanItem,
  type PlanningResult,
} from "./template-selection.service";

// 图文匹配服务 (PR-X25: shim removed, point to ai-harness/facade)
export {
  ImageMatchingService,
  type ImagePrompt,
  type ImageMatchingResult,
} from "@/modules/ai-harness/facade";

// 阅读体验服务
export {
  ReadingExperienceService,
  type OptimizedParagraph,
  type OptimizedSection,
} from "./reading-experience.service";
