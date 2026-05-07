/**
 * StageRerunDispatcher — 单 stage 局部重跑路由 + cascade 链路执行器
 *
 * 上游：docs/architecture/ai-harness/runner/per-task-rerun-with-cascade.md v1.2 §3.3
 *
 * 提供两个 API：
 *
 *   1. dispatch(args)：legacy scope 路由（保留 v1 兼容路径）
 *      - 按 input.scope / input.todoId 路由到具体 handler
 *      - v1 真实工作的：system:s9b（10 维评审重跑，已落地）
 *      - 其它 scope: throw NotImplementedException 提示用"开新研究"
 *
 *   2. runFromStageWithCascade(args)：v1.2 新路径（PR-R5）
 *      - 按 stepId 直接路由（前端 todo 卡片可指定 stepId）
 *      - 自动展开 cascade 链 = [stepId, ...successors]
 *      - 一次性 reset 链路全部 dbWrites + resetFields
 *      - 顺序执行 chain，每完成一个 stage 更新 last_completed_stage
 *      - 失败 best-effort partial：已成 patch 保留，未跑下游不动
 *      - 失败原因 emit cascade-aborted 三元组（completed / abortedAt / remaining）
 *
 * v1.1 类别 C1+C2 修订（2026-05-04）：
 *   - 用 stage handler registry（Map<stepId, handler>）替代 switch — 新 stage 加 handler 即可
 *   - 构造期 throw 拒绝缺失 handler；不在运行期才发现
 */

import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { MissionStore } from "../lifecycle/mission-store.service";
import { ReportEvaluationService } from "@/modules/ai-harness/facade";
import type { ChapterInput } from "@/modules/ai-harness/facade";
import type { LocalRerunInput } from "./local-rerun.service";
import type { HydratedMissionContext } from "./ctx-hydrator.service";
import type { EmitFn } from "../workflow/mission-deps";
import { PLAYGROUND_PIPELINE } from "../../../playground.config";
import {
  collectResetFieldsForCascade,
  computeCascadeChain,
  type MissionColumnKey,
} from "@/modules/ai-harness/facade";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import type { ReportArtifact } from "@/modules/ai-harness/facade";
// ★ PR-R5b R2 共识 P0 (architect, 2026-05-07): 集中字面量在
//   types/leader-verdict.types.ts，避免前后端 contract drift。
import { LEADER_VERDICT_AUTO_RERUN_RECOVERED } from "../../../types/leader-verdict.types";

// Re-export 让现有 spec / caller 通过本文件 import 路径继续可用（不破坏既有契约）
export { LEADER_VERDICT_AUTO_RERUN_RECOVERED };

export interface DispatchArgs {
  ctx: HydratedMissionContext;
  input: LocalRerunInput;
  emit: EmitFn;
}

/**
 * v1.1 类别 C3：handler 自带显式 stub 接口，每个 stage 知道自己要什么 dep。
 * v1 阶段大部分 handler 是 placeholder，只有 s9b-objective-eval 有真实实现。
 *
 * stage handler 接收 hydrated ctx + emit + 共享 stub deps；写库通过 stubs.store。
 * stage handler 失败 throw → cascade-aborted（best-effort partial）。
 */
export interface StageRerunStubs {
  readonly store: MissionStore;
  readonly reportEvaluation: ReportEvaluationService;
  readonly log: Logger;
}

export type StageRerunHandler = (
  ctx: HydratedMissionContext,
  emit: EmitFn,
  stubs: StageRerunStubs,
) => Promise<void>;

export interface RunFromStageArgs {
  ctx: HydratedMissionContext;
  fromStepId: string;
  emit: EmitFn;
}

export interface RunFromStageResult {
  /** 已成功完成的 stepId（按 cascade 顺序） */
  readonly completed: string[];
  /** 失败的 stepId（best-effort partial 中止位置） */
  readonly abortedAt?: string;
  /** 失败原因 */
  readonly errorMessage?: string;
  /** 未跑的下游 stepId */
  readonly remaining?: string[];
}

