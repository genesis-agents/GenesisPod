/**
 * DimensionMissionService Unit Tests
 *
 * Coverage targets:
 * - executeSearchPhase: updates dimension status, calls data pipeline
 * - executeDimensionMission: happy path, error handling, dimension status updates
 */

import { Test, TestingModule } from "@nestjs/testing";
import { DimensionMissionService } from "../dimension-mission.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ResearchLeaderService } from "../../core/research-leader.service";
import { SectionWriterService } from "../section-writer.service";
import { DataSourceRouterService } from "../../data/data-source-router.service";
import { ResearchEventEmitterService } from "../../core/research-event-emitter.service";
import { AgentActivityService } from "../../monitoring/agent-activity.service";
import { DataEnrichmentService } from "../../data/data-enrichment.service";
import { LeaderToolService } from "../../data/leader-tool.service";
import { MissionObservabilityService } from "../../core/mission-observability.service";
import { DimensionStatus } from "@prisma/client";
import type { ResearchTopic, TopicDimension } from "@prisma/client";

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

const mockTopic: ResearchTopic = {
  id: "topic-001",
  name: "半导体行业分析",
  type: "industry_analysis",
  description: "半导体行业竞争格局",
  language: "zh",
  userId: "user-001",
  topicConfig: null,
  status: "ACTIVE",
  visibility: "PRIVATE",
  createdAt: new Date(),
  updatedAt: new Date(),
  searchConfig: null,
  scheduledAt: null,
  refreshInterval: null,
  lastRefreshedAt: null,
  totalTokens: 0,
  totalSources: 0,
  totalDimensions: 0,
  isTemplate: false,
  templateCategory: null,
  templateDescription: null,
  shareToken: null,
  sharedAt: null,
  tags: [],
} as unknown as ResearchTopic;

