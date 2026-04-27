/**
 * Runtime Memory Module
 *
 * 提供 AI Engine runtime 层的记忆能力：
 * - HierarchicalMemoryCascadeService: 4 层记忆级联（org → team → project → session）
 * - ProcessMemoryManagerService: 进程级记忆管理（基于 ProcessMemory 表）
 *
 * 本模块是 @Global()，所有其他模块无需显式 import 即可注入这些 service。
 *
 * 注意：Semantic 层记忆（ShortTerm/LongTerm/InMemory/MemoryCoordinator）
 * 位于 ai-engine/knowledge/memory/，由 AiEngineMemoryModule 提供。
 */

import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { HierarchicalMemoryCascadeService } from "./hierarchical-memory-cascade.service";
import { ProcessMemoryManagerService } from "./process-memory-manager.service";

const RUNTIME_MEMORY_PROVIDERS = [
  HierarchicalMemoryCascadeService,
  ProcessMemoryManagerService,
];

@Global()
@Module({
  imports: [PrismaModule],
  providers: RUNTIME_MEMORY_PROVIDERS,
  exports: RUNTIME_MEMORY_PROVIDERS,
})
export class RuntimeMemoryModule {}