@Injectable()
export class StageRerunDispatcher {
  private readonly log = new Logger(StageRerunDispatcher.name);
  private readonly handlers = new Map<string, StageRerunHandler>();

  constructor(
    private readonly store: MissionStore,
    private readonly reportEvaluation: ReportEvaluationService,
    // ★ PR-R5b 切片 (2026-05-07): s11 真 handler 需要 prisma 读 chapter_drafts fallback
    private readonly prisma: PrismaService,
  ) {
    // ── v1.1 C1: 构造期注册（避免 switch 漂移）──
    this.handlers.set("s9b-objective-eval", this.handleS9bObjectiveEval);
    // ★ PR-R5b 切片 (2026-05-07): s11-persist 真 handler 实装 — 让 c195035f 类
    //   "S8 装配过但 S11 chapter_content_incomplete guard 拒签" 的 mission 能就地入库。
    //   不走原 stage 的 chapter_content guard（那是 v1 mission 跑期的硬闸），rerun
    //   模式信任已有产物 → 直接 markCompleted 写库。
    this.handlers.set("s11-persist", this.handleS11Persist);
    // 其它 10 stage handler 暂以 placeholder 注册：throw 时给出明确 PR-R5b 字样指引
    // PR-R5b 将填入真实 handler（需要 RerunMissionDepsBuilder 把 billing/pool stub 装配齐全）
    //
    // ★ 收尾评审 P0-A2 (2026-05-07): s12-self-evolution 不在 cascade 体系（postlude
    //   异步任务），从此 list 删；同时 s12 不在 PLAYGROUND_PIPELINE.steps 中，留在
    //   handler registry 会让 stepIndexOf 在运行期 throw "step not in pipeline"。
    const PR_R5B_PENDING = [
      "s2-leader-plan",
      "s3-researcher-collect",
      "s4-leader-assess",
      "s5-reconciler",
      "s6-analyst",
      "s7-writer-outline",
      "s8-writer",
      "s8b-quality-enhancement",
      "s9-critic",
      "s10-leader-foreword-signoff",
    ];
    for (const stepId of PR_R5B_PENDING) {
      this.handlers.set(stepId, async () => {
        throw new BadRequestException(
          `[PR-R5b] ${stepId} rerun handler 待补 — 需要 RerunMissionDepsBuilder ` +
            `把 mission-runtime stub（billing/pool/leader/abort/credits）装配齐再调原 stage 函数。` +
            `当前可用 scope：system:s9b（10 维客观评审）。其它请用"开新研究对比"按钮。`,
        );
      });
    }
    // ★ 收尾评审 P0-A3 (2026-05-07): 构造期 invariant — 把"延迟拒绝"提前到 boot fail-fast。
    //   PLAYGROUND_PIPELINE.steps 中 dag.rerunable=true 的 stage 必须有 handler 注册；
    //   否则 boot 期 throw（防 pipeline 加新 rerunable stage 但忘 register handler）。
    for (const step of PLAYGROUND_PIPELINE.steps) {
      if (step.dag?.rerunable && !this.handlers.has(step.id)) {
        throw new Error(
          `[StageRerunDispatcher boot] step ${step.id} dag.rerunable=true 但未注册 handler — ` +
            `请在 dispatcher constructor 加 handlers.set("${step.id}", ...)`,
        );
      }
    }
  }

