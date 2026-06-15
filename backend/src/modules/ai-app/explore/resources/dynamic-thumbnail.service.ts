import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import axios from "axios";
import * as cheerio from "cheerio";
import { PdfThumbnailService } from "./pdf-thumbnail.service";
import { FlareSolverrService } from "../../library/proxy/flaresolverr.service";

/**
 * 动态缩略图提取服务
 *
 * 根据资源类型动态提取或生成缩略图URL：
 * - YouTube: 从视频ID构建缩略图URL
 * - Blogs/News/Papers/Reports/Policy: 实时提取 og:image
 * - arXiv Papers: 使用 arxiv 缩略图服务
 * - PDF Papers: 使用 PdfThumbnailService 生成缩略图
 */
@Injectable()
export class DynamicThumbnailService {
  private readonly logger = new Logger(DynamicThumbnailService.name);
  private readonly REQUEST_TIMEOUT = 8000; // 8秒超时

  constructor(
    @Inject(forwardRef(() => PdfThumbnailService))
    private readonly pdfThumbnailService: PdfThumbnailService,
    @Inject(forwardRef(() => FlareSolverrService))
    private readonly flareSolverr: FlareSolverrService,
  ) {}

  /**
   * 获取资源的动态缩略图URL
   * @param sourceUrl 资源的源URL
   * @param type 资源类型
   * @param pdfUrl PDF URL（用于PAPER类型生成PDF缩略图）
   * @param resourceId 资源ID（用于缓存PDF缩略图）
   */
  async getThumbnailUrl(
    sourceUrl: string,
    type: string,
    pdfUrl?: string,
    resourceId?: string,
  ): Promise<string | null> {
    try {
      switch (type) {
        case "YOUTUBE":
        case "YOUTUBE_VIDEO":
          return this.getYouTubeThumbnail(sourceUrl);

        case "BLOG":
        case "NEWS":
          return await this.extractOgImage(sourceUrl);

        case "PAPER": {
          // 缺 pdfUrl 但 sourceUrl 是 arxiv 时，推导出 PDF 直链（渲染首页最可靠）
          let effectivePdfUrl = pdfUrl;
          if (
            !effectivePdfUrl &&
            typeof sourceUrl === "string" &&
            this.isArxivUrl(sourceUrl)
          ) {
            const arxivId = this.extractArxivId(sourceUrl);
            if (arxivId) {
              effectivePdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
              this.logger.log(
                `Derived arXiv PDF URL for thumbnail: ${effectivePdfUrl}`,
              );
            }
          }

          // 策略1: 如果有PDF URL和资源ID，优先生成PDF缩略图（最可靠）
          if (effectivePdfUrl && resourceId && this.pdfThumbnailService) {
            this.logger.log(
              `Attempting PDF thumbnail generation for paper ${resourceId} from ${effectivePdfUrl}`,
            );
            try {
              const pdfThumbnail =
                await this.pdfThumbnailService.generateThumbnail(
                  effectivePdfUrl,
                  resourceId,
                );
              if (pdfThumbnail) {
                this.logger.log(
                  `✅ Successfully generated PDF thumbnail: ${pdfThumbnail}`,
                );
                return pdfThumbnail;
              } else {
                this.logger.warn(
                  `⚠️ PDF thumbnail generation returned null for ${resourceId}`,
                );
              }
            } catch (error) {
              this.logger.error(
                `❌ PDF thumbnail generation failed for ${resourceId}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          } else {
            this.logger.debug(
              `Skipping PDF thumbnail: pdfUrl=${!!pdfUrl}, resourceId=${!!resourceId}, service=${!!this.pdfThumbnailService}`,
            );
          }

          // 论文只用真实 PDF 首页渲染；失败则返回 null（前端显示干净的 PAPER 图标）。
          // 不再回退 og:image / arXiv figure —— 论文页的 og:image 是 arxiv logo、
          // figure 抽取常是破图，回退只会把垃圾 URL 缓存进 DB（前端显示空白/破图）。
          this.logger.debug(
            `No PDF thumbnail for paper ${resourceId || sourceUrl}; using type icon`,
          );
          return null;
        }

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
   * 从网页提取 og:image
   * 支持 FlareSolverr 回退以处理 Cloudflare 保护的页面
   */
  async extractOgImage(url: string): Promise<string | null> {
    let html: string | null = null;

    // 尝试直接获取
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
      html = response.data;
    } catch (error) {
      // 如果是 403，尝试使用 FlareSolverr
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        this.logger.debug(
          `Direct fetch returned 403 for ${url}, trying FlareSolverr`,
        );

        if (this.flareSolverr?.getIsAvailable()) {
          try {
            const flareResult = await this.flareSolverr.fetchPage(url, {
              maxTimeout: 30000,
            });
            if (flareResult.success && flareResult.html) {
              html = flareResult.html;
              this.logger.log(
                `FlareSolverr successfully fetched ${url} for thumbnail extraction`,
              );
            }
          } catch (flareError) {
            this.logger.debug(
              `FlareSolverr failed for ${url}: ${flareError instanceof Error ? flareError.message : String(flareError)}`,
            );
          }
        }
      }

      if (!html) {
        this.logger.debug(
          `Failed to extract og:image from ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    }

    // 确保 html 不为 null
    if (!html) {
      return null;
    }

    try {
      const $ = cheerio.load(html);

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
    } catch (parseError) {
      this.logger.debug(
        `Failed to parse HTML from ${url}: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
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

  /**
   * 严格判断是否 arXiv 域名——解析 hostname 比对，避免 URL 子串误判
   * （如 evil.com/arxiv.org）与潜在 SSRF。
   */
  private isArxivUrl(url: string): boolean {
    if (typeof url !== "string") return false;
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === "arxiv.org" || host.endsWith(".arxiv.org");
    } catch {
      return false;
    }
  }
}
