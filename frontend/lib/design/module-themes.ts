/**
 * Module Themes — 每个菜单（模块）的识别色，全站唯一事实源（SSOT）。
 *
 * 设计系统约定（2026-05-22 与用户确认）：
 *   - 骨架统一：圆角(rounded-xl 上限)/弹框外壳/间距/组件复用 全站一致（见标准 21/22）。
 *   - 识别色按模块区分：每个菜单一个主色调，侧边栏激活态 / 模块头部渐变 / 图标 /
 *     强调件 全部读这里，禁止在 feature 里散落硬编码 bg-{hue}-50 / from-x。
 *
 * Tailwind 注意：class 必须是「字面量」才能被扫描保留，故此处全部写全名，
 * 不得用 `bg-${hue}-50` 之类拼接。新增模块时在此补一整行。
 */

export type ModuleKey =
  | 'ask'
  | 'explore'
  | 'library'
  | 'radar'
  | 'insights'
  | 'research'
  | 'discuss'
  | 'planning'
  | 'decision'
  | 'report'
  | 'writing'
  | 'social'
  | 'playground';

export interface ModuleTheme {
  /** Tailwind 色相名（文档/调试用） */
  hue: string;
  /** 激活态浅底（侧边栏激活项 / 选中卡背景） */
  activeBg: string;
  /** 主文字 / 图标强调色（激活态文字、模块标题色） */
  text: string;
  /** 图标强调色（略浅于 text，用于激活图标） */
  icon: string;
  /** 浅底（chip / tag / soft surface） */
  softBg: string;
  /** ring / 边框强调 */
  ring: string;
  /** 状态点 / 进度条 */
  dot: string;
  /** 模块头部图标渐变（MissionDetailFrame brandGradient 用，"from-x to-y"，不含 bg-gradient-*） */
  gradient: string;
}

/**
 * 13 个菜单的色系分配。冷色块=知识与洞察、暖色块=推演决策、绿/品红/玫红/紫=内容与实验。
 * social=rose、playground=violet 为既有强关联，保留。
 */
export const MODULE_THEMES: Record<ModuleKey, ModuleTheme> = {
  ask: {
    hue: 'blue',
    activeBg: 'bg-blue-50',
    text: 'text-blue-700',
    icon: 'text-blue-600',
    softBg: 'bg-blue-50',
    ring: 'ring-blue-200',
    dot: 'bg-blue-500',
    gradient: 'from-blue-500 to-indigo-600',
  },
  explore: {
    hue: 'sky',
    activeBg: 'bg-sky-50',
    text: 'text-sky-700',
    icon: 'text-sky-600',
    softBg: 'bg-sky-50',
    ring: 'ring-sky-200',
    dot: 'bg-sky-500',
    gradient: 'from-sky-500 to-blue-600',
  },
  library: {
    hue: 'teal',
    activeBg: 'bg-teal-50',
    text: 'text-teal-700',
    icon: 'text-teal-600',
    softBg: 'bg-teal-50',
    ring: 'ring-teal-200',
    dot: 'bg-teal-500',
    gradient: 'from-teal-500 to-emerald-600',
  },
  radar: {
    hue: 'cyan',
    activeBg: 'bg-cyan-50',
    text: 'text-cyan-700',
    icon: 'text-cyan-600',
    softBg: 'bg-cyan-50',
    ring: 'ring-cyan-200',
    dot: 'bg-cyan-500',
    gradient: 'from-cyan-500 to-sky-600',
  },
  insights: {
    hue: 'indigo',
    activeBg: 'bg-indigo-50',
    text: 'text-indigo-700',
    icon: 'text-indigo-600',
    softBg: 'bg-indigo-50',
    ring: 'ring-indigo-200',
    dot: 'bg-indigo-500',
    gradient: 'from-indigo-500 to-violet-600',
  },
  research: {
    hue: 'purple',
    activeBg: 'bg-purple-50',
    text: 'text-purple-700',
    icon: 'text-purple-600',
    softBg: 'bg-purple-50',
    ring: 'ring-purple-200',
    dot: 'bg-purple-500',
    gradient: 'from-purple-500 to-fuchsia-600',
  },
  discuss: {
    hue: 'amber',
    activeBg: 'bg-amber-50',
    text: 'text-amber-700',
    icon: 'text-amber-600',
    softBg: 'bg-amber-50',
    ring: 'ring-amber-200',
    dot: 'bg-amber-500',
    gradient: 'from-amber-500 to-orange-600',
  },
  planning: {
    hue: 'orange',
    activeBg: 'bg-orange-50',
    text: 'text-orange-700',
    icon: 'text-orange-600',
    softBg: 'bg-orange-50',
    ring: 'ring-orange-200',
    dot: 'bg-orange-500',
    gradient: 'from-orange-500 to-amber-600',
  },
  decision: {
    hue: 'red',
    activeBg: 'bg-red-50',
    text: 'text-red-700',
    icon: 'text-red-600',
    softBg: 'bg-red-50',
    ring: 'ring-red-200',
    dot: 'bg-red-500',
    gradient: 'from-red-500 to-orange-600',
  },
  report: {
    hue: 'emerald',
    activeBg: 'bg-emerald-50',
    text: 'text-emerald-700',
    icon: 'text-emerald-600',
    softBg: 'bg-emerald-50',
    ring: 'ring-emerald-200',
    dot: 'bg-emerald-500',
    gradient: 'from-emerald-500 to-teal-600',
  },
  writing: {
    hue: 'fuchsia',
    activeBg: 'bg-fuchsia-50',
    text: 'text-fuchsia-700',
    icon: 'text-fuchsia-600',
    softBg: 'bg-fuchsia-50',
    ring: 'ring-fuchsia-200',
    dot: 'bg-fuchsia-500',
    gradient: 'from-fuchsia-500 to-purple-600',
  },
  social: {
    hue: 'rose',
    activeBg: 'bg-rose-50',
    text: 'text-rose-700',
    icon: 'text-rose-600',
    softBg: 'bg-rose-50',
    ring: 'ring-rose-200',
    dot: 'bg-rose-500',
    gradient: 'from-rose-500 to-pink-600',
  },
  playground: {
    hue: 'violet',
    activeBg: 'bg-violet-50',
    text: 'text-violet-700',
    icon: 'text-violet-600',
    softBg: 'bg-violet-50',
    ring: 'ring-violet-200',
    dot: 'bg-violet-500',
    gradient: 'from-violet-500 to-purple-600',
  },
};

export function moduleTheme(key: ModuleKey): ModuleTheme {
  return MODULE_THEMES[key];
}
