/**
 * Data Enrichment Service
 *
 * 数据增强服务：通过抓取完整网页内容来增强搜索结果
 *
 * 核心功能:
 * 1. 抓取搜索结果 Top N 条的完整网页内容
 * 2. 将 snippet (100-300字) 增强为完整内容 (3000字)
 * 3. 并行抓取 + 超时控制 + 降级处理
 *
 * 解决的问题:
 * - 原本 LLM 只能看到 snippet，被迫使用训练数据"编造"内容
 * - 增强后 LLM 可以基于实际网页内容生成报告
 */

import { Injectable, Logger } from "@nestjs/common";
// ★ 架构重构：通过 ToolRegistry 调用工具，不再直接调用 SearchService
import { ToolRegistry } from "@/modules/ai-engine/facade";
import type { ToolContext } from "@/modules/ai-engine/facade";
import type { DataSourceResult } from "../../types/data-source.types";
import type {
  EnrichedResult,
  ExtractedFigure,
} from "../../types/research.types";
import { FigureExtractorService } from "../report/figure-extractor.service";
import { LruMap } from "@/common/utils/lru-map";

/**
 * URL 验证结果
 */
export interface UrlValidationResult {
  url: string;
  isValid: boolean;
  statusCode?: number;
  errorReason?: string;
  /** 内容是否有意义（非错误页面） */
  hasContent: boolean;
}

/**
 * 数据增强选项
 */
export interface DataEnrichmentOptions {
  /** 要增强的 Top N 条结果，默认 5 */
  topN?: number;
  /** 每条内容的最大长度，默认 3000 */
  maxContentLength?: number;
  /** 单个 URL 抓取超时（毫秒），默认 10000 */
  fetchTimeout?: number;
  /** 是否并行抓取，默认 true */
  parallel?: boolean;
  /** ★ 是否提取图表，默认 true */
  enableFigures?: boolean;
}

/**
 * Cached fetch result for cross-dimension URL deduplication
 */
interface CachedFetchResult {
  fullContent: string | null;
  contentSource: "fetched" | "snippet";
  urlValid: boolean;
  extractedFigures: ExtractedFigure[];
}

@Injectable()
export class DataEnrichmentService {
  private readonly logger = new Logger(DataEnrichmentService.name);

  /**
   * ★ v4: 全局证据池 — 跨维度 URL 去重缓存
   * Key: normalized URL, Value: fetched content + figures
   * 同一报告生成过程中，同一 URL 只抓取一次
   * 通过 clearFetchCache() 在报告生成开始时清空
   * 使用 LruMap 防止异常路径下内存无限增长
   */
  private readonly fetchCache = new LruMap<string, CachedFetchResult>(500);

