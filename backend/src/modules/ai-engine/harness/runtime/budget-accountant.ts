/**
 * SOTA Runtime · BudgetAccountant (cost-aware tier downgrade)
 *
 * 方案文档 §4.4。超 budget 时自动 downgrade model (strong → standard → basic)，
 * 再超就 abort。防止 ReAct loop 无限烧 token。
 */

import type { TokenBudget, BudgetSnapshot } from "./types";

export type ModelTier = "strong" | "standard" | "basic";

export class BudgetAccountant {
  private tokensUsed = 0;
  private costUsd = 0;
  private currentTier: ModelTier = "strong";

  constructor(private readonly cap: TokenBudget) {}

  exhausted(): boolean {
    return (
      this.tokensUsed >= this.cap.maxTokens ||
      this.costUsd >= this.cap.maxCostUsd
    );
  }

  /** 超 70% 时允许 downgrade，超 90% 强制 */
  shouldDowngrade(): boolean {
    const tokenPct = this.tokensUsed / this.cap.maxTokens;
    const costPct = this.costUsd / this.cap.maxCostUsd;
    return tokenPct >= 0.7 || costPct >= 0.7;
  }

  canDowngrade(): boolean {
    return this.currentTier !== "basic";
  }

  downgrade(): ModelTier {
    this.currentTier = this.currentTier === "strong" ? "standard" : "basic";
    return this.currentTier;
  }

  accountLLM(
    promptTokens: number,
    completionTokens: number,
    costUsd: number,
  ): void {
    this.tokensUsed += promptTokens + completionTokens;
    this.costUsd += costUsd;
  }

  accountTool(costUsd: number): void {
    this.costUsd += costUsd;
  }

  /**
   * 根据当前 tier + preference 选 modelId。
   * 由 protocol 传入 modelRegistry 注入，实现 tier → modelId 映射。
   */
  getCurrentTier(): ModelTier {
    return this.currentTier;
  }

  snapshot(): BudgetSnapshot {
    return {
      tokensUsed: this.tokensUsed,
      costUsd: this.costUsd,
      currentTier: this.currentTier,
    };
  }

  /** 恢复快照（从 checkpoint 重建） */
  restore(snap: BudgetSnapshot): void {
    this.tokensUsed = snap.tokensUsed;
    this.costUsd = snap.costUsd;
    this.currentTier = snap.currentTier;
  }
}
