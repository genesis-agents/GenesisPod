/**
 * Data Source Types for Topic Research
 *
 * 数据源类型定义,用于路由和聚合多个数据源的搜索结果
 */

/**
 * 数据源类型枚举
 */
export enum DataSourceType {
  WEB = "web", // Web搜索 (Tavily/Serper)
  ACADEMIC = "academic", // 学术搜索 (ArXiv)
  GITHUB = "github", // GitHub仓库搜索
  HACKERNEWS = "hackernews", // HackerNews
  RSS = "rss", // RSS订阅
  LOCAL = "local", // 本地资源库
}

/**
 * 单个数据源的搜索结果
 */
export interface DataSourceResult {
  sourceType: DataSourceType;
  title: string;
  url: string;
  snippet: string;
  publishedAt?: Date;
  domain?: string;
  metadata?: Record<string, any>;
}

/**
 * 聚合的搜索结果
 */
export interface AggregatedSearchResult {
  items: DataSourceResult[];
  totalCount: number;
  sources: DataSourceType[];
  metadata?: {
    searchQuery: string;
    executionTimeMs: number;
    sourceResults: Record<DataSourceType, number>;
  };
}

/**
 * 数据源搜索选项
 */
export interface SearchOptions {
  maxResults?: number;
  since?: Date;
  timeout?: number;
}

/**
 * 数据源配置
 */
export interface DimensionSourceConfig {
  primarySources: DataSourceType[];
  secondarySources: DataSourceType[];
  minSourceCount: number;
  maxResultsPerSource: number;
  freshnessRequirement: "recent" | "standard" | "archival";
}

/**
 * 搜索查询构建器接口
 */
export interface SearchQueryBuilder {
  buildQuery(
    topicName: string,
    dimensionName: string,
    additionalQueries?: string[],
  ): string;
}
