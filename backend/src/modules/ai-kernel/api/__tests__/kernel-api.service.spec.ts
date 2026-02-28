/**
 * KernelApiService Unit Tests
 *
 * Verifies that every public method on KernelApiService is a thin delegation
 * layer that forwards calls (with the correct arguments) to the matching
 * dependency service and returns whatever that service returns.
 *
 * All five dependencies are fully mocked so no I/O or database is required.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { KernelApiService } from "../kernel-api.service";
import { ProcessManagerService } from "../../process/process-manager.service";
import { EventJournalService } from "../../journal/event-journal.service";
import { KernelMemoryManagerService } from "../../memory/kernel-memory-manager.service";
import { ResourceManagerService } from "../../resource/resource-manager.service";
import { MissionExecutorService } from "../../mission/mission-executor.service";
import { CircuitBreakerService } from "../../resource/circuit-breaker.service";
import { EventBusService } from "../../ipc/event-bus.service";
import { MessageBusService } from "../../ipc/message-bus.service";
import { ProgressTrackerService } from "../../ipc/progress-tracker.service";
import { KernelMetricsService } from "../../observability/kernel-metrics.service";
import { CostAttributionService } from "../../observability/cost-attribution.service";
import { CapabilityGuardService } from "../../security/capability-guard.service";
import { KernelSchedulerService } from "../../scheduler/kernel-scheduler.service";

// ─── Shared test fixtures ────────────────────────────────────────────────────

const PROCESS_ID = "process-abc-123";
const USER_ID = "user-xyz-456";

const mockProcessSnapshot = {
  id: PROCESS_ID,
  userId: USER_ID,
  parentId: null,
  agentId: "agent-1",
  teamSessionId: null,
  state: "RUNNING",
  priority: 5,
  tokenBudget: 50000,
  tokensUsed: 0,
  costBudget: 1.0,
  costUsed: 0,
  checkpoint: null,
  input: null,
  output: null,
  error: null,
  grantedTools: [],
  grantedSkills: [],
  dataScope: null,
  metadata: null,
  version: 1,
  startedAt: null,
  completedAt: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

const mockJournalEntry = {
  id: "event-e1",
  processId: PROCESS_ID,
  sequence: 1,
  type: "test:event",
  payload: null,
  result: null,
  createdAt: new Date("2025-01-01"),
};

const mockMemoryEntry = {
  processId: PROCESS_ID,
  layer: "WORKING" as const,
  key: "some-key",
  value: { data: 42 },
};

// ─── Mocked service objects ──────────────────────────────────────────────────

const mockProcessManager = {
  spawn: jest.fn().mockResolvedValue(mockProcessSnapshot),
  getState: jest.fn().mockResolvedValue(mockProcessSnapshot),
  listByUser: jest.fn().mockResolvedValue([mockProcessSnapshot]),
  pause: jest.fn().mockResolvedValue(mockProcessSnapshot),
  resume: jest.fn().mockResolvedValue(mockProcessSnapshot),
  cancel: jest.fn().mockResolvedValue(mockProcessSnapshot),
};

const mockEventJournal = {
  record: jest.fn().mockResolvedValue(mockJournalEntry),
  getHistory: jest
    .fn()
    .mockResolvedValue({ entries: [mockJournalEntry], total: 1 }),
};

const mockMemoryManager = {
  read: jest.fn().mockResolvedValue({ data: "cached" }),
  write: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue([mockMemoryEntry]),
};

const mockResourceManager = {
  checkBudget: jest.fn().mockResolvedValue({ canProceed: true }),
  consume: jest.fn().mockResolvedValue(undefined),
};

const mockMissionExecutor = {
  execute: jest
    .fn()
    .mockResolvedValue({ processId: PROCESS_ID, process: mockProcessSnapshot }),
  complete: jest.fn().mockResolvedValue(undefined),
  fail: jest.fn().mockResolvedValue(undefined),
};

const mockCircuitBreaker = {
  getAllHealthMetrics: jest.fn().mockReturnValue([]),
  getStats: jest
    .fn()
    .mockReturnValue({ totalBreakers: 0, oldestBreakerAge: null, config: {} }),
  reset: jest.fn(),
};

const mockEventBus = {
  getActiveSubscriptionCount: jest.fn().mockReturnValue(0),
};

const mockMessageBus = {
  getHistory: jest.fn().mockReturnValue([]),
};

const mockProgressTracker = {
  getActiveTasks: jest.fn().mockReturnValue([]),
  getProgress: jest.fn().mockReturnValue(null),
};

const mockKernelMetrics = {
  getDashboard: jest.fn().mockReturnValue({ totalCalls: 0 }),
};

const mockCostAttribution = {
  getCostReport: jest.fn().mockReturnValue({ totalCost: 0 }),
  getHourlyTrend: jest.fn().mockReturnValue([]),
  checkBudgetAlerts: jest.fn().mockReturnValue([]),
};

const mockCapabilityGuard = {
  getCapabilities: jest
    .fn()
    .mockResolvedValue({
      grantedTools: [],
      grantedSkills: [],
      dataScope: null,
    }),
};

const mockKernelScheduler = {
  getStats: jest
    .fn()
    .mockResolvedValue({
      running: 0,
      ready: 0,
      maxConcurrent: 50,
      maxPerTenant: 10,
    }),
};

// ─── Test suite ──────────────────────────────────────────────────────────────

describe("KernelApiService", () => {
  let service: KernelApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KernelApiService,
        { provide: ProcessManagerService, useValue: mockProcessManager },
        { provide: EventJournalService, useValue: mockEventJournal },
        { provide: KernelMemoryManagerService, useValue: mockMemoryManager },
        { provide: ResourceManagerService, useValue: mockResourceManager },
        { provide: MissionExecutorService, useValue: mockMissionExecutor },
        { provide: CircuitBreakerService, useValue: mockCircuitBreaker },
        { provide: EventBusService, useValue: mockEventBus },
        { provide: MessageBusService, useValue: mockMessageBus },
        { provide: ProgressTrackerService, useValue: mockProgressTracker },
        { provide: KernelMetricsService, useValue: mockKernelMetrics },
        { provide: CostAttributionService, useValue: mockCostAttribution },
        { provide: CapabilityGuardService, useValue: mockCapabilityGuard },
        { provide: KernelSchedulerService, useValue: mockKernelScheduler },
      ],
    }).compile();

    service = module.get<KernelApiService>(KernelApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Process Management ────────────────────────────────────────────────────

  describe("spawn()", () => {
    it("should delegate to processManager.spawn and return its result", async () => {
      const options = {
        userId: USER_ID,
        agentId: "agent-1",
        tokenBudget: 10000,
      };

      const result = await service.spawn(options);

      expect(mockProcessManager.spawn).toHaveBeenCalledTimes(1);
      expect(mockProcessManager.spawn).toHaveBeenCalledWith(options);
      expect(result).toBe(mockProcessSnapshot);
    });
  });

  describe("getProcess()", () => {
    it("should delegate to processManager.getState with the processId", async () => {
      const result = await service.getProcess(PROCESS_ID);

      expect(mockProcessManager.getState).toHaveBeenCalledTimes(1);
      expect(mockProcessManager.getState).toHaveBeenCalledWith(PROCESS_ID);
      expect(result).toBe(mockProcessSnapshot);
    });

    it("should return null when processManager.getState returns null", async () => {
      mockProcessManager.getState.mockResolvedValueOnce(null);

      const result = await service.getProcess("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("listProcesses()", () => {
    it("should delegate to processManager.listByUser with userId and no states filter", async () => {
      const result = await service.listProcesses(USER_ID);

      expect(mockProcessManager.listByUser).toHaveBeenCalledTimes(1);
      expect(mockProcessManager.listByUser).toHaveBeenCalledWith(
        USER_ID,
        undefined,
      );
      expect(result).toEqual([mockProcessSnapshot]);
    });

    it("should forward the states filter to processManager.listByUser", async () => {
      const states = ["RUNNING", "PAUSED"] as any;

      await service.listProcesses(USER_ID, states);

      expect(mockProcessManager.listByUser).toHaveBeenCalledWith(
        USER_ID,
        states,
      );
    });
  });

  describe("pauseProcess()", () => {
    it("should delegate to processManager.pause with the processId", async () => {
      const result = await service.pauseProcess(PROCESS_ID);

      expect(mockProcessManager.pause).toHaveBeenCalledTimes(1);
      expect(mockProcessManager.pause).toHaveBeenCalledWith(PROCESS_ID);
      expect(result).toBe(mockProcessSnapshot);
    });
  });

  describe("resumeProcess()", () => {
    it("should delegate to processManager.resume with the processId", async () => {
      const result = await service.resumeProcess(PROCESS_ID);

      expect(mockProcessManager.resume).toHaveBeenCalledTimes(1);
      expect(mockProcessManager.resume).toHaveBeenCalledWith(PROCESS_ID);
      expect(result).toBe(mockProcessSnapshot);
    });
  });

  describe("cancelProcess()", () => {
    it("should delegate to processManager.cancel with the processId", async () => {
      const result = await service.cancelProcess(PROCESS_ID);

      expect(mockProcessManager.cancel).toHaveBeenCalledTimes(1);
      expect(mockProcessManager.cancel).toHaveBeenCalledWith(PROCESS_ID);
      expect(result).toBe(mockProcessSnapshot);
    });
  });

  // ─── Mission ───────────────────────────────────────────────────────────────

  describe("executeMission()", () => {
    it("should delegate to missionExecutor.execute and return its result", async () => {
      const options = {
        userId: USER_ID,
        agentId: "agent-1",
        input: { task: "research AI trends" },
        tokenBudget: 20000,
      };

      const result = await service.executeMission(options);

      expect(mockMissionExecutor.execute).toHaveBeenCalledTimes(1);
      expect(mockMissionExecutor.execute).toHaveBeenCalledWith(options);
      expect(result).toEqual({
        processId: PROCESS_ID,
        process: mockProcessSnapshot,
      });
    });
  });

  describe("completeMission()", () => {
    it("should delegate to missionExecutor.complete with processId and output", async () => {
      const output = { summary: "Done" };

      await service.completeMission(PROCESS_ID, output);

      expect(mockMissionExecutor.complete).toHaveBeenCalledTimes(1);
      expect(mockMissionExecutor.complete).toHaveBeenCalledWith(
        PROCESS_ID,
        output,
      );
    });

    it("should delegate to missionExecutor.complete with no output when omitted", async () => {
      await service.completeMission(PROCESS_ID);

      expect(mockMissionExecutor.complete).toHaveBeenCalledWith(
        PROCESS_ID,
        undefined,
      );
    });
  });

  describe("failMission()", () => {
    it("should delegate to missionExecutor.fail with processId and error message", async () => {
      const errorMessage = "Quota exceeded";

      await service.failMission(PROCESS_ID, errorMessage);

      expect(mockMissionExecutor.fail).toHaveBeenCalledTimes(1);
      expect(mockMissionExecutor.fail).toHaveBeenCalledWith(
        PROCESS_ID,
        errorMessage,
      );
    });
  });

  // ─── Memory ────────────────────────────────────────────────────────────────

  describe("readMemory()", () => {
    it("should delegate to memoryManager.read with processId, layer, and key", async () => {
      const layer = "WORKING" as any;
      const key = "my-key";

      const result = await service.readMemory(PROCESS_ID, layer, key);

      expect(mockMemoryManager.read).toHaveBeenCalledTimes(1);
      expect(mockMemoryManager.read).toHaveBeenCalledWith(
        PROCESS_ID,
        layer,
        key,
      );
      expect(result).toEqual({ data: "cached" });
    });

    it("should return null when memoryManager.read returns null", async () => {
      mockMemoryManager.read.mockResolvedValueOnce(null);

      const result = await service.readMemory(
        PROCESS_ID,
        "WORKING" as any,
        "missing",
      );

      expect(result).toBeNull();
    });
  });

  describe("writeMemory()", () => {
    it("should delegate to memoryManager.write with the full MemoryEntry", async () => {
      await service.writeMemory(mockMemoryEntry);

      expect(mockMemoryManager.write).toHaveBeenCalledTimes(1);
      expect(mockMemoryManager.write).toHaveBeenCalledWith(mockMemoryEntry);
    });
  });

  describe("queryMemory()", () => {
    it("should delegate to memoryManager.query with the query object and return entries", async () => {
      const query = {
        processId: PROCESS_ID,
        layer: "WORKING" as any,
        keyPattern: "some-*",
        limit: 10,
      };

      const result = await service.queryMemory(query);

      expect(mockMemoryManager.query).toHaveBeenCalledTimes(1);
      expect(mockMemoryManager.query).toHaveBeenCalledWith(query);
      expect(result).toEqual([mockMemoryEntry]);
    });

    it("should return an empty array when memoryManager.query returns none", async () => {
      mockMemoryManager.query.mockResolvedValueOnce([]);

      const result = await service.queryMemory({ processId: PROCESS_ID });

      expect(result).toEqual([]);
    });
  });

  // ─── Resources ─────────────────────────────────────────────────────────────

  describe("checkBudget()", () => {
    it("should delegate to resourceManager.checkBudget with processId", async () => {
      const result = await service.checkBudget(PROCESS_ID);

      expect(mockResourceManager.checkBudget).toHaveBeenCalledTimes(1);
      expect(mockResourceManager.checkBudget).toHaveBeenCalledWith(PROCESS_ID);
      expect(result).toEqual({ canProceed: true });
    });

    it("should return canProceed false and a reason when budget is exhausted", async () => {
      mockResourceManager.checkBudget.mockResolvedValueOnce({
        canProceed: false,
        reason: "Token budget exhausted: 50000/50000",
      });

      const result = await service.checkBudget(PROCESS_ID);

      expect(result.canProceed).toBe(false);
      expect(result.reason).toContain("Token budget exhausted");
    });
  });

  describe("consumeResources()", () => {
    it("should delegate to resourceManager.consume with processId and consumption", async () => {
      const consumption = { tokensUsed: 500, costUsed: 0.02 };

      await service.consumeResources(PROCESS_ID, consumption);

      expect(mockResourceManager.consume).toHaveBeenCalledTimes(1);
      expect(mockResourceManager.consume).toHaveBeenCalledWith(
        PROCESS_ID,
        consumption,
      );
    });

    it("should delegate with a tokens-only consumption object", async () => {
      const consumption = { tokensUsed: 100 };

      await service.consumeResources(PROCESS_ID, consumption);

      expect(mockResourceManager.consume).toHaveBeenCalledWith(
        PROCESS_ID,
        consumption,
      );
    });
  });

  // ─── Journal ───────────────────────────────────────────────────────────────

  describe("recordEvent()", () => {
    it("should delegate to eventJournal.record with processId, type, and payload", async () => {
      const type = "user:action";
      const payload = { action: "click", target: "button" };

      const result = await service.recordEvent(PROCESS_ID, type, payload);

      expect(mockEventJournal.record).toHaveBeenCalledTimes(1);
      expect(mockEventJournal.record).toHaveBeenCalledWith(
        PROCESS_ID,
        type,
        payload,
      );
      expect(result).toBe(mockJournalEntry);
    });

    it("should delegate without a payload when none is provided", async () => {
      await service.recordEvent(PROCESS_ID, "process:started");

      expect(mockEventJournal.record).toHaveBeenCalledWith(
        PROCESS_ID,
        "process:started",
        undefined,
      );
    });
  });

  describe("getEventHistory()", () => {
    it("should delegate to eventJournal.getHistory with processId and options", async () => {
      const options = { limit: 25, offset: 50 };

      const result = await service.getEventHistory(PROCESS_ID, options);

      expect(mockEventJournal.getHistory).toHaveBeenCalledTimes(1);
      expect(mockEventJournal.getHistory).toHaveBeenCalledWith(
        PROCESS_ID,
        options,
      );
      expect(result).toEqual({ entries: [mockJournalEntry], total: 1 });
    });

    it("should delegate with no options when omitted", async () => {
      await service.getEventHistory(PROCESS_ID);

      expect(mockEventJournal.getHistory).toHaveBeenCalledWith(
        PROCESS_ID,
        undefined,
      );
    });

    it("should return an empty entries array when journal has no events", async () => {
      mockEventJournal.getHistory.mockResolvedValueOnce({
        entries: [],
        total: 0,
      });

      const result = await service.getEventHistory(PROCESS_ID);

      expect(result.entries).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
