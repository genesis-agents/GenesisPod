/**
 * SocialMissionStore — SocialPublishMission lifecycle 持久化适配
 *
 * 当前 v1 (W4 PR-4b) 暂无 Prisma SocialMission schema —— store 走内存 +
 * fire-and-forget log（保证 framework 接口契约满足，避免空 adapter 让
 * MissionRuntimeShellFramework 启动失败）。
 *
 * 后续 W5 真发回归通过后落 Prisma SocialMission 表，把 in-memory record
 * 迁到 DB 即可（接口契约不变）。
 *
 * Mirror of agent-playground/services/mission/lifecycle/mission-store.service.ts，
 * 只保留 framework 必需的最小子集：create / refreshHeartbeat。
 */

import { Injectable, Logger } from "@nestjs/common";

interface SocialMissionRecord {
  readonly id: string;
  readonly userId: string;
  readonly workspaceId?: string;
  readonly contentId: string;
  readonly platforms: readonly string[];
  readonly maxCredits: number;
  readonly startedAt: number;
  heartbeatAt: number;
  podId: string;
  status: "running" | "completed" | "failed" | "aborted";
  errorMessage?: string;
}

@Injectable()
export class SocialMissionStore {
  private readonly log = new Logger(SocialMissionStore.name);
  private readonly records = new Map<string, SocialMissionRecord>();

  async create(args: {
    id: string;
    userId: string;
    workspaceId?: string;
    contentId: string;
    platforms: readonly string[];
    maxCredits: number;
  }): Promise<void> {
    const now = Date.now();
    this.records.set(args.id, {
      id: args.id,
      userId: args.userId,
      workspaceId: args.workspaceId,
      contentId: args.contentId,
      platforms: [...args.platforms],
      maxCredits: args.maxCredits,
      startedAt: now,
      heartbeatAt: now,
      podId: process.env.RAILWAY_REPLICA_ID ?? process.env.HOSTNAME ?? "local",
      status: "running",
    });
    this.log.log(
      `[create] mission=${args.id} user=${args.userId} platforms=${args.platforms.join(",")} maxCredits=${args.maxCredits}`,
    );
  }

  async refreshHeartbeat(missionId: string, podId: string): Promise<void> {
    const rec = this.records.get(missionId);
    if (!rec) return;
    rec.heartbeatAt = Date.now();
    rec.podId = podId;
  }

  async markCompleted(
    missionId: string,
    detail?: { tokensUsed?: number; costUsd?: number; wallTimeMs?: number },
  ): Promise<void> {
    const rec = this.records.get(missionId);
    if (!rec) return;
    rec.status = "completed";
    this.log.log(
      `[markCompleted] mission=${missionId} wallTime=${detail?.wallTimeMs ?? 0}ms tokens=${detail?.tokensUsed ?? 0}`,
    );
  }

  async markFailed(
    missionId: string,
    detail: { errorMessage: string; wallTimeMs?: number },
  ): Promise<void> {
    const rec = this.records.get(missionId);
    if (!rec) return;
    rec.status = "failed";
    rec.errorMessage = detail.errorMessage;
    this.log.warn(
      `[markFailed] mission=${missionId}: ${detail.errorMessage.slice(0, 200)}`,
    );
  }

  getById(missionId: string): SocialMissionRecord | undefined {
    return this.records.get(missionId);
  }

  /** Ownership lookup（gateway join 时核对） */
  getOwner(missionId: string): string | undefined {
    return this.records.get(missionId)?.userId;
  }
}
