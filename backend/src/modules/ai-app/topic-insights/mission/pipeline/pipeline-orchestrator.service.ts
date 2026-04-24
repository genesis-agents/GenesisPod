/**
 * Pipeline Orchestrator — Tier Core 骨架
 *
 * 职责：
 * 1. 按 DAG 顺序执行已注册的 Stage
 * 2. 每个 Stage: prepare → execute(signal) → persist
 * 3. Budget hook：每个 stage 后 charge；超 100% 抛 BudgetExhaustedError
 * 4. AbortSignal：统一从 identity.abortController.signal 走
 * 5. Stage condition 判断：runsWhen + depth + degradationMode
 *
 * 当前是**骨架实现**：
 * - 默认执行顺序走 dependsOn 拓扑排序（不做并行）
 * - 不含 cognitive loop / remediate loop 等高级结构（Group D 接入）
 * - 不含真实的 WebSocket event broadcast（Group E 接入）
 *
 * ⚠️ 设计约束（CLAUDE.md 行为红线 · 分层不交叉）：
 * - Orchestrator 不直接调 LLM，所有 LLM 调用走 Stage.execute 内部委托到 Facade
 * - Orchestrator 不直接访问 DB，写入走 Stage.persist
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { KernelContext } from "@/modules/ai-engine/facade";
import { ResearchEventEmitterService } from "@/modules/ai-app/topic-insights/memory/events/event-emitter.service";
import { SpecAgentRegistry } from "@/modules/ai-engine/harness";
import type {
  MissionAdjusterInput,
  SectionRemediatorInput,
} from "@/modules/ai-app/topic-insights/agents/specs";
import type {
  MissionAdjustment,
  RemediatedSection,
  SectionResult,
} from "@/modules/ai-app/topic-insights/agents/specs/schemas";
import type {
  QualityGateStageOutput,
  ReviewStageOutput,
  WriteStageOutput,
} from "./stages/stage-context";
import {
  BudgetExhaustedError,
  DEPTH_CONFIG_DEFAULTS,
  PipelineBudget,
  StageMissingError,
  StageResults,
  type PipelineIdentityContext,
  type ResearchDepth,
  type Stage,
  type StageCondition,
  type StageId,
} from "./types";
import { StageRegistry } from "./stage-registry";
import { PipelineCheckpointService } from "./pipeline-checkpoint.service";

export interface RunPipelineOptions {
  /** 如不提供则按 dependsOn 拓扑排序全跑 */
  stageOrder?: StageId[];
  /** 传入要启用的 stage id 子集（默认全部） */
  enabledStages?: Set<StageId>;
  /** ST-07 ↔ ST-08 remediate 最大轮次（默认 2） */
  maxRemediateRounds?: number;
  /**
   * 每个 stage 完成后的观察者回调（Group L-3）。
   * 允许外部收集真实 StageResults 产物，而不改动 orchestrator 行为。
   * 失败异常被 catch，不影响 pipeline。
   */
  onStageComplete?: (stageId: StageId, output: unknown) => void;
  /**
   * H2 Resume primitive：从已持久化的 checkpoint 恢复。
   * 若提供：orchestrator 用 completedStages 预填 results，跳过已完成 stage，
   * 从下一个未完成 stage 继续。budgetSnapshot 需调用方在 identity.budget 重建。
   */
  resumeFromCheckpoint?: {
    readonly completedStages: readonly StageId[];
    readonly stageResults: Record<string, unknown>;
  };
}

/** QGATE 输出结构简化（只取 needsRemediate） */
interface QGateOutputLike {
  needsRemediate?: boolean;
}

/** AssemblyStageOutput 简化（只取 fullMarkdown，用于 hasLatex 检测） */
interface AssemblyOutputLike {
  fullMarkdown?: string;
}

export interface RunPipelineResult {
  missionId: string;
  completedStages: StageId[];
  skippedStages: StageId[];
  budgetSnapshot: ReturnType<PipelineBudget["snapshot"]>;
  durationMs: number;
}

@Injectable()
export class PipelineOrchestratorService {
  private readonly logger = new Logger(PipelineOrchestratorService.name);

