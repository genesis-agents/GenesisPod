/**
 * Activity Writer Helper — 直接写 researchAgentActivity 表
 *
 * 设计：所有 stage 内部循环（per-dim / per-section）调用此 helper，
 * 让前端 GET /agent-activities 看到每个维度、每个章节的真实活动轨迹。
 *
 * 必须直写 Prisma 不走 EventEmitter（emitter 服务在 topic-insights.module
 * 注册，不在 PipelineModule scope，会注入 undefined 导致静默 short-circuit
 * — 这是 2026-04-25 production 线上 activities=0 的根因）。
 */

import { Logger } from "@nestjs/common";
import type { PrismaService } from "@/common/prisma/prisma.service";

const logger = new Logger("ActivityWriter");

export type ActivityRole = "leader" | "researcher" | "reviewer" | "synthesizer";

export type ActivityStatus =
  | "RESEARCHING"
  | "THINKING"
  | "COMPLETED"
  | "FAILED";

export interface WriteActivityParams {
  readonly topicId: string;
  readonly missionId: string;
  readonly agentId: string;
  readonly agentName: string;
  readonly agentRole: ActivityRole;
  readonly status: ActivityStatus;
  readonly content: string;
  readonly progress?: number;
  readonly dimensionId?: string;
  readonly dimensionName?: string;
  readonly searchResults?: Record<string, unknown>;
  readonly thinkingPhase?: string;
  readonly actionTaken?: string;
}

/**
 * 写一条 researchAgentActivity。失败仅记 logger.error，不抛
 * （活动写入失败不应阻断主 pipeline；但用 error level 让运维立即看到）。
 */
export async function writeActivity(
  prisma: PrismaService,
  params: WriteActivityParams,
): Promise<void> {
  try {
    await prisma.researchAgentActivity.create({
      data: {
        topicId: params.topicId,
        missionId: params.missionId,
        agentId: params.agentId,
        agentName: params.agentName,
        agentRole: params.agentRole,
        activityType: params.status,
        content: params.content.slice(0, 4000),
        progress: params.progress ?? 0,
        dimensionId: params.dimensionId,
        dimensionName: params.dimensionName,
        searchResults: params.searchResults
          ? (JSON.parse(JSON.stringify(params.searchResults)) as never)
          : undefined,
        thinkingPhase: params.thinkingPhase,
        actionTaken: params.actionTaken,
      },
    });
  } catch (err) {
    logger.error(
      `[${params.missionId}] writeActivity failed agent=${params.agentId} status=${params.status}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
