/**
 * InMemoryStore / ConversationMemory / WorkingMemory Unit Tests
 *
 * Covers all public methods across three classes in in-memory-store.ts:
 *
 * InMemoryStore:
 * - add()          - create entry with auto id/timestamp
 * - addBatch()     - batch creation
 * - get()          - retrieve by id / missing
 * - update()       - partial update / missing id
 * - delete()       - remove / missing id
 * - search()       - type filter, time-range filter, query filter, embedding search, limit
 * - getRecent()    - most-recent N entries, optional type filter
 * - cleanup()      - evict expired entries
 * - clear()        - wipe all
 * - count()        - total / by types
 * - cosineSimilarity (via search with embeddings)
 *
 * ConversationMemory:
 * - addMessage()        - push message with id/timestamp defaults
 * - getMessages()       - all / limited
 * - getContextWindow()  - token-budget trimming (FIFO)
 * - summarize()         - count-based string
 * - clear()             - wipe messages
 *
 * WorkingMemory:
 * - set() / get() / has() / delete() / clear() / keys() / toObject()
 */

import { Logger } from "@nestjs/common";
import {
  InMemoryStore,
  ConversationMemory,
  WorkingMemory,
} from "../stores/in-memory-store";
import type { MemoryEntry, MemoryType } from "../../abstractions";

