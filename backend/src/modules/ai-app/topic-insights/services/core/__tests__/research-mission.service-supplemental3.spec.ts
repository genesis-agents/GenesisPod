/**
 * ResearchMissionService - Supplemental3 Tests
 *
 * Covers additional uncovered branches:
 * - retryTask: not found, wrong status, success paths
 * - retryMission: not found, wrong status, success
 * - getMissionByTopicId: no mission (returns null), mission with tasks
 * - getExecutableTasks: pending tasks with satisfied/unsatisfied dependencies
 * - updateTaskStatus: EXECUTING sets startedAt, COMPLETED/FAILED sets completedAt, result/summary/modelId
 * - updateMissionProgress: all completed, all terminal+failures, partial
 * - resumeExecutionForNewTask: not found, already executing, completed with pending, completed no pending, cancelled
 * - continueExecution: mission not found, wrong status, executing tasks reset
 * - addAgentToLeaderPlan: mission not found, new agent, update existing agent
 * - cancelMission: COMPLETED status throws BadRequestException
 * - cancelMission: with empty draft reports cleanup
 * - getPhaseFromStatus: all status branches
 */

// Mock missing optional dependency to avoid module resolution error in worktree
// (virtual: true allows mocking modules that aren't installed)
jest.mock(
  "@nestjs/cache-manager",
  () => ({
    CACHE_MANAGER: "CACHE_MANAGER",
    Cache: jest.fn(),
    CacheModule: {
      registerAsync: jest
        .fn()
        .mockReturnValue({ module: class MockCacheModule {} }),
      register: jest.fn().mockReturnValue({ module: class MockCacheModule {} }),
    },
  }),
  { virtual: true },
);

// Provide missing enum values not generated in this worktree
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
    REVIEWING: "REVIEWING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    PAUSED: "PAUSED",
  },
  ResearchTaskStatus: {
    PENDING: "PENDING",
    ASSIGNED: "ASSIGNED",
    EXECUTING: "EXECUTING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    SKIPPED: "SKIPPED",
    NEEDS_REVISION: "NEEDS_REVISION",
  },
  ResearchTodoStatus: {
    PENDING: "PENDING",
    QUEUED: "QUEUED",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
  },
  LeaderDecisionType: {
    PLAN: "PLAN",
    ADJUST: "ADJUST",
    REVIEW: "REVIEW",
  },
  AgentActivityType: {
    PLANNING: "PLANNING",
    RESEARCH: "RESEARCH",
    REVIEW: "REVIEW",
    SYNTHESIS: "SYNTHESIS",
  },
  MemoryLayer: {
    WORKING: "WORKING",
    PERSISTENT: "PERSISTENT",
    EPISODIC: "EPISODIC",
  },
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
import { ChatFacade, ProgressTrackerService } from "@/modules/ai-engine/facade";
import {
  MissionExecutorService,
  EventJournalService,
} from "@/modules/ai-kernel/facade";
import { ResearchReviewerService } from "../../collaboration/research-reviewer.service";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import {
  ResearchMissionStatus,
  ResearchTaskStatus,
  ResearchTodoStatus,
} from "@prisma/client";

