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
  ) {
    // ── v1.1 C1: 构造期注册（避免 switch 漂移）──
    this.handlers.set("s9b-objective-eval", this.handleS9bObjectiveEval);
    // 其它 11 stage handler 暂以 placeholder 注册：throw 时给出明确 PR-R5b 字样指引
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
      "s11-persist",
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
}
