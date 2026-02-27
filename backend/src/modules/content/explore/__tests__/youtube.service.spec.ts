// Mock the entire AdminService module before any imports to avoid
// transitive dependency on @nestjs/cache-manager (not installed in test env)
jest.mock("../../../ai-infra/admin/admin.service");

import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { YoutubeService, TranscriptSegment } from "../youtube.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AdminService } from "../../../ai-infra/admin/admin.service";

// Mock external fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock dynamic imports for youtube-transcript
jest.mock(
  "youtube-transcript",
  () => ({ YoutubeTranscript: { fetchTranscript: jest.fn() } }),
  { virtual: true },
);

const mockPrismaService = {
  youTubeTranscriptCache: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
};

const mockAdminService = {
  getYoutubeApiKey: jest.fn(),
};

describe("YoutubeService", () => {
  let service: YoutubeService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AdminService, useValue: mockAdminService },
      ],
    }).compile();

    service = module.get<YoutubeService>(YoutubeService);

    // Default: no cache hit
    mockPrismaService.youTubeTranscriptCache.findUnique.mockResolvedValue(null);
    // Default: no Supadata key
    mockAdminService.getYoutubeApiKey.mockResolvedValue(null);
  });

  // ─── extractVideoId ──────────────────────────────────────────────

  describe("extractVideoId", () => {
    it("extracts ID from standard watch URL", () => {
      const id = service.extractVideoId(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      );
      expect(id).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from youtu.be short URL", () => {
      const id = service.extractVideoId("https://youtu.be/dQw4w9WgXcQ");
      expect(id).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from embed URL", () => {
      const id = service.extractVideoId(
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
      );
      expect(id).toBe("dQw4w9WgXcQ");
    });

    it("extracts bare 11-char video ID", () => {
      const id = service.extractVideoId("dQw4w9WgXcQ");
      expect(id).toBe("dQw4w9WgXcQ");
    });

    it("returns null for invalid URL", () => {
      const id = service.extractVideoId("https://not-youtube.com/video/abc");
      expect(id).toBeNull();
    });

    it("handles watch URL with extra query params", () => {
      const id = service.extractVideoId(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42",
      );
      expect(id).toBe("dQw4w9WgXcQ");
    });
  });

  // ─── getTranscript – cache hit ───────────────────────────────────

  describe("getTranscript – cache hit", () => {
    it("returns cached transcript when cache is valid", async () => {
      const mockSegments: TranscriptSegment[] = [
        { text: "Hello", start: 0, duration: 2 },
      ];
      const futureExpiry = new Date(Date.now() + 1_000_000);

      mockPrismaService.youTubeTranscriptCache.findUnique.mockResolvedValue({
        videoId: "abc123",
        title: "Test Video",
        transcript: mockSegments,
        translatedTranscript: null,
        targetLanguage: null,
        expiresAt: futureExpiry,
      });

      const result = await service.getTranscript("abc123", "en");

      expect(result.videoId).toBe("abc123");
      expect(result.title).toBe("Test Video");
      expect(result.transcript).toEqual(mockSegments);
      expect(result.hasTranslation).toBe(false);
    });

    it("returns translated transcript when available in cache", async () => {
      const original: TranscriptSegment[] = [
        { text: "Hello", start: 0, duration: 2 },
      ];
      const translated: TranscriptSegment[] = [
        { text: "你好", start: 0, duration: 2 },
      ];
      const futureExpiry = new Date(Date.now() + 1_000_000);

      mockPrismaService.youTubeTranscriptCache.findUnique.mockResolvedValue({
        videoId: "abc123",
        title: "Test Video",
        transcript: original,
        translatedTranscript: translated,
        targetLanguage: "zh-CN",
        expiresAt: futureExpiry,
      });

      const result = await service.getTranscript("abc123", "en");

      expect(result.hasTranslation).toBe(true);
      expect(result.transcript).toEqual(translated);
      expect(result.targetLanguage).toBe("zh-CN");
    });

    it("ignores expired cache entry and attempts fresh fetch", async () => {
      mockPrismaService.youTubeTranscriptCache.findUnique.mockResolvedValue({
        videoId: "abc123",
        title: "Old Title",
        transcript: [],
        translatedTranscript: null,
        targetLanguage: null,
        expiresAt: new Date(Date.now() - 1000), // expired
      });

      // All fetch attempts should fail so we can verify the cache was skipped
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue(""),
      });

      await expect(service.getTranscript("abc123", "en")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getTranscript – timedtext API ───────────────────────────────

  describe("getTranscript – timedtext API (free strategy)", () => {
    it("returns transcript when timedtext API succeeds", async () => {
      const captionXml = `<?xml version="1.0" encoding="utf-8"?>
<transcript>
  <text start="0.5" dur="2.3">First segment</text>
  <text start="3.0" dur="1.8">Second segment</text>
</transcript>`;

      const captionTracks = JSON.stringify([
        {
          languageCode: "en",
          baseUrl: "https://timedtext.example.com/captions",
        },
      ]);
      const videoPageHtml = `<html><script>"captionTracks": ${captionTracks}</script></html>`;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(videoPageHtml),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(captionXml),
        })
        // fetchVideoTitle via oEmbed
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ title: "Test Video Title" }),
        });

      mockPrismaService.youTubeTranscriptCache.upsert.mockResolvedValue({});

      const result = await service.getTranscript("abc123", "en");

      expect(result.transcript.length).toBeGreaterThan(0);
      expect(result.transcript[0].text).toBe("First segment");
    });
  });

  // ─── getTranscript – all free methods fail → Supadata ────────────

  describe("getTranscript – Supadata fallback", () => {
    it("uses Supadata when all free methods fail and key is configured", async () => {
      mockAdminService.getYoutubeApiKey.mockResolvedValue("supadata-key-123");

      // The service tries timedtext (video page fetch), fallback (up to 13 language attempts),
      // then npm (dynamic import). We make all fail with non-ok responses.
      // Use a default mock that returns { ok: false } for all free-method fetches,
      // then override specific calls for Supadata.
      const supadataResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          content: [
            { text: "Segment one", offset: 1000, duration: 2000 },
            { text: "Segment two", offset: 3000, duration: 1500 },
          ],
          lang: "en",
          availableLangs: ["en"],
        }),
      };
      const oEmbedResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ title: "Video via Supadata" }),
      };

      let _callCount = 0;
      mockFetch.mockImplementation((url: string) => {
        _callCount++;
        // Supadata API URL
        if (typeof url === "string" && url.includes("supadata.ai")) {
          return Promise.resolve(supadataResponse);
        }
        // oEmbed for title
        if (typeof url === "string" && url.includes("oembed")) {
          return Promise.resolve(oEmbedResponse);
        }
        // All other free-method calls fail
        return Promise.resolve({
          ok: false,
          status: 503,
          text: jest.fn().mockResolvedValue(""),
        });
      });

      mockPrismaService.youTubeTranscriptCache.upsert.mockResolvedValue({});

      const result = await service.getTranscript("xyz789", "en");

      expect(result.transcript).toHaveLength(2);
      expect(result.transcript[0].text).toBe("Segment one");
      expect(result.transcript[0].start).toBe(1); // 1000ms → 1s
    });

    it("throws NotFoundException when all methods fail and no Supadata key", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: jest.fn().mockResolvedValue(""),
      });

      await expect(service.getTranscript("failid", "en")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException when Supadata also fails", async () => {
      mockAdminService.getYoutubeApiKey.mockResolvedValue("key");
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue(""),
      });

      await expect(service.getTranscript("failid", "en")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── saveTranslation ─────────────────────────────────────────────

  describe("saveTranslation", () => {
    it("saves translation when original transcript exists in cache", async () => {
      mockPrismaService.youTubeTranscriptCache.findUnique.mockResolvedValue({
        videoId: "abc123",
        transcript: [{ text: "Hello", start: 0, duration: 2 }],
      });
      mockPrismaService.youTubeTranscriptCache.update.mockResolvedValue({});

      const translated: TranscriptSegment[] = [
        { text: "你好", start: 0, duration: 2 },
      ];
      await expect(
        service.saveTranslation("abc123", translated, "zh-CN"),
      ).resolves.toBeUndefined();

      expect(
        mockPrismaService.youTubeTranscriptCache.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { videoId: "abc123" },
          data: expect.objectContaining({ targetLanguage: "zh-CN" }),
        }),
      );
    });

    it("throws when no original transcript is cached", async () => {
      mockPrismaService.youTubeTranscriptCache.findUnique.mockResolvedValue(
        null,
      );

      await expect(
        service.saveTranslation("nope", [], "zh-CN"),
      ).rejects.toThrow("Original transcript must be cached");
    });

    it("re-throws Prisma errors during translation save", async () => {
      mockPrismaService.youTubeTranscriptCache.findUnique.mockResolvedValue({
        videoId: "abc123",
      });
      mockPrismaService.youTubeTranscriptCache.update.mockRejectedValue(
        new Error("DB write error"),
      );

      await expect(
        service.saveTranslation("abc123", [], "zh-CN"),
      ).rejects.toThrow("DB write error");
    });
  });

  // ─── getTranslationStatus ─────────────────────────────────────────

  describe("getTranslationStatus", () => {
    it("returns hasTranslation=true when translation exists", async () => {
      mockPrismaService.youTubeTranscriptCache.findUnique.mockResolvedValue({
        translatedTranscript: [{ text: "你好", start: 0, duration: 2 }],
        targetLanguage: "zh-CN",
      });

      const result = await service.getTranslationStatus("abc123");
      expect(result.hasTranslation).toBe(true);
      expect(result.targetLanguage).toBe("zh-CN");
    });

    it("returns hasTranslation=false when no translation", async () => {
      mockPrismaService.youTubeTranscriptCache.findUnique.mockResolvedValue({
        translatedTranscript: null,
        targetLanguage: null,
      });

      const result = await service.getTranslationStatus("abc123");
      expect(result.hasTranslation).toBe(false);
      expect(result.targetLanguage).toBeUndefined();
    });

    it("returns hasTranslation=false when cache miss", async () => {
      mockPrismaService.youTubeTranscriptCache.findUnique.mockResolvedValue(
        null,
      );

      const result = await service.getTranslationStatus("missing");
      expect(result.hasTranslation).toBe(false);
    });

    it("returns hasTranslation=false when DB call throws", async () => {
      mockPrismaService.youTubeTranscriptCache.findUnique.mockRejectedValue(
        new Error("DB error"),
      );

      const result = await service.getTranslationStatus("abc123");
      expect(result.hasTranslation).toBe(false);
    });
  });

  // ─── cacheTranscript ─────────────────────────────────────────────

  describe("cacheTranscript", () => {
    it("upserts transcript in cache", async () => {
      mockPrismaService.youTubeTranscriptCache.upsert.mockResolvedValue({});

      const segments: TranscriptSegment[] = [
        { text: "Hi", start: 0, duration: 1 },
      ];
      await service.cacheTranscript("vid1", "Title", segments, "en");

      expect(
        mockPrismaService.youTubeTranscriptCache.upsert,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { videoId: "vid1" },
          create: expect.objectContaining({ videoId: "vid1", title: "Title" }),
          update: expect.objectContaining({ title: "Title" }),
        }),
      );
    });
  });

  // ─── XML parsing (indirectly via getTranscript) ───────────────────

  describe("XML parsing via getTranscript", () => {
    it("parses standard YouTube XML captions format", async () => {
      const xml = `<?xml version="1.0"?>
<transcript>
  <text start="1.23" dur="2.50">Hello &amp; world</text>
  <text start="4.00" dur="1.00">Goodbye friend</text>
</transcript>`;

      const captionTracks = JSON.stringify([
        { languageCode: "en", baseUrl: "https://captions.example.com/en" },
      ]);
      const videoPageHtml = `<html><script>"captionTracks": ${captionTracks}</script></html>`;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(videoPageHtml),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(xml),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ title: "My Video" }),
        });

      mockPrismaService.youTubeTranscriptCache.upsert.mockResolvedValue({});

      const result = await service.getTranscript("vid1", "en");

      // &amp; is decoded to & in HTML entity decoding
      expect(result.transcript[0].text).toBe("Hello & world");
      expect(result.transcript[1].text).toBe("Goodbye friend");
      expect(result.transcript[0].start).toBeCloseTo(1.23);
      expect(result.transcript[0].duration).toBeCloseTo(2.5);
    });

    it("skips HTML/error page content in XML parser", async () => {
      const htmlError =
        "<!DOCTYPE html><html><body>An error occurred</body></html>";

      const captionTracks = JSON.stringify([
        { languageCode: "en", baseUrl: "https://captions.example.com/en" },
      ]);
      const videoPageHtml = `<html><script>"captionTracks": ${captionTracks}</script></html>`;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(videoPageHtml),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(htmlError),
        })
        // fallback attempts also fail
        .mockResolvedValue({ ok: false, status: 404 });

      await expect(service.getTranscript("vid1", "en")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── Supadata – 202 async job polling ─────────────────────────────

  describe("Supadata async job handling", () => {
    it("polls until job completes and returns transcript", async () => {
      mockAdminService.getYoutubeApiKey.mockResolvedValue("test-key");

      // Spy on the private pollSupadataJob to return result immediately
      // instead of waiting for real setTimeout delays
      const pollSpy = jest
        .spyOn(
          service as unknown as {
            pollSupadataJob: (
              jobId: string,
              videoId: string,
              apiKey: string,
            ) => Promise<unknown>;
          },
          "pollSupadataJob",
        )
        .mockResolvedValue({
          videoId: "jobvid",
          title: "Polled Video",
          transcript: [{ text: "Done", start: 0.5, duration: 1 }],
        });

      mockFetch.mockImplementation((url: string) => {
        // Supadata transcript endpoint returns 202 (async job)
        if (typeof url === "string" && url.includes("supadata.ai")) {
          return Promise.resolve({
            ok: true,
            status: 202,
            json: jest.fn().mockResolvedValue({ jobId: "job-abc" }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 503,
          text: jest.fn().mockResolvedValue(""),
        });
      });

      mockPrismaService.youTubeTranscriptCache.upsert.mockResolvedValue({});

      const result = await service.getTranscript("jobvid", "en");

      expect(result.transcript[0].text).toBe("Done");
      expect(pollSpy).toHaveBeenCalledWith("job-abc", "jobvid", "test-key");
      pollSpy.mockRestore();
    }, 10000);
  });

  // ─── onModuleInit ─────────────────────────────────────────────────

  describe("onModuleInit", () => {
    it("completes without throwing when initialization succeeds", async () => {
      mockAdminService.getYoutubeApiKey.mockResolvedValue(null);

      // Mock ensureClient – we spy on the private method via any cast
      const ensureClientSpy = jest
        .spyOn(
          service as unknown as { ensureClient: () => Promise<void> },
          "ensureClient",
        )
        .mockResolvedValue(undefined);

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      ensureClientSpy.mockRestore();
    });

    it("logs error but does not throw when initialization fails", async () => {
      const ensureClientSpy = jest
        .spyOn(
          service as unknown as { ensureClient: () => Promise<void> },
          "ensureClient",
        )
        .mockRejectedValue(new Error("import failure"));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      ensureClientSpy.mockRestore();
    });
  });
});
