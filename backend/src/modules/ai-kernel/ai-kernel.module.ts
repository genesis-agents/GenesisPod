import { Global, Module } from "@nestjs/common";
import { ProcessManagerService } from "./process/process-manager.service";
import { EventJournalService } from "./journal/event-journal.service";
import { KernelMemoryManagerService } from "./memory/kernel-memory-manager.service";
import { WorkingMemoryStore } from "./memory/stores/working-memory.store";
import { PersistentMemoryStore } from "./memory/stores/persistent-memory.store";
import { InMemoryStore } from "./memory/stores/in-memory-store";
import { EventBusService } from "./ipc/event-bus.service";
import { ProgressTrackerService } from "./ipc/progress-tracker.service";
import { MessageBusService } from "./ipc/message-bus.service";
import { A2AClientService } from "./ipc/a2a/a2a-client.service";
import { AgentCardRegistry } from "./ipc/a2a/agent-card-registry";
import { A2AApiKeyGuard } from "./ipc/a2a/a2a-api-key.guard";
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
  WorkingMemoryStore,
  PersistentMemoryStore,
  InMemoryStore,
  // IPC
  EventBusService,
  ProgressTrackerService,
  MessageBusService,
  // A2A
  A2AClientService,
  // A2ATeamMemberAdapter is NOT a DI provider — it requires manual instantiation with agentCard
  AgentCardRegistry,
  A2AApiKeyGuard,
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
  controllers: [ObservabilityController], // A2AController stays in A2AModule (app.module.ts)
  providers: KERNEL_PROVIDERS,
  exports: KERNEL_PROVIDERS,
})
export class AiKernelModule {}
