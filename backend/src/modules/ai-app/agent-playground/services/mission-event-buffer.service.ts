/**
 * MissionEventBuffer — 内存事件缓冲 + DB write-through 兜底
 *
 * 注册为 DomainEventBus adapter，截获所有 agent-playground.* 事件。
 *
 * - 写：append 到内存（FIFO 5000，TTL 1h）+ fire-and-forget INSERT 到
 *   `agent_playground_mission_events` 表，不阻塞主流程。
 * - 读：sync 优先返回内存（fast path）。无内存时调用方需用 readPersisted()
 *   走 DB 兜底（async）。Controller /replay 端点已切到双层读取。
 *
 * 这样 Railway recycle 后 in-memory 缓冲清空，但持久化的 trace 仍能完整回放。
 */

import { Injectable, Logger } from "@nestjs/common";
import type { DomainEvent, IBroadcastAdapter } from "../../../ai-engine/facade";
import { PrismaService } from "../../../../common/prisma/prisma.service";

const MAX_PER_MISSION = 5000;
const TTL_MS = 60 * 60 * 1000; // 1h

interface BufferedEvent {
  readonly type: string;
  readonly payload: unknown;
  readonly agentId?: string;
  readonly traceId?: string;
  readonly timestamp: number;
}

@Injectable()
export class MissionEventBuffer implements IBroadcastAdapter {
  readonly id = "agent-playground.mission-buffer";
  private readonly log = new Logger(MissionEventBuffer.name);
  private readonly byMission = new Map<
    string,
    { events: BufferedEvent[]; lastWriteAt: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  accepts(event: DomainEvent): boolean {
    return event.type.startsWith("agent-playground.");
  }

  async broadcast(event: DomainEvent): Promise<void> {
    const missionId = event.scope.missionId;
    if (!missionId) return;
    const slot = this.byMission.get(missionId) ?? {
      events: [],
      lastWriteAt: 0,
    };
    slot.events.push({
      type: event.type,
      payload: event.payload,
      agentId: event.agentId,
      traceId: event.traceId,
      timestamp: event.timestamp,
    });
    if (slot.events.length > MAX_PER_MISSION) {
      slot.events.splice(0, slot.events.length - MAX_PER_MISSION);
    }
    slot.lastWriteAt = Date.now();
    this.byMission.set(missionId, slot);
    this.gcIfNeeded();

    // Fire-and-forget DB persist；任何 DB 错误只 warn 不阻塞主流程
    void this.prisma.agentPlaygroundMissionEvent
      .create({
        data: {
          missionId,
          type: event.type.slice(0, 120),
          agentId: event.agentId?.slice(0, 120),
          traceId: event.traceId?.slice(0, 120),
          payload: (event.payload ?? {}) as object,
          ts: BigInt(event.timestamp),
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[persist ${missionId}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /** 内存快速读取 —— Controller 优先调用 */
  read(missionId: string, sinceTs?: number): BufferedEvent[] {
    const slot = this.byMission.get(missionId);
    if (!slot) return [];
    if (sinceTs == null) return [...slot.events];
    return slot.events.filter((e) => e.timestamp >= sinceTs);
  }

  /** DB 持久化读取 —— 内存 miss 时兜底（Railway recycle 后历史 mission 走这里） */
  async readPersisted(
    missionId: string,
    sinceTs?: number,
  ): Promise<BufferedEvent[]> {
    const rows = await this.prisma.agentPlaygroundMissionEvent
      .findMany({
        where: {
          missionId,
          ...(sinceTs != null ? { ts: { gte: BigInt(sinceTs) } } : {}),
        },
        orderBy: { ts: "asc" },
        take: MAX_PER_MISSION,
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[readPersisted ${missionId}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [] as never[];
      });
    return rows.map((r) => ({
      type: r.type,
      payload: r.payload as unknown,
      agentId: r.agentId ?? undefined,
      traceId: r.traceId ?? undefined,
      timestamp: Number(r.ts),
    }));
  }

  private lastGcAt = 0;
  private gcIfNeeded(): void {
    const now = Date.now();
    if (now - this.lastGcAt < 60_000) return;
    this.lastGcAt = now;
    for (const [k, v] of this.byMission) {
      if (now - v.lastWriteAt > TTL_MS) this.byMission.delete(k);
    }
  }
}
