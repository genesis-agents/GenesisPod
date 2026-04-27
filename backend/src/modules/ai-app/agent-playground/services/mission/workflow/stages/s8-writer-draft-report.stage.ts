/**
 * Stage S8 — Writer + L3 reviewer consensus + memory index + report assembly
 *
 * Writer 起草 + judgeWithConsensus 评分 + 必要时 retry，整篇成稿后做 memory
 * trajectory 入库 + ReportArtifact v2 装配 + reconciliation/coverage/reviewer
 * 三路质量信号融合到 quality.dimensions。这是 mission 的核心成果集合点。
 *
 *   reads  ctx: plan, researcherResults, reconciliationReport, analystOutput,
 *               input.workspaceId / depth / topic / language / withFigures /
 *               styleProfile / lengthProfile / audienceProfile, billing, pool, t0
 *   writes ctx: report (ResearchReport v1) + reportArtifact (v2) + reviewScore +
 *               verifierVerdicts + trajectoryStored
 *   deps:       invoker (runAndRelay SingleShotWriterAgent + tickCost +
 *                        preDisable + resolveLoopOverride),
 *               judge (judgeWithConsensus —— self/external/critical 三路评分),
 *               indexer (indexAgentTrajectory),
 *               reportAssembler (assemble v2),
 *               credits (consumeCredits 终结扣费),
 *               missionState (compressIfNeeded for analyst handoff),
 *               emit, lifecycle, log
 *
 * 内置容错：
 *   - judgeWithConsensus < 70 分 → retry writer（MAX_WRITER_ATTEMPTS=2）
 *   - writer 全失败 → throw（mission 终止，下游 stage 不跑）
 *   - memory indexer 失败 → 记 0，不阻塞
 *   - reportAssembler 失败 → log warn，reportArtifact = undefined，下游兜底
 *
 * Failure modes: writer 2 次都失败 → throw "Writer 失败 (尝试 2 次)..."
 *                其它子步骤失败均就地降级（memory/assembler 不阻塞）
 */

import { SingleShotWriterAgent } from "../../../../agents/writer/single-shot-writer.agent";
import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import type {
  HarnessIAgent,
  HarnessIAgentEvent as IAgentEvent,
  IContextEnvelope,
} from "../../../../../../ai-engine/facade";
import type { ResearchReport } from "../../../../dto/run-mission.dto";
import { extractTokenSpend } from "../helpers/token-spend.util";
import { extractFailureMessage } from "../helpers/failure-extraction.util";

const MAX_WRITER_ATTEMPTS = 2;

/** 给 memory indexer 用的 fallback proxy agent（writer 失败时用）。 */
function makeProxyAgent(missionId: string, roleId: string): HarnessIAgent {
  const env: IContextEnvelope = {
    id: missionId,
    system: "",
    messages: [],
    reminders: [],
    tools: [],
    memory: { sessionId: missionId },
    budget: {
      tokensUsed: 0,
      tokensRemaining: 0,
      iterationsUsed: 0,
      iterationsRemaining: 0,
      wallTimeStartMs: Date.now(),
    },
  };
  return {
    id: missionId,
    identity: {
      role: { id: roleId, name: roleId, description: "demo proxy agent" },
      skills: [],
      tools: [],
    },
    state: "completed",
    execute: async function* () {
      /* no-op */
    },
    spawnSubagent: async () => {
      throw new Error("proxy agent cannot spawn");
    },
    getEnvelope: () => env,
    cancel: async () => {
      /* no-op */
    },
  };
}

