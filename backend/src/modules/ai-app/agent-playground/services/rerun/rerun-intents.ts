// PR-7 v1.6 D5 rerun 8 意图 + INTENT_STAGES 映射
//
// 设计原则（v1.6 § 2.D5 + § 14 PR13-S8 修订）：
//   1. 8 意图 MECE（含 v1.5 P-A6 补的 change-style/language/audience）
//   2. dispatchRerunIntent 无条件前置 ensureRerunable（除 fresh-research 走 ensureMissionOwnership）
//   3. fresh-research = 创建新 mission + parent_mission_id version chain（不覆盖原 mission）
//   4. revise-chapter 走新 s8-5-revise-single-chapter stage（不重写其他章节）

export type RerunIntent =
  | "extend-length"
  | "add-figures"
  | "revise-chapter"
  | "extend-research"
  | "fresh-research"
  | "change-style"
  | "change-language"
  | "change-audience"
  | "publish-only";

export type StageId = string;

/**
 * 每意图对应的 stage 子集（pipeline 选择性执行）。
 *
 * 现实命名（PR-A2 / 实际项目存在的 stage）：
 *   - s2-leader-plan-mission（不是 v1 文档里写的 s2-leader-add-dim）
 *   - s8-writer-draft-report（不是 v1 文档里写的 s8-writer-single-chapter）
 *   - s3-5-figure-curator (NEW，PR-5)
 *   - s7-5-sub-section-planner (NEW，PR-13)
 *   - s8-5-revise-single-chapter (NEW，本 PR)
 *   - publish-only 沿用 s11-mission-persist
 */
export const INTENT_STAGES: Record<RerunIntent, StageId[]> = {
  "extend-length": [
    "s7-writer-plan-outline",
    "s7-5-sub-section-planner",
    "s8-writer-draft-report",
    "s9-reviewer-critic-l4",
    "s10-leader-foreword-and-signoff",
    "s11-mission-persist",
  ],
  "add-figures": ["s3-5-figure-curator", "s11-mission-persist"],
  "revise-chapter": [
    "s8-5-revise-single-chapter",
    "s9-reviewer-critic-l4",
    "s11-mission-persist",
  ],
  "extend-research": [
    "s2-leader-plan-mission",
    "s3-researcher-collect-findings",
    "s7-writer-plan-outline",
    "s8-writer-draft-report",
    "s11-mission-persist",
  ],
  "fresh-research": [
    "s1-mission-estimate-budget",
    "s2-leader-plan-mission",
    "s3-researcher-collect-findings",
    "s3-5-figure-curator",
    "s4-leader-assess-research",
    "s5-reconciler-cross-dim-fact-check",
    "s6-analyst-synthesize-insights",
    "s7-writer-plan-outline",
    "s7-5-sub-section-planner",
    "s8-writer-draft-report",
    "s9-reviewer-critic-l4",
    "s10-leader-foreword-and-signoff",
    "s11-mission-persist",
  ],
  "change-style": ["s8-writer-draft-report", "s11-mission-persist"],
  "change-language": ["s8-writer-draft-report", "s11-mission-persist"],
  "change-audience": ["s8-writer-draft-report", "s11-mission-persist"],
  "publish-only": ["s11-mission-persist"],
};

/**
 * 意图前端文案（UI 卡片用，不在后端做硬编码品牌名）。
 * 仅用于固定意图的英文 key → 中文说明映射，UI 国际化资源里显示用。
 */
export const INTENT_LABELS: Record<
  RerunIntent,
  { emoji: string; label: string }
> = {
  "extend-length": { emoji: "📏", label: "报告太短，换更长档" },
  "add-figures": { emoji: "🖼️", label: "想加图" },
  "revise-chapter": { emoji: "✏️", label: "这章不满意，修订" },
  "extend-research": { emoji: "➕", label: "想加新维度" },
  "fresh-research": { emoji: "🔄", label: "重新研究（创建新 mission）" },
  "change-style": { emoji: "🎨", label: "换文风" },
  "change-language": { emoji: "🌐", label: "换语言" },
  "change-audience": { emoji: "👥", label: "换受众" },
  "publish-only": { emoji: "💾", label: "持久化已有产物" },
};
