/**
 * MissionExecutionService Unit Tests
 *
 * Tests for mission execution, task scheduling, and dynamic concurrency
 * Type checking is disabled due to Jest mock compatibility issues.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { MissionExecutionService } from "../../services/core/mission-execution.service";
import { ResearchEventEmitterService } from "../../services/core/research-event-emitter.service";
import { MissionQueryService } from "../../services/core/mission-query.service";
import { ResearchMemoryService } from "../../services/core/research-memory.service";
import { DimensionMissionService } from "../../services/dimension/dimension-mission.service";
import { ReportSynthesisService } from "../../services/report/report-synthesis.service";
import { AgentActivityService } from "../../services/monitoring/agent-activity.service";
import { ResearchReviewerService } from "../../services/collaboration/research-reviewer.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { DataSourceFetcherService } from "../../services/data/data-source-fetcher.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ResearchMissionStatus, ResearchTaskStatus } from "@prisma/client";

import {
  createMockPrisma,
  createMockAiEngineFacade,
  createMockResearchEventEmitter,
  createMockAgentActivityService,
} from "../mocks";

import {
  MOCK_TOPIC,
  MOCK_TASK_EXECUTING,
  MOCK_TASK_COMPLETED,
  createMockTask,
} from "../fixtures/topics.fixture";

describe("MissionExecutionService", () => {
  let service: MissionExecutionService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let researchEventEmitter: ReturnType<typeof createMockResearchEventEmitter>;
  let queryService: any;
  let dimensionMissionService: any;
  let reportSynthesisService: any;
  let agentActivity: ReturnType<typeof createMockAgentActivityService>;
  let aiFacade: ReturnType<typeof createMockAiEngineFacade>;
  let reviewerService: any;

  beforeEach(async () => {
    // Create mock services
    prisma = createMockPrisma();
    researchEventEmitter = createMockResearchEventEmitter();
    agentActivity = createMockAgentActivityService();
    aiFacade = createMockAiEngineFacade();

    queryService = {
      updateTaskStatus: jest.fn().mockResolvedValue(undefined),
      getExecutableTasks: jest.fn().mockResolvedValue([]),
      emitProgress: jest.fn(),
      getAgentRoleFromTaskType: jest.fn().mockReturnValue("researcher"),
      getAgentNameFromTaskType: jest.fn().mockReturnValue("研究员"),
    };

    dimensionMissionService = {
      executeDimensionMission: jest.fn().mockResolvedValue({
        success: true,
        analysisResult: {
          summary: "Test analysis",
          keyFindings: ["Finding 1", "Finding 2"],
          evidenceUsed: 5,
          confidenceLevel: "high",
          detailedContent: "Detailed analysis content",
        },
      }),
    };

    reportSynthesisService = {
      createDraftReport: jest.fn().mockResolvedValue({ id: "report-123" }),
      synthesizeReport: jest.fn().mockResolvedValue({
        fullReport: "Complete report",
        executiveSummary: "Summary",
        chapters: [{ title: "Chapter 1" }],
      }),
      saveDimensionAnalysis: jest.fn().mockResolvedValue(undefined),
    };

    reviewerService = {
      reviewDimension: jest.fn().mockResolvedValue({
        qualityLevel: "good",
        overallScore: 85,
        scores: { depth: 80, accuracy: 90, coverage: 85 },
        issues: [],
        suggestions: ["Great work"],
        needsReresearch: false,
      }),
      reviewOverall: jest.fn().mockResolvedValue({
        qualityLevel: "excellent",
        overallScore: 90,
        recommendations: ["Continue this approach"],
        needsReresearch: false,
      }),
      validateClaims: jest.fn().mockResolvedValue({
        stats: { verified: 5, disputed: 0, unverified: 1 },
      }),
      factCheckReport: jest.fn().mockResolvedValue({
        accuracyScore: 95,
        citations: [],
        issues: [],
      }),
    };

    const mockResearchMemoryService = {
      extractAndStoreFindings: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MissionExecutionService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ResearchEventEmitterService,
          useValue: researchEventEmitter,
        },
        { provide: MissionQueryService, useValue: queryService },
        { provide: ResearchMemoryService, useValue: mockResearchMemoryService },
        { provide: DimensionMissionService, useValue: dimensionMissionService },
        { provide: ReportSynthesisService, useValue: reportSynthesisService },
        { provide: AgentActivityService, useValue: agentActivity },
        { provide: ChatFacade, useValue: aiFacade },
        { provide: ResearchReviewerService, useValue: reviewerService },
        {
          provide: DataSourceFetcherService,
          useValue: { executeSearch: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<MissionExecutionService>(MissionExecutionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== startExecution Tests ====================

  describe("startExecution", () => {
    it("should initiate execution and create draft report", async () => {
      // Arrange
      const missionId = "mission-123";
      const topicId = "topic-123";

      const topicWithDimensions = {
        ...MOCK_TOPIC,
        dimensions: [{ id: "dim-1", name: "Dimension 1", description: "Test" }],
      };

      prisma.researchTopic.findUnique.mockResolvedValue(topicWithDimensions);
      prisma.researchMission.findUnique.mockResolvedValue({
        researchDepth: "standard",
      });
      prisma.researchTask.findMany.mockResolvedValue([]);
      prisma.topicReport.findFirst.mockResolvedValue(null);
      aiFacade.getAvailableModels.mockResolvedValue([
        { id: "gpt-4o-mini", provider: "openai", isAvailable: true },
      ]);

      // Mock executeDynamicScheduler to resolve immediately
      jest
        .spyOn(service, "executeDynamicScheduler")
        .mockResolvedValue(undefined);
      jest.spyOn(service, "finalizeMission").mockResolvedValue(undefined);

      // Act
      await service.startExecution(missionId, topicId);

      // Assert
      expect(prisma.researchTopic.findUnique).toHaveBeenCalledWith({
        where: { id: topicId },
        include: { dimensions: true },
      });
      expect(reportSynthesisService.createDraftReport).toHaveBeenCalledWith(
        topicId,
      );
      expect(service.executeDynamicScheduler).toHaveBeenCalled();
      expect(service.finalizeMission).toHaveBeenCalledWith(missionId, topicId);
    });

    it("should throw error if topic not found", async () => {
      // Arrange
      prisma.researchTopic.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.startExecution("mission-123", "topic-123"),
      ).rejects.toThrow("Topic topic-123 not found");
    });

    it("should copy evidence from previous report in incremental mode", async () => {
      // Arrange
      const missionId = "mission-123";
      const topicId = "topic-123";

      const topicWithDimensions = {
        ...MOCK_TOPIC,
        dimensions: [],
      };

      const previousReport = {
        id: "old-report",
        evidences: [
          {
            id: "evidence-1",
            title: "Source 1",
            url: "http://example.com",
            domain: "example.com",
            snippet: "Test",
            sourceType: "web",
            publishedAt: new Date(),
            credibilityScore: 0.8,
            citationIndex: 1,
            analysisId: "analysis-1",
          },
        ],
      };

      prisma.researchTopic.findUnique.mockResolvedValue(topicWithDimensions);
      prisma.researchMission.findUnique.mockResolvedValue({
        researchDepth: "standard",
      });
      prisma.researchTask.findMany.mockResolvedValue([MOCK_TASK_COMPLETED]);
      prisma.topicReport.findFirst.mockResolvedValue(previousReport);
      prisma.topicEvidence.createMany.mockResolvedValue({ count: 1 });
      aiFacade.getAvailableModels.mockResolvedValue([
        { id: "gpt-4o-mini", provider: "openai" },
      ]);

      jest
        .spyOn(service, "executeDynamicScheduler")
        .mockResolvedValue(undefined);
      jest.spyOn(service, "finalizeMission").mockResolvedValue(undefined);

      // Act
      await service.startExecution(missionId, topicId);

      // Assert
      expect(prisma.topicEvidence.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            reportId: "report-123",
            title: "Source 1",
            citationIndex: 1,
          }),
        ]),
      });
    });
  });

  // ==================== calculateDynamicConcurrency Tests ====================

  describe("calculateDynamicConcurrency", () => {
    it("should return minimum concurrency for single provider", async () => {
      // Arrange
      aiFacade.getAvailableModels.mockResolvedValue([
        { id: "gpt-4o-mini", provider: "openai" },
      ]);

      // Act
      const concurrency = await service.calculateDynamicConcurrency();

      // Assert
      expect(concurrency).toBe(4); // MIN_CONCURRENCY = 4
    });

    it("should return higher concurrency for multiple providers", async () => {
      // Arrange
      aiFacade.getAvailableModels.mockResolvedValue([
        { id: "gpt-4o-mini", provider: "openai" },
        { id: "claude-3", provider: "anthropic" },
      ]);

      // Act
      const concurrency = await service.calculateDynamicConcurrency();

      // Assert
      expect(concurrency).toBe(6); // Base 4 + (2-1)*2 = 6
    });

    it("should cap concurrency at maximum limit", async () => {
      // Arrange
      aiFacade.getAvailableModels.mockResolvedValue([
        { id: "model-1", provider: "provider-1" },
        { id: "model-2", provider: "provider-2" },
        { id: "model-3", provider: "provider-3" },
        { id: "model-4", provider: "provider-4" },
        { id: "model-5", provider: "provider-5" },
      ]);

      // Act
      const concurrency = await service.calculateDynamicConcurrency();

      // Assert
      expect(concurrency).toBe(8); // MAX_CONCURRENCY = 8
    });

    it("should return minimum concurrency on error", async () => {
      // Arrange
      aiFacade.getAvailableModels.mockRejectedValue(new Error("API error"));

      // Act
      const concurrency = await service.calculateDynamicConcurrency();

      // Assert
      expect(concurrency).toBe(4); // Fallback to MIN_CONCURRENCY = 4
    });
  });

  // ==================== finalizeMission Tests ====================

  describe("finalizeMission", () => {
    it("should update mission status to COMPLETED when tasks succeed", async () => {
      // Arrange
      const missionId = "mission-123";
      const topicId = "topic-123";

      prisma.researchMission.findUnique.mockResolvedValue({
        status: ResearchMissionStatus.EXECUTING,
      });
      prisma.researchTask.findMany.mockResolvedValue([
        { ...MOCK_TASK_COMPLETED, status: ResearchTaskStatus.COMPLETED },
        {
          ...MOCK_TASK_COMPLETED,
          id: "task-2",
          status: ResearchTaskStatus.COMPLETED,
        },
      ]);
      prisma.researchMission.updateMany.mockResolvedValue({ count: 1 });

      // Act
      await service.finalizeMission(missionId, topicId);

      // Assert
      expect(prisma.researchMission.updateMany).toHaveBeenCalledWith({
        where: {
          id: missionId,
          status: { not: ResearchMissionStatus.CANCELLED },
        },
        data: expect.objectContaining({
          status: ResearchMissionStatus.COMPLETED,
          completedTasks: 2,
          progressPercent: 100,
          completedAt: expect.any(Date),
        }),
      });
      expect(queryService.emitProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          missionId,
          topicId,
          status: ResearchMissionStatus.COMPLETED,
          progress: 100,
        }),
      );
    });

    it("should update status to FAILED when all tasks fail", async () => {
      // Arrange
      const missionId = "mission-123";
      const topicId = "topic-123";

      prisma.researchMission.findUnique.mockResolvedValue({
        status: ResearchMissionStatus.EXECUTING,
      });
      prisma.researchTask.findMany.mockResolvedValue([
        { ...MOCK_TASK_COMPLETED, status: ResearchTaskStatus.FAILED },
        {
          ...MOCK_TASK_COMPLETED,
          id: "task-2",
          status: ResearchTaskStatus.FAILED,
        },
      ]);
      prisma.topicReport.findMany.mockResolvedValue([{ id: "empty-report-1" }]);
      prisma.topicReport.deleteMany.mockResolvedValue({ count: 1 });
      prisma.researchMission.updateMany.mockResolvedValue({ count: 1 });

      // Act
      await service.finalizeMission(missionId, topicId);

      // Assert
      expect(prisma.researchMission.updateMany).toHaveBeenCalledWith({
        where: {
          id: missionId,
          status: { not: ResearchMissionStatus.CANCELLED },
        },
        data: expect.objectContaining({
          status: ResearchMissionStatus.FAILED,
          completedTasks: 0,
        }),
      });
    });

    it("should mark as COMPLETED even with partial failures", async () => {
      // Arrange
      const missionId = "mission-123";
      const topicId = "topic-123";

      prisma.researchMission.findUnique.mockResolvedValue({
        status: ResearchMissionStatus.EXECUTING,
      });
      prisma.researchTask.findMany.mockResolvedValue([
        { ...MOCK_TASK_COMPLETED, status: ResearchTaskStatus.COMPLETED },
        {
          ...MOCK_TASK_COMPLETED,
          id: "task-2",
          status: ResearchTaskStatus.FAILED,
        },
      ]);

      // Act
      await service.finalizeMission(missionId, topicId);

      // Assert
      expect(prisma.researchMission.updateMany).toHaveBeenCalledWith({
        where: {
          id: missionId,
          status: { not: ResearchMissionStatus.CANCELLED },
        },
        data: expect.objectContaining({
          status: ResearchMissionStatus.COMPLETED, // Partial success counts as success
          completedTasks: 1,
        }),
      });
    });

    it("should skip finalization if mission is already cancelled", async () => {
      // Arrange
      const missionId = "mission-123";
      const topicId = "topic-123";

      prisma.researchMission.findUnique.mockResolvedValue({
        status: ResearchMissionStatus.CANCELLED,
      });

      // Act
      await service.finalizeMission(missionId, topicId);

      // Assert
      expect(prisma.researchMission.updateMany).not.toHaveBeenCalled();
      expect(queryService.emitProgress).not.toHaveBeenCalled();
    });

    it("should clean up empty draft reports on complete failure", async () => {
      // Arrange
      const missionId = "mission-123";
      const topicId = "topic-123";

      prisma.researchMission.findUnique.mockResolvedValue({
        status: ResearchMissionStatus.EXECUTING,
      });
      prisma.researchTask.findMany.mockResolvedValue([
        { ...MOCK_TASK_COMPLETED, status: ResearchTaskStatus.FAILED },
      ]);
      prisma.topicReport.findMany.mockResolvedValue([
        { id: "draft-1" },
        { id: "draft-2" },
      ]);
      prisma.topicReport.deleteMany.mockResolvedValue({ count: 2 });

      // Act
      await service.finalizeMission(missionId, topicId);

      // Assert
      expect(prisma.topicReport.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["draft-1", "draft-2"] } },
      });
    });
  });

  // ==================== executeTask Tests ====================

  describe("executeTask", () => {
    it("should execute dimension_research task successfully", async () => {
      // Arrange
      const task = createMockTask({
        taskType: "dimension_research",
        dimensionId: "dim-1",
        dimensionName: "Market Analysis",
        assignedAgent: "researcher-1",
      });

      const topicWithDimensions = {
        ...MOCK_TOPIC,
        id: "topic-123",
        dimensions: [
          {
            id: "dim-1",
            name: "Market Analysis",
            description: "Test dimension",
          },
        ],
      };

      prisma.researchTask.updateMany.mockResolvedValue({ count: 1 });
      prisma.researchTask.findUnique
        .mockResolvedValueOnce({
          status: ResearchTaskStatus.PENDING,
          modelId: "gpt-4o-mini",
          skills: ["deep_dive"],
          tools: ["web-search"],
        })
        .mockResolvedValueOnce({
          status: ResearchTaskStatus.EXECUTING,
        });
      prisma.researchMission.findUnique
        .mockResolvedValueOnce({
          status: ResearchMissionStatus.EXECUTING,
          leaderPlan: {
            agentAssignments: [
              {
                agentId: "researcher-1",
                modelId: "gpt-4o-mini",
                skills: ["deep_dive"],
                tools: ["web-search"],
              },
            ],
          },
          researchDepth: "standard",
        })
        .mockResolvedValueOnce({
          status: ResearchMissionStatus.EXECUTING,
        });

      // Act
      await service.executeTask(
        task as any,
        topicWithDimensions as any,
        "mission-123",
        "report-123",
      );

      // Assert
      // Status update to EXECUTING is done via updateMany (atomic CAS), not updateTaskStatus
      expect(prisma.researchTask.updateMany).toHaveBeenCalledWith({
        where: {
          id: task.id,
          status: ResearchTaskStatus.PENDING,
        },
        data: { status: ResearchTaskStatus.EXECUTING },
      });
      expect(
        dimensionMissionService.executeDimensionMission,
      ).toHaveBeenCalled();
      // Only COMPLETED status update goes through updateTaskStatus
      expect(queryService.updateTaskStatus).toHaveBeenCalledWith(
        task.id,
        ResearchTaskStatus.COMPLETED,
        expect.objectContaining({
          result: expect.any(Object),
        }),
      );
    });

    it("should skip execution if task is already cancelled", async () => {
      // Arrange
      const task = createMockTask();

      prisma.researchTask.findUnique.mockResolvedValue({
        status: ResearchTaskStatus.FAILED,
      });

      // Act
      await service.executeTask(
        task as any,
        MOCK_TOPIC as any,
        "mission-123",
        "report-123",
      );

      // Assert
      expect(queryService.updateTaskStatus).not.toHaveBeenCalled();
      expect(
        dimensionMissionService.executeDimensionMission,
      ).not.toHaveBeenCalled();
    });

    it("should skip execution if mission is cancelled", async () => {
      // Arrange
      const task = createMockTask();

      prisma.researchTask.findUnique.mockResolvedValue({
        status: ResearchTaskStatus.PENDING,
      });
      prisma.researchMission.findUnique.mockResolvedValue({
        status: ResearchMissionStatus.CANCELLED,
      });

      // Act
      await service.executeTask(
        task as any,
        MOCK_TOPIC as any,
        "mission-123",
        "report-123",
      );

      // Assert
      expect(queryService.updateTaskStatus).not.toHaveBeenCalled();
      expect(
        dimensionMissionService.executeDimensionMission,
      ).not.toHaveBeenCalled();
    });

    it("should handle task failure and update status", async () => {
      // Arrange
      const task = createMockTask({
        taskType: "dimension_research",
        dimensionId: "dim-1",
        assignedAgent: "researcher-1",
      });

      const topicWithDimensions = {
        ...MOCK_TOPIC,
        id: "topic-123",
        dimensions: [
          { id: "dim-1", name: "Test Dimension", description: "Test" },
        ],
      };

      prisma.researchTask.updateMany.mockResolvedValue({ count: 1 });
      prisma.researchTask.findUnique.mockResolvedValue({
        status: ResearchTaskStatus.PENDING,
        modelId: "gpt-4o-mini",
        skills: [],
        tools: [],
      });
      prisma.researchMission.findUnique.mockResolvedValue({
        status: ResearchMissionStatus.EXECUTING,
        leaderPlan: {
          agentAssignments: [
            {
              agentId: "researcher-1",
              modelId: "gpt-4o-mini",
            },
          ],
        },
        researchDepth: "standard",
      });
      dimensionMissionService.executeDimensionMission.mockRejectedValue(
        new Error("API Error"),
      );

      // Act
      await service.executeTask(
        task as any,
        topicWithDimensions as any,
        "mission-123",
        "report-123",
      );

      // Assert
      expect(queryService.updateTaskStatus).toHaveBeenCalledWith(
        task.id,
        ResearchTaskStatus.FAILED,
        expect.objectContaining({
          result: { error: "API Error" },
        }),
      );
    });
  });

  // ==================== continueExecution Tests ====================

  describe("continueExecution", () => {
    it("should reset EXECUTING tasks to PENDING and restart execution", async () => {
      // Arrange
      const missionId = "mission-123";

      const mission = {
        id: missionId,
        topicId: "topic-123",
        status: ResearchMissionStatus.EXECUTING,
        topic: MOCK_TOPIC,
        tasks: [
          { ...MOCK_TASK_EXECUTING, id: "task-1" },
          { ...MOCK_TASK_EXECUTING, id: "task-2" },
        ],
      };

      prisma.researchMission.findUnique.mockResolvedValue(mission);
      prisma.researchTask.updateMany.mockResolvedValue({ count: 2 });
      prisma.researchTask.count
        .mockResolvedValueOnce(1) // completedCount
        .mockResolvedValueOnce(3); // totalCount

      jest.spyOn(service, "startExecution").mockResolvedValue(undefined);

      // Act
      await service.continueExecution(missionId);

      // Assert
      expect(prisma.researchTask.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["task-1", "task-2"] } },
        data: {
          status: ResearchTaskStatus.PENDING,
          startedAt: null,
        },
      });
      expect(researchEventEmitter.emitMissionProgress).toHaveBeenCalledWith(
        "topic-123",
        expect.objectContaining({
          missionId,
          progress: expect.any(Number),
          phase: "executing",
        }),
      );
      expect(service.startExecution).toHaveBeenCalledWith(
        missionId,
        "topic-123",
      );
    });

    it("should throw error if mission not found", async () => {
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
        id: "mission-123",
        status: ResearchMissionStatus.COMPLETED,
        tasks: [],
      });

      // Act & Assert
      await expect(service.continueExecution("mission-123")).rejects.toThrow(
        "not in EXECUTING status",
      );
    });
  });
});
