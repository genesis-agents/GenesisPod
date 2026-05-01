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
import { extractTokenSpend } from "@/modules/ai-harness/governance/observability/token-spend.util";
import { extractFailureMessage } from "@/modules/ai-harness/governance/observability/failure-extraction.util";
import { narrate } from "./narrative.util";
// ★ 沉淀（2026-04-29）: chapter 局部 [1][2] → dim 全局编号重映射，避免拼接后冲突
import { restoreGlobalIndices } from "../../../../../../ai-engine/facade";
// ★ 沉淀 v2: 内容缺陷扫描（纯函数 utility，0 LLM）—— chapter draft 格式缺陷指标
import { scanContentDefects } from "../../../../../../ai-harness/facade";
// ★ 沉淀 v4: LLM 输出白名单清理（"铁墙函数"，13 个正交修复）
import { sanitizeSectionOutput } from "../../../../../../ai-engine/facade";

export interface PerDimPipelineArgs {
  missionId: string;
  userId: string;
  dimensionIdx: number;
  dimensionName: string;
  topic: string;
  language: "zh-CN" | "en-US";
  depth: "quick" | "standard" | "deep";
  /** 章节字数规格（lengthProfile 决定每节字数 + 章节数） */
  lengthProfile?: "brief" | "standard" | "deep" | "extended" | "epic" | "mega";
  /** mission 总维度数 —— 让本 dim 按 missionTarget / dimCount 推算字数 */
  dimensionCount?: number;
  pool: MissionBudgetPool;
  researcherOut: {
    dimension: string;
    findings: { claim: string; evidence: string; source: string }[];
    summary: string;
  };
  billing: BillingRuntimeEnvAdapter;
  budgetMultiplier: number;
  /**
   * ★ 2026-04-30 REDESIGN (task #61): retry 双路径 pipeline 索引
   * undefined → 原始 pipeline，dim name 索引（首次 S3 / reuse-recompute 就地更新）
   * "leader-assess-retry" / "leader-assess-replace" → fresh-collect retry，dim:retryLabel 索引
   * 前端 derive.ts 用此值组装 pipelineKey 索引 dimensionPipelines map
   */
  retryLabel?: string;
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

  const lp = args.lengthProfile;
  const dimCount = Math.max(1, args.dimensionCount ?? 5);
  // ★ Iter 2c + epic/mega: 按 mission target 总字数 / 维度数 推算每个 dim 字数
  //   brief    → 3K /dim    standard → 8K /dim    deep   → 15K /dim
  //   extended → 25K /dim   epic     → 80K /dim   mega   → 200K /dim
  //   再按"目标 6-15 章/dim"反推每章字数（cap 在 chapter-writer maxTokens 范围内）
  const missionTarget = !lp
    ? depth === "quick"
      ? 3000
      : depth === "deep"
        ? 15000
        : 8000
    : lp === "brief"
      ? 3000
      : lp === "standard"
        ? 8000
        : lp === "deep"
          ? 15000
          : lp === "extended"
            ? 25000
            : lp === "epic"
              ? 80000
              : 200000; // mega
  const dimTargetWords = Math.round(missionTarget / dimCount);

