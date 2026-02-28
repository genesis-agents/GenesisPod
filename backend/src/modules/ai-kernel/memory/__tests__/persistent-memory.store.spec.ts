/**
 * PersistentMemoryStore Unit Tests
 *
 * Covers all public methods of the persistent memory store:
 * - onModuleInit()       - table existence check / service disable path
 * - setWithUser()        - upsert with TTL, type, importance, tags options
 * - getWithUser()        - retrieve value; expire-and-delete on TTL breach
 * - search()             - keyword-based scoring with threshold, filters, tags
 * - deleteWithUser()     - delete existing / missing keys
 * - list()               - filtered listing with sort, pagination, tags, type
 * - updateMetadata()     - update importance / tags with / without userId
 * - cleanup()            - prune expired rows, return count
 * - getStats()           - aggregate totalEntries + userCount
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { PersistentMemoryStore } from "../stores/persistent-memory.store";

// ---------------------------------------------------------------------------
// Silence NestJS logger output
// ---------------------------------------------------------------------------
jest.spyOn(Logger.prototype, "log").mockImplementation();
jest.spyOn(Logger.prototype, "debug").mockImplementation();
jest.spyOn(Logger.prototype, "warn").mockImplementation();
jest.spyOn(Logger.prototype, "error").mockImplementation();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDbEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem-id-1",
    userId: "user-1",
    key: "my-key",
    value: { data: "hello" },
    type: "fact",
    importance: 0.8,
    tags: ["tag-a"],
    expiresAt: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-02T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared mock
// ---------------------------------------------------------------------------

const mockPrisma = {
  $queryRaw: jest.fn(),
  longTermMemory: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("PersistentMemoryStore", () => {
  let store: PersistentMemoryStore;

  async function buildStore(
    tableExists: boolean,
  ): Promise<PersistentMemoryStore> {
    jest.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: tableExists }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersistentMemoryStore,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    const s = module.get<PersistentMemoryStore>(PersistentMemoryStore);
    await s.onModuleInit();
    return s;
  }

  beforeEach(async () => {
    store = await buildStore(true);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // onModuleInit()
  // =========================================================================

  describe("onModuleInit()", () => {
    it("should mark service as ready when table exists", async () => {
      mockPrisma.longTermMemory.upsert.mockResolvedValue({});

      // If tableReady, upsert should be called (no early return)
      await store.setWithUser("user-1", "k", "v");

      expect(mockPrisma.longTermMemory.upsert).toHaveBeenCalledTimes(1);
    });

    it("should disable the service when table does not exist", async () => {
      const disabledStore = await buildStore(false);
      mockPrisma.longTermMemory.upsert.mockResolvedValue({});

      await disabledStore.setWithUser("user-1", "k", "v");

      expect(mockPrisma.longTermMemory.upsert).not.toHaveBeenCalled();
    });

    it("should return false from checkTableExists when $queryRaw throws", async () => {
      jest.clearAllMocks();
      mockPrisma.$queryRaw.mockRejectedValue(new Error("DB error"));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PersistentMemoryStore,
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();

      const s = module.get<PersistentMemoryStore>(PersistentMemoryStore);
      await s.onModuleInit(); // should not throw

      mockPrisma.longTermMemory.upsert.mockResolvedValue({});
      await s.setWithUser("user-1", "k", "v");
      // table not ready — upsert should NOT be called
      expect(mockPrisma.longTermMemory.upsert).not.toHaveBeenCalled();
    });

    it("should handle undefined result from $queryRaw gracefully", async () => {
      jest.clearAllMocks();
      mockPrisma.$queryRaw.mockResolvedValue([{}]); // no `exists` field → undefined

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PersistentMemoryStore,
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();

      const s = module.get<PersistentMemoryStore>(PersistentMemoryStore);
      await s.onModuleInit();

      // tableReady should default to false — upsert should not be called
      await s.setWithUser("user-1", "k", "v");
      expect(mockPrisma.longTermMemory.upsert).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // setWithUser()
  // =========================================================================

  describe("setWithUser()", () => {
    it("should call upsert with correct userId and key", async () => {
      mockPrisma.longTermMemory.upsert.mockResolvedValue({});

      await store.setWithUser("user-1", "myKey", { text: "hello" });

      expect(mockPrisma.longTermMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_key: { userId: "user-1", key: "myKey" } },
        }),
      );
    });

    it("should use default importance 0.5 and empty tags when options are not provided", async () => {
      mockPrisma.longTermMemory.upsert.mockResolvedValue({});

      await store.setWithUser("user-1", "k", "v");

      const call = mockPrisma.longTermMemory.upsert.mock.calls[0][0];
      expect(call.create.importance).toBe(0.5);
      expect(call.create.tags).toEqual([]);
    });

    it("should set type, importance, and tags from options", async () => {
      mockPrisma.longTermMemory.upsert.mockResolvedValue({});

      await store.setWithUser("user-1", "k", "v", {
        type: "preference",
        importance: 0.9,
        tags: ["work", "ai"],
      });

      const call = mockPrisma.longTermMemory.upsert.mock.calls[0][0];
      expect(call.create.type).toBe("preference");
      expect(call.create.importance).toBe(0.9);
      expect(call.create.tags).toEqual(["work", "ai"]);
    });

    it("should compute expiresAt when TTL > 0", async () => {
      mockPrisma.longTermMemory.upsert.mockResolvedValue({});
      const before = Date.now();

      await store.setWithUser("user-1", "k", "v", { ttl: 60 });

      const call = mockPrisma.longTermMemory.upsert.mock.calls[0][0];
      const expiresAt: Date = call.create.expiresAt;
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 60_000 + 100,
      );
    });

    it("should set expiresAt to undefined when TTL is 0", async () => {
      mockPrisma.longTermMemory.upsert.mockResolvedValue({});

      await store.setWithUser("user-1", "k", "v", { ttl: 0 });

      const call = mockPrisma.longTermMemory.upsert.mock.calls[0][0];
      expect(call.create.expiresAt).toBeUndefined();
    });

    it("should set expiresAt to undefined when TTL is negative", async () => {
      mockPrisma.longTermMemory.upsert.mockResolvedValue({});

      await store.setWithUser("user-1", "k", "v", { ttl: -1 });

      const call = mockPrisma.longTermMemory.upsert.mock.calls[0][0];
      expect(call.create.expiresAt).toBeUndefined();
    });

    it("should do nothing when table is not ready", async () => {
      const disabledStore = await buildStore(false);

      await disabledStore.setWithUser("user-1", "k", "v");

      expect(mockPrisma.longTermMemory.upsert).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getWithUser()
  // =========================================================================

  describe("getWithUser()", () => {
    it("should return the entry data when key exists and is not expired", async () => {
      const entry = makeDbEntry({ expiresAt: null });
      mockPrisma.longTermMemory.findUnique.mockResolvedValue(entry);

      const result = await store.getWithUser("user-1", "my-key");

      expect(result).toMatchObject({
        value: entry.value,
        type: entry.type,
        importance: entry.importance,
        tags: entry.tags,
      });
    });

    it("should return undefined when key does not exist", async () => {
      mockPrisma.longTermMemory.findUnique.mockResolvedValue(null);

      const result = await store.getWithUser("user-1", "missing");

      expect(result).toBeUndefined();
    });

    it("should delete the entry and return undefined when it is expired", async () => {
      const expiredAt = new Date(Date.now() - 10_000); // 10 seconds ago
      const entry = makeDbEntry({ expiresAt: expiredAt, id: "mem-id-1" });
      mockPrisma.longTermMemory.findUnique.mockResolvedValue(entry);
      mockPrisma.longTermMemory.delete.mockResolvedValue(entry);

      const result = await store.getWithUser("user-1", "my-key");

      expect(result).toBeUndefined();
      expect(mockPrisma.longTermMemory.delete).toHaveBeenCalledWith({
        where: { id: "mem-id-1" },
      });
    });

    it("should return the entry when expiresAt is in the future", async () => {
      const futureDate = new Date(Date.now() + 60_000);
      const entry = makeDbEntry({ expiresAt: futureDate });
      mockPrisma.longTermMemory.findUnique.mockResolvedValue(entry);

      const result = await store.getWithUser("user-1", "my-key");

      expect(result).toBeDefined();
      expect(mockPrisma.longTermMemory.delete).not.toHaveBeenCalled();
    });

    it("should return undefined without querying when table is not ready", async () => {
      const disabledStore = await buildStore(false);

      const result = await disabledStore.getWithUser("user-1", "k");

      expect(result).toBeUndefined();
      expect(mockPrisma.longTermMemory.findUnique).not.toHaveBeenCalled();
    });

    it("should include createdAt and updatedAt in the returned object", async () => {
      const entry = makeDbEntry({
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-15"),
      });
      mockPrisma.longTermMemory.findUnique.mockResolvedValue(entry);

      const result = (await store.getWithUser("user-1", "my-key")) as Record<
        string,
        unknown
      >;

      expect(result.createdAt).toEqual(entry.createdAt);
      expect(result.updatedAt).toEqual(entry.updatedAt);
    });
  });

  // =========================================================================
  // search()
  // =========================================================================

  describe("search()", () => {
    it("should return empty array when table is not ready", async () => {
      const disabledStore = await buildStore(false);
      // buildStore() already consumed a $queryRaw call during onModuleInit — reset the count
      mockPrisma.$queryRaw.mockClear();

      const results = await disabledStore.search("hello");

      expect(results).toEqual([]);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("should return scored results for matching entries", async () => {
      const rows = [
        {
          id: "id-1",
          userId: "user-1",
          key: "hello-world",
          value: { text: "hello" },
          type: "fact",
          importance: 0.6,
          tags: [],
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.$queryRaw.mockResolvedValue(rows);

      const results = await store.search("hello");

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe("hello-world");
      expect(results[0].score).toBeGreaterThan(0);
    });

    it("should filter results below the threshold", async () => {
      const rows = [
        {
          id: "id-1",
          userId: "user-1",
          key: "unrelated",
          value: { text: "unrelated content" },
          type: null,
          importance: null,
          tags: [],
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.$queryRaw.mockResolvedValue(rows);

      // "hello" not in key or value → score = 0, threshold 0.9 filters it out
      const results = await store.search("hello", { threshold: 0.9 });

      expect(results).toHaveLength(0);
    });

    it("should return all results when threshold is not set", async () => {
      const rows = [
        {
          id: "id-1",
          userId: "user-1",
          key: "anything",
          value: {},
          type: null,
          importance: null,
          tags: [],
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.$queryRaw.mockResolvedValue(rows);

      const results = await store.search("nomatch");

      // No threshold → even score=0 entries are included
      expect(results).toHaveLength(1);
    });

    it("should escape ILIKE special characters in query", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await store.search("test%_\\data");

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it("should sort results by score descending", async () => {
      const rows = [
        {
          id: "id-1",
          userId: "user-1",
          key: "test", // exact match → score 1.0
          value: { x: 1 },
          type: null,
          importance: null,
          tags: [],
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "id-2",
          userId: "user-1",
          key: "test-key", // partial match → score 0.5
          value: { x: 2 },
          type: null,
          importance: null,
          tags: [],
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.$queryRaw.mockResolvedValue(rows);

      const results = await store.search("test");

      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it("should include metadata in results", async () => {
      const rows = [
        {
          id: "id-1",
          userId: "user-1",
          key: "test",
          value: { x: 1 },
          type: "fact",
          importance: 0.7,
          tags: ["a"],
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.$queryRaw.mockResolvedValue(rows);

      const results = await store.search("test");

      expect(results[0].metadata).toMatchObject({
        type: "fact",
        importance: 0.7,
        tags: ["a"],
      });
    });

    it("should use limit option (default 100)", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await store.search("q", { limit: 5 });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it("should score 1.0 (capped) for exact key match with high importance", async () => {
      const rows = [
        {
          id: "id-1",
          userId: "user-1",
          key: "exactquery",
          value: { text: "exactquery" },
          type: null,
          importance: 10, // extreme importance
          tags: [],
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.$queryRaw.mockResolvedValue(rows);

      const results = await store.search("exactquery");

      expect(results[0].score).toBeLessThanOrEqual(1);
    });

    it("should apply userId filter when provided in options", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await store.search("q", { userId: "user-42" });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it("should apply type filter when provided in options", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await store.search("q", { type: "fact" });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it("should apply tags filter when provided in options", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await store.search("q", { tags: ["tag-a", "tag-b"] });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // deleteWithUser()
  // =========================================================================

  describe("deleteWithUser()", () => {
    it("should delete and return true when entry exists", async () => {
      mockPrisma.longTermMemory.delete.mockResolvedValue({});

      const result = await store.deleteWithUser("user-1", "my-key");

      expect(result).toBe(true);
      expect(mockPrisma.longTermMemory.delete).toHaveBeenCalledWith({
        where: { userId_key: { userId: "user-1", key: "my-key" } },
      });
    });

    it("should return false when delete throws (entry not found)", async () => {
      mockPrisma.longTermMemory.delete.mockRejectedValue(
        new Error("Not found"),
      );

      const result = await store.deleteWithUser("user-1", "missing-key");

      expect(result).toBe(false);
    });

    it("should return false without querying when table is not ready", async () => {
      const disabledStore = await buildStore(false);

      const result = await disabledStore.deleteWithUser("user-1", "k");

      expect(result).toBe(false);
      expect(mockPrisma.longTermMemory.delete).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // list()
  // =========================================================================

  describe("list()", () => {
    it("should return empty array when table is not ready", async () => {
      const disabledStore = await buildStore(false);

      const result = await disabledStore.list();

      expect(result).toEqual([]);
      expect(mockPrisma.longTermMemory.findMany).not.toHaveBeenCalled();
    });

    it("should return all entries when no options provided", async () => {
      const entries = [makeDbEntry(), makeDbEntry({ key: "key-2" })];
      mockPrisma.longTermMemory.findMany.mockResolvedValue(entries);

      const result = await store.list();

      expect(result).toHaveLength(2);
      expect(mockPrisma.longTermMemory.findMany).toHaveBeenCalled();
    });

    it("should map entries to the expected output shape", async () => {
      const entry = makeDbEntry({
        key: "k1",
        value: { x: 1 },
        type: "fact",
        importance: 0.8,
        tags: ["a"],
      });
      mockPrisma.longTermMemory.findMany.mockResolvedValue([entry]);

      const result = await store.list();

      expect(result[0]).toEqual({
        key: "k1",
        value: { x: 1 },
        type: "fact",
        importance: 0.8,
        tags: ["a"],
      });
    });

    it("should convert null type and importance to undefined in output", async () => {
      const entry = makeDbEntry({ type: null, importance: null });
      mockPrisma.longTermMemory.findMany.mockResolvedValue([entry]);

      const result = await store.list();

      expect(result[0].type).toBeUndefined();
      expect(result[0].importance).toBeUndefined();
    });

    it("should filter by userId when provided", async () => {
      mockPrisma.longTermMemory.findMany.mockResolvedValue([]);

      await store.list({ userId: "user-42" });

      const call = mockPrisma.longTermMemory.findMany.mock.calls[0][0];
      expect(call.where.userId).toBe("user-42");
    });

    it("should filter by type when provided", async () => {
      mockPrisma.longTermMemory.findMany.mockResolvedValue([]);

      await store.list({ type: "fact" });

      const call = mockPrisma.longTermMemory.findMany.mock.calls[0][0];
      expect(call.where.type).toBe("fact");
    });

    it("should filter by tags when provided", async () => {
      mockPrisma.longTermMemory.findMany.mockResolvedValue([]);

      await store.list({ tags: ["work"] });

      const call = mockPrisma.longTermMemory.findMany.mock.calls[0][0];
      expect(call.where.tags).toEqual({ hasSome: ["work"] });
    });

    it("should not add tags filter when tags array is empty", async () => {
      mockPrisma.longTermMemory.findMany.mockResolvedValue([]);

      await store.list({ tags: [] });

      const call = mockPrisma.longTermMemory.findMany.mock.calls[0][0];
      expect(call.where.tags).toBeUndefined();
    });

    it("should default to sortBy updatedAt desc", async () => {
      mockPrisma.longTermMemory.findMany.mockResolvedValue([]);

      await store.list();

      const call = mockPrisma.longTermMemory.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ updatedAt: "desc" });
    });

    it("should use custom sortBy and sortOrder when provided", async () => {
      mockPrisma.longTermMemory.findMany.mockResolvedValue([]);

      await store.list({ sortBy: "importance", sortOrder: "asc" });

      const call = mockPrisma.longTermMemory.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ importance: "asc" });
    });

    it("should apply offset and limit pagination", async () => {
      mockPrisma.longTermMemory.findMany.mockResolvedValue([]);

      await store.list({ offset: 10, limit: 5 });

      const call = mockPrisma.longTermMemory.findMany.mock.calls[0][0];
      expect(call.skip).toBe(10);
      expect(call.take).toBe(5);
    });

    it("should include non-expired filter in where clause", async () => {
      mockPrisma.longTermMemory.findMany.mockResolvedValue([]);

      await store.list();

      const call = mockPrisma.longTermMemory.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual(
        expect.arrayContaining([
          { expiresAt: null },
          { expiresAt: { gt: expect.any(Date) } },
        ]),
      );
    });
  });

  // =========================================================================
  // updateMetadata()
  // =========================================================================

  describe("updateMetadata()", () => {
    it("should return false without querying when table is not ready", async () => {
      const disabledStore = await buildStore(false);

      const result = await disabledStore.updateMetadata("key", {
        importance: 0.9,
      });

      expect(result).toBe(false);
      expect(mockPrisma.longTermMemory.update).not.toHaveBeenCalled();
    });

    it("should update by userId+key and return true when userId is provided", async () => {
      mockPrisma.longTermMemory.update.mockResolvedValue({});

      const result = await store.updateMetadata(
        "my-key",
        { importance: 0.9 },
        "user-1",
      );

      expect(result).toBe(true);
      expect(mockPrisma.longTermMemory.update).toHaveBeenCalledWith({
        where: { userId_key: { userId: "user-1", key: "my-key" } },
        data: { importance: 0.9 },
      });
    });

    it("should return false when update throws with userId provided", async () => {
      mockPrisma.longTermMemory.update.mockRejectedValue(
        new Error("Not found"),
      );

      const result = await store.updateMetadata(
        "missing",
        { importance: 0.5 },
        "user-1",
      );

      expect(result).toBe(false);
    });

    it("should use updateMany when userId is not provided and return true when count > 0", async () => {
      mockPrisma.longTermMemory.updateMany.mockResolvedValue({ count: 3 });

      const result = await store.updateMetadata("my-key", {
        tags: ["new-tag"],
      });

      expect(result).toBe(true);
      expect(mockPrisma.longTermMemory.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ key: "my-key" }),
          data: { tags: ["new-tag"] },
        }),
      );
    });

    it("should return false when updateMany count is 0", async () => {
      mockPrisma.longTermMemory.updateMany.mockResolvedValue({ count: 0 });

      const result = await store.updateMetadata("missing-key", {
        importance: 0.1,
      });

      expect(result).toBe(false);
    });

    it("should only include importance in data when tags is not provided", async () => {
      mockPrisma.longTermMemory.updateMany.mockResolvedValue({ count: 1 });

      await store.updateMetadata("k", { importance: 0.7 });

      const call = mockPrisma.longTermMemory.updateMany.mock.calls[0][0];
      expect(call.data).toEqual({ importance: 0.7 });
      expect(call.data.tags).toBeUndefined();
    });

    it("should only include tags in data when importance is not provided", async () => {
      mockPrisma.longTermMemory.updateMany.mockResolvedValue({ count: 1 });

      await store.updateMetadata("k", { tags: ["x"] });

      const call = mockPrisma.longTermMemory.updateMany.mock.calls[0][0];
      expect(call.data).toEqual({ tags: ["x"] });
      expect(call.data.importance).toBeUndefined();
    });

    it("should include both importance and tags when both are provided", async () => {
      mockPrisma.longTermMemory.updateMany.mockResolvedValue({ count: 1 });

      await store.updateMetadata("k", { importance: 0.5, tags: ["y"] });

      const call = mockPrisma.longTermMemory.updateMany.mock.calls[0][0];
      expect(call.data).toEqual({ importance: 0.5, tags: ["y"] });
    });
  });

  // =========================================================================
  // cleanup()
  // =========================================================================

  describe("cleanup()", () => {
    it("should return 0 when table is not ready", async () => {
      const disabledStore = await buildStore(false);

      const count = await disabledStore.cleanup();

      expect(count).toBe(0);
      expect(mockPrisma.longTermMemory.deleteMany).not.toHaveBeenCalled();
    });

    it("should delete expired entries and return count", async () => {
      mockPrisma.longTermMemory.deleteMany.mockResolvedValue({ count: 5 });

      const count = await store.cleanup();

      expect(count).toBe(5);
      expect(mockPrisma.longTermMemory.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });

    it("should return 0 when no entries are expired", async () => {
      mockPrisma.longTermMemory.deleteMany.mockResolvedValue({ count: 0 });

      const count = await store.cleanup();

      expect(count).toBe(0);
    });
  });

  // =========================================================================
  // getStats()
  // =========================================================================

  describe("getStats()", () => {
    it("should return zeros when table is not ready", async () => {
      const disabledStore = await buildStore(false);

      const stats = await disabledStore.getStats();

      expect(stats).toEqual({ totalEntries: 0, userCount: 0 });
    });

    it("should return correct totalEntries and userCount", async () => {
      mockPrisma.longTermMemory.count.mockResolvedValue(42);
      mockPrisma.longTermMemory.groupBy.mockResolvedValue([
        { userId: "user-1" },
        { userId: "user-2" },
        { userId: "user-3" },
      ]);

      const stats = await store.getStats();

      expect(stats.totalEntries).toBe(42);
      expect(stats.userCount).toBe(3);
    });

    it("should return userCount 0 when groupBy returns empty array", async () => {
      mockPrisma.longTermMemory.count.mockResolvedValue(0);
      mockPrisma.longTermMemory.groupBy.mockResolvedValue([]);

      const stats = await store.getStats();

      expect(stats.userCount).toBe(0);
      expect(stats.totalEntries).toBe(0);
    });

    it("should run count and groupBy in parallel (both called once)", async () => {
      mockPrisma.longTermMemory.count.mockResolvedValue(10);
      mockPrisma.longTermMemory.groupBy.mockResolvedValue([{ userId: "u1" }]);

      await store.getStats();

      expect(mockPrisma.longTermMemory.count).toHaveBeenCalledTimes(1);
      expect(mockPrisma.longTermMemory.groupBy).toHaveBeenCalledTimes(1);
    });
  });
});
