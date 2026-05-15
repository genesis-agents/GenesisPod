/**
 * AI Harness - Rate Limiter
 * 速率限制器实现
 *
 * 存储层：Redis（通过 CacheService），multi-pod 一致。
 * Key 格式：
 *   harness:rate-limit:entries:{fullKey}  → number[] (请求时间戳数组，滑动窗口)
 *
 * configs Map 保持 in-process（每个 pod 启动时通过 registerLimit 填充，
 * 内容相同，只读，不需要跨 pod 同步）。
 *
 * entries 从 in-memory Map 迁移到 Redis：
 *   - check / consume / reset / getStatus 全部 async
 *   - 滑动窗口：存储请求时间戳数组；check 过滤过期后计数
 *   - TTL = windowMs * 2 / 1000（秒）——Redis 自动 cleanup，删除 setInterval
 */

import { Injectable } from "@nestjs/common";
import { CacheService } from "@/common/cache/cache.service";

// ── Redis key helpers ──────────────────────────────────────────────────────

function entriesKey(fullKey: string): string {
  return `harness:rate-limit:entries:${fullKey}`;
}

/**
 * 速率限制结果
 */
export interface RateLimitResult {
  /**
   * 是否允许
   */
  allowed: boolean;

  /**
   * 剩余配额
   */
  remaining: number;

  /**
   * 重置时间 (Unix timestamp)
   */
  resetAt: number;

  /**
   * 重试时间 (ms)
   */
  retryAfter?: number;

  /**
   * 当前使用量
   */
  used: number;

  /**
   * 总限制
   */
  limit: number;
}

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  /**
   * 时间窗口 (ms)
   */
  windowMs: number;

  /**
   * 最大请求数
   */
  maxRequests: number;

  /**
   * 是否滑动窗口
   */
  sliding?: boolean;

  /**
   * 键前缀
   */
  keyPrefix?: string;
}

/**
 * 速率限制器
 *
 * 公共方法全部 async，状态存储在 Redis（通过 CacheService），支持 multi-pod 一致计数。
 * configs Map 保持 in-process（启动时 registerLimit 填充，只读，不需跨 pod 同步）。
 */
@Injectable()
export class RateLimiter {
  // in-process only：启动时填充，只读，无需 Redis
  private readonly configs = new Map<string, RateLimitConfig>();

  /**
   * 默认配置
   */
  private static readonly DEFAULT_CONFIG: RateLimitConfig = {
    windowMs: 60000, // 1 分钟
    maxRequests: 60, // 60 请求/分钟
    sliding: true,
    keyPrefix: "ratelimit",
  };

  constructor(private readonly cacheService: CacheService) {}

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * 从 Redis 读取时间戳列表，过滤窗口外条目，返回活跃列表
   */
  private async readActiveTimestamps(
    redisKey: string,
    windowStart: number,
  ): Promise<number[]> {
    const raw = await this.cacheService.get<number[]>(redisKey);
    if (!Array.isArray(raw)) return [];
    return raw.filter((t) => t > windowStart);
  }

  /**
   * 将时间戳列表写回 Redis，TTL = windowMs * 2（秒）
   */
  private async writeTimestamps(
    redisKey: string,
    timestamps: number[],
    windowMs: number,
  ): Promise<void> {
    const ttlSec = Math.ceil((windowMs * 2) / 1000);
    await this.cacheService.set(redisKey, timestamps, ttlSec);
  }

