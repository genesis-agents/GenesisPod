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
 * Failure modes：
 *   outline failed         → return researcherOut（跳过 chapter pipeline）
 *   chapter writer failed  → 该 dim 失败（不再接受“部分章节成功”）
 *   reviewer failed        → 当成 revise / fallback 处理，但最终正文仍需通过完整性校验
 *   integrator failed      → 用代码 stitched fullMarkdown 兜底，但仍强校验章节完整性
 *   grade failed           → 不返回 grade，其它字段照常返回
 */

import pLimit from "p-limit";
import { ChapterWriterAgent } from "../../../agents/writer/chapter-writer.agent";
import { ChapterReviewerAgent } from "../../../agents/writer/chapter-reviewer.agent";
import { DimensionIntegratorAgent } from "../../../agents/writer/dimension-integrator.agent";
import type { MissionDeps } from "./mission-deps";
import type { BillingRuntimeEnvAdapter } from "@/modules/ai-harness/facade";
import type { MissionBudgetPool } from "@/modules/ai-harness/facade";
import { extractTokenSpend } from "@/modules/ai-harness/facade";
import { extractFailureMessage } from "@/modules/ai-harness/facade";
import {
  REVIEW_PASS_THRESHOLD,
  CHAPTER_MAX_REVISION_ATTEMPTS,
} from "@/modules/ai-harness/facade";
import { narrate } from "./narrative.util";
// ★ 2026-05-04 (PR-6 standardize playground): jaccardSimilarity 已下沉 engine/content
import { jaccardSimilarity } from "@/modules/ai-harness/facade";
// ★ 沉淀（2026-04-29）: chapter 局部 [1][2] → dim 全局编号重映射，避免拼接后冲突
import { restoreGlobalIndices } from "@/modules/ai-harness/facade";
// ★ 沉淀 v2: 内容缺陷扫描（纯函数 utility，0 LLM）—— chapter draft 格式缺陷指标
import { scanContentDefects } from "@/modules/ai-harness/facade";
// ★ 沉淀 v4: LLM 输出白名单清理（"铁墙函数"，13 个正交修复）
import { sanitizeSectionOutput } from "@/modules/ai-harness/facade";
// ★ G 三道清理管线 (2026-05-06): TI 同款 chart JSON / Figure refs / bare JSON 剥除
import { stripChartJsonFromContent } from "@/modules/ai-app/topic-insights/utils/strip-chart-json.utils";

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
    /**
     * ★ 2026-05-07 图文匹配（学 TI Stage 4-5 figure registry）：
     * researcher 抽到的候选图列表（s3 stage 通过 figureExtractor + figureRelevance
     * embedding 过滤后的高相关度图）。chapter-writer 收到后可在合适段落后内联
     * 引用 `![caption](#FIG-N)` 占位符；reportAssembler 兜底也会在每章末尾追加。
     */
    figureCandidates?: {
      sourceUrl: string;
      imageUrl?: string;
      caption: string;
      sourcePageOrSection?: string;
      relevanceHint?: "high" | "medium" | "low";
    }[];
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
    /** true = chapter went through the pipeline and was persisted */
    finalized?: boolean;
    /** true = reviewer gave pass (or score >= PASS_THRESHOLD); false = fallback landing */
    qualified?: boolean;
    decision?: "passed" | "fallback-length" | "fallback-exhausted";
    finalScore?: number;
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

