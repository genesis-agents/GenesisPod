/**
 * Intent Parser Service
 * 自然语言意图解析服务
 *
 * 从用户的自然语言输入中智能提取：
 * - URLs（网页、视频、PDF等）
 * - 视觉风格偏好
 * - 页数/数量要求
 * - 配色偏好
 * - 其他定制参数
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { firstValueFrom } from "rxjs";
import { AIModelType } from "@prisma/client";

// 视觉风格映射
export const VISUAL_STYLES = {
  default: {
    id: "default",
    name: "默认",
    keywords: ["默认", "标准", "普通", "正常"],
    description: "专业简洁的商务风格",
  },
  comic: {
    id: "comic",
    name: "漫画风",
    keywords: ["漫画", "漫画风", "comic", "卡通", "动漫风格"],
    description: "生动有趣的漫画插画风格",
  },
  doraemon: {
    id: "doraemon",
    name: "机器猫",
    keywords: ["机器猫", "哆啦A梦", "doraemon", "叮当猫", "蓝胖子"],
    description: "哆啦A梦可爱卡通风格",
  },
  anime: {
    id: "anime",
    name: "动漫风",
    keywords: ["动漫", "anime", "二次元", "日漫", "日系"],
    description: "日系动漫插画风格",
  },
  watercolor: {
    id: "watercolor",
    name: "水彩风",
    keywords: ["水彩", "watercolor", "水彩画"],
    description: "柔和的水彩画风格",
  },
  pixel: {
    id: "pixel",
    name: "像素风",
    keywords: ["像素", "pixel", "8bit", "复古游戏"],
    description: "复古像素游戏风格",
  },
  flat: {
    id: "flat",
    name: "扁平化",
    keywords: ["扁平", "flat", "扁平化", "简约"],
    description: "现代扁平设计风格",
  },
  handdrawn: {
    id: "handdrawn",
    name: "手绘风",
    keywords: ["手绘", "手画", "涂鸦", "sketch", "素描"],
    description: "手绘涂鸦插画风格",
  },
  professional: {
    id: "professional",
    name: "专业商务",
    keywords: ["专业", "商务", "business", "正式", "企业"],
    description: "专业的商务演示风格",
  },
  tech: {
    id: "tech",
    name: "科技风",
    keywords: ["科技", "tech", "未来", "科幻", "数码"],
    description: "现代科技感风格",
  },
  minimal: {
    id: "minimal",
    name: "极简风",
    keywords: ["极简", "minimal", "简洁", "简单"],
    description: "极简主义设计风格",
  },
  creative: {
    id: "creative",
    name: "创意风",
    keywords: ["创意", "creative", "艺术", "个性"],
    description: "创意艺术风格",
  },
};

// 配色主题映射
export const COLOR_THEMES = {
  professional: {
    id: "professional",
    name: "专业蓝",
    keywords: ["专业", "蓝色", "商务蓝", "深蓝"],
  },
  modern: {
    id: "modern",
    name: "现代紫",
    keywords: ["现代", "紫色", "科技紫"],
  },
  minimal: {
    id: "minimal",
    name: "极简黑白",
    keywords: ["黑白", "灰色", "极简"],
  },
  creative: {
    id: "creative",
    name: "活力彩",
    keywords: ["彩色", "活力", "多彩", "鲜艳"],
  },
  warm: {
    id: "warm",
    name: "温暖橙",
    keywords: ["温暖", "橙色", "暖色"],
  },
  cool: {
    id: "cool",
    name: "清新绿",
    keywords: ["清新", "绿色", "自然"],
  },
  dark: {
    id: "dark",
    name: "暗黑风",
    keywords: ["暗黑", "深色", "dark", "夜间"],
  },
};

export interface ParsedIntent {
  // 原始输入（清理后的纯文本提示词）
  cleanPrompt: string;

  // 提取的URLs
  urls: string[];

  // 视觉风格
  visualStyle: string;
  visualStyleName: string;

  // 页数/数量
  pageCount: number | null;

  // 配色主题
  colorTheme: string | null;

  // 其他检测到的参数
  language: "zh" | "en" | "auto";
  includeImages: boolean;
  includeSpeakerNotes: boolean;

  // 置信度和解析详情
  confidence: number;
  parseDetails: {
    urlsFound: number;
    styleDetected: boolean;
    pageCountDetected: boolean;
    colorThemeDetected: boolean;
  };
}

@Injectable()
export class IntentParserService {
  private readonly logger = new Logger(IntentParserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 解析用户的自然语言输入
   */
  async parseIntent(userInput: string): Promise<ParsedIntent> {
    this.logger.log(`Parsing intent from: ${userInput.slice(0, 100)}...`);

    // 1. 提取URLs
    const { urls, textWithoutUrls } = this.extractUrls(userInput);

    // 2. 检测视觉风格
    const { style, styleName, textAfterStyle } =
      this.detectVisualStyle(textWithoutUrls);

    // 3. 检测页数要求
    const { pageCount, textAfterPageCount } =
      this.detectPageCount(textAfterStyle);

    // 4. 检测配色主题
    const { colorTheme, textAfterColor } =
      this.detectColorTheme(textAfterPageCount);

    // 5. 检测其他参数
    const { includeImages, includeSpeakerNotes, language } =
      this.detectOtherParams(textAfterColor);

    // 6. 清理最终的提示词
    const cleanPrompt = this.cleanPrompt(textAfterColor);

    // 计算置信度
    const confidence = this.calculateConfidence({
      urlsFound: urls.length,
      styleDetected: style !== "default",
      pageCountDetected: pageCount !== null,
      colorThemeDetected: colorTheme !== null,
    });

    const result: ParsedIntent = {
      cleanPrompt,
      urls,
      visualStyle: style,
      visualStyleName: styleName,
      pageCount,
      colorTheme,
      language,
      includeImages,
      includeSpeakerNotes,
      confidence,
      parseDetails: {
        urlsFound: urls.length,
        styleDetected: style !== "default",
        pageCountDetected: pageCount !== null,
        colorThemeDetected: colorTheme !== null,
      },
    };

    this.logger.log(`Parsed intent: ${JSON.stringify(result, null, 2)}`);
    return result;
  }

  /**
   * 使用 AI 进行更智能的意图解析（可选，用于复杂场景）
   */
  async parseIntentWithAI(userInput: string): Promise<ParsedIntent> {
    // 先尝试规则解析
    const ruleBasedResult = await this.parseIntent(userInput);

    // 如果规则解析置信度较低，使用 AI 增强
    if (ruleBasedResult.confidence < 0.6) {
      try {
        const aiResult = await this.enhanceWithAI(userInput, ruleBasedResult);
        return aiResult;
      } catch (error) {
        this.logger.warn(
          "AI enhancement failed, using rule-based result",
          error,
        );
        return ruleBasedResult;
      }
    }

    return ruleBasedResult;
  }

  /**
   * 提取文本中的URLs
   */
  private extractUrls(text: string): {
    urls: string[];
    textWithoutUrls: string;
  } {
    // URL正则表达式
    const urlRegex =
      /https?:\/\/[^\s\u4e00-\u9fa5，。！？、；：""''（）【】《》]+/gi;

    const urls: string[] = [];
    let textWithoutUrls = text;

    const matches = text.match(urlRegex);
    if (matches) {
      matches.forEach((url) => {
        // 清理URL末尾可能的标点
        const cleanUrl = url.replace(/[.,;:!?)\]}>]+$/, "");
        if (!urls.includes(cleanUrl)) {
          urls.push(cleanUrl);
        }
        textWithoutUrls = textWithoutUrls.replace(url, " ");
      });
    }

    return { urls, textWithoutUrls: textWithoutUrls.trim() };
  }

  /**
   * 检测视觉风格
   */
  private detectVisualStyle(text: string): {
    style: string;
    styleName: string;
    textAfterStyle: string;
  } {
    const lowerText = text.toLowerCase();
    let textAfterStyle = text;

    for (const [styleId, styleInfo] of Object.entries(VISUAL_STYLES)) {
      for (const keyword of styleInfo.keywords) {
        const keywordLower = keyword.toLowerCase();
        if (lowerText.includes(keywordLower)) {
          // 移除风格关键词
          const regex = new RegExp(keyword, "gi");
          textAfterStyle = textAfterStyle.replace(regex, " ");
          return {
            style: styleId,
            styleName: styleInfo.name,
            textAfterStyle: textAfterStyle.trim(),
          };
        }
      }
    }

    return {
      style: "default",
      styleName: "默认",
      textAfterStyle: text,
    };
  }

  /**
   * 检测页数要求
   */
  private detectPageCount(text: string): {
    pageCount: number | null;
    textAfterPageCount: string;
  } {
    let textAfterPageCount = text;

    // 匹配各种页数表达方式
    const patterns = [
      // "10页"、"10页左右"、"大约10页"
      /(\d+)\s*页/i,
      // "10 pages"
      /(\d+)\s*pages?/i,
      // "10张幻灯片"、"10张PPT"
      /(\d+)\s*张/i,
      // "做10个"
      /做\s*(\d+)\s*[个张页]/i,
      // "生成10页"
      /生成\s*(\d+)\s*[页张]/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const count = parseInt(match[1], 10);
        if (count >= 1 && count <= 50) {
          // 移除匹配的文本
          textAfterPageCount = textAfterPageCount.replace(match[0], " ");
          return {
            pageCount: count,
            textAfterPageCount: textAfterPageCount.trim(),
          };
        }
      }
    }

    return { pageCount: null, textAfterPageCount: text };
  }

  /**
   * 检测配色主题
   */
  private detectColorTheme(text: string): {
    colorTheme: string | null;
    textAfterColor: string;
  } {
    const lowerText = text.toLowerCase();
    let textAfterColor = text;

    for (const [themeId, themeInfo] of Object.entries(COLOR_THEMES)) {
      for (const keyword of themeInfo.keywords) {
        const keywordLower = keyword.toLowerCase();
        if (lowerText.includes(keywordLower)) {
          const regex = new RegExp(keyword, "gi");
          textAfterColor = textAfterColor.replace(regex, " ");
          return {
            colorTheme: themeId,
            textAfterColor: textAfterColor.trim(),
          };
        }
      }
    }

    return { colorTheme: null, textAfterColor: text };
  }

  /**
   * 检测其他参数
   */
  private detectOtherParams(text: string): {
    includeImages: boolean;
    includeSpeakerNotes: boolean;
    language: "zh" | "en" | "auto";
  } {
    const lowerText = text.toLowerCase();

    // 检测是否需要图片
    const noImageKeywords = [
      "不要图片",
      "无图",
      "纯文字",
      "no image",
      "text only",
    ];
    const includeImages = !noImageKeywords.some((kw) => lowerText.includes(kw));

    // 检测是否需要演讲稿
    const speakerNotesKeywords = ["演讲稿", "备注", "speaker notes", "讲稿"];
    const includeSpeakerNotes = speakerNotesKeywords.some((kw) =>
      lowerText.includes(kw),
    );

    // 检测语言
    let language: "zh" | "en" | "auto" = "auto";
    if (lowerText.includes("英文") || lowerText.includes("english")) {
      language = "en";
    } else if (lowerText.includes("中文") || lowerText.includes("chinese")) {
      language = "zh";
    }

    return { includeImages, includeSpeakerNotes, language };
  }

  /**
   * 清理提示词
   */
  private cleanPrompt(text: string): string {
    return text
      .replace(/\s+/g, " ") // 合并多个空格
      .replace(/[,，]{2,}/g, "，") // 合并多个逗号
      .replace(/^[,，。.!！?\s]+/, "") // 移除开头的标点
      .replace(/[,，。.!！?\s]+$/, "") // 移除结尾的标点
      .trim();
  }

  /**
   * 计算解析置信度
   */
  private calculateConfidence(details: {
    urlsFound: number;
    styleDetected: boolean;
    pageCountDetected: boolean;
    colorThemeDetected: boolean;
  }): number {
    let confidence = 0.5; // 基础置信度

    if (details.urlsFound > 0) confidence += 0.15;
    if (details.styleDetected) confidence += 0.15;
    if (details.pageCountDetected) confidence += 0.1;
    if (details.colorThemeDetected) confidence += 0.1;

    return Math.min(1, confidence);
  }

  /**
   * 使用 AI 增强解析结果
   */
  private async enhanceWithAI(
    userInput: string,
    ruleBasedResult: ParsedIntent,
  ): Promise<ParsedIntent> {
    const model = await this.getDefaultTextModel();
    if (!model) {
      return ruleBasedResult;
    }

    const prompt = `分析以下用户请求，提取PPT生成参数。

用户输入: "${userInput}"

已识别的参数:
- URLs: ${ruleBasedResult.urls.join(", ") || "无"}
- 视觉风格: ${ruleBasedResult.visualStyleName}
- 页数: ${ruleBasedResult.pageCount || "未指定"}
- 配色: ${ruleBasedResult.colorTheme || "未指定"}

请以JSON格式返回增强后的参数:
{
  "visualStyle": "风格ID (default/comic/doraemon/anime/watercolor/pixel/flat/handdrawn/professional/tech/minimal/creative)",
  "pageCount": 数字或null,
  "colorTheme": "配色ID或null",
  "cleanPrompt": "清理后的核心主题描述"
}

只返回JSON，不要其他文字。`;

    try {
      const response = await this.callLLM(model, prompt);
      const aiResult = JSON.parse(response);

      return {
        ...ruleBasedResult,
        visualStyle: aiResult.visualStyle || ruleBasedResult.visualStyle,
        pageCount: aiResult.pageCount || ruleBasedResult.pageCount,
        colorTheme: aiResult.colorTheme || ruleBasedResult.colorTheme,
        cleanPrompt: aiResult.cleanPrompt || ruleBasedResult.cleanPrompt,
        confidence: 0.85, // AI增强后提高置信度
      };
    } catch (error) {
      this.logger.warn("AI enhancement parsing failed", error);
      return ruleBasedResult;
    }
  }

  /**
   * 获取默认文本模型
   */
  private async getDefaultTextModel() {
    return this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        modelType: AIModelType.CHAT,
      },
      orderBy: { isDefault: "desc" },
    });
  }

  /**
   * 调用 LLM
   */
  private async callLLM(model: any, prompt: string): Promise<string> {
    const isGoogle = model.provider?.toLowerCase().includes("google");

    if (isGoogle) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.modelId}:generateContent?key=${model.apiKey}`;
      const response = await firstValueFrom(
        this.httpService.post(url, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.3,
            responseMimeType: "application/json",
          },
        }),
      );
      return response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      const response = await firstValueFrom(
        this.httpService.post(
          model.apiEndpoint,
          {
            model: model.modelId,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 1000,
            temperature: 0.3,
            response_format: { type: "json_object" },
          },
          {
            headers: {
              Authorization: `Bearer ${model.apiKey}`,
              "Content-Type": "application/json",
            },
          },
        ),
      );
      return response.data.choices?.[0]?.message?.content || "";
    }
  }
}
