/**
 * Runtime exports (formerly ai-kernel/facade, merged into engine in PR 7)
 *
 * 消费方应从 @/modules/ai-engine/facade 引用以下符号，禁止穿透到 runtime/ 内部路径。
 */

// Memory (Runtime layer: process-level + hierarchical cascade)
export { ProcessMemoryManagerService } from "../../runtime/memory/process-memory-manager.service";
export { HierarchicalMemoryCascadeService } from "../../runtime/memory/hierarchical-memory-cascade.service";
export type {
  MemoryScope,
  MemoryCascadeQuery,
  MemoryCascadeResult,
  MemoryWriteOptions,
} from "../../runtime/memory/hierarchical-memory-cascade.service";
export { SCOPE_PRIORITY } from "../../runtime/memory/hierarchical-memory-cascade.service";

// Process
export { ProcessManagerService } from "../../runtime/process/process-manager.service";
export type {
  ProcessId,
  SpawnOptions,
  ProcessSnapshot,
  ProcessTree,
  ProcessCapabilities,
} from "../../runtime/process/process.types";
export {
  VALID_TRANSITIONS,
  TERMINAL_STATES,
} from "../../runtime/process/process.types";

// Context
export {
  KernelContext,
  type KernelContextData,
} from "../../../../common/context/kernel-context";

// Journal
export { EventJournalService } from "../../runtime/journal/event-journal.service";
export {
  CheckpointManager,
  InMemoryCheckpointStore,
} from "../../runtime/journal/checkpoint-manager";
export type {
  ICheckpointStore,
  CheckpointManagerConfig,
} from "../../runtime/journal/checkpoint-manager";

// IPC (EventBusService / ProgressTrackerService 在 ai-engine/facade/index.ts 以别名导出；此处提供原名)
export { EventBusService } from "../../runtime/ipc/event-bus.service";
export { ProgressTrackerService } from "../../runtime/ipc/progress-tracker.service";
export { MessageBusService } from "../../runtime/ipc/message-bus.service";
export type {
  A2AMessage,
  A2AMessageType,
} from "../../runtime/ipc/message-bus.service";
export { MessagePersistenceService } from "../../runtime/ipc/message-persistence.service";
export type { PersistedMessage } from "../../runtime/ipc/message-persistence.service";
export { AgentLifecycleProtocolService } from "../../runtime/ipc/agent-lifecycle-protocol.service";
export type {
  LifecycleMessageType,
  ShutdownRequestPayload,
  PlanApprovalPayload,
  TaskNotificationPayload,
} from "../../runtime/ipc/agent-lifecycle-protocol.service";

// Resource (CircuitBreakerService / ConstraintEnforcementService 已在 ai-engine/facade/index.ts 导出)
export { ResourceManagerService } from "../../runtime/resource/resource-manager.service";
export { HealthCheckRunner } from "../../runtime/resource/health-check-runner";
export type { HealthCheckRunnerConfig } from "../../runtime/resource/health-check-runner";
export { ConstraintEngine } from "../../runtime/resource/constraint-engine";
export { RateLimiter, TokenBucket } from "../../runtime/resource/rate-limiter";
export type {
  RateLimitResult,
  RateLimitConfig,
} from "../../runtime/resource/rate-limiter";
export { CostController } from "../../runtime/resource/cost-controller";
export type {
  CostRecord,
  CostCategory,
  CostBudget,
  CostCheckResult,
  BudgetPeriod,
  ModelPricing,
} from "../../runtime/resource/cost-controller";

// Environment Discovery（L2 通用·2026-04-23）
export { RuntimeEnvironmentService } from "../../runtime/resource/runtime-environment.service";
export type {
  EnvironmentSnapshot,
  EnvironmentSnapshotParams,
  RuntimeModelCapability,
  RuntimeModelType,
  RuntimeToolCapability,
  RuntimeDepHealth,
  RuntimeUserKeyState,
} from "../../runtime/resource/runtime-environment.types";

// Mission
export { MissionExecutorService } from "../../runtime/mission/mission-executor.service";
export type {
  IMissionExecutor,
  MissionExecuteOptions,
  MissionExecuteResult,
} from "../../runtime/mission/mission-executor.interface";

// Security
export { CapabilityGuardService } from "../../runtime/security/capability-guard.service";
export type { CapabilityCheckResult } from "../../runtime/security/capability.types";

// Scheduler
export { KernelSchedulerService } from "../../runtime/scheduler/kernel-scheduler.service";

// Supervisor (ProcessSupervisorService 在 ai-engine/facade/index.ts 以别名导出；此处提供原名)
export { ProcessSupervisorService } from "../../runtime/supervisor/process-supervisor.service";
export type {
  StateEntry,
  ExecutionStateStats,
  ExecutionStateConfig,
} from "../../runtime/supervisor/process-supervisor.service";

// Process — State Transition
export {
  StateTransitionValidator,
  InvalidTransitionError,
} from "../../runtime/process/state-transition-validator";
export type { StateTransitionMap } from "../../runtime/process/state-transition-validator";

// Resource — additional (CircuitBreakerService 已在 ai-engine/facade/index.ts 导出)
export {
  TaskCompletionType,
  type CircuitState,
} from "../../runtime/resource/circuit-breaker.service";
export type {
  CircuitBreakerConfig,
  HealthMetrics,
} from "../../runtime/resource/circuit-breaker.service";

// API
export { KernelApiService } from "../../runtime/api/kernel-api.service";
