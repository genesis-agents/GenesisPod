/**
 * Slides Engine v3.0 - Image Fetcher Skill
 *
 * 配图获取技能：根据关键词从图片服务获取高质量配图
 * 支持 Unsplash API（免费50次/小时）
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

/**
 * 图片搜索结果
 */
export interface ImageResult {
  id: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  description?: string;
  author?: string;
  authorUrl?: string;
}

/**
 * 图片搜索选项
 */
export interface ImageSearchOptions {
  /** 搜索关键词 */
  keywords: string[];
  /** 图片尺寸: small(400), medium(800), large(1600) */
  size?: "small" | "medium" | "large";
  /** 图片方向 */
  orientation?: "landscape" | "portrait" | "squarish";
  /** 返回数量 */
  count?: number;
}

/**
 * 本地备选图片库（当 API 不可用时使用）
 */
const FALLBACK_IMAGES: Record<string, string[]> = {
  business: [
    "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800",
    "https://images.unsplash.com/photo-1560472355-536de3962603?w=800",
  ],
  technology: [
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800",
    "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800",
  ],
  data: [
    "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800",
  ],
  team: [
    "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800",
    "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800",
  ],
  growth: [
    "https://images.unsplash.com/photo-1543286386-713bdd548da4?w=800",
    "https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?w=800",
  ],
  innovation: [
    "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800",
  ],
  default: [
    "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=800",
    "https://images.unsplash.com/photo-1497032628192-86f99bcd76bc?w=800",
  ],
};

/**
 * 关键词到类别映射
 */
const KEYWORD_CATEGORY_MAP: Record<string, string> = {
  // 商业
  商业: "business",
  公司: "business",
  企业: "business",
  市场: "business",
  business: "business",
  company: "business",
  market: "business",
  // 技术
  技术: "technology",
  科技: "technology",
  数字化: "technology",
  tech: "technology",
  digital: "technology",
  software: "technology",
  // 数据
  数据: "data",
  分析: "data",
  图表: "data",
  data: "data",
  analytics: "data",
  chart: "data",
  // 团队
  团队: "team",
  协作: "team",
  人员: "team",
  team: "team",
  collaboration: "team",
  people: "team",
  // 增长
  增长: "growth",
  发展: "growth",
  提升: "growth",
  growth: "growth",
  development: "growth",
  progress: "growth",
  // 创新
  创新: "innovation",
  未来: "innovation",
  智能: "innovation",
  AI: "innovation",
  innovation: "innovation",
  future: "innovation",
  ai: "innovation",
};

@Injectable()
export class ImageFetcherSkill {
  private readonly logger = new Logger(ImageFetcherSkill.name);
  private readonly unsplashAccessKey: string | undefined;
  private readonly sizeMap = {
    small: 400,
    medium: 800,
    large: 1600,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.unsplashAccessKey = this.configService.get<string>(
      "UNSPLASH_ACCESS_KEY",
    );
    if (!this.unsplashAccessKey) {
      this.logger.warn(
        "[ImageFetcherSkill] UNSPLASH_ACCESS_KEY not configured, using fallback images",
      );
    }
  }

