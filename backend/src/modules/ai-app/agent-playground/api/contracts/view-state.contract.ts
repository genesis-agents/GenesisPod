/**
 * view-state.contract.ts —— Canonical mission detail view contract（B1-1）
 *
 * 单一源：本文件是 agent-playground mission detail view 的 backend canonical 形状。
 * 任何前端类型、projector 输出、controller 返回都必须 mirror 此文件，禁止反向。
 *
 * 落地依据：
 *   docs/architecture/ai-app/agent-playground/agent-team-thinning-plan-2026-05-26.md
 *   §6.2 Base contract / §6.3 Playground extension / §6.4 status enums / §6.7 refreshHints
 *
 * 配套：
 *   - artifact.contract.ts —— reportArtifact 形状
 *   - step-id-mapping.contract.ts —— 14 stage id 单一源
 *   - mission-view.projector.ts (B2-2)
 *
 * 设计约束（thinning plan §3.1）：
 *   - 前端不得 derive / 不得 synthesize / 不得 infer mission truth
 *   - sibling specialty 路由（dag/export/replay/leader-chat/report-version）不得
 *     重新定义 canonical view 已暴露字段
 */

import type { ReportArtifactView } from "./artifact.contract";

// ============================================================================
// Status enums（§6.4）
// ============================================================================

/** mission.status 6 值（§6.4.1）。terminal = completed | failed | cancelled | quality-failed。 */
export type MissionStatus =
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "quality-failed";

export const TERMINAL_MISSION_STATUSES: ReadonlySet<MissionStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
  "quality-failed",
]);

export function isMissionTerminal(status: MissionStatus): boolean {
  return TERMINAL_MISSION_STATUSES.has(status);
}

/** stage.status 5 值（§6.4.2）。 */
export type StageStatus = "pending" | "running" | "done" | "failed" | "skipped";

/** agent.phase 4 值（§6.4.3）。retryCount 是 auxiliary metadata，不影响 phase。 */
export type AgentPhase = "pending" | "running" | "completed" | "failed";

// ============================================================================
// Refresh hint（§6.7 / §6.7.2）
// ============================================================================

/** refreshHints 的 family 字段允许值。 */
export type RefreshHintFamily =
  | "mission"
  | "stages"
  | "agents"
  | "artifact"
  | "todo"
  | "cost"
  | "memory";

/**
 * 单条 refresh hint。
 * - mode=refetch：frontend 应 re-read canonical backend data for that family
 * - mode=patch：frontend 可应用 local non-authoritative patch（前提是不重新引入 truth derivation）
 * - id：narrow refresh to a specific entity（如 `stages:s5-reconciler`），缺省 = family 级
 */
export interface RefreshHint {
  family: RefreshHintFamily;
  mode: "refetch" | "patch";
  id?: string;
}

// ============================================================================
// Rerunnable stage entry（§6.5.2）
// ============================================================================

/** 单个 stage 的 rerun 资格。reason 用于 deny 时给 UI 显示。 */
export interface RerunnableStageEntry {
  /** 来自 STEP_ID_TO_FRONTEND_STAGE_ID 的 frontend stage id（见 step-id-mapping.contract.ts）。 */
  id: string;
  allowed: boolean;
  reason?: string;
}

// ============================================================================
// MissionViewBase（§6.2 base contract）
// ============================================================================

export interface MissionViewBaseMission {
  id: string;
  /** outward canonical 字段名（§6.3 field-name compatibility）。projector 映射自 persisted `topic`。 */
  title?: string;
  status: MissionStatus;
  startedAt?: string;
  finishedAt?: string;
  finalScore?: number;
  /** 给人看的 string。机器可读 enum 走 `failureCode`（playground extension）。 */
  failureMessage?: string;
  resumable: boolean;
  canCancel: boolean;
  rerunnableStages: RerunnableStageEntry[];
}

export interface MissionViewBaseStage {
  /** 与 STEP_ID_TO_FRONTEND_STAGE_ID 的 value 对齐（14 个 canonical stage）。 */
  id: string;
  label: string;
  status: StageStatus;
  startedAt?: string;
  endedAt?: string;
  detail?: string;
  /** auxiliary metadata，非 status authority。 */
  attempts?: number;
}

export interface MissionViewBaseAgent {
  id: string;
  role: string;
  phase: AgentPhase;
  modelId?: string;
  retryCount?: number;
  failureMessage?: string;
}

/**
 * MissionViewBase —— 三 app 共享的 canonical view 基类。
 *
 * §6.7.1：timelineVersion / snapshotVersion 必须 derived from persisted state，
 * 跨重启 + 多 pod 稳定，禁止 in-memory 序号 / websocket message count / wall-clock。
 */
