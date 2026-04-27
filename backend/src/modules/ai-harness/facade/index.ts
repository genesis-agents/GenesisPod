/**
 * AI Harness Facade —— ai-app 唯一入口
 *
 * 7 大聚合：kernel / execution / process / memory / protocol / governance / runtime
 *
 * ★ 单向依赖：ai-app → ai-harness → ai-engine。
 * ★ ai-app 任何 harness 符号必须从这里 import，禁止穿透 harness 内部路径。
 */

// ════════════════════════════════════════════════════════════════════
// Kernel：abstractions + core + dx
// ════════════════════════════════════════════════════════════════════
export * from "../kernel/abstractions";
export { AgentFactory } from "../kernel/core/agent-factory";
export { SpecAgentRegistry } from "../kernel/core/spec-agent-registry";
export {
  AgentRunner,
  AgentSpec,
  DefineAgent,
  FixtureStore,
} from "../kernel/dx";
export type { RunResult } from "../kernel/dx";

// Service facade
export { HarnessFacade } from "./harness.facade";

// ════════════════════════════════════════════════════════════════════
// Governance: verify + resource + observability + security
// ════════════════════════════════════════════════════════════════════
export { JudgeService } from "../governance/verify";
export type { BuiltInVerifierId } from "../governance/verify";

// ── Resource ──
export { ResourceManagerService } from "../governance/resource/resource-manager.service";
export { CircuitBreakerService } from "../../ai-engine/safety/resilience/circuit-breaker.service";
export {
  TaskCompletionType,
  type CircuitState,
  type CircuitBreakerConfig,
  type HealthMetrics,
} from "../../ai-engine/safety/resilience/circuit-breaker.service";
export { ConstraintEngine } from "../governance/resource/constraint-engine";
export { ConstraintEnforcementService } from "../governance/resource/constraint-enforcement.service";
export { CostController } from "../governance/resource/cost-controller";
export type {
  CostRecord,
  CostCategory,
  CostBudget,
  CostCheckResult,
  BudgetPeriod,
  ModelPricing,
} from "../governance/resource/cost-controller";
export { RateLimiter, TokenBucket } from "../governance/resource/rate-limiter";
export type {
  RateLimitResult,
  RateLimitConfig,
} from "../governance/resource/rate-limiter";
// 注：harness 内部有一个 generic TokenBudgetService（mission-level token tracker），
// 与 ai-engine/orchestration/services/token-budget.service.ts 同名但语义不同
// （后者带 smartTruncate 用于上下文窗口分配）。为避免 DI / import 歧义，
// 不在 facade 导出 harness 版本；ai-app 需要 token 预算请用 ai-engine/facade 的 TokenBudgetService。
export { HealthCheckRunner } from "../governance/resource/health-check-runner";
export type { HealthCheckRunnerConfig } from "../governance/resource/health-check-runner";
export { RuntimeEnvironmentService } from "../governance/resource/runtime-environment.service";
export type {
  EnvironmentSnapshot,
  EnvironmentSnapshotParams,
  RuntimeModelCapability,
  RuntimeModelType,
  RuntimeToolCapability,
  RuntimeDepHealth,
  RuntimeUserKeyState,
} from "../governance/resource/runtime-environment.types";

// ── Observability ──
export { TraceCollectorService } from "../governance/observability/trace-collector.service";
export { AiObservabilityService } from "../governance/observability/ai-observability.service";
export { CostAttributionService } from "../governance/observability/cost-attribution.service";
export { SessionLatencyTrackerService } from "../governance/observability/session-latency-tracker.service";
export { AiEngineTracingService } from "../governance/observability/ai-engine-tracing.service";
export { EvalPipelineService } from "../governance/observability/eval-pipeline.service";
export type { EvalResult } from "../governance/observability/eval-pipeline.service";
export type { TraceType } from "../governance/observability/trace.interface";
export type {
  SpanType,
  ExecutionStatus,
  SpanData,
  TraceData,
  TraceSummary,
  CreateTraceInput,
  CreateSpanInput,
  EndSpanInput,
  EndTraceInput,
  ListTracesOptions,
} from "../governance/observability/trace.interface";
export type {
  LatencySession,
  LatencyPhase,
  LatencyCheckpoint,
  LLMLatencyRecord,
  LatencySessionSummary,
  TTFTStats,
  LatencyPercentileStats,
  PhaseDurationSummary,
  LatencySessionType,
  LatencySessionStatus,
  StartSessionInput,
  StartPhaseInput,
  RecordLLMLatencyInput,
  ListSessionsFilter,
} from "../governance/observability/session-latency.types";

// ── Security ──
export { CapabilityGuardService } from "../../ai-engine/safety/security/capability-guard.service";
export type { CapabilityCheckResult } from "../../ai-engine/safety/security/capability.types";

