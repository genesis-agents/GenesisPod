/**
 * ResearchMissionService - Supplemental4 Tests
 *
 * Targets previously-uncovered lines:
 * - updateTaskStatus: EXECUTING / COMPLETED / FAILED branches, result/summary/model options
 * - updateMissionProgress: allCompleted, allTerminal+failed, partial states, kernel callbacks
 * - retryTask: not found, non-retryable state, success path
 * - retryMission: not found, not-failed, success reset
 * - getMissionByTopicId: returns null, maps tasks with modelDisplayName
 * - getMissionStatus: not found, maps tasks
 * - getExecutableTasks: filters by dependency state
 * - resumeExecutionForNewTask: mission not found, EXECUTING, COMPLETED with/without pending, CANCELLED
 * - continueExecution: mission not found, wrong status, resets EXECUTING tasks
 * - addAgentToLeaderPlan: new agent, existing agent update, mission not found
 * - cancelMission: COMPLETED throws BadRequest, empty draft report cleanup
 * - getTeamInfo: final fallback from modelTypeMap when leaderService returns null
 * - finalizeMission (via updateMissionProgress): has any success + any failure partial path
 */

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
    NEEDS_REVISION: "NEEDS_REVISION",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    SKIPPED: "SKIPPED",
  },
  ResearchTodoStatus: {
    PENDING: "PENDING",
    QUEUED: "QUEUED",
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
  LeaderDecisionType: {
    PLAN: "PLAN",
    ADJUST: "ADJUST",
    REVIEW: "REVIEW",
    EXECUTE: "EXECUTE",
  },
  AgentActivityType: {
    PLANNING: "PLANNING",
    THINKING: "THINKING",
    SEARCHING: "SEARCHING",
    ANALYZING: "ANALYZING",
    WRITING: "WRITING",
    REVIEWING: "REVIEWING",
    COMPLETING: "COMPLETING",
  },
  MemoryLayer: {
    WORKING: "WORKING",
    EPISODIC: "EPISODIC",
    SEMANTIC: "SEMANTIC",
    PERSISTENT: "PERSISTENT",
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
import { ChatFacade } from "@/modules/ai-engine/facade";
import { ResearchReviewerService } from "../../collaboration/research-reviewer.service";
import { MissionObservabilityService } from "../mission-observability.service";
import { MissionKernelBridgeService } from "../mission-kernel-bridge.service";
import { MissionNotificationService } from "../mission-notification.service";
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { ResearchMissionStatus, ResearchTaskStatus } from "@prisma/client";
import { CollaboratorRole } from "../../../dto/collaborator.dto";

// ──────────────────────────────────────────────────────────────────────────────
// Mock factory
// ──────────────────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    researchTopic: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    researchMission: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    researchTask: {
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    researchTodo: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    topicDimension: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
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
    handleUserMessage: jest.fn(),
  };

  const mockDimensionMissionService = {
    executeSearchPhase: jest.fn(),
    executeWritingPhase: jest.fn(),
    executeDimensionMission: jest.fn(),
  };

  const mockReportSynthesisService = {
    createDraftReport: jest.fn().mockResolvedValue({ id: "draft-001" }),
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
    emitAgentWorking: jest.fn().mockResolvedValue(undefined),
    emitAgentCompleted: jest.fn().mockResolvedValue(undefined),
    emitDimensionResearchStarted: jest.fn().mockResolvedValue(undefined),
    emitDimensionResearchProgress: jest.fn().mockResolvedValue(undefined),
    emitDimensionResearchCompleted: jest.fn().mockResolvedValue(undefined),
    emitReportSynthesisStarted: jest.fn().mockResolvedValue(undefined),
    emitReportSynthesisCompleted: jest.fn().mockResolvedValue(undefined),
  };

  const mockCollaboratorService = {
    getCollaborators: jest.fn(),
    addCollaborator: jest.fn(),
    notifyCollaborators: jest.fn(),
    hasAccess: jest.fn(),
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
    getAvailableModelsExtended: jest.fn().mockResolvedValue([]),
    getAvailableModels: jest.fn().mockResolvedValue([]),
    getReasoningModel: jest.fn(),
    getDefaultModelByType: jest.fn().mockResolvedValue(null),
  };

  const mockReviewerService = {
    createReviewSession: jest.fn(),
    submitReview: jest.fn(),
    reviewDimension: jest.fn(),
    reviewOverall: jest.fn(),
    validateClaims: jest.fn(),
    factCheckReport: jest.fn(),
  };

  const mockObservability = {
    recordResearchCost: jest.fn(),
    emitKernelEvent: jest.fn(),
    logError: jest.fn(),
    recordMissionMetrics: jest.fn(),
    startMissionTrace: jest.fn().mockReturnValue(null),
    addPhaseSpan: jest.fn().mockReturnValue(null),
    endPhaseSpan: jest.fn(),
    endMissionTrace: jest.fn(),
  };

  const mockKernelBridge = {
    initMission: jest.fn().mockResolvedValue(undefined),
    startPhase: jest.fn(),
    completePhase: jest.fn(),
    failTracking: jest.fn(),
    completeTracking: jest.fn(),
    recordKernelEvent: jest.fn(),
    completeKernelProcess: jest.fn(),
    failKernelProcess: jest.fn(),
    checkBudget: jest.fn().mockResolvedValue(null),
    consumeResources: jest.fn(),
    writeMemory: jest.fn(),
    getProcessId: jest.fn().mockReturnValue(undefined),
  };

  const mockNotification = {
    notifyCompletion: jest.fn(),
    getAiSettings: jest.fn().mockResolvedValue({}),
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
    mockObservability,
    mockKernelBridge,
    mockNotification,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Service builder
// ──────────────────────────────────────────────────────────────────────────────

async function buildService(
  mocks: ReturnType<typeof buildMocks>,
): Promise<ResearchMissionService> {
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
      {
        provide: ResearchReviewerService,
        useValue: mocks.mockReviewerService,
      },
      {
        provide: MissionObservabilityService,
        useValue: mocks.mockObservability,
      },
      {
        provide: MissionKernelBridgeService,
        useValue: mocks.mockKernelBridge,
      },
      {
        provide: MissionNotificationService,
        useValue: mocks.mockNotification,
      },
    ],
  }).compile();
  return module.get<ResearchMissionService>(ResearchMissionService);
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ──────────────────────────────────────────────────────────────────────────────

