import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ImportManagerService } from "../import-manager.service";
import { PrismaService } from "../../../../../../../common/prisma/prisma.service";
import { MongoDBService } from "../../../../../../../common/mongodb/mongodb.service.postgres";
import { MetadataExtractorService } from "../metadata-extractor.service";
import { DuplicateDetectorService } from "../duplicate-detector.service";
import { PaperMetadataExtractorService } from "../paper-metadata-extractor.service";

const mockPrisma = {
  importTask: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  dataQualityMetric: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  resource: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockMongodb = {
  insertRawData: jest.fn(),
  updateRawData: jest.fn(),
  linkResourceToRawData: jest.fn(),
};

const mockMetadataExtractor = {
  extractMetadata: jest.fn(),
  validateMetadata: jest.fn(),
};

const mockDuplicateDetector = {
  detectDuplicates: jest.fn(),
};

const mockPaperMetadataExtractor = {
  extractPaperMetadata: jest.fn(),
};

describe("ImportManagerService", () => {
  let service: ImportManagerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportManagerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MongoDBService, useValue: mockMongodb },
        { provide: MetadataExtractorService, useValue: mockMetadataExtractor },
        {
          provide: DuplicateDetectorService,
          useValue: mockDuplicateDetector,
        },
        {
          provide: PaperMetadataExtractorService,
          useValue: mockPaperMetadataExtractor,
        },
      ],
    }).compile();

    service = module.get<ImportManagerService>(ImportManagerService);
  });

  // ─── parseUrl ───────────────────────────────────────────────────────────────

  describe("parseUrl", () => {
    it("returns paper metadata when paper extractor succeeds", async () => {
      const paperMeta = {
        title: "Test Paper",
        abstract: "An abstract",
        authors: ["Alice"],
        publishedDate: "2024-01-01",
        pdfUrl: "https://arxiv.org/pdf/2401.00001.pdf",
      };
      mockPaperMetadataExtractor.extractPaperMetadata.mockResolvedValueOnce(
        paperMeta,
      );

      const result = await service.parseUrl("https://arxiv.org/abs/2401.00001");

      expect(result.domain).toBe("arxiv.org");
      expect(result.title).toBe("Test Paper");
      expect(result.description).toBe("An abstract");
      expect(result.authors).toEqual(["Alice"]);
      expect(result.contentType).toBe("paper");
    });

    it("falls back to generic metadata when paper extractor returns null", async () => {
      mockPaperMetadataExtractor.extractPaperMetadata.mockResolvedValueOnce(
        null,
      );
      mockMetadataExtractor.extractMetadata.mockResolvedValueOnce({
        title: "Web Page",
        description: "Some description",
        authors: [],
        publishedDate: new Date("2024-06-15"),
        imageUrl: "https://example.com/img.jpg",
        language: "en",
        contentType: "html",
      });

      const result = await service.parseUrl("https://example.com/article");

      expect(result.domain).toBe("example.com");
      expect(result.title).toBe("Web Page");
      expect(result.language).toBe("en");
    });

    it("returns minimal result (only domain) when metadata extractor throws", async () => {
      mockPaperMetadataExtractor.extractPaperMetadata.mockRejectedValueOnce(
        new Error("not a paper"),
      );
      mockMetadataExtractor.extractMetadata.mockRejectedValueOnce(
        new Error("network error"),
      );

      const result = await service.parseUrl("https://example.com/page");

      expect(result.domain).toBe("example.com");
      expect(result.title).toBeUndefined();
    });

    it("throws when the URL is invalid", async () => {
      await expect(service.parseUrl("not-a-url")).rejects.toThrow();
    });

    it("converts publishedDate to ISO string in generic path", async () => {
      mockPaperMetadataExtractor.extractPaperMetadata.mockResolvedValueOnce(
        null,
      );
      mockMetadataExtractor.extractMetadata.mockResolvedValueOnce({
        publishedDate: new Date("2023-03-10"),
        title: "Article",
      });

      const result = await service.parseUrl("https://example.com");

      expect(result.publishedDate).toMatch(/2023-03-10/);
    });
  });

  // ─── createImportTask ────────────────────────────────────────────────────────

  describe("createImportTask", () => {
    it("creates an import task with PENDING status", async () => {
      const createdTask = {
        id: "task-1",
        resourceType: "PAPER",
        sourceUrl: "https://arxiv.org/abs/2401.00001",
        sourceDomain: "arxiv.org",
        status: "PENDING",
      };
      mockPrisma.importTask.create.mockResolvedValueOnce(createdTask);

      const result = await service.createImportTask({
        resourceType: "PAPER" as any,
        sourceUrl: "https://arxiv.org/abs/2401.00001",
        title: "Test Paper",
      });

      expect(mockPrisma.importTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "PENDING",
            sourceDomain: "arxiv.org",
          }),
        }),
      );
      expect(result.id).toBe("task-1");
    });

    it("extracts domain from sourceUrl correctly", async () => {
      mockPrisma.importTask.create.mockResolvedValueOnce({ id: "t2" });

      await service.createImportTask({
        resourceType: "NEWS" as any,
        sourceUrl: "https://techcrunch.com/2024/article-name",
      });

      const callData = mockPrisma.importTask.create.mock.calls[0][0].data;
      expect(callData.sourceDomain).toBe("techcrunch.com");
    });

    it("propagates errors from prisma", async () => {
      mockPrisma.importTask.create.mockRejectedValueOnce(
        new Error("DB constraint"),
      );

      await expect(
        service.createImportTask({
          resourceType: "BLOG" as any,
          sourceUrl: "https://example.com",
        }),
      ).rejects.toThrow("DB constraint");
    });
  });

  // ─── getImportTasks ──────────────────────────────────────────────────────────

  describe("getImportTasks", () => {
    it("returns paginated tasks with total count", async () => {
      mockPrisma.importTask.findMany.mockResolvedValueOnce([{ id: "t1" }]);
      mockPrisma.importTask.count.mockResolvedValueOnce(1);

      const result = await service.getImportTasks();

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it("filters by resourceType and status when provided", async () => {
      mockPrisma.importTask.findMany.mockResolvedValueOnce([]);
      mockPrisma.importTask.count.mockResolvedValueOnce(0);

      await service.getImportTasks("PAPER" as any, "PENDING" as any, 10, 20);

      const whereArg = mockPrisma.importTask.findMany.mock.calls[0][0].where;
      expect(whereArg.resourceType).toBe("PAPER");
      expect(whereArg.status).toBe("PENDING");
      const findManyCall = mockPrisma.importTask.findMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(10);
      expect(findManyCall.skip).toBe(20);
    });

    it("does not add filters when not provided", async () => {
      mockPrisma.importTask.findMany.mockResolvedValueOnce([]);
      mockPrisma.importTask.count.mockResolvedValueOnce(0);

      await service.getImportTasks();

      const whereArg = mockPrisma.importTask.findMany.mock.calls[0][0].where;
      expect(whereArg.resourceType).toBeUndefined();
      expect(whereArg.status).toBeUndefined();
    });
  });

  // ─── getImportTask ───────────────────────────────────────────────────────────

  describe("getImportTask", () => {
    it("returns the task when found", async () => {
      mockPrisma.importTask.findUnique.mockResolvedValueOnce({ id: "t1" });

      const result = await service.getImportTask("t1");

      expect(result).toEqual({ id: "t1" });
    });

    it("returns null when task is not found", async () => {
      mockPrisma.importTask.findUnique.mockResolvedValueOnce(null);

      const result = await service.getImportTask("missing");

      expect(result).toBeNull();
    });
  });

  // ─── updateImportTaskStatus ──────────────────────────────────────────────────

  describe("updateImportTaskStatus", () => {
    const updatedTask = { id: "t1", status: "SUCCESS" };

    it("sets completedAt for SUCCESS status", async () => {
      mockPrisma.importTask.update.mockResolvedValueOnce(updatedTask);

      await service.updateImportTaskStatus("t1", "SUCCESS" as any);

      const data = mockPrisma.importTask.update.mock.calls[0][0].data;
      expect(data.completedAt).toBeInstanceOf(Date);
    });

    it("sets completedAt for FAILED status", async () => {
      mockPrisma.importTask.update.mockResolvedValueOnce({ id: "t1" });

      await service.updateImportTaskStatus("t1", "FAILED" as any);

      const data = mockPrisma.importTask.update.mock.calls[0][0].data;
      expect(data.completedAt).toBeInstanceOf(Date);
    });

    it("sets completedAt for CANCELLED status", async () => {
      mockPrisma.importTask.update.mockResolvedValueOnce({ id: "t1" });

      await service.updateImportTaskStatus("t1", "CANCELLED" as any);

      const data = mockPrisma.importTask.update.mock.calls[0][0].data;
      expect(data.completedAt).toBeInstanceOf(Date);
    });

    it("sets startedAt for PROCESSING status", async () => {
      mockPrisma.importTask.update.mockResolvedValueOnce({ id: "t1" });

      await service.updateImportTaskStatus("t1", "PROCESSING" as any);

      const data = mockPrisma.importTask.update.mock.calls[0][0].data;
      expect(data.startedAt).toBeInstanceOf(Date);
      expect(data.completedAt).toBeUndefined();
    });

    it("merges optional updates into data payload", async () => {
      mockPrisma.importTask.update.mockResolvedValueOnce(updatedTask);

      await service.updateImportTaskStatus("t1", "SUCCESS" as any, {
        itemsProcessed: 5,
        itemsSaved: 4,
        errorMessage: undefined,
      });

      const data = mockPrisma.importTask.update.mock.calls[0][0].data;
      expect(data.itemsProcessed).toBe(5);
      expect(data.itemsSaved).toBe(4);
    });
  });

  // ─── getDataQualityMetrics ───────────────────────────────────────────────────

  describe("getDataQualityMetrics", () => {
    it("returns metrics and stats together", async () => {
      mockPrisma.dataQualityMetric.findMany.mockResolvedValueOnce([
        { id: "m1" },
      ]);
      // getQualityStats path:
      mockPrisma.dataQualityMetric.count
        .mockResolvedValueOnce(10) // totalItems
        .mockResolvedValueOnce(2) // duplicates
        .mockResolvedValueOnce(1); // needsReview
      mockPrisma.dataQualityMetric.aggregate.mockResolvedValueOnce({
        _avg: { qualityScore: 0.85 },
      });

      const result = await service.getDataQualityMetrics();

      expect(result.data).toHaveLength(1);
      expect(result.stats.totalItems).toBe(10);
      expect(result.stats.avgQuality).toBe(0.85);
    });

    it("returns zeros when no metrics exist", async () => {
      mockPrisma.dataQualityMetric.findMany.mockResolvedValueOnce([]);
      mockPrisma.dataQualityMetric.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.dataQualityMetric.aggregate.mockResolvedValueOnce({
        _avg: { qualityScore: null },
      });

      const result = await service.getDataQualityMetrics();

      expect(result.stats.totalItems).toBe(0);
      expect(result.stats.avgQuality).toBe(0);
    });

    it("filters by resourceType when provided", async () => {
      mockPrisma.dataQualityMetric.findMany.mockResolvedValueOnce([]);
      mockPrisma.dataQualityMetric.count.mockResolvedValue(0);
      mockPrisma.dataQualityMetric.aggregate.mockResolvedValueOnce({
        _avg: { qualityScore: null },
      });

      await service.getDataQualityMetrics("PAPER" as any);

      const whereArg =
        mockPrisma.dataQualityMetric.findMany.mock.calls[0][0].where;
      expect(whereArg.resourceType).toBe("PAPER");
    });
  });

  // ─── createOrUpdateQualityMetric ─────────────────────────────────────────────

  describe("createOrUpdateQualityMetric", () => {
    it("creates a new metric when none exists", async () => {
      mockPrisma.dataQualityMetric.findFirst.mockResolvedValueOnce(null);
      mockPrisma.dataQualityMetric.create.mockResolvedValueOnce({ id: "m1" });

      const result = await service.createOrUpdateQualityMetric(
        "PAPER" as any,
        "resource-1",
        { qualityScore: 0.9, isDuplicate: false },
      );

      expect(mockPrisma.dataQualityMetric.create).toHaveBeenCalled();
      expect(result).toEqual({ id: "m1" });
    });

    it("updates an existing metric", async () => {
      mockPrisma.dataQualityMetric.findFirst.mockResolvedValueOnce({
        id: "m1",
      });
      mockPrisma.dataQualityMetric.updateMany.mockResolvedValueOnce({
        count: 1,
      });

      const result = await service.createOrUpdateQualityMetric(
        "NEWS" as any,
        "resource-2",
        { qualityScore: 0.75 },
      );

      expect(mockPrisma.dataQualityMetric.updateMany).toHaveBeenCalled();
      expect(result).toEqual({ count: 1 });
    });
  });

  // ─── parseUrlFull ────────────────────────────────────────────────────────────

  describe("parseUrlFull", () => {
    it("extracts paper metadata for PAPER type and detects duplicates", async () => {
      const paperMeta = {
        title: "ML Paper",
        abstract: "Abstract text",
        authors: ["Bob"],
        publishedDate: "2024-01-01",
        pdfUrl: null,
      };
      mockPaperMetadataExtractor.extractPaperMetadata.mockResolvedValueOnce(
        paperMeta,
      );
      mockMetadataExtractor.validateMetadata.mockReturnValueOnce({
        isValid: true,
      });
      mockDuplicateDetector.detectDuplicates.mockResolvedValueOnce({
        isDuplicate: false,
      });

      const result = await service.parseUrlFull(
        "https://arxiv.org/abs/2401.00001",
        "PAPER" as any,
      );

      expect(result.metadata.title).toBe("ML Paper");
      expect(result.duplicateDetection.isDuplicate).toBe(false);
    });

    it("falls back to generic extractor when paper extraction fails", async () => {
      mockPaperMetadataExtractor.extractPaperMetadata.mockRejectedValueOnce(
        new Error("extraction failed"),
      );
      const genericMeta = {
        url: "https://arxiv.org/abs/2401.00001",
        domain: "arxiv.org",
        title: "Fallback",
        contentHash: "abc",
      };
      mockMetadataExtractor.extractMetadata.mockResolvedValueOnce(genericMeta);
      mockMetadataExtractor.validateMetadata.mockReturnValueOnce({
        isValid: true,
      });
      mockDuplicateDetector.detectDuplicates.mockResolvedValueOnce({
        isDuplicate: false,
      });

      const result = await service.parseUrlFull(
        "https://arxiv.org/abs/2401.00001",
        "PAPER" as any,
      );

      expect(result.metadata.title).toBe("Fallback");
    });

    it("uses generic extractor for non-PAPER types", async () => {
      const meta = {
        url: "https://techcrunch.com/article",
        domain: "techcrunch.com",
        title: "News Article",
        contentHash: "xyz",
      };
      mockMetadataExtractor.extractMetadata.mockResolvedValueOnce(meta);
      mockMetadataExtractor.validateMetadata.mockReturnValueOnce({
        isValid: true,
      });
      mockDuplicateDetector.detectDuplicates.mockResolvedValueOnce({
        isDuplicate: false,
      });

      const result = await service.parseUrlFull(
        "https://techcrunch.com/article",
        "NEWS" as any,
      );

      expect(
        mockPaperMetadataExtractor.extractPaperMetadata,
      ).not.toHaveBeenCalled();
      expect(result.metadata.title).toBe("News Article");
    });

    it("throws BadRequestException when metadata validation fails", async () => {
      const meta = {
        url: "https://example.com",
        domain: "example.com",
        contentHash: "abc",
      };
      mockMetadataExtractor.extractMetadata.mockResolvedValueOnce(meta);
      mockMetadataExtractor.validateMetadata.mockReturnValueOnce({
        isValid: false,
        errors: ["Missing title"],
      });

      await expect(
        service.parseUrlFull("https://example.com", "NEWS" as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── importWithMetadata ──────────────────────────────────────────────────────

  describe("importWithMetadata", () => {
    const baseMetadata = {
      url: "https://arxiv.org/abs/2401.00001",
      domain: "arxiv.org",
      title: "Test Paper",
      contentHash: "abc",
    } as any;

    it("creates a new resource and returns success for a valid paper URL", async () => {
      mockPrisma.resource.findFirst.mockResolvedValueOnce(null);
      mockMongodb.insertRawData.mockResolvedValueOnce("raw-id-1");
      mockPrisma.resource.create.mockResolvedValueOnce({ id: "res-1" });
      mockMongodb.linkResourceToRawData.mockResolvedValueOnce(undefined);
      mockPrisma.importTask.create.mockResolvedValueOnce({ id: "task-1" });
      mockPrisma.importTask.update.mockResolvedValueOnce({ id: "task-1" });
      mockDuplicateDetector.detectDuplicates.mockResolvedValueOnce({});

      const result = await service.importWithMetadata(
        "https://arxiv.org/abs/2401.00001",
        "PAPER" as any,
        baseMetadata,
      );

      expect(result.status).toBe("SUCCESS");
      expect(result.resourceId).toBe("res-1");
      expect(result.rawDataId).toBe("raw-id-1");
    });

    it("throws for PAPER type with a non-academic URL", async () => {
      await expect(
        service.importWithMetadata(
          "https://facebook.com/post/12345",
          "PAPER" as any,
          baseMetadata,
        ),
      ).rejects.toThrow("Invalid paper URL");
    });

    it("updates existing resource when it already exists (no rawDataId)", async () => {
      const existingResource = {
        id: "res-existing",
        rawDataId: null,
        pdfUrl: null,
        publishedAt: null,
      };
      mockPrisma.resource.findFirst.mockResolvedValueOnce(existingResource);
      mockMongodb.insertRawData.mockResolvedValueOnce("raw-id-2");
      mockPrisma.resource.update.mockResolvedValueOnce({ id: "res-existing" });
      mockMongodb.linkResourceToRawData.mockResolvedValueOnce(undefined);
      mockPrisma.importTask.create.mockResolvedValueOnce({ id: "task-2" });
      mockPrisma.importTask.update.mockResolvedValueOnce({});
      mockDuplicateDetector.detectDuplicates.mockResolvedValueOnce({});

      const result = await service.importWithMetadata(
        "https://arxiv.org/abs/2401.00002",
        "PAPER" as any,
        baseMetadata,
      );

      expect(result.resourceId).toBe("res-existing");
      expect(mockMongodb.insertRawData).toHaveBeenCalled();
      expect(mockPrisma.resource.update).toHaveBeenCalled();
    });

    it("updates existing resource when it already has rawDataId", async () => {
      const existingResource = {
        id: "res-existing",
        rawDataId: "raw-old",
        pdfUrl: "old-pdf",
        publishedAt: new Date(),
      };
      mockPrisma.resource.findFirst.mockResolvedValueOnce(existingResource);
      mockMongodb.updateRawData.mockResolvedValueOnce(undefined);
      mockPrisma.resource.update.mockResolvedValueOnce({ id: "res-existing" });
      mockPrisma.importTask.create.mockResolvedValueOnce({ id: "task-3" });
      mockPrisma.importTask.update.mockResolvedValueOnce({});
      mockDuplicateDetector.detectDuplicates.mockResolvedValueOnce({});

      const result = await service.importWithMetadata(
        "https://arxiv.org/abs/2401.00003",
        "PAPER" as any,
        baseMetadata,
      );

      expect(mockMongodb.updateRawData).toHaveBeenCalledWith(
        "raw-old",
        expect.any(Object),
        "res-existing",
      );
      expect(result.rawDataId).toBe("raw-old");
    });

    it("skips duplicate detection when _skipDuplicateWarning is true", async () => {
      mockPrisma.resource.findFirst.mockResolvedValueOnce(null);
      mockMongodb.insertRawData.mockResolvedValueOnce("raw-id-3");
      mockPrisma.resource.create.mockResolvedValueOnce({ id: "res-2" });
      mockMongodb.linkResourceToRawData.mockResolvedValueOnce(undefined);
      mockPrisma.importTask.create.mockResolvedValueOnce({ id: "task-4" });
      mockPrisma.importTask.update.mockResolvedValueOnce({});

      await service.importWithMetadata(
        "https://arxiv.org/abs/2401.00001",
        "PAPER" as any,
        baseMetadata,
        true,
      );

      expect(mockDuplicateDetector.detectDuplicates).not.toHaveBeenCalled();
    });

    it("does not throw if duplicate detection fails (non-blocking)", async () => {
      mockPrisma.resource.findFirst.mockResolvedValueOnce(null);
      mockMongodb.insertRawData.mockResolvedValueOnce("raw-id-4");
      mockPrisma.resource.create.mockResolvedValueOnce({ id: "res-3" });
      mockMongodb.linkResourceToRawData.mockResolvedValueOnce(undefined);
      mockPrisma.importTask.create.mockResolvedValueOnce({ id: "task-5" });
      mockPrisma.importTask.update.mockResolvedValueOnce({});
      mockDuplicateDetector.detectDuplicates.mockRejectedValueOnce(
        new Error("dup error"),
      );

      const result = await service.importWithMetadata(
        "https://arxiv.org/abs/2401.00001",
        "PAPER" as any,
        baseMetadata,
      );

      expect(result.status).toBe("SUCCESS");
    });

    it("uses existing pdfUrl from metadata when available", async () => {
      mockPrisma.resource.findFirst.mockResolvedValueOnce(null);
      mockMongodb.insertRawData.mockResolvedValueOnce("raw-id-5");
      mockPrisma.resource.create.mockResolvedValueOnce({ id: "res-4" });
      mockMongodb.linkResourceToRawData.mockResolvedValueOnce(undefined);
      mockPrisma.importTask.create.mockResolvedValueOnce({ id: "task-6" });
      mockPrisma.importTask.update.mockResolvedValueOnce({});
      mockDuplicateDetector.detectDuplicates.mockResolvedValueOnce({});

      const metaWithPdf = {
        ...baseMetadata,
        pdfUrl: "https://example.com/paper.pdf",
      };

      await service.importWithMetadata(
        "https://arxiv.org/abs/2401.00001",
        "PAPER" as any,
        metaWithPdf,
      );

      const createData = mockPrisma.resource.create.mock.calls[0][0].data;
      expect(createData.pdfUrl).toBe("https://example.com/paper.pdf");
    });

    it("handles non-PAPER resource types without paper URL validation", async () => {
      mockPrisma.resource.findFirst.mockResolvedValueOnce(null);
      mockMongodb.insertRawData.mockResolvedValueOnce("raw-id-6");
      mockPrisma.resource.create.mockResolvedValueOnce({ id: "res-5" });
      mockMongodb.linkResourceToRawData.mockResolvedValueOnce(undefined);
      mockPrisma.importTask.create.mockResolvedValueOnce({ id: "task-7" });
      mockPrisma.importTask.update.mockResolvedValueOnce({});
      mockDuplicateDetector.detectDuplicates.mockResolvedValueOnce({});

      const result = await service.importWithMetadata(
        "https://techcrunch.com/2024/article",
        "NEWS" as any,
        {
          url: "https://techcrunch.com/2024/article",
          domain: "techcrunch.com",
          title: "News",
          contentHash: "xyz",
        } as any,
      );

      expect(result.status).toBe("SUCCESS");
    });
  });
});
