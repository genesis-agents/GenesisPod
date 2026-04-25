/**
 * MissionOwnershipRegistry — 必修 #4
 *
 * controller 启动 mission 时 assign(missionId, userId)；
 * gateway/replay/cost 查 ownership 防止越权访问他人 mission。
 *
 * 简化：内存 LRU（生产可换 Redis）。容量 5000 mission，按 createdAt FIFO 淘汰。
 * 已结束 mission 通过 release() 主动清理。
 */

import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class MissionOwnershipRegistry {
  private readonly log = new Logger(MissionOwnershipRegistry.name);
  private readonly byId = new Map<
    string,
    { userId: string; createdAt: number }
  >();
  private readonly capacity = 5000;

  assign(missionId: string, userId: string): void {
    if (this.byId.has(missionId)) {
      this.log.warn(`mission ${missionId} already assigned — overwriting`);
    }
    this.byId.set(missionId, { userId, createdAt: Date.now() });
    this.evictIfNeeded();
  }

  getOwner(missionId: string): string | undefined {
    return this.byId.get(missionId)?.userId;
  }

  release(missionId: string): void {
    this.byId.delete(missionId);
  }

  size(): number {
    return this.byId.size;
  }

  private evictIfNeeded(): void {
    if (this.byId.size <= this.capacity) return;
    // FIFO：删最旧的 1/10 entries
    const entries = [...this.byId.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    );
    const toEvict = entries.slice(0, Math.floor(this.capacity / 10));
    for (const [id] of toEvict) this.byId.delete(id);
  }
}