const mockDimension: TopicDimension = {
  id: "dim-001",
  topicId: "topic-001",
  name: "市场竞争格局",
  description: "分析市场份额和竞争动态",
  status: "PENDING",
  sortOrder: 1,
  searchQueries: ["semiconductor market share 2024"],
  searchSources: ["web"],
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as TopicDimension;

const mockEnrichedResult = {
  id: "result-001",
  title: "半导体市场分析报告",
  url: "https://example.com/semiconductor-2024",
  domain: "example.com",
  sourceType: "WEB",
  content: "英伟达、英特尔、AMD 三大巨头占据 70% 市场份额...",
  snippet: "市场分析摘要",
  publishedAt: new Date("2024-01-15"),
  credibilityScore: 0.85,
  metadata: {},
  figures: [],
  charts: [],
};

// Minimal SectionWriteResult compatible with the interface
const mockSectionResult = {
  sectionId: "section-001",
  title: "市场概况",
  content: "## 市场概况\n\n英伟达占据 GPU 市场 80% 份额...",
  wordCount: 100,
  referencesUsed: [],
  generatedCharts: [],
  figureReferences: [],
};

// Outline with executionPlan.parallelGroups required by writeSectionsWithReview
const mockOutline = {
  dimensionName: "市场竞争格局",
  sections: [
    {
      id: "section-001",
      title: "市场概况",
      description: "概述市场规模",
      keyPoints: [],
      allocatedFigures: [],
    },
    {
      id: "section-002",
      title: "竞争对手分析",
      description: "主要厂商分析",
      keyPoints: [],
      allocatedFigures: [],
    },
  ],
  researchObjective: "分析市场竞争格局",
  keyThemes: ["市场份额", "竞争优势"],
  intentUnderstanding: {
    coreQuestion: "半导体市场的竞争格局如何？",
    scope: { included: ["市场份额", "竞争策略"], excluded: [] },
    expectedDepth: "comprehensive",
  },
  executionPlan: {
    parallelGroups: [["section-001"], ["section-002"]],
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Mock factory
// ──────────────────────────────────────────────────────────────────────────────

function buildMocks() {
  // Mock $transaction to execute the callback with a tx that mirrors the mock Prisma tables
  const mockTopicEvidenceTx = {
    aggregate: jest.fn().mockResolvedValue({ _max: { citationIndex: 0 } }),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([{ id: "ev-001", citationIndex: 1 }]),
  };
  const mockResearchMissionTx = {
    update: jest.fn().mockResolvedValue({}),
  };

  const mockPrisma = {
    topicDimension: {
      update: jest
        .fn()
        .mockResolvedValue({ id: "dim-001", status: "RESEARCHING" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    researchMission: {
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          topicEvidence: mockTopicEvidenceTx,
          researchMission: mockResearchMissionTx,
        };
        return fn(tx);
      }),
  };

  const mockLeaderService = {
    planDimensionOutline: jest.fn().mockResolvedValue(mockOutline),
    reviewSectionOutput: jest.fn().mockResolvedValue({
      approved: true,
      feedback: "章节内容充实，逻辑清晰",
      score: 85,
    }),
    integrateDimensionResults: jest.fn().mockResolvedValue({
      content: "## 市场竞争格局\n\n综合分析内容...",
      metadata: {
        summary: "半导体市场由英伟达主导",
        keyFindings: ["英伟达 GPU 份额超 80%"],
      },
    }),
    extractClaims: jest.fn().mockResolvedValue([]),
  };

  const mockSectionWriter = {
    writeSection: jest.fn(),
    writeSectionWithRevisions: jest.fn().mockResolvedValue(mockSectionResult),
    writeSectionsParallel: jest.fn().mockResolvedValue([mockSectionResult]),
  };

  const mockDataSourceRouter = {
    fetchDataForDimension: jest.fn(),
    scanLiteratureBaseline: jest.fn().mockResolvedValue(undefined),
  };

  const mockEventEmitter = {
    emitLeaderThinking: jest.fn().mockResolvedValue(undefined),
    emitLeaderPlanReady: jest.fn().mockResolvedValue(undefined),
    emitAgentWorking: jest.fn().mockResolvedValue(undefined),
    emitDimensionProgress: jest.fn().mockResolvedValue(undefined),
    emitDimensionResearchProgress: jest.fn().mockResolvedValue(undefined),
    emitMissionProgress: jest.fn().mockResolvedValue(undefined),
  };

  const mockAgentActivity = {
    startThinkingPhase: jest.fn().mockResolvedValue(undefined),
    endThinkingPhase: jest.fn().mockResolvedValue(undefined),
    recordActivity: jest.fn().mockResolvedValue(undefined),
    recordReviewActivity: jest.fn().mockResolvedValue(undefined),
  };

  const mockDataEnrichment = {
    enrichSearchResults: jest.fn(),
    getEnrichmentStats: jest.fn(),
  };

  const mockLeaderTool = {
    generateEnhancedPlanningContext: jest.fn(),
  };

  return {
    mockPrisma,
    mockLeaderService,
    mockSectionWriter,
    mockDataSourceRouter,
    mockEventEmitter,
    mockAgentActivity,
    mockDataEnrichment,
    mockLeaderTool,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("DimensionMissionService", () => {
  let service: DimensionMissionService;
  let mockPrisma: ReturnType<typeof buildMocks>["mockPrisma"];
  let mockLeaderService: ReturnType<typeof buildMocks>["mockLeaderService"];
  let mockSectionWriter: ReturnType<typeof buildMocks>["mockSectionWriter"];
  let mockDataSourceRouter: ReturnType<
    typeof buildMocks
  >["mockDataSourceRouter"];
  let mockEventEmitter: ReturnType<typeof buildMocks>["mockEventEmitter"];
  let mockAgentActivity: ReturnType<typeof buildMocks>["mockAgentActivity"];
  let mockDataEnrichment: ReturnType<typeof buildMocks>["mockDataEnrichment"];
  let mockLeaderTool: ReturnType<typeof buildMocks>["mockLeaderTool"];

  beforeEach(async () => {
    const mocks = buildMocks();
    mockPrisma = mocks.mockPrisma;
    mockLeaderService = mocks.mockLeaderService;
    mockSectionWriter = mocks.mockSectionWriter;
    mockDataSourceRouter = mocks.mockDataSourceRouter;
    mockEventEmitter = mocks.mockEventEmitter;
    mockAgentActivity = mocks.mockAgentActivity;
    mockDataEnrichment = mocks.mockDataEnrichment;
    mockLeaderTool = mocks.mockLeaderTool;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DimensionMissionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ResearchLeaderService, useValue: mockLeaderService },
        { provide: SectionWriterService, useValue: mockSectionWriter },
        { provide: DataSourceRouterService, useValue: mockDataSourceRouter },
        { provide: ResearchEventEmitterService, useValue: mockEventEmitter },
        { provide: AgentActivityService, useValue: mockAgentActivity },
        { provide: DataEnrichmentService, useValue: mockDataEnrichment },
        { provide: LeaderToolService, useValue: mockLeaderTool },
        {
          provide: MissionObservabilityService,
          useValue: {
            recordResearchCost: jest.fn(),
            emitKernelEvent: jest.fn(),
            logError: jest.fn(),
            recordMissionMetrics: jest.fn(),
            startMissionTrace: jest.fn().mockReturnValue(null),
            addPhaseSpan: jest.fn().mockReturnValue(null),
            endPhaseSpan: jest.fn(),
            endMissionTrace: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DimensionMissionService>(DimensionMissionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ============================================================
  // executeSearchPhase
  // ============================================================

  describe("executeSearchPhase", () => {
    function setupSearchPhase() {
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [mockEnrichedResult],
        sources: ["web"],
        metadata: { searchQuery: "semiconductor market share 2024" },
      });

      mockDataEnrichment.enrichSearchResults.mockResolvedValue([
        mockEnrichedResult,
      ]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 500,
        invalidUrls: 0,
        validUrls: 1,
      });

      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "额外上下文：最新市场数据显示英伟达 GPU 需求持续增长",
      });
    }

    it("should update dimension status to RESEARCHING at start", async () => {
      setupSearchPhase();

      await service.executeSearchPhase(mockTopic, mockDimension, "mission-001");

      expect(mockPrisma.topicDimension.update).toHaveBeenCalledWith({
        where: { id: "dim-001" },
        data: { status: DimensionStatus.RESEARCHING },
      });
    });

    it("should call fetchDataForDimension with dimension and topic", async () => {
      setupSearchPhase();

      await service.executeSearchPhase(mockTopic, mockDimension);

      expect(mockDataSourceRouter.fetchDataForDimension).toHaveBeenCalledWith(
        mockDimension,
        mockTopic,
        expect.objectContaining({
          assignedTools: undefined,
          assignedSkills: undefined,
        }),
      );
    });

    it("should enrich search results with data enrichment service", async () => {
      setupSearchPhase();

      await service.executeSearchPhase(mockTopic, mockDimension);

      expect(mockDataEnrichment.enrichSearchResults).toHaveBeenCalledWith(
        [mockEnrichedResult],
        expect.objectContaining({
          topN: expect.any(Number),
          enableFigures: expect.any(Boolean),
        }),
      );
    });

    it("should return search phase result with correct shape", async () => {
      setupSearchPhase();

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      expect(result).toMatchObject({
        dimensionId: "dim-001",
        dimensionName: "市场竞争格局",
        enrichedResults: expect.any(Array),
        evidenceData: expect.any(Array),
        evidenceSummary: expect.any(String),
        searchResultsRecord: expect.objectContaining({ total: 1, filtered: 1 }),
        temporalContext: expect.objectContaining({
          currentDate: expect.any(String),
        }),
      });
    });

    it("should pass assignedTools and assignedSkills to data source router", async () => {
      setupSearchPhase();

      await service.executeSearchPhase(
        mockTopic,
        mockDimension,
        "mission-001",
        "gpt-4o",
        "task-001",
        ["academic-search", "web-search"],
        ["deep_dive", "synthesis"],
      );

      expect(mockDataSourceRouter.fetchDataForDimension).toHaveBeenCalledWith(
        mockDimension,
        mockTopic,
        expect.objectContaining({
          assignedTools: ["academic-search", "web-search"],
          assignedSkills: ["deep_dive", "synthesis"],
        }),
      );
    });

    it("should emit agent activity at start of search", async () => {
      setupSearchPhase();

      await service.executeSearchPhase(mockTopic, mockDimension, "mission-001");

      expect(mockAgentActivity.startThinkingPhase).toHaveBeenCalledWith(
        expect.objectContaining({
          topicId: "topic-001",
          dimensionId: "dim-001",
          dimensionName: "市场竞争格局",
        }),
      );
    });

    it("should handle leader context gathering failure gracefully", async () => {
      setupSearchPhase();
      mockLeaderTool.generateEnhancedPlanningContext.mockRejectedValue(
        new Error("Leader tool unavailable"),
      );

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      // Should complete successfully despite leader context failure
      expect(result).toBeDefined();
      expect(result.leaderContextSummary).toBe("");
    });

    it("should use enrichmentTopN from topicConfig when specified", async () => {
      const topicWithConfig = {
        ...mockTopic,
        topicConfig: { enrichmentTopN: 10, enrichmentMaxLength: 5000 },
      } as unknown as ResearchTopic;

      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [],
        sources: ["web"],
        metadata: {},
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 0,
        fetched: 0,
        avgContentLength: 0,
        invalidUrls: 0,
        validUrls: 0,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      await service.executeSearchPhase(topicWithConfig, mockDimension);

      expect(mockDataEnrichment.enrichSearchResults).toHaveBeenCalledWith(
        [],
        expect.objectContaining({ topN: 10, maxContentLength: 5000 }),
      );
    });

    it("should disable figures when enableFigures is false in topicConfig", async () => {
      const topicNoFigures = {
        ...mockTopic,
        topicConfig: { enableFigures: false },
      } as unknown as ResearchTopic;

      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [],
        sources: ["web"],
        metadata: {},
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 0,
        fetched: 0,
        avgContentLength: 0,
        invalidUrls: 0,
        validUrls: 0,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      await service.executeSearchPhase(topicNoFigures, mockDimension);

      expect(mockDataEnrichment.enrichSearchResults).toHaveBeenCalledWith(
        [],
        expect.objectContaining({ enableFigures: false }),
      );
    });
  });

  // ============================================================
  // executeDimensionMission
  // ============================================================

  describe("executeDimensionMission", () => {
    function setupFullMission() {
      // Search phase setup
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [mockEnrichedResult],
        sources: ["web"],
        metadata: { searchQuery: "semiconductor market" },
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([
        mockEnrichedResult,
      ]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 500,
        invalidUrls: 0,
        validUrls: 1,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      // Leader outline (already set as default in buildMocks)
      // writeSectionsParallel (already set as default in buildMocks)
    }

    it("should update dimension status to RESEARCHING at start", async () => {
      setupFullMission();

      mockPrisma.topicDimension.update
        .mockResolvedValueOnce({ id: "dim-001", status: "RESEARCHING" })
        .mockResolvedValueOnce({ id: "dim-001", status: "COMPLETED" });

      await service.executeDimensionMission(mockTopic, mockDimension);

      expect(mockPrisma.topicDimension.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dim-001" },
          data: { status: DimensionStatus.RESEARCHING },
        }),
      );
    });

    it("should update dimension status to FAILED on error", async () => {
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      mockDataSourceRouter.fetchDataForDimension.mockRejectedValue(
        new Error("Search service unavailable"),
      );

      const result = await service.executeDimensionMission(
        mockTopic,
        mockDimension,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Search service unavailable");

      expect(mockPrisma.topicDimension.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dim-001" },
          data: { status: DimensionStatus.FAILED },
        }),
      );
    });

    it("should return DimensionMissionResult with success=true on happy path", async () => {
      setupFullMission();

      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      const result = await service.executeDimensionMission(
        mockTopic,
        mockDimension,
        "report-001",
        "mission-001",
        "gpt-4o",
      );

      expect(result.success).toBe(true);
      expect(result.dimensionId).toBe("dim-001");
    });

    it("should pass modelId through the mission pipeline", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      await service.executeDimensionMission(
        mockTopic,
        mockDimension,
        "report-001",
        "mission-001",
        "claude-3-opus",
      );

      // Leader outline should have been called for this dimension
      expect(mockLeaderService.planDimensionOutline).toHaveBeenCalled();
    });

    it("should run literature baseline scan when maxRevisionRounds > 0", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      await service.executeDimensionMission(
        mockTopic,
        mockDimension,
        undefined, // reportId
        undefined, // missionId
        undefined, // modelId
        undefined, // taskId
        undefined, // assignedTools
        undefined, // assignedSkills
        2, // maxRevisionRounds = 2 triggers literature scan
      );

      expect(mockDataSourceRouter.scanLiteratureBaseline).toHaveBeenCalledWith(
        mockTopic,
        mockDimension,
      );
    });

    it("should skip literature baseline scan when maxRevisionRounds is 0", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      await service.executeDimensionMission(
        mockTopic,
        mockDimension,
        undefined, // reportId
        undefined, // missionId
        undefined, // modelId
        undefined, // taskId
        undefined, // assignedTools
        undefined, // assignedSkills
        0, // maxRevisionRounds = 0, skip scan
      );

      expect(
        mockDataSourceRouter.scanLiteratureBaseline,
      ).not.toHaveBeenCalled();
    });

    it("should continue mission even if literature scan fails", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      mockDataSourceRouter.scanLiteratureBaseline.mockRejectedValue(
        new Error("Literature scan failed"),
      );

      const result = await service.executeDimensionMission(
        mockTopic,
        mockDimension,
        undefined, // reportId
        undefined, // missionId
        undefined, // modelId
        undefined, // taskId
        undefined, // assignedTools
        undefined, // assignedSkills
        2, // maxRevisionRounds triggers scan attempt
      );

      // Should still succeed despite literature scan failure
      expect(result.success).toBe(true);
    });

    it("should query all dimensions for Leader to avoid cross-dimension repetition", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      mockPrisma.topicDimension.findMany.mockResolvedValue([
        { name: "市场竞争格局", description: "主维度" },
        { name: "技术发展趋势", description: "技术维度" },
      ]);

      await service.executeDimensionMission(mockTopic, mockDimension);

      expect(mockPrisma.topicDimension.findMany).toHaveBeenCalledWith({
        where: { topicId: "topic-001" },
        select: { name: true, description: true },
      });
    });

    it("should call writeSectionsParallel for each parallel group", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      // Two parallel groups => two calls to writeSectionsParallel
      mockSectionWriter.writeSectionsParallel
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-001", title: "市场概况" },
        ])
        .mockResolvedValueOnce([
          {
            ...mockSectionResult,
            sectionId: "section-002",
            title: "竞争对手分析",
          },
        ]);

      await service.executeDimensionMission(mockTopic, mockDimension);

      // Called once per parallel group (2 groups in mockOutline)
      expect(mockSectionWriter.writeSectionsParallel).toHaveBeenCalledTimes(2);
    });

    it("should call integrateDimensionResults with written sections", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      await service.executeDimensionMission(mockTopic, mockDimension);

      expect(mockLeaderService.integrateDimensionResults).toHaveBeenCalledWith(
        expect.objectContaining({ name: "市场竞争格局" }),
        expect.any(Array),
        "zh",
      );
    });

    it("should extract claims from written sections", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      await service.executeDimensionMission(mockTopic, mockDimension);

      // extractClaims called per section result
      expect(mockLeaderService.extractClaims).toHaveBeenCalled();
    });

    it("should save evidence and return evidenceIds when reportId provided", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      // Provide a $transaction mock for saveEvidence
      const mockTopicEvidenceTx = {
        aggregate: jest.fn().mockResolvedValue({ _max: { citationIndex: 0 } }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "ev-saved-1", citationIndex: 1 }]),
      };
      mockPrisma.$transaction.mockImplementationOnce(
        async (fn: (tx: unknown) => unknown) => {
          return fn({ topicEvidence: mockTopicEvidenceTx });
        },
      );

      const result = await service.executeDimensionMission(
        mockTopic,
        mockDimension,
        "report-001",
      );

      expect(result.success).toBe(true);
    });

    it("should handle claim extraction failure gracefully (non-fatal)", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });
      mockLeaderService.extractClaims.mockRejectedValue(
        new Error("Claim extraction failed"),
      );

      const result = await service.executeDimensionMission(
        mockTopic,
        mockDimension,
      );

      expect(result.success).toBe(true);
      expect(result.extractedClaims).toEqual([]);
    });

    it("should update dimension status to COMPLETED on success", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      await service.executeDimensionMission(mockTopic, mockDimension);

      expect(mockPrisma.topicDimension.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dim-001" },
          data: expect.objectContaining({ status: "COMPLETED" }),
        }),
      );
    });

    it("should handle section review rejection and revision (revisionCount++)", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      // Reject first, approve second
      mockLeaderService.reviewSectionOutput
        .mockResolvedValueOnce({
          approved: false,
          score: 50,
          feedback: "Needs work",
          revisionInstructions: "Expand coverage",
        })
        .mockResolvedValueOnce({
          approved: true,
          score: 85,
          feedback: "Good",
          revisionInstructions: null,
        })
        .mockResolvedValueOnce({
          approved: true,
          score: 88,
          feedback: "Good",
          revisionInstructions: null,
        });

      // Use the injected mockSectionWriter (from test scope)
      mockSectionWriter.reviseSection = jest
        .fn()
        .mockResolvedValue(mockSectionResult);

      const result = await service.executeDimensionMission(
        mockTopic,
        mockDimension,
      );

      expect(result.success).toBe(true);
      expect(mockSectionWriter.reviseSection).toHaveBeenCalled();
    });

    it("should pass missionId to emitProgress (emitDimensionResearchProgress)", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      await service.executeDimensionMission(
        mockTopic,
        mockDimension,
        undefined,
        "mission-123",
      );

      expect(mockEventEmitter.emitDimensionResearchProgress).toHaveBeenCalled();
    });

    it("should update mission heartbeat when missionId provided", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });
      mockPrisma.researchMission = { update: jest.fn().mockResolvedValue({}) };

      await service.executeDimensionMission(
        mockTopic,
        mockDimension,
        undefined,
        "mission-123",
      );

      expect(mockPrisma.researchMission.update).toHaveBeenCalled();
    });

    it("should handle revision failure gracefully in writeSectionsWithReview", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      // Reject section always
      mockLeaderService.reviewSectionOutput.mockResolvedValue({
        approved: false,
        score: 40,
        feedback: "Poor",
        revisionInstructions: "Redo everything",
      });
      mockSectionWriter.reviseSection = jest
        .fn()
        .mockRejectedValue(new Error("Revision failed"));

      const result = await service.executeDimensionMission(
        mockTopic,
        mockDimension,
      );

      // Should still succeed despite revision failure
      expect(result.success).toBe(true);
    });

    it("should handle outline with maxRevisionRounds=0 (skip review)", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      const result = await service.executeDimensionMission(
        mockTopic,
        mockDimension,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        0, // maxRevisionRounds = 0 → no reviews
      );

      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // executeSearchPhase additional branches
  // ============================================================

  describe("executeSearchPhase - additional branches", () => {
    function setupSearchPhase() {
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [mockEnrichedResult],
        sources: ["web"],
        metadata: { searchQuery: "semiconductor market share 2024" },
      });

      mockDataEnrichment.enrichSearchResults.mockResolvedValue([
        mockEnrichedResult,
      ]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 500,
        invalidUrls: 0,
        validUrls: 1,
      });

      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "额外上下文：最新市场数据显示英伟达 GPU 需求持续增长",
      });
    }

    it("should log warning when enrichment stats has invalid URLs", async () => {
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [mockEnrichedResult],
        sources: ["web"],
        metadata: { searchQuery: "semiconductor" },
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([
        mockEnrichedResult,
      ]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 300,
        invalidUrls: 2, // > 0 triggers warn
        validUrls: 1,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      expect(result).toBeDefined();
    });

    it("should generate freshnessInfo when enriched results have publishedAt dates", async () => {
      const enrichedWithDate = {
        ...mockEnrichedResult,
        publishedAt: new Date("2024-01-15"),
      };
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [enrichedWithDate],
        sources: ["web"],
        metadata: { searchQuery: "semiconductor" },
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([
        enrichedWithDate,
      ]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 500,
        invalidUrls: 0,
        validUrls: 1,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      expect(result.searchResultsRecord.freshnessInfo).toBeDefined();
    });

    it("should handle publishedAt as Date object", async () => {
      const enrichedWithDateObj = {
        ...mockEnrichedResult,
        publishedAt: new Date("2024-06-01"),
      };
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [enrichedWithDateObj],
        sources: ["web"],
        metadata: {},
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([
        enrichedWithDateObj,
      ]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 300,
        invalidUrls: 0,
        validUrls: 1,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      expect(result.searchResultsRecord.freshnessInfo).toBeDefined();
    });

    it("should handle publishedAt as invalid date string", async () => {
      const enrichedWithBadDate = {
        ...mockEnrichedResult,
        publishedAt: "not-a-date",
      };
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [enrichedWithBadDate],
        sources: ["web"],
        metadata: {},
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([
        enrichedWithBadDate,
      ]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 300,
        invalidUrls: 0,
        validUrls: 1,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      expect(result.searchResultsRecord.freshnessInfo).toBeUndefined();
    });

    it("should include leaderContextSummary in evidenceSummary when non-empty", async () => {
      setupSearchPhase();

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      expect(result.evidenceSummary).toContain("最新背景");
    });

    it("should NOT include leaderContextSummary section when empty", async () => {
      setupSearchPhase();
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      expect(result.evidenceSummary).not.toContain("最新背景");
    });

    it("should build figuresSummary when evidence has extractedFigures", async () => {
      const enrichedWithFigures = {
        ...mockEnrichedResult,
        extractedFigures: [
          {
            type: "image",
            imageUrl: "https://img.com/fig.png",
            caption: "Market Share Chart",
            alt: "chart",
          },
        ],
        publishedAt: null,
      };
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [enrichedWithFigures],
        sources: ["web"],
        metadata: {},
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([
        enrichedWithFigures,
      ]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 300,
        invalidUrls: 0,
        validUrls: 1,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      expect(result.figuresSummary).toContain("Market Share Chart");
    });

    it("should build figuresSummary with over 20 figures (truncate + suffix)", async () => {
      // 25 figures to test > 20 truncation
      const enrichedWith25Figs = {
        ...mockEnrichedResult,
        extractedFigures: Array.from({ length: 25 }, (_, i) => ({
          type: "image",
          imageUrl: `https://img.com/fig${i}.png`,
          caption: `Caption ${i}`,
          alt: `alt ${i}`,
        })),
        publishedAt: null,
      };
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [enrichedWith25Figs],
        sources: ["web"],
        metadata: {},
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([
        enrichedWith25Figs,
      ]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 300,
        invalidUrls: 0,
        validUrls: 1,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      expect(result.figuresSummary).toContain("还有");
    });

    it("should return empty figuresSummary when no extractedFigures", async () => {
      setupSearchPhase();

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      expect(result.figuresSummary).toBe("");
    });

    it("should include knowledgeBaseInfo when knowledgeBaseIds present", async () => {
      const topicWithKBConfig = {
        ...mockTopic,
        topicConfig: {
          knowledgeBaseIds: ["kb-001", "kb-002"],
          enrichmentTopN: 5,
          enrichmentMaxLength: 3000,
        },
      } as unknown as typeof mockTopic;

      const localResult = {
        ...mockEnrichedResult,
        sourceType: "local",
        metadata: {
          knowledgeBaseSource: true,
          similarity: 0.92,
          documentId: "doc-001",
        },
      };
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [localResult],
        sources: ["local"],
        metadata: {},
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([localResult]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 300,
        invalidUrls: 0,
        validUrls: 1,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      const result = await service.executeSearchPhase(
        topicWithKBConfig,
        mockDimension,
      );

      expect(result.searchResultsRecord.knowledgeBaseInfo?.enabled).toBe(true);
    });

    it("should return searchTimeRange from topicConfig", async () => {
      const topicWithTimeRange = {
        ...mockTopic,
        topicConfig: { searchTimeRange: "last_year" },
      } as unknown as typeof mockTopic;

      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [],
        sources: [],
        metadata: {},
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 0,
        fetched: 0,
        avgContentLength: 0,
        invalidUrls: 0,
        validUrls: 0,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      const result = await service.executeSearchPhase(
        topicWithTimeRange,
        mockDimension,
      );

      expect(result.temporalContext.currentDate).toBeDefined();
    });

    it("should handle source with publishedAt throwing error (catch path in searchResultsRecord)", async () => {
      // Item with a publishedAt that's a Date object (no throw) then invalid one
      const enrichedMixed = [
        { ...mockEnrichedResult, publishedAt: new Date("2024-01-15") },
        { ...mockEnrichedResult, id: "result-002", publishedAt: null },
      ];
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: enrichedMixed,
        sources: ["web"],
        metadata: {},
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue(enrichedMixed);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 2,
        fetched: 2,
        avgContentLength: 300,
        invalidUrls: 0,
        validUrls: 2,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      expect(result.searchResultsRecord.sources?.length).toBeGreaterThanOrEqual(
        1,
      );
    });

    it("should include knowledgeBase metadata in sources (isKnowledgeBase=true)", async () => {
      const localResult = {
        ...mockEnrichedResult,
        sourceType: "local",
        metadata: {
          knowledgeBaseSource: true,
          similarity: 0.88,
          documentId: "doc-xyz",
        },
      };
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [localResult],
        sources: ["local"],
        metadata: {},
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([localResult]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 300,
        invalidUrls: 0,
        validUrls: 1,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      const firstSource = result.searchResultsRecord.sources?.[0];
      expect(firstSource?.isKnowledgeBase).toBe(true);
      expect(firstSource?.similarity).toBe(0.88);
      expect(firstSource?.documentId).toBe("doc-xyz");
    });

    it("should emit agent working event at end of search phase", async () => {
      setupSearchPhase();

      await service.executeSearchPhase(mockTopic, mockDimension, "mission-001");

      expect(mockEventEmitter.emitAgentWorking).toHaveBeenCalledWith(
        "topic-001",
        expect.objectContaining({ status: "working" }),
        "mission-001",
      );
    });
  });

  // ============================================================
  // executeWritingPhase in dimension-mission context
  // ============================================================

  describe("executeWritingPhase (standalone call)", () => {
    function setupForWritingPhase() {
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });
      mockSectionWriter.writeSectionsParallel.mockResolvedValue([
        mockSectionResult,
      ]);
      mockLeaderService.reviewSectionOutput.mockResolvedValue({
        approved: true,
        feedback: "Good",
        score: 85,
      });
      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: "## 市场竞争格局\n\n综合分析内容...",
        metadata: {
          summary: "半导体市场由英伟达主导",
          keyFindings: ["英伟达 GPU 份额超 80%"],
          confidenceLevel: 0.8,
        },
      });
    }

    const mockSearchPhaseResult = {
      dimensionId: "dim-001",
      dimensionName: "市场竞争格局",
      enrichedResults: [],
      evidenceData: [],
      evidenceSummary: "No evidence",
      searchResultsRecord: {},
      temporalContext: {
        currentDate: "2025年1月19日",
        freshnessRequirement: "",
      },
      figuresSummary: "",
      leaderContextSummary: "",
    };

    it("should return success result from standalone executeWritingPhase", async () => {
      setupForWritingPhase();

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
      );

      expect(result.success).toBe(true);
      expect(result.dimensionId).toBe("dim-001");
    });

    it("should update dimension status to FAILED when writing phase throws", async () => {
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });
      mockSectionWriter.writeSectionsParallel.mockResolvedValue([
        mockSectionResult,
      ]);
      mockLeaderService.reviewSectionOutput.mockResolvedValue({
        approved: true,
        feedback: "OK",
        score: 80,
      });
      mockLeaderService.integrateDimensionResults.mockRejectedValue(
        new Error("Integrate failed"),
      );

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Integrate failed");
      expect(mockPrisma.topicDimension.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "FAILED" },
        }),
      );
    });

    it("should save evidence when reportId provided in executeWritingPhase", async () => {
      setupForWritingPhase();

      const evidenceData = [
        {
          id: "ev-001",
          title: "Evidence 1",
          url: "http://example.com",
          domain: "example.com",
          snippet: "snippet",
          sourceType: "web",
          publishedAt: null,
        },
      ];

      const searchResultWithEvidence = {
        ...mockSearchPhaseResult,
        evidenceData,
      };

      const mockTopicEvidenceTx = {
        aggregate: jest.fn().mockResolvedValue({ _max: { citationIndex: 0 } }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "saved-ev-001", citationIndex: 1 }]),
      };
      mockPrisma.$transaction.mockImplementationOnce(
        async (fn: (tx: unknown) => unknown) => {
          return fn({ topicEvidence: mockTopicEvidenceTx });
        },
      );

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        searchResultWithEvidence,
        mockOutline,
        "report-001",
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("should handle validateAllocatedFigures with valid figures", async () => {
      setupForWritingPhase();

      const evidenceData = [
        {
          id: "ev-001",
          title: "Evidence 1",
          url: "http://example.com",
          domain: "example.com",
          snippet: "snippet",
          sourceType: "web",
          publishedAt: null,
          extractedFigures: [
            {
              imageUrl: "http://img.com/fig.png",
              caption: "Chart 1",
              alt: "alt",
            },
          ],
        },
      ];

      const sectionWithFigures = {
        ...mockOutline.sections[0],
        allocatedFigures: [
          {
            evidenceIndex: 1,
            figureIndex: 0,
            imageUrl: "http://img.com/fig.png",
            caption: "Chart 1",
          },
        ],
      };
      const outlineWithFigures = {
        ...mockOutline,
        sections: [sectionWithFigures, mockOutline.sections[1]],
      };

      const searchResultWithEvidence = {
        ...mockSearchPhaseResult,
        evidenceData,
      };

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        searchResultWithEvidence,
        outlineWithFigures,
      );

      expect(result.success).toBe(true);
    });

    it("should extract actual model ID from last section result", async () => {
      setupForWritingPhase();
      mockSectionWriter.writeSectionsParallel
        .mockResolvedValueOnce([
          { ...mockSectionResult, actualModelId: "gpt-4-turbo" },
        ])
        .mockResolvedValueOnce([
          { ...mockSectionResult, actualModelId: "claude-3-opus" },
        ]);

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
      );

      expect(result.success).toBe(true);
      expect(result.actualModelId).toBe("claude-3-opus");
    });

    it("should call emitAgentWorking when writing completes", async () => {
      setupForWritingPhase();

      await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
      );

      expect(mockEventEmitter.emitAgentWorking).toHaveBeenCalledWith(
        "topic-001",
        expect.objectContaining({ status: "completed" }),
        expect.any(String),
      );
    });

    it("should pass assignedSkills to section writer via writeInputs", async () => {
      setupForWritingPhase();

      const assignedSkills = ["deep_dive", "synthesis"];

      await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
        undefined, // reportId
        undefined, // missionId
        undefined, // modelId
        undefined, // taskId
        undefined, // assignedTools
        assignedSkills,
      );

      // writeSectionsParallel should have been called with inputs that include assignedSkills
      expect(mockSectionWriter.writeSectionsParallel).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ assignedSkills })]),
      );
    });
  });

  // ============================================================
  // emitProgress helper (mission heartbeat)
  // ============================================================

  describe("emitProgress (mission heartbeat)", () => {
    function setupFullMission() {
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [mockEnrichedResult],
        sources: ["web"],
        metadata: { searchQuery: "semiconductor" },
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([
        mockEnrichedResult,
      ]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 500,
        invalidUrls: 0,
        validUrls: 1,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });
    }

    it("should attempt mission heartbeat update when missionId provided", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });
      mockPrisma.researchMission = { update: jest.fn().mockResolvedValue({}) };

      await service.executeDimensionMission(
        mockTopic,
        mockDimension,
        undefined,
        "mission-xyz",
      );

      expect(mockPrisma.researchMission.update).toHaveBeenCalled();
    });

    it("should handle mission heartbeat failure gracefully (non-fatal)", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });
      mockPrisma.researchMission = {
        update: jest.fn().mockRejectedValue(new Error("Mission not found")),
      };

      // Should not throw despite heartbeat failure
      const result = await service.executeDimensionMission(
        mockTopic,
        mockDimension,
        undefined,
        "mission-xyz",
      );

      expect(result.success).toBe(true);
    });

    it("should compute progress from stageProgress override when provided", async () => {
      setupFullMission();
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });

      // Passing stageProgress=5 in emitProgress (via planning stage) — just verify no crash
      await service.executeSearchPhase(
        mockTopic,
        mockDimension,
        "mission-001",
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(mockEventEmitter.emitDimensionResearchProgress).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Chart/figure deduplication in executeWritingPhase (lines 907-922)
  // ============================================================

  describe("chart and figure deduplication in executeWritingPhase", () => {
    const mockSearchPhaseResult = {
      dimensionId: "dim-001",
      dimensionName: "市场竞争格局",
      enrichedResults: [],
      evidenceData: [],
      evidenceSummary: "No evidence",
      searchResultsRecord: {},
      temporalContext: {
        currentDate: "2025年1月19日",
        freshnessRequirement: "",
      },
      figuresSummary: "",
      leaderContextSummary: "",
    };

    beforeEach(() => {
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });
      mockLeaderService.reviewSectionOutput.mockResolvedValue({
        approved: true,
        feedback: "Good",
        score: 85,
      });
      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: "## Analysis\n\nContent here.",
        metadata: {
          summary: "Summary",
          keyFindings: ["Finding 1"],
          confidenceLevel: 0.8,
        },
      });
    });

    it("should deduplicate generated charts with same title", async () => {
      mockSectionWriter.writeSectionsParallel
        .mockResolvedValueOnce([
          {
            ...mockSectionResult,
            sectionId: "section-001",
            title: "市场概况",
            generatedCharts: [
              { title: "Revenue Trend", type: "bar", data: [] },
              { title: "Revenue Trend", type: "bar", data: [] }, // duplicate
              { title: null, type: "line", data: [] }, // null title - kept
            ],
            figureReferences: [],
          },
        ])
        .mockResolvedValueOnce([
          {
            ...mockSectionResult,
            sectionId: "section-002",
            title: "竞争对手分析",
            generatedCharts: [],
            figureReferences: [],
          },
        ]);

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
      );

      expect(result.success).toBe(true);
    });

    it("should deduplicate figureReferences by imageUrl and filter null imageUrl", async () => {
      mockSectionWriter.writeSectionsParallel
        .mockResolvedValueOnce([
          {
            ...mockSectionResult,
            sectionId: "section-001",
            title: "市场概况",
            generatedCharts: [],
            figureReferences: [
              {
                imageUrl: "https://img.example.com/chart1.png",
                evidenceCitationIndex: 1,
              },
              {
                imageUrl: "https://img.example.com/chart1.png",
                evidenceCitationIndex: 1,
              }, // duplicate
              { imageUrl: null, evidenceCitationIndex: 2 }, // null - filtered
              {
                imageUrl: "https://img.example.com/chart2.png",
                evidenceCitationIndex: 3,
              },
            ],
          },
        ])
        .mockResolvedValueOnce([
          {
            ...mockSectionResult,
            sectionId: "section-002",
            title: "竞争对手分析",
            generatedCharts: [],
            figureReferences: [],
          },
        ]);

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
      );

      expect(result.success).toBe(true);
    });

    it("should update figureReferences evidenceCitationIndex when indexMapping non-empty", async () => {
      const evidenceData = [
        {
          id: "ev-001",
          title: "Evidence 1",
          url: "http://test.com",
          domain: "test.com",
          snippet: "snippet",
          sourceType: "web",
          publishedAt: null,
        },
      ];
      const searchResultWithEvidence = {
        ...mockSearchPhaseResult,
        evidenceData,
      };

      // Section with a figure reference
      mockSectionWriter.writeSectionsParallel
        .mockResolvedValueOnce([
          {
            ...mockSectionResult,
            sectionId: "section-001",
            title: "市场概况",
            generatedCharts: [],
            figureReferences: [
              {
                imageUrl: "https://img.example.com/fig.png",
                evidenceCitationIndex: 1,
              },
            ],
          },
        ])
        .mockResolvedValueOnce([
          {
            ...mockSectionResult,
            sectionId: "section-002",
            title: "竞争对手分析",
            generatedCharts: [],
            figureReferences: [],
          },
        ]);

      // Transaction returns citationIndex=5 (triggers indexMapping)
      const mockTopicEvidenceTx = {
        aggregate: jest.fn().mockResolvedValue({ _max: { citationIndex: 4 } }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "saved-ev-001", citationIndex: 5 }]),
      };
      mockPrisma.$transaction.mockImplementationOnce(
        async (fn: (tx: unknown) => unknown) => {
          return fn({ topicEvidence: mockTopicEvidenceTx });
        },
      );

      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: "Analysis [1] content here.",
        metadata: {
          summary: "Summary",
          keyFindings: ["Finding 1"],
          confidenceLevel: 0.8,
        },
      });

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        searchResultWithEvidence,
        mockOutline,
        "report-001",
      );

      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // filterEvidenceForSection in dimension-mission (lines 1313-1483)
  // These paths are exercised when evidence data > 5 items
  // ============================================================

  describe("filterEvidenceForSection via executeWritingPhase with large evidence", () => {
    const makeSearchPhaseResultWithEvidence = (evidenceData: unknown[]) => ({
      dimensionId: "dim-001",
      dimensionName: "市场竞争格局",
      enrichedResults: [],
      evidenceData,
      evidenceSummary: "Evidence summary",
      searchResultsRecord: {},
      temporalContext: {
        currentDate: "2025年1月19日",
        freshnessRequirement: "",
      },
      figuresSummary: "",
      leaderContextSummary: "",
    });

    beforeEach(() => {
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });
      mockLeaderService.reviewSectionOutput.mockResolvedValue({
        approved: true,
        feedback: "Good",
        score: 85,
      });
      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: "Analysis content.",
        metadata: {
          summary: "Summary",
          keyFindings: ["Finding 1"],
          confidenceLevel: 0.8,
        },
      });
    });

    it("should filter evidence when more than 5 items with keyword match", async () => {
      // 8 evidence items with some matching section keywords
      const evidenceData = Array.from({ length: 8 }, (_, i) => ({
        id: `ev-${i}`,
        title:
          i < 6 ? `semiconductor market analysis ${i}` : `cooking recipe ${i}`,
        snippet:
          i < 6
            ? `semiconductor market share analysis report ${i}`
            : `food recipe ${i}`,
        url: `http://e${i}.com`,
        domain: `e${i}.com`,
        sourceType: "web",
        publishedAt: null,
      }));

      mockSectionWriter.writeSectionsParallel
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-001" },
        ])
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-002" },
        ]);

      const searchResult = makeSearchPhaseResultWithEvidence(evidenceData);
      const outlineWithKeywords = {
        ...mockOutline,
        sections: [
          {
            ...mockOutline.sections[0],
            title: "semiconductor market",
            keyPoints: ["analysis"],
            description: null,
          },
          {
            ...mockOutline.sections[1],
            title: "竞争对手",
            keyPoints: [],
            description: null,
          },
        ],
      };

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        searchResult,
        outlineWithKeywords,
      );

      expect(result.success).toBe(true);
    });

    it("should return all evidence when section has no extractable keywords", async () => {
      const evidenceData = Array.from({ length: 8 }, (_, i) => ({
        id: `ev-${i}`,
        title: `Item ${i}`,
        snippet: `Snippet ${i}`,
        url: `http://e${i}.com`,
        domain: `e${i}.com`,
        sourceType: "web",
        publishedAt: null,
      }));

      mockSectionWriter.writeSectionsParallel
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-001" },
        ])
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-002" },
        ]);

      const searchResult = makeSearchPhaseResultWithEvidence(evidenceData);
      // Section with only stop words -> keywords.length === 0 path
      const outlineNoKeywords = {
        ...mockOutline,
        sections: [
          {
            ...mockOutline.sections[0],
            title: "the an is",
            keyPoints: [],
            description: null,
          },
          {
            ...mockOutline.sections[1],
            title: "or but and",
            keyPoints: [],
            description: null,
          },
        ],
      };

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        searchResult,
        outlineNoKeywords,
      );

      expect(result.success).toBe(true);
    });

    it("should return relevant evidence when 5+ items match keywords", async () => {
      // 10 items where 6 strongly match
      const evidenceData = Array.from({ length: 10 }, (_, i) => ({
        id: `ev-${i}`,
        title:
          i < 6 ? `semiconductor nvidia analysis ${i}` : `unrelated topic ${i}`,
        snippet:
          i < 6
            ? `nvidia semiconductor chip market share analysis report ${i}`
            : `other content ${i}`,
        url: `http://e${i}.com`,
        domain: `e${i}.com`,
        sourceType: "web",
        publishedAt: null,
      }));

      mockSectionWriter.writeSectionsParallel
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-001" },
        ])
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-002" },
        ]);

      const searchResult = makeSearchPhaseResultWithEvidence(evidenceData);
      const outlineRelevant = {
        ...mockOutline,
        sections: [
          {
            ...mockOutline.sections[0],
            title: "nvidia semiconductor",
            keyPoints: ["market", "analysis"],
            description: null,
          },
          {
            ...mockOutline.sections[1],
            title: "市场份额",
            keyPoints: [],
            description: null,
          },
        ],
      };

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        searchResult,
        outlineRelevant,
      );

      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // convertToAnalysisResult + content extraction in mission service
  // ============================================================

  describe("convertToAnalysisResult and extractors in dimension-mission", () => {
    const mockSearchPhaseResult = {
      dimensionId: "dim-001",
      dimensionName: "市场竞争格局",
      enrichedResults: [],
      evidenceData: [],
      evidenceSummary: "No evidence",
      searchResultsRecord: {},
      temporalContext: {
        currentDate: "2025年1月19日",
        freshnessRequirement: "",
      },
      figuresSummary: "",
      leaderContextSummary: "",
    };

    beforeEach(() => {
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });
      mockSectionWriter.writeSectionsParallel
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-001" },
        ])
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-002" },
        ]);
      mockLeaderService.reviewSectionOutput.mockResolvedValue({
        approved: true,
        feedback: "Good",
        score: 85,
      });
    });

    it("should extract trends from header-based bullet content", async () => {
      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: [
          "## 发展趋势",
          "",
          "- **AI融合趋势**: 大模型与边缘计算融合，推动实时AI应用普及。",
          "- 云端AI推理成本持续下降，企业采用率提升。",
        ].join("\n"),
        metadata: {
          summary: "AI发展趋势分析",
          keyFindings: [
            "大模型崛起",
            "AI芯片需求旺盛",
            "云边协同",
            "数据治理挑战",
          ],
          confidenceLevel: 0.85,
        },
      });

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
      );

      expect(result.success).toBe(true);
      expect(result.analysisResult?.trends).toBeDefined();
    });

    it("should extract challenges from bold patterns", async () => {
      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: [
          "**挑战一**: 半导体供应链脆弱性是行业面临的核心挑战，地缘政治因素加剧不确定性。",
          "**风险**: 人才短缺制约创新速度，全球AI工程师争夺激烈。",
        ].join("\n"),
        metadata: {
          summary: "挑战分析",
          keyFindings: ["Challenge 1"],
          confidenceLevel: 0.7,
        },
      });

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
      );

      expect(result.success).toBe(true);
      expect(result.analysisResult?.challenges).toBeDefined();
    });

    it("should extract opportunities from sentence patterns", async () => {
      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: [
          "中国半导体市场存在巨大的发展机遇，国产替代潮流带来历史性机会。",
          "AI芯片领域发展机会显著，国内厂商有望突破技术壁垒实现弯道超车。",
        ].join("\n"),
        metadata: {
          summary: "机遇分析",
          keyFindings: ["Opportunity 1"],
          confidenceLevel: 0.8,
        },
      });

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
      );

      expect(result.success).toBe(true);
      expect(result.analysisResult?.opportunities).toBeDefined();
    });

    it("should assign correct significance levels to keyFindings", async () => {
      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: "Plain content without structured lists.",
        metadata: {
          summary: "Summary",
          keyFindings: [
            "High-1",
            "High-2",
            "Medium-3",
            "Medium-4",
            "Low-5",
            "Low-6",
          ],
          confidenceLevel: 0.9,
        },
      });

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
      );

      expect(result.success).toBe(true);
      const findings = result.analysisResult?.keyFindings || [];
      expect(findings[0]?.significance).toBe("high");
      expect(findings[2]?.significance).toBe("medium");
      expect(findings[4]?.significance).toBe("low");
    });

    it("should truncate long bullet items (>120 chars) with ellipsis", async () => {
      const longItem = "趋".repeat(150); // 150 chars > 120
      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: `## 发展趋势\n\n- ${longItem}\n`,
        metadata: {
          summary: "S",
          keyFindings: ["F1"],
          confidenceLevel: 0.8,
        },
      });

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
      );

      expect(result.success).toBe(true);
    });

    it("should handle extractFromBoldPatterns with value > 120 chars", async () => {
      const longValue = "详细分析".repeat(40); // > 120 chars
      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: `**趋势一**: ${longValue}`,
        metadata: {
          summary: "S",
          keyFindings: ["F1"],
          confidenceLevel: 0.8,
        },
      });

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
      );

      expect(result.success).toBe(true);
    });

    it("should fall through to extractFromSentences when no headers or bold patterns match", async () => {
      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: [
          "市场竞争趋势明显，英伟达、英特尔等巨头的市场份额持续变化。",
          "半导体行业面临的挑战主要包括供应链风险和技术壁垒两个方面。",
          "未来市场发展机遇在于国产替代需求的持续增长。",
        ].join("\n"),
        metadata: {
          summary: "S",
          keyFindings: ["F1"],
          confidenceLevel: 0.8,
        },
      });

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        mockOutline,
      );

      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // executeSearchPhase: sort comparator + catch branch
  // ============================================================

  describe("executeSearchPhase: freshnessInfo sort and publishedAt catch", () => {
    it("should sort multiple publishedAt dates descending (line 270)", async () => {
      // Two items with different dates so the sort comparator is exercised
      const enrichedMultiple = [
        {
          ...mockEnrichedResult,
          id: "r1",
          publishedAt: new Date("2023-06-01"),
        },
        {
          ...mockEnrichedResult,
          id: "r2",
          publishedAt: new Date("2024-03-15"),
        },
        {
          ...mockEnrichedResult,
          id: "r3",
          publishedAt: new Date("2022-11-20"),
        },
      ];
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: enrichedMultiple,
        sources: ["web"],
        metadata: {},
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue(
        enrichedMultiple,
      );
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 3,
        fetched: 3,
        avgContentLength: 500,
        invalidUrls: 0,
        validUrls: 3,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      const result = await service.executeSearchPhase(mockTopic, mockDimension);

      // freshnessInfo should show newest date as 2024-03-15
      expect(result.searchResultsRecord.freshnessInfo).toBeDefined();
      expect(
        (result.searchResultsRecord.freshnessInfo as { newestDate: string })
          .newestDate,
      ).toContain("2024");
    });

    it("should trigger extractDomainFromUrl when item has no domain (invalid URL path)", async () => {
      // item.domain is undefined/null so extractDomainFromUrl is called
      const itemNoDomain = {
        ...mockEnrichedResult,
        domain: undefined as unknown as string,
        url: "not-a-valid-url", // Invalid URL — triggers catch in extractDomainFromUrl (line 1519)
        publishedAt: null,
      };
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [itemNoDomain],
        sources: ["web"],
        metadata: {},
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([itemNoDomain]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 200,
        invalidUrls: 0,
        validUrls: 1,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      // Should complete without error
      const result = await service.executeSearchPhase(mockTopic, mockDimension);
      expect(result).toBeDefined();
    });

    it("should trigger extractDomainFromUrl with valid URL (domain extracted)", async () => {
      const itemNoDomainValidUrl = {
        ...mockEnrichedResult,
        domain: undefined as unknown as string,
        url: "https://example-nodomain.com/path",
        publishedAt: null,
      };
      mockDataSourceRouter.fetchDataForDimension.mockResolvedValue({
        items: [itemNoDomainValidUrl],
        sources: ["web"],
        metadata: {},
      });
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([
        itemNoDomainValidUrl,
      ]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1,
        fetched: 1,
        avgContentLength: 200,
        invalidUrls: 0,
        validUrls: 1,
      });
      mockLeaderTool.generateEnhancedPlanningContext.mockResolvedValue({
        contextSummary: "",
      });

      const result = await service.executeSearchPhase(mockTopic, mockDimension);
      expect(result).toBeDefined();
    });
  });

  // ============================================================
  // getPreviousSections: dependsOn path
  // ============================================================

  describe("getPreviousSections via writeSectionsWithReview", () => {
    it("should populate previousSections when sections have dependsOn", async () => {
      // Outline where section-002 depends on section-001, in sequential groups
      const outlineWithDeps = {
        ...mockOutline,
        sections: [
          {
            id: "section-001",
            title: "Intro",
            description: "Intro section",
            keyPoints: [],
            allocatedFigures: [],
          },
          {
            id: "section-002",
            title: "Analysis",
            description: "Analysis section",
            keyPoints: [],
            allocatedFigures: [],
            dependsOn: ["section-001"],
          },
        ],
        executionPlan: {
          parallelGroups: [["section-001"], ["section-002"]],
        },
      };

      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });
      mockSectionWriter.writeSectionsParallel
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-001", title: "Intro" },
        ])
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-002", title: "Analysis" },
        ]);
      mockLeaderService.reviewSectionOutput.mockResolvedValue({
        approved: true,
        feedback: "Good",
        score: 90,
      });
      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: "Integrated content.",
        metadata: {
          summary: "Summary",
          keyFindings: ["F1"],
          confidenceLevel: 0.8,
        },
      });

      const mockSearchPhaseResult = {
        dimensionId: "dim-001",
        dimensionName: "市场竞争格局",
        enrichedResults: [],
        evidenceData: [],
        evidenceSummary: "No evidence",
        searchResultsRecord: {},
        temporalContext: {
          currentDate: "2025年1月19日",
          freshnessRequirement: "",
        },
        figuresSummary: "",
        leaderContextSummary: "",
      };

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        mockSearchPhaseResult,
        outlineWithDeps,
      );

      expect(result.success).toBe(true);
      // second group writeSectionsParallel call should have previousSections
      const secondCall = mockSectionWriter.writeSectionsParallel.mock.calls[1];
      expect(secondCall[0][0].previousSections).toBeDefined();
      expect(secondCall[0][0].previousSections.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // validateAllocatedFigures: uncovered branch paths
  // ============================================================

  describe("validateAllocatedFigures uncovered branches", () => {
    const mockSearchPhaseBase = {
      dimensionId: "dim-001",
      dimensionName: "市场竞争格局",
      enrichedResults: [],
      evidenceData: [] as unknown[],
      evidenceSummary: "No evidence",
      searchResultsRecord: {},
      temporalContext: {
        currentDate: "2025年1月19日",
        freshnessRequirement: "",
      },
      figuresSummary: "",
      leaderContextSummary: "",
    };

    beforeEach(() => {
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });
      mockSectionWriter.writeSectionsParallel
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-001" },
        ])
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-002" },
        ]);
      mockLeaderService.reviewSectionOutput.mockResolvedValue({
        approved: true,
        feedback: "Good",
        score: 85,
      });
      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: "Content.",
        metadata: { summary: "S", keyFindings: ["F1"], confidenceLevel: 0.8 },
      });
    });

    it("should skip figure with out-of-range evidenceIndex (line 1616-1619)", async () => {
      // evidenceData has 1 item, but figure references evidenceIndex 5 (out of range)
      const evidenceData = [
        {
          id: "ev-1",
          title: "E1",
          url: "http://e1.com",
          domain: "e1.com",
          snippet: "s",
          sourceType: "web",
          publishedAt: null,
        },
      ];
      const outlineOutOfRange = {
        ...mockOutline,
        sections: [
          {
            ...mockOutline.sections[0],
            allocatedFigures: [
              {
                evidenceIndex: 5,
                figureIndex: 0,
                imageUrl: "http://img.com/fig.png",
                caption: "Fig",
              },
            ],
          },
          mockOutline.sections[1],
        ],
      };

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        { ...mockSearchPhaseBase, evidenceData } as unknown as Parameters<
          typeof service.executeWritingPhase
        >[2],
        outlineOutOfRange,
      );

      expect(result.success).toBe(true);
      // The figure should have been removed from section
      expect(outlineOutOfRange.sections[0].allocatedFigures.length).toBe(0);
    });

    it("should recover imageUrl from extractedFigures when imageUrl is null (line 1624-1629)", async () => {
      const evidenceData = [
        {
          id: "ev-1",
          title: "E1",
          url: "http://e1.com",
          domain: "e1.com",
          snippet: "s",
          sourceType: "web",
          publishedAt: null,
          extractedFigures: [
            {
              imageUrl: "http://img.com/recovered.png",
              caption: "Recovered",
              alt: "alt",
            },
          ],
        },
      ];
      const outlineNullImageUrl = {
        ...mockOutline,
        sections: [
          {
            ...mockOutline.sections[0],
            allocatedFigures: [
              // imageUrl is empty string — triggers null imageUrl path
              { evidenceIndex: 1, figureIndex: 0, imageUrl: "", caption: "" },
            ],
          },
          mockOutline.sections[1],
        ],
      };

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        { ...mockSearchPhaseBase, evidenceData } as unknown as Parameters<
          typeof service.executeWritingPhase
        >[2],
        outlineNullImageUrl,
      );

      expect(result.success).toBe(true);
      // imageUrl should be recovered
      expect(outlineNullImageUrl.sections[0].allocatedFigures[0].imageUrl).toBe(
        "http://img.com/recovered.png",
      );
    });

    it("should skip figure when imageUrl null and no recovery available (line 1631-1634)", async () => {
      const evidenceData = [
        {
          id: "ev-1",
          title: "E1",
          url: "http://e1.com",
          domain: "e1.com",
          snippet: "s",
          sourceType: "web",
          publishedAt: null,
          extractedFigures: [], // no figures to recover from
        },
      ];
      const outlineNoRecovery = {
        ...mockOutline,
        sections: [
          {
            ...mockOutline.sections[0],
            allocatedFigures: [
              {
                evidenceIndex: 1,
                figureIndex: 0,
                imageUrl: "",
                caption: "No recovery",
              },
            ],
          },
          mockOutline.sections[1],
        ],
      };

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        { ...mockSearchPhaseBase, evidenceData } as unknown as Parameters<
          typeof service.executeWritingPhase
        >[2],
        outlineNoRecovery,
      );

      expect(result.success).toBe(true);
      expect(outlineNoRecovery.sections[0].allocatedFigures.length).toBe(0);
    });

    it("should skip duplicate figures across sections (line 1640-1643)", async () => {
      const evidenceData = [
        {
          id: "ev-1",
          title: "E1",
          url: "http://e1.com",
          domain: "e1.com",
          snippet: "s",
          sourceType: "web",
          publishedAt: null,
          extractedFigures: [
            { imageUrl: "http://img.com/fig.png", caption: "Fig", alt: "alt" },
          ],
        },
      ];
      // Both sections reference the same figure 1:0
      const outlineDuplicateFigs = {
        ...mockOutline,
        sections: [
          {
            ...mockOutline.sections[0],
            allocatedFigures: [
              {
                evidenceIndex: 1,
                figureIndex: 0,
                imageUrl: "http://img.com/fig.png",
                caption: "Fig",
              },
            ],
          },
          {
            ...mockOutline.sections[1],
            allocatedFigures: [
              {
                evidenceIndex: 1,
                figureIndex: 0,
                imageUrl: "http://img.com/fig.png",
                caption: "Fig duplicate",
              },
            ],
          },
        ],
      };

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        { ...mockSearchPhaseBase, evidenceData } as unknown as Parameters<
          typeof service.executeWritingPhase
        >[2],
        outlineDuplicateFigs,
      );

      expect(result.success).toBe(true);
      // First section keeps it, second should drop it
      expect(outlineDuplicateFigs.sections[0].allocatedFigures.length).toBe(1);
      expect(outlineDuplicateFigs.sections[1].allocatedFigures.length).toBe(0);
    });
  });

  // ============================================================
  // saveEvidence: empty evidenceData early return + assessCredibility branches
  // ============================================================

  describe("saveEvidence and assessCredibility branches", () => {
    const mockSearchPhaseBase = {
      dimensionId: "dim-001",
      dimensionName: "市场竞争格局",
      enrichedResults: [],
      evidenceData: [] as unknown[],
      evidenceSummary: "No evidence",
      searchResultsRecord: {},
      temporalContext: {
        currentDate: "2025年1月19日",
        freshnessRequirement: "",
      },
      figuresSummary: "",
      leaderContextSummary: "",
    };

    beforeEach(() => {
      mockPrisma.topicDimension.update.mockResolvedValue({ id: "dim-001" });
      mockSectionWriter.writeSectionsParallel
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-001" },
        ])
        .mockResolvedValueOnce([
          { ...mockSectionResult, sectionId: "section-002" },
        ]);
      mockLeaderService.reviewSectionOutput.mockResolvedValue({
        approved: true,
        feedback: "Good",
        score: 85,
      });
      mockLeaderService.integrateDimensionResults.mockResolvedValue({
        content: "Content with [1] ref.",
        metadata: { summary: "S", keyFindings: ["F1"], confidenceLevel: 0.8 },
      });
    });

    it("should return empty maps when saveEvidence called with empty evidenceData (line 1676)", async () => {
      // Pass reportId but evidenceData is empty → triggers line 1676
      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        { ...mockSearchPhaseBase, evidenceData: [] } as unknown as Parameters<
          typeof service.executeWritingPhase
        >[2],
        mockOutline,
        "report-001",
      );

      expect(result.success).toBe(true);
      // $transaction should NOT be called when evidenceData is empty
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("should call assessCredibility with top-authority domain (score += 40)", async () => {
      const evidenceData = [
        {
          id: "ev-1",
          title: "Gov Report",
          url: "https://data.gov/report",
          domain: "data.gov",
          snippet: "a".repeat(600), // >500 chars for depth score
          sourceType: "official",
          publishedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago (<=30)
        },
      ];

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        { ...mockSearchPhaseBase, evidenceData } as unknown as Parameters<
          typeof service.executeWritingPhase
        >[2],
        mockOutline,
        "report-001",
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("should call assessCredibility with high-authority domain (bloomberg.com, score += 30)", async () => {
      const evidenceData = [
        {
          id: "ev-1",
          title: "Bloomberg",
          url: "https://bloomberg.com/markets",
          domain: "bloomberg.com",
          snippet: "b".repeat(300), // 200-500 chars
          sourceType: "news",
          publishedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago (<=180)
        },
      ];

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        { ...mockSearchPhaseBase, evidenceData } as unknown as Parameters<
          typeof service.executeWritingPhase
        >[2],
        mockOutline,
        "report-001",
      );

      expect(result.success).toBe(true);
    });

    it("should call assessCredibility with medium-authority domain (techcrunch.com, score += 20)", async () => {
      const evidenceData = [
        {
          id: "ev-1",
          title: "TechCrunch",
          url: "https://techcrunch.com/ai",
          domain: "techcrunch.com",
          snippet: "c".repeat(100), // 50-200 chars
          sourceType: "report",
          publishedAt: new Date(Date.now() - 250 * 24 * 60 * 60 * 1000), // ~8 months (<=365)
        },
      ];

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        { ...mockSearchPhaseBase, evidenceData } as unknown as Parameters<
          typeof service.executeWritingPhase
        >[2],
        mockOutline,
        "report-001",
      );

      expect(result.success).toBe(true);
    });

    it("should call assessCredibility with null domain (score += 15)", async () => {
      const evidenceData = [
        {
          id: "ev-1",
          title: "Unknown Source",
          url: "http://unknown.test",
          domain: null,
          snippet: "d".repeat(30), // <50 chars (no snippet depth score)
          sourceType: "web",
          publishedAt: new Date(Date.now() - 500 * 24 * 60 * 60 * 1000), // ~16 months (<=730)
        },
      ];

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        { ...mockSearchPhaseBase, evidenceData } as unknown as Parameters<
          typeof service.executeWritingPhase
        >[2],
        mockOutline,
        "report-001",
      );

      expect(result.success).toBe(true);
    });

    it("should call assessCredibility with academic sourceType and old publishedAt (>730 days)", async () => {
      const evidenceData = [
        {
          id: "ev-1",
          title: "Old Academic",
          url: "https://arxiv.org/paper",
          domain: "arxiv.org",
          snippet: null, // null snippet
          sourceType: "academic",
          publishedAt: new Date(Date.now() - 800 * 24 * 60 * 60 * 1000), // >730 days
        },
      ];

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        { ...mockSearchPhaseBase, evidenceData } as unknown as Parameters<
          typeof service.executeWritingPhase
        >[2],
        mockOutline,
        "report-001",
      );

      expect(result.success).toBe(true);
    });

    it("should call assessCredibility with null publishedAt (no freshness score)", async () => {
      const evidenceData = [
        {
          id: "ev-1",
          title: "No Date Source",
          url: "https://statista.com/data",
          domain: "statista.com",
          snippet: "e".repeat(400),
          sourceType: "report",
          publishedAt: null, // no date
        },
      ];

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        { ...mockSearchPhaseBase, evidenceData } as unknown as Parameters<
          typeof service.executeWritingPhase
        >[2],
        mockOutline,
        "report-001",
      );

      expect(result.success).toBe(true);
    });

    it("should trigger default sourceType case in assessCredibility (line 1888-1889)", async () => {
      // sourceType = "blog" doesn't match any explicit case → default branch
      const evidenceData = [
        {
          id: "ev-1",
          title: "Blog Post",
          url: "https://some-blog.com/post",
          domain: "some-blog.com",
          snippet: "f".repeat(200),
          sourceType: "blog", // unknown type → default branch
          publishedAt: null,
        },
      ];

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        { ...mockSearchPhaseBase, evidenceData } as unknown as Parameters<
          typeof service.executeWritingPhase
        >[2],
        mockOutline,
        "report-001",
      );

      expect(result.success).toBe(true);
    });

    it("should trigger validateDate invalid date path (line 1779) and replaceEvidenceIds sort with multiple entries (line 1755)", async () => {
      // Use 2 evidence items so the indexMapping has 2 entries and sort comparator is exercised
      // Also use an invalid publishedAt string to trigger validateDate returning null (line 1779)
      const evidenceData = [
        {
          id: "ev-1",
          title: "Source 1",
          url: "https://reuters.com/a",
          domain: "reuters.com",
          snippet: "g".repeat(300),
          sourceType: "news",
          publishedAt: "not-a-valid-date", // invalid date string → validateDate returns null (line 1779)
        },
        {
          id: "ev-2",
          title: "Source 2",
          url: "https://wsj.com/b",
          domain: "wsj.com",
          snippet: "h".repeat(300),
          sourceType: "news",
          publishedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        },
      ];

      // Use content with [1] and [2] refs so replaceEvidenceIds has multiple entries to sort
      mockLeaderService.integrateDimensionResults.mockResolvedValueOnce({
        content: "Analysis [2] and more data [1] combined.",
        metadata: { summary: "S", keyFindings: ["F1"], confidenceLevel: 0.8 },
      });

      // Mock $transaction to return 2 records with different citationIndexes
      const mockTopicEvidenceTx2 = {
        aggregate: jest.fn().mockResolvedValue({ _max: { citationIndex: 5 } }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue([
          { id: "saved-1", citationIndex: 6 },
          { id: "saved-2", citationIndex: 7 },
        ]),
      };
      mockPrisma.$transaction.mockImplementationOnce(
        async (fn: (tx: unknown) => unknown) => {
          return fn({ topicEvidence: mockTopicEvidenceTx2 });
        },
      );

      const result = await service.executeWritingPhase(
        mockTopic,
        mockDimension,
        { ...mockSearchPhaseBase, evidenceData } as unknown as Parameters<
          typeof service.executeWritingPhase
        >[2],
        mockOutline,
        "report-001",
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });
});
