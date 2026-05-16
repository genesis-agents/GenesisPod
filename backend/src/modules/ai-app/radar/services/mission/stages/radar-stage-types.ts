/**
 * RadarStage 共享类型 —— 给 8 个主刷新 stage + 1 个 discovery stage 共用
 *
 * StageRunner 接口：每个 stage 必须 implement run(args, ctx) → output
 * RadarMissionContext: per-mission session 容器，dispatcher 创建，stage 读取
 */
import type { StageRunArgs } from "@/modules/ai-harness/facade";
import type { RadarSource, RadarTopic } from "@prisma/client";
import type {
  RunRadarDiscoveryMissionInput,
  RunRadarRefreshMissionInput,
} from "../../../dto/run-radar-refresh-mission.dto";

/**
 * Per-mission session 容器（保存在 dispatcher 的 sessions Map 内）。
 * stage hook 闭包通过 sessionLookup 从 missionId 解析此对象。
 */
export interface RadarMissionContext {
  readonly missionId: string;
  readonly userId: string;
  readonly trigger: "MANUAL" | "SCHEDULED" | "FIRST_RUN";
  readonly input: RunRadarRefreshMissionInput | RunRadarDiscoveryMissionInput;
  /** 跨 stage 共享状态（避免 dbWrites 来回查 DB） */
  readonly state: RadarMissionState;
  readonly signal: AbortSignal;
}

/**
 * 跨 stage 累计的中间产物 + metrics。
 *
 * playground 用 PlaygroundCrossStageState 容器封装，radar 直接用 plain interface
 * （没有 14 个 ad-hoc 字段，简单够用）。
 */
export interface RadarMissionState {
  topic?: RadarTopic;
  sources?: RadarSource[];
  since?: Date;
  rawItems?: RadarRawItem[];
  uniqueItems?: RadarRawItem[];
  newItemIds?: string[];
  itemSourceMap?: Map<string, string>;
  /** S4 输出：item id → relevanceScore */
  relevanceScores?: Map<string, { score: number; reason: string }>;
  /** S5 输出：item id → qualityScore + summary */
  qualityScores?: Map<string, { score: number; summary: string }>;
  /** S6 输出：item id → entities */
  entityMap?: Map<string, RadarExtractedEntity[]>;
  insightPayload?: RadarInsightPayload;
  metrics: RadarRunMetrics;
}

export function emptyRadarMissionState(): RadarMissionState {
  return {
    metrics: {
      sourcesAttempted: 0,
      sourcesFailed: 0,
      itemsFetched: 0,
      itemsDeduped: 0,
      itemsInserted: 0,
      itemsEvaluated: 0,
      itemsAccepted: 0,
      insightCreated: false,
      sourceErrors: [],
    },
  };
}

export interface RadarRawItem {
  externalId: string;
  contentHash: string;
  title: string | null;
  content: string | null;
  author: string | null;
  authorAvatar: string | null;
  url: string | null;
  publishedAt: Date;
  raw: Record<string, unknown>;
  metrics: Record<string, unknown> | null;
  /** S2 stage 必填：raw item 关联的 RadarSource.id */
  sourceId: string;
}

export type RadarExtractedEntityKind =
  | "person"
  | "company"
  | "product"
  | "event"
  | "location"
  | "other";

export interface RadarExtractedEntity {
  type: RadarExtractedEntityKind;
  name: string;
  normalizedName: string;
  confidence: number;
}

export interface RadarInsightPayload {
  summary: string;
  highlights: Array<{
    title: string;
    itemIds: string[];
    type: "trend" | "new-entity" | "anomaly" | "key-event";
  }>;
  signals: Array<{
    kind: string;
    magnitude: number;
    evidence: string;
  }>;
  topEntities: Array<{
    type: string;
    name: string;
    mentions: number;
    delta: number;
  }>;
}

export interface RadarRunMetrics {
  sourcesAttempted: number;
  sourcesFailed: number;
  itemsFetched: number;
  itemsDeduped: number;
  itemsInserted: number;
  itemsEvaluated: number;
  itemsAccepted: number;
  insightCreated: boolean;
  sourceErrors: Array<{ sourceId: string; error: string }>;
}

/**
 * Stage hook args（persist primitive 的 hook signature 简化）。
 *
 * business orchestrator 在调 runner 前，自己 inject systemPrompt（从 SKILL.md
 * 加载），因为 persist primitive 不通过 args 传 role.skillSpec。
 */
export interface RadarStageHookArgs {
  readonly ctx: StageRunArgs["ctx"];
  readonly previousOutputs: StageRunArgs["previousOutputs"];
  readonly crossStageState: StageRunArgs["crossStageState"];
  /** 业务方注入：当前 step 对应的 SKILL.md systemPrompt（已加载） */
  readonly systemPrompt: string;
}

/**
 * Stage runner 接口。每个 stage adapter service 实现此接口被 business
 * orchestrator 调度；副作用写到 ctx（RadarMissionContext.state），无返回值。
 */
export interface RadarStageRunner {
  run(args: RadarStageHookArgs, ctx: RadarMissionContext): Promise<void>;
}
