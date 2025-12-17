import { Test, TestingModule } from "@nestjs/testing";
import { UrlParserService, ParsedUrl } from "../url-parser.service";
import { ContentExtractionService } from "../content-extraction.service";

describe("UrlParserService", () => {
  let service: UrlParserService;
  let contentExtractionService: jest.Mocked<ContentExtractionService>;

  beforeEach(async () => {
    const mockContentExtractionService = {
      extractContent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlParserService,
        {
          provide: ContentExtractionService,
          useValue: mockContentExtractionService,
        },
      ],
    }).compile();

    service = module.get<UrlParserService>(UrlParserService);
    contentExtractionService = module.get(ContentExtractionService);
  });

  afterEach(() => {
    service.clearCache();
  });

  describe("detectUrls", () => {
    it("should detect simple HTTP URLs", () => {
      const text = "Check out https://example.com for more info";
      const result = service.detectUrls(text);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe("https://example.com");
      expect(result[0].startIndex).toBe(10);
      expect(result[0].type).toBe("WEBPAGE");
    });

    it("should detect multiple URLs in text", () => {
      const text = "Visit https://google.com and https://github.com/user/repo";
      const result = service.detectUrls(text);

      expect(result).toHaveLength(2);
      expect(result[0].url).toBe("https://google.com");
      expect(result[1].url).toBe("https://github.com/user/repo");
    });

    it("should detect URLs with query parameters", () => {
      const text = "Watch https://youtube.com/watch?v=abc123&list=PLxyz";
      const result = service.detectUrls(text);

      expect(result).toHaveLength(1);
      expect(result[0].url).toContain("v=abc123");
    });

    it("should return empty array for text without URLs", () => {
      const text = "This is plain text without any links";
      const result = service.detectUrls(text);

      expect(result).toHaveLength(0);
    });

    it("should block localhost URLs (SSRF protection)", () => {
      const text = "Internal: http://localhost:3000/api";
      const result = service.detectUrls(text);

      expect(result).toHaveLength(0);
    });

    it("should block internal IP addresses (SSRF protection)", () => {
      const testCases = [
        "http://127.0.0.1/admin",
        "http://10.0.0.1/internal",
        "http://192.168.1.1/config",
        "http://172.16.0.1/secret",
      ];

      for (const url of testCases) {
        const result = service.detectUrls(`Access: ${url}`);
        expect(result).toHaveLength(0);
      }
    });
  });

  describe("identifyUrlType", () => {
    it("should identify image URLs", () => {
      const testCases = [
        { url: "https://example.com/image.png", expected: "IMAGE" },
        { url: "https://example.com/photo.jpg", expected: "IMAGE" },
        { url: "https://example.com/graphic.svg", expected: "IMAGE" },
        { url: "https://example.com/image.webp?size=large", expected: "IMAGE" },
      ];

      for (const { url, expected } of testCases) {
        const result = service.identifyUrlType(url);
        expect(result.type).toBe(expected);
      }
    });

    it("should identify video URLs", () => {
      const testCases = [
        { url: "https://example.com/video.mp4", expected: "VIDEO" },
        { url: "https://example.com/movie.webm", expected: "VIDEO" },
      ];

      for (const { url, expected } of testCases) {
        const result = service.identifyUrlType(url);
        expect(result.type).toBe(expected);
      }
    });

    it("should identify document URLs", () => {
      const testCases = [
        { url: "https://example.com/doc.pdf", expected: "DOCUMENT" },
        { url: "https://example.com/file.docx", expected: "DOCUMENT" },
        { url: "https://example.com/data.xlsx", expected: "DOCUMENT" },
      ];

      for (const { url, expected } of testCases) {
        const result = service.identifyUrlType(url);
        expect(result.type).toBe(expected);
      }
    });

    it("should identify YouTube URLs", () => {
      const testCases = [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://youtube.com/watch?v=abc123",
      ];

      for (const url of testCases) {
        const result = service.identifyUrlType(url);
        expect(result.type).toBe("VIDEO");
        expect(result.platform).toBe("youtube");
      }
    });

    it("should identify Bilibili URLs", () => {
      const url = "https://www.bilibili.com/video/BV1xx411c7mD";
      const result = service.identifyUrlType(url);

      expect(result.type).toBe("VIDEO");
      expect(result.platform).toBe("bilibili");
    });

    it("should identify GitHub URLs", () => {
      const url = "https://github.com/facebook/react";
      const result = service.identifyUrlType(url);

      expect(result.type).toBe("CODE_REPO");
      expect(result.platform).toBe("github");
    });

    it("should identify Twitter/X URLs", () => {
      const testCases = [
        "https://twitter.com/user/status/123456",
        "https://x.com/user/status/789012",
      ];

      for (const url of testCases) {
        const result = service.identifyUrlType(url);
        expect(result.type).toBe("SOCIAL");
        expect(result.platform).toBe("twitter");
      }
    });

    it("should default to WEBPAGE for unknown URLs", () => {
      const url = "https://some-random-website.com/page";
      const result = service.identifyUrlType(url);

      expect(result.type).toBe("WEBPAGE");
      expect(result.platform).toBeUndefined();
    });
  });

  describe("parseUrl", () => {
    it("should parse and cache image URLs", async () => {
      const url = "https://example.com/image.png";

      // Mock fetch for HEAD request
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Map([
          ["content-type", "image/png"],
          ["content-length", "12345"],
        ]) as any,
      });

      const result = await service.parseUrl(url);

      expect(result.type).toBe("IMAGE");
      expect(result.status).toBe("success");
      expect(result.preview.image).toBe(url);
    });

    it("should use cache for repeated requests", async () => {
      const url = "https://example.com/cached.png";

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "image/png"]]) as any,
      });

      // First call
      await service.parseUrl(url);
      // Second call (should use cache)
      await service.parseUrl(url);

      // fetch should only be called once
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("should handle fetch errors gracefully", async () => {
      const url = "https://example.com/error.png";

      global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

      const result = await service.parseUrl(url);

      expect(result.status).toBe("failed");
      expect(result.error).toBe("Network error");
    });

    it("should parse webpage with content extraction", async () => {
      const url = "https://example.com/article";

      contentExtractionService.extractContent.mockResolvedValue({
        url,
        title: "Test Article",
        description: "Article description",
        content: "Full article content here",
        siteName: "Example Site",
        author: "John Doe",
        source: "jina",
        contentLength: 25,
      });

      const result = await service.parseUrl(url);

      expect(result.type).toBe("WEBPAGE");
      expect(result.status).toBe("success");
      expect(result.preview.title).toBe("Test Article");
      expect(result.preview.description).toBe("Article description");
      expect(result.preview.siteName).toBe("Example Site");
      expect(result.preview.author).toBe("John Doe");
      expect(result.extractedContent?.fullText).toBe(
        "Full article content here",
      );
    });

    it("should fall back to basic parsing when content extraction fails", async () => {
      const url = "https://example.com/fallback";

      contentExtractionService.extractContent.mockResolvedValue({
        url,
        content: "",
        contentLength: 0,
        source: "fallback",
        error: "Extraction failed",
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "text/html"]]) as any,
        text: jest.fn().mockResolvedValue(`
          <html>
            <head>
              <title>Fallback Title</title>
              <meta property="og:description" content="Fallback description">
            </head>
            <body>Content</body>
          </html>
        `),
      });

      const result = await service.parseUrl(url);

      expect(result.status).toBe("success");
      expect(result.preview.title).toBe("Fallback Title");
      expect(result.preview.description).toBe("Fallback description");
    });
  });

  describe("parseUrls", () => {
    it("should parse multiple URLs in parallel batches", async () => {
      const urls = [
        "https://example.com/1.png",
        "https://example.com/2.png",
        "https://example.com/3.png",
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "image/png"]]) as any,
      });

      const results = await service.parseUrls(urls);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.status === "success")).toBe(true);
    });

    it("should deduplicate URLs", async () => {
      const urls = [
        "https://example.com/same.png",
        "https://example.com/same.png",
        "https://example.com/same.png",
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "image/png"]]) as any,
      });

      const results = await service.parseUrls(urls);

      // Should only return 1 result for duplicates
      expect(results).toHaveLength(1);
    });
  });

  describe("detectAndParseUrls", () => {
    it("should detect and parse all URLs in text", async () => {
      const text =
        "Check https://example.com/image.png and https://github.com/user/repo";

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "image/png"]]) as any,
      });

      const { detectedUrls, parsedUrls } =
        await service.detectAndParseUrls(text);

      expect(detectedUrls).toHaveLength(2);
      expect(parsedUrls).toHaveLength(2);
    });

    it("should return empty arrays for text without URLs", async () => {
      const text = "No URLs here";

      const { detectedUrls, parsedUrls } =
        await service.detectAndParseUrls(text);

      expect(detectedUrls).toHaveLength(0);
      expect(parsedUrls).toHaveLength(0);
    });
  });

  describe("generateAiContextFromParsedUrls", () => {
    it("should generate context for successful parses", () => {
      const parsedUrls: ParsedUrl[] = [
        {
          type: "WEBPAGE",
          originalText: "https://example.com",
          url: "https://example.com",
          preview: {
            title: "Example Site",
            description: "A sample website",
            siteName: "Example",
            author: "Admin",
          },
          extractedContent: {
            summary: "This is the content summary",
          },
          status: "success",
        },
      ];

      const context = service.generateAiContextFromParsedUrls(parsedUrls);

      expect(context).toContain("链接内容解析");
      expect(context).toContain("[网页]");
      expect(context).toContain("Example Site");
      expect(context).toContain("A sample website");
      expect(context).toContain("This is the content summary");
    });

    it("should include GitHub metadata", () => {
      const parsedUrls: ParsedUrl[] = [
        {
          type: "CODE_REPO",
          originalText: "https://github.com/user/repo",
          url: "https://github.com/user/repo",
          platform: "github",
          preview: {
            title: "user/repo",
            siteName: "GitHub",
          },
          extractedContent: {
            metadata: {
              stars: 1000,
              forks: 200,
              language: "TypeScript",
            },
          },
          status: "success",
        },
      ];

      const context = service.generateAiContextFromParsedUrls(parsedUrls);

      expect(context).toContain("[代码仓库]");
      expect(context).toContain("Stars: 1000");
      expect(context).toContain("Forks: 200");
      expect(context).toContain("TypeScript");
    });

    it("should filter out failed parses", () => {
      const parsedUrls: ParsedUrl[] = [
        {
          type: "WEBPAGE",
          originalText: "https://failed.com",
          url: "https://failed.com",
          preview: {},
          status: "failed",
          error: "Network error",
        },
      ];

      const context = service.generateAiContextFromParsedUrls(parsedUrls);

      expect(context).toBe("");
    });

    it("should return empty string for empty array", () => {
      const context = service.generateAiContextFromParsedUrls([]);

      expect(context).toBe("");
    });
  });

  describe("clearCache", () => {
    it("should clear all cached URLs", async () => {
      const url = "https://example.com/cache-test.png";

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "image/png"]]) as any,
      });

      // Cache the URL
      await service.parseUrl(url);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Clear cache
      service.clearCache();

      // Should fetch again
      await service.parseUrl(url);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
