/**
 * AI Kernel Module (deprecated)
 *
 * 所有 kernel 能力已迁移到 ai-engine/runtime 下的独立子模块：
 * - RuntimeJournalModule / RuntimeIpcModule / RuntimeResourceModule (PR 4)
 * - RuntimeMemoryModule (PR 3)
 * - ObservabilityModule (PR 2)
 * - A2AModule (PR 1)
 * - RuntimeProcessModule / RuntimeSchedulerModule / RuntimeSupervisorModule /
 *   RuntimeMissionModule / RuntimeSecurityModule / RuntimeApiModule (PR 5)
 *
 * 本 Module 保留为空壳以保持向后兼容（app.module.ts 中仍 import），
 * 最终清理会在 PR 6 中完成（删除整个 ai-kernel 目录）。
 */

import { Module } from "@nestjs/common";

@Module({})
export class AiKernelModule {}
