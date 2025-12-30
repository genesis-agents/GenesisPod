/**
 * Slides Engine v3.0 - Design Tokens
 *
 * 设计系统常量，遵循 Genspark 设计规范
 * 所有模板应使用这些 token 以保持一致性
 */

// ============================================================================
// Canvas Dimensions
// ============================================================================

export const CANVAS = {
  width: 1280,
  height: 720,
} as const;

// ============================================================================
// Color Palette
// ============================================================================

export const COLORS = {
  // 背景色
  bgPrimary: "#0F172A", // Slate 900 - 主背景
  bgSecondary: "#1E293B", // Slate 800 - 卡片背景
  bgTertiary: "#334155", // Slate 700 - 边框/分隔线

  // 强调色
  accentGold: "#D4AF37", // McKinsey 金色
  accentBlue: "#3B82F6", // 蓝色
  accentGreen: "#10B981", // 绿色
  accentPurple: "#8B5CF6", // 紫色
  accentCyan: "#38BDF8", // 青色
  accentAmber: "#F59E0B", // 琥珀色
  accentRed: "#EF4444", // 红色

  // 文字色
  textPrimary: "#F8FAFC", // Slate 50 - 主文字
  textSecondary: "#CBD5E1", // Slate 300 - 次要文字
  textMuted: "#94A3B8", // Slate 400 - 静音文字
  textSubtle: "#64748B", // Slate 500 - 更淡文字

  // 边框色
  borderDefault: "#334155", // Slate 700
  borderLight: "rgba(255, 255, 255, 0.08)",
} as const;

// ============================================================================
// Typography
// ============================================================================

export const TYPOGRAPHY = {
  fontFamily: "'Noto Sans SC', sans-serif",

  // 标题尺寸
  title: {
    h1: { size: "52px", weight: 900, lineHeight: 1.2 },
    h2: { size: "36px", weight: 900, lineHeight: 1.3 },
    h3: { size: "24px", weight: 700, lineHeight: 1.4 },
    h4: { size: "18px", weight: 700, lineHeight: 1.4 },
  },

  // 正文尺寸
  body: {
    large: { size: "18px", weight: 400, lineHeight: 1.6 },
    normal: { size: "16px", weight: 400, lineHeight: 1.6 },
    small: { size: "14px", weight: 400, lineHeight: 1.5 },
    xsmall: { size: "12px", weight: 400, lineHeight: 1.5 },
  },

  // 特殊尺寸
  stat: {
    huge: { size: "72px", weight: 900, lineHeight: 1 },
    large: { size: "56px", weight: 900, lineHeight: 1 },
    medium: { size: "32px", weight: 800, lineHeight: 1.2 },
  },
} as const;

// ============================================================================
// Spacing & Layout
// ============================================================================

export const SPACING = {
  // 页面内边距
  pageTop: 50,
  pageBottom: 80, // 为 footer 留出安全区域
  pageLeft: 80,
  pageRight: 80,

  // 卡片内边距
  cardPadding: 24,

  // 间距
  gap: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
} as const;

// ============================================================================
// Border & Shadow
// ============================================================================

export const EFFECTS = {
  borderRadius: {
    sm: "4px",
    md: "8px",
    lg: "12px",
    full: "50%",
  },

  shadow: {
    card: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
    elevated:
      "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)",
  },
} as const;

// ============================================================================
// Card Variants - 多种卡片背景样式
// ============================================================================

