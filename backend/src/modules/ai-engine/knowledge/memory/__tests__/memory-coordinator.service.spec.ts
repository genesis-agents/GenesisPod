import { Test, TestingModule } from "@nestjs/testing";
import {
  MemoryCoordinatorService,
  MemoryEvent,
} from "../memory-coordinator.service";
import { ShortTermMemoryService } from "@/modules/ai-engine/knowledge/memory/stores/short-term-memory.service";
import { LongTermMemoryService } from "../stores/long-term-memory.service";

// ─── Mocks ────────────────────────────────────────────────

const shortTermMock = {
  getWithSession: jest.fn(),
  setWithSession: jest.fn(),
};

const longTermMock = {
  getWithUser: jest.fn(),
  setWithUser: jest.fn(),
};

const USER_ID = "user-1";
const SESSION_ID = "sess-1";

describe("MemoryCoordinatorService", () => {
  let service: MemoryCoordinatorService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryCoordinatorService,
        { provide: ShortTermMemoryService, useValue: shortTermMock },
        { provide: LongTermMemoryService, useValue: longTermMock },
      ],
    }).compile();

    service = module.get(MemoryCoordinatorService);
  });

  describe("recall()", () => {
    it("returns empty context when all layers return nothing", async () => {
      shortTermMock.getWithSession.mockResolvedValue(undefined);
      longTermMock.getWithUser.mockResolvedValue(null);

      const ctx = await service.recall(
        { query: "AI trends" },
        USER_ID,
        SESSION_ID,
      );

      expect(ctx.fragments).toHaveLength(0);
      expect(ctx.layerHits[1]).toBe(0);
      expect(ctx.layerHits[3]).toBe(0);
    });

    it("includes layer 1 result when session has the key", async () => {
      shortTermMock.getWithSession
        .mockResolvedValueOnce("Paris") // Layer 1 exact match
        .mockResolvedValueOnce(undefined); // Layer 2 working prefix miss
      longTermMock.getWithUser.mockResolvedValue(null);

      const ctx = await service.recall(
        { query: "capital" },
        USER_ID,
        SESSION_ID,
      );

      expect(ctx.fragments.some((f) => f.layer === 1)).toBe(true);
      expect(ctx.layerHits[1]).toBe(1);
    });

    it("includes layer 3 result and sets relevanceScore from importance", async () => {
      shortTermMock.getWithSession.mockResolvedValue(undefined);
      longTermMock.getWithUser.mockResolvedValue({
        value: "user prefers concise answers",
        type: "preference",
        importance: 0.8,
      });

      const ctx = await service.recall({ query: "style" }, USER_ID);

      const l3 = ctx.fragments.find((f) => f.layer === 3)!;
      expect(l3).toBeDefined();
      expect(l3.relevanceScore).toBe(0.8);
      expect(l3.type).toBe("preference");
    });

    it("respects limit parameter", async () => {
      shortTermMock.getWithSession
        .mockResolvedValueOnce("val1") // L1
        .mockResolvedValueOnce("val2"); // L2
      longTermMock.getWithUser.mockResolvedValue({
        value: "val3",
        type: "knowledge",
        importance: 0.5,
      });

      const ctx = await service.recall(
        { query: "q", limit: 2 },
        USER_ID,
        SESSION_ID,
      );

      expect(ctx.fragments.length).toBeLessThanOrEqual(2);
    });

    it("skips layer 2 and 3 when layers=[1] is specified", async () => {
      shortTermMock.getWithSession.mockResolvedValue("val");

      const ctx = await service.recall(
        { query: "q", layers: [1] },
        USER_ID,
        SESSION_ID,
      );

      expect(longTermMock.getWithUser).not.toHaveBeenCalled();
      expect(ctx.layerHits[2]).toBe(0);
      expect(ctx.layerHits[3]).toBe(0);
    });

    it("does not throw when a layer fails", async () => {
      shortTermMock.getWithSession.mockRejectedValue(new Error("Redis down"));
      longTermMock.getWithUser.mockResolvedValue(null);

      const ctx = await service.recall({ query: "q" }, USER_ID, SESSION_ID);
      expect(ctx.fragments).toHaveLength(0);
    });
  });

  describe("store()", () => {
    it("routes conversation event to Layer 1 (short-term)", async () => {
      const event: MemoryEvent = {
        type: "conversation",
        key: "last-response",
        value: "hello world",
      };

      await service.store(event, USER_ID, SESSION_ID);

      expect(shortTermMock.setWithSession).toHaveBeenCalledWith(
        SESSION_ID,
        "last-response",
        "hello world",
        undefined,
      );
      expect(longTermMock.setWithUser).not.toHaveBeenCalled();
    });

    it("routes working event to Layer 2 with prefix and default TTL", async () => {
      const event: MemoryEvent = {
        type: "working",
        key: "plan",
        value: { steps: 3 },
      };

      await service.store(event, USER_ID, SESSION_ID);

      expect(shortTermMock.setWithSession).toHaveBeenCalledWith(
        SESSION_ID,
        "work:plan",
        { steps: 3 },
        86_400, // default TTL
      );
    });

    it("routes preference event to Layer 3 (long-term)", async () => {
      const event: MemoryEvent = {
        type: "preference",
        key: "writing-style",
        value: "concise",
        importance: 0.9,
        tags: ["writing"],
      };

      await service.store(event, USER_ID, SESSION_ID);

      expect(longTermMock.setWithUser).toHaveBeenCalledWith(
        USER_ID,
        "writing-style",
        "concise",
        expect.objectContaining({ type: "preference", importance: 0.9 }),
      );
    });

    it("does not throw when storage fails", async () => {
      shortTermMock.setWithSession.mockRejectedValue(new Error("disk full"));

      const event: MemoryEvent = {
        type: "conversation",
        key: "k",
        value: "v",
      };

      // Should resolve without throwing
      await expect(
        service.store(event, USER_ID, SESSION_ID),
      ).resolves.toBeUndefined();
    });

    it("skips layer 1 store when sessionId is not provided", async () => {
      const event: MemoryEvent = {
        type: "conversation",
        key: "k",
        value: "v",
      };

      await service.store(event, USER_ID); // no sessionId

      expect(shortTermMock.setWithSession).not.toHaveBeenCalled();
    });
  });
});
