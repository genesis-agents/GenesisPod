/**
 * Search Orchestrator Service
 *
 * Thin coordinator for the modular search pipeline.
 * Replaces the core fetchDataForDimension() flow from DataSourceRouterService.
 *
 * Pipeline:
 *   1. Resolve data sources (from options.assignedTools or dimension.searchSources)
 *   2. Filter by kernel capability guard (optional)
 *   3. Filter by tool availability via ToolFacade (optional)
 *   4. Generate source-aware queries via QueryStrategyService
 *   5. Execute parallel search via SearchExecutorService
 *   6. Fuse and deduplicate via ResultFusionService
 *   7. Evaluate quality via QualityGateService
 *   8. Retry with WEB fallback if quality gate fails (max 1 retry)
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { ResearchTopic, TopicDimension } from "@prisma/client";
import { ToolFacade } from "@/modules/ai-engine/facade";
import { CapabilityGuardService } from "@/modules/ai-engine/facade";
import {
  DataSourceType,
  type AggregatedSearchResult,
} from "@/modules/ai-app/topic-insights/shared/types/data-source.types";
import {
  dataSourceToToolId,
  convertToolsToDataSources,
  TOOL_ID_TO_DATA_SOURCE,
} from "@/modules/ai-app/topic-insights/knowledge/sources/mapping.config";
import type { SearchPipelineOptions, QualityVerdict } from "./types";
import { QueryStrategyService } from "./query/query-strategy.service";
import { SearchExecutorService } from "./executor.service";
import { ResultFusionService } from "./fusion/result-fusion.service";
import { QualityGateService } from "./fusion/quality-gate.service";
import { ContentFetcherService } from "./fusion/content-fetcher.service";
import { LlmRerankerAdapter } from "./rerank/llm-reranker.adapter";
import { DEFAULT_RERANK_CONFIG, type RerankCandidate } from "./rerank/types";

/** Default data sources when dimension provides none */
const DEFAULT_SOURCES: DataSourceType[] = [
  DataSourceType.WEB,
  DataSourceType.ACADEMIC,
];

import { DATA_FRESHNESS } from "@/modules/ai-app/topic-insights/shared/telemetry/health-monitoring.config";

/** Six months in milliseconds — used for default `since` date */
const SIX_MONTHS_MS = DATA_FRESHNESS.SIX_MONTHS_MS;

// F-3B · Global wall-time budget for the whole search pipeline (single
// dimension). Beyond this, remaining fallback rounds are skipped and the
// current best-effort results are returned. Baseline used 45-60s; we land at
// 60s to match tier "thorough" depth expectations. Caller can override via
// SearchPipelineOptions.maxWallTimeMs.
const DEFAULT_PIPELINE_BUDGET_MS = 60_000;

/**
 * F-3A · Minimum results a source must return before the orchestrator stops
 * trying to widen. Baseline DataSourceRouter used 5 per source (conditional
 * resecond-query retry); we encode the same floor here as the trigger for
 * widenWithWebFallback + cross-source borrow.
 */
const MIN_RESULTS_PER_SOURCE = 3;
const MIN_RESULTS_PER_DIMENSION = 5;

@Injectable()
export class SearchOrchestratorService {
  private readonly logger = new Logger(SearchOrchestratorService.name);

  constructor(
    private readonly queryStrategy: QueryStrategyService,
    private readonly executor: SearchExecutorService,
    private readonly fusion: ResultFusionService,
    private readonly qualityGate: QualityGateService,
    private readonly reranker: LlmRerankerAdapter,
    @Optional() private readonly contentFetcher?: ContentFetcherService,
    @Optional() private readonly toolFacade?: ToolFacade,
    @Optional() private readonly capabilityGuard?: CapabilityGuardService,
  ) {}

