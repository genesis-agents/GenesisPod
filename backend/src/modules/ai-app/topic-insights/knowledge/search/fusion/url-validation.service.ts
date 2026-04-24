/**
 * UrlValidationService (F5)
 *
 * Drops dead / unreachable URLs via a lightweight HEAD check. Replaces the
 * former `validateUrls` method deleted from DataEnrichmentService in H6.
 *
 * Principles:
 *   - Cheap: short timeout + HEAD only; on failure the URL is *kept* by default
 *     (fail-open) so we don't drop hits due to transient network hiccups.
 *   - Parallel: uses Promise.allSettled with a hard cap on concurrent requests.
 *   - Pluggable: accepts a fetcher override for tests / future instrumentation.
 */

import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { DataSourceResult } from "@/modules/ai-app/topic-insights/shared/types/data-source.types";

/**
 * DI token for overriding the HEAD-check fetcher in tests. In production the
 * service falls back to {@link defaultFetcher} when no override is bound.
 * Kept as a token (not a bare type) so Nest's DI resolution can inject it.
 */
export const URL_VALIDATION_FETCHER = Symbol("URL_VALIDATION_FETCHER");

export interface UrlValidationOptions {
  /** Milliseconds to wait for HEAD response before giving up. Default 2500ms. */
  readonly timeoutMs?: number;
  /** Max concurrent HEAD checks. Default 6. */
  readonly concurrency?: number;
  /** When true, drop URLs that return 4xx/5xx. Default true. */
  readonly dropOnClientError?: boolean;
}

export type UrlFetcher = (
  url: string,
  signal: AbortSignal,
) => Promise<{ ok: boolean; status: number }>;

const defaultFetcher: UrlFetcher = async (url, signal) => {
  const res = await fetch(url, { method: "HEAD", signal, redirect: "follow" });
  return { ok: res.ok, status: res.status };
};

@Injectable()
export class UrlValidationService {
  private readonly logger = new Logger(UrlValidationService.name);
  private readonly fetcher: UrlFetcher;

  constructor(
    @Optional()
    @Inject(URL_VALIDATION_FETCHER)
    injectedFetcher?: UrlFetcher,
  ) {
    // Default to the global fetch-based HEAD check when no override is bound.
    // Previously the default lived in the constructor parameter, which made
    // Nest's DI treat the parameter as a required Function provider and fail
    // bootstrap with "Nest can't resolve dependencies of UrlValidationService".
    this.fetcher = injectedFetcher ?? defaultFetcher;
  }

  /**
   * Returns a fresh list excluding URLs that look clearly dead.
   * Never throws for single-url failures — fails open (keep the URL).
   */
  async filterAlive(
    results: readonly DataSourceResult[],
    options: UrlValidationOptions = {},
  ): Promise<DataSourceResult[]> {
    const timeoutMs = options.timeoutMs ?? 2500;
    const concurrency = Math.max(1, options.concurrency ?? 6);
    const dropOnClientError = options.dropOnClientError ?? true;

    const alive: DataSourceResult[] = [];
    const drops: string[] = [];

    for (let i = 0; i < results.length; i += concurrency) {
      const chunk = results.slice(i, i + concurrency);
      const checks = await Promise.allSettled(
        chunk.map((r) => this.check(r.url, timeoutMs)),
      );
      chunk.forEach((r, idx) => {
        const result = checks[idx];
        if (result.status === "fulfilled") {
          const { ok, status } = result.value;
          if (!ok && dropOnClientError && status >= 400 && status < 600) {
            drops.push(`${r.url} (HTTP ${status})`);
            return;
          }
        }
        alive.push(r);
      });
    }

    if (drops.length > 0) {
      this.logger.debug(
        `[filterAlive] dropped ${drops.length}/${results.length} urls`,
      );
    }
    return alive;
  }

  private async check(
    url: string,
    timeoutMs: number,
  ): Promise<{ ok: boolean; status: number }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await this.fetcher(url, ctrl.signal);
    } finally {
      clearTimeout(t);
    }
  }
}
