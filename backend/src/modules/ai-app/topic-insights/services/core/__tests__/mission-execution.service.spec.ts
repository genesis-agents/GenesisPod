/**
 * MissionExecutionService Unit Tests
 *
 * Focus on:
 * - startExecution: topic not found, mission not found
 * - executeTask: cancellation checks, CAS update, task type routing
 * - finalizeMission: status transitions
 */

import { Test, TestingModule } from "@nestjs/testing";
import { MissionExecutionService } from "../mission-execution.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ResearchEventEmitterService } from "../research-event-emitter.service";
import { MissionQueryService } from "../mission-query.service";
import { DimensionMissionService } from "../../dimension/dimension-mission.service";
import { ReportSynthesisService } from "../../report/report-synthesis.service";
import { AgentActivityService } from "../../monitoring/agent-activity.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { ResearchReviewerService } from "../../collaboration/research-reviewer.service";
import { ResearchMemoryService } from "../research-memory.service";
import {
  ResearchMissionStatus,
  ResearchTaskStatus,
  AIModelType,
} from "@prisma/client";

// ─── Mocks ───────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    researchTopic: {
      findUnique: jest.fn(),
    },
    researchMission: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    researchTask: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    topicReport: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    topicEvidence: {
      createMany: jest.fn(),
    },
    aIModel: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockResearchEventEmitter = {
    emitTaskStarted: jest.fn().mockResolvedValue(undefined),
    emitTaskCompleted: jest.fn().mockResolvedValue(undefined),
    emitTaskFailed: jest.fn().mockResolvedValue(undefined),
    emitAgentWorking: jest.fn().mockResolvedValue(undefined),
    emitAgentIdle: jest.fn().mockResolvedValue(undefined),
    emitAgentCompleted: jest.fn().mockResolvedValue(undefined),
    emitDimensionResearchStarted: jest.fn().mockResolvedValue(undefined),
    emitDimensionResearchCompleted: jest.fn().mockResolvedValue(undefined),
    emitDimensionResearchProgress: jest.fn().mockResolvedValue(undefined),
    emitMissionStarted: jest.fn().mockResolvedValue(undefined),
    emitMissionProgress: jest.fn().mockResolvedValue(undefined),
    emitMissionCompleted: jest.fn().mockResolvedValue(undefined),
    emitMissionFailed: jest.fn().mockResolvedValue(undefined),
    emitLeaderThinking: jest.fn().mockResolvedValue(undefined),
    emitLeaderPlanning: jest.fn().mockResolvedValue(undefined),
    emitLeaderPlanReady: jest.fn().mockResolvedValue(undefined),
    emitResumeMissionExecution: jest.fn(),
  };

  const mockQueryService = {
    getAgentRoleFromTaskType: jest.fn().mockReturnValue("researcher"),
    getAgentNameFromTaskType: jest.fn().mockReturnValue("研究员"),
    updateTaskStatus: jest.fn().mockResolvedValue({}),
    getExecutableTasks: jest.fn().mockResolvedValue([]),
    emitProgress: jest.fn(),
  };

  const mockDimensionMissionService = {
    executeDimensionResearch: jest.fn().mockResolvedValue({
      summary: "Research complete",
      keyFindings: ["Finding 1"],
    }),
  };

  const mockReportSynthesisService = {
    createDraftReport: jest.fn().mockResolvedValue({ id: "report-draft" }),
    synthesizeReport: jest.fn().mockResolvedValue({ id: "report-final" }),
  };

  const mockAgentActivity = {
    recordActivity: jest.fn().mockResolvedValue(undefined),
  };

  const mockAiFacade = {
    chat: jest.fn().mockResolvedValue({ content: '{"status":"approved"}' }),
    getDefaultModelByType: jest.fn().mockResolvedValue(null),
    getAvailableModels: jest.fn().mockResolvedValue([]),
  };

  const mockReviewerService = {
    reviewTaskResult: jest.fn().mockResolvedValue({ status: "approved" }),
  };

  const mockResearchMemory = {
    extractAndStoreFindings: jest.fn().mockResolvedValue(5),
  };

  return {
    mockPrisma,
    mockResearchEventEmitter,
    mockQueryService,
    mockDimensionMissionService,
    mockReportSynthesisService,
    mockAgentActivity,
    mockAiFacade,
    mockReviewerService,
    mockResearchMemory,
  };
}

const mockTopic = {
  id: "topic-1",
  name: "AI Research",
  type: "TECHNOLOGY",
  dimensions: [{ id: "dim-1", name: "Market Analysis" }],
};

const mockMission = {
  id: "mission-1",
  status: ResearchMissionStatus.EXECUTING,
  researchDepth: "standard",
  leaderPlan: null,
};