// Silence NestJS logger (classes use Logger indirectly)
jest.spyOn(Logger.prototype, "log").mockImplementation();
jest.spyOn(Logger.prototype, "debug").mockImplementation();
jest.spyOn(Logger.prototype, "warn").mockImplementation();
jest.spyOn(Logger.prototype, "error").mockImplementation();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePartialEntry(
  overrides: Partial<Omit<MemoryEntry, "id" | "timestamp">> = {},
): Omit<MemoryEntry, "id" | "timestamp"> {
  return {
    type: "fact" as MemoryType,
    content: "test content",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// InMemoryStore
// ---------------------------------------------------------------------------

describe("InMemoryStore", () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore("test-store-id");
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // Constructor
  // =========================================================================

  describe("constructor", () => {
    it("should use the provided id", () => {
      expect(store.id).toBe("test-store-id");
    });

    it("should generate a uuid when no id is provided", () => {
      const s = new InMemoryStore();
      expect(typeof s.id).toBe("string");
      expect(s.id.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // add()
  // =========================================================================

  describe("add()", () => {
    it("should assign a uuid id to the new entry", async () => {
      const entry = await store.add(makePartialEntry());

      expect(typeof entry.id).toBe("string");
      expect(entry.id.length).toBeGreaterThan(0);
    });

    it("should assign a timestamp to the new entry", async () => {
      const before = new Date();
      const entry = await store.add(makePartialEntry());
      const after = new Date();

      expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(entry.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should preserve type and content from input", async () => {
      const entry = await store.add(
        makePartialEntry({ type: "episode", content: "Something happened" }),
      );

      expect(entry.type).toBe("episode");
      expect(entry.content).toBe("Something happened");
    });

    it("should preserve optional fields (embedding, metadata, expiresAt)", async () => {
      const expiresAt = new Date(Date.now() + 10_000);
      const embedding = [0.1, 0.2, 0.3];
      const metadata = { source: "test" };

      const entry = await store.add(
        makePartialEntry({ embedding, metadata, expiresAt }),
      );

      expect(entry.embedding).toEqual(embedding);
      expect(entry.metadata).toEqual(metadata);
      expect(entry.expiresAt).toEqual(expiresAt);
    });

    it("should store the entry so it can be retrieved by id", async () => {
      const added = await store.add(makePartialEntry());
      const retrieved = await store.get(added.id);

      expect(retrieved).toEqual(added);
    });

    it("should generate unique ids for each entry", async () => {
      const e1 = await store.add(makePartialEntry());
      const e2 = await store.add(makePartialEntry());

      expect(e1.id).not.toBe(e2.id);
    });
  });

  // =========================================================================
  // addBatch()
  // =========================================================================

  describe("addBatch()", () => {
    it("should add all entries and return them with ids", async () => {
      const inputs = [
        makePartialEntry({ content: "a" }),
        makePartialEntry({ content: "b" }),
        makePartialEntry({ content: "c" }),
      ];

      const results = await store.addBatch(inputs);

      expect(results).toHaveLength(3);
      const count = await store.count();
      expect(count).toBe(3);
    });

    it("should return an empty array for empty input", async () => {
      const results = await store.addBatch([]);

      expect(results).toEqual([]);
    });

    it("should assign unique ids to each batch entry", async () => {
      const results = await store.addBatch([
        makePartialEntry(),
        makePartialEntry(),
      ]);
      const ids = results.map((r) => r.id);

      expect(new Set(ids).size).toBe(2);
    });
  });

  // =========================================================================
  // get()
  // =========================================================================

  describe("get()", () => {
    it("should return the entry for a valid id", async () => {
      const added = await store.add(makePartialEntry({ content: "hello" }));

      const result = await store.get(added.id);

      expect(result).not.toBeNull();
      expect(result!.content).toBe("hello");
    });

    it("should return null for a missing id", async () => {
      const result = await store.get("does-not-exist");

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // update()
  // =========================================================================

  describe("update()", () => {
    it("should update content and return the updated entry", async () => {
      const entry = await store.add(makePartialEntry({ content: "original" }));

      const updated = await store.update(entry.id, { content: "updated" });

      expect(updated).not.toBeNull();
      expect(updated!.content).toBe("updated");
    });

    it("should preserve fields not included in the update", async () => {
      const entry = await store.add(
        makePartialEntry({ type: "fact", content: "original" }),
      );

      const updated = await store.update(entry.id, { content: "new" });

      expect(updated!.type).toBe("fact");
    });

    it("should return null for a missing id", async () => {
      const updated = await store.update("ghost-id", { content: "x" });

      expect(updated).toBeNull();
    });

    it("should persist the update so subsequent get() returns updated data", async () => {
      const entry = await store.add(makePartialEntry({ content: "old" }));
      await store.update(entry.id, { content: "new" });

      const retrieved = await store.get(entry.id);

      expect(retrieved!.content).toBe("new");
    });
  });

  // =========================================================================
  // delete()
  // =========================================================================

  describe("delete()", () => {
    it("should delete an existing entry and return true", async () => {
      const entry = await store.add(makePartialEntry());

      const result = await store.delete(entry.id);

      expect(result).toBe(true);
      expect(await store.get(entry.id)).toBeNull();
    });

    it("should return false for a missing id", async () => {
      const result = await store.delete("missing-id");

      expect(result).toBe(false);
    });

    it("should reduce the count by one", async () => {
      const e1 = await store.add(makePartialEntry());
      const e2 = await store.add(makePartialEntry());

      await store.delete(e1.id);

      const count = await store.count();
      expect(count).toBe(1);
      expect(await store.get(e2.id)).not.toBeNull();
    });
  });

  // =========================================================================
  // search()
  // =========================================================================

  describe("search()", () => {
    beforeEach(async () => {
      await store.add(
        makePartialEntry({ type: "fact", content: "The sky is blue" }),
      );
      await store.add(
        makePartialEntry({ type: "episode", content: "I went for a walk" }),
      );
      await store.add(
        makePartialEntry({ type: "summary", content: "Blue sky summary" }),
      );
    });

    it("should return all entries when no options are provided", async () => {
      const results = await store.search({});

      expect(results).toHaveLength(3);
    });

    it("should filter by type", async () => {
      const results = await store.search({ types: ["fact"] });

      expect(results).toHaveLength(1);
      expect(results[0].entry.type).toBe("fact");
    });

    it("should filter by multiple types", async () => {
      const results = await store.search({ types: ["fact", "episode"] });

      expect(results).toHaveLength(2);
    });

    it("should filter by keyword query (case-insensitive)", async () => {
      const results = await store.search({ query: "BLUE" });

      expect(results).toHaveLength(2);
      results.forEach((r) =>
        expect(r.entry.content.toLowerCase()).toContain("blue"),
      );
    });

    it("should return no results when query matches nothing", async () => {
      const results = await store.search({ query: "nonexistent-xyz" });

      expect(results).toHaveLength(0);
    });

    it("should filter by timeRange start", async () => {
      await store.clear();
      const past = new Date(Date.now() - 10_000);
      const _future = new Date(Date.now() + 10_000);

      const old = await store.add(makePartialEntry({ content: "old entry" }));
      // manually back-date by updating its timestamp
      await store.update(old.id, { timestamp: past });
      await store.add(makePartialEntry({ content: "new entry" }));

      const results = await store.search({
        timeRange: { start: new Date(Date.now() - 1_000) },
      });

      // only entries with timestamp >= start should be returned
      results.forEach((r) => {
        expect(r.entry.timestamp.getTime()).toBeGreaterThanOrEqual(
          Date.now() - 2_000,
        );
      });
      // The "old" entry (timestamp = past) should not be included
      const ids = results.map((r) => r.entry.id);
      expect(ids).not.toContain(old.id);
    });

    it("should filter by timeRange end", async () => {
      await store.clear();
      const cutoff = new Date();

      const early = await store.add(makePartialEntry({ content: "early" }));
      await store.update(early.id, {
        timestamp: new Date(cutoff.getTime() - 5_000),
      });

      await store.add(makePartialEntry({ content: "late entry after cutoff" }));

      const results = await store.search({ timeRange: { end: cutoff } });

      const ids = results.map((r) => r.entry.id);
      expect(ids).toContain(early.id);
    });

    it("should apply limit to results", async () => {
      const results = await store.search({ limit: 2 });

      expect(results).toHaveLength(2);
    });

    it("should sort by timestamp descending when no embedding is provided", async () => {
      const results = await store.search({});

      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].entry.timestamp.getTime()).toBeGreaterThanOrEqual(
          results[i + 1].entry.timestamp.getTime(),
        );
      }
    });

    it("should assign score 1 to all entries when no embedding is provided", async () => {
      const results = await store.search({});

      results.forEach((r) => expect(r.score).toBe(1));
    });

    it("should perform cosine similarity search when embedding is provided", async () => {
      await store.clear();
      await store.add(
        makePartialEntry({ content: "vec-a", embedding: [1, 0, 0] }),
      );
      await store.add(
        makePartialEntry({ content: "vec-b", embedding: [0, 1, 0] }),
      );
      await store.add(
        makePartialEntry({ content: "no-vec" }), // no embedding — excluded from vector search
      );

      const results = await store.search({ embedding: [1, 0, 0] });

      // "vec-a" should score 1 (identical), "vec-b" should score 0
      const scores = results.map((r) => r.score);
      expect(scores[0]).toBeCloseTo(1);
      expect(scores[1]).toBeCloseTo(0);
    });

    it("should filter by minScore in embedding search", async () => {
      await store.clear();
      await store.add(
        makePartialEntry({ content: "match", embedding: [1, 0] }),
      );
      await store.add(
        makePartialEntry({ content: "no-match", embedding: [0, 1] }),
      );

      const results = await store.search({ embedding: [1, 0], minScore: 0.5 });

      expect(results).toHaveLength(1);
      expect(results[0].entry.content).toBe("match");
    });

    it("should return 0 cosine similarity for different-length vectors", async () => {
      await store.clear();
      await store.add(makePartialEntry({ content: "short", embedding: [1] }));

      // Query embedding has different length → similarity = 0 → filtered by minScore 0.5
      const results = await store.search({ embedding: [1, 0], minScore: 0.5 });

      expect(results).toHaveLength(0);
    });

    it("should return 0 cosine similarity for zero vectors", async () => {
      await store.clear();
      await store.add(
        makePartialEntry({ content: "zero-vec", embedding: [0, 0] }),
      );

      const results = await store.search({ embedding: [1, 0], minScore: 0.5 });

      expect(results).toHaveLength(0);
    });
  });

  // =========================================================================
  // getRecent()
  // =========================================================================

  describe("getRecent()", () => {
    it("should return the N most recent entries", async () => {
      for (let i = 0; i < 5; i++) {
        await store.add(makePartialEntry({ content: `entry-${i}` }));
      }

      const results = await store.getRecent(3);

      expect(results).toHaveLength(3);
    });

    it("should return entries sorted by timestamp descending", async () => {
      const e1 = await store.add(makePartialEntry({ content: "first" }));
      // Give e2 a clearly later timestamp to avoid same-millisecond ties
      const futureTs = new Date(Date.now() + 5_000);
      const e2 = await store.add(makePartialEntry({ content: "second" }));
      await store.update(e2.id, { timestamp: futureTs });

      const results = await store.getRecent(2);

      // e2 should come before e1 (more recent timestamp)
      expect(results[0].id).toBe(e2.id);
      expect(results[1].id).toBe(e1.id);
    });

    it("should filter by types when provided", async () => {
      await store.add(makePartialEntry({ type: "fact" }));
      await store.add(makePartialEntry({ type: "episode" }));
      await store.add(makePartialEntry({ type: "fact" }));

      const results = await store.getRecent(10, ["fact"]);

      expect(results).toHaveLength(2);
      results.forEach((r) => expect(r.type).toBe("fact"));
    });

    it("should return all entries when types array is empty", async () => {
      await store.add(makePartialEntry({ type: "fact" }));
      await store.add(makePartialEntry({ type: "episode" }));

      const results = await store.getRecent(10, []);

      expect(results).toHaveLength(2);
    });

    it("should return empty array when store is empty", async () => {
      const results = await store.getRecent(5);

      expect(results).toEqual([]);
    });

    it("should return all entries when limit exceeds total count", async () => {
      await store.add(makePartialEntry());

      const results = await store.getRecent(100);

      expect(results).toHaveLength(1);
    });
  });

  // =========================================================================
  // cleanup()
  // =========================================================================

  describe("cleanup()", () => {
    it("should remove expired entries and return count", async () => {
      const expiredAt = new Date(Date.now() - 5_000);
      await store.add(
        makePartialEntry({ content: "expired", expiresAt: expiredAt }),
      );
      await store.add(makePartialEntry({ content: "live" }));

      const count = await store.cleanup();

      expect(count).toBe(1);
      expect(await store.count()).toBe(1);
    });

    it("should not remove entries without expiresAt", async () => {
      await store.add(makePartialEntry({ content: "permanent" }));

      const count = await store.cleanup();

      expect(count).toBe(0);
      expect(await store.count()).toBe(1);
    });

    it("should not remove entries whose expiresAt is in the future", async () => {
      await store.add(
        makePartialEntry({ expiresAt: new Date(Date.now() + 60_000) }),
      );

      const count = await store.cleanup();

      expect(count).toBe(0);
    });

    it("should return 0 when store is empty", async () => {
      const count = await store.cleanup();

      expect(count).toBe(0);
    });

    it("should remove multiple expired entries in one call", async () => {
      const expiredAt = new Date(Date.now() - 1_000);
      await store.add(makePartialEntry({ expiresAt: expiredAt }));
      await store.add(makePartialEntry({ expiresAt: expiredAt }));
      await store.add(makePartialEntry({ expiresAt: expiredAt }));

      const count = await store.cleanup();

      expect(count).toBe(3);
      expect(await store.count()).toBe(0);
    });
  });

  // =========================================================================
  // clear()
  // =========================================================================

  describe("clear()", () => {
    it("should remove all entries", async () => {
      await store.add(makePartialEntry());
      await store.add(makePartialEntry());

      await store.clear();

      expect(await store.count()).toBe(0);
    });

    it("should be idempotent on an empty store", async () => {
      await store.clear();
      await store.clear();

      expect(await store.count()).toBe(0);
    });
  });

  // =========================================================================
  // count()
  // =========================================================================

  describe("count()", () => {
    it("should return 0 for an empty store", async () => {
      expect(await store.count()).toBe(0);
    });

    it("should return total count when no types are specified", async () => {
      await store.add(makePartialEntry({ type: "fact" }));
      await store.add(makePartialEntry({ type: "episode" }));

      expect(await store.count()).toBe(2);
    });

    it("should count by a single type", async () => {
      await store.add(makePartialEntry({ type: "fact" }));
      await store.add(makePartialEntry({ type: "fact" }));
      await store.add(makePartialEntry({ type: "episode" }));

      expect(await store.count(["fact"])).toBe(2);
    });

    it("should count by multiple types", async () => {
      await store.add(makePartialEntry({ type: "fact" }));
      await store.add(makePartialEntry({ type: "episode" }));
      await store.add(makePartialEntry({ type: "summary" }));

      expect(await store.count(["fact", "episode"])).toBe(2);
    });

    it("should return 0 when no entries match the requested types", async () => {
      await store.add(makePartialEntry({ type: "fact" }));

      expect(await store.count(["preference"])).toBe(0);
    });

    it("should return total count when types array is empty", async () => {
      await store.add(makePartialEntry());
      await store.add(makePartialEntry());

      expect(await store.count([])).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// ConversationMemory
// ---------------------------------------------------------------------------

describe("ConversationMemory", () => {
  let memory: ConversationMemory;

  beforeEach(() => {
    memory = new ConversationMemory("session-test");
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // Constructor
  // =========================================================================

  describe("constructor", () => {
    it("should use provided sessionId", () => {
      expect(memory.sessionId).toBe("session-test");
    });

    it("should generate a uuid sessionId when none is provided", () => {
      const m = new ConversationMemory();
      expect(typeof m.sessionId).toBe("string");
      expect(m.sessionId.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // addMessage()
  // =========================================================================

  describe("addMessage()", () => {
    it("should add a message and preserve its content and role", async () => {
      await memory.addMessage({ role: "user", content: "Hello" });
      const messages = await memory.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("Hello");
    });

    it("should assign a timestamp when none is provided", async () => {
      await memory.addMessage({ role: "user", content: "Hi" });
      const [msg] = await memory.getMessages();

      expect(msg.timestamp).toBeInstanceOf(Date);
    });

    it("should preserve the provided timestamp", async () => {
      const ts = new Date("2024-06-01T12:00:00Z");
      await memory.addMessage({
        role: "assistant",
        content: "Hi",
        timestamp: ts,
      });
      const [msg] = await memory.getMessages();

      expect(msg.timestamp).toEqual(ts);
    });

    it("should assign an id when none is provided", async () => {
      await memory.addMessage({ role: "user", content: "x" });
      const [msg] = await memory.getMessages();

      expect(typeof msg.id).toBe("string");
      expect(msg.id!.length).toBeGreaterThan(0);
    });

    it("should preserve provided id", async () => {
      await memory.addMessage({ id: "custom-id", role: "user", content: "y" });
      const [msg] = await memory.getMessages();

      expect(msg.id).toBe("custom-id");
    });

    it("should preserve messages in insertion order", async () => {
      await memory.addMessage({ role: "user", content: "first" });
      await memory.addMessage({ role: "assistant", content: "second" });

      const msgs = await memory.getMessages();
      expect(msgs[0].content).toBe("first");
      expect(msgs[1].content).toBe("second");
    });
  });

  // =========================================================================
  // getMessages()
  // =========================================================================

  describe("getMessages()", () => {
    beforeEach(async () => {
      await memory.addMessage({ role: "user", content: "m1" });
      await memory.addMessage({ role: "assistant", content: "m2" });
      await memory.addMessage({ role: "user", content: "m3" });
    });

    it("should return all messages when no limit is specified", async () => {
      const msgs = await memory.getMessages();

      expect(msgs).toHaveLength(3);
    });

    it("should return a copy so mutation does not affect internal state", async () => {
      const msgs = await memory.getMessages();
      msgs.push({ role: "user", content: "extra" });

      expect(await memory.getMessages()).toHaveLength(3);
    });

    it("should return the last N messages when limit is provided", async () => {
      const msgs = await memory.getMessages(2);

      expect(msgs).toHaveLength(2);
      expect(msgs[0].content).toBe("m2");
      expect(msgs[1].content).toBe("m3");
    });

    it("should return all messages when limit exceeds total count", async () => {
      const msgs = await memory.getMessages(100);

      expect(msgs).toHaveLength(3);
    });
  });

  // =========================================================================
  // getContextWindow()
  // =========================================================================

  describe("getContextWindow()", () => {
    it("should return all messages when they fit within token budget", async () => {
      await memory.addMessage({ role: "user", content: "Hello" }); // ~1-2 tokens
      await memory.addMessage({ role: "assistant", content: "Hi" }); // ~1 token

      // Very large budget
      const window = await memory.getContextWindow(10_000);

      expect(window).toHaveLength(2);
    });

    it("should exclude oldest messages when budget is small", async () => {
      // Each char ~ 1/4 token for ASCII; "a".repeat(400) ~ 100 tokens
      await memory.addMessage({ role: "user", content: "a".repeat(400) }); // ~100 tokens
      await memory.addMessage({ role: "user", content: "b".repeat(400) }); // ~100 tokens
      await memory.addMessage({ role: "user", content: "c" }); // ~1 token

      // Budget of 110 tokens — only "c" and "b" should fit, not "a"
      const window = await memory.getContextWindow(110);

      const contents = window.map((m) => m.content);
      expect(contents).not.toContain("a".repeat(400));
      expect(contents).toContain("c");
    });

    it("should return in chronological order (oldest first)", async () => {
      await memory.addMessage({ role: "user", content: "first" });
      await memory.addMessage({ role: "user", content: "second" });

      const window = await memory.getContextWindow(10_000);

      expect(window[0].content).toBe("first");
      expect(window[1].content).toBe("second");
    });

    it("should return empty array when no messages exist", async () => {
      const window = await memory.getContextWindow(1_000);

      expect(window).toEqual([]);
    });

    it("should handle Chinese characters with higher token weight", async () => {
      // Chinese chars cost 2 tokens each; "你好" ~ 4 tokens
      await memory.addMessage({ role: "user", content: "你好世界" }); // ~8 tokens
      await memory.addMessage({ role: "user", content: "Hello" }); // ~2 tokens

      // Budget of 5 tokens — only "Hello" fits
      const window = await memory.getContextWindow(5);

      expect(window).toHaveLength(1);
      expect(window[0].content).toBe("Hello");
    });
  });

  // =========================================================================
  // summarize()
  // =========================================================================

  describe("summarize()", () => {
    it("should include message counts in the summary string", async () => {
      await memory.addMessage({ role: "user", content: "q1" });
      await memory.addMessage({ role: "assistant", content: "a1" });
      await memory.addMessage({ role: "user", content: "q2" });

      const summary = await memory.summarize();

      expect(summary).toContain("2"); // 2 user messages
      expect(summary).toContain("1"); // 1 assistant response
    });

    it("should summarize an empty conversation gracefully", async () => {
      const summary = await memory.summarize();

      expect(typeof summary).toBe("string");
      expect(summary.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // clear()
  // =========================================================================

  describe("clear()", () => {
    it("should remove all messages", async () => {
      await memory.addMessage({ role: "user", content: "hi" });
      await memory.addMessage({ role: "user", content: "there" });

      await memory.clear();

      expect(await memory.getMessages()).toEqual([]);
    });

    it("should be idempotent on an empty conversation", async () => {
      await memory.clear();
      await memory.clear();

      expect(await memory.getMessages()).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// WorkingMemory
// ---------------------------------------------------------------------------

describe("WorkingMemory", () => {
  let wm: WorkingMemory;

  beforeEach(() => {
    wm = new WorkingMemory();
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // set() / get()
  // =========================================================================

  describe("set() and get()", () => {
    it("should store and retrieve a string value", () => {
      wm.set("name", "Alice");
      expect(wm.get<string>("name")).toBe("Alice");
    });

    it("should store and retrieve a number value", () => {
      wm.set("count", 42);
      expect(wm.get<number>("count")).toBe(42);
    });

    it("should store and retrieve an object value", () => {
      const obj = { x: 1, y: [2, 3] };
      wm.set("obj", obj);
      expect(wm.get<typeof obj>("obj")).toEqual(obj);
    });

    it("should overwrite existing key with new value", () => {
      wm.set("k", "old");
      wm.set("k", "new");
      expect(wm.get<string>("k")).toBe("new");
    });

    it("should return undefined for a missing key", () => {
      expect(wm.get("ghost")).toBeUndefined();
    });
  });

  // =========================================================================
  // has()
  // =========================================================================

  describe("has()", () => {
    it("should return true for an existing key", () => {
      wm.set("exists", true);
      expect(wm.has("exists")).toBe(true);
    });

    it("should return false for a missing key", () => {
      expect(wm.has("missing")).toBe(false);
    });
  });

  // =========================================================================
  // delete()
  // =========================================================================

  describe("delete()", () => {
    it("should return true and remove the key", () => {
      wm.set("del-me", "value");
      const result = wm.delete("del-me");

      expect(result).toBe(true);
      expect(wm.has("del-me")).toBe(false);
    });

    it("should return false for a missing key", () => {
      const result = wm.delete("not-here");

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // clear()
  // =========================================================================

  describe("clear()", () => {
    it("should remove all entries", () => {
      wm.set("a", 1);
      wm.set("b", 2);

      wm.clear();

      expect(wm.keys()).toHaveLength(0);
    });
  });

  // =========================================================================
  // keys()
  // =========================================================================

  describe("keys()", () => {
    it("should return all stored keys", () => {
      wm.set("x", 1);
      wm.set("y", 2);

      const keys = wm.keys();

      expect(keys).toContain("x");
      expect(keys).toContain("y");
      expect(keys).toHaveLength(2);
    });

    it("should return an empty array when empty", () => {
      expect(wm.keys()).toEqual([]);
    });
  });

  // =========================================================================
  // toObject()
  // =========================================================================

  describe("toObject()", () => {
    it("should return all key-value pairs as a plain object", () => {
      wm.set("name", "Bob");
      wm.set("score", 99);

      const obj = wm.toObject();

      expect(obj).toEqual({ name: "Bob", score: 99 });
    });

    it("should return an empty object when working memory is empty", () => {
      expect(wm.toObject()).toEqual({});
    });

    it("should not reflect subsequent mutations to working memory", () => {
      wm.set("k", "v");
      const obj = wm.toObject();
      wm.set("k", "new");

      // The snapshot captured before the second set should still have "v"
      expect(obj.k).toBe("v");
    });
  });
});
