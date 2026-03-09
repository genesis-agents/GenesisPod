import { Injectable, Logger } from "@nestjs/common";
import { ToolRegistry } from "@/modules/ai-engine/facade";
import type { ToolContext } from "@/modules/ai-engine/facade";

/**
 * 提取的图表信息
 */
export interface ExtractedFigure {
  /** 图片 URL */
  imageUrl: string;
  /** 图片标题/说明 */
  caption: string;
  /** 图表类型 */
  type: "chart" | "table" | "diagram" | "photo";
  /** alt 文本 */
  alt?: string;
  /** 图片宽度 */
  width?: number;
  /** 图片高度 */
  height?: number;
}

/**
 * Figure Extractor Service
 *
 * 从 HTML 内容中提取图片和图表：
 * 1. 提取 <img> 和 <figure> 标签
 * 2. 过滤非图表图片（logo、icon、avatar 等）
 * 3. 分类图表类型
 * 4. 解析相对 URL 为绝对 URL
 */
@Injectable()
export class FigureExtractorService {
  private readonly logger = new Logger(FigureExtractorService.name);

  constructor(private readonly toolRegistry: ToolRegistry) {}

  /**
   * 创建工具执行上下文
   */
  private createToolContext(toolId: string): ToolContext {
    return {
      executionId: `${toolId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toolId,
      createdAt: new Date(),
      callerType: "orchestrator",
    };
  }

  /**
   * 从 URL 获取并提取图表
   * 使用 web-scraper 工具获取 HTML 内容，然后提取图表
   *
   * @param url 目标 URL
   * @param timeout 超时时间（毫秒）
   * @returns 提取的图表列表
   */
  async extractFiguresFromUrl(
    url: string,
    timeout: number = 10000,
  ): Promise<ExtractedFigure[]> {
    try {
      // 通过 ToolRegistry 获取 web-scraper 工具
      const webScraperTool = this.toolRegistry.tryGet("web-scraper");
      if (!webScraperTool) {
        this.logger.warn(
          "[extractFiguresFromUrl] web-scraper tool not available",
        );
        return [];
      }

      // 使用 Promise.race 实现超时控制
      const fetchPromise = webScraperTool.execute(
        {
          url,
          maxLength: 50000, // 获取更多内容以便提取图片
          returnHtml: true, // 请求返回 HTML（如果工具支持）
        },
        this.createToolContext("web-scraper"),
      );
      const timeoutPromise = new Promise<{
        success: false;
        error: { message: string };
      }>((resolve) =>
        setTimeout(
          () =>
            resolve({ success: false, error: { message: "Fetch timeout" } }),
          timeout,
        ),
      );

      const toolResult = await Promise.race([fetchPromise, timeoutPromise]);

      if (!toolResult.success || !toolResult.data) {
        this.logger.debug(
          `[extractFiguresFromUrl] Failed to fetch ${url}: ${toolResult.error?.message}`,
        );
        return [];
      }

      const scraperData = toolResult.data as {
        content: string;
        html?: string;
        success: boolean;
      };

      if (!scraperData.success) {
        return [];
      }

      // 使用 HTML 内容（如果可用），否则使用 content
      const htmlContent = scraperData.html || scraperData.content || "";

      // 提取图表
      const figures = this.extractFigures(url, htmlContent);
      this.logger.debug(
        `[extractFiguresFromUrl] Extracted ${figures.length} figures from ${url}`,
      );

      return figures;
    } catch (error) {
      this.logger.warn(
        `[extractFiguresFromUrl] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * 从 HTML 内容中提取图表
   *
   * @param baseUrl 页面基础 URL，用于解析相对路径
   * @param htmlContent HTML 内容
   * @returns 提取的图表列表
   */
  extractFigures(baseUrl: string, htmlContent: string): ExtractedFigure[] {
    if (!htmlContent) {
      return [];
    }

    const figures: ExtractedFigure[] = [];

    // 1. 提取 <figure> 标签（更结构化，优先级高）
    const figureElements = this.extractFigureElements(baseUrl, htmlContent);
    figures.push(...figureElements);

    // 2. 提取独立的 <img> 标签
    const imgElements = this.extractImgElements(baseUrl, htmlContent);

    // 过滤掉已经在 figure 中提取过的图片
    const figureUrls = new Set(figures.map((f) => f.imageUrl));
    const newImgs = imgElements.filter((img) => !figureUrls.has(img.imageUrl));
    figures.push(...newImgs);

    // 3. 过滤非内容图片（logo、icon、tracking pixel 等）
    const filteredFigures = figures.filter((fig) =>
      this.isLikelyChart(
        fig.imageUrl,
        fig.caption,
        fig.alt,
        fig.width,
        fig.height,
      ),
    );

    // 4. 限制每个 URL 最多提取的图表数量，避免低质量图片泛滥
    const MAX_FIGURES_PER_URL = 5;
    const limitedFigures = filteredFigures.slice(0, MAX_FIGURES_PER_URL);

    this.logger.debug(
      `Extracted ${limitedFigures.length} figures from ${figures.length} images (filtered: ${filteredFigures.length}, max: ${MAX_FIGURES_PER_URL})`,
    );

    return limitedFigures;
  }

  /**
   * 提取 <figure> 元素
   * ★ 只提取有 <figcaption> 的 figure，没有图注的跳过
   */
  private extractFigureElements(
    baseUrl: string,
    htmlContent: string,
  ): ExtractedFigure[] {
    const figures: ExtractedFigure[] = [];

    // 匹配 <figure>...<img>...<figcaption>...</figcaption>...</figure>
    const figureRegex =
      /<figure[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["'][^>]*>[\s\S]*?(?:<figcaption[^>]*>([\s\S]*?)<\/figcaption>)?[\s\S]*?<\/figure>/gi;

    let match;
    while ((match = figureRegex.exec(htmlContent)) !== null) {
      const imgSrc = match[1];
      // ★ 必须有 <figcaption>，否则跳过（不用 alt 兜底）
      if (!match[2]) continue;
      const figcaption = this.cleanHtmlText(match[2]);
      if (!this.isMeaningfulCaption(figcaption)) continue;

      const resolvedUrl = this.resolveUrl(baseUrl, imgSrc);
      if (resolvedUrl) {
        figures.push({
          imageUrl: resolvedUrl,
          caption: figcaption,
          type: this.classifyFigureType(figcaption),
          alt: this.extractAltFromImg(match[0]),
        });
      }
    }

    return figures;
  }

  /**
   * 提取独立的 <img> 元素
   * ★ 只提取有实质性 alt 文本的 img，无描述的跳过
   */
  private extractImgElements(
    baseUrl: string,
    htmlContent: string,
  ): ExtractedFigure[] {
    const figures: ExtractedFigure[] = [];

    // 匹配 <img> 标签（包含 lazy-load 属性 data-src / data-original）
    const imgRegex =
      /<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["'][^>]*>/gi;

    let match;
    while ((match = imgRegex.exec(htmlContent)) !== null) {
      const alt = this.extractAltFromFullMatch(match[0]);
      // ★ 必须有实质性 alt 文本，否则跳过
      if (!this.isMeaningfulCaption(alt)) continue;

      // Prefer data-src/data-original (lazy-load real URL) over src (placeholder)
      const imgSrc = this.extractBestSrc(match[0]) || match[1];
      const resolvedUrl = this.resolveUrl(baseUrl, imgSrc);
      if (resolvedUrl) {
        const width = this.extractDimension(match[0], "width");
        const height = this.extractDimension(match[0], "height");

        figures.push({
          imageUrl: resolvedUrl,
          caption: alt,
          type: this.classifyFigureType(alt),
          alt,
          width,
          height,
        });
      }
    }

    return figures;
  }

  /**
   * 从 img 标签中提取最佳 src（优先 lazy-load 属性）
   */
  private extractBestSrc(imgTag: string): string | null {
    // Prefer lazy-load attributes which contain the real high-res URL
    for (const attr of ["data-src", "data-original", "data-lazy-src"]) {
      const match = imgTag.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"));
      if (match && !match[1].startsWith("data:")) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * 从 img 标签中提取 alt 属性
   */
  private extractAltFromImg(imgTag: string): string {
    const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
    return altMatch ? altMatch[1] : "";
  }

  /**
   * 从完整匹配中提取 alt（处理 alt 在 src 前面的情况）
   */
  private extractAltFromFullMatch(fullMatch: string): string {
    const altMatch = fullMatch.match(/alt=["']([^"']*)["']/i);
    return altMatch ? altMatch[1] : "";
  }

  /**
   * 提取图片尺寸
   */
  private extractDimension(
    imgTag: string,
    dimension: "width" | "height",
  ): number | undefined {
    const regex = new RegExp(`${dimension}=["']?(\\d+)["']?`, "i");
    const match = imgTag.match(regex);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * 解析相对 URL 为绝对 URL
   */
  private resolveUrl(baseUrl: string, imgSrc: string): string | null {
    try {
      // 跳过 data URLs
      if (imgSrc.startsWith("data:")) {
        return null;
      }

      let resolved: string;

      // 已经是绝对 URL
      if (imgSrc.startsWith("http://") || imgSrc.startsWith("https://")) {
        resolved = imgSrc;
      } else if (imgSrc.startsWith("//")) {
        // 协议相对 URL
        resolved = "https:" + imgSrc;
      } else {
        // 相对 URL，需要基于 baseUrl 解析
        const base = new URL(baseUrl);
        resolved = new URL(imgSrc, base).href;
      }

      // Validate: URL must parse and have a valid image-like path
      const parsed = new URL(resolved);
      if (!parsed.hostname || parsed.hostname.length < 3) {
        return null;
      }

      // Reject corrupted CDN URLs with encoding artifacts ($s!, %24s!, etc.)
      if (/\$s!|%24s!/i.test(resolved)) {
        this.logger.debug(
          `Rejecting corrupted CDN URL (encoding artifact): ${resolved.substring(0, 120)}`,
        );
        return null;
      }

      // Reject URLs that are too long (likely corrupted srcset or concatenated params)
      if (resolved.length > 2048) {
        this.logger.debug(
          `Rejecting excessively long URL (${resolved.length} chars): ${resolved.substring(0, 120)}...`,
        );
        return null;
      }

      return resolved;
    } catch (error) {
      this.logger.debug(`Failed to resolve URL: ${imgSrc} from ${baseUrl}`);
      return null;
    }
  }

  /**
   * 判断图片是否可能是有意义的内容图片（图表、插图、研究图等）
   */
  private isLikelyChart(
    url: string,
    caption: string,
    alt?: string,
    width?: number,
    height?: number,
  ): boolean {
    // Skip tiny images (tracking pixels, spacers)
    if (width && height && (width < 50 || height < 50)) {
      return false;
    }
    // Skip 1x1 tracking pixels by URL pattern
    if (/[?&](w|width|h|height)=1\b/.test(url)) {
      return false;
    }

    const combinedText =
      `${url || ""} ${caption || ""} ${alt || ""}`.toLowerCase();

    // 排除模式：明显不是内容图片
    const excludePatterns = [
      /logo/i,
      /icon/i,
      /avatar/i,
      /profile/i,
      /banner/i,
      /advertisement/i,
      /\bad\b/i,
      /button/i,
      /arrow/i,
      /social/i,
      /share/i,
      /facebook/i,
      /twitter/i,
      /linkedin/i,
      /instagram/i,
      /youtube/i,
      /emoji/i,
      /favicon/i,
      /thumb/i,
      /thumbnail/i,
      /placeholder/i,
      /loading/i,
      /spinner/i,
      /badge/i,
      /rating/i,
      /star/i,
      /pixel/i,
      /tracking/i,
      /spacer/i,
      // ★ v4.3: 排除 stock photo 域名（这些图片与研究内容无关）
      /unsplash\.com/i,
      /pexels\.com/i,
      /shutterstock\.com/i,
      /istockphoto\.com/i,
      /gettyimages\.com/i,
      /stock/i,
      /hero[-_]?image/i,
      /cover[-_]?image/i,
      /featured[-_]?image/i,
    ];

    if (excludePatterns.some((pattern) => pattern.test(combinedText))) {
      return false;
    }

    // 包含模式：图表、研究图、内容插图等
    const includePatterns = [
      /chart/i,
      /graph/i,
      /figure/i,
      /diagram/i,
      /plot/i,
      /visualization/i,
      /trend/i,
      /growth/i,
      /market/i,
      /data/i,
      /statistic/i,
      /forecast/i,
      /projection/i,
      /comparison/i,
      /analysis/i,
      /report/i,
      /survey/i,
      /infographic/i,
      /illustration/i,
      /research/i,
      /study/i,
      /result/i,
      /finding/i,
      /evidence/i,
      /experiment/i,
      /model/i,
      /framework/i,
      /architecture/i,
      /overview/i,
      /screenshot/i,
      /image/i,
      /photo/i,
      /picture/i,
      /map/i,
      /timeline/i,
      /workflow/i,
      /process/i,
      /pipeline/i,
      /图/i,
      /表/i,
      /趋势/i,
      /数据/i,
      /统计/i,
      /分析/i,
      /预测/i,
      /对比/i,
      /增长/i,
      /市场/i,
      /研究/i,
      /示意/i,
      /流程/i,
      /框架/i,
      /结果/i,
      /截图/i,
    ];

    // 如果包含内容关键词，保留
    if (includePatterns.some((pattern) => pattern.test(combinedText))) {
      return true;
    }

    // ★ 不再有宽松兜底：没有匹配 include 关键词就拒绝
    // 图片质量优先于数量，不为凑数而降低标准
    return false;
  }

  /**
   * 判断 caption/alt 是否有实质性内容
   * 排除空、纯数字、通用标签如 "image"、"figure 1"、"photo" 等
   */
  private isMeaningfulCaption(text: string | undefined): boolean {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.length < 8) return false; // 至少 8 个字符才有描述价值

    // 排除通用无意义 caption
    const genericPatterns = [
      /^figure\s*\d*$/i,
      /^fig\.?\s*\d*$/i,
      /^image\s*\d*$/i,
      /^img\s*\d*$/i,
      /^photo\s*\d*$/i,
      /^picture\s*\d*$/i,
      /^chart\s*\d*$/i,
      /^graph\s*\d*$/i,
      /^table\s*\d*$/i,
      /^diagram\s*\d*$/i,
      /^screenshot\s*\d*$/i,
      /^illustration\s*\d*$/i,
      /^图\s*\d*$/i,
      /^表\s*\d*$/i,
      /^图片\s*\d*$/i,
      /^\d+$/,
    ];
    if (genericPatterns.some((p) => p.test(trimmed))) return false;

    return true;
  }

  /**
   * 分类图表类型
   */
  private classifyFigureType(
    text: string,
  ): "chart" | "table" | "diagram" | "photo" {
    if (!text) return "chart";
    const lowerText = text.toLowerCase();

    // 表格
    if (/table|表格|数据表/i.test(lowerText)) {
      return "table";
    }

    // 图表
    if (
      /chart|graph|plot|趋势|增长|对比|统计|forecast|projection/i.test(
        lowerText,
      )
    ) {
      return "chart";
    }

    // 流程图/架构图
    if (/diagram|flow|process|架构|流程|结构/i.test(lowerText)) {
      return "diagram";
    }

    // 默认为图表
    return "chart";
  }

  /**
   * 清理 HTML 文本，移除标签
   */
  private cleanHtmlText(html: string): string {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}
