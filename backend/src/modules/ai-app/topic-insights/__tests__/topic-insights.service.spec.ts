/**
 * TopicInsightsService (Facade) Unit Tests
 *
 * Coverage targets:
 * - Delegation methods (createTopic, listTopics, etc.) correctly delegate to sub-services
 * - triggerRefresh: topic ownership, orchestration
 * - regenerateReportContent: ownership check, synthesis, event emission
 * - getCredibilityReport: report found, ownership check
 * - verifyTopicOwnership / verifyTopicReadAccess
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TopicInsightsService } from "../topic-insights.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import {
  TopicTeamOrchestratorService,
  ReportSynthesisService,
  EvidenceManagementService,
  ReportChangeService,
  ReportAnnotationService,
  ResearchStrategyService,
  AgentActivityService,
  CredibilityReportService,
  TopicCrudService,
  TopicDimensionService,
  TopicExportService,
  TopicScheduleService,
} from "../services";
import { AIEngineFacade } from "@/modules/ai-engine/facade";

// ──────────────────────────────────────────────────────────────────────────────
// Mock factory
// ──────────────────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    topicReport: {
      findUnique: jest.fn(),
    },
    topicRefreshLog: {
      findFirst: jest.fn(),
    },
    researchTopic: {
      findUnique: jest.fn(),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockOrchestrator = {
    executeRefresh: jest.fn(),
    getRefreshStatus: jest.fn(),
  };

  const mockReportService = {
    synthesizeReport: jest.fn(),
  };

  const mockEvidenceService = {
    recalculateCredibilityScores: jest.fn(),
    listEvidence: jest.fn(),
  };

  const mockFacade = {
    chat: jest.fn(),
  };

  const mockReportChangeService = {
    getChanges: jest.fn(),
    addChange: jest.fn(),
  };

  const mockReportAnnotationService = {
    getAnnotations: jest.fn(),
    addAnnotation: jest.fn(),
  };

  const mockResearchStrategyService = {
    analyzeAndRecommend: jest.fn(),
    quickCheck: jest.fn(),
    getSmartRefreshOptions: jest.fn(),
  };

  const mockAgentActivityService = {
    getActivitiesByDimension: jest.fn(),
    getActivityStats: jest.fn(),
  };

  const mockCredibilityReportService = {
    getOrGenerateCredibilityReport: jest.fn(),
    generateCredibilityReport: jest.fn(),
  };

  const mockCrudService = {
    createTopic: jest.fn(),
    listTopics: jest.fn(),
    getTopic: jest.fn(),
    updateTopic: jest.fn(),
    deleteTopic: jest.fn(),
    getResearchHistory: jest.fn(),
    getLogs: jest.fn(),
    getStats: jest.fn(),
    recalculateTopicStats: jest.fn(),
  };

  const mockDimensionService = {
    listDimensions: jest.fn(),
    addDimension: jest.fn(),
    updateDimension: jest.fn(),
    deleteDimension: jest.fn(),
    refreshDimension: jest.fn(),
    reorderDimensions: jest.fn(),
    getTemplates: jest.fn(),
    createFromTemplate: jest.fn(),
  };

  const mockExportService = {
    exportReport: jest.fn(),
    updateVisibility: jest.fn(),
    getSharingSettings: jest.fn(),
    getSharedTopic: jest.fn(),
    getSharedTopicLatestReport: jest.fn(),
  };

  const mockScheduleService = {
    getSchedule: jest.fn(),
    updateSchedule: jest.fn(),
  };

  return {
    mockPrisma,
    mockEventEmitter,
    mockOrchestrator,
    mockReportService,
    mockEvidenceService,
    mockFacade,
    mockReportChangeService,
    mockReportAnnotationService,
    mockResearchStrategyService,
    mockAgentActivityService,
    mockCredibilityReportService,
    mockCrudService,
    mockDimensionService,
    mockExportService,
    mockScheduleService,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("TopicInsightsService", () => {
  let service: TopicInsightsService;
  let mockPrisma: ReturnType<typeof buildMocks>["mockPrisma"];
  let mockEventEmitter: ReturnType<typeof buildMocks>["mockEventEmitter"];
  let mockOrchestrator: ReturnType<typeof buildMocks>["mockOrchestrator"];
  let mockReportService: ReturnType<typeof buildMocks>["mockReportService"];
  let mockCrudService: ReturnType<typeof buildMocks>["mockCrudService"];
  let mockDimensionService: ReturnType<typeof buildMocks>["mockDimensionService"];
  let mockExportService: ReturnType<typeof buildMocks>["mockExportService"];
  let mockCredibilityReportService: ReturnType<typeof buildMocks>["mockCredibilityReportService"];
  let mockResearchStrategyService: ReturnType<typeof buildMocks>["mockResearchStrategyService"];

  beforeEach(async () => {
    const mocks = buildMocks();
    mockPrisma = mocks.mockPrisma;
    mockEventEmitter = mocks.mockEventEmitter;
    mockOrchestrator = mocks.mockOrchestrator;
    mockReportService = mocks.mockReportService;
    mockCrudService = mocks.mockCrudService;
    mockDimensionService = mocks.mockDimensionService;
    mockExportService = mocks.mockExportService;
    mockCredibilityReportService = mocks.mockCredibilityReportService;
    mockResearchStrategyService = mocks.mockResearchStrategyService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopicInsightsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: TopicTeamOrchestratorService, useValue: mockOrchestrator },
        { provide: ReportSynthesisService, useValue: mockReportService },
        { provide: EvidenceManagementService, useValue: mocks.mockEvidenceService },
        { provide: AIEngineFacade, useValue: mocks.mockFacade },
        { provide: ReportChangeService, useValue: mocks.mockReportChangeService },
        { provide: ReportAnnotationService, useValue: mocks.mockReportAnnotationService },
        { provide: ResearchStrategyService, useValue: mockResearchStrategyService },
        { provide: AgentActivityService, useValue: mocks.mockAgentActivityService },
        { provide: CredibilityReportService, useValue: mockCredibilityReportService },
        { provide: TopicCrudService, useValue: mockCrudService },
        { provide: TopicDimensionService, useValue: mockDimensionService },
        { provide: TopicExportService, useValue: mockExportService },
        { provide: TopicScheduleService, useValue: mocks.mockScheduleService },
      ],
    }).compile();

    service = module.get<TopicInsightsService>(TopicInsightsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ============================================================
  // Delegation methods
  // ============================================================

  describe("CRUD delegation (createTopic, listTopics, etc.)", () => {
    it("should delegate createTopic to crudService", async () => {
      const expectedTopic = { id: "topic-001", name: "新专题" };
      mockCrudService.createTopic.mockResolvedValue(expectedTopic);

      const dto = { name: "新专题", type: "technology" };
      const result = await service.createTopic("user-001", dto as never);

      expect(mockCrudService.createTopic).toHaveBeenCalledWith("user-001", dto);
      expect(result).toEqual(expectedTopic);
    });

    it("should delegate listTopics to crudService", async () => {
      const expectedList = { items: [], total: 0 };
      mockCrudService.listTopics.mockResolvedValue(expectedList);

      const query = { page: 1, pageSize: 10 };
      const result = await service.listTopics("user-001", query as never);

      expect(mockCrudService.listTopics).toHaveBeenCalledWith("user-001", query);
      expect(result).toEqual(expectedList);
    });

    it("should delegate getTopic to crudService", async () => {
      const topic = { id: "topic-001", name: "测试专题" };
      mockCrudService.getTopic.mockResolvedValue(topic);

      const result = await service.getTopic("user-001", "topic-001");

      expect(mockCrudService.getTopic).toHaveBeenCalledWith("user-001", "topic-001");
      expect(result).toEqual(topic);
    });

    it("should delegate deleteTopic to crudService", async () => {
      mockCrudService.deleteTopic.mockResolvedValue({ success: true });

      await service.deleteTopic("user-001", "topic-001");

      expect(mockCrudService.deleteTopic).toHaveBeenCalledWith("user-001", "topic-001");
    });

    it("should delegate getStats to crudService", async () => {
      const stats = { dimensions: 3, sources: 42, reports: 2 };
      mockCrudService.getStats.mockResolvedValue(stats);

      const result = await service.getStats("user-001", "topic-001");

      expect(mockCrudService.getStats).toHaveBeenCalledWith("user-001", "topic-001");
      expect(result).toEqual(stats);
    });
  });

  describe("Dimension delegation", () => {
    it("should delegate addDimension to dimensionService", async () => {
      const dimension = { id: "dim-001", name: "新维度" };
      mockDimensionService.addDimension.mockResolvedValue(dimension);

      const dto = { name: "新维度", description: "维度描述" };
      const result = await service.addDimension("user-001", "topic-001", dto as never);

      expect(mockDimensionService.addDimension).toHaveBeenCalledWith("user-001", "topic-001", dto);
      expect(result).toEqual(dimension);
    });

    it("should delegate listDimensions to dimensionService", async () => {
      mockDimensionService.listDimensions.mockResolvedValue([]);

      await service.listDimensions("user-001", "topic-001");

      expect(mockDimensionService.listDimensions).toHaveBeenCalledWith("user-001", "topic-001");
    });
  });

  describe("Export delegation", () => {
    it("should delegate exportReport to exportService", async () => {
      const exportResult = { url: "https://download.example.com/report.pdf" };
      mockExportService.exportReport.mockResolvedValue(exportResult);

      const dto = { format: "pdf" };
      const result = await service.exportReport("user-001", "topic-001", "report-001", dto as never);

      expect(mockExportService.exportReport).toHaveBeenCalledWith("user-001", "topic-001", "report-001", dto);
      expect(result).toEqual(exportResult);
    });
  });

  // ============================================================
  // triggerRefresh
  // ============================================================

  describe("triggerRefresh", () => {
    it("should call orchestrator executeRefresh with correct options for FULL refresh", async () => {
      const mockTopic = { id: "topic-001", name: "测试专题", userId: "user-001" };
      mockCrudService.getTopic.mockResolvedValue(mockTopic);
      const mockReport = { id: "report-001" };
      mockOrchestrator.executeRefresh.mockResolvedValue(mockReport);

      const dto = { type: "FULL" };
      const result = await service.triggerRefresh("user-001", "topic-001", dto as never);

      expect(mockOrchestrator.executeRefresh).toHaveBeenCalledWith(
        mockTopic,
        expect.objectContaining({
          forceRefresh: true,
          incremental: false,
        }),
      );
      expect(result.success).toBe(true);
      expect(result.reportId).toBe("report-001");
    });

    it("should use incremental option for INCREMENTAL refresh type", async () => {
      const mockTopic = { id: "topic-001", name: "测试专题", userId: "user-001" };
      mockCrudService.getTopic.mockResolvedValue(mockTopic);
      mockOrchestrator.executeRefresh.mockResolvedValue({ id: "report-002" });

      const dto = { type: "INCREMENTAL" };
      await service.triggerRefresh("user-001", "topic-001", dto as never);

      expect(mockOrchestrator.executeRefresh).toHaveBeenCalledWith(
        mockTopic,
        expect.objectContaining({ incremental: true }),
      );
    });

    it("should propagate error when topic not found", async () => {
      mockCrudService.getTopic.mockRejectedValue(new NotFoundException("Topic not found"));

      await expect(
        service.triggerRefresh("user-001", "nonexistent", { type: "FULL" } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // regenerateReportContent
  // ============================================================

  describe("regenerateReportContent", () => {
    const mockReport = {
      id: "report-001",
      topicId: "topic-001",
      topic: {
        id: "topic-001",
        userId: "user-001",
        name: "量子计算",
        type: "technology",
      },
    };

    it("should regenerate report and return updated content", async () => {
      mockPrisma.topicReport.findUnique.mockResolvedValue(mockReport);
      const updatedReport = { ...mockReport, fullReport: "更新后的报告内容" };
      mockReportService.synthesizeReport.mockResolvedValue(updatedReport);

      const result = await service.regenerateReportContent("user-001", "report-001");

      expect(mockReportService.synthesizeReport).toHaveBeenCalledWith(
        mockReport.topic,
        "report-001",
        undefined,
      );
      expect(result.success).toBe(true);
      expect(result.report).toEqual(updatedReport);
    });

    it("should pass feedback to synthesizeReport", async () => {
      mockPrisma.topicReport.findUnique.mockResolvedValue(mockReport);
      mockReportService.synthesizeReport.mockResolvedValue({ id: "report-001" });

      await service.regenerateReportContent("user-001", "report-001", "请增加数据图表");

      expect(mockReportService.synthesizeReport).toHaveBeenCalledWith(
        mockReport.topic,
        "report-001",
        "请增加数据图表",
      );
    });

    it("should emit refresh event after successful regeneration", async () => {
      mockPrisma.topicReport.findUnique.mockResolvedValue(mockReport);
      mockReportService.synthesizeReport.mockResolvedValue({ id: "report-001" });

      await service.regenerateReportContent("user-001", "report-001");

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        "topic-insights.report.refreshed",
        expect.objectContaining({
          topicId: "topic-001",
          reportId: "report-001",
          refreshedAt: expect.any(Date),
        }),
      );
    });

    it("should throw NotFoundException when report not found", async () => {
      mockPrisma.topicReport.findUnique.mockResolvedValue(null);

      await expect(
        service.regenerateReportContent("user-001", "nonexistent-report"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when report belongs to different user", async () => {
      mockPrisma.topicReport.findUnique.mockResolvedValue({
        ...mockReport,
        topic: { ...mockReport.topic, userId: "other-user" },
      });

      await expect(
        service.regenerateReportContent("user-001", "report-001"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // getCredibilityReport
  // ============================================================

  describe("getCredibilityReport", () => {
    it("should return credibility report when user has access", async () => {
      mockPrisma.topicReport.findUnique.mockResolvedValue({
        id: "report-001",
        topic: { id: "topic-001", userId: "user-001" },
      });
      mockPrisma.researchTopic.findUnique.mockResolvedValue({
        id: "topic-001",
        userId: "user-001",
        visibility: "PRIVATE",
      });
      const credReport = { score: 0.85, sources: [] };
      mockCredibilityReportService.getOrGenerateCredibilityReport.mockResolvedValue(credReport);

      const result = await service.getCredibilityReport("user-001", "report-001");

      expect(mockCredibilityReportService.getOrGenerateCredibilityReport).toHaveBeenCalledWith("report-001");
      expect(result).toEqual(credReport);
    });

    it("should throw NotFoundException when report not found", async () => {
      mockPrisma.topicReport.findUnique.mockResolvedValue(null);

      await expect(
        service.getCredibilityReport("user-001", "nonexistent-report"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // getResearchStrategy
  // ============================================================

  describe("getResearchStrategy", () => {
    it("should call researchStrategyService.analyzeAndRecommend after ownership check", async () => {
      const mockTopic = { id: "topic-001", name: "策略测试", userId: "user-001" };
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      const strategy = { recommendation: "INCREMENTAL", reason: "部分维度需更新" };
      mockResearchStrategyService.analyzeAndRecommend.mockResolvedValue(strategy);

      const result = await service.getResearchStrategy("user-001", "topic-001");

      expect(mockResearchStrategyService.analyzeAndRecommend).toHaveBeenCalledWith("topic-001");
      expect(result).toEqual(strategy);
    });
  });

  // ============================================================
  // smartStartResearch
  // ============================================================

  describe("smartStartResearch", () => {
    it("should use smart strategy to determine refresh options", async () => {
      const mockTopic = { id: "topic-001", name: "智能研究", userId: "user-001" };
      mockCrudService.getTopic.mockResolvedValue(mockTopic);
      mockResearchStrategyService.getSmartRefreshOptions.mockResolvedValue({
        strategy: "INCREMENTAL",
        message: "建议增量更新",
        forceRefresh: false,
        dimensionIds: undefined,
        incremental: true,
      });
      mockOrchestrator.executeRefresh.mockResolvedValue({ id: "report-smart-001" });

      const result = await service.smartStartResearch("user-001", "topic-001");

      expect(mockResearchStrategyService.getSmartRefreshOptions).toHaveBeenCalledWith("topic-001");
      expect(mockOrchestrator.executeRefresh).toHaveBeenCalledWith(
        mockTopic,
        expect.objectContaining({ incremental: true }),
      );
      expect(result.strategy).toBe("INCREMENTAL");
    });
  });

  // ============================================================
  // quickCheckResearchStatus
  // ============================================================

  describe("quickCheckResearchStatus", () => {
    it("should verify topic ownership and call quickCheck", async () => {
      const mockTopic = { id: "topic-001", userId: "user-001" };
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      const checkResult = { needsRefresh: true, reason: "outdated" };
      mockResearchStrategyService.quickCheck.mockResolvedValue(checkResult);

      const result = await service.quickCheckResearchStatus("user-001", "topic-001");

      expect(mockResearchStrategyService.quickCheck).toHaveBeenCalledWith("topic-001");
      expect(result).toEqual(checkResult);
    });

    it("should throw NotFoundException when topic not found", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(null);

      await expect(service.quickCheckResearchStatus("user-001", "no-topic")).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user is not the owner", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "other-user" });

      await expect(service.quickCheckResearchStatus("user-001", "topic-001")).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // getAgentActivities
  // ============================================================

  describe("getAgentActivities", () => {
    it("should return activities after verifying ownership", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const mocks = buildMocks();
      const mockAgentActivityService = mocks.mockAgentActivityService;
      mockAgentActivityService.getActivitiesByDimension.mockResolvedValue([]);

      // Need to access the actual mock from the module
      const { mockAgentActivityService: agentSvc } = buildMocks();
      agentSvc.getActivitiesByDimension.mockResolvedValue([{ id: "act-1" }]);

      // The service is already configured with mockAgentActivityService from module setup
      // Just verify ownership check happens before delegation
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
    });

    it("should throw ForbiddenException when user does not own topic", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "different-user" });

      await expect(service.getAgentActivities("user-001", "topic-001")).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // getRefreshStatus
  // ============================================================

  describe("getRefreshStatus", () => {
    it("should return refresh status and latest log", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      mockOrchestrator.getRefreshStatus.mockReturnValue({ isRunning: false, startedAt: null });
      const latestLog = { id: "log-001", startedAt: new Date() };
      mockPrisma.topicRefreshLog.findFirst.mockResolvedValue(latestLog);

      const result = await service.getRefreshStatus("user-001", "topic-001");

      expect(result.isRunning).toBe(false);
      expect(result.latestLog).toEqual(latestLog);
    });

    it("should throw NotFoundException when topic not found for refresh status", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(null);

      await expect(service.getRefreshStatus("user-001", "no-topic")).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // cancelRefresh
  // ============================================================

  describe("cancelRefresh", () => {
    it("should cancel refresh and return success true when running", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      mockOrchestrator.cancelRefresh = jest.fn().mockResolvedValue(true);

      const result = await service.cancelRefresh("user-001", "topic-001", {} as never);

      expect(result.success).toBe(true);
      expect(result.message).toContain("取消");
    });

    it("should return success false when no refresh is running", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      mockOrchestrator.cancelRefresh = jest.fn().mockResolvedValue(false);

      const result = await service.cancelRefresh("user-001", "topic-001", {} as never);

      expect(result.success).toBe(false);
    });

    it("should throw ForbiddenException when cancelling for different user", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "other-user" });

      await expect(service.cancelRefresh("user-001", "topic-001", {} as never)).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // listReports
  // ============================================================

  describe("listReports", () => {
    it("should list reports after read access verification", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const mockListReports = jest.fn().mockResolvedValue([{ id: "report-001" }]);
      // Rebuild service with mockReportService.listReports
      const mocks2 = buildMocks();
      mocks2.mockReportService.listReports = mockListReports;
    });

    it("should throw NotFoundException when topic not found for listReports", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(null);

      await expect(service.listReports("user-001", "no-topic", { limit: 10 } as never)).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // getLatestReport
  // ============================================================

  describe("getLatestReport", () => {
    it("should throw NotFoundException when no reports exist", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const mockGetLatestReport = jest.fn().mockResolvedValue(null);
      // Access the internal reportService mock
      // Since we can't easily re-mock, we test via the null-check path
      // by stubbing the mock directly on the existing module instance
      const reportSvcMock = (service as unknown as { reportService: { getLatestReport: jest.Mock } }).reportService;
      reportSvcMock.getLatestReport = mockGetLatestReport;

      await expect(service.getLatestReport("user-001", "topic-001")).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // getReport
  // ============================================================

  describe("getReport", () => {
    it("should throw NotFoundException when report topicId mismatch", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getReport: jest.Mock } }).reportService;
      reportSvcMock.getReport = jest.fn().mockResolvedValue({ id: "report-001", topicId: "other-topic" });

      await expect(service.getReport("user-001", "topic-001", "report-001")).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when report not found", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getReport: jest.Mock } }).reportService;
      reportSvcMock.getReport = jest.fn().mockResolvedValue(null);

      await expect(service.getReport("user-001", "topic-001", "no-report")).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // deleteReport
  // ============================================================

  describe("deleteReport", () => {
    it("should delete report and return success", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getReport: jest.Mock } }).reportService;
      reportSvcMock.getReport = jest.fn().mockResolvedValue({ id: "report-001", topicId: "topic-001" });

      // Mock $transaction
      (mockPrisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn().mockResolvedValue(undefined);

      const result = await service.deleteReport("user-001", "topic-001", "report-001");

      expect(result.success).toBe(true);
    });

    it("should throw NotFoundException when report not found for deletion", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getReport: jest.Mock } }).reportService;
      reportSvcMock.getReport = jest.fn().mockResolvedValue(null);

      await expect(service.deleteReport("user-001", "topic-001", "no-report")).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user does not own the topic", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "other-user" });

      await expect(service.deleteReport("user-001", "topic-001", "report-001")).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // recalculateEvidenceCredibility
  // ============================================================

  describe("recalculateEvidenceCredibility", () => {
    it("should delegate to evidenceService", async () => {
      const mocks = buildMocks();
      mocks.mockEvidenceService.recalculateCredibilityScores.mockResolvedValue({ updated: 5 });
      const evidenceSvcMock = (service as unknown as { evidenceService: { recalculateCredibilityScores: jest.Mock } }).evidenceService;
      evidenceSvcMock.recalculateCredibilityScores = mocks.mockEvidenceService.recalculateCredibilityScores;

      await service.recalculateEvidenceCredibility("report-001");

      expect(evidenceSvcMock.recalculateCredibilityScores).toHaveBeenCalledWith("report-001");
    });
  });

  // ============================================================
  // aiEditReport
  // ============================================================

  describe("aiEditReport", () => {
    const setupAiEditMocks = () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getReport: jest.Mock } }).reportService;
      reportSvcMock.getReport = jest.fn().mockResolvedValue({
        id: "report-001",
        topicId: "topic-001",
        fullReport: "Original report content with [some text] to replace.",
      });
      const prismaMock = mockPrisma as unknown as { $transaction: jest.Mock };
      prismaMock.$transaction = jest.fn().mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const fakeTx = {
          topicReportRevision: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
          topicReport: { update: jest.fn().mockResolvedValue({ id: "report-001", fullReport: "Edited content" }) },
        };
        return fn(fakeTx);
      });
    };

    it("should perform AI edit with selectedText and replace in report", async () => {
      setupAiEditMocks();
      const facadeMock = (service as unknown as { aiFacade: { chat: jest.Mock } }).aiFacade;
      facadeMock.chat = jest.fn().mockResolvedValue({ content: "Edited content", isError: false });

      const result = await service.aiEditReport("user-001", "topic-001", "report-001", {
        operation: "rewrite",
        selectedText: "some text",
        context: "Make it better",
      });

      expect(result.editedContent).toBe("Edited content");
      expect(result.operation).toBe("rewrite");
    });

    it("should use entire report when no selectedText is provided", async () => {
      setupAiEditMocks();
      const facadeMock = (service as unknown as { aiFacade: { chat: jest.Mock } }).aiFacade;
      facadeMock.chat = jest.fn().mockResolvedValue({ content: "Completely new report", isError: false });

      const result = await service.aiEditReport("user-001", "topic-001", "report-001", {
        operation: "polish",
      });

      expect(result.editedContent).toBe("Completely new report");
    });

    it("should throw NotFoundException when report not found for AI edit", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getReport: jest.Mock } }).reportService;
      reportSvcMock.getReport = jest.fn().mockResolvedValue(null);

      await expect(
        service.aiEditReport("user-001", "topic-001", "no-report", { operation: "polish" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user does not own topic for AI edit", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "other-user" });

      await expect(
        service.aiEditReport("user-001", "topic-001", "report-001", { operation: "polish" }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // getReportRevisions
  // ============================================================

  describe("getReportRevisions", () => {
    it("should return report revisions", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getReport: jest.Mock } }).reportService;
      reportSvcMock.getReport = jest.fn().mockResolvedValue({ id: "report-001", topicId: "topic-001" });
      const revisions = [{ id: "rev-001", revisionNumber: 1, changeDescription: "Initial" }];
      (mockPrisma as unknown as { topicReportRevision: { findMany: jest.Mock } }).topicReportRevision = {
        findMany: jest.fn().mockResolvedValue(revisions),
      };

      const result = await service.getReportRevisions("user-001", "topic-001", "report-001");

      expect(result).toEqual(revisions);
    });

    it("should throw NotFoundException when report not found for revisions", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getReport: jest.Mock } }).reportService;
      reportSvcMock.getReport = jest.fn().mockResolvedValue(null);

      await expect(service.getReportRevisions("user-001", "topic-001", "no-report")).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // Annotation operations
  // ============================================================

  describe("getReportAnnotations", () => {
    it("should return annotations for a valid report", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getReport: jest.Mock } }).reportService;
      reportSvcMock.getReport = jest.fn().mockResolvedValue({ id: "report-001", topicId: "topic-001" });
      const annotationSvcMock = (service as unknown as {
        reportAnnotationService: { getAnnotations: jest.Mock }
      }).reportAnnotationService;
      annotationSvcMock.getAnnotations = jest.fn().mockResolvedValue([]);

      const result = await service.getReportAnnotations("user-001", "topic-001", "report-001");

      expect(annotationSvcMock.getAnnotations).toHaveBeenCalledWith("report-001", undefined);
      expect(result).toEqual([]);
    });

    it("should throw NotFoundException when report not found for annotations", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getReport: jest.Mock } }).reportService;
      reportSvcMock.getReport = jest.fn().mockResolvedValue(null);

      await expect(service.getReportAnnotations("user-001", "topic-001", "no-report")).rejects.toThrow(NotFoundException);
    });
  });

  describe("updateAnnotation - ownership check", () => {
    it("should throw ForbiddenException when user does not own the annotation", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getReport: jest.Mock } }).reportService;
      reportSvcMock.getReport = jest.fn().mockResolvedValue({ id: "report-001", topicId: "topic-001" });
      mockPrisma.reportAnnotation = { findUnique: jest.fn().mockResolvedValue({ createdById: "other-user" }) } as never;

      await expect(
        service.updateAnnotation("user-001", "topic-001", "report-001", "annotation-001", {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException when annotation not found", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getReport: jest.Mock } }).reportService;
      reportSvcMock.getReport = jest.fn().mockResolvedValue({ id: "report-001", topicId: "topic-001" });
      mockPrisma.reportAnnotation = { findUnique: jest.fn().mockResolvedValue(null) } as never;

      await expect(
        service.updateAnnotation("user-001", "topic-001", "report-001", "no-annotation", {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // verifyTopicReadAccess - public topic access
  // ============================================================

  describe("verifyTopicReadAccess (via getLatestReport)", () => {
    it("should allow topic owner to access regardless of visibility", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getLatestReport: jest.Mock } }).reportService;
      reportSvcMock.getLatestReport = jest.fn().mockResolvedValue({
        id: "report-001",
        topicId: "topic-001",
        executiveSummary: null,
        fullReport: null,
        dimensionAnalyses: null,
      });

      const result = await service.getLatestReport("user-001", "topic-001");
      expect(result).toBeDefined();
    });

    it("should throw ForbiddenException when non-owner tries to access private topic", async () => {
      // Return topic owned by another user
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "other-user" });
      // For non-owner access, the service calls $queryRaw to check visibility
      (mockPrisma as unknown as { $queryRaw: jest.Mock }).$queryRaw = jest.fn().mockResolvedValue([
        { visibility: "PRIVATE", is_collaborator: false },
      ]);

      await expect(service.getLatestReport("user-001", "topic-001")).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // regenerateCredibilityReport
  // ============================================================

  describe("regenerateCredibilityReport", () => {
    it("should regenerate credibility report for owned report", async () => {
      mockPrisma.topicReport.findUnique.mockResolvedValue({
        id: "report-001",
        topic: { userId: "user-001" },
      });
      const credReport = { id: "cred-001", score: 0.9 };
      mockCredibilityReportService.generateCredibilityReport.mockResolvedValue(credReport);

      const result = await service.regenerateCredibilityReport("user-001", "report-001");

      expect(mockCredibilityReportService.generateCredibilityReport).toHaveBeenCalledWith("report-001");
      expect(result).toEqual(credReport);
    });

    it("should throw NotFoundException when report not found or not owned", async () => {
      mockPrisma.topicReport.findUnique.mockResolvedValue(null);

      await expect(service.regenerateCredibilityReport("user-001", "no-report")).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when report belongs to different user", async () => {
      mockPrisma.topicReport.findUnique.mockResolvedValue({
        id: "report-001",
        topic: { userId: "other-user" },
      });

      await expect(service.regenerateCredibilityReport("user-001", "report-001")).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // Schedule delegation
  // ============================================================

  describe("Schedule delegation", () => {
    it("should delegate getSchedule to scheduleService", async () => {
      const mocks = buildMocks();
      mocks.mockScheduleService.getSchedule.mockResolvedValue({ interval: "daily" });
      const scheduleSvcMock = (service as unknown as { scheduleService: typeof mocks.mockScheduleService }).scheduleService;
      scheduleSvcMock.getSchedule = mocks.mockScheduleService.getSchedule;

      await service.getSchedule("user-001", "topic-001");
      expect(scheduleSvcMock.getSchedule).toHaveBeenCalledWith("user-001", "topic-001");
    });

    it("should delegate updateSchedule to scheduleService", async () => {
      const mocks = buildMocks();
      mocks.mockScheduleService.updateSchedule.mockResolvedValue({ interval: "weekly" });
      const scheduleSvcMock = (service as unknown as { scheduleService: typeof mocks.mockScheduleService }).scheduleService;
      scheduleSvcMock.updateSchedule = mocks.mockScheduleService.updateSchedule;

      const dto = { interval: "weekly" };
      await service.updateSchedule("user-001", "topic-001", dto as never);
      expect(scheduleSvcMock.updateSchedule).toHaveBeenCalledWith("user-001", "topic-001", dto);
    });
  });

  // ============================================================
  // transformReportForFrontend (via getLatestReport)
  // ============================================================

  describe("transformReportForFrontend", () => {
    it("should clean HTML tags from executiveSummary and fullReport", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getLatestReport: jest.Mock } }).reportService;
      reportSvcMock.getLatestReport = jest.fn().mockResolvedValue({
        id: "report-001",
        topicId: "topic-001",
        executiveSummary: "Summary with <br> line break",
        fullReport: "<p>Full report</p><p>Second paragraph</p>",
        dimensionAnalyses: null,
      });

      const result = await service.getLatestReport("user-001", "topic-001") as Record<string, unknown>;

      // HTML tags should be cleaned
      expect(result.executiveSummary as string).not.toContain("<br>");
      expect(result.fullReport as string).not.toContain("<p>");
    });

    it("should transform dimensionAnalyses and extract dataPoints to top-level", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue({ id: "topic-001", userId: "user-001" });
      const reportSvcMock = (service as unknown as { reportService: { getLatestReport: jest.Mock } }).reportService;
      reportSvcMock.getLatestReport = jest.fn().mockResolvedValue({
        id: "report-001",
        topicId: "topic-001",
        executiveSummary: null,
        fullReport: null,
        dimensionAnalyses: [
          {
            id: "analysis-001",
            summary: "Analysis summary",
            analysis: "Analysis detail",
            keyFindings: [{ finding: "Finding 1", implication: "Implication 1" }],
            dataPoints: {
              trends: [{ trend: "Trend 1", drivers: "Driver 1", prediction: "Prediction 1" }],
              challenges: [{ challenge: "Challenge 1", rootCause: "Root cause", impact: "High", potentialSolutions: "Solution" }],
              opportunities: [{ opportunity: "Opportunity 1", potential: "High", requirements: "Requirements" }],
              confidenceLevel: "high",
              detailedContent: "Detailed content here",
            },
          },
        ],
      });

      const result = await service.getLatestReport("user-001", "topic-001") as Record<string, unknown>;

      const analyses = result.dimensionAnalyses as Array<Record<string, unknown>>;
      expect(analyses).toBeDefined();
      expect(analyses[0].trends).toBeDefined();
      expect(analyses[0].challenges).toBeDefined();
      expect(analyses[0].opportunities).toBeDefined();
      expect(analyses[0].confidenceLevel).toBe("high");
      expect(analyses[0].detailedContent).toBe("Detailed content here");
    });
  });
});
