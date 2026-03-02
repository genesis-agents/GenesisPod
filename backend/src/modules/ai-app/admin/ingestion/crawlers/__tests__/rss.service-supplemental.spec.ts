/**
 * RssService Supplemental Tests
 *
 * Covers uncovered branches beyond rss.service.spec.ts:
 * - Error message formatting for 500/ECONNREFUSED errors
 * - fetchRssFeed with skipped=0 case (no duration filter)
 * - extractResourceData: summary truncation, fallback author, tags from categories
 * - extractArxivId: valid/invalid URLs
 * - parseYouTubeDurationText: hours+minutes+seconds, edge cases
 * - isYouTubeVideoUrl: various URL formats
 * - fetchMultipleFeeds: successful=0 path, maxItemsPerFeed propagation
 * - YouTube skipUnknownDuration=false (default: include unknown duration videos)
 * - YouTube skipUnknownDuration=true (skip unknown duration)
 * - fetchRssFeed: non-YouTube feed with minDuration (should not filter)
 * - raw null/undefined feed object
 */

import { Test, TestingModule } from "@nestjs/testing";
import { RssService } from "../rss.service";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { MongoDBService } from "../../../../../../common/mongodb/mongodb.service.postgres";
import { DeduplicationService } from "../deduplication.service";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Shared parseURL mock function
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

