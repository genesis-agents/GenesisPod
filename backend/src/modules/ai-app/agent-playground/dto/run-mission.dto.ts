import { z } from "zod";
import {
  DEFAULT_SEARCH_TIME_RANGE,
  SEARCH_TIME_RANGE_VALUES,
  type SearchTimeRange,
} from "@/common/search/search-time-range";

/**
 * 预算档位 —— 给前端 UI 选档用的语义标签。
 * ★ 2026-05-06 (P0-K): backend 不再有 BUDGET_PROFILE_CREDITS / _MULTIPLIER 映射。
 *   用户侧（前端 RunMissionDialog）按选档计算 maxCredits + budgetMultiplierOverride
 *   传给 backend；backend 只看 input.maxCredits / input.budgetMultiplierOverride，
 *   不再有任何"内部硬编码默认值"。
 */
export const BUDGET_PROFILE = ["low", "medium", "high", "unlimited"] as const;
export type BudgetProfile = (typeof BUDGET_PROFILE)[number];
export { SEARCH_TIME_RANGE_VALUES };
export type { SearchTimeRange };

export const RunMissionInputSchema = z
  .object({
    topic: z.string().min(2).max(200),
    // ★ Phase P0-8 用户档位（mission-pipeline-user-profiles.md / D20）
    // 默认值：深度 + 图文 + 中等其他
    depth: z.enum(["quick", "standard", "deep"]).default("deep"),
    language: z.enum(["zh-CN", "en-US"]).default("zh-CN"),
    /** UI 档位语义（前端可视化用）；backend 不再据此推导任何数值 */
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
      .enum(["minimal", "default", "thorough", "thorough+"])
      .default("default"),
    concurrency: z.number().int().min(1).max(10).default(3),
    viewMode: z.enum(["continuous", "chapter", "quick"]).default("continuous"),
    searchTimeRange: z
      .enum(SEARCH_TIME_RANGE_VALUES)
      .default(DEFAULT_SEARCH_TIME_RANGE),
    /**
     * ★ P0-K (2026-05-06): mission 级 maxCredits 上限（必填，由用户侧决定）。
     * 1 credit ≈ 1k tokens；前端按 budgetProfile / depth 给推荐值，但用户必须显式传。
     * backend 不再有 fallback 默认值。
     */
    maxCredits: z.number().int().min(10).max(100_000),
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
     * ★ P0-K (2026-05-06): agent budget 倍率（必填，scale agent 的 maxTokens / maxIterations）。
     * 前端按 budgetProfile × depth 给推荐值，用户可改。范围 0.3 ~ 10。
     * backend 不再有 BUDGET_PROFILE_MULTIPLIER × DEPTH_BUDGET_MULTIPLIER 内部硬编码组合。
     */
    budgetMultiplierOverride: z.number().min(0.3).max(10),
    /**
     * 本地知识库 ID 列表 —— researcher 调 rag-search 时会限定在这些 KB 内做语义召回。
     * 不传 / 空数组 → researcher 跳过 rag-search 走纯 web-search。
     * 上限 10（与 ai-ask / open-api 一致）。
     */
    knowledgeBaseIds: z.array(z.string().uuid()).max(10).optional(),
    /**
     * ★ 2026-05-05 增量更新（"更新"按钮 mode='incremental'）：源 mission ID。
     * Dispatcher 启动时载入 source.dimensions + themeSummary 作为本次 plan 跳过 S2 Leader
     * LLM 调用；下游 stage（researcher / writer）按 input.inheritFromMissionId 决定要不
     * 要把上次 reportArtifact 喂进 prompt 做 "在上一次基础上更新" 语义。
     */
    inheritFromMissionId: z.string().uuid().optional(),
  })
  // ★ P2 (2026-05-06): 矛盾组合校验 —— quick 档只跑 1 round，不可能生成 epic/mega
  //   体量的报告；前端应禁止此组合，后端加 refine 兜底防误传。
  .refine(
    (d) =>
      !(
        d.depth === "quick" &&
        (d.lengthProfile === "epic" || d.lengthProfile === "mega")
      ),
    {
      message:
        "depth=quick 与 lengthProfile=epic/mega 矛盾，请换用 standard/deep 档",
    },
  );

export type RunMissionInput = z.infer<typeof RunMissionInputSchema>;

/**
 * ★ P0-K (2026-05-06): 直接返回 input.maxCredits，不再 fallback 内部硬编码默认值。
 * DTO 已强制必填；resolveMissionCredits 仅作 thin getter 保留 API 兼容。
 */
export function resolveMissionCredits(input: RunMissionInput): number {
  return input.maxCredits;
}

/**
 * ★ P0-K (2026-05-06): 直接返回 input.budgetMultiplierOverride，不再有内部
 * BUDGET_PROFILE_MULTIPLIER × DEPTH_BUDGET_MULTIPLIER 矩阵推导。
 * 前端按 budgetProfile × depth 计算推荐值（"用户侧"），后端只接收用户传入。
 */
export function resolveBudgetMultiplier(input: RunMissionInput): number {
  return input.budgetMultiplierOverride;
}

/**
 * Mission 级 wall-time 上限（ms）—— 按 depth × auditLayers × budgetProfile 三维联动。
 *
 * ★ 2026-05-01 (PR-G iter11): standard 25min → 45min
 *   12-stage pipeline 实测耗时（mission 981c0d21 标准档）：4 dim × (researcher
 *   + 5 chapter writer + 5 chapter reviewer + integrator + grader) ≈ 25min；
 *   再叠 reconciler + analyst + writer + critic + leader (S8~S12) ≈ 10-15min；
 *   总计 35-45min，原 25min cap 必然在 S8 writer 阶段撞墙。新档位：
 *
 *   base depth: quick=15min / standard=45min / deep=90min
 *   × audit:    minimal=0.7 / default=1.0 / thorough=1.5 / paranoid=2.0
 *   × budget:   low=0.7 / medium=1.0 / high=1.4 / unlimited=2.0
 *   全局 cap:   3 小时
 *
 * 实际样例：
 *   quick + minimal + low                       ≈ 7 min
 *   standard + default + medium                 = 45 min  ← 默认档（覆盖 12-stage 实测耗时）
 *   deep + default + medium                     = 90 min
 *   deep + thorough + high                      ≈ 189 min → cap 180 min
 *   deep + paranoid + unlimited                 ≈ 360 min → cap 180 min
 */
export function resolveMissionWallTimeMs(input: RunMissionInput): number {
  if (input.wallTimeMs != null) {
    // 用户显式覆盖（DTO 已 cap 到 60s ~ 3h）
    return input.wallTimeMs;
  }
  const depthBase: Record<RunMissionInput["depth"], number> = {
    quick: 15 * 60 * 1000,
    standard: 45 * 60 * 1000,
    deep: 90 * 60 * 1000,
  };
  const auditMul: Record<RunMissionInput["auditLayers"], number> = {
    minimal: 0.7,
    default: 1.0,
    thorough: 1.5,
    "thorough+": 2.0,
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