  /** AG-16-MA 质量阈值：QGATE 分 < 此值时咨询 MissionAdjuster */
  private static readonly MA_QUALITY_THRESHOLD = 60;

  constructor(
    private readonly stageRegistry: StageRegistry,
    @Optional()
    private readonly researchEventEmitter?: ResearchEventEmitterService,
    @Optional() private readonly agentRegistry?: SpecAgentRegistry,
    @Optional() private readonly checkpoint?: PipelineCheckpointService,
  ) {}

  async run(
    identity: PipelineIdentityContext,
    options: RunPipelineOptions = {},
  ): Promise<RunPipelineResult> {
    // ★ 关键：用 KernelContext.run 包裹整个 pipeline 执行，
    // 确保下游 AiChatService.chat 能通过 KernelContext.get() 读到
    // missionId / baselineTag（BaselineRecorder observer 的过滤依据）。
    //
    // 合并既有 context（mission-execution 若已设置 processId / latencySessionId，
    // 保留不丢），只补 missionId + baselineTag + userId。
    const existing = KernelContext.get();
    return KernelContext.run(
      {
        ...(existing ?? { processId: "" }),
        userId: existing?.userId ?? identity.userId,
        missionId: identity.missionId,
        baselineTag: existing?.baselineTag ?? `harness-${identity.missionId}`,
      },
      () => this.runInner(identity, options),
    );
  }

  private async runInner(
    identity: PipelineIdentityContext,
    options: RunPipelineOptions,
  ): Promise<RunPipelineResult> {
    const startedAt = Date.now();
    const signal = identity.abortController.signal;

    const stages = this.resolveExecutionOrder(identity, options);

    const results = new StageResults();
    const completed: StageId[] = [];
    const skipped: StageId[] = [];
    const allStageIds = stages.map((s) => s.id);

    // H2 resume: seed results with persisted stage outputs; orchestrator will
    // see these ids in `completed` and short-circuit them via shouldRunStage.
    if (options.resumeFromCheckpoint) {
      const { completedStages, stageResults } = options.resumeFromCheckpoint;
      for (const id of completedStages) {
        const out = stageResults[id];
        if (out !== undefined) {
          results.set(id, out);
          completed.push(id);
        }
      }
      this.logger.log(
        `[${identity.missionId}] Resuming from checkpoint: ${completed.length} stages already completed (${completed.join(", ")})`,
      );
    }
    // 每次 mission 只咨询 AG-16-MA 一次，避免连环中断
    let missionAdjusterConsulted = false;
    let degradationWasActive = identity.degradationMode;

    for (const stage of stages) {
      if (signal.aborted) {
        this.logger.warn(
          `[${identity.missionId}] Aborted mid-pipeline at ${stage.id}`,
        );
        throw new DOMException("Pipeline aborted", "AbortError");
      }

      // H2 resume: stage already completed in a prior run; keep its output,
      // don't re-run, don't push to skipped.
      if (completed.includes(stage.id)) {
        this.logger.debug(
          `[${identity.missionId}] Skip ${stage.id} — already completed (resume)`,
        );
        continue;
      }

      if (!this.shouldRunStage(stage, identity, results)) {
        skipped.push(stage.id);
        this.logger.debug(
          `[${identity.missionId}] Skip ${stage.id} (runsWhen=${stage.runsWhen}, depth=${identity.depth}, degrade=${identity.degradationMode})`,
        );
        continue;
      }

      await this.runStageWithMetrics(
        stage,
        identity,
        results,
        completed,
        options,
      );

      // H4: structured decision event after key stages complete
      if (stage.id === "ST-01-PLAN" && results.has("ST-01-PLAN")) {
        const plan = results.get<{
          dimensions: Array<{ id?: string; name: string }>;
        }>("ST-01-PLAN");
        const planOutput = (plan as { plan?: typeof plan })?.plan ?? plan;
        const dims = planOutput?.dimensions ?? [];
        void this.researchEventEmitter?.emitDecision(identity.topicId, {
          missionId: identity.missionId,
          source: "ST-01-PLAN",
          kind: "plan_ready",
          summary: `Leader selected ${dims.length} research dimension(s)`,
          details: {
            dimensionCount: dims.length,
            dimensions: dims.map((d) => ({ id: d.id, name: d.name })),
            scopedToSubset: Boolean(
              identity.dimensionScope && identity.dimensionScope.length > 0,
            ),
          },
        });
      }

      // ★ Group J-2: ST-08-QGATE fail → remediate loop（重跑 ST-07 + ST-08，最多 maxRemediateRounds 轮）
      if (stage.id === "ST-08-QGATE" && results.has("ST-08-QGATE")) {
        await this.maybeRemediateLoop(
          identity,
          results,
          completed,
          options.maxRemediateRounds ?? 2,
          signal,
          options,
        );
      }

      // ★ AG-16-MA 运行时接入：降级首发 或 QGATE 低分 → 咨询 MissionAdjuster
      if (!missionAdjusterConsulted) {
        const enteredDegrade =
          !degradationWasActive && identity.degradationMode;
        const lowQuality = this.qgateScoreBelow(
          results,
          PipelineOrchestratorService.MA_QUALITY_THRESHOLD,
        );
        if (enteredDegrade || lowQuality) {
          missionAdjusterConsulted = true;
          await this.consultMissionAdjuster(
            identity,
            results,
            completed,
            allStageIds,
            startedAt,
            signal,
          );
        }
      }
      degradationWasActive = identity.degradationMode;
    }

    return {
      missionId: identity.missionId,
      completedStages: completed,
      skippedStages: skipped,
      budgetSnapshot: identity.budget.snapshot(),
      durationMs: Date.now() - startedAt,
    };
  }

