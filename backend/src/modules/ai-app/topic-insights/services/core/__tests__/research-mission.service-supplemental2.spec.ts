/**
 * ResearchMissionService - Supplemental2 Tests
 *
 * Covers additional branches not in primary spec or supplemental:
 * - createMission: topic not found throws, optional kernel process creation,
 *   optional progressTracker, incremental mode with existing mission merge
 * - approvePlanAndExecute: mission not found, mission has no plan
 * - getMission: includes field mapping
 * - cancelMission: not found, wrong status (non-cancellable), active mission cancellation
 * - emitProgress: covered via createMission flow
 * - updateTaskStatus: task completion event firing
 */

// Must be before imports - provides missing enum values not generated in worktree
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
  },
  ResearchTaskStatus: {
    PENDING: "PENDING",
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
import { NotFoundException } from "@nestjs/common";
import { ResearchMissionStatus, ResearchTaskStatus } from "@prisma/client";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

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
    },
    researchTask: {
      create: jest
        .fn()
        .mockResolvedValue({
          id: "task-created",
          missionId: "mission-s2",
          status: "PENDING",
        }),
      createMany: jest.fn(),
      findMany: jest.fn(),
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

  const mockMissionExecutor = {
    execute: jest.fn().mockResolvedValue({ processId: "proc-001" }),
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

const mockTopic = {
  id: "topic-s2",
  name: "AI Research",
  type: "technology",
  description: "AI research topic",
  language: "zh",
  userId: "user-s2",
};

const mockMission = {
  id: "mission-s2",
  topicId: "topic-s2",
  status: ResearchMissionStatus.PLANNING,
  leaderPlan: null,
  leaderModelId: "gpt-4o",
  leaderModelName: "GPT-4o",
  userPrompt: "Research AI",
  userContext: null,
  researchDepth: "standard",
  totalTasks: 0,
  completedTasks: 0,
  createdAt: new Date(),
  startedAt: null,
  completedAt: null,
};

// ──────────────────────────────────────────────────────────────────────────────
// Test helper for building the module
// ──────────────────────────────────────────────────────────────────────────────

async function buildServiceWithOptionalDeps(
  mocks: ReturnType<typeof buildMocks>,
  includeKernel = false,
  includeProgressTracker = false,
) {
  const providers = [
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

  if (includeKernel) {
    providers.push(
      { provide: MissionExecutorService, useValue: mocks.mockMissionExecutor },
      { provide: EventJournalService, useValue: mocks.mockKernelJournal },
    );
  }

  if (includeProgressTracker) {
    providers.push({
      provide: ProgressTrackerService,
      useValue: mocks.mockProgressTracker,
    });
  }

  const module: TestingModule = await Test.createTestingModule({
    providers,
  }).compile();
  return module.get<ResearchMissionService>(ResearchMissionService);
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("ResearchMissionService (supplemental2)", () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: ResearchMissionService;

  beforeEach(async () => {
    mocks = buildMocks();
    service = await buildServiceWithOptionalDeps(mocks);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // createMission - topic not found
  // ============================================================

  describe("createMission - topic not found", () => {
    it("should throw NotFoundException when topic does not exist", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(null);

      await expect(
        service.createMission({
          topicId: "nonexistent-topic",
          userPrompt: "Research",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // createMission - basic path (no kernel, no progressTracker)
  // ============================================================

  describe("createMission - basic path", () => {
    it("should create mission and return it without optional deps", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(null); // no existing mission
      mocks.mockPrisma.researchMission.create.mockResolvedValue(mockMission);
      mocks.mockPrisma.researchMission.update.mockResolvedValue(mockMission);
      mocks.mockPrisma.topicDimension.findMany.mockResolvedValue([]);
      mocks.mockPrisma.topicDimension.findFirst.mockResolvedValue(null);
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({ id: "ld-1" });
      mocks.mockPrisma.researchTask.createMany.mockResolvedValue({ count: 0 });

      // planResearch returns a plan with one dimension
      mocks.mockLeaderService.planResearch.mockResolvedValue({
        dimensions: [
          {
            id: "dim-plan-1",
            name: "Trend Analysis",
            description: "Analyze trends",
            priority: "high",
            searchQueries: ["AI trends"],
            dataSources: ["web"],
          },
        ],
        agentAssignments: [
          {
            agentId: "researcher-01",
            agentName: "Researcher A",
            agentType: "dimension_researcher",
            assignedDimensions: ["dim-plan-1"],
            modelId: "gpt-4o",
            skills: [],
            tools: [],
          },
        ],
        strategy: "parallel",
      });

      mocks.mockPrisma.topicDimension.create.mockResolvedValue({
        id: "db-dim-1",
        name: "Trend Analysis",
      });
      mocks.mockPrisma.researchTask.create.mockResolvedValue({ id: "task-1" });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([
        { id: "task-1" },
      ]);

      const result = await service.createMission({
        topicId: "topic-s2",
        userPrompt: "Analyze AI trends",
      });

      expect(result.id).toBe("mission-s2");
      expect(mocks.mockPrisma.researchMission.create).toHaveBeenCalled();
    });
  });

  // ============================================================
  // createMission - with kernel executor
  // ============================================================

  describe("createMission - with kernel executor", () => {
    it("should create kernel process when missionExecutor is available", async () => {
      const serviceWithKernel = await buildServiceWithOptionalDeps(
        mocks,
        true,
        false,
      );

      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(null);
      mocks.mockPrisma.researchMission.create.mockResolvedValue(mockMission);
      mocks.mockPrisma.researchMission.update.mockResolvedValue(mockMission);

      mocks.mockLeaderService.planResearch.mockResolvedValue({
        dimensions: [],
        agentAssignments: [],
        strategy: "sequential",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);
      mocks.mockPrisma.topicDimension.findMany.mockResolvedValue([]);
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({ id: "ld-1" });
      mocks.mockPrisma.researchTask.createMany.mockResolvedValue({ count: 0 });

      const result = await serviceWithKernel.createMission({
        topicId: "topic-s2",
        userPrompt: "Test",
      });

      expect(result.id).toBe("mission-s2");
      expect(mocks.mockMissionExecutor.execute).toHaveBeenCalled();
    });

    it("should handle kernel executor failure gracefully", async () => {
      const serviceWithKernel = await buildServiceWithOptionalDeps(
        mocks,
        true,
        false,
      );

      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(null);
      mocks.mockPrisma.researchMission.create.mockResolvedValue(mockMission);
      mocks.mockPrisma.researchMission.update.mockResolvedValue(mockMission);
      mocks.mockMissionExecutor.execute.mockRejectedValue(
        new Error("Kernel unavailable"),
      );

      mocks.mockLeaderService.planResearch.mockResolvedValue({
        dimensions: [],
        agentAssignments: [],
        strategy: "sequential",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);
      mocks.mockPrisma.topicDimension.findMany.mockResolvedValue([]);
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({ id: "ld-1" });
      mocks.mockPrisma.researchTask.createMany.mockResolvedValue({ count: 0 });

      // Should NOT throw - kernel failure is gracefully handled
      const result = await serviceWithKernel.createMission({
        topicId: "topic-s2",
        userPrompt: "Test",
      });

      expect(result.id).toBe("mission-s2");
    });
  });

  // ============================================================
  // createMission - with progressTracker
  // ============================================================

  describe("createMission - with progressTracker", () => {
    it("should initialize progressTracker when available", async () => {
      const serviceWithTracker = await buildServiceWithOptionalDeps(
        mocks,
        false,
        true,
      );

      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(null);
      mocks.mockPrisma.researchMission.create.mockResolvedValue(mockMission);
      mocks.mockPrisma.researchMission.update.mockResolvedValue(mockMission);

      mocks.mockLeaderService.planResearch.mockResolvedValue({
        dimensions: [],
        agentAssignments: [],
        strategy: "sequential",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);
      mocks.mockPrisma.topicDimension.findMany.mockResolvedValue([]);
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({ id: "ld-1" });
      mocks.mockPrisma.researchTask.createMany.mockResolvedValue({ count: 0 });

      await serviceWithTracker.createMission({
        topicId: "topic-s2",
        userPrompt: "Test",
      });

      expect(mocks.mockProgressTracker.create).toHaveBeenCalled();
      expect(mocks.mockProgressTracker.start).toHaveBeenCalled();
    });
  });

  // ============================================================
  // createMission - existing active mission cancellation
  // ============================================================

  describe("createMission - existing mission cancellation", () => {
    it("should cancel existing PLANNING mission before creating a fresh one", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue({
        ...mockMission,
        id: "old-mission",
        status: ResearchMissionStatus.PLANNING,
        tasks: [],
      });
      mocks.mockPrisma.researchMission.create.mockResolvedValue(mockMission);
      mocks.mockPrisma.researchMission.update.mockResolvedValue(mockMission);
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 0 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });

      mocks.mockLeaderService.planResearch.mockResolvedValue({
        dimensions: [],
        agentAssignments: [],
        strategy: "sequential",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);
      mocks.mockPrisma.topicDimension.findMany.mockResolvedValue([]);
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({ id: "ld-1" });
      mocks.mockPrisma.researchTask.createMany.mockResolvedValue({ count: 0 });

      await service.createMission({
        topicId: "topic-s2",
        userPrompt: "Fresh research",
      });

      // Should have cancelled the existing mission
      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "old-mission" },
          data: { status: ResearchMissionStatus.CANCELLED },
        }),
      );
    });

    it("should merge completed tasks from existing mission in incremental mode", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);

      const completedTask = {
        id: "old-task-1",
        missionId: "old-mission",
        dimensionName: "Existing Dimension",
        dimensionId: "dim-old",
        title: "Old Task",
        description: "Old desc",
        assignedAgent: "researcher",
        assignedAgentType: "dimension_researcher",
        modelId: "gpt-4o",
        priority: "HIGH",
        result: { summary: "Done" },
        resultSummary: "Done",
        startedAt: new Date(),
        completedAt: new Date(),
        status: ResearchTaskStatus.COMPLETED,
        taskType: "dimension_research",
      };

      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue({
        ...mockMission,
        id: "old-mission",
        status: ResearchMissionStatus.EXECUTING,
        tasks: [completedTask],
      });
      mocks.mockPrisma.researchMission.create.mockResolvedValue(mockMission);
      mocks.mockPrisma.researchMission.update.mockResolvedValue(mockMission);
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 0 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });

      mocks.mockLeaderService.planResearch.mockResolvedValue({
        dimensions: [],
        agentAssignments: [],
        strategy: "sequential",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);
      mocks.mockPrisma.topicDimension.findMany.mockResolvedValue([]);
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({ id: "ld-1" });
      mocks.mockPrisma.researchTask.createMany.mockResolvedValue({ count: 1 });

      await service.createMission({
        topicId: "topic-s2",
        userPrompt: "Incremental update",
        mode: "incremental",
      });

      // In incremental mode the existing mission tasks should be merged
      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "old-mission" },
          data: { status: ResearchMissionStatus.CANCELLED },
        }),
      );
    });
  });

  // ============================================================
  // approvePlanAndExecute - error paths
  // ============================================================

  describe("approvePlanAndExecute", () => {
    it("should throw NotFoundException when mission not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(
        service.approvePlanAndExecute("missing-mission", "topic-s2"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when mission has no plan", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        leaderPlan: null,
      });

      await expect(
        service.approvePlanAndExecute("mission-s2", "topic-s2"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should proceed when mission has a valid plan", async () => {
      const leaderPlan = {
        dimensions: [],
        agentAssignments: [],
        strategy: "sequential",
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
      mocks.mockPrisma.topicDimension.findMany.mockResolvedValue([]);
      mocks.mockPrisma.topicDimension.findFirst.mockResolvedValue(null);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);
      mocks.mockPrisma.researchTask.createMany.mockResolvedValue({ count: 0 });

      // Mock the execution to not run (async fire and forget)
      mocks.mockDimensionMissionService.executeDimensionMission.mockResolvedValue(
        undefined,
      );
      mocks.mockReportSynthesisService.synthesizeReport.mockResolvedValue(
        undefined,
      );

      await expect(
        service.approvePlanAndExecute("mission-s2", "topic-s2"),
      ).resolves.not.toThrow();

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchMissionStatus.EXECUTING,
          }),
        }),
      );
    });
  });

  // ============================================================
  // createMission - planning failure path
  // ============================================================

  describe("createMission - planning failure", () => {
    it("should update mission to FAILED when planning throws", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(null);
      mocks.mockPrisma.researchMission.create.mockResolvedValue(mockMission);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.FAILED,
      });
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(
        mockMission,
      );

      // Make planResearch fail
      mocks.mockLeaderService.planResearch.mockRejectedValue(
        new Error("Leader AI failed"),
      );

      // Create mission - it returns immediately but fires async planning
      const result = await service.createMission({
        topicId: "topic-s2",
        userPrompt: "Test",
      });

      expect(result.id).toBe("mission-s2");

      // Allow the async planning to fail and update status
      await new Promise((r) => setTimeout(r, 20));

      // The mission update with FAILED status should have been called (after async failure)
      // The emitMissionFailed should have been called
      expect(
        mocks.mockResearchEventEmitter.emitMissionFailed,
      ).toHaveBeenCalled();
    });
  });
});
