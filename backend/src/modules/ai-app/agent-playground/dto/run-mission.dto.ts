import { z } from "zod";

/**
 * 预算档位 —— 给用户的 4 档选择，映射到 token 上限。
 *   low       → 紧凑（demo / 试跑）       约 50k tokens / mission 上限
 *   medium    → 标准（默认，对应 ~$0.5）   约 200k tokens / mission 上限
 *   high      → 充裕（深度研究 ~$2）       约 600k tokens / mission 上限
 *   unlimited → 不限（仅用 agent 自身预算） 不设 mission-level 上限
 */
export const BUDGET_PROFILE = ["low", "medium", "high", "unlimited"] as const;
export type BudgetProfile = (typeof BUDGET_PROFILE)[number];

/** 每档对应 mission 级 maxCredits（1 credit ≈ 1k token，仅作上限保护，agent 自带 budget 仍生效） */
export const BUDGET_PROFILE_CREDITS: Record<BudgetProfile, number> = {
  low: 50,
  medium: 200,
  high: 600,
  unlimited: 10_000, // 实际上等同不限制（10M tokens）
};

/** 每档对应 agent budget 倍率，scale 每个 agent 的 maxTokens / maxIterations */
export const BUDGET_PROFILE_MULTIPLIER: Record<BudgetProfile, number> = {
  low: 0.6,
  medium: 1.0,
  high: 2.0,
  unlimited: 4.0,
};

export const RunMissionInputSchema = z.object({
  topic: z.string().min(2).max(200),
  depth: z.enum(["quick", "standard", "deep"]).default("standard"),
  language: z.enum(["zh-CN", "en-US"]).default("zh-CN"),
  /**
   * 预算档位（取代 maxCredits 数值输入 — 用户选 4 档更直观）。
   * 老接口兼容：如果传 maxCredits 则按数字走，否则用 budgetProfile。
   */
  budgetProfile: z.enum(BUDGET_PROFILE).default("medium"),
  /** @deprecated 保留兼容老前端；新前端用 budgetProfile */
  maxCredits: z.number().int().positive().max(10_000).optional(),
});

export type RunMissionInput = z.infer<typeof RunMissionInputSchema>;

/** 把 input 解析成最终生效的 maxCredits（兼容 maxCredits 显式传值） */
export function resolveMissionCredits(input: RunMissionInput): number {
  if (input.maxCredits != null) return input.maxCredits;
  return BUDGET_PROFILE_CREDITS[input.budgetProfile];
}

/**
 * depth 对 budget 的二级倍率 —— deep 比 standard 多 40%、quick 少 30%。
 * 与 budgetProfile 倍率"相乘"组合：
 *   final = BUDGET_PROFILE_MULTIPLIER[budgetProfile] × DEPTH_BUDGET_MULTIPLIER[depth]
 *
 * 实际效果（researcher 默认 120k tokens 为基线）：
 *   quick + low       ≈ 120k × 0.6 × 0.7 = 50k    (试跑 / demo)
 *   standard + medium = 120k × 1.0 × 1.0 = 120k   (标准)
 *   deep + high       ≈ 120k × 2.0 × 1.4 = 336k   (深度研究)
 *   deep + unlimited  ≈ 120k × 4.0 × 1.4 = 672k   (长文 / 完整报告)
 */
export const DEPTH_BUDGET_MULTIPLIER: Record<
  "quick" | "standard" | "deep",
  number
> = {
  quick: 0.7,
  standard: 1.0,
  deep: 1.4,
};

/** 业务方拿这个直接用 —— 已经把 budgetProfile + depth 组合好 */
export function resolveBudgetMultiplier(input: RunMissionInput): number {
  return (
    BUDGET_PROFILE_MULTIPLIER[input.budgetProfile] *
    DEPTH_BUDGET_MULTIPLIER[input.depth]
  );
}

export const ResearchReportSchema = z.object({
  title: z.string().min(2),
  summary: z.string().min(20),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        body: z.string(),
        sources: z.array(z.string().url()).optional(),
      }),
    )
    .min(1),
  conclusion: z.string().min(20),
  citations: z.array(z.string().url()).optional(),
});
export type ResearchReport = z.infer<typeof ResearchReportSchema>;
