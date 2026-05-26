/**
 * social-mission-view.projector.ts — Pure projector for social canonical view（B7-1）
 *
 * 落地依据：thinning plan §B7-1 / §6.4.1.a (social aborted -> cancelled mapping).
 *
 * First cut：
 *   ✅ mission row → SocialDomainView.mission 基础映射
 *   ✅ §6.4.1.a per-app status mapping（social aborted -> cancelled）
 *   ✅ cost view
 *   ✅ sentinels for stages/agents/reportArtifact/todoBoard/memory
 *   ⏳ stage projection (B7 follow-up — social pipeline 12 stages)
 *   ⏳ agent projection (B7 follow-up)
 *   ⏳ artifact composer (B7 follow-up — trajectory shape ≠ playground reportArtifact)
 *   ⏳ todoBoard projector (B7 follow-up)
 *
 * §6.7.1 timelineVersion/snapshotVersion 由 mission row 字段 + lastCompletedStage 派生。
 */

import type { SocialMissionQueryInputs } from "../query/social-mission-query.service";
import type {
  MissionStatus,
  SocialDomainView,
  EmptyArtifactSentinel,
  SocialTodoBoardSentinel,
  SocialPublishedSummary,
} from "../../api/contracts/view-state.contract";
import type {
  MissionViewBaseStage,
  MissionViewStageStatus as StageStatus,
} from "@/modules/ai-harness/facade";

// Social pipeline 11 个 stage（mirror social/mission/pipeline/stages/ 目录）
const SOCIAL_STAGES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "s1-mission-budget-eval", label: "预算评估" },
  { id: "s2-platform-probe", label: "平台探测" },
  { id: "s3-content-transform", label: "内容转换" },
  { id: "s4-leader-assess-transform", label: "Leader 评审转换" },
  { id: "s5-cover-craft", label: "封面制作" },
  { id: "s6-body-compose", label: "正文组装" },
  { id: "s7-polish-review", label: "润色复审" },
  { id: "s8-publish-execute", label: "发布执行" },
  { id: "s8b-publish-retry", label: "发布重试" },
  { id: "s9-publish-verify", label: "发布核验" },
  { id: "s10-leader-signoff", label: "Leader 签字" },
  { id: "s11-mission-persist", label: "持久化" },
  { id: "s12-self-evolution", label: "自我进化" },
];

/**
 * Stage projection based on row.lastCompletedStage (ordinal) + status.
 * 增强 first-cut (P0-B): ordinal-based 推断，不读 events buffer。
 * 完整 events-based projection 排 follow-up（需 SocialMissionEventBuffer 集成）。
 */
function projectSocialStages(
  lastCompletedStage: number | null | undefined,
  missionStatus: MissionStatus,
): MissionViewBaseStage[] {
  const lastCompleted = lastCompletedStage ?? 0;
  const isTerminalFailed = missionStatus === "failed" || missionStatus === "cancelled";
  const isCompleted = missionStatus === "completed";
  return SOCIAL_STAGES.map((s, i) => {
    const ord = i + 1;
    let status: StageStatus;
    if (ord <= lastCompleted) {
      status = "done";
    } else if (ord === lastCompleted + 1) {
      if (isCompleted) status = "done";
      else if (isTerminalFailed) status = "failed";
      else status = "running";
    } else {
      status = "pending";
    }
    return { id: s.id, label: s.label, status };
  });
}

export function projectSocialMissionView(
  inputs: SocialMissionQueryInputs,
): SocialDomainView {
  const row = inputs.row!;

  const publicStatus = resolvePublicStatus(row.status);

  return {
    mission: {
      id: row.id,
      title: undefined, // social mission no title field (content owns)
      status: publicStatus,
      startedAt: row.startedAt?.toISOString(),
      finishedAt: row.completedAt?.toISOString(),
      finalScore: undefined, // social has no aggregate score; per-platform success only
      failureMessage: row.errorMessage ?? undefined,
      resumable: false, // first cut: social resume policy TBD
      canCancel:
        publicStatus === "running" || publicStatus === "starting",
      rerunnableStages: [], // first cut: B7 follow-up
      contentId: row.contentId,
      platforms: row.platforms as SocialDomainView["mission"]["platforms"],
      connectionIds:
        (row.connectionIds as Record<string, string> | null) ?? undefined,
      depth: row.depth,
      budgetProfile: row.budgetProfile,
      language: row.language,
      maxCredits: row.maxCredits,
      failureCode: row.failureCode ?? null,
      terminalOutcome: deriveTerminalOutcome(row.status),
    },
    stages: projectSocialStages(row.lastCompletedStage, publicStatus),
    agents: [],
    reportArtifact: buildEmptyArtifactSentinel(row),
    todoBoard: buildEmptyTodoBoardSentinel(),
    cost: {
      tokensUsed: row.tokensUsed != null ? String(row.tokensUsed) : null,
      costUsd: row.costUsd ?? null,
      elapsedWallTimeMs: row.elapsedWallTimeMs ?? null,
      trajectoryStored: null,
      currency: "USD",
    },
    memory: { kind: "empty-memory" },
    timelineVersion: row.lastCompletedStage ?? 0,
    snapshotVersion: deriveSnapshotVersion(row),
    refreshHints: [],
  };
}

// ============================================================================
// §6.4.1.a per-app status mapping for social
// ============================================================================

function resolvePublicStatus(persisted: string): MissionStatus {
  switch (persisted) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "aborted":
      // social-specific mapping per readiness assessment §2:
      // aborted -> cancelled (social has no quality-failed)
      return "cancelled";
    case "running":
      return "running";
    default:
      return "running";
  }
}

function deriveTerminalOutcome(persisted: string): string | null {
  if (persisted === "completed") return "completed";
  if (persisted === "failed") return "failed";
  if (persisted === "aborted") return "cancelled";
  return null;
}

// ============================================================================
// Sentinels
// ============================================================================

function buildEmptyArtifactSentinel(row: {
  trajectory?: unknown;
  status?: string;
}): SocialPublishedSummary[] | EmptyArtifactSentinel {
  // trajectory exists on mission completion; first cut returns sentinel until
  // B7 follow-up implements SocialArtifactComposer
  if (row.trajectory != null) {
    return { kind: "empty-artifact", reason: "v1-needs-normalization" };
  }
  return { kind: "empty-artifact", reason: "not-yet-materialized" };
}

function buildEmptyTodoBoardSentinel(): SocialTodoBoardSentinel {
  return { kind: "empty-todo-board" };
}

function deriveSnapshotVersion(row: {
  lastCompletedStage?: number | null;
  completedAt?: Date | null;
  errorMessage?: string | null;
}): number {
  let v = 0;
  if (row.lastCompletedStage != null) v += row.lastCompletedStage;
  if (row.completedAt != null) v += 1;
  if (row.errorMessage != null) v += 1;
  return v;
}
