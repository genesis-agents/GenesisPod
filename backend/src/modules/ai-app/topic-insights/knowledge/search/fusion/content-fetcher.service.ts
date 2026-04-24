/**
 * Content Fetcher Service
 *
 * F-6 · Baseline (`aaff7b15e`) DataEnrichmentService 的核心能力重构。
 *
 * 职责范围（故意收敛）：
 *   1. 抓取搜索结果 Top N + 额外高可信度 extras 的**完整网页内容**
 *      （snippet 100-300 字 → fullContent 3000 字）
 *   2. LRU fetchCache 做**跨维度 URL 去重**（同一报告同 URL 只抓一次）
 *   3. URL 有效性验证（HTTP status + 内容 meaningful 检测）
 *   4. 可选：`filterValidResults(results)` — 预过滤出可访问的 URL
 *
 * 不包含（由其他 service 负责）：
 *   - 图表/图片提取 → `artifacts/report/enhancement/figure-extractor.service.ts`
 *   - 图片相关性 → `artifacts/report/enhancement/figure-relevance.service.ts`
 *   - 图片补搜 → 待 Leader tool / image-search tool 接入
 *
 * 为什么恢复：harness 迁移 (bb5fb8b9a) 把 baseline 903 行的 enrichSearchResults
 * 降到 57 行 `content-enrichment.service.ts`，仅补 title/domain 默认值 —
 * **零网页抓取**。LLM 只看到 100-300 字 snippet，被迫凭训练数据编造 —
 * 这是用户反馈"报告内容脱离证据"的根本原因之一。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { ToolRegistry, type ToolContext } from "@/modules/ai-engine/facade";
import { withTimeoutFallback } from "@/common/utils/timeout.utils";
import { LruMap } from "@/common/utils/lru-map";
import type { DataSourceResult } from "@/modules/ai-app/topic-insights/shared/types/data-source.types";
import type { EnrichedResult } from "@/modules/ai-app/topic-insights/shared/types/research.types";
import { assessCredibility } from "@/modules/ai-app/topic-insights/shared/utils/credibility.utils";

// ─── Tunable defaults ─────────────────────────────────────────────────────

const DEFAULT_TOP_N = 5;
const DEFAULT_MAX_CONTENT = 3000;
const DEFAULT_FETCH_TIMEOUT = 10_000;
const DEFAULT_VALIDATE_TIMEOUT = 5_000;

/** extras: 前 topN 之外的高可信度源（domain 40 + sourceType 15+ = 55+） */
const HIGH_CREDIBILITY_THRESHOLD = 55;
/** extras 上限 */
const MAX_EXTRA_HIGH_CRED = 10;

/** 缓存容量 — 单次报告典型 6 维 × 25 结果 × 3 维度 = 450 左右，留余量 */
const FETCH_CACHE_SIZE = 500;

// ─── Types ────────────────────────────────────────────────────────────────

export interface ContentFetchOptions {
  /** 抓取前 N 条（按搜索排名） */
  topN?: number;
  /** 单条截断最大字数 */
  maxContentLength?: number;
  /** 单 URL 抓取超时（ms） */
  fetchTimeout?: number;
  /** 并行抓取（默认 true） */
  parallel?: boolean;
}

export interface UrlValidationResult {
  url: string;
  isValid: boolean;
  statusCode?: number;
  errorReason?: string;
  /** 内容 meaningful？（非 404/403 错误页面） */
  hasContent: boolean;
}

interface CachedFetchResult {
  fullContent: string | null;
  contentSource: "fetched" | "snippet";
  urlValid: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────

@Injectable()
export class ContentFetcherService {
  private readonly logger = new Logger(ContentFetcherService.name);

  /**
   * 全局抓取缓存（LRU 500）。
   * Key: normalized URL （去掉 utm_*、fragment、trailing slash）
   * 同一 Mission 内多维度撞到同一 URL 只抓一次；不同 Mission 之间由 LRU 驱逐。
   */
  private readonly fetchCache = new LruMap<string, CachedFetchResult>(
    FETCH_CACHE_SIZE,
  );

