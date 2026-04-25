/**
 * MissionEventBuffer — 内存事件缓冲，给 /replay 端点用
 *
 * 注册为 DomainEventBus adapter，截获所有 agent-playground.* 事件，
 * 按 missionId 分桶，FIFO 上限 5000，TTL 1h。
 *
 * 不替代 AgentEventStore（那是 per-agentId 持久化），仅给 demo 的
 * "刷新页面 / WS 连不上时回放" 服务。
 */

import { Injectable } from "@nestjs/common";
import type { DomainEvent, IBroadcastAdapter } from "../../../ai-engine/facade";

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
  private readonly byMission = new Map<
    string,
    { events: BufferedEvent[]; lastWriteAt: number }
  >();

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
  }

  read(missionId: string, sinceTs?: number): BufferedEvent[] {
    const slot = this.byMission.get(missionId);
    if (!slot) return [];
    if (sinceTs == null) return [...slot.events];
    // 用 >= 防止同 ms 边界事件被吞；前端 dedupe 会去重
    return slot.events.filter((e) => e.timestamp >= sinceTs);
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
