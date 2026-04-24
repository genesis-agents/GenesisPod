/**
 * ReportContentEditingService unit tests
 *
 * Migrated from topic-insights.service.spec.ts during god service split step 2.
 * Covers:
 * - updateReportContent: delegation, NotFoundException on missing report
 * - aiEditReport: prompt construction, selection replacement with/without
 *   selectorPrefix+selectorSuffix, NotFoundException, ForbiddenException
 * - getReportRevisions: delegation + NotFoundException
 * - rollbackReport: delegation + NotFoundException
 * - compareReports: version lookup + NotFoundException when a version missing
 */

import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import { ReportContentEditingService } from "../content-editing.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { ReportSynthesisService } from "../../core/synthesis.service";
import { ReportDataService } from "../../core/data.service";

const USER_ID = "user-001";
const TOPIC_ID = "topic-001";
const REPORT_ID = "report-001";

function buildMocks() {
  const mockPrisma = {
    researchTopic: {
      findUnique: jest.fn().mockResolvedValue({ userId: USER_ID }),
    },
    topicReport: {
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  const mockReportService = {
    getReport: jest.fn(),
    compareReports: jest.fn(),
  };

  const mockReportDataService = {
    updateReportContent: jest.fn(),
    saveAiEditRevision: jest.fn(),
    getReportRevisions: jest.fn(),
    rollbackToRevision: jest.fn(),
  };

  const mockChatFacade = { chat: jest.fn() };

  return {
    mockPrisma,
    mockReportService,
    mockReportDataService,
    mockChatFacade,
  };
}

async function buildService(mocks: ReturnType<typeof buildMocks>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ReportContentEditingService,
      { provide: PrismaService, useValue: mocks.mockPrisma },
      { provide: ChatFacade, useValue: mocks.mockChatFacade },
      { provide: ReportSynthesisService, useValue: mocks.mockReportService },
      { provide: ReportDataService, useValue: mocks.mockReportDataService },
    ],
  }).compile();

  return module.get<ReportContentEditingService>(ReportContentEditingService);
}

