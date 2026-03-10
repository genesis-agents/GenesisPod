import { Test, TestingModule } from "@nestjs/testing";
import { DataEnrichmentService } from "../data-enrichment.service";
import { ToolRegistry } from "@/modules/ai-engine/facade";
import { FigureExtractorService } from "../../report/figure-extractor.service";
import { FigureRelevanceService } from "../../report/figure-relevance.service";
import { DataSourceType } from "../../../types/data-source.types";
import type { DataSourceResult } from "../../../types/data-source.types";

const mockToolRegistry = {
  tryGet: jest.fn(),
};

const mockFigureExtractor = {
  extractFigures: jest.fn().mockReturnValue([]),
  validateAndUpgradeFigures: jest
    .fn()
    .mockImplementation((figs) => Promise.resolve(figs)),
};

const mockFigureRelevance = {
  filterRelevantFigures: jest
    .fn()
    .mockImplementation((figs) => Promise.resolve(figs)),
};

const makeResult = (url: string): DataSourceResult => ({
  sourceType: DataSourceType.WEB,
  title: "Test Article",
  url,
  snippet: "A short snippet about the topic.",
  domain: "example.com",
});

describe("DataEnrichmentService", () => {
  let service: DataEnrichmentService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataEnrichmentService,
        { provide: ToolRegistry, useValue: mockToolRegistry },
        { provide: FigureExtractorService, useValue: mockFigureExtractor },
        { provide: FigureRelevanceService, useValue: mockFigureRelevance },
      ],
    }).compile();

    service = module.get<DataEnrichmentService>(DataEnrichmentService);
  });

  // ============================================================
  // enrichSearchResults
  // ============================================================

  describe("enrichSearchResults", () => {
    it("should return empty array when given no results", async () => {
      const result = await service.enrichSearchResults([]);
      expect(result).toEqual([]);
    });

    it("should fall back to snippet when web-scraper tool is not registered", async () => {
      mockToolRegistry.tryGet.mockReturnValue(null);

      const results = [makeResult("https://example.com/article")];
      const enriched = await service.enrichSearchResults(results);

      expect(enriched).toHaveLength(1);
      expect(enriched[0].contentSource).toBe("snippet");
      expect(enriched[0].fullContent).toBe(results[0].snippet);
      expect(enriched[0].urlValid).toBe(false);
    });

    it("should fetch full content when scraper succeeds", async () => {
      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            success: true,
            content: "A".repeat(500),
          },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = [makeResult("https://example.com/article")];
      const enriched = await service.enrichSearchResults(results);

      expect(enriched[0].contentSource).toBe("fetched");
      expect(enriched[0].urlValid).toBe(true);
      expect(enriched[0].fullContent).toHaveLength(500);
    });

    it("should truncate content to maxContentLength", async () => {
      const longContent = "B".repeat(5000);
      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: { success: true, content: longContent },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = [makeResult("https://example.com/article")];
      const enriched = await service.enrichSearchResults(results, {
        maxContentLength: 1000,
      });

      expect(enriched[0].fullContent).toHaveLength(1000);
    });

    it("should mark remaining results (beyond topN) without enrichment", async () => {
      mockToolRegistry.tryGet.mockReturnValue(null);

      const results = [
        makeResult("https://example.com/1"),
        makeResult("https://example.com/2"),
        makeResult("https://example.com/3"),
      ];
      const enriched = await service.enrichSearchResults(results, { topN: 1 });

      // Only first is enriched (topN=1), rest are snippet
      expect(enriched).toHaveLength(3);
      expect(enriched[1].urlValid).toBe(true); // remaining assumed valid
      expect(enriched[1].contentSource).toBe("snippet");
    });

    it("should process sequentially when parallel=false", async () => {
      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: { success: true, content: "Content ".repeat(50) },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = [
        makeResult("https://example.com/1"),
        makeResult("https://example.com/2"),
      ];
      const enriched = await service.enrichSearchResults(results, {
        parallel: false,
        topN: 2,
      });

      expect(enriched).toHaveLength(2);
      expect(mockTool.execute).toHaveBeenCalledTimes(2);
    });

    it("should fall back to snippet when tool execution fails", async () => {
      const mockTool = {
        execute: jest.fn().mockRejectedValue(new Error("Network error")),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = [makeResult("https://example.com/article")];
      const enriched = await service.enrichSearchResults(results);

      expect(enriched[0].contentSource).toBe("snippet");
      expect(enriched[0].urlValid).toBe(false);
    });

    it("should fall back when tool returns unsuccessful result", async () => {
      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: false,
          error: { message: "Scrape failed" },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = [makeResult("https://example.com/article")];
      const enriched = await service.enrichSearchResults(results);

      expect(enriched[0].contentSource).toBe("snippet");
    });

    it("should mark content as invalid when it looks like an error page", async () => {
      const errorPageContent = "404 Page Not Found. " + "X".repeat(200);
      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: { success: true, content: errorPageContent },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = [makeResult("https://example.com/missing")];
      const enriched = await service.enrichSearchResults(results);

      expect(enriched[0].urlValid).toBe(false);
    });

    it("should extract figures when enableFigures=true (default)", async () => {
      const mockFigures = [
        { imageUrl: "https://example.com/img.png", caption: "Figure 1" },
      ];
      mockFigureExtractor.extractFigures.mockReturnValue(mockFigures);

      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            success: true,
            content: "Valid content ".repeat(50),
            html: "<img src='img.png'>",
          },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = [makeResult("https://example.com/article")];
      const enriched = await service.enrichSearchResults(results, {
        enableFigures: true,
      });

      expect(enriched[0].extractedFigures).toHaveLength(1);
    });

    it("should skip figure extraction when enableFigures=false", async () => {
      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: { success: true, content: "Valid content ".repeat(50) },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = [makeResult("https://example.com/article")];
      await service.enrichSearchResults(results, {
        enableFigures: false,
      });

      expect(mockFigureExtractor.extractFigures).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // getEnrichmentStats
  // ============================================================

  describe("getEnrichmentStats", () => {
    it("should calculate correct stats from enriched results", () => {
      const enrichedResults = [
        {
          contentSource: "fetched",
          fullContent: "A".repeat(100),
          urlValid: true,
        },
        {
          contentSource: "snippet",
          fullContent: "B".repeat(50),
          urlValid: false,
        },
        {
          contentSource: "fetched",
          fullContent: "C".repeat(200),
          urlValid: true,
        },
      ] as any;

      const stats = service.getEnrichmentStats(enrichedResults);

      expect(stats.total).toBe(3);
      expect(stats.fetched).toBe(2);
      expect(stats.snippetOnly).toBe(1);
      expect(stats.validUrls).toBe(2);
      expect(stats.invalidUrls).toBe(1);
      expect(stats.avgContentLength).toBe(Math.round(350 / 3));
    });

    it("should return zeroed stats for empty results", () => {
      const stats = service.getEnrichmentStats([]);

      expect(stats.total).toBe(0);
      expect(stats.avgContentLength).toBe(0);
    });
  });

  // ============================================================
  // validateUrls
  // ============================================================

  describe("validateUrls", () => {
    it("should return invalid result when tool not registered", async () => {
      mockToolRegistry.tryGet.mockReturnValue(null);

      const results = await service.validateUrls(["https://example.com"]);

      expect(results).toHaveLength(1);
      expect(results[0].isValid).toBe(false);
      expect(results[0].hasContent).toBe(false);
    });

    it("should return valid result when scraper succeeds with meaningful content", async () => {
      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: { success: true, content: "Valid content ".repeat(20) },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = await service.validateUrls(["https://example.com"]);

      expect(results[0].isValid).toBe(true);
      expect(results[0].statusCode).toBe(200);
    });

    it("should handle validation errors gracefully", async () => {
      const mockTool = {
        execute: jest.fn().mockRejectedValue(new Error("timeout")),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = await service.validateUrls(["https://example.com"]);

      expect(results[0].isValid).toBe(false);
      expect(results[0].errorReason).toContain("timeout");
    });
  });

  // ============================================================
  // filterValidResults
  // ============================================================

  describe("filterValidResults", () => {
    it("should filter out results with invalid URLs", async () => {
      const mockTool = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({
            success: true,
            data: { success: true, content: "Valid content ".repeat(20) },
          })
          .mockResolvedValueOnce({
            success: false,
            error: { message: "Not found" },
          }),
      };
      mockToolRegistry.tryGet.mockReturnValue(mockTool);

      const results = [
        makeResult("https://valid.com"),
        makeResult("https://invalid.com"),
      ];
      const filtered = await service.filterValidResults(results);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].url).toBe("https://valid.com");
    });
  });
});
