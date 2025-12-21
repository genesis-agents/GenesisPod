/**
 * AI URL Classifier Service
 * 使用 AI 自动分类 URL 到对应的资源类型
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { ResourceType } from "@prisma/client";
import { firstValueFrom } from "rxjs";

export interface UrlClassificationResult {
  /**
   * 分类结果
   */
  resourceType: ResourceType;

  /**
   * 置信度 (0-1)
   */
  confidence: number;

  /**
   * 分类原因/解释
   */
  reason: string;

  /**
   * 替代分类建议
   */
  alternatives?: Array<{
    resourceType: ResourceType;
    confidence: number;
    reason: string;
  }>;

  /**
   * 从 URL/页面中提取的信息
   */
  extractedInfo?: {
    domain: string;
    title?: string;
    description?: string;
    contentType?: string;
  };
}

@Injectable()
export class AiUrlClassifierService {
  private readonly logger = new Logger(AiUrlClassifierService.name);
  private readonly litellmBaseUrl: string;
  private readonly classificationModel: string;

  // 资源类型描述映射，用于 AI 分类
  private readonly resourceTypeDescriptions: Record<string, string> = {
    PAPER:
      "学术论文、研究论文 - 来自 arXiv, IEEE, ACM, Springer, Nature, Cell, Google Scholar, ResearchGate 等学术平台",
    BLOG: "技术博客、公司研究博客 - 来自 Google, Microsoft, NVIDIA, OpenAI, DeepMind, Anthropic, Medium, Hugging Face 等技术公司或博客平台",
    NEWS: "新闻文章 - 来自 TechCrunch, The Verge, Wired, Bloomberg, Reuters, BBC 等新闻媒体",
    YOUTUBE_VIDEO: "YouTube 视频 - youtube.com 或 youtu.be 链接",
    REPORT:
      "行业报告、分析报告 - 来自 Gartner, Forrester, IDC, McKinsey, BCG, Deloitte, Goldman Sachs 等咨询公司或分析机构",
    POLICY:
      "政策文件、政府文件 - 来自政府网站 (.gov, .mil), 智库 (Brookings, RAND, CFR), 或政策研究机构",
    EVENT:
      "活动、会议 - 来自 Eventbrite, Meetup 或技术会议网站如 NeurIPS, ICML, CES",
    RSS: "RSS 订阅源 - 任何 RSS/Atom feed 链接",
  };

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.litellmBaseUrl =
      this.configService.get<string>("LITELLM_BASE_URL") ||
      "http://localhost:4000";
    this.classificationModel =
      this.configService.get<string>("CLASSIFICATION_MODEL") ||
      "claude-3-5-sonnet-20241022";
  }

  /**
   * 使用 AI 对 URL 进行分类
   */
  async classifyUrl(url: string): Promise<UrlClassificationResult> {
    this.logger.log(`Classifying URL: ${url}`);

    try {
      // 提取 URL 基本信息
      const urlInfo = this.extractUrlInfo(url);

      // 快速检查：YouTube 视频
      if (this.isYouTubeUrl(url)) {
        return {
          resourceType: "YOUTUBE_VIDEO" as ResourceType,
          confidence: 1.0,
          reason: "YouTube video URL detected",
          extractedInfo: urlInfo,
        };
      }

      // 快速检查：RSS feed
      if (this.isRssFeed(url)) {
        return {
          resourceType: "RSS" as ResourceType,
          confidence: 1.0,
          reason: "RSS feed URL detected",
          extractedInfo: urlInfo,
        };
      }

      // 使用 AI 进行分类
      const prompt = this.buildClassificationPrompt(url, urlInfo);
      const result = await this.callLLM(prompt);

      // 解析 AI 响应
      const classification = this.parseClassificationResponse(result);

      return {
        ...classification,
        extractedInfo: urlInfo,
      };
    } catch (error) {
      this.logger.error(`Failed to classify URL: ${error}`);

      // 返回默认分类
      return {
        resourceType: "BLOG" as ResourceType,
        confidence: 0.3,
        reason: "Classification failed, defaulting to BLOG",
        extractedInfo: this.extractUrlInfo(url),
      };
    }
  }

  /**
   * 批量分类 URL
   */
  async classifyUrls(urls: string[]): Promise<UrlClassificationResult[]> {
    const results: UrlClassificationResult[] = [];

    for (const url of urls) {
      const result = await this.classifyUrl(url);
      results.push(result);
    }

    return results;
  }

  /**
   * 检查是否为 YouTube URL
   */
  private isYouTubeUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname.toLowerCase();
      return (
        host.includes("youtube.com") ||
        host.includes("youtu.be") ||
        host.includes("youtube-nocookie.com")
      );
    } catch {
      return false;
    }
  }

  /**
   * 检查是否为 RSS feed
   */
  private isRssFeed(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return (
      lowerUrl.includes("/feed") ||
      lowerUrl.includes("/rss") ||
      lowerUrl.includes(".xml") ||
      lowerUrl.includes("/atom") ||
      lowerUrl.includes("format=rss")
    );
  }

  /**
   * 提取 URL 基本信息
   */
  private extractUrlInfo(
    url: string,
  ): UrlClassificationResult["extractedInfo"] {
    try {
      const urlObj = new URL(url);
      return {
        domain: urlObj.hostname,
        contentType: this.guessContentType(url),
      };
    } catch {
      return {
        domain: "unknown",
      };
    }
  }

  /**
   * 猜测内容类型
   */
  private guessContentType(url: string): string {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes("/pdf") || lowerUrl.endsWith(".pdf")) {
      return "pdf";
    }
    if (lowerUrl.includes("/video") || lowerUrl.includes("/watch")) {
      return "video";
    }
    if (
      lowerUrl.includes("/paper") ||
      lowerUrl.includes("/abs/") ||
      lowerUrl.includes("/doi/")
    ) {
      return "paper";
    }
    if (lowerUrl.includes("/blog") || lowerUrl.includes("/post")) {
      return "blog";
    }
    if (lowerUrl.includes("/news") || lowerUrl.includes("/article")) {
      return "news";
    }
    if (lowerUrl.includes("/report") || lowerUrl.includes("/research")) {
      return "report";
    }

    return "webpage";
  }

  /**
   * 构建分类提示词
   */
  private buildClassificationPrompt(
    url: string,
    urlInfo: UrlClassificationResult["extractedInfo"],
  ): string {
    const resourceTypes = Object.entries(this.resourceTypeDescriptions)
      .map(([type, desc]) => `- ${type}: ${desc}`)
      .join("\n");

    return `You are a URL classification expert. Classify the following URL into the most appropriate resource type.

URL: ${url}
Domain: ${urlInfo?.domain || "unknown"}
Detected content type: ${urlInfo?.contentType || "unknown"}

Available resource types:
${resourceTypes}

Analyze the URL and domain to determine the most appropriate resource type. Consider:
1. The domain name and its typical content
2. URL path patterns (e.g., /paper/, /blog/, /news/)
3. Common patterns for each resource type

Respond in JSON format:
{
  "resourceType": "TYPE",
  "confidence": 0.0-1.0,
  "reason": "Brief explanation",
  "alternatives": [
    {"resourceType": "TYPE", "confidence": 0.0-1.0, "reason": "Brief explanation"}
  ]
}

Only include alternatives if there are other plausible classifications with confidence > 0.3.`;
  }

  /**
   * 调用 LLM 进行分类
   */
  private async callLLM(prompt: string): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${this.litellmBaseUrl}/v1/chat/completions`,
        {
          model: this.classificationModel,
          messages: [
            {
              role: "system",
              content:
                "You are a URL classification assistant. Always respond with valid JSON.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 500,
          temperature: 0.3,
        },
        {
          timeout: 30000,
        },
      ),
    );

    return response.data.choices[0].message.content;
  }

  /**
   * 解析分类响应
   */
  private parseClassificationResponse(
    response: string,
  ): Omit<UrlClassificationResult, "extractedInfo"> {
    try {
      // 提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 验证资源类型
      const validTypes = Object.keys(this.resourceTypeDescriptions);
      if (!validTypes.includes(parsed.resourceType)) {
        this.logger.warn(
          `Invalid resource type: ${parsed.resourceType}, defaulting to BLOG`,
        );
        parsed.resourceType = "BLOG";
        parsed.confidence = 0.5;
      }

      return {
        resourceType: parsed.resourceType as ResourceType,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        reason: parsed.reason || "Classified by AI",
        alternatives: parsed.alternatives?.map(
          (alt: {
            resourceType: string;
            confidence: number;
            reason: string;
          }) => ({
            resourceType: alt.resourceType as ResourceType,
            confidence: Math.min(1, Math.max(0, alt.confidence || 0)),
            reason: alt.reason || "",
          }),
        ),
      };
    } catch (error) {
      this.logger.error(`Failed to parse classification response: ${error}`);

      // 返回默认值
      return {
        resourceType: "BLOG" as ResourceType,
        confidence: 0.3,
        reason: "Failed to parse AI response",
      };
    }
  }

  /**
   * 获取所有支持的资源类型及其描述
   */
  getResourceTypeDescriptions(): Record<string, string> {
    return { ...this.resourceTypeDescriptions };
  }
}
