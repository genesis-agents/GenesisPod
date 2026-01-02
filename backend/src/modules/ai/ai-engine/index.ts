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
 * - agents: Agent 框架（ReAct/Plan-Based）
 * - orchestration: 编排引擎（工作流执行）
 * - collaboration: 协作框架（多 Agent 协作）
 * - constraint: 约束引擎（验证、过滤、限流）
 * - llm: LLM 适配层
 * - memory: 记忆系统
 * - mcp: MCP 协议层
 *
 * 使用方式：
 * ```typescript
 * // 推荐：从具体子模块导入
 * import { EngineError, ToolError } from './ai-engine/core';
 * import { ITool, BaseTool } from './ai-engine/tools';
 * import { IAgent, ReactiveAgent } from './ai-engine/agents';
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
} from './core';

// 子模块命名空间导出
export * as Core from './core';
export * as Tools from './tools';
export * as Skills from './skills';
export * as Agents from './agents';
export * as Orchestration from './orchestration';
export * as Collaboration from './collaboration';
export * as Constraint from './constraint';
export * as LLM from './llm';
export * as Memory from './memory';
export * as MCP from './mcp';
