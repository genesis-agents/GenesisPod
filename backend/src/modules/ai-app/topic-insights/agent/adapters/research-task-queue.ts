/**
 * ResearchTaskQueue — Prisma-backed DAG queue 实现（topic-insights 专属）
 *
 * 归属：L3 ai-app/topic-insights/agent/adapters/
 *
 * 操作 `research_tasks` 表实现 harness 的 TaskQueue 接口。scope = missionId。
 * Phase 5 如需真 Redis 队列换 BullMQ，只改这个文件，harness 代码不动。
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import type {
  TaskQueue,
  QueueStats,
  EnqueueOptions,
} from "@/modules/ai-engine/harness/runtime";

@Injectable()
export class ResearchTaskQueue implements TaskQueue {
  // 保留 logger 实例给未来调度失败/DLQ 记录使用
  protected readonly logger = new Logger(ResearchTaskQueue.name);

  constructor(private readonly prisma: PrismaService) {
    // keep logger referenced to avoid tsc unused-private warning when no call site yet
    void this.logger;
  }

  async enqueue(taskId: string, _opts: EnqueueOptions = {}): Promise<void> {
    await this.prisma.researchTask.update({
      where: { id: taskId },
      data: { status: "QUEUED", queuedAt: new Date() },
    });
  }

  async enqueueMany(taskIds: readonly string[]): Promise<void> {
    if (taskIds.length === 0) return;
    await this.prisma.researchTask.updateMany({
      where: { id: { in: [...taskIds] } },
      data: { status: "QUEUED", queuedAt: new Date() },
    });
  }

  /**
   * 取下一个可执行 task：scope = missionId
   *   - status=QUEUED
   *   - dependencies 全 COMPLETED
   *   - priority DESC, queuedAt ASC
   */
  async dequeueNext(scope: string): Promise<string | null> {
    const candidates = await this.prisma.researchTask.findMany({
      where: { missionId: scope, status: "QUEUED" },
      orderBy: [{ priority: "desc" }, { queuedAt: "asc" }],
      select: { id: true, dependencies: true },
    });

    for (const task of candidates) {
      if (!task.dependencies || task.dependencies.length === 0) {
        await this.markScheduled(task.id);
        return task.id;
      }
      const depDoneCount = await this.prisma.researchTask.count({
        where: { id: { in: task.dependencies }, status: "COMPLETED" },
      });
      if (depDoneCount === task.dependencies.length) {
        await this.markScheduled(task.id);
        return task.id;
      }
    }
    return null;
  }

  async cancel(taskId: string, reason?: string): Promise<void> {
    await this.prisma.researchTask.update({
      where: { id: taskId },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
        resultSummary: reason ?? "cancelled",
      },
    });
  }

  async getStats(scope: string): Promise<QueueStats> {
    const rows = await this.prisma.researchTask.groupBy({
      by: ["status"],
      where: { missionId: scope },
      _count: { _all: true },
    });
    const stats = {
      pending: 0,
      queued: 0,
      scheduled: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      awaitingHuman: 0,
      total: 0,
    };
    for (const r of rows) {
      const c = r._count._all;
      stats.total += c;
      switch (r.status) {
        case "PENDING":
        case "CREATED":
          stats.pending += c;
          break;
        case "QUEUED":
          stats.queued += c;
          break;
        case "SCHEDULED":
          stats.scheduled += c;
          break;
        case "RUNNING":
        case "EXECUTING":
        case "VERIFYING":
          stats.running += c;
          break;
        case "COMPLETED":
          stats.completed += c;
          break;
        case "FAILED":
          stats.failed += c;
          break;
        case "CANCELLED":
          stats.cancelled += c;
          break;
        case "AWAITING_HUMAN":
        case "PAUSED":
          stats.awaitingHuman += c;
          break;
        default:
          break;
      }
    }
    return stats;
  }

  isFinal(stats: QueueStats): boolean {
    return (
      stats.total > 0 &&
      stats.pending === 0 &&
      stats.queued === 0 &&
      stats.scheduled === 0 &&
      stats.running === 0 &&
      stats.awaitingHuman === 0
    );
  }

  private async markScheduled(taskId: string): Promise<void> {
    await this.prisma.researchTask.update({
      where: { id: taskId },
      data: { status: "SCHEDULED", scheduledAt: new Date() },
    });
  }
}
