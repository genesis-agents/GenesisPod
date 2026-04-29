/**
 * Stage S10 — Leader writes foreword and signs off
 *
 * Mission 末段 Leader 总收尾两个动作：
 *   foreword:  Leader 看完整报告 + 全部 verdicts 后写综合摘要（whatWeAnswered /
 *              whatRemainsUnclear / howToRead / recommendedFollowUp）
 *   signoff:   Leader 签字 + accountabilityNote（强制引用历史决策的问责文）
 *
 *   reads  ctx: reportArtifact, plan, researcherResults, reconciliationReport,
 *               verifierVerdicts, leader
 *   mutate ctx.reportArtifact.metadata.leaderForeword = foreword 输出
 *   writes ctx: leaderForeword, leaderSignOff
 *   deps:       leader.writeForeword, leader.signOff, emit, log
 *
 * Skip 条件: !ctx.reportArtifact || !ctx.plan || !ctx.researcherResults → return
 * 顺序约束: signoff 仅在 foreword 成功时跑（foreword 为签字依据）
 * Failure modes: foreword 失败 → log warn，跳过 signoff（mission 仍 markCompleted）
 *                signoff  失败 → log warn，下游 persist 走"无签字"分支（markCompleted）
 *
 * 注：signoff 拒签（signed=false）不算"失败"——是 Leader 主动行使否决权，
 *     persist stage 会据此 markFailed("Leader 拒绝签字")。
 */

import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { narrate } from "../helpers/narrative.util";

export async function runLeaderForewordAndSignoffStage(
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

  // ── foreword: leader.writeForeword() ──
  try {
    await narrate(deps.emit, ctx.missionId, ctx.userId, {
      stage: "s10-leader-signoff",
      role: "leader",
      tag: "writing",
      text: "Leader 综合所有产出 + Critic 警示，开始写前言（whatWeAnswered / whatRemains / howToRead）",
      agentId: "leader",
    });
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
        // ★ 沉淀消费 v3: 注入 10 维客观评分（如果 s9b 跑过）
        objectiveScore: ctx.reportEvaluation?.overallScore,
        objectiveGrade: ctx.reportEvaluation?.grade,
        objectiveFeedback: ctx.reportEvaluation?.feedback,
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
      `[${ctx.missionId}] foreword failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── signoff: leader.signOff() —— 仅在 foreword 成功时跑 ──
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
          // ★ 沉淀消费 v3: 注入 10 维客观评分
          objectiveScore: ctx.reportEvaluation?.overallScore,
          objectiveGrade: ctx.reportEvaluation?.grade,
          objectiveFeedback: ctx.reportEvaluation?.feedback,
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
        `[${ctx.missionId}] signoff failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
