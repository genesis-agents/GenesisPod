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
}
