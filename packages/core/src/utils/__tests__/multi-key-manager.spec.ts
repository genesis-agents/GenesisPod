import { MultiKeyManager, MultiKeyRegistry, KeyHealthStatus } from "../multi-key-manager";

// ─── helpers ────────────────────────────────────────────────────────────────

const COOLDOWN_MS = 10_000; // 10 s – short enough to advance easily

function makeManager(cooldown = COOLDOWN_MS): MultiKeyManager {
  return new MultiKeyManager("test-service", cooldown);
}

// Wipe MultiKeyRegistry's private static Map between tests so instances
// created in one test do not leak into another.
function clearRegistry(): void {
  // Access private static field via bracket notation for testing purposes
  (MultiKeyRegistry as unknown as { managers: Map<string, MultiKeyManager> })
    .managers.clear();
}

// ─── MultiKeyManager ────────────────────────────────────────────────────────

describe("MultiKeyManager", () => {
  // ── getMaskedKey ──────────────────────────────────────────────────────────

  describe("getMaskedKey", () => {
    it("masks a normal key – shows first 8 chars, ****, last 3 chars", () => {
      const manager = makeManager();
      expect(manager.getMaskedKey("tvly-abcdefghijklmnop")).toBe(
        "tvly-abc****nop",
      );
    });

    it("masks an exactly 10-char key correctly", () => {
      const manager = makeManager();
      // length = 10, prefix = first 8 = "12345678", suffix = last 3 = "890"... wait: "1234567890"
      // prefix = "12345678", suffix = "890" → "12345678****890"
      // but wait the key is 10 chars so prefix[0..7]="12345678", suffix[-3:]="890"? No: "1234567890"[-3:]="890"
      // However: "1234567890".substring(0,8)="12345678", substring(10-3)=substring(7)="890"... "12345678"+"****"+"890"
      // but that overlaps (index 7 is "8" and last-3 starts at index 7 too)
      // The implementation is correct for this: it just concatenates, overlapping display chars are fine
      expect(manager.getMaskedKey("1234567890")).toBe("12345678****890");
    });

    it("returns **** for a short key (length < 10)", () => {
      const manager = makeManager();
      expect(manager.getMaskedKey("abc")).toBe("****");
      expect(manager.getMaskedKey("123456789")).toBe("****"); // length 9
    });

    it("returns **** for an empty string", () => {
      const manager = makeManager();
      expect(manager.getMaskedKey("")).toBe("****");
    });

    it("returns **** for a key of exactly length 1", () => {
      const manager = makeManager();
      expect(manager.getMaskedKey("x")).toBe("****");
    });

    it("handles a long key with distinctive prefix and suffix", () => {
      const manager = makeManager();
      const key = "sk-AAAAAAAAAAAAAAAA-BBBBBBBBBBBBB-CCCCCC";
      const masked = manager.getMaskedKey(key);
      expect(masked).toMatch(/^sk-AAAAA\*{4}/);
      expect(masked.endsWith("CCC")).toBe(true);
    });
  });

  // ── isKeyHealthy ──────────────────────────────────────────────────────────

  describe("isKeyHealthy", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("returns true for a key that has never been marked failed", () => {
      const manager = makeManager();
      expect(manager.isKeyHealthy("key-never-seen")).toBe(true);
    });

    it("returns false immediately after markKeyFailed", () => {
      const manager = makeManager();
      manager.markKeyFailed("my-key", 429);
      expect(manager.isKeyHealthy("my-key")).toBe(false);
    });

    it("returns false before cooldown expires", () => {
      const manager = makeManager();
      manager.markKeyFailed("my-key", 429);
      jest.advanceTimersByTime(COOLDOWN_MS - 1);
      expect(manager.isKeyHealthy("my-key")).toBe(false);
    });

    it("returns true once cooldown has fully elapsed", () => {
      const manager = makeManager();
      manager.markKeyFailed("my-key", 429);
      jest.advanceTimersByTime(COOLDOWN_MS);
      expect(manager.isKeyHealthy("my-key")).toBe(true);
    });

    it("returns true well after cooldown has elapsed", () => {
      const manager = makeManager();
      manager.markKeyFailed("my-key", 401);
      jest.advanceTimersByTime(COOLDOWN_MS * 2);
      expect(manager.isKeyHealthy("my-key")).toBe(true);
    });

    it("health is tracked per key (one failed key does not affect another)", () => {
      const manager = makeManager();
      manager.markKeyFailed("key-a", 429);
      expect(manager.isKeyHealthy("key-a")).toBe(false);
      expect(manager.isKeyHealthy("key-b")).toBe(true);
    });

    it("two managers with the same service name share the same hash space but are independent instances", () => {
      const m1 = new MultiKeyManager("svc");
      const m2 = new MultiKeyManager("svc");
      m1.markKeyFailed("key-x", 429);
      // m2 is a separate instance with its own Map
      expect(m2.isKeyHealthy("key-x")).toBe(true);
    });
  });

  // ── getHealthyKey ─────────────────────────────────────────────────────────

  describe("getHealthyKey", () => {
    it("returns null for an empty array", () => {
      const manager = makeManager();
      expect(manager.getHealthyKey([])).toBeNull();
    });

    it("returns null for a null-ish input (empty array guard)", () => {
      const manager = makeManager();
      expect(manager.getHealthyKey([] as string[])).toBeNull();
    });

    it("returns the only key when there is one key", () => {
      const manager = makeManager();
      expect(manager.getHealthyKey(["only-key"])).toBe("only-key");
    });

    it("performs round-robin through 3 keys over successive calls", () => {
      const manager = makeManager();
      const keys = ["key-0", "key-1", "key-2"];

      const first = manager.getHealthyKey(keys);
      const second = manager.getHealthyKey(keys);
      const third = manager.getHealthyKey(keys);

      // Each call must return a different key; together they cover all three
      expect(new Set([first, second, third])).toEqual(new Set(keys));
      // And the order must be sequential (0 → 1 → 2)
      expect(first).toBe("key-0");
      expect(second).toBe("key-1");
      expect(third).toBe("key-2");
    });

    it("skips a failed key and returns the next healthy one", () => {
      const manager = makeManager();
      const keys = ["key-0", "key-1", "key-2"];
      manager.markKeyFailed("key-0", 429);

      // First call: key-0 is unhealthy, should skip to key-1
      expect(manager.getHealthyKey(keys)).toBe("key-1");
    });

    it("wraps around to the beginning after exhausting keys", () => {
      const manager = makeManager();
      const keys = ["key-0", "key-1"];
      manager.getHealthyKey(keys); // consumes key-0
      manager.getHealthyKey(keys); // consumes key-1
      // Should wrap back to key-0
      expect(manager.getHealthyKey(keys)).toBe("key-0");
    });

    it("returns the current-index key when ALL keys are unhealthy (fallback)", () => {
      const manager = makeManager();
      const keys = ["key-0", "key-1", "key-2"];
      manager.markKeyFailed("key-0", 429);
      manager.markKeyFailed("key-1", 429);
      manager.markKeyFailed("key-2", 429);

      // All unhealthy – implementation returns keys[startIndex] (index 0 for a fresh manager)
      const result = manager.getHealthyKey(keys);
      expect(keys).toContain(result);
    });

    it("returns a result (not null) even when every key is unhealthy", () => {
      const manager = makeManager();
      const keys = ["a", "b", "c"];
      keys.forEach((k) => manager.markKeyFailed(k, 503));
      expect(manager.getHealthyKey(keys)).not.toBeNull();
    });

    it("all-unhealthy fallback advances the internal index for the next call", () => {
      const manager = makeManager();
      const keys = ["key-0", "key-1", "key-2"];
      keys.forEach((k) => manager.markKeyFailed(k, 429));

      const first = manager.getHealthyKey(keys);
      const second = manager.getHealthyKey(keys);

      // Both calls return a valid key (not null / undefined)
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      // They must be consecutive in the ring (second = first index + 1 mod 3)
      const firstIdx = keys.indexOf(first!);
      const secondIdx = keys.indexOf(second!);
      expect(secondIdx).toBe((firstIdx + 1) % keys.length);
    });

    it("resumes healthy selection after one key recovers from cooldown", () => {
      jest.useFakeTimers();
      try {
        const manager = makeManager();
        const keys = ["key-0", "key-1"];
        manager.markKeyFailed("key-0", 429);
        manager.markKeyFailed("key-1", 429);

        // Both unhealthy; advance past cooldown
        jest.advanceTimersByTime(COOLDOWN_MS + 1);

        // Both should now be healthy again
        const result = manager.getHealthyKey(keys);
        expect(keys).toContain(result);
        expect(manager.isKeyHealthy(result!)).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ── markKeyFailed ─────────────────────────────────────────────────────────

  describe("markKeyFailed", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("records the failure so isKeyHealthy returns false", () => {
      const manager = makeManager();
      manager.markKeyFailed("k1", 429);
      expect(manager.isKeyHealthy("k1")).toBe(false);
    });

    it("overwriting an old failure resets the cooldown timer", () => {
      const manager = makeManager();
      manager.markKeyFailed("k1", 429);
      jest.advanceTimersByTime(COOLDOWN_MS - 500); // almost expired
      // Mark failed again – timer restarts
      manager.markKeyFailed("k1", 503);
      jest.advanceTimersByTime(600); // original cooldown would have expired but new one hasn't
      expect(manager.isKeyHealthy("k1")).toBe(false);
    });

    it("records different error codes for different keys independently", () => {
      const manager = makeManager();
      manager.markKeyFailed("k1", 401);
      manager.markKeyFailed("k2", 429);
      expect(manager.isKeyHealthy("k1")).toBe(false);
      expect(manager.isKeyHealthy("k2")).toBe(false);
      expect(manager.isKeyHealthy("k3")).toBe(true);
    });
  });

  // ── clearKeyFailure ───────────────────────────────────────────────────────

  describe("clearKeyFailure", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("restores isKeyHealthy to true after clearing a failed key", () => {
      const manager = makeManager();
      manager.markKeyFailed("k1", 429);
      expect(manager.isKeyHealthy("k1")).toBe(false);
      manager.clearKeyFailure("k1");
      expect(manager.isKeyHealthy("k1")).toBe(true);
    });

    it("clearing a key that was never failed is a no-op", () => {
      const manager = makeManager();
      expect(() => manager.clearKeyFailure("never-failed")).not.toThrow();
      expect(manager.isKeyHealthy("never-failed")).toBe(true);
    });

    it("only clears the targeted key, not siblings", () => {
      const manager = makeManager();
      manager.markKeyFailed("k1", 429);
      manager.markKeyFailed("k2", 429);
      manager.clearKeyFailure("k1");
      expect(manager.isKeyHealthy("k1")).toBe(true);
      expect(manager.isKeyHealthy("k2")).toBe(false);
    });

    it("re-marking after clearing works normally", () => {
      const manager = makeManager();
      manager.markKeyFailed("k1", 429);
      manager.clearKeyFailure("k1");
      manager.markKeyFailed("k1", 401);
      expect(manager.isKeyHealthy("k1")).toBe(false);
    });
  });

  // ── getKeyHealthStatus ────────────────────────────────────────────────────

  describe("getKeyHealthStatus", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("returns an entry per key with correct index", () => {
      const manager = makeManager();
      const keys = ["k0", "k1", "k2"];
      const statuses = manager.getKeyHealthStatus(keys);
      expect(statuses).toHaveLength(3);
      statuses.forEach((s, i) => expect(s.index).toBe(i));
    });

    it("marks all keys healthy when none have failed", () => {
      const manager = makeManager();
      const keys = ["k0", "k1"];
      const statuses = manager.getKeyHealthStatus(keys);
      expect(statuses.every((s) => s.isHealthy)).toBe(true);
    });

    it("marks a failed key as unhealthy with correct lastError", () => {
      const manager = makeManager();
      manager.markKeyFailed("k1", 429);
      const statuses = manager.getKeyHealthStatus(["k0", "k1"]);

      const k0Status = statuses[0];
      const k1Status = statuses[1];

      expect(k0Status.isHealthy).toBe(true);
      expect(k0Status.lastError).toBeUndefined();
      expect(k0Status.cooldownUntil).toBeUndefined();

      expect(k1Status.isHealthy).toBe(false);
      expect(k1Status.lastError).toBe("HTTP 429");
    });

    it("provides cooldownUntil as an ISO string for unhealthy keys", () => {
      const manager = makeManager();
      const now = Date.now();
      manager.markKeyFailed("k1", 429);

      const statuses = manager.getKeyHealthStatus(["k1"]);
      const { cooldownUntil } = statuses[0];

      expect(cooldownUntil).toBeDefined();
      // Must be a valid ISO 8601 string
      expect(() => new Date(cooldownUntil!)).not.toThrow();
      // Must be approximately now + cooldown
      const cooldownTime = new Date(cooldownUntil!).getTime();
      expect(cooldownTime).toBeGreaterThanOrEqual(now + COOLDOWN_MS - 50);
      expect(cooldownTime).toBeLessThanOrEqual(now + COOLDOWN_MS + 50);
    });

    it("does not set cooldownUntil for healthy keys", () => {
      const manager = makeManager();
      const statuses = manager.getKeyHealthStatus(["k0"]);
      expect(statuses[0].cooldownUntil).toBeUndefined();
    });

    it("does not set cooldownUntil once cooldown has expired", () => {
      const manager = makeManager();
      manager.markKeyFailed("k1", 429);
      jest.advanceTimersByTime(COOLDOWN_MS + 1);
      const statuses = manager.getKeyHealthStatus(["k1"]);
      expect(statuses[0].isHealthy).toBe(true);
      expect(statuses[0].cooldownUntil).toBeUndefined();
    });

    it("includes maskedKey for each entry", () => {
      const manager = makeManager();
      const key = "tvly-abcdefghijklmnop";
      const statuses = manager.getKeyHealthStatus([key]);
      expect(statuses[0].maskedKey).toBe("tvly-abc****nop");
    });

    it("shows lastError even after cooldown expires (historical record)", () => {
      const manager = makeManager();
      manager.markKeyFailed("k1", 401);
      jest.advanceTimersByTime(COOLDOWN_MS + 1);
      const statuses = manager.getKeyHealthStatus(["k1"]);
      // Key is now healthy
      expect(statuses[0].isHealthy).toBe(true);
      // But lastError is still present (health entry not removed, just ignored)
      expect(statuses[0].lastError).toBe("HTTP 401");
    });

    it("returns empty array for empty keys input", () => {
      const manager = makeManager();
      expect(manager.getKeyHealthStatus([])).toEqual([]);
    });

    it("handles a mix of healthy, unhealthy, and recovered keys", () => {
      const manager = makeManager();
      const keys = ["healthy", "unhealthy", "recovered"];

      manager.markKeyFailed("unhealthy", 503);
      manager.markKeyFailed("recovered", 429);
      jest.advanceTimersByTime(COOLDOWN_MS + 1);
      manager.markKeyFailed("unhealthy", 503); // re-mark so it stays unhealthy

      const statuses: KeyHealthStatus[] = manager.getKeyHealthStatus(keys);
      const byKey = Object.fromEntries(
        statuses.map((s, i) => [keys[i], s]),
      );

      expect(byKey["healthy"].isHealthy).toBe(true);
      expect(byKey["unhealthy"].isHealthy).toBe(false);
      expect(byKey["recovered"].isHealthy).toBe(true);
    });
  });

  // ── shouldMarkFailed (static) ─────────────────────────────────────────────

  describe("shouldMarkFailed", () => {
    it.each([401, 429, 432, 500, 502, 503, 504])(
      "returns true for error code %i",
      (code) => {
        expect(MultiKeyManager.shouldMarkFailed(code)).toBe(true);
      },
    );

    it.each([200, 201, 204, 301, 302, 400, 403, 404, 408, 422])(
      "returns false for error code %i",
      (code) => {
        expect(MultiKeyManager.shouldMarkFailed(code)).toBe(false);
      },
    );

    it("returns false for code 0 (unknown/no error)", () => {
      expect(MultiKeyManager.shouldMarkFailed(0)).toBe(false);
    });

    it("returns false for negative codes", () => {
      expect(MultiKeyManager.shouldMarkFailed(-1)).toBe(false);
    });
  });
});

// ─── MultiKeyRegistry ────────────────────────────────────────────────────────

describe("MultiKeyRegistry", () => {
  beforeEach(() => clearRegistry());
  afterEach(() => clearRegistry());

  // ── getManager ────────────────────────────────────────────────────────────

  describe("getManager", () => {
    it("creates a new MultiKeyManager for an unknown service name", () => {
      const manager = MultiKeyRegistry.getManager("svc-a");
      expect(manager).toBeInstanceOf(MultiKeyManager);
    });

    it("returns the same instance on subsequent calls for the same service", () => {
      const m1 = MultiKeyRegistry.getManager("svc-a");
      const m2 = MultiKeyRegistry.getManager("svc-a");
      expect(m1).toBe(m2);
    });

    it("returns different instances for different service names", () => {
      const m1 = MultiKeyRegistry.getManager("svc-a");
      const m2 = MultiKeyRegistry.getManager("svc-b");
      expect(m1).not.toBe(m2);
    });

    it("ignores cooldownMs on second call (instance already cached)", () => {
      const m1 = MultiKeyRegistry.getManager("svc-a", 1_000);
      const m2 = MultiKeyRegistry.getManager("svc-a", 99_000);
      expect(m1).toBe(m2);
    });

    it("uses the provided cooldownMs when creating a new manager", () => {
      jest.useFakeTimers();
      try {
        const cooldown = 2_000;
        const manager = MultiKeyRegistry.getManager("svc-custom", cooldown);
        manager.markKeyFailed("k1", 429);
        jest.advanceTimersByTime(cooldown);
        expect(manager.isKeyHealthy("k1")).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it("state persists across getManager calls (same instance)", () => {
      const m1 = MultiKeyRegistry.getManager("svc-persist");
      m1.markKeyFailed("k1", 429);

      const m2 = MultiKeyRegistry.getManager("svc-persist");
      expect(m2.isKeyHealthy("k1")).toBe(false);
    });
  });

  // ── getHealthStatus ───────────────────────────────────────────────────────

  describe("getHealthStatus", () => {
    it("returns all-healthy status when no manager exists for the service", () => {
      const keys = ["k0", "k1", "k2"];
      const statuses = MultiKeyRegistry.getHealthStatus("unknown-svc", keys);

      expect(statuses).toHaveLength(3);
      statuses.forEach((s, i) => {
        expect(s.index).toBe(i);
        expect(s.isHealthy).toBe(true);
        expect(s.lastError).toBeUndefined();
        expect(s.cooldownUntil).toBeUndefined();
      });
    });

    it("includes maskedKey even when returning fallback healthy statuses", () => {
      const key = "tvly-abcdefghijklmnop";
      const statuses = MultiKeyRegistry.getHealthStatus("unknown-svc", [key]);
      expect(statuses[0].maskedKey).toBe("tvly-abc****nop");
    });

    it("returns masked **** for short keys in fallback mode", () => {
      const statuses = MultiKeyRegistry.getHealthStatus("unknown-svc", ["abc"]);
      expect(statuses[0].maskedKey).toBe("****");
    });

    it("delegates to the existing manager when one is cached", () => {
      const manager = MultiKeyRegistry.getManager("svc-x");
      manager.markKeyFailed("k0", 429);

      const statuses = MultiKeyRegistry.getHealthStatus("svc-x", ["k0", "k1"]);
      expect(statuses[0].isHealthy).toBe(false);
      expect(statuses[1].isHealthy).toBe(true);
    });

    it("does NOT create a cached manager entry for an unknown service", () => {
      MultiKeyRegistry.getHealthStatus("temp-svc", ["k0"]);
      // Calling getManager after should create a fresh manager (no prior state)
      const manager = MultiKeyRegistry.getManager("temp-svc");
      // A brand-new manager will have no failures recorded
      expect(manager.isKeyHealthy("k0")).toBe(true);
    });

    it("returns empty array when keys array is empty and no manager exists", () => {
      const statuses = MultiKeyRegistry.getHealthStatus("unknown-svc", []);
      expect(statuses).toEqual([]);
    });

    it("returns empty array when keys array is empty and manager exists", () => {
      MultiKeyRegistry.getManager("svc-empty");
      const statuses = MultiKeyRegistry.getHealthStatus("svc-empty", []);
      expect(statuses).toEqual([]);
    });
  });

  // ── cross-service isolation ───────────────────────────────────────────────

  describe("cross-service isolation", () => {
    it("failure in one service does not affect another", () => {
      const mA = MultiKeyRegistry.getManager("svc-iso-a");
      MultiKeyRegistry.getManager("svc-iso-b");

      mA.markKeyFailed("shared-key", 429);

      const statusesA = MultiKeyRegistry.getHealthStatus("svc-iso-a", [
        "shared-key",
      ]);
      const statusesB = MultiKeyRegistry.getHealthStatus("svc-iso-b", [
        "shared-key",
      ]);

      expect(statusesA[0].isHealthy).toBe(false);
      expect(statusesB[0].isHealthy).toBe(true);
    });
  });
});
