import { Injectable, Logger } from "@nestjs/common";
import { ToolRegistry } from "@/modules/ai-engine/tools/registry/tool-registry";
import type { ToolContext } from "@/modules/ai-engine/tools/abstractions/tool.interface";

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

    // 3. 过滤非图表图片
    const filteredFigures = figures.filter((fig) =>
      this.isLikelyChart(fig.imageUrl, fig.caption, fig.alt),
    );

    this.logger.debug(
      `Extracted ${filteredFigures.length} figures from ${figures.length} images`,
    );

    return filteredFigures;
  }

  /**
   * 提取 <figure> 元素
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
      const figcaption = match[2]
        ? this.cleanHtmlText(match[2])
        : this.extractAltFromImg(match[0]);

      const resolvedUrl = this.resolveUrl(baseUrl, imgSrc);
      if (resolvedUrl) {
        figures.push({
          imageUrl: resolvedUrl,
          caption: figcaption || "",
          type: this.classifyFigureType(figcaption || ""),
          alt: this.extractAltFromImg(match[0]),
        });
      }
    }

    return figures;
  }

  /**
   * 提取独立的 <img> 元素
   */
  private extractImgElements(
    baseUrl: string,
    htmlContent: string,
  ): ExtractedFigure[] {
    const figures: ExtractedFigure[] = [];

    // 匹配 <img> 标签
    const imgRegex =
      /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;

    let match;
    while ((match = imgRegex.exec(htmlContent)) !== null) {
      const imgSrc = match[1];
      const alt = match[2] || this.extractAltFromFullMatch(match[0]);

      const resolvedUrl = this.resolveUrl(baseUrl, imgSrc);
      if (resolvedUrl) {
        // 提取宽高
        const width = this.extractDimension(match[0], "width");
        const height = this.extractDimension(match[0], "height");

        figures.push({
          imageUrl: resolvedUrl,
          caption: alt || "",
          type: this.classifyFigureType(alt || ""),
          alt: alt,
          width,
          height,
        });
      }
    }

    return figures;
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

      // 已经是绝对 URL
      if (imgSrc.startsWith("http://") || imgSrc.startsWith("https://")) {
        return imgSrc;
      }

      // 协议相对 URL
      if (imgSrc.startsWith("//")) {
        return "https:" + imgSrc;
      }

      // 相对 URL，需要基于 baseUrl 解析
      const base = new URL(baseUrl);
      return new URL(imgSrc, base).href;
    } catch (error) {
      this.logger.debug(`Failed to resolve URL: ${imgSrc} from ${baseUrl}`);
      return null;
    }
  }

  /**
   * 判断图片是否可能是图表
   */
  private isLikelyChart(url: string, caption: string, alt?: string): boolean {
    const combinedText =
      `${url || ""} ${caption || ""} ${alt || ""}`.toLowerCase();

    // 排除模式：明显不是图表的图片
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
    ];

    if (excludePatterns.some((pattern) => pattern.test(combinedText))) {
      return false;
    }

    // 包含模式：可能是图表的关键词
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
    ];

    // 如果包含图表关键词，保留
    if (includePatterns.some((pattern) => pattern.test(combinedText))) {
      return true;
    }

    // 如果有 caption 或 alt 文本，且长度足够，可能是有意义的图片
    if ((caption && caption.length > 10) || (alt && alt.length > 10)) {
      return true;
    }

    // 默认不包含
    return false;
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
