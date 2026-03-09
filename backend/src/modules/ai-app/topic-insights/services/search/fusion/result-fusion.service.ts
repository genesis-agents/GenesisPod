/**
 * Result Fusion Service
 *
 * Handles deduplication, credibility scoring, and ranking of search results
 * aggregated from multiple data sources.
 *
 * Extracted from the old DataSourceRouterService aggregateResults() /
 * enforceDomainDiversity() / calculateCredibilityScore() methods.
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  DataSourceType,
  type DataSourceResult,
  type AggregatedSearchResult,
} from "../../../types/data-source.types";
import type { AdapterSearchResult } from "../search.types";

/** Maximum number of items allowed from the same domain */
const MAX_ITEMS_PER_DOMAIN = 3;

/** Jaccard similarity threshold above which two titles are considered duplicates */
const TITLE_SIMILARITY_THRESHOLD = 0.8;

/** Source-type credibility base scores */
const SOURCE_TYPE_SCORES: Partial<Record<DataSourceType, number>> = {
  [DataSourceType.ACADEMIC]: 0.9,
  [DataSourceType.OPENALEX]: 0.9,
  [DataSourceType.PUBMED]: 0.9,
  [DataSourceType.SEMANTIC_SCHOLAR]: 0.85,
  [DataSourceType.GITHUB]: 0.7,
  [DataSourceType.WEB]: 0.6,
  [DataSourceType.HACKERNEWS]: 0.5,
  [DataSourceType.SOCIAL_X]: 0.4,
};

/** Default score for source types not listed above */
const DEFAULT_SOURCE_TYPE_SCORE = 0.55;

/** Known academic domain suffixes that receive an authority bonus */
const ACADEMIC_DOMAIN_PATTERNS = [
  ".edu",
  ".ac.uk",
  ".ac.jp",
  "arxiv.org",
  "scholar.google.com",
  "semanticscholar.org",
  "pubmed.ncbi.nlm.nih.gov",
  "openalex.org",
  "jstor.org",
  "springer.com",
  "nature.com",
  "sciencedirect.com",
  "ieee.org",
  "acm.org",
];

/** Score weight configuration */
const WEIGHTS = {
  sourceType: 0.4,
  domainAuthority: 0.2,
  recency: 0.25,
  contentDepth: 0.15,
};

interface ScoredResult {
  item: DataSourceResult;
  score: number;
}

@Injectable()
export class ResultFusionService {
  private readonly logger = new Logger(ResultFusionService.name);

  /**
   * Fuse results from multiple sources into a scored, deduplicated, ranked list.
   *
   * Pipeline: flatten → deduplicate (URL then title Jaccard) → score → sort → domain diversity cap
   */
  fuse(
    sourceResults: Map<DataSourceType, AdapterSearchResult>,
    searchQuery: string,
  ): AggregatedSearchResult {
    const startTime = Date.now();

    // 1. Flatten all items, tracking per-source counts for metadata
    const allItems: DataSourceResult[] = [];
    const sourceCountMap: Partial<Record<DataSourceType, number>> = {};

    for (const [sourceType, adapterResult] of sourceResults) {
      allItems.push(...adapterResult.items);
      sourceCountMap[sourceType] = adapterResult.items.length;
    }

    this.logger.debug(
      `Fusing ${allItems.length} raw items from ${sourceResults.size} sources`,
    );

    // 2. Deduplicate by URL, then by title similarity
    const dedupedItems = this.deduplicate(allItems);

    this.logger.debug(
      `After deduplication: ${dedupedItems.length} items (removed ${allItems.length - dedupedItems.length})`,
    );

    // 3. Score each item
    const scored: ScoredResult[] = dedupedItems.map((item) => ({
      item,
      score: this.scoreItem(item),
    }));

    // 4. Sort by credibility score descending
    scored.sort((a, b) => b.score - a.score);

    // 5. Enforce domain diversity — no more than MAX_ITEMS_PER_DOMAIN per domain
    const diverseItems = this.enforceDomainDiversity(scored);

    const sources = Array.from(sourceResults.keys());
    const executionTimeMs = Date.now() - startTime;

    return {
      items: diverseItems,
      totalCount: diverseItems.length,
      sources,
      metadata: {
        searchQuery,
        executionTimeMs,
        sourceResults: sourceCountMap as Record<DataSourceType, number>,
      },
    };
  }

  // ============================================================================
  // Deduplication
  // ============================================================================

