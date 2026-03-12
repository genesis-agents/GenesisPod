/**
 * Global Source Throttle Service
 *
 * NestJS singleton that provides per-source concurrency limiting
 * shared across ALL concurrent dimension searches.
 *
 * When 4 dimensions run in parallel (pLimit(4) in orchestrator),
 * and each needs ArXiv, the throttle ensures only 1 ArXiv request
 * runs at a time globally — the rest queue automatically.
 *
 * Uses p-limit for lightweight, zero-dependency queuing.
 */

import { Injectable, Logger } from "@nestjs/common";
import { createConcurrencyLimiter } from "@/common/utils/concurrency.utils";
import type { ThrottleStats } from "./search.types";

/** Default per-source concurrency limits based on API rate constraints */
const DEFAULT_CONCURRENCY: Record<string, number> = {
  "arxiv-search": 1, // 3 req/s but retry backoff is expensive
  "semantic-scholar": 2, // 1 req/s unauthenticated, 100 with key
  pubmed: 3, // 3-10 req/s depending on API key
  "openalex-search": 5, // 100k/month, generous
  "web-search": 8, // Tavily/Serper, fast
  "github-search": 2, // 30 req/min with token
  "hackernews-search": 3, // Public Algolia API
  "social-x": 2, // Grok Live Search
  policy: 3, // FedReg + Congress + WH combined
  "finance-api": 1, // 5 req/min free tier
  "weather-api": 1, // 60 req/min free tier
  "local-search": 3, // Internal RAG, no external limit
};

/** Fallback concurrency for unregistered sources */
const DEFAULT_CONCURRENCY_LIMIT = 3;

interface LimiterEntry {
  limiter: <T>(fn: () => Promise<T>) => Promise<T>;
  concurrency: number;
  activeCount: number;
  pendingCount: number;
}

@Injectable()
export class GlobalSourceThrottleService {
  private readonly logger = new Logger(GlobalSourceThrottleService.name);
  private readonly limiters = new Map<string, LimiterEntry>();

  constructor() {
    // Pre-register all known sources
    for (const [sourceId, concurrency] of Object.entries(DEFAULT_CONCURRENCY)) {
      this.registerSource(sourceId, concurrency);
    }
    this.logger.log(`Initialized with ${this.limiters.size} source throttles`);
  }

  /**
   * Register a source with a specific concurrency limit.
   * Called automatically for known sources; adapters can also register dynamically.
   */
  registerSource(sourceId: string, concurrency: number): void {
    if (this.limiters.has(sourceId)) return;
    this.limiters.set(sourceId, {
      limiter: createConcurrencyLimiter(concurrency),
      concurrency,
      activeCount: 0,
      pendingCount: 0,
    });
  }

  /**
   * Execute a function through the source's concurrency limiter.
   *
   * If the source's slots are full, the function queues automatically.
   * Supports AbortSignal — if aborted while queued, rejects immediately.
   */
  async execute<T>(
    sourceId: string,
    fn: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    // Get or create limiter for this source
    let entry = this.limiters.get(sourceId);
    if (!entry) {
      this.registerSource(sourceId, DEFAULT_CONCURRENCY_LIMIT);
      entry = this.limiters.get(sourceId)!;
    }

    // Fast fail if already aborted
    if (signal?.aborted) {
      throw new Error(`Search cancelled for ${sourceId}`);
    }

    entry.pendingCount++;
    const queueStartTime = Date.now();

    // Track whether the task moved from pending→active inside the limiter callback.
    // If the error happens BEFORE the callback fires (e.g. abort while still queued),
    // pendingCount was never decremented inside the callback and must be fixed in catch.
    let movedToActive = false;

    try {
      const result = await entry.limiter(async () => {
        entry.pendingCount--;
        entry.activeCount++;
        movedToActive = true;

        // Check abort after waiting in queue
        if (signal?.aborted) {
          throw new Error(`Search cancelled for ${sourceId} after queuing`);
        }

        const waitMs = Date.now() - queueStartTime;
        if (waitMs > 1000) {
          this.logger.debug(
            `[${sourceId}] Waited ${waitMs}ms in throttle queue`,
          );
        }

        try {
          return await fn();
        } finally {
          entry.activeCount--;
        }
      });
      return result;
    } catch (error) {
      // Only decrement pendingCount if the task never left the queue
      if (!movedToActive && entry.pendingCount > 0) entry.pendingCount--;
      throw error;
    }
  }

  /**
   * Get throttle stats for all registered sources (for monitoring).
   */
  getStats(): ThrottleStats[] {
    const stats: ThrottleStats[] = [];
    for (const [sourceId, entry] of this.limiters) {
      stats.push({
        sourceId,
        concurrency: entry.concurrency,
        activeCount: entry.activeCount,
        pendingCount: entry.pendingCount,
      });
    }
    return stats;
  }

  /**
   * Get queue size for a specific source.
   */
  getQueueSize(sourceId: string): number {
    return this.limiters.get(sourceId)?.pendingCount ?? 0;
  }
}
