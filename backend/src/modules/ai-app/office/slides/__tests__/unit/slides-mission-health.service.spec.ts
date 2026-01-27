// @ts-nocheck
/**
 * SlidesMissionHealthService Unit Tests
 *
 * Tests for health check, stuck detection, and auto-recovery functionality.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { SlidesMissionHealthService } from "../../services/slides-mission-health.service";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { SlidesMissionStatus, SlidesTaskStatus } from "@prisma/client";

import {
  createMockPrisma,
  createMockEventEmitter,
  MockPrismaService,
  MockEventEmitter,
} from "../mocks";
import {
  mockMission,
  mockStuckMission,
  mockMissionWithExecutingTasks,
  mockCompletedMission,
  mockUserId,
} from "../fixtures/slides.fixture";

describe("SlidesMissionHealthService", () => {
  let service: SlidesMissionHealthService;
  let prisma: MockPrismaService;
  let eventEmitter: MockEventEmitter;

  beforeEach(async () => {
    prisma = createMockPrisma();
    eventEmitter = createMockEventEmitter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlidesMissionHealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<SlidesMissionHealthService>(
      SlidesMissionHealthService,
    );

    // Stop auto health check to control test timing
    (service as any).stopHealthCheckLoop();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("runHealthCheck", () => {
    it("should return empty result when no active missions", async () => {
      prisma.slidesMission.findMany.mockResolvedValue([]);

      const result = await service.runHealthCheck();

      expect(result.totalMissions).toBe(0);
      expect(result.stuckMissions).toBe(0);
      expect(result.details).toHaveLength(0);
    });

    it("should detect stuck missions without executing tasks", async () => {
      prisma.slidesMission.findMany.mockResolvedValue([mockStuckMission]);
      prisma.slidesMission.update.mockResolvedValue({
        ...mockStuckMission,
        status: SlidesMissionStatus.FAILED,
      });
      prisma.slidesTask.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.runHealthCheck();

      expect(result.totalMissions).toBe(1);
      expect(result.stuckMissions).toBe(1);
      expect(result.failedMissions).toBe(1);
      expect(result.details[0].action).toBe("marked_failed");
    });

    it("should not mark stuck mission with executing tasks as failed", async () => {
      // Create mission with fresh dates - last activity 35 min ago (past threshold) but has IN_PROGRESS tasks
      // The key is: mission looks stuck by time, but has a task that's still marked as IN_PROGRESS
      const missionWithActiveTasks = {
        ...mockMission,
        id: "mission-with-active-tasks",
        startedAt: new Date(Date.now() - 50 * 60 * 1000), // Started 50 min ago (within 2hr limit)
        updatedAt: new Date(Date.now() - 35 * 60 * 1000), // Updated 35 min ago (past 30min threshold)
        tasks: [
          {
            id: "task-1",
            status: SlidesTaskStatus.IN_PROGRESS, // Task is still marked as in progress
            updatedAt: new Date(Date.now() - 35 * 60 * 1000), // Task also not updated recently
            startedAt: new Date(Date.now() - 40 * 60 * 1000),
          },
        ],
      };
      prisma.slidesMission.findMany.mockResolvedValue([missionWithActiveTasks]);

      const result = await service.runHealthCheck();

      // Should detect as stuck but NOT mark as failed because there's an IN_PROGRESS task
      expect(result.failedMissions).toBe(0);
      expect(prisma.slidesMission.update).not.toHaveBeenCalled();
      expect(result.details[0].reason).toContain("executing tasks");
    });

    it("should mark mission as failed when exceeding max execution time", async () => {
      const timeoutMission = {
        ...mockMission,
        id: "mission-timeout",
        startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
        updatedAt: new Date(Date.now() - 10 * 1000), // 10 seconds ago (not stuck)
        tasks: [],
      };
      prisma.slidesMission.findMany.mockResolvedValue([timeoutMission]);
      prisma.slidesMission.update.mockResolvedValue({
        ...timeoutMission,
        status: SlidesMissionStatus.FAILED,
      });
      prisma.slidesTask.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.runHealthCheck();

      expect(result.failedMissions).toBe(1);
      expect(result.details[0].reason).toBe("Execution timeout exceeded");
    });

    it("should emit failure event when marking mission as failed", async () => {
      prisma.slidesMission.findMany.mockResolvedValue([mockStuckMission]);
      prisma.slidesMission.update.mockResolvedValue({
        ...mockStuckMission,
        status: SlidesMissionStatus.FAILED,
      });
      prisma.slidesTask.updateMany.mockResolvedValue({ count: 0 });

      await service.runHealthCheck();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "slides.mission.failed",
        expect.objectContaining({
          missionId: mockStuckMission.id,
          sessionId: mockStuckMission.sessionId,
        }),
      );
    });

    it("should skip if health check is already running", async () => {
      // Simulate running state
      (service as any).isRunning = true;

      const result = await service.runHealthCheck();

      expect(result.totalMissions).toBe(0);
      expect(prisma.slidesMission.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getMissionHealthStatus", () => {
    it("should return null for non-existent mission", async () => {
      prisma.slidesMission.findUnique.mockResolvedValue(null);

      const result = await service.getMissionHealthStatus("non-existent");

      expect(result).toBeNull();
    });

    it("should return healthy status for active mission", async () => {
      const now = new Date();
      const healthyMission = {
        ...mockMission,
        startedAt: new Date(now.getTime() - 10 * 60 * 1000), // Started 10 min ago (within limits)
        updatedAt: now, // Recently updated
        createdAt: new Date(now.getTime() - 15 * 60 * 1000),
        tasks: [],
      };
      prisma.slidesMission.findUnique.mockResolvedValue(healthyMission);

      const result = await service.getMissionHealthStatus("mission-1");

      expect(result).toBeDefined();
      expect(result?.isHealthy).toBe(true);
      expect(result?.issues).toHaveLength(0);
    });

    it("should report issues for stuck mission", async () => {
      prisma.slidesMission.findUnique.mockResolvedValue({
        ...mockStuckMission,
        tasks: [],
      });

      const result = await service.getMissionHealthStatus("mission-stuck");

      expect(result?.isHealthy).toBe(false);
      expect(result?.issues.length).toBeGreaterThan(0);
    });

    it("should detect stuck tasks", async () => {
      const missionWithStuckTask = {
        ...mockMission,
        updatedAt: new Date(),
        tasks: [
          {
            id: "task-stuck",
            status: SlidesTaskStatus.IN_PROGRESS,
            startedAt: new Date(Date.now() - 40 * 60 * 1000), // 40 min ago
            updatedAt: new Date(Date.now() - 40 * 60 * 1000),
          },
        ],
      };
      prisma.slidesMission.findUnique.mockResolvedValue(missionWithStuckTask);

      const result = await service.getMissionHealthStatus("mission-1");

      expect(result?.issues.some((i) => i.includes("执行时间过长"))).toBe(true);
    });
  });

  describe("canResume", () => {
    it("should return false for non-existent mission", async () => {
      prisma.slidesMission.findUnique.mockResolvedValue(null);

      const result = await service.canResume("non-existent");

      expect(result).toBe(false);
    });

    it("should return false for active mission", async () => {
      prisma.slidesMission.findUnique.mockResolvedValue({
        ...mockMission,
        tasks: [],
      });

      const result = await service.canResume("mission-1");

      expect(result).toBe(false);
    });

    it("should return true for failed mission with completed tasks", async () => {
      const failedMission = {
        ...mockMission,
        status: SlidesMissionStatus.FAILED,
        tasks: [
          { id: "task-1", status: SlidesTaskStatus.COMPLETED },
          { id: "task-2", status: SlidesTaskStatus.FAILED },
        ],
      };
      prisma.slidesMission.findUnique.mockResolvedValue(failedMission);

      const result = await service.canResume("mission-1");

      expect(result).toBe(true);
    });

    it("should return false for failed mission without completed tasks", async () => {
      const failedMission = {
        ...mockMission,
        status: SlidesMissionStatus.FAILED,
        tasks: [{ id: "task-1", status: SlidesTaskStatus.FAILED }],
      };
      prisma.slidesMission.findUnique.mockResolvedValue(failedMission);

      const result = await service.canResume("mission-1");

      expect(result).toBe(false);
    });
  });

  describe("recoverInterruptedMissions", () => {
    it("should skip if no executing missions", async () => {
      prisma.slidesMission.findMany.mockResolvedValue([]);

      const result = await service.recoverInterruptedMissions();

      expect(result.interruptedMissions).toBe(0);
      expect(result.recoveredMissions).toBe(0);
    });

    it("should recover interrupted missions", async () => {
      const interruptedMission = {
        ...mockMission,
        status: SlidesMissionStatus.EXECUTING,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
        tasks: [
          {
            id: "task-1",
            status: SlidesTaskStatus.IN_PROGRESS,
            updatedAt: new Date(Date.now() - 10 * 60 * 1000),
            startedAt: new Date(Date.now() - 15 * 60 * 1000),
          },
        ],
      };
      prisma.slidesMission.findMany.mockResolvedValue([interruptedMission]);
      prisma.slidesTask.updateMany.mockResolvedValue({ count: 1 });
      prisma.slidesMission.update.mockResolvedValue(interruptedMission);

      const result = await service.recoverInterruptedMissions();

      expect(result.interruptedMissions).toBe(1);
      expect(result.recoveredMissions).toBe(1);
      expect(prisma.slidesTask.updateMany).toHaveBeenCalledWith({
        where: {
          missionId: interruptedMission.id,
          status: SlidesTaskStatus.IN_PROGRESS,
        },
        data: {
          status: SlidesTaskStatus.PENDING,
          startedAt: null,
        },
      });
    });

    it("should emit recovery event", async () => {
      const interruptedMission = {
        ...mockMission,
        status: SlidesMissionStatus.EXECUTING,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
        tasks: [],
      };
      prisma.slidesMission.findMany.mockResolvedValue([interruptedMission]);
      prisma.slidesTask.updateMany.mockResolvedValue({ count: 0 });
      prisma.slidesMission.update.mockResolvedValue(interruptedMission);

      await service.recoverInterruptedMissions();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "slides.mission.recovery_needed",
        expect.objectContaining({
          missionId: interruptedMission.id,
          sessionId: interruptedMission.sessionId,
        }),
      );
    });

    it("should skip if recovery already in progress", async () => {
      (service as any).isRecovering = true;

      const result = await service.recoverInterruptedMissions();

      expect(result.interruptedMissions).toBe(0);
      expect(prisma.slidesMission.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getConfig", () => {
    it("should return health check configuration", () => {
      const config = service.getConfig();

      expect(config.checkIntervalMs).toBe(5 * 60 * 1000);
      expect(config.stuckThresholdMs).toBe(30 * 60 * 1000);
      expect(config.maxExecutionTimeMs).toBe(2 * 60 * 60 * 1000);
      expect(config.maxRetries).toBe(3);
    });
  });

  describe("forceHealthCheck", () => {
    it("should trigger immediate health check", async () => {
      prisma.slidesMission.findMany.mockResolvedValue([]);

      const result = await service.forceHealthCheck();

      expect(result.checkedAt).toBeDefined();
      expect(prisma.slidesMission.findMany).toHaveBeenCalled();
    });
  });
});
