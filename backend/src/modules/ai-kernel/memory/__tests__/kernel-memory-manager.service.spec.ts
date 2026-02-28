/**
 * KernelMemoryManagerService Unit Tests
 *
 * Tests process-level memory management backed by the ProcessMemory table:
 * - read()     - fetch, expire, and return null
 * - write()    - upsert a memory entry
 * - query()    - list entries with optional layer/keyPattern filters
 * - cleanup()  - delete expired entries for a process
 * - deleteAll() - delete every entry for a process
 */

import { Test, TestingModule } from "@nestjs/testing";
import { KernelMemoryManagerService } from "../kernel-memory-manager.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { MemoryLayer } from "@prisma/client";
import type { MemoryEntry, MemoryQuery } from "../../process/process.types";

describe("KernelMemoryManagerService", () => {
  let service: KernelMemoryManagerService;
  let mockPrisma: {
    $queryRaw: jest.Mock;
    processMemory: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const processId = "proc-abc-123";
  const layer = MemoryLayer.WORKING;
  const key = "test-key";

  const baseRecord = {
    id: "mem-001",
    processId,
    layer,
    key,
    value: { data: "hello" },
    expiresAt: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  };

  beforeEach(async () => {
    mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ exists: true }]),
      processMemory: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KernelMemoryManagerService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<KernelMemoryManagerService>(
      KernelMemoryManagerService,
    );

    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── read() ───────────────────────────────────────────────────────────────

  describe("read()", () => {
    it("should return value when entry exists and is not expired", async () => {
      mockPrisma.processMemory.findUnique.mockResolvedValue(baseRecord);

      const result = await service.read(processId, layer, key);

      expect(result).toEqual({ data: "hello" });
      expect(mockPrisma.processMemory.findUnique).toHaveBeenCalledWith({
        where: { processId_layer_key: { processId, layer, key } },
      });
      expect(mockPrisma.processMemory.delete).not.toHaveBeenCalled();
    });

    it("should return null when entry does not exist", async () => {
      mockPrisma.processMemory.findUnique.mockResolvedValue(null);

      const result = await service.read(processId, layer, key);

      expect(result).toBeNull();
      expect(mockPrisma.processMemory.delete).not.toHaveBeenCalled();
    });

    it("should delete the entry and return null when it is expired", async () => {
      const expiredRecord = {
        ...baseRecord,
        expiresAt: new Date(Date.now() - 10_000), // 10 seconds in the past
      };
      mockPrisma.processMemory.findUnique.mockResolvedValue(expiredRecord);
      mockPrisma.processMemory.delete.mockResolvedValue(expiredRecord);

      const result = await service.read(processId, layer, key);

      expect(result).toBeNull();
      expect(mockPrisma.processMemory.delete).toHaveBeenCalledWith({
        where: { id: expiredRecord.id },
      });
    });

    it("should return value when expiresAt is set but still in the future", async () => {
      const futureRecord = {
        ...baseRecord,
        expiresAt: new Date(Date.now() + 60_000), // 1 minute ahead
      };
      mockPrisma.processMemory.findUnique.mockResolvedValue(futureRecord);

      const result = await service.read(processId, layer, key);

      expect(result).toEqual({ data: "hello" });
      expect(mockPrisma.processMemory.delete).not.toHaveBeenCalled();
    });
  });

  // ─── write() ──────────────────────────────────────────────────────────────

  describe("write()", () => {
    it("should upsert a memory entry without expiry", async () => {
      mockPrisma.processMemory.upsert.mockResolvedValue(baseRecord);

      const entry: MemoryEntry = {
        processId,
        layer,
        key,
        value: { data: "hello" },
      };

      await service.write(entry);

      expect(mockPrisma.processMemory.upsert).toHaveBeenCalledWith({
        where: { processId_layer_key: { processId, layer, key } },
        update: { value: entry.value, expiresAt: null },
        create: {
          processId,
          layer,
          key,
          value: entry.value,
          expiresAt: undefined,
        },
      });
    });

    it("should upsert a memory entry with an expiry date", async () => {
      const expiresAt = new Date(Date.now() + 3_600_000);
      mockPrisma.processMemory.upsert.mockResolvedValue({
        ...baseRecord,
        expiresAt,
      });

      const entry: MemoryEntry = {
        processId,
        layer,
        key,
        value: "cached-result",
        expiresAt,
      };

      await service.write(entry);

      expect(mockPrisma.processMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { value: "cached-result", expiresAt },
          create: expect.objectContaining({ expiresAt }),
        }),
      );
    });
  });

  // ─── query() ──────────────────────────────────────────────────────────────

  describe("query()", () => {
    const makeRecord = (k: string, l: MemoryLayer = layer) => ({
      ...baseRecord,
      id: `mem-${k}`,
      key: k,
      layer: l,
      expiresAt: null,
    });

    it("should return all entries for a process when no filters are given", async () => {
      const records = [makeRecord("key-a"), makeRecord("key-b")];
      mockPrisma.processMemory.findMany.mockResolvedValue(records);

      const query: MemoryQuery = { processId };
      const results = await service.query(query);

      expect(results).toHaveLength(2);
      expect(results[0].key).toBe("key-a");
      expect(results[1].key).toBe("key-b");
      expect(mockPrisma.processMemory.findMany).toHaveBeenCalledWith({
        where: { processId },
        take: 100,
        orderBy: { updatedAt: "desc" },
      });
    });

    it("should filter entries by memory layer", async () => {
      const sessionLayer = MemoryLayer.SESSION;
      const records = [makeRecord("sess-key", sessionLayer)];
      mockPrisma.processMemory.findMany.mockResolvedValue(records);

      const query: MemoryQuery = { processId, layer: sessionLayer };
      const results = await service.query(query);

      expect(results).toHaveLength(1);
      expect(results[0].layer).toBe(sessionLayer);
      expect(mockPrisma.processMemory.findMany).toHaveBeenCalledWith({
        where: { processId, layer: sessionLayer },
        take: 100,
        orderBy: { updatedAt: "desc" },
      });
    });

    it("should filter entries by key pattern", async () => {
      const records = [makeRecord("user:profile")];
      mockPrisma.processMemory.findMany.mockResolvedValue(records);

      const query: MemoryQuery = { processId, keyPattern: "user:" };
      const results = await service.query(query);

      expect(results).toHaveLength(1);
      expect(mockPrisma.processMemory.findMany).toHaveBeenCalledWith({
        where: { processId, key: { contains: "user:" } },
        take: 100,
        orderBy: { updatedAt: "desc" },
      });
    });

    it("should respect the limit parameter", async () => {
      mockPrisma.processMemory.findMany.mockResolvedValue([
        makeRecord("only-one"),
      ]);

      const query: MemoryQuery = { processId, limit: 5 };
      await service.query(query);

      expect(mockPrisma.processMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });

    it("should map expiresAt null to undefined in the returned entries", async () => {
      mockPrisma.processMemory.findMany.mockResolvedValue([makeRecord("k1")]);

      const results = await service.query({ processId });

      expect(results[0].expiresAt).toBeUndefined();
    });

    it("should preserve expiresAt when it is set in the returned entries", async () => {
      const expiresAt = new Date(Date.now() + 60_000);
      const rec = { ...makeRecord("k2"), expiresAt };
      mockPrisma.processMemory.findMany.mockResolvedValue([rec]);

      const results = await service.query({ processId });

      expect(results[0].expiresAt).toEqual(expiresAt);
    });
  });

  // ─── cleanup() ────────────────────────────────────────────────────────────

  describe("cleanup()", () => {
    it("should delete expired entries and return the count", async () => {
      mockPrisma.processMemory.deleteMany.mockResolvedValue({ count: 3 });

      const count = await service.cleanup(processId);

      expect(count).toBe(3);
      expect(mockPrisma.processMemory.deleteMany).toHaveBeenCalledWith({
        where: {
          processId,
          expiresAt: { lt: expect.any(Date) },
        },
      });
    });

    it("should return 0 when no expired entries exist", async () => {
      mockPrisma.processMemory.deleteMany.mockResolvedValue({ count: 0 });

      const count = await service.cleanup(processId);

      expect(count).toBe(0);
    });
  });

  // ─── deleteAll() ──────────────────────────────────────────────────────────

  describe("deleteAll()", () => {
    it("should delete all entries for the given process and return the count", async () => {
      mockPrisma.processMemory.deleteMany.mockResolvedValue({ count: 7 });

      const count = await service.deleteAll(processId);

      expect(count).toBe(7);
      expect(mockPrisma.processMemory.deleteMany).toHaveBeenCalledWith({
        where: { processId },
      });
    });

    it("should return 0 when the process has no memory entries", async () => {
      mockPrisma.processMemory.deleteMany.mockResolvedValue({ count: 0 });

      const count = await service.deleteAll(processId);

      expect(count).toBe(0);
    });
  });
});
