/**
 * Pipeline Budget — 按 mission 的硬性预算限制
 *
 * 背景（02-target-architecture §5）：
 * - 每个 mission 预分配 tokens / cost / tool-calls / wall-time 上限
 * - 每个 agent 调用后累加使用量
 * - 超 degradationThresholdPct（默认 80%）→ ctx.degradationMode = true（后续 stage 跳过 optional）
 * - 超 100% → 抛 BudgetExhaustedError，pipeline 中止
 */

import type { ResearchDepth } from "./depth-config";

export interface BudgetConfig {
  readonly maxTotalTokens: number;
  readonly maxTotalCostUsd: number;
  readonly maxToolCalls: number;
  readonly maxWallTimeMs: number;
  /** 0-1，达到此比例进入 degradation 模式 */
  readonly degradationThresholdPct: number;
}

export interface BudgetUsage {
  tokensUsed: number;
  costUsd: number;
  toolCallsCount: number;
  wallTimeMs: number;
}

export interface BudgetCharge {
  readonly tokens?: number;
  readonly costUsd?: number;
  readonly toolCalls?: number;
  readonly wallTimeMs?: number;
}

export const DEPTH_BUDGET_DEFAULTS: Readonly<
  Record<ResearchDepth, BudgetConfig>
> = Object.freeze({
  quick: {
    maxTotalTokens: 100_000,
    maxTotalCostUsd: 1,
    maxToolCalls: 30,
    maxWallTimeMs: 5 * 60 * 1000,
    degradationThresholdPct: 0.8,
  },
  standard: {
    maxTotalTokens: 200_000,
    maxTotalCostUsd: 2,
    maxToolCalls: 80,
    maxWallTimeMs: 10 * 60 * 1000,
    degradationThresholdPct: 0.8,
  },
  thorough: {
    maxTotalTokens: 500_000,
    maxTotalCostUsd: 5,
    maxToolCalls: 200,
    maxWallTimeMs: 30 * 60 * 1000,
    degradationThresholdPct: 0.8,
  },
  deep: {
    maxTotalTokens: 1_000_000,
    maxTotalCostUsd: 10,
    maxToolCalls: 400,
    maxWallTimeMs: 60 * 60 * 1000,
    degradationThresholdPct: 0.8,
  },
});

export class PipelineBudget {
  private readonly usage: BudgetUsage = {
    tokensUsed: 0,
    costUsd: 0,
    toolCallsCount: 0,
    wallTimeMs: 0,
  };

  constructor(public readonly config: BudgetConfig) {}

  static forDepth(depth: ResearchDepth): PipelineBudget {
    return new PipelineBudget(DEPTH_BUDGET_DEFAULTS[depth]);
  }

  /** 预估追加 token 后是否还在硬限内 */
  canAfford(estimatedTokens: number): boolean {
    return (
      this.usage.tokensUsed + estimatedTokens <= this.config.maxTotalTokens
    );
  }

  /** 达到 degradationThresholdPct（默认 80%）即进入降级模式 */
  shouldDegrade(): boolean {
    return this.usagePct() >= this.config.degradationThresholdPct;
  }

  /** 任一维度达到 100% 即视为耗尽 */
  isExhausted(): boolean {
    return this.usagePct() >= 1;
  }

  /** 累加使用（Pipeline 每个 agent run 后调用） */
  charge(charge: BudgetCharge): void {
    if (charge.tokens) this.usage.tokensUsed += charge.tokens;
    if (charge.costUsd) this.usage.costUsd += charge.costUsd;
    if (charge.toolCalls) this.usage.toolCallsCount += charge.toolCalls;
    if (charge.wallTimeMs) this.usage.wallTimeMs += charge.wallTimeMs;
  }

  snapshot(): Readonly<BudgetUsage> {
    return { ...this.usage };
  }

  /** 返回 tokens / cost / tool-calls / wall-time 四个维度中使用率的最大值 */
  private usagePct(): number {
    return Math.max(
      this.usage.tokensUsed / this.config.maxTotalTokens,
      this.usage.costUsd / this.config.maxTotalCostUsd,
      this.usage.toolCallsCount / this.config.maxToolCalls,
      this.usage.wallTimeMs / this.config.maxWallTimeMs,
    );
  }
}