  /**
   * v1.0 legacy 路径：按 input.scope / todoId 路由（保留）
   *
   * v1 真实工作：system:s9b （走 s9b-objective-eval handler）
   * 其它 scope 抛 BadRequestException 让前端明确告知 "暂不支持，请用开新研究"。
   */
  async dispatch(args: DispatchArgs): Promise<void> {
    const { input, ctx, emit } = args;
    const { scope, todoId } = input;

    if (scope === "system" && todoId.endsWith("s9b-objective-evaluation")) {
      const stubs: StageRerunStubs = {
        store: this.store,
        reportEvaluation: this.reportEvaluation,
        log: this.log,
      };
      const handler = this.handlers.get("s9b-objective-eval");
      if (!handler) {
        throw new BadRequestException(
          "s9b-objective-eval handler 未注册（构造期 bug）",
        );
      }
      await handler(ctx, emit, stubs);
      return;
    }
    throw new BadRequestException(
      `局部重跑暂未实现该 scope: ${scope} (todoId=${todoId})。` +
        `当前 v1 仅支持 "10 维客观评审"局部重跑（system:s9b）。` +
        `其它任务请用"开新研究对比"按钮（创建新 mission 跑全流程，原 mission 保留）。`,
    );
  }

  /**
   * v1.2 PR-R5 新路径：按 stepId 直接路由 + cascade
   *
   * 1. 校验 stepId 存在 + dag.rerunable
   * 2. 计算 cascade 链 = [stepId, ...successors]
   * 3. 一次性 reset 整链 dbWrites + resetFields（防 stale 残留）
   * 4. 顺序执行 chain，每完成一个 stage 更新 last_completed_stage
   * 5. 失败 best-effort partial：已成 patch 保留，未跑下游不动
   */
  async runFromStageWithCascade(
    args: RunFromStageArgs,
  ): Promise<RunFromStageResult> {
    const { ctx, fromStepId, emit } = args;

    // ── 1. 入参校验 ──
    const fromStep = PLAYGROUND_PIPELINE.steps.find((s) => s.id === fromStepId);
    if (!fromStep) {
      throw new BadRequestException(`unknown step: ${fromStepId}`);
    }
    if (!fromStep.dag?.rerunable) {
      throw new BadRequestException(
        `stage ${fromStepId} 不可重跑${fromStep.dag?.rerunableReason ? `：${fromStep.dag.rerunableReason}` : ""}`,
      );
    }

    const cascadeChain = computeCascadeChain(
      PLAYGROUND_PIPELINE.steps,
      fromStepId,
    );
    this.log.log(
      `[cascade ${ctx.missionId}] from=${fromStepId} chain=${cascadeChain.join(" → ")}`,
    );

    // ── 2. reset 整链 dbWrites + resetFields ──
    await this.resetFieldsForCascade(ctx.missionId, ctx.userId, cascadeChain);

    // ── 3. 顺序执行 best-effort partial ──
    const stubs: StageRerunStubs = {
      store: this.store,
      reportEvaluation: this.reportEvaluation,
      log: this.log,
    };
    const completed: string[] = [];
    for (let i = 0; i < cascadeChain.length; i++) {
      const stepId = cascadeChain[i];

      await emit({
        type: "agent-playground.rerun:stage-started",
        missionId: ctx.missionId,
        userId: ctx.userId,
        payload: {
          stepId,
          fromStepId,
          cascadeChain,
          completedSoFar: [...completed],
        },
      }).catch(() => {});

      const handler = this.handlers.get(stepId);
      if (!handler) {
        const errorMessage = `stage ${stepId} 未注册 rerun handler`;
        this.log.error(`[cascade ${ctx.missionId}] ${errorMessage}`);
        const remaining = cascadeChain.slice(i);
        await this.emitCascadeAborted(emit, {
          ctx,
          stepId,
          completed,
          remaining,
          errorMessage,
        });
        return { completed, abortedAt: stepId, errorMessage, remaining };
      }

      try {
        await handler(ctx, emit, stubs);
        completed.push(stepId);
        // 更新 last_completed_stage 让前端看到进度
        // ★ 收尾评审第二轮 P0-S2-完成 (2026-05-07): 传 userId 走严格隔离路径
        await this.store
          .markIntermediateState(
            ctx.missionId,
            {
              lastCompletedStage: this.stepIndexOf(stepId),
            },
            ctx.userId,
          )
          .catch(() => {});
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.log.warn(
          `[cascade ${ctx.missionId}] aborted at ${stepId}: ${errorMessage}`,
        );
        const remaining = cascadeChain.slice(i + 1);
        await this.emitCascadeAborted(emit, {
          ctx,
          stepId,
          completed,
          remaining,
          errorMessage,
        });
        return { completed, abortedAt: stepId, errorMessage, remaining };
      }
    }
    return { completed };
  }