  /**
   * AG-16-MA · MissionAdjuster 咨询：在 budget 降级 或 QGATE 低分时调用。
   *
   * 决策映射：
   * - continue:        继续，无副作用
   * - downgrade_depth: 强制降级模式（跳过 thoroughOrDeep stages）
   * - extend_budget:   提升 degradation 阈值（但不改硬上限），只 log
   * - abort:           abort AbortController → pipeline 下一轮 signal.aborted 命中
   *
   * 失败不影响主流程（any error → log warn → continue）。
   */
  private async consultMissionAdjuster(
    identity: PipelineIdentityContext,
    results: StageResults,
    completed: StageId[],
    allStageIds: StageId[],
    startedAt: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) return;
    if (!this.agentRegistry) return;
    const adjuster = this.agentRegistry.get<
      MissionAdjusterInput,
      MissionAdjustment
    >("AG-16-MA");
    if (!adjuster) return;

    const budgetSnap = identity.budget.snapshot();
    const maxTokens = identity.budget.config.maxTotalTokens;
    const budgetUsagePct =
      maxTokens > 0 ? Math.min(1, budgetSnap.tokensUsed / maxTokens) : 0;

    const qgateScore = this.readQgateScore(results);
    const pending = allStageIds.filter((id) => !completed.includes(id));