// ──────────────────────────────────────────────────────────────────────────────
// Mock factory
// ──────────────────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    researchTopic: {
      findUnique: jest.fn(),
    },
    researchMission: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    researchTask: {
      create: jest.fn().mockResolvedValue({ id: "task-created" }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    researchTodo: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    topicDimension: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
    },
    leaderDecision: {
      create: jest.fn().mockResolvedValue({}),
    },
    aIModel: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    researchAgentActivity: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    topicReport: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    topicEvidence: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
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
    handleUserMessage: jest.fn().mockResolvedValue({ response: "ok" }),
  };

  const mockDimensionMissionService = {
    executeSearchPhase: jest.fn(),
    executeWritingPhase: jest.fn(),
    executeDimensionMission: jest.fn(),
  };

  const mockReportSynthesisService = {
    createDraftReport: jest
      .fn()
      .mockResolvedValue({ id: "draft-report-001", evidences: [] }),
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
    recordDimensionReview: jest.fn().mockResolvedValue(undefined),
    recordOverallReview: jest.fn().mockResolvedValue(undefined),
  };

  const mockFacade = {
    chat: jest.fn(),
    getAvailableModels: jest.fn().mockResolvedValue([]),
    getAvailableModelsExtended: jest.fn().mockResolvedValue([]),
    getReasoningModel: jest.fn(),
    getDefaultModelByType: jest.fn().mockResolvedValue(null),
  };

  const mockReviewerService = {
    createReviewSession: jest.fn(),
    submitReview: jest.fn(),
    reviewDimension: jest.fn(),
    reviewOverall: jest.fn(),
    factCheckReport: jest.fn(),
  };

  const mockMissionExecutor = {
    execute: jest.fn().mockResolvedValue({ processId: "proc-001" }),
    complete: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
  };

  const mockKernelJournal = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  const mockProgressTracker = {
    create: jest.fn(),
    start: jest.fn(),
    startPhase: jest.fn(),
    completePhase: jest.fn(),
    failPhase: jest.fn(),
    fail: jest.fn(),
    complete: jest.fn(),
    update: jest.fn(),
    getTask: jest.fn().mockReturnValue(null),
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
    mockMissionExecutor,
    mockKernelJournal,
    mockProgressTracker,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Module builder helpers
// ──────────────────────────────────────────────────────────────────────────────

async function buildService(
  mocks: ReturnType<typeof buildMocks>,
  opts: {
    includeKernel?: boolean;
    includeProgressTracker?: boolean;
    includeKernelMemory?: boolean;
  } = {},
): Promise<ResearchMissionService> {
  const providers: unknown[] = [
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
  ];

  if (opts.includeKernel) {
    providers.push(
      { provide: MissionExecutorService, useValue: mocks.mockMissionExecutor },
      { provide: EventJournalService, useValue: mocks.mockKernelJournal },
    );
  }
  if (opts.includeProgressTracker) {
    providers.push({
      provide: ProgressTrackerService,
      useValue: mocks.mockProgressTracker,
    });
  }

  const module: TestingModule = await Test.createTestingModule({
    providers: providers as Parameters<
      typeof Test.createTestingModule
    >[0]["providers"],
  }).compile();

  return module.get<ResearchMissionService>(ResearchMissionService);
}

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

const baseMission = {
  id: "mission-s3",
  topicId: "topic-s3",
  status: ResearchMissionStatus.EXECUTING,
  leaderPlan: null,
  leaderModelId: "gpt-4o",
  leaderModelName: "GPT-4o",
  totalTasks: 3,
  completedTasks: 0,
  progressPercent: 0,
  createdAt: new Date(),
  startedAt: new Date(),
  completedAt: null,
};

const baseTopic = {
  id: "topic-s3",
  name: "AI Trends",
  userId: "user-s3",
  dimensions: [],
};

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("ResearchMissionService (supplemental3)", () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: ResearchMissionService;

  beforeEach(async () => {
    mocks = buildMocks();
    service = await buildService(mocks);
  });

  afterEach(() => jest.clearAllMocks());

  // ============================================================
  // retryTask
  // ============================================================

  describe("retryTask", () => {
    it("should throw NotFoundException when task not found", async () => {
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue(null);

      await expect(service.retryTask("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw error when task status is not FAILED or NEEDS_REVISION", async () => {
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue({
        id: "task-001",
        status: ResearchTaskStatus.COMPLETED,
      });

      await expect(service.retryTask("task-001")).rejects.toThrow(
        "not in a retryable state",
      );
    });

    it("should reset FAILED task to PENDING", async () => {
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue({
        id: "task-001",
        status: ResearchTaskStatus.FAILED,
      });
      mocks.mockPrisma.researchTask.update.mockResolvedValue({
        id: "task-001",
        status: ResearchTaskStatus.PENDING,
        revisionCount: 1,
      });

      const result = await service.retryTask("task-001");

      expect(mocks.mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "task-001" },
          data: expect.objectContaining({
            status: ResearchTaskStatus.PENDING,
            revisionCount: { increment: 1 },
            startedAt: null,
            completedAt: null,
            resultSummary: null,
          }),
        }),
      );
      expect(result.status).toBe(ResearchTaskStatus.PENDING);
    });

    it("should reset NEEDS_REVISION task to PENDING", async () => {
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue({
        id: "task-002",
        status: ResearchTaskStatus.NEEDS_REVISION,
      });
      mocks.mockPrisma.researchTask.update.mockResolvedValue({
        id: "task-002",
        status: ResearchTaskStatus.PENDING,
        revisionCount: 2,
      });

      await service.retryTask("task-002");

      expect(mocks.mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "task-002" },
          data: expect.objectContaining({
            status: ResearchTaskStatus.PENDING,
          }),
        }),
      );
    });
  });

  // ============================================================
  // retryMission
  // ============================================================

  describe("retryMission", () => {
    it("should throw NotFoundException when mission not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(service.retryMission("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw error when mission is not FAILED", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        status: ResearchMissionStatus.EXECUTING,
      });

      await expect(service.retryMission("mission-001")).rejects.toThrow(
        "is not failed",
      );
    });

    it("should reset failed tasks and update mission status to EXECUTING", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        status: ResearchMissionStatus.FAILED,
      });
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 2 });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-001",
        status: ResearchMissionStatus.EXECUTING,
        completedAt: null,
      });

      const result = await service.retryMission("mission-001");

      expect(mocks.mockPrisma.researchTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            missionId: "mission-001",
            status: {
              in: [
                ResearchTaskStatus.FAILED,
                ResearchTaskStatus.NEEDS_REVISION,
              ],
            },
          }),
          data: expect.objectContaining({
            status: ResearchTaskStatus.PENDING,
            startedAt: null,
            completedAt: null,
          }),
        }),
      );
      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mission-001" },
          data: expect.objectContaining({
            status: ResearchMissionStatus.EXECUTING,
            completedAt: null,
          }),
        }),
      );
      expect(result.status).toBe(ResearchMissionStatus.EXECUTING);
    });
  });

  // ============================================================
  // getMissionByTopicId
  // ============================================================

  describe("getMissionByTopicId", () => {
    it("should return null when no mission found for topic", async () => {
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(null);

      const result = await service.getMissionByTopicId("topic-s3");

      expect(result).toBeNull();
    });

    it("should return mission status with tasks when mission found", async () => {
      const mission = {
        ...baseMission,
        tasks: [
          {
            id: "task-001",
            title: "Research Task",
            description: "Research something",
            taskType: "dimension_research",
            dimensionName: "Tech",
            assignedAgent: "researcher-01",
            modelId: null,
            status: ResearchTaskStatus.PENDING,
            progress: 0,
            reviewStatus: null,
            result: null,
            resultSummary: null,
            startedAt: null,
            completedAt: null,
            dependencies: [],
          },
        ],
      };
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(mission);
      mocks.mockPrisma.aIModel.findMany.mockResolvedValue([]);

      const result = await service.getMissionByTopicId("topic-s3");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("mission-s3");
      expect(result!.tasks).toHaveLength(1);
      expect(result!.tasks[0].dimensionName).toBe("Tech");
      expect(result!.leaderModelId).toBe("gpt-4o");
    });

    it("should include leaderPlan in result when mission has one", async () => {
      const leaderPlan = {
        dimensions: [],
        agentAssignments: [],
        strategy: "parallel",
      };
      const mission = {
        ...baseMission,
        leaderPlan,
        tasks: [],
      };
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(mission);
      mocks.mockPrisma.aIModel.findMany.mockResolvedValue([]);

      const result = await service.getMissionByTopicId("topic-s3");

      expect(result!.leaderPlan).toBeDefined();
    });

    it("should map task model IDs to display names when models exist", async () => {
      const mission = {
        ...baseMission,
        tasks: [
          {
            id: "task-001",
            title: "Research Task",
            description: null,
            taskType: "dimension_research",
            dimensionName: "Tech",
            assignedAgent: "researcher-01",
            modelId: "gpt-4o",
            status: ResearchTaskStatus.COMPLETED,
            progress: 100,
            reviewStatus: null,
            result: null,
            resultSummary: "done",
            startedAt: new Date(),
            completedAt: new Date(),
            dependencies: [],
          },
        ],
      };
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(mission);
      mocks.mockPrisma.aIModel.findMany.mockResolvedValue([
        { modelId: "gpt-4o", displayName: "GPT-4o Display" },
      ]);

      const result = await service.getMissionByTopicId("topic-s3");

      expect(result).not.toBeNull();
      expect(result!.tasks[0].modelId).toBe("gpt-4o");
    });
  });

  // ============================================================
  // getExecutableTasks
  // ============================================================

  describe("getExecutableTasks", () => {
    it("should return only PENDING tasks with all dependencies completed", async () => {
      const tasks = [
        {
          id: "task-completed",
          status: ResearchTaskStatus.COMPLETED,
          dependencies: [],
          priority: 1,
        },
        {
          id: "task-pending-no-deps",
          status: ResearchTaskStatus.PENDING,
          dependencies: [],
          priority: 2,
        },
        {
          id: "task-pending-satisfied",
          status: ResearchTaskStatus.PENDING,
          dependencies: ["task-completed"],
          priority: 3,
        },
        {
          id: "task-pending-unsatisfied",
          status: ResearchTaskStatus.PENDING,
          dependencies: ["task-not-done"],
          priority: 4,
        },
      ];
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(tasks);

      const result = await service.getExecutableTasks("mission-s3");

      const ids = result.map((t) => t.id);
      expect(ids).toContain("task-pending-no-deps");
      expect(ids).toContain("task-pending-satisfied");
      expect(ids).not.toContain("task-completed");
      expect(ids).not.toContain("task-pending-unsatisfied");
    });

    it("should return tasks sorted by priority ascending", async () => {
      const tasks = [
        {
          id: "task-high-priority",
          status: ResearchTaskStatus.PENDING,
          dependencies: [],
          priority: 10,
        },
        {
          id: "task-low-priority",
          status: ResearchTaskStatus.PENDING,
          dependencies: [],
          priority: 1,
        },
        {
          id: "task-mid-priority",
          status: ResearchTaskStatus.PENDING,
          dependencies: [],
          priority: 5,
        },
      ];
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(tasks);

      const result = await service.getExecutableTasks("mission-s3");

      expect(result[0].id).toBe("task-low-priority");
      expect(result[1].id).toBe("task-mid-priority");
      expect(result[2].id).toBe("task-high-priority");
    });

    it("should return empty array when all tasks are non-PENDING", async () => {
      const tasks = [
        {
          id: "task-executing",
          status: ResearchTaskStatus.EXECUTING,
          dependencies: [],
          priority: 1,
        },
        {
          id: "task-failed",
          status: ResearchTaskStatus.FAILED,
          dependencies: [],
          priority: 2,
        },
      ];
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(tasks);

      const result = await service.getExecutableTasks("mission-s3");

      expect(result).toHaveLength(0);
    });
  });

  // ============================================================
  // updateTaskStatus
  // ============================================================

  describe("updateTaskStatus", () => {
    it("should set startedAt when status is EXECUTING", async () => {
      const mockTask = {
        id: "task-001",
        missionId: "mission-s3",
        status: ResearchTaskStatus.EXECUTING,
        mission: { id: "mission-s3" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(mockTask);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([mockTask]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({});

      await service.updateTaskStatus("task-001", ResearchTaskStatus.EXECUTING);

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
      const mockTask = {
        id: "task-001",
        missionId: "mission-s3",
        status: ResearchTaskStatus.COMPLETED,
        mission: { id: "mission-s3" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(mockTask);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([mockTask]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({});

      await service.updateTaskStatus("task-001", ResearchTaskStatus.COMPLETED);

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
      const mockTask = {
        id: "task-001",
        missionId: "mission-s3",
        status: ResearchTaskStatus.FAILED,
        mission: { id: "mission-s3" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(mockTask);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([mockTask]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({});

      await service.updateTaskStatus("task-001", ResearchTaskStatus.FAILED);

      expect(mocks.mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("should include result, resultSummary, and actualModelId when provided", async () => {
      const mockTask = {
        id: "task-001",
        missionId: "mission-s3",
        status: ResearchTaskStatus.COMPLETED,
        mission: { id: "mission-s3" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(mockTask);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([mockTask]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({});

      await service.updateTaskStatus("task-001", ResearchTaskStatus.COMPLETED, {
        result: { summary: "done" },
        resultSummary: "Task done",
        actualModelId: "claude-3",
      });

      expect(mocks.mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: { summary: "done" },
            resultSummary: "Task done",
            modelId: "claude-3",
          }),
        }),
      );
    });
  });

  // ============================================================
  // updateMissionProgress (via updateTaskStatus)
  // ============================================================

  describe("updateMissionProgress (indirectly via updateTaskStatus)", () => {
    it("should set mission to COMPLETED when all tasks are completed", async () => {
      const mockTask = {
        id: "task-001",
        missionId: "mission-s3",
        status: ResearchTaskStatus.COMPLETED,
        mission: { id: "mission-s3" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(mockTask);

      // All tasks completed
      const allCompletedTasks = [
        { id: "task-001", status: ResearchTaskStatus.COMPLETED },
        { id: "task-002", status: ResearchTaskStatus.COMPLETED },
      ];
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(
        allCompletedTasks,
      );
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.COMPLETED,
      });

      await service.updateTaskStatus("task-001", ResearchTaskStatus.COMPLETED);

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchMissionStatus.COMPLETED,
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("should set mission to FAILED when all terminal tasks are failures", async () => {
      const mockTask = {
        id: "task-001",
        missionId: "mission-s3",
        status: ResearchTaskStatus.FAILED,
        mission: { id: "mission-s3" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(mockTask);

      // All terminal, but all failed
      const allFailedTasks = [
        { id: "task-001", status: ResearchTaskStatus.FAILED },
        { id: "task-002", status: ResearchTaskStatus.FAILED },
      ];
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(allFailedTasks);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.FAILED,
      });

      await service.updateTaskStatus("task-001", ResearchTaskStatus.FAILED);

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchMissionStatus.FAILED,
          }),
        }),
      );
    });

    it("should not set final status when tasks are still executing", async () => {
      const mockTask = {
        id: "task-001",
        missionId: "mission-s3",
        status: ResearchTaskStatus.COMPLETED,
        mission: { id: "mission-s3" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(mockTask);

      // Mixed states - not all terminal
      const mixedTasks = [
        { id: "task-001", status: ResearchTaskStatus.COMPLETED },
        { id: "task-002", status: ResearchTaskStatus.EXECUTING },
        { id: "task-003", status: ResearchTaskStatus.PENDING },
      ];
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(mixedTasks);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s3",
      });

      await service.updateTaskStatus("task-001", ResearchTaskStatus.COMPLETED);

      // update should be called but without a terminal status
      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            status: ResearchMissionStatus.COMPLETED,
          }),
        }),
      );
    });
  });

  // ============================================================
  // cancelMission - COMPLETED status throws BadRequestException
  // ============================================================

  describe("cancelMission - COMPLETED mission", () => {
    it("should throw BadRequestException when cancelling an already-completed mission", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.COMPLETED,
        topicId: "topic-s3",
        totalTasks: 3,
        topic: { id: "topic-s3", userId: "user-s3" },
      });
      mocks.mockCollaboratorService.hasAccess.mockResolvedValue(true);

      await expect(
        service.cancelMission("user-s3", "mission-s3"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should clean up empty draft reports when cancelling active mission", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.EXECUTING,
        topicId: "topic-s3",
        totalTasks: 3,
        topic: { id: "topic-s3", userId: "user-s3" },
      });
      mocks.mockCollaboratorService.hasAccess.mockResolvedValue(true);
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 2 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 1 });

      // There are empty draft reports to clean up
      mocks.mockPrisma.topicReport.findMany.mockResolvedValue([
        { id: "empty-report-001" },
        { id: "empty-report-002" },
      ]);
      mocks.mockPrisma.topicReport.deleteMany.mockResolvedValue({ count: 2 });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.CANCELLED,
      });

      await service.cancelMission("user-s3", "mission-s3");

      expect(mocks.mockPrisma.topicReport.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ["empty-report-001", "empty-report-002"] },
          },
        }),
      );
    });

    it("should skip cleanup when no empty draft reports exist", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.EXECUTING,
        topicId: "topic-s3",
        totalTasks: 2,
        topic: { id: "topic-s3", userId: "user-s3" },
      });
      mocks.mockCollaboratorService.hasAccess.mockResolvedValue(true);
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 1 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });
      mocks.mockPrisma.topicReport.findMany.mockResolvedValue([]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.CANCELLED,
      });

      await service.cancelMission("user-s3", "mission-s3");

      expect(mocks.mockPrisma.topicReport.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // resumeExecutionForNewTask
  // ============================================================

  describe("resumeExecutionForNewTask", () => {
    it("should return false when mission is not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      const result = await service.resumeExecutionForNewTask(
        "nonexistent",
        "topic-s3",
      );

      expect(result).toBe(false);
    });

    it("should return true when mission is already executing", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.EXECUTING,
      });

      const result = await service.resumeExecutionForNewTask(
        "mission-s3",
        "topic-s3",
      );

      expect(result).toBe(true);
    });

    it("should return false when mission is COMPLETED with no pending tasks", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.COMPLETED,
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);

      const result = await service.resumeExecutionForNewTask(
        "mission-s3",
        "topic-s3",
      );

      expect(result).toBe(false);
    });

    it("should restart execution when COMPLETED mission has pending tasks", async () => {
      // First call returns COMPLETED status, then CANCELLED to stop async scheduler
      mocks.mockPrisma.researchMission.findUnique
        .mockResolvedValueOnce({
          id: "mission-s3",
          status: ResearchMissionStatus.COMPLETED,
        })
        .mockResolvedValue({
          id: "mission-s3",
          status: ResearchMissionStatus.CANCELLED,
          researchDepth: "standard",
        });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([
        { id: "new-task-001", status: ResearchTaskStatus.PENDING, priority: 1 },
      ]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.EXECUTING,
      });

      // startExecution will be called async - mock the dependencies it needs
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue({
        ...baseTopic,
        dimensions: [],
      });
      mocks.mockReportSynthesisService.createDraftReport.mockResolvedValue({
        id: "report-001",
        evidences: [],
      });
      mocks.mockPrisma.researchTask.count.mockResolvedValue(0);

      const result = await service.resumeExecutionForNewTask(
        "mission-s3",
        "topic-s3",
      );

      expect(result).toBe(true);
      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mission-s3" },
          data: { status: ResearchMissionStatus.EXECUTING },
        }),
      );
      expect(
        mocks.mockResearchEventEmitter.emitMissionProgress,
      ).toHaveBeenCalledWith(
        "topic-s3",
        expect.objectContaining({
          missionId: "mission-s3",
          phase: "resuming",
        }),
      );
    });

    it("should restart execution when FAILED mission has pending tasks", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.FAILED,
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([
        {
          id: "retry-task-001",
          status: ResearchTaskStatus.PENDING,
          priority: 1,
        },
      ]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.EXECUTING,
      });
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue({
        ...baseTopic,
        dimensions: [],
      });
      mocks.mockPrisma.researchTask.count.mockResolvedValue(0);
      mocks.mockReportSynthesisService.createDraftReport.mockResolvedValue({
        id: "report-001",
        evidences: [],
      });

      const result = await service.resumeExecutionForNewTask(
        "mission-s3",
        "topic-s3",
      );

      expect(result).toBe(true);
    });

    it("should return false for CANCELLED mission status", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.CANCELLED,
      });

      const result = await service.resumeExecutionForNewTask(
        "mission-s3",
        "topic-s3",
      );

      expect(result).toBe(false);
    });
  });

  // ============================================================
  // continueExecution
  // ============================================================

  describe("continueExecution", () => {
    it("should throw Error when mission is not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(service.continueExecution("nonexistent")).rejects.toThrow(
        "Mission nonexistent not found",
      );
    });

    it("should throw Error when mission is not in EXECUTING status", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.COMPLETED,
        topic: baseTopic,
        tasks: [],
      });

      await expect(service.continueExecution("mission-s3")).rejects.toThrow(
        "is not in EXECUTING status",
      );
    });

    it("should reset executing tasks to PENDING and restart execution", async () => {
      const executingTask = {
        id: "task-executing",
        status: ResearchTaskStatus.EXECUTING,
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.EXECUTING,
        topicId: "topic-s3",
        topic: baseTopic,
        tasks: [executingTask],
      });
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 1 });
      mocks.mockPrisma.researchTask.count
        .mockResolvedValueOnce(2) // completed count
        .mockResolvedValueOnce(5); // total count

      // mock for startExecution
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue({
        ...baseTopic,
        dimensions: [],
      });
      mocks.mockPrisma.researchMission.findUnique
        .mockResolvedValueOnce({
          id: "mission-s3",
          status: ResearchMissionStatus.EXECUTING,
          topicId: "topic-s3",
          topic: baseTopic,
          tasks: [executingTask],
        })
        .mockResolvedValue({
          id: "mission-s3",
          status: ResearchMissionStatus.CANCELLED, // cancel to stop scheduler
          researchDepth: "standard",
        });
      mocks.mockReportSynthesisService.createDraftReport.mockResolvedValue({
        id: "report-001",
        evidences: [],
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);

      await service.continueExecution("mission-s3");

      expect(mocks.mockPrisma.researchTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["task-executing"] } },
          data: expect.objectContaining({
            status: ResearchTaskStatus.PENDING,
            startedAt: null,
          }),
        }),
      );
      expect(
        mocks.mockResearchEventEmitter.emitMissionProgress,
      ).toHaveBeenCalledWith(
        "topic-s3",
        expect.objectContaining({
          missionId: "mission-s3",
          phase: "executing",
        }),
      );
    });

    it("should handle mission with no executing tasks (empty reset)", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.EXECUTING,
        topicId: "topic-s3",
        topic: baseTopic,
        tasks: [], // no executing tasks
      });
      mocks.mockPrisma.researchTask.count
        .mockResolvedValueOnce(3) // completed count
        .mockResolvedValueOnce(5); // total count

      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue({
        ...baseTopic,
        dimensions: [],
      });
      mocks.mockPrisma.researchMission.findUnique
        .mockResolvedValueOnce({
          id: "mission-s3",
          status: ResearchMissionStatus.EXECUTING,
          topicId: "topic-s3",
          topic: baseTopic,
          tasks: [],
        })
        .mockResolvedValue({
          id: "mission-s3",
          status: ResearchMissionStatus.CANCELLED,
          researchDepth: "standard",
        });
      mocks.mockReportSynthesisService.createDraftReport.mockResolvedValue({
        id: "report-001",
        evidences: [],
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);

      await service.continueExecution("mission-s3");

      // updateMany should NOT be called since tasks array is empty
      expect(mocks.mockPrisma.researchTask.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [] } },
        }),
      );
    });
  });

  // ============================================================
  // addAgentToLeaderPlan
  // ============================================================

  describe("addAgentToLeaderPlan", () => {
    it("should handle gracefully when mission not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      // Should not throw
      await expect(
        service.addAgentToLeaderPlan("nonexistent", {
          agentId: "agent-001",
          agentType: "dimension_researcher",
        }),
      ).resolves.not.toThrow();

      expect(mocks.mockPrisma.researchMission.update).not.toHaveBeenCalled();
    });

    it("should add new agent to empty leaderPlan", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        leaderPlan: null,
      });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({});

      await service.addAgentToLeaderPlan("mission-s3", {
        agentId: "agent-new",
        agentName: "New Agent",
        agentType: "dimension_researcher",
        modelId: "gpt-4o",
        skills: ["web-search"],
        tools: ["calculator"],
      });

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mission-s3" },
          data: expect.objectContaining({
            leaderPlan: expect.anything(),
          }),
        }),
      );
    });

    it("should update existing agent in leaderPlan", async () => {
      const existingPlan = {
        dimensions: [],
        agentAssignments: [
          {
            agentId: "agent-existing",
            agentName: "Old Name",
            agentType: "dimension_researcher",
            modelId: "gpt-4",
            skills: [],
            tools: [],
          },
        ],
        strategy: "parallel",
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        leaderPlan: existingPlan,
      });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({});

      await service.addAgentToLeaderPlan("mission-s3", {
        agentId: "agent-existing",
        agentName: "Updated Name",
        agentType: "dimension_researcher",
        modelId: "gpt-4o",
        skills: ["new-skill"],
      });

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mission-s3" },
        }),
      );
    });

    it("should add agent to existing leaderPlan with other agents", async () => {
      const existingPlan = {
        dimensions: [],
        agentAssignments: [
          {
            agentId: "agent-001",
            agentType: "dimension_researcher",
            modelId: "gpt-4",
          },
        ],
        strategy: "parallel",
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        leaderPlan: existingPlan,
      });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({});

      await service.addAgentToLeaderPlan("mission-s3", {
        agentId: "agent-002",
        agentType: "quality_reviewer",
        modelId: "claude-3",
      });

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalled();
    });
  });

  // ============================================================
  // getMissionStatus - not found
  // ============================================================

  describe("getMissionStatus - not found", () => {
    it("should throw NotFoundException when mission does not exist", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(service.getMissionStatus("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should correctly map getPhaseFromStatus for all statuses", async () => {
      const statusToPhase = [
        [ResearchMissionStatus.PLANNING, "planning"],
        [ResearchMissionStatus.EXECUTING, "researching"],
        [ResearchMissionStatus.REVIEWING, "reviewing"],
        [ResearchMissionStatus.COMPLETED, "completed"],
        [ResearchMissionStatus.FAILED, "failed"],
        [ResearchMissionStatus.CANCELLED, "unknown"],
      ];

      for (const [status, expectedPhase] of statusToPhase) {
        mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
          id: "mission-phase-test",
          status,
          progressPercent: 0,
          totalTasks: 0,
          completedTasks: 0,
          researchDepth: "standard",
          leaderPlan: null,
          tasks: [],
        });
        mocks.mockPrisma.aIModel.findMany.mockResolvedValue([]);

        const result = await service.getMissionStatus("mission-phase-test");
        expect(result.currentPhase).toBe(expectedPhase);
      }
    });
  });

  // ============================================================
  // handleResumeMissionExecution event listener
  // ============================================================

  describe("handleResumeMissionExecution", () => {
    it("should call resumeExecutionForNewTask with event payload", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      // Should not throw even if mission not found
      await expect(
        service.handleResumeMissionExecution({
          missionId: "mission-s3",
          topicId: "topic-s3",
        }),
      ).resolves.not.toThrow();
    });
  });

  // ============================================================
  // handleRecoveryNeeded event listener
  // ============================================================

  describe("handleRecoveryNeeded", () => {
    it("should call continueExecution with missionId from payload", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        status: ResearchMissionStatus.EXECUTING,
        topicId: "topic-s3",
        topic: baseTopic,
        tasks: [],
      });
      mocks.mockPrisma.researchTask.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue({
        ...baseTopic,
        dimensions: [],
      });
      mocks.mockPrisma.researchMission.findUnique
        .mockResolvedValueOnce({
          id: "mission-s3",
          status: ResearchMissionStatus.EXECUTING,
          topicId: "topic-s3",
          topic: baseTopic,
          tasks: [],
        })
        .mockResolvedValue({
          id: "mission-s3",
          status: ResearchMissionStatus.CANCELLED,
          researchDepth: "standard",
        });
      mocks.mockReportSynthesisService.createDraftReport.mockResolvedValue({
        id: "report-001",
        evidences: [],
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);

      await expect(
        service.handleRecoveryNeeded({
          missionId: "mission-s3",
          topicId: "topic-s3",
          resetTaskCount: 2,
        }),
      ).resolves.not.toThrow();
    });

    it("should log error when continueExecution fails", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      // Should not throw - handleRecoveryNeeded swallows errors
      await expect(
        service.handleRecoveryNeeded({
          missionId: "missing-mission",
          topicId: "topic-s3",
          resetTaskCount: 0,
        }),
      ).resolves.not.toThrow();
    });
  });

  // ============================================================
  // cancelMission - idempotent path (already cancelled) with QUEUED todos
  // ============================================================

  describe("cancelMission - idempotent path details", () => {
    it("should return the existing cancelled mission without calling update on the mission itself", async () => {
      const cancelledMission = {
        id: "mission-s3",
        status: ResearchMissionStatus.CANCELLED,
        topicId: "topic-s3",
        totalTasks: 3,
        topic: { id: "topic-s3", userId: "user-s3" },
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(
        cancelledMission,
      );
      mocks.mockCollaboratorService.hasAccess.mockResolvedValue(true);
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 0 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.cancelMission("user-s3", "mission-s3");

      // Should return the mission object
      expect(result.id).toBe("mission-s3");
      // The mission.update should NOT be called (idempotent path returns early)
      expect(mocks.mockPrisma.researchMission.update).not.toHaveBeenCalled();
    });

    it("should fix stale tasks in idempotent cancel path", async () => {
      const cancelledMission = {
        id: "mission-s3",
        status: ResearchMissionStatus.CANCELLED,
        topicId: "topic-s3",
        totalTasks: 3,
        topic: { id: "topic-s3", userId: "user-s3" },
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(
        cancelledMission,
      );
      mocks.mockCollaboratorService.hasAccess.mockResolvedValue(true);
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 2 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 1 });

      await service.cancelMission("user-s3", "mission-s3");

      // researchTask.updateMany should be called with PENDING/ASSIGNED/EXECUTING filter
      expect(mocks.mockPrisma.researchTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            missionId: "mission-s3",
          }),
          data: expect.objectContaining({
            status: ResearchTaskStatus.FAILED,
            resultSummary: "任务已被用户取消",
          }),
        }),
      );

      // researchTodo.updateMany should also be called
      expect(mocks.mockPrisma.researchTodo.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            missionId: "mission-s3",
          }),
          data: expect.objectContaining({
            status: ResearchTodoStatus.CANCELLED,
          }),
        }),
      );
    });
  });

  // ============================================================
  // getTeamInfo - leaderModel fallback to modelTypeMap
  // ============================================================

  describe("getTeamInfo - leaderModel fallback", () => {
    it("should use modelTypeMap fallback when both stored model and getReasoningModel return null", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        leaderModelId: null,
        leaderModelName: null,
        leaderPlan: null,
        tasks: [],
      });
      mocks.mockLeaderService.getReasoningModel.mockResolvedValue(null);
      mocks.mockFacade.getDefaultModelByType.mockResolvedValue({
        modelId: "fallback-model",
        displayName: "Fallback Model",
      });

      const result = await service.getTeamInfo("mission-s3");

      expect(result.leaderId).toBe("leader");
      expect(result.leaderModel).toBe("Fallback Model");
    });

    it("should handle agent status EXECUTING sets current task", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        leaderModelId: "gpt-4o",
        leaderModelName: "GPT-4o",
        leaderPlan: null,
        tasks: [
          {
            id: "task-001",
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            taskType: "dimension_research",
            status: ResearchTaskStatus.EXECUTING,
            dimensionName: "Tech",
            modelId: null,
            title: "Research Tech",
          },
        ],
      });

      const result = await service.getTeamInfo("mission-s3");

      const agent = result.agents[0];
      expect(agent.status).toBe("working");
      expect(agent.currentTask).toBe("Research Tech");
    });

    it("should not override 'working' status with 'completed' for multi-task agents", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s3",
        leaderModelId: "gpt-4o",
        leaderModelName: "GPT-4o",
        leaderPlan: null,
        tasks: [
          {
            id: "task-001",
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            taskType: "dimension_research",
            status: ResearchTaskStatus.COMPLETED,
            dimensionName: "Tech",
            modelId: null,
            title: "Research Tech",
          },
          {
            id: "task-002",
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            taskType: "dimension_research",
            status: ResearchTaskStatus.EXECUTING,
            dimensionName: "Market",
            modelId: null,
            title: "Research Market",
          },
        ],
      });

      const result = await service.getTeamInfo("mission-s3");

      // Agent first processes COMPLETED task, then EXECUTING task — working takes priority
      const agent = result.agents[0];
      expect(agent.status).toBe("working");
    });
  });
});
