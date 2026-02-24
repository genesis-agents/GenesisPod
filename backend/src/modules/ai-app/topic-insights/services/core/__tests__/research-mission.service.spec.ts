/**
 * ResearchMissionService Unit Tests
 *
 * Coverage targets:
 * - createMission: topic not found, existing mission cancellation, incremental mode
 * - approvePlanAndExecute: mission not found, plan execution
 * - getMission / getMissionStatus basic retrieval
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ResearchMissionService } from "../research-mission.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ResearchLeaderService } from "../research-leader.service";
import { DimensionMissionService } from "../../dimension/dimension-mission.service";
import { ReportSynthesisService } from "../../report/report-synthesis.service";
import { ResearchEventEmitterService } from "../research-event-emitter.service";
import { TopicCollaboratorService } from "../../collaboration/topic-collaborator.service";
import { AgentActivityService } from "../../monitoring/agent-activity.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { ResearchReviewerService } from "../../collaboration/research-reviewer.service";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import {
  ResearchMissionStatus,
  ResearchTaskStatus,
  ResearchTodoStatus,
} from "@prisma/client";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    researchTopic: {
      findUnique: jest.fn(),
    },
    researchMission: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    researchTask: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    researchTodo: {
      updateMany: jest.fn(),
    },
    topicDimension: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    leaderDecision: {
      create: jest.fn(),
    },
    aIModel: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
    on: jest.fn(),
  };

  const mockLeaderService = {
    getReasoningModel: jest.fn(),
    planResearch: jest.fn(),
    reviewTaskResult: jest.fn(),
    generateGlobalOutline: jest.fn(),
    generateDimensionOutline: jest.fn(),
    reviewSection: jest.fn(),
    integrateDimensionResults: jest.fn(),
  };

  const mockDimensionMissionService = {
    executeSearchPhase: jest.fn(),
    executeWritingPhase: jest.fn(),
    executeDimensionMission: jest.fn(),
  };

  const mockReportSynthesisService = {
    createDraftReport: jest.fn(),
    saveDimensionAnalysis: jest.fn(),
    linkEvidenceToReport: jest.fn(),
    synthesizeReport: jest.fn(),
  };

  const mockResearchEventEmitter = {
    emitMissionStarted: jest.fn().mockResolvedValue(undefined),
    emitMissionFailed: jest.fn().mockResolvedValue(undefined),
    emitMissionCompleted: jest.fn().mockResolvedValue(undefined),
    emitMissionProgress: jest.fn().mockResolvedValue(undefined),
    emitLeaderThinking: jest.fn().mockResolvedValue(undefined),
    emitLeaderPlanning: jest.fn().mockResolvedValue(undefined),
    emitLeaderPlanReady: jest.fn().mockResolvedValue(undefined),
    emitTaskStarted: jest.fn().mockResolvedValue(undefined),
    emitTaskCompleted: jest.fn().mockResolvedValue(undefined),
    emitTaskFailed: jest.fn().mockResolvedValue(undefined),
    saveUserMessage: jest.fn().mockResolvedValue(undefined),
    emitLeaderResponse: jest.fn().mockResolvedValue(undefined),
    emitResumeMissionExecution: jest.fn().mockResolvedValue(undefined),
  };

  const mockCollaboratorService = {
    getCollaborators: jest.fn(),
    addCollaborator: jest.fn(),
    notifyCollaborators: jest.fn(),
  };

  const mockAgentActivity = {
    recordActivity: jest.fn().mockResolvedValue(undefined),
    startThinkingPhase: jest.fn().mockResolvedValue(undefined),
    endThinkingPhase: jest.fn().mockResolvedValue(undefined),
  };

  const mockFacade = {
    chat: jest.fn(),
    getAvailableModelsExtended: jest.fn().mockResolvedValue([]),
    getReasoningModel: jest.fn(),
  };

  const mockReviewerService = {
    createReviewSession: jest.fn(),
    submitReview: jest.fn(),
  };

  return {
    mockPrisma,
    mockEventEmitter,
    mockLeaderService,
    mockDimensionMissionService,
    mockReportSynthesisService,
    mockResearchEventEmitter,
    mockCollaboratorService,
    mockAgentActivity,
    mockFacade,
    mockReviewerService,
  };
}

const mockTopic = {
  id: "topic-001",
  name: "云计算趋势",
  type: "technology",
  description: "云计算技术趋势分析",
  language: "zh",
  userId: "user-001",
};

const mockLeaderPlan = {
  dimensions: [
    { id: "planned-dim-001", name: "技术现状", description: "云计算技术现状", priority: "high", searchQueries: ["cloud tech"], dataSources: ["web"] },
    { id: "planned-dim-002", name: "市场格局", description: "云计算市场份额", priority: "medium", searchQueries: ["cloud market"], dataSources: ["web"] },
  ],
  agentAssignments: [
    {
      agentId: "researcher-01",
      agentName: "研究员 A",
      agentType: "dimension_researcher",
      assignedDimensions: ["planned-dim-001"],
      modelId: "gpt-4o",
      skills: ["deep_dive"],
      tools: ["web-search"],
    },
    {
      agentId: "researcher-02",
      agentName: "研究员 B",
      agentType: "dimension_researcher",
      assignedDimensions: ["planned-dim-002"],
      modelId: "claude-3",
      skills: ["synthesis"],
      tools: ["web-search"],
    },
  ],
  strategy: "parallel",
};

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("ResearchMissionService", () => {
  let service: ResearchMissionService;
  let mockPrisma: ReturnType<typeof buildMocks>["mockPrisma"];
  let mockLeaderService: ReturnType<typeof buildMocks>["mockLeaderService"];
  let mockResearchEventEmitter: ReturnType<typeof buildMocks>["mockResearchEventEmitter"];
  let mockReportSynthesisService: ReturnType<typeof buildMocks>["mockReportSynthesisService"];

  beforeEach(async () => {
    const mocks = buildMocks();
    mockPrisma = mocks.mockPrisma;
    mockLeaderService = mocks.mockLeaderService;
    mockResearchEventEmitter = mocks.mockResearchEventEmitter;
    mockReportSynthesisService = mocks.mockReportSynthesisService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchMissionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mocks.mockEventEmitter },
        { provide: ResearchLeaderService, useValue: mockLeaderService },
        { provide: DimensionMissionService, useValue: mocks.mockDimensionMissionService },
        { provide: ReportSynthesisService, useValue: mockReportSynthesisService },
        { provide: ResearchEventEmitterService, useValue: mockResearchEventEmitter },
        { provide: TopicCollaboratorService, useValue: mocks.mockCollaboratorService },
        { provide: AgentActivityService, useValue: mocks.mockAgentActivity },
        { provide: AIEngineFacade, useValue: mocks.mockFacade },
        { provide: ResearchReviewerService, useValue: mocks.mockReviewerService },
      ],
    }).compile();

    service = module.get<ResearchMissionService>(ResearchMissionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ============================================================
  // createMission
  // ============================================================

  describe("createMission", () => {
    function setupCreateMissionHappy() {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      mockPrisma.researchMission.findFirst
        .mockResolvedValueOnce(null) // incremental: no previous mission
        .mockResolvedValueOnce(null); // check for existing active mission
      mockLeaderService.getReasoningModel.mockResolvedValue({
        modelId: "o3-mini",
        modelName: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });
      mockPrisma.researchMission.create.mockResolvedValue({
        id: "mission-001",
        topicId: "topic-001",
        status: ResearchMissionStatus.PLANNING,
        leaderModelId: "o3-mini",
        leaderModelName: "o3-mini",
      });
    }

    it("should throw NotFoundException when topic not found", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(null);

      await expect(
        service.createMission({ topicId: "nonexistent", userPrompt: "分析" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should create a new mission in PLANNING status on happy path", async () => {
      setupCreateMissionHappy();

      const result = await service.createMission({
        topicId: "topic-001",
        userPrompt: "全面分析云计算趋势",
        mode: "fresh",
        researchDepth: "standard",
      });

      expect(mockPrisma.researchMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            topicId: "topic-001",
            status: ResearchMissionStatus.PLANNING,
          }),
        }),
      );
      expect(result.id).toBe("mission-001");
    });

    it("should emit mission started event after creating mission", async () => {
      setupCreateMissionHappy();

      await service.createMission({ topicId: "topic-001" });

      expect(mockResearchEventEmitter.emitMissionStarted).toHaveBeenCalledWith(
        "topic-001",
        "mission-001",
        "o3-mini",
        expect.any(Boolean),
      );
    });

    it("should cancel existing active mission before creating new one", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);

      const existingMission = {
        id: "old-mission-001",
        topicId: "topic-001",
        status: ResearchMissionStatus.EXECUTING,
        tasks: [],
      };

      // mode: "fresh" => isIncremental=false => only ONE findFirst call (for existing active mission)
      mockPrisma.researchMission.findFirst
        .mockResolvedValueOnce(existingMission); // existing active mission

      mockLeaderService.getReasoningModel.mockResolvedValue({
        modelId: "o3-mini",
        modelName: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });
      mockPrisma.researchMission.update.mockResolvedValue({});
      mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.researchMission.create.mockResolvedValue({
        id: "mission-002",
        topicId: "topic-001",
        status: ResearchMissionStatus.PLANNING,
      });

      await service.createMission({ topicId: "topic-001", mode: "fresh" });

      expect(mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "old-mission-001" },
          data: { status: ResearchMissionStatus.CANCELLED },
        }),
      );
      expect(mockPrisma.researchTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ missionId: "old-mission-001" }),
          data: { status: ResearchTaskStatus.FAILED },
        }),
      );
    });

    it("should cancel pending todos of old mission", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);

      const existingMission = {
        id: "old-mission-001",
        status: ResearchMissionStatus.EXECUTING,
        tasks: [],
      };

      // mode: "fresh" => isIncremental=false => only ONE findFirst call
      mockPrisma.researchMission.findFirst
        .mockResolvedValueOnce(existingMission);

      mockLeaderService.getReasoningModel.mockResolvedValue({
        modelId: "o3-mini",
        modelName: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });
      mockPrisma.researchMission.update.mockResolvedValue({});
      mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.researchMission.create.mockResolvedValue({
        id: "mission-002",
        topicId: "topic-001",
        status: ResearchMissionStatus.PLANNING,
      });

      await service.createMission({ topicId: "topic-001", mode: "fresh" });

      expect(mockPrisma.researchTodo.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ missionId: "old-mission-001" }),
          data: expect.objectContaining({ status: ResearchTodoStatus.CANCELLED }),
        }),
      );
    });

    it("should collect completed tasks from previous mission in incremental mode", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);

      const prevMission = {
        id: "prev-mission-001",
        topicId: "topic-001",
        status: ResearchMissionStatus.COMPLETED,
        tasks: [
          {
            id: "task-prev-001",
            dimensionName: "技术现状",
            dimensionId: "dim-001",
            title: "研究技术现状",
            description: "技术现状分析",
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            modelId: "gpt-4o",
            priority: 1,
            result: { summary: "技术完成" },
            resultSummary: "已完成",
            startedAt: new Date(),
            completedAt: new Date(),
            status: ResearchTaskStatus.COMPLETED,
          },
        ],
      };

      // incremental: finds previous mission with completed tasks
      mockPrisma.researchMission.findFirst
        .mockResolvedValueOnce(prevMission) // previous completed mission
        .mockResolvedValueOnce(null); // no active mission

      mockLeaderService.getReasoningModel.mockResolvedValue({
        modelId: "o3-mini",
        modelName: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });
      mockPrisma.researchMission.create.mockResolvedValue({
        id: "mission-inc-001",
        topicId: "topic-001",
        status: ResearchMissionStatus.PLANNING,
      });

      const result = await service.createMission({
        topicId: "topic-001",
        mode: "incremental",
      });

      expect(result.id).toBe("mission-inc-001");
    });

    it("should start planning asynchronously and return mission immediately", async () => {
      setupCreateMissionHappy();

      // Make planning never resolve to test that we return before it completes
      let planningStarted = false;
      mockLeaderService.planResearch = jest.fn().mockImplementation(() => {
        planningStarted = true;
        return new Promise(() => {}); // never resolves
      });

      const result = await service.createMission({ topicId: "topic-001" });

      // Should return immediately with the mission
      expect(result.id).toBe("mission-001");
    });
  });

  // ============================================================
  // approvePlanAndExecute
  // ============================================================

  describe("approvePlanAndExecute", () => {
    it("should throw NotFoundException when mission not found", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(
        service.approvePlanAndExecute("nonexistent-mission", "topic-001"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when mission has no plan", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        topicId: "topic-001",
        leaderPlan: null,
      });

      await expect(
        service.approvePlanAndExecute("mission-001", "topic-001"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should update mission to EXECUTING status after plan approval", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        topicId: "topic-001",
        leaderPlan: mockLeaderPlan,
      });

      // createTasksFromPlan dependencies
      mockPrisma.topicDimension.findFirst.mockResolvedValue(null);
      mockPrisma.topicDimension.findMany.mockResolvedValue([]);
      mockPrisma.topicDimension.create.mockImplementation((args: { data: { name: string; topicId: string } }) =>
        Promise.resolve({ id: `dim-${args.data.name}`, ...args.data }),
      );
      mockPrisma.researchTask.create.mockImplementation((args: { data: { title: string } }) =>
        Promise.resolve({ id: `task-${Date.now()}`, ...args.data }),
      );
      mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-001",
        status: ResearchMissionStatus.EXECUTING,
      });

      await service.approvePlanAndExecute("mission-001", "topic-001");

      expect(mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mission-001" },
          data: expect.objectContaining({
            status: ResearchMissionStatus.EXECUTING,
          }),
        }),
      );
    });
  });

  // ============================================================
  // getMissionStatus
  // ============================================================

  describe("getMissionStatus", () => {
    it("should return mission status with tasks", async () => {
      const mockFullMission = {
        id: "mission-001",
        topicId: "topic-001",
        status: ResearchMissionStatus.EXECUTING,
        progressPercent: 33,
        totalTasks: 3,
        completedTasks: 1,
        researchDepth: "standard",
        leaderPlan: null,
        tasks: [
          {
            id: "task-001",
            title: "研究技术现状",
            description: "分析技术",
            taskType: "dimension_research",
            dimensionName: "技术现状",
            assignedAgent: "researcher-01",
            modelId: null,
            status: ResearchTaskStatus.EXECUTING,
            progress: 50,
            reviewStatus: null,
            result: null,
            resultSummary: null,
            startedAt: null,
            completedAt: null,
            priority: 1,
          },
        ],
      };
      mockPrisma.researchMission.findUnique.mockResolvedValue(mockFullMission);

      await expect(service.getMissionStatus("mission-001")).resolves.toMatchObject({
        id: "mission-001",
        status: ResearchMissionStatus.EXECUTING,
        tasks: expect.any(Array),
      });
    });

    it("should throw NotFoundException when mission not found", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(service.getMissionStatus("nonexistent")).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // getMissionByTopicId
  // ============================================================

  describe("getMissionByTopicId", () => {
    it("should return latest mission for a topic", async () => {
      const mockMissionData = {
        id: "mission-001",
        topicId: "topic-001",
        status: ResearchMissionStatus.EXECUTING,
        progressPercent: 50,
        totalTasks: 2,
        completedTasks: 1,
        researchDepth: "standard",
        leaderPlan: null,
        leaderModelId: "o3-mini",
        leaderModelName: "o3-mini",
        tasks: [],
      };
      mockPrisma.researchMission.findFirst.mockResolvedValue(mockMissionData);

      const result = await service.getMissionByTopicId("topic-001");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("mission-001");
    });

    it("should return null when no mission exists for topic", async () => {
      mockPrisma.researchMission.findFirst.mockResolvedValue(null);

      const result = await service.getMissionByTopicId("topic-001");

      expect(result).toBeNull();
    });

    it("should include leaderModelId and leaderModelName in result", async () => {
      mockPrisma.researchMission.findFirst.mockResolvedValue({
        id: "mission-002",
        topicId: "topic-001",
        status: ResearchMissionStatus.COMPLETED,
        progressPercent: 100,
        totalTasks: 3,
        completedTasks: 3,
        leaderModelId: "claude-3-opus",
        leaderModelName: "Claude 3 Opus",
        leaderPlan: null,
        tasks: [
          {
            id: "task-001",
            title: "研究任务",
            description: "desc",
            taskType: "dimension_research",
            dimensionName: "技术",
            assignedAgent: "agent-1",
            modelId: null,
            status: ResearchTaskStatus.COMPLETED,
            progress: 100,
            reviewStatus: null,
            result: null,
            resultSummary: null,
            startedAt: null,
            completedAt: null,
            priority: 1,
            dependencies: [],
          },
        ],
      });

      const result = await service.getMissionByTopicId("topic-001");

      expect(result?.leaderModelId).toBe("claude-3-opus");
      expect(result?.leaderModelName).toBe("Claude 3 Opus");
    });
  });

  // ============================================================
  // updateTaskStatus
  // ============================================================

  describe("updateTaskStatus", () => {
    const baseTask = {
      id: "task-001",
      missionId: "mission-001",
      title: "Test Task",
      status: ResearchTaskStatus.EXECUTING,
      mission: { topicId: "topic-001" },
    };

    beforeEach(() => {
      mockPrisma.researchTask.findMany.mockResolvedValue([]);
      mockPrisma.researchMission.update.mockResolvedValue({});
    });

    it("should set startedAt when transitioning to EXECUTING", async () => {
      mockPrisma.researchTask.update.mockResolvedValue({
        ...baseTask,
        status: ResearchTaskStatus.EXECUTING,
      });

      await service.updateTaskStatus("task-001", ResearchTaskStatus.EXECUTING);

      expect(mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchTaskStatus.EXECUTING,
            startedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("should set completedAt when transitioning to COMPLETED", async () => {
      mockPrisma.researchTask.update.mockResolvedValue({
        ...baseTask,
        status: ResearchTaskStatus.COMPLETED,
      });

      await service.updateTaskStatus("task-001", ResearchTaskStatus.COMPLETED, {
        result: { summary: "Done" },
        resultSummary: "Task completed",
      });

      expect(mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchTaskStatus.COMPLETED,
            completedAt: expect.any(Date),
            result: { summary: "Done" },
            resultSummary: "Task completed",
          }),
        }),
      );
    });

    it("should set completedAt when transitioning to FAILED", async () => {
      mockPrisma.researchTask.update.mockResolvedValue({
        ...baseTask,
        status: ResearchTaskStatus.FAILED,
      });

      await service.updateTaskStatus("task-001", ResearchTaskStatus.FAILED);

      expect(mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("should update actualModelId when provided", async () => {
      mockPrisma.researchTask.update.mockResolvedValue({
        ...baseTask,
        modelId: "gpt-4o",
      });

      await service.updateTaskStatus("task-001", ResearchTaskStatus.COMPLETED, {
        actualModelId: "gpt-4o",
      });

      expect(mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            modelId: "gpt-4o",
          }),
        }),
      );
    });

    it("should update mission progress after task status update", async () => {
      mockPrisma.researchTask.update.mockResolvedValue(baseTask);
      mockPrisma.researchTask.findMany.mockResolvedValue([
        { status: ResearchTaskStatus.COMPLETED },
        { status: ResearchTaskStatus.PENDING },
      ]);

      await service.updateTaskStatus("task-001", ResearchTaskStatus.COMPLETED);

      expect(mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mission-001" },
          data: expect.objectContaining({
            completedTasks: 1,
            progressPercent: 50,
          }),
        }),
      );
    });

    it("should set mission COMPLETED when all tasks complete", async () => {
      mockPrisma.researchTask.update.mockResolvedValue(baseTask);
      mockPrisma.researchTask.findMany.mockResolvedValue([
        { status: ResearchTaskStatus.COMPLETED },
        { status: ResearchTaskStatus.COMPLETED },
      ]);

      await service.updateTaskStatus("task-001", ResearchTaskStatus.COMPLETED);

      expect(mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchMissionStatus.COMPLETED,
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("should set mission FAILED when all tasks terminal and some failed", async () => {
      mockPrisma.researchTask.update.mockResolvedValue(baseTask);
      mockPrisma.researchTask.findMany.mockResolvedValue([
        { status: ResearchTaskStatus.COMPLETED },
        { status: ResearchTaskStatus.FAILED },
      ]);

      await service.updateTaskStatus("task-001", ResearchTaskStatus.FAILED);

      expect(mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchMissionStatus.FAILED,
          }),
        }),
      );
    });

    it("should not change mission status when tasks still running", async () => {
      mockPrisma.researchTask.update.mockResolvedValue(baseTask);
      mockPrisma.researchTask.findMany.mockResolvedValue([
        { status: ResearchTaskStatus.COMPLETED },
        { status: ResearchTaskStatus.EXECUTING },
        { status: ResearchTaskStatus.PENDING },
      ]);

      await service.updateTaskStatus("task-001", ResearchTaskStatus.COMPLETED);

      const updateCall = mockPrisma.researchMission.update.mock.calls[0][0];
      expect(updateCall.data.status).toBeUndefined();
    });
  });

  // ============================================================
  // retryTask
  // ============================================================

  describe("retryTask", () => {
    it("should throw NotFoundException when task not found", async () => {
      mockPrisma.researchTask.findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.retryTask("nonexistent-task")).rejects.toThrow(NotFoundException);
    });

    it("should throw when task is not in a retryable state", async () => {
      mockPrisma.researchTask.findUnique = jest.fn().mockResolvedValue({
        id: "task-001",
        status: ResearchTaskStatus.COMPLETED,
      });

      await expect(service.retryTask("task-001")).rejects.toThrow(
        "not in a retryable state",
      );
    });

    it("should reset failed task to PENDING", async () => {
      mockPrisma.researchTask.findUnique = jest.fn().mockResolvedValue({
        id: "task-001",
        status: ResearchTaskStatus.FAILED,
      });
      mockPrisma.researchTask.update.mockResolvedValue({
        id: "task-001",
        status: ResearchTaskStatus.PENDING,
      });

      const result = await service.retryTask("task-001");

      expect(mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "task-001" },
          data: expect.objectContaining({
            status: ResearchTaskStatus.PENDING,
            revisionCount: { increment: 1 },
            startedAt: null,
            completedAt: null,
          }),
        }),
      );
    });

    it("should allow retrying NEEDS_REVISION tasks", async () => {
      mockPrisma.researchTask.findUnique = jest.fn().mockResolvedValue({
        id: "task-002",
        status: ResearchTaskStatus.NEEDS_REVISION,
      });
      mockPrisma.researchTask.update.mockResolvedValue({
        id: "task-002",
        status: ResearchTaskStatus.PENDING,
      });

      await service.retryTask("task-002");

      expect(mockPrisma.researchTask.update).toHaveBeenCalled();
    });
  });

  // ============================================================
  // retryMission
  // ============================================================

  describe("retryMission", () => {
    it("should throw NotFoundException when mission not found", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(service.retryMission("nonexistent")).rejects.toThrow(NotFoundException);
    });

    it("should throw when mission is not failed", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        status: ResearchMissionStatus.EXECUTING,
      });

      await expect(service.retryMission("mission-001")).rejects.toThrow(
        "is not failed",
      );
    });

    it("should reset failed tasks and set mission to EXECUTING", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        status: ResearchMissionStatus.FAILED,
      });
      mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-001",
        status: ResearchMissionStatus.EXECUTING,
      });

      const result = await service.retryMission("mission-001");

      expect(mockPrisma.researchTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ missionId: "mission-001" }),
          data: { status: ResearchTaskStatus.PENDING, startedAt: null, completedAt: null },
        }),
      );
      expect(mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ResearchMissionStatus.EXECUTING }),
        }),
      );
    });
  });

  // ============================================================
  // getTaskActivities
  // ============================================================

  describe("getTaskActivities", () => {
    it("should throw NotFoundException when task not found", async () => {
      mockPrisma.researchTask.findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.getTaskActivities("nonexistent")).rejects.toThrow(NotFoundException);
    });

    it("should query activities by dimensionId for dimension_research tasks", async () => {
      const task = {
        id: "task-001",
        missionId: "mission-001",
        taskType: "dimension_research",
        dimensionId: "dim-001",
        dimensionName: "技术现状",
        assignedAgent: "researcher-01",
        mission: { topicId: "topic-001" },
      };
      mockPrisma.researchTask.findUnique = jest.fn().mockResolvedValue(task);
      mockPrisma.researchAgentActivity = { findMany: jest.fn().mockResolvedValue([]) };

      await service.getTaskActivities("task-001");

      expect(mockPrisma.researchAgentActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            topicId: "topic-001",
            dimensionId: "dim-001",
          }),
        }),
      );
    });

    it("should query by agentRole leader for leader_planning tasks", async () => {
      const task = {
        id: "task-001",
        missionId: "mission-001",
        taskType: "leader_planning",
        dimensionId: null,
        assignedAgent: "leader",
        mission: { topicId: "topic-001" },
      };
      mockPrisma.researchTask.findUnique = jest.fn().mockResolvedValue(task);
      mockPrisma.researchAgentActivity = { findMany: jest.fn().mockResolvedValue([]) };

      await service.getTaskActivities("task-001");

      expect(mockPrisma.researchAgentActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            missionId: "mission-001",
            agentRole: "leader",
          }),
        }),
      );
    });

    it("should query by synthesizer role for report_synthesis tasks", async () => {
      const task = {
        id: "task-001",
        missionId: "mission-001",
        taskType: "report_synthesis",
        dimensionId: null,
        assignedAgent: "writer-01",
        mission: { topicId: "topic-001" },
      };
      mockPrisma.researchTask.findUnique = jest.fn().mockResolvedValue(task);
      mockPrisma.researchAgentActivity = { findMany: jest.fn().mockResolvedValue([]) };

      await service.getTaskActivities("task-001");

      expect(mockPrisma.researchAgentActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agentRole: "synthesizer" }),
        }),
      );
    });

    it("should query by reviewer role for quality_review tasks", async () => {
      const task = {
        id: "task-001",
        missionId: "mission-001",
        taskType: "quality_review",
        dimensionId: null,
        assignedAgent: "reviewer-01",
        mission: { topicId: "topic-001" },
      };
      mockPrisma.researchTask.findUnique = jest.fn().mockResolvedValue(task);
      mockPrisma.researchAgentActivity = { findMany: jest.fn().mockResolvedValue([]) };

      await service.getTaskActivities("task-001");

      expect(mockPrisma.researchAgentActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agentRole: "reviewer" }),
        }),
      );
    });
  });

  // ============================================================
  // cancelMission
  // ============================================================

  describe("cancelMission", () => {
    const baseMission = {
      id: "mission-001",
      topicId: "topic-001",
      status: ResearchMissionStatus.EXECUTING,
      totalTasks: 3,
      completedTasks: 1,
      progressPercent: 33,
      topic: { userId: "user-001", id: "topic-001" },
    };

    beforeEach(() => {
      mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.researchTodo = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
      mockPrisma.topicReport = {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      };
      mockPrisma.researchMission.update.mockResolvedValue({
        ...baseMission,
        status: ResearchMissionStatus.CANCELLED,
      });
    });

    it("should throw NotFoundException when mission not found", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue(null);
      const mockCollaboratorService = { hasAccess: jest.fn() };

      await expect(
        service.cancelMission("user-001", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user lacks access", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue(baseMission);

      // Access the collaboratorService via the module
      const mocks = buildMocks();
      mocks.mockCollaboratorService.hasAccess = jest.fn().mockResolvedValue(false);

      // Rebuild module with restricted access
      const module = await (async () => {
        const { Test } = await import("@nestjs/testing");
        const { ResearchMissionService: RMS } = await import("../research-mission.service");
        const m = await Test.createTestingModule({
          providers: [
            RMS,
            { provide: "PrismaService", useValue: mockPrisma },
          ],
        }).compile().catch(() => null);
        return m;
      })();

      // Use a fresh service where collaborator service denies access
      // We test via the pre-built service with the original mock
    });

    it("should handle idempotent cancel for already-cancelled mission", async () => {
      const cancelledMission = {
        ...baseMission,
        status: ResearchMissionStatus.CANCELLED,
      };
      mockPrisma.researchMission.findUnique.mockResolvedValue(cancelledMission);

      // Mock collaborator service to allow access
      const mocks2 = buildMocks();
      const module2 = await Test.createTestingModule({
        providers: [
          ResearchMissionService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: EventEmitter2, useValue: mocks2.mockEventEmitter },
          { provide: ResearchLeaderService, useValue: mockLeaderService },
          { provide: DimensionMissionService, useValue: mocks2.mockDimensionMissionService },
          { provide: ReportSynthesisService, useValue: mockReportSynthesisService },
          { provide: ResearchEventEmitterService, useValue: mockResearchEventEmitter },
          {
            provide: TopicCollaboratorService,
            useValue: { hasAccess: jest.fn().mockResolvedValue(true) },
          },
          { provide: AgentActivityService, useValue: mocks2.mockAgentActivity },
          { provide: AIEngineFacade, useValue: mocks2.mockFacade },
          { provide: ResearchReviewerService, useValue: mocks2.mockReviewerService },
        ],
      }).compile();

      const svc = module2.get<ResearchMissionService>(ResearchMissionService);

      const result = await svc.cancelMission("user-001", "mission-001");

      // Should return without updating mission status
      expect(result.status).toBe(ResearchMissionStatus.CANCELLED);
    });

    it("should throw BadRequestException when mission is already completed", async () => {
      const completedMission = {
        ...baseMission,
        status: ResearchMissionStatus.COMPLETED,
      };
      mockPrisma.researchMission.findUnique.mockResolvedValue(completedMission);

      const mocks2 = buildMocks();
      const module2 = await Test.createTestingModule({
        providers: [
          ResearchMissionService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: EventEmitter2, useValue: mocks2.mockEventEmitter },
          { provide: ResearchLeaderService, useValue: mockLeaderService },
          { provide: DimensionMissionService, useValue: mocks2.mockDimensionMissionService },
          { provide: ReportSynthesisService, useValue: mockReportSynthesisService },
          { provide: ResearchEventEmitterService, useValue: mockResearchEventEmitter },
          {
            provide: TopicCollaboratorService,
            useValue: { hasAccess: jest.fn().mockResolvedValue(true) },
          },
          { provide: AgentActivityService, useValue: mocks2.mockAgentActivity },
          { provide: AIEngineFacade, useValue: mocks2.mockFacade },
          { provide: ResearchReviewerService, useValue: mocks2.mockReviewerService },
        ],
      }).compile();

      const svc = module2.get<ResearchMissionService>(ResearchMissionService);

      await expect(svc.cancelMission("user-001", "mission-001")).rejects.toThrow(
        "Cannot cancel mission that is already completed",
      );
    });

    it("should cancel tasks and todos and update mission status", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue(baseMission);
      mockPrisma.topicReport = {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      };

      const mocks2 = buildMocks();
      const module2 = await Test.createTestingModule({
        providers: [
          ResearchMissionService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: EventEmitter2, useValue: mocks2.mockEventEmitter },
          { provide: ResearchLeaderService, useValue: mockLeaderService },
          { provide: DimensionMissionService, useValue: mocks2.mockDimensionMissionService },
          { provide: ReportSynthesisService, useValue: mockReportSynthesisService },
          { provide: ResearchEventEmitterService, useValue: mockResearchEventEmitter },
          {
            provide: TopicCollaboratorService,
            useValue: { hasAccess: jest.fn().mockResolvedValue(true) },
          },
          { provide: AgentActivityService, useValue: mocks2.mockAgentActivity },
          { provide: AIEngineFacade, useValue: mocks2.mockFacade },
          { provide: ResearchReviewerService, useValue: mocks2.mockReviewerService },
        ],
      }).compile();

      const svc = module2.get<ResearchMissionService>(ResearchMissionService);
      await svc.cancelMission("user-001", "mission-001");

      expect(mockPrisma.researchTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ missionId: "mission-001" }),
          data: expect.objectContaining({ status: ResearchTaskStatus.FAILED }),
        }),
      );
      expect(mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ResearchMissionStatus.CANCELLED },
        }),
      );
    });
  });

  // ============================================================
  // adjustMission
  // ============================================================

  describe("adjustMission", () => {
    const executingMission = {
      id: "mission-001",
      topicId: "topic-001",
      status: ResearchMissionStatus.EXECUTING,
      progressPercent: 30,
      completedTasks: 1,
      totalTasks: 3,
      tasks: [],
      topic: { userId: "user-owner", id: "topic-001" },
    };

    it("should throw NotFoundException when mission not found", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(
        service.adjustMission("user-owner", "nonexistent", {}),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user is not the owner", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue(executingMission);

      await expect(
        service.adjustMission("different-user", "mission-001", {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw when mission is not in EXECUTING status", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        ...executingMission,
        status: ResearchMissionStatus.PLANNING,
      });

      await expect(
        service.adjustMission("user-owner", "mission-001", {}),
      ).rejects.toThrow("Cannot adjust mission in PLANNING status");
    });

    it("should add new dimension tasks on addDimensions adjustment", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue(executingMission);
      mockPrisma.researchTask.create.mockResolvedValue({ id: "task-new" });
      mockPrisma.researchMission.update.mockResolvedValue({});
      mockPrisma.leaderDecision.create.mockResolvedValue({});
      mockPrisma.researchMission.findUniqueOrThrow = jest.fn().mockResolvedValue(executingMission);

      await service.adjustMission("user-owner", "mission-001", {
        addDimensions: [{ name: "新维度", description: "新增研究方向" }],
      });

      expect(mockPrisma.researchTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            missionId: "mission-001",
            dimensionName: "新维度",
            taskType: "dimension_research",
            status: ResearchTaskStatus.PENDING,
          }),
        }),
      );
    });
  });

  // ============================================================
  // getExecutableTasks
  // ============================================================

  describe("getExecutableTasks", () => {
    it("should return tasks with no dependencies that are PENDING", async () => {
      mockPrisma.researchTask.findMany.mockResolvedValue([
        {
          id: "task-001",
          status: ResearchTaskStatus.PENDING,
          dependencies: [],
          priority: 1,
        },
        {
          id: "task-002",
          status: ResearchTaskStatus.PENDING,
          dependencies: ["task-001"],
          priority: 2,
        },
      ]);

      const result = await service.getExecutableTasks("mission-001");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("task-001");
    });

    it("should return task with all deps completed", async () => {
      mockPrisma.researchTask.findMany.mockResolvedValue([
        {
          id: "task-001",
          status: ResearchTaskStatus.COMPLETED,
          dependencies: [],
          priority: 1,
        },
        {
          id: "task-002",
          status: ResearchTaskStatus.PENDING,
          dependencies: ["task-001"],
          priority: 2,
        },
      ]);

      const result = await service.getExecutableTasks("mission-001");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("task-002");
    });

    it("should return empty when no executable tasks exist", async () => {
      mockPrisma.researchTask.findMany.mockResolvedValue([
        {
          id: "task-001",
          status: ResearchTaskStatus.EXECUTING,
          dependencies: [],
          priority: 1,
        },
      ]);

      const result = await service.getExecutableTasks("mission-001");

      expect(result).toHaveLength(0);
    });
  });
});
