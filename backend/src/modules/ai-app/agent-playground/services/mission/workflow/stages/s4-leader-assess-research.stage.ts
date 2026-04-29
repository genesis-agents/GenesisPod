/**
 * Stage S4 — Leader assesses research progress and dispatches corrective actions
 *
 * researcher×N 跑完之后，Leader 看到每个 dim 的 findings/sources/state，给出过程
 * 管理决策：accept-all / patch / redirect / abort，并把决策真正落到调度上。
 *
 *   reads  ctx: plan, researcherResults, leader
 *   mutate ctx: plan.dimensions (redirect 追加新 dim) +
 *               researcherResults (retry/abort/extend 后的结果)
 *   deps:       invoker (重派 researcher), emit, lifecycle, log
 *
 * Per-dim action 处理矩阵：
 *   accept / accept-degraded   → no-op，保留原 researcher 产出
 *   retry-with-critique        → 带 critique 重派 ResearcherAgent，覆盖原 result
 *   replace-spec               → 当前只注册 ResearcherAgent，降级为带换 spec 提示的 retry
 *   abort                      → 该 dim 标记 findings=[] + summary="(aborted by Leader)"
 * Mission-level decision:
 *   abort                      → throw "Leader aborted mission..."（mission 终止）
 *   redirect.newDimensions[]   → 追加 dim 到 plan + 跑 ResearcherAgent
 *
 * Failure modes: leader.assessResearchers 抛错（非 Leader 主动 abort）→ log warn + 继续
 *                Leader 主动 abort → rethrow（mission 终止）
 */

import { ResearcherAgent } from "../../../../agents/researcher/researcher.agent";
import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { extractTokenSpend } from "../helpers/token-spend.util";
import { extractFailureMessage } from "../helpers/failure-extraction.util";
import { narrate } from "../helpers/narrative.util";

interface PlanDimensionLite {
  id: string;
  name: string;
  rationale: string;
  toolHint?: {
    categories: string[];
    preferIds?: string[];
  };
  dependsOn?: string[];
}

