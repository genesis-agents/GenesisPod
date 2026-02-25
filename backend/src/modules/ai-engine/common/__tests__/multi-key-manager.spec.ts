/**
 * Unit Tests - MultiKeyManager & MultiKeyRegistry
 */

import {
  MultiKeyManager,
  MultiKeyRegistry,
} from "../../core/utils/multi-key-manager";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeManager(cooldownMs = 5 * 60 * 1000): MultiKeyManager {
  return new MultiKeyManager("test-service", cooldownMs);
}

const KEYS = ["key-alpha", "key-beta", "key-gamma"];

// ─── MultiKeyManager tests ────────────────────────────────────────────────────

describe("MultiKeyManager", () => {
  let manager: MultiKeyManager;

  beforeEach(() => {
    jest.useFakeTimers();
    manager = makeManager(60_000); // 1 minute cooldown
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── getMaskedKey ──────────────────────────────────────────────────────────

  describe("getMaskedKey", () => {
    it("masks a normal key showing prefix and suffix", () => {
      const masked = manager.getMaskedKey("tvly-abcdefgh-xyz");
      expect(masked).toMatch(/^tvly-abc\*+xyz$/);
    });

    it("returns '****' for short keys (< 10 chars)", () => {
      expect(manager.getMaskedKey("short")).toBe("****");
      expect(manager.getMaskedKey("123456789")).toBe("****"); // exactly 9
    });

    it("returns '****' for empty string", () => {
      expect(manager.getMaskedKey("")).toBe("****");
    });

    it("shows first 8 and last 3 chars", () => {
      const key = "12345678abcxyz";
      const masked = manager.getMaskedKey(key);
      expect(masked.startsWith("12345678")).toBe(true);
      expect(masked.endsWith("xyz")).toBe(true);
    });
  });

  // ─── isKeyHealthy ──────────────────────────────────────────────────────────

  describe("isKeyHealthy", () => {
    it("returns true for a fresh key", () => {
      expect(manager.isKeyHealthy("key-alpha")).toBe(true);
    });

    it("returns false immediately after marking failed", () => {
      manager.markKeyFailed("key-alpha", 429);
      expect(manager.isKeyHealthy("key-alpha")).toBe(false);
    });

    it("returns true after cooldown period expires", () => {
      manager.markKeyFailed("key-alpha", 429);
      jest.advanceTimersByTime(61_000); // just past 60s cooldown
      expect(manager.isKeyHealthy("key-alpha")).toBe(true);
    });

    it("remains unhealthy within cooldown period", () => {
      manager.markKeyFailed("key-alpha", 429);
      jest.advanceTimersByTime(30_000); // only half the cooldown
      expect(manager.isKeyHealthy("key-alpha")).toBe(false);
    });

    it("does not affect other keys when one is marked failed", () => {
      manager.markKeyFailed("key-alpha", 429);
      expect(manager.isKeyHealthy("key-beta")).toBe(true);
    });
  });

  // ─── getHealthyKey ────────────────────────────────────────────────────────

  describe("getHealthyKey", () => {
    it("returns null for empty keys array", () => {
      expect(manager.getHealthyKey([])).toBeNull();
    });

    it("returns null for null/undefined input", () => {
      expect(manager.getHealthyKey(null as unknown as string[])).toBeNull();
    });

    it("returns a key from a single-element array", () => {
      expect(manager.getHealthyKey(["only-key"])).toBe("only-key");
    });

    it("rotates across keys in round-robin order", () => {
      const results: string[] = [];
      for (let i = 0; i < 6; i++) {
        const k = manager.getHealthyKey(KEYS);
        if (k) results.push(k);
      }
      // Should cycle through all keys
      expect(new Set(results).size).toBe(3);
    });

    it("skips unhealthy keys", () => {
      manager.markKeyFailed("key-alpha", 429);
      manager.markKeyFailed("key-beta", 429);

      // Only key-gamma is healthy; should always return it
      for (let i = 0; i < 6; i++) {
        expect(manager.getHealthyKey(KEYS)).toBe("key-gamma");
      }
    });

    it("returns a key even when all are unhealthy (fallback to first)", () => {
      KEYS.forEach((k) => manager.markKeyFailed(k, 429));
      const result = manager.getHealthyKey(KEYS);
      expect(result).not.toBeNull();
      expect(KEYS).toContain(result);
    });

    it("resumes returning recovered key after cooldown", () => {
      manager.markKeyFailed("key-alpha", 429);
      jest.advanceTimersByTime(61_000);
      // After cooldown, key-alpha should be returned again
      const returnedKeys = new Set(
        Array.from({ length: 9 }).map(() => manager.getHealthyKey(KEYS)),
      );
      expect(returnedKeys.has("key-alpha")).toBe(true);
    });
  });

  // ─── markKeyFailed ────────────────────────────────────────────────────────

  describe("markKeyFailed", () => {
    it("marks a key as unhealthy", () => {
      manager.markKeyFailed("key-alpha", 401);
      expect(manager.isKeyHealthy("key-alpha")).toBe(false);
    });

    it("can mark the same key failed multiple times (resets timer)", () => {
      manager.markKeyFailed("key-alpha", 429);
      jest.advanceTimersByTime(30_000);
      manager.markKeyFailed("key-alpha", 429); // reset
      jest.advanceTimersByTime(40_000); // total 70s, but timer was reset 40s ago
      // 40s < 60s cooldown -> still unhealthy
      expect(manager.isKeyHealthy("key-alpha")).toBe(false);
    });
  });

  // ─── clearKeyFailure ──────────────────────────────────────────────────────

  describe("clearKeyFailure", () => {
    it("clears failure state and makes key healthy again", () => {
      manager.markKeyFailed("key-alpha", 429);
      expect(manager.isKeyHealthy("key-alpha")).toBe(false);

      manager.clearKeyFailure("key-alpha");
      expect(manager.isKeyHealthy("key-alpha")).toBe(true);
    });

    it("is a no-op for a key that was never failed", () => {
      expect(() => manager.clearKeyFailure("key-never-failed")).not.toThrow();
    });
  });

  // ─── getKeyHealthStatus ───────────────────────────────────────────────────

  describe("getKeyHealthStatus", () => {
    it("returns health status for all keys", () => {
      const statuses = manager.getKeyHealthStatus(KEYS);
      expect(statuses).toHaveLength(KEYS.length);
    });

    it("marks all keys healthy when none have failed", () => {
      const statuses = manager.getKeyHealthStatus(KEYS);
      expect(statuses.every((s) => s.isHealthy)).toBe(true);
    });

    it("marks failed key as unhealthy with lastError", () => {
      manager.markKeyFailed("key-alpha", 429);
      const statuses = manager.getKeyHealthStatus(KEYS);
      const alphaStatus = statuses.find(
        (s) => s.maskedKey === manager.getMaskedKey("key-alpha"),
      );
      expect(alphaStatus?.isHealthy).toBe(false);
      expect(alphaStatus?.lastError).toBe("HTTP 429");
    });

    it("includes cooldownUntil ISO string for unhealthy keys", () => {
      manager.markKeyFailed("key-alpha", 429);
      const statuses = manager.getKeyHealthStatus(KEYS);
      const alphaStatus = statuses[0]; // key-alpha is first
      expect(typeof alphaStatus?.cooldownUntil).toBe("string");
      expect(() => new Date(alphaStatus?.cooldownUntil ?? "")).not.toThrow();
    });

    it("does not include cooldownUntil for healthy keys", () => {
      const statuses = manager.getKeyHealthStatus(KEYS);
      expect(statuses.every((s) => s.cooldownUntil === undefined)).toBe(true);
    });

    it("includes index matching array position", () => {
      const statuses = manager.getKeyHealthStatus(KEYS);
      statuses.forEach((s, i) => {
        expect(s.index).toBe(i);
      });
    });

    it("shows masked keys in status", () => {
      const statuses = manager.getKeyHealthStatus(["tvly-12345678-abc"]);
      expect(statuses[0].maskedKey).toContain("****");
    });
  });

  // ─── shouldMarkFailed static method ──────────────────────────────────────

  describe("shouldMarkFailed", () => {
    it.each([401, 429, 432, 500, 502, 503, 504])(
      "returns true for HTTP %i",
      (code) => {
        expect(MultiKeyManager.shouldMarkFailed(code)).toBe(true);
      },
    );

    it.each([200, 201, 400, 403, 404, 422])(
      "returns false for HTTP %i",
      (code) => {
        expect(MultiKeyManager.shouldMarkFailed(code)).toBe(false);
      },
    );
  });

  // ─── key isolation per service name ──────────────────────────────────────

  describe("key isolation", () => {
    it("does not share health state across different service names", () => {
      const serviceA = new MultiKeyManager("service-a", 60_000);
      const serviceB = new MultiKeyManager("service-b", 60_000);

      serviceA.markKeyFailed("shared-key", 429);

      expect(serviceA.isKeyHealthy("shared-key")).toBe(false);
      expect(serviceB.isKeyHealthy("shared-key")).toBe(true); // different service
    });
  });
});

// ─── MultiKeyRegistry tests ───────────────────────────────────────────────────

describe("MultiKeyRegistry", () => {
  // Reset the internal static map between tests
  beforeEach(() => {
    // Access the private static map and clear it
    const registryClass = MultiKeyRegistry as unknown as {
      managers: Map<string, MultiKeyManager>;
    };
    registryClass.managers.clear();
  });

  describe("getManager", () => {
    it("creates a new manager on first call", () => {
      const m = MultiKeyRegistry.getManager("svc-1");
      expect(m).toBeInstanceOf(MultiKeyManager);
    });

    it("returns the same manager on subsequent calls with same serviceName", () => {
      const m1 = MultiKeyRegistry.getManager("svc-2");
      const m2 = MultiKeyRegistry.getManager("svc-2");
      expect(m1).toBe(m2);
    });

    it("returns different managers for different service names", () => {
      const m1 = MultiKeyRegistry.getManager("svc-a");
      const m2 = MultiKeyRegistry.getManager("svc-b");
      expect(m1).not.toBe(m2);
    });

    it("respects custom cooldownMs", () => {
      const m = MultiKeyRegistry.getManager("svc-custom-cooldown", 10_000);
      m.markKeyFailed("key-x", 429);

      jest.useFakeTimers();
      jest.advanceTimersByTime(9_000);
      expect(m.isKeyHealthy("key-x")).toBe(false);

      jest.advanceTimersByTime(2_000);
      expect(m.isKeyHealthy("key-x")).toBe(true);
      jest.useRealTimers();
    });
  });

  describe("getHealthStatus", () => {
    it("returns all-healthy statuses when no manager exists for service", () => {
      const statuses = MultiKeyRegistry.getHealthStatus("nonexistent-svc", [
        "k1",
        "k2",
      ]);
      expect(statuses).toHaveLength(2);
      expect(statuses.every((s) => s.isHealthy)).toBe(true);
    });

    it("delegates to manager when one exists", () => {
      const m = MultiKeyRegistry.getManager("svc-health");
      m.markKeyFailed("my-key", 429);

      const statuses = MultiKeyRegistry.getHealthStatus("svc-health", [
        "my-key",
      ]);
      expect(statuses[0].isHealthy).toBe(false);
    });

    it("returns empty array for empty keys", () => {
      const statuses = MultiKeyRegistry.getHealthStatus("svc-empty", []);
      expect(statuses).toHaveLength(0);
    });
  });
});