  constructor(@Optional() private readonly toolRegistry?: ToolRegistry) {}

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * 为一批搜索结果抓取完整内容。
   *
   * 选取策略：
   *   组 A = 前 topN（保搜索引擎相关性信号）
   *   组 B = 组 A 之外按 assessCredibility ≥ 55 的前 MAX_EXTRA_HIGH_CRED 条
   *   实际抓取 = A ∪ B
   *   余下 results 保留原 snippet（contentSource="snippet"）。
   *
   * 返回值**保留原搜索排序**（被抓的放前面以便 downstream 按排序消费）。
   */
  async enrichResults(
    results: DataSourceResult[],
    options: ContentFetchOptions = {},
  ): Promise<EnrichedResult[]> {
    if (results.length === 0) return [];

    const topN = options.topN ?? DEFAULT_TOP_N;
    const maxContentLength = options.maxContentLength ?? DEFAULT_MAX_CONTENT;
    const fetchTimeout = options.fetchTimeout ?? DEFAULT_FETCH_TIMEOUT;
    const parallel = options.parallel !== false;

    if (!this.toolRegistry) {
      // No ToolRegistry (e.g. test env) — passthrough as snippet-only
      return results.map((r) => ({
        ...r,
        fullContent: r.snippet || null,
        contentSource: "snippet" as const,
        urlValid: true,
      }));
    }

    const started = Date.now();

    // 双通道选取
    const topSlice = results.slice(0, topN);
    const topUrls = new Set(topSlice.map((r) => r.url));
    const extras = results
      .slice(topN)
      .filter((r) => assessCredibility(r) >= HIGH_CREDIBILITY_THRESHOLD)
      .slice(0, MAX_EXTRA_HIGH_CRED);

    if (extras.length > 0) {
      this.logger.log(
        `[enrichResults] +${extras.length} extra high-credibility sources beyond top${topN} ` +
          `(domains: ${extras
            .map((r) => r.domain ?? "—")
            .slice(0, 5)
            .join(", ")}${extras.length > 5 ? ", …" : ""})`,
      );
    }

    const toFetch = [...topSlice, ...extras.filter((r) => !topUrls.has(r.url))];
    const fetchedUrls = new Set(toFetch.map((r) => r.url));
    const remaining = results.filter((r) => !fetchedUrls.has(r.url));

    // 抓取
    const fetched = parallel
      ? await Promise.all(
          toFetch.map((r) =>
            this.fetchSingle(r, maxContentLength, fetchTimeout),
          ),
        )
      : await this.fetchSequential(toFetch, maxContentLength, fetchTimeout);

    // 剩余结果保 snippet
    const passthrough: EnrichedResult[] = remaining.map((r) => ({
      ...r,
      fullContent: null,
      contentSource: "snippet" as const,
      urlValid: true,
    }));

    const durationMs = Date.now() - started;
    const successCount = fetched.filter(
      (r) => r.contentSource === "fetched",
    ).length;
    this.logger.log(
      `[enrichResults] ${successCount}/${toFetch.length} fetched (${Math.round((successCount / Math.max(1, toFetch.length)) * 100)}%) in ${durationMs}ms`,
    );

    // 过滤掉 urlValid=false 的（抓失败/错误页面）避免污染下游证据池
    return [...fetched, ...passthrough].filter((r) => r.urlValid !== false);
  }

  /**
   * 批量验证 URL 可访问性 + 内容 meaningful。
   * 独立于 enrichResults — 用于 reference 链接的预校验。
   */
  async validateUrls(
    urls: string[],
    timeoutMs: number = DEFAULT_VALIDATE_TIMEOUT,
  ): Promise<UrlValidationResult[]> {
    this.logger.debug(`[validateUrls] validating ${urls.length} URLs`);
    const results = await Promise.all(
      urls.map((u) => this.validateSingleUrl(u, timeoutMs)),
    );
    const valid = results.filter((r) => r.isValid).length;
    this.logger.log(`[validateUrls] ${valid}/${urls.length} valid`);
    return results;
  }

  /** 过滤出有效（可访问且有内容）的 DataSourceResult */
  async filterValidResults(
    results: DataSourceResult[],
  ): Promise<DataSourceResult[]> {
    const urls = results.map((r) => r.url);
    const validations = await this.validateUrls(urls);
    const validityMap = new Map<string, boolean>();
    for (const v of validations) {
      validityMap.set(v.url, v.isValid && v.hasContent);
    }
    const filtered = results.filter((r) => validityMap.get(r.url) === true);
    this.logger.log(
      `[filterValidResults] ${filtered.length}/${results.length} pass HTTP+content gates`,
    );
    return filtered;
  }

  /** 清空抓取缓存（新 Mission 开始前调用） */
  clearCache(): void {
    const prev = this.fetchCache.size;
    this.fetchCache.clear();
    if (prev > 0) {
      this.logger.log(`[clearCache] cleared ${prev} cached URL entries`);
    }
  }

