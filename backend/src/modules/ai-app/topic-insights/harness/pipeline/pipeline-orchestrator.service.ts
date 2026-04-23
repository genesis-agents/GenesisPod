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

import { Injectable, Logger } from "@nestjs/common";
import { KernelContext } from "@/modules/ai-engine/facade";
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

export interface RunPipelineOptions {
  /** 如不提供则按 dependsOn 拓扑排序全跑 */
  stageOrder?: StageId[];
  /** 传入要启用的 stage id 子集（默认全部） */
  enabledStages?: Set<StageId>;
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

  constructor(private readonly stageRegistry: StageRegistry) {}

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

    for (const stage of stages) {
      if (signal.aborted) {
        this.logger.warn(
          `[${identity.missionId}] Aborted mid-pipeline at ${stage.id}`,
        );
        throw new DOMException("Pipeline aborted", "AbortError");
      }

      if (!this.shouldRunStage(stage, identity)) {
        skipped.push(stage.id);
        this.logger.debug(
          `[${identity.missionId}] Skip ${stage.id} (runsWhen=${stage.runsWhen}, depth=${identity.depth}, degrade=${identity.degradationMode})`,
        );
        continue;
      }

      const stageStart = Date.now();
      try {
        const input = await stage.prepare(identity, results);
        const output = await stage.execute(identity, input, signal);
        await stage.persist(identity, output);
        results.set(stage.id, output);
        completed.push(stage.id);

        const elapsed = Date.now() - stageStart;
        identity.budget.charge({ wallTimeMs: elapsed });

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
        this.logger.error(
          `[${identity.missionId}] Stage ${stage.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
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

    return {
      missionId: identity.missionId,
      completedStages: completed,
      skippedStages: skipped,
      budgetSnapshot: identity.budget.snapshot(),
      durationMs: Date.now() - startedAt,
    };
  }

  /** 决定 stage 是否在本次 mission 执行 */
  private shouldRunStage(
    stage: Stage,
    identity: PipelineIdentityContext,
  ): boolean {
    return this.evalCondition(
      stage.runsWhen,
      identity.depth,
      identity.degradationMode,
    );
  }

  private evalCondition(
    cond: StageCondition,
    depth: ResearchDepth,
    degradationMode: boolean,
  ): boolean {
    switch (cond) {
      case "always":
        return true;
      case "thoroughOrDeep":
        // degradation 模式下可选 stage 跳过
        if (degradationMode) return false;
        return depth === "thorough" || depth === "deep";
      case "hasLatex":
      case "qualityGateFailed":
        // 由 upstream output 决定；目前骨架层还没实现，默认跳过
        return false;
      default:
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
  };
}
