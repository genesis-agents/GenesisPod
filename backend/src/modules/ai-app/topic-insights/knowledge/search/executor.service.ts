/**
 * Search Executor Service
 *
 * Coordinates adapter execution through the global throttle.
 * Replaces the standardSearch() method from the old DataSourceRouterService.
 *
 * Sources run in parallel (via Promise.allSettled); within each source,
 * queries run sequentially with early stopping once maxResults is reached.
 * All calls go through GlobalSourceThrottleService for per-source queuing.
 */

import { Injectable, Logger } from "@nestjs/common";
import type { DataSourceType } from "@/modules/ai-app/topic-insights/shared/types/data-source.types";
import type {
  ISearchAdapter,
  AdapterSearchResult,
  SourceAwareQueries,
} from "./types";
import { GlobalSourceThrottleService } from "./global-source-throttle.service";
import {
  WebSearchAdapter,
  AcademicSearchAdapter,
  GithubSearchAdapter,
  HackernewsSearchAdapter,
  SocialSearchAdapter,
  PolicySearchAdapter,
  FinanceSearchAdapter,
  WeatherSearchAdapter,
  LocalSearchAdapter,
  IndustryReportSearchAdapter,
} from "./adapters";

@Injectable()
export class SearchExecutorService {
  private readonly logger = new Logger(SearchExecutorService.name);
  private readonly adapterMap: Map<DataSourceType, ISearchAdapter>;

  constructor(
    private readonly throttle: GlobalSourceThrottleService,
    webAdapter: WebSearchAdapter,
    academicAdapter: AcademicSearchAdapter,
    githubAdapter: GithubSearchAdapter,
    hackernewsAdapter: HackernewsSearchAdapter,
    socialAdapter: SocialSearchAdapter,
    policyAdapter: PolicySearchAdapter,
    financeAdapter: FinanceSearchAdapter,
    weatherAdapter: WeatherSearchAdapter,
    localAdapter: LocalSearchAdapter,
    industryReportAdapter: IndustryReportSearchAdapter,
  ) {
    this.adapterMap = new Map<DataSourceType, ISearchAdapter>();

    const allAdapters: ISearchAdapter[] = [
      webAdapter,
      academicAdapter,
      githubAdapter,
      hackernewsAdapter,
      socialAdapter,
      policyAdapter,
      financeAdapter,
      weatherAdapter,
      localAdapter,
      industryReportAdapter,
    ];

    for (const adapter of allAdapters) {
      this.adapterMap.set(adapter.sourceType, adapter);
      if (adapter.additionalTypes) {
        for (const type of adapter.additionalTypes) {
          this.adapterMap.set(type, adapter);
        }
      }
    }

    this.logger.log(
      `Adapter map initialized with ${this.adapterMap.size} source type entries`,
    );
  }

  /**
   * Search all requested sources in parallel.
   *
   * Sources run concurrently via Promise.allSettled; queries within a source
   * run sequentially with early stopping once maxResults accumulates.
   * Each individual search call is routed through the global throttle.
   *
   * @param sources       - List of DataSourceType values to search
   * @param queries       - Base and per-source query variants
   * @param options       - maxResults, since, signal, metadata
   * @returns             Map of source → AdapterSearchResult (only fulfilled sources included)
   */
  async searchAllSources(
    sources: DataSourceType[],
    queries: SourceAwareQueries,
    options: {
      maxResults: number;
      since?: Date;
      signal?: AbortSignal;
      metadata?: Record<string, unknown>;
    },
  ): Promise<Map<DataSourceType, AdapterSearchResult>> {
    const { maxResults, since, signal, metadata } = options;
    const startTime = Date.now();

    const sourceSearchTasks = sources.map(async (source) => {
      const adapter = this.adapterMap.get(source);

      if (!adapter) {
        this.logger.warn(`No adapter found for source type: ${source}`);
        return { source, result: null };
      }

      const sourceQueries =
        queries.sourceSpecific.get(source) ?? queries.baseQueries;

      const accumulatedItems: AdapterSearchResult["items"] = [];
      const queriesUsed: string[] = [];
      let totalDurationMs = 0;
      let lastError: string | undefined;

      for (const query of sourceQueries) {
        if (signal?.aborted) {
          this.logger.debug(
            `[${source}] Aborting query loop — signal cancelled`,
          );
          break;
        }

        if (accumulatedItems.length >= maxResults) {
          this.logger.debug(
            `[${source}] Early stop — accumulated ${accumulatedItems.length} >= maxResults ${maxResults}`,
          );
          break;
        }

        const remaining = maxResults - accumulatedItems.length;
        const formattedQuery = adapter.formatQuery(query);

        // F-3C · query 级 retry + exponential backoff
        // 单个 query 失败不放弃，重试 2 次（300ms, 900ms），让临时网络抖动、
        // 429/5xx 有机会恢复。仍失败后才继续下一个 query。
        const ran = await this.runQueryWithRetry(
          adapter,
          source,
          formattedQuery,
          remaining,
          since,
          metadata,
          signal,
        );
        queriesUsed.push(formattedQuery);
        if (ran.ok) {
          accumulatedItems.push(...ran.result.items);
          totalDurationMs += ran.result.sourceMetrics.durationMs;
          lastError = ran.result.sourceMetrics.error;
        } else {
          lastError = ran.error;
          if (signal?.aborted) break;
        }
      }

      // F-3A · per-source minResults 重搜
      // baseline DataSourceRouter standardSearch() 的关键能力：若某 source
      // 返回不足 minPerSource，用下一个可用 query 继续重搜（最多 2 轮）。
      // 这里我们已经把所有 queries 都跑了一遍；如果还是 <minPerSource，
      // orchestrator 会触发 widenWithWebFallback。这里的职责只是累计。

      if (queriesUsed.length === 0) {
        // No queries ran at all (e.g. empty sourceQueries)
        return { source, result: null };
      }

      const result: AdapterSearchResult = {
        items: accumulatedItems,
        sourceMetrics: {
          sourceId: adapter.sourceId,
          durationMs: totalDurationMs,
          queryUsed: queriesUsed.join(" | "),
          totalAvailable: accumulatedItems.length,
          error: lastError,
        },
      };

      return { source, result };
    });

    const settled = await Promise.allSettled(sourceSearchTasks);

    const resultMap = new Map<DataSourceType, AdapterSearchResult>();

    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        this.logger.warn(
          `Source search task rejected unexpectedly: ${String(outcome.reason)}`,
        );
        continue;
      }

