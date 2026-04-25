/**
 * MissionStore — agent-playground mission 持久化
 *
 * 启动 mission 时插入 record (status=running)，完成/失败时 update。
 * 列表页 / detail 页查询用。
 */

import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";

export interface MissionListItem {
  id: string;
  topic: string;
  depth: string;
  language: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  wallTimeMs: number | null;
  finalScore: number | null;
  tokensUsed: number | null;
  costUsd: number | null;
  reportTitle: string | null;
  reportSummary: string | null;
  errorMessage: string | null;
}

export interface MissionDetail extends MissionListItem {
  themeSummary: string | null;
  dimensions: unknown;
  reportFull: unknown;
  verdicts: unknown;
  trajectoryStored: number | null;
}

@Injectable()
export class MissionStore {
  private readonly log = new Logger(MissionStore.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    id: string;
    userId: string;
    workspaceId?: string;
    topic: string;
    depth: string;
    language: string;
    maxCredits: number;
  }): Promise<void> {
    await this.prisma.agentPlaygroundMission
      .create({
        data: {
          id: input.id,
          userId: input.userId,
          workspaceId: input.workspaceId,
          topic: input.topic.slice(0, 500),
          depth: input.depth,
          language: input.language,
          maxCredits: input.maxCredits,
          status: "running",
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[create] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * 启动恢复：把所有 status='running' 但已经超过 maxAgeMinutes 的 mission
   * 标记为 failed（Railway 重启后 in-memory orchestrator 已死，但 DB 还停在 running）
   */
  async recoverOrphanedRunning(maxAgeMinutes = 30): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000);
    const result = await this.prisma.agentPlaygroundMission
      .updateMany({
        where: {
          status: "running",
          startedAt: { lt: cutoff },
        },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage:
            "Mission orphaned - service recycled during execution; in-memory state lost.",
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[recoverOrphanedRunning] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return { count: 0 };
      });
    if (result.count > 0) {
      this.log.warn(
        `[recoverOrphanedRunning] marked ${result.count} orphaned running missions as failed`,
      );
    }
    return result.count;
  }

  async markCompleted(
    id: string,
    data: {
      finalScore?: number;
      tokensUsed?: number;
      costUsd?: number;
      trajectoryStored?: number;
      wallTimeMs?: number;
      themeSummary?: string;
      dimensions?: unknown;
      report?: { title?: string; summary?: string; [k: string]: unknown };
      verdicts?: unknown;
    },
  ): Promise<void> {
    const update: Prisma.AgentPlaygroundMissionUpdateInput = {
      status: "completed",
      completedAt: new Date(),
      finalScore: data.finalScore ?? null,
      tokensUsed: data.tokensUsed ?? null,
      costUsd: data.costUsd ?? null,
      trajectoryStored: data.trajectoryStored ?? null,
      wallTimeMs: data.wallTimeMs ?? null,
      themeSummary: data.themeSummary ?? null,
      dimensions: (data.dimensions ?? null) as Prisma.InputJsonValue,
      reportFull: (data.report ?? null) as Prisma.InputJsonValue,
      verdicts: (data.verdicts ?? null) as Prisma.InputJsonValue,
      reportTitle: data.report?.title?.slice(0, 500) ?? null,
      reportSummary: data.report?.summary ?? null,
    };
    await this.prisma.agentPlaygroundMission
      .update({ where: { id }, data: update })
      .catch((err: unknown) => {
        this.log.warn(
          `[markCompleted ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async markFailed(
    id: string,
    data: {
      errorMessage?: string;
      tokensUsed?: number;
      costUsd?: number;
      wallTimeMs?: number;
    },
  ): Promise<void> {
    await this.prisma.agentPlaygroundMission
      .update({
        where: { id },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage: data.errorMessage?.slice(0, 2000) ?? null,
          tokensUsed: data.tokensUsed ?? null,
          costUsd: data.costUsd ?? null,
          wallTimeMs: data.wallTimeMs ?? null,
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[markFailed ${id}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async listByUser(userId: string, limit = 50): Promise<MissionListItem[]> {
    const rows = await this.prisma.agentPlaygroundMission.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
      select: {
        id: true,
        topic: true,
        depth: true,
        language: true,
        status: true,
        startedAt: true,
        completedAt: true,
        wallTimeMs: true,
        finalScore: true,
        tokensUsed: true,
        costUsd: true,
        reportTitle: true,
        reportSummary: true,
        errorMessage: true,
      },
    });
    return rows;
  }

  async getById(id: string, userId: string): Promise<MissionDetail | null> {
    const row = await this.prisma.agentPlaygroundMission.findFirst({
      where: { id, userId },
    });
    if (!row) return null;
    return {
      id: row.id,
      topic: row.topic,
      depth: row.depth,
      language: row.language,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      wallTimeMs: row.wallTimeMs,
      finalScore: row.finalScore,
      tokensUsed: row.tokensUsed,
      costUsd: row.costUsd,
      reportTitle: row.reportTitle,
      reportSummary: row.reportSummary,
      errorMessage: row.errorMessage,
      themeSummary: row.themeSummary,
      dimensions: row.dimensions,
      reportFull: row.reportFull,
      verdicts: row.verdicts,
      trajectoryStored: row.trajectoryStored,
    };
  }
}
