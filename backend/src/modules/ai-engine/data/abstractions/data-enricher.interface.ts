/**
 * Data Enricher Interface
 * 数据增强器抽象接口
 */

import { DataItem } from "./data-source.interface";

/**
 * 增强类型
 */
export type EnrichmentType =
  | "content-extraction" // 内容提取（从 URL 获取完整内容）
  | "figure-extraction" // 图表提取
  | "metadata" // 元数据增强
  | "summarization" // 摘要生成
  | "translation" // 翻译
  | "sentiment" // 情感分析
  | "entity-extraction"; // 实体提取

/**
 * 增强选项
 */
export interface EnrichmentOptions {
  types: EnrichmentType[]; // 需要的增强类型
  maxContentLength?: number; // 最大内容长度
  extractFigures?: boolean; // 是否提取图表
  generateSummary?: boolean; // 是否生成摘要
  targetLanguage?: string; // 目标语言
  timeout?: number; // 超时时间 (ms)
}

/**
 * 提取的图表
 */
export interface ExtractedFigure {
  type: "image" | "chart" | "table" | "diagram";
  url?: string;
  base64?: string;
  caption?: string;
  sourceUrl: string;
  width?: number;
  height?: number;
}

/**
 * 提取的实体
 */
export interface ExtractedEntity {
  type: "person" | "organization" | "location" | "date" | "concept" | "other";
  value: string;
  confidence: number;
  positions?: Array<{ start: number; end: number }>;
}

/**
 * 情感分析结果
 */
export interface SentimentResult {
  score: number; // -1 到 1
  label: "positive" | "negative" | "neutral";
  confidence: number;
}

/**
 * 增强后的数据项
 */
export interface EnrichedDataItem extends DataItem {
  enrichments: {
    fullContent?: string; // 完整内容
    summary?: string; // 摘要
    figures?: ExtractedFigure[]; // 提取的图表
    entities?: ExtractedEntity[]; // 提取的实体
    sentiment?: SentimentResult; // 情感分析
    translatedContent?: string; // 翻译内容
    metadata?: Record<string, unknown>; // 增强的元数据
  };
  enrichedAt: Date;
  enrichmentErrors?: Array<{
    type: EnrichmentType;
    error: string;
  }>;
}

/**
 * 数据增强器接口
 */
export interface IDataEnricher {
  readonly type: EnrichmentType;

  /**
   * 增强单条数据
   */
  enrich(
    item: DataItem,
    options?: Partial<EnrichmentOptions>,
  ): Promise<Partial<EnrichedDataItem["enrichments"]>>;

  /**
   * 批量增强
   */
  enrichBatch(
    items: DataItem[],
    options?: Partial<EnrichmentOptions>,
  ): Promise<EnrichedDataItem[]>;

  /**
   * 检查增强器是否可用
   */
  isAvailable(): Promise<boolean>;
}

/**
 * 数据增强服务接口
 */
export interface IDataEnrichmentService {
  /**
   * 注册增强器
   */
  registerEnricher(enricher: IDataEnricher): void;

  /**
   * 增强数据
   */
  enrich(
    items: DataItem[],
    options: EnrichmentOptions,
  ): Promise<EnrichedDataItem[]>;

  /**
   * 获取可用增强器
   */
  getAvailableEnrichers(): EnrichmentType[];
}
