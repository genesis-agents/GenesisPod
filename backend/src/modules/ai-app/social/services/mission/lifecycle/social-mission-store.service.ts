/**
 * SocialMissionStore — SocialPublishMission lifecycle 持久化（Prisma 真实现）
 *
 * 2026-05-16 round-2-followup：从 in-memory map 升级到 Prisma social_missions
 * 表持久化。Reviewer A P1-A3 持票项已闭环 —— pod restart 不再丢 mission，
 * trajectory 可查、retry/cascade rerun 有数据基础。
 *
 * 与 AgentPlaygroundMission store 形态一致；差异：
 *   - 无 leaderJournal / reportArtifact / dimensions / verdicts 等 research 业务字段
 *   - 多 contentId / platforms / connectionIds 等社交业务字段
 *   - trajectory JSON 字段在 S11 阶段统一写一次（无增量 partial 写）
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import type { Prisma } from "@prisma/client";

export interface CreateSocialMissionArgs {
  id: string;
  userId: string;
  workspaceId?: string;
  contentId: string;
  platforms: readonly string[];
  connectionIds: Readonly<Record<string, string>>;
  depth: string;
  budgetProfile: string;
  language: string;
  maxCredits: number;
}

export interface MarkCompletedDetail {
  tokensUsed?: number;
  costUsd?: number;
  wallTimeMs?: number;
  trajectory?: Prisma.InputJsonValue;
}

export interface MarkFailedDetail {
  errorMessage: string;
  tokensUsed?: number;
  costUsd?: number;
  wallTimeMs?: number;
}

@Injectable()
export class SocialMissionStore {
  private readonly log = new Logger(SocialMissionStore.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(args: CreateSocialMissionArgs): Promise<void> {
    const podId =
      process.env.RAILWAY_REPLICA_ID ?? process.env.HOSTNAME ?? "local";
    await this.prisma.socialMission.create({
      data: {
        id: args.id,
        userId: args.userId,
        workspaceId: args.workspaceId,
        contentId: args.contentId,
        platforms: [...args.platforms],
        connectionIds: args.connectionIds as Prisma.InputJsonValue,
        depth: args.depth,
        budgetProfile: args.budgetProfile,
        language: args.language,
        maxCredits: args.maxCredits,
        status: "running",
        podId,
        heartbeatAt: new Date(),
      },
    });
    this.log.log(
      `[create] mission=${args.id} user=${args.userId} platforms=${args.platforms.join(",")} maxCredits=${args.maxCredits}`,
    );
  }

  async refreshHeartbeat(missionId: string, podId: string): Promise<void> {
    await this.prisma.socialMission
      .update({
        where: { id: missionId },
        data: { heartbeatAt: new Date(), podId },
      })
      .catch((err: unknown) => {
        // mission 可能已被清理 / orphan-cleanup 标 failed —— heartbeat 非致命
        this.log.warn(
          `[refreshHeartbeat] mission=${missionId} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async markCompleted(
    missionId: string,
    detail?: MarkCompletedDetail,
  ): Promise<void> {
    await this.prisma.socialMission
      .update({
        where: { id: missionId },
        data: {
          status: "completed",
          completedAt: new Date(),
          tokensUsed:
            detail?.tokensUsed != null ? BigInt(detail.tokensUsed) : null,
          costUsd: detail?.costUsd ?? null,
          wallTimeMs: detail?.wallTimeMs ?? null,
          trajectory: detail?.trajectory,
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[markCompleted] mission=${missionId} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async markFailed(missionId: string, detail: MarkFailedDetail): Promise<void> {
    await this.prisma.socialMission
      .update({
        where: { id: missionId },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage: detail.errorMessage.slice(0, 4000),
          tokensUsed:
            detail.tokensUsed != null ? BigInt(detail.tokensUsed) : null,
          costUsd: detail.costUsd ?? null,
          wallTimeMs: detail.wallTimeMs ?? null,
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[markFailed] mission=${missionId} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /** 写 S11 trajectory；与 markCompleted 解耦，让 S11 失败也能保留 partial trajectory */
  async saveTrajectory(
    missionId: string,
    trajectory: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.socialMission
      .update({
        where: { id: missionId },
        data: { trajectory },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[saveTrajectory] mission=${missionId} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /** Gateway join 时核对 ownership */
  async getOwner(missionId: string): Promise<string | undefined> {
    const row = await this.prisma.socialMission
      .findUnique({
        where: { id: missionId },
        select: { userId: true },
      })
      .catch(() => null);
    return row?.userId;
  }

  /** controller / detail 页查 mission 元信息 */
  async getById(missionId: string, userId: string) {
    return this.prisma.socialMission.findFirst({
      where: { id: missionId, userId },
    });
  }
}
