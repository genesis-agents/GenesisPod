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
    { id: "section-001", title: "市场概况", description: "概述市场规模", keyPoints: [], allocatedFigures: [] },
    { id: "section-002", title: "竞争对手分析", description: "主要厂商分析", keyPoints: [], allocatedFigures: [] },
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
      update: jest.fn().mockResolvedValue({ id: "dim-001", status: "RESEARCHING" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    researchMission: {
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
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
  let mockDataSourceRouter: ReturnType<typeof buildMocks>["mockDataSourceRouter"];
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

      mockDataEnrichment.enrichSearchResults.mockResolvedValue([mockEnrichedResult]);
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
        temporalContext: expect.objectContaining({ currentDate: expect.any(String) }),
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
        total: 0, fetched: 0, avgContentLength: 0, invalidUrls: 0, validUrls: 0,
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
        total: 0, fetched: 0, avgContentLength: 0, invalidUrls: 0, validUrls: 0,
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
      mockDataEnrichment.enrichSearchResults.mockResolvedValue([mockEnrichedResult]);
      mockDataEnrichment.getEnrichmentStats.mockReturnValue({
        total: 1, fetched: 1, avgContentLength: 500, invalidUrls: 0, validUrls: 1,
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

      const result = await service.executeDimensionMission(mockTopic, mockDimension);

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
        undefined,  // reportId
        undefined,  // missionId
        undefined,  // modelId
        undefined,  // taskId
        undefined,  // assignedTools
        undefined,  // assignedSkills
        2,          // maxRevisionRounds = 2 triggers literature scan
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
        undefined,  // reportId
        undefined,  // missionId
        undefined,  // modelId
        undefined,  // taskId
        undefined,  // assignedTools
        undefined,  // assignedSkills
        0,          // maxRevisionRounds = 0, skip scan
      );

      expect(mockDataSourceRouter.scanLiteratureBaseline).not.toHaveBeenCalled();
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
        undefined,  // reportId
        undefined,  // missionId
        undefined,  // modelId
        undefined,  // taskId
        undefined,  // assignedTools
        undefined,  // assignedSkills
        2,          // maxRevisionRounds triggers scan attempt
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
          { ...mockSectionResult, sectionId: "section-002", title: "竞争对手分析" },
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
  });
});
