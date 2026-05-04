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
 *               per-call BillingContext handles credits,
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
  IAgent,
  IAgentEvent,
  IContextEnvelope,
} from "@/modules/ai-harness/facade";
import type { ResearchReport } from "../../../../dto/run-mission.dto";
import { extractTokenSpend } from "@/modules/ai-harness/facade";
import { extractFailureMessage } from "@/modules/ai-harness/facade";
import {
  REVIEW_PASS_THRESHOLD,
  MISSION_WRITER_MAX_ATTEMPTS,
} from "@/modules/ai-harness/facade";
import { narrate } from "../narrative.util";
import { clampScore, scaleScore } from "@/modules/ai-harness/facade";

// ★ 2026-05-01 (PR-G iter8): 走 ai-harness 集中阈值（quality-thresholds.constants.ts）
const MAX_WRITER_ATTEMPTS = MISSION_WRITER_MAX_ATTEMPTS;

/** 给 memory indexer 用的 fallback proxy agent（writer 失败时用）。 */
function makeProxyAgent(missionId: string, roleId: string): IAgent {
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
  let lastWriterAgent: IAgent | null = null;
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
    await narrate(deps.emit, missionId, userId, {
      stage: "s8-writer-draft",
      role: "writer",
      tag: "writing",
      text:
        attempts === 1
          ? "Writer 开始起草报告（基于 Analyst 洞察 + 原始 finding）"
          : `Writer 第 ${attempts} 轮重写（上一轮评分未达 70）`,
      agentId: writerAgentId,
    });
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
        // ★ P1-E (2026-04-29): 注入 S7 outline，让 Writer 严格按章节大纲起草
        // 仅 thorough+ 档位 S7 跑了 outline-planner，否则 ctx.outlinePlan 为空
        outlinePlan: ctx.outlinePlan,
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
    // ★ degraded 算成功：reflexion verifier 评分略低于阈值但 outputSchema 合法
    const writerUsable =
      (writerRes.state === "completed" || writerRes.state === "degraded") &&
      !!writerRes.output;
    await deps.lifecycle(
      missionId,
      userId,
      writerAgentId,
      "writer",
      writerUsable ? "completed" : "failed",
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
        degraded: writerRes.state === "degraded" || undefined,
      },
    );
    if (!writerUsable) {
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
    const sectionCount =
      (report as unknown as { sections?: unknown[] }).sections?.length ?? 0;
    await narrate(deps.emit, missionId, userId, {
      stage: "s8-writer-draft",
      role: "writer",
      tag: "success",
      text: `第 ${attempts} 轮起草完成 · ${sectionCount} 个章节`,
      agentId: writerAgentId,
    });
    await narrate(deps.emit, missionId, userId, {
      stage: "s8-writer-draft",
      role: "reviewer",
      tag: "judging",
      text: `Reviewer 启动 L3 三路评分（self / external / critical）`,
      agentId: "reviewer",
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
      // ★ 2026-05-01 (PR-G iter8): 走 ai-harness 集中阈值，与 reflexion +
      //   per-dim-pipeline 同源（quality-thresholds.constants.ts）
      passThreshold: REVIEW_PASS_THRESHOLD,
    });
    reviewScore = verdict.decision.score;
    verifierVerdicts = verdict.verdicts as unknown[];
    for (const v of verdict.verdicts) {
      // ★ P1-J (2026-04-29): 残缺 verdict 元素跳过（缺 judgeId 或 score）
      if (!v?.judgeId || typeof v.score !== "number") {
        deps.log.warn(
          `[${missionId}] malformed verdict skipped: ${JSON.stringify(v)}`,
        );
        continue;
      }
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
    await narrate(deps.emit, missionId, userId, {
      stage: "s8-writer-draft",
      role: "reviewer",
      tag: verdict.decision.verdict === "pass" ? "success" : "warning",
      text:
        verdict.decision.verdict === "pass"
          ? `三路共识 · 通过（${reviewScore} 分）`
          : `三路共识 · 不通过（${reviewScore} 分），将触发 Writer 重写`,
      agentId: "reviewer",
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
  // ★ 2026-04-30: 移走 S8 的 mission:completed —— 此时 S8B/S9/S9B/S10/S11/S12 都未跑，
  //   提前 emit 让前端误判 mission 已完成（且 DB 行还是 running，造成"假成功"）。
  //   mission:completed 改在 S11 markCompleted 成功后 emit。
  //   S8 只 emit draft:completed 让前端知道写作环节已结束、进入审稿/签字。
  const wallTimeMs = Date.now() - t0;
  await deps.emit({
    type: "agent-playground.draft:completed",
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

  // ── 3. ReportArtifact v2 装配 ──
  // Credits are charged per model call by the AI facade BillingContext. A
  // second mission-total charge here would double-bill platform-key users and
  // incorrectly charge personal BYOK users.
  let reportArtifact:
    | import("@/modules/ai-harness/facade").ReportArtifact
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
        // ★ per-dim chapter pipeline 产物（fullMarkdown 是 81K 字的"原料"，要传给 assembler）
        fullMarkdown: (r as { fullMarkdown?: string }).fullMarkdown,
        chapters: (
          r as {
            chapters?: {
              index: number;
              heading: string;
              body: string;
              wordCount: number;
            }[];
          }
        ).chapters,
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
        // ★ P1-C (2026-04-29): 优先用 analyst.themeSummary（已整合 reconciler）；
        // 若缺失再 fallback 到 writer 起草的 summary，避免报告头摘要与 plan/正文割裂
        themeSummary: analyst?.themeSummary || report.summary,
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

  // ★ P1-M (2026-04-29): reportAssembler 即使失败，reconciliation 的关键 warning 也要 emit 给前端
  // 否则 conflicts/gaps 信号永久丢失，leader signoff 无法据此判断
  if (!reportArtifact && reconciliationReport) {
    const conflicts =
      (reconciliationReport as { conflicts?: { resolutionType: string }[] })
        .conflicts ?? [];
    const unresolved = conflicts.filter(
      (c) => c.resolutionType === "flagged-unresolved",
    ).length;
    const gaps =
      (reconciliationReport as { gaps?: { severity: string }[] }).gaps ?? [];
    const criticalGaps = gaps.filter((g) => g.severity === "critical").length;
    if (unresolved > 0 || criticalGaps > 0) {
      await deps
        .emit({
          type: "agent-playground.reconciliation:warnings-orphaned",
          missionId,
          userId,
          payload: {
            unresolvedConflicts: unresolved,
            criticalGaps,
            note: "reportAssembler failed; reconciliation warnings emitted directly",
          },
        })
        .catch(() => {});
    }
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
      // ★ P1-NEW-C (round 2): 用 scaleScore 统一 0-100 + NaN clamp
      reportArtifact.quality.dimensions.factualConsistency = scaleScore(
        reportArtifact.quality.dimensions.factualConsistency,
        1 - drop,
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
      reportArtifact.quality.dimensions.coverage = scaleScore(
        reportArtifact.quality.dimensions.coverage,
        0.8,
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
      reportArtifact.quality.dimensions.coverage = scaleScore(
        reportArtifact.quality.dimensions.coverage,
        0.6,
      );
      reportArtifact.quality.warnings.push({
        dimension: "coverage",
        message: `${degradedDims}/${totalDims} 维度降级（无 findings）`,
      });
    }
  }
  if (reportArtifact && reviewScore > 0) {
    const reviewerSignal = clampScore(reviewScore);
    // ★ P1-NEW-C (round 2): blend 内部最终用 clampScore 兜底，防止累积 NaN/越界
    const blend = (cur: number, signal: number, w = 0.4): number =>
      clampScore(cur * (1 - w) + signal * w);
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
    reportArtifact.quality.overall = clampScore(
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

  // ★ 2026-04-30: reportArtifact 装配完成后 emit 一个 light 事件让 socket store 知道
  //   v2 artifact 已就绪。前端不接收 full artifact（避免 256K event cap），而是收到此事件
  //   后异步 re-fetch getMissionDetail 拿持久化好的 reportFull。
  //   注：此时 DB 还没写（S11 才写），但 ctx.reportArtifact 已就位。前端 listener 应等
  //   mission:completed（S11 emit）再 fetch，本事件只用于"能力切换"提示（Quality 闭环开始）。
  if (reportArtifact) {
    await deps
      .emit({
        type: "agent-playground.report:assembled",
        missionId,
        userId,
        payload: {
          version: 2,
          sectionsCount: reportArtifact.sections.length,
          citationsCount: reportArtifact.citations.length,
          figuresCount: reportArtifact.figures.length,
          fullMarkdownSize: reportArtifact.content.fullReportSize,
          qualityOverall: reportArtifact.quality.overall,
        },
      })
      .catch(() => {});
  }
}
