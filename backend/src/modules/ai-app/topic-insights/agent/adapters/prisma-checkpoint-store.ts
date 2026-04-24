/**
 * PrismaCheckpointStore — 崩溃恢复快照持久化实现（topic-insights 专属）
 *
 * 归属：L3 ai-app/topic-insights/agent/adapters/
 *
 * 写 `task_checkpoints` 表，同步更新 `research_tasks.lastCheckpointId`。
 */

import { Injectable, Logger } from "@nestjs/common";
import type { ResearchTaskStatus } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import type {
  CheckpointStore,
  CheckpointData,
  TaskStatus,
} from "@/modules/ai-engine/harness/runtime";

@Injectable()
export class PrismaCheckpointStore implements CheckpointStore {
  private readonly logger = new Logger(PrismaCheckpointStore.name);

  constructor(private readonly prisma: PrismaService) {}

  async save(
    taskId: string,
    data: CheckpointData,
    status: TaskStatus,
    _metadata: Record<string, unknown>,
  ): Promise<string> {
    const cp = await this.prisma.taskCheckpoint.create({
      data: {
        taskId,
        iteration: data.iteration,
        stepIndex: data.stepIndex,
        observations: toPrismaJson(data.observations),
        reasoningMemory: toPrismaJson(data.reasoningMemory),
        toolInvocationHistory: toPrismaJson(data.toolInvocationHistory),
        budgetSnapshot: toPrismaJson(data.budgetSnapshot),
        status: this.toPrismaStatus(status),
        reason: data.reason,
      },
      select: { id: true },
    });
    await this.prisma.researchTask
      .update({
        where: { id: taskId },
        data: { lastCheckpointId: cp.id },
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `[save] update lastCheckpointId failed for task=${taskId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    return cp.id;
  }

  async loadLatest(taskId: string): Promise<CheckpointData | null> {
    const cp = await this.prisma.taskCheckpoint.findFirst({
      where: { taskId },
      orderBy: { createdAt: "desc" },
    });
    if (!cp) return null;
    return {
      iteration: cp.iteration,
      stepIndex: cp.stepIndex,
      observations:
        cp.observations as unknown as CheckpointData["observations"],
      reasoningMemory:
        cp.reasoningMemory as unknown as CheckpointData["reasoningMemory"],
      toolInvocationHistory:
        cp.toolInvocationHistory as unknown as CheckpointData["toolInvocationHistory"],
      budgetSnapshot:
        cp.budgetSnapshot as unknown as CheckpointData["budgetSnapshot"],
      reason: cp.reason ?? undefined,
    };
  }

  async clear(taskId: string): Promise<void> {
    await this.prisma.taskCheckpoint.deleteMany({ where: { taskId } });
  }

  /** harness 通用状态 → ResearchTaskStatus enum */
  private toPrismaStatus(s: TaskStatus): ResearchTaskStatus {
    return s as ResearchTaskStatus; // 枚举字面值已对齐
  }
}
