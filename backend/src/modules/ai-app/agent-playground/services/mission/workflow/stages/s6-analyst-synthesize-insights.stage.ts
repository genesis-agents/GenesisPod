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

import type {
  MissionInvariants,
  PlanPhaseCtx,
  ResearchPhaseCtx,
  SynthesisPhaseCtx,
} from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { extractTokenSpend } from "@/modules/ai-harness/facade";
import { extractFailureMessage } from "@/modules/ai-harness/facade";
import { narrate } from "../narrative.util";

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
  ctx: MissionInvariants & PlanPhaseCtx & ResearchPhaseCtx & SynthesisPhaseCtx,
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
  // 双轮防 null：第一次 LLM 返回 null（schema mismatch）时，自动降级提示再跑一次
  // 才报错。避免前面 6 个 dim 的产出被一次 LLM 毛刺整个 mission 全废。
  let analystRes = await deps.analyst.analyze(
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

  // ★ 第一轮 null / 失败 → 简化提示重试一次（不放弃质量，只是给 LLM 一次机会修正格式）
  //   degraded 也算"有产出"（reflexion verifier 评分略低于阈值但结构合法）→ 不重试。
  //   只有真正的 failed/cancelled 或空 output 才走重试。
  const firstRoundUsable =
    (analystRes.state === "completed" || analystRes.state === "degraded") &&
    !!analystRes.output;
  if (!firstRoundUsable) {
    deps.log.warn(
      `[${missionId}] analyst first attempt returned no output (state=${analystRes.state}) — retrying once with simplified prompt`,
    );
    await narrate(deps.emit, missionId, userId, {
      stage: "s6-analyst",
      role: "analyst",
      tag: "warning",
      text: "Analyst 首轮无有效输出，简化提示后重试 1 次（避免单次 LLM 格式问题导致全 mission 失败）",
      agentId: "analyst",
    });
    analystRes = await deps.analyst.analyze(
      {
        topic: input.topic,
        language: input.language,
        researcherResults: analystResearcherInput,
        reconciliationReport: reconciliationReport ?? undefined,
        retryHint:
          "上一次输出为 null 或格式错误。请严格按 outputSchema 返回 { insights[], themeSummary }；contradictions 可以省略。每个 insight 至少 2 个 supportingDimensions。",
      },
      {
        missionId,
        userId,
        agentId: "analyst.retry",
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
  }

  const analystFailMsg = extractFailureMessage(
    analystRes.events,
    analystRes.state,
    !!analystRes.output,
    {
      iterations: analystRes.iterations,
      wallTimeMs: analystRes.wallTimeMs,
    },
  );
  // ★ degraded（reflexion verifier 评分 < passThreshold 但结构合法）算成功
  const finalUsable =
    (analystRes.state === "completed" || analystRes.state === "degraded") &&
    !!analystRes.output;
  await deps.lifecycle(
    missionId,
    userId,
    "analyst",
    "analyst",
    finalUsable ? "completed" : "failed",
    {
      wallTimeMs: analystRes.wallTimeMs,
      iterations: analystRes.iterations,
      error: analystFailMsg,
      degraded: analystRes.state === "degraded" || undefined,
    },
  );
  if (!finalUsable) {
    // ★ P0-LIVE-NULL-OUTPUT (2026-04-30): mission 8e77271d 实证 — gpt-5.4 reasoning
    //   model 在 analyst prompt 下两次都返 visible content = null（CoT 吃光
    //   max_completion_tokens），RUNNER_OUTPUT_SCHEMA_MISMATCH。之前直接 throw
    //   让 mission 全死，浪费已采集的 6 维 researcher results + reconciler facts。
    //   改成发空 analystOutput 让下游 writer / reviewer 至少能把已有 facts 渲成
    //   报告（可能是低质量的，但好过完全失败）。
    deps.log.warn(
      `[${missionId}] analyst 两次 schema 校验失败，发空 analystOutput 兜底让 mission 跑完（${analystFailMsg ?? analystRes.state}）`,
    );
    await narrate(deps.emit, missionId, userId, {
      stage: "s6-analyst",
      role: "analyst",
      tag: "warning",
      text: `Analyst 综合阶段连续 2 次未产出（LLM 返 null）。发空 insights 兜底，下游 Writer 直接基于 ${researcherResults.length} 维度 raw findings 写报告（质量会打折）。`,
      agentId: "analyst",
    });
    const fallback: AnalystOutputShape = {
      insights: [],
      themeSummary: `（analyst 阶段未产出有效综合分析；下游基于 ${researcherResults.length} 个维度的原始研究发现直接撰写报告）`,
      contradictions: [],
    };
    await deps.emit({
      type: "agent-playground.stage:completed",
      missionId,
      userId,
      payload: {
        stage: "analyst",
        insightsCount: 0,
        degraded: true,
        reason: analystFailMsg ?? "schema_mismatch",
      },
    });
    ctx.analystOutput = fallback;
    return fallback;
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
