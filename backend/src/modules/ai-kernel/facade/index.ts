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
export { CheckpointManager } from "../journal/checkpoint-manager";

// Memory
export { KernelMemoryManagerService } from "../memory/kernel-memory-manager.service";
export { WorkingMemoryStore } from "../memory/stores/working-memory.store";
export { PersistentMemoryStore } from "../memory/stores/persistent-memory.store";

// IPC
export { EventBusService } from "../ipc/event-bus.service";
export { MessageBusService } from "../ipc/message-bus.service";

// Resource
export { ResourceManagerService } from "../resource/resource-manager.service";

// Observability
export { ProcessEventLogService } from "../observability/process-event-log.service";
export { KernelMetricsService } from "../observability/kernel-metrics.service";

// Mission
export { MissionExecutorService } from "../mission/mission-executor.service";
export type {
  IMissionExecutor,
  MissionExecuteOptions,
  MissionExecuteResult,
} from "../mission/mission-executor.interface";

// Security
export { CapabilityGuardService } from "../security/capability-guard.service";

// Scheduler
export { KernelSchedulerService } from "../scheduler/kernel-scheduler.service";

// Supervisor
export { ProcessSupervisorService } from "../supervisor/process-supervisor.service";

// API
export { KernelApiService } from "../api/kernel-api.service";
