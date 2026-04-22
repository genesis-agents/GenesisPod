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

// Memory: moved to ai-engine/runtime/memory + ai-engine/knowledge/memory (PR 3 of kernel-merge refactor)
// Consumers should import Memory symbols from @/modules/ai-engine/facade

// IPC
export { EventBusService } from "../ipc/event-bus.service";
export { MessageBusService } from "../ipc/message-bus.service";
export type { A2AMessage, A2AMessageType } from "../ipc/message-bus.service";

// Resource
export { ResourceManagerService } from "../resource/resource-manager.service";

// Observability: moved to ai-engine/runtime/observability (PR 2 of kernel-merge refactor)
// Consumers should import Observability symbols from @/modules/ai-engine/facade

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

// Session Latency Tracking: moved to ai-engine/runtime/observability (PR 2)
// Consumers should import from @/modules/ai-engine/facade

// Observability (CostAttributionService etc): moved to ai-engine/runtime/observability (PR 2)
// Consumers should import from @/modules/ai-engine/facade

// IPC — A2A: moved to ai-engine/runtime/a2a (PR 1 of kernel-merge refactor)
// Consumers should import A2A symbols directly from @/modules/ai-engine/runtime/a2a

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
