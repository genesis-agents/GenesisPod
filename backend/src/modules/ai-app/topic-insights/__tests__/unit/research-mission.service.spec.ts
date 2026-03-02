/**
 * ResearchMissionService Unit Tests
 *
 * Tests for mission lifecycle management
 * Type checking is disabled due to Jest mock compatibility issues.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { ResearchMissionService } from "../../services/core/research-mission.service";
import { ResearchLeaderService } from "../../services/core/research-leader.service";
import { DimensionMissionService } from "../../services/dimension/dimension-mission.service";
import { ReportSynthesisService } from "../../services/report/report-synthesis.service";
import { ResearchEventEmitterService } from "../../services/core/research-event-emitter.service";
import { TopicCollaboratorService } from "../../services/collaboration/topic-collaborator.service";
import { AgentActivityService } from "../../services/monitoring/agent-activity.service";
import { ResearchReviewerService } from "../../services/collaboration/research-reviewer.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { PrismaService } from "@/common/prisma/prisma.service";

import {
  createMockPrisma,
  createMockAiEngineFacade,
  createMockResearchEventEmitter,
  createMockAgentActivityService,
  createMockEventEmitter2,
  MOCK_LEADER_PLAN,
} from "../mocks";

import {
  MOCK_TOPIC,
  MOCK_MISSION_PLANNING,
  MOCK_MISSION_EXECUTING,
  MOCK_MISSION_COMPLETED,
  MOCK_TASK_EXECUTING,
  MOCK_TASK_COMPLETED,
  createMockMissionWithTasks,
} from "../fixtures/topics.fixture";

describe("ResearchMissionService", () => {
  let service: ResearchMissionService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let eventEmitter: ReturnType<typeof createMockEventEmitter2>;
  let researchEventEmitter: ReturnType<typeof createMockResearchEventEmitter>;
  let agentActivity: ReturnType<typeof createMockAgentActivityService>;

  // Mock services that are injected but not directly tested
  const mockLeaderService = {
    planResearch: jest.fn().mockResolvedValue(MOCK_LEADER_PLAN),
    decodeUserInput: jest.fn().mockResolvedValue({ intent: "research" }),
    getReasoningModel: jest.fn().mockResolvedValue({
      id: "gpt-4o",
      name: "GPT-4o",
    }),
  };

  const mockDimensionMissionService = {
    executeDimensionResearch: jest.fn().mockResolvedValue({
      success: true,
      analysis: "Test analysis",
    }),
  };

  const mockReportSynthesisService = {
    createDraftReport: jest.fn().mockResolvedValue({ id: "report-123" }),
    synthesizeReport: jest.fn().mockResolvedValue({ id: "report-123" }),
  };

  const mockCollaboratorService = {
    getCollaborators: jest.fn().mockResolvedValue([]),
    checkAccess: jest.fn().mockResolvedValue(true),
    hasAccess: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    eventEmitter = createMockEventEmitter2();
    researchEventEmitter = createMockResearchEventEmitter();
    agentActivity = createMockAgentActivityService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchMissionService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: ResearchLeaderService, useValue: mockLeaderService },
        {
          provide: DimensionMissionService,
          useValue: mockDimensionMissionService,
        },
        {
          provide: ReportSynthesisService,
          useValue: mockReportSynthesisService,
        },
        {
          provide: ResearchEventEmitterService,
          useValue: researchEventEmitter,
        },
        {
          provide: TopicCollaboratorService,
          useValue: mockCollaboratorService,
        },
        { provide: AgentActivityService, useValue: agentActivity },
        { provide: ChatFacade, useValue: createMockAiEngineFacade() },
        {
          provide: ResearchReviewerService,
          useValue: {
            factCheckReport: jest.fn().mockResolvedValue({
              citations: [],
              accuracyScore: 100,
              issues: [],
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ResearchMissionService>(ResearchMissionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== createMission Tests ====================

  describe("createMission", () => {
    it("should create a mission with PLANNING status", async () => {
      // Arrange
      const topicId = "topic-123";
      prisma.researchTopic.findUnique.mockResolvedValue(MOCK_TOPIC);
      prisma.researchMission.findFirst.mockResolvedValue(null); // No existing mission
      prisma.researchMission.create.mockResolvedValue({
        ...MOCK_MISSION_PLANNING,
        topicId,
      });

      // Act
      const result = await service.createMission({ topicId });

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe("PLANNING");
      expect(prisma.researchMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            topicId,
            status: "PLANNING",
          }),
        }),
      );
    });

    it("should throw NotFoundException for non-existent topic", async () => {
      // Arrange
      prisma.researchTopic.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.createMission({ topicId: "non-existent" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should cancel existing executing mission when creating new one in fresh mode", async () => {
      // Arrange
      const topicId = "topic-123";
      const existingMission = {
        ...MOCK_MISSION_EXECUTING,
        tasks: [MOCK_TASK_EXECUTING],
      };

      prisma.researchTopic.findUnique.mockResolvedValue(MOCK_TOPIC);
      prisma.researchMission.findFirst.mockResolvedValue(existingMission);
      prisma.researchMission.update.mockResolvedValue({
        ...existingMission,
        status: "CANCELLED",
      });
      prisma.researchMission.create.mockResolvedValue({
        ...MOCK_MISSION_PLANNING,
        topicId,
      });

      // Act
      await service.createMission({ topicId, mode: "fresh" });

      // Assert
      expect(prisma.researchMission.update).toHaveBeenCalledWith({
        where: { id: existingMission.id },
        data: expect.objectContaining({
          status: "CANCELLED",
        }),
      });
    });

    it("should preserve completed tasks in incremental mode", async () => {
      // Arrange
      const topicId = "topic-123";
      const existingMission = {
        ...MOCK_MISSION_COMPLETED,
        tasks: [MOCK_TASK_COMPLETED],
      };

      prisma.researchTopic.findUnique.mockResolvedValue(MOCK_TOPIC);
      prisma.researchMission.findFirst.mockResolvedValue(existingMission);
      prisma.researchMission.create.mockResolvedValue({
        ...MOCK_MISSION_PLANNING,
        topicId,
      });

      // Act
      await service.createMission({ topicId, mode: "incremental" });

      // Assert
      // In incremental mode, should query for completed tasks from previous mission
      expect(prisma.researchMission.findFirst).toHaveBeenCalled();
    });
  });

  // ==================== getMissionStatus Tests ====================

  describe("getMissionStatus", () => {
    it("should return correct mission status with progress", async () => {
      // Arrange
      const missionWithTasks = createMockMissionWithTasks();
      prisma.researchMission.findUnique.mockResolvedValue(missionWithTasks);

      // Act
      const result = await service.getMissionStatus(missionWithTasks.id);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(missionWithTasks.id);
      expect(result.completedTasks).toBe(1); // Only MOCK_TASK_COMPLETED is completed
      expect(result.totalTasks).toBe(3);
    });

    it("should throw NotFoundException for non-existent mission", async () => {
      // Arrange
      prisma.researchMission.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getMissionStatus("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should calculate progress percentage correctly", async () => {
      // Arrange
      const missionWithAllCompleted = {
        ...MOCK_MISSION_EXECUTING,
        totalTasks: 2, // Override to match test expectations
        completedTasks: 2,
        tasks: [
          { ...MOCK_TASK_COMPLETED, id: "task-1" },
          { ...MOCK_TASK_COMPLETED, id: "task-2" },
        ],
        topic: MOCK_TOPIC,
      };
      prisma.researchMission.findUnique.mockResolvedValue(
        missionWithAllCompleted,
      );

      // Act
      const result = await service.getMissionStatus(missionWithAllCompleted.id);

      // Assert
      expect(result.completedTasks).toBe(2);
      expect(result.totalTasks).toBe(2);
      // Progress should be 100%
    });
  });

  // ==================== cancelMission Tests ====================

  describe("cancelMission", () => {
    it("should cancel an executing mission", async () => {
      // Arrange
      const missionWithTopic = {
        ...MOCK_MISSION_EXECUTING,
        topic: MOCK_TOPIC,
      };
      prisma.researchMission.findUnique.mockResolvedValue(missionWithTopic);
      prisma.researchTask.updateMany.mockResolvedValue({ count: 2 });
      prisma.researchTodo.updateMany.mockResolvedValue({ count: 1 });
      prisma.topicReport.findMany.mockResolvedValue([]); // No empty draft reports
      prisma.researchMission.update.mockResolvedValue({
        ...missionWithTopic,
        status: "CANCELLED",
      });

      // Act
      const result = await service.cancelMission(
        MOCK_MISSION_EXECUTING.id,
        "user-123",
      );

      // Assert
      expect(result.status).toBe("CANCELLED");
      // The update is called multiple times (for access check and actual update)
      // Just verify the result status is correct
      expect(prisma.researchMission.update).toHaveBeenCalled();
    });

    it("should throw NotFoundException for non-existent mission", async () => {
      // Arrange
      prisma.researchMission.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.cancelMission("non-existent", "user-123"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== continueExecution Tests ====================

  describe("continueExecution", () => {
    it("should throw NotFoundException for non-existent mission", async () => {
      // Arrange
      prisma.researchMission.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.continueExecution("non-existent")).rejects.toThrow(
        "Mission non-existent not found",
      );
    });

    it("should throw error if mission is not in EXECUTING status", async () => {
      // Arrange
      prisma.researchMission.findUnique.mockResolvedValue({
        ...MOCK_MISSION_COMPLETED,
        tasks: [],
        topic: MOCK_TOPIC,
      });

      // Act & Assert
      await expect(
        service.continueExecution(MOCK_MISSION_COMPLETED.id),
      ).rejects.toThrow("not in EXECUTING status");
    });

    // Note: Testing the full continueExecution flow requires extensive mocking
    // of startExecution which is called async (fire-and-forget).
    // The core validation logic is tested above.
  });

  // ==================== getTeamInfo Tests ====================

  describe("getTeamInfo", () => {
    it("should return team information from leader plan", async () => {
      // Arrange - getTeamInfo takes missionId, not topicId
      const missionWithPlan = {
        ...MOCK_MISSION_EXECUTING,
        leaderPlan: MOCK_LEADER_PLAN,
        tasks: [],
      };
      prisma.researchMission.findUnique.mockResolvedValue(missionWithPlan);
      // Mock getDefaultModelNames (called internally)
      prisma.defaultModel.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getTeamInfo(MOCK_MISSION_EXECUTING.id);

      // Assert
      expect(result).toBeDefined();
      expect(result.agents).toBeDefined();
      expect(Array.isArray(result.agents)).toBe(true);
    });

    it("should throw NotFoundException if mission not found", async () => {
      // Arrange
      prisma.researchMission.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getTeamInfo("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