  private resolveConfig(limitName?: string): RateLimitConfig {
    return limitName
      ? (this.configs.get(limitName) ?? RateLimiter.DEFAULT_CONFIG)
      : RateLimiter.DEFAULT_CONFIG;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * 注册限制配置（in-process，启动时调用）
   */
  registerLimit(name: string, config: Partial<RateLimitConfig>): void {
    this.configs.set(name, { ...RateLimiter.DEFAULT_CONFIG, ...config });
  }

  /**
   * 检查速率限制（不消费配额）
   */
  async check(key: string, limitName?: string): Promise<RateLimitResult> {
    const config = this.resolveConfig(limitName);
    const fullKey = `${config.keyPrefix}:${key}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const timestamps = await this.readActiveTimestamps(
      entriesKey(fullKey),
      windowStart,
    );
    const used = timestamps.length;
    const remaining = Math.max(0, config.maxRequests - used);
    const allowed = used < config.maxRequests;

    // resetAt: 如有活跃请求则为最早请求 + window，否则 now + window
    const earliest = timestamps.length > 0 ? Math.min(...timestamps) : now;
    const resetAt = earliest + config.windowMs;

    return {
      allowed,
      remaining,
      resetAt,
      retryAfter: allowed ? undefined : resetAt - now,
      used,
      limit: config.maxRequests,
    };
  }

  /**
   * 消费配额（check + 写入时间戳）
   */
  async consume(
    key: string,
    limitName?: string,
    count = 1,
  ): Promise<RateLimitResult> {
    const config = this.resolveConfig(limitName);
    const fullKey = `${config.keyPrefix}:${key}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const rKey = entriesKey(fullKey);

    const timestamps = await this.readActiveTimestamps(rKey, windowStart);
    const used = timestamps.length;

    if (used >= config.maxRequests) {
      const earliest = timestamps.length > 0 ? Math.min(...timestamps) : now;
      const resetAt = earliest + config.windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: resetAt - now,
        used,
        limit: config.maxRequests,
      };
    }

    // 追加本次请求的时间戳（count 个）
    const newTimestamps = [...timestamps];
    for (let i = 0; i < count; i++) {
      newTimestamps.push(now);
    }

    await this.writeTimestamps(rKey, newTimestamps, config.windowMs);

    const newUsed = newTimestamps.length;
    const earliest =
      newTimestamps.length > 0 ? Math.min(...newTimestamps) : now;
    const resetAt = earliest + config.windowMs;

    return {
      allowed: true,
      remaining: Math.max(0, config.maxRequests - newUsed),
      resetAt,
      used: newUsed,
      limit: config.maxRequests,
    };
  }

  /**
   * 重置限制（删除 Redis key）
   */
  async reset(key: string, limitName?: string): Promise<void> {
    const config = this.resolveConfig(limitName);
    const fullKey = `${config.keyPrefix}:${key}`;
    await this.cacheService.del(entriesKey(fullKey));
  }

  /**
   * 获取当前状态（无副作用的只读 check）
   */
  async getStatus(
    key: string,
    limitName?: string,
  ): Promise<RateLimitResult | null> {
    const config = this.resolveConfig(limitName);
    const fullKey = `${config.keyPrefix}:${key}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const raw = await this.cacheService.get<number[]>(entriesKey(fullKey));
    // key 不存在时返回 null（与原行为一致）
    if (!Array.isArray(raw) || raw.length === 0) {
      return null;
    }

    const timestamps = raw.filter((t) => t > windowStart);
    if (timestamps.length === 0) {
      // 所有条目已过期
      return null;
    }

    const used = timestamps.length;
    const remaining = Math.max(0, config.maxRequests - used);
    const allowed = used < config.maxRequests;
    const earliest = Math.min(...timestamps);
    const resetAt = earliest + config.windowMs;

    return {
      allowed,
      remaining,
      resetAt,
      retryAfter: allowed ? undefined : resetAt - now,
      used,
      limit: config.maxRequests,
    };
  }
}

/**
 * Token 桶限流器（本地 in-process，无需 Redis）
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number, // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * 尝试获取令牌
   */
  tryAcquire(count = 1): boolean {
    this.refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }

    return false;
  }

  /**
   * 等待获取令牌
   */
  async acquire(count = 1, timeoutMs = 10000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (this.tryAcquire(count)) {
        return true;
      }

      // 计算需要等待的时间
      const needed = count - this.tokens;
      const waitMs = Math.ceil((needed / this.refillRate) * 1000);
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(waitMs, 100)),
      );
    }

    return false;
  }

  /**
   * 补充令牌
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /**
   * 获取当前令牌数
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }
}
