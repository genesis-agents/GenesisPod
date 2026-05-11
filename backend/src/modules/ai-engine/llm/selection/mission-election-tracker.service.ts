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

import { Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "crypto";
import { CacheService } from "@/common/cache/cache.service";
import { PrismaService } from "@/common/prisma/prisma.service";

/** 单 mission 容量上限（防止一个长 mission 撑爆 Map）；超出按先入先出截断 */
const MAX_PER_MISSION = 100;
/** 全局 mission 数量上限；超出按 LRU 淘汰最久未访问 */
const MAX_MISSIONS = 500;
/** 单 mission TTL（毫秒）：6h */
const MISSION_TTL_MS = 6 * 60 * 60 * 1000;

interface MissionEntry {
  committed: string[];
  reservations: MissionElectionReservation[];
  lastAccessedAt: number;
}

interface MissionElectionStateRow {
  missionId: string;
  committedModelIds: string[];
  reservations: unknown;
}

interface SerializedElectionResult<T> {
  readonly result: T;
  readonly electedModelId?: string;
}

export interface MissionElectionReservation {
  readonly token: string;
  readonly modelId: string;
  readonly createdAt: number;
}

export interface ReservedElectionResult<T> {
  readonly result: T;
  readonly reservation?: MissionElectionReservation;
}

const CACHE_PREFIX = "mission:election:v2:";
const RESERVATION_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class MissionElectionTracker {
  private readonly logger = new Logger(MissionElectionTracker.name);
  private readonly missions = new Map<string, MissionEntry>();
  private readonly missionQueues = new Map<string, Promise<void>>();

  constructor(
    @Optional() private readonly cache?: CacheService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /** 取本 mission 已选过的 modelId 列表（按选举顺序）。空 → 返回空数组 */
  async getElected(
    missionId: string | undefined,
  ): Promise<ReadonlyArray<string>> {
    if (!missionId) return [];
    if (this.prisma) {
      const row = await this.prisma.missionElectionState.findUnique({
        where: { missionId },
      });
      const entry = this.rowToEntry(row);
      if (!row) {
        this.missions.delete(missionId);
        return [];
      }
      this.missions.set(missionId, entry);
      return this.toVisibleHistory(entry);
    }
    const entry = await this.ensureLoadedEntry(missionId);
    if (this.isExpired(entry)) {
      this.missions.delete(missionId);
      return [];
    }
    entry.lastAccessedAt = Date.now();
    this.pruneExpiredReservations(entry);
    return this.toVisibleHistory(entry);
  }

  /** 记录一次 election 结果。missionId 为空 → no-op（非 mission 上下文不追踪） */
  async recordElection(
    missionId: string | undefined,
    modelId: string,
  ): Promise<void> {
    if (!missionId || !modelId) return;
    await this.mutateMissionEntry(missionId, async (entry) => {
      entry.lastAccessedAt = Date.now();
      entry.committed.push(modelId);
      this.trimCommitted(entry);
      return true;
    });
  }

  /** 主动清理一个 mission（mission complete / cancel 时调用） */
  clear(missionId: string): void {
    void this.clearAsync(missionId);
  }

  async reserveSerializedElection<T>(
    missionId: string | undefined,
    run: (
      previouslyElected: ReadonlyArray<string>,
    ) => Promise<SerializedElectionResult<T>>,
  ): Promise<ReservedElectionResult<T>> {
    if (!missionId) {
      const { result } = await run([]);
      return { result };
    }

    if (this.prisma) {
      return this.reserveWithDistributedLock(missionId, run);
    }
    return this.reserveWithLocalQueue(missionId, run);
  }

  private async reserveWithLocalQueue<T>(
    missionId: string,
    run: (
      previouslyElected: ReadonlyArray<string>,
    ) => Promise<SerializedElectionResult<T>>,
  ): Promise<ReservedElectionResult<T>> {
    const previousTail = this.missionQueues.get(missionId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previousTail.finally(() => gate);
    this.missionQueues.set(missionId, tail);

    await previousTail;
    try {
      const entry = await this.ensureLoadedEntry(missionId);
      const { result, electedModelId } = await run(this.toVisibleHistory(entry));
      if (!electedModelId) {
        return { result };
      }
      const reservation: MissionElectionReservation = {
        token: randomUUID(),
        modelId: electedModelId,
        createdAt: Date.now(),
      };
      entry.lastAccessedAt = Date.now();
      entry.reservations.push(reservation);
      this.pruneExpiredReservations(entry);
      await this.persistMissionMirror(missionId, entry);
      return { result, reservation };
    } finally {
      release();
      if (this.missionQueues.get(missionId) === tail) {
        this.missionQueues.delete(missionId);
      }
    }
  }

  private async reserveWithDistributedLock<T>(
    missionId: string,
    run: (
      previouslyElected: ReadonlyArray<string>,
    ) => Promise<SerializedElectionResult<T>>,
  ): Promise<ReservedElectionResult<T>> {
    return this.prisma!.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${this.buildLockKey(missionId)}))
      `;
      const entry = await this.ensureLoadedDistributedEntry(tx, missionId);
      const { result, electedModelId } = await run(this.toVisibleHistory(entry));
      if (!electedModelId) {
        return { result };
      }
      const reservation: MissionElectionReservation = {
        token: randomUUID(),
        modelId: electedModelId,
        createdAt: Date.now(),
      };
      entry.lastAccessedAt = Date.now();
      entry.reservations.push(reservation);
      this.pruneExpiredReservations(entry);
      await this.persistMissionDistributed(tx, missionId, entry);
      return { result, reservation };
    });
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
    const { result, reservation } = await this.reserveSerializedElection(
      missionId,
      run,
    );
    if (missionId && reservation) {
      await this.commitReservation(missionId, reservation.token);
    }
    return result;
  }

  async commitReservation(
    missionId: string | undefined,
    token: string | undefined,
  ): Promise<void> {
    if (!missionId || !token) return;
    await this.mutateMissionEntry(missionId, async (entry) => {
      const reservation = entry.reservations.find((r) => r.token === token);
      if (!reservation) return false;
      entry.reservations = entry.reservations.filter((r) => r.token !== token);
      entry.committed.push(reservation.modelId);
      entry.lastAccessedAt = Date.now();
      this.trimCommitted(entry);
      return true;
    });
  }

  async releaseReservation(
    missionId: string | undefined,
    token: string | undefined,
  ): Promise<void> {
    if (!missionId || !token) return;
    await this.mutateMissionEntry(missionId, async (entry) => {
      const next = entry.reservations.filter((r) => r.token !== token);
      if (next.length === entry.reservations.length) return false;
      entry.reservations = next;
      entry.lastAccessedAt = Date.now();
      return true;
    });
  }

  /** 测试 / 监控用 */
  size(): number {
    return this.missions.size;
  }

  private isExpired(entry: MissionEntry): boolean {
    return Date.now() - entry.lastAccessedAt > MISSION_TTL_MS;
  }

  private toVisibleHistory(entry: MissionEntry): ReadonlyArray<string> {
    return [
      ...entry.committed,
      ...entry.reservations.map((reservation) => reservation.modelId),
    ];
  }

  private trimCommitted(entry: MissionEntry): void {
    if (entry.committed.length > MAX_PER_MISSION) {
      entry.committed.splice(0, entry.committed.length - MAX_PER_MISSION);
    }
  }

  private pruneExpiredReservations(entry: MissionEntry): void {
    const cutoff = Date.now() - RESERVATION_TTL_MS;
    entry.reservations = entry.reservations.filter(
      (reservation) => reservation.createdAt >= cutoff,
    );
  }

  private ensureLocalEntry(missionId: string): MissionEntry {
    this.evictExpired();
    this.evictLruIfFull();
    let entry = this.missions.get(missionId);
    if (!entry) {
      entry = { committed: [], reservations: [], lastAccessedAt: Date.now() };
      this.missions.set(missionId, entry);
    }
    this.pruneExpiredReservations(entry);
    return entry;
  }

  private async ensureLoadedEntry(missionId: string): Promise<MissionEntry> {
    const local = this.ensureLocalEntry(missionId);
    if (!this.cache) return local;
    const cached = await this.cache.get<MissionEntry>(CACHE_PREFIX + missionId);
    if (!cached) return local;
    cached.lastAccessedAt = Date.now();
    this.pruneExpiredReservations(cached);
    this.trimCommitted(cached);
    this.missions.set(missionId, cached);
    return cached;
  }

  private async ensureLoadedDistributedEntry(
    tx: any,
    missionId: string,
  ): Promise<MissionEntry> {
    const row = await tx.missionElectionState.findUnique({
      where: { missionId },
    });
    const entry = this.rowToEntry(row);
    this.missions.set(missionId, entry);
    return entry;
  }

  private async persistMissionDistributed(
    tx: any,
    missionId: string,
    entry: MissionEntry,
  ): Promise<void> {
    this.missions.set(missionId, entry);
    await tx.missionElectionState.upsert({
      where: { missionId },
      create: {
        missionId,
        committedModelIds: entry.committed,
        reservations: entry.reservations,
      },
      update: {
        committedModelIds: entry.committed,
        reservations: entry.reservations,
      },
    });
    await this.persistMissionMirror(missionId, entry);
  }

  private async persistMissionMirror(
    missionId: string,
    entry: MissionEntry,
  ): Promise<void> {
    this.missions.set(missionId, entry);
    await this.cache?.set(
      CACHE_PREFIX + missionId,
      entry,
      Math.ceil(MISSION_TTL_MS / 1000),
    );
  }

  private rowToEntry(row: MissionElectionStateRow | null): MissionEntry {
    if (!row) {
      return {
        committed: [],
        reservations: [],
        lastAccessedAt: Date.now(),
      };
    }
    const entry: MissionEntry = {
      committed: Array.isArray(row.committedModelIds)
        ? [...row.committedModelIds]
        : [],
      reservations: this.parseReservations(row.reservations),
      lastAccessedAt: Date.now(),
    };
    this.pruneExpiredReservations(entry);
    this.trimCommitted(entry);
    return entry;
  }

  private parseReservations(value: unknown): MissionElectionReservation[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const token = Reflect.get(item, "token");
      const modelId = Reflect.get(item, "modelId");
      const createdAt = Reflect.get(item, "createdAt");
      if (
        typeof token !== "string" ||
        typeof modelId !== "string" ||
        typeof createdAt !== "number"
      ) {
        return [];
      }
      return [{ token, modelId, createdAt }];
    });
  }

  private buildLockKey(missionId: string): string {
    return `mission-election:${missionId}`;
  }

  private async mutateMissionEntry(
    missionId: string,
    mutate: (entry: MissionEntry) => Promise<boolean | void>,
  ): Promise<void> {
    if (this.prisma) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${this.buildLockKey(missionId)}))
        `;
        const entry = await this.ensureLoadedDistributedEntry(tx, missionId);
        const changed = await mutate(entry);
        if (changed === false) return;
        await this.persistMissionDistributed(tx, missionId, entry);
      });
      return;
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
      const entry = await this.ensureLoadedEntry(missionId);
      const changed = await mutate(entry);
      if (changed === false) return;
      await this.persistMissionMirror(missionId, entry);
    } finally {
      release();
      if (this.missionQueues.get(missionId) === tail) {
        this.missionQueues.delete(missionId);
      }
    }
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.missions) {
      if (now - entry.lastAccessedAt > MISSION_TTL_MS) {
        this.missions.delete(id);
      }
    }
  }

  private async clearAsync(missionId: string): Promise<void> {
    if (this.prisma) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${this.buildLockKey(missionId)}))
        `;
        await tx.missionElectionState.deleteMany({ where: { missionId } });
        this.missions.delete(missionId);
        this.missionQueues.delete(missionId);
        await this.cache?.del(CACHE_PREFIX + missionId);
      });
      return;
    }

    this.missions.delete(missionId);
    this.missionQueues.delete(missionId);
    await this.cache?.del(CACHE_PREFIX + missionId);
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
