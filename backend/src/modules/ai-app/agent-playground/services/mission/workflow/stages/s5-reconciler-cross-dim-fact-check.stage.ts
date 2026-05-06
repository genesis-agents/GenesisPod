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

import type {
  MissionInvariants,
  PlanPhaseCtx,
  ResearchPhaseCtx,
  SynthesisPhaseCtx,
} from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { extractTokenSpend } from "@/modules/ai-harness/facade";
import { narrate } from "../narrative.util";

export async function runReconcilerStage(
  ctx: MissionInvariants & PlanPhaseCtx & ResearchPhaseCtx & SynthesisPhaseCtx,
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
  // ★ P1-E (2026-04-29): 单维度时跨维对账无意义 —— 短路并显式标记 skipped，
  // 下游 Analyst/Writer 能区分"对账失败"vs"无需对账"
  if (plan.dimensions.length <= 1) {
    deps.log.log(
      `[${missionId}] reconciler: only ${plan.dimensions.length} dim(s), skipping cross-dim reconciliation`,
    );
    await deps
      .emit({
        type: "agent-playground.reconciliation:skipped",
        missionId,
        userId,
        payload: { reason: "single_dimension" },
      })
      .catch(() => {});
    return;
  }
  try {
    await deps.emit({
      type: "agent-playground.stage:metrics",
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
    await narrate(deps.emit, missionId, userId, {
      stage: "s5-reconciler",
      role: "reconciler",
      tag: "analyzing",
      text: `Reconciler 开始跨维度对账（${plan.dimensions.length} 个维度）`,
      agentId: "reconciler",
    });
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
      const r = ctx.reconciliationReport!;
      await narrate(deps.emit, missionId, userId, {
        stage: "s5-reconciler",
        role: "reconciler",
        tag: "success",
        text: `对账完成 · ${r.factTable.length} 条事实 / ${r.conflicts.length} 处冲突 / ${r.gaps.length} 处缺口 / ${r.figureCandidates.length} 张图候选`,
        agentId: "reconciler",
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
      type: "agent-playground.stage:metrics",
      missionId,
      userId,
      payload: { stage: "reconciler", state: reconRes.state },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log.warn(`[${missionId}] reconciler stage failed (non-fatal): ${msg}`);
    await narrate(deps.emit, missionId, userId, {
      stage: "s5-reconciler",
      role: "reconciler",
      tag: "warning",
      text: `Reconciler 失败（非致命，下游走退化路径）：${msg.slice(0, 100)}`,
      agentId: "reconciler",
    });
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
