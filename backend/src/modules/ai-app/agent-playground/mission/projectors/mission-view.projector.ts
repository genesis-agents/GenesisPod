/**
 * mission-view.projector.ts — Top-level projector composing canonical view（B2-2）
 *
 * 落地依据：thinning plan §6.2 / §6.4.1 / §6.4.1.a / §6.7 / §6.7.1
 *
 * 输入：MissionQueryInputs（已 ownership-checked + 已含 resume/rerun 决策）。
 * 输出：PlaygroundDomainView（顶层 view）。
 *
 * §6.4.1.a 持久化-投影映射顺序在 resolvePublicStatus 内严格执行。
 * §6.7.1 timelineVersion / snapshotVersion 来源为已持久化的事件 / row revision，
 * 严禁使用 in-memory 序号 / wall-clock。
 *
 * §B2-2 第 5 条：未实现的 todoBoard / reportArtifact 必须返回 stable sentinel，禁 undefined。
 */

import type { MissionDetail } from "../lifecycle/mission-store.service";
import type { MissionQueryInputs } from "../query/mission-query.service";
import { projectStages } from "./stage-view.projector";
import { projectAgents } from "./agent-view.projector";
import { projectTodoBoard } from "./todo-board.projector";
import { projectArtifact } from "./artifact.projector";
import type {
  DimensionView,
  EmptyArtifactSentinel,
  MissionCostView,
  MissionMemorySentinel,
  MissionReferenceView,
  MissionStatus,
  PlaygroundDomainView,
  ReportVersionView,
  TodoBoardSentinel,
} from "../../api/contracts/view-state.contract";
import type { ReportArtifactV2 } from "../../api/contracts/artifact.contract";

// ============================================================================
// Public entry
// ============================================================================

export function projectMissionView(
  inputs: MissionQueryInputs,
): PlaygroundDomainView {
  if (inputs.mode === "starting-placeholder") {
    return buildStartingView(inputs.missionId, inputs.rerunnableStages);
  }
  return buildRowLoadedView(inputs);
}

// ============================================================================
// starting placeholder（§6.4.1.a rule 1）
// ============================================================================

function buildStartingView(
  missionId: string,
  rerunnableStages: PlaygroundDomainView["mission"]["rerunnableStages"],
): PlaygroundDomainView {
  return {
    mission: {
      id: missionId,
      status: "starting",
      startedAt: new Date().toISOString(),
      resumable: false,
      canCancel: false,
      rerunnableStages,
    },
    stages: projectStages([]),
    agents: [],
    reportArtifact: buildEmptyArtifactSentinel("not-yet-materialized"),
    todoBoard: buildEmptyTodoBoardSentinel(),
    cost: buildZeroCost(),
    memory: buildEmptyMemorySentinel(),
    timelineVersion: 0,
    snapshotVersion: 0,
    refreshHints: [],
    references: [],
    reportVersions: [],
  };
}

// ============================================================================
// row-loaded（主路径）
// ============================================================================

function buildRowLoadedView(inputs: MissionQueryInputs): PlaygroundDomainView {
  const row = inputs.row!;
  const stages = projectStages(inputs.events);
  const agents = projectAgents(inputs.events);
  const todoBoard = projectTodoBoard(row, inputs.events);
  const reportArtifact: ReportArtifactV2 | EmptyArtifactSentinel = projectArtifact(row);

  const publicStatus = resolvePublicStatus(row);

  return {
    mission: {
      id: row.id,
      // §6.3 field-name compatibility：persisted topic → outward title
      title: row.topic,
      topic: row.topic, // 兼容 baggage（§6.3 rule 4）
      depth: row.depth,
      language: row.language,
      maxCredits: row.maxCredits ?? undefined,
      // §6.3 frozen extension fields
      themeSummary: row.themeSummary ?? undefined,
      dimensions: extractDimensions(row.dimensions),
      leaderOverallScore: row.leaderOverallScore ?? null,
      leaderSigned: row.leaderSigned ?? null,
      leaderVerdict: row.leaderVerdict ?? null,
      terminalOutcome: row.terminalOutcome ?? null,
      failureCode: row.failureCode ?? null,
      reportArtifactVersion: row.reportArtifactVersion ?? null,
      status: publicStatus,
      startedAt: isoOrUndef(row.startedAt),
      finishedAt: isoOrUndef(row.completedAt),
      finalScore: row.finalScore ?? undefined,
      failureMessage: row.errorMessage ?? undefined,
      resumable: inputs.resume.resumable,
      canCancel: publicStatus === "running" || publicStatus === "starting",
      rerunnableStages: inputs.rerunnableStages,
    },
    stages,
    agents,
    // B3-2 / B3-1 接入：artifact.projector + todo-board.projector
    reportArtifact,
    todoBoard,
    cost: buildCostView(row),
    memory: buildEmptyMemorySentinel(),
    // §6.7.1 timelineVersion = persisted event count（events 已含 buffer + persisted fallback）
    timelineVersion: inputs.events.length,
    // §6.7.1 snapshotVersion = persisted view-relevant revision；first cut 用
    // lastCompletedStage + finalScore presence 组合的轻量 reducer。任何变更触发 +1。
    snapshotVersion: deriveSnapshotVersion(row),
    refreshHints: [], // projector 不产生 hint；hint 在 §6.7.3 stream emit 时由 dispatcher 注入
    references: [], // B3 阶段实施
    reportVersions: [], // B3 阶段实施（已有 GET /report-versions sibling 路由提供）
  };
}

