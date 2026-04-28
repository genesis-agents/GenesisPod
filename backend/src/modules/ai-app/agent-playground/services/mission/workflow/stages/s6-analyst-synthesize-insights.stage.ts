/**
 * Stage S6 — Analyst: 跨 dim 综合分析
 *
 * 把 reconciler 对完账的 factTable + 各 dim 的 findings 综合成 mission-level 视角：
 * insights（跨 dim 综合判断 ≥ 2 dim 支持）/ contradictions（处理跨源冲突的判断）/
 * themeSummary（贯穿主题的总论点）。Writer 起草时直接消费这些 insights，不再读 raw findings。
 *
 *   reads  ctx: plan, researcherResults, reconciliationReport
 *   writes ctx: analystOutput = { insights[], themeSummary, contradictions? }
 *   deps:       analyst.analyze, invoker (preDisable + tickCost),
 *               missionState (compressIfNeeded), emit, lifecycle
 *
 * Failure modes: analystRes.state !== completed → throw（关键路径，无 analyst output
 *                Writer 无法工作）
 */

import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { extractTokenSpend } from "../helpers/token-spend.util";
import { extractFailureMessage } from "../helpers/failure-extraction.util";
import { narrate } from "../helpers/narrative.util";

export interface AnalystOutputShape {
  insights: {
    headline: string;
    narrative: string;
    supportingDimensions: string[];
    confidence: number;
  }[];
  themeSummary: string;
  contradictions?: {
    claim: string;
    conflictingSources: string[];
    resolution: string;
  }[];
}

export async function runAnalystStage(
  ctx: MissionContext,
  deps: MissionDeps,
): Promise<AnalystOutputShape> {
  const {
    missionId,
    userId,
    input,
    billing,
    pool,
    budgetMultiplier,
    researcherResults,
    reconciliationReport,
  } = ctx;
  if (!researcherResults) {
    throw new Error("Analyst stage requires researcherResults to be populated");
  }

  await deps.emit({
    type: "agent-playground.stage:started",
    missionId,
    userId,
    payload: { stage: "analyst" },
  });
  await deps.lifecycle(missionId, userId, "analyst", "analyst", "started");
  await narrate(deps.emit, missionId, userId, {
    stage: "s6-analyst",
    role: "analyst",
    tag: "analyzing",
    text: "Analyst 开始整合所有维度的发现，提炼跨维度核心洞察",
    agentId: "analyst",
  });

  // ★ Phase P1-10: Summarize-on-Handoff（baseline §9.1）
  const analystResearcherInput = deps.missionState.compressIfNeeded(
    researcherResults,
    "analyst.researcherResults",
  );
  // ★ Phase P3-2: 跨 mission 失败模式预查
  await deps.invoker.preDisableKnownFailingModels(
    billing,
    "playground.analyst",
    `${input.topic}::analyst::${input.language}`,
  );
  // ★ Phase Lead-Services: AnalystService.analyze()
  const analystRes = await deps.analyst.analyze(
    {
      topic: input.topic,
      language: input.language,
      researcherResults: analystResearcherInput,
      reconciliationReport: reconciliationReport ?? undefined,
    },
    {
      missionId,
      userId,
      agentId: "analyst",
      role: "analyst",
      envAdapter: billing,
      budgetMultiplier,
      loopOverride: deps.invoker.resolveLoopOverride(
        input.auditLayers,
        "analyst",
      ),
    },
  );
  await deps.invoker.tickCost(
    missionId,
    userId,
    "analyst",
    pool,
    extractTokenSpend(analystRes.events),
  );
  const analystFailMsg = extractFailureMessage(
    analystRes.events,
    analystRes.state,
    !!analystRes.output,
    {
      iterations: analystRes.iterations,
      wallTimeMs: analystRes.wallTimeMs,
    },
  );
  await deps.lifecycle(
    missionId,
    userId,
    "analyst",
    "analyst",
    analystRes.state === "completed" ? "completed" : "failed",
    {
      wallTimeMs: analystRes.wallTimeMs,
      iterations: analystRes.iterations,
      error: analystFailMsg,
    },
  );
  if (analystRes.state !== "completed" || !analystRes.output) {
    throw new Error(
      analystFailMsg ?? `Analyst stage failed: ${analystRes.state}`,
    );
  }
  const analyst = analystRes.output as AnalystOutputShape;
  await deps.emit({
    type: "agent-playground.stage:completed",
    missionId,
    userId,
    payload: { stage: "analyst", insightsCount: analyst.insights.length },
  });
  await narrate(deps.emit, missionId, userId, {
    stage: "s6-analyst",
    role: "analyst",
    tag: "success",
    text: `Analyst 综合完成 · 提炼 ${analyst.insights.length} 条核心洞察${analyst.contradictions?.length ? ` · 标记 ${analyst.contradictions.length} 处冲突` : ""}`,
    agentId: "analyst",
  });
  ctx.analystOutput = analyst;
  return analyst;
}
