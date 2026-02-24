import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  ResearchEventEmitterService,
  ResearchEventType,
  RESEARCH_INTERNAL_EVENTS,
} from "../research-event-emitter.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ResearchRealtimeAdapter } from "../research-realtime.adapter";

const mockPrisma = {
  researchTopic: {
    findUnique: jest.fn(),
  },
  researchAgentActivity: {
    create: jest.fn(),
  },
  researchTeamMessage: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  researchTask: {
    updateMany: jest.fn(),
  },
};

const mockEventEmitter2 = {
  emit: jest.fn(),
};

const mockRealtimeAdapter = {
  emitToTopic: jest.fn(),
  startMissionTracking: jest.fn(),
  startPhase: jest.fn(),
  completePhase: jest.fn(),
  completeMissionTracking: jest.fn(),
  failMissionTracking: jest.fn(),
  updatePhaseProgress: jest.fn().mockReturnValue(50),
};

// Mock the getModelDisplayNameMap utility
jest.mock("../../../utils/model-display-name", () => ({
  getModelDisplayNameMap: jest.fn().mockResolvedValue(new Map()),
}));

describe("ResearchEventEmitterService", () => {
  let service: ResearchEventEmitterService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-123" });
    mockPrisma.researchAgentActivity.create.mockResolvedValue({});
    mockPrisma.researchTeamMessage.create.mockResolvedValue({});
    mockPrisma.researchTeamMessage.findMany.mockResolvedValue([]);
    mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchEventEmitterService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter2 },
        { provide: ResearchRealtimeAdapter, useValue: mockRealtimeAdapter },
      ],
    }).compile();

    service = module.get<ResearchEventEmitterService>(
      ResearchEventEmitterService,
    );
  });

  describe("RESEARCH_INTERNAL_EVENTS constants", () => {
    it("should have correct event names", () => {
      expect(RESEARCH_INTERNAL_EVENTS.RESUME_MISSION_EXECUTION).toBe(
        "research.mission.resume-execution",
      );
      expect(RESEARCH_INTERNAL_EVENTS.RECOVERY_NEEDED).toBe(
        "research.mission.recovery_needed",
      );
      expect(RESEARCH_INTERNAL_EVENTS.TOPIC_RESEARCH_PROGRESS).toBe(
        "topic-insights.progress",
      );
    });
  });

  describe("registerEmitHandler", () => {
    it("should register an emit handler", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);

      service.registerEmitHandler(handler);

      // Verify it calls handler when event is emitted
      await service.emitToTopic("topic-123", "test:event", { data: "test" });

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        "test:event",
        expect.objectContaining({ data: "test", timestamp: expect.any(String) }),
      );
    });
  });

  describe("emitResumeMissionExecution", () => {
    it("should emit the internal event via nestEventEmitter", () => {
      service.emitResumeMissionExecution("mission-123", "topic-456");

      expect(mockEventEmitter2.emit).toHaveBeenCalledWith(
        RESEARCH_INTERNAL_EVENTS.RESUME_MISSION_EXECUTION,
        { missionId: "mission-123", topicId: "topic-456" },
      );
    });
  });

  describe("emitToTopic", () => {
    it("should call realtimeAdapter.emitToTopic when adapter is available", async () => {
      await service.emitToTopic(
        "topic-123",
        ResearchEventType.MISSION_STARTED,
        { missionId: "m-001" },
      );

      expect(mockRealtimeAdapter.emitToTopic).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.MISSION_STARTED,
        expect.objectContaining({
          missionId: "m-001",
          timestamp: expect.any(String),
        }),
      );
    });

    it("should call emit handler when registered", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitToTopic("topic-123", "some:event", { key: "value" });

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        "some:event",
        expect.objectContaining({ key: "value" }),
      );
    });

    it("should handle realtimeAdapter error gracefully", async () => {
      mockRealtimeAdapter.emitToTopic.mockImplementationOnce(() => {
        throw new Error("Adapter error");
      });

      // Should not throw
      await expect(
        service.emitToTopic("topic-123", "test", {}),
      ).resolves.not.toThrow();
    });

    it("should handle emit handler error gracefully", async () => {
      const handler = jest.fn().mockRejectedValue(new Error("Handler error"));
      service.registerEmitHandler(handler);

      // Should not throw
      await expect(
        service.emitToTopic("topic-123", "test", {}),
      ).resolves.not.toThrow();
    });

    it("should normalize non-object data", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitToTopic("topic-123", "test", "string-value");

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        "test",
        expect.objectContaining({ value: "string-value" }),
      );
    });
  });

  describe("emitMissionStarted", () => {
    it("should start mission tracking via adapter", async () => {
      await service.emitMissionStarted("topic-123", "mission-456");

      expect(mockRealtimeAdapter.startMissionTracking).toHaveBeenCalledWith(
        "topic-123",
        "mission-456",
        false,
      );
      expect(mockRealtimeAdapter.startPhase).toHaveBeenCalledWith(
        "mission-456",
        "planning",
        "Leader 开始规划",
      );
    });

    it("should pass isQuickMode to adapter", async () => {
      await service.emitMissionStarted("topic-123", "mission-456", undefined, true);

      expect(mockRealtimeAdapter.startMissionTracking).toHaveBeenCalledWith(
        "topic-123",
        "mission-456",
        true,
      );
    });

    it("should emit MISSION_STARTED event", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitMissionStarted("topic-123", "mission-456", "gpt-4o");

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.MISSION_STARTED,
        expect.objectContaining({
          missionId: "mission-456",
          leaderModel: "gpt-4o",
        }),
      );
    });
  });

  describe("emitMissionProgress", () => {
    it("should emit MISSION_PROGRESS event with data", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      const progressData = {
        missionId: "m-001",
        progress: 50,
        phase: "researching",
        message: "Progress update",
        completedTasks: 3,
        totalTasks: 6,
      };

      await service.emitMissionProgress("topic-123", progressData);

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.MISSION_PROGRESS,
        expect.objectContaining(progressData),
      );
    });
  });

  describe("emitMissionCompleted", () => {
    it("should complete mission tracking via adapter", async () => {
      await service.emitMissionCompleted("topic-123", "mission-456", 5, 5);

      expect(mockRealtimeAdapter.completeMissionTracking).toHaveBeenCalledWith(
        "mission-456",
        "研究完成",
      );
    });

    it("should emit MISSION_COMPLETED event", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitMissionCompleted("topic-123", "mission-456", 5, 5);

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.MISSION_COMPLETED,
        expect.objectContaining({
          missionId: "mission-456",
          completedTasks: 5,
          totalTasks: 5,
        }),
      );
    });
  });

  describe("emitMissionFailed", () => {
    it("should mark mission tracking as failed via adapter", async () => {
      await service.emitMissionFailed("topic-123", "mission-456", "timeout");

      expect(mockRealtimeAdapter.failMissionTracking).toHaveBeenCalledWith(
        "mission-456",
        "timeout",
      );
    });

    it("should emit MISSION_FAILED event with error", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitMissionFailed("topic-123", "mission-456", "LLM error");

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.MISSION_FAILED,
        expect.objectContaining({
          missionId: "mission-456",
          error: "LLM error",
        }),
      );
    });
  });

  describe("emitLeaderThinking", () => {
    it("should emit LEADER_THINKING event", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      const thinkingData = {
        missionId: "m-001",
        phase: "planning" as const,
        content: "Analyzing research topic...",
        progress: 30,
      };

      await service.emitLeaderThinking("topic-123", thinkingData);

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.LEADER_THINKING,
        expect.objectContaining(thinkingData),
      );
    });

    it("should persist leader thinking to database when topic exists", async () => {
      const thinkingData = {
        missionId: "m-001",
        phase: "planning" as const,
        content: "Planning research",
        progress: 10,
      };

      await service.emitLeaderThinking("topic-123", thinkingData);

      expect(mockPrisma.researchAgentActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          topicId: "topic-123",
          missionId: "m-001",
          agentId: "leader",
          agentName: "研究协调员",
          agentRole: "leader",
          activityType: "PLANNING",
          phase: "planning",
          content: "Planning research",
        }),
      });
    });

    it("should use THINKING activityType for non-planning phases", async () => {
      const thinkingData = {
        missionId: "m-001",
        phase: "understanding" as const,
        content: "Understanding topic",
      };

      await service.emitLeaderThinking("topic-123", thinkingData);

      expect(mockPrisma.researchAgentActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          activityType: "THINKING",
        }),
      });
    });

    it("should skip persistence when topic does not exist", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(null);

      await service.emitLeaderThinking("nonexistent-topic", {
        missionId: "m-001",
        phase: "planning",
        content: "Test",
      });

      expect(mockPrisma.researchAgentActivity.create).not.toHaveBeenCalled();
    });

    it("should handle foreign key constraint error gracefully", async () => {
      mockPrisma.researchAgentActivity.create.mockRejectedValue(
        new Error("Foreign key constraint failed"),
      );

      // Should not throw
      await expect(
        service.emitLeaderThinking("topic-123", {
          missionId: "m-001",
          phase: "planning",
          content: "Test",
        }),
      ).resolves.not.toThrow();
    });
  });

  describe("emitLeaderPlanReady", () => {
    it("should transition phases in adapter", async () => {
      await service.emitLeaderPlanReady("topic-123", "mission-456", 5, 3);

      expect(mockRealtimeAdapter.completePhase).toHaveBeenCalledWith(
        "mission-456",
        "planning",
        "规划完成",
      );
      expect(mockRealtimeAdapter.startPhase).toHaveBeenCalledWith(
        "mission-456",
        "researching",
        "开始维度研究",
      );
    });

    it("should emit LEADER_PLAN_READY event with counts", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitLeaderPlanReady("topic-123", "mission-456", 4, 3);

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.LEADER_PLAN_READY,
        expect.objectContaining({
          missionId: "mission-456",
          dimensionCount: 4,
          agentCount: 3,
        }),
      );
    });
  });

  describe("emitLeaderResponse", () => {
    it("should emit LEADER_RESPONSE event", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitLeaderResponse("topic-123", "m-001", "Research plan ready");

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.LEADER_RESPONSE,
        expect.objectContaining({ response: "Research plan ready" }),
      );
    });

    it("should persist leader response to database", async () => {
      await service.emitLeaderResponse(
        "topic-123",
        "m-001",
        "Plan created",
      );

      expect(mockPrisma.researchTeamMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          topicId: "topic-123",
          missionId: "m-001",
          messageType: "LEADER_RESPONSE",
          senderRole: "leader",
          content: "Plan created",
        }),
      });
    });

    it("should handle persistence error gracefully", async () => {
      mockPrisma.researchTeamMessage.create.mockRejectedValue(
        new Error("DB error"),
      );

      // Should not throw
      await expect(
        service.emitLeaderResponse("topic-123", "m-001", "Response"),
      ).resolves.not.toThrow();
    });
  });

  describe("saveUserMessage", () => {
    it("should save user message to database", async () => {
      await service.saveUserMessage(
        "topic-123",
        "m-001",
        "What are the trends?",
        "Alice",
      );

      expect(mockPrisma.researchTeamMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          topicId: "topic-123",
          missionId: "m-001",
          messageType: "USER_MESSAGE",
          senderRole: "user",
          senderName: "Alice",
          content: "What are the trends?",
        }),
      });
    });

    it("should use default user name when none provided", async () => {
      await service.saveUserMessage("topic-123", "m-001", "Question");

      expect(mockPrisma.researchTeamMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ senderName: "用户" }),
      });
    });

    it("should handle persistence error gracefully", async () => {
      mockPrisma.researchTeamMessage.create.mockRejectedValue(
        new Error("DB error"),
      );

      await expect(
        service.saveUserMessage("topic-123", "m-001", "Message"),
      ).resolves.not.toThrow();
    });
  });

  describe("emitAgentWorking", () => {
    it("should emit AGENT_WORKING event", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      const agentData = {
        agentId: "researcher-1",
        agentName: "研究员",
        agentRole: "researcher" as const,
        status: "working" as const,
        taskDescription: "Searching for data",
        progress: 30,
      };

      await service.emitAgentWorking("topic-123", agentData);

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.AGENT_WORKING,
        expect.objectContaining(agentData),
      );
    });

    it("should persist activity to database when missionId provided and topic exists", async () => {
      const agentData = {
        agentId: "researcher-1",
        agentName: "研究员",
        agentRole: "researcher" as const,
        status: "working" as const,
        taskDescription: "Searching",
        progress: 25,
        dimensionId: "dim-001",
        dimensionName: "Technology",
      };

      await service.emitAgentWorking("topic-123", agentData, "mission-456");

      expect(mockPrisma.researchAgentActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          topicId: "topic-123",
          missionId: "mission-456",
          agentId: "researcher-1",
          agentRole: "researcher",
          activityType: "RESEARCHING",
          progress: 25,
          dimensionId: "dim-001",
          dimensionName: "Technology",
        }),
      });
    });

    it("should not persist when missionId is not provided", async () => {
      await service.emitAgentWorking("topic-123", {
        agentId: "r-1",
        agentName: "研究员",
        agentRole: "researcher",
        status: "working",
      });

      expect(mockPrisma.researchAgentActivity.create).not.toHaveBeenCalled();
    });

    it("should skip persistence when topic does not exist", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(null);

      await service.emitAgentWorking(
        "nonexistent-topic",
        {
          agentId: "r-1",
          agentName: "研究员",
          agentRole: "researcher",
          status: "working",
        },
        "mission-456",
      );

      expect(mockPrisma.researchAgentActivity.create).not.toHaveBeenCalled();
    });

    it("should map completed status to COMPLETED activityType", async () => {
      await service.emitAgentWorking(
        "topic-123",
        {
          agentId: "r-1",
          agentName: "研究员",
          agentRole: "researcher",
          status: "completed",
        },
        "mission-456",
      );

      expect(mockPrisma.researchAgentActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ activityType: "COMPLETED" }),
      });
    });

    it("should map failed status to FAILED activityType", async () => {
      await service.emitAgentWorking(
        "topic-123",
        {
          agentId: "r-1",
          agentName: "研究员",
          agentRole: "researcher",
          status: "failed",
        },
        "mission-456",
      );

      expect(mockPrisma.researchAgentActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ activityType: "FAILED" }),
      });
    });

    it("should sync task progress when dimensionName and progress are set", async () => {
      await service.emitAgentWorking(
        "topic-123",
        {
          agentId: "r-1",
          agentName: "研究员",
          agentRole: "researcher",
          status: "working",
          dimensionName: "Technology",
          progress: 50,
        },
        "mission-456",
      );

      expect(mockPrisma.researchTask.updateMany).toHaveBeenCalledWith({
        where: {
          missionId: "mission-456",
          dimensionName: "Technology",
          status: "EXECUTING",
        },
        data: { progress: 50 },
      });
    });
  });

  describe("emitAgentCompleted", () => {
    it("should emit AGENT_COMPLETED event", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitAgentCompleted(
        "topic-123",
        "researcher-1",
        "研究员",
        "Research completed",
      );

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.AGENT_COMPLETED,
        expect.objectContaining({
          agentId: "researcher-1",
          result: "Research completed",
        }),
      );
    });

    it("should persist completed activity when missionId provided and topic exists", async () => {
      await service.emitAgentCompleted(
        "topic-123",
        "researcher-1",
        "研究员",
        "Done",
        "mission-456",
        { dimensionId: "dim-001", dimensionName: "Tech" },
      );

      expect(mockPrisma.researchAgentActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          topicId: "topic-123",
          missionId: "mission-456",
          agentId: "researcher-1",
          activityType: "COMPLETED",
          progress: 100,
          dimensionId: "dim-001",
          dimensionName: "Tech",
        }),
      });
    });
  });

  describe("emitDimensionResearchStarted", () => {
    it("should emit DIMENSION_RESEARCH_STARTED event", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitDimensionResearchStarted(
        "topic-123",
        "市场分析",
        "研究员A",
      );

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.DIMENSION_RESEARCH_STARTED,
        expect.objectContaining({
          dimensionName: "市场分析",
          agentName: "研究员A",
        }),
      );
    });

    it("should persist to database when missionId provided", async () => {
      await service.emitDimensionResearchStarted(
        "topic-123",
        "技术分析",
        "研究员B",
        "mission-456",
      );

      expect(mockPrisma.researchTeamMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          topicId: "topic-123",
          missionId: "mission-456",
          messageType: "DIMENSION_STARTED",
          senderRole: "researcher",
        }),
      });
    });
  });

  describe("emitDimensionResearchProgress", () => {
    it("should emit DIMENSION_RESEARCH_PROGRESS event", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitDimensionResearchProgress(
        "topic-123",
        "技术分析",
        50,
        "Writing analysis",
      );

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.DIMENSION_RESEARCH_PROGRESS,
        expect.objectContaining({
          dimensionName: "技术分析",
          progress: 50,
          currentStep: "Writing analysis",
        }),
      );
    });

    it("should include taskId in event when provided", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitDimensionResearchProgress(
        "topic-123",
        "技术分析",
        75,
        "Final step",
        "mission-456",
        "task-789",
      );

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.DIMENSION_RESEARCH_PROGRESS,
        expect.objectContaining({
          taskId: "task-789",
        }),
      );
    });

    it("should persist to database only at key progress points (0, 25, 50, 75, 100)", async () => {
      await service.emitDimensionResearchProgress(
        "topic-123",
        "Test Dim",
        25,
        "Quarter done",
        "mission-456",
      );

      expect(mockPrisma.researchTeamMessage.create).toHaveBeenCalled();
    });

    it("should NOT persist to database for non-key progress values", async () => {
      await service.emitDimensionResearchProgress(
        "topic-123",
        "Test Dim",
        33,
        "33 percent",
        "mission-456",
      );

      expect(mockPrisma.researchTeamMessage.create).not.toHaveBeenCalled();
    });

    it("should update adapter phase progress when missionId provided", async () => {
      await service.emitDimensionResearchProgress(
        "topic-123",
        "Tech Dim",
        60,
        "Step 3",
        "mission-456",
      );

      expect(mockRealtimeAdapter.updatePhaseProgress).toHaveBeenCalledWith(
        "mission-456",
        "researching",
        60,
        "Step 3",
      );
    });
  });

  describe("emitDimensionResearchCompleted", () => {
    it("should emit DIMENSION_RESEARCH_COMPLETED event", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitDimensionResearchCompleted(
        "topic-123",
        "市场分析",
        10,
        2500,
      );

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.DIMENSION_RESEARCH_COMPLETED,
        expect.objectContaining({
          dimensionName: "市场分析",
          findingsCount: 10,
          wordCount: 2500,
        }),
      );
    });

    it("should persist to database when missionId provided", async () => {
      await service.emitDimensionResearchCompleted(
        "topic-123",
        "技术",
        8,
        1800,
        "mission-456",
      );

      expect(mockPrisma.researchTeamMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageType: "DIMENSION_COMPLETED",
        }),
      });
    });
  });

  describe("emitReportSynthesisStarted", () => {
    it("should transition phases in adapter when missionId provided", async () => {
      await service.emitReportSynthesisStarted("topic-123", "mission-456");

      expect(mockRealtimeAdapter.completePhase).toHaveBeenCalledWith(
        "mission-456",
        "researching",
        "维度研究完成",
      );
      expect(mockRealtimeAdapter.startPhase).toHaveBeenCalledWith(
        "mission-456",
        "synthesizing",
        "开始报告撰写",
      );
    });

    it("should emit REPORT_SYNTHESIS_STARTED event", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitReportSynthesisStarted("topic-123");

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.REPORT_SYNTHESIS_STARTED,
        expect.objectContaining({ message: expect.any(String) }),
      );
    });
  });

  describe("emitReportSynthesisCompleted", () => {
    it("should complete synthesizing phase in adapter when missionId provided", async () => {
      await service.emitReportSynthesisCompleted("topic-123", 5, 10000, "mission-456");

      expect(mockRealtimeAdapter.completePhase).toHaveBeenCalledWith(
        "mission-456",
        "synthesizing",
        "报告撰写完成",
      );
    });

    it("should emit REPORT_SYNTHESIS_COMPLETED event with stats", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitReportSynthesisCompleted("topic-123", 5, 10000);

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.REPORT_SYNTHESIS_COMPLETED,
        expect.objectContaining({
          chapterCount: 5,
          totalWordCount: 10000,
        }),
      );
    });
  });

  describe("getTeamMessages", () => {
    it("should query and return messages in chronological order", async () => {
      const msgs = [
        { id: "1", createdAt: new Date("2024-01-01") },
        { id: "2", createdAt: new Date("2024-01-02") },
      ];
      // findMany returns in desc order (as the service queries)
      mockPrisma.researchTeamMessage.findMany.mockResolvedValue([...msgs].reverse());

      const result = await service.getTeamMessages("topic-123");

      expect(mockPrisma.researchTeamMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { topicId: "topic-123" },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      );
      // Result should be reversed to chronological order
      expect(result[0].id).toBe("1");
    });

    it("should apply missionId filter when provided", async () => {
      mockPrisma.researchTeamMessage.findMany.mockResolvedValue([]);

      await service.getTeamMessages("topic-123", {
        missionId: "mission-456",
        limit: 50,
      });

      expect(mockPrisma.researchTeamMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { topicId: "topic-123", missionId: "mission-456" },
          take: 50,
        }),
      );
    });
  });

  describe("getAgentActivities", () => {
    it("should query and return activities in chronological order", async () => {
      const activities = [
        { id: "a1", createdAt: new Date("2024-01-01") },
        { id: "a2", createdAt: new Date("2024-01-02") },
      ];
      mockPrisma.researchAgentActivity = {
        ...mockPrisma.researchAgentActivity,
        findMany: jest.fn().mockResolvedValue([...activities].reverse()),
      } as any;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ResearchEventEmitterService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: EventEmitter2, useValue: mockEventEmitter2 },
          { provide: ResearchRealtimeAdapter, useValue: mockRealtimeAdapter },
        ],
      }).compile();

      const svc = module.get<ResearchEventEmitterService>(
        ResearchEventEmitterService,
      );

      const result = await svc.getAgentActivities("topic-123");

      expect(result[0].id).toBe("a1");
    });
  });

  describe("getLeaderConversationHistory", () => {
    it("should return formatted conversation history", async () => {
      mockPrisma.researchTeamMessage.findMany.mockResolvedValue([
        {
          messageType: "USER_MESSAGE",
          content: "What is the market size?",
          createdAt: new Date("2024-01-01"),
        },
        {
          messageType: "LEADER_RESPONSE",
          content: "The market size is $50B",
          createdAt: new Date("2024-01-02"),
        },
      ].reverse()); // Service will reverse these

      const history = await service.getLeaderConversationHistory("topic-123");

      expect(history[0].role).toBe("user");
      expect(history[0].content).toBe("What is the market size?");
      expect(history[1].role).toBe("assistant");
      expect(history[1].content).toBe("The market size is $50B");
    });

    it("should apply missionId filter and maxTurns limit", async () => {
      mockPrisma.researchTeamMessage.findMany.mockResolvedValue([]);

      await service.getLeaderConversationHistory("topic-123", "mission-456", 5);

      expect(mockPrisma.researchTeamMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            topicId: "topic-123",
            missionId: "mission-456",
            messageType: { in: ["USER_MESSAGE", "LEADER_RESPONSE"] },
          }),
          take: 10, // maxTurns * 2
        }),
      );
    });
  });

  describe("emitTaskStarted / emitTaskProgress / emitTaskCompleted", () => {
    it("should emit task started event", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      const taskData = {
        taskId: "t-001",
        taskType: "research",
        title: "Research dimension",
        status: "running",
        progress: 0,
      };

      await service.emitTaskStarted("topic-123", taskData);

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.TASK_STARTED,
        expect.objectContaining({ taskId: "t-001" }),
      );
    });

    it("should emit task progress event", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      const taskData = {
        taskId: "t-001",
        taskType: "research",
        title: "Research dimension",
        status: "running",
        progress: 50,
      };

      await service.emitTaskProgress("topic-123", taskData);

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.TASK_PROGRESS,
        expect.objectContaining({ progress: 50 }),
      );
    });

    it("should emit task completed event", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      const taskData = {
        taskId: "t-001",
        taskType: "research",
        title: "Research dimension",
        status: "completed",
        progress: 100,
      };

      await service.emitTaskCompleted("topic-123", taskData);

      expect(handler).toHaveBeenCalledWith(
        "topic-123",
        ResearchEventType.TASK_COMPLETED,
        expect.objectContaining({ taskId: "t-001" }),
      );
    });
  });
});
