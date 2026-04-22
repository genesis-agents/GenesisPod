import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { ProcessManagerService } from "./process/process-manager.service";
import { EventJournalService } from "./journal/event-journal.service";
import { KernelMemoryManagerService } from "./memory/kernel-memory-manager.service";
import { HierarchicalMemoryCascadeService } from "./memory/hierarchical-memory-cascade.service";
import { WorkingMemoryStore } from "./memory/stores/working-memory.store";
import { PersistentMemoryStore } from "./memory/stores/persistent-memory.store";
import { InMemoryStore } from "./memory/stores/in-memory-store";
import { EventBusService } from "./ipc/event-bus.service";
import { ProgressTrackerService } from "./ipc/progress-tracker.service";
import { MessageBusService } from "./ipc/message-bus.service";
import { MessagePersistenceService } from "./ipc/message-persistence.service";
import { AgentLifecycleProtocolService } from "./ipc/agent-lifecycle-protocol.service";
import { CircuitBreakerService } from "./resource/circuit-breaker.service";
import { TokenBudgetService } from "./resource/token-budget.service";
import { ResourceManagerService } from "./resource/resource-manager.service";
import { ConstraintEngine } from "./resource/constraint-engine";
import { ConstraintEnforcementService } from "./resource/constraint-enforcement.service";
import { CostController } from "./resource/cost-controller";
import { RateLimiter } from "./resource/rate-limiter";
import { ProcessEventLogService } from "./observability/process-event-log.service";
import { KernelMetricsService } from "./observability/kernel-metrics.service";
import { CostAttributionService } from "./observability/cost-attribution.service";
import { SessionLatencyTrackerService } from "./observability/session-latency-tracker.service";
import { ObservabilityController } from "./observability/observability.controller";
import { ProcessSupervisorService } from "./supervisor/process-supervisor.service";
import { CheckpointManager } from "./journal/checkpoint-manager";
import { MissionExecutorService } from "./mission/mission-executor.service";
import { CapabilityGuardService } from "./security/capability-guard.service";
import { KernelSchedulerService } from "./scheduler/kernel-scheduler.service";
import { KernelApiService } from "./api/kernel-api.service";

const KERNEL_PROVIDERS = [
  // Process
  ProcessManagerService,
  // Journal
  EventJournalService,
  CheckpointManager,
  // Memory
  KernelMemoryManagerService,
  HierarchicalMemoryCascadeService,
  WorkingMemoryStore,
  PersistentMemoryStore,
  InMemoryStore,
  // IPC
  EventBusService,
  ProgressTrackerService,
  MessageBusService,
  MessagePersistenceService,
  AgentLifecycleProtocolService,
  // A2A: moved to ai-engine/infra/a2a (PR 1 of kernel-merge refactor)
  // Resource
  CircuitBreakerService,
  TokenBudgetService,
  ResourceManagerService,
  ConstraintEngine,
  ConstraintEnforcementService,
  CostController,
  RateLimiter,
  // Observability
  ProcessEventLogService,
  KernelMetricsService,
  CostAttributionService,
  SessionLatencyTrackerService,
  // Supervisor
  ProcessSupervisorService,
  // Mission
  MissionExecutorService,
  // Security
  CapabilityGuardService,
  // Scheduler
  KernelSchedulerService,
  // API
  KernelApiService,
];

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ObservabilityController], // A2AController now lives in ai-engine/infra/a2a/A2AModule
  providers: KERNEL_PROVIDERS,
  exports: KERNEL_PROVIDERS,
})
export class AiKernelModule {}
