/**
 * AI Office Module
 * 统一导出所有子模块的服务、控制器和类型
 */

// Core
export * from "./core";

// Document Management (CRUD)
export * from "./document-management";

// Generation
export * from "./generation";

// Slides (幻灯片生成)
export * from "./slides";

// Docs (文档生成)
export * from "./docs";

// Common (共享服务)
export * from "./common";

// Designer
export * from "./designer";

// Integration
export { AiOfficeIntegrationService } from "./ai-office-integration.service";

// Module
export { AiOfficeModule } from "./ai-office.module";
