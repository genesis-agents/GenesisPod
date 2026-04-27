/**
 * Runtime Module (aggregate)
 *
 * 一站式注册 ai-engine/runtime/ 下所有 @Global runtime 能力：
 * - Memory / Journal / IPC / Resource / Observability / A2A / Realtime
 * - Process / Scheduler / Supervisor / Mission / Security / API
 *
 * 本模块仅做组合导入，避免 AiEngineModule 显式罗列每一个子模块。
 */

import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";

// Cross-cutting runtime services
import { RuntimeJournalModule } from "./journal/journal.module";
import { RuntimeIpcModule } from "./ipc/ipc.module";
import { RuntimeResourceModule } from "./resource/resource.module";
import { RuntimeMemoryModule } from "./memory/memory.module";
import { ObservabilityModule } from "./observability/observability.module";

// Runtime lifecycle services
import { ProcessManagerService } from "../../ai-harness/process/manager/process-manager.service";
import { ProcessSupervisorService } from "../../ai-harness/process/supervisor/process-supervisor.service";
import { MissionExecutorService } from "./mission/mission-executor.service";
import { CapabilityGuardService } from "./security/capability-guard.service";
import { KernelSchedulerService } from "../../ai-harness/process/scheduler/kernel-scheduler.service";
import { KernelApiService } from "./api/kernel-api.service";

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
