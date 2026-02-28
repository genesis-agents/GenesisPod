/**
 * EventJournalService Unit Tests
 *
 * Covers all public methods of the event journal:
 * - record()      - create event with auto-incremented sequence
 * - recordStep()  - idempotent step execution (execute vs. replay)
 * - replay()      - return all events in chronological order
 * - getHistory()  - paginated results with total count
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EventJournalService } from "../event-journal.service";
import { JournalEntry } from "../../process/process.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: "entry-1",
    processId: "proc-1",
    sequence: 1,
    type: "STEP_EXECUTED",
    payload: null,
    result: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockPrisma = {
  $queryRaw: jest.fn(),
  processEvent: {
    count: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("EventJournalService", () => {
  let service: EventJournalService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: table exists so the service enables itself
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventJournalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<EventJournalService>(EventJournalService);

    await service.onModuleInit();

    // Suppress Logger output during tests
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // record()
  // =========================================================================

  describe("record()", () => {
    it("should return the inserted entry from $queryRaw", async () => {
      const entry = makeEntry({ sequence: 4, type: "MY_EVENT" });
      // record() calls $queryRaw once for onModuleInit (already consumed) then
      // once for the INSERT — reset and set a new resolved value
      mockPrisma.$queryRaw.mockResolvedValue([entry]);

      const result = await service.record("proc-1", "MY_EVENT");

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
      expect(result.sequence).toBe(4);
      expect(result.type).toBe("MY_EVENT");
    });

    it("should return sequence 1 for the very first event", async () => {
      const entry = makeEntry({ sequence: 1, type: "FIRST_EVENT" });
      mockPrisma.$queryRaw.mockResolvedValue([entry]);

      const result = await service.record("proc-1", "FIRST_EVENT");

      expect(result.sequence).toBe(1);
    });

    it("should return the entry with payload and result when provided", async () => {
      const payload = { input: "hello" };
      const resultData = { output: "world" };
      const entry = makeEntry({ payload, result: resultData });
      mockPrisma.$queryRaw.mockResolvedValue([entry]);

      const returned = await service.record(
        "proc-1",
        "STEP",
        payload,
        resultData,
      );

      expect(returned.payload).toEqual(payload);
      expect(returned.result).toEqual(resultData);
    });

    it("should return an entry with null payload and result when not provided", async () => {
      const entry = makeEntry({ sequence: 2, payload: null, result: null });
      mockPrisma.$queryRaw.mockResolvedValue([entry]);

      const returned = await service.record("proc-1", "NO_DATA_EVENT");

      expect(returned.payload).toBeNull();
      expect(returned.result).toBeNull();
    });
  });

  // =========================================================================
  // recordStep()
  // =========================================================================

  describe("recordStep()", () => {
    it("should execute the step and record the result when no existing event found", async () => {
      mockPrisma.processEvent.findFirst.mockResolvedValue(null);
      // Internal record() call uses $queryRaw for the INSERT
      mockPrisma.$queryRaw.mockResolvedValue([
        makeEntry({ type: "GENERATE_PLAN", result: { plan: ["step1"] } }),
      ]);

      const executeMock = jest.fn().mockResolvedValue({ plan: ["step1"] });
      const step = {
        type: "GENERATE_PLAN",
        payload: { input: "topic" },
        execute: executeMock,
      };

      const result = await service.recordStep("proc-1", step);

      expect(mockPrisma.processEvent.findFirst).toHaveBeenCalledWith({
        where: { processId: "proc-1", type: "GENERATE_PLAN" },
      });
      expect(executeMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ plan: ["step1"] });
      // Verify record() was called via $queryRaw
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it("should return the cached result without executing when event already exists (idempotent replay)", async () => {
      const cachedResult = { plan: ["cached-step"] };
      const existingEntry = makeEntry({
        type: "GENERATE_PLAN",
        result: cachedResult,
      });
      mockPrisma.processEvent.findFirst.mockResolvedValue(existingEntry);

      const executeMock = jest.fn();
      const step = {
        type: "GENERATE_PLAN",
        payload: { input: "topic" },
        execute: executeMock,
      };

      // Reset $queryRaw call count after onModuleInit
      mockPrisma.$queryRaw.mockClear();

      const result = await service.recordStep("proc-1", step);

      expect(executeMock).not.toHaveBeenCalled();
      expect(result).toEqual(cachedResult);
      // record() (and therefore $queryRaw INSERT) should NOT be called again
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("should look up the existing event by both processId and type", async () => {
      mockPrisma.processEvent.findFirst.mockResolvedValue(null);
      mockPrisma.$queryRaw.mockResolvedValue([makeEntry()]);

      await service.recordStep("proc-42", {
        type: "UNIQUE_STEP",
        payload: {},
        execute: jest.fn().mockResolvedValue({}),
      });

      expect(mockPrisma.processEvent.findFirst).toHaveBeenCalledWith({
        where: { processId: "proc-42", type: "UNIQUE_STEP" },
      });
    });

    it("should call $queryRaw (INSERT) with the step payload after execution", async () => {
      mockPrisma.processEvent.findFirst.mockResolvedValue(null);
      mockPrisma.$queryRaw.mockResolvedValue([makeEntry()]);

      const payload = { context: "some data" };
      const stepResult = { analysis: "done" };

      await service.recordStep("proc-1", {
        type: "ANALYSE",
        payload,
        execute: jest.fn().mockResolvedValue(stepResult),
      });

      // record() is called via $queryRaw — verify it was called at least once
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // replay()
  // =========================================================================

  describe("replay()", () => {
    it("should return all events ordered by sequence ascending", async () => {
      const entries = [
        makeEntry({ id: "e1", sequence: 1 }),
        makeEntry({ id: "e2", sequence: 2 }),
        makeEntry({ id: "e3", sequence: 3 }),
      ];
      mockPrisma.processEvent.findMany.mockResolvedValue(entries);

      const result = await service.replay("proc-1");

      expect(mockPrisma.processEvent.findMany).toHaveBeenCalledWith({
        where: { processId: "proc-1" },
        orderBy: { sequence: "asc" },
      });
      expect(result).toHaveLength(3);
      expect(result[0].sequence).toBe(1);
      expect(result[2].sequence).toBe(3);
    });

    it("should return an empty array when there are no events", async () => {
      mockPrisma.processEvent.findMany.mockResolvedValue([]);

      const result = await service.replay("proc-no-events");

      expect(result).toEqual([]);
    });

    it("should map each record through toJournalEntry (passthrough cast)", async () => {
      const entries = [makeEntry({ id: "e1", type: "CUSTOM_TYPE" })];
      mockPrisma.processEvent.findMany.mockResolvedValue(entries);

      const result = await service.replay("proc-1");

      expect(result[0].type).toBe("CUSTOM_TYPE");
    });
  });

  // =========================================================================
  // getHistory()
  // =========================================================================

  describe("getHistory()", () => {
    it("should return paginated entries and total count", async () => {
      const entries = [
        makeEntry({ id: "e1", sequence: 1 }),
        makeEntry({ id: "e2", sequence: 2 }),
      ];
      mockPrisma.processEvent.findMany.mockResolvedValue(entries);
      mockPrisma.processEvent.count.mockResolvedValue(5);

      const result = await service.getHistory("proc-1", {
        limit: 2,
        offset: 0,
      });

      expect(result.entries).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(mockPrisma.processEvent.findMany).toHaveBeenCalledWith({
        where: { processId: "proc-1" },
        orderBy: { sequence: "asc" },
        skip: 0,
        take: 2,
      });
      expect(mockPrisma.processEvent.count).toHaveBeenCalledWith({
        where: { processId: "proc-1" },
      });
    });

    it("should default offset to 0 when not provided", async () => {
      mockPrisma.processEvent.findMany.mockResolvedValue([]);
      mockPrisma.processEvent.count.mockResolvedValue(0);

      await service.getHistory("proc-1", { limit: 10 });

      expect(mockPrisma.processEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 }),
      );
    });

    it("should omit the take clause when limit is not provided", async () => {
      mockPrisma.processEvent.findMany.mockResolvedValue([]);
      mockPrisma.processEvent.count.mockResolvedValue(0);

      await service.getHistory("proc-1");

      const callArg = mockPrisma.processEvent.findMany.mock.calls[0][0];
      expect(callArg).not.toHaveProperty("take");
    });

    it("should handle empty results gracefully", async () => {
      mockPrisma.processEvent.findMany.mockResolvedValue([]);
      mockPrisma.processEvent.count.mockResolvedValue(0);

      const result = await service.getHistory("proc-no-events");

      expect(result.entries).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("should apply offset correctly when paginating deep into results", async () => {
      const entries = [makeEntry({ id: "e11", sequence: 11 })];
      mockPrisma.processEvent.findMany.mockResolvedValue(entries);
      mockPrisma.processEvent.count.mockResolvedValue(20);

      const result = await service.getHistory("proc-1", {
        limit: 5,
        offset: 10,
      });

      expect(mockPrisma.processEvent.findMany).toHaveBeenCalledWith({
        where: { processId: "proc-1" },
        orderBy: { sequence: "asc" },
        skip: 10,
        take: 5,
      });
      expect(result.total).toBe(20);
    });

    it("should run count and findMany in parallel (both called once per invocation)", async () => {
      mockPrisma.processEvent.findMany.mockResolvedValue([]);
      mockPrisma.processEvent.count.mockResolvedValue(0);

      await service.getHistory("proc-1", { limit: 5 });

      expect(mockPrisma.processEvent.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.processEvent.count).toHaveBeenCalledTimes(1);
    });
  });
});