// ============================================================================
// §6.4.1.a Persistence-to-view mapping（严格优先级）
// ============================================================================

function resolvePublicStatus(row: MissionDetail): MissionStatus {
  // rule 2：cancelled lifecycle 信号目前未在 MissionDetail.status 暴露；预留 cancelled enum 透传
  if (row.status === "cancelled") return "cancelled";
  // rule 3
  if (row.status === "completed") return "completed";
  // rule 4：persisted "rejected" → public "quality-failed"（playground 专属）
  if (row.status === "rejected") return "quality-failed";
  // rule 5
  if (row.status === "failed") return "failed";
  // rule 6
  if (row.status === "running") return "running";
  // rule 1：no durable row → starting；row 已存在但 status 未匹配任何枚举的边界
  return "running";
}

// ============================================================================
// sentinels（§B2-2 第 5 条）
// ============================================================================

function buildEmptyArtifactSentinel(
  reason: EmptyArtifactSentinel["reason"],
): EmptyArtifactSentinel {
  return { kind: "empty-artifact", reason };
}

function buildEmptyTodoBoardSentinel(): TodoBoardSentinel {
  return { kind: "empty-todo-board" };
}

function buildEmptyMemorySentinel(): MissionMemorySentinel {
  return { kind: "empty-memory" };
}

// ============================================================================
// cost view
// ============================================================================

function buildCostView(row: MissionDetail): MissionCostView {
  return {
    tokensUsed: row.tokensUsed != null ? String(row.tokensUsed) : null,
    costUsd: row.costUsd ?? null,
    elapsedWallTimeMs: row.elapsedWallTimeMs ?? null,
    trajectoryStored: row.trajectoryStored ?? null,
    currency: "USD",
  };
}

function buildZeroCost(): MissionCostView {
  return {
    tokensUsed: null,
    costUsd: null,
    elapsedWallTimeMs: null,
    trajectoryStored: null,
    currency: "USD",
  };
}

// ============================================================================
// §6.7.1 snapshotVersion reducer
// ============================================================================

function deriveSnapshotVersion(row: MissionDetail): number {
  // first-cut 复合：reportArtifactVersion + finalScore 出现性 + lastCompletedStage 序数
  // 三者任一变更触发 +1。lastCompletedStage 是 Prisma Int? stage ordinal（1-based），
  // 直接累加。
  let v = 0;
  if (row.reportArtifactVersion != null) v += row.reportArtifactVersion;
  if (row.finalScore != null) v += 1;
  if (row.leaderSigned != null) v += 1;
  if (row.lastCompletedStage != null) v += row.lastCompletedStage;
  if (row.completedAt != null) v += 1;
  return v;
}

// ============================================================================
// misc helpers
// ============================================================================

function isoOrUndef(dt: Date | null | undefined): string | undefined {
  if (!dt) return undefined;
  return dt.toISOString();
}

function extractDimensions(raw: unknown): DimensionView[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((d): d is Record<string, unknown> => d != null && typeof d === "object")
    .map((d) => ({
      id: typeof d.id === "string" ? d.id : "",
      name: typeof d.name === "string" ? d.name : "",
      rationale: typeof d.rationale === "string" ? d.rationale : undefined,
    }));
}

// Re-exports to make sibling routes / fixtures know the placeholder type aliases
export type {
  PlaygroundDomainView,
  MissionReferenceView,
  ReportVersionView,
};