export async function runLeaderAssessResearchStage(
  ctx: MissionContext,
  deps: MissionDeps,
): Promise<void> {
  const { missionId, userId, plan, researcherResults, leader } = ctx;
  if (!plan || !researcherResults) {
    throw new Error("Leader assess stage requires plan + researcherResults");
  }

  try {
    await narrate(deps.emit, missionId, userId, {
      stage: "s4-leader-assess",
      role: "leader",
      tag: "thinking",
      text: `Leader 开始评审 ${plan.dimensions.length} 个维度的产出，决定是否需要补研究 / 砍维度`,
      agentId: "leader",
    });
    const researcherOutcomes = plan.dimensions.map((d) => {
      const r = researcherResults.find((x) => x.dimension === d.name);
      const findings = r?.findings ?? [];
      const summary = r?.summary ?? "";
      const state: "completed" | "degraded" | "failed" =
        findings.length === 0
          ? "failed"
          : summary.startsWith("(failed") || summary.startsWith("(error")
            ? "degraded"
            : "completed";
      const sources = findings
        .map((f) => f.source)
        .filter((s): s is string => typeof s === "string")
        .slice(0, 5);
      const failureCodeMatch = summary.match(/code=([A-Z_]+)/);
      return {
        dimensionId: d.id,
        dimensionName: d.name,
        state,
        findingsCount: findings.length,
        sources,
        summary: summary.slice(0, 300),
        failureCode: failureCodeMatch ? failureCodeMatch[1] : undefined,
      };
    });
    const m1Raw = await leader.assessResearchers(researcherOutcomes);
    // ★ P0-5 (2026-04-29): S4 多轮 patch 全局上限 —— 第二轮起所有 retry 强制降级 accept-degraded
    //    防止 Leader 反复返回 patch 决策让 stage 被无限重入（mission 8c7b4358 runaway 同源）。
    const MAX_S4_ROUNDS = 1; // 只允许第一轮真正 retry
    ctx.s4PatchRound = (ctx.s4PatchRound ?? 0) + 1;
    if (ctx.s4PatchRound > MAX_S4_ROUNDS) {
      let downgraded = 0;
      for (const a of m1Raw.perDimension) {
        if (a.action === "retry-with-critique" || a.action === "replace-spec") {
          (a as unknown as { action: string }).action = "accept-degraded";
          downgraded++;
        }
      }
      // 同时把 mission-level decision 从 patch/redirect 强降为 accept-all
      if (m1Raw.decision === "patch" || m1Raw.decision === "redirect") {
        (m1Raw as unknown as { decision: string }).decision = "accept-all";
      }
      deps.log.warn(
        `[${missionId}] S4 round ${ctx.s4PatchRound} > ${MAX_S4_ROUNDS}: forced ${downgraded} retry→accept-degraded to prevent retry storm`,
      );
    }
    // ★ 防 retry 风暴：单轮 patch 数 ≤ 2。Leader 若返回 >2 个 retry-with-critique，
    //    保留 finding-count 最少的 2 个（最弱的）继续 retry，其余降级为 accept-degraded。
    //    rationale: 5 个 dim 同时 retry 会撞 wall-time + 预算池；保留 4 个 dim 工作
    //    + 修最弱 2 个 比"重做 5 个 dim 但全部崩溃"质量更高（NaN 不是质量）。
    const MAX_PATCHES_PER_ROUND = 2;
    const retryActions = m1Raw.perDimension.filter(
      (a) => a.action === "retry-with-critique" || a.action === "replace-spec",
    );
    let cappedNote: string | null = null;
    if (retryActions.length > MAX_PATCHES_PER_ROUND) {
      // 按 finding-count 升序 → 最弱的 dim 排在前面
      const findingCountByDimId = new Map<string, number>();
      for (const o of researcherOutcomes) {
        findingCountByDimId.set(o.dimensionId, o.findingsCount);
      }
      const ranked = [...retryActions].sort(
        (a, b) =>
          (findingCountByDimId.get(a.dimensionId) ?? 0) -
          (findingCountByDimId.get(b.dimensionId) ?? 0),
      );
      const keepIds = new Set(
        ranked.slice(0, MAX_PATCHES_PER_ROUND).map((a) => a.dimensionId),
      );
      let downgraded = 0;
      for (const a of m1Raw.perDimension) {
        if (
          (a.action === "retry-with-critique" || a.action === "replace-spec") &&
          !keepIds.has(a.dimensionId)
        ) {
          // Cast through unknown — perDimension.action 是 zod 联合类型，运行时降级到 accept-degraded 安全
          (a as unknown as { action: string }).action = "accept-degraded";
          downgraded++;
        }
      }
      cappedNote = `单轮 patch 上限=${MAX_PATCHES_PER_ROUND}；Leader 返回 ${retryActions.length} 个 retry，最弱 ${MAX_PATCHES_PER_ROUND} 个保留，其余 ${downgraded} 个降级 accept-degraded`;
      deps.log.warn(`[${missionId}] ${cappedNote}`);
    }
    const m1 = m1Raw;
    await deps
      .emit({
        type: "agent-playground.leader:decision",
        missionId,
        userId,
        payload: {
          phase: "assess-research",
          decision: m1.decision,
          rationale: m1.rationale,
          perDimension: m1.perDimension,
          newDimensionsCount: m1.newDimensions.length,
          patchCap: cappedNote ?? undefined,
        },
      })
      .catch(() => {});

    if (m1.decision === "abort") {
      throw new Error(
        `Leader aborted mission after assess-research: ${m1.rationale.slice(0, 200)}`,
      );
    }
    // 把 patch/redirect 决策落到 researcher 重派
    if (m1.decision === "patch" || m1.decision === "redirect") {
      const stats = await dispatchAssessActions({
        ctx,
        deps,
        m1,
      });
      deps.log.log(
        `[${missionId}] Leader assess dispatch=${m1.decision}: retried=${stats.retried} aborted=${stats.aborted} appended=${stats.appended} skipped=${stats.skipped}`,
      );
      await deps
        .emit({
          type: "agent-playground.leader:decision",
          missionId,
          userId,
          payload: {
            phase: "assess-research-dispatched",
            decision: m1.decision,
            stats,
          },
        })
        .catch(() => {});
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Leader aborted")) {
      throw err;
    }
    deps.log.warn(
      `[${missionId}] M1 assess-research failed (non-fatal, mission proceeds): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ── helpers ──

async function dispatchAssessActions(args: {
  ctx: MissionContext;
  deps: MissionDeps;
  m1: {
    decision: "accept-all" | "patch" | "redirect" | "abort";
    perDimension: {
      dimensionId: string;
      action:
        | "accept"
        | "accept-degraded"
        | "retry-with-critique"
        | "replace-spec"
        | "abort";
      critique?: string;
      newAgentSpecId?: string;
    }[];
    newDimensions: PlanDimensionLite[];
  };
}): Promise<{
  retried: number;
  aborted: number;
  appended: number;
  skipped: number;
}> {
  const { ctx, deps, m1 } = args;
  const { missionId, userId, budgetMultiplier } = ctx;
  const plan = ctx.plan!;
  const researcherResults = ctx.researcherResults!;

  let retried = 0;
  let aborted = 0;
  let appended = 0;
  let skipped = 0;

  // ── per-dim actions ──
  // 先处理同步动作（accept / abort / 找不到 dim），收集需要 retry/replace 的 action
  type RetryJob = {
    idx: number;
    dim: { id: string; name: string; rationale: string };
    critique: string;
    retryLabel: string;
    reason: "leader-assess-retry" | "leader-assess-replace";
  };
  const retryJobs: RetryJob[] = [];
  for (const action of m1.perDimension) {
    const idx = plan.dimensions.findIndex((d) => d.id === action.dimensionId);
    if (idx < 0) {
      deps.log.warn(
        `[${missionId}] M1 dispatch: dim id "${action.dimensionId}" not in plan, skipped`,
      );
      skipped++;
      continue;
    }
    const dim = plan.dimensions[idx];
    if (action.action === "accept" || action.action === "accept-degraded") {
      continue;
    }
    if (action.action === "abort") {
      researcherResults[idx] = {
        dimension: dim.name,
        findings: [],
        summary: `(aborted by Leader: ${action.critique?.slice(0, 200) ?? "abandoned"})`,
      };
      aborted++;
      await deps
        .emit({
          type: "agent-playground.dimension:retrying",
          missionId,
          userId,
          agentId: `researcher#${idx}`,
          payload: {
            dimension: dim.name,
            reason: "leader-assess-abort",
            critique: action.critique,
          },
        })
        .catch(() => {});
      continue;
    }
    const critique =
      action.action === "replace-spec"
        ? `[Leader 在评审阶段要求换 spec → 当前只注册了 ResearcherAgent，请用更激进的搜索策略] ${action.critique ?? ""} ${action.newAgentSpecId ? `(原意换为 ${action.newAgentSpecId})` : ""}`.trim()
        : (action.critique ??
          "Leader 在评审阶段要求重做该维度，请提升覆盖率与来源质量");
    retryJobs.push({
      idx,
      dim,
      critique,
      retryLabel: `leader-assess-${action.action === "replace-spec" ? "replace" : "retry"}`,
      reason:
        action.action === "replace-spec"
          ? "leader-assess-replace"
          : "leader-assess-retry",
    });
  }

  // ★ BUG-F 修复：retry 改并行 dispatch（之前 for-of await 串行，dim-2 要等 dim-1
  //   跑完才起跑；上限已被 Iter 1b 卡到 2 个，并行不会爆预算）。
  //   独立 budget multiplier 让每个 Researcher 跑自己的预算空间。
  if (retryJobs.length > 0) {
    // 先一次性 emit 所有 retry 事件让前端立即看到
    for (const job of retryJobs) {
      await deps
        .emit({
          type: "agent-playground.dimension:retrying",
          missionId,
          userId,
          agentId: `researcher#${job.idx}`,
          payload: {
            dimension: job.dim.name,
            reason: job.reason,
            critique: job.critique,
            bumpedBudgetMultiplier: budgetMultiplier * 1.3,
          },
        })
        .catch(() => {});
    }
    // ★ Phase P1 fix (2026-04-29 mission 8c7b4358)：retry phase 启动里程碑事件，
    //   让 UI / 监控立即看到 "M1 patch dispatching N dims, expected wall=Xs"
    //   原 case：18:05:53 leader:decision 后到 18:50:07 才有第一个 lifecycle:completed，
    //   中间 44 min UI 看不到任何 milestone，只有 cost:tick 在涨。
    const retryStartMs = Date.now();
    await deps
      .emit({
        type: "agent-playground.dimension:retry-phase:started",
        missionId,
        userId,
        payload: {
          dimsRetrying: retryJobs.map((j) => ({
            idx: j.idx,
            dimension: j.dim.name,
            reason: j.reason,
          })),
          bumpedBudgetMultiplier: budgetMultiplier * 1.3,
          startMs: retryStartMs,
        },
      })
      .catch(() => {});
    // ★ P1-K (2026-04-29): allSettled 替代 all —— 单个 job reject 不应中断整批
    const settled = await Promise.allSettled(
      retryJobs.map((job) =>
        runResearcherWithCritique(ctx, deps, {
          dim: job.dim,
          idx: job.idx,
          budgetMultiplier: budgetMultiplier * 1.3,
          critique: job.critique,
          retryLabel: job.retryLabel,
        }),
      ),
    );
    const results: (Awaited<
      ReturnType<typeof runResearcherWithCritique>
    > | null)[] = settled.map((s, i) => {
      if (s.status === "fulfilled") return s.value;
      deps.log.warn(
        `[${missionId}] retry job ${retryJobs[i].dim.name} threw: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`,
      );
      return null;
    });
    for (let i = 0; i < retryJobs.length; i++) {
      const job = retryJobs[i];
      const newOut = results[i];
      if (newOut) {
        researcherResults[job.idx] = newOut;
        retried++;
      } else {
        skipped++;
      }
    }
    // retry phase 完成里程碑（含每 dim 是否成功 + 总耗时）
    await deps
      .emit({
        type: "agent-playground.dimension:retry-phase:completed",
        missionId,
        userId,
        payload: {
          retried,
          skipped,
          wallTimeMs: Date.now() - retryStartMs,
          perDim: retryJobs.map((j, i) => ({
            idx: j.idx,
            dimension: j.dim.name,
            success: !!results[i],
          })),
        },
      })
      .catch(() => {});
  }

  // ── newDimensions[] (redirect) ──
  for (const newDim of m1.newDimensions) {
    if (plan.dimensions.some((d) => d.id === newDim.id)) {
      deps.log.warn(
        `[${missionId}] M1 dispatch: newDimension id "${newDim.id}" conflicts with existing dim, skipped`,
      );
      skipped++;
      continue;
    }
    plan.dimensions.push(newDim);
    const idx = plan.dimensions.length - 1;
    await deps
      .emit({
        type: "agent-playground.dimension:retrying",
        missionId,
        userId,
        agentId: `researcher#${idx}`,
        payload: {
          dimension: newDim.name,
          reason: "leader-assess-extend",
          rationale: newDim.rationale,
        },
      })
      .catch(() => {});
    const out = await runResearcherWithCritique(ctx, deps, {
      dim: newDim,
      idx,
      budgetMultiplier,
      critique: `Leader 在评审阶段追加了这个维度（rationale: ${newDim.rationale.slice(0, 150)}）`,
      retryLabel: "lead-m1-extend",
    });
    researcherResults.push(
      out ?? {
        dimension: newDim.name,
        findings: [],
        summary: "(failed: lead-m1-extend dispatch produced no output)",
      },
    );
    if (out) appended++;
    else skipped++;
  }

  return { retried, aborted, appended, skipped };
}