  // 每章字数 cap 在 [400, 25000]，先按"理想 6 章/dim"推
  const idealChapters = lp === "brief" ? 3 : lp === "standard" ? 5 : 8;
  const naivePerChapter = Math.round(dimTargetWords / idealChapters);
  const targetWordsPerChapter = Math.max(400, Math.min(naivePerChapter, 8000));
  // 章节数 = dim 字数 / 每章字数（保持 ≥3 ≤ 25 章）
  const targetChapterCount = Math.max(
    3,
    Math.min(25, Math.round(dimTargetWords / targetWordsPerChapter)),
  );
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
  // ★ degraded 也算"有产出"（reflexion verifier 评分略低于阈值但 outputSchema 合法）
  const outlineUsable =
    (outlineRes.state === "completed" || outlineRes.state === "degraded") &&
    !!outlineRes.output;
  if (!outlineUsable) {
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
  // ★ Round 3 真问题修复 (2026-04-29):
  //   原 MAX=2 (最多 1+2=3 attempts)。配合 outputLength=long 截断，2 次 revise 不够把字数补回。
  //   chapter-writer 已升到 outputLength=extended (16K maxTokens)，再加 1 次 revise 机会
  //   让"prompt 强化扩写 + 模型有空间输出"组合发挥效果。
  //   预期：用户实测 25K 实际 5K (20%) → 期望提升到 ≥ 60%。
  const MAX_REVISION_ATTEMPTS = 3;
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
    // ★ P1-R4-A (round 4): reviewer 连续失败计数，避免 reviewer 持续故障让 writer
    // 反复重试导致 token 倍增（round 3 改 fallback 为 revise 引入的副作用）
    let consecutiveReviewerFailures = 0;
    const MAX_REVIEWER_FAILURES = 2;

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
      // ★ degraded 也算"有产出"——chapter body 完整、只是 verifier 评分偏低，
      // 仍然能进 reviewer 路径继续被打磨（章节质量靠 reviewer 闭环兜底）
      const writerUsable =
        (writerRes.state === "completed" || writerRes.state === "degraded") &&
        !!writerRes.output;
      if (!writerUsable) {
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
      const rawDraft = writerRes.output as {
        body: string;
        wordCount: number;
        citationsUsed: string[];
      };
      // ★ 沉淀 v4 接入: sanitizeSectionOutput 白名单清理 LLM 输出
      //   去掉非内容行（编辑备注 / 字数统计 / 元注释 / 营销空话等）
      const cleanedBody = sanitizeSectionOutput(rawDraft.body);
      const draft = { ...rawDraft, body: cleanedBody };
      lastDraft = draft;
      // ★ 沉淀 v2 接入: defect-scanner 在 chapter 完成时扫描格式缺陷，emit 给前端可见
      const defects = scanContentDefects(draft.body);
      const totalDefects =
        defects.bareLatexCount +
        defects.brokenDollarNesting +
        defects.unwrappedEnvironments +
        defects.pseudoCodeLines +
        defects.leakedMetaNotes +
        defects.leakedFigureNotes +
        defects.longListItems +
        defects.trappedConclusions;
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
          targetWords: targetWordsPerChapter,
          attempt,
          state: "completed",
          // 沉淀 v2: 缺陷指标（0 = 干净，> 0 = 有格式问题）
          defectScan:
            totalDefects > 0 ? { total: totalDefects, ...defects } : undefined,
        },
      });
      // ★ BUG-D: 章节级 narrative，让前端时间线不再静默
      await narrate(deps.emit, missionId, userId, {
        stage: "s3-researchers",
        role: "writer",
        tag: "info",
        text: `${dimensionName} · §${chapter.index} ${chapter.heading.slice(0, 30)} 撰写完成（${draft.wordCount} 字${attempt > 1 ? `，第 ${attempt} 轮` : ""}）`,
        agentId: writerAgentId,
        dimension: dimensionName,
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
      type ReviewIssue = {
        severity: "must-fix" | "should-fix" | "nice-to-have";
        dimension:
          | "evidence"
          | "logic"
          | "structure"
          | "citation"
          | "length"
          | "style";
        pointer: string;
        issue: string;
        suggestion: string;
      };
      const verdict =
        reviewerRes.state === "completed" && reviewerRes.output
          ? (reviewerRes.output as {
              decision: "pass" | "revise";
              score: number;
              summary?: string;
              issues?: ReviewIssue[];
              critique?: string;
            })
          : {
              // ★ P0-R3-1 (round 3): reviewer 失败时不能伪装 pass —— score 40 (<PASS_THRESHOLD=75)
              // + decision="revise" 让章节进入 retry 路径，避免章节质量信号被静默篡改
              decision: "revise" as const,
              score: 40,
              summary: "(reviewer failed)",
              issues: [],
              critique: "(reviewer failed)",
            };
      // ★ degraded 也算成功：reviewer 是 simple-loop 但保险接受
      const isReviewerFallback =
        (reviewerRes.state !== "completed" &&
          reviewerRes.state !== "degraded") ||
        !reviewerRes.output;
      // ★ P1-R4-A (round 4): cap reviewer 连续失败次数，超过则放弃重试避免 token 爆炸
      if (isReviewerFallback) {
        consecutiveReviewerFailures += 1;
      } else {
        consecutiveReviewerFailures = 0;
      }
      const reviewerExhausted =
        consecutiveReviewerFailures >= MAX_REVIEWER_FAILURES;
      // 兼容旧 critique 文本：若 LLM 没出 issues，把 critique 字符串当 1 条 issue
      const issues: ReviewIssue[] =
        verdict.issues && verdict.issues.length > 0
          ? verdict.issues
          : verdict.critique
            ? [
                {
                  severity:
                    verdict.decision === "revise" ? "must-fix" : "nice-to-have",
                  dimension: "structure",
                  pointer: "整章",
                  issue: verdict.critique.slice(0, 200),
                  suggestion: "见 issue 描述",
                },
              ]
            : [];
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
          summary: verdict.summary,
          issues,
          // 兼容字段：critique 仍 emit 让旧前端能展示
          critique: verdict.critique ?? verdict.summary,
        },
      });
      // ★ BUG-D: 章节复审 narrative
      // ★ P0-R3-1 (round 3): reviewer fallback 标 warning 让前端能感知"reviewer 故障 ≠ 通过"
      await narrate(deps.emit, missionId, userId, {
        stage: "s3-researchers",
        role: "reviewer",
        tag: isReviewerFallback
          ? "warning"
          : verdict.decision === "pass"
            ? "success"
            : verdict.score < 60
              ? "warning"
              : "info",
        text: isReviewerFallback
          ? `${dimensionName} · §${chapter.index} 复审失败，按 revise 处理`
          : `${dimensionName} · §${chapter.index} 复审 ${verdict.decision === "pass" ? "通过" : "需重写"}（${verdict.score}/100${attempt > 1 ? `，第 ${attempt} 轮` : ""}）`,
        agentId: reviewerAgentId,
        dimension: dimensionName,
      });

      // ★ 字数硬门槛：实际产出 < target × 70% 时强制 revise（即使 reviewer 给 pass）
      //   原因：观测到 extended (25K) mission 实际只产 5K 字（20%）—— reviewer 评分 ≥ PASS_THRESHOLD
      //   但字数严重不达标。LLM 默认惜字如金，必须显式 retry 才能逼出长文。
      //   ★ P0-R4-4 (round 4 真修): round 2 commit message 写了但 git add 漏文件，
      //   实际仍是 `< MAX+1`。改为 `< MAX` 让最后一轮（attempt=MAX）真正放行，
      //   避免最后一次 revise 是哑炮。
      const isLengthFail =
        draft.wordCount < Math.round(targetWordsPerChapter * 0.7) &&
        attempt < MAX_REVISION_ATTEMPTS;

      if (
        !isLengthFail &&
        (verdict.decision === "pass" ||
          verdict.score >= PASS_THRESHOLD ||
          attempt >= MAX_REVISION_ATTEMPTS + 1 ||
          // ★ P1-R4-A (round 4): reviewer 连续故障超 MAX_REVIEWER_FAILURES，
          // 不再重试，按当前 draft 落地避免 token 倍增
          reviewerExhausted)
      ) {
        // ★ 沉淀接入: chapter 局部 [1][2] → dim 全局编号重映射
        //   chapter.sourceIndices 是 outline 阶段每章可引用的 dim findings 索引（0-based）。
        //   chapter body 用 [1][2][N] 指 chapterSources[0][1][N-1] = findings[sourceIndices[N-1]]。
        //   这里直接还原成 dim 全局 [N+1]（1-based），让多章拼接后编号不冲突。
        const localToGlobal = new Map<number, number>();
        chapter.sourceIndices.forEach((globalIdx, localIdx) => {
          localToGlobal.set(localIdx + 1, globalIdx + 1);
        });
        const remappedBody = restoreGlobalIndices(draft.body, localToGlobal);
        writtenChapters.push({
          index: chapter.index,
          heading: chapter.heading,
          body: remappedBody,
          wordCount: draft.wordCount,
        });
        previousHeadings.push(chapter.heading);
        break;
      }

      // 字数 fail 时 critique 必须显式说出来，让下一轮 writer 知道扩写
      const lengthCritiquePrefix = isLengthFail
        ? `[字数严重不足] 上轮仅 ${draft.wordCount} 字（目标 ${targetWordsPerChapter} 字，仅 ${Math.round((draft.wordCount / targetWordsPerChapter) * 100)}%）。必须把章节扩到至少 ${Math.round(targetWordsPerChapter * 0.85)} 字：增加分析段落、补充案例数据、深化推理、加引用。不要重复已有内容。\n\n`
        : "";
      // ★ P1-R4-C (round 4): critique 长度上限 2000 字，防多 attempt 累积爆 prompt
      const MAX_CRITIQUE_CHARS = 2000;
      lastCritique = (
        lengthCritiquePrefix + (verdict.critique ?? verdict.summary ?? "")
      ).slice(0, MAX_CRITIQUE_CHARS);
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
  } else {
    // ★ P1-R4-B (round 4): integrator 失败必须 emit failed 让前端切到错误态
    await deps.emit({
      type: "agent-playground.dimension:integrating:failed",
      missionId,
      userId,
      agentId: integratorAgentId,
      payload: {
        dimension: dimensionName,
        state: integrateRes.state,
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
          // ★ 2026-04-30 REDESIGN (task #61): retryLabel 让前端区分原 dim grade vs retry 独立 grade
          retryLabel: args.retryLabel,
        },
      });
      // ★ BUG-D: 维度评分 narrative
      await narrate(deps.emit, missionId, userId, {
        stage: "s3-researchers",
        role: "reviewer",
        tag: g.overall >= 80 ? "success" : g.overall >= 60 ? "info" : "warning",
        text: `${dimensionName} · 5 轴评分出炉 ${g.overall}/100（${g.grade}）`,
        agentId: gradeAgentId,
        dimension: dimensionName,
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
