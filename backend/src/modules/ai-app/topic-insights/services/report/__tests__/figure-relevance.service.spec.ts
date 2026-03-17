import { Test, TestingModule } from "@nestjs/testing";
import { FigureRelevanceService } from "../figure-relevance.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import type { ExtractedFigure } from "../../../types/research.types";

/** Figure with caption + alt (default for most tests) */
const makeFigure = (
  url: string,
  type: ExtractedFigure["type"] = "chart",
): ExtractedFigure => ({
  imageUrl: url,
  caption: `Caption for ${url}`,
  type,
  alt: `Alt for ${url}`,
});

/** Figure with NO caption/alt — photos will be rejected in Vision fallback */
const makeBareFigure = (
  url: string,
  type: ExtractedFigure["type"] = "photo",
): ExtractedFigure => ({
  imageUrl: url,
  caption: "",
  type,
  alt: "",
});

/** chatStructured response: single-figure accepted */
const accepted = () => ({
  data: { accepted: true },
  rawContent: "{}",
  model: "test",
  tokensUsed: 50,
  retriedParse: false,
});

/** chatStructured response: single-figure rejected */
const rejected = (reason = "decorative") => ({
  data: { accepted: false, reason },
  rawContent: "{}",
  model: "test",
  tokensUsed: 50,
  retriedParse: false,
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

    it("should accept/reject figures per individual LLM call (v13)", async () => {
      const figures = [
        makeFigure("https://example.com/chart1.png"),
        makeBareFigure("https://example.com/photo.jpg", "photo"),
        makeFigure("https://example.com/chart2.png"),
      ];

      // One chatStructured call per figure (3 calls total)
      mockChatFacade.chatStructured
        .mockResolvedValueOnce(accepted())
        .mockResolvedValueOnce(rejected("decorative photo"))
        .mockResolvedValueOnce(accepted());

      const result = await service.filterRelevantFigures(
        figures,
        "AI Research",
      );

      expect(result).toHaveLength(2);
      expect(result[0].imageUrl).toBe("https://example.com/chart1.png");
      expect(result[1].imageUrl).toBe("https://example.com/chart2.png");
    });

    it("should call chatStructured once per vision-compatible figure (v13)", async () => {
      const figures = [
        makeFigure("https://example.com/chart1.png"),
        makeFigure("https://example.com/chart2.png"),
        makeFigure("https://example.com/chart3.png"),
      ];

      mockChatFacade.chatStructured.mockResolvedValue(accepted());

      await service.filterRelevantFigures(figures, "Test Topic");

      // Each figure gets its own Vision call
      expect(mockChatFacade.chatStructured).toHaveBeenCalledTimes(3);
      // Each call contains exactly 1 image_url content part
      for (const call of mockChatFacade.chatStructured.mock.calls) {
        const args = call[0];
        const imageCount = args.messages[0].contentParts.filter(
          (p: { type: string }) => p.type === "image_url",
        ).length;
        expect(imageCount).toBe(1);
      }
    });

    it("should fall back to type-based filter when Vision call fails (v13)", async () => {
      const figures = [
        makeFigure("https://example.com/chart.png", "chart"),
        makeBareFigure("https://example.com/photo.jpg", "photo"), // no caption → rejected in fallback
        makeFigure("https://example.com/diagram.png", "diagram"),
      ];

      mockChatFacade.chatStructured.mockRejectedValue(new Error("API timeout"));

      const result = await service.filterRelevantFigures(
        figures,
        "AI Research",
      );

      // ★ v13: chart/diagram always kept in fallback, photo without caption rejected
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.type)).toEqual(["chart", "diagram"]);
    });

    it("should keep informational types and reject uncaptioned photos on parse error (v13)", async () => {
      const figures = [
        makeFigure("https://example.com/1.png", "chart"),
        makeBareFigure("https://example.com/2.jpg", "photo"),
        makeFigure("https://example.com/3.png", "table"),
      ];

      mockChatFacade.chatStructured.mockRejectedValue(
        new Error("Structured output parse failed after 3 attempts"),
      );

      const result = await service.filterRelevantFigures(figures, "Test Topic");

      // chart + table kept (informational), photo without caption rejected
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.type)).toEqual(["chart", "table"]);
    });

    it("should keep photos with caption/alt in Vision fallback (v13)", async () => {
      const figures = [
        makeFigure("https://example.com/photo-with-caption.jpg", "photo"), // has caption → kept
        makeBareFigure("https://example.com/bare-photo.jpg", "photo"), // no caption → rejected
      ];

      mockChatFacade.chatStructured.mockRejectedValue(
        new Error("Vision timeout"),
      );

      const result = await service.filterRelevantFigures(figures, "Tech Topic");

      // Captioned photo kept, bare photo rejected
      expect(result).toHaveLength(1);
      expect(result[0].imageUrl).toContain("photo-with-caption");
    });

    it("should reject photo-type figures when no MULTIMODAL model is configured (v13)", async () => {
      mockChatFacade.getDefaultModelByType.mockResolvedValueOnce(null);

      const figures = [
        makeFigure("https://example.com/chart.png", "chart"),
        makeBareFigure("https://example.com/photo.jpg", "photo"),
        makeFigure("https://example.com/table.png", "table"),
        makeFigure("https://example.com/diagram.png", "diagram"),
        makeFigure("https://example.com/photo2.jpg", "photo"), // has caption → kept in v13
      ];

      const result = await service.filterRelevantFigures(figures, "Test Topic");

      // ★ v13: No Vision model → chart/table/diagram kept, bare photos rejected, captioned photos kept
      expect(result).toHaveLength(4);
      expect(mockChatFacade.chatStructured).not.toHaveBeenCalled();
    });

    it("should skip Vision for SVG/BMP/ICO and auto-decide by type", async () => {
      const figures = [
        makeFigure("https://example.com/diagram.svg", "diagram"), // SVG → no Vision → diagram=kept
        makeFigure("https://example.com/icon.ico", "photo"), // ICO → no Vision → photo type → rejected (only INFORMATIONAL_FIGURE_TYPES kept)
        makeFigure("https://example.com/chart.png", "chart"), // PNG → Vision call
      ];

      mockChatFacade.chatStructured.mockResolvedValue(accepted());

      const result = await service.filterRelevantFigures(figures, "Test Topic");

      // Only 1 Vision call (for chart.png); SVG and ICO bypass Vision
      expect(mockChatFacade.chatStructured).toHaveBeenCalledTimes(1);
      // diagram.svg → auto-kept (informational), icon.ico photo → rejected (not informational type), chart.png → accepted
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.type)).toEqual(["diagram", "chart"]);
    });

    it("should skip Vision for blacklisted CDN domains and auto-decide by type", async () => {
      const figures = [
        makeFigure("https://fbcdn.net/v/chart.jpg", "chart"), // Facebook CDN → blacklisted → informational → kept
        makeBareFigure("https://media.licdn.com/photo.jpg", "photo"), // LinkedIn CDN → blacklisted → photo no caption → rejected
        makeFigure("https://example.com/chart.png", "chart"), // normal → Vision call
      ];

      mockChatFacade.chatStructured.mockResolvedValue(accepted());

      const result = await service.filterRelevantFigures(figures, "Test Topic");

      // Only 1 Vision call (for example.com chart); CDN blacklisted URLs skip Vision
      expect(mockChatFacade.chatStructured).toHaveBeenCalledTimes(1);
      // fbcdn chart → kept (informational type), linkedin photo → rejected (no caption)
      expect(result).toHaveLength(2);
    });
  });

  // ============================================================
  // 业务场景仿真 — 模拟真实报告的 Vision 过滤
  //
  // 场景来自用户反馈: "报告里图片和内容没有关系"
  // 根因: 装饰性新闻头图、stock photo 通过了 Vision 审查
  // ============================================================

  describe("业务场景: 模拟真实话题的图片过滤", () => {
    it("美国 AI 政策话题: 3 chart + 2 photo → Vision 拒绝装饰性 photo，保留 chart", async () => {
      // 模拟真实证据中抽取的图片：白宫横幅、新闻配图 vs Fed 数据图、Pew 调查图
      const figures = [
        makeFigure("https://fred.stlouisfed.org/graph/fredgraph.png", "chart"),
        makeBareFigure("https://www.whitehouse.gov/Wire-Banner.jpg", "photo"),
        makeFigure("https://pewresearch.org/survey-chart.png", "chart"),
        makeBareFigure(
          "https://cdn.cfr.org/champagne-celebration.jpg",
          "photo",
        ),
        makeFigure("https://example.com/architecture.svg", "diagram"), // SVG → auto-kept
      ];

      // architecture.svg is SVG → no Vision call (auto-kept as diagram)
      // 4 Vision calls for the remaining figures
      mockChatFacade.chatStructured
        .mockResolvedValueOnce(accepted()) // Fed 利率图 ✅
        .mockResolvedValueOnce(rejected("文章头图/封面图，装饰性横幅")) // photo ❌
        .mockResolvedValueOnce(accepted()) // Pew 调查图 ✅
        .mockResolvedValueOnce(rejected("新闻缩略图，庆祝场景照")); // photo ❌

      const result = await service.filterRelevantFigures(
        figures,
        "美国 AI 政策与监管趋势",
      );

      // 用户期望：只有数据图表和架构图进入报告，新闻配图被过滤
      expect(result).toHaveLength(3);
      expect(result.map((f) => f.type)).toEqual(["chart", "chart", "diagram"]);
      expect(result.map((f) => f.imageUrl)).toEqual([
        "https://fred.stlouisfed.org/graph/fredgraph.png",
        "https://pewresearch.org/survey-chart.png",
        "https://example.com/architecture.svg",
      ]);
    });

    it("Vision API 超时: 应保留 chart/diagram 但丢弃无标题 photo（安全降级）", async () => {
      // 模拟: 5 张图片中混合了有价值的图表和无标题装饰性照片
      const figures = [
        makeFigure("https://fred.stlouisfed.org/chart1.png", "chart"),
        makeBareFigure("https://whitehouse.gov/hero-image.jpg", "photo"), // no caption
        makeFigure("https://pewresearch.org/table1.png", "table"),
        makeBareFigure("https://cdn.reuters.com/reporter-photo.jpg", "photo"), // no caption
        makeFigure("https://example.com/flow-diagram.svg", "diagram"), // SVG → auto-kept
      ];

      // Vision API 完全不可用（flow-diagram.svg 是 SVG，直接 auto-kept，不走 Vision）
      mockChatFacade.chatStructured.mockRejectedValue(
        new Error("429 Too Many Requests"),
      );

      const result = await service.filterRelevantFigures(
        figures,
        "AI 监管政策分析",
      );

      // 安全降级: 只保留 chart/table/diagram，无标题照片被丢弃
      expect(result).toHaveLength(3);
      expect(result.map((f) => f.type)).toEqual(["chart", "table", "diagram"]);
      // 白宫英雄图和路透社记者照片不出现
      expect(result.find((f) => f.type === "photo")).toBeUndefined();
    });

    it("单张图片失败不影响其他图片（v13 个体隔离）", async () => {
      // 5 张图片，第 2 张 Vision 调用失败（慢速 CDN）
      const figures = [
        makeFigure("https://example.com/chart1.png", "chart"),
        makeBareFigure("https://slow-cdn.example.com/photo.jpg", "photo"),
        makeFigure("https://example.com/chart2.png", "chart"),
        makeFigure("https://example.com/table.png", "table"),
        makeFigure("https://example.com/chart3.png", "chart"),
      ];

      mockChatFacade.chatStructured
        .mockResolvedValueOnce(accepted()) // chart1 ✅
        .mockRejectedValueOnce(new Error("CDN timeout")) // photo → fallback (no caption → rejected)
        .mockResolvedValueOnce(accepted()) // chart2 ✅
        .mockResolvedValueOnce(accepted()) // table ✅
        .mockResolvedValueOnce(accepted()); // chart3 ✅

      const result = await service.filterRelevantFigures(figures, "AI 研究");

      // chart1 + chart2 + table + chart3 = 4（photo 失败且无 caption → rejected）
      expect(result).toHaveLength(4);
      expect(result.every((f) => f.type !== "photo")).toBe(true);
      // All 5 Vision calls were attempted
      expect(mockChatFacade.chatStructured).toHaveBeenCalledTimes(5);
    });

    it("Vision prompt 应包含话题名称用于相关性判断", async () => {
      const figures = [makeFigure("https://example.com/chart.png", "chart")];

      mockChatFacade.chatStructured.mockResolvedValue(accepted());

      await service.filterRelevantFigures(figures, "中国半导体产业政策");

      // prompt 中应包含话题名称，让 Vision LLM 据此判断图片与话题的相关性
      const callArgs = mockChatFacade.chatStructured.mock.calls[0][0];
      const promptText = callArgs.messages[0].contentParts[0].text;
      expect(promptText).toContain("中国半导体产业政策");
    });
  });
});
