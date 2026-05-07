// PR-4' v1.6 D1 reportScale 单一轴 + 物理可达性闸门
//
// 触发：v1.2 / c195035f mission 用户视角 — depth × lengthProfile 多轴 cross-product 把用户搞懵；
// 用户期望"深度洞察 1W+ 字/章"被 v1.2 隐式退让到 [3000, 5000] 没问。
// 修法：单一 reportScale 轴 + 物理可达性矩阵；publication / encyclopedia 灰显（不在本 preset 内启用）。
//
// 见: docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 2.D1 / § 13.1

export type ReportScale =
  | "quick"
  | "standard"
  | "deep"
  | "professional"
  | "publication" // lock-experimental — admin flag 才解锁
  | "encyclopedia"; // lock-experimental — 物理不可达，未来独立 batch job PR

export type ScalePreset = {
  /** 维度（研究方向）数量 */
  dim: number;
  /** 每维度的章节数 */
  chPerDim: number;
  /** 单章字数区间 [min, max]（中文真字符 / 英文字符级，与 countCJKWords 对齐） */
  wordsPerCh: [number, number];
  /** 每章图数（D6 figure-curator 硬合约） */
  figPerCh: number;
  /** 模型档：fast / balanced / premium */
  model: "fast" | "balanced" | "premium";
  /**
   * 单 LLM call maxToken（PR-13 启用 sub-section 拼接时是单 sub-section 的上限，
   * 而非整章；quick / standard 单 call 路径时是整章上限）
   */
  maxTokenPerCh: number;
  /** mission 总预算上限（USD） */
  maxCredits: number;
  /** D4 retry stage 估算成本（USD） */
  stageRetryCost: Record<string, number>;
  /**
   * PR-13 v1.3：单章 sub-section LLM call 数。
   * 1 = 单 LLM call 路径（quick / standard）；
   * ≥ 2 = sub-section 拼接路径（deep / professional），调用 s7-5-sub-section-planner。
   */
  subSectionsPerCh?: number;
  /** PR-13 v1.3：单 sub-section 字数区间（subSectionsPerCh ≥ 2 时使用） */
  wordsPerSubSection?: [number, number];
};

/**
 * v1.6 物理可达性闸门：
 *   quick / standard / deep / professional 全部稳定可达；
 *   publication / encyclopedia 锁定（前端禁选 + tooltip "实验中，请联系管理员开启"），
 *   未来需要独立 PR 启用 streaming 多 LLM call 拼接。
 */
export const SCALE_PRESETS: Record<ReportScale, ScalePreset | undefined> = {
  quick: {
    dim: 3,
    chPerDim: 2,
    wordsPerCh: [800, 1200],
    figPerCh: 0,
    model: "fast",
    maxTokenPerCh: 4_000,
    maxCredits: 0.5,
    stageRetryCost: {
      "s3-5-figure-curator": 0.05,
      "s8-writer-draft-report": 0.1,
      "s8-5-revise-single-chapter": 0.05,
    },
    subSectionsPerCh: 1,
  },
  standard: {
    dim: 5,
    chPerDim: 3,
    wordsPerCh: [1500, 2500],
    figPerCh: 1,
    model: "balanced",
    maxTokenPerCh: 8_000,
    maxCredits: 2,
    stageRetryCost: {
      "s3-5-figure-curator": 0.1,
      "s8-writer-draft-report": 0.3,
      "s8-5-revise-single-chapter": 0.15,
    },
    subSectionsPerCh: 1,
  },
  // PR-13 v1.3 deep：10 章 × 13K 字 = 13 万字（用户定的成功标准）
  deep: {
    dim: 10,
    chPerDim: 1,
    wordsPerCh: [12_000, 15_000],
    figPerCh: 3,
    model: "balanced",
    maxTokenPerCh: 8_000, // 单 sub-section maxToken
    maxCredits: 10,
    stageRetryCost: {
      "s3-5-figure-curator": 0.2,
      "s7-5-sub-section-planner": 0.05,
      "s8-writer-draft-report": 0.3, // per sub-section
      "s8-5-revise-single-chapter": 0.4,
    },
    subSectionsPerCh: 3,
    wordsPerSubSection: [4_000, 5_000],
  },
  // PR-13 v1.3 professional：12 章 × 20K 字 = 24 万字
  professional: {
    dim: 12,
    chPerDim: 1,
    wordsPerCh: [18_000, 22_000],
    figPerCh: 4,
    model: "premium",
    maxTokenPerCh: 8_000, // 单 sub-section maxToken
    maxCredits: 30,
    stageRetryCost: {
      "s3-5-figure-curator": 0.4,
      "s7-5-sub-section-planner": 0.1,
      "s8-writer-draft-report": 0.5, // per sub-section
      "s8-5-revise-single-chapter": 1.0,
    },
    subSectionsPerCh: 4,
    wordsPerSubSection: [4_500, 5_500],
  },
  // 物理不可单 LLM call 完成；解锁需独立未来 PR（多 LLM call 流式拼接 batch job）
  publication: undefined,
  encyclopedia: undefined,
};

