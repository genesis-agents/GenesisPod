/**
 * StageRerunDispatcher — 按 todo.scope 路由到具体的局部 stage 执行器
 *
 * v1 真实工作的 scope：
 *   - system:s9b → 整 reportArtifact 重新跑 10 维评审，覆盖 reportArtifact.metadata.pipelineEvaluation
 *
 * v1.1 待做（当前抛 NotImplementedException 让前端明确告知"暂不支持，请用开新研究"）：
 *   - dimension: 单 researcher 重跑该维度 + 链式 S5/S6/S8（涉及 reconciler 等装配级 dep）
 *   - chapter:   chapter-writer 重写指定章（涉及 billing context + budgetMultiplier 等装配级 dep）
 *   - system:s10: leader signoff 重跑（需要 SupervisedMission 装配）
 *
 * 设计决策：v1 只做"无装配依赖"的 scope（s9b 只需 reportArtifact + reportEvaluation service）。
 * 其它 scope 真正实现需要把 buildStageDeps 的部分能力抽出来给 rerun 用 —— 留 v1.1。
 */

import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { MissionStore } from "../lifecycle/mission-store.service";
import type { ReportEvaluationService } from "../../../../../ai-harness/facade";
import type { ChapterInput } from "../../../../../ai-harness/facade";
import type { LocalRerunInput } from "./local-rerun.service";
import type { HydratedMissionContext } from "./ctx-hydrator.service";
import type { EmitFn } from "../workflow/mission-deps";

export interface DispatchArgs {
  ctx: HydratedMissionContext;
  input: LocalRerunInput;
  emit: EmitFn;
}

@Injectable()
export class StageRerunDispatcher {
  private readonly log = new Logger(StageRerunDispatcher.name);

  constructor(
    private readonly store: MissionStore,
    private readonly reportEvaluation: ReportEvaluationService,
  ) {}

  async dispatch(args: DispatchArgs): Promise<void> {
    const { input } = args;
    const { scope, todoId } = input;

    if (scope === "system" && todoId.endsWith("s9b-objective-evaluation")) {
      return this.runS9bRerun(args);
    }
    // 其它 scope v1 暂不支持 —— 抛明确错误而非 placeholder
    throw new BadRequestException(
      `局部重跑暂未实现该 scope: ${scope} (todoId=${todoId})。` +
        `当前 v1 仅支持 "10 维客观评审"局部重跑（system:s9b）。` +
        `其它任务请用"开新研究对比"按钮（创建新 mission 跑全流程，原 mission 保留）。`,
    );
  }

  /**
   * S9B — 10 维客观评审局部重跑（v1 真实实现）
   *
   * 复用沉淀：
   *   - 调 ReportEvaluationService.evaluateReport（沉淀 v3 quality 闭环已有）
   *   - 写回 reportArtifact.metadata.pipelineEvaluation（与 s9b stage 一致）
   *   - markRerunPatch 写库
   */
  private async runS9bRerun(args: DispatchArgs): Promise<void> {
    const { ctx, emit } = args;
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

    const result = await this.reportEvaluation.evaluateReport({
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

    // markRerunPatch 写库 —— 只 update reportFull，不动 status / completedAt
    await this.store.markRerunPatch(ctx.missionId, {
      reportFull: reportArtifact as unknown as Record<string, unknown>,
      reportArtifactVersion: 2,
    });

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

    this.log.log(
      `[s9b-rerun ${ctx.missionId}] new score=${result.overallScore} grade=${result.grade}`,
    );
  }
}
