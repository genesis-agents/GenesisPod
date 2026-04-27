/**
 * Runtime Module (aggregate)
 *
 * 一站式装配 ai-harness 下所有 @Global runtime 能力：
 * - Memory / Journal / IPC / Resource / Observability
 * - Process / Scheduler / Supervisor / Mission / Security / API
 *
 * 由 app.module.ts 直接装配 — engine 不再反向 import。
 */

import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";

// Cross-cutting runtime services
import { RuntimeJournalModule } from "../protocol/journal/journal.module";
import { RuntimeIpcModule } from "../protocol/ipc/ipc.module";
import { RuntimeResourceModule } from "../governance/resource/resource.module";
import { RuntimeMemoryModule } from "../memory/working/memory.module";
import { ObservabilityModule } from "../governance/observability/observability.module";

// Runtime lifecycle services
import { ProcessManagerService } from "../process/manager/process-manager.service";
import { ProcessSupervisorService } from "../process/supervisor/process-supervisor.service";
import { MissionExecutorService } from "./mission/mission-executor.service";
import { CapabilityGuardService } from "../governance/security/capability-guard.service";
import { KernelSchedulerService } from "../process/scheduler/kernel-scheduler.service";
import { KernelApiService } from "./kernel-api/kernel-api.service";

const RUNTIME_LIFECYCLE_PROVIDERS = [
  ProcessManagerService,
  ProcessSupervisorService,
  MissionExecutorService,
  CapabilityGuardService,
  KernelSchedulerService,
  KernelApiService,
];

@Global()
@Module({
  imports: [
    PrismaModule,
    RuntimeJournalModule,
    RuntimeIpcModule,
    RuntimeResourceModule,
    RuntimeMemoryModule,
    ObservabilityModule,
  ],
  providers: RUNTIME_LIFECYCLE_PROVIDERS,
  exports: [
    RuntimeJournalModule,
    RuntimeIpcModule,
    RuntimeResourceModule,
    RuntimeMemoryModule,
    ObservabilityModule,
    ...RUNTIME_LIFECYCLE_PROVIDERS,
  ],
})
export class RuntimeModule {}
