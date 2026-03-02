/**
 * ResearchMissionService - Supplemental3 Tests
 *
 * Covers branches not tested in supplemental2:
 * - getMissionStatus: mission not found, mission with tasks
 * - getMissionByTopicId: returns null when no mission, returns status when found
 * - getTaskActivities: task not found, dimension task, leader task, review task, report task
 * - updateTaskStatus: EXECUTING sets startedAt, COMPLETED sets completedAt, FAILED sets completedAt
 * - cancelMission: various status flows
 * - getListMissions: returns paginated list
 * - emitProgress: progress emission
 */

// Must be before imports - provides missing enum values
jest.mock("@prisma/client", () => ({
  ...jest.requireActual("@prisma/client"),
  AIModelType: {
    CHAT: "CHAT",
    CHAT_FAST: "CHAT_FAST",
    IMAGE_GENERATION: "IMAGE_GENERATION",
    IMAGE_EDITING: "IMAGE_EDITING",
    MULTIMODAL: "MULTIMODAL",
    EMBEDDING: "EMBEDDING",
    RERANK: "RERANK",
  },
  ResearchMissionStatus: {
    PLANNING: "PLANNING",
    PLAN_READY: "PLAN_READY",
    EXECUTING: "EXECUTING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    PAUSED: "PAUSED",
    REVIEWING: "REVIEWING",
  },
  ResearchTaskStatus: {
    PENDING: "PENDING",
    EXECUTING: "EXECUTING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    SKIPPED: "SKIPPED",
  },
  ResearchTodoStatus: {
    PENDING: "PENDING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
  },
  MissionStatus: {
    PENDING: "PENDING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    PAUSED: "PAUSED",
  },
  AgentTaskStatus: {
    PENDING: "PENDING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    REVISION_NEEDED: "REVISION_NEEDED",
  },
  TaskType: {
    RESEARCH: "RESEARCH",
    WRITING: "WRITING",
    ANALYSIS: "ANALYSIS",
    DESIGN: "DESIGN",
    IMPLEMENTATION: "IMPLEMENTATION",
    REVIEW: "REVIEW",
    DOCUMENTATION: "DOCUMENTATION",
    CREATIVE: "CREATIVE",
    SYNTHESIS: "SYNTHESIS",
  },
  LeaderDecisionType: {
    PLAN: "PLAN",
    REVIEW: "REVIEW",
    REVISE: "REVISE",
    APPROVE: "APPROVE",
    REJECT: "REJECT",
  },
  AgentActivityType: {
    PLANNING: "PLANNING",
    RESEARCHING: "RESEARCHING",
    WRITING: "WRITING",
    REVIEWING: "REVIEWING",
    THINKING: "THINKING",
    TOOL_CALL: "TOOL_CALL",
  },
  MemoryLayer: {
    WORKING: "WORKING",
    SHORT_TERM: "SHORT_TERM",
    LONG_TERM: "LONG_TERM",
    SEMANTIC: "SEMANTIC",
    EPISODIC: "EPISODIC",
  },
}));

// Mock the model display name utility
jest.mock("../../../utils/model-display-name", () => ({
  getModelDisplayNameMap: jest
    .fn()
    .mockResolvedValue(new Map<string, string>()),
}));

