/**
 * Slides Engine v3.0 - Skills Module
 *
 * 核心技能 (按架构层次):
 *
 * Layer 1 - 意图理解层:
 * - IntentAnalyzerSkill - 意图分析
 *
 * Layer 2 - 叙事规划层:
 * - NarrativePlannerSkill - 叙事规划
 * - RhythmControllerSkill - 节奏控制
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
 *
 * Layer 5 - 一致性保障层:
 * - TerminologyUnifierSkill - 术语统一
 * - TransitionCheckerSkill - 过渡检查
 *
 * 模板库：
 * - Templates - 32+ 种页面类型的专业 HTML 模板
 */

// Layer 1 - Intent Understanding
export * from "./intent-analyzer.skill";

// Layer 2 - Narrative Planning
export * from "./narrative-planner.skill";
export * from "./rhythm-controller.skill";

// Layer 3 - Template Dispatch
export * from "./template-matcher.skill";
export * from "./page-type-selection.skill"; // deprecated, use TemplateMatcherSkill

// Layer 4 - Content Generation
export * from "./task-decomposition.skill";
export * from "./outline-planning.skill";
export * from "./four-step-design.skill";
export * from "./content-compression.skill";
export * from "./template-rendering.skill";
export * from "./chart-renderer.skill";
export * from "./image-fetcher.skill";

// Layer 5 - Consistency
export * from "./terminology-unifier.skill";
export * from "./transition-checker.skill";

// Layer 6 - Quality Assurance
export * from "./quality-audit.skill";

// Layer 7 - Review & Deduction (v3.2 新增)
export * from "./scenario-deduction.skill";

// Templates
export * from "../templates";
