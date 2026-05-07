// PR-8 v1.6 D1 reportScale 前端常量（与 backend SCALE_PRESETS 对齐）
//
// 仅用于 UI 卡片展示 / 估算成本 / lock-experimental 灰显；不参与运行时决策（运行时由 backend 决定）。
// backend 真正源：backend/src/modules/ai-app/agent-playground/scale-presets.ts
//
// 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 2.D1

export type ReportScale =
  | 'quick'
  | 'standard'
  | 'deep'
  | 'professional'
  | 'publication'
  | 'encyclopedia';

export type ScalePresetSummary = {
  scale: ReportScale;
  emoji: string;
  label: string;
  description: string;
  /** 总章数 */
  totalChapters: number;
  /** 单章字数区间 */
  wordsPerChapter: [number, number];
  /** 总字数估算 */
  totalWordsEstimate: string;
  /** 每章图数 */
  figPerCh: number;
  /** 预算上限（USD） */
  maxCredits: number;
  /** 预计耗时 */
  durationEstimate: string;
  /** 是否锁定（lock-experimental，前端禁选） */
  locked?: boolean;
  /** 锁定时显示的 tooltip */
  lockedTooltip?: string;
};

export const SCALE_PRESET_CARDS: Record<ReportScale, ScalePresetSummary> = {
  quick: {
    scale: 'quick',
    emoji: '⚡',
    label: '快速预览',
    description: '3 维度 × 2 章，5-7K 字总，无图',
    totalChapters: 6,
    wordsPerChapter: [800, 1200],
    totalWordsEstimate: '5-7K 字',
    figPerCh: 0,
    maxCredits: 0.5,
    durationEstimate: '2-5 分钟',
  },
  standard: {
    scale: 'standard',
    emoji: '📄',
    label: '标准报告',
    description: '5 维度 × 3 章，2.5-4 万字，每章 1 图',
    totalChapters: 15,
    wordsPerChapter: [1500, 2500],
    totalWordsEstimate: '25-37K 字',
    figPerCh: 1,
    maxCredits: 2,
    durationEstimate: '10-15 分钟',
  },
  deep: {
    scale: 'deep',
    emoji: '🔬',
    label: '深度洞察',
    description: '10 个研究维度，每章 3 段拼接 13K 真字符 / 3 张图',
    totalChapters: 10,
    wordsPerChapter: [12_000, 15_000],
    totalWordsEstimate: '12-15 万字',
    figPerCh: 3,
    maxCredits: 10,
    durationEstimate: '20-40 分钟',
  },
  professional: {
    scale: 'professional',
    emoji: '🏛️',
    label: '智库旗舰',
    description: '12 个维度，每章 4 段拼接 20K 字 / 4 张图',
    totalChapters: 12,
    wordsPerChapter: [18_000, 22_000],
    totalWordsEstimate: '22-26 万字',
    figPerCh: 4,
    maxCredits: 30,
    durationEstimate: '60-90 分钟',
  },
  publication: {
    scale: 'publication',
    emoji: '📚',
    label: '出版级',
    description: '实验中（admin flag 才解锁）',
    totalChapters: 0,
    wordsPerChapter: [0, 0],
    totalWordsEstimate: 'n/a',
    figPerCh: 0,
    maxCredits: 0,
    durationEstimate: 'n/a',
    locked: true,
    lockedTooltip: '实验中，请联系管理员开启',
  },
  encyclopedia: {
    scale: 'encyclopedia',
    emoji: '📖',
    label: '百科全书',
    description: '实验中（admin flag 才解锁）',
    totalChapters: 0,
    wordsPerChapter: [0, 0],
    totalWordsEstimate: 'n/a',
    figPerCh: 0,
    maxCredits: 0,
    durationEstimate: 'n/a',
    locked: true,
    lockedTooltip: '实验中，请联系管理员开启',
  },
};

/** Tier × scale 闸门（前端只显示，运行时由 backend 决） */
export function isScaleAllowedForTier(
  scale: ReportScale,
  tier: 'free' | 'pro' | 'enterprise'
): boolean {
  const ALLOWED: Record<typeof tier, ReportScale[]> = {
    free: ['quick'],
    pro: ['quick', 'standard', 'deep'],
    enterprise: ['quick', 'standard', 'deep', 'professional'],
  };
  return ALLOWED[tier]?.includes(scale) ?? false;
}