  /**
   * 根据关键词搜索图片
   */
  async searchImages(options: ImageSearchOptions): Promise<ImageResult[]> {
    const {
      keywords,
      size = "medium",
      orientation = "landscape",
      count = 1,
    } = options;

    const query = keywords.join(" ");
    this.logger.log(`[searchImages] Searching for: ${query}`);

    // 如果没有 API key，使用本地备选图片
    if (!this.unsplashAccessKey) {
      return this.getFallbackImages(keywords, count);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get("https://api.unsplash.com/search/photos", {
          params: {
            query,
            orientation,
            per_page: count,
          },
          headers: {
            Authorization: `Client-ID ${this.unsplashAccessKey}`,
          },
        }),
      );

      const results = response.data.results || [];
      const width = this.sizeMap[size];

      return results.map(
        (photo: {
          id: string;
          urls: { raw: string; small: string };
          width: number;
          height: number;
          description?: string;
          alt_description?: string;
          user?: { name: string; links?: { html: string } };
        }) => ({
          id: photo.id,
          url: `${photo.urls.raw}&w=${width}&fit=crop`,
          thumbnailUrl: photo.urls.small,
          width: photo.width,
          height: photo.height,
          description: photo.description || photo.alt_description,
          author: photo.user?.name,
          authorUrl: photo.user?.links?.html,
        }),
      );
    } catch (error) {
      this.logger.error(`[searchImages] API error: ${error}`);
      return this.getFallbackImages(keywords, count);
    }
  }

  /**
   * 根据标题和内容提取关键词
   */
  extractKeywords(title: string, content?: string): string[] {
    const text = `${title} ${content || ""}`;
    const keywords: string[] = [];

    // 匹配中文关键词
    const chineseWords = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
    keywords.push(...chineseWords.slice(0, 3));

    // 匹配英文关键词
    const englishWords =
      text.match(/\b[a-zA-Z]{3,}\b/g)?.map((w) => w.toLowerCase()) || [];
    keywords.push(...englishWords.slice(0, 2));

    // 去重
    return [...new Set(keywords)];
  }

  /**
   * 为幻灯片获取配图
   * 根据页面标题自动提取关键词并获取合适的图片
   */
  async fetchImageForSlide(
    title: string,
    subtitle?: string,
  ): Promise<ImageResult | null> {
    const keywords = this.extractKeywords(title, subtitle);
    if (keywords.length === 0) {
      keywords.push("business");
    }

    const results = await this.searchImages({
      keywords,
      size: "medium",
      orientation: "landscape",
      count: 1,
    });

    return results[0] || null;
  }

  /**
   * 生成图片占位符 HTML
   * 用于在图片加载前显示
   */
  generatePlaceholderHtml(
    width: number,
    height: number,
    text?: string,
  ): string {
    return `
<div style="
  width: ${width}px;
  height: ${height}px;
  background: linear-gradient(135deg, #1E293B 0%, #334155 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748B;
  font-size: 14px;
">
  ${text || "图片加载中..."}
</div>
    `.trim();
  }

  /**
   * 生成带图片的 HTML 片段
   */
  generateImageHtml(
    image: ImageResult,
    options: {
      width?: number | string;
      height?: number | string;
      borderRadius?: string;
      objectFit?: "cover" | "contain" | "fill";
    } = {},
  ): string {
    const {
      width = "100%",
      height = "auto",
      borderRadius = "8px",
      objectFit = "cover",
    } = options;

    const widthStyle = typeof width === "number" ? `${width}px` : width;
    const heightStyle = typeof height === "number" ? `${height}px` : height;

    return `
<img
  src="${image.url}"
  alt="${image.description || "配图"}"
  style="
    width: ${widthStyle};
    height: ${heightStyle};
    border-radius: ${borderRadius};
    object-fit: ${objectFit};
  "
  loading="lazy"
/>
    `.trim();
  }

  /**
   * 获取本地备选图片
   */
  private getFallbackImages(keywords: string[], count: number): ImageResult[] {
    // 查找匹配的类别
    let category = "default";
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (KEYWORD_CATEGORY_MAP[lowerKeyword]) {
        category = KEYWORD_CATEGORY_MAP[lowerKeyword];
        break;
      }
    }

    const images = FALLBACK_IMAGES[category] || FALLBACK_IMAGES.default;
    const results: ImageResult[] = [];

    for (let i = 0; i < Math.min(count, images.length); i++) {
      results.push({
        id: `fallback-${category}-${i}`,
        url: images[i],
        thumbnailUrl: images[i].replace("w=800", "w=200"),
        width: 800,
        height: 533,
        description: `${category} image`,
      });
    }

    this.logger.log(
      `[getFallbackImages] Using fallback images for category: ${category}`,
    );
    return results;
  }
}