  // ────────────────────────── helpers ──────────────────────────

  private async resetFieldsForCascade(
    missionId: string,
    userId: string,
    cascadeChain: string[],
  ): Promise<void> {
    const fields = collectResetFieldsForCascade(
      PLAYGROUND_PIPELINE.steps,
      cascadeChain,
    );
    if (fields.length > 0) {
      // ★ 收尾评审 P0-S2 (2026-05-07): 传 userId 走严格隔离路径
      await this.store.resetFields(
        missionId,
        fields as ReadonlyArray<MissionColumnKey>,
        userId,
      );
    }
  }

  private stepIndexOf(stepId: string): number {
    const idx = PLAYGROUND_PIPELINE.steps.findIndex((s) => s.id === stepId);
    if (idx === -1) {
      throw new Error(`step ${stepId} not in PLAYGROUND_PIPELINE`);
    }
    return idx;
  }

  private async emitCascadeAborted(
    emit: EmitFn,
    args: {
      ctx: HydratedMissionContext;
      stepId: string;
      completed: string[];
      remaining: string[];
      errorMessage: string;
    },
  ): Promise<void> {
    await emit({
      type: "agent-playground.rerun:cascade-aborted",
      missionId: args.ctx.missionId,
      userId: args.ctx.userId,
      payload: {
        abortedAt: args.stepId,
        completed: [...args.completed],
        remaining: args.remaining,
        errorMessage: args.errorMessage,
        partialModeNote:
          "best-effort partial: 已成 stage 的 patch 保留，未跑下游不动",
      },
    }).catch(() => {});
  }

  // ────────────────────────── handlers ──────────────────────────

