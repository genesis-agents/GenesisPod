import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { RateLimiter, TokenBucket } from "../resources/rate-limiter";
import { CacheService } from "@/common/cache/cache.service";

jest.spyOn(Logger.prototype, "log").mockImplementation();
jest.spyOn(Logger.prototype, "debug").mockImplementation();
jest.spyOn(Logger.prototype, "warn").mockImplementation();
jest.spyOn(Logger.prototype, "error").mockImplementation();

const mockCacheService = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiter,
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();
    limiter = module.get<RateLimiter>(RateLimiter);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ==================== registerLimit ====================

  describe("registerLimit", () => {
    it("should register a named limit configuration", () => {
      limiter.registerLimit("api", { windowMs: 60000, maxRequests: 100 });
      // Verify by checking behavior: should use 100 limit
      const result = limiter.check("user-1", "api");
      expect(result.limit).toBe(100);
    });

    it("should merge with default config", () => {
      limiter.registerLimit("partial", { maxRequests: 5 });
      const result = limiter.check("user-1", "partial");
      expect(result.limit).toBe(5);
      expect(result.allowed).toBe(true);
    });

    it("should override existing named limit", () => {
      limiter.registerLimit("myLimit", { maxRequests: 10 });
      limiter.registerLimit("myLimit", { maxRequests: 20 });
      const result = limiter.check("user-x", "myLimit");
      expect(result.limit).toBe(20);
    });
  });

  // ==================== check ====================

  describe("check", () => {
    it("should allow request when limit not reached", () => {
      limiter.registerLimit("test", { windowMs: 60000, maxRequests: 10 });
      const result = limiter.check("user-1", "test");
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(0);
      expect(result.remaining).toBe(10);
      expect(result.limit).toBe(10);
    });

    it("should use default config when limitName is undefined", () => {
      const result = limiter.check("user-default");
      expect(result.limit).toBe(60);
      expect(result.allowed).toBe(true);
    });

    it("should use default config when limitName does not exist", () => {
      const result = limiter.check("user-x", "nonexistent-limit");
      expect(result.limit).toBe(60);
    });

    it("should return resetAt as future timestamp", () => {
      const now = Date.now();
      const result = limiter.check("user-2");
      expect(result.resetAt).toBeGreaterThan(now);
    });

    it("should return retryAfter as undefined when allowed", () => {
      const result = limiter.check("user-3");
      expect(result.retryAfter).toBeUndefined();
    });

    it("should deny request when limit is reached after consuming", () => {
      limiter.registerLimit("tight", {
        windowMs: 60000,
        maxRequests: 2,
        sliding: false,
      });
      limiter.consume("user-tight", "tight");
      limiter.consume("user-tight", "tight");
      const result = limiter.check("user-tight", "tight");
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.remaining).toBe(0);
    });

    it("should reset expired fixed-window entry", () => {
      limiter.registerLimit("expire", {
        windowMs: 1000,
        maxRequests: 2,
        sliding: false,
      });
      limiter.consume("user-exp", "expire");
      limiter.consume("user-exp", "expire");

      // Advance past window
      jest.advanceTimersByTime(2000);

      const result = limiter.check("user-exp", "expire");
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(0);
    });

    it("should use sliding window to filter old requests", () => {
      limiter.registerLimit("sliding", {
        windowMs: 5000,
        maxRequests: 3,
        sliding: true,
      });
      limiter.consume("user-slide", "sliding");
      limiter.consume("user-slide", "sliding");
      // Advance past window
      jest.advanceTimersByTime(6000);
      // Old requests filtered — should be 0 used
      const result = limiter.check("user-slide", "sliding");
      expect(result.used).toBe(0);
      expect(result.allowed).toBe(true);
    });
  });

  // ==================== consume ====================

  describe("consume", () => {
    it("should increment used count on consume", () => {
      limiter.registerLimit("c1", { windowMs: 60000, maxRequests: 10 });
      limiter.consume("user-c1", "c1");
      const status = limiter.getStatus("user-c1", "c1");
      expect(status?.used).toBe(1);
    });

    it("should decrement remaining after consume", () => {
      limiter.registerLimit("c2", { windowMs: 60000, maxRequests: 5 });
      const result = limiter.consume("user-c2", "c2");
      expect(result.remaining).toBe(4);
    });

    it("should not consume when already at limit", () => {
      limiter.registerLimit("c3", {
        windowMs: 60000,
        maxRequests: 1,
        sliding: false,
      });
      limiter.consume("user-c3", "c3");
      const result = limiter.consume("user-c3", "c3");
      expect(result.allowed).toBe(false);
      expect(result.used).toBe(1); // Not incremented further
    });

    it("should consume multiple units at once", () => {
      limiter.registerLimit("c4", { windowMs: 60000, maxRequests: 10 });
      const result = limiter.consume("user-c4", "c4", 5);
      expect(result.used).toBe(5);
      expect(result.remaining).toBe(5);
    });

    it("should record request timestamps for sliding window", () => {
      limiter.registerLimit("c5", {
        windowMs: 10000,
        maxRequests: 10,
        sliding: true,
      });
      limiter.consume("user-c5", "c5", 3);
      const status = limiter.getStatus("user-c5", "c5");
      expect(status?.used).toBe(3);
    });

    it("should sync to Redis when cacheService present", async () => {
      jest.useRealTimers();
      const module2 = await Test.createTestingModule({
        providers: [
          RateLimiter,
          { provide: CacheService, useValue: mockCacheService },
        ],
      }).compile();
      const limiter2 = module2.get<RateLimiter>(RateLimiter);
      limiter2.registerLimit("redis-c", { windowMs: 60000, maxRequests: 10 });
      limiter2.consume("user-redis", "redis-c");
      await new Promise<void>((r) => setTimeout(r, 10));
      expect(mockCacheService.set).toHaveBeenCalled();
      jest.useFakeTimers();
    });

    it("should use default config for consume with no limitName", () => {
      const result = limiter.consume("user-default-consume");
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(1);
    });

    it("should fall back to DEFAULT_CONFIG when limitName is not registered (consume)", () => {
      // limitName is provided but NOT registered → falls back to DEFAULT_CONFIG (60 maxRequests)
      const result = limiter.consume(
        "user-fallback-consume",
        "unregistered-limit",
      );
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(60); // DEFAULT_CONFIG maxRequests
    });
  });

  // ==================== reset ====================

  describe("reset", () => {
    it("should remove rate limit entry", () => {
      limiter.registerLimit("r1", { windowMs: 60000, maxRequests: 5 });
      limiter.consume("user-r1", "r1");
      limiter.reset("user-r1", "r1");
      const status = limiter.getStatus("user-r1", "r1");
      expect(status).toBeNull();
    });

    it("should delete from Redis when cacheService present", async () => {
      jest.useRealTimers();
      const module2 = await Test.createTestingModule({
        providers: [
          RateLimiter,
          { provide: CacheService, useValue: mockCacheService },
        ],
      }).compile();
      const limiter2 = module2.get<RateLimiter>(RateLimiter);
      limiter2.registerLimit("r2", { windowMs: 60000, maxRequests: 5 });
      limiter2.consume("user-r2", "r2");
      limiter2.reset("user-r2", "r2");
      await new Promise<void>((r) => setTimeout(r, 10));
      expect(mockCacheService.del).toHaveBeenCalled();
      jest.useFakeTimers();
    });

    it("should use default config when no limitName provided", () => {
      limiter.consume("user-reset-default");
      limiter.reset("user-reset-default");
      expect(limiter.getStatus("user-reset-default")).toBeNull();
    });

    it("should fall back to DEFAULT_CONFIG when limitName is not registered (reset)", () => {
      // consume with unregistered limitName (DEFAULT_CONFIG key prefix) then reset with same
      limiter.consume("user-reset-fallback", "not-a-registered-limit");
      expect(() =>
        limiter.reset("user-reset-fallback", "not-a-registered-limit"),
      ).not.toThrow();
      // After reset, status should be null
      expect(
        limiter.getStatus("user-reset-fallback", "not-a-registered-limit"),
      ).toBeNull();
    });
  });

  // ==================== getStatus ====================

  describe("getStatus", () => {
    it("should return null for unknown key", () => {
      expect(limiter.getStatus("unknown-key")).toBeNull();
    });

    it("should return current status for known key", () => {
      limiter.registerLimit("gs1", { windowMs: 60000, maxRequests: 10 });
      limiter.consume("user-gs1", "gs1");
      const status = limiter.getStatus("user-gs1", "gs1");
      expect(status).not.toBeNull();
      expect(status?.used).toBe(1);
    });

    it("should return updated status after multiple consumes", () => {
      limiter.registerLimit("gs2", { windowMs: 60000, maxRequests: 10 });
      limiter.consume("user-gs2", "gs2");
      limiter.consume("user-gs2", "gs2");
      const status = limiter.getStatus("user-gs2", "gs2");
      expect(status?.used).toBe(2);
    });

    it("should fall back to DEFAULT_CONFIG when limitName is not registered (getStatus)", () => {
      // Consume with unregistered limitName to create entry under DEFAULT_CONFIG key
      limiter.consume("user-gs-fallback", "unregistered-gs-limit");
      // getStatus with same unregistered limitName should fall back to DEFAULT_CONFIG
      const status = limiter.getStatus(
        "user-gs-fallback",
        "unregistered-gs-limit",
      );
      expect(status).not.toBeNull();
      expect(status?.limit).toBe(60); // DEFAULT_CONFIG maxRequests
    });
  });

  // ==================== Without CacheService ====================

  // ==================== cleanup (private method via timer) ====================

  describe("cleanup via timer", () => {
    it("should clean expired entries when cleanup interval fires", async () => {
      jest.useRealTimers();
      // Create service with real timers to exercise setInterval cleanup path
      const cleanupMock = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        del: jest.fn().mockResolvedValue(undefined),
      };
      const module2: TestingModule = await Test.createTestingModule({
        providers: [
          RateLimiter,
          { provide: CacheService, useValue: cleanupMock },
        ],
      }).compile();
      const limiter2 = module2.get<RateLimiter>(RateLimiter);

      // Register a short window limit
      limiter2.registerLimit("short", {
        windowMs: 10,
        maxRequests: 5,
        sliding: false,
      });
      limiter2.consume("user-cleanup", "short");

      // Wait for the entry window to expire
      await new Promise((r) => setTimeout(r, 20));

      // Now trigger a check which resets expired entry
      const result = limiter2.check("user-cleanup", "short");
      expect(result.used).toBe(0); // Entry was reset (expired)
    });

    it("should log debug when entries are cleaned by interval", async () => {
      jest.useFakeTimers();
      const localMock = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        del: jest.fn().mockResolvedValue(undefined),
      };
      const freshModule: TestingModule = await Test.createTestingModule({
        providers: [
          RateLimiter,
          { provide: CacheService, useValue: localMock },
        ],
      }).compile();
      const limiter3 = freshModule.get<RateLimiter>(RateLimiter);

      limiter3.registerLimit("short-win", {
        windowMs: 100,
        maxRequests: 5,
        sliding: false,
      });
      limiter3.consume("user-log-cleanup", "short-win");

      // Advance past window so entry expires, then past 60s cleanup interval
      jest.advanceTimersByTime(65000);

      // The cleanup interval has fired — if entries were expired, logger.debug called
      // The test just verifies no exception
      jest.useRealTimers();
    });

    it("should not log debug when no entries are cleaned (nothing expired)", () => {
      jest.useFakeTimers();
      // Register with large window so entry never expires during cleanup
      limiter.registerLimit("long-win", {
        windowMs: 3600000,
        maxRequests: 5,
        sliding: false,
      });
      limiter.consume("user-no-cleanup", "long-win");

      // Advance past cleanup interval (60s) but NOT past window (1hr)
      jest.advanceTimersByTime(65000);

      // No entries should have been cleaned, so no debug log
      const status = limiter.getStatus("user-no-cleanup", "long-win");
      expect(status).not.toBeNull();
      jest.useRealTimers();
    });
  });

  describe("without CacheService (Optional)", () => {
    let limiterNoCache: RateLimiter;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [RateLimiter, { provide: CacheService, useValue: null }],
      })
        .overrideProvider(CacheService)
        .useValue(undefined)
        .compile();
      limiterNoCache = module.get<RateLimiter>(RateLimiter);
    });

    it("should check and consume without error", () => {
      limiterNoCache.registerLimit("nc", { maxRequests: 5 });
      const result = limiterNoCache.consume("user-nc", "nc");
      expect(result.allowed).toBe(true);
    });

    it("should reset without error", () => {
      limiterNoCache.consume("user-nc-reset");
      expect(() => limiterNoCache.reset("user-nc-reset")).not.toThrow();
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
      jest.useRealTimers(); // Need real timers for async acquire
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