  // ★ 架构重构：通过 ToolRegistry 调用工具，不再直接依赖 SearchService
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly figureExtractor: FigureExtractorService,
  ) {}

  /**
   * ★ v4: 清空 URL 抓取缓存（每次报告生成前调用）
   */
  clearFetchCache(): void {
    const size = this.fetchCache.size;
    this.fetchCache.clear();
    if (size > 0) {
      this.logger.log(
        `[GlobalEvidencePool] Cleared fetch cache (${size} entries)`,
      );
    }
  }

  /**
   * ★ v4: 获取缓存统计
   */
  getFetchCacheStats(): { size: number; urls: string[] } {
    return {
      size: this.fetchCache.size,
      urls: [...this.fetchCache.keys()],
    };
  }

  /**
   * ★ v4: URL 规范化（用于缓存 key）
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove trailing slash, fragment, common tracking params
      parsed.hash = "";
      for (const param of [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "ref",
        "source",
      ]) {
        parsed.searchParams.delete(param);
      }
      return parsed.toString().replace(/\/+$/, "");
    } catch {
      return url.trim().replace(/\/+$/, "");
    }
  }

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
   * 增强搜索结果：抓取 Top N 条结果的完整网页内容
   *
   * @param results 原始搜索结果
   * @param options 增强选项
   * @returns 增强后的结果列表（保持原有顺序）
   */
  async enrichSearchResults(
    results: DataSourceResult[],
    options: DataEnrichmentOptions = {},
  ): Promise<EnrichedResult[]> {
    const {
      topN = 5,
      maxContentLength = 3000,
      fetchTimeout = 10000,
      parallel = true,
      enableFigures = true, // ★ 默认开启图表提取
    } = options;

    if (results.length === 0) {
      return [];
    }

    this.logger.log(
      `Enriching ${Math.min(topN, results.length)} of ${results.length} search results`,
    );

    const startTime = Date.now();

    // 分离需要增强的结果和不需要增强的结果
    const toEnrich = results.slice(0, topN);
    const remaining = results.slice(topN);

    // 抓取完整内容
    let enrichedTop: EnrichedResult[];
    if (parallel) {
      enrichedTop = await this.enrichParallel(
        toEnrich,
        maxContentLength,
        fetchTimeout,
        enableFigures,
      );
    } else {
      enrichedTop = await this.enrichSequential(
        toEnrich,
        maxContentLength,
        fetchTimeout,
        enableFigures,
      );
    }

    // 转换剩余的结果（不抓取完整内容）
    const enrichedRemaining: EnrichedResult[] = remaining.map((item) => ({
      ...item,
      fullContent: null,
      contentSource: "snippet" as const,
      urlValid: true, // 假设未验证的 URL 有效（来自搜索引擎）
    }));

    const executionTime = Date.now() - startTime;
    const successCount = enrichedTop.filter(
      (r) => r.contentSource === "fetched",
    ).length;

    this.logger.log(
      `Enrichment completed: ${successCount}/${toEnrich.length} URLs fetched successfully in ${executionTime}ms`,
    );

    return [...enrichedTop, ...enrichedRemaining];
  }

  /**
   * 并行抓取完整内容
   */
  private async enrichParallel(
    results: DataSourceResult[],
    maxContentLength: number,
    fetchTimeout: number,
    enableFigures: boolean,
  ): Promise<EnrichedResult[]> {
    const enrichPromises = results.map((result) =>
      this.enrichSingleResult(
        result,
        maxContentLength,
        fetchTimeout,
        enableFigures,
      ),
    );

    return Promise.all(enrichPromises);
  }

  /**
   * 顺序抓取完整内容（用于调试或避免 IP 限制）
   */
  private async enrichSequential(
    results: DataSourceResult[],
    maxContentLength: number,
    fetchTimeout: number,
    enableFigures: boolean,
  ): Promise<EnrichedResult[]> {
    const enrichedResults: EnrichedResult[] = [];

    for (const result of results) {
      const enriched = await this.enrichSingleResult(
        result,
        maxContentLength,
        fetchTimeout,
        enableFigures,
      );
      enrichedResults.push(enriched);
    }

    return enrichedResults;
  }

  /**
   * 增强单个搜索结果
   * ★ 架构重构：通过 ToolRegistry 调用 web-scraper 工具
   * @param enableFigures 是否提取图表（来自 topicConfig）
   */
  private async enrichSingleResult(
    result: DataSourceResult,
    maxContentLength: number,
    fetchTimeout: number,
    enableFigures: boolean = true,
  ): Promise<EnrichedResult> {
    // ★ v4: 检查全局缓存（跨维度 URL 去重）
    const cacheKey = this.normalizeUrl(result.url);
    const cached = this.fetchCache.get(cacheKey);
    if (cached) {
      this.logger.debug(
        `[GlobalEvidencePool] Cache hit for ${result.domain || result.url} (${cached.fullContent?.length || 0} chars, ${cached.extractedFigures.length} figures)`,
      );
      return {
        ...result,
        fullContent: cached.fullContent,
        contentSource: cached.contentSource,
        urlValid: cached.urlValid,
        extractedFigures: cached.extractedFigures,
      };
    }

    // ★ 通过 ToolRegistry 获取 web-scraper 工具
    const webScraperTool = this.toolRegistry.tryGet("web-scraper");
    if (!webScraperTool) {
      this.logger.warn(
        "[enrichSingleResult] web-scraper tool not registered, falling back to snippet",
      );
      return {
        ...result,
        fullContent: result.snippet || null,
        contentSource: "snippet",
        urlValid: false,
      };
    }

    try {
      // 使用 Promise.race 实现超时控制
      const fetchPromise = webScraperTool.execute(
        {
          url: result.url,
          maxLength: maxContentLength,
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
          fetchTimeout,
        ),
      );

      const toolResult = await Promise.race([fetchPromise, timeoutPromise]);

      if (toolResult.success && toolResult.data) {
        const scraperData = toolResult.data as {
          content: string;
          html?: string;
          title?: string;
          success: boolean;
        };

        if (scraperData.success && scraperData.content) {
          // 成功抓取到内容
          const truncatedContent = scraperData.content.slice(
            0,
            maxContentLength,
          );
          // ★ 检查内容是否有意义（非错误页面）
          const isValid = this.isContentMeaningful(truncatedContent);

          // ★ 提取图表：使用 HTML 内容（如果可用）
          // ★ 仅当 enableFigures=true 时提取图表
          let extractedFigures: ExtractedFigure[] = [];
          if (enableFigures) {
            const htmlContent = scraperData.html || scraperData.content;
            if (htmlContent) {
              extractedFigures = this.figureExtractor.extractFigures(
                result.url,
                htmlContent,
              );
              // ★ 过滤掉没有有效 imageUrl 的图表
              const beforeFilter = extractedFigures.length;
              extractedFigures = extractedFigures.filter(
                (f) => f.imageUrl && f.imageUrl.trim(),
              );
              if (beforeFilter > 0) {
                this.logger.debug(
                  `Extracted ${beforeFilter} figures from ${result.domain || result.url}, ${beforeFilter - extractedFigures.length} filtered (no URL), ${extractedFigures.length} valid`,
                );
              }
            }
          }

          this.logger.debug(
            `Fetched ${truncatedContent.length} chars from ${result.domain || result.url}, valid: ${isValid}, figures: ${extractedFigures.length}`,
          );

          // ★ v4: 写入全局缓存
          this.fetchCache.set(cacheKey, {
            fullContent: truncatedContent,
            contentSource: "fetched",
            urlValid: isValid,
            extractedFigures,
          });

          return {
            ...result,
            fullContent: truncatedContent,
            contentSource: "fetched",
            urlValid: isValid,
            extractedFigures,
          };
        }
      }

      // 抓取失败，降级到 snippet
      this.logger.debug(
        `Failed to fetch ${result.url}: ${toolResult.error?.message || "unknown error"}, falling back to snippet`,
      );

      // ★ v4: 缓存失败结果，避免其他维度重复尝试同一 URL
      this.fetchCache.set(cacheKey, {
        fullContent: result.snippet || null,
        contentSource: "snippet",
        urlValid: false,
        extractedFigures: [],
      });

      return {
        ...result,
        fullContent: result.snippet || null,
        contentSource: "snippet",
        urlValid: false, // 抓取失败，标记为无效
      };
    } catch (error) {
      // 异常情况，降级到 snippet
      this.logger.warn(
        `Error enriching ${result.url}: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        ...result,
        fullContent: result.snippet || null,
        contentSource: "snippet",
        urlValid: false, // 异常情况，标记为无效
      };
    }
  }

  /**
   * 获取增强统计信息
   */
  getEnrichmentStats(results: EnrichedResult[]): {
    total: number;
    fetched: number;
    snippetOnly: number;
    avgContentLength: number;
    validUrls: number;
    invalidUrls: number;
  } {
    const fetched = results.filter((r) => r.contentSource === "fetched").length;
    const snippetOnly = results.filter(
      (r) => r.contentSource === "snippet",
    ).length;
    // ★ 统计有效和无效 URL
    const validUrls = results.filter((r) => r.urlValid).length;
    const invalidUrls = results.filter((r) => !r.urlValid).length;

    const totalContentLength = results.reduce(
      (sum, r) => sum + (r.fullContent?.length || 0),
      0,
    );
    const avgContentLength =
      results.length > 0 ? Math.round(totalContentLength / results.length) : 0;

    return {
      total: results.length,
      fetched,
      snippetOnly,
      avgContentLength,
      validUrls,
      invalidUrls,
    };
  }

  /**
   * 批量验证 URL 有效性
   * ★ 确保引用链接真实可访问
   *
   * @param urls URL 列表
   * @param timeout 单个 URL 验证超时（毫秒）
   * @returns 验证结果列表
   */
  async validateUrls(
    urls: string[],
    timeout: number = 5000,
  ): Promise<UrlValidationResult[]> {
    this.logger.log(`Validating ${urls.length} URLs`);

    const validationPromises = urls.map((url) =>
      this.validateSingleUrl(url, timeout),
    );

    const results = await Promise.all(validationPromises);

    const validCount = results.filter((r) => r.isValid).length;
    this.logger.log(`URL validation: ${validCount}/${urls.length} valid`);

    return results;
  }

  /**
   * 验证单个 URL
   * ★ 架构重构：通过 ToolRegistry 调用 web-scraper 工具
   */
  private async validateSingleUrl(
    url: string,
    timeout: number,
  ): Promise<UrlValidationResult> {
    // ★ 通过 ToolRegistry 获取 web-scraper 工具
    const webScraperTool = this.toolRegistry.tryGet("web-scraper");
    if (!webScraperTool) {
      return {
        url,
        isValid: false,
        hasContent: false,
        errorReason: "web-scraper tool not available",
      };
    }

    try {
      // 使用 web-scraper 工具来验证 URL
      const fetchPromise = webScraperTool.execute(
        { url, maxLength: 1000 }, // 验证时只需少量内容
        this.createToolContext("web-scraper"),
      );
      const timeoutPromise = new Promise<{
        success: false;
        error: { message: string };
      }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              success: false,
              error: { message: "Validation timeout" },
            }),
          timeout,
        ),
      );

      const toolResult = await Promise.race([fetchPromise, timeoutPromise]);

      if (toolResult.success && toolResult.data) {
        const scraperData = toolResult.data as {
          content: string;
          success: boolean;
        };

        if (scraperData.success && scraperData.content) {
          // 检查内容是否有意义（不是错误页面）
          const hasContent = this.isContentMeaningful(scraperData.content);

          return {
            url,
            isValid: true,
            hasContent,
            statusCode: 200,
          };
        }
      }

      return {
        url,
        isValid: false,
        hasContent: false,
        errorReason: toolResult.error?.message || "Failed to fetch content",
      };
    } catch (error) {
      return {
        url,
        isValid: false,
        hasContent: false,
        errorReason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 检查内容是否有意义（非错误页面、非空内容）
   */
  private isContentMeaningful(content: string): boolean {
    if (!content || content.length < 100) {
      return false;
    }

    // 检查是否为常见错误页面
    const errorPatterns = [
      /404\s*(not\s*found|page\s*not\s*found|error)/i,
      /403\s*(forbidden|access\s*denied)/i,
      /500\s*(internal\s*server\s*error)/i,
      /page\s*(not\s*found|does\s*not\s*exist)/i,
      /access\s*denied/i,
      /error\s*occurred/i,
      /this\s*page\s*(is\s*)?unavailable/i,
    ];

    for (const pattern of errorPatterns) {
      if (pattern.test(content.substring(0, 500))) {
        return false;
      }
    }

    return true;
  }

  /**
   * 过滤无效 URL 的搜索结果
   * ★ 确保只使用有效的、可访问的来源
   *
   * @param results 原始搜索结果
   * @returns 过滤后只包含有效 URL 的结果
   */
  async filterValidResults(
    results: DataSourceResult[],
  ): Promise<DataSourceResult[]> {
    const urls = results.map((r) => r.url);
    const validationResults = await this.validateUrls(urls);

    // 创建 URL -> 有效性 映射
    const validityMap = new Map<string, boolean>();
    validationResults.forEach((v) => {
      validityMap.set(v.url, v.isValid && v.hasContent);
    });

    // 过滤出有效的结果
    const validResults = results.filter((r) => validityMap.get(r.url) === true);

    this.logger.log(
      `Filtered results: ${validResults.length}/${results.length} have valid URLs`,
    );

    return validResults;
  }
}
