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

      // ★ v10: Fallback keeps only informational types (chart/table/diagram), not photo
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.type)).toEqual(["chart", "diagram"]);
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

    it("should keep missing chart-type indices and reject missing photo-type indices (v10)", async () => {
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

      // ★ v10: index 0 accepted, index 1 missing (chart type → kept), index 2 rejected → 2 accepted
      expect(result).toHaveLength(2);
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

    it("should process all candidates in batches of MAX_FIGURES_PER_BATCH", async () => {
      // Create 12 figures (exceeds MAX_FIGURES_PER_BATCH = 8, needs 2 batches)
      const figures = Array.from({ length: 12 }, (_, i) =>
        makeFigure(`https://example.com/${i}.png`),
      );

      // Mock: batch 1 (8 figures) all accepted, batch 2 (4 figures) all accepted
      mockChatFacade.chatStructured
        .mockResolvedValueOnce({
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
        })
        .mockResolvedValueOnce({
          data: {
            results: Array.from({ length: 4 }, (_, i) => ({
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

      // ★ v6.0: All 12 figures processed in 2 batches, all accepted
      expect(result).toHaveLength(12);
      // chatStructured called twice (2 batches)
      expect(mockChatFacade.chatStructured).toHaveBeenCalledTimes(2);
      // First batch: 8 images
      const batch1Args = mockChatFacade.chatStructured.mock.calls[0][0];
      const batch1ImageCount = batch1Args.messages[0].contentParts.filter(
        (p: { type: string }) => p.type === "image_url",
      ).length;
      expect(batch1ImageCount).toBe(8);
      // Second batch: 4 images
      const batch2Args = mockChatFacade.chatStructured.mock.calls[1][0];
      const batch2ImageCount = batch2Args.messages[0].contentParts.filter(
        (p: { type: string }) => p.type === "image_url",
      ).length;
      expect(batch2ImageCount).toBe(4);
    });

    it("should keep informational types and reject photos when chatStructured throws parse error (v11)", async () => {
      const figures = [
        makeFigure("https://example.com/1.png", "chart"),
        makeFigure("https://example.com/2.jpg", "photo"),
        makeFigure("https://example.com/3.png", "table"),
      ];

      // ★ v11: throwOnParseError=true → chatStructured throws on parse failure
      mockChatFacade.chatStructured.mockRejectedValue(
        new Error(
          "Structured output parse failed after 3 attempts: Unexpected token",
        ),
      );

      const result = await service.filterRelevantFigures(figures, "Test Topic");

      // ★ v10: Parse error → evaluateBatch throws → outer catch keeps chart/table/diagram only
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.type)).toEqual(["chart", "table"]);
    });

    it("should reject photo-type figures when no MULTIMODAL model is configured (v10)", async () => {
      mockChatFacade.getDefaultModelByType.mockResolvedValueOnce(null);

      const figures = [
        makeFigure("https://example.com/chart.png", "chart"),
        makeFigure("https://example.com/photo.jpg", "photo"),
        makeFigure("https://example.com/table.png", "table"),
        makeFigure("https://example.com/diagram.svg", "diagram"),
        makeFigure("https://example.com/photo2.jpg", "photo"),
      ];

      const result = await service.filterRelevantFigures(figures, "Test Topic");

      // ★ v10: No Vision model → only keep chart/table/diagram, reject all photos
      expect(result).toHaveLength(3);
      expect(result.map((f) => f.type)).toEqual(["chart", "table", "diagram"]);
      // chatStructured should NOT be called
      expect(mockChatFacade.chatStructured).not.toHaveBeenCalled();
    });

    it("should reject omitted photo-type indices but keep omitted chart-type (v10)", async () => {
      const figures = [
        makeFigure("https://example.com/1.png", "chart"),
        makeFigure("https://example.com/2.jpg", "photo"),
        makeFigure("https://example.com/3.png", "diagram"),
      ];

      // LLM only returns result for index 0, omits 1 and 2
      mockChatFacade.chatStructured.mockResolvedValue({
        data: {
          results: [{ index: 0, accepted: true }],
        },
        rawContent: "{}",
        model: "test",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.filterRelevantFigures(figures, "Test Topic");

      // ★ v10: index 0 accepted, index 1 omitted (photo → rejected), index 2 omitted (diagram → kept)
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.type)).toEqual(["chart", "diagram"]);
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
        makeFigure("https://www.whitehouse.gov/Wire-Banner.jpg", "photo"),
        makeFigure("https://pewresearch.org/survey-chart.png", "chart"),
        makeFigure("https://cdn.cfr.org/champagne-celebration.jpg", "photo"),
        makeFigure("https://example.com/architecture.svg", "diagram"),
      ];

      // 模拟 Vision LLM 的判断结果 — 对装饰性照片返回 rejected
      mockChatFacade.chatStructured.mockResolvedValue({
        data: {
          results: [
            { index: 0, accepted: true }, // Fed 利率图 ✅
            {
              index: 1,
              accepted: false,
              reason: "文章头图/封面图，装饰性横幅",
            },
            { index: 2, accepted: true }, // Pew 调查图 ✅
            { index: 3, accepted: false, reason: "新闻缩略图，庆祝场景照" },
            { index: 4, accepted: true }, // 架构图 ✅
          ],
        },
        rawContent: "{}",
        model: "test",
        tokensUsed: 100,
        retriedParse: false,
      });

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

    it("Vision API 超时: 应保留 chart/diagram 但丢弃 photo（安全降级）", async () => {
      // 模拟: 8 张图片中混合了有价值的图表和装饰性照片
      const figures = [
        makeFigure("https://fred.stlouisfed.org/chart1.png", "chart"),
        makeFigure("https://whitehouse.gov/hero-image.jpg", "photo"),
        makeFigure("https://pewresearch.org/table1.png", "table"),
        makeFigure("https://cdn.reuters.com/reporter-photo.jpg", "photo"),
        makeFigure("https://example.com/flow-diagram.svg", "diagram"),
      ];

      // Vision API 完全不可用
      mockChatFacade.chatStructured.mockRejectedValue(
        new Error("429 Too Many Requests"),
      );

      const result = await service.filterRelevantFigures(
        figures,
        "AI 监管政策分析",
      );

      // 安全降级: 只保留 chart/table/diagram（确定有信息价值），丢弃 photo（无法验证）
      expect(result).toHaveLength(3);
      expect(result.map((f) => f.type)).toEqual(["chart", "table", "diagram"]);
      // 用户不会看到白宫英雄图和路透社记者照片
      expect(result.find((f) => f.type === "photo")).toBeUndefined();
    });

    it("Vision LLM 漏审部分图片: chart 类型倾向保留，photo 类型倾向拒绝", async () => {
      // 模拟: 5 张图片，其中 tech-architecture.svg 被格式过滤（SVG），自动保留（diagram 类型）
      // 剩余 4 张发给 Vision，LLM 只审了其中 2 张（漏了 index 1）
      const figures = [
        makeFigure("https://example.com/gdp-chart.png", "chart"), // index 0
        makeFigure("https://example.com/ceo-portrait.jpg", "photo"), // index 1: 被 LLM 遗漏
        makeFigure("https://example.com/market-share.png", "chart"), // index 2
        makeFigure("https://example.com/tech-architecture.svg", "diagram"), // index 3: SVG → auto-kept
        makeFigure("https://example.com/press-conference.jpg", "photo"), // index 4
      ];

      // LLM 只看到 4 张（SVG 被过滤），漏审 index 1 (ceo-portrait)
      mockChatFacade.chatStructured.mockResolvedValue({
        data: {
          results: [
            { index: 0, accepted: true }, // gdp-chart ✅
            // index 1 (ceo-portrait) — 遗漏
            { index: 2, accepted: true }, // market-share ✅
            { index: 3, accepted: false, reason: "新闻发布会场景照" }, // press-conference ❌
          ],
        },
        rawContent: "{}",
        model: "test",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.filterRelevantFigures(
        figures,
        "全球 AI 市场分析",
      );

      // 业务规则: chart/diagram 保留（宁可多不可少），photo 丢弃（宁缺毋滥）
      // gdp-chart(LLM ✅) + market-share(LLM ✅) + tech-architecture(SVG auto-kept) = 3
      expect(result).toHaveLength(3);
      expect(result.map((f) => f.type)).toEqual(["chart", "chart", "diagram"]);
      // CEO 肖像照（photo 被遗漏）不出现
      expect(
        result.find((f) => f.imageUrl.includes("ceo-portrait")),
      ).toBeUndefined();
      // 架构图（diagram SVG 自动保留）保留
      expect(
        result.find((f) => f.imageUrl.includes("tech-architecture")),
      ).toBeDefined();
    });

    it("多批处理: 第一批成功第二批失败 → 第一批按 LLM 结果，第二批安全降级", async () => {
      // 模拟: 12 张图片分 2 批（8+4），第二批 API 失败
      const figures = [
        // Batch 1: 8 张 — Vision 正常返回
        makeFigure("https://example.com/chart-1.png", "chart"),
        makeFigure("https://example.com/photo-1.jpg", "photo"),
        makeFigure("https://example.com/chart-2.png", "chart"),
        makeFigure("https://example.com/photo-2.jpg", "photo"),
        makeFigure("https://example.com/diagram-1.svg", "diagram"),
        makeFigure("https://example.com/chart-3.png", "chart"),
        makeFigure("https://example.com/photo-3.jpg", "photo"),
        makeFigure("https://example.com/table-1.png", "table"),
        // Batch 2: 4 张 — API 失败
        makeFigure("https://example.com/chart-4.png", "chart"),
        makeFigure("https://example.com/photo-4.jpg", "photo"),
        makeFigure("https://example.com/diagram-2.svg", "diagram"),
        makeFigure("https://example.com/photo-5.jpg", "photo"),
      ];

      // Batch 1: 正常返回
      // diagram-1.svg 被格式过滤（SVG 不支持 Vision API），自动保留（informational 类型）
      // 剩余 7 张发给 Vision API
      mockChatFacade.chatStructured
        .mockResolvedValueOnce({
          data: {
            results: [
              { index: 0, accepted: true }, // chart-1 ✅
              { index: 1, accepted: false, reason: "装饰照片" }, // photo-1 ❌
              { index: 2, accepted: true }, // chart-2 ✅
              { index: 3, accepted: false, reason: "stock photo" }, // photo-2 ❌
              { index: 4, accepted: true }, // chart-3 ✅ (diagram-1.svg skipped)
              { index: 5, accepted: false, reason: "新闻配图" }, // photo-3 ❌
              { index: 6, accepted: true }, // table-1 ✅
            ],
          },
          rawContent: "{}",
          model: "test",
          tokensUsed: 200,
          retriedParse: false,
        })
        // Batch 2: API 失败 — diagram-2.svg 格式过滤后自动保留，chart-4 走 fallback 保留
        .mockRejectedValueOnce(new Error("500 Internal Server Error"));

      const result = await service.filterRelevantFigures(
        figures,
        "AI 行业深度报告",
      );

      // Batch 1: 3 chart + 1 diagram(SVG auto-kept) + 1 table = 5
      // Batch 2: chart-4(fallback) + diagram-2(SVG auto-kept) = 2
      // Total: 7
      expect(result).toHaveLength(7);
      // 所有结果都不包含 photo
      expect(result.every((f) => f.type !== "photo")).toBe(true);
      // chatStructured 被调用 2 次（batch 2 的 compatible 只有 chart-4 + photo-4 + photo-5）
      expect(mockChatFacade.chatStructured).toHaveBeenCalledTimes(2);
    });

    it("Vision prompt 应包含话题名称用于相关性判断", async () => {
      const figures = [makeFigure("https://example.com/chart.png", "chart")];

      mockChatFacade.chatStructured.mockResolvedValue({
        data: { results: [{ index: 0, accepted: true }] },
        rawContent: "{}",
        model: "test",
        tokensUsed: 50,
        retriedParse: false,
      });

      await service.filterRelevantFigures(figures, "中国半导体产业政策");

      // prompt 中应包含话题名称，让 Vision LLM 据此判断图片与话题的相关性
      const callArgs = mockChatFacade.chatStructured.mock.calls[0][0];
      const promptText = callArgs.messages[0].contentParts[0].text;
      expect(promptText).toContain("中国半导体产业政策");
    });
  });
});