  /**
   * Main search pipeline entry point.
   * Replaces DataSourceRouterService.fetchDataForDimension() core flow.
   *
   * @param dimension  - TopicDimension being searched
   * @param topic      - Parent ResearchTopic (provides name, config)
   * @param options    - Pipeline configuration overrides
   * @returns          Aggregated, fused, and quality-checked search results
   */
  async search(
    dimension: TopicDimension,
    topic: ResearchTopic,
    options?: SearchPipelineOptions,
  ): Promise<AggregatedSearchResult> {
    const startTime = Date.now();

    // ------------------------------------------------------------------
    // Step 1: Determine requested data sources
    // ------------------------------------------------------------------
    let sources: DataSourceType[];

    if (options?.assignedTools && options.assignedTools.length > 0) {
      sources = convertToolsToDataSources(options.assignedTools);
      this.logger.debug(
        `[${dimension.name}] Using ${sources.length} sources from assignedTools`,
      );
    } else {
      sources = this.getDataSourcesForDimension(dimension);
      this.logger.debug(
        `[${dimension.name}] Using ${sources.length} sources from dimension config`,
      );
    }

    // ------------------------------------------------------------------
    // Step 2: Filter by kernel capability guard (optional, non-blocking)
    // ------------------------------------------------------------------
    if (this.capabilityGuard && options?.processId) {
      const { processId } = options;
      const guardedSources: DataSourceType[] = [];

      for (const source of sources) {
        try {
          const result = await this.capabilityGuard.checkDataAccess(
            processId,
            "data_source",
            source,
          );
          if (result.allowed) {
            guardedSources.push(source);
          } else {
            this.logger.debug(
              `[${dimension.name}] Source "${source}" denied by capability guard: ${result.reason ?? "no reason"}`,
            );
          }
        } catch (err) {
          // Non-blocking: if guard throws, keep source
          this.logger.warn(
            `[${dimension.name}] Capability guard check failed for source "${source}": ${(err as Error).message} — allowing`,
          );
          guardedSources.push(source);
        }
      }

      sources = guardedSources;
    }

    // ------------------------------------------------------------------
    // Step 3: Filter by tool availability via ToolFacade (optional)
    // ------------------------------------------------------------------
    if (this.toolFacade && sources.length > 0) {
      try {
        const enabledToolIds = await this.toolFacade.capabilityResolveTools({});
        const enabledSet = new Set(enabledToolIds);
        const filteredSources: DataSourceType[] = [];

        for (const source of sources) {
          const toolId = dataSourceToToolId(source);

          // No tool mapping (e.g. LOCAL, RSS) — always keep
          if (!toolId) {
            filteredSources.push(source);
            continue;
          }

          if (enabledSet.has(toolId)) {
            filteredSources.push(source);
          } else if (this.hasAnySubToolEnabled(source, enabledSet)) {
            // Aggregate sources (e.g. ACADEMIC) — keep if any sub-tool is enabled
            filteredSources.push(source);
          } else {
            this.logger.warn(
              `[${dimension.name}] Source "${source}" skipped — tool "${toolId}" is not enabled`,
            );
          }
        }

        sources = filteredSources;
      } catch (err) {
        // Non-blocking: if ToolFacade is unavailable, proceed with all sources
        this.logger.warn(
          `[${dimension.name}] ToolFacade.capabilityResolveTools failed: ${(err as Error).message} — skipping tool filter`,
        );
      }
    }

    // Final safety net: ensure at least WEB is available if sources are empty
    if (sources.length === 0) {
      this.logger.warn(
        `[${dimension.name}] All sources filtered out — falling back to [WEB]`,
      );
      sources = [DataSourceType.WEB];
    }

    // ------------------------------------------------------------------
    // Step 4: Generate source-aware queries
    // ------------------------------------------------------------------
    const queries = await this.queryStrategy.generateQueries(topic, dimension);

    // ------------------------------------------------------------------
    // Step 5: Execute search across all sources in parallel
    // ------------------------------------------------------------------
    const defaultSince = new Date(Date.now() - SIX_MONTHS_MS);
    const since =
      options?.since ?? this.getSearchTimeRange(topic) ?? defaultSince;

    const rawResults = await this.executor.searchAllSources(sources, queries, {
      maxResults: options?.maxResults ?? 25,
      since,
      signal: options?.signal,
      metadata: {
        topicConfig: topic.topicConfig,
      },
    });

    // ------------------------------------------------------------------
    // Step 6: Fuse results (deduplicate, score, rank)
    // ------------------------------------------------------------------
    const primaryQuery = queries.baseQueries[0] ?? topic.name;
    let aggregated = this.fusion.fuse(rawResults, primaryQuery);

    // ------------------------------------------------------------------
    // Step 6a · F-6 — Content enrichment (fetch full page content for top
    // results + high-credibility extras). Replaces the snippet-only pipeline
    // that forced the LLM to hallucinate from 100-300 char snippets.
    //
    // ContentFetcher is @Optional — in test envs without a web-scraper tool
    // it short-circuits to passthrough, so this stays zero-risk.
    // ------------------------------------------------------------------
    if (this.contentFetcher && aggregated.items.length > 0) {
      try {
        const enriched = await this.contentFetcher.enrichResults(
          aggregated.items,
          {
            topN: 10,
            maxContentLength: 3000,
          },
        );
        // Replace items preserving order; update scoredItems to reflect the
        // enriched content on the same index positions.
        aggregated = {
          ...aggregated,
          items: enriched,
          totalCount: enriched.length,
          scoredItems: aggregated.scoredItems?.map((s) => {
            const match = enriched.find((e) => e.url === s.item.url);
            return match ? { ...s, item: match } : s;
          }),
        };
      } catch (err) {
        this.logger.warn(
          `[${dimension.name}] contentFetcher.enrichResults failed: ${(err as Error).message} — keeping snippet-only items`,
        );
      }
    }

    // ------------------------------------------------------------------
    // Step 6b: Optional rerank (RAG 两阶段检索的第二阶段)
    // ------------------------------------------------------------------
    if (options?.rerankConfig?.enabled) {
      aggregated = await this.applyRerank(
        dimension.name,
        aggregated,
        primaryQuery,
        options.rerankConfig,
      );
    }

    // ------------------------------------------------------------------
    // Step 7: Quality gate evaluation
    // ------------------------------------------------------------------
    let verdict: QualityVerdict = this.qualityGate.evaluate(aggregated, {
      requestedSources: sources,
    });

    // ------------------------------------------------------------------
    // Step 8: F-3A/B — Widening loop with per-source minResults + global budget
    //
    // Baseline DataSourceRouter.standardSearch() had a per-source re-search
    // loop: if a source returned < threshold, it'd try the next query or
    // widen to WEB. Harness originally collapsed it to "one WEB fallback" —
    // too timid for the 429/timeout reality (每维度 1 结果问题的根因).
    //
    // New behaviour:
    //   round 1 · if any non-WEB source returned <MIN_RESULTS_PER_SOURCE AND
    //             total <MIN_RESULTS_PER_DIMENSION, widen with WEB
    //   round 2 · if still <MIN_RESULTS_PER_DIMENSION, re-query existing
    //             sources with the FULL query list (not per-source filtered)
    //
    // All rounds honor DEFAULT_PIPELINE_BUDGET_MS / options.maxWallTimeMs.
    // ------------------------------------------------------------------
    const budgetMs = options?.maxWallTimeMs ?? DEFAULT_PIPELINE_BUDGET_MS;
    const deadline = startTime + budgetMs;
    const widenMetadata = { topicConfig: topic.topicConfig };

    const needsWidening = (): boolean => {
      // Respect QualityGate's verdict as authoritative — if it says sufficient,
      // don't second-guess (preserves post-rerank selection; aligns with
      // original "no retry when gate passes" contract).
      if (verdict.sufficient) return false;
      if (aggregated.totalCount >= MIN_RESULTS_PER_DIMENSION) return false;
      const anySourceUnderfed = sources.some((s) => {
        const r = rawResults.get(s);
        return !r || r.items.length < MIN_RESULTS_PER_SOURCE;
      });
      // 不充足时：若有 source underfed → widen；若均达 min 仍 insufficient（e.g.
      // 纯是 snippet 太短）→ 仍然 widen（目的是 recall），直到 budget 耗尽。
      return (
        anySourceUnderfed || aggregated.totalCount < MIN_RESULTS_PER_DIMENSION
      );
    };

    // Round 1 · WEB fallback (if WEB not already in play)
    if (
      needsWidening() &&
      !sources.includes(DataSourceType.WEB) &&
      Date.now() < deadline &&
      !options?.signal?.aborted
    ) {
      this.logger.debug(
        `[${dimension.name}] widening round-1: adding WEB fallback (totalCount=${aggregated.totalCount})`,
      );
      try {
        const fallbackResults = await this.executor.searchAllSources(
          [DataSourceType.WEB],
          queries,
          {
            maxResults: options?.maxResults ?? 25,
            since,
            signal: options?.signal,
            metadata: widenMetadata,
          },
        );
        for (const [sourceType, result] of fallbackResults) {
          rawResults.set(sourceType, result);
        }
        aggregated = this.fusion.fuse(rawResults, primaryQuery);
        verdict = this.qualityGate.evaluate(aggregated, {
          requestedSources: [...sources, DataSourceType.WEB],
        });
      } catch (err) {
        this.logger.warn(
          `[${dimension.name}] widening round-1 failed: ${(err as Error).message}`,
        );
      }
    }

    // Round 2 · re-query the underfed non-WEB sources (query pool now ignores
    //           source-specific filtering — use all baseQueries to maximize recall)
    if (needsWidening() && Date.now() < deadline && !options?.signal?.aborted) {
      const underfedSources = sources.filter((s) => {
        const r = rawResults.get(s);
        return !r || r.items.length < MIN_RESULTS_PER_SOURCE;
      });
      if (underfedSources.length > 0) {
        this.logger.debug(
          `[${dimension.name}] widening round-2: re-querying underfed sources ${underfedSources.join(",")}`,
        );
        // Build a widened query pack where every source sees the baseQueries
        const widenedQueries = {
          baseQueries: queries.baseQueries,
          sourceSpecific: new Map<DataSourceType, string[]>(
            underfedSources.map((s) => [s, queries.baseQueries]),
          ),
          language: queries.language,
        };
        const remainingMs = Math.max(1000, deadline - Date.now());
        try {
          // Cap sub-search time to the remaining budget by composing an abort
          const timedSignal = this.timedSignal(options?.signal, remainingMs);
          const retryResults = await this.executor.searchAllSources(
            underfedSources,
            widenedQueries,
            {
              maxResults: options?.maxResults ?? 25,
              since,
              signal: timedSignal,
              metadata: widenMetadata,
            },
          );
          // Merge by appending items (not overwriting — we already had some)
          for (const [sourceType, result] of retryResults) {
            const prev = rawResults.get(sourceType);
            if (!prev) {
              rawResults.set(sourceType, result);
            } else {
              rawResults.set(sourceType, {
                items: [...prev.items, ...result.items],
                sourceMetrics: {
                  ...prev.sourceMetrics,
                  durationMs:
                    prev.sourceMetrics.durationMs +
                    result.sourceMetrics.durationMs,
                  totalAvailable:
                    (prev.sourceMetrics.totalAvailable ?? prev.items.length) +
                    (result.sourceMetrics.totalAvailable ??
                      result.items.length),
                },
              });
            }
          }
          aggregated = this.fusion.fuse(rawResults, primaryQuery);
          verdict = this.qualityGate.evaluate(aggregated, {
            requestedSources: sources,
          });
        } catch (err) {
          this.logger.warn(
            `[${dimension.name}] widening round-2 failed: ${(err as Error).message}`,
          );
        }
      }
    }

    const totalMs = Date.now() - startTime;
    const budgetExceeded = totalMs >= budgetMs;
    this.logger.log(
      `[${dimension.name}] Search pipeline complete: ${aggregated.totalCount} items from ${aggregated.sources.length} sources ` +
        `in ${totalMs}ms${budgetExceeded ? " (budget-exhausted)" : ""} — quality gate: ${verdict.sufficient ? "PASS" : "FAIL"} ` +
        `(${verdict.gaps.length} gap(s))`,
    );

    if (!verdict.sufficient) {
      this.logger.debug(
        `[${dimension.name}] Quality gaps: ${verdict.gaps.join("; ")}`,
      );
    }

    return aggregated;
  }

