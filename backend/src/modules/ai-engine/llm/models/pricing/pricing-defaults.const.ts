/**
 * TIER_DEFAULT_PRICING — 按 costTier 的默认单价（USD / 1M tokens）。
 *
 * 用途（2026-06-16）：模型只配了 costTier、没填精确单价时，用本表的档位默认价
 * 估算成本，让预算/积分护栏**有近似值可用**，而不是落到 $0（= 护栏失效）。
 * 这同时支撑 admin「配置时给默认值、可自行修改」——前端按 tier 预填这些值，
 * admin 可覆盖为 provider 的精确价。
 *
 * 数值是 2026 年中各档位的**保守量级估计**（宁可略高，保证护栏先生效），
 * 不追求精确；精确价由 admin 在 /admin/ai/models 填 priceInputPerMillion/
 * priceOutputPerMillion 覆盖。
 *
 * 档位语义：
 *   - basic   : 便宜小模型（gpt-4o-mini / deepseek-chat / gemini-flash 等）
 *   - standard: 主力模型（gpt-4o / claude sonnet / gemini-pro 等）
 *   - strong  : 旗舰/推理（claude opus / o 系列 / gpt-4.5 等）
 */
import type { ModelTier } from "./model-pricing.registry";

export interface TierDefaultPrice {
  /** USD per 1M input tokens */
  readonly inputPerM: number;
  /** USD per 1M output tokens */
  readonly outputPerM: number;
}

export const TIER_DEFAULT_PRICING: Record<ModelTier, TierDefaultPrice> = {
  basic: { inputPerM: 0.5, outputPerM: 1.5 },
  standard: { inputPerM: 3, outputPerM: 12 },
  strong: { inputPerM: 15, outputPerM: 60 },
};

/** 新建模型未指定 costTier 时的默认档位——保证模型永远有 tier → 永远被预算护栏覆盖。 */
export const DEFAULT_COST_TIER: ModelTier = "standard";