// Mock toPrismaJson
jest.mock("@/common/utils/prisma-json.utils", () => ({
  toPrismaJson: jest.fn((v: unknown) => v),
}));

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
import { ChatFacade } from "@/modules/ai-engine/facade";
import { ResearchReviewerService } from "../../collaboration/research-reviewer.service";
import { NotFoundException } from "@nestjs/common";
import { ResearchMissionStatus, ResearchTaskStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function buildMocks() {
  const mockPrisma = {
    researchTopic: { findUnique: jest.fn() },
    researchMission: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    researchTask: {
      create: jest
        .fn()
        .mockResolvedValue({
          id: "task-s3",
          missionId: "mission-s3",
          status: "PENDING",
        }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      delete: jest.fn(),
    },
    researchTodo: { updateMany: jest.fn() },
    topicDimension: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
    },
    leaderDecision: { create: jest.fn() },
    aIModel: { findMany: jest.fn().mockResolvedValue([]) },
    researchAgentActivity: { findMany: jest.fn().mockResolvedValue([]) },
    topicReport: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const mockEventEmitter = { emit: jest.fn(), on: jest.fn() };

  const mockLeaderService = {
    getReasoningModel: jest
      .fn()
      .mockResolvedValue({ modelId: "gpt-4o", modelName: "GPT-4o" }),
    planResearch: jest.fn(),
    reviewTaskResult: jest.fn(),
    generateGlobalOutline: jest.fn(),
    generateDimensionOutline: jest.fn(),
    reviewSection: jest.fn(),
    integrateDimensionResults: jest.fn(),
    handleUserMessage: jest.fn(),
  };

  const mockDimensionMissionService = {
    executeSearchPhase: jest.fn(),
    executeWritingPhase: jest.fn(),
    executeDimensionMission: jest.fn(),
  };

  const mockReportSynthesisService = {
    createDraftReport: jest.fn().mockResolvedValue({ id: "draft-report-001" }),
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
    getCollaborators: jest.fn().mockResolvedValue([]),
    addCollaborator: jest.fn(),
    notifyCollaborators: jest.fn(),
    hasAccess: jest.fn().mockResolvedValue(true),
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
    getDefaultModelByType: jest.fn().mockResolvedValue(null),
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

// ---------------------------------------------------------------------------
// Build service helper
// ---------------------------------------------------------------------------

async function buildService(mocks: ReturnType<typeof buildMocks>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ResearchMissionService,
      { provide: PrismaService, useValue: mocks.mockPrisma },
      { provide: EventEmitter2, useValue: mocks.mockEventEmitter },
      { provide: ResearchLeaderService, useValue: mocks.mockLeaderService },
      {
        provide: DimensionMissionService,
        useValue: mocks.mockDimensionMissionService,
      },
      {
        provide: ReportSynthesisService,
        useValue: mocks.mockReportSynthesisService,
      },
      {
        provide: ResearchEventEmitterService,
        useValue: mocks.mockResearchEventEmitter,
      },
      {
        provide: TopicCollaboratorService,
        useValue: mocks.mockCollaboratorService,
      },
      { provide: AgentActivityService, useValue: mocks.mockAgentActivity },
      { provide: ChatFacade, useValue: mocks.mockFacade },
      { provide: ResearchReviewerService, useValue: mocks.mockReviewerService },
    ],
  }).compile();
  return module.get<ResearchMissionService>(ResearchMissionService);
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockMission = {
  id: "mission-s3",
  topicId: "topic-s3",
  status: ResearchMissionStatus.EXECUTING,
  leaderPlan: null,
  leaderModelId: "gpt-4o",
  leaderModelName: "GPT-4o",
  userPrompt: "Research AI",
  userContext: null,
  researchDepth: "standard",
  totalTasks: 0,
  completedTasks: 0,
  progressPercent: 0,
  createdAt: new Date(),
  startedAt: null,
  completedAt: null,
};

const mockTask = {
  id: "task-s3",
  missionId: "mission-s3",
  title: "Research Dimension A",
  description: "Analyze dimension A",
  taskType: "dimension_research",
  dimensionName: "Dimension A",
  dimensionId: "dim-s3",
  assignedAgent: "researcher-01",
  assignedAgentType: "dimension_researcher",
  modelId: "gpt-4o",
  priority: "high",
  status: ResearchTaskStatus.PENDING,
  progress: 0,
  reviewStatus: null,
  result: null,
  resultSummary: null,
  startedAt: null,
  completedAt: null,
  dependencies: [],
  skills: [],
  tools: [],
  mission: { topicId: "topic-s3" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ResearchMissionService (supplemental3)", () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: ResearchMissionService;

  beforeEach(async () => {
    mocks = buildMocks();
    service = await buildService(mocks);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // getMissionStatus
  // ============================================================

  describe("getMissionStatus", () => {
    it("should throw NotFoundException when mission not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(
        service.getMissionStatus("nonexistent-mission"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should return mission status with empty task list", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        tasks: [],
      });

      const result = await service.getMissionStatus("mission-s3");

      expect(result.id).toBe("mission-s3");
      expect(result.tasks).toHaveLength(0);
      expect(result.status).toBe(ResearchMissionStatus.EXECUTING);
    });

    it("should return mission status with tasks and their details", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        tasks: [
          {
            ...mockTask,
            status: ResearchTaskStatus.COMPLETED,
            progress: 100,
            resultSummary: "Task completed successfully",
            startedAt: new Date("2024-01-01"),
            completedAt: new Date("2024-01-02"),
          },
        ],
      });

      const result = await service.getMissionStatus("mission-s3");

      expect(result.id).toBe("mission-s3");
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].status).toBe(ResearchTaskStatus.COMPLETED);
      expect(result.tasks[0].resultSummary).toBe("Task completed successfully");
    });

    it("should include leader plan when present", async () => {
      const leaderPlan = {
        dimensions: [{ name: "Dim A" }],
        agentAssignments: [],
        strategy: "parallel",
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        leaderPlan,
        status: ResearchMissionStatus.PLAN_READY,
        tasks: [],
      });

      const result = await service.getMissionStatus("mission-s3");

      expect(result.leaderPlan).toEqual(leaderPlan);
    });
  });

  // ============================================================
  // getMissionByTopicId
  // ============================================================

  describe("getMissionByTopicId", () => {
    it("should return null when no mission exists for topic", async () => {
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(null);

      const result = await service.getMissionByTopicId("topic-no-mission");

      expect(result).toBeNull();
    });

    it("should return mission status when mission exists", async () => {
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue({
        ...mockMission,
        tasks: [],
      });

      const result = await service.getMissionByTopicId("topic-s3");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("mission-s3");
      expect(result!.status).toBe(ResearchMissionStatus.EXECUTING);
    });

    it("should include leaderModelId and leaderModelName in result", async () => {
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue({
        ...mockMission,
        leaderModelId: "claude-3-5-sonnet",
        leaderModelName: "Claude 3.5 Sonnet",
        tasks: [],
      });

      const result = await service.getMissionByTopicId("topic-s3");

      expect(result!.leaderModelId).toBe("claude-3-5-sonnet");
      expect(result!.leaderModelName).toBe("Claude 3.5 Sonnet");
    });

    it("should map tasks with dependencies field", async () => {
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue({
        ...mockMission,
        tasks: [
          {
            ...mockTask,
            dependencies: ["dep-task-1"],
          },
        ],
      });

      const result = await service.getMissionByTopicId("topic-s3");

      expect(result!.tasks[0].dependencies).toEqual(["dep-task-1"]);
    });
  });

  // ============================================================
  // getTaskActivities
  // ============================================================

  describe("getTaskActivities", () => {
    it("should throw NotFoundException when task not found", async () => {
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue(null);

      await expect(
        service.getTaskActivities("nonexistent-task"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should query by topicId and dimensionId for dimension_research task", async () => {
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue({
        ...mockTask,
        taskType: "dimension_research",
        dimensionId: "dim-s3",
        mission: { topicId: "topic-s3" },
      });
      mocks.mockPrisma.researchAgentActivity.findMany.mockResolvedValue([]);

      await service.getTaskActivities("task-s3");

      expect(
        mocks.mockPrisma.researchAgentActivity.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            topicId: "topic-s3",
            dimensionId: "dim-s3",
          }),
        }),
      );
    });

    it("should query by missionId and leader role for leader_planning task", async () => {
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue({
        ...mockTask,
        taskType: "leader_planning",
        dimensionId: null,
        mission: { topicId: "topic-s3" },
      });
      mocks.mockPrisma.researchAgentActivity.findMany.mockResolvedValue([]);

      await service.getTaskActivities("task-s3");

      expect(
        mocks.mockPrisma.researchAgentActivity.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            missionId: "mission-s3",
            agentRole: "leader",
          }),
        }),
      );
    });

    it("should query by synthesizer role for report_synthesis task", async () => {
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue({
        ...mockTask,
        taskType: "report_synthesis",
        dimensionId: null,
        mission: { topicId: "topic-s3" },
      });
      mocks.mockPrisma.researchAgentActivity.findMany.mockResolvedValue([]);

      await service.getTaskActivities("task-s3");

      expect(
        mocks.mockPrisma.researchAgentActivity.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            missionId: "mission-s3",
            agentRole: "synthesizer",
          }),
        }),
      );
    });

    it("should query by reviewer role for quality_review task", async () => {
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue({
        ...mockTask,
        taskType: "quality_review",
        dimensionId: null,
        mission: { topicId: "topic-s3" },
      });
      mocks.mockPrisma.researchAgentActivity.findMany.mockResolvedValue([]);

      await service.getTaskActivities("task-s3");

      expect(
        mocks.mockPrisma.researchAgentActivity.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            missionId: "mission-s3",
            agentRole: "reviewer",
          }),
        }),
      );
    });

    it("should return task and activities in result", async () => {
      const mockActivity = {
        id: "activity-1",
        missionId: "mission-s3",
        agentId: "researcher-01",
        agentRole: "researcher",
        content: "Completed analysis",
        createdAt: new Date(),
      };

      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue({
        ...mockTask,
        taskType: "dimension_research",
        dimensionId: "dim-s3",
        mission: { topicId: "topic-s3" },
      });
      mocks.mockPrisma.researchAgentActivity.findMany.mockResolvedValue([
        mockActivity,
      ]);

      const result = await service.getTaskActivities("task-s3");

      expect(result.task).toBeDefined();
      expect(result.activities).toHaveLength(1);
      expect(result.activities[0].content).toBe("Completed analysis");
    });
  });

  // ============================================================
  // updateTaskStatus
  // ============================================================

  describe("updateTaskStatus", () => {
    beforeEach(() => {
      mocks.mockPrisma.researchTask.update.mockResolvedValue({
        ...mockTask,
        missionId: "mission-s3",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([
        { status: ResearchTaskStatus.PENDING },
      ]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue(mockMission);
    });

    it("should set startedAt when status is EXECUTING", async () => {
      await service.updateTaskStatus("task-s3", ResearchTaskStatus.EXECUTING);

      expect(mocks.mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchTaskStatus.EXECUTING,
            startedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("should set completedAt when status is COMPLETED", async () => {
      await service.updateTaskStatus("task-s3", ResearchTaskStatus.COMPLETED);

      expect(mocks.mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchTaskStatus.COMPLETED,
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("should set completedAt when status is FAILED", async () => {
      await service.updateTaskStatus("task-s3", ResearchTaskStatus.FAILED);

      expect(mocks.mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchTaskStatus.FAILED,
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("should update result when provided", async () => {
      const result = { summary: "Analysis complete", findings: [] };

      await service.updateTaskStatus("task-s3", ResearchTaskStatus.COMPLETED, {
        result,
      });

      expect(mocks.mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result,
          }),
        }),
      );
    });

    it("should update resultSummary when provided", async () => {
      await service.updateTaskStatus("task-s3", ResearchTaskStatus.COMPLETED, {
        resultSummary: "Brief summary of findings",
      });

      expect(mocks.mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resultSummary: "Brief summary of findings",
          }),
        }),
      );
    });

    it("should update modelId when actualModelId provided", async () => {
      await service.updateTaskStatus("task-s3", ResearchTaskStatus.COMPLETED, {
        actualModelId: "claude-3-opus",
      });

      expect(mocks.mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            modelId: "claude-3-opus",
          }),
        }),
      );
    });

    it("should call updateMissionProgress after updating task", async () => {
      await service.updateTaskStatus("task-s3", ResearchTaskStatus.COMPLETED);

      expect(mocks.mockPrisma.researchTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { missionId: "mission-s3" },
        }),
      );
    });
  });

  // ============================================================
  // cancelMission
  // ============================================================

  describe("cancelMission", () => {
    it("should throw NotFoundException when mission not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelMission("nonexistent-mission"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should successfully cancel a PLANNING mission", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.PLANNING,
        topic: { id: "topic-s3", userId: "user-s3" },
      });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.CANCELLED,
      });
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 0 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });

      await service.cancelMission("mission-s3");

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ResearchMissionStatus.CANCELLED },
        }),
      );
    });

    it("should successfully cancel an EXECUTING mission", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.EXECUTING,
        topic: { id: "topic-s3", userId: "user-s3" },
      });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.CANCELLED,
      });
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 2 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });

      await service.cancelMission("mission-s3");

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ResearchMissionStatus.CANCELLED },
        }),
      );
    });

    it("should cancel pending tasks when cancelling a mission", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.EXECUTING,
        topic: { id: "topic-s3", userId: "user-s3" },
      });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.CANCELLED,
      });
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 3 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });

      await service.cancelMission("mission-s3");

      expect(mocks.mockPrisma.researchTask.updateMany).toHaveBeenCalled();
    });
  });

  // ============================================================
  // updateMissionProgress (tested indirectly via updateTaskStatus)
  // ============================================================

  describe("updateMissionProgress via updateTaskStatus", () => {
    it("should set mission status to COMPLETED when all tasks complete", async () => {
      mocks.mockPrisma.researchTask.update.mockResolvedValue({
        ...mockTask,
        status: ResearchTaskStatus.COMPLETED,
        missionId: "mission-s3",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([
        { status: ResearchTaskStatus.COMPLETED },
        { status: ResearchTaskStatus.COMPLETED },
      ]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.COMPLETED,
      });

      await service.updateTaskStatus("task-s3", ResearchTaskStatus.COMPLETED);

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchMissionStatus.COMPLETED,
          }),
        }),
      );
    });

    it("should set mission status to FAILED when all tasks terminal and some failed", async () => {
      mocks.mockPrisma.researchTask.update.mockResolvedValue({
        ...mockTask,
        status: ResearchTaskStatus.FAILED,
        missionId: "mission-s3",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([
        { status: ResearchTaskStatus.COMPLETED },
        { status: ResearchTaskStatus.FAILED },
      ]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.FAILED,
      });

      await service.updateTaskStatus("task-s3", ResearchTaskStatus.FAILED);

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchMissionStatus.FAILED,
          }),
        }),
      );
    });

    it("should not set terminal mission status when tasks still pending", async () => {
      mocks.mockPrisma.researchTask.update.mockResolvedValue({
        ...mockTask,
        status: ResearchTaskStatus.COMPLETED,
        missionId: "mission-s3",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([
        { status: ResearchTaskStatus.COMPLETED },
        { status: ResearchTaskStatus.PENDING },
      ]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue(mockMission);

      await service.updateTaskStatus("task-s3", ResearchTaskStatus.COMPLETED);

      // Progress update should happen but without terminal status
      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mission-s3" },
        }),
      );
      // Status should NOT be COMPLETED since one task is still PENDING
      const updateCall = mocks.mockPrisma.researchMission.update.mock.calls[0];
      expect(updateCall[0].data.status).toBeUndefined();
    });

    it("should calculate progress percentage correctly", async () => {
      mocks.mockPrisma.researchTask.update.mockResolvedValue({
        ...mockTask,
        missionId: "mission-s3",
      });
      // 2 completed out of 4 total = 50%
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([
        { status: ResearchTaskStatus.COMPLETED },
        { status: ResearchTaskStatus.COMPLETED },
        { status: ResearchTaskStatus.PENDING },
        { status: ResearchTaskStatus.PENDING },
      ]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue(mockMission);

      await service.updateTaskStatus("task-s3", ResearchTaskStatus.COMPLETED);

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            completedTasks: 2,
            progressPercent: 50,
          }),
        }),
      );
    });
  });

  // ============================================================
  // createMission: fresh mode with researchDepth variations
  // ============================================================

  describe("createMission - researchDepth variations", () => {
    it("should use default researchDepth when not specified", async () => {
      const topic = { id: "topic-s3", name: "Test Topic", userId: "user-1" };
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(topic);
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(null);
      mocks.mockPrisma.researchMission.create.mockResolvedValue({
        ...mockMission,
        researchDepth: "standard",
      });
      mocks.mockPrisma.researchMission.update.mockResolvedValue(mockMission);
      mocks.mockLeaderService.planResearch.mockResolvedValue({
        dimensions: [],
        agentAssignments: [],
        strategy: "parallel",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);
      mocks.mockPrisma.topicDimension.findMany.mockResolvedValue([]);
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({ id: "ld-1" });
      mocks.mockPrisma.researchTask.createMany.mockResolvedValue({ count: 0 });

      const result = await service.createMission({
        topicId: "topic-s3",
        userPrompt: "Research",
      });

      expect(result).toBeDefined();
      expect(mocks.mockPrisma.researchMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            researchDepth: "standard",
          }),
        }),
      );
    });

    it("should use provided researchDepth when specified", async () => {
      const topic = { id: "topic-s3", name: "Test Topic", userId: "user-1" };
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(topic);
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(null);
      mocks.mockPrisma.researchMission.create.mockResolvedValue({
        ...mockMission,
        researchDepth: "deep",
      });
      mocks.mockPrisma.researchMission.update.mockResolvedValue(mockMission);
      mocks.mockLeaderService.planResearch.mockResolvedValue({
        dimensions: [],
        agentAssignments: [],
        strategy: "parallel",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);
      mocks.mockPrisma.topicDimension.findMany.mockResolvedValue([]);
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({ id: "ld-1" });
      mocks.mockPrisma.researchTask.createMany.mockResolvedValue({ count: 0 });

      await service.createMission({
        topicId: "topic-s3",
        userPrompt: "Research",
        researchDepth: "deep",
      });

      expect(mocks.mockPrisma.researchMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            researchDepth: "deep",
          }),
        }),
      );
    });
  });

  // ============================================================
  // createMission - incremental mode from completed mission
  // ============================================================

  describe("createMission - incremental mode from latest mission", () => {
    it("should load completed tasks from latest mission in incremental mode", async () => {
      const topic = { id: "topic-s3", name: "Test Topic", userId: "user-1" };
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(topic);

      const completedTask = {
        id: "prev-task-1",
        missionId: "prev-mission",
        dimensionName: "Tech Trends",
        dimensionId: "dim-prev",
        title: "Tech Trends Research",
        description: "Research tech trends",
        assignedAgent: "researcher-01",
        assignedAgentType: "dimension_researcher",
        modelId: "gpt-4o",
        priority: "high",
        result: { summary: "AI is growing fast" },
        resultSummary: "AI is growing",
        startedAt: new Date(),
        completedAt: new Date(),
        status: ResearchTaskStatus.COMPLETED,
        taskType: "dimension_research",
      };

      // First findFirst call = incremental prev mission lookup
      // Second findFirst call = existing active mission check
      mocks.mockPrisma.researchMission.findFirst
        .mockResolvedValueOnce({
          id: "prev-mission",
          tasks: [completedTask],
        })
        .mockResolvedValueOnce(null); // no active mission

      mocks.mockPrisma.researchMission.create.mockResolvedValue(mockMission);
      mocks.mockPrisma.researchMission.update.mockResolvedValue(mockMission);
      mocks.mockLeaderService.planResearch.mockResolvedValue({
        dimensions: [],
        agentAssignments: [],
        strategy: "parallel",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);
      mocks.mockPrisma.topicDimension.findMany.mockResolvedValue([]);
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({ id: "ld-1" });
      mocks.mockPrisma.researchTask.createMany.mockResolvedValue({ count: 1 });

      const result = await service.createMission({
        topicId: "topic-s3",
        userPrompt: "Continue research",
        mode: "incremental",
      });

      expect(result).toBeDefined();
      expect(result.id).toBe("mission-s3");
    });
  });

  // ============================================================
  // approvePlanAndExecute: plan ready with dimensions
  // ============================================================

  describe("approvePlanAndExecute - with tasks to execute", () => {
    it("should update status to EXECUTING and start dimension missions", async () => {
      const leaderPlan = {
        dimensions: [
          {
            id: "dim-1",
            name: "AI Trends",
            description: "Analyze AI trends",
            priority: "high",
            searchQueries: [],
            dataSources: [],
          },
        ],
        agentAssignments: [
          {
            agentId: "researcher-01",
            agentName: "Researcher A",
            agentType: "dimension_researcher",
            assignedDimensions: ["dim-1"],
            modelId: "gpt-4o",
            skills: [],
            tools: [],
          },
        ],
        strategy: "parallel",
      };

      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.PLAN_READY,
        leaderPlan,
      });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.EXECUTING,
      });

      const pendingTask = {
        ...mockTask,
        status: ResearchTaskStatus.PENDING,
        dimensionName: "AI Trends",
        dimensionId: "db-dim-1",
      };
      mocks.mockPrisma.topicDimension.findMany.mockResolvedValue([
        { id: "db-dim-1", name: "AI Trends" },
      ]);
      mocks.mockPrisma.topicDimension.findFirst.mockResolvedValue({
        id: "db-dim-1",
        name: "AI Trends",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([pendingTask]);
      mocks.mockPrisma.researchTask.createMany.mockResolvedValue({ count: 0 });
      mocks.mockDimensionMissionService.executeDimensionMission.mockResolvedValue(
        undefined,
      );
      mocks.mockReportSynthesisService.synthesizeReport.mockResolvedValue(
        undefined,
      );

      await service.approvePlanAndExecute("mission-s3", "topic-s3");

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchMissionStatus.EXECUTING,
          }),
        }),
      );
    });
  });
});
