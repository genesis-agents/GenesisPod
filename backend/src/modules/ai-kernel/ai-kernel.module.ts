import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { ProcessManagerService } from "./process/process-manager.service";
import { EventJournalService } from "./journal/event-journal.service";
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
  // Memory: moved to ai-engine/runtime/memory + ai-engine/knowledge/memory (PR 3 of kernel-merge refactor)
  // IPC
  EventBusService,
  ProgressTrackerService,
  MessageBusService,
  MessagePersistenceService,
  AgentLifecycleProtocolService,
  // A2A: moved to ai-engine/runtime/a2a (PR 1 of kernel-merge refactor)
  // Resource
  CircuitBreakerService,
  TokenBudgetService,
  ResourceManagerService,
  ConstraintEngine,
  ConstraintEnforcementService,
  CostController,
  RateLimiter,
  // Observability: moved to ai-engine/runtime/observability (PR 2 of kernel-merge refactor)
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
  // A2AController moved to ai-engine/runtime/a2a (PR 1); ObservabilityController moved to ai-engine/runtime/observability (PR 2)
  providers: KERNEL_PROVIDERS,
  exports: KERNEL_PROVIDERS,
})
export class AiKernelModule {}
