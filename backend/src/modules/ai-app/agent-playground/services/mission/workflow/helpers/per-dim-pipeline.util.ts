/**
 * Per-dimension chapter pipeline (TI-style)
 *
 * 每个 researcher 单 dim 跑完后的"扩写流水线"：outline → chapter 逐章 write+review
 * → integrate → 5-axis grade。在 thorough+ / standard 档位启用，minimal/quick 档位
 * 跳过（直接退化为 raw researcherOut）。
 *
 * 由 s3-researcher-dispatch.stage.ts 在每个 dim 完成后调用一次。
 *
 *   inputs:    per-dim args（missionId/userId/dim 信息 + researcherOut + billing + pool）
 *   returns:   增强后的 dim 结果（chapters[] + abstract + keyFindings + fullMarkdown + grade?）
 *   deps:      writer (planDimensionOutline), reviewer (judgeDimension),
 *              invoker (invoke for ChapterWriter/ChapterReviewer/DimensionIntegrator,
 *                       tickCost), emit, lifecycle
 *
 * Failure modes 全部就地降级：
 *   outline failed         → return researcherOut（跳过 chapter pipeline）
 *   chapter writer failed  → break 该 chapter（其它 chapter 继续）
 *   reviewer failed        → 当成 pass 处理（保留 draft，避免无法收敛）
 *   integrator failed      → return researcherOut（无 fullMarkdown 等增强字段）
 *   grade failed           → 不返回 grade，其它字段照常返回
 */

import { ChapterWriterAgent } from "../../../../agents/writer/chapter-writer.agent";
import { ChapterReviewerAgent } from "../../../../agents/writer/chapter-reviewer.agent";
import { DimensionIntegratorAgent } from "../../../../agents/writer/dimension-integrator.agent";
import type { MissionDeps } from "../mission-deps";
import type { BillingRuntimeEnvAdapter } from "../../../../../../ai-harness/facade";
import type { MissionBudgetPool } from "../../../../../../ai-harness/facade";
import { extractTokenSpend } from "./token-spend.util";
import { extractFailureMessage } from "./failure-extraction.util";

export interface PerDimPipelineArgs {
  missionId: string;
  userId: string;
  dimensionIdx: number;
  dimensionName: string;
  topic: string;
  language: "zh-CN" | "en-US";
  depth: "quick" | "standard" | "deep";
  pool: MissionBudgetPool;
  researcherOut: {
    dimension: string;
    findings: { claim: string; evidence: string; source: string }[];
    summary: string;
  };
  billing: BillingRuntimeEnvAdapter;
  budgetMultiplier: number;
}