  /**
   * Compose an AbortSignal that fires when `parent` aborts OR after `ttlMs`.
   * Used to cap a widening round to the remaining pipeline budget.
   */
  private timedSignal(
    parent: AbortSignal | undefined,
    ttlMs: number,
  ): AbortSignal {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ttlMs);
    if (parent) {
      if (parent.aborted) {
        ctrl.abort();
      } else {
        parent.addEventListener("abort", () => ctrl.abort(), { once: true });
      }
    }
    ctrl.signal.addEventListener("abort", () => clearTimeout(timer), {
      once: true,
    });
    return ctrl.signal;
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * 对 fusion 结果做精排（RAG 两阶段检索第二阶段）。
   *
   * 流程：
   *   fusion.scoredItems 前 topK*multiplier 名 → LlmReranker → 取 top K
   *
   * Fail-open：reranker 返回 RerankResult.reranked=false 时（passthrough / LLM
   * 失败 / 解析失败），**保持 aggregated 不变**——避免用假 rerankScore 覆盖
   * fusion 计算好的多因子 relevanceScore（相关性×0.35 + 源可信度×0.25 + …）。
   */
  private async applyRerank(
    dimensionName: string,
    aggregated: AggregatedSearchResult,
    query: string,
    config: NonNullable<SearchPipelineOptions["rerankConfig"]>,
  ): Promise<AggregatedSearchResult> {
    const scoredItems = aggregated.scoredItems ?? [];
    if (scoredItems.length === 0) {
      this.logger.debug(
        `[${dimensionName}] rerank skipped: no scoredItems in aggregated result`,
      );
      return aggregated;
    }

    const topK = config.topK ?? DEFAULT_RERANK_CONFIG.topK;
    const multiplier =
      config.candidateMultiplier ?? DEFAULT_RERANK_CONFIG.candidateMultiplier;
    const timeoutMs = config.timeoutMs ?? DEFAULT_RERANK_CONFIG.timeoutMs;

    // 候选池 = topK * multiplier（不超过实际 scoredItems 数）
    const candidatePool = Math.min(topK * multiplier, scoredItems.length);
    if (candidatePool <= topK) {
      // 候选不足以挑选，fusion 本身就是答案
      return aggregated;
    }

    const candidates: RerankCandidate[] = scoredItems
      .slice(0, candidatePool)
      .map((s, i) => ({ item: s.item, originalIndex: i }));

    const rerankStart = Date.now();
    const rerankResult = await this.reranker.rerank({
      query,
      candidates,
      topK,
      timeoutMs,
    });
    const latencyMs = Date.now() - rerankStart;

    if (!rerankResult.reranked) {
      // 未真正 rerank —— 保留 fusion 结果不动，只在日志中留痕
      this.logger.debug(
        `[${dimensionName}] rerank skipped (${rerankResult.skipReason ?? "unknown"}) in ${latencyMs}ms — keeping fusion order`,
      );
      return aggregated;
    }

    this.logger.log(
      `[${dimensionName}] rerank: ${candidates.length} → ${rerankResult.items.length} ` +
        `in ${latencyMs}ms (topK=${topK})`,
    );

    // 真 rerank 成功：用 rerank 分数重写 scoredItems 与 items
    const rerankedScoredItems = rerankResult.items.map((r) => {
      const original = scoredItems[r.originalIndex];
      return {
        item: r.item,
        score: r.rerankScore,
        relevanceScore: r.rerankScore,
        credibilityScore: original?.credibilityScore ?? 0,
      };
    });

    return {
      ...aggregated,
      items: rerankResult.items.map((r) => r.item),
      totalCount: rerankResult.items.length,
      scoredItems: rerankedScoredItems,
    };
  }

