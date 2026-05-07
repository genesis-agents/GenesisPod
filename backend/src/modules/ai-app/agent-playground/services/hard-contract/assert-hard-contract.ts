// PR-6 v1.6 D4 硬合约 — markCompleted 前校验，不达标降级 markCompleted + qualityGap
//
// 核心反转（v1.6 § 2.D4 vs v1）：
//   v1: 硬合约不达标 → mission failed
//   v1.6: 硬合约不达标 → markCompleted + qualityGap（永远不 fail mission，不让用户白付费）
//
// 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 2.D4 / § 14

import type { ReportScale, ScalePreset } from "../../scale-presets";
import { SCALE_PRESETS } from "../../scale-presets";

export type QualityGap = {
  contractKey:
    | "figPerCh"
    | "wordsPerCh"
    | "dimensionsCount"
    | "totalChapters"
    | "citationsPerCh"
    | "subSectionCount";
  expected: string;
  actual: string;
  affectedScope: string;
  retriesAttempted: number;
  userActionsAvailable: Array<
    | "retry-budget-allowed"
    | "downgrade-scale"
    | "accept-as-is"
    | "contact-support"
  >;
};

export type HardContractResult = {
  allPassed: boolean;
  gaps: QualityGap[];
};

export type ChapterContractInput = {
  dimension: string;
  chapterIndex: number;
  wordCount: number;
  figureCount: number;
  citationCount: number;
  /** PR-13: sub-section 路径 = N，单 LLM call 路径 = null */
  subSectionCount: number | null;
};

/**
 * v1.6 § 2.D4 硬合约清单：
 *   - figPerCh ≥ scale.figPerCh
 *   - wordsPerCh ∈ [scale.wordsPerCh.min × 0.7, scale.wordsPerCh.max × 1.5]
 *   - 总章数 = scale.dim × scale.chPerDim ± 1
 *   - withCitations=true → 每章 citations ≥ 1
 *   - PR-13 sub-section path: subSectionCount === scale.subSectionsPerCh
 *
 * 不达标 → 添 qualityGap，不阻 markCompleted。
 */
export function assertHardContract(args: {
  scale: ReportScale;
  withCitations: boolean;
  chapters: ChapterContractInput[];
  retriesAttempted: Record<string, number>;
  budgetRemaining: number;
}): HardContractResult {
  const preset: ScalePreset | undefined = SCALE_PRESETS[args.scale];
  if (!preset) {
    return { allPassed: true, gaps: [] }; // lock-experimental 档位不校验（前端禁选）
  }

  const gaps: QualityGap[] = [];
  const expectedTotal = preset.dim * preset.chPerDim;

  // 1. 总章数（± 1 容差）
  if (Math.abs(args.chapters.length - expectedTotal) > 1) {
    gaps.push({
      contractKey: "totalChapters",
      expected: `${expectedTotal} ± 1`,
      actual: String(args.chapters.length),
      affectedScope: "mission-level",
      retriesAttempted: args.retriesAttempted["s2-leader-plan-mission"] ?? 0,
      userActionsAvailable: budgetActions(args.budgetRemaining, preset),
    });
  }

  // 2. 每章 wordCount 区间（0.7×min, 1.5×max）
  const [minW, maxW] = preset.wordsPerCh;
  const lowBound = Math.round(minW * 0.7);
  const highBound = Math.round(maxW * 1.5);
  const failedWordChapters = args.chapters.filter(
    (c) => c.wordCount < lowBound || c.wordCount > highBound,
  );
  if (failedWordChapters.length > 0) {
    gaps.push({
      contractKey: "wordsPerCh",
      expected: `${lowBound}-${highBound} per chapter`,
      actual: `${failedWordChapters.length} chapters out of range`,
      affectedScope: failedWordChapters
        .map((c) => `${c.dimension}#${c.chapterIndex}`)
        .join(", "),
      retriesAttempted: args.retriesAttempted["s8-writer-draft-report"] ?? 0,
      userActionsAvailable: budgetActions(args.budgetRemaining, preset),
    });
  }

  // 3. figPerCh 硬合约（PR-5 figure-curator 落地后真生效）
  if (preset.figPerCh > 0) {
    const failedFigChapters = args.chapters.filter(
      (c) => c.figureCount < preset.figPerCh,
    );
    if (failedFigChapters.length > 0) {
      gaps.push({
        contractKey: "figPerCh",
        expected: `≥ ${preset.figPerCh} figures per chapter`,
        actual: `${failedFigChapters.length} chapters short on figures`,
        affectedScope: failedFigChapters
          .map(
            (c) => `${c.dimension}#${c.chapterIndex} (figs=${c.figureCount})`,
          )
          .join(", "),
        retriesAttempted: args.retriesAttempted["s3-5-figure-curator"] ?? 0,
        userActionsAvailable: budgetActions(args.budgetRemaining, preset),
      });
    }
  }

  // 4. citations（withCitations=true 时每章 ≥ 1）
  if (args.withCitations) {
    const failedCitChapters = args.chapters.filter((c) => c.citationCount < 1);
    if (failedCitChapters.length > 0) {
      gaps.push({
        contractKey: "citationsPerCh",
        expected: "≥ 1 citation per chapter",
        actual: `${failedCitChapters.length} chapters with zero citations`,
        affectedScope: failedCitChapters
          .map((c) => `${c.dimension}#${c.chapterIndex}`)
          .join(", "),
        retriesAttempted:
          args.retriesAttempted["s3-researcher-collect-findings"] ?? 0,
        userActionsAvailable: budgetActions(args.budgetRemaining, preset),
      });
    }
  }

  // 5. PR-13 sub-section count（deep / professional 路径才校验）
  const expectedSubSec = preset.subSectionsPerCh ?? 1;
  if (expectedSubSec >= 2) {
    const failedSubCh = args.chapters.filter(
      (c) => c.subSectionCount !== expectedSubSec,
    );
    if (failedSubCh.length > 0) {
      gaps.push({
        contractKey: "subSectionCount",
        expected: `${expectedSubSec} sub-sections per chapter`,
        actual: `${failedSubCh.length} chapters with wrong sub-section count`,
        affectedScope: failedSubCh
          .map(
            (c) =>
              `${c.dimension}#${c.chapterIndex} (sub=${c.subSectionCount})`,
          )
          .join(", "),
        retriesAttempted:
          args.retriesAttempted["s7-5-sub-section-planner"] ?? 0,
        userActionsAvailable: budgetActions(args.budgetRemaining, preset),
      });
    }
  }

  return { allPassed: gaps.length === 0, gaps };
}

function budgetActions(
  remaining: number,
  preset: ScalePreset,
): QualityGap["userActionsAvailable"] {
  const actions: QualityGap["userActionsAvailable"] = [
    "accept-as-is",
    "contact-support",
  ];
  // 如果剩余 budget 还能跑一次 retry，提供 retry 选项
  const minRetryCost = Math.min(...Object.values(preset.stageRetryCost));
  if (remaining >= minRetryCost) {
    actions.unshift("retry-budget-allowed");
  }
  return actions;
}