  /** 诊断用：缓存统计 */
  getCacheStats(): { size: number; capacity: number } {
    return { size: this.fetchCache.size, capacity: FETCH_CACHE_SIZE };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async fetchSequential(
    items: DataSourceResult[],
    maxContentLength: number,
    fetchTimeout: number,
  ): Promise<EnrichedResult[]> {
    const out: EnrichedResult[] = [];
    for (const item of items) {
      out.push(await this.fetchSingle(item, maxContentLength, fetchTimeout));
    }
    return out;
  }

  private async fetchSingle(
    item: DataSourceResult,
    maxContentLength: number,
    fetchTimeout: number,
  ): Promise<EnrichedResult> {
    const cacheKey = this.normalizeUrl(item.url);
    const cached = this.fetchCache.get(cacheKey);
    if (cached) {
      this.logger.debug(
        `[fetchSingle] cache hit ${item.domain ?? cacheKey} (${cached.fullContent?.length ?? 0} chars)`,
      );
      return { ...item, ...cached };
    }

    const scraper = this.toolRegistry?.tryGet("web-scraper");
    if (!scraper) {
      // No scraper — fallback snippet (not cached, may retry later mission)
      return {
        ...item,
        fullContent: item.snippet || null,
        contentSource: "snippet",
        urlValid: false,
      };
    }

    try {
      const toolResult = await withTimeoutFallback(
        scraper.execute(
          { url: item.url, maxLength: maxContentLength },
          this.makeToolContext("web-scraper"),
        ),
        fetchTimeout,
        {
          success: false,
          error: { code: "TIMEOUT", message: "fetch timeout" },
        } as Awaited<ReturnType<typeof scraper.execute>>,
      );

      if (toolResult.success && toolResult.data) {
        const data = toolResult.data as {
          content?: string;
          success?: boolean;
        };
        if (data.success && data.content) {
          const truncated = data.content.slice(0, maxContentLength);
          const isValid = this.isContentMeaningful(truncated);
          this.fetchCache.set(cacheKey, {
            fullContent: truncated,
            contentSource: "fetched",
            urlValid: isValid,
          });
          return {
            ...item,
            fullContent: truncated,
            contentSource: "fetched",
            urlValid: isValid,
          };
        }
      }

      // 抓取失败 → 缓存 snippet 失败标记，避免跨维度重试同一 URL
      this.fetchCache.set(cacheKey, {
        fullContent: item.snippet || null,
        contentSource: "snippet",
        urlValid: false,
      });
      this.logger.debug(
        `[fetchSingle] failed ${item.domain ?? item.url}: ${toolResult.error?.message ?? "unknown"}`,
      );
      return {
        ...item,
        fullContent: item.snippet || null,
        contentSource: "snippet",
        urlValid: false,
      };
    } catch (err) {
      // 异常不缓存 — 可能是临时错误
      this.logger.warn(
        `[fetchSingle] error ${item.url}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        ...item,
        fullContent: item.snippet || null,
        contentSource: "snippet",
        urlValid: false,
      };
    }
  }

  private async validateSingleUrl(
    url: string,
    timeoutMs: number,
  ): Promise<UrlValidationResult> {
    const scraper = this.toolRegistry?.tryGet("web-scraper");
    if (!scraper) {
      return {
        url,
        isValid: false,
        hasContent: false,
        errorReason: "web-scraper tool unavailable",
      };
    }
    try {
      const toolResult = await withTimeoutFallback(
        scraper.execute(
          { url, maxLength: 1000 },
          this.makeToolContext("web-scraper"),
        ),
        timeoutMs,
        {
          success: false,
          error: { code: "TIMEOUT", message: "validation timeout" },
        } as Awaited<ReturnType<typeof scraper.execute>>,
      );
      if (toolResult.success && toolResult.data) {
        const data = toolResult.data as {
          content?: string;
          success?: boolean;
        };
        if (data.success && data.content) {
          return {
            url,
            isValid: true,
            hasContent: this.isContentMeaningful(data.content),
            statusCode: 200,
          };
        }
      }
      return {
        url,
        isValid: false,
        hasContent: false,
        errorReason: toolResult.error?.message ?? "fetch failed",
      };
    } catch (err) {
      return {
        url,
        isValid: false,
        hasContent: false,
        errorReason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      u.hash = "";
      for (const p of [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "ref",
        "source",
      ]) {
        u.searchParams.delete(p);
      }
      return u.toString().replace(/\/+$/, "");
    } catch {
      return url.trim().replace(/\/+$/, "");
    }
  }

  private isContentMeaningful(content: string): boolean {
    if (!content || content.length < 100) return false;
    const ERROR_PATTERNS: RegExp[] = [
      /404\s*(not\s*found|page\s*not\s*found|error)/i,
      /403\s*(forbidden|access\s*denied)/i,
      /500\s*(internal\s*server\s*error)/i,
      /page\s*(not\s*found|does\s*not\s*exist)/i,
      /access\s*denied/i,
      /error\s*occurred/i,
      /this\s*page\s*(is\s*)?unavailable/i,
    ];
    const head = content.slice(0, 500);
    return !ERROR_PATTERNS.some((p) => p.test(head));
  }

  private makeToolContext(toolId: string): ToolContext {
    return {
      executionId: `${toolId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toolId,
      createdAt: new Date(),
      callerType: "orchestrator",
    };
  }
}
