/**
 * ResearchTaskStore — AgentTask 业务行状态同步（topic-insights 专属）
 *
 * 归属：L3 ai-app/topic-insights/agent/adapters/
 *
 * 把 harness 通用 TaskStore 调用落到 `research_tasks` 表。
 */

import { Injectable } from "@nestjs/common";
import { Prisma, type ResearchTaskStatus } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import type {
  TaskStore,
  AgentTask,
  TaskStatus,
} from "@/modules/ai-engine/harness/runtime";
import type { ResearchTaskMetadata } from "./research-task-metadata";

@Injectable()
export class ResearchTaskStore implements TaskStore<ResearchTaskMetadata> {
  constructor(private readonly prisma: PrismaService) {}

  async load(taskId: string): Promise<AgentTask<ResearchTaskMetadata> | null> {
    const row = await this.prisma.researchTask.findUnique({
      where: { id: taskId },
      include: { mission: { select: { topicId: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      type: row.taskType,
      title: row.title,
      description: row.description,
      input: {
        skills: row.skills,
        tools: row.tools,
        modelId: row.modelId,
      },
      currentIteration: row.currentIteration,
      maxIterations: row.maxIterations,
      retryCount: row.retryCount,
      maxRetries: row.maxRetries,
      metadata: {
        missionId: row.missionId,
        topicId: row.mission.topicId,
        dimensionId: row.dimensionId ?? undefined,
        dimensionName: row.dimensionName ?? undefined,
        parentTaskId: row.parentTaskId ?? undefined,
        assignedAgent: row.assignedAgent,
        assignedAgentType: row.assignedAgentType ?? undefined,
        modelId: row.modelId ?? undefined,
        skills: row.skills,
        tools: row.tools,
        priority: row.priority,
        dependencies: row.dependencies,
      },
    };
  }

  async updateStatus(
    taskId: string,
    status: TaskStatus,
    extra?: {
      startedAt?: Date;
      completedAt?: Date;
      pausedAt?: Date;
      resumedAt?: Date;
      requiresRevision?: boolean;
      resultSummary?: string;
    },
  ): Promise<void> {
    await this.prisma.researchTask.update({
      where: { id: taskId },
      data: {
        status: this.toPrismaStatus(status),
        startedAt: extra?.startedAt,
        completedAt: extra?.completedAt,
        pausedAt: extra?.pausedAt,
        resumedAt: extra?.resumedAt,
        requiresRevision: extra?.requiresRevision,
        resultSummary: extra?.resultSummary,
      },
    });
  }

  async updateProgress(
    taskId: string,
    data: {
      currentIteration?: number;
      tokensUsed?: number;
      costUsd?: number;
      latencyMs?: number;
      lastCheckpointId?: string;
    },
  ): Promise<void> {
    await this.prisma.researchTask.update({
      where: { id: taskId },
      data: {
        currentIteration: data.currentIteration,
        tokensUsed: data.tokensUsed,
        costUsd:
          data.costUsd != null ? new Prisma.Decimal(data.costUsd) : undefined,
        latencyMs: data.latencyMs,
        lastCheckpointId: data.lastCheckpointId,
      },
    });
  }

  async writeResult(
    taskId: string,
    data: { result: unknown; resultScore?: number; resultSummary?: string },
  ): Promise<void> {
    await this.prisma.researchTask.update({
      where: { id: taskId },
      data: {
        result: toPrismaJson(data.result),
        resultScore: data.resultScore,
        resultSummary: data.resultSummary,
      },
    });
  }

  async markForRetry(taskId: string): Promise<void> {
    // retryCount +1，重置 iter，status → QUEUED 等待重新 dequeue
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.researchTask.findUnique({
        where: { id: taskId },
        select: { retryCount: true },
      });
      if (!t) return;
      await tx.researchTask.update({
        where: { id: taskId },
        data: {
          retryCount: t.retryCount + 1,
          currentIteration: 0,
          status: "QUEUED",
          requiresRevision: true,
          queuedAt: new Date(),
        },
      });
    });
  }

  private toPrismaStatus(s: TaskStatus): ResearchTaskStatus {
    return s as ResearchTaskStatus;
  }
}
