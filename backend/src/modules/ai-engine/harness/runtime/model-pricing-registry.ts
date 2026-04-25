/**
 * ModelPricingRegistry — 模型 → tier + per-token 价格 的中央表
 *
 * 用途：
 *   1. BudgetAccountant.accountLLM 时按 modelId 计算实际 costUsd
 *   2. BudgetAccountant.downgrade() 时按 tier 选下一个 modelId
 *   3. ReActLoop / Reflexion / PlanAct 共用，避免散落硬编码
 *
 * 来源：基于 LiteLLM cost_per_token 表的子集（截至 2026-04，可定期同步）。
 * 价格单位：每 1M token 美元（与 LiteLLM 一致）。最终 cost = (tokens / 1e6) * price。
 *
 * 为 Engine 内部统一表，不应被 AI App 业务层硬编码。
 */

import { Injectable } from "@nestjs/common";
import type { ModelTier } from "./budget-accountant";

export interface ModelPricing {
  readonly modelId: string;
  readonly tier: ModelTier;
  /** USD per 1M input tokens */
  readonly inputPricePerM: number;
  /** USD per 1M output tokens */
  readonly outputPricePerM: number;
  /** USD per 1M cache-write tokens (Anthropic). 0 if N/A. */
  readonly cacheWritePricePerM?: number;
  /** USD per 1M cache-read tokens. */
  readonly cacheReadPricePerM?: number;
}

const DEFAULT_TABLE: ModelPricing[] = [
  // ── Anthropic Claude (2026-04 表) ──
  {
    modelId: "claude-opus-4-7",
    tier: "strong",
    inputPricePerM: 15,
    outputPricePerM: 75,
    cacheWritePricePerM: 18.75,
    cacheReadPricePerM: 1.5,
  },
  {
    modelId: "claude-sonnet-4-6",
    tier: "standard",
    inputPricePerM: 3,
    outputPricePerM: 15,
    cacheWritePricePerM: 3.75,
    cacheReadPricePerM: 0.3,
  },
  {
    modelId: "claude-haiku-4-5-20251001",
    tier: "basic",
    inputPricePerM: 1,
    outputPricePerM: 5,
    cacheWritePricePerM: 1.25,
    cacheReadPricePerM: 0.1,
  },
  // ── OpenAI ──
  { modelId: "gpt-5", tier: "strong", inputPricePerM: 10, outputPricePerM: 30 },
  {
    modelId: "gpt-4o",
    tier: "standard",
    inputPricePerM: 2.5,
    outputPricePerM: 10,
  },
  {
    modelId: "gpt-4o-mini",
    tier: "basic",
    inputPricePerM: 0.15,
    outputPricePerM: 0.6,
  },
  // ── Grok ──
  { modelId: "grok-4", tier: "strong", inputPricePerM: 5, outputPricePerM: 15 },
  // ── Generic fallback ──
  { modelId: "stub", tier: "basic", inputPricePerM: 0, outputPricePerM: 0 },
];

@Injectable()
export class ModelPricingRegistry {
  private readonly byId = new Map<string, ModelPricing>();
  private readonly byTier = new Map<ModelTier, string[]>();

  constructor() {
    for (const entry of DEFAULT_TABLE) this.register(entry);
  }

  register(entry: ModelPricing): void {
    this.byId.set(entry.modelId, entry);
    const list = this.byTier.get(entry.tier) ?? [];
    if (!list.includes(entry.modelId)) {
      this.byTier.set(entry.tier, [...list, entry.modelId]);
    }
  }

  get(modelId: string): ModelPricing | null {
    return this.byId.get(modelId) ?? null;
  }

  /**
   * 估算一次 LLM 调用的 USD 成本。未注册的 modelId 返回 0（保守，避免误账）。
   */
  estimateCost(
    modelId: string,
    promptTokens: number,
    completionTokens: number,
    cacheReadTokens = 0,
  ): number {
    const p = this.byId.get(modelId);
    if (!p) return 0;
    // 建议修：clamp net input tokens（防 cacheReadTokens > promptTokens 时 inputCost 为负）
    const netInputTokens = Math.max(0, promptTokens - cacheReadTokens);
    const inputCost = (netInputTokens / 1e6) * p.inputPricePerM;
    const outputCost =
      (Math.max(0, completionTokens) / 1e6) * p.outputPricePerM;
    const cacheCost =
      cacheReadTokens > 0 && p.cacheReadPricePerM != null
        ? (cacheReadTokens / 1e6) * p.cacheReadPricePerM
        : 0;
    return inputCost + outputCost + cacheCost;
  }

  /**
   * 选择某 tier 下首选模型（多个时取第一个注册的）。
   * BudgetAccountant.downgrade 后用此选下一个 modelId。
   */
  pickModelForTier(tier: ModelTier): string | null {
    const list = this.byTier.get(tier);
    return list && list.length > 0 ? list[0] : null;
  }

  /**
   * 把 modelId 提升为某 tier 的首选（pickModelForTier 返回它）。
   * 用于 AI App 在启动时把"系统当前默认模型"覆盖 Harness 内置 DEFAULT_TABLE
   * （DEFAULT_TABLE 是基线候选，业务方有 DB 配置时应优先用真实启用的模型）。
   * 若 modelId 还未通过 register() 登记 pricing，调用方必须先 register 一次再 promote。
   */
  promoteToPrimary(tier: ModelTier, modelId: string): void {
    if (!this.byId.has(modelId)) {
      throw new Error(
        `[ModelPricingRegistry] cannot promote unregistered modelId="${modelId}". Call register() first.`,
      );
    }
    const list = this.byTier.get(tier) ?? [];
    const without = list.filter((m) => m !== modelId);
    this.byTier.set(tier, [modelId, ...without]);
  }

  list(): readonly ModelPricing[] {
    return [...this.byId.values()];
  }
}
