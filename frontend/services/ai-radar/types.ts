/**
 * AI Radar 前端类型（mirror 后端 Prisma model + DTO）。
 *
 * 后端枚举 / Prisma model 字段保持 camelCase 对齐，避免前后端转换。
 */

export type RadarTopicStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type RadarSourceType = 'X' | 'YOUTUBE' | 'RSS' | 'CUSTOM';
export type RadarSourceHealth = 'UNKNOWN' | 'HEALTHY' | 'DEGRADED' | 'FAILING';
export type RadarRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';
export type RadarRunTrigger = 'SCHEDULED' | 'MANUAL' | 'FIRST_RUN';

/** 主题对象类型（create topic dto 用） */
export type RadarEntityType =
  | 'person'
  | 'company'
  | 'product'
  | 'event'
  | 'topic';

/** AI 实体抽取出的 entity 类型（backend ExtractedEntity；与 RadarEntityType 不同集合） */
export type RadarItemEntityKind =
  | 'person'
  | 'company'
  | 'product'
  | 'event'
  | 'location'
  | 'other';

export interface RadarTopic {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  entityType: string | null;
  keywords: string[];
  refreshCron: string;
  status: RadarTopicStatus;
  nextDueAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RadarTopicWithCounts extends RadarTopic {
  counts: { sources: number; items: number; runs: number };
}

export interface RadarSource {
  id: string;
  topicId: string;
  type: RadarSourceType;
  identifier: string;
  label: string | null;
  config: Record<string, unknown> | null;
  enabled: boolean;
  isAiRecommended: boolean;
  health: RadarSourceHealth;
  consecutiveFailures: number;
  cooldownUntil: string | null;
  lastFetchAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RadarItemEntity {
  type: RadarItemEntityKind;
  name: string;
  normalizedName: string;
  confidence: number;
}

export interface RadarItem {
  id: string;
  topicId: string;
  sourceId: string;
  externalId: string;
  contentHash: string;
  title: string | null;
  content: string | null;
  author: string | null;
  authorAvatar: string | null;
  url: string | null;
  publishedAt: string;
  fetchedAt: string;
  relevanceScore: number | null;
  qualityScore: number | null;
  aiSummary: string | null;
  entities: RadarItemEntity[] | null;
  metrics: Record<string, number | string> | null;
  accepted: boolean;
  source?: {
    id: string;
    type: RadarSourceType;
    label: string | null;
    identifier: string;
  };
}

export interface RadarInsightHighlight {
  title: string;
  itemIds: string[];
  type: 'trend' | 'new-entity' | 'anomaly' | 'key-event';
}

export interface RadarInsightSignal {
  kind: string;
  magnitude: number;
  evidence: string;
}

export interface RadarInsightTopEntity {
  type: string;
  name: string;
  mentions: number;
  /** backend fallback 路径可能漏写，UI 读时 ?? 0 兜底 */
  delta?: number;
}

export interface RadarInsight {
  id: string;
  topicId: string;
  runId: string | null;
  periodFrom: string;
  periodTo: string;
  summary: string;
  highlights: RadarInsightHighlight[];
  signals: RadarInsightSignal[];
  topEntities: RadarInsightTopEntity[];
  createdAt: string;
}

export interface RadarRun {
  id: string;
  topicId: string;
  status: RadarRunStatus;
  trigger: RadarRunTrigger;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  metrics: {
    itemsFetched?: number;
    itemsDeduped?: number;
    itemsInserted?: number;
    sourcesAttempted?: number;
    sourcesFailed?: number;
    sourceErrors?: Array<{ sourceId: string; error: string }>;
  } | null;
  error: string | null;
  createdAt: string;
}

export interface RecommendedSource {
  type: RadarSourceType;
  identifier: string;
  label: string;
  rationale: string;
  confidence: number;
}

export interface CreateRadarTopicInput {
  name: string;
  description?: string;
  entityType?: RadarEntityType;
  keywords: string[];
  refreshCron?: string;
}

export interface UpdateRadarTopicInput {
  name?: string;
  description?: string;
  entityType?: RadarEntityType;
  keywords?: string[];
  refreshCron?: string;
}

export interface CreateRadarSourceInput {
  type: RadarSourceType;
  identifier: string;
  label?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export interface RefreshRunSummary {
  runId: string;
  status: RadarRunStatus;
  sourcesAttempted: number;
  sourcesFailed: number;
  itemsFetched: number;
  itemsDeduped: number;
  itemsInserted: number;
  durationMs: number;
  errors: Array<{ sourceId: string; error: string }>;
}
