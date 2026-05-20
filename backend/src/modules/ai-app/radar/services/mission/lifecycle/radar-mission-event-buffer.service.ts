/**
 * RadarMissionEventBuffer —— 内存事件缓冲（对齐 playground MissionEventBuffer）
 *
 * 注册为 DomainEventBus adapter，截获所有 ai-radar.* 事件按 runId(=missionId)
 * 缓存，供 GET /radar/replay/:runId 回放。前端：
 *   - 进 mission 详情页用 /replay hydrate（防 socket 断线/掉包/刷新空白）
 *   - WS 失败时 polling /replay?since=ts 兜底
 *
 * 与 playground 的唯一差异：**仅内存，不 write-through DB**。
 *   - radar run 是分钟级短任务，内存 FIFO 5000 + TTL 1h 足够覆盖"实时 + 近期回放"
 *   - run 终态指标已落 RadarRun.metrics，历史 run 的"最终结果"不依赖事件流
 *   - 如需 Railway recycle 后回放历史事件，再加专表 write-through（独立 PR）
 */

import { Injectable } from "@nestjs/common";
import type {
  DomainEvent,
  IBroadcastAdapter,
} from "@/modules/ai-harness/facade";

const MAX_PER_MISSION = 5000;
const TTL_MS = 60 * 60 * 1000; // 1h

export interface RadarBufferedEvent {
  readonly type: string;
  readonly payload: unknown;
  readonly timestamp: number;
}

@Injectable()
export class RadarMissionEventBuffer implements IBroadcastAdapter {
  readonly id = "ai-radar.mission-buffer";
  private readonly byMission = new Map<
    string,
    { events: RadarBufferedEvent[]; lastWriteAt: number }
  >();
  private lastGcAt = 0;

  accepts(event: DomainEvent): boolean {
    return event.type.startsWith("ai-radar.");
  }

  // 纯内存写入，无异步工作；接口要求 Promise<void> 故 return Promise.resolve()
  // （不用 async —— 避免 require-await 警告）。
  broadcast(event: DomainEvent): Promise<void> {
    const missionId = event.scope.missionId;
    if (!missionId) return Promise.resolve();
    const slot = this.byMission.get(missionId) ?? {
      events: [],
      lastWriteAt: 0,
    };
    slot.events.push({
      type: event.type,
      payload: event.payload,
      timestamp: event.timestamp,
    });
    if (slot.events.length > MAX_PER_MISSION) {
      slot.events.splice(0, slot.events.length - MAX_PER_MISSION);
    }
    slot.lastWriteAt = Date.now();
    this.byMission.set(missionId, slot);
    this.gcIfNeeded();
    return Promise.resolve();
  }

  /**
   * 读取累积事件（深拷贝防外部 mutate 污染缓冲区）。
   * sinceTs 给前端 polling 增量拉取用。
   */
  read(missionId: string, sinceTs?: number): RadarBufferedEvent[] {
    const slot = this.byMission.get(missionId);
    if (!slot) return [];
    const source =
      sinceTs == null
        ? slot.events
        : slot.events.filter((e) => e.timestamp >= sinceTs);
    return structuredClone(source);
  }

  private gcIfNeeded(): void {
    const now = Date.now();
    if (now - this.lastGcAt < 60_000) return;
    this.lastGcAt = now;
    for (const [k, v] of this.byMission) {
      if (now - v.lastWriteAt > TTL_MS) this.byMission.delete(k);
    }
  }
}