/**
 * 用户 tier × scale 闸门：free 用户选 deep 自动 clamp 到 quick；防超付费层级使用。
 *
 * @example
 * clampReportScale("deep", "free")        === "quick"
 * clampReportScale("deep", "pro")         === "deep"
 * clampReportScale("publication", "pro")  === "deep"   // lock-experimental fallback 到该 tier 最高
 */
export function clampReportScale(
  requested: ReportScale,
  userTier: "free" | "pro" | "enterprise",
): ReportScale {
  const ALLOWED_BY_TIER: Record<typeof userTier, ReportScale[]> = {
    free: ["quick"],
    pro: ["quick", "standard", "deep"],
    enterprise: ["quick", "standard", "deep", "professional"],
  };
  const allowed = ALLOWED_BY_TIER[userTier] ?? ["quick"];
  if (!allowed.includes(requested)) {
    return allowed[allowed.length - 1]; // 降到该 tier 最高可达
  }
  return requested;
}

/**
 * 老 mission 反推 reportScale（lengthProfile × depth → reportScale）。
 *
 * v1.6 § 6 RV-2-matrix 18 cross-product 矩阵（lengthProfile 6 × depth 3）：
 *   - publication / encyclopedia 不在反推目标里（lock-experimental）。
 *   - 不可识别组合 fallback 到 standard + warn。
 */
export type LegacyLengthProfile =
  | "brief"
  | "short"
  | "standard"
  | "medium"
  | "long"
  | "extended";
export type LegacyDepth = "shallow" | "standard" | "deep";

const LEGACY_TO_SCALE_MATRIX: Record<
  LegacyLengthProfile,
  Record<LegacyDepth, ReportScale>
> = {
  brief: { shallow: "quick", standard: "quick", deep: "standard" },
  short: { shallow: "quick", standard: "standard", deep: "standard" },
  standard: { shallow: "standard", standard: "standard", deep: "deep" },
  medium: { shallow: "standard", standard: "deep", deep: "deep" },
  long: { shallow: "deep", standard: "deep", deep: "professional" },
  extended: { shallow: "deep", standard: "professional", deep: "professional" },
};

export function deriveScaleFromLegacy(
  lengthProfile: string | undefined,
  depth: string | undefined,
): { scale: ReportScale; warn: boolean } {
  const lp = lengthProfile as LegacyLengthProfile | undefined;
  const dp = depth as LegacyDepth | undefined;
  if (lp && dp && LEGACY_TO_SCALE_MATRIX[lp]?.[dp]) {
    return { scale: LEGACY_TO_SCALE_MATRIX[lp][dp], warn: false };
  }
  return { scale: "standard", warn: true }; // 不识别组合 → 默认 standard + warn
}

/** 给定 scale 返回是否启用 PR-13 sub-section 拼接路径 */
export function usesSubSectionPath(scale: ReportScale): boolean {
  const preset = SCALE_PRESETS[scale];
  return preset !== undefined && (preset.subSectionsPerCh ?? 1) >= 2;
}

/** 给定 scale 返回总章数（dim × chPerDim） */
export function totalChaptersForScale(scale: ReportScale): number {
  const preset = SCALE_PRESETS[scale];
  if (!preset) return 0; // lock-experimental
  return preset.dim * preset.chPerDim;
}
