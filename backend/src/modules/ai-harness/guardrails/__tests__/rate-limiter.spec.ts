/**
 * RateLimiter spec — Redis-backed sliding window (Stateless Phase 2 P0-2)
 *
 * FakeCacheService: in-memory Map emulating CacheService get/set/del.
 * All public methods are now async; specs use await throughout.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { RateLimiter, TokenBucket } from "../resources/rate-limiter";
import { CacheService } from "@/common/cache/cache.service";

jest.spyOn(Logger.prototype, "log").mockImplementation();
jest.spyOn(Logger.prototype, "debug").mockImplementation();
jest.spyOn(Logger.prototype, "warn").mockImplementation();
jest.spyOn(Logger.prototype, "error").mockImplementation();

// ── FakeCacheService ──────────────────────────────────────────────────────

class FakeCacheService {
  private readonly store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    const val = this.store.get(key);
    // Deep-clone to prevent tests mutating stored state directly
    return val !== undefined
      ? (JSON.parse(JSON.stringify(val)) as T)
      : undefined;
  }

  async set<T>(key: string, value: T, _ttl?: number): Promise<void> {
    this.store.set(key, JSON.parse(JSON.stringify(value)));
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function buildLimiter(
  fakeCache?: FakeCacheService,
): Promise<{ limiter: RateLimiter; cache: FakeCacheService }> {
  const cache = fakeCache ?? new FakeCacheService();
  const module: TestingModule = await Test.createTestingModule({
    providers: [RateLimiter, { provide: CacheService, useValue: cache }],
  }).compile();
  return { limiter: module.get<RateLimiter>(RateLimiter), cache };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("RateLimiter", () => {
  let limiter: RateLimiter;
  let cache: FakeCacheService;

  beforeEach(async () => {
    jest.useFakeTimers();
    ({ limiter, cache } = await buildLimiter());
  });

  afterEach(() => {
    jest.useRealTimers();
    cache.clear();
  });

  // ==================== registerLimit ====================

  describe("registerLimit", () => {
    it("should register a named limit configuration", async () => {
      limiter.registerLimit("api", { windowMs: 60000, maxRequests: 100 });
      const result = await limiter.check("user-1", "api");
      expect(result.limit).toBe(100);
    });

    it("should merge with default config", async () => {
      limiter.registerLimit("partial", { maxRequests: 5 });
      const result = await limiter.check("user-1", "partial");
      expect(result.limit).toBe(5);
      expect(result.allowed).toBe(true);
    });

    it("should override existing named limit", async () => {
      limiter.registerLimit("myLimit", { maxRequests: 10 });
      limiter.registerLimit("myLimit", { maxRequests: 20 });
      const result = await limiter.check("user-x", "myLimit");
      expect(result.limit).toBe(20);
    });
  });

  // ==================== check ====================

  describe("check", () => {
    it("should allow request when limit not reached", async () => {
      limiter.registerLimit("test", { windowMs: 60000, maxRequests: 10 });
      const result = await limiter.check("user-1", "test");
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(0);
      expect(result.remaining).toBe(10);
      expect(result.limit).toBe(10);
    });

    it("should use default config when limitName is undefined", async () => {
      const result = await limiter.check("user-default");
      expect(result.limit).toBe(60);
      expect(result.allowed).toBe(true);
    });

    it("should use default config when limitName does not exist", async () => {
      const result = await limiter.check("user-x", "nonexistent-limit");
      expect(result.limit).toBe(60);
    });

    it("should return resetAt as future timestamp", async () => {
      const now = Date.now();
      const result = await limiter.check("user-2");
      expect(result.resetAt).toBeGreaterThan(now);
    });

    it("should return retryAfter as undefined when allowed", async () => {
      const result = await limiter.check("user-3");
      expect(result.retryAfter).toBeUndefined();
    });

    it("should deny request when limit is reached after consuming", async () => {
      limiter.registerLimit("tight", {
        windowMs: 60000,
        maxRequests: 2,
        sliding: false,
      });
      await limiter.consume("user-tight", "tight");
      await limiter.consume("user-tight", "tight");
      const result = await limiter.check("user-tight", "tight");
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.remaining).toBe(0);
    });

    it("should use sliding window to filter old requests", async () => {
      limiter.registerLimit("sliding", {
        windowMs: 5000,
        maxRequests: 3,
        sliding: true,
      });
      await limiter.consume("user-slide", "sliding");
      await limiter.consume("user-slide", "sliding");
      // Advance past window
      jest.advanceTimersByTime(6000);
      // Old requests filtered — should be 0 used
      const result = await limiter.check("user-slide", "sliding");
      expect(result.used).toBe(0);
      expect(result.allowed).toBe(true);
    });
  });

  // ==================== consume ====================

  describe("consume", () => {
    it("should increment used count on consume", async () => {
      limiter.registerLimit("c1", { windowMs: 60000, maxRequests: 10 });
      await limiter.consume("user-c1", "c1");
      const status = await limiter.getStatus("user-c1", "c1");
      expect(status?.used).toBe(1);
    });

    it("should decrement remaining after consume", async () => {
      limiter.registerLimit("c2", { windowMs: 60000, maxRequests: 5 });
      const result = await limiter.consume("user-c2", "c2");
      expect(result.remaining).toBe(4);
    });

    it("should not consume when already at limit", async () => {
      limiter.registerLimit("c3", {
        windowMs: 60000,
        maxRequests: 1,
        sliding: false,
      });
      await limiter.consume("user-c3", "c3");
      const result = await limiter.consume("user-c3", "c3");
      expect(result.allowed).toBe(false);
      expect(result.used).toBe(1); // Not incremented further
    });

    it("should consume multiple units at once", async () => {
      limiter.registerLimit("c4", { windowMs: 60000, maxRequests: 10 });
      const result = await limiter.consume("user-c4", "c4", 5);
      expect(result.used).toBe(5);
      expect(result.remaining).toBe(5);
    });

    it("should record request timestamps for sliding window", async () => {
      limiter.registerLimit("c5", {
        windowMs: 10000,
        maxRequests: 10,
        sliding: true,
      });
      await limiter.consume("user-c5", "c5", 3);
      const status = await limiter.getStatus("user-c5", "c5");
      expect(status?.used).toBe(3);
    });

    it("should write timestamps to Redis on consume", async () => {
      limiter.registerLimit("redis-c", { windowMs: 60000, maxRequests: 10 });
      await limiter.consume("user-redis", "redis-c");
      // Verify Redis key exists by checking status
      const status = await limiter.getStatus("user-redis", "redis-c");
      expect(status).not.toBeNull();
      expect(status?.used).toBe(1);
    });

    it("should use default config for consume with no limitName", async () => {
      const result = await limiter.consume("user-default-consume");
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(1);
    });

    it("should fall back to DEFAULT_CONFIG when limitName is not registered", async () => {
      const result = await limiter.consume(
        "user-fallback-consume",
        "unregistered-limit",
      );
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(60); // DEFAULT_CONFIG maxRequests
    });
  });

  // ==================== reset ====================

  describe("reset", () => {
    it("should remove rate limit entry", async () => {
      limiter.registerLimit("r1", { windowMs: 60000, maxRequests: 5 });
      await limiter.consume("user-r1", "r1");
      await limiter.reset("user-r1", "r1");
      const status = await limiter.getStatus("user-r1", "r1");
      expect(status).toBeNull();
    });

    it("should delete from Redis on reset", async () => {
      limiter.registerLimit("r2", { windowMs: 60000, maxRequests: 5 });
      await limiter.consume("user-r2", "r2");
      await limiter.reset("user-r2", "r2");
      // After reset, key is gone from cache — getStatus returns null
      const status = await limiter.getStatus("user-r2", "r2");
      expect(status).toBeNull();
    });

    it("should use default config when no limitName provided", async () => {
      await limiter.consume("user-reset-default");
      await limiter.reset("user-reset-default");
      expect(await limiter.getStatus("user-reset-default")).toBeNull();
    });

    it("should not throw when resetting a non-existent key", async () => {
      await expect(
        limiter.reset("user-nonexistent", "not-a-registered-limit"),
      ).resolves.not.toThrow();
    });
  });

  // ==================== getStatus ====================

  describe("getStatus", () => {
    it("should return null for unknown key", async () => {
      expect(await limiter.getStatus("unknown-key")).toBeNull();
    });

    it("should return current status for known key", async () => {
      limiter.registerLimit("gs1", { windowMs: 60000, maxRequests: 10 });
      await limiter.consume("user-gs1", "gs1");
      const status = await limiter.getStatus("user-gs1", "gs1");
      expect(status).not.toBeNull();
      expect(status?.used).toBe(1);
    });

    it("should return updated status after multiple consumes", async () => {
      limiter.registerLimit("gs2", { windowMs: 60000, maxRequests: 10 });
      await limiter.consume("user-gs2", "gs2");
      await limiter.consume("user-gs2", "gs2");
      const status = await limiter.getStatus("user-gs2", "gs2");
      expect(status?.used).toBe(2);
    });

    it("should fall back to DEFAULT_CONFIG when limitName is not registered", async () => {
      await limiter.consume("user-gs-fallback", "unregistered-gs-limit");
      const status = await limiter.getStatus(
        "user-gs-fallback",
        "unregistered-gs-limit",
      );
      expect(status).not.toBeNull();
      expect(status?.limit).toBe(60);
    });

    it("should return null for expired-only timestamps", async () => {
      limiter.registerLimit("gs-expire", {
        windowMs: 1000,
        maxRequests: 5,
        sliding: true,
      });
      await limiter.consume("user-gs-expire", "gs-expire");
      jest.advanceTimersByTime(2000);
      const status = await limiter.getStatus("user-gs-expire", "gs-expire");
      expect(status).toBeNull();
    });
  });

  // ==================== Sliding window cross-pod semantics ====================

  describe("sliding window via Redis (multi-pod consistency)", () => {
    it("should share state between two limiter instances using same cache", async () => {
      jest.useRealTimers();
      const sharedCache = new FakeCacheService();
      const { limiter: pod1 } = await buildLimiter(sharedCache);
      const { limiter: pod2 } = await buildLimiter(sharedCache);

      pod1.registerLimit("shared", { windowMs: 60000, maxRequests: 2 });
      pod2.registerLimit("shared", { windowMs: 60000, maxRequests: 2 });

      await pod1.consume("user-shared", "shared");
      await pod2.consume("user-shared", "shared");

      // Both pods consumed → at limit
      const result = await pod1.check("user-shared", "shared");
      expect(result.allowed).toBe(false);
    });

    it("should allow remaining quota visible across pods", async () => {
      jest.useRealTimers();
      const sharedCache = new FakeCacheService();
      const { limiter: pod1 } = await buildLimiter(sharedCache);
      const { limiter: pod2 } = await buildLimiter(sharedCache);

      pod1.registerLimit("cross", { windowMs: 60000, maxRequests: 5 });
      pod2.registerLimit("cross", { windowMs: 60000, maxRequests: 5 });

      await pod1.consume("user-cross", "cross");
      const statusFromPod2 = await pod2.getStatus("user-cross", "cross");
      expect(statusFromPod2?.used).toBe(1);
      expect(statusFromPod2?.remaining).toBe(4);
    });
  });
});

// ==================== TokenBucket ====================

describe("TokenBucket", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should start with full capacity", () => {
      const bucket = new TokenBucket(100, 10);
      expect(bucket.getTokens()).toBe(100);
    });
  });

  describe("tryAcquire", () => {
    it("should acquire tokens when bucket has enough", () => {
      const bucket = new TokenBucket(10, 1);
      expect(bucket.tryAcquire(5)).toBe(true);
      expect(bucket.getTokens()).toBeCloseTo(5, 0);
    });

    it("should fail to acquire when bucket is empty", () => {
      const bucket = new TokenBucket(5, 1);
      bucket.tryAcquire(5);
      expect(bucket.tryAcquire(1)).toBe(false);
    });

    it("should acquire 1 token by default", () => {
      const bucket = new TokenBucket(10, 1);
      expect(bucket.tryAcquire()).toBe(true);
      expect(bucket.getTokens()).toBeCloseTo(9, 0);
    });

    it("should refill tokens over time", () => {
      const bucket = new TokenBucket(10, 5); // 5 tokens/sec
      bucket.tryAcquire(10); // Empty the bucket
      expect(bucket.tryAcquire(1)).toBe(false);

      // Advance 1 second (5 tokens added)
      jest.advanceTimersByTime(1000);
      expect(bucket.tryAcquire(5)).toBe(true);
    });

    it("should not exceed capacity when refilling", () => {
      const bucket = new TokenBucket(10, 100);
      // Advance lots of time
      jest.advanceTimersByTime(10000);
      expect(bucket.getTokens()).toBeLessThanOrEqual(10);
    });
  });

  describe("acquire (async)", () => {
    it("should immediately return true when tokens are available", async () => {
      jest.useRealTimers();
      const bucket = new TokenBucket(10, 1);
      const result = await bucket.acquire(5);
      expect(result).toBe(true);
    });

    it("should return false after timeout when tokens are not available", async () => {
      jest.useRealTimers();
      const bucket = new TokenBucket(5, 0.001); // Very slow refill
      bucket.tryAcquire(5); // Empty the bucket
      const result = await bucket.acquire(5, 50); // 50ms timeout
      expect(result).toBe(false);
    }, 1000);

    it("should wait and succeed when tokens refill in time", async () => {
      jest.useRealTimers();
      const bucket = new TokenBucket(10, 100); // 100 tokens/sec = very fast refill
      bucket.tryAcquire(10); // Empty the bucket
      // 1 token at 100/sec = 10ms
      const result = await bucket.acquire(1, 500);
      expect(result).toBe(true);
    }, 2000);
  });

  describe("getTokens", () => {
    it("should return current token count and trigger refill", () => {
      const bucket = new TokenBucket(10, 2); // 2 tokens/sec
      bucket.tryAcquire(10); // Empty
      jest.advanceTimersByTime(1000); // +2 tokens
      const tokens = bucket.getTokens();
      expect(tokens).toBeCloseTo(2, 0);
    });
  });
});
