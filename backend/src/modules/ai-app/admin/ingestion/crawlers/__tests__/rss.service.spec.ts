import { Test, TestingModule } from "@nestjs/testing";
import { RssService } from "../rss.service";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { MongoDBService } from "../../../../../../common/mongodb/mongodb.service.postgres";
import { DeduplicationService } from "../deduplication.service";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Shared parseURL mock function that is stable across instantiations
const mockParseURL = jest.fn();

// Mock rss-parser before any import
jest.mock("rss-parser", () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: mockParseURL,
  }));
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  resource: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
};

const mockMongodb = {
  insertRawData: jest.fn(),
  linkResourceToRawData: jest.fn(),
  findRawDataById: jest.fn(),
  findRawDataByUrlAcrossAllSources: jest.fn(),
};

const mockDeduplication = {
  normalizeUrl: jest.fn(),
  areTitlesSimilar: jest.fn(),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe("RssService", () => {
  let service: RssService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RssService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MongoDBService, useValue: mockMongodb },
        { provide: DeduplicationService, useValue: mockDeduplication },
      ],
    }).compile();

    service = module.get<RssService>(RssService);

    // Default mock behaviors
    mockDeduplication.normalizeUrl.mockImplementation((url: string) => url);
    mockDeduplication.areTitlesSimilar.mockReturnValue(false);
    mockPrisma.resource.findFirst.mockResolvedValue(null);
    mockPrisma.resource.findMany.mockResolvedValue([]);
    mockMongodb.findRawDataByUrlAcrossAllSources.mockResolvedValue(null);
    mockMongodb.insertRawData.mockResolvedValue("mongodb-id-123");
    mockMongodb.findRawDataById.mockResolvedValue({
      resourceId: "resource-id-123",
    });
    mockMongodb.linkResourceToRawData.mockResolvedValue(undefined);
    mockPrisma.resource.create.mockResolvedValue({ id: "resource-id-123" });
  });

  // ── fetchRssFeed ─────────────────────────────────────────────────────────────

  describe("fetchRssFeed", () => {
    it("returns zero counts when feed has no items", async () => {
      mockParseURL.mockResolvedValue({ items: [] });

      const result = await service.fetchRssFeed("https://example.com/feed.rss");

      expect(result).toEqual({ success: 0, duplicates: 0, failed: 0 });
    });

    it("returns zero counts when feed items is null", async () => {
      mockParseURL.mockResolvedValue({ items: null });

      const result = await service.fetchRssFeed("https://example.com/feed.rss");

      expect(result).toEqual({ success: 0, duplicates: 0, failed: 0 });
    });

    it("processes items and returns success count", async () => {
      mockParseURL.mockResolvedValue({
        title: "Test Feed",
        link: "https://example.com",
        items: [
          {
            title: "Article One",
            link: "https://example.com/article-1",
            guid: "guid-1",
            isoDate: "2024-01-01T00:00:00.000Z",
          },
        ],
      });

      const result = await service.fetchRssFeed("https://example.com/feed.rss");

      expect(result.success).toBe(1);
      expect(result.duplicates).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockMongodb.insertRawData).toHaveBeenCalledWith(
        "rss",
        expect.objectContaining({ url: "https://example.com/article-1" }),
      );
    });

    it("counts URL duplicates when resource already exists", async () => {
      mockParseURL.mockResolvedValue({
        title: "Test Feed",
        items: [
          {
            title: "Existing Article",
            link: "https://example.com/existing",
            guid: "guid-2",
          },
        ],
      });

      mockPrisma.resource.findFirst.mockResolvedValue({
        id: "existing-id",
        title: "Existing Article",
      });

      const result = await service.fetchRssFeed("https://example.com/feed.rss");

      expect(result.duplicates).toBe(1);
      expect(result.success).toBe(0);
      expect(mockMongodb.insertRawData).not.toHaveBeenCalled();
    });

    it("counts MongoDB duplicates when raw data already exists", async () => {
      mockParseURL.mockResolvedValue({
        title: "Test Feed",
        items: [
          {
            title: "MongoDB Duplicate",
            link: "https://example.com/mongo-dupe",
            guid: "guid-3",
          },
        ],
      });

      mockPrisma.resource.findFirst.mockResolvedValue(null);
      mockPrisma.resource.findMany.mockResolvedValue([]);
      mockMongodb.findRawDataByUrlAcrossAllSources.mockResolvedValue({
        source: "rss",
      });

      const result = await service.fetchRssFeed("https://example.com/feed.rss");

      expect(result.duplicates).toBe(1);
      expect(result.success).toBe(0);
    });

    it("counts title similarity duplicates", async () => {
      mockParseURL.mockResolvedValue({
        title: "Test Feed",
        items: [
          {
            title: "Very Similar Title Article",
            link: "https://example.com/similar",
            guid: "guid-4",
          },
        ],
      });

      mockPrisma.resource.findFirst.mockResolvedValue(null);
      mockPrisma.resource.findMany.mockResolvedValue([
        { id: "similar-id", title: "Very Similar Title Article" },
      ]);
      mockDeduplication.areTitlesSimilar.mockReturnValue(true);
      mockMongodb.findRawDataByUrlAcrossAllSources.mockResolvedValue(null);

      const result = await service.fetchRssFeed("https://example.com/feed.rss");

      expect(result.duplicates).toBe(1);
    });

    it("counts failed when item has no title", async () => {
      mockParseURL.mockResolvedValue({
        title: "Test Feed",
        items: [{ link: "https://example.com/notitle" }],
      });

      const result = await service.fetchRssFeed("https://example.com/feed.rss");

      expect(result.failed).toBe(1);
    });

    it("counts failed when item has no link", async () => {
      mockParseURL.mockResolvedValue({
        title: "Test Feed",
        items: [{ title: "No Link Article" }],
      });

      const result = await service.fetchRssFeed("https://example.com/feed.rss");

      expect(result.failed).toBe(1);
    });

    it("respects maxItems limit", async () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        title: `Article ${i}`,
        link: `https://example.com/article-${i}`,
        guid: `guid-${i}`,
      }));

      mockParseURL.mockResolvedValue({
        title: "Test Feed",
        items,
      });

      await service.fetchRssFeed("https://example.com/feed.rss", 5);

      // Only 5 items should be processed (5 calls to findFirst)
      expect(mockPrisma.resource.findFirst).toHaveBeenCalledTimes(5);
    });

    it("throws descriptive error when feed returns 404", async () => {
      mockParseURL.mockRejectedValue(new Error("Status code 404"));

      await expect(
        service.fetchRssFeed("https://example.com/missing.rss"),
      ).rejects.toThrow(/404/);
    });

    it("throws descriptive error when feed returns 403", async () => {
      mockParseURL.mockRejectedValue(new Error("Status code 403"));

      await expect(
        service.fetchRssFeed("https://example.com/forbidden.rss"),
      ).rejects.toThrow(/403/);
    });

    it("throws descriptive error on network failure", async () => {
      mockParseURL.mockRejectedValue(new Error("ENOTFOUND example.com"));

      await expect(
        service.fetchRssFeed("https://example.com/feed.rss"),
      ).rejects.toThrow(/ENOTFOUND|Cannot connect/);
    });

    it("extracts arXiv PDF URL from arXiv item links", async () => {
      mockParseURL.mockResolvedValue({
        title: "arXiv Feed",
        items: [
          {
            title: "Deep Learning Paper",
            link: "https://arxiv.org/abs/2401.12345",
            guid: "arxiv-guid",
          },
        ],
      });

      await service.fetchRssFeed("https://export.arxiv.org/rss/cs.AI");

      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pdfUrl: "https://arxiv.org/pdf/2401.12345",
          }),
        }),
      );
    });

    it("establishes bi-directional reference between MongoDB and PostgreSQL", async () => {
      mockParseURL.mockResolvedValue({
        title: "Feed",
        items: [
          {
            title: "Reference Test",
            link: "https://example.com/ref-test",
            guid: "ref-guid",
          },
        ],
      });

      await service.fetchRssFeed("https://example.com/feed.rss");

      expect(mockMongodb.linkResourceToRawData).toHaveBeenCalledWith(
        "mongodb-id-123",
        "resource-id-123",
      );
      expect(mockMongodb.findRawDataById).toHaveBeenCalledWith(
        "mongodb-id-123",
      );
    });

    it("throws when bi-directional reference sync fails", async () => {
      mockParseURL.mockResolvedValue({
        title: "Feed",
        items: [
          {
            title: "Sync Fail Test",
            link: "https://example.com/sync-fail",
            guid: "sync-guid",
          },
        ],
      });

      // Return wrong resourceId from MongoDB
      mockMongodb.findRawDataById.mockResolvedValue({
        resourceId: "wrong-resource-id",
      });

      const result = await service.fetchRssFeed("https://example.com/feed.rss");

      // The error should be caught and counted as failed
      expect(result.failed).toBe(1);
    });

    it("uses fallback category when not specified", async () => {
      mockParseURL.mockResolvedValue({
        title: "Feed",
        items: [
          {
            title: "Category Test",
            link: "https://example.com/cat",
            guid: "cat-guid",
          },
        ],
      });

      await service.fetchRssFeed("https://example.com/feed.rss");

      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "BLOG",
          }),
        }),
      );
    });

    it("uses provided category for resource type", async () => {
      mockParseURL.mockResolvedValue({
        title: "Feed",
        items: [
          {
            title: "News Item",
            link: "https://news.example.com/item",
            guid: "news-guid",
          },
        ],
      });

      await service.fetchRssFeed("https://example.com/feed.rss", 10, "NEWS");

      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "NEWS",
          }),
        }),
      );
    });
  });

  // ── fetchMultipleFeeds ───────────────────────────────────────────────────────

  describe("fetchMultipleFeeds", () => {
    it("aggregates results from multiple feeds", async () => {
      mockParseURL
        .mockResolvedValueOnce({
          title: "Feed 1",
          items: [
            { title: "Item 1", link: "https://feed1.com/item1", guid: "g1" },
          ],
        })
        .mockResolvedValueOnce({
          title: "Feed 2",
          items: [
            { title: "Item 2", link: "https://feed2.com/item2", guid: "g2" },
          ],
        });

      // Make each resource create return unique IDs
      mockPrisma.resource.create
        .mockResolvedValueOnce({ id: "resource-1" })
        .mockResolvedValueOnce({ id: "resource-2" });

      mockMongodb.findRawDataById
        .mockResolvedValueOnce({ resourceId: "resource-1" })
        .mockResolvedValueOnce({ resourceId: "resource-2" });

      const result = await service.fetchMultipleFeeds([
        { url: "https://feed1.com/rss", category: "BLOG" },
        { url: "https://feed2.com/rss", category: "NEWS" },
      ]);

      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
    });

    it("counts failed feeds when parseURL throws", async () => {
      mockParseURL.mockRejectedValue(new Error("Status code 500"));

      const result = await service.fetchMultipleFeeds([
        { url: "https://broken-feed.com/rss", category: "BLOG" },
      ]);

      expect(result.failed).toBe(1);
      expect(result.total).toBe(0);
    });

    it("aggregates duplicates across multiple feeds", async () => {
      mockParseURL.mockResolvedValue({
        title: "Feed",
        items: [
          {
            title: "Existing",
            link: "https://example.com/existing",
            guid: "g",
          },
        ],
      });

      mockPrisma.resource.findFirst.mockResolvedValue({
        id: "existing-id",
        title: "Existing",
      });

      const result = await service.fetchMultipleFeeds([
        { url: "https://feed1.com/rss", category: "BLOG" },
        { url: "https://feed2.com/rss", category: "BLOG" },
      ]);

      expect(result.duplicates).toBe(2);
      expect(result.total).toBe(0);
    });
  });
});