  private deduplicate(items: DataSourceResult[]): DataSourceResult[] {
    const seenUrls = new Set<string>();
    const urlDeduped: DataSourceResult[] = [];

    for (const item of items) {
      const normalized = this.normalizeUrl(item.url);
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        urlDeduped.push(item);
      }
    }

    // Second pass: title-similarity deduplication on the already URL-deduped list
    const titleDeduped: DataSourceResult[] = [];

    for (const candidate of urlDeduped) {
      const isDuplicate = titleDeduped.some(
        (existing) =>
          this.calculateTitleSimilarity(candidate.title, existing.title) >=
          TITLE_SIMILARITY_THRESHOLD,
      );
      if (!isDuplicate) {
        titleDeduped.push(candidate);
      }
    }

    return titleDeduped;
  }

  // ============================================================================
  // Scoring
  // ============================================================================

  private scoreItem(item: DataSourceResult): number {
    const sourceTypeScore = this.getSourceTypeScore(item.sourceType);
    const domainAuthorityScore = this.getDomainAuthorityScore(
      item.domain ?? item.url,
    );
    const recencyScore = this.getRecencyScore(item.publishedAt);
    const contentDepthScore = this.getContentDepthScore(item.snippet);

    return (
      sourceTypeScore * WEIGHTS.sourceType +
      domainAuthorityScore * WEIGHTS.domainAuthority +
      recencyScore * WEIGHTS.recency +
      contentDepthScore * WEIGHTS.contentDepth
    );
  }

  // ============================================================================
  // Domain Diversity
  // ============================================================================

  private enforceDomainDiversity(scored: ScoredResult[]): DataSourceResult[] {
    const domainCounts = new Map<string, number>();
    const result: DataSourceResult[] = [];

    for (const { item } of scored) {
      const domain = this.extractDomain(item.url);
      const count = domainCounts.get(domain) ?? 0;

      if (count < MAX_ITEMS_PER_DOMAIN) {
        result.push(item);
        domainCounts.set(domain, count + 1);
      }
    }

    return result;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Normalize a URL for deduplication:
   * - Lowercase scheme + host
   * - Strip trailing slash
   * - Strip fragment (#...)
   * - Normalize to https
   */
  normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Normalize protocol
      parsed.protocol = "https:";
      // Remove fragment
      parsed.hash = "";
      // Remove trailing slash from pathname
      if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }
      return parsed.toString().toLowerCase();
    } catch {
      // Not a valid URL — return lowercased original for best-effort dedup
      return url.toLowerCase().replace(/#.*$/, "").replace(/\/$/, "");
    }
  }

  /**
   * Word-level Jaccard similarity between two title strings.
   * Returns a value in [0, 1].
   */
  calculateTitleSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

    if (wordsA.size === 0 && wordsB.size === 0) return 1;
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersectionCount = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersectionCount++;
    }

    const unionCount = wordsA.size + wordsB.size - intersectionCount;
    return intersectionCount / unionCount;
  }

  /** Extract hostname from a URL string, falling back to the raw string. */
  extractDomain(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  /** Base credibility score for a given source type. */
  getSourceTypeScore(sourceType: DataSourceType): number {
    return SOURCE_TYPE_SCORES[sourceType] ?? DEFAULT_SOURCE_TYPE_SCORE;
  }

  /**
   * Domain authority bonus score.
   * Returns 1.0 for known authoritative domains, 0.9 for .gov, 0.7 baseline.
   */
  getDomainAuthorityScore(domainOrUrl: string): number {
    const lower = domainOrUrl.toLowerCase();

    if (ACADEMIC_DOMAIN_PATTERNS.some((pattern) => lower.includes(pattern))) {
      return 1.0;
    }
    if (lower.includes(".gov") || lower.includes(".mil")) {
      return 0.9;
    }
    return 0.7;
  }

  /**
   * Recency score based on publishedAt age:
   * - Within 1 year  → 1.0
   * - 1–3 years      → 0.8
   * - Older / absent → 0.6
   */
  getRecencyScore(publishedAt?: Date): number {
    if (!publishedAt) return 0.6;

    const ageMs = Date.now() - publishedAt.getTime();
    const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365);

    if (ageYears <= 1) return 1.0;
    if (ageYears <= 3) return 0.8;
    return 0.6;
  }

  /**
   * Content depth score based on snippet length:
   * - > 500 chars → 1.0
   * - > 200 chars → 0.7
   * - Otherwise   → 0.5
   */
  getContentDepthScore(snippet: string): number {
    if (snippet.length > 500) return 1.0;
    if (snippet.length > 200) return 0.7;
    return 0.5;
  }
}