  /**
   * Get configured time range from topic config.
   * Reads topic.topicConfig JSON for a `searchTimeRange.since` date string.
   */
  private getSearchTimeRange(topic: ResearchTopic): Date | null {
    if (!topic.topicConfig) {
      return null;
    }

    try {
      const config =
        typeof topic.topicConfig === "string"
          ? (JSON.parse(topic.topicConfig) as Record<string, unknown>)
          : (topic.topicConfig as Record<string, unknown>);

      const timeRange = config["searchTimeRange"];
      if (!timeRange || typeof timeRange !== "object") {
        return null;
      }

      const since = (timeRange as Record<string, unknown>)["since"];
      if (typeof since !== "string" || !since) {
        return null;
      }

      const parsed = new Date(since);
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  }

  /**
   * Get data sources from dimension configuration.
   * Reads dimension.searchSources as string[], validates against DataSourceType enum.
   */
  private getDataSourcesForDimension(
    dimension: TopicDimension,
  ): DataSourceType[] {
    const raw = dimension.searchSources;

    if (!raw) {
      return [...DEFAULT_SOURCES];
    }

    let parsed: unknown;
    try {
      parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    } catch {
      return [...DEFAULT_SOURCES];
    }

    if (!Array.isArray(parsed)) {
      return [...DEFAULT_SOURCES];
    }

    const validValues = new Set<string>(Object.values(DataSourceType));
    const sources: DataSourceType[] = [];

    for (const item of parsed) {
      if (typeof item === "string" && validValues.has(item)) {
        sources.push(item as DataSourceType);
      }
    }

    return sources.length > 0 ? sources : [...DEFAULT_SOURCES];
  }

  /**
   * Check if an aggregate source type (e.g. ACADEMIC) has any enabled sub-tools.
   * ACADEMIC maps to "arxiv-search" but actually uses openalex-search, pubmed, etc.
   * If any of these sub-tools is enabled, the aggregate source should be kept.
   */
  private hasAnySubToolEnabled(
    source: DataSourceType,
    enabledSet: Set<string>,
  ): boolean {
    // Find all tool IDs that map to this source type or its sub-types
    const relatedToolIds: string[] = [];
    for (const [toolId, mappedSource] of Object.entries(
      TOOL_ID_TO_DATA_SOURCE,
    )) {
      if (mappedSource === source) {
        relatedToolIds.push(toolId);
      }
    }

    // For ACADEMIC, also check tools that map to sub-types (OPENALEX, PUBMED, etc.)
    if (source === DataSourceType.ACADEMIC) {
      const subTypes = [
        DataSourceType.OPENALEX,
        DataSourceType.SEMANTIC_SCHOLAR,
        DataSourceType.PUBMED,
      ];
      for (const subType of subTypes) {
        const subToolId = dataSourceToToolId(subType);
        if (subToolId) relatedToolIds.push(subToolId);
      }
    }

    return relatedToolIds.some((tid) => enabledSet.has(tid));
  }
}
