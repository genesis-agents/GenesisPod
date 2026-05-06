/**
 * Stage S3 — Researcher×N dispatch (含 self-heal + per-dim chapter pipeline)
 *
 * 给每个 plan.dimension 派一个 ResearcherAgent，并行（or 拓扑序按 dependsOn 分批）跑。
 * 单 dim 失败不阻塞 mission：发"(failed: ...)"占位让 Analyst 拿剩余 dim 继续。
 *
 *   reads  ctx: plan, input, missionId, userId, billing, pool, budgetMultiplier
 *   writes ctx: researcherResults[]（dim → findings/summary，含每个 dim 的 chapter
 *               pipeline 增强字段）
 *   deps:       invoker (invoke + tickCost + preDisable + concurrency / DAG),
 *               failureLearner (lookup / recordFailure / recordSuccessfulFallback),
 *               writer + reviewer (per-dim chapter pipeline 内部用),
 *               emit, lifecycle, log
 *
 * 内置三层容错：
 *   L1 self-heal      RECOVERABLE failureCode 触发 +50% budget 重跑（researcher loop 内）
 *   L2 cross-mission  failure pattern 预查 → markModelDisabled → react-loop 自动 fallback
 *   L3 dim degraded   单 dim 失败收敛为 "(failed: ...)" 占位，emit ORCH_DIMENSION_DEGRADED
 *
 * Per-dim chapter pipeline 由 ../per-dim-pipeline.util.ts 完成，
 * minimal/quick 档位跳过（直接退化为 raw researcherOut）。
 *
 * Failure modes: 单 dim 失败均就地降级为占位，stage 自身不抛错；下游 reconciler/analyst
 *                看到 findings=[] 自然过滤。
 */

import pLimit from "p-limit";
import { ResearcherAgent } from "../../../../agents/researcher/researcher.agent";
import type {
  MissionContext,
  MissionInvariants,
  PlanPhaseCtx,
  ResearchPhaseCtx,
} from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { extractTokenSpend } from "@/modules/ai-harness/facade";
import {
  extractAgentFailureDiagnostic,
  extractFailureMessage,
} from "@/modules/ai-harness/facade";
import { runPerDimPipeline } from "../per-dim-pipeline.util";
import { narrate } from "../narrative.util";

interface ResearcherDimResult {
  dimension: string;
  findings: { claim: string; evidence: string; source: string }[];
  summary: string;
  chapters?: {
    index: number;
    heading: string;
    body: string;
    wordCount: number;
  }[];
  abstract?: string;
  keyFindings?: string[];
  fullMarkdown?: string;
  grade?: {
    overall: number;
    grade: string;
    axes: Record<string, { score: number; comment: string }>;
    summary: string;
  };
}

const RECOVERABLE_FAILURES = new Set([
  "RUNNER_OUTPUT_SCHEMA_MISMATCH",
  "RUNNER_WALL_TIME_EXCEEDED",
  "RUNNER_LOOP_LIMIT",
  "LOOP_EMPTY_RESPONSE_IMMEDIATE",
  "LOOP_REASONING_COT_EXHAUSTION",
  "PARSE_MALFORMED_JSON",
  "PARSE_MISSING_ACTION",
  "PARSE_UNKNOWN_ACTION_KIND",
  "PARSE_EMPTY_ACTIONS_ARRAY",
]);

