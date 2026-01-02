/**
 * Slides Engine v3.2 - Skills Module
 *
 * 核心技能 (按架构层次):
 *
 * Layer 3 - 模板调度层:
 * - TemplateMatcherSkill - 语义模板匹配
 * - PageTypeSelectionSkill - 页面类型选择 (deprecated)
 *
 * Layer 4 - 内容生成层:
 * - TaskDecompositionSkill - 任务分解
 * - OutlinePlanningSkill - 大纲规划
 * - FourStepDesignSkill - 四步设计
 * - ContentCompressionSkill - 内容压缩
 * - DataSupplementSkill - 数据补全
 * - TemplateRenderingSkill - 模板渲染
 * - ChartRendererSkill - 图表渲染
 * - ImageFetcherSkill - 图片获取
 *
 * Layer 4.5 - 内容驱动布局 (v4.0 试验性):
 * - ContentAnalyzerSkill - 内容分析
 * - LayoutOptimizerSkill - 布局优化
 *
 * Layer 5 - 一致性保障层:
 * - TerminologyUnifierSkill - 术语统一
 * - TransitionCheckerSkill - 过渡检查
 *
 * Layer 6 - 质量保障层:
 * - QualityAuditSkill - 质量审计
 *
 * 模板库：
 * - Templates - 32 种页面类型的专业 HTML 模板
 */

// Layer 3 - Template Dispatch
export * from "./template-matcher.skill";
export * from "./page-type-selection.skill"; // @deprecated - use TemplateMatcherSkill

// Layer 4 - Content Generation
export * from "./task-decomposition.skill";
export * from "./outline-planning.skill";
export * from "./four-step-design.skill";
export * from "./content-compression.skill";
export * from "./data-supplement.skill";
export * from "./template-rendering.skill";
export * from "./chart-renderer.skill";
export * from "./image-fetcher.skill";

// Layer 4.5 - Content-Driven Layout (v4.0 experimental)
export * from "./content-analyzer.skill";
export * from "./layout-optimizer.skill";

// Layer 5 - Consistency
export * from "./terminology-unifier.skill";
export * from "./transition-checker.skill";

// Layer 6 - Quality Assurance
export * from "./quality-audit.skill";

// Templates
export * from "../templates";
