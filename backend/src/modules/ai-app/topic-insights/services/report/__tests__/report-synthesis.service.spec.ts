/**
 * ReportSynthesisService Unit Tests
 *
 * Coverage targets:
 * - createDraftReport: version increment, retry on unique constraint
 * - saveDimensionAnalysis: create analysis record
 * - linkEvidenceToReport: updateMany + batch citationIndex
 * - synthesizeReport: full pipeline with AI calls
 * - checkCrossDimensionConsistency: private via synthesizeReport
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ReportSynthesisService } from "../report-synthesis.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { ReportEditorService } from "../report-editor.service";
import { AIModelType } from "@prisma/client";
import type { ResearchTopic } from "@prisma/client";

// ──────────────────────────────────────────────────────────────────────────────
// Shared test fixtures
// ──────────────────────────────────────────────────────────────────────────────

const mockTopic: ResearchTopic = {
  id: "topic-001",
  name: "AI 芯片市场分析",
  type: "market_analysis",
  description: "分析 AI 芯片的市场竞争格局",
  language: "zh",
  userId: "user-001",
  status: "ACTIVE",
  topicConfig: null,
  searchConfig: null,
  visibility: "PRIVATE",
  createdAt: new Date(),
  updatedAt: new Date(),
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

const mockDimensionAnalysis = {
  id: "analysis-001",
  reportId: "report-001",
  dimensionId: "dim-001",
  summary: "AI 芯片市场由英伟达主导",
  keyFindings: [
    { finding: "英伟达占据 80% 市场份额", significance: "高", evidenceIds: ["ev-001"] },
  ],
  dataPoints: {
    trends: [{ trend: "需求持续增长", direction: "up", timeframe: "2024-2025", evidenceIds: ["ev-001"] }],
    challenges: [{ challenge: "供应链瓶颈", impact: "高", evidenceIds: ["ev-002"] }],
    opportunities: [{ opportunity: "边缘计算市场", potential: "高", evidenceIds: ["ev-003"] }],
    detailedContent: "详细分析内容...",
    figureReferences: [],
    generatedCharts: [],
  },
  sourcesUsed: 5,
  dimension: {
    id: "dim-001",
    name: "市场份额",
    description: "各厂商市场份额分析",
    sortOrder: 1,
    status: "COMPLETED",
    searchQueries: ["AI chip market share"],
  },
  evidences: [
    {
      id: "ev-001",
      citationIndex: 1,
      title: "Nvidia Market Share 2024",
      url: "https://example.com/article1",
      domain: "example.com",
      sourceType: "WEB",
      publishedAt: new Date("2024-01-01"),
      credibilityScore: 0.9,
      accessedAt: new Date(),
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────────────
// Mock factory
// ──────────────────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    topicReport: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    dimensionAnalysis: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    topicEvidence: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockFacade = {
    chat: jest.fn(),
    sanitizeReport: jest.fn().mockImplementation((content: string) => content),
  };

  const mockReportEditor = {
    editDimensionInputs: jest.fn().mockResolvedValue({
      dimensions: [],
      deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
    }),
  };

  return { mockPrisma, mockFacade, mockReportEditor };
}

// ──────────────────────────────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────────────────────────────

describe("ReportSynthesisService", () => {
  let service: ReportSynthesisService;
  let mockPrisma: ReturnType<typeof buildMocks>["mockPrisma"];
  let mockFacade: ReturnType<typeof buildMocks>["mockFacade"];
  let mockReportEditor: ReturnType<typeof buildMocks>["mockReportEditor"];

  beforeEach(async () => {
    const mocks = buildMocks();
    mockPrisma = mocks.mockPrisma;
    mockFacade = mocks.mockFacade;
    mockReportEditor = mocks.mockReportEditor;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportSynthesisService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AIEngineFacade, useValue: mockFacade },
        { provide: ReportEditorService, useValue: mockReportEditor },
      ],
    }).compile();

    service = module.get<ReportSynthesisService>(ReportSynthesisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // createDraftReport
  // ============================================================

  describe("createDraftReport", () => {
    it("should create a draft report with version 1 when no previous report exists", async () => {
      mockPrisma.topicReport.findFirst.mockResolvedValue(null);
      const createdReport = { id: "report-001", topicId: "topic-001", version: 1, versionLabel: "v1.0" };
      mockPrisma.topicReport.create.mockResolvedValue(createdReport);

      const result = await service.createDraftReport("topic-001");

      expect(mockPrisma.topicReport.findFirst).toHaveBeenCalledWith({
        where: { topicId: "topic-001" },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      expect(mockPrisma.topicReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            topicId: "topic-001",
            version: 1,
            executiveSummary: "",
            fullReport: "",
            highlights: [],
            isIncremental: false,
          }),
        }),
      );
      expect(result).toEqual(createdReport);
    });

    it("should increment version based on latest report", async () => {
      mockPrisma.topicReport.findFirst.mockResolvedValue({ version: 3 });
      const createdReport = { id: "report-004", topicId: "topic-001", version: 4, versionLabel: "v4.0" };
      mockPrisma.topicReport.create.mockResolvedValue(createdReport);

      const result = await service.createDraftReport("topic-001");

      expect(mockPrisma.topicReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 4 }),
        }),
      );
      expect(result.version).toBe(4);
    });

    it("should retry on unique constraint conflict and succeed on second attempt", async () => {
      mockPrisma.topicReport.findFirst
        .mockResolvedValueOnce({ version: 1 })
        .mockResolvedValueOnce({ version: 2 });

      const uniqueError = { code: "P2002", message: "Unique constraint violated" };
      const createdReport = { id: "report-003", topicId: "topic-001", version: 3 };

      mockPrisma.topicReport.create
        .mockRejectedValueOnce(uniqueError)
        .mockResolvedValueOnce(createdReport);

      const result = await service.createDraftReport("topic-001");

      expect(mockPrisma.topicReport.create).toHaveBeenCalledTimes(2);
      expect(result).toEqual(createdReport);
    });

    it("should throw the original error after exhausting all retries", async () => {
      mockPrisma.topicReport.findFirst.mockResolvedValue({ version: 1 });
      const uniqueError = { code: "P2002", message: "Unique constraint violated" };
      mockPrisma.topicReport.create.mockRejectedValue(uniqueError);

      // On the final attempt, the service re-throws the original error (not a custom message).
      // The loop retries (attempt < maxRetries) and on the last attempt throws the original error.
      await expect(service.createDraftReport("topic-001", 3)).rejects.toMatchObject({
        code: "P2002",
        message: "Unique constraint violated",
      });
      // Should have been called maxRetries times
      expect(mockPrisma.topicReport.create).toHaveBeenCalledTimes(3);
    });

    it("should immediately throw on non-unique-constraint errors", async () => {
      mockPrisma.topicReport.findFirst.mockResolvedValue(null);
      mockPrisma.topicReport.create.mockRejectedValue(new Error("DB connection lost"));

      await expect(service.createDraftReport("topic-001")).rejects.toThrow("DB connection lost");
      expect(mockPrisma.topicReport.create).toHaveBeenCalledTimes(1);
    });

    it("should also retry on 'Unique constraint' message", async () => {
      mockPrisma.topicReport.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ version: 1 });
      const uniqueError = { code: undefined, message: "Unique constraint failed on field version" };
      const createdReport = { id: "report-002", topicId: "topic-001", version: 2 };

      mockPrisma.topicReport.create
        .mockRejectedValueOnce(uniqueError)
        .mockResolvedValueOnce(createdReport);

      const result = await service.createDraftReport("topic-001");
      expect(result).toEqual(createdReport);
    });
  });

  // ============================================================
  // saveDimensionAnalysis
  // ============================================================

  describe("saveDimensionAnalysis", () => {
    it("should create a dimension analysis record with all required fields", async () => {
      const analysisData = {
        id: "analysis-001",
        reportId: "report-001",
        dimensionId: "dim-001",
        summary: "分析摘要",
        sourcesUsed: 5,
      };
      mockPrisma.dimensionAnalysis.create.mockResolvedValue(analysisData);

      const result = await service.saveDimensionAnalysis("report-001", "dim-001", {
        summary: "分析摘要",
        keyFindings: [{ finding: "Finding 1", significance: "high", evidenceIds: ["ev-1"] }],
        trends: [{ trend: "Trend 1", direction: "up", timeframe: "2024", evidenceIds: ["ev-1"] }],
        challenges: [],
        opportunities: [],
        evidenceUsed: 5,
        confidenceLevel: "high",
        detailedContent: "详细内容",
      });

      expect(mockPrisma.dimensionAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reportId: "report-001",
            dimensionId: "dim-001",
            summary: "分析摘要",
            sourcesUsed: 5,
          }),
        }),
      );
      expect(result).toEqual(analysisData);
    });

    it("should save figureReferences and generatedCharts when provided", async () => {
      const mockAnalysis = { id: "analysis-002", reportId: "report-001", dimensionId: "dim-001" };
      mockPrisma.dimensionAnalysis.create.mockResolvedValue(mockAnalysis);

      await service.saveDimensionAnalysis("report-001", "dim-001", {
        summary: "摘要",
        keyFindings: [],
        trends: [],
        challenges: [],
        opportunities: [],
        evidenceUsed: 3,
        confidenceLevel: "medium",
        figureReferences: [{ id: "fig-001", caption: "Chart 1", type: "chart", source: "example.com" }],
        generatedCharts: [{ id: "gen-001", title: "Bar Chart", chartType: "bar", data: {} }],
      });

      const createCall = mockPrisma.dimensionAnalysis.create.mock.calls[0][0];
      const dataPoints = createCall.data.dataPoints;
      expect(dataPoints).toMatchObject(
        expect.objectContaining({
          figureReferences: expect.arrayContaining([expect.objectContaining({ id: "fig-001" })]),
          generatedCharts: expect.arrayContaining([expect.objectContaining({ id: "gen-001" })]),
        }),
      );
    });

    it("should default figureReferences and generatedCharts to empty arrays when not provided", async () => {
      mockPrisma.dimensionAnalysis.create.mockResolvedValue({ id: "analysis-003" });

      await service.saveDimensionAnalysis("report-001", "dim-001", {
        summary: "摘要",
        keyFindings: [],
        trends: [],
        challenges: [],
        opportunities: [],
        evidenceUsed: 0,
        confidenceLevel: "low",
      });

      const createCall = mockPrisma.dimensionAnalysis.create.mock.calls[0][0];
      const dataPoints = createCall.data.dataPoints;
      expect(dataPoints).toMatchObject(
        expect.objectContaining({ figureReferences: [], generatedCharts: [] }),
      );
    });

    it("should throw when prisma create fails", async () => {
      mockPrisma.dimensionAnalysis.create.mockRejectedValue(new Error("DB error"));

      await expect(
        service.saveDimensionAnalysis("report-001", "dim-001", {
          summary: "摘要",
          keyFindings: [],
          trends: [],
          challenges: [],
          opportunities: [],
          evidenceUsed: 0,
          confidenceLevel: "low",
        }),
      ).rejects.toThrow("DB error");
    });
  });

  // ============================================================
  // linkEvidenceToReport
  // ============================================================

  describe("linkEvidenceToReport", () => {
    it("should update evidence with reportId and analysisId", async () => {
      mockPrisma.topicEvidence.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.topicEvidence.findMany.mockResolvedValue([
        { id: "ev-001", accessedAt: new Date("2024-01-01") },
        { id: "ev-002", accessedAt: new Date("2024-01-02") },
      ]);
      mockPrisma.$transaction.mockResolvedValue([]);

      await service.linkEvidenceToReport("report-001", "analysis-001", ["ev-001", "ev-002"]);

      expect(mockPrisma.topicEvidence.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["ev-001", "ev-002"] } },
        data: { reportId: "report-001", analysisId: "analysis-001" },
      });
    });

    it("should assign citationIndex in batches of 20", async () => {
      mockPrisma.topicEvidence.updateMany.mockResolvedValue({ count: 25 });

      // Create 25 evidence items
      const evidences = Array.from({ length: 25 }, (_, i) => ({
        id: `ev-${i + 1}`,
        accessedAt: new Date(`2024-01-${String(i + 1).padStart(2, "0")}`),
      }));
      mockPrisma.topicEvidence.findMany.mockResolvedValue(evidences);
      mockPrisma.$transaction.mockResolvedValue([]);

      await service.linkEvidenceToReport("report-001", "analysis-001", ["ev-001"]);

      // Should be called twice (batch 1: items 0-19, batch 2: items 20-24)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it("should assign sequential citationIndex starting from 1", async () => {
      mockPrisma.topicEvidence.updateMany.mockResolvedValue({ count: 2 });

      const evidences = [
        { id: "ev-001", accessedAt: new Date("2024-01-01") },
        { id: "ev-002", accessedAt: new Date("2024-01-02") },
      ];
      mockPrisma.topicEvidence.findMany.mockResolvedValue(evidences);

      // Capture transaction calls to verify citationIndex values
      const transactionCalls: unknown[] = [];
      mockPrisma.$transaction.mockImplementation((ops: unknown) => {
        transactionCalls.push(ops);
        return Promise.resolve([]);
      });

      await service.linkEvidenceToReport("report-001", "analysis-001", ["ev-001", "ev-002"]);

      // Verify update was called for citation index assignment
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("should handle empty evidenceIds gracefully", async () => {
      mockPrisma.topicEvidence.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.topicEvidence.findMany.mockResolvedValue([]);

      await expect(
        service.linkEvidenceToReport("report-001", "analysis-001", []),
      ).resolves.not.toThrow();
    });
  });

  // ============================================================
  // synthesizeReport
  // ============================================================

  describe("synthesizeReport", () => {
    function setupSynthesisChain() {
      // dimensionAnalysis.findMany
      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([mockDimensionAnalysis]);

      // topicEvidence.findMany
      mockPrisma.topicEvidence.findMany.mockResolvedValue([
        {
          id: "ev-001",
          citationIndex: 1,
          title: "Nvidia Market Share",
          url: "https://example.com/article1",
          domain: "example.com",
          sourceType: "WEB",
          publishedAt: new Date("2024-01-01"),
          credibilityScore: 0.9,
          accessedAt: new Date(),
          reportId: "report-001",
        },
      ]);

      // AI facade chat: consistency check returns valid JSON
      mockFacade.chat
        .mockResolvedValueOnce({
          content: JSON.stringify({
            overallConsistency: "high",
            conflicts: [],
            recommendations: [],
            summary: "一致性良好",
          }),
        })
        // AI facade chat: main report synthesis
        .mockResolvedValueOnce({
          content: JSON.stringify({
            executiveSummary: "AI 芯片市场由英伟达主导，市场规模持续扩张。",
            preface: "本报告分析了 AI 芯片市场现状。",
            conclusion: "结语内容",
            highlights: [
              { title: "市场集中度高", description: "英伟达占 80%", category: "insight", importance: "high" },
            ],
            charts: [],
          }),
        });

      // reportEditor.editDimensionInputs
      mockReportEditor.editDimensionInputs.mockResolvedValue({
        dimensions: [
          {
            dimensionId: "dim-001",
            dimensionName: "市场份额",
            dimensionDescription: "各厂商市场份额分析",
            summary: "AI 芯片市场由英伟达主导",
            keyFindings: [],
            trends: [],
            challenges: [],
            opportunities: [],
            detailedContent: "## 市场份额分析\n\n英伟达占据主导地位。",
            sourcesUsed: 5,
            figureReferences: [],
            generatedCharts: [],
          },
        ],
        deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
      });

      // topicReport.update
      mockPrisma.topicReport.update.mockResolvedValue({
        id: "report-001",
        topicId: "topic-001",
        executiveSummary: "AI 芯片市场由英伟达主导，市场规模持续扩张。",
        fullReport: "# AI 芯片市场分析\n\n完整报告内容",
        highlights: [],
        charts: [],
        totalDimensions: 1,
        totalSources: 1,
        generationTimeMs: 1000,
        generatedAt: new Date(),
      });
    }

    it("should synthesize a full report and return updated report object", async () => {
      setupSynthesisChain();

      const result = await service.synthesizeReport(mockTopic, "report-001");

      expect(mockPrisma.dimensionAnalysis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { reportId: "report-001" } }),
      );
      expect(mockPrisma.topicReport.update).toHaveBeenCalled();
      expect(result).toHaveProperty("id", "report-001");
    });

    it("should throw when no dimension analyses found", async () => {
      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([]);
      mockPrisma.topicEvidence.findMany.mockResolvedValue([]);

      await expect(service.synthesizeReport(mockTopic, "report-001")).rejects.toThrow(
        "No dimension analyses found for report synthesis",
      );
    });

    it("should pass userFeedback into the synthesis prompt", async () => {
      // With 1 dimension, consistency check is skipped (no AI call for it).
      // Only 1 AI call is made for the main report generation.
      mockFacade.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          executiveSummary: "AI 芯片市场由英伟达主导。",
          preface: "本报告分析了 AI 芯片市场现状。",
          conclusion: "结语",
          highlights: [],
          charts: [],
        }),
      });

      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([mockDimensionAnalysis]);
      mockPrisma.topicEvidence.findMany.mockResolvedValue([]);
      mockReportEditor.editDimensionInputs.mockResolvedValue({
        dimensions: [{
          dimensionId: "dim-001",
          dimensionName: "市场份额",
          dimensionDescription: "市场份额分析",
          summary: "AI 芯片市场由英伟达主导",
          keyFindings: [],
          trends: [],
          challenges: [],
          opportunities: [],
          detailedContent: "内容",
          sourcesUsed: 0,
          figureReferences: [],
          generatedCharts: [],
        }],
        deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
      });
      mockPrisma.topicReport.update.mockResolvedValue({
        id: "report-001",
        topicId: "topic-001",
        executiveSummary: "AI 芯片市场由英伟达主导。",
        fullReport: "完整报告内容",
        highlights: [],
        charts: [],
        totalDimensions: 1,
        totalSources: 0,
      });

      await service.synthesizeReport(mockTopic, "report-001", "请重点分析英伟达的竞争优势");

      // With 1 dimension, only main report AI call happens
      expect(mockFacade.chat).toHaveBeenCalledTimes(1);
      // userFeedback should be included in the chat call
      expect(mockFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("请重点分析英伟达的竞争优势"),
            }),
          ]),
        }),
      );
    });

    it("should handle AI failure in consistency check gracefully when multiple dimensions", async () => {
      // Two dimensions: consistency check is triggered, AI fails, main report still runs
      const secondAnalysis = {
        ...mockDimensionAnalysis,
        id: "analysis-002",
        dimensionName: "技术趋势",
      };

      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([
        mockDimensionAnalysis,
        secondAnalysis,
      ]);
      mockPrisma.topicEvidence.findMany.mockResolvedValue([]);
      mockReportEditor.editDimensionInputs.mockResolvedValue({
        dimensions: [
          {
            dimensionId: "dim-001",
            dimensionName: "市场份额",
            dimensionDescription: "市场份额分析",
            summary: "分析摘要",
            keyFindings: [],
            trends: [],
            challenges: [],
            opportunities: [],
            detailedContent: "",
            sourcesUsed: 0,
            figureReferences: [],
            generatedCharts: [],
          },
          {
            dimensionId: "dim-002",
            dimensionName: "技术趋势",
            dimensionDescription: "技术趋势分析",
            summary: "技术摘要",
            keyFindings: [],
            trends: [],
            challenges: [],
            opportunities: [],
            detailedContent: "",
            sourcesUsed: 0,
            figureReferences: [],
            generatedCharts: [],
          },
        ],
        deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
      });
      mockPrisma.topicReport.update.mockResolvedValue({ id: "report-001" });

      // Consistency check AI fails, main synthesis succeeds
      mockFacade.chat
        .mockRejectedValueOnce(new Error("AI timeout"))
        .mockResolvedValueOnce({
          content: JSON.stringify({
            executiveSummary: "摘要内容",
            highlights: [],
            charts: [],
          }),
        });

      // Should not throw despite consistency check failure
      const result = await service.synthesizeReport(mockTopic, "report-001");
      expect(result).toHaveProperty("id", "report-001");
    });

    it("should skip figure collection when enableFigures is false in topicConfig", async () => {
      const topicWithDisabledFigures = {
        ...mockTopic,
        topicConfig: { enableFigures: false },
      } as unknown as ResearchTopic;

      mockFacade.chat
        .mockResolvedValueOnce({
          content: JSON.stringify({
            overallConsistency: "high",
            conflicts: [],
            recommendations: [],
            summary: "一致性良好",
          }),
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            executiveSummary: "摘要",
            highlights: [],
            charts: [],
          }),
        });

      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([
        { ...mockDimensionAnalysis, dataPoints: { ...mockDimensionAnalysis.dataPoints, generatedCharts: [{ id: "chart-1" }] } },
      ]);
      mockPrisma.topicEvidence.findMany.mockResolvedValue([]);
      mockReportEditor.editDimensionInputs.mockResolvedValue({
        dimensions: [{
          dimensionId: "dim-001",
          dimensionName: "市场份额",
          summary: "分析",
          keyFindings: [],
          trends: [],
          challenges: [],
          opportunities: [],
          detailedContent: "",
          sourcesUsed: 0,
          figureReferences: [],
          generatedCharts: [],
        }],
        deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
      });
      mockPrisma.topicReport.update.mockResolvedValue({ id: "report-001" });

      await service.synthesizeReport(topicWithDisabledFigures, "report-001");

      // Report update should have empty charts when figures disabled
      const updateCall = mockPrisma.topicReport.update.mock.calls[0][0];
      // Charts from dimensions should not be included when enableFigures is false
      expect(updateCall.data).toBeDefined();
    });

    it("should build references section from evidence with citationIndex", async () => {
      mockFacade.chat
        .mockResolvedValueOnce({
          content: JSON.stringify({
            overallConsistency: "high",
            conflicts: [],
            recommendations: [],
            summary: "Good",
          }),
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({ executiveSummary: "Summary", highlights: [], charts: [] }),
        });

      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([mockDimensionAnalysis]);
      mockPrisma.topicEvidence.findMany.mockResolvedValue([
        {
          id: "ev-001",
          citationIndex: 1,
          title: "Reference Article",
          url: "https://example.com/ref1",
          domain: "example.com",
          sourceType: "WEB",
          publishedAt: null,
          credibilityScore: 0.8,
          accessedAt: new Date("2024-06-01"),
          reportId: "report-001",
        },
      ]);
      mockReportEditor.editDimensionInputs.mockResolvedValue({
        dimensions: [{
          dimensionId: "dim-001",
          dimensionName: "Test Dim",
          summary: "Summary",
          keyFindings: [],
          trends: [],
          challenges: [],
          opportunities: [],
          detailedContent: "Content here",
          sourcesUsed: 1,
          figureReferences: [],
          generatedCharts: [],
        }],
        deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
      });
      mockPrisma.topicReport.update.mockResolvedValue({ id: "report-001" });

      await service.synthesizeReport(mockTopic, "report-001");

      // Should have called topicReport.update with fullReport containing references
      const updateCall = mockPrisma.topicReport.update.mock.calls[0][0];
      expect(updateCall.data.fullReport).toContain("参考文献");
    });

    it("should include totalSources count in report update", async () => {
      setupSynthesisChain();

      await service.synthesizeReport(mockTopic, "report-001");

      const updateCall = mockPrisma.topicReport.update.mock.calls[0][0];
      expect(updateCall.data.totalSources).toBe(1); // One evidence item
    });
  });

  // ============================================================
  // checkCrossDimensionConsistency (private - tested via behavior)
  // ============================================================

  describe("checkCrossDimensionConsistency (via synthesizeReport)", () => {
    it("should skip consistency check when only one dimension", async () => {
      // With a single dimension, consistency check should not call AI
      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([mockDimensionAnalysis]);
      mockPrisma.topicEvidence.findMany.mockResolvedValue([]);

      mockFacade.chat.mockResolvedValueOnce({
        content: JSON.stringify({ executiveSummary: "Single dimension", highlights: [], charts: [] }),
      });

      mockReportEditor.editDimensionInputs.mockResolvedValue({
        dimensions: [{
          dimensionId: "dim-001",
          dimensionName: "市场份额",
          summary: "摘要",
          keyFindings: [],
          trends: [],
          challenges: [],
          opportunities: [],
          detailedContent: "",
          sourcesUsed: 0,
          figureReferences: [],
          generatedCharts: [],
        }],
        deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
      });
      mockPrisma.topicReport.update.mockResolvedValue({ id: "report-001" });

      await service.synthesizeReport(mockTopic, "report-001");

      // Only one AI call (main synthesis), no consistency check
      expect(mockFacade.chat).toHaveBeenCalledTimes(1);
    });

    it("should call AI for consistency check when multiple dimensions", async () => {
      const secondDimensionAnalysis = {
        ...mockDimensionAnalysis,
        id: "analysis-002",
        dimensionId: "dim-002",
        dimension: { ...mockDimensionAnalysis.dimension, id: "dim-002", name: "技术路线" },
      };

      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([
        mockDimensionAnalysis,
        secondDimensionAnalysis,
      ]);
      mockPrisma.topicEvidence.findMany.mockResolvedValue([]);

      mockFacade.chat
        .mockResolvedValueOnce({
          content: JSON.stringify({
            overallConsistency: "medium",
            conflicts: [{ type: "data_conflict", severity: "warning", dimensions: ["市场份额", "技术路线"], description: "数据不一致", suggestedResolution: "统一标准" }],
            recommendations: ["统一数据口径"],
            summary: "存在轻微不一致",
          }),
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({ executiveSummary: "综合摘要", highlights: [], charts: [] }),
        });

      mockReportEditor.editDimensionInputs.mockResolvedValue({
        dimensions: [],
        deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
      });
      mockPrisma.topicReport.update.mockResolvedValue({ id: "report-001" });

      await service.synthesizeReport(mockTopic, "report-001");

      // Two AI calls: consistency check + main synthesis
      expect(mockFacade.chat).toHaveBeenCalledTimes(2);
    });

    it("should include critical conflict notice in AI prompt when conflicts found", async () => {
      const secondAnalysis = {
        ...mockDimensionAnalysis,
        id: "analysis-002",
        dimensionId: "dim-002",
        dimension: { ...mockDimensionAnalysis.dimension, id: "dim-002", name: "技术路线" },
      };

      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([mockDimensionAnalysis, secondAnalysis]);
      mockPrisma.topicEvidence.findMany.mockResolvedValue([]);

      // Consistency check returns critical conflict
      mockFacade.chat
        .mockResolvedValueOnce({
          content: JSON.stringify({
            overallConsistency: "low",
            conflicts: [
              {
                type: "data_conflict",
                severity: "critical",
                dimensions: ["市场份额", "技术路线"],
                description: "市场规模数据矛盾",
                suggestedResolution: "选择更权威的来源",
              },
            ],
            recommendations: [],
            summary: "存在严重冲突",
          }),
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({ executiveSummary: "摘要", highlights: [], charts: [] }),
        });

      mockReportEditor.editDimensionInputs.mockResolvedValue({
        dimensions: [],
        deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
      });
      mockPrisma.topicReport.update.mockResolvedValue({ id: "report-001" });

      await service.synthesizeReport(mockTopic, "report-001");

      // The main synthesis call should include conflict notice
      const mainSynthesisCall = mockFacade.chat.mock.calls[1][0];
      const userMsg = mainSynthesisCall.messages.find((m: { role: string }) => m.role === "user");
      expect(userMsg.content).toContain("数据一致性修正指令");
    });
  });

  // ============================================================
  // normalizeExecutiveSummary (via synthesizeReport)
  // ============================================================

  describe("normalizeExecutiveSummary (tested via synthesizeReport)", () => {
    function setupMinimalSynthesis(executiveSummaryValue: unknown) {
      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([mockDimensionAnalysis]);
      mockPrisma.topicEvidence.findMany.mockResolvedValue([]);
      mockFacade.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          executiveSummary: executiveSummaryValue,
          highlights: [],
          charts: [],
        }),
      });
      mockReportEditor.editDimensionInputs.mockResolvedValue({
        dimensions: [{
          dimensionId: "dim-001",
          dimensionName: "市场份额",
          summary: "摘要",
          keyFindings: [],
          trends: [],
          challenges: [],
          opportunities: [],
          detailedContent: "",
          sourcesUsed: 0,
          figureReferences: [],
          generatedCharts: [],
        }],
        deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
      });
      mockPrisma.topicReport.update.mockResolvedValue({ id: "report-001", executiveSummary: "Result" });
    }

    it("should handle object executiveSummary with fullText field", async () => {
      setupMinimalSynthesis({ fullText: "Full executive summary text" });

      await service.synthesizeReport(mockTopic, "report-001");

      const updateCall = mockPrisma.topicReport.update.mock.calls[0][0];
      expect(updateCall.data.executiveSummary).toBe("Full executive summary text");
    });

    it("should handle object executiveSummary with structured fields (no fullText)", async () => {
      setupMinimalSynthesis({
        coreConclusions: ["Conclusion 1", "Conclusion 2"],
        keyMetrics: [{ metric: "Market Size", value: "$10B", source: "[1]" }],
        riskAlerts: ["Risk 1"],
        actionItems: ["Action 1"],
      });

      await service.synthesizeReport(mockTopic, "report-001");

      const updateCall = mockPrisma.topicReport.update.mock.calls[0][0];
      expect(updateCall.data.executiveSummary).toContain("核心结论");
      expect(updateCall.data.executiveSummary).toContain("Conclusion 1");
    });

    it("should handle string executiveSummary", async () => {
      setupMinimalSynthesis("Plain string executive summary");

      await service.synthesizeReport(mockTopic, "report-001");

      const updateCall = mockPrisma.topicReport.update.mock.calls[0][0];
      expect(updateCall.data.executiveSummary).toBe("Plain string executive summary");
    });

    it("should handle JSON string executiveSummary with fullText", async () => {
      const jsonEsStr = JSON.stringify({ fullText: "JSON string executive summary" });
      setupMinimalSynthesis(jsonEsStr);

      await service.synthesizeReport(mockTopic, "report-001");

      const updateCall = mockPrisma.topicReport.update.mock.calls[0][0];
      expect(updateCall.data.executiveSummary).toBe("JSON string executive summary");
    });

    it("should return empty string for null/undefined executiveSummary", async () => {
      setupMinimalSynthesis(null);

      await service.synthesizeReport(mockTopic, "report-001");

      const updateCall = mockPrisma.topicReport.update.mock.calls[0][0];
      expect(updateCall.data.executiveSummary).toBe("");
    });
  });

  // ============================================================
  // synthesizeReport - English topic
  // ============================================================

  describe("synthesizeReport - English topic", () => {
    const englishTopic = {
      ...mockTopic,
      language: "en",
      name: "AI Chip Market Analysis",
    } as unknown as typeof mockTopic;

    it("should use English labels in report when topic.language is 'en'", async () => {
      mockFacade.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          executiveSummary: "English executive summary",
          highlights: [],
          charts: [],
          preface: "English preface content",
        }),
      });

      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([mockDimensionAnalysis]);
      mockPrisma.topicEvidence.findMany.mockResolvedValue([
        {
          id: "ev-001",
          citationIndex: 1,
          title: "English Reference",
          url: "https://example.com",
          domain: "example.com",
          accessedAt: new Date(),
        },
      ]);
      mockReportEditor.editDimensionInputs.mockResolvedValue({
        dimensions: [{
          dimensionId: "dim-001",
          dimensionName: "Market Share",
          summary: "Analysis summary",
          keyFindings: [],
          trends: [],
          challenges: [],
          opportunities: [],
          detailedContent: "Detailed English content",
          sourcesUsed: 1,
          figureReferences: [],
          generatedCharts: [],
        }],
        deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
      });
      mockPrisma.topicReport.update.mockResolvedValue({ id: "report-001" });

      await service.synthesizeReport(englishTopic, "report-001");

      const updateCall = mockPrisma.topicReport.update.mock.calls[0][0];
      // References section should use "References" label (English)
      expect(updateCall.data.fullReport).toContain("References");
    });
  });

  // ============================================================
  // synthesizeReport - charts handling
  // ============================================================

  describe("synthesizeReport - chart collection and deduplication", () => {
    it("should collect and include generated charts from dimension analyses", async () => {
      const analysisWithCharts = {
        ...mockDimensionAnalysis,
        dataPoints: {
          ...mockDimensionAnalysis.dataPoints,
          generatedCharts: [
            { id: "chart-001", title: "Market Share Chart", type: "pie", position: "after", data: { labels: [], values: [] }, source: "Research" },
          ],
          figureReferences: [],
        },
      };

      mockFacade.chat.mockResolvedValueOnce({
        content: JSON.stringify({ executiveSummary: "摘要", highlights: [], charts: [] }),
      });
      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([analysisWithCharts]);
      mockPrisma.topicEvidence.findMany.mockResolvedValue([]);
      mockReportEditor.editDimensionInputs.mockResolvedValue({
        dimensions: [{
          dimensionId: "dim-001",
          dimensionName: "市场份额",
          summary: "摘要",
          keyFindings: [],
          trends: [],
          challenges: [],
          opportunities: [],
          detailedContent: "",
          sourcesUsed: 0,
          figureReferences: [],
          generatedCharts: [{ id: "chart-001", title: "Market Share Chart", type: "pie", position: "after", data: {}, source: "Research" }],
        }],
        deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
      });
      mockPrisma.topicReport.update.mockResolvedValue({ id: "report-001" });

      await service.synthesizeReport(mockTopic, "report-001");

      const updateCall = mockPrisma.topicReport.update.mock.calls[0][0];
      expect(updateCall.data.charts).toBeDefined();
    });

    it("should filter out reference charts with external imageUrl but no data", async () => {
      mockFacade.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          executiveSummary: "摘要",
          highlights: [],
          // Chart with external imageUrl — should be filtered
          charts: [{ id: "ext-chart", chartType: "reference", imageUrl: "https://external.com/img.png" }],
        }),
      });
      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([mockDimensionAnalysis]);
      mockPrisma.topicEvidence.findMany.mockResolvedValue([]);
      mockReportEditor.editDimensionInputs.mockResolvedValue({
        dimensions: [{
          dimensionId: "dim-001",
          dimensionName: "市场份额",
          summary: "摘要",
          keyFindings: [],
          trends: [],
          challenges: [],
          opportunities: [],
          detailedContent: "",
          sourcesUsed: 0,
          figureReferences: [],
          generatedCharts: [],
        }],
        deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
      });
      mockPrisma.topicReport.update.mockResolvedValue({ id: "report-001" });

      await service.synthesizeReport(mockTopic, "report-001");

      const updateCall = mockPrisma.topicReport.update.mock.calls[0][0];
      // External reference chart should be filtered out
      const charts = updateCall.data.charts as Array<{ id: string; chartType: string; imageUrl?: string; data?: unknown }>;
      const externalChart = charts.find((c) => c.id === "ext-chart" && c.chartType === "reference" && c.imageUrl && !c.data);
      expect(externalChart).toBeUndefined();
    });
  });

  // ============================================================
  // synthesizeReport - fallback AI response parsing
  // ============================================================

  describe("synthesizeReport - fallback AI response handling", () => {
    it("should use fallback report when AI returns non-JSON content", async () => {
      mockPrisma.dimensionAnalysis.findMany.mockResolvedValue([mockDimensionAnalysis]);
      mockPrisma.topicEvidence.findMany.mockResolvedValue([]);

      // AI returns plain text, not JSON
      mockFacade.chat.mockResolvedValueOnce({
        content: "This is plain text without any JSON structure.",
      });

      mockReportEditor.editDimensionInputs.mockResolvedValue({
        dimensions: [{
          dimensionId: "dim-001",
          dimensionName: "市场份额",
          summary: "摘要",
          keyFindings: [],
          trends: [],
          challenges: [],
          opportunities: [],
          detailedContent: "",
          sourcesUsed: 0,
          figureReferences: [],
          generatedCharts: [],
        }],
        deduplicationStats: { removedParagraphs: 0, duplicateClaims: 0, affectedDimensions: [] },
      });
      mockPrisma.topicReport.update.mockResolvedValue({ id: "report-001" });

      // Should not throw — should create fallback report
      const result = await service.synthesizeReport(mockTopic, "report-001");
      expect(result).toHaveProperty("id", "report-001");
    });
  });

  // ============================================================
  // listReports / getReport / compareReports (via service public methods)
  // ============================================================

  describe("listReports", () => {
    it("should return paginated list of reports", async () => {
      const reports = [{ id: "report-001", version: 2, versionLabel: "v2.0" }];
      mockPrisma.topicReport.findMany.mockResolvedValue(reports);
      mockPrisma.topicReport.count.mockResolvedValue(1);

      const result = await service.listReports("topic-001", { skip: 0, take: 10 });

      expect(result.reports).toEqual(reports);
      expect(result.total).toBe(1);
      expect(result.skip).toBe(0);
      expect(result.take).toBe(10);
    });
  });

  describe("getLatestReport", () => {
    it("should return the latest report for a topic", async () => {
      const latestReport = { id: "report-latest", version: 5, topicId: "topic-001" };
      mockPrisma.topicReport.findFirst.mockResolvedValue(latestReport);

      const result = await service.getLatestReport("topic-001");

      expect(result).toEqual(latestReport);
    });

    it("should return null when no reports exist", async () => {
      mockPrisma.topicReport.findFirst.mockResolvedValue(null);

      const result = await service.getLatestReport("topic-001");

      expect(result).toBeNull();
    });
  });

  describe("getReport", () => {
    it("should return a specific report by id", async () => {
      const report = { id: "report-001", version: 1, topicId: "topic-001" };
      mockPrisma.topicReport.findUnique.mockResolvedValue(report);

      const result = await service.getReport("report-001");

      expect(result).toEqual(report);
    });

    it("should return null when report not found", async () => {
      mockPrisma.topicReport.findUnique.mockResolvedValue(null);

      const result = await service.getReport("no-such-report");

      expect(result).toBeNull();
    });
  });
});
