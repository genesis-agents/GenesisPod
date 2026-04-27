/**
 * Stage S5 — Reconciler: cross-dim 对账
 *
 * Researcher 并行产出后强制对账：把每个 dim 的 findings 收齐，做 entity 抽取 +
 * conflict 检测 + gap 识别 + figure 候选汇总，输出统一的 factTable / conflicts /
 * overlaps / gaps / figureCandidates，供下游 Analyst/Writer 消费。
 *
 *   reads  ctx: plan, researcherResults
 *   writes ctx: reconciliationReport（失败时显式置 null，下游 Analyst 走退化路径）
 *   deps:       reconciler.reconcile, invoker (preDisable + tickCost), emit, lifecycle, log
 *
 * Failure modes: 任何抛错 → log warn + emit dimension:degraded，
 *                ctx.reconciliationReport 保持 null，mission 继续（不阻塞）。
 */

import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { extractTokenSpend } from "../helpers/token-spend.util";

export async function runReconcilerStage(
  ctx: MissionContext,
  deps: MissionDeps,
): Promise<void> {
  const {
    missionId,
    userId,
    input,
    billing,
    pool,
    budgetMultiplier,
    plan,
    researcherResults,
  } = ctx;
  if (!plan || !researcherResults) {
    throw new Error(
      "Reconciler stage requires plan + researcherResults to be populated",
    );
  }

  ctx.reconciliationReport = null;
  try {
    await deps.emit({
      type: "agent-playground.stage:started",
      missionId,
      userId,
      payload: { stage: "reconciler" },
    });
    await deps.lifecycle(
      missionId,
      userId,
      "reconciler",
      "reconciler",
      "started",
    );
    // ★ Phase P4-2: Reconciler 跨 mission 失败模式预查
    await deps.invoker.preDisableKnownFailingModels(
      billing,
      "playground.reconciler",
      `${input.topic}::reconciler::${input.language}`,
    );
    // ★ Phase Lead-Services: ReconcilerService.reconcile()
    const reconRes = await deps.reconciler.reconcile(
      {
        topic: input.topic,
        language: input.language,
        plan: {
          themeSummary: plan.themeSummary,
          dimensions: plan.dimensions.map((d) => ({
            id: d.id,
            name: d.name,
            rationale: d.rationale,
          })),
        },
        researcherResults,
      },
      {
        missionId,
        userId,
        agentId: "reconciler",
        role: "reconciler",
        envAdapter: billing,
        budgetMultiplier,
      },
    );
    await deps.invoker.tickCost(
      missionId,
      userId,
      "reconciler",
      pool,
      extractTokenSpend(reconRes.events),
    );
    if (reconRes.state === "completed" && reconRes.output) {
      ctx.reconciliationReport =
        reconRes.output as unknown as typeof ctx.reconciliationReport;
      await deps.emit({
        type: "agent-playground.reconciliation:completed",
        missionId,
        userId,
        payload: {
          factCount: ctx.reconciliationReport!.factTable.length,
          conflictCount: ctx.reconciliationReport!.conflicts.length,
          overlapCount: ctx.reconciliationReport!.overlaps.length,
          gapCount: ctx.reconciliationReport!.gaps.length,
          figureCandidateCount:
            ctx.reconciliationReport!.figureCandidates.length,
        },
      });
    }
    await deps.lifecycle(
      missionId,
      userId,
      "reconciler",
      "reconciler",
      reconRes.state === "completed" ? "completed" : "failed",
      {
        wallTimeMs: reconRes.wallTimeMs,
        iterations: reconRes.iterations,
      },
    );
    await deps.emit({
      type: "agent-playground.stage:completed",
      missionId,
      userId,
      payload: { stage: "reconciler", state: reconRes.state },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log.warn(`[${missionId}] reconciler stage failed (non-fatal): ${msg}`);
    await deps
      .emit({
        type: "agent-playground.dimension:degraded",
        missionId,
        userId,
        agentId: "reconciler",
        payload: {
          stage: "reconciler",
          failureCode: "RECONCILER_FAILED",
          innerMessage: msg,
        },
      })
      .catch(() => {});
  }
}