export interface MissionViewBase {
  mission: MissionViewBaseMission;
  stages: MissionViewBaseStage[];
  agents: MissionViewBaseAgent[];
  /** B2 阶段必须返回 stable empty-state sentinel，不是 undefined。B3 才填实。 */
  reportArtifact?: ReportArtifactView | EmptyArtifactSentinel;
  /** B2 阶段必须返回 stable empty-state sentinel，不是 undefined。B3 才填实。 */
  todoBoard?: TodoBoardSentinel;
  cost?: MissionCostView;
  memory?: MissionMemorySentinel;
  /** §6.7.1：derived from persisted mission-event state（如 event count / revision counter）。 */
  timelineVersion: number;
  /** §6.7.1：derived from persisted view-relevant state（如 checkpoint/report/business update revisions）。 */
  snapshotVersion: number;
  refreshHints?: RefreshHint[];
}

// ============================================================================
// Empty-state sentinels（§B2-2 / §B2-3 stable empty-state payloads）
// ============================================================================

/**
 * B2 阶段返回此 sentinel，B3 切实填充。
 * frontend 必须能识别 sentinel 并显示 empty-state chrome，但不得"自己合成 canonical artifact"。
 */
export interface EmptyArtifactSentinel {
  kind: "empty-artifact";
  reason: "not-yet-materialized" | "no-report-versions" | "v1-needs-normalization";
}

export interface TodoBoardSentinel {
  kind: "empty-todo-board" | "todo-board";
  /** B3 实施 TodoBoardState 时替换为完整 shape。 */
  items?: unknown;
}

export interface MissionMemorySentinel {
  kind: "empty-memory" | "memory";
  /** B3 末期或 follow-up 程序具体填充。 */
  payload?: unknown;
}

// ============================================================================
// Cost view（playground 真实 schema 字段 §0.x）
// ============================================================================

/**
 * 来自 AgentPlaygroundMission 真实字段：
 *   tokensUsed BigInt? / costUsd Float? / elapsedWallTimeMs Int? / trajectoryStored Int?
 * BigInt 转 string 以避免 JSON 序列化精度丢失。
 */
export interface MissionCostView {
  tokensUsed?: string | null;
  costUsd?: number | null;
  elapsedWallTimeMs?: number | null;
  trajectoryStored?: number | null;
  currency: "USD";
}

// ============================================================================
// PlaygroundDomainView（§6.3 frozen extension fields）
// ============================================================================

/**
 * 单个 dimension 的浅形（§5.2 dimensions 是 app-owned 业务字段）。
 * 完整 shape 由 mission 的 pipeline 写入；canonical view 只暴露此投影。
 */
export interface DimensionView {
  id: string;
  name: string;
  rationale?: string;
}

/** 引用条目（来源于 reportFull.citations 或 mission references）。 */
export interface MissionReferenceView {
  index: number;
  title: string;
  url: string;
  domain?: string;
  publishedAt?: string;
}

/**
 * 报告版本列表项（不含 reportFull，仅 summary 字段，对齐现有
 * GET /missions/:id/report-versions 返回）。
 */
export interface ReportVersionView {
  version: number;
  versionLabel: string | null;
  reportTitle: string | null;
  reportSummary: string | null;
  finalScore: number | null;
  leaderSigned: boolean | null;
  triggerType: string;
  generatedAt: string;
}

/** Leader journal 投影（§5.2 leaderJournal 是 app-owned 业务字段）。 */
export interface LeaderJournalView {
  /** opaque 暴露给前端的 journal 主体；具体业务字段 projector 决定。 */
  entries: Array<{
    stage?: string;
    timestamp?: string;
    title?: string;
    body?: string;
  }>;
}

/**
 * agent-playground extension。冻结字段见 §6.3。
 *
 * 显式不暴露（§6.3 line 963-969）：
 *   - MissionElectionState / committedModelIds / reservations
 *
 * 显式 out of B1/B2 scope（§6.3 line 485-491）：
 *   - verifyConsensus / capabilityMeters / budgetTimeLimit
 *
 * 重新加入这些字段时必须同 PR 提供具体 TS shape 和 consuming UI。
 */
export interface PlaygroundDomainView extends MissionViewBase {
  mission: MissionViewBaseMission & {
    /** 兼容 baggage，新消费方禁用，参 §6.3 field-name compatibility rule 4-5。 */
    topic?: string;
    depth?: string;
    language?: string;
    maxCredits?: number;
    wallTimeMs?: number;
    themeSummary?: string;
    dimensions?: DimensionView[];
    leaderJournal?: LeaderJournalView | null;
    leaderOverallScore?: number | null;
    leaderSigned?: boolean | null;
    leaderVerdict?: string | null;
    terminalOutcome?: string | null;
    /** §6.2 canonical fail enum（来自 AgentPlaygroundMission.failureCode）。 */
    failureCode?: string | null;
    /** §6.6 v1 = ResearchReport / v2 = ReportArtifact。 */
    reportArtifactVersion?: number | null;
  };
  references: MissionReferenceView[];
  reportVersions: ReportVersionView[];
}

// ============================================================================
// View envelope（endpoint response 顶层包装；§B2-3 GET /missions/:id/view）
// ============================================================================

/**
 * canonical view endpoint 返回的顶层 envelope。
 * 注：现有 `GET /missions/:id` 返回 `{ mission }`；canonical view 用 `{ view }`
 * 以避免 sibling-route 字段冲突，参见 §6.9 disposition table 第一行。
 */
export interface MissionViewEnvelope {
  view: PlaygroundDomainView;
}
