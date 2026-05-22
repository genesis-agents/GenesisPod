/**
 * RadarMissionStore —— RadarRun 表的 CRUD + mission lifecycle 状态机
 *
 * 与 agent-playground/MissionStore 同构（structural typing 满足
 * IBusinessTeamMissionStore），让 ai-harness liveness-guard / runtime-shell
 * 框架可以正常工作。
 *
 * 状态转换（VarChar 字段值，小写）：
 *   running    : create() 默认 / runtime-shell.openSession 写入
 *   completed  : markCompleted()
 *   failed     : markFailed()
 *   cancelled  : markCancelled()
 *   rejected   : markRejected()（budget 预检拒绝等）
 *
 * Liveness guard 扫描（harness）：where status='running' AND heartbeat_at<stale_cutoff
 */
import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma, RadarRun, RadarRunTrigger } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";

export type RadarMissionStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "rejected";

export interface RadarMissionCreateInput {
  readonly id: string;
  readonly topicId: string;
  readonly userId: string;
  readonly workspaceId?: string;
  readonly trigger: RadarRunTrigger;
  readonly maxCredits: number;
  readonly wallTimeMs: number;
  readonly payload: Record<string, unknown>;
}

@Injectable()
export class RadarMissionStore {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomic acquire run slot：同 topic 只能有 1 个 status='running' 的 mission。
   * 在事务内 inflight check + create，避免 controller race。
   *
   * @throws ConflictException 已有 inflight
   */
  async createAtomic(input: RadarMissionCreateInput): Promise<RadarRun> {
    return this.prisma.$transaction(async (tx) => {
      const inflight = await tx.radarRun.findFirst({
        where: { topicId: input.topicId, status: "running" },
        select: { id: true },
      });
      if (inflight) {
        throw new ConflictException({
          message: "已有 mission 正在执行",
          runId: inflight.id,
        });
      }
      return tx.radarRun.create({
        data: {
          id: input.id,
          topicId: input.topicId,
          userId: input.userId,
          workspaceId: input.workspaceId ?? null,
          status: "running",
          trigger: input.trigger,
          startedAt: new Date(),
          maxCredits: input.maxCredits,
          wallTimeMs: input.wallTimeMs,
          payload: input.payload as Prisma.InputJsonValue,
        },
      });
    });
  }

  async refreshHeartbeat(missionId: string, podId: string): Promise<void> {
    // 不存在的 mission 静默忽略 —— mission 可能已被 cleanup 删，liveness 定时器晚到
    await this.prisma.radarRun.updateMany({
      where: { id: missionId, status: "running" },
      data: { heartbeatAt: new Date(), podId },
    });
  }

  /**
   * Liveness 扫描用：列出所有 running mission 的存活字段。
   * 供 RadarModule onModuleInit 注册的 MissionLivenessGuard adapter 调用——
   * ★ 2026-05-22 C8：radar 之前漏注册 liveness adapter，heartbeatAt 写了没人扫 →
   *   孤儿 running 行永不回收。本方法 + 注册补上这条扫描链。
   */
  async fetchRunningForLiveness(): Promise<
    Array<{
      id: string;
      userId: string;
      startedAt: Date;
      heartbeatAt: Date | null;
    }>
  > {
    const rows = await this.prisma.radarRun.findMany({
      where: { status: "running" },
      select: { id: true, userId: true, startedAt: true, heartbeatAt: true },
      take: 200,
    });
    // startedAt 在 createAtomic 时必写，schema 列可空仅历史遗留 → 兜底 heartbeatAt/now
    return rows.map((r) => ({
      ...r,
      startedAt: r.startedAt ?? r.heartbeatAt ?? new Date(),
    }));
  }

  async markCompleted(
    missionId: string,
    metrics: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date();
    const run = await this.prisma.radarRun.findUnique({
      where: { id: missionId },
      select: { startedAt: true },
    });
    const startedAt = run?.startedAt ?? now;
    const durationMs = now.getTime() - startedAt.getTime();
    await this.prisma.radarRun.update({
      where: { id: missionId },
      data: {
        status: "completed",
        completedAt: now,
        durationMs,
        metrics: metrics as Prisma.InputJsonValue,
        error: null,
      },
    });
  }

  async markFailed(missionId: string, error: string): Promise<void> {
    const now = new Date();
    const run = await this.prisma.radarRun.findUnique({
      where: { id: missionId },
      select: { startedAt: true },
    });
    const startedAt = run?.startedAt ?? now;
    const durationMs = now.getTime() - startedAt.getTime();
    await this.prisma.radarRun.updateMany({
      where: { id: missionId, status: "running" },
      data: {
        status: "failed",
        completedAt: now,
        durationMs,
        error: error.slice(0, 4000),
      },
    });
  }

  async markCancelled(missionId: string, reason?: string): Promise<void> {
    const now = new Date();
    const run = await this.prisma.radarRun.findUnique({
      where: { id: missionId },
      select: { startedAt: true },
    });
    const startedAt = run?.startedAt ?? now;
    const durationMs = now.getTime() - startedAt.getTime();
    await this.prisma.radarRun.updateMany({
      where: { id: missionId, status: "running" },
      data: {
        status: "cancelled",
        completedAt: now,
        durationMs,
        error: reason?.slice(0, 4000) ?? null,
      },
    });
  }

  /**
   * Mark mission rejected — budget 预检拒绝 / 入口限额 / framework 层 reject。
   *
   * 2026-05-17 R3 评审 P0：JSDoc 第 13 行声明该方法存在，但实现缺失，导致
   * framework 真的 reject 时 dispatcher 无对应 store 方法可调，mission 行
   * 永远卡 status='running'，只能等 liveness guard 强制 fail。
   * markRejected 不消耗用户额度（已 reject = 没真跑），故 metrics/error 简记。
   */
  async markRejected(missionId: string, reason: string): Promise<void> {
    const now = new Date();
    const run = await this.prisma.radarRun.findUnique({
      where: { id: missionId },
      select: { startedAt: true },
    });
    const startedAt = run?.startedAt ?? now;
    const durationMs = now.getTime() - startedAt.getTime();
    await this.prisma.radarRun.updateMany({
      where: { id: missionId, status: "running" },
      data: {
        status: "rejected",
        completedAt: now,
        durationMs,
        error: reason.slice(0, 4000),
      },
    });
  }

  async getById(missionId: string, userId: string): Promise<RadarRun | null> {
    const row = await this.prisma.radarRun.findUnique({
      where: { id: missionId },
    });
    if (!row) return null;
    if (row.userId !== userId) return null;
    return row;
  }

  /**
   * 列出 topic 下的 mission 历史。必须传 userId，防 controller / 上层调用方
   * 误用绕过 ownership（reviewer P0 整改）。
   * 同时 select 排除 payload 字段（含用户输入快照，audit 列表不需要）。
   */
  async listByTopic(
    topicId: string,
    userId: string,
    limit = 20,
  ): Promise<RadarRun[]> {
    return this.prisma.radarRun.findMany({
      where: { topicId, userId },
      orderBy: { startedAt: "desc" },
      take: Math.min(limit, 100),
    });
  }

  async updateLastCompletedStage(
    missionId: string,
    stage: number,
  ): Promise<void> {
    await this.prisma.radarRun.updateMany({
      where: { id: missionId, status: "running" },
      data: { lastCompletedStage: stage },
    });
  }

  async updateMetrics(
    missionId: string,
    metrics: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.radarRun.update({
      where: { id: missionId },
      data: { metrics: metrics as Prisma.InputJsonValue },
    });
  }
}
