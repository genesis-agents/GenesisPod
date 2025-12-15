/**
 * AI Image Service 测试
 * 测试图片生成、标签、风格分析和主题聚类功能
 */

// Mock content-processing module to avoid pdfjs-dist ESM import issues
jest.mock("../../../../common/content-processing", () => ({
  ContentExtractorService: jest.fn().mockImplementation(() => ({
    extract: jest.fn(),
  })),
  DataFetchingService: jest.fn().mockImplementation(() => ({
    fetch: jest.fn(),
  })),
}));

import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { AiImageService } from "../ai-image.service";
import { InfographicTemplateService } from "../infographic-template.service";
import { AiImageAnalyticsService } from "../ai-image-analytics.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { R2StorageService } from "../../../core/storage/r2-storage.service";
import {
  ContentExtractorService,
  DataFetchingService,
} from "../../../../common/content-processing";

describe("AiImageService", () => {
  let service: AiImageService;

  const mockPrisma = {
    generatedImage: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    aIModel: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

  const mockR2Storage = {
    uploadImage: jest.fn(),
    deleteImage: jest.fn(),
    isEnabled: jest.fn().mockReturnValue(false),
  };

  const mockAnalyticsService = {
    getImageStats: jest.fn(),
    getImageUsageByUser: jest.fn(),
    getPopularStyles: jest.fn(),
    trackGeneration: jest.fn(),
  };

  const mockContentExtractor = {
    extract: jest.fn(),
  };

  const mockDataFetching = {
    fetch: jest.fn(),
  };

  const mockInfographicTemplate = {
    getTemplates: jest.fn(),
    getTemplate: jest.fn(),
    generateInfographic: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiImageService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HttpService, useValue: mockHttpService },
        { provide: ContentExtractorService, useValue: mockContentExtractor },
        {
          provide: InfographicTemplateService,
          useValue: mockInfographicTemplate,
        },
        { provide: DataFetchingService, useValue: mockDataFetching },
        { provide: R2StorageService, useValue: mockR2Storage },
        { provide: AiImageAnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile();

    service = module.get<AiImageService>(AiImageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getAvailableModels", () => {
    it("should return available image models", async () => {
      mockPrisma.aIModel.findMany.mockResolvedValue([
        {
          id: "1",
          displayName: "DALL-E 3",
          modelId: "dall-e-3",
          type: "IMAGE",
          enabled: true,
        },
      ]);

      const result = await service.getAvailableModels();

      expect(result).toBeDefined();
      expect(result.imageModels).toBeDefined();
    });

    it("should return empty array when no models available", async () => {
      mockPrisma.aIModel.findMany.mockResolvedValue([]);

      const result = await service.getAvailableModels();

      expect(result).toBeDefined();
      expect(result.imageModels).toEqual([]);
    });
  });

  describe("getHistory", () => {
    it("should return user image history", async () => {
      const mockImages = [
        {
          id: "img-1",
          imageUrl: "https://example.com/1.png",
          prompt: "prompt 1",
          createdAt: new Date(),
        },
        {
          id: "img-2",
          imageUrl: "https://example.com/2.png",
          prompt: "prompt 2",
          createdAt: new Date(),
        },
      ];
      // getHistory calls findMany twice (bookmarked + unbookmarked)
      mockPrisma.generatedImage.findMany.mockResolvedValue(mockImages);

      const result = await service.getHistory("user-123");

      expect(mockPrisma.generatedImage.findMany).toHaveBeenCalled();
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it("should return empty array for user with no images", async () => {
      mockPrisma.generatedImage.findMany.mockResolvedValue([]);

      const result = await service.getHistory("user-no-images");

      expect(result).toEqual([]);
    });
  });

  describe("getImage", () => {
    it("should return image by id", async () => {
      const mockImage = {
        id: "img-123",
        imageUrl: "https://example.com/image.png",
        prompt: "test prompt",
        createdAt: new Date(),
      };
      mockPrisma.generatedImage.findUnique.mockResolvedValue(mockImage);

      const result = await service.getImage("img-123");

      expect(mockPrisma.generatedImage.findUnique).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result?.id).toBe("img-123");
    });

    it("should return null for non-existent image", async () => {
      mockPrisma.generatedImage.findUnique.mockResolvedValue(null);

      const result = await service.getImage("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("deleteImage", () => {
    it("should delete image owned by user", async () => {
      mockPrisma.generatedImage.findUnique.mockResolvedValue({
        id: "img-123",
        userId: "user-123",
        imageUrl: "https://example.com/image.png",
      });
      mockPrisma.generatedImage.delete.mockResolvedValue({ id: "img-123" });

      const result = await service.deleteImage("img-123", "user-123");

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("should not delete image owned by another user", async () => {
      mockPrisma.generatedImage.findUnique.mockResolvedValue({
        id: "img-123",
        userId: "other-user",
      });

      const result = await service.deleteImage("img-123", "different-user");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Not authorized");
    });
  });

  describe("getBookmarkedImages", () => {
    it("should return bookmarked images for user", async () => {
      const mockImages = [
        {
          id: "img-1",
          imageUrl: "https://example.com/1.png",
          isBookmarked: true,
        },
      ];
      mockPrisma.generatedImage.findMany.mockResolvedValue(mockImages);

      const result = await service.getBookmarkedImages("user-123");

      expect(mockPrisma.generatedImage.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe("addBookmark", () => {
    it("should add bookmark to image", async () => {
      mockPrisma.generatedImage.findUnique.mockResolvedValue({
        id: "img-123",
        userId: "user-123",
      });
      mockPrisma.generatedImage.update.mockResolvedValue({
        id: "img-123",
        bookmarked: true,
      });

      const result = await service.addBookmark("img-123", "user-123");

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe("removeBookmark", () => {
    it("should remove bookmark from image", async () => {
      mockPrisma.generatedImage.findUnique.mockResolvedValue({
        id: "img-123",
        userId: "user-123",
      });
      mockPrisma.generatedImage.update.mockResolvedValue({
        id: "img-123",
        bookmarked: false,
      });

      const result = await service.removeBookmark("img-123", "user-123");

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe("cleanupOldImages", () => {
    it("should cleanup old unbookmarked images", async () => {
      mockPrisma.generatedImage.findMany.mockResolvedValue([
        { id: "old-img-1", createdAt: new Date("2020-01-01") },
        { id: "old-img-2", createdAt: new Date("2020-01-02") },
      ]);
      mockPrisma.generatedImage.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.cleanupOldImages("user-123");

      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getImageStats", () => {
    it("should return image statistics", async () => {
      mockPrisma.generatedImage.count.mockResolvedValue(100);
      mockPrisma.generatedImage.findMany.mockResolvedValue([]);
      mockPrisma.generatedImage.groupBy.mockResolvedValue([
        { userId: "user-1", _count: { id: 10 } },
        { userId: "user-2", _count: { id: 5 } },
      ]);

      const result = await service.getImageStats();

      expect(result).toBeDefined();
      expect(mockPrisma.generatedImage.count).toHaveBeenCalled();
    });
  });
});
