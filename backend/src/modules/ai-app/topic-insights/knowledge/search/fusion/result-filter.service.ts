/**
 * ResultFilterService (F5)
 *
 * Unified filter gate that runs between url-validation + content-enrichment
 * and ResultFusion. Drops obviously invalid rows (missing url, duplicate
 * URL, impossibly short snippet, clearly-spam TLDs) so downstream services
 * don't waste compute on them.
 */

import { Injectable, Logger } from "@nestjs/common";
import type { DataSourceResult } from "@/modules/ai-app/topic-insights/shared/types/data-source.types";

export interface ResultFilterOptions {
  readonly minSnippetLength?: number;
  readonly blocklistDomains?: ReadonlySet<string>;
}

@Injectable()
export class ResultFilterService {
  private readonly logger = new Logger(ResultFilterService.name);
  private readonly defaultBlocklist = new Set<string>([
    // Known low-quality / scraper farms; extend via options when needed.
    "pinterest.com",
    "quora.com",
  ]);

  filterValid(
    results: readonly DataSourceResult[],
    options: ResultFilterOptions = {},
  ): DataSourceResult[] {
    const minSnippet = options.minSnippetLength ?? 20;
    const blocklist = options.blocklistDomains ?? this.defaultBlocklist;
    const seen = new Set<string>();

    const kept: DataSourceResult[] = [];
    let droppedMissingUrl = 0;
    let droppedDuplicate = 0;
    let droppedShortSnippet = 0;
    let droppedBlocklisted = 0;

    for (const r of results) {
      if (!r.url || r.url.trim().length === 0) {
        droppedMissingUrl += 1;
        continue;
      }
      const normalizedUrl = r.url.trim().toLowerCase();
      if (seen.has(normalizedUrl)) {
        droppedDuplicate += 1;
        continue;
      }
      const domain = r.domain ?? this.extractDomain(r.url);
      if (domain && blocklist.has(domain)) {
        droppedBlocklisted += 1;
        continue;
      }
      if ((r.snippet ?? "").trim().length < minSnippet) {
        droppedShortSnippet += 1;
        continue;
      }
      seen.add(normalizedUrl);
      kept.push(r);
    }

    if (
      droppedMissingUrl +
        droppedDuplicate +
        droppedShortSnippet +
        droppedBlocklisted >
      0
    ) {
      this.logger.debug(
        `[filterValid] kept=${kept.length}/${results.length} dropped{url=${droppedMissingUrl}, dup=${droppedDuplicate}, short=${droppedShortSnippet}, blocked=${droppedBlocklisted}}`,
      );
    }

    return kept;
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }
}
