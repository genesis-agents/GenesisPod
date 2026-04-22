/**
 * AI Kernel Facade
 * 统一入口模块
 *
 * ★ 所有外部模块访问 AI Kernel 必须从此文件导入，禁止直接访问 ai-kernel 内部路径
 */

// Process
export { ProcessManagerService } from "../../ai-engine/runtime/process/process-manager.service";
export type {
  ProcessId,
  SpawnOptions,
  ProcessSnapshot,
  ProcessTree,
  ProcessCapabilities,
} from "../../ai-engine/runtime/process/process.types";
export {
  VALID_TRANSITIONS,
  TERMINAL_STATES,
} from "../../ai-engine/runtime/process/process.types";

// Context — from common layer
export {
  KernelContext,
  type KernelContextData,
} from "../../../common/context/kernel-context";

// Journal: moved to ai-engine/runtime/journal (PR 4); re-exported for backward compat
export { EventJournalService } from "../../ai-engine/runtime/journal/event-journal.service";
export {
  CheckpointManager,
  InMemoryCheckpointStore,
} from "../../ai-engine/runtime/journal/checkpoint-manager";
export type {
  ICheckpointStore,
  CheckpointManagerConfig,
} from "../../ai-engine/runtime/journal/checkpoint-manager";

// Memory: moved to ai-engine/runtime/memory + ai-engine/knowledge/memory (PR 3 of kernel-merge refactor)
// Consumers should import Memory symbols from @/modules/ai-engine/facade

// IPC: moved to ai-engine/runtime/ipc (PR 4); re-exported for backward compat
export { EventBusService } from "../../ai-engine/runtime/ipc/event-bus.service";
export { MessageBusService } from "../../ai-engine/runtime/ipc/message-bus.service";
export type {
  A2AMessage,
  A2AMessageType,
} from "../../ai-engine/runtime/ipc/message-bus.service";

// Resource: moved to ai-engine/runtime/resource (PR 4); re-exported for backward compat
export { ResourceManagerService } from "../../ai-engine/runtime/resource/resource-manager.service";

// Observability: moved to ai-engine/runtime/observability (PR 2 of kernel-merge refactor)
// Consumers should import Observability symbols from @/modules/ai-engine/facade

// Mission
export { MissionExecutorService } from "../../ai-engine/runtime/mission/mission-executor.service";
export type {
  IMissionExecutor,
  MissionExecuteOptions,
  MissionExecuteResult,
} from "../../ai-engine/runtime/mission/mission-executor.interface";

// Security
export { CapabilityGuardService } from "../../ai-engine/runtime/security/capability-guard.service";
// ★ Batch 2 Topic Insights — Capability types
export type { CapabilityCheckResult } from "../../ai-engine/runtime/security/capability.types";

// Scheduler
export { KernelSchedulerService } from "../../ai-engine/runtime/scheduler/kernel-scheduler.service";

// Supervisor
export { ProcessSupervisorService } from "../../ai-engine/runtime/supervisor/process-supervisor.service";
export { StateCategory } from "../../ai-engine/runtime/supervisor/process-supervisor.service";
export type {
  StateEntry,
  ExecutionStateStats,
  ExecutionStateConfig,
} from "../../ai-engine/runtime/supervisor/process-supervisor.service";

// Session Latency Tracking: moved to ai-engine/runtime/observability (PR 2)
// Consumers should import from @/modules/ai-engine/facade

// Observability (CostAttributionService etc): moved to ai-engine/runtime/observability (PR 2)
// Consumers should import from @/modules/ai-engine/facade

// IPC — A2A: moved to ai-engine/runtime/a2a (PR 1 of kernel-merge refactor)
// Consumers should import A2A symbols directly from @/modules/ai-engine/runtime/a2a

// IPC — Progress
export { ProgressTrackerService } from "../../ai-engine/runtime/ipc/progress-tracker.service";

// Resource — Health Check
export { HealthCheckRunner } from "../../ai-engine/runtime/resource/health-check-runner";
export type { HealthCheckRunnerConfig } from "../../ai-engine/runtime/resource/health-check-runner";

// Process — State Transition
export {
  StateTransitionValidator,
  InvalidTransitionError,
} from "../../ai-engine/runtime/process/state-transition-validator";
export type { StateTransitionMap } from "../../ai-engine/runtime/process/state-transition-validator";

// Resource — additional
export { CircuitBreakerService } from "../../ai-engine/runtime/resource/circuit-breaker.service";
export {
  TaskCompletionType,
  type CircuitState,
} from "../../ai-engine/runtime/resource/circuit-breaker.service";
export type {
  CircuitBreakerConfig,
  HealthMetrics,
} from "../../ai-engine/runtime/resource/circuit-breaker.service";
export { ConstraintEnforcementService } from "../../ai-engine/runtime/resource/constraint-enforcement.service";
export { ConstraintEngine } from "../../ai-engine/runtime/resource/constraint-engine";
export {
  RateLimiter,
  TokenBucket,
} from "../../ai-engine/runtime/resource/rate-limiter";
export type {
  RateLimitResult,
  RateLimitConfig,
} from "../../ai-engine/runtime/resource/rate-limiter";
export { CostController } from "../../ai-engine/runtime/resource/cost-controller";
export type {
  CostRecord,
  CostCategory,
  CostBudget,
  CostCheckResult,
  BudgetPeriod,
  ModelPricing,
} from "../../ai-engine/runtime/resource/cost-controller";

// API
export { KernelApiService } from "../../ai-engine/runtime/api/kernel-api.service";

// IPC — Message Persistence
export { MessagePersistenceService } from "../../ai-engine/runtime/ipc/message-persistence.service";
export type { PersistedMessage } from "../../ai-engine/runtime/ipc/message-persistence.service";

// IPC — Agent Lifecycle Protocol
export { AgentLifecycleProtocolService } from "../../ai-engine/runtime/ipc/agent-lifecycle-protocol.service";
export type {
  LifecycleMessageType,
  ShutdownRequestPayload,
  PlanApprovalPayload,
  TaskNotificationPayload,
} from "../../ai-engine/runtime/ipc/agent-lifecycle-protocol.service";