  /**
   * S9B — 10 维客观评审局部重跑（v1 真实实现）
   *
   * 复用沉淀：
   *   - 调 ReportEvaluationService.evaluateReport（沉淀 v3 quality 闭环已有）
   *   - 写回 reportArtifact.metadata.pipelineEvaluation（与 s9b stage 一致）
   *   - markRerunPatch 写库（不动 status / completedAt）
   */
  private handleS9bObjectiveEval: StageRerunHandler = async (
    ctx,
    emit,
    stubs,
  ) => {
    if (!ctx.reportArtifact) {
      throw new BadRequestException(
        "原 mission 缺 reportArtifact (v2)，无法跑 10 维评审局部重跑",
      );
    }
    const reportArtifact = ctx.reportArtifact;
    if (reportArtifact.sections.length === 0) {
      throw new BadRequestException("reportArtifact 无 section，跳过");
    }

    await emit({
      type: "agent-playground.agent:narrative",
      missionId: ctx.missionId,
      userId: ctx.userId,
      payload: {
        stage: "rerun-s9b",
        role: "critic",
        tag: "judging",
        text: `局部重跑 10 维客观评审：${reportArtifact.sections.length} 个章节`,
        agentId: "critic",
      },
    }).catch(() => {});

    const language = ctx.input.language?.startsWith("en") ? "en" : "zh";
    const topicType =
      typeof (ctx.input as { topicType?: string }).topicType === "string"
        ? (ctx.input as { topicType?: string }).topicType!
        : "GENERIC";

    const fullMarkdown = reportArtifact.content.fullMarkdown;
    const chapters: ChapterInput[] = reportArtifact.sections
      .map((s) => {
        const body = fullMarkdown.slice(s.startOffset, s.endOffset);
        return { section: s, body };
      })
      .filter(({ body }) => body && body.length >= 200)
      .map(({ section, body }) => ({
        chapterId: section.id,
        chapterTitle: section.title,
        writerModel: reportArtifact.metadata.modelTrail?.[0] ?? "unknown",
        content: body,
        sourcesUsed: section.citations?.length ?? 0,
      }));

    if (chapters.length === 0) {
      throw new BadRequestException(
        "所有 section body 都过短（< 200 字），无可评审章节",
      );
    }

    const result = await stubs.reportEvaluation.evaluateReport({
      reportTitle: reportArtifact.metadata.topic ?? ctx.input.topic,
      topicType,
      chapters,
      language,
    });

    // 把客观评分覆盖到 reportArtifact.metadata.pipelineEvaluation
    reportArtifact.metadata.pipelineEvaluation = result;
    // 同步覆盖一条 quality.warning 让前端能看到最新评分
    const warningIdx = reportArtifact.quality.warnings.findIndex(
      (w) => w.dimension === "objective_evaluation",
    );
    const warning = {
      dimension: "objective_evaluation" as const,
      message: `10 维客观评分（已重跑）：${result.overallScore}/100 (${result.grade})；${result.feedback}`,
    };
    if (warningIdx >= 0) {
      reportArtifact.quality.warnings[warningIdx] = warning;
    } else {
      reportArtifact.quality.warnings.push(warning);
    }

    // ★ 收尾评审 P0-S2 (2026-05-07): 传 userId 走严格隔离路径
    await stubs.store.markRerunPatch(
      ctx.missionId,
      {
        reportFull: reportArtifact as unknown as Record<string, unknown>,
        reportArtifactVersion: 2,
      },
      ctx.userId,
    );

    await emit({
      type: "agent-playground.agent:narrative",
      missionId: ctx.missionId,
      userId: ctx.userId,
      payload: {
        stage: "rerun-s9b",
        role: "critic",
        tag: "success",
        text: `局部重跑完成：${result.overallScore}/100 (${result.grade})`,
        agentId: "critic",
      },
    }).catch(() => {});

    stubs.log.log(
      `[s9b-rerun ${ctx.missionId}] new score=${result.overallScore} grade=${result.grade}`,
    );
  };

