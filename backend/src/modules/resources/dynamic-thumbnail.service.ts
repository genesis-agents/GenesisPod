import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import * as cheerio from "cheerio";

/**
 * 动态缩略图提取服务
 *
 * 根据资源类型动态提取或生成缩略图URL：
 * - YouTube: 从视频ID构建缩略图URL
 * - Blogs/News/Papers/Reports/Policy: 实时提取 og:image
 * - arXiv Papers: 使用 arxiv 缩略图服务
 */
@Injectable()
export class DynamicThumbnailService {
  private readonly logger = new Logger(DynamicThumbnailService.name);
  private readonly REQUEST_TIMEOUT = 8000; // 8秒超时

  /**
   * 获取资源的动态缩略图URL
   */
  async getThumbnailUrl(
    sourceUrl: string,
    type: string,
  ): Promise<string | null> {
    try {
      switch (type) {
        case "YOUTUBE":
        case "YOUTUBE_VIDEO":
          return this.getYouTubeThumbnail(sourceUrl);

        case "BLOG":
        case "NEWS":
          return await this.extractOgImage(sourceUrl);

        case "PAPER":
          // 检查是否是 arXiv
          if (sourceUrl?.includes("arxiv.org")) {
            return this.getArxivThumbnail(sourceUrl);
          }
          // 对于其他论文网站，尝试提取 og:image
          return await this.extractOgImage(sourceUrl);

        case "REPORT":
        case "POLICY":
          // 尝试从网页提取 og:image（很多报告和政策页面有封面图）
          return await this.extractOgImage(sourceUrl);

        default:
          return null;
      }
    } catch (error) {
      this.logger.error(
        `Failed to get thumbnail for ${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * 从YouTube URL获取缩略图
   */
  private getYouTubeThumbnail(url: string): string | null {
    const videoId = this.extractYouTubeVideoId(url);
    if (videoId) {
      // 使用 mqdefault (320x180) 作为列表缩略图
      return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    }
    return null;
  }

  /**
   * 从arXiv URL获取缩略图
   */
  private getArxivThumbnail(url: string): string | null {
    const arxivId = this.extractArxivId(url);
    if (arxivId) {
      // 使用 ar5iv HTML 渲染版本的第一张图
      // 备选: 使用 arxiv-vanity 的缩略图
      return `https://static.arxiv.org/static/browse/0.3.4/images/arxiv-logo-small.svg`;
    }
    return null;
  }

  /**
   * 从网页提取 og:image
   */
  async extractOgImage(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, {
        timeout: this.REQUEST_TIMEOUT,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
      });

      const $ = cheerio.load(response.data);

      // 按优先级尝试多种方式获取封面图
      const imageUrl =
        $('meta[property="og:image"]').attr("content") ||
        $('meta[name="og:image"]').attr("content") ||
        $('meta[property="twitter:image"]').attr("content") ||
        $('meta[name="twitter:image"]').attr("content") ||
        $('meta[name="thumbnail"]').attr("content") ||
        $('link[rel="image_src"]').attr("href");

      if (imageUrl) {
        return this.normalizeImageUrl(imageUrl, url);
      }

      // 如果没有OG Image，尝试获取文章中的第一张大图
      const firstImage =
        $("article img[src]").first().attr("src") ||
        $(".post-content img[src]").first().attr("src") ||
        $(".entry-content img[src]").first().attr("src") ||
        $("main img[src]").first().attr("src");

      if (firstImage) {
        return this.normalizeImageUrl(firstImage, url);
      }

      return null;
    } catch (error) {
      this.logger.debug(
        `Failed to extract og:image from ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * 规范化图片URL（处理相对路径）
   */
  private normalizeImageUrl(imageUrl: string, baseUrl: string): string {
    if (imageUrl.startsWith("//")) {
      return `https:${imageUrl}`;
    } else if (imageUrl.startsWith("/")) {
      const urlObj = new URL(baseUrl);
      return `${urlObj.origin}${imageUrl}`;
    } else if (!imageUrl.startsWith("http")) {
      const urlObj = new URL(baseUrl);
      return `${urlObj.origin}/${imageUrl}`;
    }
    return imageUrl;
  }

  /**
   * 从YouTube URL提取视频ID
   */
  private extractYouTubeVideoId(url: string): string | null {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * 从arXiv URL提取论文ID
   */
  private extractArxivId(url: string): string | null {
    if (!url) return null;
    const match = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/);
    return match ? match[1] : null;
  }
}
