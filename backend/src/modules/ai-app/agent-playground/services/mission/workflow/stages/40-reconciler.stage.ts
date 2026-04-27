/**
 * 40-reconciler.stage.ts —— 跨 dim 对账（[3.5] 节点）
 *
 * 上游：ctx.researcherResults + ctx.plan
 * 下游：ctx.reconciliationReport（失败时保持 null，不阻塞 mission）
 *
 * Researcher 并行产出后强制对账：事实表 / 冲突 / 重叠 / 空白 / 图候选池。
 * 失败不阻塞 mission（degraded：reconciliationReport=null，下游 Analyst 退化路径）。
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