describe("ReportContentEditingService", () => {
  let service: ReportContentEditingService;
  let mocks: ReturnType<typeof buildMocks>;

  beforeEach(async () => {
    mocks = buildMocks();
    service = await buildService(mocks);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── updateReportContent ───────────────────────────────────────────────

  describe("updateReportContent", () => {
    it("delegates to reportDataService.updateReportContent", async () => {
      mocks.mockReportService.getReport.mockResolvedValue({
        id: REPORT_ID,
        topicId: TOPIC_ID,
        fullReport: "Original content",
      });
      mocks.mockReportDataService.updateReportContent.mockResolvedValue({
        id: REPORT_ID,
        fullReport: "New content",
      });

      const dto = { fullReport: "New content", changeDescription: "edit" };
      const result = await service.updateReportContent(
        USER_ID,
        TOPIC_ID,
        REPORT_ID,
        dto,
      );

      expect(
        mocks.mockReportDataService.updateReportContent,
      ).toHaveBeenCalledWith(REPORT_ID, dto);
      expect((result as { id: string }).id).toBe(REPORT_ID);
    });

    it("throws NotFoundException when report not found", async () => {
      mocks.mockReportService.getReport.mockResolvedValue(null);

      await expect(
        service.updateReportContent(USER_ID, TOPIC_ID, "no-report", {
          fullReport: "new",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException when user does not own topic", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue({
        userId: "other-user",
      });

      await expect(
        service.updateReportContent(USER_ID, TOPIC_ID, REPORT_ID, {
          fullReport: "x",
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── aiEditReport ──────────────────────────────────────────────────────

  describe("aiEditReport", () => {
    const setupHappyPath = (fullReport: string, editedContent: string) => {
      mocks.mockReportService.getReport.mockResolvedValue({
        id: REPORT_ID,
        topicId: TOPIC_ID,
        fullReport,
      });
      mocks.mockReportDataService.saveAiEditRevision.mockResolvedValue({
        id: REPORT_ID,
        fullReport: editedContent,
      });
      mocks.mockChatFacade.chat.mockResolvedValue({
        content: editedContent,
        isError: false,
      });
    };

    it("performs AI edit with selectedText and returns edited content", async () => {
      setupHappyPath(
        "Original report content with [some text] to replace.",
        "Edited content",
      );

      const result = await service.aiEditReport(USER_ID, TOPIC_ID, REPORT_ID, {
        operation: "rewrite",
        selectedText: "some text",
        context: "Make it better",
      });

      expect(result.editedContent).toBe("Edited content");
      expect(result.operation).toBe("rewrite");
      expect(mocks.mockChatFacade.chat).toHaveBeenCalled();
    });

    it("uses entire report when no selectedText provided", async () => {
      setupHappyPath("whole report", "Completely new report");

      const result = await service.aiEditReport(USER_ID, TOPIC_ID, REPORT_ID, {
        operation: "polish",
      });

      expect(result.editedContent).toBe("Completely new report");
    });

    it("throws NotFoundException when report not found", async () => {
      mocks.mockReportService.getReport.mockResolvedValue(null);

      await expect(
        service.aiEditReport(USER_ID, TOPIC_ID, "no-report", {
          operation: "polish",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException when user does not own topic", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue({
        userId: "other-user",
      });

      await expect(
        service.aiEditReport(USER_ID, TOPIC_ID, REPORT_ID, {
          operation: "polish",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("uses selectorPrefix+selectorSuffix for context-based replacement", async () => {
      setupHappyPath(
        "PREFIXselected textSUFFIX rest of report",
        "AI edited text",
      );

      const result = await service.aiEditReport(USER_ID, TOPIC_ID, REPORT_ID, {
        operation: "rewrite",
        selectedText: "selected text",
        selectorPrefix: "PREFIX",
        selectorSuffix: "SUFFIX",
      });

      expect(result.editedContent).toBe("AI edited text");
    });

    it("falls back to indexOf when selectorPrefix context not found", async () => {
      setupHappyPath("hello selected text world", "AI edited text");

      const result = await service.aiEditReport(USER_ID, TOPIC_ID, REPORT_ID, {
        operation: "rewrite",
        selectedText: "selected text",
        selectorPrefix: "NONEXISTENT_PREFIX",
        selectorSuffix: "",
      });

      expect(result.editedContent).toBe("AI edited text");
    });

    it("still returns edited content when selection not found anywhere", async () => {
      setupHappyPath("completely different content", "AI edited text");

      const result = await service.aiEditReport(USER_ID, TOPIC_ID, REPORT_ID, {
        operation: "rewrite",
        selectedText: "text that is not there",
      });

      expect(result.editedContent).toBe("AI edited text");
    });
  });

  // ─── getReportRevisions ────────────────────────────────────────────────

  describe("getReportRevisions", () => {
    it("delegates to reportDataService.getReportRevisions", async () => {
      mocks.mockReportService.getReport.mockResolvedValue({
        id: REPORT_ID,
        topicId: TOPIC_ID,
      });
      const revisions = [
        { id: "rev-001", revisionNumber: 1, changeDescription: "Initial" },
      ];
      mocks.mockReportDataService.getReportRevisions.mockResolvedValue(
        revisions,
      );

      const result = await service.getReportRevisions(
        USER_ID,
        TOPIC_ID,
        REPORT_ID,
      );

      expect(
        mocks.mockReportDataService.getReportRevisions,
      ).toHaveBeenCalledWith(REPORT_ID);
      expect(result).toEqual(revisions);
    });

    it("throws NotFoundException when report not found", async () => {
      mocks.mockReportService.getReport.mockResolvedValue(null);

      await expect(
        service.getReportRevisions(USER_ID, TOPIC_ID, "no-report"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── rollbackReport ────────────────────────────────────────────────────

  describe("rollbackReport", () => {
    it("delegates to reportDataService.rollbackToRevision with current fullReport", async () => {
      mocks.mockReportService.getReport.mockResolvedValue({
        id: REPORT_ID,
        topicId: TOPIC_ID,
        fullReport: "Current content",
      });
      mocks.mockReportDataService.rollbackToRevision.mockResolvedValue({
        report: { id: REPORT_ID, fullReport: "Version 1 content" },
        rolledBackFrom: 3,
        rolledBackTo: 1,
      });

      const result = await service.rollbackReport(
        USER_ID,
        TOPIC_ID,
        REPORT_ID,
        1,
      );

      expect(
        mocks.mockReportDataService.rollbackToRevision,
      ).toHaveBeenCalledWith(REPORT_ID, 1, "Current content");
      expect((result as { rolledBackTo: number }).rolledBackTo).toBe(1);
      expect((result as { rolledBackFrom: number }).rolledBackFrom).toBe(3);
    });

    it("throws NotFoundException when report not found", async () => {
      mocks.mockReportService.getReport.mockResolvedValue(null);

      await expect(
        service.rollbackReport(USER_ID, TOPIC_ID, "no-report", 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── compareReports ────────────────────────────────────────────────────

  describe("compareReports", () => {
    it("looks up both versions and delegates to reportService.compareReports", async () => {
      mocks.mockPrisma.topicReport.findFirst
        .mockResolvedValueOnce({ id: "report-v1" })
        .mockResolvedValueOnce({ id: "report-v2" });
      mocks.mockReportService.compareReports.mockResolvedValue({
        diff: "some diff",
      });

      const result = await service.compareReports(USER_ID, TOPIC_ID, {
        from: 1,
        to: 2,
      } as never);

      expect(mocks.mockReportService.compareReports).toHaveBeenCalledWith(
        TOPIC_ID,
        "report-v1",
        "report-v2",
      );
      expect((result as { diff: string }).diff).toBe("some diff");
    });

    it("throws NotFoundException when a version is missing", async () => {
      mocks.mockPrisma.topicReport.findFirst
        .mockResolvedValueOnce({ id: "report-v1" })
        .mockResolvedValueOnce(null);

      await expect(
        service.compareReports(USER_ID, TOPIC_ID, {
          from: 1,
          to: 99,
        } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