export async function runWriterStage(
  ctx: MissionContext,
  deps: MissionDeps,
  analyst: {
    insights: unknown[];
    themeSummary: string;
    contradictions?: unknown[];
  },
  workspaceId: string | undefined,
): Promise<void> {
  const {
    missionId,
    userId,
    input,
    billing,
    pool,
    t0,
    plan,
    researcherResults,
    reconciliationReport,
  } = ctx;
  if (!plan || !researcherResults) {
    throw new Error("S8 writer requires plan + researcherResults");
  }

  // ── 1. Writer 起草 + judgeConsensus retry loop ──
  let attempts = 0;
  let report: ResearchReport | null = null;
  let reviewScore = 0;
  let verifierVerdicts: unknown[] = [];
  let lastWriterAgent: HarnessIAgent | null = null;
  let lastWriterEvents: readonly IAgentEvent[] = [];
  let lastWriterFailMsg: string | undefined;

  do {
    attempts += 1;
    const writerAgentId = `writer#${attempts}`;
    await deps.emit({
      type: "agent-playground.stage:started",
      missionId,
      userId,
      payload: { stage: "writer", attempt: attempts },
    });
    await deps.lifecycle(
      missionId,
      userId,
      writerAgentId,
      "writer",
      "started",
      {
        attempt: attempts,
      },
    );
    // ★ Phase P4-3: Writer 跨 mission 失败模式预查
    await deps.invoker.preDisableKnownFailingModels(
      billing,
      "playground.writer",
      `${input.topic}::writer::${input.language}`,
    );
    // ★ Phase P5-4: Writer 输入 Summarize-on-Handoff
    const writerInsights = deps.missionState.compressIfNeeded(
      analyst.insights,
      "writer.insights",
    );
    const writerContradictions = deps.missionState.compressIfNeeded(
      analyst.contradictions,
      "writer.contradictions",
    );
    const rawFindings: {
      dimension: string;
      claim: string;
      evidence: string;
      source: string;
    }[] = [];
    for (const r of researcherResults) {
      for (const f of r.findings ?? []) {
        rawFindings.push({
          dimension: r.dimension,
          claim: f.claim,
          evidence: f.evidence,
          source: f.source,
        });
      }
    }
    // judgeWithConsensus 需要 writerRes.agent.getEnvelope()，所以这里用 invoker.invoke
    // 拿原始 RunResult（含 .agent）
    const writerRes = await deps.invoker.invoke(
      SingleShotWriterAgent,
      {
        topic: input.topic,
        depth: input.depth,
        language: input.language,
        insights: writerInsights,
        themeSummary: analyst.themeSummary,
        contradictions: writerContradictions,
        rawFindings,
      },
      {
        missionId,
        userId,
        agentId: writerAgentId,
        role: "writer",
        envAdapter: billing,
        loopOverride: deps.invoker.resolveLoopOverride(
          input.auditLayers,
          "writer",
        ),
      },
    );
    await deps.invoker.tickCost(
      missionId,
      userId,
      "writer",
      pool,
      extractTokenSpend(writerRes.events),
    );
    await deps.lifecycle(
      missionId,
      userId,
      writerAgentId,
      "writer",
      writerRes.state === "completed" ? "completed" : "failed",
      {
        wallTimeMs: writerRes.wallTimeMs,
        iterations: writerRes.iterations,
        attempt: attempts,
        error: extractFailureMessage(
          writerRes.events,
          writerRes.state,
          !!writerRes.output,
          {
            iterations: writerRes.iterations,
            wallTimeMs: writerRes.wallTimeMs,
          },
        ),
      },
    );
    if (writerRes.state !== "completed" || !writerRes.output) {
      lastWriterFailMsg = extractFailureMessage(
        writerRes.events,
        writerRes.state,
        !!writerRes.output,
        {
          iterations: writerRes.iterations,
          wallTimeMs: writerRes.wallTimeMs,
        },
      );
      continue;
    }
    report = writerRes.output as ResearchReport;
    lastWriterAgent = writerRes.agent;
    lastWriterEvents = writerRes.events;
    await deps.emit({
      type: "agent-playground.report:draft",
      missionId,
      userId,
      agentId: writerAgentId,
      payload: { attempt: attempts, report },
    });

    // ── L3 reviewer consensus（self/external/critical 三路评分） ──
    await deps.emit({
      type: "agent-playground.stage:started",
      missionId,
      userId,
      payload: { stage: "reviewer", attempt: attempts },
    });
    await deps.lifecycle(missionId, userId, "reviewer", "reviewer", "started", {
      attempt: attempts,
    });
    const verdict = await deps.judge.judgeWithConsensus({
      output: report,
      envelope: writerRes.agent.getEnvelope(),
      verifierIds: ["self", "external", "critical"],
      passThreshold: 70,
    });
    reviewScore = verdict.decision.score;
    verifierVerdicts = verdict.verdicts as unknown[];
    for (const v of verdict.verdicts) {
      await deps.emit({
        type: "agent-playground.verifier:verdict",
        missionId,
        userId,
        agentId: "reviewer",
        payload: {
          verifierId: v.judgeId,
          score: v.score,
          critique: v.critique,
          criteria: v.criteria,
          modelId: v.modelId,
          attempt: attempts,
        },
      });
    }
    await deps.lifecycle(
      missionId,
      userId,
      "reviewer",
      "reviewer",
      "completed",
      {
        attempt: attempts,
        consensusScore: reviewScore,
        consensusVerdict: verdict.decision.verdict,
      },
    );
    await deps.emit({
      type: "agent-playground.stage:completed",
      missionId,
      userId,
      payload: {
        stage: "reviewer",
        attempt: attempts,
        score: reviewScore,
        decision: verdict.decision.verdict,
      },
    });
    if (verdict.decision.verdict === "pass") break;
  } while (attempts < MAX_WRITER_ATTEMPTS);

  if (!report) {
    throw new Error(
      lastWriterFailMsg
        ? `Writer 失败 (尝试 ${MAX_WRITER_ATTEMPTS} 次)：${lastWriterFailMsg}`
        : `Writer failed after ${MAX_WRITER_ATTEMPTS} attempts`,
    );
  }

  await deps.emit({
    type: "agent-playground.stage:completed",
    missionId,
    userId,
    payload: { stage: "writer", attempts, finalScore: reviewScore },
  });

  // ── 2. Memory auto-index ──
  const indexAgent = lastWriterAgent ?? makeProxyAgent(missionId, "team");
  const indexed = await deps.indexer
    .indexAgentTrajectory(indexAgent, lastWriterEvents, {
      namespace: workspaceId ?? userId,
      source: "agent-playground.team",
      tags: [input.depth, input.topic],
      confidence: reviewScore / 100,
      metadata: { topic: input.topic, missionId },
    })
    .catch((err: unknown) => {
      deps.log.warn(
        `[indexer] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    });
  await deps.emit({
    type: "agent-playground.memory:indexed",
    missionId,
    userId,
    payload: {
      chunks: indexed,
      namespace: workspaceId ?? userId,
      tags: [input.depth, input.topic],
    },
  });

  const snap = pool.snapshot();
  const wallTimeMs = Date.now() - t0;
  await deps.emit({
    type: "agent-playground.mission:completed",
    missionId,
    userId,
    payload: {
      reviewScore,
      costUsd: snap.poolCostUsd,
      tokensUsed: snap.poolTokensUsed,
      trajectoryStored: indexed,
      wallTimeMs,
      verifierVerdicts,
    },
  });

  // ── 3. Credits 终态扣费 ──
  await deps.credits
    .consumeCredits({
      userId,
      moduleType: "agent-playground",
      operationType: "team",
      tokenCount: snap.poolTokensUsed,
      referenceId: missionId,
      description: `Research mission: ${input.topic}`,
      idempotencyKey: missionId,
    })
    .catch((err: unknown) => {
      deps.log.warn(
        `[credits] consume failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

  // ── 4. ReportArtifact v2 装配 ──
  let reportArtifact:
    | import("../../../../dto/report-artifact.dto").ReportArtifact
    | undefined;
  try {
    const modelIds = new Set<string>();
    let writerStartTs: number | undefined;
    let writerEndTs: number | undefined;
    for (const ev of lastWriterEvents ?? []) {
      if (ev.type === "thinking") {
        const p = ev.payload as { modelId?: string } | null;
        if (p?.modelId) modelIds.add(p.modelId);
      }
      if (writerStartTs === undefined) writerStartTs = ev.timestamp;
      writerEndTs = ev.timestamp;
    }
    const modelTrail = Array.from(modelIds);
    const writerGenerationMs =
      writerStartTs && writerEndTs ? writerEndTs - writerStartTs : wallTimeMs;
    reportArtifact = deps.reportAssembler.assemble({
      topic: input.topic,
      language: input.language,
      styleProfile: input.styleProfile,
      lengthProfile: input.lengthProfile,
      audienceProfile: input.audienceProfile,
      plan: {
        themeSummary: plan.themeSummary,
        dimensions: plan.dimensions.map((d) => ({
          id: d.id,
          name: d.name,
          rationale: d.rationale,
        })),
      },
      researcherResults: researcherResults.map((r) => ({
        dimension: r.dimension,
        findings: r.findings,
        summary: r.summary,
        figureCandidates: (r as { figureCandidates?: unknown[] })
          .figureCandidates as
          | {
              sourceUrl: string;
              imageUrl?: string;
              caption: string;
              sourcePageOrSection?: string;
              relevanceHint?: "high" | "medium" | "low";
            }[]
          | undefined,
      })),
      analyst: {
        themeSummary: report.summary,
      },
      writerReport: report,
      reconciliationReport: (reconciliationReport ?? undefined) as Parameters<
        typeof deps.reportAssembler.assemble
      >[0]["reconciliationReport"],
      generationTimeMs: writerGenerationMs,
      totalTokens: {
        prompt: 0,
        completion: snap.poolTokensUsed,
        total: snap.poolTokensUsed,
      },
      costCents: Math.round((snap.poolCostUsd ?? 0) * 100),
      modelTrail,
    });
  } catch (err) {
    deps.log.warn(
      `[${missionId}] reportAssembler failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── 5. 把 reconciliation/coverage/reviewer 三路质量信号融合到 quality.dimensions ──
  if (reportArtifact && reconciliationReport) {
    reportArtifact.quality.qualityTrace.push({
      stage: "reconciler",
      check: `${(reconciliationReport as { factTable?: unknown[] }).factTable?.length ?? 0} facts / ${(reconciliationReport as { conflicts?: unknown[] }).conflicts?.length ?? 0} conflicts`,
      passed:
        ((
          reconciliationReport as {
            conflicts?: { resolutionType: string }[];
          }
        ).conflicts?.filter((c) => c.resolutionType === "flagged-unresolved")
          .length ?? 0) === 0,
      timestamp: Date.now(),
    });
    const conflicts =
      (reconciliationReport as { conflicts?: { resolutionType: string }[] })
        .conflicts ?? [];
    const unresolved = conflicts.filter(
      (c) => c.resolutionType === "flagged-unresolved",
    ).length;
    if (unresolved > 0) {
      const drop = Math.min(0.5, unresolved * 0.15);
      reportArtifact.quality.dimensions.factualConsistency = Math.max(
        0,
        Math.round(
          reportArtifact.quality.dimensions.factualConsistency * (1 - drop),
        ),
      );
      reportArtifact.quality.warnings.push({
        dimension: "factualConsistency",
        message: `Reconciler 标记 ${unresolved} 项 unresolved 冲突`,
      });
    }
    const gaps =
      (reconciliationReport as { gaps?: { severity: string }[] }).gaps ?? [];
    const criticalGaps = gaps.filter((g) => g.severity === "critical").length;
    if (criticalGaps > 0) {
      reportArtifact.quality.dimensions.coverage = Math.max(
        0,
        Math.round(reportArtifact.quality.dimensions.coverage * 0.8),
      );
      reportArtifact.quality.warnings.push({
        dimension: "coverage",
        message: `Reconciler 识别 ${criticalGaps} 项 critical gap 未覆盖`,
      });
    }
  }
  if (
    reportArtifact &&
    input.withFigures &&
    reportArtifact.figures.length === 0
  ) {
    reportArtifact.quality.warnings.push({
      dimension: "withFigures",
      message:
        "用户开启图文并茂，但终稿无可用图（researcher 未抽到符合红线的图）",
    });
  }
  if (reportArtifact) {
    const totalDims = plan.dimensions.length;
    const degradedDims = researcherResults.filter(
      (r) => r.findings.length === 0,
    ).length;
    if (totalDims > 0 && degradedDims / totalDims > 0.3) {
      reportArtifact.quality.dimensions.coverage = Math.max(
        0,
        Math.round(reportArtifact.quality.dimensions.coverage * 0.6),
      );
      reportArtifact.quality.warnings.push({
        dimension: "coverage",
        message: `${degradedDims}/${totalDims} 维度降级（无 findings）`,
      });
    }
  }
  if (reportArtifact && reviewScore > 0) {
    const reviewerSignal = Math.max(0, Math.min(100, reviewScore));
    const blend = (cur: number, signal: number, w = 0.4): number =>
      Math.round(cur * (1 - w) + signal * w);
    reportArtifact.quality.dimensions.traceability = blend(
      reportArtifact.quality.dimensions.traceability,
      reviewerSignal,
    );
    reportArtifact.quality.dimensions.factualConsistency = blend(
      reportArtifact.quality.dimensions.factualConsistency,
      reviewerSignal,
      0.3,
    );
    reportArtifact.quality.dimensions.styleConformance = blend(
      reportArtifact.quality.dimensions.styleConformance,
      reviewerSignal,
      0.5,
    );
    const dims = reportArtifact.quality.dimensions;
    reportArtifact.quality.overall = Math.round(
      Object.values(dims).reduce((a, b) => a + b, 0) / Object.keys(dims).length,
    );
    reportArtifact.quality.qualityTrace.push({
      stage: "reviewer-l3",
      check: "blended-into-quality-dimensions",
      passed: reviewerSignal >= 70,
      timestamp: Date.now(),
    });
    if (reportArtifact.quality.qualityTrace.length > 50) {
      reportArtifact.quality.qualityTrace =
        reportArtifact.quality.qualityTrace.slice(-30);
    }
    for (const v of verifierVerdicts) {
      const ver = v as { verifierId?: string; score?: number };
      if (ver?.verifierId && typeof ver.score === "number") {
        reportArtifact.quality.qualityTrace.push({
          stage: ver.verifierId,
          check: `score=${ver.score}`,
          passed: ver.score >= 70,
          timestamp: Date.now(),
        });
      }
    }
  }

  // ── 写回 ctx ──
  ctx.report = report;
  ctx.reportArtifact = reportArtifact;
  ctx.reviewScore = reviewScore;
  ctx.verifierVerdicts = verifierVerdicts;
  ctx.trajectoryStored = indexed;
}
