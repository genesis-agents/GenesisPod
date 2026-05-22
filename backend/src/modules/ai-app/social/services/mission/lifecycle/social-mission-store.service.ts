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
  /** ★ C4/G5：实测耗时(原 wallTimeMs,与配置上限二义→改名)。 */
  elapsedWallTimeMs?: number;
  trajectory?: Prisma.InputJsonValue;
}

export interface MarkFailedDetail {
  errorMessage: string;
  tokensUsed?: number;
  costUsd?: number;
  /** ★ C4/G5：实测耗时(原 wallTimeMs)。 */
  elapsedWallTimeMs?: number;
  /** ★ C2/G3：canonical MissionFailureCode 值，落 DB failure_code 列。 */
  failureCode?: string;
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
    // ★ C0/T16：条件写 WHERE status='running'(原 update by id 无条件,会 clobber 已被
    //   cancel/liveness 终结的 mission)。首写赢:已终态则本次 no-op,不覆盖首写原因。
    await this.prisma.socialMission
      .updateMany({
        where: { id: missionId, status: "running" },
        data: {
          status: "completed",
          completedAt: new Date(),
          tokensUsed:
            detail?.tokensUsed != null ? BigInt(detail.tokensUsed) : null,
          costUsd: detail?.costUsd ?? null,
          elapsedWallTimeMs: detail?.elapsedWallTimeMs ?? null,
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
    // ★ C0/T16：条件写 WHERE status='running'(原 update by id 无条件,有 TOCTOU——
    //   会覆盖刚 markCompleted/markCancelled 的 mission)。首写赢:已终态则 no-op。
    await this.prisma.socialMission
      .updateMany({
        where: { id: missionId, status: "running" },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage: detail.errorMessage.slice(0, 4000),
          failureCode: detail.failureCode ?? null,
          tokensUsed:
            detail.tokensUsed != null ? BigInt(detail.tokensUsed) : null,
          costUsd: detail.costUsd ?? null,
          elapsedWallTimeMs: detail.elapsedWallTimeMs ?? null,
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[markFailed] mission=${missionId} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * Liveness 扫描用：列出所有 running mission 的存活字段。
   * 供 AiSocialModule onModuleInit 注册的 MissionLivenessGuard adapter 调用——
   * ★ 2026-05-22 C8：social_missions 早有 heartbeatAt/podId + [status,heartbeatAt] 索引，
   *   但此前从未注册 liveness adapter，孤儿 running 行永不回收。本方法 + 注册补上扫描链。
   */
  async fetchRunningForLiveness(): Promise<
    Array<{
      id: string;
      userId: string;
      startedAt: Date;
      heartbeatAt: Date | null;
    }>
  > {
    return this.prisma.socialMission.findMany({
      where: { status: "running" },
      select: { id: true, userId: true, startedAt: true, heartbeatAt: true },
      take: 200,
    });
  }

  /**
   * Liveness 回收专用 markFailed —— 用 updateMany + WHERE status='running' 条件写，
   * 避免与刚 markCompleted 的 mission 抢写（既有 markFailed 是无条件 update by id，
   * 有 TOCTOU；C0/G1 会把终态写统一收口到 MissionLifecycleManager 单入口仲裁）。
   */
  async markFailedByLiveness(
    missionId: string,
    errorMessage: string,
    failureCode?: string,
  ): Promise<void> {
    await this.prisma.socialMission
      .updateMany({
        where: { id: missionId, status: "running" },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage: errorMessage.slice(0, 4000),
          // ★ C2/MAJOR-4:liveness 回收落 canonical failureCode(此前为 NULL)。
          failureCode: failureCode ?? null,
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[markFailedByLiveness] mission=${missionId} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
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

  /**
   * 记录 SocialPublishLog —— admin 历史日志 / 审计 / 排错入口
   *
   * 2026-05-17 PR-6：W4 mission pipeline 接管发布后，老 publish-executor
   * .execute() 路径里的 socialPublishLog.create 被绕过；S8 stage 必须显式补写
   * 才能让 admin 在内容详情 / 后台日志页继续看到逐平台真发结果。
   *
   * 写日志失败仅 warn（业务不阻断 —— 发布动作的真实成败靠 socialContent.status
   * + mission trajectory 兜底）。
   */
  async recordPublishLog(args: {
    contentId: string;
    action: "PUBLISH" | "SCHEDULE" | "CANCEL" | "RETRY";
    status: "SUCCESS" | "FAILED" | "PENDING";
    details?: Prisma.InputJsonValue;
    errorMessage?: string;
  }): Promise<void> {
    await this.prisma.socialPublishLog
      .create({
        data: {
          contentId: args.contentId,
          action: args.action,
          status: args.status,
          details: args.details,
          errorMessage: args.errorMessage?.slice(0, 4000),
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[recordPublishLog] content=${args.contentId} action=${args.action} status=${args.status} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
}
