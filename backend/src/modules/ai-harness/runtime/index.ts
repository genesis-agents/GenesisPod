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
} from "./env/react-runner";

export {
  BudgetAccountant,
  type ModelTier,
} from "@/modules/ai-harness/guardrails/budget/budget-accountant";
export { MissionBudgetPool } from "./mission/mission-budget-pool";
export {
  AgentExecutionContext,
  classifyError,
  shouldRetry,
} from "./mission/agent-execution-context";
export { NoopRuntimeEnvironment } from "./env/noop-runtime-environment";

export {
  ToolRegistry,
  type Tool,
  type ToolSchema,
  type ToolExecContext,
  type JsonSchemaProp,
  type RateLimitPolicy,
  type RetryPolicy,
} from "./env/tool-registry";

export {
  AgentTracer,
  type Span,
  type StartSpanOptions,
} from "../tracing/tracer/otel-tracer";
export {
  SpanExporter,
  type SpanRecord,
  type SpanSink,
} from "../tracing/tracer/span-exporter";
export {
  ModelPricingRegistry,
  type ModelPricing,
} from "@/modules/ai-engine/llm/pricing/model-pricing-registry";

// 持久化抽象接口（App 层实现）
export type {
  StepStore,
  CheckpointStore,
  VerificationStore,
  TaskStore,
} from "./env/stores";

// TaskQueue 接口（App 层实现）
export type {
  TaskQueue,
  QueueStats,
  EnqueueOptions,
} from "./env/task-queue-interface";

// Verification (self / external / meta judge + consensus resolver)
// 已迁至 evaluation/verify/primitives/，runtime/index 仍 re-export 保持对外 API 不变
export * from "../evaluation/verify/primitives";

// Orchestration (thin mission orchestrator + replanner/registry 接口)
export {
  MissionOrchestrator,
  type OrchestrateOptions,
  type FinalizerCallback,
  type TaskCompletedHook,
} from "./mission/mission-orchestrator";

export type { ProtocolRegistry } from "./env/protocol-registry-interface";

export type {
  DynamicReplanner,
  ReplanOperation,
  ReplanObservations,
  ReplanDecision,
} from "./env/dynamic-replanner-interface";

// 通用 types / DSL
export * from "./env/types";
