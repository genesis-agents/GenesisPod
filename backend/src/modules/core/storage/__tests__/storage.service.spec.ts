import { Test, TestingModule } from "@nestjs/testing";
import { StorageService } from "../storage.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import * as os from "os";

jest.mock("os", () => ({
  totalmem: jest.fn(),
  freemem: jest.fn(),
  platform: jest.fn(),
  cpus: jest.fn(),
  loadavg: jest.fn(),
  hostname: jest.fn(),
}));

const mockPrisma = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
  generatedImage: {
    count: jest.fn(),
    groupBy: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  rawData: {
    count: jest.fn(),
    groupBy: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  resource: {
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  note: { count: jest.fn() },
  researchProjectSource: {
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  collectionTask: {
    count: jest.fn(),
    groupBy: jest.fn(),
    deleteMany: jest.fn(),
  },
  importTask: {
    count: jest.fn(),
    groupBy: jest.fn(),
    deleteMany: jest.fn(),
  },
  parsedMetadata: {
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  deduplicationRecord: { count: jest.fn() },
  dataQualityMetric: { count: jest.fn() },
  userActivity: {
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  topicMessage: { count: jest.fn() },
  officeDocument: {
    count: jest.fn(),
    groupBy: jest.fn(),
    deleteMany: jest.fn(),
  },
  officeDocumentVersion: {
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  officeDocumentResourceRef: { deleteMany: jest.fn() },
  user: { count: jest.fn() },
  comment: { count: jest.fn() },
  askSession: {
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  askMessage: {
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  topic: { count: jest.fn() },
  workspace: { count: jest.fn() },
  report: { count: jest.fn() },
  debateSession: { count: jest.fn() },
  brandKit: { count: jest.fn() },
  slidesSession: {
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  slidesCheckpoint: {
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  slidesTeamExecution: {
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  slidesTeamLog: {
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  knowledgeBase: {
    count: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  knowledgeBaseDocument: {
    count: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  parentChunk: {
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  childChunk: {
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  childEmbedding: {
    count: jest.fn(),
    groupBy: jest.fn(),
    deleteMany: jest.fn(),
  },
  knowledgeBaseMember: { deleteMany: jest.fn() },
  knowledgeBaseSource: { deleteMany: jest.fn() },
};

describe("StorageService", () => {
  let service: StorageService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  // ==================== getStorageStats ====================

  describe("getStorageStats", () => {
    it("should return aggregated storage stats with all categories", async () => {
      // Stub every prisma call with zeros to keep test lean
      jest
        .spyOn(
          service as unknown as { getImageStats: () => object },
          "getImageStats" as never,
        )
        .mockResolvedValue({
          name: "generatedImages",
          displayName: "AI Generated Images",
          count: 0,
          estimatedSizeMB: 0,
          description: "0 bookmarked, 0 unbookmarked",
          canCleanup: false,
        } as never);

      // Stub all the remaining category helpers
      const stubCategory = (name: string) =>
        jest
          .spyOn(
            service as unknown as Record<string, () => object>,
            name as never,
          )
          .mockResolvedValue({
            name,
            displayName: name,
            count: 0,
            estimatedSizeMB: 0,
            description: "",
            canCleanup: false,
          } as never);

      stubCategory("getRawDataStats");
      stubCategory("getResourceStats");
      stubCategory("getNoteStats");
      stubCategory("getResearchSourceStats");
      stubCategory("getCollectionTaskStats");
      stubCategory("getImportTaskStats");
      stubCategory("getParsedMetadataStats");
      stubCategory("getDeduplicationStats");
      stubCategory("getDataQualityStats");
      stubCategory("getUserActivityStats");
      stubCategory("getTopicMessageStats");
      stubCategory("getOfficeDocumentStats");
      stubCategory("getUserStats");
      stubCategory("getCommentStats");
      stubCategory("getAskSessionStats");
      stubCategory("getTopicStats");
      stubCategory("getWorkspaceStats");
      stubCategory("getReportStats");
      stubCategory("getDebateStats");
      stubCategory("getBrandKitStats");
      stubCategory("getSlidesStats");
      stubCategory("getKnowledgeBaseStats");

      const result = await service.getStorageStats();

      expect(result.totalCategories).toBe(23);
      expect(result.totalRecords).toBe(0);
      expect(result.estimatedTotalSizeMB).toBe(0);
      expect(Array.isArray(result.categories)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it("should include cleanup recommendation when a category provides one", async () => {
      jest
        .spyOn(
          service as unknown as Record<string, () => object>,
          "getImageStats" as never,
        )
        .mockResolvedValue({
          name: "generatedImages",
          displayName: "AI Generated Images",
          count: 150,
          estimatedSizeMB: 75,
          description: "10 bookmarked, 140 unbookmarked",
          cleanupRecommendation: "140 unbookmarked images can be cleaned",
          canCleanup: true,
        } as never);

      const stubEmpty = (name: string) =>
        jest
          .spyOn(
            service as unknown as Record<string, () => object>,
            name as never,
          )
          .mockResolvedValue({
            name,
            count: 0,
            estimatedSizeMB: 0,
            description: "",
            canCleanup: false,
          } as never);

      [
        "getRawDataStats",
        "getResourceStats",
        "getNoteStats",
        "getResearchSourceStats",
        "getCollectionTaskStats",
        "getImportTaskStats",
        "getParsedMetadataStats",
        "getDeduplicationStats",
        "getDataQualityStats",
        "getUserActivityStats",
        "getTopicMessageStats",
        "getOfficeDocumentStats",
        "getUserStats",
        "getCommentStats",
        "getAskSessionStats",
        "getTopicStats",
        "getWorkspaceStats",
        "getReportStats",
        "getDebateStats",
        "getBrandKitStats",
        "getSlidesStats",
        "getKnowledgeBaseStats",
      ].forEach(stubEmpty);

      const result = await service.getStorageStats();

      expect(result.recommendations).toContain(
        "140 unbookmarked images can be cleaned",
      );
      expect(result.totalRecords).toBe(150);
    });
  });

  // ==================== cleanupImages ====================

  describe("cleanupImages", () => {
    it("should delete old unbookmarked images beyond keepPerUser threshold", async () => {
      // Return a single user group with 30 unbookmarked images (keepPerUser = 20 → 10 to delete)
      mockPrisma.generatedImage.groupBy.mockResolvedValue([
        { userId: "user1", _count: 30 },
      ]);
      const unbookmarkedImages = Array.from({ length: 30 }, (_, i) => ({
        id: `img-${i}`,
      }));
      mockPrisma.generatedImage.findMany.mockResolvedValue(unbookmarkedImages);
      mockPrisma.generatedImage.deleteMany.mockResolvedValue({ count: 10 });

      const result = await service.cleanupImages(20);

      expect(result.success).toBe(true);
      expect(result.category).toBe("generatedImages");
      expect(result.deletedCount).toBe(10);
      expect(mockPrisma.generatedImage.deleteMany).toHaveBeenCalled();
    });

    it("should not delete when all images are within keep threshold", async () => {
      mockPrisma.generatedImage.groupBy.mockResolvedValue([
        { userId: "user1", _count: 5 },
      ]);
      mockPrisma.generatedImage.findMany.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({ id: `img-${i}` })),
      );

      const result = await service.cleanupImages(20);

      expect(result.deletedCount).toBe(0);
      expect(mockPrisma.generatedImage.deleteMany).not.toHaveBeenCalled();
    });

    it("should handle null userId group (anonymous images)", async () => {
      mockPrisma.generatedImage.groupBy.mockResolvedValue([
        { userId: null, _count: 25 },
      ]);
      mockPrisma.generatedImage.findMany.mockResolvedValue(
        Array.from({ length: 25 }, (_, i) => ({ id: `img-${i}` })),
      );
      mockPrisma.generatedImage.deleteMany.mockResolvedValue({ count: 5 });

      const result = await service.cleanupImages(20);

      expect(result.success).toBe(true);
      // findMany called with { equals: null } filter
      expect(mockPrisma.generatedImage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: { equals: null } }),
        }),
      );
    });

    it("should return failure result on prisma error", async () => {
      mockPrisma.generatedImage.groupBy.mockRejectedValue(
        new Error("DB error"),
      );

      const result = await service.cleanupImages();

      expect(result.success).toBe(false);
      expect(result.message).toContain("DB error");
    });
  });

  // ==================== deleteAllImages ====================

  describe("deleteAllImages", () => {
    it("should delete all images and calculate freed size", async () => {
      mockPrisma.generatedImage.count.mockResolvedValue(10);
      mockPrisma.generatedImage.deleteMany.mockResolvedValue({ count: 10 });

      const result = await service.deleteAllImages();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(10);
      // 10 images * 500KB / 1024 = ~4.88 MB
      expect(result.freedSizeMB).toBeGreaterThan(0);
      expect(result.message).toContain("10 images");
    });

    it("should return failure when deletion throws", async () => {
      mockPrisma.generatedImage.count.mockResolvedValue(5);
      mockPrisma.generatedImage.deleteMany.mockRejectedValue(
        new Error("constraint error"),
      );

      const result = await service.deleteAllImages();

      expect(result.success).toBe(false);
      expect(result.deletedCount).toBe(0);
    });
  });

  // ==================== cleanupOldRawData ====================

  describe("cleanupOldRawData", () => {
    it("should delete processed raw data older than daysOld", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockPrisma.rawData.deleteMany.mockResolvedValue({ count: 42 });

      const result = await service.cleanupOldRawData(30);

      expect(result.success).toBe(true);
      expect(result.category).toBe("rawData");
      expect(result.deletedCount).toBe(42);
    });

    it("should use default 30 days when no argument provided", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockPrisma.rawData.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.cleanupOldRawData();

      expect(result.success).toBe(true);
      expect(result.message).toContain("30 days");
    });

    it("should return failure result on error", async () => {
      // ensureLinkedRawDataProcessed has its own catch, so we need to fail
      // at the deleteMany step to propagate to the outer catch
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]); // ensureLinkedRawDataProcessed succeeds
      mockPrisma.rawData.deleteMany.mockRejectedValue(
        new Error("query failed"),
      );

      const result = await service.cleanupOldRawData(7);

      expect(result.success).toBe(false);
    });
  });

  // ==================== deleteAllRawData ====================

  describe("deleteAllRawData", () => {
    it("should delete all raw data records", async () => {
      mockPrisma.rawData.count.mockResolvedValue(100);
      mockPrisma.rawData.deleteMany.mockResolvedValue({ count: 100 });

      const result = await service.deleteAllRawData();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(100);
    });
  });

  // ==================== cleanupOldCollectionTasks ====================

  describe("cleanupOldCollectionTasks", () => {
    it("should delete completed/failed/cancelled tasks older than threshold", async () => {
      mockPrisma.collectionTask.deleteMany.mockResolvedValue({ count: 15 });

      const result = await service.cleanupOldCollectionTasks(7);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(15);
      expect(result.message).toContain("7 days");
    });

    it("should return failure on error", async () => {
      mockPrisma.collectionTask.deleteMany.mockRejectedValue(
        new Error("DB error"),
      );

      const result = await service.cleanupOldCollectionTasks();

      expect(result.success).toBe(false);
    });
  });

  // ==================== cleanupOldImportTasks ====================

  describe("cleanupOldImportTasks", () => {
    it("should delete SUCCESS/FAILED/CANCELLED import tasks older than threshold", async () => {
      mockPrisma.importTask.deleteMany.mockResolvedValue({ count: 8 });

      const result = await service.cleanupOldImportTasks(7);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(8);
    });
  });

  // ==================== cleanupExpiredMetadata ====================

  describe("cleanupExpiredMetadata", () => {
    it("should delete expired metadata cache entries", async () => {
      mockPrisma.parsedMetadata.deleteMany.mockResolvedValue({ count: 25 });

      const result = await service.cleanupExpiredMetadata();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(25);
      expect(result.category).toBe("parsedMetadata");
    });
  });

  // ==================== cleanupOldUserActivities ====================

  describe("cleanupOldUserActivities", () => {
    it("should delete user activities older than daysOld", async () => {
      mockPrisma.userActivity.deleteMany.mockResolvedValue({ count: 500 });

      const result = await service.cleanupOldUserActivities(30);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(500);
    });
  });

  // ==================== cleanupOldAskSessions ====================

  describe("cleanupOldAskSessions", () => {
    it("should delete messages then sessions older than threshold", async () => {
      mockPrisma.askMessage.deleteMany.mockResolvedValue({ count: 200 });
      mockPrisma.askSession.deleteMany.mockResolvedValue({ count: 30 });

      const result = await service.cleanupOldAskSessions(30);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(30);
      expect(result.message).toContain("30 sessions");
      expect(result.message).toContain("200 messages");
    });

    it("should return failure when deletion fails", async () => {
      mockPrisma.askMessage.deleteMany.mockRejectedValue(
        new Error("FK constraint"),
      );

      const result = await service.cleanupOldAskSessions();

      expect(result.success).toBe(false);
    });
  });

  // ==================== cleanupOldOfficeDocuments ====================

  describe("cleanupOldOfficeDocuments", () => {
    it("should delete docs, versions, and resource refs older than threshold", async () => {
      mockPrisma.officeDocument.count.mockResolvedValue(5);
      mockPrisma.officeDocumentVersion.count.mockResolvedValue(10);
      mockPrisma.officeDocumentResourceRef.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrisma.officeDocumentVersion.deleteMany.mockResolvedValue({
        count: 10,
      });
      mockPrisma.officeDocument.deleteMany.mockResolvedValue({ count: 5 });

      const result = await service.cleanupOldOfficeDocuments(7);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(5);
      expect(result.message).toContain("5 documents");
      expect(result.message).toContain("10 versions");
    });

    it("should return failure on error", async () => {
      mockPrisma.officeDocument.count.mockRejectedValue(new Error("error"));

      const result = await service.cleanupOldOfficeDocuments();

      expect(result.success).toBe(false);
    });
  });

  // ==================== deleteAllOfficeDocuments ====================

  describe("deleteAllOfficeDocuments", () => {
    it("should delete all office documents in correct FK order", async () => {
      mockPrisma.officeDocument.count.mockResolvedValue(3);
      mockPrisma.officeDocumentVersion.count.mockResolvedValue(6);
      mockPrisma.officeDocumentResourceRef.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrisma.officeDocumentVersion.deleteMany.mockResolvedValue({
        count: 6,
      });
      mockPrisma.officeDocument.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.deleteAllOfficeDocuments();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(3);
    });
  });

  // ==================== cleanupOldSlides ====================

  describe("cleanupOldSlides", () => {
    it("should delete slides data with team tables present", async () => {
      mockPrisma.slidesSession.count.mockResolvedValue(3);
      mockPrisma.slidesCheckpoint.count.mockResolvedValue(20);
      mockPrisma.slidesTeamLog.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.slidesTeamExecution.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.slidesCheckpoint.deleteMany.mockResolvedValue({ count: 20 });
      mockPrisma.slidesSession.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.cleanupOldSlides(7);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(3);
    });

    it("should gracefully handle missing slides team tables", async () => {
      mockPrisma.slidesSession.count.mockResolvedValue(2);
      mockPrisma.slidesCheckpoint.count.mockResolvedValue(5);
      // Simulate team tables not existing
      mockPrisma.slidesTeamLog.deleteMany.mockRejectedValue(
        new Error("table does not exist"),
      );
      mockPrisma.slidesCheckpoint.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.slidesSession.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.cleanupOldSlides();

      expect(result.success).toBe(true);
    });
  });

  // ==================== deleteAllSlides ====================

  describe("deleteAllSlides", () => {
    it("should delete all slides data including team execution logs", async () => {
      mockPrisma.slidesSession.count.mockResolvedValue(4);
      mockPrisma.slidesCheckpoint.count.mockResolvedValue(12);
      mockPrisma.slidesTeamLog.count.mockResolvedValue(30);
      mockPrisma.slidesTeamExecution.count.mockResolvedValue(10);
      mockPrisma.slidesTeamLog.deleteMany.mockResolvedValue({ count: 30 });
      mockPrisma.slidesTeamExecution.deleteMany.mockResolvedValue({
        count: 10,
      });
      mockPrisma.slidesCheckpoint.deleteMany.mockResolvedValue({ count: 12 });
      mockPrisma.slidesSession.deleteMany.mockResolvedValue({ count: 4 });

      const result = await service.deleteAllSlides();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(4);
      expect(result.message).toContain("4 sessions");
    });
  });

  // ==================== cleanupKnowledgeBase ====================

  describe("cleanupKnowledgeBase", () => {
    it("should delete a knowledge base and all associated data", async () => {
      mockPrisma.knowledgeBase.findUnique.mockResolvedValue({
        id: "kb-1",
        name: "Test KB",
        _count: { documents: 5 },
      });
      mockPrisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        { id: "doc-1" },
        { id: "doc-2" },
      ]);
      mockPrisma.parentChunk.count.mockResolvedValue(10);
      mockPrisma.childChunk.count.mockResolvedValue(50);
      mockPrisma.childEmbedding.count.mockResolvedValue(50);
      mockPrisma.knowledgeBase.delete.mockResolvedValue({ id: "kb-1" });

      const result = await service.cleanupKnowledgeBase("kb-1");

      expect(result.success).toBe(true);
      expect(result.category).toBe("knowledgeBase");
      expect(result.deletedCount).toBe(5);
      expect(mockPrisma.knowledgeBase.delete).toHaveBeenCalledWith({
        where: { id: "kb-1" },
      });
    });

    it("should return failure when knowledge base not found", async () => {
      mockPrisma.knowledgeBase.findUnique.mockResolvedValue(null);

      const result = await service.cleanupKnowledgeBase("nonexistent-kb");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Knowledge base not found");
    });

    it("should return failure on prisma error", async () => {
      mockPrisma.knowledgeBase.findUnique.mockRejectedValue(
        new Error("DB error"),
      );

      const result = await service.cleanupKnowledgeBase("kb-1");

      expect(result.success).toBe(false);
    });
  });

  // ==================== cleanupOrphanedRagData ====================

  describe("cleanupOrphanedRagData", () => {
    it("should delete orphaned embeddings, child chunks, and parent chunks", async () => {
      // First call: orphaned embeddings count
      // Second call: orphaned child chunks count
      // Third call: orphaned parent chunks count
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: "10" }])
        .mockResolvedValueOnce([{ count: "5" }])
        .mockResolvedValueOnce([{ count: "3" }]);
      mockPrisma.$executeRawUnsafe.mockResolvedValue(undefined);

      const result = await service.cleanupOrphanedRagData();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(18);
      expect(result.message).toContain("10 embeddings");
      expect(result.message).toContain("5 child chunks");
      expect(result.message).toContain("3 parent chunks");
    });

    it("should skip deletion when no orphaned records exist", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: "0" }])
        .mockResolvedValueOnce([{ count: "0" }])
        .mockResolvedValueOnce([{ count: "0" }]);

      const result = await service.cleanupOrphanedRagData();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it("should return failure on query error", async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error("query error"));

      const result = await service.cleanupOrphanedRagData();

      expect(result.success).toBe(false);
    });
  });

  // ==================== deleteAllKnowledgeBaseData ====================

  describe("deleteAllKnowledgeBaseData", () => {
    it("should delete all RAG data in correct FK order", async () => {
      mockPrisma.childEmbedding.count.mockResolvedValue(1000);
      mockPrisma.childChunk.count.mockResolvedValue(500);
      mockPrisma.parentChunk.count.mockResolvedValue(100);
      mockPrisma.knowledgeBaseDocument.count.mockResolvedValue(20);
      mockPrisma.knowledgeBase.count.mockResolvedValue(3);

      mockPrisma.childEmbedding.deleteMany.mockResolvedValue({ count: 1000 });
      mockPrisma.childChunk.deleteMany.mockResolvedValue({ count: 500 });
      mockPrisma.parentChunk.deleteMany.mockResolvedValue({ count: 100 });
      mockPrisma.knowledgeBaseDocument.deleteMany.mockResolvedValue({
        count: 20,
      });
      mockPrisma.knowledgeBaseMember.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.knowledgeBaseSource.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.knowledgeBase.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.deleteAllKnowledgeBaseData();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(3);
      expect(result.message).toContain("3 knowledge bases");

      // Verify deletion order
      const deleteManyOrder = [
        mockPrisma.childEmbedding.deleteMany,
        mockPrisma.childChunk.deleteMany,
        mockPrisma.parentChunk.deleteMany,
        mockPrisma.knowledgeBaseDocument.deleteMany,
      ];
      for (let i = 0; i < deleteManyOrder.length - 1; i++) {
        const aIdx = deleteManyOrder[i].mock.invocationCallOrder[0];
        const bIdx = deleteManyOrder[i + 1].mock.invocationCallOrder[0];
        expect(aIdx).toBeLessThan(bIdx);
      }
    });
  });

  // ==================== getDatabaseAnalysis ====================

  describe("getDatabaseAnalysis", () => {
    it("should return database analysis with table sizes and recommendations", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ size: String(100 * 1024 * 1024) }]) // 100 MB total
        .mockResolvedValueOnce([
          {
            table_name: "generated_images",
            row_estimate: "500",
            total_bytes: String(110 * 1024 * 1024),
            index_bytes: String(5 * 1024 * 1024),
            table_bytes: String(100 * 1024 * 1024),
            toast_bytes: String(5 * 1024 * 1024),
          },
        ]);

      const result = await service.getDatabaseAnalysis();

      expect(result.totalDatabaseSizeMB).toBeCloseTo(100, 0);
      expect(result.tables.length).toBe(1);
      expect(result.tables[0].tableName).toBe("generated_images");
      expect(result.largestTables.length).toBe(1);
    });

    it("should add recommendation for generated_images table > 100 MB", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ size: String(200 * 1024 * 1024) }])
        .mockResolvedValueOnce([
          {
            table_name: "generated_images",
            row_estimate: "1000",
            total_bytes: String(110 * 1024 * 1024),
            index_bytes: "0",
            table_bytes: String(110 * 1024 * 1024),
            toast_bytes: "0",
          },
        ]);

      const result = await service.getDatabaseAnalysis();

      expect(
        result.recommendations.some((r) => r.includes("generated_images")),
      ).toBe(true);
    });

    it("should throw on prisma error", async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error("pg error"));

      await expect(service.getDatabaseAnalysis()).rejects.toThrow("pg error");
    });
  });

  // ==================== vacuumDatabase ====================

  describe("vacuumDatabase", () => {
    it("should execute VACUUM ANALYZE and return success", async () => {
      mockPrisma.$executeRawUnsafe.mockResolvedValue(undefined);

      const result = await service.vacuumDatabase();

      expect(result.success).toBe(true);
      expect(result.message).toContain("VACUUM ANALYZE");
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        "VACUUM ANALYZE",
      );
    });

    it("should return failure when vacuum fails", async () => {
      mockPrisma.$executeRawUnsafe.mockRejectedValue(new Error("vacuum error"));

      const result = await service.vacuumDatabase();

      expect(result.success).toBe(false);
    });
  });

  // ==================== vacuumFullTable ====================

  describe("vacuumFullTable", () => {
    it("should vacuum a valid table and report freed space", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ size: String(50 * 1024 * 1024) }]) // before
        .mockResolvedValueOnce([{ size: String(30 * 1024 * 1024) }]); // after
      mockPrisma.$executeRawUnsafe.mockResolvedValue(undefined);

      const result = await service.vacuumFullTable("generated_images");

      expect(result.success).toBe(true);
      expect(result.beforeMB).toBeCloseTo(50, 0);
      expect(result.afterMB).toBeCloseTo(30, 0);
    });

    it("should reject invalid table names not in whitelist", async () => {
      const result = await service.vacuumFullTable(
        "malicious_table; DROP TABLE users;",
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid table name");
    });

    it("should return failure when vacuum throws", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ size: "1000" }]);
      mockPrisma.$executeRawUnsafe.mockRejectedValue(new Error("lock timeout"));

      const result = await service.vacuumFullTable("raw_data");

      expect(result.success).toBe(false);
      expect(result.message).toContain("lock timeout");
    });
  });

  // ==================== cleanupWAL ====================

  describe("cleanupWAL", () => {
    it("should execute CHECKPOINT and return success", async () => {
      mockPrisma.$executeRawUnsafe.mockResolvedValue(undefined);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ wal_bytes: "10000" }]);

      const result = await service.cleanupWAL();

      expect(result.success).toBe(true);
      expect(result.message).toContain("CHECKPOINT");
    });

    it("should return failure on error", async () => {
      mockPrisma.$executeRawUnsafe.mockRejectedValue(
        new Error("checkpoint error"),
      );

      const result = await service.cleanupWAL();

      expect(result.success).toBe(false);
    });
  });

  // ==================== getFullDiskUsage ====================

  describe("getFullDiskUsage", () => {
    it("should return disk usage breakdown", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ size: String(150 * 1024 * 1024) }])
        .mockResolvedValueOnce([
          {
            table_bytes: String(80 * 1024 * 1024),
            index_bytes: String(20 * 1024 * 1024),
            toast_bytes: String(10 * 1024 * 1024),
          },
        ]);

      const result = await service.getFullDiskUsage();

      expect(result.databaseSizeMB).toBeCloseTo(150, 0);
      expect(result.tableDataMB).toBeCloseTo(80, 0);
      expect(result.indexesMB).toBeCloseTo(20, 0);
      expect(result.toastMB).toBeCloseTo(10, 0);
      expect(Array.isArray(result.breakdown)).toBe(true);
    });

    it("should throw on error", async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error("pg error"));

      await expect(service.getFullDiskUsage()).rejects.toThrow("pg error");
    });
  });

  // ==================== runFullCleanup ====================

  describe("runFullCleanup", () => {
    it("should run all cleanup operations and aggregate results", async () => {
      const successResult = {
        success: true,
        category: "test",
        deletedCount: 5,
        freedSizeMB: 1.5,
        message: "ok",
      };

      // All cleanup methods return success
      jest.spyOn(service, "cleanupImages").mockResolvedValue(successResult);
      jest.spyOn(service, "cleanupOldRawData").mockResolvedValue(successResult);
      jest
        .spyOn(service, "cleanupOldCollectionTasks")
        .mockResolvedValue(successResult);
      jest
        .spyOn(service, "cleanupOldImportTasks")
        .mockResolvedValue(successResult);
      jest
        .spyOn(service, "cleanupExpiredMetadata")
        .mockResolvedValue(successResult);
      jest
        .spyOn(service, "cleanupOldUserActivities")
        .mockResolvedValue(successResult);
      jest
        .spyOn(service, "cleanupOldAskSessions")
        .mockResolvedValue(successResult);
      jest
        .spyOn(service, "cleanupOldOfficeDocuments")
        .mockResolvedValue(successResult);
      jest.spyOn(service, "cleanupOldSlides").mockResolvedValue(successResult);

      const result = await service.runFullCleanup();

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(9);
      expect(result.totalDeleted).toBe(45); // 9 * 5
      expect(result.totalFreedMB).toBeCloseTo(13.5); // 9 * 1.5
    });

    it("should return success=false when any cleanup fails", async () => {
      const failResult = {
        success: false,
        category: "test",
        deletedCount: 0,
        freedSizeMB: 0,
        message: "failed",
      };
      const successResult = { ...failResult, success: true };

      jest.spyOn(service, "cleanupImages").mockResolvedValue(failResult);
      jest.spyOn(service, "cleanupOldRawData").mockResolvedValue(successResult);
      jest
        .spyOn(service, "cleanupOldCollectionTasks")
        .mockResolvedValue(successResult);
      jest
        .spyOn(service, "cleanupOldImportTasks")
        .mockResolvedValue(successResult);
      jest
        .spyOn(service, "cleanupExpiredMetadata")
        .mockResolvedValue(successResult);
      jest
        .spyOn(service, "cleanupOldUserActivities")
        .mockResolvedValue(successResult);
      jest
        .spyOn(service, "cleanupOldAskSessions")
        .mockResolvedValue(successResult);
      jest
        .spyOn(service, "cleanupOldOfficeDocuments")
        .mockResolvedValue(successResult);
      jest.spyOn(service, "cleanupOldSlides").mockResolvedValue(successResult);

      const result = await service.runFullCleanup();

      expect(result.success).toBe(false);
    });
  });

  // ==================== getNodeMemoryStats ====================

  describe("getNodeMemoryStats", () => {
    it("should return healthy status under normal memory usage", () => {
      const origMemUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 100 * 1024 * 1024, // 100 MB
        heapTotal: 200 * 1024 * 1024, // 200 MB → 50%
        rss: 256 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      });
      jest.spyOn(process, "uptime").mockReturnValue(3600);
      const origVersion = process.version;
      Object.defineProperty(process, "version", {
        value: "v18.0.0",
        configurable: true,
      });

      const result = service.getNodeMemoryStats();

      expect(result.status).toBe("healthy");
      expect(result.warnings).toHaveLength(0);
      expect(result.heapUsed).toBeCloseTo(100, 0);
      expect(result.heapUsedPercent).toBeCloseTo(50, 0);

      process.memoryUsage = origMemUsage;
      Object.defineProperty(process, "version", {
        value: origVersion,
        configurable: true,
      });
    });

    it("should return warning status at 76-90% heap usage", () => {
      const origMemUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 160 * 1024 * 1024,
        heapTotal: 200 * 1024 * 1024, // 80%
        rss: 300 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      });

      const result = service.getNodeMemoryStats();

      expect(result.status).toBe("warning");
      process.memoryUsage = origMemUsage;
    });

    it("should return critical status above 90% heap usage", () => {
      const origMemUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 185 * 1024 * 1024,
        heapTotal: 200 * 1024 * 1024, // 92.5%
        rss: 200 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      });

      const result = service.getNodeMemoryStats();

      expect(result.status).toBe("critical");
      expect(result.warnings.length).toBeGreaterThan(0);
      process.memoryUsage = origMemUsage;
    });
  });

  // ==================== getSystemMemoryStats ====================

  describe("getSystemMemoryStats", () => {
    it("should return system memory stats as healthy", () => {
      (os.totalmem as jest.Mock).mockReturnValue(16 * 1024 * 1024 * 1024); // 16 GB
      (os.freemem as jest.Mock).mockReturnValue(8 * 1024 * 1024 * 1024); // 8 GB free (50%)
      (os.platform as jest.Mock).mockReturnValue("linux");
      (os.cpus as jest.Mock).mockReturnValue(new Array(4));
      (os.loadavg as jest.Mock).mockReturnValue([0.5, 0.3, 0.2]);
      (os.hostname as jest.Mock).mockReturnValue("server-1");

      const result = service.getSystemMemoryStats();

      expect(result.status).toBe("healthy");
      expect(result.totalMemory).toBeCloseTo(16, 0);
      expect(result.freeMemory).toBeCloseTo(8, 0);
      expect(result.usedPercent).toBeCloseTo(50, 0);
      expect(result.platform).toBe("linux");
      expect(result.cpuCount).toBe(4);
    });

    it("should return warning status when memory usage >80%", () => {
      (os.totalmem as jest.Mock).mockReturnValue(16 * 1024 * 1024 * 1024);
      (os.freemem as jest.Mock).mockReturnValue(2.5 * 1024 * 1024 * 1024); // ~85% used
      (os.platform as jest.Mock).mockReturnValue("linux");
      (os.cpus as jest.Mock).mockReturnValue(new Array(4));
      (os.loadavg as jest.Mock).mockReturnValue([1.0]);
      (os.hostname as jest.Mock).mockReturnValue("server-1");

      const result = service.getSystemMemoryStats();

      expect(result.status).toBe("warning");
    });

    it("should return critical status when memory usage >90%", () => {
      (os.totalmem as jest.Mock).mockReturnValue(16 * 1024 * 1024 * 1024);
      (os.freemem as jest.Mock).mockReturnValue(1 * 1024 * 1024 * 1024); // ~93.75% used
      (os.platform as jest.Mock).mockReturnValue("linux");
      (os.cpus as jest.Mock).mockReturnValue(new Array(2));
      (os.loadavg as jest.Mock).mockReturnValue([2.0]);
      (os.hostname as jest.Mock).mockReturnValue("server-1");

      const result = service.getSystemMemoryStats();

      expect(result.status).toBe("critical");
    });
  });
});
