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
    stages: [], // §B7-1 first cut sentinel
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
