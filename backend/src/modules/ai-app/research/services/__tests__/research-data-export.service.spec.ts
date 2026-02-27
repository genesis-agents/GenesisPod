import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import {
  ResearchDataExportService,
  ExportableResearchData,
  ResearchListItem,
} from "../research-data-export.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

describe("ResearchDataExportService", () => {
  let service: ResearchDataExportService;

  const mockPrisma = {
    researchTopic: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchDataExportService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ResearchDataExportService>(ResearchDataExportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== getTopicForExport ====================

  describe("getTopicForExport", () => {
    const topicId = "topic-1";
    const userId = "user-1";

    const mockDimensionAnalysis = {
      summary: "analysis summary",
      dataPoints: { key: "value" },
      dimension: { name: "Technology" },
    };

    const mockReport = {
      fullReport: "full text",
      charts: { type: "bar" },
      highlights: ["highlight 1"],
      dimensionAnalyses: [mockDimensionAnalysis],
    };

    const mockTopic = {
      id: topicId,
      name: "AI Trends",
      description: "Analysis of AI trends",
      language: "zh-CN",
      createdAt: new Date("2025-01-01"),
      reports: [mockReport],
      dimensions: [
        { name: "Technology", description: "Tech dimension", sortOrder: 1 },
        { name: "Business", description: "Biz dimension", sortOrder: 2 },
      ],
    };

    it("should throw NotFoundException when topic is not found", async () => {
      mockPrisma.researchTopic.findFirst.mockResolvedValue(null);

      await expect(service.getTopicForExport(topicId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw NotFoundException with topicId in message", async () => {
      mockPrisma.researchTopic.findFirst.mockResolvedValue(null);

      await expect(
        service.getTopicForExport("missing-id", userId),
      ).rejects.toThrow("missing-id");
    });

    it("should query with correct topicId and userId", async () => {
      mockPrisma.researchTopic.findFirst.mockResolvedValue(mockTopic);

      await service.getTopicForExport(topicId, userId);

      expect(mockPrisma.researchTopic.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: topicId, userId },
        }),
      );
    });

    it("should return properly shaped ExportableResearchData", async () => {
      mockPrisma.researchTopic.findFirst.mockResolvedValue(mockTopic);

      const result: ExportableResearchData = await service.getTopicForExport(
        topicId,
        userId,
      );

      expect(result.id).toBe(topicId);
      expect(result.name).toBe("AI Trends");
      expect(result.description).toBe("Analysis of AI trends");
      expect(result.language).toBe("zh-CN");
      expect(result.createdAt).toEqual(new Date("2025-01-01"));
    });

    it("should map dimensions correctly with name, description, and sortOrder", async () => {
      mockPrisma.researchTopic.findFirst.mockResolvedValue(mockTopic);

      const result = await service.getTopicForExport(topicId, userId);

      expect(result.dimensions).toHaveLength(2);
      expect(result.dimensions[0]).toEqual({
        name: "Technology",
        description: "Tech dimension",
        sortOrder: 1,
      });
    });

    it("should include latestReport fields when a report exists", async () => {
      mockPrisma.researchTopic.findFirst.mockResolvedValue(mockTopic);

      const result = await service.getTopicForExport(topicId, userId);

      expect(result.latestReport).not.toBeNull();
      expect(result.latestReport?.fullReport).toBe("full text");
      expect(result.latestReport?.charts).toEqual({ type: "bar" });
      expect(result.latestReport?.highlights).toEqual(["highlight 1"]);
    });

    it("should map dimensionAnalyses to include summary, dataPoints, and dimension.name", async () => {
      mockPrisma.researchTopic.findFirst.mockResolvedValue(mockTopic);

      const result = await service.getTopicForExport(topicId, userId);

      expect(result.latestReport?.dimensionAnalyses).toHaveLength(1);
      expect(result.latestReport?.dimensionAnalyses[0]).toEqual({
        summary: "analysis summary",
        dataPoints: { key: "value" },
        dimension: { name: "Technology" },
      });
    });

    it("should set latestReport to null when topic has no reports", async () => {
      const topicWithoutReports = { ...mockTopic, reports: [] };
      mockPrisma.researchTopic.findFirst.mockResolvedValue(topicWithoutReports);

      const result = await service.getTopicForExport(topicId, userId);

      expect(result.latestReport).toBeNull();
    });

    it("should handle null description gracefully", async () => {
      const topicNullDesc = { ...mockTopic, description: null, reports: [] };
      mockPrisma.researchTopic.findFirst.mockResolvedValue(topicNullDesc);

      const result = await service.getTopicForExport(topicId, userId);

      expect(result.description).toBeNull();
    });

    it("should handle null language gracefully", async () => {
      const topicNullLang = { ...mockTopic, language: null, reports: [] };
      mockPrisma.researchTopic.findFirst.mockResolvedValue(topicNullLang);

      const result = await service.getTopicForExport(topicId, userId);

      expect(result.language).toBeNull();
    });
  });

  // ==================== listTopicsForExport ====================

  describe("listTopicsForExport", () => {
    const userId = "user-1";

    const mockTopics = [
      {
        id: "topic-1",
        name: "Topic One",
        description: "desc1",
        createdAt: new Date("2025-06-01"),
        _count: { dimensions: 3 },
      },
      {
        id: "topic-2",
        name: "Topic Two",
        description: null,
        createdAt: new Date("2025-05-01"),
        _count: { dimensions: 0 },
      },
    ];

    it("should return an array of ResearchListItem", async () => {
      mockPrisma.researchTopic.findMany.mockResolvedValue(mockTopics);

      const result: ResearchListItem[] =
        await service.listTopicsForExport(userId);

      expect(Array.isArray(result)).toBe(true);
    });

    it("should map each topic to a ResearchListItem with correct fields", async () => {
      mockPrisma.researchTopic.findMany.mockResolvedValue(mockTopics);

      const result = await service.listTopicsForExport(userId);

      expect(result[0]).toEqual({
        id: "topic-1",
        name: "Topic One",
        description: "desc1",
        createdAt: new Date("2025-06-01"),
        dimensionCount: 3,
      });
    });

    it("should map dimensionCount from _count.dimensions", async () => {
      mockPrisma.researchTopic.findMany.mockResolvedValue(mockTopics);

      const result = await service.listTopicsForExport(userId);

      expect(result[1].dimensionCount).toBe(0);
    });

    it("should pass userId in where clause", async () => {
      mockPrisma.researchTopic.findMany.mockResolvedValue([]);

      await service.listTopicsForExport(userId);

      expect(mockPrisma.researchTopic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId } }),
      );
    });

    it("should default limit to 50", async () => {
      mockPrisma.researchTopic.findMany.mockResolvedValue([]);

      await service.listTopicsForExport(userId);

      expect(mockPrisma.researchTopic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it("should respect a custom limit", async () => {
      mockPrisma.researchTopic.findMany.mockResolvedValue([]);

      await service.listTopicsForExport(userId, 10);

      expect(mockPrisma.researchTopic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });

    it("should return empty array when user has no topics", async () => {
      mockPrisma.researchTopic.findMany.mockResolvedValue([]);

      const result = await service.listTopicsForExport(userId);

      expect(result).toEqual([]);
    });
  });
});