export const CARD_VARIANTS = {
  // 默认暗色卡片
  default: {
    background: "rgba(30, 41, 59, 0.8)",
    border: COLORS.borderDefault,
    headerBg: COLORS.bgPrimary,
  },

  // 带彩色顶部边框的卡片 (Genspark 风格)
  gold: {
    background: "rgba(30, 41, 59, 0.8)",
    border: COLORS.borderDefault,
    topBorder: COLORS.accentGold,
    headerBg: COLORS.bgPrimary,
  },

  blue: {
    background: "rgba(30, 41, 59, 0.8)",
    border: COLORS.borderDefault,
    topBorder: COLORS.accentBlue,
    headerBg: "#1E3A5F", // 深蓝色头部
  },

  green: {
    background: "rgba(30, 41, 59, 0.8)",
    border: COLORS.borderDefault,
    topBorder: COLORS.accentGreen,
    headerBg: "#064E3B", // 深绿色头部
  },

  purple: {
    background: "rgba(30, 41, 59, 0.8)",
    border: COLORS.borderDefault,
    topBorder: COLORS.accentPurple,
    headerBg: "#4C1D95", // 深紫色头部
  },

  cyan: {
    background: "rgba(30, 41, 59, 0.8)",
    border: COLORS.borderDefault,
    topBorder: COLORS.accentCyan,
    headerBg: "#164E63", // 深青色头部
  },

  amber: {
    background: "rgba(30, 41, 59, 0.8)",
    border: COLORS.borderDefault,
    topBorder: COLORS.accentAmber,
    headerBg: "#78350F", // 深琥珀色头部
  },

  red: {
    background: "rgba(30, 41, 59, 0.8)",
    border: COLORS.borderDefault,
    topBorder: COLORS.accentRed,
    headerBg: "#7F1D1D", // 深红色头部
  },

  // 案例卡片 - 带彩色头部 (Genspark 第9页风格)
  caseIndigo: {
    background: "rgba(30, 41, 59, 0.8)",
    border: COLORS.borderDefault,
    headerBg: "#4338CA", // Indigo 700
    headerBorderBottom: "#818CF8",
  },

  caseOrange: {
    background: "rgba(30, 41, 59, 0.8)",
    border: COLORS.borderDefault,
    headerBg: "#C2410C", // Orange 700
    headerBorderBottom: "#FB923C",
  },

  caseEmerald: {
    background: "rgba(30, 41, 59, 0.8)",
    border: COLORS.borderDefault,
    headerBg: "#047857", // Emerald 700
    headerBorderBottom: "#34D399",
  },

  // 高亮卡片 - 金色边框 (重要信息)
  highlight: {
    background: "rgba(212, 175, 55, 0.1)",
    border: "rgba(212, 175, 55, 0.3)",
    headerBg: "transparent",
  },

  // 洞察卡片 - 左侧金色边框
  insight: {
    background: "rgba(30, 41, 59, 0.6)",
    borderLeft: `4px solid ${COLORS.accentGold}`,
    border: COLORS.borderDefault,
  },
} as const;

export type CardVariant = keyof typeof CARD_VARIANTS;

// ============================================================================
// Common Inline Styles
// ============================================================================

export const STYLES = {
  container: `
    width: ${CANVAS.width}px;
    height: ${CANVAS.height}px;
    background: linear-gradient(135deg, ${COLORS.bgPrimary} 0%, ${COLORS.bgSecondary} 100%);
    font-family: ${TYPOGRAPHY.fontFamily};
    color: ${COLORS.textPrimary};
    padding: ${SPACING.pageTop}px ${SPACING.pageRight}px ${SPACING.pageBottom}px ${SPACING.pageLeft}px;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
  `,

  card: `
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid ${COLORS.borderDefault};
    border-radius: ${EFFECTS.borderRadius.lg};
    padding: ${SPACING.cardPadding}px;
  `,

  footer: `
    position: absolute;
    bottom: 24px;
    left: ${SPACING.pageLeft}px;
    right: ${SPACING.pageRight}px;
    font-size: 12px;
    color: ${COLORS.textSubtle};
  `,

  statLarge: `
    font-size: ${TYPOGRAPHY.stat.large.size};
    font-weight: ${TYPOGRAPHY.stat.large.weight};
    color: ${COLORS.accentGold};
    line-height: ${TYPOGRAPHY.stat.large.lineHeight};
  `,

  accentBar: `
    width: 80px;
    height: 4px;
    background: linear-gradient(90deg, ${COLORS.accentGold} 0%, ${COLORS.accentBlue} 100%);
  `,
} as const;

// ============================================================================
// Accent Color Array for Multi-Item Layouts
// ============================================================================

export const ACCENT_COLORS = [
  COLORS.accentGold,
  COLORS.accentBlue,
  COLORS.accentGreen,
  COLORS.accentPurple,
  COLORS.accentCyan,
  COLORS.accentAmber,
] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number];
