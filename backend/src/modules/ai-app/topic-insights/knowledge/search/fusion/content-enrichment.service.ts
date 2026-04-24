/**
 * ContentEnrichmentService (F5)
 *
 * Backfills missing metadata on search results so downstream evaluation /
 * fusion has something to score. Replaces the `enrichSearchResults`
 * method deleted from DataEnrichmentService in H6.
 *
 * Conservative: only fills *missing* fields — never overwrites values the
 * adapter already provided.
 */

import { Injectable } from "@nestjs/common";
import type { DataSourceResult } from "@/modules/ai-app/topic-insights/shared/types/data-source.types";

@Injectable()
export class ContentEnrichmentService {
  enrich(results: readonly DataSourceResult[]): DataSourceResult[] {
    return results.map((r) => this.enrichOne(r));
  }

  private enrichOne(r: DataSourceResult): DataSourceResult {
    const enriched: DataSourceResult = { ...r };
    if (!enriched.title || enriched.title.trim().length === 0) {
      enriched.title = this.deriveTitleFromUrl(r.url) ?? r.url;
    }
    if (!enriched.domain || enriched.domain.trim().length === 0) {
      const d = this.extractDomain(r.url);
      if (d) enriched.domain = d;
    }
    if (!enriched.snippet || enriched.snippet.trim().length === 0) {
      enriched.snippet = "（无摘要，已从结果中略过正文预览）";
    }
    return enriched;
  }

  private deriveTitleFromUrl(url: string): string | null {
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1];
      if (!last) return u.hostname;
      return (
        decodeURIComponent(last.replace(/[-_]/g, " ")).trim() || u.hostname
      );
    } catch {
      return null;
    }
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }
}
