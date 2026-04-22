import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { ProcessManagerService } from "./process/process-manager.service";
import { ProcessSupervisorService } from "./supervisor/process-supervisor.service";
import { MissionExecutorService } from "./mission/mission-executor.service";
import { CapabilityGuardService } from "./security/capability-guard.service";
import { KernelSchedulerService } from "./scheduler/kernel-scheduler.service";
import { KernelApiService } from "./api/kernel-api.service";

const KERNEL_PROVIDERS = [
  // Process
  ProcessManagerService,
  // Journal / IPC / Resource: moved to ai-engine/runtime/ (PR 4 of kernel-merge refactor)
  // Memory: moved to ai-engine/runtime/memory + ai-engine/knowledge/memory (PR 3)
  // A2A: moved to ai-engine/runtime/a2a (PR 1)
  // Observability: moved to ai-engine/runtime/observability (PR 2)
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
  providers: KERNEL_PROVIDERS,
  exports: KERNEL_PROVIDERS,
})
export class AiKernelModule {}
