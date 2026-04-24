/**
 * PrismaStepStore — AgentStep 持久化实现（topic-insights 专属）
 *
 * 归属：L3 ai-app/topic-insights/agent/adapters/
 *
 * 把 harness 通用 AgentStepRecord 转成 topic-insights 的 `agent_steps` 表行
 * （带 missionId/topicId/dimensionId 业务字段）。
 */

import { Injectable } from "@nestjs/common";
import { Prisma, type AgentStepType as PrismaStepType } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import type {
  StepStore,
  AgentStepRecord,
  AgentStepType,
} from "@/modules/ai-engine/harness/runtime";
import type { ResearchTaskMetadata } from "./research-task-metadata";

@Injectable()
export class PrismaStepStore implements StepStore {
  constructor(private readonly prisma: PrismaService) {}

  async write(
    record: AgentStepRecord,
    metadata: Record<string, unknown>,
  ): Promise<string> {
    const meta = metadata as ResearchTaskMetadata;
    const row = await this.prisma.agentStep.create({
      data: {
        taskId: record.taskId,
        missionId: meta.missionId,
        topicId: meta.topicId,
        iteration: record.iteration,
        stepIndex: record.stepIndex,
        stepType: this.toPrismaStepType(record.stepType),
        content: record.content,
        structuredData:
          record.structuredData !== undefined
            ? toPrismaJson(record.structuredData)
            : undefined,
        modelId: record.modelId,
        promptTokens: record.promptTokens,
        completionTokens: record.completionTokens,
        costUsd:
          record.costUsd != null
            ? new Prisma.Decimal(record.costUsd)
            : undefined,
        toolName: record.toolName,
        toolArgs: record.toolArgs ? toPrismaJson(record.toolArgs) : undefined,
        toolResult:
          record.toolResult !== undefined
            ? toPrismaJson(record.toolResult)
            : undefined,
        toolLatencyMs: record.toolLatencyMs,
        toolSuccess: record.toolSuccess,
        traceId: record.traceId,
        spanId: record.spanId,
        parentSpanId: record.parentSpanId,
      },
      select: { id: true },
    });
    return row.id;
  }

  async nextStepIndex(taskId: string, iteration: number): Promise<number> {
    const agg = await this.prisma.agentStep.aggregate({
      where: { taskId, iteration },
      _max: { stepIndex: true },
    });
    return (agg._max.stepIndex ?? -1) + 1;
  }

  /** harness 通用 step type → Prisma enum */
  private toPrismaStepType(t: AgentStepType): PrismaStepType {
    return t as PrismaStepType; // enum 字面值已对齐
  }
}