  /**
   * S11 — Persist 局部重跑（PR-R5b 切片，2026-05-07）
   *
   * 用例：c195035f 类 mission（S8 已装配 / S10 已签 / S11 markCompleted 时被
   * chapter_content_incomplete guard 拒 → status=failed + reportFull=null）。
   *
   * 设计决策：
   *   - rerun 模式信任已有产物，**不**重跑 S11 stage 函数的 chapter_content guard
   *     （那是 v1 mission 跑期的硬闸；rerun 用户已知风险，要的是把内容入库可见）
   *   - reportArtifact 优先级：ctx.reportArtifact > 从 chapter_drafts 表重建
   *   - leader 字段从 mission 行已存值兜底（leader 没真签时仍允许 markCompleted，
   *     但 leaderSigned=null + leaderVerdict='auto-rerun-recovered' 让前端可识别）
   *
   * 失败：
   *   - 既无 ctx.reportArtifact 又无 chapter_drafts → throw（用户应"开新研究"）
   *   - markCompleted 写库失败 → throw（cascade 上游 reset 已清旧产物，半完成态）
   */
  private handleS11Persist: StageRerunHandler = async (ctx, emit, stubs) => {
    await emit({
      type: "agent-playground.agent:narrative",
      missionId: ctx.missionId,
      userId: ctx.userId,
      payload: {
        stage: "rerun-s11",
        role: "system",
        tag: "persisting",
        text: "S11 持久化重跑：将已有产物写入 mission 行（rerun 模式 bypass content guard）",
        agentId: "system",
      },
    }).catch(() => {});

    // 1. 拿 reportArtifact：优先 ctx，否则从 chapter_drafts 重建
    let reportArtifact: ReportArtifact | undefined = ctx.reportArtifact;
    let recovered = false;
    if (!reportArtifact) {
      reportArtifact = await this.rebuildArtifactFromDrafts(ctx);
      recovered = true;
    }
    if (!reportArtifact) {
      // ★ R2 共识 P1 (reviewer P1-3, 2026-05-07): 错误消息带 missionId/userId 上下文，
      //   线上排查时不必跨多条 log 关联。
      throw new BadRequestException(
        `无法重跑 S11 持久化 [missionId=${ctx.missionId}, userId=${ctx.userId}]：` +
          "mission 既无 reportArtifact（v2 装配产物）又无 chapter_drafts 表数据。" +
          "建议用'开新研究对比'按钮重跑全流程。",
      );
    }

    // 2. 读 mission 行已存元数据（leader signoff / themeSummary 等用于 markCompleted）
    const detail = await stubs.store.getById(ctx.missionId, ctx.userId);
    if (!detail) {
      throw new BadRequestException(
        `mission ${ctx.missionId} 不存在或非 owner [userId=${ctx.userId}]`,
      );
    }

    // 3. markCompleted 写入 — bypass chapter_content_incomplete guard（rerun 信任已有产物）
    //    若 leader 没真签（c195035f 类），用 'auto-rerun-recovered' verdict 让前端识别
    const reportPayload = {
      ...(reportArtifact as unknown as Record<string, unknown>),
      title: reportArtifact.metadata?.topic ?? ctx.input.topic,
      summary:
        reportArtifact.quickView?.executiveSummary?.markdown ??
        `局部重跑入库恢复（${recovered ? "从 chapter_drafts 重建" : "用 ctx 已有产物"}）`,
    };

    const leaderVerdict =
      typeof detail.leaderVerdict === "string" &&
      detail.leaderVerdict.length > 0
        ? detail.leaderVerdict
        : LEADER_VERDICT_AUTO_RERUN_RECOVERED;

    // ★ PR-R5b 评审 P0-B (2026-05-07): 传 ctx.userId 走严格隔离路径
    //   （where { id, userId, status:'running' } 防 cross-user mission 写穿越）。
    // ★ R2 共识 P1 (architect P1-5, 2026-05-07): 传 wallTimeMs（rerun 自身耗时）—
    //   不传会让 mission 列表的耗时统计被覆盖成 null。
    const rerunWallTimeMs = Math.max(0, Date.now() - (ctx.t0 ?? Date.now()));
    await stubs.store.markCompleted(
      ctx.missionId,
      {
        report: reportPayload as unknown as {
          title?: string;
          summary?: string;
        },
        reportArtifactVersion: 2,
        finalScore: reportArtifact.quality?.overall ?? 70,
        wallTimeMs: rerunWallTimeMs,
        themeSummary:
          typeof detail.themeSummary === "string"
            ? detail.themeSummary
            : undefined,
        dimensions: detail.dimensions as never,
        verdicts: detail.verdicts as never,
        reconciliationReport: detail.reconciliationReport as never,
        userProfile: detail.userProfile as never,
        leaderJournal: detail.leaderJournal as never,
        leaderOverallScore:
          typeof detail.leaderOverallScore === "number"
            ? detail.leaderOverallScore
            : undefined,
        leaderSigned:
          typeof detail.leaderSigned === "boolean"
            ? detail.leaderSigned
            : undefined,
        leaderVerdict,
        tokensUsed:
          typeof detail.tokensUsed === "number" ? detail.tokensUsed : 0,
        costUsd: typeof detail.costUsd === "number" ? detail.costUsd : 0,
      },
      ctx.userId,
    );

    // ★ PR-R5b 评审 P0-A (2026-05-07): 与 mission 跑期 s11-persist /
    //   handleMissionFailure 一致，rerun 入库后写一条 mission_report_versions 行
    //   （triggerType='todo-rerun'），让前端版本切换器看到本次重跑产物。
    //   fire-and-forget catch — 历史记录失败不阻断 markCompleted 主路径。
    await stubs.store
      .saveReportVersion({
        missionId: ctx.missionId,
        triggerType: "todo-rerun",
        report: reportPayload as { title?: string; summary?: string },
        finalScore: reportArtifact.quality?.overall ?? 70,
        leaderSigned:
          typeof detail.leaderSigned === "boolean"
            ? detail.leaderSigned
            : undefined,
      })
      .catch((err: unknown) => {
        stubs.log.warn(
          `[s11-rerun ${ctx.missionId}] saveReportVersion failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    await emit({
      type: "agent-playground.mission:completed",
      missionId: ctx.missionId,
      userId: ctx.userId,
      payload: {
        reviewScore: reportArtifact.quality?.overall ?? 70,
        leaderSigned: detail.leaderSigned,
        leaderOverallScore: detail.leaderOverallScore,
        rerunRecovered: recovered,
        rerunSource: recovered ? "chapter_drafts" : "ctx_artifact",
      },
    }).catch(() => {});

    stubs.log.log(
      `[s11-rerun ${ctx.missionId}] markCompleted ok (recovered=${recovered}, sections=${reportArtifact.sections?.length ?? 0})`,
    );
  };

  /**
   * 从 chapter_drafts 表重建 reportArtifact —— c195035f 类 fallback 路径。
   * 当 mission.report_full=null 但 chapter_drafts 表有内容时（S8 之前 PR-R4 未部署
   * 或 S8 装配失败的 mission），用 chapter_drafts 的 content 拼装 fullMarkdown +
   * 简单 sections 索引，让 markCompleted 能写入。
   *
   * 不调 LLM、不重跑装配，纯 DB → 拼装。质量低于真装配（无 quickView /
   * citations / figures 等丰富字段），但保证用户能看到 13/14 章节内容。
   */
  private async rebuildArtifactFromDrafts(
    ctx: HydratedMissionContext,
  ): Promise<ReportArtifact | undefined> {
    // ★ PR-R5b 评审 P0-C (2026-05-07): 包含 'failed-finalized' —— c195035f 类
    //   mission 的 chapter_drafts 通常是 'failed-finalized'（S11 guard 因 13/14
    //   章节 < 40 字 rejecting 之前 writer 写的产物已 finalize 落库），如果只看
    //   passed/done 会丢掉 ~95% 内容。本 fallback 路径就是为它们设计的。
    //   loadQualifiedChapterDrafts（mission 跑期 hydrate 用）保持只看 passed/done，
    //   这里 rerun fallback 路径放宽，业务语义不冲突。
    const drafts = await this.prisma.agentPlaygroundChapterDraft.findMany({
      where: {
        missionId: ctx.missionId,
        status: { in: ["passed", "done", "failed-finalized"] },
      },
      orderBy: [{ dimension: "asc" }, { chapterIndex: "asc" }],
    });
    if (drafts.length === 0) return undefined;

    // 拼装 fullMarkdown + sections offsets
    // ★ PR-R5b 自检 (2026-05-07): startOffset 必须指向 "## " 而不是其后（v1.4
    //   §6.2 invariant: slice(startOffset, endOffset) 必定以 "## " 开头）。
    const parts: string[] = [`# ${ctx.input.topic}\n\n`];
    const sections: ReportArtifact["sections"] = [];
    let offset = parts[0].length;
    let i = 0;
    for (const d of drafts) {
      const heading = `## ${d.heading}\n\n`;
      const body = `${d.content}\n\n`;
      // section 范围包含 heading 自身（offset 起点 = 此 section 第一字符 "#"）
      const startOffset = offset;
      const endOffset = offset + heading.length + body.length;
      // ★ R2 共识 P0 (reviewer P0-1): 去 `as never` 让结构类型严格校验，
      //   citations: [] 是有意为空（chapter_drafts 表没存 citation 索引，
      //   重建路径 quality.recoveryDegraded=true 已显式标记降级，前端
      //   不在 missing-citation 路径报错）。
      sections.push({
        id: `s${i++}`,
        type: "dimension" as const,
        level: 2,
        title: d.heading,
        anchor: d.heading.toLowerCase().replace(/\s+/g, "-").slice(0, 80),
        startOffset,
        endOffset,
        wordCount: d.wordCount ?? Math.floor(d.content.length / 5),
        readingTimeMinutes: Math.ceil(
          (d.wordCount ?? d.content.length / 5) / 200,
        ),
        citations: [],
        figureIds: [],
        factIds: [],
        sourceDimensionId: d.dimension,
      });
      parts.push(heading, body);
      offset = endOffset;
    }
    const fullMarkdown = parts.join("");

    return {
      sections,
      content: {
        fullMarkdown,
        fullReportSize: Buffer.byteLength(fullMarkdown, "utf8"),
      },
      citations: [],
      figures: [],
      quality: {
        // ★ R2 共识 P0 (architect P0-1, 2026-05-07): 重建产物用降级哨兵分 65
        //   原因：原 mission 没真签 → 没有真实质量评分 → 给前端 / leaderboard /
        //   postmortem learner 显式 recoveryDegraded=true 标记，让下游不把"65"
        //   当真实质量统计。saveReportVersion(triggerType='todo-rerun') +
        //   metadata.recoveryMode='chapter_drafts_rebuild' 双重 sentinel。
        overall: 65,
        dimensions: {} as never,
        hardGateViolations: [],
        warnings: [
          {
            dimension: "rerun_recovered",
            message:
              "本报告通过 chapter_drafts 表重建（原 reportArtifact 未落库）。装配级元数据（quickView / citations / figures）缺失。",
          },
        ],
        qualityTrace: [],
        finalVerdict: "acceptable",
        // ★ R2 共识 P0：显式降级标记（前端 / 统计排除用）
        recoveryDegraded: true,
      },
      metadata: {
        topic: ctx.input.topic,
        generatedAt: new Date().toISOString(),
        generationTimeMs: 0,
        // ★ R2 共识 P0 (architect P0-1)：显式 recovery mode 让下游可识别
        recoveryMode: "chapter_drafts_rebuild",
        version: 2,
        isIncremental: true,
        dimensionCount: new Set(drafts.map((d) => d.dimension)).size,
        sourceCount: 0,
        factCount: 0,
        figureCount: 0,
        wordCount: drafts.reduce(
          (s, d) => s + (d.wordCount ?? Math.floor(d.content.length / 5)),
          0,
        ),
        readingTimeMinutes: 0,
        // ★ R2 共识 P0 (reviewer P0-NEW-1/2, 2026-05-07): fallback 必须用合法 enum
        //   ArtifactMetadata.styleProfile = academic|executive|journalistic|technical
        //   ArtifactMetadata.audienceProfile = executive|domain-expert|general-public
        //   原 "analytical" / "professional" 是非法字面量（与 ctx.input 同名 union 不一致）
        styleProfile: ctx.input.styleProfile ?? "executive",
        lengthProfile: ctx.input.lengthProfile ?? "standard",
        audienceProfile: ctx.input.audienceProfile ?? "domain-expert",
        language: ctx.input.language ?? "zh-CN",
        totalTokens: { prompt: 0, completion: 0, total: 0 },
        costCents: 0,
        modelTrail: [],
      },
      quickView: {
        executiveSummary: {
          markdown: `（局部重跑入库恢复模式：${drafts.length} 章节从 chapter_drafts 表重建）`,
          wordCount: 30,
        },
        topHighlights: [],
        topTrends: [],
        keyRisks: [],
        topRecommendations: [],
        keyCitations: [],
        keyFigures: [],
        estimatedReadingTime: 0,
        whatYouWillLearn: [],
      },
      factTable: [],
    } as unknown as ReportArtifact;
  }
}
