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
 * Per-dim chapter pipeline 由 helpers/per-dim-pipeline.util.ts 完成，
 * minimal/quick 档位跳过（直接退化为 raw researcherOut）。
 *
 * Failure modes: 单 dim 失败均就地降级为占位，stage 自身不抛错；下游 reconciler/analyst
 *                看到 findings=[] 自然过滤。
 */

import { ResearcherAgent } from "../../../../agents/researcher/researcher.agent";
import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { extractTokenSpend } from "../helpers/token-spend.util";
import {
  extractAgentFailureDiagnostic,
  extractFailureMessage,
} from "../helpers/failure-extraction.util";
import { runPerDimPipeline } from "../helpers/per-dim-pipeline.util";
import { narrate } from "../helpers/narrative.util";

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
  ctx: MissionContext,
  deps: MissionDeps,
): Promise<void> {
  const { missionId, userId, input, pool, plan } = ctx;
  if (!plan) throw new Error("S3 researcher dispatch requires ctx.plan");

  await deps.emit({
    type: "agent-playground.stage:started",
    missionId,
    userId,
    payload: {
      stage: "researchers",
      count: plan.dimensions.length,
      dimensions: plan.dimensions.map((d) => d.name),
    },
  });
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
    await deps.emit({
      type: "agent-playground.stage:started",
      missionId,
      userId,
      payload: {
        stage: "researchers-dag",
        dependencyMap: plan.dimensions.reduce(
          (acc, d) => {
            const dDeps = (d as { dependsOn?: string[] }).dependsOn ?? [];
            if (dDeps.length > 0) acc[d.id] = dDeps;
            return acc;
          },
          {} as Record<string, string[]>,
        ),
      },
    });
  }
  const dispatch = hasDependencies
    ? deps.invoker.runDagConcurrency.bind(deps.invoker)
    : deps.invoker.runWithConcurrency.bind(deps.invoker);

  const researcherResults = await dispatch(
    plan.dimensions,
    input.concurrency,
    async (dim, idx) => runOneDim(ctx, deps, dim, idx),
  );

  ctx.researcherResults = researcherResults;
  const okCount = researcherResults.filter((r) => r.findings.length > 0).length;
  await narrate(deps.emit, missionId, userId, {
    stage: "s3-researchers",
    role: "researcher",
    tag: okCount === researcherResults.length ? "success" : "warning",
    text: `${okCount} / ${researcherResults.length} 个维度采集完成${okCount < researcherResults.length ? "（部分维度降级）" : ""}`,
  });

  if (pool.isExhausted()) {
    await deps.emit({
      type: "agent-playground.budget:exhausted",
      missionId,
      userId,
      payload: pool.snapshot(),
    });
  }
  await deps.emit({
    type: "agent-playground.stage:completed",
    missionId,
    userId,
    payload: {
      stage: "researchers",
      results: researcherResults.map((r) => ({
        dimension: r.dimension,
        findingsCount: r.findings.length,
        summary: r.summary,
      })),
    },
  });
}

/** 单个 dim 的 researcher 执行：cross-mission preDisable + self-heal + per-dim chapter pipeline。 */
async function runOneDim(
  ctx: MissionContext,
  deps: MissionDeps,
  dim: NonNullable<MissionContext["plan"]>["dimensions"][number],
  idx: number,
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
        .catch(() => {});
    }

    await deps.lifecycle(missionId, userId, agentId, "researcher", "started", {
      dimension: dim.name,
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
          .catch(() => {});
        r = await runResearcher(
          1,
          budgetMultiplier * 1.5,
          `（重试：上一轮以 ${code0} 失败，请先返回符合 schema 的 finalize；4-5 条 finding，每条带 source URL）`,
        );
      }
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
    await deps.emit({
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
        .catch(() => {});
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
    };

    // ── per-dim chapter pipeline (skip 在 minimal / quick 档位) ──
    const skipChapterPipeline =
      input.auditLayers === "minimal" || input.depth === "quick";
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
          pool,
          researcherOut,
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
      return researcherOut;
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
      .catch(() => {});
    return {
      dimension: dim.name,
      findings: [],
      summary: `(error: ${message})`,
    };
  }
}
