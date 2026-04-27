/**
 * AI Engine - Agents Module
 * Agent 框架导出
 *
 * PR-X5 cleanup: abstractions / base / registry / config / collaboration shims removed.
 * All those symbols now live in ai-harness/facade.
 *
 * 包含：
 * - 统一的 Agent 类型（AgentInput, AgentEvent）— from core/types/agent.types
 * - API Layer — agents REST API
 */

// ==================== 核心类型（统一） ====================
// 从 core/types/agent.types 导出，作为唯一的类型来源
export {
  // ID 类型
  AgentId,
  BuiltinAgentId,
  ToolId,
  SkillId,
  // 常量
  BUILTIN_AGENTS,
  BUILTIN_TOOLS,
  AGENT_CONFIGS,
  // Agent 输入/输出（统一接口）
  AgentInput,
  UploadedFile,
  AgentPlan,
  PlanStep,
  AgentTemplate,
  AgentConfig,
  AgentResult,
  Artifact,
  // Agent 事件（Plan-Based 模式）
  AgentEvent,
  PlanReadyEvent,
  StepStartEvent,
  StepProgressEvent,
  StepCompleteEvent,
  ToolCallEvent,
  ToolResultEvent,
  ArtifactEvent,
  CompleteEvent,
  ErrorEvent,
  // 状态和类型
  AgentTaskStatus,
  ArtifactType,
  AIModelType,
} from "../core/types/agent.types";

// ==================== API Layer ====================
export * from "./api";