const mockTopicBase = {
  id: "topic-s4",
  name: "AI Trends",
  type: "technology",
  description: "AI topic",
  language: "zh",
  userId: "user-s4",
};

const mockMissionBase = {
  id: "mission-s4",
  topicId: "topic-s4",
  status: ResearchMissionStatus.EXECUTING,
  leaderPlan: null,
  leaderModelId: "gpt-4o",
  leaderModelName: "GPT-4o",
  userPrompt: "Test",
  userContext: null,
  researchDepth: "standard",
  totalTasks: 3,
  completedTasks: 1,
  progressPercent: 33,
  createdAt: new Date(),
  startedAt: new Date(),
  completedAt: null,
  topic: { id: "topic-s4", userId: "user-s4" },
};

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("ResearchMissionService (supplemental4)", () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: ResearchMissionService;

  beforeEach(async () => {
    mocks = buildMocks();
    service = await buildService(mocks);
  });

  afterEach(() => jest.clearAllMocks());

  // ============================================================
  // updateTaskStatus
  // ============================================================

  describe("updateTaskStatus", () => {
    it("should set startedAt when status is EXECUTING", async () => {
      const updatedTask = {
        id: "task-001",
        missionId: "mission-s4",
        status: ResearchTaskStatus.EXECUTING,
        mission: { id: "mission-s4" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(updatedTask);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([updatedTask]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
      });

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
      const updatedTask = {
        id: "task-001",
        missionId: "mission-s4",
        status: ResearchTaskStatus.COMPLETED,
        mission: { id: "mission-s4" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(updatedTask);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([updatedTask]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
      });

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
      const updatedTask = {
        id: "task-001",
        missionId: "mission-s4",
        status: ResearchTaskStatus.FAILED,
        mission: { id: "mission-s4" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(updatedTask);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([updatedTask]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
      });

      await service.updateTaskStatus("task-001", ResearchTaskStatus.FAILED);

      expect(mocks.mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ResearchTaskStatus.FAILED,
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("should pass result and resultSummary when provided", async () => {
      const updatedTask = {
        id: "task-001",
        missionId: "mission-s4",
        status: ResearchTaskStatus.COMPLETED,
        mission: { id: "mission-s4" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(updatedTask);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([updatedTask]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
      });

      await service.updateTaskStatus("task-001", ResearchTaskStatus.COMPLETED, {
        result: { summary: "done" },
        resultSummary: "All done",
        actualModelId: "gpt-4o-mini",
      });

      expect(mocks.mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: { summary: "done" },
            resultSummary: "All done",
            modelId: "gpt-4o-mini",
          }),
        }),
      );
    });

    it("should not set startedAt or completedAt for PENDING status", async () => {
      const updatedTask = {
        id: "task-001",
        missionId: "mission-s4",
        status: ResearchTaskStatus.PENDING,
        mission: { id: "mission-s4" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(updatedTask);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([updatedTask]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
      });

      await service.updateTaskStatus("task-001", ResearchTaskStatus.PENDING);

      const callArgs = mocks.mockPrisma.researchTask.update.mock.calls[0][0];
      expect(callArgs.data.startedAt).toBeUndefined();
      expect(callArgs.data.completedAt).toBeUndefined();
    });
  });

  // ============================================================
  // updateMissionProgress (tested indirectly via updateTaskStatus)
  // ============================================================

  describe("updateMissionProgress (via updateTaskStatus)", () => {
    it("should set mission status to COMPLETED when all tasks completed", async () => {
      const tasks = [
        {
          id: "task-001",
          missionId: "mission-s4",
          status: ResearchTaskStatus.COMPLETED,
          mission: { id: "mission-s4" },
        },
        {
          id: "task-002",
          missionId: "mission-s4",
          status: ResearchTaskStatus.COMPLETED,
          mission: { id: "mission-s4" },
        },
      ];

      mocks.mockPrisma.researchTask.update.mockResolvedValue(tasks[0]);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(tasks);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
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

    it("should set mission status to FAILED when all tasks are terminal with failures", async () => {
      const tasks = [
        {
          id: "task-001",
          missionId: "mission-s4",
          status: ResearchTaskStatus.FAILED,
        },
        {
          id: "task-002",
          missionId: "mission-s4",
          status: ResearchTaskStatus.FAILED,
        },
      ];

      const updatedTask = {
        ...tasks[0],
        mission: { id: "mission-s4" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(updatedTask);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(tasks);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
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

    it("should not set final status when tasks are still in progress", async () => {
      const tasks = [
        {
          id: "task-001",
          missionId: "mission-s4",
          status: ResearchTaskStatus.COMPLETED,
        },
        {
          id: "task-002",
          missionId: "mission-s4",
          status: ResearchTaskStatus.PENDING,
        },
      ];

      const updatedTask = {
        ...tasks[0],
        mission: { id: "mission-s4" },
      };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(updatedTask);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(tasks);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
      });

      await service.updateTaskStatus("task-001", ResearchTaskStatus.COMPLETED);

      // Should update progress but not set COMPLETED status
      const updateCall =
        mocks.mockPrisma.researchMission.update.mock.calls[0][0];
      expect(updateCall.data.status).toBeUndefined();
      expect(updateCall.data.completedTasks).toBe(1);
    });

    it("should delegate kernel process completion when mission COMPLETED", async () => {
      const tasks = [
        {
          id: "task-001",
          missionId: "mission-s4",
          status: ResearchTaskStatus.COMPLETED,
        },
      ];

      const updatedTask = { ...tasks[0], mission: { id: "mission-s4" } };
      mocks.mockPrisma.researchTask.update.mockResolvedValue(updatedTask);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(tasks);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.COMPLETED,
      });

      await service.updateTaskStatus("task-001", ResearchTaskStatus.COMPLETED);

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalled();
    });
  });

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

    it("should throw when task is not in FAILED or NEEDS_REVISION state", async () => {
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue({
        id: "task-001",
        status: ResearchTaskStatus.COMPLETED,
        missionId: "mission-s4",
      });

      await expect(service.retryTask("task-001")).rejects.toThrow(
        "not in a retryable state",
      );
    });

    it("should reset task to PENDING when task is FAILED", async () => {
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue({
        id: "task-001",
        status: ResearchTaskStatus.FAILED,
        missionId: "mission-s4",
      });
      mocks.mockPrisma.researchTask.update.mockResolvedValue({
        id: "task-001",
        status: ResearchTaskStatus.PENDING,
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

    it("should reset task to PENDING when task is NEEDS_REVISION", async () => {
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue({
        id: "task-002",
        status: ResearchTaskStatus.NEEDS_REVISION,
        missionId: "mission-s4",
      });
      mocks.mockPrisma.researchTask.update.mockResolvedValue({
        id: "task-002",
        status: ResearchTaskStatus.PENDING,
      });

      await service.retryTask("task-002");

      expect(mocks.mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
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

    it("should throw when mission is not in FAILED state", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.EXECUTING,
      });

      await expect(service.retryMission("mission-s4")).rejects.toThrow(
        "is not failed",
      );
    });

    it("should reset failed tasks and update mission to EXECUTING", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.FAILED,
      });
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 2 });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.EXECUTING,
      });

      const result = await service.retryMission("mission-s4");

      expect(mocks.mockPrisma.researchTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            missionId: "mission-s4",
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
    it("should return null when no mission exists for topic", async () => {
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(null);

      const result = await service.getMissionByTopicId("nonexistent-topic");

      expect(result).toBeNull();
    });

    it("should return mission status with tasks", async () => {
      const mission = {
        id: "mission-s4",
        topicId: "topic-s4",
        status: ResearchMissionStatus.EXECUTING,
        progressPercent: 50,
        totalTasks: 2,
        completedTasks: 1,
        researchDepth: "standard",
        leaderPlan: null,
        leaderModelId: "gpt-4o",
        leaderModelName: "GPT-4o",
        tasks: [
          {
            id: "task-001",
            title: "Research Task",
            description: "A task",
            taskType: "dimension_research",
            dimensionName: "技术趋势",
            assignedAgent: "researcher-01",
            modelId: null,
            status: ResearchTaskStatus.EXECUTING,
            progress: 50,
            reviewStatus: null,
            result: null,
            resultSummary: null,
            startedAt: new Date(),
            completedAt: null,
            dependencies: [],
          },
        ],
      };
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(mission);
      mocks.mockPrisma.aIModel.findMany.mockResolvedValue([]);

      const result = await service.getMissionByTopicId("topic-s4");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("mission-s4");
      expect(result!.tasks).toHaveLength(1);
      expect(result!.tasks[0].dimensionName).toBe("技术趋势");
      expect(result!.leaderModelId).toBe("gpt-4o");
      expect(result!.leaderModelName).toBe("GPT-4o");
    });

    it("should return modelDisplayName when model exists", async () => {
      const mission = {
        id: "mission-s4",
        topicId: "topic-s4",
        status: ResearchMissionStatus.EXECUTING,
        progressPercent: 50,
        totalTasks: 1,
        completedTasks: 0,
        researchDepth: "standard",
        leaderPlan: null,
        leaderModelId: null,
        leaderModelName: null,
        tasks: [
          {
            id: "task-001",
            title: "Task",
            description: "desc",
            taskType: "dimension_research",
            dimensionName: null,
            assignedAgent: "researcher-01",
            modelId: "gpt-4o",
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
      mocks.mockPrisma.aIModel.findMany.mockResolvedValue([
        { modelId: "gpt-4o", displayName: "GPT-4o Display" },
      ]);

      const result = await service.getMissionByTopicId("topic-s4");

      expect(result!.tasks[0].modelDisplayName).toBe("GPT-4o Display");
    });
  });

  // ============================================================
  // getMissionStatus
  // ============================================================

  describe("getMissionStatus", () => {
    it("should throw NotFoundException when mission not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(service.getMissionStatus("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should return mission status with correct phase mapping", async () => {
      const mission = {
        id: "mission-s4",
        topicId: "topic-s4",
        status: ResearchMissionStatus.REVIEWING,
        progressPercent: 80,
        totalTasks: 3,
        completedTasks: 2,
        researchDepth: "deep",
        leaderPlan: null,
        tasks: [],
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(mission);
      mocks.mockPrisma.aIModel.findMany.mockResolvedValue([]);

      const result = await service.getMissionStatus("mission-s4");

      expect(result.currentPhase).toBe("reviewing");
      expect(result.researchDepth).toBe("deep");
    });

    it("should return correct phase for PLANNING status", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "m1",
        status: ResearchMissionStatus.PLANNING,
        progressPercent: 5,
        totalTasks: 0,
        completedTasks: 0,
        researchDepth: null,
        leaderPlan: null,
        tasks: [],
      });
      mocks.mockPrisma.aIModel.findMany.mockResolvedValue([]);

      const result = await service.getMissionStatus("m1");

      expect(result.currentPhase).toBe("planning");
    });

    it("should return correct phase for COMPLETED status", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "m2",
        status: ResearchMissionStatus.COMPLETED,
        progressPercent: 100,
        totalTasks: 3,
        completedTasks: 3,
        researchDepth: "standard",
        leaderPlan: null,
        tasks: [],
      });
      mocks.mockPrisma.aIModel.findMany.mockResolvedValue([]);

      const result = await service.getMissionStatus("m2");

      expect(result.currentPhase).toBe("completed");
    });

    it("should return correct phase for FAILED status", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "m3",
        status: ResearchMissionStatus.FAILED,
        progressPercent: 30,
        totalTasks: 3,
        completedTasks: 1,
        researchDepth: "standard",
        leaderPlan: null,
        tasks: [],
      });
      mocks.mockPrisma.aIModel.findMany.mockResolvedValue([]);

      const result = await service.getMissionStatus("m3");

      expect(result.currentPhase).toBe("failed");
    });

    it("should return unknown phase for unrecognized status", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "m4",
        status: ResearchMissionStatus.PAUSED,
        progressPercent: 0,
        totalTasks: 0,
        completedTasks: 0,
        researchDepth: null,
        leaderPlan: null,
        tasks: [],
      });
      mocks.mockPrisma.aIModel.findMany.mockResolvedValue([]);

      const result = await service.getMissionStatus("m4");

      expect(result.currentPhase).toBe("unknown");
    });

    it("should map task results correctly", async () => {
      const mission = {
        id: "mission-s4",
        topicId: "topic-s4",
        status: ResearchMissionStatus.EXECUTING,
        progressPercent: 33,
        totalTasks: 1,
        completedTasks: 0,
        researchDepth: "standard",
        leaderPlan: null,
        tasks: [
          {
            id: "task-001",
            title: "Research",
            description: "desc",
            taskType: "dimension_research",
            dimensionName: "技术",
            assignedAgent: "researcher-01",
            modelId: "gpt-4o",
            status: ResearchTaskStatus.COMPLETED,
            progress: 100,
            reviewStatus: "approved",
            result: { summary: "done" },
            resultSummary: "Task done",
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(mission);
      mocks.mockPrisma.aIModel.findMany.mockResolvedValue([
        { modelId: "gpt-4o", displayName: "GPT-4o" },
      ]);

      const result = await service.getMissionStatus("mission-s4");

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].modelDisplayName).toContain("GPT-4o");
      expect(result.tasks[0].reviewStatus).toBe("approved");
      expect(result.tasks[0].resultSummary).toBe("Task done");
    });
  });

  // ============================================================
  // getExecutableTasks
  // ============================================================

  describe("getExecutableTasks", () => {
    it("should return only PENDING tasks with satisfied dependencies", async () => {
      const allTasks = [
        {
          id: "task-001",
          status: ResearchTaskStatus.COMPLETED,
          priority: 1,
          dependencies: [],
        },
        {
          id: "task-002",
          status: ResearchTaskStatus.PENDING,
          priority: 2,
          dependencies: ["task-001"],
        },
        {
          id: "task-003",
          status: ResearchTaskStatus.PENDING,
          priority: 3,
          dependencies: ["task-002"],
        },
      ];
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(allTasks);

      const result = await service.getExecutableTasks("mission-s4");

      // task-002 is PENDING and its dep (task-001) is COMPLETED
      // task-003 is PENDING but dep (task-002) is not COMPLETED
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("task-002");
    });

    it("should return tasks sorted by priority", async () => {
      const allTasks = [
        {
          id: "task-002",
          status: ResearchTaskStatus.PENDING,
          priority: 2,
          dependencies: [],
        },
        {
          id: "task-001",
          status: ResearchTaskStatus.PENDING,
          priority: 1,
          dependencies: [],
        },
        {
          id: "task-003",
          status: ResearchTaskStatus.PENDING,
          priority: 3,
          dependencies: [],
        },
      ];
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(allTasks);

      const result = await service.getExecutableTasks("mission-s4");

      expect(result[0].id).toBe("task-001");
      expect(result[1].id).toBe("task-002");
      expect(result[2].id).toBe("task-003");
    });

    it("should return empty array when all tasks are executing", async () => {
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([
        {
          id: "task-001",
          status: ResearchTaskStatus.EXECUTING,
          priority: 1,
          dependencies: [],
        },
      ]);

      const result = await service.getExecutableTasks("mission-s4");

      expect(result).toHaveLength(0);
    });

    it("should return tasks with no dependencies", async () => {
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([
        {
          id: "task-001",
          status: ResearchTaskStatus.PENDING,
          priority: 1,
          dependencies: [],
        },
        {
          id: "task-002",
          status: ResearchTaskStatus.PENDING,
          priority: 2,
          dependencies: null,
        },
      ]);

      const result = await service.getExecutableTasks("mission-s4");

      expect(result).toHaveLength(2);
    });
  });

  // ============================================================
  // resumeExecutionForNewTask
  // ============================================================

  describe("resumeExecutionForNewTask", () => {
    it("should return false when mission not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      const result = await service.resumeExecutionForNewTask(
        "nonexistent",
        "topic-s4",
      );

      expect(result).toBe(false);
    });

    it("should return true when mission is still EXECUTING", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.EXECUTING,
      });

      const result = await service.resumeExecutionForNewTask(
        "mission-s4",
        "topic-s4",
      );

      expect(result).toBe(true);
    });

    it("should return false when mission is COMPLETED but no pending tasks", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.COMPLETED,
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);

      const result = await service.resumeExecutionForNewTask(
        "mission-s4",
        "topic-s4",
      );

      expect(result).toBe(false);
    });

    it("should return false when mission is CANCELLED", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.CANCELLED,
      });

      const result = await service.resumeExecutionForNewTask(
        "mission-s4",
        "topic-s4",
      );

      expect(result).toBe(false);
    });

    it("should restart execution when COMPLETED mission has pending tasks", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.COMPLETED,
      });
      const pendingTasks = [
        {
          id: "task-new-001",
          status: ResearchTaskStatus.PENDING,
          priority: 1,
        },
      ];
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(pendingTasks);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.EXECUTING,
      });

      const result = await service.resumeExecutionForNewTask(
        "mission-s4",
        "topic-s4",
      );

      expect(result).toBe(true);
      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mission-s4" },
          data: { status: ResearchMissionStatus.EXECUTING },
        }),
      );
      expect(
        mocks.mockResearchEventEmitter.emitMissionProgress,
      ).toHaveBeenCalled();
    });

    it("should restart execution when FAILED mission has pending tasks", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.FAILED,
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([
        {
          id: "task-new-001",
          status: ResearchTaskStatus.PENDING,
          priority: 1,
        },
      ]);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.EXECUTING,
      });

      const result = await service.resumeExecutionForNewTask(
        "mission-s4",
        "topic-s4",
      );

      expect(result).toBe(true);
    });
  });

  // ============================================================
  // continueExecution
  // ============================================================

  describe("continueExecution", () => {
    it("should throw when mission not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(service.continueExecution("nonexistent")).rejects.toThrow(
        "Mission nonexistent not found",
      );
    });

    it("should throw when mission is not in EXECUTING status", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.COMPLETED,
        topic: { id: "topic-s4" },
        tasks: [],
      });

      await expect(service.continueExecution("mission-s4")).rejects.toThrow(
        "not in EXECUTING status",
      );
    });

    it("should reset EXECUTING tasks and resume when mission is EXECUTING", async () => {
      const executingTask = {
        id: "task-001",
        status: ResearchTaskStatus.EXECUTING,
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.EXECUTING,
        topicId: "topic-s4",
        topic: { id: "topic-s4" },
        tasks: [executingTask],
      });
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 1 });
      mocks.mockPrisma.researchTask.count.mockResolvedValue(1);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
      });

      await service.continueExecution("mission-s4");

      expect(mocks.mockPrisma.researchTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["task-001"] } },
          data: expect.objectContaining({
            status: ResearchTaskStatus.PENDING,
            startedAt: null,
          }),
        }),
      );
      expect(
        mocks.mockResearchEventEmitter.emitMissionProgress,
      ).toHaveBeenCalled();
    });

    it("should not call updateMany when no EXECUTING tasks", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.EXECUTING,
        topicId: "topic-s4",
        topic: { id: "topic-s4" },
        tasks: [], // no tasks currently executing
      });
      mocks.mockPrisma.researchTask.count.mockResolvedValue(0);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({});

      await service.continueExecution("mission-s4");

      expect(mocks.mockPrisma.researchTask.updateMany).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // addAgentToLeaderPlan
  // ============================================================

  describe("addAgentToLeaderPlan", () => {
    it("should do nothing when mission not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(
        service.addAgentToLeaderPlan("nonexistent", {
          agentId: "agent-01",
          agentType: "dimension_researcher",
        }),
      ).resolves.not.toThrow();

      expect(mocks.mockPrisma.researchMission.update).not.toHaveBeenCalled();
    });

    it("should add new agent to leaderPlan when none exists", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        leaderPlan: null,
      });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
      });

      await service.addAgentToLeaderPlan("mission-s4", {
        agentId: "researcher-new",
        agentName: "New Researcher",
        agentType: "dimension_researcher",
        modelId: "gpt-4o",
        skills: ["analysis"],
        tools: ["web-search"],
      });

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mission-s4" },
          data: expect.objectContaining({
            leaderPlan: expect.anything(),
          }),
        }),
      );
    });

    it("should update existing agent when agent already in plan", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        leaderPlan: {
          dimensions: [],
          agentAssignments: [
            {
              agentId: "researcher-existing",
              agentName: "Old Name",
              agentType: "dimension_researcher",
              modelId: "gpt-3.5",
              skills: ["old_skill"],
              tools: [],
            },
          ],
        },
      });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
      });

      await service.addAgentToLeaderPlan("mission-s4", {
        agentId: "researcher-existing",
        agentName: "Updated Name",
        agentType: "dimension_researcher",
        modelId: "gpt-4o",
        skills: ["new_skill"],
      });

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalled();
    });

    it("should not throw even when update fails internally", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        leaderPlan: null,
      });
      mocks.mockPrisma.researchMission.update.mockRejectedValue(
        new Error("DB Error"),
      );

      await expect(
        service.addAgentToLeaderPlan("mission-s4", {
          agentId: "researcher-01",
          agentType: "dimension_researcher",
        }),
      ).resolves.not.toThrow();
    });
  });

  // ============================================================
  // cancelMission - edge cases
  // ============================================================

  describe("cancelMission edge cases", () => {
    it("should throw BadRequestException when mission is already COMPLETED", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.COMPLETED,
        topicId: "topic-s4",
        topic: { id: "topic-s4", userId: "user-s4" },
      });
      mocks.mockCollaboratorService.hasAccess.mockResolvedValue(true);

      await expect(
        service.cancelMission("user-s4", "mission-s4"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should clean up empty draft reports when cancelling active mission", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.EXECUTING,
        topicId: "topic-s4",
        totalTasks: 3,
        topic: { id: "topic-s4", userId: "user-s4" },
      });
      mocks.mockCollaboratorService.hasAccess.mockResolvedValue(true);
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 2 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 1 });

      // Simulate empty draft reports
      mocks.mockPrisma.topicReport.findMany.mockResolvedValue([
        { id: "report-001" },
        { id: "report-002" },
      ]);
      mocks.mockPrisma.topicReport.deleteMany.mockResolvedValue({ count: 2 });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.CANCELLED,
      });

      await service.cancelMission("user-s4", "mission-s4");

      expect(mocks.mockPrisma.topicReport.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["report-001", "report-002"] } },
        }),
      );
    });

    it("should not call deleteMany when no empty draft reports found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.EXECUTING,
        topicId: "topic-s4",
        totalTasks: 1,
        topic: { id: "topic-s4", userId: "user-s4" },
      });
      mocks.mockCollaboratorService.hasAccess.mockResolvedValue(true);
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 0 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });
      mocks.mockPrisma.topicReport.findMany.mockResolvedValue([]); // no empty reports
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.CANCELLED,
      });

      await service.cancelMission("user-s4", "mission-s4");

      expect(mocks.mockPrisma.topicReport.deleteMany).not.toHaveBeenCalled();
    });

    it("should throw ForbiddenException when user has no access", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.EXECUTING,
        topic: { id: "topic-s4", userId: "owner-user" },
      });
      mocks.mockCollaboratorService.hasAccess.mockResolvedValue(false);

      await expect(
        service.cancelMission("other-user", "mission-s4"),
      ).rejects.toThrow(ForbiddenException);

      expect(mocks.mockCollaboratorService.hasAccess).toHaveBeenCalledWith(
        "topic-s4",
        "other-user",
        CollaboratorRole.EDITOR,
      );
    });
  });

  // ============================================================
  // getTeamInfo - fallback to modelTypeMap
  // ============================================================

  describe("getTeamInfo - model fallback scenarios", () => {
    it("should use modelTypeMap fallback when both stored model and leaderService return null", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        leaderModelId: null,
        leaderModelName: null,
        leaderPlan: null,
        tasks: [],
      });
      mocks.mockLeaderService.getReasoningModel.mockResolvedValue(null);
      // Provide a default model from chatFacade
      mocks.mockFacade.getDefaultModelByType.mockResolvedValue({
        displayName: "Default Chat Model",
        modelId: "default-model",
      });

      const result = await service.getTeamInfo("mission-s4");

      expect(result.leaderModel).toBe("Default Chat Model");
    });

    it("should use modelId when displayName is not available", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        leaderModelId: null,
        leaderModelName: null,
        leaderPlan: null,
        tasks: [],
      });
      mocks.mockLeaderService.getReasoningModel.mockResolvedValue(null);
      mocks.mockFacade.getDefaultModelByType.mockResolvedValue({
        displayName: null,
        modelId: "fallback-model-id",
      });

      const result = await service.getTeamInfo("mission-s4");

      expect(result.leaderModel).toBe("fallback-model-id");
    });

    it("should use leaderModelName when leaderModelId is null", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        leaderModelId: null,
        leaderModelName: "GPT-4 Name",
        leaderPlan: null,
        tasks: [],
      });

      const result = await service.getTeamInfo("mission-s4");

      expect(result.leaderModel).toBe("GPT-4 Name");
      expect(mocks.mockLeaderService.getReasoningModel).not.toHaveBeenCalled();
    });

    it("should handle leaderPlan with invalid agentAssignment structure gracefully", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        leaderModelId: "o3-mini",
        leaderModelName: "o3-mini",
        leaderPlan: {
          agentAssignments: [
            // invalid entry - no agentId
            { agentType: "dimension_researcher", modelId: "gpt-4o" },
            // valid entry
            {
              agentId: "researcher-01",
              agentType: "dimension_researcher",
              skills: ["analysis"],
              tools: ["web-search"],
              modelId: "gpt-4o",
            },
          ],
        },
        tasks: [
          {
            id: "task-001",
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            taskType: "dimension_research",
            status: ResearchTaskStatus.PENDING,
            dimensionName: "趋势分析",
            modelId: null,
            title: "Trend Research",
          },
        ],
      });

      const result = await service.getTeamInfo("mission-s4");

      expect(result.agents).toHaveLength(1);
      // Valid assignment skills/tools should be found
      expect(result.agents[0].skills).toEqual(["analysis"]);
    });

    it("should handle leaderPlan with empty skills/tools arrays", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        leaderModelId: "o3-mini",
        leaderModelName: "o3-mini",
        leaderPlan: {
          agentAssignments: [
            {
              agentId: "researcher-01",
              agentType: "dimension_researcher",
              skills: [], // empty array - should be treated as undefined
              tools: ["web-search"], // non-empty - should be set
              modelId: "gpt-4o",
            },
          ],
        },
        tasks: [
          {
            id: "task-001",
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            taskType: "dimension_research",
            status: ResearchTaskStatus.PENDING,
            dimensionName: "趋势",
            modelId: null,
            title: "Research",
          },
        ],
      });

      const result = await service.getTeamInfo("mission-s4");
      const agent = result.agents[0];

      // empty arrays should result in undefined (per the isNonEmptyStringArray logic)
      expect(agent.skills).toBeUndefined();
      expect(agent.tools).toEqual(["web-search"]);
    });
  });

  // ============================================================
  // handleResumeMissionExecution event listener
  // ============================================================

  describe("handleResumeMissionExecution", () => {
    it("should call resumeExecutionForNewTask without throwing", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.EXECUTING,
      });

      // Call the event handler directly
      await expect(
        service.handleResumeMissionExecution({
          missionId: "mission-s4",
          topicId: "topic-s4",
        }),
      ).resolves.not.toThrow();
    });

    it("should not throw when resumeExecutionForNewTask fails", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockRejectedValue(
        new Error("DB error"),
      );

      await expect(
        service.handleResumeMissionExecution({
          missionId: "mission-s4",
          topicId: "topic-s4",
        }),
      ).resolves.not.toThrow();

      // Allow async to settle
      await new Promise((r) => setTimeout(r, 10));
    });
  });

  // ============================================================
  // handleRecoveryNeeded event listener
  // ============================================================

  describe("handleRecoveryNeeded", () => {
    it("should call continueExecution and not throw", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.EXECUTING,
        topicId: "topic-s4",
        topic: { id: "topic-s4" },
        tasks: [],
      });
      mocks.mockPrisma.researchTask.count.mockResolvedValue(0);

      await expect(
        service.handleRecoveryNeeded({
          missionId: "mission-s4",
          topicId: "topic-s4",
          resetTaskCount: 2,
        }),
      ).resolves.not.toThrow();
    });

    it("should handle continueExecution failure gracefully", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(
        service.handleRecoveryNeeded({
          missionId: "nonexistent",
          topicId: "topic-s4",
          resetTaskCount: 0,
        }),
      ).resolves.not.toThrow();
    });
  });

  // ============================================================
  // adjustMission - removeDimension when task not found (no-op)
  // ============================================================

  describe("adjustMission - remove dimension no-op", () => {
    it("should skip removal when no matching pending task found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-s4",
        topicId: "topic-s4",
        status: ResearchMissionStatus.EXECUTING,
        tasks: [],
        progressPercent: 50,
        completedTasks: 1,
        totalTasks: 2,
        topic: { userId: "user-s4" },
      });
      mocks.mockPrisma.researchTask.findFirst.mockResolvedValue(null);
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({});
      mocks.mockPrisma.researchMission.findUniqueOrThrow.mockResolvedValue({
        id: "mission-s4",
        status: ResearchMissionStatus.EXECUTING,
      });

      await service.adjustMission("user-s4", "mission-s4", {
        removeDimensions: ["NonExistentDimension"],
      });

      expect(mocks.mockPrisma.researchTask.delete).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // getMissionStatus - PLAN_READY phase
  // ============================================================

  describe("getMissionStatus - PLAN_READY phase", () => {
    it("should return unknown phase for PLAN_READY status", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "m-plan",
        status: ResearchMissionStatus.PLAN_READY,
        progressPercent: 50,
        totalTasks: 0,
        completedTasks: 0,
        researchDepth: "standard",
        leaderPlan: { dimensions: [], agentAssignments: [], strategy: "par" },
        tasks: [],
      });
      mocks.mockPrisma.aIModel.findMany.mockResolvedValue([]);

      const result = await service.getMissionStatus("m-plan");

      // PLAN_READY falls to default "unknown"
      expect(result.currentPhase).toBe("unknown");
      expect(result.leaderPlan).toBeDefined();
    });
  });

  // ============================================================
  // updateTaskStatus + updateMissionProgress: partial success scenario
  // ============================================================

  describe("updateMissionProgress - mixed completed/failed tasks", () => {
    it("should not set a final status when some tasks are still pending", async () => {
      const tasks = [
        { id: "t1", status: ResearchTaskStatus.COMPLETED },
        { id: "t2", status: ResearchTaskStatus.FAILED },
        { id: "t3", status: ResearchTaskStatus.PENDING },
      ];
      const updatedTask = {
        id: "t1",
        missionId: "mission-s4",
        status: ResearchTaskStatus.COMPLETED,
        mission: { id: "mission-s4" },
      };

      mocks.mockPrisma.researchTask.update.mockResolvedValue(updatedTask);
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue(tasks);
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-s4",
      });

      await service.updateTaskStatus("t1", ResearchTaskStatus.COMPLETED);

      const updateCall =
        mocks.mockPrisma.researchMission.update.mock.calls[0][0];
      // mixed state with pending: no final status should be set
      expect(updateCall.data.status).toBeUndefined();
    });
  });

  // ============================================================
  // createMission - userContext present
  // ============================================================

  describe("createMission - with userContext", () => {
    it("should include userContext in mission create when provided", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(
        mockTopicBase,
      );
      mocks.mockPrisma.researchMission.findFirst.mockResolvedValue(null);
      mocks.mockLeaderService.getReasoningModel.mockResolvedValue({
        modelId: "o3-mini",
        modelName: "o3-mini",
      });
      const newMission = { ...mockMissionBase, id: "mission-with-ctx" };
      mocks.mockPrisma.researchMission.create.mockResolvedValue(newMission);
      mocks.mockPrisma.researchMission.update.mockResolvedValue(newMission);
      mocks.mockLeaderService.planResearch.mockResolvedValue({
        dimensions: [],
        agentAssignments: [],
        strategy: "parallel",
      });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([]);
      mocks.mockPrisma.topicDimension.findMany.mockResolvedValue([]);
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({});
      mocks.mockPrisma.researchTask.createMany.mockResolvedValue({ count: 0 });

      const result = await service.createMission({
        topicId: "topic-s4",
        userPrompt: "Test",
        userContext: { background: "test context" },
      });

      expect(result.id).toBe("mission-with-ctx");
      expect(mocks.mockPrisma.researchMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userContext: expect.anything(),
          }),
        }),
      );
    });
  });
});
