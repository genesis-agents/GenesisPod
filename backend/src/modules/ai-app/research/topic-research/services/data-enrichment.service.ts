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
import { SearchService } from "@/modules/ai-engine/search/search.service";
import type { DataSourceResult } from "../types/data-source.types";
import type { EnrichedResult } from "../types/research.types";

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
}

@Injectable()
export class DataEnrichmentService {
  private readonly logger = new Logger(DataEnrichmentService.name);

  constructor(private readonly searchService: SearchService) {}

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
      );
    } else {
      enrichedTop = await this.enrichSequential(
        toEnrich,
        maxContentLength,
        fetchTimeout,
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
  ): Promise<EnrichedResult[]> {
    const enrichPromises = results.map((result) =>
      this.enrichSingleResult(result, maxContentLength, fetchTimeout),
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
  ): Promise<EnrichedResult[]> {
    const enrichedResults: EnrichedResult[] = [];

    for (const result of results) {
      const enriched = await this.enrichSingleResult(
        result,
        maxContentLength,
        fetchTimeout,
      );
      enrichedResults.push(enriched);
    }

    return enrichedResults;
  }

  /**
   * 增强单个搜索结果
   */
  private async enrichSingleResult(
    result: DataSourceResult,
    maxContentLength: number,
    fetchTimeout: number,
  ): Promise<EnrichedResult> {
    try {
      // 使用 Promise.race 实现超时控制
      const fetchPromise = this.searchService.fetchUrlContent(result.url);
      const timeoutPromise = new Promise<{ success: false; error: string }>(
        (resolve) =>
          setTimeout(
            () => resolve({ success: false, error: "Fetch timeout" }),
            fetchTimeout,
          ),
      );

      const fetchResult = await Promise.race([fetchPromise, timeoutPromise]);

      if (fetchResult.success && fetchResult.content) {
        // 成功抓取到内容
        const truncatedContent = fetchResult.content.slice(0, maxContentLength);
        // ★ 检查内容是否有意义（非错误页面）
        const isValid = this.isContentMeaningful(truncatedContent);

        this.logger.debug(
          `Fetched ${truncatedContent.length} chars from ${result.domain || result.url}, valid: ${isValid}`,
        );

        return {
          ...result,
          fullContent: truncatedContent,
          contentSource: "fetched",
          urlValid: isValid,
        };
      } else {
        // 抓取失败，降级到 snippet
        this.logger.debug(
          `Failed to fetch ${result.url}: ${fetchResult.error || "unknown error"}, falling back to snippet`,
        );

        return {
          ...result,
          fullContent: result.snippet || null,
          contentSource: "snippet",
          urlValid: false, // 抓取失败，标记为无效
        };
      }
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
   */
  private async validateSingleUrl(
    url: string,
    timeout: number,
  ): Promise<UrlValidationResult> {
    try {
      // 使用 fetchUrlContent 来验证 URL
      // 如果能成功获取内容，说明 URL 有效
      const fetchPromise = this.searchService.fetchUrlContent(url);
      const timeoutPromise = new Promise<{ success: false; error: string }>(
        (resolve) =>
          setTimeout(
            () => resolve({ success: false, error: "Validation timeout" }),
            timeout,
          ),
      );

      const result = await Promise.race([fetchPromise, timeoutPromise]);

      if (result.success && result.content) {
        // 检查内容是否有意义（不是错误页面）
        const hasContent = this.isContentMeaningful(result.content);

        return {
          url,
          isValid: true,
          hasContent,
          statusCode: 200,
        };
      } else {
        return {
          url,
          isValid: false,
          hasContent: false,
          errorReason: result.error || "Failed to fetch content",
        };
      }
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
