// PR-8 v1.6 D5 rerun 8 意图 — 前端 UI 卡片显示
//
// 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 2.D5

export type RerunIntent =
  | 'extend-length'
  | 'add-figures'
  | 'revise-chapter'
  | 'extend-research'
  | 'fresh-research'
  | 'change-style'
  | 'change-language'
  | 'change-audience'
  | 'publish-only';

export type RerunIntentCard = {
  intent: RerunIntent;
  emoji: string;
  label: string;
  description: string;
  /** 是否需要章节选择（revise-chapter 用） */
  requiresChapterSelector?: boolean;
  /** 是否需要参数表单（change-style/language/audience 用） */
  requiresParamForm?: boolean;
  /** 创建新 mission 而非重跑（fresh-research 用） */
  createsNewMission?: boolean;
};

export const RERUN_INTENT_CARDS: RerunIntentCard[] = [
  {
    intent: 'extend-length',
    emoji: '📏',
    label: '报告太短',
    description: '换更长档（升级 reportScale）',
  },
  {
    intent: 'add-figures',
    emoji: '🖼️',
    label: '想加图',
    description: '补图（仅跑 figure-curator + 持久化）',
  },
  {
    intent: 'revise-chapter',
    emoji: '✏️',
    label: '这章不满意',
    description: '修订单章（不动其他章节）',
    requiresChapterSelector: true,
  },
  {
    intent: 'extend-research',
    emoji: '➕',
    label: '想加新维度',
    description: 'leader 加 dim 增量研究',
  },
  {
    intent: 'fresh-research',
    emoji: '🔄',
    label: '重新研究',
    description: '创建新 mission，原 mission 永远保留',
    createsNewMission: true,
  },
  {
    intent: 'change-style',
    emoji: '🎨',
    label: '换文风',
    description: '学术 / 通俗 / 商业',
    requiresParamForm: true,
  },
  {
    intent: 'change-language',
    emoji: '🌐',
    label: '换语言',
    description: '中文 / English / 日本語',
    requiresParamForm: true,
  },
  {
    intent: 'change-audience',
    emoji: '👥',
    label: '换受众',
    description: 'C-level / 工程师 / 大众',
    requiresParamForm: true,
  },
];

/** 通过 intent key 查 card */
export function getRerunIntentCard(
  intent: RerunIntent
): RerunIntentCard | undefined {
  return RERUN_INTENT_CARDS.find((c) => c.intent === intent);
}
