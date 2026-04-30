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
  // ★ Phase P0-8 用户档位（mission-pipeline-user-profiles.md / D20）
  // 默认值：深度 + 图文 + 中等其他
  depth: z.enum(["quick", "standard", "deep"]).default("deep"),
  language: z.enum(["zh-CN", "en-US"]).default("zh-CN"),
  budgetProfile: z.enum(BUDGET_PROFILE).default("medium"),
  styleProfile: z
    .enum(["academic", "executive", "journalistic", "technical"])
    .default("executive"),
  lengthProfile: z
    .enum(["brief", "standard", "deep", "extended", "epic", "mega"])
    .default("standard"),
  audienceProfile: z
    .enum(["executive", "domain-expert", "general-public"])
    .default("domain-expert"),
  withFigures: z.boolean().default(true),
  auditLayers: z
    .enum(["minimal", "default", "thorough", "paranoid"])
    .default("default"),
  concurrency: z.number().int().min(1).max(10).default(3),
  viewMode: z.enum(["continuous", "chapter", "quick"]).default("continuous"),
  /** @deprecated 保留兼容老前端；新前端用 budgetProfile */
  maxCredits: z.number().int().positive().max(10_000).optional(),
  /**
   * 用户自定义 wall-time（毫秒）。不传则按 depth × audit × budget 矩阵推断（resolveMissionWallTimeMs）。
   * 范围 60s ~ 3h。
   */
  wallTimeMs: z
    .number()
    .int()
    .min(60_000)
    .max(3 * 60 * 60 * 1000)
    .optional(),
  /**
   * 用户自定义 budget 倍率（覆盖 resolveBudgetMultiplier）。范围 0.3 ~ 10。
   */
  budgetMultiplierOverride: z.number().min(0.3).max(10).optional(),
  /**
   * 本地知识库 ID 列表 —— researcher 调 rag-search 时会限定在这些 KB 内做语义召回。
   * 不传 / 空数组 → researcher 跳过 rag-search 走纯 web-search。
   * 上限 10（与 ai-ask / open-api 一致）。
   */
  knowledgeBaseIds: z.array(z.string().uuid()).max(10).optional(),
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

/** 业务方拿这个直接用 —— 已经把 budgetProfile + depth 组合好；用户传 override 时优先 */
export function resolveBudgetMultiplier(input: RunMissionInput): number {
  if (input.budgetMultiplierOverride != null) {
    return input.budgetMultiplierOverride;
  }
  return (
    BUDGET_PROFILE_MULTIPLIER[input.budgetProfile] *
    DEPTH_BUDGET_MULTIPLIER[input.depth]
  );
}

/**
 * Mission 级 wall-time 上限（ms）—— 按 depth × auditLayers × budgetProfile 三维联动。
 *
 * 旧实现固定 30 min，导致 depth=deep + auditLayers=thorough 必然撞墙。
 * 新规则：
 *   base depth: quick=10min / standard=25min / deep=50min
 *   × audit:    minimal=0.7 / default=1.0 / thorough=1.5 / paranoid=2.0
 *   × budget:   low=0.7 / medium=1.0 / high=1.4 / unlimited=2.0
 *   全局 cap:   3 小时（避免无限运行）
 *
 * 实际样例：
 *   quick + minimal + low                       ≈ 5 min
 *   standard + default + medium                 = 25 min
 *   deep + default + medium                     = 50 min  ← 默认深度档现在是 50min
 *   deep + thorough + high                      ≈ 105 min
 *   deep + paranoid + unlimited                 ≈ 200 min → cap 180 min
 */
export function resolveMissionWallTimeMs(input: RunMissionInput): number {
  if (input.wallTimeMs != null) {
    // 用户显式覆盖（DTO 已 cap 到 60s ~ 3h）
    return input.wallTimeMs;
  }
  const depthBase: Record<RunMissionInput["depth"], number> = {
    quick: 10 * 60 * 1000,
    standard: 25 * 60 * 1000,
    deep: 50 * 60 * 1000,
  };
  const auditMul: Record<RunMissionInput["auditLayers"], number> = {
    minimal: 0.7,
    default: 1.0,
    thorough: 1.5,
    paranoid: 2.0,
  };
  const budgetMul: Record<BudgetProfile, number> = {
    low: 0.7,
    medium: 1.0,
    high: 1.4,
    unlimited: 2.0,
  };
  const raw =
    depthBase[input.depth] *
    auditMul[input.auditLayers] *
    budgetMul[input.budgetProfile];
  const cap = 3 * 60 * 60 * 1000; // 3h hard ceiling
  return Math.min(Math.round(raw), cap);
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
