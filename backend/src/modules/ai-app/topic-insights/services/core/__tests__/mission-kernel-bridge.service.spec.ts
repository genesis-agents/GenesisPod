/**
 * MissionKernelBridgeService Unit Tests
 *
 * Covers all public methods and all branches (Optional deps present / absent).
 */

jest.mock("@prisma/client", () => ({
  ...jest.requireActual("@prisma/client"),
  MemoryLayer: {
    WORKING: "WORKING",
    EPISODIC: "EPISODIC",
    SEMANTIC: "SEMANTIC",
    PROCEDURAL: "PROCEDURAL",
  },
}));

import { Test, TestingModule } from "@nestjs/testing";
import { MissionKernelBridgeService } from "../mission-kernel-bridge.service";
import {
  MissionExecutorService,
  EventJournalService,
  KernelMemoryManagerService,
  ResourceManagerService,
  KernelSchedulerService,
  ConstraintEnforcementService,
} from "@/modules/ai-kernel/facade";
import { ProgressTrackerService } from "@/modules/ai-engine/facade";
import { MemoryLayer } from "@prisma/client";

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildAllDeps() {
  const mockMissionExecutor = {
    execute: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
  };

  const mockProgressTracker = {
    create: jest.fn(),
    start: jest.fn(),
    startPhase: jest.fn(),
    completePhase: jest.fn(),
    failPhase: jest.fn(),
    fail: jest.fn(),
    complete: jest.fn(),
    getTask: jest.fn(),
  };

  const mockKernelJournal = {
    record: jest.fn(),
  };

  const mockKernelMemory = {
    write: jest.fn(),
  };

  const mockResourceManager = {
    checkBudget: jest.fn(),
    consume: jest.fn(),
  };

  const mockKernelScheduler = {
    getStats: jest.fn(),
  };

  const mockConstraintEnforcement = {
    extractConstraints: jest.fn(),
    validateOutput: jest.fn(),
    generateViolationReport: jest.fn(),
    formatConstraintsForPrompt: jest.fn(),
  };

  return {
    mockMissionExecutor,
    mockProgressTracker,
    mockKernelJournal,
    mockKernelMemory,
    mockResourceManager,
    mockKernelScheduler,
    mockConstraintEnforcement,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function buildService(
  deps: Partial<ReturnType<typeof buildAllDeps>> = {},
): Promise<MissionKernelBridgeService> {
  const all = buildAllDeps();
  const merged = { ...all, ...deps };

  const providers: { provide: unknown; useValue: unknown }[] = [
    { provide: MissionExecutorService, useValue: merged.mockMissionExecutor },
    { provide: ProgressTrackerService, useValue: merged.mockProgressTracker },
    { provide: EventJournalService, useValue: merged.mockKernelJournal },
    {
      provide: KernelMemoryManagerService,
      useValue: merged.mockKernelMemory,
    },
    { provide: ResourceManagerService, useValue: merged.mockResourceManager },
    { provide: KernelSchedulerService, useValue: merged.mockKernelScheduler },
    {
      provide: ConstraintEnforcementService,
      useValue: merged.mockConstraintEnforcement,
    },
  ];

  const module: TestingModule = await Test.createTestingModule({
    providers: [MissionKernelBridgeService, ...providers],
  }).compile();

  return module.get<MissionKernelBridgeService>(MissionKernelBridgeService);
}

async function buildServiceNoDeps(): Promise<MissionKernelBridgeService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [MissionKernelBridgeService],
  }).compile();
  return module.get<MissionKernelBridgeService>(MissionKernelBridgeService);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MissionKernelBridgeService", () => {
  afterEach(() => jest.clearAllMocks());

  // ─── getProcessId ────────────────────────────────────────────────────────────

  describe("getProcessId", () => {
    it("should return undefined when no process has been registered", async () => {
      const service = await buildService();
      expect(service.getProcessId("mission-1")).toBeUndefined();
    });
  });

  // ─── initMission ─────────────────────────────────────────────────────────────

  describe("initMission", () => {
    const params = {
      missionId: "m1",
      userId: "u1",
      topicId: "t1",
      topicName: "AI Research",
      mode: "fresh",
      researchDepth: "deep",
    };

    it("should spawn kernel process, track progress, and log scheduler stats", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 2,
        ready: 5,
        maxConcurrent: 10,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MissionKernelBridgeService,
          {
            provide: MissionExecutorService,
            useValue: all.mockMissionExecutor,
          },
          {
            provide: ProgressTrackerService,
            useValue: all.mockProgressTracker,
          },
          { provide: EventJournalService, useValue: all.mockKernelJournal },
          {
            provide: KernelMemoryManagerService,
            useValue: all.mockKernelMemory,
          },
          {
            provide: ResourceManagerService,
            useValue: all.mockResourceManager,
          },
          {
            provide: KernelSchedulerService,
            useValue: all.mockKernelScheduler,
          },
          {
            provide: ConstraintEnforcementService,
            useValue: all.mockConstraintEnforcement,
          },
        ],
      }).compile();

      const service = module.get<MissionKernelBridgeService>(
        MissionKernelBridgeService,
      );

      await service.initMission(params);

      expect(all.mockMissionExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "u1", agentId: "research-leader" }),
      );
      expect(all.mockProgressTracker.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: "m1", type: "research" }),
      );
      expect(all.mockProgressTracker.start).toHaveBeenCalledWith("m1");

      // give fire-and-forget a tick
      await new Promise((r) => setImmediate(r));
      expect(all.mockKernelScheduler.getStats).toHaveBeenCalled();

      // processId should have been stored
      expect(service.getProcessId("m1")).toBe("proc-1");
    });

    it("should not throw when missionExecutor.execute throws", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockRejectedValue(
        new Error("kernel down"),
      );
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MissionKernelBridgeService,
          {
            provide: MissionExecutorService,
            useValue: all.mockMissionExecutor,
          },
          {
            provide: ProgressTrackerService,
            useValue: all.mockProgressTracker,
          },
          { provide: EventJournalService, useValue: all.mockKernelJournal },
          {
            provide: KernelMemoryManagerService,
            useValue: all.mockKernelMemory,
          },
          {
            provide: ResourceManagerService,
            useValue: all.mockResourceManager,
          },
          {
            provide: KernelSchedulerService,
            useValue: all.mockKernelScheduler,
          },
          {
            provide: ConstraintEnforcementService,
            useValue: all.mockConstraintEnforcement,
          },
        ],
      }).compile();

      const service = module.get<MissionKernelBridgeService>(
        MissionKernelBridgeService,
      );

      await expect(service.initMission(params)).resolves.toBeUndefined();
    });

    it("should log degraded message when missionExecutor is absent", async () => {
      const service = await buildServiceNoDeps();
      await expect(service.initMission(params)).resolves.toBeUndefined();
    });

    it("should log degraded message when progressTracker is absent", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-2",
      });
      all.mockKernelJournal.record.mockResolvedValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MissionKernelBridgeService,
          {
            provide: MissionExecutorService,
            useValue: all.mockMissionExecutor,
          },
          { provide: EventJournalService, useValue: all.mockKernelJournal },
          {
            provide: KernelMemoryManagerService,
            useValue: all.mockKernelMemory,
          },
          {
            provide: ResourceManagerService,
            useValue: all.mockResourceManager,
          },
          {
            provide: ConstraintEnforcementService,
            useValue: all.mockConstraintEnforcement,
          },
        ],
      }).compile();

      const service = module.get<MissionKernelBridgeService>(
        MissionKernelBridgeService,
      );
      await expect(service.initMission(params)).resolves.toBeUndefined();
      expect(all.mockProgressTracker.create).not.toHaveBeenCalled();
    });

    it("should log degraded message when kernelScheduler is absent", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-3",
      });
      all.mockKernelJournal.record.mockResolvedValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MissionKernelBridgeService,
          {
            provide: MissionExecutorService,
            useValue: all.mockMissionExecutor,
          },
          {
            provide: ProgressTrackerService,
            useValue: all.mockProgressTracker,
          },
          { provide: EventJournalService, useValue: all.mockKernelJournal },
          {
            provide: KernelMemoryManagerService,
            useValue: all.mockKernelMemory,
          },
          {
            provide: ResourceManagerService,
            useValue: all.mockResourceManager,
          },
          {
            provide: ConstraintEnforcementService,
            useValue: all.mockConstraintEnforcement,
          },
        ],
      }).compile();

      const service = module.get<MissionKernelBridgeService>(
        MissionKernelBridgeService,
      );
      await expect(service.initMission(params)).resolves.toBeUndefined();
    });

    it("should handle kernelScheduler.getStats failure gracefully", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-4",
      });
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockRejectedValue(
        new Error("stats failed"),
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MissionKernelBridgeService,
          {
            provide: MissionExecutorService,
            useValue: all.mockMissionExecutor,
          },
          {
            provide: ProgressTrackerService,
            useValue: all.mockProgressTracker,
          },
          { provide: EventJournalService, useValue: all.mockKernelJournal },
          {
            provide: KernelMemoryManagerService,
            useValue: all.mockKernelMemory,
          },
          {
            provide: ResourceManagerService,
            useValue: all.mockResourceManager,
          },
          {
            provide: KernelSchedulerService,
            useValue: all.mockKernelScheduler,
          },
          {
            provide: ConstraintEnforcementService,
            useValue: all.mockConstraintEnforcement,
          },
        ],
      }).compile();

      const service = module.get<MissionKernelBridgeService>(
        MissionKernelBridgeService,
      );
      await expect(service.initMission(params)).resolves.toBeUndefined();
      await new Promise((r) => setImmediate(r));
    });
  });

  // ─── startPhase ──────────────────────────────────────────────────────────────

  describe("startPhase", () => {
    it("should call progressTracker.startPhase when tracker is present", async () => {
      const all = buildAllDeps();
      const service = await buildService(all);
      service.startPhase("m1", "planning");
      expect(all.mockProgressTracker.startPhase).toHaveBeenCalledWith(
        "m1",
        "planning",
      );
    });

    it("should not throw when progressTracker is absent", async () => {
      const service = await buildServiceNoDeps();
      expect(() => service.startPhase("m1", "planning")).not.toThrow();
    });
  });

  // ─── completePhase ───────────────────────────────────────────────────────────

  describe("completePhase", () => {
    it("should call progressTracker.completePhase when tracker is present", async () => {
      const all = buildAllDeps();
      const service = await buildService(all);
      service.completePhase("m1", "researching");
      expect(all.mockProgressTracker.completePhase).toHaveBeenCalledWith(
        "m1",
        "researching",
      );
    });

    it("should not throw when progressTracker is absent", async () => {
      const service = await buildServiceNoDeps();
      expect(() => service.completePhase("m1", "researching")).not.toThrow();
    });
  });

  // ─── failTracking ────────────────────────────────────────────────────────────

  describe("failTracking", () => {
    it("should failPhase for in-progress phases and then fail the tracker", async () => {
      const all = buildAllDeps();
      all.mockProgressTracker.getTask.mockReturnValue({
        phases: [
          { id: "planning", status: "in_progress" },
          { id: "researching", status: "completed" },
        ],
      });
      const service = await buildService(all);

      service.failTracking("m1", "some error");

      expect(all.mockProgressTracker.failPhase).toHaveBeenCalledWith(
        "m1",
        "planning",
        "some error",
      );
      expect(all.mockProgressTracker.failPhase).not.toHaveBeenCalledWith(
        "m1",
        "researching",
        expect.anything(),
      );
      expect(all.mockProgressTracker.fail).toHaveBeenCalledWith(
        "m1",
        "some error",
      );
    });

    it("should handle null task (no phases to iterate)", async () => {
      const all = buildAllDeps();
      all.mockProgressTracker.getTask.mockReturnValue(null);
      const service = await buildService(all);

      expect(() => service.failTracking("m1", "error")).not.toThrow();
      expect(all.mockProgressTracker.fail).toHaveBeenCalledWith("m1", "error");
    });

    it("should not throw when progressTracker is absent", async () => {
      const service = await buildServiceNoDeps();
      expect(() => service.failTracking("m1", "error")).not.toThrow();
    });
  });

  // ─── completeTracking ────────────────────────────────────────────────────────

  describe("completeTracking", () => {
    it("should call progressTracker.complete when tracker is present", async () => {
      const all = buildAllDeps();
      const service = await buildService(all);
      service.completeTracking("m1");
      expect(all.mockProgressTracker.complete).toHaveBeenCalledWith("m1");
    });

    it("should not throw when progressTracker is absent", async () => {
      const service = await buildServiceNoDeps();
      expect(() => service.completeTracking("m1")).not.toThrow();
    });
  });

  // ─── recordKernelEvent ───────────────────────────────────────────────────────

  describe("recordKernelEvent", () => {
    it("should record event when processId exists and journal is present", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });
      const service = await buildService(all);

      // First register a process via initMission
      await service.initMission({
        missionId: "m1",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });

      service.recordKernelEvent("m1", "task.completed", { taskId: "t1" });

      await new Promise((r) => setImmediate(r));
      expect(all.mockKernelJournal.record).toHaveBeenCalledWith(
        "proc-1",
        "task.completed",
        { taskId: "t1" },
      );
    });

    it("should not record when processId is absent", async () => {
      const all = buildAllDeps();
      const service = await buildService(all);

      service.recordKernelEvent("unknown-mission", "some.event");
      await new Promise((r) => setImmediate(r));
      expect(all.mockKernelJournal.record).not.toHaveBeenCalled();
    });

    it("should log degraded when kernelJournal is absent", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-X",
      });
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MissionKernelBridgeService,
          {
            provide: MissionExecutorService,
            useValue: all.mockMissionExecutor,
          },
          {
            provide: ProgressTrackerService,
            useValue: all.mockProgressTracker,
          },
          {
            provide: KernelMemoryManagerService,
            useValue: all.mockKernelMemory,
          },
          {
            provide: ResourceManagerService,
            useValue: all.mockResourceManager,
          },
          {
            provide: KernelSchedulerService,
            useValue: all.mockKernelScheduler,
          },
          {
            provide: ConstraintEnforcementService,
            useValue: all.mockConstraintEnforcement,
          },
        ],
      }).compile();

      const service = module.get<MissionKernelBridgeService>(
        MissionKernelBridgeService,
      );
      await service.initMission({
        missionId: "m-no-journal",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });

      // Should not throw even without journal
      expect(() =>
        service.recordKernelEvent("m-no-journal", "some.event"),
      ).not.toThrow();
    });

    it("should handle journal.record rejection gracefully", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockKernelJournal.record.mockRejectedValue(new Error("journal fail"));
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });
      const service = await buildService(all);

      await service.initMission({
        missionId: "m1",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });

      expect(() => service.recordKernelEvent("m1", "fail.event")).not.toThrow();
      await new Promise((r) => setImmediate(r));
    });
  });

  // ─── completeKernelProcess ────────────────────────────────────────────────────

  describe("completeKernelProcess", () => {
    it("should complete process and remove from map when processId exists", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockMissionExecutor.complete.mockResolvedValue(undefined);
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });
      const service = await buildService(all);

      await service.initMission({
        missionId: "m1",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });
      expect(service.getProcessId("m1")).toBe("proc-1");

      service.completeKernelProcess("m1", { reportId: "r1" });

      await new Promise((r) => setImmediate(r));
      expect(all.mockMissionExecutor.complete).toHaveBeenCalledWith("proc-1", {
        reportId: "r1",
      });
      // should be removed from map
      expect(service.getProcessId("m1")).toBeUndefined();
    });

    it("should not throw when no processId for mission", async () => {
      const all = buildAllDeps();
      const service = await buildService(all);
      expect(() =>
        service.completeKernelProcess("no-such-mission"),
      ).not.toThrow();
      expect(all.mockMissionExecutor.complete).not.toHaveBeenCalled();
    });

    it("should log degraded when missionExecutor is absent", async () => {
      const service = await buildServiceNoDeps();
      expect(() => service.completeKernelProcess("m1")).not.toThrow();
    });

    it("should handle missionExecutor.complete rejection gracefully", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockMissionExecutor.complete.mockRejectedValue(
        new Error("complete fail"),
      );
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });
      const service = await buildService(all);

      await service.initMission({
        missionId: "m1",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });

      expect(() => service.completeKernelProcess("m1")).not.toThrow();
      await new Promise((r) => setImmediate(r));
    });
  });

  // ─── failKernelProcess ───────────────────────────────────────────────────────

  describe("failKernelProcess", () => {
    it("should fail process and remove from map when processId exists", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockMissionExecutor.fail.mockResolvedValue(undefined);
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });
      const service = await buildService(all);

      await service.initMission({
        missionId: "m1",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });

      service.failKernelProcess("m1", "timeout");

      await new Promise((r) => setImmediate(r));
      expect(all.mockMissionExecutor.fail).toHaveBeenCalledWith(
        "proc-1",
        "timeout",
      );
      expect(service.getProcessId("m1")).toBeUndefined();
    });

    it("should not throw when no processId for mission", async () => {
      const all = buildAllDeps();
      const service = await buildService(all);
      expect(() => service.failKernelProcess("no-such", "err")).not.toThrow();
    });

    it("should log degraded when missionExecutor is absent", async () => {
      const service = await buildServiceNoDeps();
      expect(() => service.failKernelProcess("m1", "err")).not.toThrow();
    });

    it("should handle missionExecutor.fail rejection gracefully", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockMissionExecutor.fail.mockRejectedValue(
        new Error("fail rejected"),
      );
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });
      const service = await buildService(all);

      await service.initMission({
        missionId: "m1",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });

      expect(() => service.failKernelProcess("m1", "err")).not.toThrow();
      await new Promise((r) => setImmediate(r));
    });
  });

  // ─── checkBudget ─────────────────────────────────────────────────────────────

  describe("checkBudget", () => {
    it("should return canProceed:true when no processId registered", async () => {
      const all = buildAllDeps();
      const service = await buildService(all);
      const result = await service.checkBudget("no-such-mission");
      expect(result).toEqual({ canProceed: true });
    });

    it("should return canProceed:true when resourceManager is absent", async () => {
      const service = await buildServiceNoDeps();
      const result = await service.checkBudget("m1");
      expect(result).toEqual({ canProceed: true });
    });

    it("should delegate to resourceManager.checkBudget when processId is registered", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });
      all.mockResourceManager.checkBudget.mockResolvedValue({
        canProceed: false,
        reason: "over budget",
      });

      const service = await buildService(all);
      await service.initMission({
        missionId: "m1",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });

      const result = await service.checkBudget("m1");
      expect(result).toEqual({ canProceed: false, reason: "over budget" });
    });

    it("should return canProceed:true when resourceManager.checkBudget throws", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });
      all.mockResourceManager.checkBudget.mockRejectedValue(
        new Error("rm error"),
      );

      const service = await buildService(all);
      await service.initMission({
        missionId: "m1",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });

      const result = await service.checkBudget("m1");
      expect(result).toEqual({ canProceed: true });
    });
  });

  // ─── consumeResources ────────────────────────────────────────────────────────

  describe("consumeResources", () => {
    it("should not call consume when no processId registered", async () => {
      const all = buildAllDeps();
      const service = await buildService(all);
      service.consumeResources("no-such", 100, 0.01);
      expect(all.mockResourceManager.consume).not.toHaveBeenCalled();
    });

    it("should not call consume when resourceManager is absent", async () => {
      const service = await buildServiceNoDeps();
      expect(() => service.consumeResources("m1", 100, 0.01)).not.toThrow();
    });

    it("should not call consume when tokensUsed is 0", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });

      const service = await buildService(all);
      await service.initMission({
        missionId: "m1",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });

      service.consumeResources("m1", 0, 0);
      expect(all.mockResourceManager.consume).not.toHaveBeenCalled();
    });

    it("should call consume when tokensUsed > 0 and processId exists", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });
      all.mockResourceManager.consume.mockResolvedValue(undefined);

      const service = await buildService(all);
      await service.initMission({
        missionId: "m1",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });

      service.consumeResources("m1", 500, 0.05);

      await new Promise((r) => setImmediate(r));
      expect(all.mockResourceManager.consume).toHaveBeenCalledWith("proc-1", {
        tokensUsed: 500,
        costUsed: 0.05,
      });
    });

    it("should handle consume rejection gracefully", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });
      all.mockResourceManager.consume.mockRejectedValue(
        new Error("consume fail"),
      );

      const service = await buildService(all);
      await service.initMission({
        missionId: "m1",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });

      expect(() => service.consumeResources("m1", 200, 0.02)).not.toThrow();
      await new Promise((r) => setImmediate(r));
    });
  });

  // ─── writeMemory ─────────────────────────────────────────────────────────────

  describe("writeMemory", () => {
    it("should log degraded when kernelMemory is absent", async () => {
      const service = await buildServiceNoDeps();
      expect(() =>
        service.writeMemory({
          missionId: "m1",
          layer: MemoryLayer.WORKING,
          key: "plan",
          value: { data: true },
        }),
      ).not.toThrow();
    });

    it("should not call write when no processId registered", async () => {
      const all = buildAllDeps();
      const service = await buildService(all);
      service.writeMemory({
        missionId: "no-such",
        layer: MemoryLayer.EPISODIC,
        key: "plan",
        value: "hello",
      });
      expect(all.mockKernelMemory.write).not.toHaveBeenCalled();
    });

    it("should write memory with expiresAt when processId exists", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });
      all.mockKernelMemory.write.mockResolvedValue(undefined);

      const service = await buildService(all);
      await service.initMission({
        missionId: "m1",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });

      const expires = new Date(Date.now() + 3600_000);
      service.writeMemory({
        missionId: "m1",
        layer: MemoryLayer.WORKING,
        key: "constraints",
        value: { list: [] },
        expiresAt: expires,
      });

      await new Promise((r) => setImmediate(r));
      expect(all.mockKernelMemory.write).toHaveBeenCalledWith(
        expect.objectContaining({
          processId: "proc-1",
          layer: MemoryLayer.WORKING,
          key: "constraints",
          value: { list: [] },
          expiresAt: expires,
        }),
      );
    });

    it("should handle write rejection gracefully", async () => {
      const all = buildAllDeps();
      all.mockMissionExecutor.execute.mockResolvedValue({
        processId: "proc-1",
      });
      all.mockKernelJournal.record.mockResolvedValue(undefined);
      all.mockKernelScheduler.getStats.mockResolvedValue({
        running: 0,
        ready: 0,
        maxConcurrent: 5,
      });
      all.mockKernelMemory.write.mockRejectedValue(new Error("write fail"));

      const service = await buildService(all);
      await service.initMission({
        missionId: "m1",
        userId: "u1",
        topicId: "t1",
        topicName: "Test",
        mode: "fresh",
        researchDepth: "standard",
      });

      expect(() =>
        service.writeMemory({
          missionId: "m1",
          layer: MemoryLayer.SEMANTIC,
          key: "k",
          value: "v",
        }),
      ).not.toThrow();
      await new Promise((r) => setImmediate(r));
    });
  });

  // ─── extractResearchConstraints ───────────────────────────────────────────────

  describe("extractResearchConstraints", () => {
    it("should return empty array when constraintEnforcement is absent", async () => {
      const service = await buildServiceNoDeps();
      const result = service.extractResearchConstraints("some description");
      expect(result).toEqual([]);
    });

    it("should delegate to constraintEnforcement.extractConstraints", async () => {
      const all = buildAllDeps();
      const mockConstraints = [
        {
          constraintId: "c1",
          type: "language" as const,
          rule: "use English",
          severity: "must" as const,
          extractedFrom: "description",
        },
      ];
      all.mockConstraintEnforcement.extractConstraints.mockReturnValue(
        mockConstraints,
      );

      const service = await buildService(all);
      const result = service.extractResearchConstraints("write in English");

      expect(
        all.mockConstraintEnforcement.extractConstraints,
      ).toHaveBeenCalledWith("write in English");
      expect(result).toEqual(mockConstraints);
    });
  });

  // ─── validateResearchOutput ───────────────────────────────────────────────────

  describe("validateResearchOutput", () => {
    it("should return isValid:true when constraintEnforcement is absent", async () => {
      const service = await buildServiceNoDeps();
      const result = await service.validateResearchOutput("output", [
        {
          constraintId: "c1",
          type: "language",
          rule: "en",
          severity: "must",
          extractedFrom: "desc",
        },
      ]);
      expect(result).toEqual({ isValid: true, violations: [] });
    });

    it("should return isValid:true when constraints array is empty", async () => {
      const all = buildAllDeps();
      const service = await buildService(all);
      const result = await service.validateResearchOutput("output", []);
      expect(result).toEqual({ isValid: true, violations: [] });
      expect(
        all.mockConstraintEnforcement.validateOutput,
      ).not.toHaveBeenCalled();
    });

    it("should return violations when output violates constraints", async () => {
      const all = buildAllDeps();
      const constraint = {
        constraintId: "c1",
        type: "language" as const,
        rule: "must use English",
        severity: "must" as const,
        extractedFrom: "desc",
      };
      all.mockConstraintEnforcement.validateOutput.mockResolvedValue({
        isValid: false,
        violations: [{ constraintId: "c1", rule: "must use English" }],
      });
      all.mockConstraintEnforcement.generateViolationReport.mockReturnValue(
        "Violation report",
      );

      const service = await buildService(all);
      const result = await service.validateResearchOutput(
        "non-english output",
        [constraint],
      );

      expect(result.isValid).toBe(false);
      expect(result.violations).toContain("must use English");
      expect(result.report).toBe("Violation report");
    });

    it("should return violation with constraintId when rule is missing", async () => {
      const all = buildAllDeps();
      const constraint = {
        constraintId: "c2",
        type: "length" as const,
        rule: "",
        severity: "should" as const,
        extractedFrom: "desc",
      };
      all.mockConstraintEnforcement.validateOutput.mockResolvedValue({
        isValid: false,
        violations: [{ constraintId: "c2", rule: "" }],
      });
      all.mockConstraintEnforcement.generateViolationReport.mockReturnValue(
        "Report",
      );

      const service = await buildService(all);
      const result = await service.validateResearchOutput("output", [
        constraint,
      ]);

      expect(result.violations).toContain("[c2]");
    });

    it("should return isValid when output passes all constraints", async () => {
      const all = buildAllDeps();
      const constraint = {
        constraintId: "c1",
        type: "language" as const,
        rule: "en",
        severity: "must" as const,
        extractedFrom: "desc",
      };
      all.mockConstraintEnforcement.validateOutput.mockResolvedValue({
        isValid: true,
        violations: [],
      });

      const service = await buildService(all);
      const result = await service.validateResearchOutput("good output", [
        constraint,
      ]);

      expect(result.isValid).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.report).toBeUndefined();
    });

    it("should return isValid:true when validateOutput throws", async () => {
      const all = buildAllDeps();
      const constraint = {
        constraintId: "c1",
        type: "language" as const,
        rule: "en",
        severity: "must" as const,
        extractedFrom: "desc",
      };
      all.mockConstraintEnforcement.validateOutput.mockRejectedValue(
        new Error("validation failed"),
      );

      const service = await buildService(all);
      const result = await service.validateResearchOutput("output", [
        constraint,
      ]);

      expect(result).toEqual({ isValid: true, violations: [] });
    });
  });

  // ─── formatConstraintsForPrompt ───────────────────────────────────────────────

  describe("formatConstraintsForPrompt", () => {
    it("should return empty string when constraintEnforcement is absent", async () => {
      const service = await buildServiceNoDeps();
      const result = service.formatConstraintsForPrompt([
        {
          constraintId: "c1",
          type: "language",
          rule: "en",
          severity: "must",
          extractedFrom: "desc",
        },
      ]);
      expect(result).toBe("");
    });

    it("should return empty string when constraints array is empty", async () => {
      const all = buildAllDeps();
      const service = await buildService(all);
      const result = service.formatConstraintsForPrompt([]);
      expect(result).toBe("");
      expect(
        all.mockConstraintEnforcement.formatConstraintsForPrompt,
      ).not.toHaveBeenCalled();
    });

    it("should delegate to constraintEnforcement.formatConstraintsForPrompt", async () => {
      const all = buildAllDeps();
      all.mockConstraintEnforcement.formatConstraintsForPrompt.mockReturnValue(
        "MUST: use English",
      );

      const constraint = {
        constraintId: "c1",
        type: "language" as const,
        rule: "use English",
        severity: "must" as const,
        extractedFrom: "desc",
      };
      const service = await buildService(all);
      const result = service.formatConstraintsForPrompt([constraint]);

      expect(
        all.mockConstraintEnforcement.formatConstraintsForPrompt,
      ).toHaveBeenCalledWith([constraint], "MUST");
      expect(result).toBe("MUST: use English");
    });
  });
});
