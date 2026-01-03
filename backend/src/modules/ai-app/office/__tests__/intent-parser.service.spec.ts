/**
 * Intent Parser Service 测试
 * 测试自然语言意图解析功能
 */

import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { IntentParserService, VISUAL_STYLES, COLOR_THEMES } from "../core";
import { PrismaService } from "../../../../common/prisma/prisma.service";

describe("IntentParserService", () => {
  let service: IntentParserService;

  const mockPrisma = {
    aIModel: {
      findFirst: jest.fn(),
    },
  };

  const mockHttpService = {
    post: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntentParserService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<IntentParserService>(IntentParserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("parseIntent", () => {
    describe("URL extraction", () => {
      it("should extract single URL from text", async () => {
        const input =
          "帮我分析一下这个网页 https://example.com/article 生成PPT";
        const result = await service.parseIntent(input);

        expect(result.urls).toContain("https://example.com/article");
        expect(result.urls.length).toBe(1);
      });

      it("should extract multiple URLs from text", async () => {
        const input =
          "参考这两个链接 https://example.com/1 和 https://example.com/2 做PPT";
        const result = await service.parseIntent(input);

        expect(result.urls.length).toBe(2);
        expect(result.urls).toContain("https://example.com/1");
        expect(result.urls).toContain("https://example.com/2");
      });

      it("should handle URLs with query parameters", async () => {
        const input = "分析 https://youtube.com/watch?v=abc123 这个视频";
        const result = await service.parseIntent(input);

        expect(result.urls).toContain("https://youtube.com/watch?v=abc123");
      });

      it("should clean trailing punctuation from URLs", async () => {
        const input = "看看这个链接https://example.com/path，然后生成PPT";
        const result = await service.parseIntent(input);

        expect(result.urls[0]).toBe("https://example.com/path");
        expect(result.urls[0]).not.toContain(",");
      });

      it("should return empty array when no URLs present", async () => {
        const input = "帮我做一个关于人工智能的PPT";
        const result = await service.parseIntent(input);

        expect(result.urls).toEqual([]);
      });
    });

    describe("Visual style detection", () => {
      it("should detect comic style", async () => {
        const input = "做一个漫画风的PPT关于产品介绍";
        const result = await service.parseIntent(input);

        expect(result.visualStyle).toBe("comic");
        expect(result.visualStyleName).toBe("漫画风");
      });

      it("should detect anime style", async () => {
        const input = "生成二次元日漫的演示文稿";
        const result = await service.parseIntent(input);

        expect(result.visualStyle).toBe("anime");
      });

      it("should detect professional style", async () => {
        const input = "做一份专业商务风格的报告";
        const result = await service.parseIntent(input);

        expect(result.visualStyle).toBe("professional");
      });

      it("should detect tech style", async () => {
        const input = "科技风的产品发布会PPT";
        const result = await service.parseIntent(input);

        expect(result.visualStyle).toBe("tech");
      });

      it("should detect minimal style", async () => {
        const input = "做一个极简风的PPT";
        const result = await service.parseIntent(input);

        expect(result.visualStyle).toBe("minimal");
      });

      it("should default to default style when no style detected", async () => {
        const input = "帮我做一个关于市场分析的PPT";
        const result = await service.parseIntent(input);

        expect(result.visualStyle).toBe("default");
        expect(result.visualStyleName).toBe("默认");
      });

      it("should be case insensitive for English style keywords", async () => {
        const input = "Create a MINIMAL style presentation";
        const result = await service.parseIntent(input);

        expect(result.visualStyle).toBe("minimal");
      });
    });

    describe("Page count detection", () => {
      it("should detect Chinese page count format", async () => {
        const input = "做一个10页的PPT关于AI";
        const result = await service.parseIntent(input);

        expect(result.pageCount).toBe(10);
      });

      it("should detect English pages format", async () => {
        const input = "Create a 15 pages presentation about marketing";
        const result = await service.parseIntent(input);

        expect(result.pageCount).toBe(15);
      });

      it("should detect slide count format", async () => {
        const input = "生成5张幻灯片关于产品介绍";
        const result = await service.parseIntent(input);

        expect(result.pageCount).toBe(5);
      });

      it("should handle page count with generate prefix", async () => {
        const input = "生成8页的PPT";
        const result = await service.parseIntent(input);

        expect(result.pageCount).toBe(8);
      });

      it("should return null when no page count specified", async () => {
        const input = "做一个关于人工智能的PPT";
        const result = await service.parseIntent(input);

        expect(result.pageCount).toBeNull();
      });

      it("should ignore unreasonable page counts", async () => {
        const input = "做一个100页的PPT"; // > 50 pages
        const result = await service.parseIntent(input);

        expect(result.pageCount).toBeNull();
      });
    });

    describe("Color theme detection", () => {
      it("should detect blue professional theme", async () => {
        const input = "做一个蓝色主题的PPT";
        const result = await service.parseIntent(input);

        expect(result.colorTheme).toBe("professional");
      });

      it("should detect green cool theme", async () => {
        const input = "用绿色做一个环保主题的PPT";
        const result = await service.parseIntent(input);

        expect(result.colorTheme).toBe("cool");
      });

      it("should detect dark mode theme", async () => {
        const input = "深色模式的演示文稿";
        const result = await service.parseIntent(input);

        expect(result.colorTheme).toBe("dark");
      });

      it("should return null when no color theme specified", async () => {
        const input = "做一个产品介绍的PPT";
        const result = await service.parseIntent(input);

        expect(result.colorTheme).toBeNull();
      });
    });

    describe("Clean prompt generation", () => {
      it("should remove URLs from prompt", async () => {
        const input = "分析 https://example.com 做PPT";
        const result = await service.parseIntent(input);

        expect(result.cleanPrompt).not.toContain("https://example.com");
      });

      it("should remove style keywords from prompt", async () => {
        const input = "做一个漫画风的PPT关于产品";
        const result = await service.parseIntent(input);

        expect(result.cleanPrompt).not.toContain("漫画风");
      });

      it("should preserve core content in prompt", async () => {
        const input = "帮我做一个关于人工智能发展历史的PPT";
        const result = await service.parseIntent(input);

        expect(result.cleanPrompt).toContain("人工智能");
        expect(result.cleanPrompt).toContain("历史");
      });
    });

    describe("Confidence calculation", () => {
      it("should have higher confidence with more detected parameters", async () => {
        const simpleInput = "做PPT";
        const complexInput =
          "用漫画风做10页蓝色主题的PPT参考 https://example.com";

        const simpleResult = await service.parseIntent(simpleInput);
        const complexResult = await service.parseIntent(complexInput);

        expect(complexResult.confidence).toBeGreaterThan(
          simpleResult.confidence,
        );
      });

      it("should return confidence between 0 and 1", async () => {
        const input = "做一个PPT";
        const result = await service.parseIntent(input);

        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });
    });

    describe("Parse details", () => {
      it("should include parse details in result", async () => {
        const input = "做一个漫画风10页的PPT";
        const result = await service.parseIntent(input);

        expect(result.parseDetails).toBeDefined();
        expect(result.parseDetails.urlsFound).toBe(0);
        expect(result.parseDetails.styleDetected).toBe(true);
        expect(result.parseDetails.pageCountDetected).toBe(true);
      });
    });
  });

  describe("VISUAL_STYLES constant", () => {
    it("should have all required styles defined", () => {
      const requiredStyles: (keyof typeof VISUAL_STYLES)[] = [
        "default",
        "comic",
        "anime",
        "professional",
        "tech",
        "minimal",
      ];

      requiredStyles.forEach((style) => {
        expect(VISUAL_STYLES[style]).toBeDefined();
        expect(VISUAL_STYLES[style].id).toBe(style);
        expect(VISUAL_STYLES[style].name).toBeDefined();
        expect(VISUAL_STYLES[style].keywords).toBeInstanceOf(Array);
      });
    });

    it("should have non-empty keywords for each style", () => {
      Object.values(VISUAL_STYLES).forEach((style) => {
        expect(style.keywords.length).toBeGreaterThan(0);
      });
    });
  });

  describe("COLOR_THEMES constant", () => {
    it("should have professional theme defined", () => {
      expect(COLOR_THEMES.professional).toBeDefined();
      expect(COLOR_THEMES.professional.id).toBe("professional");
    });
  });
});
