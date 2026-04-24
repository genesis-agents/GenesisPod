/**
 * Dimension template type definitions.
 *
 * F1 · Restoration of dimension-templates.config.ts deleted by H6 step 11.
 * Config is data-only; DimensionTemplatesRepository provides the lookup layer.
 */

import type { ResearchTopicType } from "@prisma/client";

/**
 * One dimension definition inside a {@link DimensionTemplate}.
 *
 * `queryTemplates` may contain `{topicName}` placeholders that are substituted
 * by `DimensionTemplatesRepository.renderDimension()` at `createFromTemplate`
 * time. Keeping substitution out of the config keeps the data static.
 */
export interface TemplateDimension {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly purpose: string;
  readonly queryTemplates: readonly string[];
  readonly dataSources: readonly string[];
  readonly minSources: number;
  readonly sortOrder: number;
}

/**
 * A named template the user can pick to bootstrap a research topic.
 *
 * Each `ResearchTopicType` has at least one canonical ("default") template.
 * Additional templates (specialized variants) can share the same topicType
 * and be selected by `id`.
 */
export interface DimensionTemplate {
  readonly id: string;
  readonly topicType: ResearchTopicType;
  readonly name: string;
  readonly description: string;
  readonly defaultLanguage: "zh" | "en";
  readonly defaultIcon?: string;
  readonly defaultColor?: string;
  readonly dimensions: readonly TemplateDimension[];
}

/**
 * Dimension produced by rendering a {@link TemplateDimension} for a concrete
 * topic name. Shape matches the `TopicDimension` DB columns.
 */
export interface RenderedDimension {
  readonly name: string;
  readonly description: string;
  readonly searchQueries: readonly string[];
  readonly searchSources: readonly string[];
  readonly minSources: number;
  readonly sortOrder: number;
}
