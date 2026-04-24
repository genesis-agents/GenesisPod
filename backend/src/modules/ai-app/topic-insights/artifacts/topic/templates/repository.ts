import { Inject, Injectable, Optional } from "@nestjs/common";
import type { ResearchTopicType } from "@prisma/client";

import { DIMENSION_TEMPLATES } from "./config";
import type {
  DimensionTemplate,
  RenderedDimension,
  TemplateDimension,
} from "./types";

/**
 * DI token for overriding the seed template set (tests, future CMS / DB
 * source). When not bound, repository reads {@link DIMENSION_TEMPLATES}.
 */
export const DIMENSION_TEMPLATES_SEED = Symbol("DIMENSION_TEMPLATES_SEED");

/**
 * DimensionTemplatesRepository
 *
 * F1 · Foundation data layer for `/topics/templates` + `/topics/from-template`.
 *
 * Kept deliberately small: lookup + render. Substitution and fallback logic
 * stays here so callers never reach into the config shape directly.
 */
@Injectable()
export class DimensionTemplatesRepository {
  constructor(
    @Optional()
    @Inject(DIMENSION_TEMPLATES_SEED)
    private readonly seed?: readonly DimensionTemplate[],
  ) {}

  private get templates(): readonly DimensionTemplate[] {
    return this.seed ?? DIMENSION_TEMPLATES;
  }

  /** All templates registered for a given topicType. */
  listByType(type: ResearchTopicType): readonly DimensionTemplate[] {
    return this.templates.filter((t) => t.topicType === type);
  }

  /** First (canonical default) template for a topicType, or null if none. */
  getDefaultForType(type: ResearchTopicType): DimensionTemplate | null {
    return this.listByType(type)[0] ?? null;
  }

  /** Lookup by stable template id. Returns null when not found. */
  getById(id: string): DimensionTemplate | null {
    return this.templates.find((t) => t.id === id) ?? null;
  }

  /**
   * Substitute `{topicName}` placeholders inside a single dimension and shape
   * the result to match the `TopicDimension` DB columns.
   */
  renderDimension(
    dimension: TemplateDimension,
    topicName: string,
  ): RenderedDimension {
    const name = topicName.trim();
    const substitute = (s: string): string => s.split("{topicName}").join(name);
    return {
      name: dimension.name,
      description: dimension.description,
      searchQueries: dimension.queryTemplates.map(substitute),
      searchSources: [...dimension.dataSources],
      minSources: dimension.minSources,
      sortOrder: dimension.sortOrder,
    };
  }

  /** Render every dimension in a template. */
  renderTemplate(
    template: DimensionTemplate,
    topicName: string,
  ): readonly RenderedDimension[] {
    return template.dimensions.map((d) => this.renderDimension(d, topicName));
  }

  /**
   * F7 · Recommend templates for a topic name using simple keyword heuristics
   * across template descriptions + dimension names. LLM-backed ranking lands
   * in a follow-up; this heuristic is deterministic and serves as a baseline.
   *
   * Optional `preferredType` narrows the candidate pool first.
   */
  recommendForTopic(
    topicName: string,
    preferredType?: ResearchTopicType,
  ): ReadonlyArray<{
    readonly template: DimensionTemplate;
    readonly score: number;
    readonly matchedKeywords: readonly string[];
  }> {
    const pool = preferredType
      ? this.listByType(preferredType)
      : this.templates;
    const keywords = tokenizeTopic(topicName);
    if (keywords.length === 0) {
      return pool.map((t) => ({ template: t, score: 0, matchedKeywords: [] }));
    }
    const scored = pool.map((t) => {
      const haystack = [
        t.name,
        t.description,
        ...t.dimensions.map((d) => `${d.name} ${d.description} ${d.purpose}`),
      ]
        .join(" ")
        .toLowerCase();
      const matched = keywords.filter((k) => haystack.includes(k));
      return {
        template: t,
        score: matched.length / Math.max(1, keywords.length),
        matchedKeywords: matched,
      };
    });
    return scored.slice().sort((a, b) => b.score - a.score);
  }

  /**
   * F7 · Built-in template "sync" is a no-op — the config is the source of
   * truth and is already in sync at module load. When DB-backed overrides
   * land (custom templates), this method upserts each built-in into that
   * table so user-defined rows don't shadow canonical ids.
   */
  async syncBuiltIn(): Promise<{ synced: number; source: "config" }> {
    return { synced: this.templates.length, source: "config" };
  }

  /**
   * F7 · Placeholder for user-created templates. Throws until a DB-backed
   * override store lands; keeps the API surface stable for the frontend.
   */
  async createCustom(
    _dto: Omit<DimensionTemplate, "id">,
  ): Promise<DimensionTemplate> {
    throw new Error(
      "[DimensionTemplatesRepository.createCustom] custom template persistence not yet implemented — use config extension for now",
    );
  }

  async update(
    _id: string,
    _patch: Partial<DimensionTemplate>,
  ): Promise<DimensionTemplate> {
    throw new Error(
      "[DimensionTemplatesRepository.update] mutation not yet implemented — config is the current source of truth",
    );
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function tokenizeTopic(topicName: string): string[] {
  const normalized = topicName.trim().toLowerCase();
  if (!normalized) return [];
  // Split on whitespace + common separators; drop very short tokens that are
  // too generic to score against.
  return normalized
    .split(/[\s/·,.;:!?()\[\]{}<>"'`~@#$%^&*+=|\\-]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}
