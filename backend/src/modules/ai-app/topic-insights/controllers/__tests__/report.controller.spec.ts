import { UnauthorizedException } from "@nestjs/common";
import { ReportController } from "../report.controller";
import type { TopicInsightsService } from "../../topic-insights.service";

function createMockTopicService() {
  return {
    listReports: jest.fn().mockResolvedValue({ items: [] }),
    getLatestReport: jest.fn().mockResolvedValue({ id: "report-1" }),
    getReport: jest.fn().mockResolvedValue({ id: "report-1" }),
    deleteReport: jest.fn().mockResolvedValue({ deleted: true }),
    exportReport: jest.fn().mockResolvedValue({ downloadUrl: "https://..." }),
    compareReports: jest.fn().mockResolvedValue({ diff: {} }),
    updateReportContent: jest.fn().mockResolvedValue({ id: "report-1" }),
    aiEditReport: jest.fn().mockResolvedValue({ id: "report-1" }),
    getReportRevisions: jest.fn().mockResolvedValue([]),
    rollbackReport: jest.fn().mockResolvedValue({ id: "report-1" }),
    getReportChanges: jest.fn().mockResolvedValue([]),
    checkinChange: jest.fn().mockResolvedValue({ id: "change-1" }),
    checkinAllChanges: jest.fn().mockResolvedValue({ count: 3 }),
    listEvidence: jest.fn().mockResolvedValue({ items: [] }),
    getEvidence: jest.fn().mockResolvedValue({ id: "ev-1" }),
    getCredibilityReport: jest.fn().mockResolvedValue({ score: 85 }),
    regenerateReportContent: jest.fn().mockResolvedValue(undefined),
    regenerateCredibilityReport: jest.fn().mockResolvedValue({ score: 90 }),
    recalculateEvidenceCredibility: jest.fn().mockResolvedValue({ updated: 5 }),
  } as unknown as jest.Mocked<TopicInsightsService>;
}

function createMockRequest(userId?: string) {
  return { user: { id: userId } };
}

