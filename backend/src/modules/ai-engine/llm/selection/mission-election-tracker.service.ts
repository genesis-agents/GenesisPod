/**
 * MissionElectionTracker · Mission-scoped 选举多样性
 *
 * 2026-05-10 §3：解决 ModelElectionService.elect() 无状态导致的多模型坍缩。
 * elect() 是纯函数，11 次同 shape 调用产生 11 次同 modelId。
 * 本 tracker 给同一 mission 内的 elect() 调用之间织入"已选过哪些 modelId"
 * 的共享上下文，让 score 维度新增的 diversityScore（-10 × occurrences）
 * 自然驱动多 provider 分布。
 *
 * Storage：in-memory Map<missionId, modelId[]>，按 LRU 淘汰，TTL = 6h
 * （典型 mission wall time）。重启清空可接受——分布属性是 best-effort。
 *
 * 也可未来切到 Redis 让多 pod 共享；当前本地 Map 够用且 0 网络开销。
 */

import { Injectable, Logger } from "@nestjs/common";

/** 单 mission 容量上限（防止一个长 mission 撑爆 Map）；超出按先入先出截断 */
const MAX_PER_MISSION = 100;
/** 全局 mission 数量上限；超出按 LRU 淘汰最久未访问 */
const MAX_MISSIONS = 500;
/** 单 mission TTL（毫秒）：6h */
const MISSION_TTL_MS = 6 * 60 * 60 * 1000;

interface MissionEntry {
  readonly elected: string[];
  lastAccessedAt: number;
}

interface SerializedElectionResult<T> {
  readonly result: T;
  readonly electedModelId?: string;
}

@Injectable()
export class MissionElectionTracker {
  private readonly logger = new Logger(MissionElectionTracker.name);
  private readonly missions = new Map<string, MissionEntry>();
  private readonly missionQueues = new Map<string, Promise<void>>();

  /** 取本 mission 已选过的 modelId 列表（按选举顺序）。空 → 返回空数组 */
  getElected(missionId: string | undefined): ReadonlyArray<string> {
    if (!missionId) return [];
    const entry = this.missions.get(missionId);
    if (!entry) return [];
    if (this.isExpired(entry)) {
      this.missions.delete(missionId);
      return [];
    }
    entry.lastAccessedAt = Date.now();
    return entry.elected;
  }

  /** 记录一次 election 结果。missionId 为空 → no-op（非 mission 上下文不追踪） */
  recordElection(missionId: string | undefined, modelId: string): void {
    if (!missionId || !modelId) return;
    this.evictExpired();
    this.evictLruIfFull();

    let entry = this.missions.get(missionId);
    if (!entry) {
      entry = { elected: [], lastAccessedAt: Date.now() };
      this.missions.set(missionId, entry);
    }
    entry.lastAccessedAt = Date.now();
    entry.elected.push(modelId);
    if (entry.elected.length > MAX_PER_MISSION) {
      // FIFO 截断：保留最近的，避免长 mission 内存膨胀
      entry.elected.splice(0, entry.elected.length - MAX_PER_MISSION);
    }
  }

  /** 主动清理一个 mission（mission complete / cancel 时调用） */
  clear(missionId: string): void {
    this.missions.delete(missionId);
    this.missionQueues.delete(missionId);
  }

  /**
   * 串行执行同一 mission 内的 model election。
   * 目标不是全局锁，而是确保并发 researcher 在打分前能看到前序已选模型，
   * 让 diversity penalty 真正生效。
   */
  async runSerializedElection<T>(
    missionId: string | undefined,
    run: (
      previouslyElected: ReadonlyArray<string>,
    ) => Promise<SerializedElectionResult<T>>,
  ): Promise<T> {
    if (!missionId) {
      const { result } = await run([]);
      return result;
    }

    const previousTail = this.missionQueues.get(missionId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previousTail.finally(() => gate);
    this.missionQueues.set(missionId, tail);

    await previousTail;
    try {
      const { result, electedModelId } = await run(this.getElected(missionId));
      if (electedModelId) {
        this.recordElection(missionId, electedModelId);
      }
      return result;
    } finally {
      release();
      if (this.missionQueues.get(missionId) === tail) {
        this.missionQueues.delete(missionId);
      }
    }
  }

  /** 测试 / 监控用 */
  size(): number {
    return this.missions.size;
  }

  private isExpired(entry: MissionEntry): boolean {
    return Date.now() - entry.lastAccessedAt > MISSION_TTL_MS;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.missions) {
      if (now - entry.lastAccessedAt > MISSION_TTL_MS) {
        this.missions.delete(id);
      }
    }
  }

  private evictLruIfFull(): void {
    if (this.missions.size < MAX_MISSIONS) return;
    let oldestId: string | null = null;
    let oldestTs = Infinity;
    for (const [id, entry] of this.missions) {
      if (entry.lastAccessedAt < oldestTs) {
        oldestTs = entry.lastAccessedAt;
        oldestId = id;
      }
    }
    if (oldestId) {
      this.missions.delete(oldestId);
      this.logger.debug(`[evictLru] mission=${oldestId} dropped (LRU full)`);
    }
  }
}
