/**
 * SOTA Runtime barrel export
 *
 * 方案文档 docs/design/topic-insights-harness-redesign/30-sota-task-centric-architecture.md
 *
 * 归属（方案 §0.3）：本 barrel 只导出 L2 ai-engine/harness 通用能力。
 * 具体 Prisma 实现（PrismaStepStore / ResearchTaskQueue 等）由 AI App 层自行实现接口。
 */

export {
  ReActRunner,
  type TaskExecutionProtocol,
  type LLMCaller,
  type JudgeSpec,
  type ConsensusResolver,
  type ReActHistory,
  type ReActExecutionContext,
  type ReActStores,
} from "./react-runner";

export { BudgetAccountant, type ModelTier } from "./budget-accountant";

export {
  ToolRegistry,
  type Tool,
  type ToolSchema,
  type ToolExecContext,
  type JsonSchemaProp,
  type RateLimitPolicy,
  type RetryPolicy,
} from "./tool-registry";

export { AgentTracer, type Span, type StartSpanOptions } from "./otel-tracer";

// 持久化抽象接口（App 层实现）
export type {
  StepStore,
  CheckpointStore,
  VerificationStore,
  TaskStore,
} from "./stores";

// TaskQueue 接口（App 层实现）
export type {
  TaskQueue,
  QueueStats,
  EnqueueOptions,
} from "./task-queue-interface";

// 通用 types / DSL
export * from "./types";