describe("ReportController", () => {
  let controller: ReportController;
  let mockTopicService: jest.Mocked<TopicInsightsService>;
  let mockReq: ReturnType<typeof createMockRequest>;

  beforeEach(() => {
    mockTopicService = createMockTopicService();
    controller = new ReportController(
      mockTopicService as unknown as TopicInsightsService,
    );
    mockReq = createMockRequest("user-abc");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("listReports", () => {
    it("should list reports for topic", async () => {
      const query = { limit: 10 } as never;
      await controller.listReports(mockReq as never, "topic-1", query);
      expect(mockTopicService.listReports).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        query,
      );
    });

    it("should throw UnauthorizedException when user is missing", async () => {
      const reqNoUser = createMockRequest(undefined);
      await expect(
        controller.listReports(reqNoUser as never, "topic-1", {} as never),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("getLatestReport", () => {
    it("should get latest report", async () => {
      const result = await controller.getLatestReport(mockReq as never, "topic-1");
      expect(mockTopicService.getLatestReport).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
      );
    });
  });

  describe("getReport", () => {
    it("should get specific report", async () => {
      await controller.getReport(mockReq as never, "topic-1", "report-1");
      expect(mockTopicService.getReport).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        "report-1",
      );
    });
  });

  describe("deleteReport", () => {
    it("should delete a report", async () => {
      await controller.deleteReport(mockReq as never, "topic-1", "report-1");
      expect(mockTopicService.deleteReport).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        "report-1",
      );
    });
  });

  describe("exportReport", () => {
    it("should export a report", async () => {
      const dto = { format: "PDF" } as never;
      await controller.exportReport(mockReq as never, "topic-1", "report-1", dto);
      expect(mockTopicService.exportReport).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        "report-1",
        dto,
      );
    });
  });

  describe("compareReports", () => {
    it("should compare two report versions", async () => {
      const dto = { reportId1: "r1", reportId2: "r2" } as never;
      await controller.compareReports(mockReq as never, "topic-1", dto);
      expect(mockTopicService.compareReports).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        dto,
      );
    });
  });

  describe("updateReportContent", () => {
    it("should update report content", async () => {
      const dto = { content: "Updated markdown" } as never;
      await controller.updateReportContent(
        mockReq as never,
        "topic-1",
        "report-1",
        dto,
      );
      expect(mockTopicService.updateReportContent).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        "report-1",
        dto,
      );
    });
  });

  describe("aiEditReport", () => {
    it("should AI edit report", async () => {
      const dto = { instruction: "Expand section 2" } as never;
      await controller.aiEditReport(
        mockReq as never,
        "topic-1",
        "report-1",
        dto,
      );
      expect(mockTopicService.aiEditReport).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        "report-1",
        dto,
      );
    });
  });

  describe("getReportRevisions", () => {
    it("should get report revisions", async () => {
      await controller.getReportRevisions(
        mockReq as never,
        "topic-1",
        "report-1",
      );
      expect(mockTopicService.getReportRevisions).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        "report-1",
      );
    });
  });

  describe("rollbackReport", () => {
    it("should rollback to a specific revision", async () => {
      const dto = { revisionNumber: 3 } as never;
      await controller.rollbackReport(
        mockReq as never,
        "topic-1",
        "report-1",
        dto,
      );
      expect(mockTopicService.rollbackReport).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        "report-1",
        3,
      );
    });
  });

  describe("getReportChanges", () => {
    it("should get report changes", async () => {
      await controller.getReportChanges(
        mockReq as never,
        "topic-1",
        "report-1",
      );
      expect(mockTopicService.getReportChanges).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        "report-1",
      );
    });

    it("should throw UnauthorizedException when user missing", async () => {
      const reqNoUser = createMockRequest(undefined);
      await expect(
        controller.getReportChanges(reqNoUser as never, "topic-1", "report-1"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("checkinChange", () => {
    it("should checkin a single change", async () => {
      await controller.checkinChange(
        mockReq as never,
        "topic-1",
        "report-1",
        "change-1",
      );
      expect(mockTopicService.checkinChange).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        "report-1",
        "change-1",
      );
    });
  });

  describe("checkinAllChanges", () => {
    it("should checkin all specified changes", async () => {
      await controller.checkinAllChanges(
        mockReq as never,
        "topic-1",
        "report-1",
        { changeIds: ["c1", "c2"] },
      );
      expect(mockTopicService.checkinAllChanges).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        "report-1",
        ["c1", "c2"],
      );
    });

    it("should checkin all changes when changeIds not provided", async () => {
      await controller.checkinAllChanges(
        mockReq as never,
        "topic-1",
        "report-1",
        {},
      );
      expect(mockTopicService.checkinAllChanges).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        "report-1",
        undefined,
      );
    });
  });

  describe("Evidence", () => {
    it("should list evidence", async () => {
      const query = { pageSize: 10 } as never;
      await controller.listEvidence(
        mockReq as never,
        "topic-1",
        "report-1",
        query,
      );
      expect(mockTopicService.listEvidence).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        "report-1",
        query,
      );
    });

    it("should get specific evidence", async () => {
      await controller.getEvidence(
        mockReq as never,
        "topic-1",
        "report-1",
        "ev-1",
      );
      expect(mockTopicService.getEvidence).toHaveBeenCalledWith(
        "user-abc",
        "topic-1",
        "report-1",
        "ev-1",
      );
    });
  });

  describe("Credibility", () => {
    it("should get credibility report", async () => {
      await controller.getCredibilityReport(
        mockReq as never,
        "topic-1",
        "report-1",
      );
      expect(mockTopicService.getCredibilityReport).toHaveBeenCalledWith(
        "user-abc",
        "report-1",
      );
    });

    it("should regenerate credibility report", async () => {
      await controller.regenerateCredibilityReport(
        mockReq as never,
        "topic-1",
        "report-1",
      );
      expect(mockTopicService.regenerateCredibilityReport).toHaveBeenCalledWith(
        "user-abc",
        "report-1",
      );
    });

    it("should recalculate evidence credibility", async () => {
      await controller.recalculateEvidenceCredibility(
        mockReq as never,
        "topic-1",
        "report-1",
      );
      expect(mockTopicService.recalculateEvidenceCredibility).toHaveBeenCalledWith(
        "report-1",
      );
    });
  });

  describe("regenerateReportContent", () => {
    it("should return 202 processing status immediately", async () => {
      const result = await controller.regenerateReportContent(
        mockReq as never,
        "topic-1",
        "report-1",
        { feedback: "Please improve clarity" },
      );

      expect(result.status).toBe("processing");
      expect(result.message).toContain("重新生成");
    });

    it("should call regenerateReportContent in background", async () => {
      await controller.regenerateReportContent(
        mockReq as never,
        "topic-1",
        "report-1",
        {},
      );

      // Service should be called asynchronously
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockTopicService.regenerateReportContent).toHaveBeenCalled();
    });

    it("should truncate feedback to 500 chars", async () => {
      const longFeedback = "A".repeat(600);
      await controller.regenerateReportContent(
        mockReq as never,
        "topic-1",
        "report-1",
        { feedback: longFeedback },
      );

      await new Promise((resolve) => setTimeout(resolve, 0));
      const callArg = mockTopicService.regenerateReportContent.mock.calls[0][2];
      expect(callArg?.length).toBeLessThanOrEqual(500);
    });
  });
});