    try {
      const res = await adjuster.executeSpec({
        budgetUsagePct,
        currentDepth: identity.depth,
        completedStages: completed,
        pendingStages: pending,
        qualityScore: qgateScore,
        elapsedMs: Date.now() - startedAt,
      });
      if (res.state !== "completed") {
        throw new Error(
          `AG-16-MA failed: ${res.errors?.join("; ") ?? "unknown"}`,
        );
      }
      const decision = res.output.decision;
      this.logger.log(
        `[${identity.missionId}] AG-16-MA decision=${decision} reason="${res.output.reason}"`,
      );

      // H4: structured decision event (replaces the legacy LeaderDecision
      // table derivation). Consumed by /topics/:id/leader/decisions.
      void this.researchEventEmitter?.emitDecision(identity.topicId, {
        missionId: identity.missionId,
        source: "AG-16-MA",
        kind: `mission_adjuster_${decision}`,
        summary: `MissionAdjuster decided ${decision}: ${res.output.reason}`,
        details: {
          decision,
          reason: res.output.reason,
          budgetUsagePct,
          qgateScore,
          completedStages: completed,
          pendingStages: pending,
        },
      });

      switch (decision) {
        case "abort":
          this.logger.warn(
            `[${identity.missionId}] AG-16-MA requested abort — aborting pipeline`,
          );
          identity.abortController.abort();
          break;
        case "downgrade_depth":
          if (!identity.degradationMode) {
            identity.degradationMode = true;
            this.logger.warn(
              `[${identity.missionId}] AG-16-MA downgrade_depth — entering degradation mode`,
            );
          }
          break;
        case "extend_budget":
          // 不改硬上限：设计上 Budget 是硬边界，此处只记录策略意图
          this.logger.log(
            `[${identity.missionId}] AG-16-MA extend_budget suggested — budget stays hard-capped; log only`,
          );
          break;
        case "continue":
        default:
          break;
      }
    } catch (err) {
      this.logger.warn(
        `[${identity.missionId}] AG-16-MA failed: ${err instanceof Error ? err.message : String(err)} — continuing without adjustment`,
      );
    }
  }

  private readQgateScore(results: StageResults): number | undefined {
    if (!results.has("ST-08-QGATE")) return undefined;
    try {
      const q = results.get<QualityGateStageOutput>("ST-08-QGATE");
      return typeof q.score === "number" ? q.score : undefined;
    } catch {
      return undefined;
    }
  }

  private qgateScoreBelow(results: StageResults, threshold: number): boolean {
    const s = this.readQgateScore(results);
    return typeof s === "number" && s < threshold;
  }

  /**
   * 单个 stage 的执行 + metrics + event + budget。
   * 抽出为独立方法便于 remediate loop 复用。
   */
  private async runStageWithMetrics(
    stage: Stage,
    identity: PipelineIdentityContext,
    results: StageResults,
    completed: StageId[],
    options?: RunPipelineOptions,
  ): Promise<void> {
    const stageStart = Date.now();
    await this.emitStageEvent(identity, stage.id, "stage:started", {
      stageId: stage.id,
      stageName: stage.name,
    });

    try {
      const input = await stage.prepare(identity, results);
      const output = await stage.execute(
        identity,
        input,
        identity.abortController.signal,
      );
      await stage.persist(identity, output);
      results.set(stage.id, output);
      if (!completed.includes(stage.id)) completed.push(stage.id);

      // ★ Group L-3: 外部观察者钩子（golden runner 采真产物用）
      if (options?.onStageComplete) {
        try {
          options.onStageComplete(stage.id, output);
        } catch (err) {
          this.logger.warn(
            `[${identity.missionId}] onStageComplete(${stage.id}) threw: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // H2: persist checkpoint after each successful stage (fire-and-forget;
      // failure here doesn't block the pipeline — see service.saveStage).
      if (this.checkpoint) {
        const accumulated: Record<string, unknown> = {};
        for (const id of completed) accumulated[id] = results.get(id);
        void this.checkpoint.saveStage(
          identity,
          stage.id,
          output,
          [...completed],
          accumulated,
        );
      }

      const elapsed = Date.now() - stageStart;
      identity.budget.charge({ wallTimeMs: elapsed });

      await this.emitStageEvent(identity, stage.id, "stage:completed", {
        stageId: stage.id,
        stageName: stage.name,
        durationMs: elapsed,
      });

      if (identity.budget.isExhausted()) {
        const snap = identity.budget.snapshot();
        throw new BudgetExhaustedError(
          stage.id,
          "tokens",
          identity.budget.config.maxTotalTokens,
          snap.tokensUsed,
        );
      }
      if (identity.budget.shouldDegrade() && !identity.degradationMode) {
        identity.degradationMode = true;
        this.logger.warn(
          `[${identity.missionId}] Budget reached ${Math.floor(identity.budget.config.degradationThresholdPct * 100)}% — entering degradation mode`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[${identity.missionId}] Stage ${stage.id} failed: ${msg}`,
      );
      await this.emitStageEvent(identity, stage.id, "stage:failed", {
        stageId: stage.id,
        stageName: stage.name,
        error: msg,
      });
      await stage
        .cleanup?.(identity)
        .catch((e) =>
          this.logger.warn(
            `[${identity.missionId}] Cleanup failed for ${stage.id}: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
      throw err;
    }
  }

  /**
   * QGATE verdict=fail 时的 remediate 循环（Group K-1）：
   * 1. 基于 ST-04-REVIEW 找 needsRevision=true 的 section
   * 2. 若 agentRegistry 有 AG-12-SREM，对每个 section 调 remediator 替换内容
   * 3. 重跑 ST-07-SYNTH + ST-08-QGATE 最多 maxRounds 轮
   */
  private async maybeRemediateLoop(
    identity: PipelineIdentityContext,
    results: StageResults,
    completed: StageId[],
    maxRounds: number,
    signal: AbortSignal,
    options?: RunPipelineOptions,
  ): Promise<void> {
    let rounds = 0;
    while (rounds < maxRounds) {
      if (signal.aborted) return;
      const qgate = results.get<QGateOutputLike & QualityGateStageOutput>(
        "ST-08-QGATE",
      );
      if (!qgate.needsRemediate) return;

      rounds += 1;
      this.logger.warn(
        `[${identity.missionId}] QGATE fail → remediate round ${rounds}/${maxRounds} (score=${qgate.score ?? "?"})`,
      );

      // ★ Group K-1: section-level remediate
      await this.remediateSections(identity, results, qgate, signal);

      const synthStage = this.stageRegistry.get("ST-07-SYNTH");
      const qgateStage = this.stageRegistry.get("ST-08-QGATE");
      if (!synthStage || !qgateStage) return;

      await this.runStageWithMetrics(
        synthStage,
        identity,
        results,
        completed,
        options,
      );
      if (signal.aborted) return;
      await this.runStageWithMetrics(
        qgateStage,
        identity,
        results,
        completed,
        options,
      );
    }

    const finalQGate = results.get<QGateOutputLike>("ST-08-QGATE");
    if (finalQGate.needsRemediate) {
      this.logger.warn(
        `[${identity.missionId}] QGATE still fail after ${maxRounds} rounds — proceeding anyway`,
      );
    }
  }

  /**
   * 调 AG-12-SREM 对需要修订的 section 重写，替换 ST-03-WRITE 的 sections。
   * 无 agentRegistry 或无 AG-12-SREM → no-op。
   */
  private async remediateSections(
    identity: PipelineIdentityContext,
    results: StageResults,
    qgate: QualityGateStageOutput,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.agentRegistry) return;
    const remediator = this.agentRegistry.get<
      SectionRemediatorInput,
      RemediatedSection
    >("AG-12-SREM");
    if (!remediator) return;

    if (!results.has("ST-03-WRITE") || !results.has("ST-04-REVIEW")) return;
    const write = results.get<WriteStageOutput>("ST-03-WRITE");
    const review = results.get<ReviewStageOutput>("ST-04-REVIEW");

    const reviewBySection = new Map(
      review.reviews.map((r) => [r.sectionId, r]),
    );

    const updatedSections: SectionResult[] = [];
    let remediatedCount = 0;

    for (const section of write.sections) {
      if (signal.aborted) return;
      const rev = reviewBySection.get(section.sectionId);
      if (!rev || !rev.needsRevision) {
        updatedSections.push(section);
        continue;
      }

      try {
        const res = await remediator.executeSpec({
          sectionId: section.sectionId,
          sectionTitle: section.title,
          originalContent: section.content,
          issues: rev.issues,
          revisionInstructions: rev.revisionInstructions,
          targetWords: section.wordCount,
        });
        if (res.state !== "completed") {
          throw new Error(
            `AG-12-SREM failed: ${res.errors?.join("; ") ?? "unknown"}`,
          );
        }
        updatedSections.push({
          ...section,
          content: res.output.newContent,
          wordCount: res.output.wordCount,
        });
        remediatedCount += 1;
      } catch (err) {
        this.logger.warn(
          `[${identity.missionId}] AG-12-SREM failed for ${section.sectionId}: ${err instanceof Error ? err.message : String(err)} — keeping original`,
        );
        updatedSections.push(section);
      }
    }

    if (remediatedCount > 0) {
      // StageResults 是 Map<StageId, unknown>；set 会覆盖先前内容
      results.set<WriteStageOutput>("ST-03-WRITE", {
        ...write,
        sections: updatedSections,
      });
      this.logger.log(
        `[${identity.missionId}] AG-12-SREM remediated ${remediatedCount} section(s) (QGATE score=${qgate.score})`,
      );
    }
  }

  /** 发布 stage 事件到 ResearchEventEmitterService（SSE → 前端进度） */
  private async emitStageEvent(
    identity: PipelineIdentityContext,
    stageId: StageId,
    eventType: "stage:started" | "stage:completed" | "stage:failed",
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.researchEventEmitter) return;
    try {
      await this.researchEventEmitter.emitToTopic(identity.topicId, eventType, {
        missionId: identity.missionId,
        stageId,
        ...data,
      });
      // F4 · map generic stage lifecycle → semantic events the frontend expects
      // (LEADER_PLANNING / LEADER_PLAN_READY / REPORT_SYNTHESIS_*).
      await this.emitSemanticStageEvent(identity, stageId, eventType, data);
    } catch (err) {
      this.logger.warn(
        `[${identity.missionId}] emitStageEvent ${eventType} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Fan out a stage lifecycle event to its semantic counterpart(s) so existing
   * frontend subscribers (LEADER panel / report progress bar / task list) get
   * the signal without every stage needing to emit directly.
   */
  private async emitSemanticStageEvent(
    identity: PipelineIdentityContext,
    stageId: StageId,
    eventType: "stage:started" | "stage:completed" | "stage:failed",
    data: Record<string, unknown>,
  ): Promise<void> {
    const e = this.researchEventEmitter;
    if (!e) return;
    const topicId = identity.topicId;
    const missionId = identity.missionId;
    const durationMs = (data as { durationMs?: number }).durationMs;

    try {
      if (stageId === "ST-01-PLAN") {
        if (eventType === "stage:started") {
          await e.emitLeaderThinking(topicId, missionId, {
            phase: "planning",
            message: "Leader 开始规划研究维度…",
          });
          await e.emitLeaderPlanning(topicId, missionId, {});
        } else if (eventType === "stage:completed") {
          const plan = data as { dimensions?: number; totalTasks?: number };
          await e.emitLeaderPlanReady(topicId, missionId, {
            dimensions: plan.dimensions,
            totalTasks: plan.totalTasks,
          });
        }
      }
      if (stageId === "ST-07-SYNTH") {
        if (eventType === "stage:started") {
          await e.emitReportSynthesisStarted(topicId, {
            reportId: identity.reportId,
            missionId,
          });
        } else if (eventType === "stage:completed") {
          const syn = data as { wordCount?: number };
          await e.emitReportSynthesisCompleted(topicId, {
            reportId: identity.reportId,
            missionId,
            wordCount: syn.wordCount,
            durationMs,
          });
        }
      }
      // Task-level semantic echo — each stage = one "task" unit of UI progress.
      if (eventType === "stage:started") {
        await e.emitTaskStarted(topicId, {
          taskId: stageId,
          missionId,
          title: stageId,
        });
      } else if (eventType === "stage:completed") {
        await e.emitTaskCompleted(topicId, {
          taskId: stageId,
          missionId,
          durationMs,
        });
      } else if (eventType === "stage:failed") {
        await e.emitTaskFailed(topicId, {
          taskId: stageId,
          missionId,
          error: String((data as { error?: unknown }).error ?? ""),
        });
      }
    } catch (err) {
      this.logger.warn(
        `[${identity.missionId}] emitSemanticStageEvent ${eventType} ${stageId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** 决定 stage 是否在本次 mission 执行 */
  private shouldRunStage(
    stage: Stage,
    identity: PipelineIdentityContext,
    results: StageResults,
  ): boolean {
    return this.evalCondition(
      stage.runsWhen,
      identity.depth,
      identity.degradationMode,
      results,
    );
  }

  private evalCondition(
    cond: StageCondition,
    depth: ResearchDepth,
    degradationMode: boolean,
    results: StageResults,
  ): boolean {
    switch (cond) {
      case "always":
        return true;
      case "thoroughOrDeep":
        // degradation 模式下可选 stage 跳过
        if (degradationMode) return false;
        return depth === "thorough" || depth === "deep";
      case "hasLatex":
        // 读取 ST-11-ASM 的 fullMarkdown，runtime 检测 LaTeX delimiter
        return this.detectLatexFromAssembly(results);
      case "qualityGateFailed":
        // 由 ST-08-QGATE 输出决定；当前 pipeline 用 remediate loop 处理，此分支保留
        return false;
      default:
        return false;
    }
  }

  /** 运行时检测 assembly 产物是否含 LaTeX delimiter */
  private detectLatexFromAssembly(results: StageResults): boolean {
    if (!results.has("ST-11-ASM")) return false;
    try {
      const asm = results.get<AssemblyOutputLike>("ST-11-ASM");
      const md = asm.fullMarkdown ?? "";
      return /\$\$|\\\(|\\\[|(?<!\\)\$[^\n$]+\$/.test(md);
    } catch {
      return false;
    }
  }

  /**
   * 构造执行顺序：
   * - 如果 options.stageOrder 提供，按该顺序（假定调用方已排序）
   * - 否则走拓扑排序（基于 stage.dependsOn）
   */
  private resolveExecutionOrder(
    identity: PipelineIdentityContext,
    options: RunPipelineOptions,
  ): Stage[] {
    const enabled = options.enabledStages;

    if (options.stageOrder) {
      return options.stageOrder.map((id) => {
        const s = this.stageRegistry.get(id);
        if (!s) throw new StageMissingError(id);
        return s;
      });
    }

    // 简单拓扑排序（Kahn's algorithm）
    const all = this.stageRegistry
      .all()
      .filter((s) => !enabled || enabled.has(s.id));

    const byId = new Map(all.map((s) => [s.id, s]));
    const inDegree = new Map<StageId, number>();
    for (const s of all) {
      inDegree.set(s.id, s.dependsOn.filter((d) => byId.has(d)).length);
    }

    const queue: Stage[] = [];
    for (const s of all) {
      if (inDegree.get(s.id) === 0) queue.push(s);
    }

    const ordered: Stage[] = [];
    while (queue.length > 0) {
      const s = queue.shift()!;
      ordered.push(s);
      for (const other of all) {
        if (other.dependsOn.includes(s.id)) {
          const remaining = (inDegree.get(other.id) ?? 0) - 1;
          inDegree.set(other.id, remaining);
          if (remaining === 0) queue.push(other);
        }
      }
    }

    if (ordered.length !== all.length) {
      throw new Error(
        `Pipeline stage DAG has cycle or missing deps. mission=${identity.missionId} depth=${identity.depth} registered=${all.length} ordered=${ordered.length}`,
      );
    }

    return ordered;
  }
}

/** 便捷工厂：根据 depth 构造默认 identity context（mission 启动时用） */
export function buildIdentityContext(params: {
  missionId: string;
  topicId: string;
  reportId: string;
  userId: string;
  depth: ResearchDepth;
  mode: "fresh" | "incremental";
  cachePrefix?: string;
  /** 目标架构 v2：mission-execution 通过 reconciler 生成，注入给所有下游 */
  capabilities?: import("@/modules/ai-app/topic-insights/agents/capability/types").TopicInsightsCapabilitySnapshot;
  /** H3 single-dimension scope */
  dimensionScope?: readonly string[];
}): PipelineIdentityContext {
  const cfg = DEPTH_CONFIG_DEFAULTS[params.depth];
  void cfg; // currently consumed by Stage impls, referenced here for future hooks
  return {
    missionId: params.missionId,
    topicId: params.topicId,
    reportId: params.reportId,
    userId: params.userId,
    cachePrefix:
      params.cachePrefix ?? `topic-insights:${params.missionId}:prompt-cache`,
    abortController: new AbortController(),
    budget: PipelineBudget.forDepth(params.depth),
    depth: params.depth,
    mode: params.mode,
    degradationMode: false,
    capabilities: params.capabilities,
    dimensionScope: params.dimensionScope,
  };
}
