/**
 * EvidenceEvaluationService (F5)
 *
 * Annotates search results with a provisional credibility score *before*
 * result-fusion runs, so per-source weighting stays consistent even when an
 * adapter didn't compute one. Replaces the `evaluateEvidence` method deleted
 * from DataEnrichmentService in H6.
 *
 * Keeps scoring intentionally small here (domain heuristics + source-type
 * defaults) — the heavy linear composite still happens in ResultFusionService.
 */

import { Injectable } from "@nestjs/common";
import {
  DataSourceType,
  type DataSourceResult,
} from "@/modules/ai-app/topic-insights/shared/types/data-source.types";

const SOURCE_TYPE_BASE: Partial<Record<DataSourceType, number>> = {
  [DataSourceType.ACADEMIC]: 0.9,
  [DataSourceType.OPENALEX]: 0.9,
  [DataSourceType.PUBMED]: 0.9,
  [DataSourceType.SEMANTIC_SCHOLAR]: 0.85,
  [DataSourceType.INDUSTRY_REPORT]: 0.85,
  [DataSourceType.GITHUB]: 0.7,
  [DataSourceType.WEB]: 0.6,
  [DataSourceType.HACKERNEWS]: 0.5,
  [DataSourceType.SOCIAL_X]: 0.4,
};

const HIGH_AUTH_DOMAIN_PATTERNS = [
  /\.gov(\.|\/|$)/i,
  /\.edu(\.|\/|$)/i,
  /\.ac\./i,
  /arxiv\.org/i,
  /nature\.com/i,
  /sciencedirect\.com/i,
  /springer\.com/i,
  /ieee\.org/i,
];

export interface EvaluatedResult extends DataSourceResult {
  credibilityPre: number;
}

@Injectable()
export class EvidenceEvaluationService {
  evaluate(
    results: readonly DataSourceResult[],
    sourceType: DataSourceType,
  ): EvaluatedResult[] {
    const base = SOURCE_TYPE_BASE[sourceType] ?? 0.55;
    return results.map((r) => {
      let score = base;
      const domain = r.domain ?? this.extractDomain(r.url);
      if (domain && HIGH_AUTH_DOMAIN_PATTERNS.some((re) => re.test(domain))) {
        score = Math.min(1, score + 0.1);
      }
      if (r.publishedAt) {
        const ageMs = Date.now() - new Date(r.publishedAt).getTime();
        const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365);
        if (ageYears > 5) score *= 0.85;
        else if (ageYears > 2) score *= 0.95;
      }
      return { ...r, credibilityPre: Number(score.toFixed(3)) };
    });
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }
}
