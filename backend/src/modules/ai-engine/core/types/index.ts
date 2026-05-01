/**
 * AI Engine - Core Types
 * 核心类型导出
 */

// 基础类型
export * from "./common.types";

// 2026-05-01 (PR-X-T): context.types.ts 已删
//   - SkillContext 与 skills/abstractions/skill.interface.ts 重定义冲突
//   - BaseContext / ToolContext / AgentContext / OrchestrationContext / ContextFactory
//     等 0 production consumer（ToolContext 真身在 tools/abstractions/tool.interface.ts）
//   - ExecutionMode 已上提到 agent.types.ts
//
// 2026-05-01 (PR-H 遗留收尾): IExecutable / IContextBuilder 仍 export 但
//   constraint 用到 BaseContext —— 这两个 interface 全仓 0 implements，
//   保留 export 以防外部消费（含未来 plugin），用 unknown alias 让 type 通过。
export type BaseContext = unknown;

// Agent 类型 (用于 Agent 实现)
export * from "./agent.types";

// 事件类型 (用于编排系统) - 使用命名导出避免冲突
export {
  // 基础事件
  BaseEvent,

  // 编排系统事件 (使用 Agent 前缀的名称)
  AgentPlanReadyEvent,
  AgentStepStartEvent,
  AgentStepProgressEvent,
  AgentStepCompleteEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
  AgentThinkingEvent,
  AgentArtifactEvent,
  AgentCompleteEvent,
  AgentErrorEvent,

  // 执行计划 (编排系统版本)
  ExecutionPlan,

  // 执行统计
  ExecutionStats,
  StepStats,

  // 工作流事件
  WorkflowEvent,
  WorkflowStartEvent,
  WorkflowStepEvent,
  WorkflowCompleteEvent,
  WorkflowErrorEvent,
  WorkflowCheckpointEvent,

  // 事件发射器
  IEventEmitter,
} from "./event.types";

// 为编排系统重导出带前缀的类型
export type { PlanStep as OrchestrationPlanStep } from "./event.types";
export type { AgentResult as OrchestrationAgentResult } from "./event.types";
export type { Artifact as OrchestrationArtifact } from "./event.types";
export type { ArtifactType as OrchestrationArtifactType } from "./event.types";
export type { AgentEvent as OrchestrationAgentEvent } from "./event.types";