async function runResearcherWithCritique(
  ctx: MissionContext,
  deps: MissionDeps,
  args: {
    dim: PlanDimensionLite;
    idx: number;
    budgetMultiplier: number;
    critique: string;
    retryLabel: string;
  },
): Promise<{
  dimension: string;
  findings: { claim: string; evidence: string; source: string }[];
  summary: string;
} | null> {
  const { dim, idx, budgetMultiplier, critique, retryLabel } = args;
  const { missionId, userId, input, billing, pool } = ctx;
  const agentId = `researcher#${idx}.${retryLabel}`;
  await deps.lifecycle(missionId, userId, agentId, "researcher", "started", {
    dimension: dim.name,
    retryLabel,
  });
  const r = await deps.invoker.invoke(
    ResearcherAgent,
    {
      topic: input.topic,
      dimension: dim.name,
      language: input.language,
      critique,
    },
    {
      missionId,
      userId,
      agentId,
      role: "researcher",
      envAdapter: billing,
      budgetMultiplier,
      toolRecallHint: dim.toolHint
        ? {
            categories: dim.toolHint.categories,
            preferIds: dim.toolHint.preferIds,
          }
        : undefined,
    },
  );
  await deps.invoker.tickCost(
    missionId,
    userId,
    "researchers",
    pool,
    extractTokenSpend(r.events),
  );
  await deps.lifecycle(
    missionId,
    userId,
    agentId,
    "researcher",
    r.state === "completed" ? "completed" : "failed",
    {
      wallTimeMs: r.wallTimeMs,
      iterations: r.iterations,
      dimension: dim.name,
      retryLabel,
      error: extractFailureMessage(r.events, r.state, !!r.output, {
        iterations: r.iterations,
        wallTimeMs: r.wallTimeMs,
      }),
    },
  );
  if (r.state !== "completed" || !r.output) return null;
  return r.output as {
    dimension: string;
    findings: { claim: string; evidence: string; source: string }[];
    summary: string;
  };
}
