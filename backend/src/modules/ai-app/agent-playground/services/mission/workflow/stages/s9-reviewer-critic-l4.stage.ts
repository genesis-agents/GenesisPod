/**
 * Stage S9 — Reviewer runs L4 critic (meta-review)
 *
 * Writer 起草 + reviewer 三路评分（self/external/critical）全部完成后，跑一轮
 * 独立的 L4 meta-level 审查：识别报告里的 blindspots（漏掉的视角）/ biasFlags
 * （写作倾向）/ suggestions（改进建议），给出 pass / concerns / fail 总判定。
 * fail/concerns 会触发对 reportArtifact.quality 各 dim 的降权。
 *
 * 这里"L4"是审查层级编号（layer-4 critic），不要与 mission stage 序号混淆。
 *
 *   reads  ctx: reportArtifact, verifierVerdicts, reviewScore, input
 *   mutate ctx.reportArtifact: quality.warnings / qualityTrace / hardGateViolations,
 *                              quality.overall / dimensions.novelty/styleConformance
 *   deps:       reviewer.criticL4, invoker (preDisable + tickCost), emit, log
 *
 * Skip 条件: !enableCritic 时直接 return（minimal 档位 + 非 executive 受众）
 * Failure modes: 任何抛错 → log warn + 继续（不阻塞，下游 Leader foreword 仍可工作）
 */

import type {
  MissionInvariants,
  PlanPhaseCtx,
  ResearchPhaseCtx,
  SynthesisPhaseCtx,
  WriterPhaseCtx,
  QualityPhaseCtx,
} from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { extractTokenSpend } from "@/modules/ai-harness/facade";
import { narrate } from "../narrative.util";
import { scaleScore } from "@/modules/ai-harness/facade";

