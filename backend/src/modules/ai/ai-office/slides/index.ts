/**
 * Slides Module Exports
 * AI Office - 幻灯片生成模块
 */

// Types
export * from "./types";

// Core
export * from "./core";

// Planning
export * from "./planning";

// Generation
export * from "./generation";

// Rendering
export * from "./rendering";

// Quality
export * from "./quality";

// Editing
export * from "./editing";

// Services (Phase 5 完整版服务)
export * from "./services";

// Template Selection (Phase 5 简化版内容分析器)
// 注意: 为避免重复导出，只从 template-selection 导入 ContentAnalyzerService
export { ContentAnalyzerService } from "./template-selection/content-analyzer.service";
