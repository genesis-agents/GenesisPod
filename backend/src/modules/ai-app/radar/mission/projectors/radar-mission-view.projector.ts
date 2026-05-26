/**
 * radar-mission-view.projector.ts — Pure projector for radar canonical view（B7-2）
 *
 * 落地依据：thinning plan §B7-2 / §6.4.1.a (radar status mapping).
 *
 * First cut：mission row → RadarDomainView 基础映射 + sentinels for stages /
 * agents / artifact / todo / memory。完整 stage/agent/briefing projection 留
 * follow-up（plan §B7 readiness §4 + §5）。
 */

import type { RadarMissionQueryInputs } from "../query/radar-mission-query.service";
import type {
  MissionStatus,
  RadarDomainView,
  RadarBriefingRef,
  EmptyArtifactSentinel,
  RadarTodoBoardSentinel,
} from "../../api/contracts/view-state.contract";
import {
  projectStagesByOrdinal,
  type StagePresetEntry,
} from "@/modules/ai-harness/facade";
import type { MissionViewBaseStage } from "@/modules/ai-harness/facade";

// Radar pipeline 9 个 stage（mirror radar/mission/pipeline/stages/ 目录）
const RADAR_STAGES: ReadonlyArray<StagePresetEntry> = [
  { id: "s1-source-resolve", label: "信息源解析" },
  { id: "s2-collect", label: "信源采集" },
  { id: "s3-dedupe", label: "去重清洗" },
  { id: "s4-relevance", label: "相关性筛选" },
  { id: "s5-quality", label: "质量评估" },
  { id: "s6-entity", label: "实体抽取" },
  { id: "s7-insight", label: "洞察生成" },
  { id: "s8-persist", label: "持久化" },
  { id: "s9-daily-top-n", label: "Daily Top-N" },
];

function projectRadarStages(
  lastCompletedStage: number | null | undefined,
  missionStatus: MissionStatus,
): MissionViewBaseStage[] {
  return projectStagesByOrdinal(
    RADAR_STAGES,
    lastCompletedStage,
    missionStatus,
  );
}

export function projectRadarMissionView(
  inputs: RadarMissionQueryInputs,
): RadarDomainView {
  const row = inputs.row;
  const publicStatus = resolvePublicStatus(row.status);
  const metricsSummary = extractMetricsSummary(row.metrics);

  return {
    mission: {
      id: row.id,
      title: undefined, // radar run no title field
      status: publicStatus,
      startedAt: row.startedAt?.toISOString(),
      finishedAt: row.completedAt?.toISOString(),
      finalScore: undefined,
      failureMessage: row.error ?? undefined,
      resumable: false, // radar runs are cron-driven; resume = next scheduled run
      canCancel: publicStatus === "running",
      rerunnableStages: [],
      topicId: row.topicId,
      trigger: row.trigger as RadarDomainView["mission"]["trigger"],
      durationMs: row.durationMs ?? null,
      wallTimeCapMs: row.wallTimeCapMs ?? null,
      maxCredits: row.maxCredits,
      failureCode: row.failureCode ?? null,
      terminalOutcome: deriveTerminalOutcome(row.status),
      metricsSummary,
    },
    stages: projectRadarStages(row.lastCompletedStage, publicStatus),
    agents: [],
    reportArtifact: buildBriefingRefOrSentinel(row),
    todoBoard: buildEmptyTodoBoardSentinel(),
    cost: {
      tokensUsed: null, // radar tracks via metrics.llmCost (USD); tokens not directly persisted
      costUsd: metricsSummary?.llmCost ?? null,
      elapsedWallTimeMs: row.durationMs ?? null,
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
// §6.4.1.a per-app status mapping for radar
// ============================================================================

function resolvePublicStatus(persisted: string): MissionStatus {
  switch (persisted) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "rejected":
      return "quality-failed";
    case "running":
      return "running";
    default:
      return "running";
  }
}

function deriveTerminalOutcome(persisted: string): string | null {
  if (persisted === "completed") return "completed";
  if (persisted === "failed") return "failed";
  if (persisted === "cancelled") return "cancelled";
  if (persisted === "rejected") return "quality-failed";
  return null;
}

// ============================================================================
// Helpers
// ============================================================================

function extractMetricsSummary(metrics: unknown): {
  fetched?: number;
  accepted?: number;
  llmCost?: number;
} {
  if (!metrics || typeof metrics !== "object") return {};
  const m = metrics as Record<string, unknown>;
  return {
    fetched: typeof m.fetched === "number" ? m.fetched : undefined,
    accepted: typeof m.accepted === "number" ? m.accepted : undefined,
    llmCost: typeof m.llmCost === "number" ? m.llmCost : undefined,
  };
}

function buildBriefingRefOrSentinel(row: {
  topicId: string;
  startedAt?: Date | null;
  status: string;
}): RadarBriefingRef | EmptyArtifactSentinel {
  // For radar, the user-facing artifact is the daily briefing for this topic.
  // First cut: return briefingRef stub when completed; otherwise sentinel.
  if (row.status === "completed" && row.startedAt) {
    return {
      date: row.startedAt.toISOString().slice(0, 10),
      briefingId: undefined,
    };
  }
  return { kind: "empty-artifact", reason: "not-yet-materialized" };
}

function buildEmptyTodoBoardSentinel(): RadarTodoBoardSentinel {
  return { kind: "empty-todo-board" };
}

function deriveSnapshotVersion(row: {
  lastCompletedStage?: number | null;
  completedAt?: Date | null;
  error?: string | null;
}): number {
  let v = 0;
  if (row.lastCompletedStage != null) v += row.lastCompletedStage;
  if (row.completedAt != null) v += 1;
  if (row.error != null) v += 1;
  return v;
}
