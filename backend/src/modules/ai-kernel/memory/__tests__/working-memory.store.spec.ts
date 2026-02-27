/**
 * WorkingMemoryStore Unit Tests
 *
 * Tests session-level temporary in-memory storage with TTL support:
 * - getWithSession()    - retrieve a value; return undefined when missing or expired
 * - setWithSession()    - store a value with optional TTL
 * - appendWithSession() - push a value onto an array for a key
 * - deleteWithSession() - remove a single key from a session
 * - clearSession()      - remove all data for a session
 * - listSession()       - enumerate live (non-expired) items
 * - cleanup()           - sweep all expired items across all sessions
 * - getAllSessionIds()   - list every tracked session ID
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { WorkingMemoryStore } from "../stores/working-memory.store";

describe("WorkingMemoryStore", () => {
  let store: WorkingMemoryStore;

  const session = "session-001";
  const otherSession = "session-002";

  // ConfigService mock: AI_ENGINE_STM_CAPACITY = 100
  const mockConfigService = {
    get: jest.fn().mockReturnValue(100),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkingMemoryStore,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    store = module.get<WorkingMemoryStore>(WorkingMemoryStore);
  });

  // ─── getWithSession() ─────────────────────────────────────────────────────

  describe("getWithSession()", () => {
    it("should return the stored value for an existing key", async () => {
      await store.setWithSession(session, "name", "Alice");

      const result = await store.getWithSession(session, "name");

      expect(result).toBe("Alice");
    });

    it("should return undefined for a key that does not exist", async () => {
      const result = await store.getWithSession(session, "missing-key");

      expect(result).toBeUndefined();
    });

    it("should return undefined and remove the item when it is expired", async () => {
      // TTL of 1 second, then travel time forward manually
      await store.setWithSession(session, "temp", "value", 1);

      // Spy on Date to make the item appear expired
      const pastDate = new Date(Date.now() + 2_000);
      jest
        .spyOn(global, "Date")
        .mockImplementation(() => pastDate as unknown as string);

      const result = await store.getWithSession(session, "temp");

      expect(result).toBeUndefined();

      // Restore Date
      jest.restoreAllMocks();
    });
  });

  // ─── setWithSession() ─────────────────────────────────────────────────────

  describe("setWithSession()", () => {
    it("should store a value without TTL", async () => {
      await store.setWithSession(session, "city", "Paris");

      const result = await store.getWithSession(session, "city");
      expect(result).toBe("Paris");
    });

    it("should store a value with a positive TTL so it is retrievable before expiry", async () => {
      await store.setWithSession(session, "token", "abc123", 3600);

      const result = await store.getWithSession(session, "token");
      expect(result).toBe("abc123");
    });

    it("should overwrite an existing key", async () => {
      await store.setWithSession(session, "score", 10);
      await store.setWithSession(session, "score", 20);

      const result = await store.getWithSession(session, "score");
      expect(result).toBe(20);
    });
  });

  // ─── appendWithSession() ──────────────────────────────────────────────────

  describe("appendWithSession()", () => {
    it("should create a new array when the key does not yet exist", async () => {
      await store.appendWithSession(session, "log", "entry-1");

      const result = await store.getWithSession(session, "log");
      expect(result).toEqual(["entry-1"]);
    });

    it("should append to an existing array", async () => {
      await store.appendWithSession(session, "log", "entry-1");
      await store.appendWithSession(session, "log", "entry-2");
      await store.appendWithSession(session, "log", "entry-3");

      const result = await store.getWithSession(session, "log");
      expect(result).toEqual(["entry-1", "entry-2", "entry-3"]);
    });

    it("should wrap a non-array existing value into an array before appending", async () => {
      await store.setWithSession(session, "tags", "initial");
      await store.appendWithSession(session, "tags", "second");

      const result = await store.getWithSession(session, "tags");
      expect(result).toEqual(["initial", "second"]);
    });

    it("should start a fresh array when the existing item is expired", async () => {
      await store.setWithSession(session, "events", "old-event", 1);

      // Advance time so the existing item is expired
      const future = new Date(Date.now() + 2_000);
      jest
        .spyOn(global, "Date")
        .mockImplementation(() => future as unknown as string);

      await store.appendWithSession(session, "events", "new-event");
      jest.restoreAllMocks();

      // Retrieve without time manipulation
      const raw = await store.getWithSession(session, "events");
      expect(raw).toEqual(["new-event"]);
    });
  });

  // ─── deleteWithSession() ──────────────────────────────────────────────────

  describe("deleteWithSession()", () => {
    it("should delete an existing key and return true", async () => {
      await store.setWithSession(session, "remove-me", 42);

      const deleted = await store.deleteWithSession(session, "remove-me");

      expect(deleted).toBe(true);
      expect(await store.getWithSession(session, "remove-me")).toBeUndefined();
    });

    it("should return false when the key does not exist", async () => {
      const deleted = await store.deleteWithSession(session, "ghost-key");

      expect(deleted).toBe(false);
    });
  });

  // ─── clearSession() ───────────────────────────────────────────────────────

  describe("clearSession()", () => {
    it("should remove all data for the given session", async () => {
      await store.setWithSession(session, "k1", "v1");
      await store.setWithSession(session, "k2", "v2");

      await store.clearSession(session);

      expect(await store.getWithSession(session, "k1")).toBeUndefined();
      expect(await store.getWithSession(session, "k2")).toBeUndefined();
    });

    it("should not affect other sessions", async () => {
      await store.setWithSession(session, "k1", "v1");
      await store.setWithSession(otherSession, "k2", "v2");

      await store.clearSession(session);

      expect(await store.getWithSession(otherSession, "k2")).toBe("v2");
    });
  });

  // ─── listSession() ────────────────────────────────────────────────────────

  describe("listSession()", () => {
    it("should list all non-expired items in the session", async () => {
      await store.setWithSession(session, "a", 1);
      await store.setWithSession(session, "b", 2);

      const items = await store.listSession(session);

      expect(items).toHaveLength(2);
      const keys = items.map((i) => i.key).sort();
      expect(keys).toEqual(["a", "b"]);
    });

    it("should omit expired items and remove them from the store", async () => {
      await store.setWithSession(session, "live", "yes");
      await store.setWithSession(session, "dead", "no", 1);

      // Make "dead" appear expired
      const future = new Date(Date.now() + 2_000);
      jest
        .spyOn(global, "Date")
        .mockImplementation(() => future as unknown as string);

      const items = await store.listSession(session);
      jest.restoreAllMocks();

      expect(items.map((i) => i.key)).not.toContain("dead");
    });

    it("should return an empty array for a session with no items", async () => {
      const items = await store.listSession("empty-session");

      expect(items).toEqual([]);
    });
  });

  // ─── cleanup() ────────────────────────────────────────────────────────────

  describe("cleanup()", () => {
    it("should remove all expired items across all sessions and return the count", async () => {
      await store.setWithSession(session, "expire1", "x", 1);
      await store.setWithSession(session, "expire2", "y", 1);
      await store.setWithSession(otherSession, "expire3", "z", 1);
      await store.setWithSession(session, "live", "keep");

      // Advance time so TTL items are expired
      const future = new Date(Date.now() + 2_000);
      jest
        .spyOn(global, "Date")
        .mockImplementation(() => future as unknown as string);

      const count = store.cleanup();
      jest.restoreAllMocks();

      expect(count).toBe(3);
    });

    it("should return 0 when nothing is expired", async () => {
      await store.setWithSession(session, "live", "value");

      const count = store.cleanup();

      expect(count).toBe(0);
    });

    it("should remove the session entry when all its items are cleaned up", async () => {
      await store.setWithSession(session, "only-item", "v", 1);

      const future = new Date(Date.now() + 2_000);
      jest
        .spyOn(global, "Date")
        .mockImplementation(() => future as unknown as string);

      store.cleanup();
      jest.restoreAllMocks();

      // After cleanup the session should no longer be tracked
      expect(store.getAllSessionIds()).not.toContain(session);
    });
  });

  // ─── getAllSessionIds() ────────────────────────────────────────────────────

  describe("getAllSessionIds()", () => {
    it("should return all session IDs that have been written to", async () => {
      await store.setWithSession("sess-A", "k", "v");
      await store.setWithSession("sess-B", "k", "v");
      await store.setWithSession("sess-C", "k", "v");

      const ids = store.getAllSessionIds();

      expect(ids).toContain("sess-A");
      expect(ids).toContain("sess-B");
      expect(ids).toContain("sess-C");
    });

    it("should return an empty array when no sessions have been created", () => {
      const ids = store.getAllSessionIds();

      expect(ids).toEqual([]);
    });

    it("should not include a session after it has been cleared", async () => {
      await store.setWithSession(session, "k", "v");
      await store.clearSession(session);

      const ids = store.getAllSessionIds();

      expect(ids).not.toContain(session);
    });
  });
});
