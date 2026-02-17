/**
 * ResearchMissionHealthService Unit Tests
 *
 * Tests for health check and auto-recovery functionality
 * Type checking is disabled due to Jest mock compatibility issues.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { ResearchMissionHealthService } from "../../services/monitoring/research-mission-health.service";
import { ResearchEventEmitterService } from "../../services/core/research-event-emitter.service";
import { PrismaService } from "@/common/prisma/prisma.service";

import {
  createMockPrisma,
  createMockResearchEventEmitter,
  createMockEventEmitter2,
} from "../mocks";

import {
  MOCK_MISSION_EXECUTING,
  MOCK_TASK_EXECUTING,
  MOCK_TASK_PENDING,
  MOCK_TASK_COMPLETED,
  MOCK_TOPIC,
} from "../fixtures/topics.fixture";

describe("ResearchMissionHealthService", () => {
  let service: ResearchMissionHealthService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let researchEventEmitter: ReturnType<typeof createMockResearchEventEmitter>;
  let eventEmitter: ReturnType<typeof createMockEventEmitter2>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    researchEventEmitter = createMockResearchEventEmitter();
    eventEmitter = createMockEventEmitter2();

    // Default mock for findMany to prevent lifecycle errors
    prisma.researchMission.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchMissionHealthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ResearchEventEmitterService,
          useValue: researchEventEmitter,
        },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<ResearchMissionHealthService>(
      ResearchMissionHealthService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Stop the health check loop if it was started
    service.onModuleDestroy();
  });

  // ==================== runHealthCheck Tests ====================

  describe("runHealthCheck", () => {
    it("should return empty result when no active missions", async () => {
      // Arrange
      prisma.researchMission.findMany.mockResolvedValue([]);

      // Act
      const result = await service.runHealthCheck();

      // Assert
      expect(result.totalMissions).toBe(0);
      expect(result.stuckMissions).toBe(0);
      expect(result.details).toEqual([]);
    });

    it("should detect healthy executing mission with recent activity", async () => {
      // Arrange - mission updated just now
      const now = new Date();
      const recentMission = {
        ...MOCK_MISSION_EXECUTING,
        updatedAt: now,
        createdAt: now,
        startedAt: now,
        tasks: [
          {
            ...MOCK_TASK_EXECUTING,
            updatedAt: now,
            startedAt: now,
          },
        ],
      };
      prisma.researchMission.findMany.mockResolvedValue([recentMission]);

      // Act
      const result = await service.runHealthCheck();

      // Assert
      expect(result.totalMissions).toBe(1);
      expect(result.stuckMissions).toBe(0);
      expect(result.details[0].action).toBe("none");
    });

    it("should detect stuck mission with stale tasks and no executing tasks", async () => {
      // Arrange - mission hasn't been updated in 35 minutes and has no executing tasks
      const staleDate = new Date(Date.now() - 35 * 60 * 1000); // 35 minutes ago
      const staleMission = {
        ...MOCK_MISSION_EXECUTING,
        updatedAt: staleDate,
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        startedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        tasks: [
          {
            ...MOCK_TASK_PENDING, // Not EXECUTING, so mission is truly stuck
            updatedAt: staleDate,
          },
        ],
      };
      prisma.researchMission.findMany.mockResolvedValue([staleMission]);
      prisma.researchMission.update.mockResolvedValue({
        ...staleMission,
        status: "FAILED",
      });
      prisma.researchTask.updateMany.mockResolvedValue({ count: 1 });
      prisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });

      // Act
      const result = await service.runHealthCheck();

      // Assert
      expect(result.totalMissions).toBe(1);
      expect(result.stuckMissions).toBe(1);
      expect(result.details[0].action).toBe("marked_failed");
    });

    it("should NOT mark stuck mission as failed if it has executing tasks", async () => {
      // Arrange - mission hasn't been updated in 35 minutes but has executing tasks
      // This means it might still be processing a long AI call
      const staleDate = new Date(Date.now() - 35 * 60 * 1000);
      const staleMission = {
        ...MOCK_MISSION_EXECUTING,
        updatedAt: staleDate,
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
        tasks: [
          {
            ...MOCK_TASK_EXECUTING, // EXECUTING status - might still be processing
            updatedAt: staleDate,
          },
        ],
      };
      prisma.researchMission.findMany.mockResolvedValue([staleMission]);

      // Act
      const result = await service.runHealthCheck();

      // Assert
      expect(result.totalMissions).toBe(1);
      // Should NOT be marked as stuck since there's an executing task
      expect(result.stuckMissions).toBe(0);
      expect(result.details[0].action).toBe("none");
    });
  });

  // ==================== recoverInterruptedMissions Tests ====================

  describe("recoverInterruptedMissions", () => {
    it("should return empty result when no executing missions", async () => {
      // Arrange
      prisma.researchMission.findMany.mockResolvedValue([]);

      // Act
      const result = await service.recoverInterruptedMissions();

      // Assert
      expect(result.interruptedMissions).toBe(0);
      expect(result.recoveredMissions).toBe(0);
      expect(result.failedRecoveries).toBe(0);
    });

    it("should skip recent executing missions", async () => {
      // Arrange - mission updated just now, not interrupted
      const now = new Date();
      const recentMission = {
        ...MOCK_MISSION_EXECUTING,
        updatedAt: now,
        tasks: [
          {
            ...MOCK_TASK_EXECUTING,
            updatedAt: now,
          },
        ],
        topic: MOCK_TOPIC,
      };
      prisma.researchMission.findMany.mockResolvedValue([recentMission]);

      // Act
      const result = await service.recoverInterruptedMissions();

      // Assert
      expect(result.interruptedMissions).toBe(0);
    });

    it("should recover stale executing missions", async () => {
      // Arrange - mission hasn't been updated in 10 minutes (interrupted by server restart)
      const staleDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const staleMission = {
        ...MOCK_MISSION_EXECUTING,
        updatedAt: staleDate,
        tasks: [
          {
            ...MOCK_TASK_EXECUTING,
            updatedAt: staleDate,
          },
          MOCK_TASK_PENDING,
        ],
        topic: MOCK_TOPIC,
      };
      prisma.researchMission.findMany.mockResolvedValue([staleMission]);
      prisma.researchTask.updateMany.mockResolvedValue({ count: 1 });
      prisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });
      prisma.researchMission.update.mockResolvedValue(staleMission);

      // Act
      const result = await service.recoverInterruptedMissions();

      // Assert
      expect(result.interruptedMissions).toBe(1);
      expect(result.recoveredMissions).toBe(1);
      expect(researchEventEmitter.emitMissionProgress).toHaveBeenCalled();
    });

    it("should handle recovery failure gracefully", async () => {
      // Arrange
      const staleDate = new Date(Date.now() - 10 * 60 * 1000);
      const staleMission = {
        ...MOCK_MISSION_EXECUTING,
        updatedAt: staleDate,
        tasks: [{ ...MOCK_TASK_EXECUTING, updatedAt: staleDate }],
        topic: MOCK_TOPIC,
      };
      prisma.researchMission.findMany.mockResolvedValue([staleMission]);
      prisma.researchTask.updateMany.mockRejectedValue(
        new Error("Database error"),
      );

      // Act
      const result = await service.recoverInterruptedMissions();

      // Assert
      expect(result.failedRecoveries).toBe(1);
      expect(result.details[0].action).toBe("failed");
    });
  });

  // ==================== getMissionHealthStatus Tests ====================

  describe("getMissionHealthStatus", () => {
    it("should return healthy status for active mission with recent activity", async () => {
      // Arrange
      const now = new Date();
      const healthyMission = {
        ...MOCK_MISSION_EXECUTING,
        updatedAt: now,
        createdAt: now,
        startedAt: now,
        tasks: [
          {
            ...MOCK_TASK_EXECUTING,
            updatedAt: now,
            startedAt: now,
          },
        ],
      };
      prisma.researchMission.findUnique.mockResolvedValue(healthyMission);

      // Act
      const result = await service.getMissionHealthStatus(healthyMission.id);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.isHealthy).toBe(true);
      expect(result!.issues).toHaveLength(0);
    });

    it("should return unhealthy status for stale mission", async () => {
      // Arrange - mission hasn't been updated in 35 minutes
      const staleDate = new Date(Date.now() - 35 * 60 * 1000);
      const staleMission = {
        ...MOCK_MISSION_EXECUTING,
        updatedAt: staleDate,
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
        tasks: [
          {
            ...MOCK_TASK_EXECUTING,
            updatedAt: staleDate,
            startedAt: staleDate,
          },
        ],
      };
      prisma.researchMission.findUnique.mockResolvedValue(staleMission);

      // Act
      const result = await service.getMissionHealthStatus(staleMission.id);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.isHealthy).toBe(false);
      expect(result!.issues.length).toBeGreaterThan(0);
    });

    it("should return null for non-existent mission", async () => {
      // Arrange
      prisma.researchMission.findUnique.mockResolvedValue(null);

      // Act
      const result = await service.getMissionHealthStatus("non-existent");

      // Assert
      expect(result).toBeNull();
    });
  });

  // ==================== Lifecycle Tests ====================

  describe("lifecycle", () => {
    it("should not fail on onModuleDestroy", async () => {
      // Arrange
      prisma.researchMission.findMany.mockResolvedValue([]);

      // Act & Assert (should not throw)
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });

    it("should save checkpoints on graceful shutdown", async () => {
      // Arrange
      const executingMission = {
        ...MOCK_MISSION_EXECUTING,
        tasks: [MOCK_TASK_COMPLETED, MOCK_TASK_EXECUTING],
        userContext: {},
      };
      prisma.researchMission.findMany.mockResolvedValue([executingMission]);
      prisma.researchMission.update.mockResolvedValue(executingMission);

      // Act
      await service.onModuleDestroy();

      // Assert
      expect(prisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: executingMission.id },
          data: expect.objectContaining({
            userContext: expect.objectContaining({
              shutdownCheckpoint: expect.any(Object),
            }),
          }),
        }),
      );
    });
  });
});
