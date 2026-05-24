/**
 * CapabilityProbeService —— v3.1 §B.6 probe daemon（@Cron 6h + 分布式锁）
 *
 * 周期任务（每 6 小时）：
 *   1. **分布式锁**：Redis SET NX EX 60 抢锁，失败 → 其它 pod 在跑，直接 return
 *   2. **feature flag**：isProbeEnabled() === false → 释放锁 + return
 *   3. **catalog 版本检测**（复原通道 #3：catalog version bump 触发批量 reset）：
 *      - 读 Redis 'capability:catalog:version'
 *      - 比对代码常量 CATALOG_VERSION
 *      - 缺失 → 初始化到代码版本（首启动；不触发 reset）
 *      - 代码版本高 → 触发批量 reset（清所有 __meta.autoDowngraded=true 的
 *        user_model_configs.capability_overrides）+ 每行记 AuditLog source='reverse-probe'
 *      - 写 Redis 到新版本
 *   4. **被动反向探测标记**（B 子片 3 简化版，复原通道 #1）：
 *      - 过去 7 天内 self-heal 写入（source='self-heal-user'）且距 selfHealedAt ≥ 24h 的
 *        scopeKey/field → 打 Redis flag `capability:probe:retry:<scopeKey>:<field>`
 *      - B+ 阶段加重试 API 调用 + 成功后清 capability_overrides；本片只打标记
 *   5. **释放锁**（finally 块，保证锁被清）
 *
 * fail-closed：任何子步骤异常 log + 释放锁；不抛错（不能让 Cron 进程崩溃）
 */

import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { Prisma } from "@prisma/client";
import type { RedisStore } from "cache-manager-ioredis-yet";
import type { Redis, Cluster } from "ioredis";
import { randomUUID } from "crypto";

import { CacheService } from "../../../../common/cache/cache.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";

import { CATALOG_VERSION } from "./model-capability-catalog";
import { CapabilityFeatureFlagsService } from "./capability-feature-flags.service";

const LOCK_KEY = "capability:probe:lock";
const LOCK_TTL_SECONDS = 60;
const VERSION_KEY = "capability:catalog:version";
const RETRY_FLAG_PREFIX = "capability:probe:retry:";
const RETRY_FLAG_TTL_SECONDS = 6 * 3600; // 6h，下次 probe 周期前过期
const SELF_HEALED_RETRY_WINDOW_HOURS = 24;
const SELF_HEALED_LOOKBACK_DAYS = 7;

@Injectable()
export class CapabilityProbeService {
  private readonly logger = new Logger(CapabilityProbeService.name);
  private readonly instanceId = randomUUID();

  constructor(
    private readonly cache: CacheService,
    private readonly prisma: PrismaService,
    private readonly flags: CapabilityFeatureFlagsService,
    @Optional() @Inject(CACHE_MANAGER) private readonly cacheManager?: Cache,
  ) {}