const MIN_CHAPTER_SUBSTANTIVE_CHARS = 60;

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
  // ★ 2026-05-07 洞察类型 v1（用户对齐）：depth 单轴决定规模，lengthProfile 已废弃
  //   quick    : 3-5 维   × 2-3 章/维   × 800-1500 字  ≈ 5K-22K   总
  //   standard : 5-8 维   × 3-5 章/维   × 1200-2000 字 ≈ 18K-80K  总
  //   deep     : 10-12 维 × 6-8 章/维   × 1500-2500 字 ≈ 90K-240K 总（用户期望 12-15万）
  //   lengthProfile 老字段仍接受但**优先用 depth**（dual-write 期向后兼容，新逻辑只读 depth）
  const missionTarget =
    depth === "quick" ? 10000 : depth === "deep" ? 150000 : 40000;
  const dimTargetWords = Math.round(missionTarget / dimCount);

  // ★ idealChapters 改为 depth-based（中位）：quick=2 / standard=4 / deep=7
  //   per-dim 章数 = dimTargetWords / idealPerChapter，保持 ≥3 ≤ 25 章
  //   lp 若仍传入只用作 legacy fallback（最终行为以 depth 为准）
  const idealChapters = depth === "quick" ? 2 : depth === "deep" ? 7 : 4;
  const naivePerChapter = Math.round(dimTargetWords / idealChapters);
  // 单章字数物理上限保留 8000（chapter-writer maxTokens=22K 对应约 10K 中文字 buffer）
  const targetWordsPerChapter = Math.max(400, Math.min(naivePerChapter, 8000));
  // 章节数 = dim 字数 / 每章字数（保持 ≥3 ≤ 25 章）
  const targetChapterCount = Math.max(
    3,
    Math.min(25, Math.round(dimTargetWords / targetWordsPerChapter)),
  );
  // lengthProfile 仍读以保 chapter-writer prompt 内部细节（老 PROFILE_WORD_RANGES key）
  // 但运行时分支默认走 depth-driven 数值；lp 仅在 line ~692 透传给 chapter-writer 用
  const dimAgentTag = `researcher#${dimensionIdx}`;

  // ★ 2026-05-01 INVARIANT: 每个 dim 必发一次 dimension:graded 终态事件，杜绝
  //   静默黑洞（mission da6e2af7 实证 5/8 dim 卡"等待评分"的真因）。
  //   helper 提到函数顶部 + 外层 try/catch/finally → 100% 路径闭合（含早返回）。
  const gradeAgentId = `quality-judge#${dimensionIdx}`;
  let terminalEmitted = false;
  const emitGraded = async (
    payload:
      | { ok: true; g: NonNullable<PerDimPipelineResult["grade"]> }
      | {
          ok: false;
          summary: string;
          failed: true;
          skipped?: boolean;
          phase?:
            | "no-findings"
            | "outline-failed"
            | "no-chapters"
            | "integrator-failed"
            | "integrator-exception"
            | "grade-failed"
            | "grade-exception"
            | "pipeline-exception"
            | "fallback-finally";
        },
  ): Promise<void> => {
    if (terminalEmitted) return;
    terminalEmitted = true;
    // ★ 2026-05-01 深度仿真发现：emit 失败时 terminalEmitted 已被设 true，无法
    //   重发；应吞 emit 异常 + log，避免事件总线短暂故障让 finally 兜底也失效。
    //   保留 terminalEmitted=true（已"尝试过"），下次 mission 重启或重 derive
    //   会拉取持久化事件，本次失败留 telemetry 即可。
    try {
      if (payload.ok) {
        const g = payload.g;
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
            retryLabel: args.retryLabel,
          },
        });
        await narrate(deps.emit, missionId, userId, {
          stage: "s3-researchers",
          role: "reviewer",
          tag:
            g.overall >= 80 ? "success" : g.overall >= 60 ? "info" : "warning",
          text: `${dimensionName} · 5 轴评分出炉 ${g.overall}/100（${g.grade}）`,
          agentId: gradeAgentId,
          dimension: dimensionName,
        });
      } else {
        await deps.emit({
          type: "agent-playground.dimension:graded",
          missionId,
          userId,
          agentId: gradeAgentId,
          payload: {
            dimension: dimensionName,
            overall: 0,
            grade: "F",
            axes: {},
            summary: payload.summary,
            retryLabel: args.retryLabel,
            failed: true,
            skipped: payload.skipped ?? false,
            phase: payload.phase,
          },
        });
      }
    } catch (emitErr) {
      const msg = emitErr instanceof Error ? emitErr.message : String(emitErr);
      // 不向外抛——避免 finally 兜底也失效。事件丢失留 telemetry。
      // eslint-disable-next-line no-console
      console.warn(
        `[per-dim-pipeline ${dimensionName}] emitGraded failed (event lost): ${msg}`,
      );
    }
  };

  let abstract: string | undefined;
  let keyFindings: string[] | undefined;
  let fullMarkdown: string | undefined;
  let grade: PerDimPipelineResult["grade"];
  let writtenChaptersResult: NonNullable<PerDimPipelineResult["chapters"]> = [];

  try {
    if (researcherOut.findings.length === 0) {
      await emitGraded({
        ok: false,
        failed: true,
        skipped: true,
        phase: "no-findings",
        summary: `${dimensionName} · researcher 未采集到 finding，跳过 chapter pipeline`,
      });
      return researcherOut;
    }

    // ★ P0-D 完整版 (2026-05-06): rerun cache hit — 检查 chapter_drafts 表是否
    //   已有该 dim 的合格 chapter（dispatcher.hydrateInheritedChapterDrafts 在
    //   rerun incremental 模式启动时已复制源 mission 的 chapter 到新 mission）。
    //   命中 → 跳过 outline + chapter writing + reviewer 全部 LLM 调用，直接 emit
    //   合成 dimension:outline:planned + chapter:done 事件让前端 todo-ledger 推进，
    //   返回 cached chapters 让 integrator 直接组装。节省 ~10-15min/mission。
    // 防御 deps.store 缺失（spec mock 简化场景）：缺失即跳过 cache 检查
    const cachedDrafts = deps.store?.loadQualifiedChapterDrafts
      ? await deps.store
          .loadQualifiedChapterDrafts(missionId)
          .catch(
            () =>
              [] as Awaited<
                ReturnType<typeof deps.store.loadQualifiedChapterDrafts>
              >,
          )
      : [];
    const dimCached = cachedDrafts.filter((d) => d.dimension === dimensionName);
    if (dimCached.length >= 1) {
      // 按 chapterIndex 排序后逐一 emit 合成事件
      dimCached.sort((a, b) => a.chapterIndex - b.chapterIndex);
      const synthesizedChapters = dimCached.map((d) => ({
        index: d.chapterIndex,
        heading: d.heading,
        body: d.content,
        wordCount: d.wordCount ?? 0,
        finalized: true,
        qualified: true,
        decision: "passed" as const,
        finalScore: d.score ?? 80,
      }));

      // ★ 业务链修5 (2026-05-06): cache hit 时同步连续 emit 让前端"瞬移"，
      //   用户感受不到任务并行节奏。加 sleep 让每章节 emit 之间有 ~80ms 间隔，
      //   让 7 dim 并行 cache hit 在 ~1-2s 内有节奏完成（dim 之间仍是真并行
      //   因为 runPerDimPipeline 在 invoker.runWithConcurrency 里跑）。
      const SYNTH_EMIT_INTERVAL_MS = 80;
      const sleep = (ms: number): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, ms));

      // emit dimension:outline:planned 让前端 derive 知道章节列表
      await deps
        .emit({
          type: "agent-playground.dimension:outline:planned",
          missionId,
          userId,
          payload: {
            dimension: dimensionName,
            chapters: dimCached.map((d) => ({
              index: d.chapterIndex,
              heading: d.heading,
              thesis: d.thesis,
            })),
            fromCache: true,
          },
        })
        .catch(() => undefined);
      await sleep(SYNTH_EMIT_INTERVAL_MS);

      // 逐章 emit 合成 chapter:writing:started → chapter:writing:completed →
      //   chapter:review:completed → chapter:done（让前端 derive.ts 走完
      //   完整章节状态机：writing → reviewing → passed → done）
      for (const c of synthesizedChapters) {
        // writing:started
        await deps
          .emit({
            type: "agent-playground.chapter:writing:started",
            missionId,
            userId,
            payload: {
              dimension: dimensionName,
              chapterIndex: c.index,
              attempt: 1,
              fromCache: true,
            },
          })
          .catch(() => undefined);
        await sleep(SYNTH_EMIT_INTERVAL_MS);
        // writing:completed
        await deps
          .emit({
            type: "agent-playground.chapter:writing:completed",
            missionId,
            userId,
            payload: {
              dimension: dimensionName,
              chapterIndex: c.index,
              wordCount: c.wordCount,
              fromCache: true,
            },
          })
          .catch(() => undefined);
        await sleep(SYNTH_EMIT_INTERVAL_MS);
        // review:completed (pass)
        await deps
          .emit({
            type: "agent-playground.chapter:review:completed",
            missionId,
            userId,
            payload: {
              dimension: dimensionName,
              chapterIndex: c.index,
              decision: "pass",
              score: c.finalScore,
              fromCache: true,
            },
          })
          .catch(() => undefined);
        await sleep(SYNTH_EMIT_INTERVAL_MS);
        // chapter:done
        await deps
          .emit({
            type: "agent-playground.chapter:done",
            missionId,
            userId,
            payload: {
              dimension: dimensionName,
              chapterIndex: c.index,
              finalAttempt: 1,
              decision: "passed",
              finalScore: c.finalScore,
              wordCount: c.wordCount,
              finalized: true,
              qualified: true,
              fromCache: true,
            },
          })
          .catch(() => undefined);
        await sleep(SYNTH_EMIT_INTERVAL_MS);
      }

      // narrative 提示用户
      await narrate(deps.emit, missionId, userId, {
        stage: "s3-researchers",
        role: "writer",
        tag: "success",
        text: `${dimensionName} · 复用上次 mission 的 ${synthesizedChapters.length} 个章节（cache hit），跳过 outline + writing + reviewer`,
        agentId: `chapter-cache#${dimensionIdx}`,
        dimension: dimensionName,
      });

      // 直接拼接 cached chapter bodies 作为 fullMarkdown（跳过 integrator LLM）
      // ★ 2026-05-07 编号修复：章节用 H3 (### )，不用 H2。
      //   原因：reportAssembler 的 formatDimensionContent → sanitizeHeadingLevels
      //   会把所有 H2 strip 掉（#{1,2} 被 strip），导致章节标题彻底消失。
      //   H3 会被 numberSubHeadings 自动编号为 "### N.M. 标题"。
      const fullMarkdownFromCache = synthesizedChapters
        .map((c) => `### ${c.heading}\n\n${c.body}`)
        .join("\n\n");
      const totalWordCount = synthesizedChapters.reduce(
        (s, c) => s + c.wordCount,
        0,
      );
      // emit dimension:integrating:completed 让前端 derive 知道 integrator 完成
      await deps
        .emit({
          type: "agent-playground.dimension:integrating:completed",
          missionId,
          userId,
          payload: {
            dimension: dimensionName,
            totalWordCount,
            fromCache: true,
          },
        })
        .catch(() => undefined);
      // emit dimension:graded 假分（80）让前端 dim todo 状态切到 done
      await emitGraded({
        ok: true,
        g: {
          overall: 80,
          grade: "B",
          axes: {},
          summary: `${dimensionName} · cache hit（${synthesizedChapters.length} 章复用），跳过 outline/writing/reviewer/integrator/grade`,
        },
      });
      void totalWordCount;
      return {
        ...researcherOut,
        chapters: synthesizedChapters,
        fullMarkdown: fullMarkdownFromCache,
        grade: {
          overall: 80,
          grade: "B",
          axes: {},
          summary: `cache hit（复用上次 mission 的 ${synthesizedChapters.length} 章）`,
        },
      };
    }

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
      await emitGraded({
        ok: false,
        failed: true,
        skipped: true,
        phase: "outline-failed",
        summary: `${dimensionName} · outline 未产出（state=${outlineRes.state}），跳过 chapter pipeline`,
      });
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
    await deps
      .emit({
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
      })
      .catch((err: unknown) => {
        deps.log.warn(
          `[${missionId}] emit dimension:outline:planned for "${dimensionName}" failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    // ★ 2026-05-01 治 chapter status 卡 pending 真因：
    //   prod 实测（mission 8a55cc93）outline:planned 与并发 chapter writer 的
    //   chapter:writing:started 事件 timestamp 同毫秒 race，DB INSERT 顺序不保证。
    //   前端按 created_at 排序拿到 writing:started 在 outline:planned 之前 →
    //   ensurePipeline 建空 chapters → find by idx 失败 → status 永不更新。
    //   sleep 2ms 让 outline:planned 时间戳严格小于后续 chapter writer 启动时间，
    //   保证前端 derive.ts replay 时 outline 先 init chapters[]，再被 writing:started 命中。
    await new Promise<void>((resolve) => setTimeout(resolve, 2));

    // ── 2. 章节 write + review loop（并发 2 章同时写）──
    //
    // ★ 加速杠杆 2 (2026-05-01): 把逐章串行改为 pLimit(2) 并发执行。
    //   并发策略：
    //   - CHAPTER_CONCURRENCY=2：2 章同时写，平衡速度与 LLM rate-limit。
    //   - previousHeadings 在并发前 snapshot，所有并发 chapter 共用同一份前序
    //     快照（每批任务启动前取当时已完成章节的 headings），避免 race condition。
    //   - 单章失败隔离：try-catch 包裹整个 chapter pipeline，失败章节跳过不阻塞其他。
    //   - 输出顺序：Promise.allSettled 全完成后按 chapter.index 排序再 push。
    //   - integrator 阶段仍然串行（需要所有 chapter 的最终内容）。
    const CHAPTER_CONCURRENCY = 2;

    // ★ RTK 风格优化：dim 层 finding 去重，避免同一 finding 在多 chapter prompt 中重复全文嵌入
    //   策略：按 chapter.index 升序预先遍历，决定每个 finding 的"首发章节"。
    //   首次出现 → 全文给 writer（含 evidence/content）；后续出现 → 仅给 brief（title/url/claim 保留）。
    //   预计算在 pLimit 启动前完成，避免并发下的 race condition（每章查表而非写表）。
    const firstUseByChapter = new Map<number, Set<number>>(); // chapterIdx → 首发 finding globalIdx Set
    {
      const allSeen = new Set<number>();
      for (const chapter of [...outline.chapters].sort(
        (a, b) => a.index - b.index,
      )) {
        const firstUse = new Set<number>();
        for (const globalIdx of chapter.sourceIndices) {
          if (!allSeen.has(globalIdx)) {
            firstUse.add(globalIdx);
            allSeen.add(globalIdx);
          }
        }
        firstUseByChapter.set(chapter.index, firstUse);
      }
    }

    // ★ Round 3 真问题修复 (2026-04-29):
    //   原 MAX=2 (最多 1+2=3 attempts)。配合 outputLength=long 截断，2 次 revise 不够把字数补回。
    //   chapter-writer 已升到 outputLength=extended (16K maxTokens)，再加 1 次 revise 机会
    //   让"prompt 强化扩写 + 模型有空间输出"组合发挥效果。
    //   预期：用户实测 25K 实际 5K (20%) → 期望提升到 ≥ 60%。
    // ★ 2026-05-01 (PR-G iter8): 走 ai-harness 集中阈值常量，避免 3 处硬编码漂移。
    //   mission 165c967f 70+min 死锁真因是 per-dim PASS=75 + reviewer 实测 66-68 →
    //   永远 revise → 4 hours/mission。详见 quality-thresholds.constants.ts 注释。
    const MAX_REVISION_ATTEMPTS = CHAPTER_MAX_REVISION_ATTEMPTS;
    const PASS_THRESHOLD = REVIEW_PASS_THRESHOLD;
    // ★ L1-1: stuck-revision 防循环
    //   revision 完后 Jaccard(prev, new) > 0.9 视为无进展，连续 2 次即强制 finalize
    const STUCK_SIMILARITY_THRESHOLD = 0.9;
    const MAX_STUCK_COUNT = 2;

    type WrittenChapter = {
      index: number;
      heading: string;
      body: string;
      wordCount: number;
      finalized: boolean;
      qualified: boolean;
      decision: "passed" | "fallback-length" | "fallback-exhausted";
      finalScore: number;
      /**
       * ★ 2026-05-07 P1 图文匹配闭环（学 TI section.figureReferences）：
       * LLM 决定本章引用哪些图（按 figureId）+ 段落锚点。
       * reportAssembler 据此关联到具体 sectionId 落地为 ArtifactFigure。
       * 留空 / undefined 表示本章未引用图（兜底走 researcher.figureCandidates 末尾追加）。
       */
      figureReferences?: {
        figureId: string;
        anchorParagraph?: number;
        caption?: string;
      }[];
    };

    /**
     * runChapterPipeline — 单章 write+review 闭环（可并发）。
     *
     * previousHeadingsSnapshot：并发批次启动前的前序章节标题快照（只读）。
     * 单章失败时返回 null（caller 用 Promise.allSettled 过滤掉 null）。
     */
    async function runChapterPipeline(
      chapter: (typeof outline.chapters)[0],
      previousHeadingsSnapshot: readonly string[],
    ): Promise<WrittenChapter | null> {
      // ★ RTK 去重：首发 finding 给全文，非首发只给 brief（裁掉 evidence，保留 claim/source/url）
      const chapterFirstUse =
        firstUseByChapter.get(chapter.index) ?? new Set<number>();
      const chapterSources = chapter.sourceIndices
        .map((globalIdx) => {
          const finding = researcherOut.findings[globalIdx];
          if (finding == null) return null;
          if (!chapterFirstUse.has(globalIdx)) {
            // 非首发：裁掉长字段，仅留 claim/source 供 writer 引用；加 _deduplicated 标记
            return {
              claim: finding.claim,
              source: finding.source,
              evidence: "", // 空字符串而非 undefined，保持 type 兼容
              _deduplicated: true,
              _briefHint: `[已在前章节使用，引用编号 [${globalIdx + 1}]]`,
            };
          }
          return finding;
        })
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
      // ★ L1-1: stuck-revision 防循环 — 追踪无进展 revision 次数
      let stuckCount = 0;
      let prevDraftBody: string | undefined;

      while (attempt < MAX_REVISION_ATTEMPTS + 1) {
        attempt += 1;
        const writerAgentId = `chapter-writer#${dimensionIdx}.${chapter.index}.${attempt}`;
        await deps
          .emit({
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
          })
          .catch((err: unknown) => {
            deps.log.warn(
              `[${missionId}] emit chapter:writing:started for "${dimensionName}" §${chapter.index} failed: ${err instanceof Error ? err.message : String(err)}`,
            );
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
            lengthProfile: lp,
            previousChapterHeadings: previousHeadingsSnapshot,
            previousCritique: lastCritique,
            previousDraft: lastDraft?.body,
            // ★ 2026-05-07 图文匹配：把 dim 的 figureCandidates 传给 chapter-writer。
            //   编号 FIG-1..N 与 reportAssembler.buildFigures 落地后的
            //   fig-${sec.id}-${i} 通过 reportAssembler 内的 #FIG-N → #fig-id 映射
            //   闭环（chapter-writer LLM 输出占位符是可选 inline，不强制）。
            availableFigures: (researcherOut.figureCandidates ?? []).map(
              (f, i) => ({
                figureId: `FIG-${i + 1}`,
                caption: f.caption,
                sourceUrl: f.sourceUrl,
                relevanceHint: f.relevanceHint,
              }),
            ),
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
          await deps
            .emit({
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
            })
            .catch((err: unknown) => {
              deps.log.warn(
                `[${missionId}] emit chapter:writing:completed (failed) for "${dimensionName}" §${chapter.index} failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            });
          // 单章 writer 失败 → 返回 null，由外层过滤（不阻塞其他章节）
          return null;
        }
        const rawDraft = writerRes.output as {
          body: string;
          wordCount: number;
          citationsUsed: string[];
          // ★ 2026-05-07 P1：LLM 输出的结构化 figureReferences（可空）
          figureReferences?: {
            figureId: string;
            anchorParagraph?: number;
            caption?: string;
          }[];
        };
        // ★ 沉淀 v4 接入: sanitizeSectionOutput 白名单清理 LLM 输出
        //   去掉非内容行（编辑备注 / 字数统计 / 元注释 / 营销空话等）
        const cleanedBody = sanitizeSectionOutput(rawDraft.body);
        const draft = { ...rawDraft, body: cleanedBody };
        // ★ L1-1: stuck-revision 检测 — revision 后 Jaccard 相似度 > 0.9 视为无进展
        if (attempt > 1 && prevDraftBody !== undefined) {
          const sim = jaccardSimilarity(prevDraftBody, draft.body);
          if (sim > STUCK_SIMILARITY_THRESHOLD) {
            stuckCount += 1;
          } else {
            stuckCount = 0;
          }
        }
        prevDraftBody = draft.body;
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
        await deps
          .emit({
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
                totalDefects > 0
                  ? { total: totalDefects, ...defects }
                  : undefined,
            },
          })
          .catch((err: unknown) => {
            deps.log.warn(
              `[${missionId}] emit chapter:writing:completed for "${dimensionName}" §${chapter.index} failed: ${err instanceof Error ? err.message : String(err)}`,
            );
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
        await deps
          .emit({
            type: "agent-playground.chapter:review:started",
            missionId,
            userId,
            agentId: reviewerAgentId,
            payload: {
              dimension: dimensionName,
              chapterIndex: chapter.index,
              attempt,
            },
          })
          .catch((err: unknown) => {
            deps.log.warn(
              `[${missionId}] emit chapter:review:started for "${dimensionName}" §${chapter.index} failed: ${err instanceof Error ? err.message : String(err)}`,
            );
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
                      verdict.decision === "revise"
                        ? "must-fix"
                        : "nice-to-have",
                    dimension: "structure",
                    pointer: "整章",
                    issue: verdict.critique.slice(0, 200),
                    suggestion: "见 issue 描述",
                  },
                ]
              : [];
        await deps
          .emit({
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
          })
          .catch((err: unknown) => {
            deps.log.warn(
              `[${missionId}] emit chapter:review:completed for "${dimensionName}" §${chapter.index} failed: ${err instanceof Error ? err.message : String(err)}`,
            );
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

        // ★ 字数硬门槛（2026-05-01 调整）：从 < 70% 放宽到 < 40%（极端不足才强制重写）。
        //   理念：质量优先，字数仅参考。一段 800 字精炼论述胜过 2000 字注水。
        //   仅当 LLM 严重偷懒（< 40% target）才显式 retry 逼出基本长度；
        //   字数微差 / 略超不再触发 revise，与 reviewer prompt 评分维度对齐。
        const isLengthFail =
          draft.wordCount < Math.round(targetWordsPerChapter * 0.4) &&
          attempt < MAX_REVISION_ATTEMPTS;
        // ★ L1-2: reviewer 阈值衰减 — 每次 attempt 降 10 分，最低 40
        //   attempt=1→60, attempt=2→50, attempt=3→40（后续全部 40）
        const dynamicThreshold = Math.max(
          40,
          PASS_THRESHOLD - (attempt - 1) * 10,
        );
        // ★ L1-1: 连续无进展 stuck 兜底 — stuckCount >= MAX_STUCK_COUNT 立即 finalize
        const isStuckRevision = stuckCount >= MAX_STUCK_COUNT;

        if (
          !isLengthFail &&
          (verdict.decision === "pass" ||
            verdict.score >= dynamicThreshold ||
            attempt >= MAX_REVISION_ATTEMPTS + 1 ||
            // ★ P1-R4-A (round 4): reviewer 连续故障超 MAX_REVIEWER_FAILURES，
            // 不再重试，按当前 draft 落地避免 token 倍增
            reviewerExhausted ||
            // ★ L1-1: 连续 2 次内容无变化，强制落地
            isStuckRevision)
        ) {
          // ★ 沉淀接入: chapter 局部 [1][2] → dim 全局编号重映射
          //   chapter.sourceIndices 是 outline 阶段每章可引用的 dim findings 索引（0-based）。
          //   chapter body 用 [1][2][N] 指 chapterSources[0][1][N-1] = findings[sourceIndices[N-1]]。
          //   这里直接还原成 dim 全局 [N+1]（1-based），让多章拼接后编号不冲突。
          const localToGlobal = new Map<number, number>();
          chapter.sourceIndices.forEach((globalIdx, localIdx) => {
            localToGlobal.set(localIdx + 1, globalIdx + 1);
          });
          const remappedBody = stripChartJsonFromContent(
            restoreGlobalIndices(draft.body, localToGlobal),
          );

          // ★ 治 mission "假完成" 根因（2026-05-01）：兜底落地必须显式 emit chapter:done，
          //   让前端 derive.ts 能把 chapter.status 切到 'done' / 'failed-finalized'。
          //   之前缺这条事件导致前端永远卡 'revising'。
          //   pass 路径和兜底路径都走这段，确保每个 chapter 都有终态事件。
          const chapterDecision:
            | "passed"
            | "fallback-length"
            | "fallback-exhausted" =
            verdict.decision === "pass" || verdict.score >= PASS_THRESHOLD
              ? "passed"
              : reviewerExhausted
                ? "fallback-exhausted"
                : "fallback-length";

          await deps
            .emit({
              type: "agent-playground.chapter:done",
              missionId,
              userId,
              agentId: reviewerAgentId,
              payload: {
                dimension: dimensionName,
                chapterIndex: chapter.index,
                finalAttempt: attempt,
                decision: chapterDecision,
                finalScore: verdict.score,
                wordCount: draft.wordCount,
                targetWordCount: targetWordsPerChapter,
                finalized: true,
                qualified: chapterDecision === "passed",
              },
            })
            .catch((err: unknown) => {
              deps.log.warn(
                `[${missionId}] emit chapter:done for "${dimensionName}" §${chapter.index} failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            });

          // ★ P0-D 完整版 (2026-05-06): 持久化 chapter draft 让下次 rerun cache hit
          // 防御 deps.store 缺失（spec mock 简化场景）：缺失即跳过持久化
          if (deps.store?.saveChapterDraft) {
            await deps.store
              .saveChapterDraft({
                missionId,
                dimension: dimensionName,
                chapterIndex: chapter.index,
                heading: chapter.heading,
                thesis: chapter.thesis,
                content: remappedBody,
                status:
                  chapterDecision === "passed" ? "passed" : "failed-finalized",
                score: verdict.score,
                critique: verdict.critique,
                attempts: attempt,
                wordCount: draft.wordCount,
              })
              .catch(() => undefined);
          }

          // 仅当兜底（非 passed）emit warning narrative，让用户看到"质量未达标但被兜底"
          if (chapterDecision !== "passed") {
            await narrate(deps.emit, missionId, userId, {
              stage: "s3-researchers",
              role: "reviewer",
              tag: "warning",
              text: `${dimensionName} · §${chapter.index} 因评审 ${
                chapterDecision === "fallback-exhausted"
                  ? "故障耗尽"
                  : "未通过且重试上限"
              }，按当前 draft 兜底落地（${draft.wordCount}/${targetWordsPerChapter} 字）`,
              agentId: reviewerAgentId,
              dimension: dimensionName,
            });
          }

          return {
            index: chapter.index,
            heading: chapter.heading,
            body: remappedBody,
            wordCount: draft.wordCount,
            finalized: true,
            qualified: chapterDecision === "passed",
            decision: chapterDecision,
            finalScore: verdict.score,
            // ★ 2026-05-07 P1：把 LLM 输出的 figureReferences 透传给上游
            //   reportAssembler；reviewer pass 路径同样保留（reviewer 不修图引用）
            figureReferences: draft.figureReferences,
          };
        }

        // 字数 fail 时 critique 必须显式说出来，让下一轮 writer 知道扩写
        const lengthCritiquePrefix = isLengthFail
          ? `[字数极度不足] 上轮仅 ${draft.wordCount} 字（目标 ${targetWordsPerChapter} 字，< 40%）。补充分析段落、案例数据、深化推理 —— 重点是质量内容（独立观点 / 具体证据 / 充分引用），不是单纯凑字数。目标 ${Math.round(targetWordsPerChapter * 0.6)} 字以上即可。\n\n`
          : "";
        // ★ P1-R4-C (round 4): critique 长度上限 2000 字，防多 attempt 累积爆 prompt
        const MAX_CRITIQUE_CHARS = 2000;
        lastCritique = (
          lengthCritiquePrefix + (verdict.critique ?? verdict.summary ?? "")
        ).slice(0, MAX_CRITIQUE_CHARS);
        await deps
          .emit({
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
          })
          .catch((err: unknown) => {
            deps.log.warn(
              `[${missionId}] emit chapter:revision for "${dimensionName}" §${chapter.index} failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      }

      // while loop 耗尽但没有 return（理论上不会到这里，因为 attempt cap 必然触发）
      return null;
    }

    // ── 并发执行所有章节 ──
    // previousHeadings snapshot：在整批并发启动前取已完成章节的标题列表。
    // 由于所有章节一起跑（pLimit 控制并发数），每批 chapter 共用同一份空快照作为
    // 前序上下文（首批并发无前序；实际场景下同维度章节互为独立，前序主要用于
    // 提示 writer 避免重复话题）。
    const headingsSnapshot: readonly string[] = [];
    const limit = pLimit(CHAPTER_CONCURRENCY);
    const settledResults = await Promise.allSettled(
      outline.chapters.map((chapter) =>
        limit(() => runChapterPipeline(chapter, headingsSnapshot)),
      ),
    );

    // 收集成功章节，按 index 排序保证顺序（章节完成时间不等于章节序号顺序）
    const writtenChapters: WrittenChapter[] = settledResults
      .filter(
        (r): r is PromiseFulfilledResult<WrittenChapter> =>
          r.status === "fulfilled" && r.value !== null,
      )
      .map((r) => r.value)
      .sort((a, b) => a.index - b.index);

    if (writtenChapters.length === 0) {
      await emitGraded({
        ok: false,
        failed: true,
        skipped: true,
        phase: "no-chapters",
        summary: `${dimensionName} · 0/${outline.chapters.length} 章节产出 — 全部 chapter writer 失败`,
      });
      throw new Error(
        `[chapter-integrity] ${dimensionName}: 0/${outline.chapters.length} chapters produced`,
      );
    }
    validateWrittenChapters({
      dimensionName,
      expectedCount: outline.chapters.length,
      chapters: writtenChapters,
    });
    writtenChaptersResult = writtenChapters;

    // ── 3. Integrate ──
    const integratorAgentId = `integrator#${dimensionIdx}`;
    await deps
      .emit({
        type: "agent-playground.dimension:integrating:started",
        missionId,
        userId,
        agentId: integratorAgentId,
        payload: {
          dimension: dimensionName,
          chapterCount: writtenChapters.length,
        },
      })
      .catch((err: unknown) => {
        deps.log.warn(
          `[${missionId}] emit dimension:integrating:started for "${dimensionName}" failed: ${err instanceof Error ? err.message : String(err)}`,
        );
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

    // ★ 2026-05-01 真因修复（mission da6e2af7 实证 5/8 dim 卡"等待评分"）：
    //   integrator Reflexion 用尽 2 轮 revision verifier < 60 门槛 → state='degraded'
    //   但 output 已 "强制接受次优产物"。原代码 if (state==='completed') 只认 completed
    //   → fullMarkdown undefined → 下游 grade 分支不跑 → 永远不 emit dimension:graded
    //   → 前端 dim todo 卡"等待评分"。
    //   修法：state==='completed' 或 state==='degraded' + output 存在 → 都走通过路径，
    //   但 emit 时区分 completed vs degraded 让前端能展示真实质量信号。
    //   abstract / keyFindings / fullMarkdown 已在函数顶部声明，本块写入。
    const hasUsableOutput =
      (integrateRes.state === "completed" ||
        integrateRes.state === "degraded") &&
      integrateRes.output;
    // ★ 2026-05-02 真治根（用户实证 Screenshot 54/55 章节内容空但有字数）：
    //   原 integrator LLM 生成 fullMarkdown 受 16000 token 限制，多章节 dim
    //   （epic/mega 长度档位 25 章 × 4000 字 = 100K 字符）会被截断 → 部分章节
    //   只剩"## 标题"无正文。chapter writer 已经写了 4978 字，但 integrator
    //   重新生成时把 body 丢了。
    //   彻底修法：fullMarkdown 由代码确定性拼接 chapter.body，**完全不依赖 LLM**
    //   生成长文本。LLM 只产 abstract + keyFindings（短文本不会被截）。
    // ★ G-2 三道清理管线 dim 整合前 sanitize（per-dim-pipeline.util.ts:G-2）
    //   chapter writer 输出后 G-1 已经跑过一次，但 cache-hit 路径 / 兜底路径的
    //   body 可能未经 G-1 清理（直接从 DB 读出），所以 stitchedFullMarkdown 前再跑一遍。
    const stitchedFullMarkdown = (() => {
      // ★ 2026-05-07 编号修复（用户实证报告无章节标题）：
      //   之前 chapter 用 ## (H2) + ${ch.index}. 序号前缀。但
      //   reportAssembler 的 formatDimensionContent → sanitizeHeadingLevels
      //   会把所有 H1/H2 strip 掉，导致章节标题彻底消失。
      //   修法：章节改用 ### (H3)，让 numberSubHeadings 自动加 "### N.M. 标题"
      //   层级编号（N=维度序，M=章节序）。dim 名也不用单独 H1，
      //   reportAssembler.buildFullMarkdown 已经在外层套 "## ${dim.name}"。
      const parts: string[] = [];
      for (const ch of writtenChapters) {
        parts.push(`### ${ch.heading}`);
        parts.push("");
        parts.push(stripChartJsonFromContent(ch.body));
        parts.push("");
      }
      return parts.join("\n");
    })();
    const stitchedTotalWordCount = writtenChapters.reduce(
      (s, c) => s + (c.wordCount ?? 0),
      0,
    );
    if (hasUsableOutput) {
      const integrated = integrateRes.output as {
        abstract: string;
        keyFindings: string[];
        fullMarkdown: string;
        totalWordCount: number;
      };
      abstract = integrated.abstract;
      keyFindings = integrated.keyFindings;
      // ★ 强制使用代码拼接的 fullMarkdown（LLM 输出可能被截）
      fullMarkdown = stitchedFullMarkdown;
      await deps
        .emit({
          type: "agent-playground.dimension:integrating:completed",
          missionId,
          userId,
          agentId: integratorAgentId,
          payload: {
            dimension: dimensionName,
            totalWordCount: stitchedTotalWordCount,
            chapterCount: writtenChapters.length,
            // ★ degraded 路径标记，前端可视化时区分
            degraded: integrateRes.state === "degraded",
          },
        })
        .catch((err: unknown) => {
          deps.log.warn(
            `[${missionId}] emit dimension:integrating:completed for "${dimensionName}" failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    } else {
      // ★ 2026-05-02 改进：integrator 失败时仍走"算法兜底" — 用代码拼接产出
      //   fullMarkdown + 简化 abstract（用 chapter[0] 提取），不再丢章节内容。
      //   用户红线："绝对不允许空章节"。
      fullMarkdown = stitchedFullMarkdown;
      abstract =
        writtenChapters[0]?.body
          ?.replace(/^#{1,6}\s+[^\n]+\n+/, "")
          .slice(0, 200) ?? `${dimensionName} · 整合失败兜底摘要`;
      keyFindings = writtenChapters
        .slice(0, 3)
        .map((ch) => ch.heading || `章节 ${ch.index}`);
      await deps
        .emit({
          type: "agent-playground.dimension:integrating:completed",
          missionId,
          userId,
          agentId: integratorAgentId,
          payload: {
            dimension: dimensionName,
            totalWordCount: stitchedTotalWordCount,
            chapterCount: writtenChapters.length,
            degraded: true, // integrator LLM 失败但代码拼接兜底
            fallback: "code-stitched-abstract", // 标记 abstract/keyFindings 是代码兜底
          },
        })
        .catch((err: unknown) => {
          deps.log.warn(
            `[${missionId}] emit dimension:integrating:completed (fallback) for "${dimensionName}" failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    // ── 4. 5-axis grade ──
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
        await emitGraded({ ok: true, g });
        // ★ B-sources_sufficiency threshold (2026-05-06): 对齐 quality-judge 第 6 axis。
        //   若 sources_sufficiency.score < 60（即维度 unique source URL < 3），
        //   发 warning narrative 提示下游 leader/signoff 该 dim 来源不足。
        const sourcesSufficiency = (
          g.axes as Record<string, { score: number; comment: string }>
        )["sources_sufficiency"];
        const MIN_SOURCES_SUFFICIENCY_SCORE = 60;
        if (
          sourcesSufficiency &&
          sourcesSufficiency.score < MIN_SOURCES_SUFFICIENCY_SCORE
        ) {
          deps.log.warn(
            `[per-dim grade] dim "${dimensionName}" sources_sufficiency=${sourcesSufficiency.score} < ${MIN_SOURCES_SUFFICIENCY_SCORE}: ${sourcesSufficiency.comment}`,
          );
          await narrate(deps.emit, missionId, userId, {
            stage: "s3-researchers",
            role: "reviewer",
            tag: "warning",
            text: `${dimensionName} · 来源充分性不足（sources_sufficiency=${sourcesSufficiency.score}/100）：${sourcesSufficiency.comment.slice(0, 100)}`,
            agentId: gradeAgentId,
            dimension: dimensionName,
          });
        }
      } else {
        await emitGraded({
          ok: false,
          failed: true,
          phase: "grade-failed",
          summary: `${dimensionName} · grade 阶段失败（state=${gradeRes.state}），无 5 轴评分。`,
        });
      }
    } else {
      await emitGraded({
        ok: false,
        failed: true,
        skipped: true,
        phase: "integrator-failed",
        summary: `${dimensionName} · integrator 未产出 fullMarkdown/abstract，跳过 5 轴评分（chapter ${writtenChapters.length} 章已落地，但缺整合）。`,
      });
    }
  } catch (err) {
    // ★ pipeline 任意点抛异常 → 终态兜底 emit + 重抛让上层 runOneDim 接管
    const msg = err instanceof Error ? err.message : String(err);
    await emitGraded({
      ok: false,
      failed: true,
      phase: "pipeline-exception",
      summary: `${dimensionName} · per-dim pipeline 异常终止: ${msg.slice(0, 200)}`,
    });
    throw err;
  } finally {
    // ★ INVARIANT 兜底：所有路径（含静默 return / 取消 / 系统中断）都必须落终态
    if (!terminalEmitted) {
      await emitGraded({
        ok: false,
        failed: true,
        phase: "fallback-finally",
        summary: `${dimensionName} · per-dim pipeline 未发评分事件即返回（chapter ${writtenChaptersResult.length} 章已落地）`,
      });
    }
  }

  return {
    ...researcherOut,
    chapters: writtenChaptersResult,
    abstract,
    keyFindings,
    fullMarkdown,
    grade,
  };
}

function validateWrittenChapters(args: {
  dimensionName: string;
  expectedCount: number;
  chapters: Array<{
    index: number;
    heading: string;
    body: string;
    wordCount: number;
  }>;
}): void {
  const { dimensionName, expectedCount, chapters } = args;
  if (chapters.length !== expectedCount) {
    throw new Error(
      `[chapter-integrity] ${dimensionName}: expected ${expectedCount} chapters, got ${chapters.length}`,
    );
  }

  for (const chapter of chapters) {
    const substantive = extractSubstantiveChapterText(chapter.body);
    if (substantive.length < MIN_CHAPTER_SUBSTANTIVE_CHARS) {
      throw new Error(
        `[chapter-integrity] ${dimensionName} §${chapter.index} "${chapter.heading}" body too short after normalization (${substantive.length} chars)`,
      );
    }
    if (isOutlineOnlyChapter(substantive)) {
      throw new Error(
        `[chapter-integrity] ${dimensionName} §${chapter.index} "${chapter.heading}" is outline-only without substantive prose`,
      );
    }
  }
}

function extractSubstantiveChapterText(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+[^\n]+\n*/gmu, "")
    .replace(/^>\s*/gmu, "")
    .replace(/^\s*[-*•·—–]\s+/gmu, "")
    .replace(/^\s*\d+[.)、]\s+/gmu, "")
    .replace(/^\s*[（(]?\d+[)）.、]?\s+/gmu, "")
    .replace(/^\s*[一二三四五六七八九十]+[、.)]\s+/gmu, "")
    .replace(/\[(\d+)\]/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function isOutlineOnlyChapter(text: string): boolean {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;

  const proseLines = lines.filter(
    (line) =>
      !/^#{1,6}\s+/.test(line) &&
      !/^[-*•·—–]/.test(line) &&
      !/^\d+[.)、]\s*/.test(line) &&
      !/^[（(]?\d+[)）.、]?\s*/.test(line) &&
      !/^[一二三四五六七八九十]+[、.)]\s*/u.test(line),
  );

  return proseLines.length === 0;
}
