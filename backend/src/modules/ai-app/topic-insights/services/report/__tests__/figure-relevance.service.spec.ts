import { Test, TestingModule } from "@nestjs/testing";
import { FigureRelevanceService } from "../figure-relevance.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import type { ExtractedFigure } from "../../../types/research.types";

const makeFigure = (
  url: string,
  type: ExtractedFigure["type"] = "chart",
): ExtractedFigure => ({
  imageUrl: url,
  caption: `Caption for ${url}`,
  type,
  alt: `Alt for ${url}`,
});

const mockChatFacade = {
  chat: jest.fn(),
  chatStructured: jest.fn(),
  getDefaultModelByType: jest
    .fn()
    .mockResolvedValue({ modelId: "test-vision-model" }),
};

describe("FigureRelevanceService", () => {
  let service: FigureRelevanceService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FigureRelevanceService,
        { provide: ChatFacade, useValue: mockChatFacade },
      ],
    }).compile();

    service = module.get<FigureRelevanceService>(FigureRelevanceService);
  });

  // ============================================================
  // filterRelevantFigures — basic
  // ============================================================

  describe("filterRelevantFigures", () => {
    it("should return empty array when given empty figures", async () => {
      const result = await service.filterRelevantFigures([], "Test Topic");
      expect(result).toEqual([]);
      expect(mockChatFacade.chatStructured).not.toHaveBeenCalled();
    });

    it("should return accepted figures from LLM response", async () => {
      const figures = [
        makeFigure("https://example.com/chart1.png"),
        makeFigure("https://example.com/photo.jpg", "photo"),
        makeFigure("https://example.com/chart2.png"),
      ];

      mockChatFacade.chatStructured.mockResolvedValue({
        data: {
          results: [
            { index: 0, accepted: true },
            { index: 1, accepted: false, reason: "decorative photo" },
            { index: 2, accepted: true },
          ],
        },
        rawContent: "{}",
        model: "test",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.filterRelevantFigures(
        figures,
        "AI Research",
      );

      expect(result).toHaveLength(2);
      expect(result[0].imageUrl).toBe("https://example.com/chart1.png");
      expect(result[1].imageUrl).toBe("https://example.com/chart2.png");
    });

    it("should fall back to type-based filter when Vision call fails", async () => {
      const figures = [
        makeFigure("https://example.com/chart.png", "chart"),
        makeFigure("https://example.com/photo.jpg", "photo"),
        makeFigure("https://example.com/diagram.svg", "diagram"),
      ];

      mockChatFacade.chatStructured.mockRejectedValue(new Error("API timeout"));

      const result = await service.filterRelevantFigures(
        figures,
        "AI Research",
      );

      // Fallback: keeps everything except "photo" type
      expect(result).toHaveLength(2);
      expect(result.every((f) => f.type !== "photo")).toBe(true);
    });

    // ============================================================
    // Edge cases
    // ============================================================

    it("should deduplicate when LLM returns duplicate indices", async () => {
      const figures = [
        makeFigure("https://example.com/1.png"),
        makeFigure("https://example.com/2.png"),
      ];

      mockChatFacade.chatStructured.mockResolvedValue({
        data: {
          results: [
            { index: 0, accepted: true },
            { index: 0, accepted: true }, // duplicate
            { index: 1, accepted: false, reason: "blurry" },
          ],
        },
        rawContent: "{}",
        model: "test",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.filterRelevantFigures(figures, "Test Topic");

      expect(result).toHaveLength(1);
      expect(result[0].imageUrl).toBe("https://example.com/1.png");
    });

    it("should warn and treat missing indices as rejected", async () => {
      const figures = [
        makeFigure("https://example.com/1.png"),
        makeFigure("https://example.com/2.png"),
        makeFigure("https://example.com/3.png"),
      ];

      mockChatFacade.chatStructured.mockResolvedValue({
        data: {
          results: [
            { index: 0, accepted: true },
            // index 1 missing
            { index: 2, accepted: false, reason: "irrelevant" },
          ],
        },
        rawContent: "{}",
        model: "test",
        tokensUsed: 100,
        retriedParse: false,
      });

      const warnSpy = jest.spyOn(service["logger"], "warn");
      const result = await service.filterRelevantFigures(figures, "Test Topic");

      // Only index 0 accepted, index 1 missing (treated as rejected), index 2 rejected
      expect(result).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("omitted 1 indices"),
      );
    });

    it("should skip out-of-bounds indices from LLM response", async () => {
      const figures = [makeFigure("https://example.com/1.png")];

      mockChatFacade.chatStructured.mockResolvedValue({
        data: {
          results: [
            { index: 0, accepted: true },
            { index: 99, accepted: true }, // out of bounds
          ],
        },
        rawContent: "{}",
        model: "test",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.filterRelevantFigures(figures, "Test Topic");

      expect(result).toHaveLength(1);
    });

    it("should limit candidates to MAX_FIGURES_PER_BATCH", async () => {
      // Create 12 figures (exceeds MAX_FIGURES_PER_BATCH = 8)
      const figures = Array.from({ length: 12 }, (_, i) =>
        makeFigure(`https://example.com/${i}.png`),
      );

      mockChatFacade.chatStructured.mockResolvedValue({
        data: {
          results: Array.from({ length: 8 }, (_, i) => ({
            index: i,
            accepted: true,
          })),
        },
        rawContent: "{}",
        model: "test",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.filterRelevantFigures(figures, "Test Topic");

      // Only first 8 are evaluated, rest are discarded
      expect(result).toHaveLength(8);
      // chatStructured should receive at most 8 images in contentParts
      const callArgs = mockChatFacade.chatStructured.mock.calls[0][0];
      const imageCount = callArgs.messages[0].contentParts.filter(
        (p: { type: string }) => p.type === "image_url",
      ).length;
      expect(imageCount).toBe(8);
    });

    it("should reject all when chatStructured returns invalid structure", async () => {
      const figures = [
        makeFigure("https://example.com/1.png"),
        makeFigure("https://example.com/2.png"),
      ];

      // chatStructured returns data without results array
      mockChatFacade.chatStructured.mockResolvedValue({
        data: { something: "else" },
        rawContent: "{}",
        model: "test",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.filterRelevantFigures(figures, "Test Topic");

      // Invalid structure is caught by evaluateBatch's inner catch → all-rejected
      // (宁缺毋滥: malformed response = reject all)
      expect(result).toHaveLength(0);
    });
  });
});