export interface PerDimPipelineResult {
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

export async function runPerDimPipeline(
  args: PerDimPipelineArgs,
  deps: MissionDeps,
): Promise<PerDimPipelineResult> {
  const {
    missionId,
    userId,
    dimensionIdx,
    dimensionName,
    topic,
    language,
    depth,
    pool,
    researcherOut,
    billing,
    budgetMultiplier,
  } = args;

  const targetChapterCount = depth === "quick" ? 3 : depth === "deep" ? 7 : 5;
  const targetWordsPerChapter =
    depth === "quick" ? 600 : depth === "deep" ? 2500 : 1500;
  const dimAgentTag = `researcher#${dimensionIdx}`;

  if (researcherOut.findings.length === 0) return researcherOut;

  // ── 1. Outline ──
  const outlineAgentId = `outline#${dimensionIdx}`;
  await deps.lifecycle(
    missionId,
    userId,
    outlineAgentId,
    "outline",
    "started",
    {
      dimension: dimensionName,
    },
  );
  const outlineRes = await deps.writer.planDimensionOutline(
    {
      topic,
      dimension: dimensionName,
      language,
      dimensionSummary: researcherOut.summary,
      findings: researcherOut.findings,
      targetChapterCount,
    },
    {
      missionId,
      userId,
      agentId: outlineAgentId,
      role: "outline",
      envAdapter: billing,
    },
  );
  await deps.invoker.tickCost(
    missionId,
    userId,
    "researchers",
    pool,
    extractTokenSpend(outlineRes.events),
  );
  await deps.lifecycle(
    missionId,
    userId,
    outlineAgentId,
    "outline",
    outlineRes.state === "completed" ? "completed" : "failed",
    {
      dimension: dimensionName,
      wallTimeMs: outlineRes.wallTimeMs,
      error: extractFailureMessage(
        outlineRes.events,
        outlineRes.state,
        !!outlineRes.output,
        {
          iterations: outlineRes.iterations,
          wallTimeMs: outlineRes.wallTimeMs,
        },
      ),
    },
  );
  if (outlineRes.state !== "completed" || !outlineRes.output) {
    return researcherOut;
  }
  const outline = outlineRes.output as {
    chapters: {
      index: number;
      heading: string;
      thesis: string;
      keyPoints: string[];
      sourceIndices: number[];
    }[];
  };
  await deps.emit({
    type: "agent-playground.dimension:outline:planned",
    missionId,
    userId,
    agentId: dimAgentTag,
    payload: {
      dimension: dimensionName,
      chapterCount: outline.chapters.length,
      chapters: outline.chapters.map((c) => ({
        index: c.index,
        heading: c.heading,
        thesis: c.thesis,
      })),
    },
  });

  // ── 2. 逐章 write + review loop ──
  const writtenChapters: {
    index: number;
    heading: string;
    body: string;
    wordCount: number;
  }[] = [];
  const previousHeadings: string[] = [];
  const MAX_REVISION_ATTEMPTS = 2;
  const PASS_THRESHOLD = 75;

  for (const chapter of outline.chapters) {
    const chapterSources = chapter.sourceIndices
      .map((i) => researcherOut.findings[i])
      .filter((s): s is NonNullable<typeof s> => s != null);

    let attempt = 0;
    let lastDraft:
      | { body: string; wordCount: number; citationsUsed: string[] }
      | undefined;
    let lastCritique: string | undefined;

    while (attempt < MAX_REVISION_ATTEMPTS + 1) {
      attempt += 1;
      const writerAgentId = `chapter-writer#${dimensionIdx}.${chapter.index}.${attempt}`;
      await deps.emit({
        type: "agent-playground.chapter:writing:started",
        missionId,
        userId,
        agentId: writerAgentId,
        payload: {
          dimension: dimensionName,
          chapterIndex: chapter.index,
          heading: chapter.heading,
          attempt,
        },
      });
      const writerRes = await deps.invoker.invoke(
        ChapterWriterAgent,
        {
          topic,
          dimension: dimensionName,
          language,
          chapter: {
            index: chapter.index,
            heading: chapter.heading,
            thesis: chapter.thesis,
            keyPoints: chapter.keyPoints,
          },
          sources: chapterSources,
          targetWords: targetWordsPerChapter,
          previousChapterHeadings: previousHeadings,
          previousCritique: lastCritique,
          previousDraft: lastDraft?.body,
        },
        {
          missionId,
          userId,
          agentId: writerAgentId,
          role: "chapter-writer",
          envAdapter: billing,
          budgetMultiplier,
        },
      );
      await deps.invoker.tickCost(
        missionId,
        userId,
        "researchers",
        pool,
        extractTokenSpend(writerRes.events),
      );
      if (writerRes.state !== "completed" || !writerRes.output) {
        await deps.emit({
          type: "agent-playground.chapter:writing:completed",
          missionId,
          userId,
          agentId: writerAgentId,
          payload: {
            dimension: dimensionName,
            chapterIndex: chapter.index,
            attempt,
            state: "failed",
          },
        });
        break;
      }
      const draft = writerRes.output as {
        body: string;
        wordCount: number;
        citationsUsed: string[];
      };
      lastDraft = draft;
      await deps.emit({
        type: "agent-playground.chapter:writing:completed",
        missionId,
        userId,
        agentId: writerAgentId,
        payload: {
          dimension: dimensionName,
          chapterIndex: chapter.index,
          heading: chapter.heading,
          wordCount: draft.wordCount,
          attempt,
          state: "completed",
        },
      });

      // ── review ──
      const reviewerAgentId = `chapter-reviewer#${dimensionIdx}.${chapter.index}.${attempt}`;
      await deps.emit({
        type: "agent-playground.chapter:review:started",
        missionId,
        userId,
        agentId: reviewerAgentId,
        payload: {
          dimension: dimensionName,
          chapterIndex: chapter.index,
          attempt,
        },
      });
      const reviewerRes = await deps.invoker.invoke(
        ChapterReviewerAgent,
        {
          topic,
          dimension: dimensionName,
          language,
          chapter: {
            index: chapter.index,
            heading: chapter.heading,
            thesis: chapter.thesis,
            body: draft.body,
            wordCount: draft.wordCount,
            targetWords: targetWordsPerChapter,
          },
        },
        {
          missionId,
          userId,
          agentId: reviewerAgentId,
          role: "chapter-reviewer",
          envAdapter: billing,
          budgetMultiplier,
        },
      );
      await deps.invoker.tickCost(
        missionId,
        userId,
        "researchers",
        pool,
        extractTokenSpend(reviewerRes.events),
      );
      const verdict =
        reviewerRes.state === "completed" && reviewerRes.output
          ? (reviewerRes.output as {
              decision: "pass" | "revise";
              score: number;
              critique: string;
            })
          : {
              decision: "pass" as const,
              score: 60,
              critique: "(reviewer failed)",
            };
      await deps.emit({
        type: "agent-playground.chapter:review:completed",
        missionId,
        userId,
        agentId: reviewerAgentId,
        payload: {
          dimension: dimensionName,
          chapterIndex: chapter.index,
          attempt,
          decision: verdict.decision,
          score: verdict.score,
          critique: verdict.critique,
        },
      });

      if (
        verdict.decision === "pass" ||
        verdict.score >= PASS_THRESHOLD ||
        attempt >= MAX_REVISION_ATTEMPTS + 1
      ) {
        writtenChapters.push({
          index: chapter.index,
          heading: chapter.heading,
          body: draft.body,
          wordCount: draft.wordCount,
        });
        previousHeadings.push(chapter.heading);
        break;
      }

      lastCritique = verdict.critique;
      await deps.emit({
        type: "agent-playground.chapter:revision",
        missionId,
        userId,
        agentId: reviewerAgentId,
        payload: {
          dimension: dimensionName,
          chapterIndex: chapter.index,
          nextAttempt: attempt + 1,
          critique: verdict.critique,
        },
      });
    }
  }

  if (writtenChapters.length === 0) return researcherOut;

  // ── 3. Integrate ──
  const integratorAgentId = `integrator#${dimensionIdx}`;
  await deps.emit({
    type: "agent-playground.dimension:integrating:started",
    missionId,
    userId,
    agentId: integratorAgentId,
    payload: {
      dimension: dimensionName,
      chapterCount: writtenChapters.length,
    },
  });
  const integrateRes = await deps.invoker.invoke(
    DimensionIntegratorAgent,
    {
      topic,
      dimension: dimensionName,
      language,
      chapters: writtenChapters,
      dimensionSummary: researcherOut.summary,
    },
    {
      missionId,
      userId,
      agentId: integratorAgentId,
      role: "integrator",
      envAdapter: billing,
    },
  );
  await deps.invoker.tickCost(
    missionId,
    userId,
    "researchers",
    pool,
    extractTokenSpend(integrateRes.events),
  );

  let abstract: string | undefined;
  let keyFindings: string[] | undefined;
  let fullMarkdown: string | undefined;
  if (integrateRes.state === "completed" && integrateRes.output) {
    const integrated = integrateRes.output as {
      abstract: string;
      keyFindings: string[];
      fullMarkdown: string;
      totalWordCount: number;
    };
    abstract = integrated.abstract;
    keyFindings = integrated.keyFindings;
    fullMarkdown = integrated.fullMarkdown;
    await deps.emit({
      type: "agent-playground.dimension:integrating:completed",
      missionId,
      userId,
      agentId: integratorAgentId,
      payload: {
        dimension: dimensionName,
        totalWordCount: integrated.totalWordCount,
        chapterCount: writtenChapters.length,
      },
    });
  }

  // ── 4. 5-axis grade ──
  const gradeAgentId = `quality-judge#${dimensionIdx}`;
  let grade: PerDimPipelineResult["grade"];
  if (fullMarkdown && abstract) {
    const sources = researcherOut.findings.map((f) => ({ url: f.source }));
    const gradeRes = await deps.reviewer.judgeDimension(
      {
        topic,
        dimension: dimensionName,
        language,
        abstract,
        fullMarkdown,
        totalWordCount: writtenChapters.reduce((s, c) => s + c.wordCount, 0),
        sources,
      },
      {
        missionId,
        userId,
        agentId: gradeAgentId,
        role: "quality-judge",
        envAdapter: billing,
        budgetMultiplier,
      },
    );
    await deps.invoker.tickCost(
      missionId,
      userId,
      "researchers",
      pool,
      extractTokenSpend(gradeRes.events),
    );
    if (gradeRes.state === "completed" && gradeRes.output) {
      const g = gradeRes.output as NonNullable<PerDimPipelineResult["grade"]>;
      grade = g;
      await deps.emit({
        type: "agent-playground.dimension:graded",
        missionId,
        userId,
        agentId: gradeAgentId,
        payload: {
          dimension: dimensionName,
          overall: g.overall,
          grade: g.grade,
          axes: g.axes,
          summary: g.summary,
        },
      });
    }
  }

  return {
    ...researcherOut,
    chapters: writtenChapters,
    abstract,
    keyFindings,
    fullMarkdown,
    grade,
  };
}
