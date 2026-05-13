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
import {
  extractAgentFailureDiagnostic,
  extractFailureMessage,
} from "@/modules/ai-harness/facade";
import { narrate } from "../narrative.util";

/**
 * Provider 层失败码：发送给同一 provider 的下游调用必然也会失败，
 * 此时 analyst 兜底空 output 没意义，反而是 lying success（[[feedback_no_lying_assertion]]）。
 * 应该 fail-loud，让 mission 进入 failed 状态、用户能立即看到真实根因（如 API key 失效）。
 */
const PROVIDER_LEVEL_FAILURE_CODES = new Set<string>([
  "PROVIDER_API_ERROR",
  "PROVIDER_RATE_LIMIT",
  "PROVIDER_QUOTA_EXCEEDED",
  "PROVIDER_SAFETY_REFUSAL",
  "PROVIDER_BYOK_MODEL_NOT_FOUND",
]);

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
  // ★ PR-quickview-parity (2026-05-09): 结构化 quickView 字段（与 analyst.agent.ts Output 一致）。
  preface?: string;
  crossDimAnalysis?: string;
  riskAssessment?: string;
  strategicRecommendations?: string;
  conclusion?: string;
  keyFindingsByDimension?: {
    dimensionName: string;
    findings: {
      finding: string;
      significance: "high" | "medium" | "low";
    }[];
  }[];
  trendsByDimension?: {
    dimensionName: string;
    trends: {
      trend: string;
      direction: "increasing" | "decreasing" | "stable" | "emerging";
      timeframe: string;
    }[];
  }[];
  riskMatrix?: {
    riskType: string;
    probability: "高" | "中" | "低";
    impact: "高" | "中" | "低";
    timeframe: string;
  }[];
  recommendationsByAudience?: {
    forEnterprise?: { shortTerm: string[]; midTerm: string[] };
    forInvestors?: { shortTerm: string[]; midTerm: string[] };
  };
  whatYouWillLearn?: string[];
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
    // ★ P0-LIVE-NULL-OUTPUT (2026-04-30): gpt-5.4 reasoning model 在 analyst
    //   prompt 下两次都返 visible content = null（CoT 吃光 max_completion_tokens）,
    //   RUNNER_OUTPUT_SCHEMA_MISMATCH。之前直接 throw 让 mission 全死, 浪费已采集的
    //   6 维 researcher results + reconciler facts。改成发空 analystOutput 让下游
    //   writer / reviewer 至少能把已有 facts 渲成报告。
    // ★ 2026-05-13 (P1-FAIL-LOUD-PROVIDER): 区分失败原因。Provider 层失败
    //   （API key 不可用 / 限流 / 配额耗尽）下游 writer 用同 provider 必然也炸,
    //   兜底只是 lying success 拖延失败可见性。这类失败必须 fail-loud。
    //   只对 LLM 内部输出问题（schema mismatch / CoT exhaustion / empty）兜底。
    const diagnostic = extractAgentFailureDiagnostic(analystRes.events);
    const failureCode = diagnostic?.failureCode;
    if (failureCode && PROVIDER_LEVEL_FAILURE_CODES.has(failureCode)) {
      deps.log.error(
        `[${missionId}] analyst provider-level failure (${failureCode}); refusing to fall back since downstream writer will hit the same provider — failing mission early so users see the real cause`,
      );
      await narrate(deps.emit, missionId, userId, {
        stage: "s6-analyst",
        role: "analyst",
        tag: "warning",
        text: `Analyst 调用失败 (${failureCode})。下游 Writer 调用同一 provider 必然同样失败，提前终止 mission 让你立即看到真实原因（${diagnostic?.message ?? analystFailMsg ?? "未知"}）。`,
        agentId: "analyst",
      });
      throw new Error(
        `Analyst stage aborted due to provider-level failure: ${failureCode} — ${diagnostic?.message ?? analystFailMsg ?? analystRes.state}`,
      );
    }
    deps.log.warn(
      `[${missionId}] analyst 两次失败 (code=${failureCode ?? "UNKNOWN"})，发空 analystOutput 兜底让 mission 跑完（${analystFailMsg ?? analystRes.state}）`,
    );
    await narrate(deps.emit, missionId, userId, {
      stage: "s6-analyst",
      role: "analyst",
      tag: "warning",
      text: `Analyst 综合阶段连续 2 次未产出（code=${failureCode ?? "UNKNOWN"}）。发空 insights 兜底，下游 Writer 直接基于 ${researcherResults.length} 维度 raw findings 写报告（质量会打折）。`,
      agentId: "analyst",
    });
    const fallback: AnalystOutputShape = {
      insights: [],
      themeSummary: `（analyst 阶段未产出有效综合分析；下游基于 ${researcherResults.length} 个维度的原始研究发现直接撰写报告）`,
      contradictions: [],
      // ★ PR-quickview-parity: 兜底空数组让 buildQuickView 走"卡片短路"，前端不渲染对应区块
      keyFindingsByDimension: [],
      trendsByDimension: [],
      riskMatrix: [],
      recommendationsByAudience: undefined,
      whatYouWillLearn: [],
    };

    ctx.analystOutput = fallback;
    // ★ PR-R4 (2026-05-07): stage 主动持久化中间产物（analystOutput 落盘 mission 行）
    //   让 ctx-hydrator 在重跑时永远从 DB 读到最新中间状态，不依赖 S11。
    //   失败不阻塞主流程（markIntermediateState 内部 catch + log.warn）。
    // ★ 收尾评审第三轮 P0-S (2026-05-07): 传 userId 走严格隔离（depth defense）
    await deps.store.markIntermediateState(
      missionId,
      { analystOutput: fallback },
      userId,
    );
    return fallback;
  }
  const analyst = analystRes.output as AnalystOutputShape;

  await narrate(deps.emit, missionId, userId, {
    stage: "s6-analyst",
    role: "analyst",
    tag: "success",
    text: `Analyst 综合完成 · 提炼 ${analyst.insights.length} 条核心洞察${analyst.contradictions?.length ? ` · 标记 ${analyst.contradictions.length} 处冲突` : ""}`,
    agentId: "analyst",
  });
  ctx.analystOutput = analyst;
  // ★ PR-R4 (2026-05-07): stage 主动持久化 — 写 analystOutput
  // ★ 收尾评审第三轮 P0-S (2026-05-07): 传 userId 走严格隔离
  await deps.store.markIntermediateState(
    missionId,
    { analystOutput: analyst },
    userId,
  );
  return analyst;
}
