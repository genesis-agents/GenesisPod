/**
 * Stage S11 — Persist (final)
 *
 * Mission 成功路径的终态写库：把 reportArtifact + leaderSignOff + verdicts +
 * userProfile + reconciliationReport 等一次性落到 agent_playground_missions 行，
 * 并按签字结果分流到 markCompleted / markFailed。
 *
 *   reads  ctx: missionId, t0, pool, runMissionBody 全部 result 字段
 *   writes ctx: (none — 终态)
 *   deps:       store.markCompleted / store.markFailed
 *
 * 分流逻辑：
 *   leaderSignOff.signed === false  → markFailed（Lead 拒签 → "quality-failed"）
 *   leaderSignOff.signed === true   → markCompleted + 写 leaderVerdict/Score
 *   未跑到 M7（reportArtifact 为空等）→ markCompleted（leaderSigned=undefined）
 *
 * 注：异常路径（catch handler 里的 markFailed）不在本 stage —— 它需要 errorMessage /
 *     failureCode 等异常元数据，归 runMission 入口的 try/catch 处理。
 */

import type { MissionDeps } from "../mission-deps";

interface PersistInput {
  missionId: string;
  /** ★ P1-NEW-H (round 2): userId 必传 —— persist-failed 事件不能空 userId 路由 */
  userId: string;
  t0: number;
  result: {
    report?: unknown;
    reportArtifact?: {
      metadata: { topic?: string };
      quickView?: { executiveSummary?: { markdown?: string } };
    };
    reviewScore?: number;
    trajectoryStored?: number;
    themeSummary?: string;
    dimensions?: unknown[];
    verdicts?: unknown;
    userProfile?: unknown;
    reconciliationReport?: unknown;
    leaderSignOff?: {
      leaderOverallScore: number;
      leaderVerdict: "excellent" | "good" | "acceptable" | "failed";
      signed: boolean;
      refusalReason?: string;
    };
  };
  pool: { snapshot(): { poolTokensUsed: number; poolCostUsd: number } };
}

export async function runPersistStage(
  args: PersistInput,
  deps: MissionDeps,
): Promise<void> {
  const { missionId, userId, t0, result, pool } = args;
  const snap = pool.snapshot();
  // P0-5: 优先存 ReportArtifact v2，fallback 旧 ResearchReport v1
  const v2Title = result.reportArtifact?.metadata?.topic;
  const v2Summary =
    result.reportArtifact?.quickView?.executiveSummary?.markdown;
  const reportPayload = result.reportArtifact
    ? {
        ...(result.reportArtifact as Record<string, unknown>),
        title: v2Title,
        summary: v2Summary,
      }
    : (result.report as {
        title?: string;
        summary?: string;
      });

  // ★ P1-H (2026-04-29): persist DB 写入失败时，必须发事件让前端知道（否则前端永远 polling running）
  try {
    if (result.leaderSignOff && !result.leaderSignOff.signed) {
      await deps.store.markFailed(missionId, {
        wallTimeMs: Date.now() - t0,
        errorMessage: `Lead 拒绝签字: ${result.leaderSignOff.refusalReason ?? "未达 qualityBar / successCriteria 不全回答"}`,
        tokensUsed: snap.poolTokensUsed,
        costUsd: snap.poolCostUsd,
        trajectoryStored: result.trajectoryStored,
        themeSummary: result.themeSummary,
        dimensions: result.dimensions as never,
        report: reportPayload as unknown as {
          title?: string;
          summary?: string;
        },
        reportArtifactVersion: result.reportArtifact ? 2 : 1,
        userProfile: (result.userProfile ?? null) as never,
        reconciliationReport: (result.reconciliationReport ?? null) as never,
        verdicts: result.verdicts as never,
        leaderJournal: undefined,
        leaderOverallScore: result.leaderSignOff.leaderOverallScore,
        leaderSigned: false,
        leaderVerdict: result.leaderSignOff.leaderVerdict,
      });
    } else {
      await deps.store.markCompleted(missionId, {
        finalScore: result.reviewScore,
        tokensUsed: snap.poolTokensUsed,
        costUsd: snap.poolCostUsd,
        trajectoryStored: result.trajectoryStored,
        wallTimeMs: Date.now() - t0,
        themeSummary: result.themeSummary,
        dimensions: result.dimensions as never,
        report: reportPayload as unknown as {
          title?: string;
          summary?: string;
        },
        reportArtifactVersion: result.reportArtifact ? 2 : 1,
        userProfile: (result.userProfile ?? null) as never,
        reconciliationReport: (result.reconciliationReport ?? null) as never,
        verdicts: result.verdicts as never,
        leaderOverallScore: result.leaderSignOff?.leaderOverallScore,
        leaderSigned: result.leaderSignOff?.signed,
        leaderVerdict: result.leaderSignOff?.leaderVerdict,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log.error(`[s11 ${missionId}] persist failed: ${message}`);
    await deps
      .emit({
        type: "agent-playground.mission:persist-failed",
        missionId,
        userId,
        payload: { message, wallTimeMs: Date.now() - t0 },
      })
      .catch(() => {});
    throw err;
  }
}
