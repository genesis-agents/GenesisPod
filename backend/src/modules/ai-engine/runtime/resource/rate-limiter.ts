/**
 * AI Engine - Rate Limiter
 * 速率限制器实现
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { CacheService } from "@/common/cache/cache.service";

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
 * 速率限制条目
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
  requests: number[]; // 滑动窗口用
}

/**
 * 速率限制器
 */
@Injectable()
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);
  private readonly entries = new Map<string, RateLimitEntry>();
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

  constructor(@Optional() private readonly cacheService?: CacheService) {
    // 定期清理过期条目
    setInterval(() => this.cleanup(), 60000).unref();
  }

  /**
   * 同步条目到 Redis（CacheService 内部已容错，失败不影响主流程）
   */
  private syncEntryToRedis(
    config: RateLimitConfig,
    key: string,
    entry: RateLimitEntry,
  ): void {
    if (!this.cacheService) return;
    const rKey = `ai:ratelimit:${config.keyPrefix}:${key}`;
    const ttl = Math.ceil((config.windowMs * 2) / 1000);
    void this.cacheService.set(
      rKey,
      { count: entry.count, resetAt: entry.resetAt, requests: entry.requests },
      ttl,
    );
  }

  /**
   * 注册限制配置
   */
  registerLimit(name: string, config: Partial<RateLimitConfig>): void {
    this.configs.set(name, { ...RateLimiter.DEFAULT_CONFIG, ...config });
  }

  /**
   * 检查速率限制
   */
  check(key: string, limitName?: string): RateLimitResult {
    const config = limitName
      ? this.configs.get(limitName) || RateLimiter.DEFAULT_CONFIG
      : RateLimiter.DEFAULT_CONFIG;

    const fullKey = `${config.keyPrefix}:${key}`;
    const now = Date.now();

    let entry = this.entries.get(fullKey);

    // 创建新条目或重置过期条目
    if (!entry || entry.resetAt <= now) {
      entry = {
        count: 0,
        resetAt: now + config.windowMs,
        requests: [],
      };
      this.entries.set(fullKey, entry);
    }

    // 滑动窗口处理
    if (config.sliding && entry.requests) {
      // 移除窗口外的请求
      const windowStart = now - config.windowMs;
      entry.requests = entry.requests.filter((t) => t > windowStart);
      entry.count = entry.requests.length;
    }

    const remaining = Math.max(0, config.maxRequests - entry.count);
    const allowed = entry.count < config.maxRequests;

    return {
      allowed,
      remaining,
      resetAt: entry.resetAt,
      retryAfter: allowed ? undefined : entry.resetAt - now,
      used: entry.count,
      limit: config.maxRequests,
    };
  }

  /**
   * 消费配额
   */
  consume(key: string, limitName?: string, count = 1): RateLimitResult {
    const result = this.check(key, limitName);

    if (!result.allowed) {
      return result;
    }

    const config = limitName
      ? this.configs.get(limitName) || RateLimiter.DEFAULT_CONFIG
      : RateLimiter.DEFAULT_CONFIG;

    const fullKey = `${config.keyPrefix}:${key}`;
    const entry = this.entries.get(fullKey)!;
    const now = Date.now();

    // 更新计数
    entry.count += count;

    // 滑动窗口记录请求时间
    if (config.sliding) {
      for (let i = 0; i < count; i++) {
        entry.requests.push(now);
      }
    }

    // Sync to Redis (fire-and-forget, CacheService handles errors internally)
    this.syncEntryToRedis(config, key, entry);

    return {
      allowed: true,
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetAt: entry.resetAt,
      used: entry.count,
      limit: config.maxRequests,
    };
  }

  /**
   * 重置限制
   */
  reset(key: string, limitName?: string): void {
    const config = limitName
      ? this.configs.get(limitName) || RateLimiter.DEFAULT_CONFIG
      : RateLimiter.DEFAULT_CONFIG;

    const fullKey = `${config.keyPrefix}:${key}`;
    this.entries.delete(fullKey);

    // Delete from Redis
    if (this.cacheService) {
      void this.cacheService.del(`ai:ratelimit:${config.keyPrefix}:${key}`);
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(key: string, limitName?: string): RateLimitResult | null {
    const config = limitName
      ? this.configs.get(limitName) || RateLimiter.DEFAULT_CONFIG
      : RateLimiter.DEFAULT_CONFIG;

    const fullKey = `${config.keyPrefix}:${key}`;
    const entry = this.entries.get(fullKey);

    if (!entry) {
      return null;
    }

    return this.check(key, limitName);
  }

  /**
   * 清理过期条目
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
    }
  }
}

/**
 * Token 桶限流器
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
