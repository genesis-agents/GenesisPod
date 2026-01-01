/**
 * Slides Engine v3.0 - Common Styles
 *
 * 共享样式常量，用于所有模板
 * 设计原则：不同类型的页面应该有明显的视觉差异
 */

// ============================================================================
// Container Styles - 差异化背景
// ============================================================================

/** 标准内容页容器 - 深蓝渐变 */
export const COMMON_CONTAINER = `
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
  font-family: 'Noto Sans SC', sans-serif;
  color: #F8FAFC;
  padding: 0;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
`;

/** 封面页容器 - 深色 + 金色装饰 */
export const COVER_CONTAINER = `
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
  font-family: 'Noto Sans SC', sans-serif;
  color: #F8FAFC;
  padding: 0;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
`;

/** 数据页容器 - 深灰专业风 */
export const DATA_CONTAINER = `
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #111827 0%, #1F2937 100%);
  font-family: 'Noto Sans SC', sans-serif;
  color: #F8FAFC;
  padding: 0;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
`;

/** 对比页容器 - 分割式设计 */
export const COMPARISON_CONTAINER = `
  width: 100%;
  height: 100%;
  background: #0F172A;
  font-family: 'Noto Sans SC', sans-serif;
  color: #F8FAFC;
  padding: 0;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
`;

/** 结论页容器 - 渐变强调 */
export const CONCLUSION_CONTAINER = `
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1E3A5F 0%, #0F172A 50%, #1E293B 100%);
  font-family: 'Noto Sans SC', sans-serif;
  color: #F8FAFC;
  padding: 0;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
`;

// ============================================================================
// Card Styles
// ============================================================================

export const CARD_STYLE = `
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 24px;
  overflow: hidden;
  min-height: 0;
`;

export const CARD_STYLE_HIGHLIGHT = `
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid #D4AF37;
  border-radius: 12px;
  padding: 24px;
  overflow: hidden;
  min-height: 0;
`;

// ============================================================================
// Typography Styles
// ============================================================================

export const STAT_LARGE = `
  font-size: 56px;
  font-weight: 900;
  color: #D4AF37;
  line-height: 1;
`;

export const STAT_MEDIUM = `
  font-size: 32px;
  font-weight: 900;
  color: #3B82F6;
  line-height: 1;
`;

export const TITLE_STYLE = `
  font-size: 36px;
  font-weight: 900;
  margin: 0 0 8px 0;
`;

export const SUBTITLE_STYLE = `
  font-size: 18px;
  color: #94A3B8;
  margin: 0 0 32px 0;
`;

// ============================================================================
// Footer Styles
// ============================================================================

export const FOOTER_STYLE = `
  position: absolute;
  bottom: 24px;
  left: 80px;
  right: 80px;
  font-size: 12px;
  color: #64748B;
`;

// ============================================================================
// Color Constants
// ============================================================================

export const COLORS = {
  primary: "#D4AF37",
  secondary: "#3B82F6",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  purple: "#8B5CF6",
  text: "#F8FAFC",
  textMuted: "#94A3B8",
  textDim: "#64748B",
  border: "#334155",
  background: "#0F172A",
  backgroundLight: "#1E293B",
};

// ============================================================================
// Gradient Constants
// ============================================================================

export const GRADIENTS = {
  primary: "linear-gradient(90deg, #D4AF37, #3B82F6)",
  rainbow: "linear-gradient(90deg, #D4AF37, #3B82F6, #10B981, #8B5CF6)",
  gold: "linear-gradient(135deg, #D4AF37, #B8962E)",
  blue: "linear-gradient(135deg, #3B82F6, #2563EB)",
  green: "linear-gradient(135deg, #10B981, #059669)",
};

// ============================================================================
// Text Overflow Styles (防止文字溢出)
// ============================================================================

export const TEXT_TRUNCATE = `
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const TEXT_CLAMP_2 = `
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

export const TEXT_CLAMP_3 = `
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
`;

export const TEXT_CLAMP_4 = `
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
`;

// ============================================================================
// Content Container Styles (内容容器样式)
// ============================================================================

export const CONTENT_CONTAINER = `
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  flex: 1;
`;

export const FLEX_ROW_CONTAINER = `
  display: flex;
  gap: 24px;
  overflow: hidden;
  min-height: 0;
`;

export const GRID_CONTAINER = `
  display: grid;
  gap: 24px;
  overflow: hidden;
  min-height: 0;
`;
