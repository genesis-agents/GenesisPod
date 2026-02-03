/**
 * Data Module Types
 * 数据模块类型定义
 */

// Re-export from abstractions for convenience
export type {
  DataSourceType,
  DataSourceConfig,
  DataFetchRequest,
  DataFetchResult,
  DataItem,
} from "../abstractions/data-source.interface";

export type {
  EnrichmentType,
  EnrichmentOptions,
  EnrichedDataItem,
  ExtractedFigure,
  ExtractedEntity,
} from "../abstractions/data-enricher.interface";
