/**
 * 80-leader-handoff.stage.ts —— M6 foreword + M7 signoff
 *
 * 上游：reportArtifact / researcherResults / plan / reconciliationReport /
 *       verifierVerdicts 都已就绪
 * 下游：填 ctx.leaderForeword + ctx.leaderSignOff，供 99-persist.stage 使用
 *
 * M6: leader.writeForeword() —— 综合摘要（whatWeAnswered 等）
 * M7: leader.signOff()      —— 签字 + accountabilityNote（仅 M6 成功才跑）
 */

import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";

export async function runLeaderHandoffStage(
  ctx: MissionContext,
  deps: MissionDeps,
): Promise<void> {
  if (!ctx.reportArtifact) return;
  if (!ctx.plan) return;
  if (!ctx.researcherResults) return;

  const { reportArtifact, plan, researcherResults, leader } = ctx;
  const reconciliationReport = ctx.reconciliationReport;
  const verifierVerdicts = ctx.verifierVerdicts ?? [];

  // ── 准备 stage outcome 摘要 ──
  const dimStateOf = (d: {
    name: string;
  }): "completed" | "degraded" | "failed" => {
    const r = researcherResults.find((x) => x.dimension === d.name);
    const findings = (r as { findings?: unknown[] })?.findings ?? [];
    if (findings.length === 0) return "failed";
    const summary = (r as { summary?: string })?.summary ?? "";
    return summary.startsWith("(failed") ? "degraded" : "completed";
  };
  const dimensionStates = plan.dimensions.map((d) => ({
    name: d.name,
    state: dimStateOf(d),
  }));
  const reconStats = reconciliationReport
    ? {
        factCount:
          (reconciliationReport as { factTable?: unknown[] }).factTable
            ?.length ?? 0,
        conflictCount:
          (reconciliationReport as { conflicts?: unknown[] }).conflicts
            ?.length ?? 0,
        criticalGaps: (
          (
            reconciliationReport as {
              gaps?: {
                severity?: string;
                expectedAspects?: string[];
              }[];
            }
          ).gaps ?? []
        )
          .filter((g) => g.severity === "critical")
          .map((g) => (g.expectedAspects ?? []).join(", "))
          .filter(Boolean),
      }
    : undefined;
  const reviewerAvg =
    verifierVerdicts.length > 0
      ? Math.round(
          (verifierVerdicts as { score?: number }[]).reduce(
            (sum: number, v) => sum + (v.score ?? 0),
            0,
          ) / verifierVerdicts.length,
        )
      : undefined;
  const criticWarnings = reportArtifact.quality.warnings.filter((w) =>
    w.dimension?.startsWith("l4-"),
  );
  const criticBlindspots = criticWarnings
    .filter((w) => w.dimension === "l4-blindspot")
    .map((w) => w.message);
  const criticBiases = criticWarnings
    .filter((w) => w.dimension === "l4-bias")
    .map((w) => w.message);
  const criticVerdictRaw = criticWarnings.find(
    (w) => w.dimension === "l4-critic",
  )?.message;
  const criticVerdict = criticVerdictRaw?.startsWith("[fail]")
    ? "fail"
    : criticVerdictRaw?.startsWith("[concerns]")
      ? "concerns"
      : criticVerdictRaw?.startsWith("[pass]")
        ? "pass"
        : undefined;

  // ── M6: leader.writeForeword() ──
  try {
    const leaderForeword = await leader.writeForeword({
      researcherStates: dimensionStates,
      reconciliation: reconStats,
      writerSections: reportArtifact.sections.map((s) => s.title),
      qualitySnapshot: {
        sourceCount: reportArtifact.citations.length,
        coverageScore: reportArtifact.quality.dimensions.coverage,
        overall: reportArtifact.quality.overall,
        finalVerdict: reportArtifact.quality.finalVerdict ?? "?",
        reviewerAvgScore: reviewerAvg,
        criticVerdict,
        criticBlindspots,
        criticBiases,
      },
    });
    ctx.leaderForeword = leaderForeword;
    reportArtifact.metadata.leaderForeword = leaderForeword;
    await deps
      .emit({
        type: "agent-playground.leader:foreword",
        missionId: ctx.missionId,
        userId: ctx.userId,
        payload: leaderForeword,
      })
      .catch(() => {});
  } catch (err) {
    deps.log.warn(
      `[${ctx.missionId}] M6 foreword failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── M7: leader.signOff() —— 仅在 M6 成功时跑 ──
  if (ctx.leaderForeword) {
    try {
      const leaderSignOff = await leader.signOff(
        {
          sourceCount: reportArtifact.citations.length,
          coverageScore: reportArtifact.quality.dimensions.coverage,
          overall: reportArtifact.quality.overall,
          finalVerdict: reportArtifact.quality.finalVerdict ?? "?",
          wordCount: reportArtifact.metadata.wordCount,
          reviewerAvgScore: reviewerAvg,
          criticVerdict,
        },
        dimensionStates,
      );
      ctx.leaderSignOff = leaderSignOff;
      await deps
        .emit({
          type: "agent-playground.leader:signed",
          missionId: ctx.missionId,
          userId: ctx.userId,
          payload: leaderSignOff,
        })
        .catch(() => {});
    } catch (err) {
      deps.log.warn(
        `[${ctx.missionId}] M7 sign-off failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
