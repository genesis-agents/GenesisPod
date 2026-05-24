/**
 * PrismaMissionCheckpointStore — playground 的 MissionCheckpointStore 实现
 *
 * 实现策略：复用 AgentPlaygroundMission 表，把 checkpoint 数据塞到
 * leaderJournal JSONB 字段下的保留 key `__checkpoint`，避免新建表。
 *
 * 与 ai-harness/memory/mission-checkpoint 的 MissionCheckpointStore 接口对齐。
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
export const CHECKPOINT_KEY = "__checkpoint";

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

  // ★ P0-R5-4 (2026-04-30): 累积 save 失败计数到 mission 级。第 N 次失败时
  //   emit 信号让 orchestrator/UI 看到"checkpoint 持久化已废"。
  private readonly saveFailures = new Map<string, number>();
  private static readonly DEGRADED_THRESHOLD = 3;

  constructor(private readonly prisma: PrismaService) {}

  /** 暴露给 orchestrator：本 mission 累计 save 失败次数 */
  getSaveFailures(missionId: string): number {
    return this.saveFailures.get(missionId) ?? 0;
  }
  isDegraded(missionId: string): boolean {
    return (
      this.getSaveFailures(missionId) >=
      PrismaMissionCheckpointStore.DEGRADED_THRESHOLD
    );
  }
  resetSaveFailures(missionId: string): void {
    this.saveFailures.delete(missionId);
  }

  async save(snapshot: MissionCheckpointSnapshot<TPayload>): Promise<void> {
    const persisted: PersistedCheckpoint<TPayload> = {
      savedAt: snapshot.savedAt.toISOString(),
      payload: snapshot.payload,
      completedKeys: snapshot.completedKeys,
      status: snapshot.status,
    };
    // ★ P1-R5-A (2026-04-30): 用 PostgreSQL jsonb_set 原子 update，避免与
    //   appendLeaderJournal 并发时 read-modify-write 互覆盖。COALESCE 处理 null。
    try {
      // ★ 2026-04-30 fix: 用 DB 实际表名 agent_playground_missions / leader_journal
      // （之前用了 Prisma model 名 PascalCase 触发 relation does not exist。
      //  Prisma model AgentPlaygroundMission @@map "agent_playground_missions"，
      //  field leaderJournal @map "leader_journal"，raw SQL 必须用 mapped 实名。）
      await this.prisma.$executeRaw`
        UPDATE agent_playground_missions
        SET leader_journal = jsonb_set(
          COALESCE(leader_journal, '{}'::jsonb),
          '{__checkpoint}',
          ${JSON.stringify(persisted)}::jsonb,
          true
        )
        WHERE id = ${snapshot.missionId}
      `;
      this.saveFailures.delete(snapshot.missionId);
    } catch (err) {
      const count = (this.saveFailures.get(snapshot.missionId) ?? 0) + 1;
      this.saveFailures.set(snapshot.missionId, count);
      this.log.warn(
        `[checkpoint.save ${snapshot.missionId}] update failed (#${count}): ${err instanceof Error ? err.message : String(err)}`,
      );
      if (count === PrismaMissionCheckpointStore.DEGRADED_THRESHOLD) {
        this.log.error(
          `[checkpoint.save ${snapshot.missionId}] DEGRADED — ${count} consecutive failures; mission resume capability lost`,
        );
      }
    }
  }

  async load(
    missionId: string,
  ): Promise<MissionCheckpointSnapshot<TPayload> | null> {
    const row = await this.prisma.agentPlaygroundMission
      .findUnique({
        where: { id: missionId },
        // 2026-05-13 #40: leaderJournalUri 必须配套 select，否则 PrismaService
        // hydrate hook 会 warn "select contains JSON 'leaderJournal' but not
        // 'leaderJournalUri'. Off-loaded content will be empty."
        select: { leaderJournal: true, leaderJournalUri: true },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[checkpoint.load ${missionId}] findUnique failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      });
    if (!row) return null;
    const journal = (row.leaderJournal as Record<string, unknown> | null) ?? {};
    const persisted = journal[CHECKPOINT_KEY] as
      | PersistedCheckpoint<TPayload>
      | undefined;
    if (!persisted) return null;
    // ★ P1-R5-B (2026-04-30): savedAt 被外部脚本污染为非 ISO string 时
    //   new Date(invalid).getTime()=NaN → ageMs=NaN → 永远 false → canResume 误判 ok。
    //   load 时校验，无效 savedAt 视作不可恢复。
    const savedAt = new Date(persisted.savedAt);
    if (isNaN(savedAt.getTime())) {
      this.log.warn(
        `[checkpoint.load ${missionId}] savedAt invalid (${String(persisted.savedAt)}), treating as no checkpoint`,
      );
      return null;
    }
    return {
      missionId,
      savedAt,
      payload: persisted.payload,
      completedKeys: persisted.completedKeys ?? [],
      status: persisted.status,
    };
  }

  async clear(missionId: string): Promise<void> {
    const row = await this.prisma.agentPlaygroundMission
      .findUnique({
        where: { id: missionId },
        // 2026-05-13 #40: leaderJournalUri 必须配套 select，否则 PrismaService
        // hydrate hook 会 warn "select contains JSON 'leaderJournal' but not
        // 'leaderJournalUri'. Off-loaded content will be empty."
        select: { leaderJournal: true, leaderJournalUri: true },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[checkpoint.clear ${missionId}] findUnique failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      });
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
    // ★ P0-R5-3 (2026-04-30): 用 startedAt 过滤 24h 窗口会漏掉长 mission（25h+ 但
    //   最近刚 save checkpoint）。改成拉所有 running，应用层按 savedAt 过滤。
    //   olderThan 现在按 savedAt 比对，不再传给 prisma where。
    const cutoff = olderThan?.getTime() ?? 0;
    const rows = await this.prisma.agentPlaygroundMission
      .findMany({
        where: {
          userId,
          status: "running",
        },
        select: {
          id: true,
          leaderJournal: true,
          leaderJournalUri: true, // #40: 配套 hydrate hook
          startedAt: true,
        },
        take: 50,
        orderBy: { startedAt: "desc" },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[checkpoint.listResumable user=${userId}] query failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [] as {
          id: string;
          leaderJournal: unknown;
          startedAt: Date;
        }[];
      });

    const out: MissionCheckpointSnapshot<TPayload>[] = [];
    for (const row of rows) {
      const journal =
        (row.leaderJournal as Record<string, unknown> | null) ?? {};
      const persisted = journal[CHECKPOINT_KEY] as
        | PersistedCheckpoint<TPayload>
        | undefined;
      if (!persisted) continue;
      const savedAt = new Date(persisted.savedAt);
      if (isNaN(savedAt.getTime())) continue; // P1-R5-B 同步生效
      if (savedAt.getTime() < cutoff) continue;
      out.push({
        missionId: row.id,
        savedAt,
        payload: persisted.payload,
        completedKeys: persisted.completedKeys ?? [],
        status: persisted.status,
      });
    }
    return out;
  }
}
