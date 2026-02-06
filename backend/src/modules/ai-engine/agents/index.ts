/**
 * AI Engine - Agents Module
 * Agent 框架导出
 *
 * 包含：
 * - 统一的 Agent 类型（AgentInput, AgentEvent）
 * - Agent 接口（IAgent, IPlanBasedAgent）
 * - 基础 Agent 类（ReAct/Plan-Based）
 * - Agent 注册表
 * - Agent 实现
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

// ==================== Abstractions ====================
// ReAct Agent 系统类型
export {
  // Agent 上下文
  AgentContext,
  AgentMemory,
  AgentMessage,
  // Agent 接口（ReAct）
  IAgent,
  AgentDefinition,
  // Agent 输出（ReAct）
  AgentOutput,
  AgentArtifact,
  // 调用记录
  ToolCallRecord,
  SkillCallRecord,
  // 能力
  AgentCapability,
  // 执行计划（ReAct）
  ExecutionPlan,
  ReActPlanStep,
  // Agent 事件（ReAct 模式，与 Plan-Based 不同）
  AgentEvent as ReActAgentEvent,
  AgentEventType,
} from "./abstractions";

// ==================== Base ====================
// Plan-Based Agent 系统
export { IPlanBasedAgent, PlanBasedAgent } from "./base/plan-based-agent";

// ReAct Agent 基类
export { BaseAgent, createAgent } from "./base/base-agent";
export { ReactiveAgent } from "./base/reactive-agent";
export { PlanAgent } from "./base/plan-agent";

// ==================== Registry ====================
export * from "./registry";

// ==================== API Layer ====================
export * from "./api";
