/**
 * Session Latency Tracking Types
 *
 * 会话级端到端时延跟踪的核心类型定义。
 * 三级结构：Session → Phase → LLM Call / Checkpoint
 *
 * 设计为通用基础能力，可被任何 AI App 模块实例化使用。
 */

// ==================== Core Types ====================

/** 会话类型标识 */
export type LatencySessionType =
  | "topic_insights_refresh"
  | "team_execution"
  | "research_mission"
  | "ai_ask"
  | "ai_writing"
  | string; // 允许扩展

/** 会话状态 */
export type LatencySessionStatus = "running" | "completed" | "failed";

/**
 * 时延会话 — 一次完整的端到端执行
 */
export interface LatencySession {
  id: string;
  type: LatencySessionType;
  status: LatencySessionStatus;
  userId?: string;
  /** 业务实体 ID（topicId、teamId 等） */
  entityId?: string;
  metadata: Record<string, unknown>;
  startTime: number; // Date.now() ms
  endTime?: number;
  phases: LatencyPhase[];
  llmCalls: LLMLatencyRecord[];
}

/**
 * 阶段 — 会话中的一个命名步骤
 */
export interface LatencyPhase {
  id: string;
  name: string;
  /** 支持嵌套（如 dimension_research 下的子阶段） */
  parentPhaseId?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  /** 是否并行阶段 */
  parallel?: boolean;
  /** 并行任务数量 */
  parallelCount?: number;
  metadata?: Record<string, unknown>;
  checkpoints: LatencyCheckpoint[];
}

/**
 * 检查点 — 阶段内的关键时间节点
 */
export interface LatencyCheckpoint {
  name: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ==================== LLM Latency ====================

/**
 * LLM 调用时延记录
 */
export interface LLMLatencyRecord {
  id: string;
  sessionId: string;
  phaseId?: string;
  /** Step 名称 — 描述这次调用在做什么（如 "大纲规划"、"章节写作"、"web_search"） */
  stepName?: string;
  model: string;
  provider: string;
  streaming: boolean;
  /** Time To First Token (ms) — 仅流式调用 */
  ttftMs?: number;
  /** Time To Last Token (ms) — 即端到端耗时 */
  ttltMs: number;
  /** 端到端总耗时 (ms) */
  totalDurationMs: number;
  /** 输入 Token 数 */
  inputTokens: number;
  /** 输出 Token 数 */
  outputTokens: number;
  /** 输出吞吐量 (tokens/sec)，流式: outputTokens / ((ttlt - ttft) / 1000) */
  tokenThroughputPerSec: number;
  timestamp: number;
}

// ==================== Summary ====================

/** 阶段耗时摘要 */
export interface PhaseDurationSummary {
  name: string;
  durationMs: number;
  percentOfTotal: number;
  /** 该阶段内 LLM 调用次数 */
  llmCallCount: number;
  /** 该阶段内 LLM 平均 TTLT (ms) */
  avgTtltMs?: number;
}

/** 时延百分位统计（TTFT / TTLT 通用） */
export interface LatencyPercentileStats {
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

/** @deprecated Use LatencyPercentileStats */
export type TTFTStats = LatencyPercentileStats;

/**
 * 会话摘要 — endSession() 时自动计算
 */
export interface LatencySessionSummary {
  sessionId: string;
  type: LatencySessionType;
  status: LatencySessionStatus;
  totalDurationMs: number;
  /** 阶段耗时分解 */
  phases: PhaseDurationSummary[];
  /** LLM 调用总数 */
  llmCallCount: number;
  /** LLM 总耗时 (ms) */
  llmTotalTimeMs: number;
  /** LLM 时间占总时间百分比 */
  llmTimePercent: number;
  /** 非 LLM 开销 (ms) */
  overheadMs: number;
  /** TTFT 统计（仅流式调用） */
  ttft?: LatencyPercentileStats;
  /** TTLT 统计（所有 LLM 调用） */
  ttlt?: LatencyPercentileStats;
  /** Token 统计 */
  totalInputTokens: number;
  totalOutputTokens: number;
  /** 平均输出吞吐量 (tokens/sec) */
  avgTokenThroughput: number;
}

// ==================== Input Types ====================

/** 创建会话参数 */
export interface StartSessionInput {
  type: LatencySessionType;
  userId?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** 开始阶段参数 */
export interface StartPhaseInput {
  name: string;
  parentPhaseId?: string;
  parallel?: boolean;
  parallelCount?: number;
  metadata?: Record<string, unknown>;
}

/** 记录 LLM 调用时延参数 */
export interface RecordLLMLatencyInput {
  phaseId?: string;
  /** Step 名称 — 描述这次调用的操作 */
  stepName?: string;
  model: string;
  provider: string;
  streaming: boolean;
  ttftMs?: number;
  ttltMs: number;
  totalDurationMs: number;
  inputTokens: number;
  outputTokens: number;
}

/** 查询会话列表参数 */
export interface ListSessionsFilter {
  type?: LatencySessionType;
  userId?: string;
  entityId?: string;
  status?: LatencySessionStatus;
  /** 起始时间 (ms timestamp) */
  since?: number;
  limit?: number;
}
