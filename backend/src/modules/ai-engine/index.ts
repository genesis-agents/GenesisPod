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
 * - agents/teams → ai-harness/kernel + ai-harness/runtime/teams
 * - mcp → ai-harness/protocol/mcp
 * - runtime → ai-harness/runtime
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
export {
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
  ExecutionMode,
  // Interfaces
  IExecutable,
  IRegistry,
  IRegisterable,
  BaseRegistry,
  RegistryStats,
  // Errors
  EngineError,
  ToolError,
  SkillError,
  AgentError,
  TimeoutError,
  CancelledError,
  NotFoundError,
  ValidationError,
  // Error Codes
  CommonErrorCode,
  ToolErrorCode,
  SkillErrorCode,
  AgentErrorCode,
} from "./core";

// Agent 类型系统
export {
  // ID Types
  AgentId,
  ToolId,
  SkillId,
  // Built-in Constants
  BUILTIN_AGENTS,
  BUILTIN_TOOLS,
  BuiltinAgentId,
  BuiltinToolId,
  // Agent Types
  AgentTaskStatus,
  ArtifactType,
  AIModelType,
  UploadedFile,
  AgentInput,
  PlanStep,
  AgentPlan,
  AgentTemplate,
  Artifact,
  AgentResult,
  AgentEvent,
  AgentConfig,
  AGENT_CONFIGS,
} from "./core/types/agent.types";

// 子模块命名空间导出
export * as Core from "./core";
export * as Tools from "./tools";
export * as Skills from "./skills";
export * as Orchestration from "./planning";
export * as Constraint from "./safety/constraint";
export * as Guardrails from "./safety/guardrails";
export * as LLM from "./llm";
export * as Memory from "./knowledge/memory";
// MCP moved to ai-harness/protocol/mcp (PR-X7)
// export * as MCP from "./mcp"; — removed
// Teams barrel 已迁移到 ai-harness/runtime/teams（PR-X4）
// 消费方请使用 "@/modules/ai-harness/facade" 或 "@/modules/ai-harness/runtime/teams"
export * as Image from "./content/image";

// 常用服务导出（便于直接导入）
export { ToolRegistry } from "./tools/registry";
export { FunctionCallingExecutor } from "./planning/executors/function-calling-executor";
export { ShortTermMemoryService } from "./knowledge/memory/stores/short-term-memory.service";
export { LongTermMemoryService } from "./knowledge/memory/stores/long-term-memory.service";
// HierarchicalMemoryCascadeService / ProcessMemoryManagerService / ConstraintEngine
// 居住在 ai-harness — 消费方应从 "@/modules/ai-harness/facade" 导入。
// engine 主 barrel 不再做反向 re-export。
export { GuardrailsPipelineService } from "./safety/guardrails/guardrails-pipeline.service";

// Teams 模块核心服务（PR-X4: 已迁移到 ai-harness/runtime/teams，不再从 ai-engine barrel 导出）
// 消费方请使用 "@/modules/ai-harness/facade" 或直接 "@/modules/ai-harness/runtime/teams"

// NestJS 模块导出
export { AiEngineModule } from "./ai-engine.module";
export { AiEngineLightModule } from "./ai-engine-light.module";
export { AiEngineLLMModule } from "./ai-engine-llm.module";
export { AiEngineToolsModule } from "./ai-engine-tools.module";
export { AiEngineSkillsModule } from "./ai-engine-skills.module";
export { AiEnginePlanningModule } from "./ai-engine-planning.module";
export { AiEngineMemoryModule } from "./ai-engine-memory.module";
export { AiEngineConstraintModule } from "./ai-engine-constraint.module";

// TeamsModule（PR-X4: 已迁移，从 ai-harness/runtime/teams 导入）

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
export {
  IImageAdapter,
  ImageGenerationOptions,
  ImageGenerationResult,
  GeneratedImage,
  ImageProvider,
  IMAGE_PROVIDERS,
  IMAGE_MODELS,
} from "./content/image/abstractions";
