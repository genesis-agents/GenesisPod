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

// ==================== Constants ====================

/** 最小图片文件大小（字节）：低于此阈值的栅格图片视为缩略图/占位符 */
const MIN_IMAGE_BYTES = 15_000;

/** HEAD 请求超时（毫秒） */
const VALIDATE_TIMEOUT_MS = 5_000;

/** URL 路径中的最小图片宽度（低于此视为缩略图 URL） */
const MIN_URL_DIMENSION_WIDTH = 400;

/** 图片下载超时（毫秒） */
const DOWNLOAD_TIMEOUT_MS = 10_000;

/** 内联 base64 的最大图片大小（字节）：超过此大小保留原始 URL */
const MAX_INLINE_IMAGE_BYTES = 500_000;

/**
 * Figure Extractor Service
 *
 * 从 HTML 内容中提取图片和图表：
 * 1. 提取 <img> 和 <figure> 标签
 * 2. 过滤非图表图片（logo、icon、avatar 等）
 * 3. 分类图表类型
 * 4. 解析相对 URL 为绝对 URL
 * 5. ★ v4.5: 异步校验图片可访问性 + 分辨率（宁缺毋滥）
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

      // ★ v4.5: 异步校验图片可访问性 + 质量
      const validated = await this.validateAndUpgradeFigures(figures);
      return validated;
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
   * 从 img 标签中提取最佳 src（优先 lazy-load 属性，其次 srcset 高清版）
   */
  private extractBestSrc(imgTag: string): string | null {
    // 1. Prefer lazy-load attributes which contain the real high-res URL
    for (const attr of ["data-src", "data-original", "data-lazy-src"]) {
      const match = imgTag.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"));
      if (match && !match[1].startsWith("data:")) {
        return match[1];
      }
    }

    // 2. ★ v4.5: 尝试从 srcset 提取最高分辨率版本
    const srcsetUrl = this.extractHighestResSrcset(imgTag);
    if (srcsetUrl) return srcsetUrl;

    return null;
  }

  /**
   * ★ v4.5: 从 srcset 属性中解析最高分辨率的图片 URL
   *
   * srcset 格式: "url1 800w, url2 400w" 或 "url1 2x, url2 1x"
   * 选择宽度 >= 600w 的最大候选项
   */
  private extractHighestResSrcset(imgTag: string): string | null {
    const srcsetMatch = imgTag.match(/srcset=["']([^"']+)["']/i);
    if (!srcsetMatch) return null;

    const srcset = srcsetMatch[1];
    const candidates = srcset
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    let bestUrl = "";
    let bestSize = 0;

    for (const candidate of candidates) {
      const parts = candidate.trim().split(/\s+/);
      if (parts.length < 1) continue;
      const url = parts[0];
      if (!url || url.startsWith("data:")) continue;

      const descriptor = parts[1] || "1x";
      let size = 0;
      if (descriptor.endsWith("w")) {
        size = parseInt(descriptor, 10);
      } else if (descriptor.endsWith("x")) {
        size = parseFloat(descriptor) * 1000; // normalize to comparable scale
      }

      if (size > bestSize) {
        bestSize = size;
        bestUrl = url;
      }
    }

    // 仅当最佳候选宽度 >= 600px 时才使用（避免选到小缩略图）
    return bestSize >= 600 ? bestUrl : null;
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

      // ★ v4.4: 解码 HTML 实体（&amp; → &, &#39; → ' 等）
      // HTML 中提取的 URL 常包含 &amp; 导致参数腐蚀
      imgSrc = imgSrc
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

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
      // ★ v4.4: 排除装饰性图片和通用页面元素
      /author[-_]?photo/i,
      /headshot/i,
      /portrait/i,
      /background[-_]?image/i,
      /bg[-_]?image/i,
      /decorative/i,
      /ornament/i,
      /pattern[-_]?bg/i,
      /newsletter/i,
      /subscribe/i,
      /signup/i,
      /cta[-_]/i,
      /promo/i,
      /sponsor/i,
      /affiliate/i,
      /wp-content\/uploads.*-\d+x\d+\./i, // WordPress 缩略图
      /gravatar\.com/i, // 头像
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

    // ★ v4.4: 有尺寸信息时，过大过小都可疑
    // 正常内容图片通常 300-2000px 宽
    if (width && (width < 100 || width > 3000)) {
      return false;
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

  // ==================== v4.5: Image Validation ====================

  /**
   * ★ v4.5: 异步校验并升级提取的图片列表
   *
   * 对每个候选图片执行：
   * 1. 尝试 CDN URL 升级（识别缩略图参数，替换为高清版本）
   * 2. HEAD 请求验证可访问性（非 200 直接丢弃）
   * 3. Content-Length 校验（栅格图片 < 15KB 丢弃）
   * 4. URL 路径中的尺寸提示校验（< 400px 宽丢弃）
   *
   * 原则：宁缺毋滥，不可访问或质量不达标的一律丢弃
   */
  async validateAndUpgradeFigures(
    figures: ExtractedFigure[],
  ): Promise<ExtractedFigure[]> {
    if (figures.length === 0) return [];

    const results = await Promise.allSettled(
      figures.map((fig) => this.validateSingleFigure(fig)),
    );

    const validated = results
      .filter(
        (r): r is PromiseFulfilledResult<ExtractedFigure | null> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value)
      .filter((fig): fig is ExtractedFigure => fig !== null);

    if (figures.length !== validated.length) {
      this.logger.log(
        `[validateFigures] ${figures.length} candidates → ${validated.length} validated ` +
          `(${figures.length - validated.length} rejected)`,
      );
    }

    return validated;
  }

  /**
   * 校验单个图片：尝试升级 URL → HEAD 校验 → 大小/尺寸校验 → 下载内联
   * 返回 null 表示该图片应被丢弃
   *
   * ★ v5: 校验通过后下载图片转 base64 data URL，确保报告中的图片永久可用
   */
  private async validateSingleFigure(
    figure: ExtractedFigure,
  ): Promise<ExtractedFigure | null> {
    const originalUrl = figure.imageUrl;

    // 已经是 data URL，直接通过
    if (originalUrl.startsWith("data:")) {
      return figure;
    }

    // 1. 尝试 CDN URL 升级（获取更高分辨率版本）
    let validatedFigure: ExtractedFigure | null = null;
    const upgradedUrl = this.tryUpgradeImageUrl(originalUrl);
    if (upgradedUrl) {
      const upgradeResult = await this.headCheck(upgradedUrl);
      if (upgradeResult.ok) {
        this.logger.debug(
          `[validateFigure] Upgraded URL: ${originalUrl.substring(0, 80)} → ${upgradedUrl.substring(0, 80)}`,
        );
        validatedFigure = this.applyValidationResult(
          { ...figure, imageUrl: upgradedUrl },
          upgradeResult,
        );
      }
    }

    // 2. 校验原始 URL（如果升级失败）
    if (!validatedFigure) {
      const result = await this.headCheck(originalUrl);
      if (!result.ok) {
        this.logger.debug(
          `[validateFigure] REJECTED (HTTP ${result.status}): ${originalUrl.substring(0, 120)}`,
        );
        return null;
      }
      validatedFigure = this.applyValidationResult(figure, result);
    }

    if (!validatedFigure) return null;

    // 3. ★ 下载图片并转为 base64 data URL（确保永久可用）
    const inlined = await this.downloadAndInlineImage(validatedFigure.imageUrl);
    if (inlined) {
      return { ...validatedFigure, imageUrl: inlined };
    }

    // 下载失败时保留原始 URL（降级但不丢弃）
    this.logger.warn(
      `[validateFigure] Failed to inline image, keeping original URL: ${validatedFigure.imageUrl.substring(0, 100)}`,
    );
    return validatedFigure;
  }

  /**
   * 根据 HEAD 响应结果判断图片是否合格
   */
  private applyValidationResult(
    figure: ExtractedFigure,
    result: HeadCheckResult,
  ): ExtractedFigure | null {
    const url = figure.imageUrl;
    const contentType = result.contentType || "";

    // SVG/矢量图跳过大小检查（矢量图无分辨率问题）
    if (contentType.includes("svg")) {
      return figure;
    }

    // 栅格图片：Content-Length 校验
    if (result.contentLength > 0 && result.contentLength < MIN_IMAGE_BYTES) {
      this.logger.debug(
        `[validateFigure] REJECTED (too small: ${result.contentLength} bytes < ${MIN_IMAGE_BYTES}): ${url.substring(0, 120)}`,
      );
      return null;
    }

    // URL 路径中的尺寸提示校验
    const urlDimensions = this.extractDimensionsFromUrl(url);
    if (urlDimensions && urlDimensions.width < MIN_URL_DIMENSION_WIDTH) {
      this.logger.debug(
        `[validateFigure] REJECTED (URL hints small: ${urlDimensions.width}x${urlDimensions.height}): ${url.substring(0, 120)}`,
      );
      return null;
    }

    return figure;
  }

  /**
   * 对图片 URL 发送 HEAD 请求，校验可访问性
   */
  private async headCheck(url: string): Promise<HeadCheckResult> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "follow",
          headers: {
            // 伪装浏览器 UA，部分 CDN 拒绝无 UA 请求
            "User-Agent":
              "Mozilla/5.0 (compatible; GenesisBot/1.0; +https://genesis-ai-labs.org)",
          },
        });
        clearTimeout(timer);

        if (!response.ok) {
          return { ok: false, status: response.status, contentLength: 0 };
        }

        const contentLength = parseInt(
          response.headers.get("content-length") || "0",
          10,
        );
        const contentType = response.headers.get("content-type") || "";

        return {
          ok: true,
          status: response.status,
          contentLength,
          contentType,
        };
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // 网络错误、超时、DNS 失败等
      return { ok: false, status: 0, contentLength: 0 };
    }
  }

  /**
   * ★ v5: 下载图片并转为 base64 data URL
   *
   * 确保报告中的图片永久可用，不依赖外部 URL 的持续有效性。
   * 超过 MAX_INLINE_IMAGE_BYTES 的图片返回 null（保留原始 URL）。
   */
  private async downloadAndInlineImage(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; GenesisBot/1.0; +https://genesis-ai-labs.org)",
            Accept: "image/*",
          },
        });
        clearTimeout(timer);

        if (!response.ok) {
          this.logger.debug(
            `[downloadImage] HTTP ${response.status}: ${url.substring(0, 100)}`,
          );
          return null;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) {
          this.logger.debug(
            `[downloadImage] Not an image (${contentType}): ${url.substring(0, 100)}`,
          );
          return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const bytes = Buffer.from(arrayBuffer);

        if (bytes.length > MAX_INLINE_IMAGE_BYTES) {
          this.logger.debug(
            `[downloadImage] Too large to inline (${(bytes.length / 1024).toFixed(0)}KB > ${(MAX_INLINE_IMAGE_BYTES / 1024).toFixed(0)}KB): ${url.substring(0, 100)}`,
          );
          return null;
        }

        if (bytes.length < MIN_IMAGE_BYTES) {
          this.logger.debug(
            `[downloadImage] Downloaded image too small (${bytes.length} bytes), likely placeholder: ${url.substring(0, 100)}`,
          );
          return null;
        }

        const base64 = bytes.toString("base64");
        // 规范化 MIME 类型
        const mime = contentType.split(";")[0].trim();
        this.logger.debug(
          `[downloadImage] Inlined ${(bytes.length / 1024).toFixed(0)}KB image as ${mime}: ${url.substring(0, 80)}`,
        );
        return `data:${mime};base64,${base64}`;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  }

  /**
   * ★ v4.5: 尝试升级 CDN URL 到更高分辨率版本
   *
   * 识别常见 CDN 的缩略图参数并替换：
   * - Brightspot: /resize/WxH!/ → 去掉 resize
   * - 通用: ?w=N, &width=N → 提升到 1200
   * - 通用: /quality/N/ → 提升到 90
   */
  private tryUpgradeImageUrl(url: string): string | null {
    let upgraded = url;
    let changed = false;

    // Brightspot CDN: /resize/WxH!/ 或 /resize/WxH/
    if (/\/resize\/\d+x\d+!?\//.test(upgraded)) {
      upgraded = upgraded.replace(
        /\/resize\/\d+x\d+!?\//,
        "/resize/1200x800!/",
      );
      changed = true;
    }

    // 通用 CDN 宽度参数: ?w=N, &w=N, ?width=N, &width=N（仅当值较小时升级）
    const widthMatch = upgraded.match(/([?&])(?:w|width)=(\d+)/);
    if (widthMatch && parseInt(widthMatch[2], 10) < MIN_URL_DIMENSION_WIDTH) {
      upgraded = upgraded.replace(
        /([?&])(?:w|width)=\d+/,
        `${widthMatch[1]}w=1200`,
      );
      changed = true;
    }

    // 通用 CDN 高度参数: 跟随宽度一起调整
    const heightMatch = upgraded.match(/([?&])(?:h|height)=(\d+)/);
    if (changed && heightMatch && parseInt(heightMatch[2], 10) < 400) {
      upgraded = upgraded.replace(
        /([?&])(?:h|height)=\d+/,
        `${heightMatch[1]}h=800`,
      );
    }

    // 低质量参数: /quality/N/ → /quality/90/
    const qualityMatch = upgraded.match(/\/quality\/(\d+)\//);
    if (qualityMatch && parseInt(qualityMatch[1], 10) < 80) {
      upgraded = upgraded.replace(/\/quality\/\d+\//, "/quality/90/");
      changed = true;
    }

    return changed ? upgraded : null;
  }

  /**
   * ★ v4.5: 从 URL 路径中提取尺寸提示
   *
   * 识别常见模式：
   * - /292x220.png（路径中的 WxH）
   * - /resize/320x214!/
   * - ?w=300&h=200
   */
  private extractDimensionsFromUrl(
    url: string,
  ): { width: number; height: number } | null {
    // 路径中的 WxH 模式（如 /292x220.png, /320x214!/）
    const pathMatch = url.match(/\/(\d{2,4})x(\d{2,4})[.!/]/);
    if (pathMatch) {
      return {
        width: parseInt(pathMatch[1], 10),
        height: parseInt(pathMatch[2], 10),
      };
    }

    // 查询参数中的尺寸
    const wMatch = url.match(/[?&](?:w|width)=(\d+)/);
    const hMatch = url.match(/[?&](?:h|height)=(\d+)/);
    if (wMatch && hMatch) {
      return {
        width: parseInt(wMatch[1], 10),
        height: parseInt(hMatch[1], 10),
      };
    }
    // 只有宽度参数
    if (wMatch) {
      return {
        width: parseInt(wMatch[1], 10),
        height: 0,
      };
    }

    return null;
  }
}

// ==================== Internal Types ====================

interface HeadCheckResult {
  ok: boolean;
  status: number;
  contentLength: number;
  contentType?: string;
}