export async function runResearcherDispatchStage(
  ctx: MissionInvariants & PlanPhaseCtx & ResearchPhaseCtx,
  deps: MissionDeps,
): Promise<void> {
  const { missionId, userId, input, pool, plan } = ctx;
  if (!plan) throw new Error("S3 researcher dispatch requires ctx.plan");

  await narrate(deps.emit, missionId, userId, {
    stage: "s3-researchers",
    role: "researcher",
    tag: "info",
    text: `派遣 ${plan.dimensions.length} 个 Researcher 并行采集（concurrency=${input.concurrency}）`,
  });

  // ★ Phase P1-17: 检测 dependsOn → 走 DAG 调度；否则全并行
  const hasDependencies = plan.dimensions.some(
    (d) => (d as { dependsOn?: string[] }).dependsOn?.length,
  );
  if (hasDependencies) {
  }

  // ★ 2026-05-01 两阶段调度（治本：mission da6e2af7 用户实证 dim research 看似批量）
  //   Phase A: research-only（researcher invoke + retry + figure 抽图）—— 高并发（默认 6）
  //   Phase B: chapter pipeline（outline + chapter writers + integrator + grade）—— 中并发（默认 3）
  //
  //   原 runOneDim 把 research + chapter pipeline 一起跑在 pLimit(3) 下，
  //   chapter pipeline 慢（5+ min）占住槽位，下一个 dim 的 research 要等满
  //   chapter pipeline 完成才能 start，造成"伪批量"假象。
  //
  //   分两阶段：research 阶段所有 dim 真并行（research API 通常 1 min 以内），
  //   chapter pipeline 阶段才控制并发。视觉上 dim research 真正全并行 start。
  //
  //   DAG 路径（hasDependencies）保持原有 runOneDim 单段，因为依赖关系跨阶段推断
  //   太复杂；非 DAG 路径走两阶段。
  const chapterPipelineConcurrency = Math.max(
    1,
    Math.min(input.concurrency ?? 3, 6),
  );
  const researchConcurrency = Math.max(
    chapterPipelineConcurrency,
    Math.min(plan.dimensions.length, 6),
  );

  let researcherResults: ResearcherDimResult[];
  if (hasDependencies) {
    researcherResults = await deps.invoker.runDagConcurrency(
      plan.dimensions,
      chapterPipelineConcurrency,
      async (dim, idx) => runOneDim(ctx, deps, dim, idx),
    );
  } else {
    // Phase A: research only（高并发）
    const phaseALimit = pLimit(researchConcurrency);
    const researchOnly = await Promise.all(
      plan.dimensions.map((dim, idx) =>
        phaseALimit(() => runResearchPhase(ctx, deps, dim, idx)),
      ),
    );
    // Phase B: chapter pipeline（中并发）
    const skipChapterPipeline =
      input.auditLayers === "minimal" || input.depth === "quick";
    if (skipChapterPipeline) {
      researcherResults = researchOnly;
    } else {
      // ★ P0-5a (audit 2026-05-06): Promise.allSettled 防 1 dim 同步 throw 拖累全部。
      //   runChapterPhase 内部已 try-catch 返回 researchResult 兜底，但
      //   任何边界遗漏（emit reject / .catch 之外的 throw）一旦冒泡，
      //   Promise.all 会让已完成 dim 的结果被一并丢弃。allSettled 让每个
      //   dim 独立结算，rejected 的 dim 回退到 Phase A 的 research 结果。
      const phaseBLimit = pLimit(chapterPipelineConcurrency);
      const settled = await Promise.allSettled(
        researchOnly.map((res, idx) =>
          phaseBLimit(() =>
            runChapterPhase(ctx, deps, plan.dimensions[idx], idx, res),
          ),
        ),
      );
      researcherResults = settled.map((s, idx) => {
        if (s.status === "fulfilled") return s.value;
        const reason =
          s.reason instanceof Error ? s.reason.message : String(s.reason);
        deps.log.warn(
          `[s3 phase B] dim "${plan.dimensions[idx].name}" rejected: ${reason} — fallback to phase-A research result`,
        );
        return researchOnly[idx];
      });
    }
  }

  ctx.researcherResults = researcherResults;
  const okCount = researcherResults.filter((r) => r.findings.length > 0).length;
  await narrate(deps.emit, missionId, userId, {
    stage: "s3-researchers",
    role: "researcher",
    tag: okCount === researcherResults.length ? "success" : "warning",
    text: `${okCount} / ${researcherResults.length} 个维度采集完成${okCount < researcherResults.length ? "（部分维度降级）" : ""}`,
  });

  if (pool.isExhausted()) {
    await deps
      .emit({
        type: "agent-playground.budget:exhausted",
        missionId,
        userId,
        payload: pool.snapshot(),
      })
      .catch((err: unknown) => {
        deps.log.error(
          `[${missionId}] budget:exhausted emit failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    // ★ P1-修2 (2026-05-06): budget exhausted 立刻 abort mission，让所有未完成
    //   stage 内部的 await 立即看到 abort signal 失败。之前只 emit 不 abort，
    //   mission 会继续到 wall-time 4h 才超时，浪费时间 + token。
    // abort 不依赖 emit 成功，独立执行。
    deps.abortRegistry.abort(missionId, "budget_exhausted");
  }
}

/**
 * Phase A: 单 dim 仅跑 research（不跑 chapter pipeline）
 * 用于两阶段调度，让 research 阶段所有 dim 真并行（pLimit 不被 chapter pipeline 占用）。
 *
 * 行为与 runOneDim 的前半段（步骤 1-4 + figure 抽图）等价，区别只是不调
 * runPerDimPipeline。失败路径返回降级占位（与 runOneDim 一致）。
 */
async function runResearchPhase(
  ctx: MissionContext,
  deps: MissionDeps,
  dim: NonNullable<MissionContext["plan"]>["dimensions"][number],
  idx: number,
): Promise<ResearcherDimResult> {
  return runOneDim(ctx, deps, dim, idx, { skipChapterPipeline: true });
}

/**
 * Phase B: 单 dim 仅跑 chapter pipeline（research 已在 Phase A 完成）
 * 接收 Phase A 的 ResearcherDimResult，进入 per-dim-pipeline 做 outline + chapter
 * writing + integrator + grade。降级 / 失败路径直接返回输入（保留 research 阶段产出）。
 */
async function runChapterPhase(
  ctx: MissionContext,
  deps: MissionDeps,
  dim: NonNullable<MissionContext["plan"]>["dimensions"][number],
  idx: number,
  researchResult: ResearcherDimResult,
): Promise<ResearcherDimResult> {
  const { missionId, userId, input, billing, pool, budgetMultiplier } = ctx;
  const agentId = `researcher#${idx}`;
  // ★ 2026-05-01 深度仿真发现的漏洞补丁：research 阶段已降级（findings=[]）时
  //   直接透传不调 per-dim-pipeline。但 per-dim-pipeline 是 dim:graded 终态事件
  //   的唯一发射点，跳过它会让前端卡"等待评分"。这里手动发一个 graded(failed,
  //   skipped, phase=research-failed)，保持 INVARIANT：每个 dim 必有终态事件。
  if (researchResult.findings.length === 0) {
    await deps
      .emit({
        type: "agent-playground.dimension:graded",
        missionId,
        userId,
        agentId: `quality-judge#${idx}`,
        payload: {
          dimension: dim.name,
          overall: 0,
          grade: "F",
          axes: {},
          summary: `${dim.name} · research 阶段降级（无 finding），跳过 chapter pipeline + 评分。`,
          failed: true,
          skipped: true,
          phase: "research-failed",
        },
      })
      .catch((err: unknown) => {
        deps.log.warn(
          `[${missionId}] emit dimension:graded (research-failed) for "${dim.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    return researchResult;
  }
  try {
    return await runPerDimPipeline(
      {
        missionId,
        userId,
        dimensionIdx: idx,
        dimensionName: dim.name,
        topic: input.topic,
        language: input.language,
        depth: input.depth,
        lengthProfile: input.lengthProfile,
        dimensionCount: ctx.plan?.dimensions.length,
        pool,
        researcherOut: researchResult,
        billing,
        budgetMultiplier,
      },
      deps,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log.warn(
      `[per-dim pipeline ${idx}] threw on "${dim.name}": ${message}`,
    );
    await deps
      .emit({
        type: "agent-playground.dimension:degraded",
        missionId,
        userId,
        agentId,
        payload: {
          dimension: dim.name,
          state: "chapter-pipeline-failed",
          failureCode: "ORCH_CHAPTER_PIPELINE_FAILED",
          innerMessage: message,
          diagnostic: {
            stage: "per-dim-chapter-pipeline",
            errorMessage: message,
          },
        },
      })
      .catch((err: unknown) => {
        deps.log.warn(
          `[${missionId}] emit dimension:degraded (chapter-pipeline-failed) for "${dim.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    return {
      ...researchResult,
      findings: [],
      summary: `(failed: chapter-pipeline-failed) ${dim.name} · ${message.slice(0, 150)}`,
    };
  }
}

/** 单个 dim 的 researcher 执行：cross-mission preDisable + self-heal + per-dim chapter pipeline。
 *
 * @param opts.skipChapterPipeline 强制跳过 chapter pipeline（用于 Phase A 拆分）
 */
async function runOneDim(
  ctx: MissionContext,
  deps: MissionDeps,
  dim: NonNullable<MissionContext["plan"]>["dimensions"][number],
  idx: number,
  opts: { skipChapterPipeline?: boolean } = {},
): Promise<ResearcherDimResult> {
  const { missionId, userId, input, billing, pool, budgetMultiplier } = ctx;
  const agentId = `researcher#${idx}`;

  try {
    // ── L2: 跨 mission failure pattern 预查 ──
    const promptKey = `${input.topic}::${dim.name}::${input.language}`;
    const knownFailures = await deps.failureLearner
      .lookup({
        agentSpecId: "playground.researcher",
        systemPrompt: promptKey,
      })
      .catch(() => []);
    const preDisabled: { failed: string; fallback: string }[] = [];
    for (const rec of knownFailures) {
      if (rec.count >= 2 && rec.lastFallbackModel) {
        billing.markModelDisabled(rec.modelId, rec.lastFallbackModel);
        preDisabled.push({
          failed: rec.modelId,
          fallback: rec.lastFallbackModel,
        });
      }
    }
    if (preDisabled.length > 0) {
      deps.log.log(
        `[researcher#${idx}] pre-disabled ${preDisabled.length} known-failing model(s) on dim "${dim.name}": ${preDisabled.map((d) => `${d.failed}→${d.fallback}`).join(", ")}`,
      );
      await deps
        .emit({
          type: "agent-playground.failure-pattern:pre-applied",
          missionId,
          userId,
          agentId,
          payload: {
            dimension: dim.name,
            preDisabled,
            matchedRecords: knownFailures.length,
          },
        })
        .catch((err: unknown) => {
          deps.log.warn(
            `[${missionId}] emit failure-pattern:pre-applied for "${dim.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    await deps.lifecycle(missionId, userId, agentId, "researcher", "started", {
      dimension: dim.name,
    });

    // ── per-dim research:started（invoke 之前 emit，前端立刻看到该 dim 开始采集）──
    await deps
      .emit({
        type: "agent-playground.dimension:research:started",
        missionId,
        userId,
        agentId,
        payload: {
          dimension: dim.name,
          dimensionId: dim.id,
          dimensionIdx: idx,
        },
      })
      .catch((err: unknown) => {
        deps.log.warn(
          `[${missionId}] emit dimension:research:started for "${dim.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    const runResearcher = (
      attempt: number,
      bumpedMult: number,
      topicSuffix = "",
    ) =>
      deps.invoker.invoke(
        ResearcherAgent,
        {
          topic: input.topic + topicSuffix,
          dimension: dim.name,
          language: input.language,
          withFigures: input.withFigures,
          knowledgeBaseIds: input.knowledgeBaseIds,
        },
        {
          missionId,
          userId,
          agentId: attempt > 0 ? `${agentId}.retry${attempt}` : agentId,
          role: "researcher",
          envAdapter: billing,
          budgetMultiplier: bumpedMult,
          toolRecallHint: dim.toolHint
            ? {
                categories: dim.toolHint.categories,
                preferIds: dim.toolHint.preferIds,
              }
            : undefined,
        },
      );

    let r = await runResearcher(0, budgetMultiplier);

    // ── L1: self-heal RECOVERABLE failureCode → +50% budget 重跑 ──
    if (r.state !== "completed" || !r.output) {
      const innerFail0 = extractAgentFailureDiagnostic(r.events);
      const code0 = innerFail0?.failureCode;
      if (code0 && RECOVERABLE_FAILURES.has(code0)) {
        deps.log.warn(
          `[researcher#${idx}] dim "${dim.name}" first attempt failed (${code0}); retrying with +50% budget`,
        );
        await deps
          .emit({
            type: "agent-playground.dimension:retrying",
            missionId,
            userId,
            agentId,
            payload: {
              dimension: dim.name,
              reason: code0,
              bumpedBudgetMultiplier: budgetMultiplier * 1.5,
            },
          })
          .catch((err: unknown) => {
            deps.log.warn(
              `[${missionId}] emit dimension:retrying (self-heal) for "${dim.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        r = await runResearcher(
          1,
          budgetMultiplier * 1.5,
          `（重试：上一轮以 ${code0} 失败，请先返回符合 schema 的 finalize；4-5 条 finding，每条带 source URL）`,
        );
      }
    }

    // ── C: min-findings 退出闸 —— findings.length < 5 强制 retry ──────────────
    // (C-alignment 2026-05-06): 对齐 Topic Insight 报告标准，每 dim 至少 5 条 finding
    // 才能保证下游 quality-judge sources_sufficiency 评分通过。即使 schema 校验通过
    // (≥4 条，validateBusinessRules 阈值)，5 条以下也触发一次 retry。
    // 仅在首次 attempt (r.state === "completed") 后且第一次自愈还未用过时执行，
    // 避免与 L1 self-heal 冲突（L1 已用过 attempt=1 时跳过本检查）。
    const MIN_FINDINGS_THRESHOLD = 5;
    if (
      r.state === "completed" &&
      r.output &&
      ((r.output as { findings?: unknown[] }).findings ?? []).length <
        MIN_FINDINGS_THRESHOLD
    ) {
      const actualCount = (
        (r.output as { findings?: unknown[] }).findings ?? []
      ).length;
      deps.log.warn(
        `[researcher#${idx}] dim "${dim.name}" completed but findings.length=${actualCount} < ${MIN_FINDINGS_THRESHOLD}; forcing retry to collect more findings`,
      );
      await deps
        .emit({
          type: "agent-playground.dimension:retrying",
          missionId,
          userId,
          agentId,
          payload: {
            dimension: dim.name,
            reason: `min-findings-not-met (${actualCount} < ${MIN_FINDINGS_THRESHOLD})`,
            bumpedBudgetMultiplier: budgetMultiplier * 1.5,
          },
        })
        .catch((err: unknown) => {
          deps.log.warn(
            `[${missionId}] emit dimension:retrying (min-findings) for "${dim.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      r = await runResearcher(
        2,
        budgetMultiplier * 1.5,
        `（当前只有 ${actualCount} 条 finding，要求至少 ${MIN_FINDINGS_THRESHOLD} 条。请多调 1-2 轮搜索，把 finding 补到 ≥${MIN_FINDINGS_THRESHOLD} 条，每条带不同 source URL）`,
      );
    }

    // ── 跑通 + 用了 fallback model → 回写 successfulFallback ──
    if (r.state === "completed" && r.output && preDisabled.length > 0) {
      let actualModelId: string | undefined;
      for (let i = r.events.length - 1; i >= 0; i--) {
        const ev = r.events[i];
        if (ev.type === "thinking") {
          const p = ev.payload as { modelId?: string } | null;
          if (p?.modelId) {
            actualModelId = p.modelId;
            break;
          }
        }
      }
      if (actualModelId) {
        for (const pd of preDisabled) {
          if (actualModelId === pd.fallback) {
            for (const rec of knownFailures.filter(
              (r0) => r0.modelId === pd.failed,
            )) {
              await deps.failureLearner
                .recordSuccessfulFallback({
                  key: {
                    agentSpecId: "playground.researcher",
                    modelId: pd.failed,
                    systemPrompt: promptKey,
                    failureCode: rec.failureCode,
                  },
                  fallbackModelId: pd.fallback,
                })
                .catch(() => {});
            }
          }
        }
      }
    }

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
        error: extractFailureMessage(r.events, r.state, !!r.output, {
          iterations: r.iterations,
          wallTimeMs: r.wallTimeMs,
        }),
      },
    );
    const finalFindingsCount =
      r.state === "completed" && r.output
        ? ((r.output as { findings?: unknown[] }).findings ?? []).length
        : 0;
    // ── per-dim research:completed（与 researcher:completed 并存，携带明确 dimensionRef）──
    await deps
      .emit({
        type: "agent-playground.dimension:research:completed",
        missionId,
        userId,
        agentId,
        payload: {
          dimension: dim.name,
          state: r.state,
          findingsCount: finalFindingsCount,
        },
      })
      .catch((err: unknown) => {
        deps.log.warn(
          `[${missionId}] emit dimension:research:completed for "${dim.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    await deps
      .emit({
        type: "agent-playground.researcher:completed",
        missionId,
        userId,
        agentId,
        payload: {
          dimension: dim.name,
          state: r.state,
          iterations: r.iterations,
          wallTimeMs: r.wallTimeMs,
          summary:
            r.state === "completed" && r.output
              ? (r.output as { summary?: string }).summary
              : undefined,
          findingsCount: finalFindingsCount,
        },
      })
      .catch((err: unknown) => {
        deps.log.warn(
          `[${missionId}] emit researcher:completed for "${dim.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    await narrate(deps.emit, missionId, userId, {
      stage: "s3-researchers",
      role: "researcher",
      tag: r.state === "completed" ? "success" : "warning",
      text:
        r.state === "completed"
          ? `维度「${dim.name}」采集完成 · ${finalFindingsCount} 条 finding · ${r.iterations} 轮思考`
          : `维度「${dim.name}」未完成（${r.state}），下游走退化路径`,
      dimension: dim.name,
      agentId,
    });

    if (r.state !== "completed" || !r.output) {
      // ── L3: dim 降级（mission 仍继续）+ 入库 failure pattern ──
      const innerFailure = extractAgentFailureDiagnostic(r.events);
      await deps
        .emit({
          type: "agent-playground.dimension:degraded",
          missionId,
          userId,
          agentId,
          payload: {
            dimension: dim.name,
            state: r.state,
            failureCode: "ORCH_DIMENSION_DEGRADED",
            innerFailureCode: innerFailure?.failureCode,
            innerMessage: innerFailure?.message,
            diagnostic: {
              ...(innerFailure?.diagnostic ?? {}),
              stage: "researcher",
              iterations: r.iterations,
              wallTimeMs: r.wallTimeMs,
            },
            recoveryHint: innerFailure?.recoveryHint,
          },
        })
        .catch((err: unknown) => {
          deps.log.warn(
            `[${missionId}] emit dimension:degraded (ORCH_DIMENSION_DEGRADED) for "${dim.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      if (innerFailure?.failureCode) {
        const innerModelId = (innerFailure.diagnostic?.modelId ??
          "unknown") as string;
        await deps.failureLearner
          .recordFailure({
            key: {
              agentSpecId: "playground.researcher",
              modelId: innerModelId,
              systemPrompt: `${input.topic}::${dim.name}::${input.language}`,
              failureCode: innerFailure.failureCode,
            },
            missionId,
            userId,
            diagnostic: innerFailure.diagnostic,
          })
          .catch(() => {});
      }
      return {
        dimension: dim.name,
        findings: [],
        summary: `(failed: ${r.state}${innerFailure?.failureCode ? `, code=${innerFailure.failureCode}` : ""})`,
      };
    }

    const researcherOut = r.output as {
      dimension: string;
      findings: { claim: string; evidence: string; source: string }[];
      summary: string;
      figureCandidates?: {
        sourceUrl: string;
        imageUrl?: string;
        caption: string;
        sourcePageOrSection?: string;
        relevanceHint?: "high" | "medium" | "low";
      }[];
    };

    // ── 沉淀（2026-04-29）: figure pipeline 自动抽图 ─────────────────
    //   不再依赖 LLM 主动抽 figureCandidates（researcher 经常忽略 prompt）。
    //   从 findings.source URL 自动 web-scraper 抽图 → embedding 相关性过滤 →
    //   填回 researcherOut.figureCandidates。
    if (input.withFigures && researcherOut.findings.length > 0) {
      try {
        // 取前 3 个高质量 source URL（避免抽太多浪费时间）
        const sourceUrls = Array.from(
          new Set(
            researcherOut.findings
              .map((f) => f.source)
              .filter(
                (s): s is string =>
                  typeof s === "string" && /^https?:\/\//i.test(s),
              )
              // ★ 2026-05-02 (用户实证图片严重缺失)：原 slice(0,3) 太严，每 dim
              //   只抽 3 个 URL，半数 mission 抓不到合适图。提到 6 给 figure
              //   relevance filter 更多候选。relevant.slice(0,3) 仍保留每 dim 上限。
              .slice(0, 6),
          ),
        );
        if (sourceUrls.length > 0) {
          const allFigures = (
            await Promise.all(
              sourceUrls.map((url) =>
                deps.figureExtractor
                  .extractFiguresFromUrl(url, 15_000)
                  .catch(() => []),
              ),
            )
          ).flat();
          if (allFigures.length > 0) {
            const relevant = await deps.figureRelevance
              .filterRelevantFigures(allFigures, dim.name)
              .catch(() => allFigures);
            // 取前 3 张高相关度图填到 figureCandidates
            researcherOut.figureCandidates = relevant
              .slice(0, 3)
              .map(
                (f: {
                  imageUrl: string;
                  caption?: string;
                  alt?: string;
                  type?: string;
                }) => ({
                  sourceUrl: f.imageUrl, // 沉淀实现里 imageUrl 是绝对 URL
                  imageUrl: f.imageUrl,
                  caption: f.caption || `(图自 ${dim.name})`,
                  sourcePageOrSection: f.alt,
                  relevanceHint:
                    f.type === "chart" || f.type === "table"
                      ? "high"
                      : "medium",
                }),
              );
            deps.log.log(
              `[s3 figure-pipeline ${idx}] dim "${dim.name}" 抽 ${allFigures.length} 张 → 相关 ${relevant.length} → 用 ${(researcherOut.figureCandidates ?? []).length}`,
            );
          }
        }
      } catch (err) {
        deps.log.warn(
          `[s3 figure-pipeline ${idx}] failed (best-effort): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── per-dim chapter pipeline (skip 在 minimal / quick 档位 OR Phase A 强制跳过) ──
    const skipChapterPipeline =
      opts.skipChapterPipeline === true ||
      input.auditLayers === "minimal" ||
      input.depth === "quick";
    if (skipChapterPipeline) return researcherOut;

    try {
      return await runPerDimPipeline(
        {
          missionId,
          userId,
          dimensionIdx: idx,
          dimensionName: dim.name,
          topic: input.topic,
          language: input.language,
          depth: input.depth,
          lengthProfile: input.lengthProfile,
          dimensionCount: ctx.plan?.dimensions.length,
          pool,
          researcherOut,
          billing,
          budgetMultiplier,
        },
        deps,
      );
    } catch (err) {
      // ★ P0-LIVE-PATCH-SILENT (2026-04-30): per-dim chapter pipeline 失败之前
      //   静默 log warn 后 return researcherOut，UI 看不到该 dim 章节缺失，
      //   下游 S8 writer 基于无章节数据装配，产出严重退化。修复：emit
      //   dimension:degraded 事件 + summary 注 [chapter-pipeline-failed]，
      //   下游 writer / S10 signoff 都能看到。
      const message = err instanceof Error ? err.message : String(err);
      deps.log.warn(
        `[per-dim pipeline ${idx}] threw on "${dim.name}": ${message}`,
      );
      await deps
        .emit({
          type: "agent-playground.dimension:degraded",
          missionId,
          userId,
          agentId,
          payload: {
            dimension: dim.name,
            state: "chapter-pipeline-failed",
            failureCode: "ORCH_CHAPTER_PIPELINE_FAILED",
            innerMessage: message,
            diagnostic: {
              stage: "per-dim-chapter-pipeline",
              errorMessage: message,
            },
          },
        })
        .catch((err2: unknown) => {
          deps.log.warn(
            `[${missionId}] emit dimension:degraded (ORCH_CHAPTER_PIPELINE_FAILED) for "${dim.name}" failed: ${err2 instanceof Error ? err2.message : String(err2)}`,
          );
        });
      return {
        ...researcherOut,
        summary:
          `${researcherOut.summary ?? ""}\n\n[chapter-pipeline-failed] ${message.slice(0, 150)}`.trim(),
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : "Unknown";
    deps.log.warn(
      `[researcher#${idx}] threw on dim "${dim.name}" (${errName}): ${message}`,
    );
    await deps
      .lifecycle(missionId, userId, agentId, "researcher", "failed", {
        dimension: dim.name,
        error: message,
      })
      .catch(() => {});
    let innerFailureCode = "UNKNOWN";
    if (errName === "ByokRequiredError") {
      innerFailureCode = "PROVIDER_BYOK_MODEL_NOT_FOUND";
    } else if (
      errName === "InputValidationError" ||
      errName === "DefineAgentMissingError"
    ) {
      innerFailureCode = "RUNNER_INPUT_SCHEMA_MISMATCH";
    } else if (/timeout|timed out/i.test(message)) {
      innerFailureCode = "RUNNER_WALL_TIME_EXCEEDED";
    } else if (/rate.?limit|429/i.test(message)) {
      innerFailureCode = "PROVIDER_RATE_LIMIT";
    } else if (!/aborted|cancelled/i.test(message)) {
      innerFailureCode = "PROVIDER_API_ERROR";
    }
    await deps
      .emit({
        type: "agent-playground.dimension:degraded",
        missionId,
        userId,
        agentId,
        payload: {
          dimension: dim.name,
          state: "exception",
          failureCode: "ORCH_DIMENSION_DEGRADED",
          innerFailureCode,
          innerMessage: message,
          diagnostic: {
            stage: "researcher",
            errorName: errName,
            errorMessage: message,
            errorStack: err instanceof Error ? err.stack : undefined,
          },
        },
      })
      .catch((emitErr: unknown) => {
        deps.log.warn(
          `[${missionId}] emit dimension:degraded (exception) for "${dim.name}" failed: ${emitErr instanceof Error ? emitErr.message : String(emitErr)}`,
        );
      });
    return {
      dimension: dim.name,
      findings: [],
      summary: `(error: ${message})`,
    };
  }
}
