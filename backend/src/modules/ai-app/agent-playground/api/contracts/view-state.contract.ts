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
// Canonical base re-export from harness (B6 / B7 lift)
//
// 这些 type 物理位置在 ai-harness/teams/business-team/abstractions/
// mission-view-base.contract.ts，三 app 共享。本 file 仅 re-export +
// 在下方 extend playground 专属字段。
// ============================================================================

export {
  TERMINAL_MISSION_STATUSES,
  isMissionTerminal,
} from "@/modules/ai-harness/facade";
export type {
  MissionViewStatus as MissionStatus,
  MissionViewStageStatus as StageStatus,
  MissionViewAgentPhase as AgentPhase,
  RefreshHintFamily,
  RefreshHint,
  RerunnableStageEntry,
  MissionViewBaseMission,
  MissionViewBaseStage,
  MissionViewBaseAgent,
  EmptyArtifactSentinel,
  MissionMemorySentinel,
  MissionCostView,
} from "@/modules/ai-harness/facade";

import type {
  MissionViewBase,
  TodoBoardSentinel as HarnessTodoBoardSentinel,
  MissionViewBaseMission,
} from "@/modules/ai-harness/facade";

// ============================================================================
// TodoBoardState（B3-1 first cut；§6.6.3 truth logic split）
// ============================================================================

export type TodoOrigin =
  | "leader-plan"
  | "leader-assess-retry"
  | "leader-assess-replace"
  | "leader-assess-extend"
  | "leader-assess-abort"
  | "leader-chat-create"
  | "self-heal-retry"
  | "reviewer-revise"
  | "critic-blindspot"
  | "reconciler-gap"
  | "system-stage"
  | "chapter-pipeline";

export type TodoScope = "mission" | "dimension" | "chapter" | "review" | "system";

export type TodoStatus =
  | "pending"
  | "in_progress"
  | "blocked"
  | "done"
  | "failed"
  | "cancelled";

export interface TodoBoardEntry {
  id: string;
  parentId?: string;
  origin: TodoOrigin;
  scope: TodoScope;
  status: TodoStatus;
  title: string;
  systemStageId?: string;
  dimensionRef?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

/**
 * §6.6.3 first-cut Todo board canonical shape — playground-specialized sentinel
 * narrows the harness `TodoBoardSentinel<TEntry>` to `TodoBoardEntry`.
 */
export type TodoBoardSentinel = HarnessTodoBoardSentinel<TodoBoardEntry>;

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
export interface PlaygroundDomainView
  extends MissionViewBase<ReportArtifactView, TodoBoardEntry> {
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