const mockPendingTask = {
  id: "task-1",
  missionId: "mission-1",
  title: "Research: Market Analysis",
  taskType: "dimension_research",
  dimensionName: "Market Analysis",
  dimensionId: "dim-1",
  assignedAgent: "researcher-1",
  assignedAgentType: "dimension_researcher",
  modelId: "gpt-4o",
  skills: [],
  tools: [],
  status: ResearchTaskStatus.PENDING,
  priority: 1,
  dependencies: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MissionExecutionService", () => {
  let service: MissionExecutionService;
  let prisma: ReturnType<typeof buildMocks>["mockPrisma"];
  let researchEventEmitter: ReturnType<typeof buildMocks>["mockResearchEventEmitter"];
  let queryService: ReturnType<typeof buildMocks>["mockQueryService"];
  let reportSynthesisService: ReturnType<typeof buildMocks>["mockReportSynthesisService"];

  beforeEach(async () => {
    const mocks = buildMocks();
    prisma = mocks.mockPrisma;
    researchEventEmitter = mocks.mockResearchEventEmitter;
    queryService = mocks.mockQueryService;
    reportSynthesisService = mocks.mockReportSynthesisService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MissionExecutionService,
        { provide: PrismaService, useValue: mocks.mockPrisma },
        { provide: ResearchEventEmitterService, useValue: mocks.mockResearchEventEmitter },
        { provide: MissionQueryService, useValue: mocks.mockQueryService },
        { provide: DimensionMissionService, useValue: mocks.mockDimensionMissionService },
        { provide: ReportSynthesisService, useValue: mocks.mockReportSynthesisService },
        { provide: AgentActivityService, useValue: mocks.mockAgentActivity },
        { provide: AIEngineFacade, useValue: mocks.mockAiFacade },
        { provide: ResearchReviewerService, useValue: mocks.mockReviewerService },
        { provide: ResearchMemoryService, useValue: mocks.mockResearchMemory },
      ],
    }).compile();

    service = module.get<MissionExecutionService>(MissionExecutionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── startExecution ─────────────────────────────────────────────────────────

  describe("startExecution", () => {
    it("should throw error when topic not found", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(null);
      prisma.researchMission.findUnique.mockResolvedValue(mockMission);

      await expect(service.startExecution("mission-1", "nonexistent")).rejects.toThrow(
        "Topic nonexistent not found",
      );
    });

    it("should complete execution with no tasks", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.researchMission.findUnique.mockResolvedValue(mockMission);
      prisma.researchTask.findMany.mockResolvedValue([]);
      prisma.topicReport.findFirst.mockResolvedValue(null);
      queryService.getExecutableTasks.mockResolvedValue([]);
      prisma.researchMission.update.mockResolvedValue({ ...mockMission, status: ResearchMissionStatus.COMPLETED });

      // Should not throw
      await expect(service.startExecution("mission-1", "topic-1")).resolves.not.toThrow();
    });
  });

  // ─── executeTask ────────────────────────────────────────────────────────────

  describe("executeTask", () => {
    it("should skip task if already FAILED (cancelled)", async () => {
      prisma.researchTask.findUnique.mockResolvedValue({
        status: ResearchTaskStatus.FAILED,
        modelId: null,
        skills: [],
        tools: [],
      });
      prisma.researchMission.findUnique.mockResolvedValue(mockMission);

      await service.executeTask(mockPendingTask as any, mockTopic as any, "mission-1", "report-1");

      // Should return early without updating task
      expect(prisma.researchTask.updateMany).not.toHaveBeenCalled();
    });

    it("should skip task if task not found", async () => {
      prisma.researchTask.findUnique.mockResolvedValue(null);
      prisma.researchMission.findUnique.mockResolvedValue(mockMission);

      await service.executeTask(mockPendingTask as any, mockTopic as any, "mission-1", "report-1");

      expect(prisma.researchTask.updateMany).not.toHaveBeenCalled();
    });

    it("should skip task if mission is cancelled", async () => {
      prisma.researchTask.findUnique.mockResolvedValue({
        status: ResearchTaskStatus.PENDING,
        modelId: null,
        skills: [],
        tools: [],
      });
      prisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.CANCELLED,
      });

      await service.executeTask(mockPendingTask as any, mockTopic as any, "mission-1", "report-1");

      expect(prisma.researchTask.updateMany).not.toHaveBeenCalled();
    });

    it("should skip if CAS update fails (task already executing)", async () => {
      prisma.researchTask.findUnique.mockResolvedValue({
        status: ResearchTaskStatus.PENDING,
        modelId: null,
        skills: [],
        tools: [],
      });
      prisma.researchMission.findUnique.mockResolvedValue(mockMission);
      // CAS update returns 0 - another process grabbed the task
      prisma.researchTask.updateMany.mockResolvedValue({ count: 0 });

      await service.executeTask(mockPendingTask as any, mockTopic as any, "mission-1", "report-1");

      // Should return early after CAS failure
      expect(researchEventEmitter.emitTaskStarted).not.toHaveBeenCalled();
    });

    it("should execute dimension_research task when CAS succeeds", async () => {
      prisma.researchTask.findUnique.mockResolvedValue({
        status: ResearchTaskStatus.PENDING,
        modelId: "gpt-4o",
        skills: [],
        tools: [],
      });
      prisma.researchMission.findUnique.mockResolvedValue(mockMission);
      prisma.researchTask.updateMany.mockResolvedValue({ count: 1 });

      // Mock the dimension research execution
      const mockDimService = (service as any).dimensionMissionService;
      mockDimService.executeDimensionResearch = jest.fn().mockResolvedValue({
        summary: "Research complete",
        keyFindings: [],
        sourcesFound: 5,
      });

      queryService.updateTaskStatus.mockResolvedValue({ status: ResearchTaskStatus.COMPLETED });

      await service.executeTask(mockPendingTask as any, mockTopic as any, "mission-1", "report-1");

      expect(researchEventEmitter.emitTaskStarted).toHaveBeenCalled();
    });
  });

  // ─── calculateDynamicConcurrency ────────────────────────────────────────────

  describe("calculateDynamicConcurrency", () => {
    it("should return a positive integer", async () => {
      const result = await (service as any).calculateDynamicConcurrency();
      expect(result).toBeGreaterThan(0);
      expect(Number.isInteger(result)).toBe(true);
    });

    it("should return 4 (MIN) when only one provider", async () => {
      const mocks = buildMocks();
      mocks.mockAiFacade.getAvailableModels.mockResolvedValue([
        { id: "gpt-4o", provider: "openai" },
        { id: "gpt-3.5", provider: "openai" },
      ]);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MissionExecutionService,
          { provide: PrismaService, useValue: mocks.mockPrisma },
          { provide: ResearchEventEmitterService, useValue: mocks.mockResearchEventEmitter },
          { provide: MissionQueryService, useValue: mocks.mockQueryService },
          { provide: DimensionMissionService, useValue: mocks.mockDimensionMissionService },
          { provide: ReportSynthesisService, useValue: mocks.mockReportSynthesisService },
          { provide: AgentActivityService, useValue: mocks.mockAgentActivity },
          { provide: AIEngineFacade, useValue: mocks.mockAiFacade },
          { provide: ResearchReviewerService, useValue: mocks.mockReviewerService },
          { provide: ResearchMemoryService, useValue: mocks.mockResearchMemory },
        ],
      }).compile();
      const svc = module.get<MissionExecutionService>(MissionExecutionService);
      const result = await svc.calculateDynamicConcurrency();
      expect(result).toBe(4); // MIN_CONCURRENCY
    });

    it("should return 6 for two distinct providers", async () => {
      const mocks = buildMocks();
      mocks.mockAiFacade.getAvailableModels.mockResolvedValue([
        { id: "gpt-4o", provider: "openai" },
        { id: "claude-3", provider: "anthropic" },
      ]);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MissionExecutionService,
          { provide: PrismaService, useValue: mocks.mockPrisma },
          { provide: ResearchEventEmitterService, useValue: mocks.mockResearchEventEmitter },
          { provide: MissionQueryService, useValue: mocks.mockQueryService },
          { provide: DimensionMissionService, useValue: mocks.mockDimensionMissionService },
          { provide: ReportSynthesisService, useValue: mocks.mockReportSynthesisService },
          { provide: AgentActivityService, useValue: mocks.mockAgentActivity },
          { provide: AIEngineFacade, useValue: mocks.mockAiFacade },
          { provide: ResearchReviewerService, useValue: mocks.mockReviewerService },
          { provide: ResearchMemoryService, useValue: mocks.mockResearchMemory },
        ],
      }).compile();
      const svc = module.get<MissionExecutionService>(MissionExecutionService);
      const result = await svc.calculateDynamicConcurrency();
      expect(result).toBe(6); // 4 + (2-1)*2
    });

    it("should cap at MAX_CONCURRENCY (8) for many providers", async () => {
      const mocks = buildMocks();
      mocks.mockAiFacade.getAvailableModels.mockResolvedValue([
        { id: "m1", provider: "p1" },
        { id: "m2", provider: "p2" },
        { id: "m3", provider: "p3" },
        { id: "m4", provider: "p4" },
        { id: "m5", provider: "p5" },
      ]);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MissionExecutionService,
          { provide: PrismaService, useValue: mocks.mockPrisma },
          { provide: ResearchEventEmitterService, useValue: mocks.mockResearchEventEmitter },
          { provide: MissionQueryService, useValue: mocks.mockQueryService },
          { provide: DimensionMissionService, useValue: mocks.mockDimensionMissionService },
          { provide: ReportSynthesisService, useValue: mocks.mockReportSynthesisService },
          { provide: AgentActivityService, useValue: mocks.mockAgentActivity },
          { provide: AIEngineFacade, useValue: mocks.mockAiFacade },
          { provide: ResearchReviewerService, useValue: mocks.mockReviewerService },
          { provide: ResearchMemoryService, useValue: mocks.mockResearchMemory },
        ],
      }).compile();
      const svc = module.get<MissionExecutionService>(MissionExecutionService);
      const result = await svc.calculateDynamicConcurrency();
      expect(result).toBe(8); // capped at MAX
    });

    it("should return MIN_CONCURRENCY when getAvailableModels throws", async () => {
      const mocks = buildMocks();
      mocks.mockAiFacade.getAvailableModels.mockRejectedValue(new Error("API unavailable"));
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MissionExecutionService,
          { provide: PrismaService, useValue: mocks.mockPrisma },
          { provide: ResearchEventEmitterService, useValue: mocks.mockResearchEventEmitter },
          { provide: MissionQueryService, useValue: mocks.mockQueryService },
          { provide: DimensionMissionService, useValue: mocks.mockDimensionMissionService },
          { provide: ReportSynthesisService, useValue: mocks.mockReportSynthesisService },
          { provide: AgentActivityService, useValue: mocks.mockAgentActivity },
          { provide: AIEngineFacade, useValue: mocks.mockAiFacade },
          { provide: ResearchReviewerService, useValue: mocks.mockReviewerService },
          { provide: ResearchMemoryService, useValue: mocks.mockResearchMemory },
        ],
      }).compile();
      const svc = module.get<MissionExecutionService>(MissionExecutionService);
      const result = await svc.calculateDynamicConcurrency();
      expect(result).toBe(4); // MIN fallback
    });
  });

  // ─── finalizeMission ────────────────────────────────────────────────────────

  describe("finalizeMission", () => {
    it("should skip when mission is already CANCELLED", async () => {
      prisma.researchMission.findUnique.mockResolvedValue({
        status: ResearchMissionStatus.CANCELLED,
      });
      const mockUpdate = jest.fn();
      prisma.researchMission.update = mockUpdate;

      await service.finalizeMission("mission-1", "topic-1");

      expect(prisma.researchTask.findMany).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("should mark COMPLETED when all tasks succeed", async () => {
      prisma.researchMission.findUnique.mockResolvedValue({
        status: ResearchMissionStatus.EXECUTING,
      });
      prisma.researchTask.findMany.mockResolvedValue([
        { id: "t1", status: ResearchTaskStatus.COMPLETED },
        { id: "t2", status: ResearchTaskStatus.COMPLETED },
      ]);
      prisma.researchMission.update.mockResolvedValue({});

      await service.finalizeMission("mission-1", "topic-1");

      expect(prisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ResearchMissionStatus.COMPLETED }),
        }),
      );
    });

    it("should mark COMPLETED when partial success", async () => {
      prisma.researchMission.findUnique.mockResolvedValue({
        status: ResearchMissionStatus.EXECUTING,
      });
      prisma.researchTask.findMany.mockResolvedValue([
        { id: "t1", status: ResearchTaskStatus.COMPLETED },
        { id: "t2", status: ResearchTaskStatus.FAILED },
      ]);
      prisma.researchMission.update.mockResolvedValue({});

      await service.finalizeMission("mission-1", "topic-1");

      expect(prisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ResearchMissionStatus.COMPLETED }),
        }),
      );
      expect(researchEventEmitter.emitMissionCompleted).toHaveBeenCalled();
    });

    it("should mark FAILED when all tasks fail", async () => {
      prisma.researchMission.findUnique.mockResolvedValue({
        status: ResearchMissionStatus.EXECUTING,
      });
      prisma.researchTask.findMany.mockResolvedValue([
        { id: "t1", status: ResearchTaskStatus.FAILED },
        { id: "t2", status: ResearchTaskStatus.FAILED },
      ]);
      prisma.researchMission.update.mockResolvedValue({});
      prisma.topicReport.findMany.mockResolvedValue([{ id: "empty-report" }]);
      prisma.topicReport.deleteMany = jest.fn().mockResolvedValue({ count: 1 });

      await service.finalizeMission("mission-1", "topic-1");

      expect(prisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ResearchMissionStatus.FAILED }),
        }),
      );
      expect(researchEventEmitter.emitMissionCompleted).not.toHaveBeenCalled();
    });

    it("should clean up empty draft reports on complete failure", async () => {
      prisma.researchMission.findUnique.mockResolvedValue({
        status: ResearchMissionStatus.EXECUTING,
      });
      prisma.researchTask.findMany.mockResolvedValue([
        { id: "t1", status: ResearchTaskStatus.FAILED },
      ]);
      prisma.researchMission.update.mockResolvedValue({});
      const emptyReports = [{ id: "empty-report-1" }, { id: "empty-report-2" }];
      prisma.topicReport.findMany.mockResolvedValue(emptyReports);
      const deleteManyMock = jest.fn().mockResolvedValue({ count: 2 });
      (prisma as any).topicReport.deleteMany = deleteManyMock;

      await service.finalizeMission("mission-1", "topic-1");

      expect(deleteManyMock).toHaveBeenCalled();
    });

    it("should emit emitMissionCompleted on COMPLETED status", async () => {
      prisma.researchMission.findUnique.mockResolvedValue({
        status: ResearchMissionStatus.EXECUTING,
      });
      prisma.researchTask.findMany.mockResolvedValue([
        { id: "t1", status: ResearchTaskStatus.COMPLETED },
      ]);
      prisma.researchMission.update.mockResolvedValue({});

      await service.finalizeMission("mission-1", "topic-1");

      expect(researchEventEmitter.emitMissionCompleted).toHaveBeenCalledWith(
        "topic-1",
        "mission-1",
        expect.any(Number),
        expect.any(Number),
      );
    });
  });

  // ─── executeTask additional paths ───────────────────────────────────────────

  describe("executeTask - extended paths", () => {
    function setupCasSuccess() {
      prisma.researchTask.findUnique.mockResolvedValue({
        status: ResearchTaskStatus.PENDING,
        modelId: null,
        skills: [],
        tools: [],
      });
      prisma.researchMission.findUnique.mockResolvedValue(mockMission);
      prisma.researchTask.updateMany.mockResolvedValue({ count: 1 });
    }

    function setupPostCompletionOk() {
      // After execution: task still EXECUTING, mission still EXECUTING
      prisma.researchTask.findUnique.mockResolvedValueOnce({
        status: ResearchTaskStatus.EXECUTING,
      });
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        status: ResearchMissionStatus.EXECUTING,
      });
    }

    it("should execute dimension_research using executeDimensionMission when dimension found by id", async () => {
      setupCasSuccess();
      setupPostCompletionOk();

      const mockDimService = (service as any).dimensionMissionService;
      mockDimService.executeDimensionMission = jest.fn().mockResolvedValue({
        success: true,
        analysisResult: {
          summary: "Test summary",
          keyFindings: [],
          trends: [],
          challenges: [],
          opportunities: [],
          evidenceUsed: 2,
          confidenceLevel: "high",
          detailedContent: "details",
          figureReferences: [],
          generatedCharts: [],
        },
        evidenceIds: [],
        actualModelId: "gpt-4o",
        extractedClaims: [],
        dimensionId: "dim-1",
      });

      await service.executeTask(
        mockPendingTask as any,
        mockTopic as any,
        "mission-1",
        "report-1",
      );

      expect(researchEventEmitter.emitTaskStarted).toHaveBeenCalled();
      expect(queryService.updateTaskStatus).toHaveBeenCalledWith(
        "task-1",
        ResearchTaskStatus.COMPLETED,
        expect.any(Object),
      );
    });

    it("should skip completion update when task became FAILED during execution", async () => {
      setupCasSuccess();

      const mockDimService = (service as any).dimensionMissionService;
      mockDimService.executeDimensionMission = jest.fn().mockResolvedValue({
        success: true,
        analysisResult: { summary: "done", keyFindings: [], trends: [], challenges: [], opportunities: [], evidenceUsed: 0, confidenceLevel: "medium", detailedContent: "", figureReferences: [], generatedCharts: [] },
        evidenceIds: [],
        dimensionId: "dim-1",
      });

      // Post-execution: task has been cancelled (FAILED)
      prisma.researchTask.findUnique.mockResolvedValueOnce({
        status: ResearchTaskStatus.FAILED,
      });
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        status: ResearchMissionStatus.EXECUTING,
      });

      await service.executeTask(
        mockPendingTask as any,
        mockTopic as any,
        "mission-1",
        "report-1",
      );

      // Should not call updateTaskStatus with COMPLETED
      expect(queryService.updateTaskStatus).not.toHaveBeenCalledWith(
        expect.anything(),
        ResearchTaskStatus.COMPLETED,
        expect.anything(),
      );
    });

    it("should skip completion update when mission became CANCELLED during execution", async () => {
      setupCasSuccess();

      const mockDimService = (service as any).dimensionMissionService;
      mockDimService.executeDimensionMission = jest.fn().mockResolvedValue({
        success: true,
        analysisResult: { summary: "done", keyFindings: [], trends: [], challenges: [], opportunities: [], evidenceUsed: 0, confidenceLevel: "medium", detailedContent: "", figureReferences: [], generatedCharts: [] },
        evidenceIds: [],
        dimensionId: "dim-1",
      });

      // Post-execution: mission was cancelled
      prisma.researchTask.findUnique.mockResolvedValueOnce({
        status: ResearchTaskStatus.EXECUTING,
      });
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        status: ResearchMissionStatus.CANCELLED,
      });

      await service.executeTask(
        mockPendingTask as any,
        mockTopic as any,
        "mission-1",
        "report-1",
      );

      expect(queryService.updateTaskStatus).not.toHaveBeenCalled();
    });

    it("should handle dimension not found by creating generic dimension", async () => {
      setupCasSuccess();

      const topicWithNoDims = {
        ...mockTopic,
        dimensions: [],
      };

      // DB query also returns null
      prisma.researchTask.findUnique.mockResolvedValueOnce(null); // no topicDimension.findUnique
      const mockTopicDimension = {
        findFirst: jest.fn().mockResolvedValue({ sortOrder: 1 }),
        create: jest.fn().mockResolvedValue({
          id: "dim-new",
          name: "Market Analysis",
          description: "Dim description",
          topicId: "topic-1",
          status: "PENDING",
          searchQueries: ["market"],
          searchSources: ["web"],
        }),
        findUnique: jest.fn().mockResolvedValue(null),
      };
      (prisma as any).topicDimension = mockTopicDimension;

      const mockDimService = (service as any).dimensionMissionService;
      mockDimService.executeDimensionMission = jest.fn().mockResolvedValue({
        success: true,
        analysisResult: { summary: "done", keyFindings: [], trends: [], challenges: [], opportunities: [], evidenceUsed: 0, confidenceLevel: "medium", detailedContent: "", figureReferences: [], generatedCharts: [] },
        evidenceIds: [],
        dimensionId: "dim-new",
      });

      // Restore task findUnique properly
      prisma.researchTask.findUnique.mockReset();
      prisma.researchTask.findUnique.mockResolvedValueOnce({
        status: ResearchTaskStatus.PENDING,
        modelId: null,
        skills: [],
        tools: [],
      });
      prisma.researchMission.findUnique.mockReset();
      prisma.researchMission.findUnique.mockResolvedValueOnce(mockMission);
      prisma.researchTask.updateMany.mockResolvedValueOnce({ count: 1 });

      // Post completion
      prisma.researchTask.findUnique.mockResolvedValueOnce({
        status: ResearchTaskStatus.EXECUTING,
      });
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        status: ResearchMissionStatus.EXECUTING,
      });

      await service.executeTask(
        mockPendingTask as any,
        topicWithNoDims as any,
        "mission-1",
        "report-1",
      );

      // Should have proceeded through the flow
      expect(researchEventEmitter.emitTaskStarted).toHaveBeenCalled();
    });

    it("should handle task execution failure by updating to FAILED", async () => {
      prisma.researchTask.findUnique.mockResolvedValue({
        status: ResearchTaskStatus.PENDING,
        modelId: null,
        skills: [],
        tools: [],
      });
      prisma.researchMission.findUnique.mockResolvedValue(mockMission);
      prisma.researchTask.updateMany.mockResolvedValue({ count: 1 });

      // emitTaskStarted throws to trigger error handler
      researchEventEmitter.emitTaskStarted.mockRejectedValue(new Error("API Error"));

      await service.executeTask(
        mockPendingTask as any,
        mockTopic as any,
        "mission-1",
        "report-1",
      );

      expect(queryService.updateTaskStatus).toHaveBeenCalledWith(
        "task-1",
        ResearchTaskStatus.FAILED,
        expect.objectContaining({ resultSummary: expect.stringContaining("失败") }),
      );
    });

    it("should use result.content as summary when result.summary is missing", async () => {
      setupCasSuccess();
      setupPostCompletionOk();

      const mockDimService = (service as any).dimensionMissionService;
      mockDimService.executeDimensionMission = jest.fn().mockResolvedValue({
        success: true,
        analysisResult: {
          // no summary field directly, but detailedContent will be in result
          content: "Content-only result without summary",
          keyFindings: [],
          trends: [],
          challenges: [],
          opportunities: [],
          evidenceUsed: 0,
          confidenceLevel: "medium",
          detailedContent: "Details here",
          figureReferences: [],
          generatedCharts: [],
        },
        evidenceIds: [],
        dimensionId: "dim-1",
      });

      await service.executeTask(
        mockPendingTask as any,
        mockTopic as any,
        "mission-1",
        "report-1",
      );

      expect(queryService.updateTaskStatus).toHaveBeenCalledWith(
        "task-1",
        ResearchTaskStatus.COMPLETED,
        expect.any(Object),
      );
    });
  });

  // ─── resumeExecutionForNewTask ───────────────────────────────────────────────

  describe("resumeExecutionForNewTask", () => {
    it("returns true when mission is EXECUTING (loop will pick up)", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        status: ResearchMissionStatus.EXECUTING,
      });

      const result = await service.resumeExecutionForNewTask("mission-1", "topic-1");

      expect(result).toBe(true);
    });

    it("returns false when mission not found", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce(null);

      const result = await service.resumeExecutionForNewTask("mission-1", "topic-1");

      expect(result).toBe(false);
    });

    it("returns false when mission is CANCELLED", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        status: ResearchMissionStatus.CANCELLED,
      });

      const result = await service.resumeExecutionForNewTask("mission-1", "topic-1");

      expect(result).toBe(false);
    });

    it("returns false when mission is COMPLETED with no pending tasks", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        status: ResearchMissionStatus.COMPLETED,
      });
      prisma.researchTask.findMany.mockResolvedValueOnce([]);

      const result = await service.resumeExecutionForNewTask("mission-1", "topic-1");

      expect(result).toBe(false);
    });

    it("returns true and restarts execution when COMPLETED with pending tasks", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        status: ResearchMissionStatus.COMPLETED,
      });
      prisma.researchTask.findMany.mockResolvedValueOnce([
        { id: "new-task", status: ResearchTaskStatus.PENDING },
      ]);
      prisma.researchMission.update.mockResolvedValue({});

      // For startExecution triggered asynchronously - needs to not hang
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.CANCELLED, // causes scheduler to exit
      });
      prisma.researchTask.findMany.mockResolvedValue([]);
      queryService.getExecutableTasks.mockResolvedValue([]);
      prisma.researchTask.count.mockResolvedValue(0);

      const result = await service.resumeExecutionForNewTask("mission-1", "topic-1");

      expect(result).toBe(true);
      expect(prisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ResearchMissionStatus.EXECUTING },
        }),
      );
    });

    it("returns true and restarts execution when FAILED with pending tasks", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        status: ResearchMissionStatus.FAILED,
      });
      prisma.researchTask.findMany.mockResolvedValueOnce([
        { id: "new-task", status: ResearchTaskStatus.PENDING },
      ]);
      prisma.researchMission.update.mockResolvedValue({});

      // For async startExecution
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.CANCELLED,
      });
      prisma.researchTask.findMany.mockResolvedValue([]);
      queryService.getExecutableTasks.mockResolvedValue([]);
      prisma.researchTask.count.mockResolvedValue(0);

      const result = await service.resumeExecutionForNewTask("mission-1", "topic-1");

      expect(result).toBe(true);
    });
  });

  // ─── addAgentToLeaderPlan ────────────────────────────────────────────────────

  describe("addAgentToLeaderPlan", () => {
    it("should add new agent when mission has no leaderPlan", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        leaderPlan: null,
      });
      prisma.researchMission.update.mockResolvedValue({});

      await service.addAgentToLeaderPlan("mission-1", {
        agentId: "agent-new",
        agentName: "新研究员",
        agentType: "dimension_researcher",
        role: "研究员",
        modelId: "gpt-4o",
        skills: ["web_search"],
        tools: ["search"],
      });

      expect(prisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mission-1" },
        }),
      );
    });

    it("should update existing agent when agentId is in leaderPlan", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        leaderPlan: {
          taskUnderstanding: { topic: "test", scope: "", objectives: [] },
          dimensions: [],
          executionStrategy: { parallelism: 5, priorityOrder: [] },
          agentAssignments: [
            {
              agentId: "agent-existing",
              agentName: "旧名称",
              agentType: "dimension_researcher",
              role: "旧角色",
              modelId: "old-model",
              skills: [],
              tools: [],
            },
          ],
        },
      });
      prisma.researchMission.update.mockResolvedValue({});

      await service.addAgentToLeaderPlan("mission-1", {
        agentId: "agent-existing",
        agentName: "新名称",
        agentType: "dimension_researcher",
        modelId: "new-model",
      });

      expect(prisma.researchMission.update).toHaveBeenCalled();
    });

    it("should do nothing when mission not found", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce(null);

      await service.addAgentToLeaderPlan("missing-mission", {
        agentId: "agent-1",
        agentType: "dimension_researcher",
      });

      expect(prisma.researchMission.update).not.toHaveBeenCalled();
    });

    it("should not throw on database error", async () => {
      prisma.researchMission.findUnique.mockRejectedValue(new Error("DB error"));

      await expect(
        service.addAgentToLeaderPlan("mission-1", {
          agentId: "agent-1",
          agentType: "dimension_researcher",
        }),
      ).resolves.not.toThrow();
    });
  });

  // ─── continueExecution ───────────────────────────────────────────────────────

  describe("continueExecution", () => {
    it("should throw when mission not found", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce(null);

      await expect(service.continueExecution("missing")).rejects.toThrow(
        "Mission missing not found",
      );
    });

    it("should throw when mission status is not EXECUTING", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        status: ResearchMissionStatus.COMPLETED,
        topicId: "topic-1",
        tasks: [],
      });

      await expect(service.continueExecution("mission-1")).rejects.toThrow(
        "not in EXECUTING status",
      );
    });

    it("should reset EXECUTING tasks to PENDING", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        id: "mission-1",
        status: ResearchMissionStatus.EXECUTING,
        topicId: "topic-1",
        tasks: [{ id: "exec-task-1" }, { id: "exec-task-2" }],
      });
      prisma.researchTask.count
        .mockResolvedValueOnce(1) // completed
        .mockResolvedValueOnce(3); // total

      // startExecution needs these to not hang
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.CANCELLED,
      });
      queryService.getExecutableTasks.mockResolvedValue([]);
      prisma.researchTask.findMany.mockResolvedValue([]);
      prisma.researchTask.count.mockResolvedValue(0);

      await service.continueExecution("mission-1");

      expect(prisma.researchTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["exec-task-1", "exec-task-2"] } },
          data: { status: ResearchTaskStatus.PENDING, startedAt: null },
        }),
      );
    });

    it("should not call updateMany when no EXECUTING tasks", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        id: "mission-1",
        status: ResearchMissionStatus.EXECUTING,
        topicId: "topic-1",
        tasks: [], // empty
      });
      prisma.researchTask.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(5);

      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.CANCELLED,
      });
      queryService.getExecutableTasks.mockResolvedValue([]);
      prisma.researchTask.findMany.mockResolvedValue([]);
      prisma.researchTask.count.mockResolvedValue(0);

      await service.continueExecution("mission-1");

      expect(prisma.researchTask.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── executeDynamicScheduler ─────────────────────────────────────────────────

  describe("executeDynamicScheduler", () => {
    it("should exit immediately when mission not found", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce(null);

      const executor = jest.fn();
      await service.executeDynamicScheduler("mission-1", 5, executor);

      expect(executor).not.toHaveBeenCalled();
    });

    it("should exit when mission is CANCELLED", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        status: ResearchMissionStatus.CANCELLED,
      });

      const executor = jest.fn();
      await service.executeDynamicScheduler("mission-1", 5, executor);

      expect(executor).not.toHaveBeenCalled();
    });

    it("should exit when no executable tasks and no pending tasks", async () => {
      prisma.researchMission.findUnique.mockResolvedValueOnce({
        status: ResearchMissionStatus.EXECUTING,
      });
      queryService.getExecutableTasks.mockResolvedValueOnce([]);
      prisma.researchTask.count.mockResolvedValueOnce(0); // no pending

      const executor = jest.fn();
      await service.executeDynamicScheduler("mission-1", 5, executor);

      expect(executor).not.toHaveBeenCalled();
    });

    it("should execute a task when available and exit when done", async () => {
      // First loop: mission ok, one task
      prisma.researchMission.findUnique
        .mockResolvedValueOnce({ status: ResearchMissionStatus.EXECUTING })
        .mockResolvedValueOnce({ status: ResearchMissionStatus.CANCELLED }); // exit

      const task1 = {
        id: "sched-task-1",
        title: "Scheduled Task",
        ...mockPendingTask,
      };
      queryService.getExecutableTasks
        .mockResolvedValueOnce([task1])
        .mockResolvedValueOnce([]); // after task completes

      prisma.researchTask.count.mockResolvedValueOnce(0); // no pending after task done

      const executor = jest.fn().mockResolvedValue(undefined);

      await service.executeDynamicScheduler("mission-1", 5, executor);

      expect(executor).toHaveBeenCalledWith(task1);
    });
  });

  // ─── startExecution additional paths ────────────────────────────────────────

  describe("startExecution - additional", () => {
    it("should copy evidence when completed tasks exist with previous report", async () => {
      prisma.researchTopic.findUnique.mockResolvedValueOnce(mockTopic);
      prisma.researchMission.findUnique
        .mockResolvedValueOnce({ researchDepth: "standard" })
        .mockResolvedValueOnce({ status: ResearchMissionStatus.CANCELLED }); // scheduler exit

      // completed tasks found
      prisma.researchTask.findMany.mockResolvedValueOnce([
        { id: "completed-t1", status: ResearchTaskStatus.COMPLETED },
      ]);

      // previous report with evidences
      prisma.topicReport.findFirst.mockResolvedValueOnce({
        id: "prev-report",
        evidences: [
          {
            id: "ev-1",
            title: "Evidence",
            url: "https://example.com",
            domain: "example.com",
            snippet: "snippet",
            sourceType: "web",
            publishedAt: null,
            credibilityScore: 80,
            citationIndex: 1,
            analysisId: null,
          },
        ],
      });

      prisma.topicEvidence.createMany.mockResolvedValue({ count: 1 });
      queryService.getExecutableTasks.mockResolvedValue([]);
      prisma.researchTask.count.mockResolvedValue(0);
      prisma.researchMission.update.mockResolvedValue({});
      prisma.researchTask.findMany.mockResolvedValue([]);

      await service.startExecution("mission-1", "topic-1");

      expect(prisma.topicEvidence.createMany).toHaveBeenCalled();
    });

    it("should skip evidence copy when no previous report with evidences", async () => {
      prisma.researchTopic.findUnique.mockResolvedValueOnce(mockTopic);
      prisma.researchMission.findUnique
        .mockResolvedValueOnce({ researchDepth: "standard" })
        .mockResolvedValueOnce({ status: ResearchMissionStatus.CANCELLED });

      prisma.researchTask.findMany.mockResolvedValueOnce([
        { id: "completed-t1", status: ResearchTaskStatus.COMPLETED },
      ]);
      prisma.topicReport.findFirst.mockResolvedValueOnce(null); // no previous report

      queryService.getExecutableTasks.mockResolvedValue([]);
      prisma.researchTask.count.mockResolvedValue(0);
      prisma.researchMission.update.mockResolvedValue({});
      prisma.researchTask.findMany.mockResolvedValue([]);

      await service.startExecution("mission-1", "topic-1");

      expect(prisma.topicEvidence.createMany).not.toHaveBeenCalled();
    });
  });
});
