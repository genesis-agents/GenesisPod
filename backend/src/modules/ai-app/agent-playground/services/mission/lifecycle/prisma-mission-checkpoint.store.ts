/**
 * PrismaMissionCheckpointStore — playground 的 MissionCheckpointStore 实现
 *
 * 实现策略：复用 AgentPlaygroundMission 表，把 checkpoint 数据塞到
 * leaderJournal JSONB 字段下的保留 key `__checkpoint`，避免新建表。
 *
 * 与 ai-harness/process/checkpoint 的 MissionCheckpointStore 接口对齐。
 *
 * Phase 5 (2026-04-29) 接入：让 mission 中断后下次启动时可从 checkpoint 恢复。
 */

import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import type {
  MissionCheckpointSnapshot,
  MissionCheckpointStore,
} from "@/modules/ai-harness/facade";

/** leaderJournal 中的保留 key */
const CHECKPOINT_KEY = "__checkpoint";

interface PersistedCheckpoint<TPayload> {
  savedAt: string; // ISO
  payload: TPayload;
  completedKeys: string[];
  status: MissionCheckpointSnapshot["status"];
}

@Injectable()
export class PrismaMissionCheckpointStore<
  TPayload = unknown,
> implements MissionCheckpointStore<TPayload> {
  private readonly log = new Logger(PrismaMissionCheckpointStore.name);

  constructor(private readonly prisma: PrismaService) {}

  async save(snapshot: MissionCheckpointSnapshot<TPayload>): Promise<void> {
    const persisted: PersistedCheckpoint<TPayload> = {
      savedAt: snapshot.savedAt.toISOString(),
      payload: snapshot.payload,
      completedKeys: snapshot.completedKeys,
      status: snapshot.status,
    };
    // 读 → merge → 写（与 appendLeaderJournal 同模式，避免覆盖其他 key）
    const row = await this.prisma.agentPlaygroundMission
      .findUnique({
        where: { id: snapshot.missionId },
        select: { leaderJournal: true },
      })
      .catch(() => null);
    if (!row) {
      this.log.warn(
        `[checkpoint.save ${snapshot.missionId}] mission not found, skipping`,
      );
      return;
    }
    const current = (row.leaderJournal as Record<string, unknown> | null) ?? {};
    const merged = { ...current, [CHECKPOINT_KEY]: persisted };
    await this.prisma.agentPlaygroundMission
      .update({
        where: { id: snapshot.missionId },
        data: { leaderJournal: merged as unknown as Prisma.InputJsonValue },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[checkpoint.save ${snapshot.missionId}] update failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async load(
    missionId: string,
  ): Promise<MissionCheckpointSnapshot<TPayload> | null> {
    const row = await this.prisma.agentPlaygroundMission
      .findUnique({
        where: { id: missionId },
        select: { leaderJournal: true },
      })
      .catch(() => null);
    if (!row) return null;
    const journal = (row.leaderJournal as Record<string, unknown> | null) ?? {};
    const persisted = journal[CHECKPOINT_KEY] as
      | PersistedCheckpoint<TPayload>
      | undefined;
    if (!persisted) return null;
    return {
      missionId,
      savedAt: new Date(persisted.savedAt),
      payload: persisted.payload,
      completedKeys: persisted.completedKeys ?? [],
      status: persisted.status,
    };
  }

  async clear(missionId: string): Promise<void> {
    const row = await this.prisma.agentPlaygroundMission
      .findUnique({
        where: { id: missionId },
        select: { leaderJournal: true },
      })
      .catch(() => null);
    if (!row) return;
    const journal = (row.leaderJournal as Record<string, unknown> | null) ?? {};
    if (!(CHECKPOINT_KEY in journal)) return;
    const next = { ...journal };
    delete next[CHECKPOINT_KEY];
    await this.prisma.agentPlaygroundMission
      .update({
        where: { id: missionId },
        data: { leaderJournal: next as Prisma.InputJsonValue },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[checkpoint.clear ${missionId}] update failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async listResumable(
    userId: string,
    olderThan?: Date,
  ): Promise<MissionCheckpointSnapshot<TPayload>[]> {
    // 仅 status=running 的 mission 有 checkpoint 可恢复语义
    const cutoff = olderThan ?? new Date(0);
    const rows = await this.prisma.agentPlaygroundMission
      .findMany({
        where: {
          userId,
          status: "running",
          startedAt: { gte: cutoff },
        },
        select: { id: true, leaderJournal: true },
        take: 50,
        orderBy: { startedAt: "desc" },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[checkpoint.listResumable user=${userId}] query failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [] as { id: string; leaderJournal: unknown }[];
      });

    const out: MissionCheckpointSnapshot<TPayload>[] = [];
    for (const row of rows) {
      const journal =
        (row.leaderJournal as Record<string, unknown> | null) ?? {};
      const persisted = journal[CHECKPOINT_KEY] as
        | PersistedCheckpoint<TPayload>
        | undefined;
      if (!persisted) continue;
      out.push({
        missionId: row.id,
        savedAt: new Date(persisted.savedAt),
        payload: persisted.payload,
        completedKeys: persisted.completedKeys ?? [],
        status: persisted.status,
      });
    }
    return out;
  }
}