  /**
   * @Cron('0 *\/6 * * *') —— 每 6 小时执行一次（00:00 / 06:00 / 12:00 / 18:00 UTC）。
   *
   * Schedule.forRoot() 在 app.module 已注册（grep 验证）。
   */
  @Cron("0 */6 * * *", { name: "capability.probe", timeZone: "UTC" })
  async runPeriodicProbe(): Promise<void> {
    const acquired = await this.tryAcquireLock();
    if (!acquired) {
      this.logger.debug(
        `[probe] lock held by another pod, skip this cycle (instance=${this.instanceId})`,
      );
      return;
    }

    try {
      // feature flag 在拿锁后立即检查（避免持锁后才发现 flag 关）
      const enabled = await this.flags.isProbeEnabled();
      if (!enabled) {
        this.logger.log("[probe] disabled by feature flag, skip");
        return;
      }

      await this.checkCatalogVersion();
      await this.markPassiveRetries();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[probe] exception during cycle: ${msg.slice(0, 300)}`);
    } finally {
      await this.releaseLock();
    }
  }

  // ─────────── lock ───────────

  /**
   * Redis SET NX EX 60 抢锁。Redis 不可用时退化为 in-memory 单 pod（dev only）。
   *
   * 返 true = 拿到锁；false = 锁已被其它 pod 持有。
   */
  private async tryAcquireLock(): Promise<boolean> {
    const client = this.getRedisClient();
    if (client) {
      try {
        // SET key value NX EX seconds — 原子操作，多 pod 安全
        const result = await client.set(
          LOCK_KEY,
          this.instanceId,
          "EX",
          LOCK_TTL_SECONDS,
          "NX",
        );
        return result === "OK";
      } catch (err) {
        this.logger.warn(
          `[probe] lock acquire failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      }
    }
    // in-memory fallback：用 cache.set + get 模拟（仅单 pod 开发环境）
    const existing = await this.cache.get<string>(LOCK_KEY);
    if (existing !== undefined) return false;
    await this.cache.set(LOCK_KEY, this.instanceId, LOCK_TTL_SECONDS);
    return true;
  }

  private async releaseLock(): Promise<void> {
    // 仅当 lock value === instanceId 时才删除（防止误删别人的锁；锁可能过期被新 pod 重抢）
    const client = this.getRedisClient();
    if (client) {
      try {
        const current = await client.get(LOCK_KEY);
        if (current === this.instanceId) {
          await client.del(LOCK_KEY);
        }
      } catch (err) {
        this.logger.warn(
          `[probe] lock release failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }
    const current = await this.cache.get<string>(LOCK_KEY);
    if (current === this.instanceId) {
      await this.cache.del(LOCK_KEY);
    }
  }

  // ─────────── catalog version detection ───────────

  /**
   * catalog 版本检测 + 批量 reset（复原通道 #3）。
   *
   * Redis 缺失 → 初始化到代码版本（不 reset）。
   * 代码版本 > Redis 版本 → 批量清 user_model_configs 的 self-heal overrides + 写 AuditLog。
   * 写 Redis 到代码版本。
   */
  private async checkCatalogVersion(): Promise<void> {
    const stored = await this.cache.get<string | number>(VERSION_KEY);
    let storedVersion: number | null = null;
    if (typeof stored === "number") {
      storedVersion = stored;
    } else if (typeof stored === "string") {
      const parsed = parseInt(stored, 10);
      if (Number.isFinite(parsed)) storedVersion = parsed;
    }

    if (storedVersion === null) {
      // 首启动 / Redis 缺失 → 初始化，不触发 reset
      await this.cache.set(VERSION_KEY, CATALOG_VERSION, 365 * 86400);
      this.logger.log(
        `[probe] catalog version initialized in Redis: ${CATALOG_VERSION}`,
      );
      return;
    }

    if (CATALOG_VERSION > storedVersion) {
      this.logger.warn(
        `[probe] catalog version bump detected: code=${CATALOG_VERSION} > redis=${storedVersion}, triggering batch reset of self-heal overrides`,
      );
      const cleared = await this.batchResetSelfHealOverrides();
      this.logger.log(
        `[probe] batch reset complete: ${cleared} rows reverted, audit logs written`,
      );
      // 更新 Redis 到新版本
      await this.cache.set(VERSION_KEY, CATALOG_VERSION, 365 * 86400);
    } else if (CATALOG_VERSION < storedVersion) {
      // 代码版本回退（部署回滚）→ log 但不动 Redis
      this.logger.warn(
        `[probe] code catalog version (${CATALOG_VERSION}) < redis version (${storedVersion}) — possible rollback, leaving Redis untouched`,
      );
    }
    // 等于 → 无操作
  }

  /**
   * 批量 reset：清所有 `__meta.autoDowngraded=true` 的 user_model_configs.capability_overrides。
   *
   * 用 raw SQL（Prisma 不支持 JSONB path 条件 update 到 NULL）：
   *   1. 查询命中行的 (id, userId, capability_overrides)
   *   2. UPDATE SET capability_overrides = NULL
   *   3. 同事务 INSERT 多条 AuditLog source='reverse-probe'
   *
   * @returns 被清除的行数
   */
  private async batchResetSelfHealOverrides(): Promise<number> {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ id: string; userId: string; capability_overrides: unknown }>
      >`
        SELECT id, "userId", capability_overrides
        FROM user_model_configs
        WHERE capability_overrides->'__meta'->>'autoDowngraded' = 'true'
      `;
      if (rows.length === 0) return 0;

      await this.prisma.$transaction(async (tx) => {
        for (const row of rows) {
          // 把 capability_overrides 列设为 SQL NULL（Prisma 用 DbNull 区分 JsonNull）
          await tx.userModelConfig.update({
            where: { id: row.id },
            data: { capabilityOverrides: Prisma.DbNull },
          });
          await tx.capabilityOverrideAuditLog.create({
            data: {
              actorId: "system",
              actorRole: "system",
              scope: "SYSTEM",
              scopeKey: `user:${row.userId}:user_model_config:${row.id}`,
              aiModelId: null,
              userModelConfigId: row.id,
              field: "<root>",
              beforeValue:
                (row.capability_overrides as Prisma.InputJsonValue) ??
                Prisma.JsonNull,
              afterValue: Prisma.JsonNull,
              source: "reverse-probe",
              reason: `catalog version bump from <=${CATALOG_VERSION - 1} to ${CATALOG_VERSION} — auto-downgraded overrides cleared by reverse probe`,
              ipAddress: null,
              userAgent: null,
            },
          });
        }
      });
      return rows.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[probe] batchResetSelfHealOverrides failed: ${msg}`);
      return 0;
    }
  }

  // ─────────── passive reverse-probe markers (B 子片 3 简化版) ───────────

  /**
   * 复原通道 #1（B 子片 3 仅打标记）：
   * 过去 7 天内 self-heal 写入且距 selfHealedAt ≥ 24h 的 scopeKey/field → 打 Redis flag
   * `capability:probe:retry:<scopeKey>:<field>`，TTL 6h（下次 probe 周期前自然过期）。
   *
   * B+ 阶段：标记后由调用面读 flag 触发"试探性重试"调用真实 API；成功 → 清 overrides。
   * 本片不做重试，避免影响业务正确性。
   */
  private async markPassiveRetries(): Promise<void> {
    try {
      const since = new Date(
        Date.now() - SELF_HEALED_LOOKBACK_DAYS * 86400 * 1000,
      );
      const olderThan = new Date(
        Date.now() - SELF_HEALED_RETRY_WINDOW_HOURS * 3600 * 1000,
      );
      const candidates = await this.prisma.capabilityOverrideAuditLog.findMany({
        where: {
          source: "self-heal-user",
          createdAt: { gte: since, lte: olderThan },
        },
        select: { scopeKey: true, field: true },
        take: 500, // 上限保护，避免大批量
      });
      if (candidates.length === 0) return;
      for (const c of candidates) {
        const key = `${RETRY_FLAG_PREFIX}${c.scopeKey}:${c.field}`;
        await this.cache.set(key, "1", RETRY_FLAG_TTL_SECONDS);
      }
      this.logger.log(
        `[probe] passive retry markers: ${candidates.length} flags set`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[probe] markPassiveRetries failed: ${msg}`);
    }
  }

  // ─────────── helpers ───────────

  /**
   * 拿底层 ioredis 客户端用于 SET NX EX（CacheService 没暴露 NX 语义）。
   * 无 Redis 返 null（dev fallback）。
   */
  private getRedisClient(): (Redis | Cluster) | null {
    if (!this.cacheManager) return null;
    try {
      const mgr = this.cacheManager as unknown as { store?: RedisStore };
      return mgr.store?.client ?? null;
    } catch {
      return null;
    }
  }
}
