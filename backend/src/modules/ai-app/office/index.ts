/**
 * AI Office Module
 * 统一导出所有子模块的服务、控制器和类型
 */

// Core
export * from "./core";

// Document Management (CRUD)
export * from "./document-management";

// Generation (排除与 slides 冲突的类型)
export {
  GenerationController,
  GenerationService,
  type GenerationConfig,
  // GenerationResult 由 slides 导出，此处跳过
} from "./generation";

// Slides (幻灯片生成) - 优先导出，包含主要类型定义
export * from "./slides";

// Docs (文档生成)
export * from "./docs";

// Common (共享服务) - 选择性导出避免与 slides 重复
export {
  AIOfficeCommonModule,
  // 枚举类型（不与 slides 冲突）
  ContentComplexity,
  ContentCategory,
  DataDensity,
  TemporalDimension,
  // 服务
  ContentAnalysisService,
  TemplateSelectionService,
  ImageMatchingService,
  ReadingExperienceService,
  // 服务相关类型
  type SlidePlanItem,
  type DocsSectionPlanItem,
  type PlanningResult,
  type ImagePrompt,
  type ImageMatchingResult,
  type OptimizedParagraph,
  type OptimizedSection,
} from "./common";

// Designer
export * from "./designer";

// Integration
export { AiOfficeIntegrationService } from "./ai-office-integration.service";

// Module
export { AiOfficeModule } from "./ai-office.module";
