/**
 * Runtime exports (formerly ai-kernel/facade, merged into engine in PR 7)
 *
 * 消费方应从 @/modules/ai-engine/facade 引用以下符号，禁止穿透到 runtime/ 内部路径。
 */

// Memory (Runtime layer: process-level + hierarchical cascade)
export { ProcessMemoryManagerService } from "../../../ai-harness/memory/working/process-memory-manager.service";
export { HierarchicalMemoryCascadeService } from "../../../ai-harness/memory/working/hierarchical-memory-cascade.service";
export type {
  MemoryScope,
  MemoryCascadeQuery,
  MemoryCascadeResult,
  MemoryWriteOptions,
} from "../../../ai-harness/memory/working/hierarchical-memory-cascade.service";
export { SCOPE_PRIORITY } from "../../../ai-harness/memory/working/hierarchical-memory-cascade.service";

// Process
export { ProcessManagerService } from "../../../ai-harness/process/manager/process-manager.service";
export type {
  ProcessId,
  SpawnOptions,
  ProcessSnapshot,
  ProcessTree,
  ProcessCapabilities,
} from "../../../ai-harness/process/manager/process.types";
export {
  VALID_TRANSITIONS,
  TERMINAL_STATES,
} from "../../../ai-harness/process/manager/process.types";

// Context
export {
  KernelContext,
  type KernelContextData,
} from "../../../../common/context/kernel-context";

// Journal
export { EventJournalService } from "../../../ai-harness/protocol/journal/event-journal.service";
export {
  CheckpointManager,
  InMemoryCheckpointStore,
} from "../../../ai-harness/protocol/journal/checkpoint-manager";
export type {
  ICheckpointStore,
  CheckpointManagerConfig,
} from "../../../ai-harness/protocol/journal/checkpoint-manager";

// IPC (EventBusService / ProgressTrackerService 在 ai-engine/facade/index.ts 以别名导出；此处提供原名)
export { EventBusService } from "../../../ai-harness/protocol/ipc/event-bus.service";
export { ProgressTrackerService } from "../../../ai-harness/protocol/ipc/progress-tracker.service";
export { MessageBusService } from "../../../ai-harness/protocol/ipc/message-bus.service";
export type {
  A2AMessage,
  A2AMessageType,
} from "../../../ai-harness/protocol/ipc/message-bus.service";
export { MessagePersistenceService } from "../../../ai-harness/protocol/ipc/message-persistence.service";
export type { PersistedMessage } from "../../../ai-harness/protocol/ipc/message-persistence.service";
export { AgentLifecycleProtocolService } from "../../../ai-harness/protocol/ipc/agent-lifecycle-protocol.service";
export type {
  LifecycleMessageType,
  ShutdownRequestPayload,
  PlanApprovalPayload,
  TaskNotificationPayload,
} from "../../../ai-harness/protocol/ipc/agent-lifecycle-protocol.service";

// Resource (CircuitBreakerService / ConstraintEnforcementService 已在 ai-engine/facade/index.ts 导出)
export { ResourceManagerService } from "../../../ai-harness/governance/resource/resource-manager.service";
export { HealthCheckRunner } from "../../../ai-harness/governance/resource/health-check-runner";
export type { HealthCheckRunnerConfig } from "../../../ai-harness/governance/resource/health-check-runner";
export { ConstraintEngine } from "../../../ai-harness/governance/resource/constraint-engine";
export { RateLimiter, TokenBucket } from "../../../ai-harness/governance/resource/rate-limiter";
export type {
  RateLimitResult,
  RateLimitConfig,
} from "../../../ai-harness/governance/resource/rate-limiter";
export { CostController } from "../../../ai-harness/governance/resource/cost-controller";
export type {
  CostRecord,
  CostCategory,
  CostBudget,
  CostCheckResult,
  BudgetPeriod,
  ModelPricing,
} from "../../../ai-harness/governance/resource/cost-controller";

// Environment Discovery（L2 通用·2026-04-23）
export { RuntimeEnvironmentService } from "../../../ai-harness/governance/resource/runtime-environment.service";
export type {
  EnvironmentSnapshot,
  EnvironmentSnapshotParams,
  RuntimeModelCapability,
  RuntimeModelType,
  RuntimeToolCapability,
  RuntimeDepHealth,
  RuntimeUserKeyState,
} from "../../../ai-harness/governance/resource/runtime-environment.types";

// Mission
export { MissionExecutorService } from "../../../ai-harness/runtime/mission/mission-executor.service";
export type {
  IMissionExecutor,
  MissionExecuteOptions,
  MissionExecuteResult,
} from "../../../ai-harness/runtime/mission/mission-executor.interface";

// Security
export { CapabilityGuardService } from "../../../ai-harness/governance/security/capability-guard.service";
export type { CapabilityCheckResult } from "../../../ai-harness/governance/security/capability.types";

// Scheduler
export { KernelSchedulerService } from "../../../ai-harness/process/scheduler/kernel-scheduler.service";

// Supervisor (ProcessSupervisorService 在 ai-engine/facade/index.ts 以别名导出；此处提供原名)
export { ProcessSupervisorService } from "../../../ai-harness/process/supervisor/process-supervisor.service";
export type {
  StateEntry,
  ExecutionStateStats,
  ExecutionStateConfig,
} from "../../../ai-harness/process/supervisor/process-supervisor.service";

// Process — State Transition
export {
  StateTransitionValidator,
  InvalidTransitionError,
} from "../../../ai-harness/process/manager/state-transition-validator";
export type { StateTransitionMap } from "../../../ai-harness/process/manager/state-transition-validator";

// Resource — additional (CircuitBreakerService 已在 ai-engine/facade/index.ts 导出)
export {
  TaskCompletionType,
  type CircuitState,
} from "../../../ai-harness/governance/resource/circuit-breaker.service";
export type {
  CircuitBreakerConfig,
  HealthMetrics,
} from "../../../ai-harness/governance/resource/circuit-breaker.service";

// API
export { KernelApiService } from "../../../ai-harness/runtime/kernel-api/kernel-api.service";
