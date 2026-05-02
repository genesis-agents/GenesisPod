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

// Teams module (PR-X4 → 2026-05-02 #1 MECE: teams 上提到 ai-harness 顶层)
import { TeamsModule } from "../teams/teams.module";

// Cross-cutting runtime services
import { RuntimeJournalModule } from "../protocol/journal/journal.module";
import { RuntimeIpcModule } from "../protocol/ipc/ipc.module";
import { RuntimeResourceModule } from "../guardrails/resource.module";
import { RuntimeMemoryModule } from "../memory/working/memory.module";
import { ObservabilityModule } from "../tracing/observability.module";

// Runtime lifecycle services
import { ProcessManagerService } from "../lifecycle/manager/process-manager.service";
import { ProcessSupervisorService } from "../lifecycle/supervisor/process-supervisor.service";
import { MissionExecutorService } from "./mission/mission-executor.service";
// CapabilityGuardService 已搬到 ai-engine/safety/security/（PR-X3）
// 由 ai-engine-constraint.module 提供，@Global 全局可注入
import { KernelSchedulerService } from "../runner/scheduler/kernel-scheduler.service";
import { KernelApiService } from "./api/kernel-api.service";

const RUNTIME_LIFECYCLE_PROVIDERS = [
  ProcessManagerService,
  ProcessSupervisorService,
  MissionExecutorService,
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
    // ★ PR-X4: TeamsModule 从 ai-engine 迁移至此
    TeamsModule,
  ],
  providers: RUNTIME_LIFECYCLE_PROVIDERS,
  exports: [
    RuntimeJournalModule,
    RuntimeIpcModule,
    RuntimeResourceModule,
    RuntimeMemoryModule,
    ObservabilityModule,
    ...RUNTIME_LIFECYCLE_PROVIDERS,
    // ★ PR-X4: TeamsModule 导出，使 TeamsService/TeamRegistry/RoleRegistry 等全局可注入
    TeamsModule,
  ],
})
export class RuntimeModule {}