      const { source, result } = outcome.value;
      if (result !== null) {
        resultMap.set(source, result);
      }
    }

    this.logger.debug(
      `searchAllSources completed: ${resultMap.size}/${sources.length} sources returned results in ${Date.now() - startTime}ms`,
    );

    return resultMap;
  }

  /**
   * F-3C · Execute a single adapter query through the throttle, with limited
   * retry + exponential backoff for transient failures (network blip, 429/5xx).
   *
   * Retries up to `MAX_QUERY_RETRIES` times before giving up. Backoff is
   * `BASE_BACKOFF_MS * 3^attempt` (300ms, 900ms). Abort signal short-circuits.
   */
  private async runQueryWithRetry(
    adapter: ISearchAdapter,
    source: DataSourceType,
    formattedQuery: string,
    remaining: number,
    since: Date | undefined,
    metadata: Record<string, unknown> | undefined,
    signal: AbortSignal | undefined,
  ): Promise<
    { ok: true; result: AdapterSearchResult } | { ok: false; error: string }
  > {
    const MAX_QUERY_RETRIES = 2;
    const BASE_BACKOFF_MS = 300;
    let lastErr: string = "";

    for (let attempt = 0; attempt <= MAX_QUERY_RETRIES; attempt++) {
      if (signal?.aborted) return { ok: false, error: "aborted" };
      try {
        const res = await this.throttle.execute(
          adapter.sourceId,
          () =>
            adapter.search({
              query: formattedQuery,
              maxResults: remaining,
              since,
              timeoutMs: adapter.defaultTimeoutMs,
              signal,
              metadata,
            }),
          signal,
        );
        return { ok: true, result: res };
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_QUERY_RETRIES && !signal?.aborted) {
          const backoff = BASE_BACKOFF_MS * Math.pow(3, attempt);
          this.logger.warn(
            `[${source}] query "${formattedQuery}" attempt ${attempt + 1} failed (${lastErr}) — retry in ${backoff}ms`,
          );
          await this.sleep(backoff, signal);
          continue;
        }
        this.logger.warn(
          `[${source}] query "${formattedQuery}" exhausted retries: ${lastErr}`,
        );
        return { ok: false, error: lastErr };
      }
    }
    return { ok: false, error: lastErr };
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });
  }

  /**
   * Look up the adapter for a given source type.
   */
  getAdapter(source: DataSourceType): ISearchAdapter | undefined {
    return this.adapterMap.get(source);
  }

  /**
   * Return all source types for which an adapter is registered and currently available.
   * Availability check is async — unavailable adapters are silently excluded.
   */
  async getAvailableSources(): Promise<DataSourceType[]> {
    const checks = Array.from(this.adapterMap.entries()).map(
      async ([sourceType, adapter]) => {
        try {
          const available = await adapter.isAvailable();
          return available ? sourceType : null;
        } catch {
          return null;
        }
      },
    );

    const results = await Promise.all(checks);
    return results.filter((s): s is DataSourceType => s !== null);
  }
}
