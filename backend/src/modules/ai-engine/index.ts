/**
 * AI Engine - Main Entry Point
 * AI 引擎主入口
 *
 * 架构：AI Application → AI Engine → AI Core
 *
 * 模块结构：
 * - core: 核心抽象（类型、错误、接口）
 * - tools: 工具系统（48 个内置工具）
 * - skills: 技能系统（Tool 的高级组合）
 * - planning: 编排引擎（工作流执行），原名 orchestration
 * - constraint: 约束引擎（验证、过滤、限流）
 * - llm: LLM 适配层
 * - memory: 记忆系统
 *
 * 已迁移子系统（PR-X4/X5/X7）：
 * - agents/teams → ai-harness/agents + ai-harness/teams
 * - mcp → ai-engine/tools/adapters/mcp
 * - lifecycle/runner/facade → ai-harness/*
 *
 * 使用方式：
 * ```typescript
 * // 推荐：从具体子模块导入
 * import { EngineError, ToolError } from './ai-engine/core';
 * import { ITool, BaseTool } from './ai-engine/tools';
 * // Agent/Team 类型请从 ai-harness/facade 导入
 *
 * // 或者使用命名空间
 * import * as Core from './ai-engine/core';
 * import * as Tools from './ai-engine/tools';
 * ```
 */

// 重新导出核心类型（选择性导出，避免冲突）
export type {
  // Types
  JsonValue,
  JsonObject,
  ExecutionResult,
  ExecutionMetadata,
  ExecutionError,
  ValidationResult,
  RetryConfig,
  TimeoutConfig,
  PaginationParams,
  PaginatedResult,
  DeepPartial,
  Nullable,
  Optional,
  MaybePromise,
  // Context
  BaseContext,
  // Interfaces
  IExecutable,
  IRegistry,
  IRegisterable,
  RegistryStats,
} from "./facade/index";
export {
  EngineExecutionMode,
  BaseRegistry,
  // Errors
  EngineError,
  ToolError,
  SkillError,
  TimeoutError,
  CancelledError,
  NotFoundError,
  ValidationError,
  // Error Codes
  CommonErrorCode,
  ToolErrorCode,
  SkillErrorCode,
  AgentErrorCode,
} from "./facade/index";

// Agent 类型系统

// 子模块命名空间导出
export * as Core from "./facade/index";
export * as Tools from "./tools";
export * as Skills from "./skills";
// W1-moderation (2026-06-02): safety/constraint split into moderation + validation
export * as Moderation from "./safety/moderation";
export * as Validation from "./safety/validation";
export * as Guardrails from "./safety/guardrails";
export * as LLM from "./llm";
// Memory barrel 已迁移到 ai-harness/memory（2026-04-30）
// 消费方请使用 "@/modules/ai-harness/facade" 或 "@/modules/ai-harness/memory"
// MCP moved to ai-engine/tools/adapters/mcp (PR-X7)
// export * as MCP from "./mcp"; — removed
// Teams barrel 已迁移到 ai-harness/teams（PR-X4）
// 消费方请使用 "@/modules/ai-harness/facade" 或 "@/modules/ai-harness/teams"
export * as Image from "./content/image";

// 常用服务导出（便于直接导入）
export { ToolRegistry } from "./tools/registry";
// ShortTermMemoryService / LongTermMemoryService / MemoryCoordinatorService /
// HierarchicalMemoryCascadeService / WorkingMemoryManagerService / ConstraintEngine
// 都居住在 ai-harness — 消费方应从 "@/modules/ai-harness/facade" 或
// "@/modules/ai-harness/memory" 导入。engine 主 barrel 不再做反向 re-export。
export { GuardrailsPipelineService } from "./safety/guardrails/guardrails-pipeline.service";

// Teams 模块核心服务（PR-X4: 已迁移到 ai-harness/teams，不再从 ai-engine barrel 导出）
// 消费方请使用 "@/modules/ai-harness/facade" 或直接 "@/modules/ai-harness/teams"

// NestJS 模块导出
export { AiEngineModule } from "./ai-engine.module";
// AiEngineLightModule removed (PR-X24): zero external consumers.
export { AiEngineLLMModule } from "./llm/llm.module";
export { AiEngineToolsModule } from "./tools/tools.module";
export { AiEngineSkillsModule } from "./skills/skills.module";
export { AiEnginePlanningModule } from "@/modules/ai-engine/planning/planning.module";
// AiEngineMemoryModule 已移除（2026-04-30）—— 见 RuntimeMemoryModule
// (ai-harness/memory/working/memory.module.ts)
export { AiEngineConstraintModule } from "./safety/constraint.module";

// TeamsModule（PR-X4: 已迁移，从 ai-harness/teams 导入）

// Facade (统一入口) — engine-only symbols
// AIFacade / ModelResolverService 已迁移至 ai-harness/facade（PR-X13/PR-X14）
// 消费方请从 "@/modules/ai-harness/facade" 导入。
// facade/types 已删除（PR-X14）；类型请从 ai-harness/facade 导入。

// Observability 服务 (AiObservability / CostAttribution / TraceCollector /
// SessionLatencyTracker) 居住在 ai-harness — 消费方应从
// "@/modules/ai-harness/facade" 导入。engine 主 barrel 不再做反向 re-export。

// Prompt Registry 导出
export { PromptRegistryService } from "./llm/prompts/prompt-registry.service";

// Image 模块核心服务
export { ImageFactory } from "./content/image/factory";
export { ImageModule } from "./content/image/image.module";
export type {
  IImageAdapter,
  ImageGenerationOptions,
  ImageGenerationResult,
  GeneratedImage,
  ImageProvider,
} from "./content/image/abstractions";
export { IMAGE_PROVIDERS, IMAGE_MODELS } from "./content/image/abstractions";