// ════════════════════════════════════════════════════════════════════
// Protocol: events + ipc + journal + realtime
// ════════════════════════════════════════════════════════════════════
export {
  DomainEventBus,
  DomainEventRegistry,
  LoggerBroadcastAdapter,
} from "../protocol/events";
export type {
  DomainEvent,
  IBroadcastAdapter,
  DomainEventTypeSpec,
} from "../protocol/events";

// ── IPC ──
export { EventBusService } from "../protocol/ipc/event-bus.service";
export { EventBusService as EngineEventEmitterService } from "../protocol/ipc/event-bus.service";
export { ProgressTrackerService } from "../protocol/ipc/progress-tracker.service";
export { MessageBusService } from "../protocol/ipc/message-bus.service";
export type {
  A2AMessage,
  A2AMessageType,
} from "../protocol/ipc/message-bus.service";
export { MessagePersistenceService } from "../protocol/ipc/message-persistence.service";
export type { PersistedMessage } from "../protocol/ipc/message-persistence.service";
export { AgentLifecycleProtocolService } from "../protocol/ipc/agent-lifecycle-protocol.service";
export type {
  LifecycleMessageType,
  ShutdownRequestPayload,
  PlanApprovalPayload,
  TaskNotificationPayload,
} from "../protocol/ipc/agent-lifecycle-protocol.service";

// ── Journal ──
export { EventJournalService } from "../protocol/journal/event-journal.service";
export {
  CheckpointManager,
  InMemoryCheckpointStore,
} from "../protocol/journal/checkpoint-manager";
export type {
  ICheckpointStore,
  CheckpointManagerConfig,
} from "../protocol/journal/checkpoint-manager";

// ── Realtime ──
export type {
  RoomConfig,
  EngineEvent,
  IEngineEventEmitter,
  RoomType,
} from "../protocol/realtime/abstractions/event-emitter.interface";
export type {
  IProgressTracker,
  TrackedTask,
  CreateTrackedTaskRequest,
  TaskPhase,
} from "../protocol/realtime/abstractions/progress-tracker.interface";
export { calculateOverallProgress } from "../protocol/realtime/abstractions/progress-tracker.interface";

// ════════════════════════════════════════════════════════════════════
// Memory: auto-index + checkpoint + working
// ════════════════════════════════════════════════════════════════════
export { MemoryAutoIndexer } from "../memory/auto-index/memory-auto-indexer";
export { AgentEventStore, CheckpointService } from "../memory/checkpoint";
export type { ICheckpoint, AgentEventRecord } from "../memory/checkpoint";

// ── Working memory ──
export { ProcessMemoryManagerService } from "../memory/working/process-memory-manager.service";
export { HierarchicalMemoryCascadeService } from "../memory/working/hierarchical-memory-cascade.service";
export type {
  MemoryScope,
  MemoryCascadeQuery,
  MemoryCascadeResult,
  MemoryWriteOptions,
} from "../memory/working/hierarchical-memory-cascade.service";
export { SCOPE_PRIORITY } from "../memory/working/hierarchical-memory-cascade.service";

// ════════════════════════════════════════════════════════════════════
// Process: manager + scheduler + supervisor
// ════════════════════════════════════════════════════════════════════
export { ProcessManagerService } from "../process/manager/process-manager.service";
export type {
  ProcessId,
  SpawnOptions,
  ProcessSnapshot,
  ProcessTree,
  ProcessCapabilities,
} from "../process/manager/process.types";
export {
  VALID_TRANSITIONS,
  TERMINAL_STATES,
} from "../process/manager/process.types";
export {
  StateTransitionValidator,
  InvalidTransitionError,
} from "../process/manager/state-transition-validator";
export type { StateTransitionMap } from "../process/manager/state-transition-validator";
export { ProcessSupervisorService } from "../process/supervisor/process-supervisor.service";
// Backwards-compatible alias for legacy imports
export { ProcessSupervisorService as ExecutionStateManager } from "../process/supervisor/process-supervisor.service";
export {
  StateCategory,
  type StateEntry,
  type ExecutionStateStats,
  type ExecutionStateConfig,
} from "../process/supervisor/process-supervisor.service";
export { KernelSchedulerService } from "../process/scheduler/kernel-scheduler.service";

// ════════════════════════════════════════════════════════════════════
// Runtime: mission + budget + billing + kernel-api
// ════════════════════════════════════════════════════════════════════
export { MissionBudgetPool } from "../runtime/mission/mission-budget-pool";
export { BillingRuntimeEnvAdapter } from "../runtime/billing/billing-runtime-env.adapter";
export { MissionExecutorService } from "../runtime/mission/mission-executor.service";
export type {
  IMissionExecutor,
  MissionExecuteOptions,
  MissionExecuteResult,
} from "../runtime/mission/mission-executor.interface";
export { KernelApiService } from "../runtime/kernel-api/kernel-api.service";

// ════════════════════════════════════════════════════════════════════
// Common context (KernelContext lives in common/, surfaced here for ai-app DX)
// ════════════════════════════════════════════════════════════════════
export {
  KernelContext,
  type KernelContextData,
} from "../../../common/context/kernel-context";