export async function runCriticStage(
  ctx: MissionInvariants &
    PlanPhaseCtx &
    ResearchPhaseCtx &
    SynthesisPhaseCtx &
    WriterPhaseCtx &
    QualityPhaseCtx,
  deps: MissionDeps,
): Promise<void> {
  const {
    reportArtifact,
    input,
    missionId,
    userId,
    billing,
    pool,
    budgetMultiplier,
  } = ctx;
  if (!reportArtifact) return;
  const verifierVerdicts = ctx.verifierVerdicts ?? [];
  const reviewScore = ctx.reviewScore ?? 0;

  const enableCritic =
    input.auditLayers === "thorough" ||
    input.auditLayers === "thorough+" ||
    (input.audienceProfile === "executive" && input.auditLayers !== "minimal");
  if (!enableCritic) return;

  // ★ 2026-05-06 (P0-A): S9 之前从未 emit stage:started/completed，前端 todo-ledger
  //   占位卡永远翻不了牌。stage='critic' 与前端 line ~510 handler 对应。
  await deps
    .emit({
      type: "agent-playground.stage:started",
      missionId,
      userId,
      payload: {
        stage: "critic",
        startedAtMs: Date.now(),
      },
    })
    .catch(() => {});

  try {
    await narrate(deps.emit, missionId, userId, {
      stage: "s9-critic-l4",
      role: "critic",
      tag: "judging",
      text: "Critic L4 启动独立复审，从盲点 / 偏见 / 改进建议三个维度独立评估报告",
      agentId: "critic",
    });
    // Phase P16-5: Critic 也接 FailureLearner
    await deps.invoker.preDisableKnownFailingModels(
      billing,
      "playground.critic",
      `${input.topic}::critic::${input.language}`,
    );
    // ★ Phase Lead-Services: 通过 ReviewerService.criticL4()
    const criticRes = await deps.reviewer.criticL4(
      {
        topic: input.topic,
        language: input.language,
        audienceProfile: input.audienceProfile,
        styleProfile: input.styleProfile,
        lengthProfile: input.lengthProfile,
        artifactSummary: {
          title: reportArtifact.metadata.topic,
          executiveSummary:
            reportArtifact.quickView.executiveSummary.markdown.slice(0, 1500),
          sectionCount: reportArtifact.sections.length,
          sectionTitles: reportArtifact.sections.map((s) => s.title),
          citationCount: reportArtifact.citations.length,
          factCount: reportArtifact.factTable.length,
          figureCount: reportArtifact.figures.length,
          overallQuality: reportArtifact.quality.overall,
          qualityDimensions: reportArtifact.quality.dimensions,
        },
        upstreamReviewerVerdict:
          verifierVerdicts.length > 0
            ? {
                score: reviewScore,
                critique: (verifierVerdicts[0] as { critique?: string })
                  ?.critique,
              }
            : undefined,
      },
      {
        missionId,
        userId,
        agentId: "critic",
        role: "critic",
        envAdapter: billing,
        budgetMultiplier,
      },
    );
    await deps.invoker.tickCost(
      missionId,
      userId,
      "reviewer",
      pool,
      extractTokenSpend(criticRes.events),
    );
    // ★ degraded 也算成功——L4 critic 即使 verifier 评分微低也仍输出有效 verdict
    if (
      (criticRes.state === "completed" || criticRes.state === "degraded") &&
      criticRes.output
    ) {
      // ★ P1-G (2026-04-29): LLM 返回 schema 不全时强制 fallback，避免 .map() 抛 TypeError
      const rawOut = criticRes.output as Record<string, unknown>;
      const validVerdicts = ["pass", "concerns", "fail"] as const;
      const criticOut = {
        overallVerdict: validVerdicts.includes(
          rawOut.overallVerdict as "pass" | "concerns" | "fail",
        )
          ? (rawOut.overallVerdict as "pass" | "concerns" | "fail")
          : ("concerns" as const),
        blindspots: Array.isArray(rawOut.blindspots)
          ? (rawOut.blindspots as string[])
          : [],
        biasFlags: Array.isArray(rawOut.biasFlags)
          ? (rawOut.biasFlags as string[])
          : [],
        suggestions: Array.isArray(rawOut.suggestions)
          ? (rawOut.suggestions as string[])
          : [],
        rationale: typeof rawOut.rationale === "string" ? rawOut.rationale : "",
      };
      // ★ Phase P21-2: emit 独立 critic:verdict 事件给前端 trace
      await deps
        .emit({
          type: "agent-playground.critic:verdict",
          missionId,
          userId,
          payload: {
            verdict: criticOut.overallVerdict,
            overall: criticOut.overallVerdict,
            blindspotCount: criticOut.blindspots.length,
            biasCount: criticOut.biasFlags.length,
            suggestionCount: criticOut.suggestions.length,
            rationale: criticOut.rationale,
            warnings: [
              ...criticOut.blindspots.map((b) => ({
                kind: "l4-blindspot",
                message: b,
                severity: "warning",
              })),
              ...criticOut.biasFlags.map((b) => ({
                kind: "l4-bias",
                message: b,
                severity: "warning",
              })),
              ...criticOut.suggestions.map((s) => ({
                kind: "l4-suggestion",
                message: s,
                severity: "info",
              })),
            ],
          },
        })
        .catch(() => {});
      await narrate(deps.emit, missionId, userId, {
        stage: "s9-critic-l4",
        role: "critic",
        tag:
          criticOut.overallVerdict === "pass"
            ? "success"
            : criticOut.overallVerdict === "fail"
              ? "warning"
              : "info",
        text: `L4 独立复审完成 · ${criticOut.overallVerdict} · 盲点 ${criticOut.blindspots.length} / 偏见 ${criticOut.biasFlags.length} / 建议 ${criticOut.suggestions.length}`,
        agentId: "critic",
      });
      // 把 critic 输出写到 quality.warnings（不阻塞 mission）
      const criticMessages: { dimension: string; message: string }[] = [
        {
          dimension: "l4-critic",
          message: `[${criticOut.overallVerdict}] ${criticOut.rationale}`,
        },
        ...criticOut.blindspots.map((b) => ({
          dimension: "l4-blindspot",
          message: b,
        })),
        ...criticOut.biasFlags.map((b) => ({
          dimension: "l4-bias",
          message: b,
        })),
        ...criticOut.suggestions.map((s) => ({
          dimension: "l4-suggestion",
          message: s,
        })),
      ];
      reportArtifact.quality.warnings.push(...criticMessages);
      reportArtifact.quality.qualityTrace.push({
        stage: "critic",
        check: "l4-meta-review",
        passed: criticOut.overallVerdict === "pass",
        timestamp: Date.now(),
      });
      // fail verdict → 降低 overall + novelty + factualConsistency
      // ★ P1-NEW-C (round 2): 用 scaleScore 统一 0-100 + NaN clamp
      if (criticOut.overallVerdict === "fail") {
        reportArtifact.quality.hardGateViolations.push({
          dimension: "l4-critic",
          severity: "warning",
          message: `L4 critic 给出 fail 判定（${criticOut.rationale.slice(0, 100)}）`,
        });
        reportArtifact.quality.overall = scaleScore(
          reportArtifact.quality.overall,
          0.7,
        );
        reportArtifact.quality.dimensions.novelty = scaleScore(
          reportArtifact.quality.dimensions.novelty,
          0.6,
        );
        if (criticOut.biasFlags.length > 0) {
          reportArtifact.quality.dimensions.styleConformance = scaleScore(
            reportArtifact.quality.dimensions.styleConformance,
            0.7,
          );
        }
      } else if (criticOut.overallVerdict === "concerns") {
        reportArtifact.quality.overall = scaleScore(
          reportArtifact.quality.overall,
          0.9,
        );
        reportArtifact.quality.dimensions.novelty = scaleScore(
          reportArtifact.quality.dimensions.novelty,
          0.85,
        );
      }
    }
    await deps
      .emit({
        type: "agent-playground.stage:completed",
        missionId,
        userId,
        payload: {
          stage: "critic",
          status: "completed",
        },
      })
      .catch(() => {});
  } catch (err) {
    deps.log.warn(
      `[${missionId}] L4 critic failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
    await deps
      .emit({
        type: "agent-playground.stage:completed",
        missionId,
        userId,
        payload: {
          stage: "critic",
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => {});
  }
}
