/**
 * AI Kernel Facade
 * 统一入口模块
 *
 * ★ 所有外部模块访问 AI Kernel 必须从此文件导入，禁止直接访问 ai-kernel 内部路径
 */

// Process
export { ProcessManagerService } from "../process/process-manager.service";
export type {
  ProcessId,
  SpawnOptions,
  ProcessSnapshot,
  ProcessTree,
  ProcessCapabilities,
} from "../process/process.types";
export { VALID_TRANSITIONS, TERMINAL_STATES } from "../process/process.types";

// Context — from common layer
export {
  KernelContext,
  type KernelContextData,
} from "../../../common/context/kernel-context";

// Journal
export { EventJournalService } from "../journal/event-journal.service";
export {
  CheckpointManager,
  InMemoryCheckpointStore,
} from "../journal/checkpoint-manager";
export type {
  ICheckpointStore,
  CheckpointManagerConfig,
} from "../journal/checkpoint-manager";

// Memory
export { KernelMemoryManagerService } from "../memory/kernel-memory-manager.service";
export { HierarchicalMemoryCascadeService } from "../memory/hierarchical-memory-cascade.service";
export type {
  MemoryScope,
  MemoryCascadeQuery,
  MemoryCascadeResult,
  MemoryWriteOptions,
} from "../memory/hierarchical-memory-cascade.service";
export { SCOPE_PRIORITY } from "../memory/hierarchical-memory-cascade.service";
export { WorkingMemoryStore } from "../memory/stores/working-memory.store";
export { PersistentMemoryStore } from "../memory/stores/persistent-memory.store";

// IPC
export { EventBusService } from "../ipc/event-bus.service";
export { MessageBusService } from "../ipc/message-bus.service";
export type { A2AMessage, A2AMessageType } from "../ipc/message-bus.service";

// Resource
export { ResourceManagerService } from "../resource/resource-manager.service";

// Observability
export { ProcessEventLogService } from "../observability/process-event-log.service";
export { KernelMetricsService } from "../observability/kernel-metrics.service";
export type {
  LLMCallEvent,
  ModelMetrics,
  ModuleMetrics,
  ObservabilityDashboard,
} from "../observability/kernel-metrics.service";

// Mission
export { MissionExecutorService } from "../mission/mission-executor.service";
export type {
  IMissionExecutor,
  MissionExecuteOptions,
  MissionExecuteResult,
} from "../mission/mission-executor.interface";

// Security
export { CapabilityGuardService } from "../security/capability-guard.service";
// ★ Batch 2 Topic Insights — Capability types
export type { CapabilityCheckResult } from "../security/capability.types";

// Scheduler
export { KernelSchedulerService } from "../scheduler/kernel-scheduler.service";

// Supervisor
export { ProcessSupervisorService } from "../supervisor/process-supervisor.service";
export { StateCategory } from "../supervisor/process-supervisor.service";
export type {
  StateEntry,
  ExecutionStateStats,
  ExecutionStateConfig,
} from "../supervisor/process-supervisor.service";

// Session Latency Tracking
export { SessionLatencyTrackerService } from "../observability/session-latency-tracker.service";
export type {
  LatencySession,
  LatencyPhase,
  LatencyCheckpoint,
  LLMLatencyRecord,
  LatencySessionSummary,
  TTFTStats,
  PhaseDurationSummary,
  LatencySessionType,
  LatencySessionStatus,
  StartSessionInput,
  StartPhaseInput,
  RecordLLMLatencyInput,
  ListSessionsFilter,
} from "../observability/session-latency.types";

// Observability — additional
export { CostAttributionService } from "../observability/cost-attribution.service";
export type {
  CostEvent,
  CostReport,
  CostByUser,
  CostByModule,
  CostByModel,
  HourlyBucket,
  BudgetAlert,
} from "../observability/cost-attribution.service";
// NOTE: ObservabilityController NOT exported here — controllers have decorator
// side effects that cause circular dependency chains. Import directly if needed.

// IPC — A2A (NOTE: A2AController NOT exported here — controllers have @UseGuards
// decorators that cause circular dependency chains during module loading)
export { A2AClientService } from "../ipc/a2a/a2a-client.service";
export { A2ATeamMemberAdapter } from "../ipc/a2a/a2a-team-member-adapter";
export { AgentCardRegistry } from "../ipc/a2a/agent-card-registry";
export { A2AApiKeyGuard } from "../ipc/a2a/a2a-api-key.guard";

// IPC — Progress
export { ProgressTrackerService } from "../ipc/progress-tracker.service";

// Resource — Health Check
export { HealthCheckRunner } from "../resource/health-check-runner";
export type { HealthCheckRunnerConfig } from "../resource/health-check-runner";

// Process — State Transition
export {
  StateTransitionValidator,
  InvalidTransitionError,
} from "../process/state-transition-validator";
export type { StateTransitionMap } from "../process/state-transition-validator";

// Resource — additional
export { CircuitBreakerService } from "../resource/circuit-breaker.service";
export {
  TaskCompletionType,
  type CircuitState,
} from "../resource/circuit-breaker.service";
export type {
  CircuitBreakerConfig,
  HealthMetrics,
} from "../resource/circuit-breaker.service";
export { ConstraintEnforcementService } from "../resource/constraint-enforcement.service";
export { ConstraintEngine } from "../resource/constraint-engine";
export { RateLimiter, TokenBucket } from "../resource/rate-limiter";
export type {
  RateLimitResult,
  RateLimitConfig,
} from "../resource/rate-limiter";
export { CostController } from "../resource/cost-controller";
export type {
  CostRecord,
  CostCategory,
  CostBudget,
  CostCheckResult,
  BudgetPeriod,
  ModelPricing,
} from "../resource/cost-controller";

// API
export { KernelApiService } from "../api/kernel-api.service";

// IPC — Message Persistence
export { MessagePersistenceService } from "../ipc/message-persistence.service";
export type { PersistedMessage } from "../ipc/message-persistence.service";

// IPC — Agent Lifecycle Protocol
export { AgentLifecycleProtocolService } from "../ipc/agent-lifecycle-protocol.service";
export type {
  LifecycleMessageType,
  ShutdownRequestPayload,
  PlanApprovalPayload,
  TaskNotificationPayload,
} from "../ipc/agent-lifecycle-protocol.service";
