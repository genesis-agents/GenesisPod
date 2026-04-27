/**
 * 70-critic.stage.ts —— L4 Critic（Phase P1-4 / P37-1）
 *
 * 上游：reportArtifact 已成稿 + verifierVerdicts 已就绪
 * 下游：把 critic 输出写到 reportArtifact.quality.warnings + qualityTrace +
 *       hardGateViolations；fail verdict 降 overall / novelty / styleConformance
 *
 * 启用条件：thorough+ OR (audience=executive AND auditLayers≠minimal)
 */

import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { extractTokenSpend } from "../helpers/token-spend.util";

export async function runCriticStage(
  ctx: MissionContext,
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
    input.auditLayers === "paranoid" ||
    (input.audienceProfile === "executive" && input.auditLayers !== "minimal");
  if (!enableCritic) return;

  try {
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
    if (criticRes.state === "completed" && criticRes.output) {
      const criticOut = criticRes.output as {
        overallVerdict: "pass" | "concerns" | "fail";
        blindspots: string[];
        biasFlags: string[];
        suggestions: string[];
        rationale: string;
      };
      // ★ Phase P21-2: emit 独立 critic:verdict 事件给前端 trace
      await deps
        .emit({
          type: "agent-playground.critic:verdict",
          missionId,
          userId,
          payload: {
            verdict: criticOut.overallVerdict,
            blindspotCount: criticOut.blindspots.length,
            biasCount: criticOut.biasFlags.length,
            suggestionCount: criticOut.suggestions.length,
            rationale: criticOut.rationale,
          },
        })
        .catch(() => {});
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
      if (criticOut.overallVerdict === "fail") {
        reportArtifact.quality.hardGateViolations.push({
          dimension: "l4-critic",
          severity: "warning",
          message: `L4 critic 给出 fail 判定（${criticOut.rationale.slice(0, 100)}）`,
        });
        reportArtifact.quality.overall = Math.max(
          0,
          Math.round(reportArtifact.quality.overall * 0.7),
        );
        reportArtifact.quality.dimensions.novelty = Math.max(
          0,
          Math.round(reportArtifact.quality.dimensions.novelty * 0.6),
        );
        if (criticOut.biasFlags.length > 0) {
          reportArtifact.quality.dimensions.styleConformance = Math.max(
            0,
            Math.round(
              reportArtifact.quality.dimensions.styleConformance * 0.7,
            ),
          );
        }
      } else if (criticOut.overallVerdict === "concerns") {
        reportArtifact.quality.overall = Math.max(
          0,
          Math.round(reportArtifact.quality.overall * 0.9),
        );
        reportArtifact.quality.dimensions.novelty = Math.max(
          0,
          Math.round(reportArtifact.quality.dimensions.novelty * 0.85),
        );
      }
    }
  } catch (err) {
    deps.log.warn(
      `[${missionId}] L4 critic failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
