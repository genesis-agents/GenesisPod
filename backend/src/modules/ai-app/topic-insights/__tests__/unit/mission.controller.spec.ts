// @ts-nocheck
/**
 * MissionController Unit Tests
 *
 * Tests for mission controller endpoints including leader plan, retry, and cancel
 * Type checking is disabled due to Jest mock compatibility issues.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ExecutionContext } from "@nestjs/common";
import { MissionController } from "../../controllers/mission.controller";
import { TopicInsightsService } from "../../topic-insights.service";
import {
  ResearchMissionService,
  ResearchLeaderService,
  ResearchEventEmitterService,
  ResearchTodoService,
  ResearchMissionHealthService,
  ResearchCheckpointService,
} from "../../services";
import { TopicAccessGuard } from "../../guards";

import {
  MOCK_TOPIC,
  MOCK_MISSION_EXECUTING,
  MOCK_MISSION_COMPLETED,
} from "../fixtures/topics.fixture";

describe("MissionController", () => {
  let controller: MissionController;
  let topicResearchService: any;
  let missionService: any;
  let leaderService: any;
  let eventEmitterService: any;
  let todoService: any;
  let healthService: any;
  let checkpointService: any;

  // Mock request with user
  const mockRequest = {
    user: { id: "user-123", email: "test@example.com" },
  } as any;

  beforeEach(async () => {
    // Create mock services
    topicResearchService = {
      getAgentActivities: jest.fn(),
      getAgentActivityStats: jest.fn(),
    };

    missionService = {
      createMission: jest.fn(),
      getMissionByTopicId: jest.fn(),
      getMissionStatus: jest.fn(),
      retryMission: jest.fn(),
      retryTask: jest.fn(),
      cancelMission: jest.fn(),
      adjustMission: jest.fn(),
      getTeamInfo: jest.fn(),
      addAgentToLeaderPlan: jest.fn(),
    };

    leaderService = {
      handleUserMessage: jest.fn(),
      decodeUserInput: jest.fn(),
      selectAgentForTask: jest.fn(),
      getDecisionHistory: jest.fn(),
    };

    eventEmitterService = {
      getTeamMessages: jest.fn(),
      getAgentActivities: jest.fn(),
      saveUserMessage: jest.fn(),
      emitLeaderResponse: jest.fn(),
    };

    todoService = {
      createTodo: jest.fn(),
      scheduleTodo: jest.fn(),
    };

    healthService = {
      getMissionHealthStatus: jest.fn(),
      forceHealthCheck: jest.fn(),
    };

    checkpointService = {
      canResume: jest.fn(),
      resumeMission: jest.fn(),
      getResumableMissions: jest.fn(),
    };

    // Mock TopicAccessGuard to always allow access
    const mockGuard = {
      canActivate: jest.fn((context: ExecutionContext) => true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MissionController],
      providers: [
        { provide: TopicInsightsService, useValue: topicResearchService },
        { provide: ResearchMissionService, useValue: missionService },
        { provide: ResearchLeaderService, useValue: leaderService },
        { provide: ResearchEventEmitterService, useValue: eventEmitterService },
        { provide: ResearchTodoService, useValue: todoService },
        { provide: ResearchMissionHealthService, useValue: healthService },
        { provide: ResearchCheckpointService, useValue: checkpointService },
      ],
    })
      .overrideGuard(TopicAccessGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<MissionController>(MissionController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== leaderPlan Tests ====================

  describe("leaderPlan", () => {
    it("should create mission with user prompt", async () => {
      // Arrange
      const topicId = "topic-123";
      const dto = {
        userPrompt: "Analyze the AI market comprehensively",
        userContext: { focus: "enterprise" },
        mode: "fresh",
        researchDepth: "thorough",
      };

      missionService.createMission.mockResolvedValue({
        ...MOCK_MISSION_EXECUTING,
        userPrompt: dto.userPrompt,
      });

      // Act
      const result = await controller.leaderPlan(topicId, dto);

      // Assert
      expect(result).toBeDefined();
      expect(missionService.createMission).toHaveBeenCalledWith({
        topicId,
        userPrompt: dto.userPrompt,
        userContext: dto.userContext,
        mode: "fresh",
        researchDepth: "thorough",
      });
    });

    it("should use default mode when not specified", async () => {
      // Arrange
      const topicId = "topic-123";
      const dto = {
        userPrompt: "Research this topic",
      };

      missionService.createMission.mockResolvedValue(MOCK_MISSION_EXECUTING);

      // Act
      await controller.leaderPlan(topicId, dto);

      // Assert
      expect(missionService.createMission).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "fresh", // Default mode
        }),
      );
    });
  });

  // ==================== leaderMessage Tests ====================

  describe("leaderMessage", () => {
    it("should handle leader message successfully", async () => {
      // Arrange
      const topicId = "topic-123";
      const dto = { content: "@Leader please add a new dimension" };

      missionService.getMissionByTopicId.mockResolvedValue(
        MOCK_MISSION_EXECUTING,
      );
      leaderService.handleUserMessage.mockResolvedValue({
        response: "I'll add that dimension",
      });

      // Act
      const result = await controller.leaderMessage(mockRequest, topicId, dto);

      // Assert
      expect(result).toBeDefined();
      expect(leaderService.handleUserMessage).toHaveBeenCalledWith(
        topicId,
        MOCK_MISSION_EXECUTING.id,
        dto.content,
      );
    });

    it("should throw UnauthorizedException when user not authenticated", async () => {
      // Arrange
      const unauthenticatedRequest = { user: null } as any;

      // Act & Assert
      await expect(
        controller.leaderMessage(unauthenticatedRequest, "topic-123", {
          content: "test",
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw NotFoundException when no active mission", async () => {
      // Arrange
      missionService.getMissionByTopicId.mockResolvedValue(null);

      // Act & Assert
      await expect(
        controller.leaderMessage(mockRequest, "topic-123", { content: "test" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== leaderChat Tests ====================

  describe("leaderChat", () => {
    it("should create TODO when decision type is CREATE_TODO", async () => {
      // Arrange
      const topicId = "topic-123";
      const dto = {
        message: "Research market size in detail",
        missionId: "mission-123",
      };

      leaderService.decodeUserInput.mockResolvedValue({
        decisionType: "CREATE_TODO",
        understanding: "User wants market size research",
        response: "I'll create a task for that",
        todoTitle: "Research market size",
        todoDescription: "Detailed analysis of market size",
      });

      leaderService.selectAgentForTask.mockResolvedValue({
        agentId: "agent-123",
        agentName: "Market Analyst",
        agentType: "dimension_researcher",
        role: "Market Research Specialist",
        modelId: "gpt-4o-mini",
        skills: ["deep_dive", "synthesis"],
        tools: ["web-search"],
      });

      todoService.createTodo.mockResolvedValue({
        id: "todo-123",
        title: "研究: Research market size",
        assignedAgent: "agent-123",
      });

      todoService.scheduleTodo.mockResolvedValue(undefined);

      // Act
      const result = await controller.leaderChat(mockRequest, topicId, dto);

      // Assert
      expect(result.decisionType).toBe("CREATE_TODO");
      expect(result.todo).toBeDefined();
      expect(result.todo.id).toBe("todo-123");
      expect(todoService.createTodo).toHaveBeenCalledWith(
        expect.objectContaining({
          topicId,
          missionId: dto.missionId,
          type: "USER_REQUEST",
          title: "研究: Research market size", // Should have "研究:" prefix
          agentId: "agent-123",
          modelId: "gpt-4o-mini",
        }),
      );
      expect(missionService.addAgentToLeaderPlan).toHaveBeenCalled();
      expect(todoService.scheduleTodo).toHaveBeenCalled();
    });

    it("should save user message and leader response", async () => {
      // Arrange
      const topicId = "topic-123";
      const dto = {
        message: "How is the research going?",
        missionId: "mission-123",
      };

      leaderService.decodeUserInput.mockResolvedValue({
        decisionType: "DIRECT_ANSWER",
        understanding: "User asking for progress",
        response: "Research is 60% complete",
      });

      // Act
      await controller.leaderChat(mockRequest, topicId, dto);

      // Assert
      expect(eventEmitterService.saveUserMessage).toHaveBeenCalledWith(
        topicId,
        dto.missionId,
        dto.message,
      );
      expect(eventEmitterService.emitLeaderResponse).toHaveBeenCalledWith(
        topicId,
        dto.missionId,
        "Research is 60% complete",
      );
    });

    it("should get current mission if missionId not provided", async () => {
      // Arrange
      const topicId = "topic-123";
      const dto = { message: "What's the status?" };

      missionService.getMissionByTopicId.mockResolvedValue(
        MOCK_MISSION_EXECUTING,
      );
      leaderService.decodeUserInput.mockResolvedValue({
        decisionType: "DIRECT_ANSWER",
        response: "Mission is executing",
      });

      // Act
      await controller.leaderChat(mockRequest, topicId, dto);

      // Assert
      expect(missionService.getMissionByTopicId).toHaveBeenCalledWith(topicId);
      expect(leaderService.decodeUserInput).toHaveBeenCalledWith(
        topicId,
        dto.message,
        MOCK_MISSION_EXECUTING.id,
      );
    });

    it("should add 研究: prefix to task title if missing", async () => {
      // Arrange
      const topicId = "topic-123";
      const dto = { message: "Analyze competitors", missionId: "mission-123" };

      leaderService.decodeUserInput.mockResolvedValue({
        decisionType: "CREATE_TODO",
        todoTitle: "Competitor analysis", // No prefix
        todoDescription: "Analyze key competitors",
        response: "I'll analyze competitors",
      });

      leaderService.selectAgentForTask.mockResolvedValue({
        agentId: "agent-123",
        agentName: "Analyst",
        agentType: "dimension_researcher",
        role: "Analyst",
        modelId: "gpt-4o-mini",
      });

      todoService.createTodo.mockResolvedValue({
        id: "todo-123",
        title: "研究: Competitor analysis",
      });
      todoService.scheduleTodo.mockResolvedValue(undefined);

      // Act
      await controller.leaderChat(mockRequest, topicId, dto);

      // Assert
      expect(todoService.createTodo).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "研究: Competitor analysis", // Prefix should be added
        }),
      );
    });
  });

  // ==================== retryMission Tests ====================

  describe("retryMission", () => {
    it("should throw NotFoundException when no mission exists", async () => {
      // Arrange
      const topicId = "topic-123";
      missionService.getMissionByTopicId.mockResolvedValue(null);

      // Act & Assert
      await expect(controller.retryMission(topicId, {})).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.retryMission(topicId, {})).rejects.toThrow(
        "No mission found for this topic",
      );
    });

    it("should retry entire mission when taskIds not provided", async () => {
      // Arrange
      const topicId = "topic-123";
      missionService.getMissionByTopicId.mockResolvedValue(
        MOCK_MISSION_EXECUTING,
      );
      missionService.retryMission.mockResolvedValue({ retriedTasks: 3 });

      // Act
      const result = await controller.retryMission(topicId, {});

      // Assert
      expect(missionService.retryMission).toHaveBeenCalledWith(
        MOCK_MISSION_EXECUTING.id,
      );
      expect(result.retriedTasks).toBe(3);
    });

    it("should retry specific tasks when taskIds provided", async () => {
      // Arrange
      const topicId = "topic-123";
      const taskIds = ["task-1", "task-2"];
      missionService.getMissionByTopicId.mockResolvedValue(
        MOCK_MISSION_EXECUTING,
      );
      missionService.retryTask.mockResolvedValue({ success: true });

      // Act
      const result = await controller.retryMission(topicId, { taskIds });

      // Assert
      expect(missionService.retryTask).toHaveBeenCalledTimes(2);
      expect(missionService.retryTask).toHaveBeenCalledWith("task-1");
      expect(missionService.retryTask).toHaveBeenCalledWith("task-2");
      expect(result.retriedTasks).toBe(2);
    });
  });

  // ==================== cancelMission Tests ====================

  describe("cancelMission", () => {
    it("should throw UnauthorizedException when user not authenticated", async () => {
      // Arrange
      const unauthenticatedRequest = { user: null } as any;

      // Act & Assert
      await expect(
        controller.cancelMission(unauthenticatedRequest, "topic-123"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw NotFoundException when no active mission", async () => {
      // Arrange
      missionService.getMissionByTopicId.mockResolvedValue(null);

      // Act & Assert
      await expect(
        controller.cancelMission(mockRequest, "topic-123"),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.cancelMission(mockRequest, "topic-123"),
      ).rejects.toThrow("No active mission for this topic");
    });

    it("should cancel mission successfully", async () => {
      // Arrange
      const topicId = "topic-123";
      missionService.getMissionByTopicId.mockResolvedValue(
        MOCK_MISSION_EXECUTING,
      );
      missionService.cancelMission.mockResolvedValue({
        ...MOCK_MISSION_EXECUTING,
        status: "CANCELLED",
      });

      // Act
      const result = await controller.cancelMission(mockRequest, topicId);

      // Assert
      expect(missionService.cancelMission).toHaveBeenCalledWith(
        "user-123",
        MOCK_MISSION_EXECUTING.id,
      );
      expect(result.status).toBe("CANCELLED");
    });
  });

  // ==================== getMission Tests ====================

  describe("getMission", () => {
    it("should throw UnauthorizedException when user not authenticated", async () => {
      // Arrange
      const unauthenticatedRequest = { user: null } as any;

      // Act & Assert
      await expect(
        controller.getMission(unauthenticatedRequest, "topic-123"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should return mission for topic", async () => {
      // Arrange
      missionService.getMissionByTopicId.mockResolvedValue(
        MOCK_MISSION_EXECUTING,
      );

      // Act
      const result = await controller.getMission(mockRequest, "topic-123");

      // Assert
      expect(result).toEqual(MOCK_MISSION_EXECUTING);
      expect(missionService.getMissionByTopicId).toHaveBeenCalledWith(
        "topic-123",
      );
    });

    it("should return null when no mission exists", async () => {
      // Arrange
      missionService.getMissionByTopicId.mockResolvedValue(null);

      // Act
      const result = await controller.getMission(mockRequest, "topic-123");

      // Assert
      expect(result).toBeNull();
    });
  });

  // ==================== getTeam Tests ====================

  describe("getTeam", () => {
    it("should return team info for active mission", async () => {
      // Arrange
      const teamInfo = {
        leaderId: "leader-1",
        leaderModel: "deepseek-r1",
        agents: [
          { agentId: "agent-1", agentName: "Researcher", role: "researcher" },
          { agentId: "agent-2", agentName: "Reviewer", role: "reviewer" },
        ],
      };

      missionService.getMissionByTopicId.mockResolvedValue(
        MOCK_MISSION_EXECUTING,
      );
      missionService.getTeamInfo.mockResolvedValue(teamInfo);

      // Act
      const result = await controller.getTeam(mockRequest, "topic-123");

      // Assert
      expect(result).toEqual(teamInfo);
      expect(missionService.getTeamInfo).toHaveBeenCalledWith(
        MOCK_MISSION_EXECUTING.id,
      );
    });

    it("should return empty team when no mission", async () => {
      // Arrange
      missionService.getMissionByTopicId.mockResolvedValue(null);

      // Act
      const result = await controller.getTeam(mockRequest, "topic-123");

      // Assert
      expect(result).toEqual({
        leaderId: null,
        leaderModel: null,
        agents: [],
      });
    });
  });

  // ==================== Health Check Tests ====================

  describe("getMissionHealth", () => {
    it("should return mission health status", async () => {
      // Arrange
      const healthStatus = {
        isHealthy: true,
        status: "EXECUTING",
        runningTime: 300000,
        issues: [],
      };

      healthService.getMissionHealthStatus.mockResolvedValue(healthStatus);

      // Act
      const result = await controller.getMissionHealth(
        mockRequest,
        "topic-123",
        "mission-123",
      );

      // Assert
      expect(result).toEqual(healthStatus);
      expect(healthService.getMissionHealthStatus).toHaveBeenCalledWith(
        "mission-123",
      );
    });

    it("should throw UnauthorizedException when user not authenticated", async () => {
      // Arrange
      const unauthenticatedRequest = { user: null } as any;

      // Act & Assert
      await expect(
        controller.getMissionHealth(
          unauthenticatedRequest,
          "topic-123",
          "mission-123",
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==================== getLeaderDecisions Tests ====================

  describe("getLeaderDecisions", () => {
    it("should return decision history for mission", async () => {
      // Arrange
      const decisions = [
        { id: "decision-1", type: "ADD_DIMENSION", timestamp: new Date() },
        { id: "decision-2", type: "ADJUST_SCOPE", timestamp: new Date() },
      ];

      missionService.getMissionByTopicId.mockResolvedValue(
        MOCK_MISSION_EXECUTING,
      );
      leaderService.getDecisionHistory.mockResolvedValue(decisions);

      // Act
      const result = await controller.getLeaderDecisions(
        mockRequest,
        "topic-123",
      );

      // Assert
      expect(result).toEqual(decisions);
      expect(leaderService.getDecisionHistory).toHaveBeenCalledWith(
        MOCK_MISSION_EXECUTING.id,
      );
    });

    it("should return empty array when no mission", async () => {
      // Arrange
      missionService.getMissionByTopicId.mockResolvedValue(null);

      // Act
      const result = await controller.getLeaderDecisions(
        mockRequest,
        "topic-123",
      );

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ==================== adjustMission Tests ====================

  describe("adjustMission", () => {
    it("should adjust mission strategy", async () => {
      // Arrange
      const dto = {
        action: "ADD_DIMENSION",
        dimensionName: "Risk Analysis",
      };

      missionService.getMissionByTopicId.mockResolvedValue(
        MOCK_MISSION_EXECUTING,
      );
      missionService.adjustMission.mockResolvedValue({ success: true });

      // Act
      const result = await controller.adjustMission(
        mockRequest,
        "topic-123",
        dto,
      );

      // Assert
      expect(result).toEqual({ success: true });
      expect(missionService.adjustMission).toHaveBeenCalledWith(
        "user-123",
        MOCK_MISSION_EXECUTING.id,
        dto,
      );
    });

    it("should throw NotFoundException when no mission", async () => {
      // Arrange
      missionService.getMissionByTopicId.mockResolvedValue(null);

      // Act & Assert
      await expect(
        controller.adjustMission(mockRequest, "topic-123", {
          action: "ADD_DIMENSION",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
