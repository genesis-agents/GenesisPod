/**
 * SocialEventBuffer — social.* 事件内存缓冲（IBroadcastAdapter）
 *
 * 注册为 DomainEventBus adapter，截获所有 `social.` 前缀事件入内存，
 * 供 /replay 等回放端点读取（mission 启动比订阅快时的窗口期不丢事件）。
 *
 * 当前 v1 (W4 PR-4b)：内存 FIFO 5000 / mission，TTL 1h；无 DB write-through
 * （social 暂未独立 mission_events 表）。后续 W5 看流量决定是否落 DB。
 *
 * Mirror of agent-playground/services/mission/lifecycle/mission-event-buffer.service.ts
 * 的内存子集（去掉 Prisma write-through）。
 */

import { Injectable, Logger } from "@nestjs/common";
import type {
  DomainEvent,
  IBroadcastAdapter,
} from "@/modules/ai-harness/facade";

const MAX_PER_MISSION = 5000;
const TTL_MS = 60 * 60 * 1000;

interface BufferedEvent {
  readonly type: string;
  readonly payload: unknown;
  readonly agentId?: string;
  readonly traceId?: string;
  readonly timestamp: number;
}

@Injectable()
export class SocialEventBuffer implements IBroadcastAdapter {
  readonly id = "social.mission-buffer";
  private readonly log = new Logger(SocialEventBuffer.name);
  private readonly byMission = new Map<
    string,
    { events: BufferedEvent[]; lastWriteAt: number }
  >();
  private lastGcAt = 0;

  accepts(event: DomainEvent): boolean {
    return event.type.startsWith("social.");
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
    const source =
      sinceTs == null
        ? slot.events
        : slot.events.filter((e) => e.timestamp >= sinceTs);
    return structuredClone(source);
  }

  clear(missionId: string): void {
    this.byMission.delete(missionId);
  }

  private gcIfNeeded(): void {
    const now = Date.now();
    if (now - this.lastGcAt < 60_000) return;
    this.lastGcAt = now;
    for (const [k, v] of this.byMission) {
      if (now - v.lastWriteAt > TTL_MS) this.byMission.delete(k);
    }
    this.log.debug(
      `[gc] kept ${this.byMission.size} mission buffers (TTL=${TTL_MS / 60_000}min)`,
    );
  }
}