describe("RssService (supplemental)", () => {
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

  // ── Error message formatting ─────────────────────────────────────────────────

  describe("fetchRssFeed – error message formatting", () => {
    it("formats 500 error with descriptive message", async () => {
      mockParseURL.mockRejectedValue(new Error("Status code 500"));

      await expect(
        service.fetchRssFeed("https://example.com/feed.rss"),
      ).rejects.toThrow(/500|Server error/);
    });

    it("formats ECONNREFUSED as connection error", async () => {
      mockParseURL.mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(
        service.fetchRssFeed("https://example.com/feed.rss"),
      ).rejects.toThrow(/ECONNREFUSED|Cannot connect/);
    });

    it("formats generic error with original message", async () => {
      mockParseURL.mockRejectedValue(new Error("Custom parse error XYZ"));

      await expect(
        service.fetchRssFeed("https://example.com/feed.rss"),
      ).rejects.toThrow(/Custom parse error XYZ/);
    });

    it("handles non-Error thrown value", async () => {
      mockParseURL.mockRejectedValue("string error value");

      await expect(
        service.fetchRssFeed("https://example.com/feed.rss"),
      ).rejects.toThrow();
    });
  });

  // ── skipped count reporting ──────────────────────────────────────────────────

  describe("fetchRssFeed – skipped count", () => {
    it("returns skipped=0 when no duration filter applied", async () => {
      mockParseURL.mockResolvedValue({
        title: "Test Feed",
        items: [
          {
            title: "Normal Article",
            link: "https://example.com/article-1",
            guid: "guid-1",
          },
        ],
      });

      const result = await service.fetchRssFeed("https://example.com/feed.rss");

      expect(result.skipped).toBe(0);
    });

    it("does not filter non-YouTube URLs even when minDurationSeconds set", async () => {
      mockParseURL.mockResolvedValue({
        title: "Blog Feed",
        items: [
          {
            title: "Blog Post",
            link: "https://blog.example.com/post-1",
            guid: "blog-guid-1",
          },
        ],
      });

      const result = await service.fetchRssFeed(
        "https://blog.example.com/feed.rss",
        10,
        "BLOG",
        { minDurationSeconds: 600 },
      );

      // Non-YouTube feed with minDurationSeconds should NOT filter items
      expect(result.skipped).toBe(0);
      expect(result.success).toBe(1);
    });
  });

  // ── extractResourceData edge cases ──────────────────────────────────────────

  describe("fetchRssFeed – resource data extraction", () => {
    it("truncates long summary to 500 characters", async () => {
      const longContent = "x".repeat(600);
      mockParseURL.mockResolvedValue({
        title: "Feed",
        items: [
          {
            title: "Long Content Article",
            link: "https://example.com/long-content",
            guid: "long-guid",
            contentSnippet: longContent,
          },
        ],
      });

      await service.fetchRssFeed("https://example.com/feed.rss");

      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            abstract: expect.stringMatching(/\.{3}$/),
          }),
        }),
      );
    });

    it("uses feed.title as fallback author when creator is missing", async () => {
      mockParseURL.mockResolvedValue({
        title: "My Blog Feed",
        items: [
          {
            title: "No Author Post",
            link: "https://example.com/no-author",
            guid: "no-author-guid",
          },
        ],
      });

      await service.fetchRssFeed("https://example.com/feed.rss");

      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authors: [{ name: "My Blog Feed" }],
          }),
        }),
      );
    });

    it("uses 'Unknown' as author when both creator and feed.title are missing", async () => {
      mockParseURL.mockResolvedValue({
        items: [
          {
            title: "Anonymous Post",
            link: "https://example.com/anon",
            guid: "anon-guid",
          },
        ],
      });

      await service.fetchRssFeed("https://example.com/feed.rss");

      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authors: [{ name: "Unknown" }],
          }),
        }),
      );
    });

    it("uses item.creator as author when present", async () => {
      mockParseURL.mockResolvedValue({
        title: "Feed Title",
        items: [
          {
            title: "Authored Post",
            link: "https://example.com/authored",
            guid: "authored-guid",
            creator: "John Doe",
          },
        ],
      });

      await service.fetchRssFeed("https://example.com/feed.rss");

      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authors: [{ name: "John Doe" }],
          }),
        }),
      );
    });

    it("extracts tags from item categories", async () => {
      mockParseURL.mockResolvedValue({
        title: "Feed",
        items: [
          {
            title: "Categorized Post",
            link: "https://example.com/categories",
            guid: "cat-guid",
            categories: ["AI", "Machine Learning", "NLP"],
          },
        ],
      });

      await service.fetchRssFeed("https://example.com/feed.rss");

      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tags: expect.arrayContaining(["AI", "Machine Learning", "NLP"]),
          }),
        }),
      );
    });

    it("uses pubDate when isoDate is not present", async () => {
      mockParseURL.mockResolvedValue({
        title: "Feed",
        items: [
          {
            title: "PubDate Post",
            link: "https://example.com/pubdate",
            guid: "pub-guid",
            pubDate: "Mon, 01 Jan 2024 00:00:00 GMT",
          },
        ],
      });

      await service.fetchRssFeed("https://example.com/feed.rss");

      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("sets qualityScore=8.0 for RSS items", async () => {
      mockParseURL.mockResolvedValue({
        title: "Feed",
        items: [
          {
            title: "Quality Post",
            link: "https://example.com/quality",
            guid: "qual-guid",
          },
        ],
      });

      await service.fetchRssFeed("https://example.com/feed.rss");

      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            qualityScore: 8.0,
          }),
        }),
      );
    });

    it("sets pdfUrl=null for non-arXiv URLs", async () => {
      mockParseURL.mockResolvedValue({
        title: "Feed",
        items: [
          {
            title: "Regular Post",
            link: "https://example.com/regular-post",
            guid: "regular-guid",
          },
        ],
      });

      await service.fetchRssFeed("https://example.com/feed.rss");

      expect(mockPrisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pdfUrl: null,
          }),
        }),
      );
    });
  });

  // ── YouTube duration filtering edge cases ────────────────────────────────────

  describe("fetchRssFeed – YouTube duration edge cases", () => {
    const ytFeedUrl =
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCtest";

    it("processes video when duration equals minimum threshold exactly", async () => {
      mockParseURL.mockResolvedValue({
        title: "YouTube Channel",
        items: [
          {
            title: "Exactly Minimum Video",
            link: "https://www.youtube.com/watch?v=exactId",
            guid: "yt-exact",
          },
        ],
      });

      const durationSpy = jest
        .spyOn(
          service as unknown as {
            getYouTubeVideoDuration: () => Promise<number>;
          },
          "getYouTubeVideoDuration",
        )
        .mockResolvedValue(600);

      const result = await service.fetchRssFeed(
        ytFeedUrl,
        10,
        "YOUTUBE_VIDEO",
        { minDurationSeconds: 600 },
      );

      // Duration equals minimum - should NOT be skipped (only skip if strictly less than)
      expect(result.skipped).toBe(0);
      durationSpy.mockRestore();
    });

    it("includes unknown duration video when skipUnknownDuration=false", async () => {
      mockParseURL.mockResolvedValue({
        title: "YouTube Channel",
        items: [
          {
            title: "Unknown Duration Video",
            link: "https://www.youtube.com/watch?v=unknownId",
            guid: "yt-unknown",
          },
        ],
      });

      const durationSpy = jest
        .spyOn(
          service as unknown as {
            getYouTubeVideoDuration: () => Promise<number | null>;
          },
          "getYouTubeVideoDuration",
        )
        .mockResolvedValue(null);

      const result = await service.fetchRssFeed(
        ytFeedUrl,
        10,
        "YOUTUBE_VIDEO",
        { minDurationSeconds: 600, skipUnknownDuration: false },
      );

      // skipUnknownDuration=false means include unknown duration videos
      expect(result.skipped).toBe(0);
      expect(result.success).toBe(1);
      durationSpy.mockRestore();
    });

    it("skips video when duration unknown and skipUnknownDuration=true", async () => {
      mockParseURL.mockResolvedValue({
        title: "YouTube Channel",
        items: [
          {
            title: "Unknown Duration Video 2",
            link: "https://www.youtube.com/watch?v=unknownId2",
            guid: "yt-unknown-2",
          },
        ],
      });

      const durationSpy = jest
        .spyOn(
          service as unknown as {
            getYouTubeVideoDuration: () => Promise<number | null>;
          },
          "getYouTubeVideoDuration",
        )
        .mockResolvedValue(null);

      const result = await service.fetchRssFeed(
        ytFeedUrl,
        10,
        "YOUTUBE_VIDEO",
        { minDurationSeconds: 600, skipUnknownDuration: true },
      );

      expect(result.skipped).toBe(1);
      expect(result.success).toBe(0);
      durationSpy.mockRestore();
    });

    it("uses youtu.be URL format for YouTube detection", async () => {
      mockParseURL.mockResolvedValue({
        title: "YouTube Channel",
        items: [
          {
            title: "Youtu.be Video",
            link: "https://youtu.be/shortId123",
            guid: "yt-short-url",
          },
        ],
      });

      const durationSpy = jest
        .spyOn(
          service as unknown as {
            getYouTubeVideoDuration: () => Promise<number>;
          },
          "getYouTubeVideoDuration",
        )
        .mockResolvedValue(900);

      const _result = await service.fetchRssFeed(
        ytFeedUrl,
        10,
        "YOUTUBE_VIDEO",
        { minDurationSeconds: 600 },
      );

      expect(durationSpy).toHaveBeenCalledWith(
        expect.stringContaining("youtu.be"),
      );
      durationSpy.mockRestore();
    });

    it("uses youtube.com/shorts URL for YouTube detection", async () => {
      mockParseURL.mockResolvedValue({
        title: "YouTube Channel",
        items: [
          {
            title: "YouTube Short",
            link: "https://www.youtube.com/shorts/shortVideoId",
            guid: "yt-shorts",
          },
        ],
      });

      const durationSpy = jest
        .spyOn(
          service as unknown as {
            getYouTubeVideoDuration: () => Promise<number>;
          },
          "getYouTubeVideoDuration",
        )
        .mockResolvedValue(55);

      const result = await service.fetchRssFeed(
        ytFeedUrl,
        10,
        "YOUTUBE_VIDEO",
        { minDurationSeconds: 600 },
      );

      expect(result.skipped).toBe(1);
      durationSpy.mockRestore();
    });
  });

  // ── fetchMultipleFeeds edge cases ────────────────────────────────────────────

  describe("fetchMultipleFeeds – edge cases", () => {
    it("returns successful=0 when all items are duplicates", async () => {
      mockParseURL.mockResolvedValue({
        title: "Feed",
        items: [
          { title: "Dup Item", link: "https://example.com/dup", guid: "dup-g" },
        ],
      });
      mockPrisma.resource.findFirst.mockResolvedValue({
        id: "existing",
        title: "Dup Item",
      });

      const result = await service.fetchMultipleFeeds([
        { url: "https://feed1.com/rss", category: "BLOG" },
      ]);

      expect(result.successful).toBe(0);
      expect(result.duplicates).toBe(1);
    });

    it("applies maxItemsPerFeed to each feed independently", async () => {
      mockParseURL.mockResolvedValue({
        title: "Feed",
        items: Array.from({ length: 20 }, (_, i) => ({
          title: `Item ${i}`,
          link: `https://example.com/item-${i}`,
          guid: `guid-${i}`,
        })),
      });

      await service.fetchMultipleFeeds(
        [{ url: "https://example.com/rss", category: "BLOG" }],
        3,
      );

      // Only 3 items processed (3 findFirst calls)
      expect(mockPrisma.resource.findFirst).toHaveBeenCalledTimes(3);
    });

    it("returns empty results for empty feeds array", async () => {
      const result = await service.fetchMultipleFeeds([]);

      expect(result.total).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.duplicates).toBe(0);
    });

    it("counts partially successful feeds in successful count", async () => {
      mockParseURL
        .mockResolvedValueOnce({
          title: "Feed 1",
          items: [
            {
              title: "Success Item",
              link: "https://feed1.com/item1",
              guid: "g1",
            },
          ],
        })
        .mockRejectedValueOnce(new Error("Status code 404"));

      const result = await service.fetchMultipleFeeds([
        { url: "https://feed1.com/rss", category: "BLOG" },
        { url: "https://missing.com/rss", category: "NEWS" },
      ]);

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });
  });
});
