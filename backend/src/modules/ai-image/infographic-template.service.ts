import { Injectable, Logger } from "@nestjs/common";
import * as puppeteer from "puppeteer";

// 信息图内容结构
export interface InfographicSection {
  title: string;
  summary?: string;
  bullets: string[];
  metrics: { label: string; value: string; comparison?: string }[];
  iconType?: string;
}

// 支持的设计风格
export type InfographicStyle =
  | "consulting" // 咨询风格：McKinsey/BCG 风格，专业商务
  | "tech" // 科技风格：现代科技感，渐变色
  | "minimal" // 极简风格：大量留白，简洁
  | "creative" // 创意风格：活泼配色，圆角
  | "dark" // 暗黑风格：深色背景
  | "academic" // 学术风格：严谨正式
  | "business"; // 商务简约：专业简洁，蓝灰色调

// 字体风格
export type FontStyle =
  | "sans" // 无衬线：现代感
  | "serif" // 衬线：经典正式
  | "mono" // 等宽：科技感
  | "rounded"; // 圆角：友好亲切

// 模板布局类型
export type TemplateLayout =
  | "cards" // 卡片网格布局（当前默认）
  | "center_visual" // 中心视觉图形 + 周围要点（类似 NotebookLM）
  | "timeline" // 时间线/流程布局
  | "comparison" // 对比布局（左右或上下）
  | "pyramid" // 金字塔/层级布局
  | "radial"; // 放射状布局

export interface InfographicStyleOptions {
  style?: InfographicStyle;
  fontStyle?: FontStyle;
  templateLayout?: TemplateLayout; // 模板布局类型
  borderRadius?: "none" | "small" | "medium" | "large";
  shadowStyle?: "none" | "subtle" | "medium" | "strong";
  iconStyle?: "outline" | "filled" | "duotone";
  // 中心视觉相关配置
  centerVisualTitle?: string; // 中心图形的标题
  centerVisualItems?: string[]; // 中心图形周围的要点
}

export interface InfographicContent {
  title: string;
  subtitle?: string;
  heroStatement?: string;
  sections: InfographicSection[];
  callToAction?: string;
  colorScheme?: {
    primary: string;
    accent: string;
    background: string;
    text: string;
  };
  styleOptions?: InfographicStyleOptions;
}

// 预设风格配置
const STYLE_PRESETS: Record<
  InfographicStyle,
  {
    colors: {
      primary: string;
      accent: string;
      background: string;
      text: string;
    };
    font: string;
    borderRadius: number;
    shadow: string;
  }
> = {
  consulting: {
    colors: {
      primary: "#1e3a5f",
      accent: "#0891b2",
      background: "#f8fafc",
      text: "#334155",
    },
    font: "'Noto Sans SC', 'Microsoft YaHei', sans-serif",
    borderRadius: 12,
    shadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  tech: {
    colors: {
      primary: "#6366f1",
      accent: "#22d3ee",
      background: "#f0f9ff",
      text: "#1e293b",
    },
    font: "'Inter', 'Noto Sans SC', sans-serif",
    borderRadius: 16,
    shadow: "0 4px 20px rgba(99,102,241,0.15)",
  },
  minimal: {
    colors: {
      primary: "#18181b",
      accent: "#a1a1aa",
      background: "#ffffff",
      text: "#3f3f46",
    },
    font: "'Noto Sans SC', 'Helvetica Neue', sans-serif",
    borderRadius: 4,
    shadow: "none",
  },
  creative: {
    colors: {
      primary: "#ec4899",
      accent: "#f59e0b",
      background: "#fdf4ff",
      text: "#581c87",
    },
    font: "'Noto Sans SC', 'Comic Sans MS', sans-serif",
    borderRadius: 24,
    shadow: "0 8px 30px rgba(236,72,153,0.2)",
  },
  dark: {
    colors: {
      primary: "#e2e8f0",
      accent: "#38bdf8",
      background: "#0f172a",
      text: "#cbd5e1",
    },
    font: "'Noto Sans SC', 'Segoe UI', sans-serif",
    borderRadius: 12,
    shadow: "0 4px 20px rgba(0,0,0,0.4)",
  },
  academic: {
    colors: {
      primary: "#1e40af",
      accent: "#059669",
      background: "#fffbeb",
      text: "#1f2937",
    },
    font: "'Noto Serif SC', 'Times New Roman', serif",
    borderRadius: 2,
    shadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  business: {
    colors: {
      primary: "#374151", // 深灰 - 商务稳重
      accent: "#3b82f6", // 蓝色 - 专业信任
      background: "#f9fafb", // 浅灰白 - 干净
      text: "#111827", // 深黑 - 清晰
    },
    font: "'Noto Sans SC', 'Segoe UI', sans-serif",
    borderRadius: 8,
    shadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
};

// 字体映射
const FONT_STYLES: Record<FontStyle, string> = {
  sans: "'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', sans-serif",
  serif: "'Noto Serif SC', 'SimSun', 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Noto Sans SC', 'Consolas', monospace",
  rounded: "'Nunito', 'Noto Sans SC', 'Comic Sans MS', sans-serif",
};

// 图标SVG映射
const ICONS: Record<string, string> = {
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>`,
  briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  lightbulb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 019 14"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  trending: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>`,
};

const DEFAULT_ICON = ICONS.star;

// DeepDive ENGINE 品牌 Logo - 紫色渐变 V 形标志
const DEEPDIVE_LOGO = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8B5CF6"/>
      <stop offset="50%" style="stop-color:#6366F1"/>
      <stop offset="100%" style="stop-color:#3B82F6"/>
    </linearGradient>
  </defs>
  <path d="M8 10 L20 30 L32 10" stroke="url(#logoGradient)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M14 10 L20 22 L26 10" stroke="url(#logoGradient)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.6"/>
</svg>`;

@Injectable()
export class InfographicTemplateService {
  private readonly logger = new Logger(InfographicTemplateService.name);
  private browser: puppeteer.Browser | null = null;

  /**
   * 初始化 Puppeteer 浏览器实例
   * 支持通过环境变量 PUPPETEER_EXECUTABLE_PATH 指定 Chrome/Chromium 路径
   */
  private async getBrowser(): Promise<puppeteer.Browser> {
    if (!this.browser) {
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

      this.logger.log(
        `Launching Puppeteer with executable: ${executablePath || "bundled chromium"}`,
      );

      this.browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath || undefined,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--font-render-hinting=none",
          "--disable-software-rasterizer",
          "--single-process", // 更好的容器兼容性
        ],
      });
    }
    return this.browser;
  }

  /**
   * 清理浏览器实例
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * 获取图标 SVG
   */
  private getIcon(type?: string): string {
    if (!type) return DEFAULT_ICON;
    const normalized = type.toLowerCase().replace(/[^a-z]/g, "");
    return ICONS[normalized] || DEFAULT_ICON;
  }

  /**
   * 生成信息图 HTML
   * 支持多种风格：consulting, tech, minimal, creative, dark, academic
   * 布局：根据宽高比智能调整列数
   */
  generateConsultingInfographicHTML(
    content: InfographicContent,
    backgroundImageBase64?: string,
    width: number = 1200,
    height: number = 800,
  ): string {
    // 获取风格配置
    const styleKey = content.styleOptions?.style || "consulting";
    const stylePreset = STYLE_PRESETS[styleKey] || STYLE_PRESETS.consulting;

    // 优先使用用户指定的颜色，否则使用风格预设
    const colors = {
      primary: content.colorScheme?.primary || stylePreset.colors.primary,
      accent: content.colorScheme?.accent || stylePreset.colors.accent,
      background:
        content.colorScheme?.background || stylePreset.colors.background,
      text: content.colorScheme?.text || stylePreset.colors.text,
    };

    // 获取字体配置
    const fontStyle = content.styleOptions?.fontStyle || "sans";
    const fontFamily = FONT_STYLES[fontStyle] || FONT_STYLES.sans;

    // 获取圆角配置
    const borderRadiusMap = { none: 0, small: 4, medium: 12, large: 24 };
    const baseBorderRadius =
      borderRadiusMap[content.styleOptions?.borderRadius || "medium"] ||
      stylePreset.borderRadius;

    // 获取阴影配置
    const shadowMap = {
      none: "none",
      subtle: "0 1px 3px rgba(0,0,0,0.05)",
      medium: "0 2px 8px rgba(0,0,0,0.08)",
      strong: "0 8px 30px rgba(0,0,0,0.15)",
    };
    const boxShadow =
      shadowMap[content.styleOptions?.shadowStyle || "medium"] ||
      stylePreset.shadow;

    // 暗黑模式特殊处理
    const isDarkMode = styleKey === "dark";
    const cardBackground = isDarkMode ? "#1e293b" : "white";
    const cardBorder = isDarkMode
      ? "rgba(255,255,255,0.1)"
      : "rgba(0,0,0,0.06)";
    const bulletBorderColor = isDarkMode ? "#334155" : "#f1f5f9";

    this.logger.log(
      `[generateInfographicHTML] Using style: ${styleKey}, font: ${fontStyle}, colors: ${JSON.stringify(colors)}`,
    );

    // 计算宽高比
    const aspectRatio = width / height;
    const isWideScreen = aspectRatio >= 1.5; // 16:9 = 1.78, 4:3 = 1.33
    const isVertical = height > width; // 9:16 等竖屏

    // 根据宽高比调整列数和布局策略
    // 宽屏(16:9)：3列布局，但卡片更紧凑，适合2行展示
    // 正方形(1:1)：3列标准布局
    // 竖屏(9:16)：2列展开布局
    const numColumns = isVertical ? 2 : 3;
    const columns = this.distributeToColumns(content.sections, numColumns);

    // 根据尺寸调整字体和间距
    const scale = width / 1200;
    // 宽屏需要稍微紧凑的布局，但不要太极端
    const compactScale = isWideScreen ? 0.85 : 1;
    const padding = Math.round(40 * scale * (isWideScreen ? 0.7 : 1));
    const titleSize = Math.round(32 * scale * (isWideScreen ? 0.9 : 1));
    const subtitleSize = Math.round(16 * scale * (isWideScreen ? 0.9 : 1));
    const sectionTitleSize = Math.round(18 * scale * compactScale);
    const bulletSize = Math.round(14 * scale * compactScale);

    // 根据宽高比调整内容截断长度（宽屏适当缩短但保持可读）
    const summaryMaxLen = isWideScreen ? 45 : 60;
    const bulletMaxLen = isWideScreen ? 35 : 50;
    const bulletsToShow = isWideScreen ? 2 : 3;
    const metricsToShow = isWideScreen ? 1 : 2;

    // 动态背景样式（支持暗黑模式的遮罩颜色）
    const overlayColor = isDarkMode
      ? "rgba(15, 23, 42, 0.92)"
      : "rgba(247, 249, 252, 0.92)";
    const backgroundStyle = backgroundImageBase64
      ? `background-image: linear-gradient(${overlayColor}, ${overlayColor}), url(${backgroundImageBase64});
         background-size: cover;
         background-position: center;`
      : `background: ${colors.background};`;

    // 计算动态圆角
    const scaledBorderRadius = Math.round(
      baseBorderRadius * scale * (isWideScreen ? 0.7 : 1),
    );

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${width}">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Serif+SC:wght@400;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Nunito:wght@400;600;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: ${fontFamily};
      ${backgroundStyle}
      color: ${colors.text};
      width: ${width}px;
      height: ${height}px;
      padding: 0;
      overflow: hidden;
    }

    .infographic {
      padding: ${padding}px;
      height: 100%;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }

    /* 顶部品牌栏 */
    .brand-bar {
      display: flex;
      align-items: center;
      gap: ${Math.round(8 * scale)}px;
      margin-bottom: ${Math.round((isWideScreen ? 8 : 16) * scale)}px;
      padding: 0 4px;
      flex-shrink: 0;
    }

    .brand-logo {
      width: ${Math.round((isWideScreen ? 20 : 28) * scale)}px;
      height: ${Math.round((isWideScreen ? 20 : 28) * scale)}px;
      color: ${colors.primary};
    }

    .brand-name {
      font-size: ${Math.round((isWideScreen ? 11 : 14) * scale)}px;
      font-weight: 600;
      color: ${colors.primary};
      letter-spacing: 0.5px;
    }

    /* 顶部标题区 */
    .header {
      background: linear-gradient(135deg, ${colors.primary} 0%, ${this.adjustColor(colors.primary, 20)} 100%);
      color: white;
      padding: ${Math.round((isWideScreen ? 18 : 28) * scale)}px ${Math.round((isWideScreen ? 28 : 36) * scale)}px;
      border-radius: ${Math.round((isWideScreen ? 10 : 12) * scale)}px;
      margin-bottom: ${Math.round((isWideScreen ? 16 : 28) * scale)}px;
      position: relative;
      overflow: hidden;
      flex-shrink: 0;
    }

    .header::before {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: ${Math.round(300 * scale)}px;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1));
    }

    .header-content {
      position: relative;
      z-index: 1;
    }

    .main-title {
      font-size: ${titleSize}px;
      font-weight: 700;
      margin-bottom: ${Math.round((isWideScreen ? 4 : 6) * scale)}px;
      line-height: 1.2;
    }

    .subtitle {
      font-size: ${subtitleSize}px;
      opacity: 0.9;
      font-weight: 400;
    }

    .hero-statement {
      margin-top: ${Math.round((isWideScreen ? 10 : 14) * scale)}px;
      padding: ${Math.round((isWideScreen ? 8 : 10) * scale)}px ${Math.round((isWideScreen ? 12 : 16) * scale)}px;
      background: rgba(255,255,255,0.15);
      border-left: 3px solid ${colors.accent};
      border-radius: 0 ${Math.round(6 * scale)}px ${Math.round(6 * scale)}px 0;
      font-size: ${Math.round((isWideScreen ? 12 : 14) * scale)}px;
      font-style: italic;
      max-width: ${isWideScreen ? "100%" : "80%"};
    }

    /* 动态列布局 */
    .columns {
      display: grid;
      grid-template-columns: repeat(${numColumns}, 1fr);
      gap: ${Math.round((isWideScreen ? 16 : 24) * scale)}px;
      flex: 1;
      min-height: 0;
      align-content: start;
      overflow: hidden;
    }

    .column {
      display: flex;
      flex-direction: column;
      gap: ${Math.round((isWideScreen ? 12 : 20) * scale)}px;
    }

    /* Section 卡片 */
    .section-card {
      background: ${cardBackground};
      border-radius: ${scaledBorderRadius}px;
      padding: ${Math.round((isWideScreen ? 16 : 24) * scale)}px;
      box-shadow: ${boxShadow};
      border: 1px solid ${cardBorder};
      transition: transform 0.2s, box-shadow 0.2s;
      overflow: hidden;
    }

    .section-header {
      display: flex;
      align-items: flex-start;
      gap: ${Math.round((isWideScreen ? 10 : 14) * scale)}px;
      margin-bottom: ${Math.round((isWideScreen ? 10 : 16) * scale)}px;
    }

    .section-icon {
      width: ${Math.round((isWideScreen ? 36 : 44) * scale)}px;
      height: ${Math.round((isWideScreen ? 36 : 44) * scale)}px;
      min-width: ${Math.round((isWideScreen ? 36 : 44) * scale)}px;
      background: linear-gradient(135deg, ${colors.primary} 0%, ${this.adjustColor(colors.primary, 15)} 100%);
      border-radius: ${Math.round((isWideScreen ? 8 : 10) * scale)}px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }

    .section-icon svg {
      width: ${Math.round((isWideScreen ? 18 : 24) * scale)}px;
      height: ${Math.round((isWideScreen ? 18 : 24) * scale)}px;
    }

    .section-number {
      position: absolute;
      top: ${Math.round(-4 * scale)}px;
      right: ${Math.round(-4 * scale)}px;
      width: ${Math.round((isWideScreen ? 18 : 22) * scale)}px;
      height: ${Math.round((isWideScreen ? 18 : 22) * scale)}px;
      background: ${colors.accent};
      color: white;
      border-radius: 50%;
      font-size: ${Math.round((isWideScreen ? 10 : 12) * scale)}px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .section-icon-wrapper {
      position: relative;
    }

    .section-title {
      font-size: ${sectionTitleSize}px;
      font-weight: 700;
      color: ${colors.primary};
      line-height: 1.3;
    }

    .section-summary {
      font-size: ${bulletSize}px;
      color: #64748b;
      margin-top: ${Math.round(2 * scale)}px;
      line-height: 1.4;
    }

    /* 要点列表 */
    .bullets {
      list-style: none;
      margin-bottom: ${Math.round((isWideScreen ? 10 : 16) * scale)}px;
    }

    .bullet-item {
      display: flex;
      align-items: flex-start;
      gap: ${Math.round((isWideScreen ? 8 : 10) * scale)}px;
      padding: ${Math.round((isWideScreen ? 5 : 8) * scale)}px 0;
      font-size: ${bulletSize}px;
      line-height: 1.4;
      border-bottom: 1px solid ${bulletBorderColor};
    }

    .bullet-item:last-child {
      border-bottom: none;
    }

    .bullet-dot {
      width: ${Math.round((isWideScreen ? 6 : 8) * scale)}px;
      height: ${Math.round((isWideScreen ? 6 : 8) * scale)}px;
      min-width: ${Math.round((isWideScreen ? 6 : 8) * scale)}px;
      background: ${colors.accent};
      border-radius: 50%;
      margin-top: ${Math.round((isWideScreen ? 5 : 6) * scale)}px;
    }

    /* 指标展示 */
    .metrics {
      display: flex;
      flex-wrap: wrap;
      gap: ${Math.round((isWideScreen ? 8 : 12) * scale)}px;
    }

    .metric {
      background: linear-gradient(135deg, ${colors.primary}08 0%, ${colors.primary}15 100%);
      border: 1px solid ${colors.primary}20;
      border-radius: ${Math.round((isWideScreen ? 6 : 8) * scale)}px;
      padding: ${Math.round((isWideScreen ? 8 : 12) * scale)}px ${Math.round((isWideScreen ? 12 : 16) * scale)}px;
      flex: 1;
      min-width: ${Math.round((isWideScreen ? 80 : 100) * scale)}px;
    }

    .metric-value {
      font-size: ${Math.round((isWideScreen ? 18 : 24) * scale)}px;
      font-weight: 700;
      color: ${colors.primary};
      line-height: 1.2;
    }

    .metric-label {
      font-size: ${Math.round((isWideScreen ? 10 : 12) * scale)}px;
      color: #64748b;
      margin-top: ${Math.round(2 * scale)}px;
    }

    .metric-comparison {
      font-size: ${Math.round((isWideScreen ? 9 : 11) * scale)}px;
      color: ${colors.accent};
      font-weight: 600;
      margin-top: ${Math.round(2 * scale)}px;
    }

    /* 底部行动号召 */
    .cta {
      background: linear-gradient(135deg, ${colors.accent} 0%, ${this.adjustColor(colors.accent, -15)} 100%);
      color: white;
      text-align: center;
      padding: ${Math.round((isWideScreen ? 14 : 20) * scale)}px ${Math.round((isWideScreen ? 30 : 40) * scale)}px;
      border-radius: ${Math.round((isWideScreen ? 10 : 12) * scale)}px;
      font-size: ${Math.round((isWideScreen ? 14 : 18) * scale)}px;
      font-weight: 600;
      margin-top: ${Math.round((isWideScreen ? 12 : 16) * scale)}px;
      flex-shrink: 0;
    }

    /* 水印/品牌 */
    .watermark {
      text-align: center;
      margin-top: ${Math.round(24 * scale)}px;
      font-size: ${Math.round(12 * scale)}px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="infographic">
    <!-- 品牌栏 -->
    <div class="brand-bar">
      <div class="brand-logo">${DEEPDIVE_LOGO}</div>
      <span class="brand-name">DeepDive AI</span>
    </div>

    <!-- 标题区 -->
    <div class="header">
      <div class="header-content">
        <h1 class="main-title">${this.escapeHtml(content.title)}</h1>
        ${content.subtitle ? `<p class="subtitle">${this.escapeHtml(content.subtitle)}</p>` : ""}
        ${content.heroStatement ? `<div class="hero-statement">${this.escapeHtml(content.heroStatement)}</div>` : ""}
      </div>
    </div>

    <!-- 动态列内容 -->
    <div class="columns">
      ${columns
        .map(
          (column, colIdx) => `
        <div class="column">
          ${column
            .map(
              (section, idx) => `
            <div class="section-card">
              <div class="section-header">
                <div class="section-icon-wrapper">
                  <div class="section-icon">
                    ${this.getIcon(section.iconType)}
                  </div>
                  <span class="section-number">${colIdx * Math.ceil(content.sections.length / numColumns) + idx + 1}</span>
                </div>
                <div>
                  <h3 class="section-title">${this.escapeHtml(this.truncateText(section.title, isWideScreen ? 25 : 40))}</h3>
                  ${section.summary ? `<p class="section-summary">${this.escapeHtml(this.truncateText(section.summary, summaryMaxLen))}</p>` : ""}
                </div>
              </div>

              ${
                section.bullets.length > 0
                  ? `
                <ul class="bullets">
                  ${section.bullets
                    .slice(0, bulletsToShow)
                    .map(
                      (bullet) => `
                    <li class="bullet-item">
                      <span class="bullet-dot"></span>
                      <span>${this.escapeHtml(this.truncateText(bullet, bulletMaxLen))}</span>
                    </li>
                  `,
                    )
                    .join("")}
                </ul>
              `
                  : ""
              }

              ${
                section.metrics.length > 0
                  ? `
                <div class="metrics">
                  ${section.metrics
                    .slice(0, metricsToShow)
                    .map(
                      (metric) => `
                    <div class="metric">
                      <div class="metric-value">${this.escapeHtml(metric.value)}</div>
                      <div class="metric-label">${this.escapeHtml(this.truncateText(metric.label, isWideScreen ? 15 : 20))}</div>
                    </div>
                  `,
                    )
                    .join("")}
                </div>
              `
                  : ""
              }
            </div>
          `,
            )
            .join("")}
        </div>
      `,
        )
        .join("")}
    </div>

    <!-- 行动号召 -->
    ${content.callToAction ? `<div class="cta">${this.escapeHtml(this.truncateText(content.callToAction, isWideScreen ? 50 : 80))}</div>` : ""}
  </div>
</body>
</html>`;
  }

  /**
   * 将 sections 分配到多列
   */
  private distributeToColumns(
    sections: InfographicSection[],
    numColumns: number,
  ): InfographicSection[][] {
    const columns: InfographicSection[][] = Array.from(
      { length: numColumns },
      () => [],
    );

    // 简单的轮询分配
    sections.forEach((section, idx) => {
      columns[idx % numColumns].push(section);
    });

    return columns;
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    const escapeMap: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return text.replace(/[&<>"']/g, (char) => escapeMap[char]);
  }

  /**
   * 处理文本（不再截断，完整显示）
   */
  private truncateText(text: string, _maxLength: number): string {
    // 不再截断文本，完整显示所有内容
    return text;
  }

  /**
   * 调整颜色亮度
   */
  private adjustColor(hex: string, amount: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }

  /**
   * 将 HTML 渲染为 PNG 图片（Base64）
   * 严格按照指定的 width x height 尺寸渲染
   */
  async renderToImage(
    html: string,
    width: number = 1200,
    height: number = 800,
  ): Promise<string> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    this.logger.log(
      `[renderToImage] Rendering with dimensions: ${width}x${height}`,
    );

    try {
      // 设置视口为目标尺寸
      await page.setViewport({ width, height, deviceScaleFactor: 2 });

      // 加载 HTML
      await page.setContent(html, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      // 等待字体加载
      await page.evaluate(() => document.fonts.ready);

      // 截图 - 使用 clip 确保精确尺寸，不使用 fullPage
      const screenshot = await page.screenshot({
        type: "png",
        encoding: "base64",
        clip: {
          x: 0,
          y: 0,
          width: width,
          height: height,
        },
      });

      this.logger.log(
        `[renderToImage] Screenshot completed with exact dimensions: ${width}x${height}`,
      );

      return `data:image/png;base64,${screenshot}`;
    } finally {
      await page.close();
    }
  }

  /**
   * 从 AI 分析结果生成信息图
   * 这是主要入口方法
   */
  /**
   * 生成中心视觉布局 HTML（类似 NotebookLM 风格）
   * 中心是一个大的视觉图形，周围环绕着关键要点
   */
  generateCenterVisualHTML(
    content: InfographicContent,
    backgroundImageBase64?: string,
    width: number = 1200,
    height: number = 800,
  ): string {
    const styleKey = content.styleOptions?.style || "consulting";
    const stylePreset = STYLE_PRESETS[styleKey] || STYLE_PRESETS.consulting;

    const colors = {
      primary: content.colorScheme?.primary || stylePreset.colors.primary,
      accent: content.colorScheme?.accent || stylePreset.colors.accent,
      background:
        content.colorScheme?.background || stylePreset.colors.background,
      text: content.colorScheme?.text || stylePreset.colors.text,
    };

    const fontStyle = content.styleOptions?.fontStyle || "sans";
    const fontFamily = FONT_STYLES[fontStyle] || FONT_STYLES.sans;
    const isDarkMode = styleKey === "dark";

    const scale = width / 1200;
    const padding = Math.round(40 * scale);
    const titleSize = Math.round(36 * scale);
    const subtitleSize = Math.round(18 * scale);

    // 中心视觉配置
    const centerTitle =
      content.styleOptions?.centerVisualTitle || content.title;
    const centerItems =
      content.styleOptions?.centerVisualItems ||
      content.sections.slice(0, 6).map((s) => s.title);

    const overlayColor = isDarkMode
      ? "rgba(15, 23, 42, 0.92)"
      : "rgba(247, 249, 252, 0.92)";
    const backgroundStyle = backgroundImageBase64
      ? `background-image: linear-gradient(${overlayColor}, ${overlayColor}), url(${backgroundImageBase64});
         background-size: cover;
         background-position: center;`
      : `background: ${colors.background};`;

    // 生成中心图形周围的要点位置
    const itemCount = Math.min(centerItems.length, 8);
    const angleStep = (2 * Math.PI) / itemCount;
    // 中心圆形的半径
    const centerRadius = Math.min(width, height) * 0.18;
    // 环绕要点的轨道半径（从中心到要点卡片中心的距离）
    const orbitRadius = centerRadius + Math.round(120 * scale);

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: ${fontFamily};
      ${backgroundStyle}
      color: ${colors.text};
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
    }

    .container {
      padding: ${padding}px;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    /* 品牌栏 */
    .brand-bar {
      display: flex;
      align-items: center;
      gap: ${Math.round(8 * scale)}px;
      margin-bottom: ${Math.round(16 * scale)}px;
    }

    .brand-logo {
      width: ${Math.round(28 * scale)}px;
      height: ${Math.round(28 * scale)}px;
      color: ${colors.primary};
    }

    .brand-name {
      font-size: ${Math.round(14 * scale)}px;
      font-weight: 600;
      color: ${colors.primary};
    }

    /* 标题区 */
    .header {
      text-align: center;
      margin-bottom: ${Math.round(20 * scale)}px;
    }

    .main-title {
      font-size: ${titleSize}px;
      font-weight: 700;
      color: ${colors.primary};
      margin-bottom: ${Math.round(8 * scale)}px;
    }

    .subtitle {
      font-size: ${subtitleSize}px;
      color: ${isDarkMode ? "#94a3b8" : "#64748b"};
    }

    /* 中心视觉区域 */
    .visual-area {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* 中心圆形图形 */
    .center-visual {
      width: ${Math.round(centerRadius * 2)}px;
      height: ${Math.round(centerRadius * 2)}px;
      border-radius: 50%;
      background: linear-gradient(135deg, ${colors.primary} 0%, ${this.adjustColor(colors.primary, 30)} 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 20px 60px ${colors.primary}40;
      z-index: 10;
    }

    .center-visual::before {
      content: '';
      position: absolute;
      inset: -${Math.round(15 * scale)}px;
      border-radius: 50%;
      border: 2px dashed ${colors.accent}60;
    }

    .center-visual::after {
      content: '';
      position: absolute;
      inset: -${Math.round(35 * scale)}px;
      border-radius: 50%;
      border: 1px solid ${colors.primary}20;
    }

    .center-title {
      color: white;
      font-size: ${Math.round(24 * scale)}px;
      font-weight: 700;
      text-align: center;
      padding: ${Math.round(20 * scale)}px;
      line-height: 1.3;
    }

    /* 周围要点 */
    .orbit-item {
      position: absolute;
      background: ${isDarkMode ? "#1e293b" : "white"};
      border-radius: ${Math.round(12 * scale)}px;
      padding: ${Math.round(12 * scale)}px ${Math.round(18 * scale)}px;
      box-shadow: 0 4px 20px ${isDarkMode ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.08)"};
      border: 1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"};
      max-width: ${Math.round(180 * scale)}px;
      text-align: center;
      transform: translate(-50%, -50%);
    }

    .orbit-item .number {
      width: ${Math.round(24 * scale)}px;
      height: ${Math.round(24 * scale)}px;
      background: ${colors.accent};
      color: white;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: ${Math.round(12 * scale)}px;
      font-weight: 700;
      margin-bottom: ${Math.round(6 * scale)}px;
    }

    .orbit-item .text {
      font-size: ${Math.round(13 * scale)}px;
      color: ${colors.text};
      font-weight: 500;
      line-height: 1.4;
    }

    /* 连接线 */
    .connector {
      position: absolute;
      width: 2px;
      background: linear-gradient(to bottom, ${colors.accent}60, transparent);
      transform-origin: top center;
    }

    /* 底部时间线/步骤 */
    .bottom-timeline {
      display: flex;
      justify-content: center;
      gap: ${Math.round(30 * scale)}px;
      margin-top: ${Math.round(20 * scale)}px;
      padding: ${Math.round(16 * scale)}px;
      background: ${isDarkMode ? "rgba(30,41,59,0.8)" : "rgba(255,255,255,0.8)"};
      border-radius: ${Math.round(12 * scale)}px;
    }

    .timeline-step {
      display: flex;
      align-items: center;
      gap: ${Math.round(8 * scale)}px;
    }

    .step-icon {
      width: ${Math.round(32 * scale)}px;
      height: ${Math.round(32 * scale)}px;
      background: ${colors.primary};
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .step-icon svg {
      width: ${Math.round(16 * scale)}px;
      height: ${Math.round(16 * scale)}px;
    }

    .step-text {
      font-size: ${Math.round(13 * scale)}px;
      color: ${colors.text};
      font-weight: 500;
    }

    .step-arrow {
      color: ${colors.accent};
      font-size: ${Math.round(20 * scale)}px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand-bar">
      <div class="brand-logo">${DEEPDIVE_LOGO}</div>
      <span class="brand-name">DeepDive AI</span>
    </div>

    <div class="header">
      <h1 class="main-title">${this.escapeHtml(content.title)}</h1>
      ${content.subtitle ? `<p class="subtitle">${this.escapeHtml(content.subtitle)}</p>` : ""}
    </div>

    <div class="visual-area">
      <div class="center-visual">
        <span class="center-title">${this.escapeHtml(centerTitle)}</span>
      </div>

      ${centerItems
        .map((item, idx) => {
          // 从顶部开始（-PI/2），均匀分布
          const angle = angleStep * idx - Math.PI / 2;
          // 计算相对于 visual-area 中心的位置（百分比）
          const xPercent =
            50 + Math.cos(angle) * (orbitRadius / (width - padding * 2)) * 100;
          const yPercent =
            50 +
            Math.sin(angle) *
              (orbitRadius / (height - padding * 2 - 100 * scale)) *
              100;
          return `
          <div class="orbit-item" style="left: ${xPercent}%; top: ${yPercent}%;">
            <div class="number">${idx + 1}</div>
            <div class="text">${this.escapeHtml(item)}</div>
          </div>
        `;
        })
        .join("")}
    </div>

    ${
      content.sections.length > 0 && content.sections[0].metrics?.length > 0
        ? `
    <div class="bottom-timeline">
      ${content.sections
        .slice(0, 4)
        .map(
          (section, idx) => `
        <div class="timeline-step">
          <div class="step-icon">${this.getIcon(section.iconType)}</div>
          <span class="step-text">${this.escapeHtml(section.title)}</span>
        </div>
        ${idx < Math.min(content.sections.length, 4) - 1 ? '<span class="step-arrow">→</span>' : ""}
      `,
        )
        .join("")}
    </div>
    `
        : ""
    }
  </div>
</body>
</html>`;
  }

  /**
   * 生成时间线布局 HTML
   * 适合流程、步骤、发展历程等内容
   */
  generateTimelineHTML(
    content: InfographicContent,
    backgroundImageBase64?: string,
    width: number = 1200,
    height: number = 800,
  ): string {
    const styleKey = content.styleOptions?.style || "consulting";
    const stylePreset = STYLE_PRESETS[styleKey] || STYLE_PRESETS.consulting;

    const colors = {
      primary: content.colorScheme?.primary || stylePreset.colors.primary,
      accent: content.colorScheme?.accent || stylePreset.colors.accent,
      background:
        content.colorScheme?.background || stylePreset.colors.background,
      text: content.colorScheme?.text || stylePreset.colors.text,
    };

    const fontStyle = content.styleOptions?.fontStyle || "sans";
    const fontFamily = FONT_STYLES[fontStyle] || FONT_STYLES.sans;
    const isDarkMode = styleKey === "dark";

    const scale = width / 1200;
    const padding = Math.round(40 * scale);
    const isVertical = height > width;

    const overlayColor = isDarkMode
      ? "rgba(15, 23, 42, 0.92)"
      : "rgba(247, 249, 252, 0.92)";
    const backgroundStyle = backgroundImageBase64
      ? `background-image: linear-gradient(${overlayColor}, ${overlayColor}), url(${backgroundImageBase64});
         background-size: cover;
         background-position: center;`
      : `background: ${colors.background};`;

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: ${fontFamily};
      ${backgroundStyle}
      color: ${colors.text};
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
    }

    .container {
      padding: ${padding}px;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .brand-bar {
      display: flex;
      align-items: center;
      gap: ${Math.round(8 * scale)}px;
      margin-bottom: ${Math.round(12 * scale)}px;
    }

    .brand-logo {
      width: ${Math.round(24 * scale)}px;
      height: ${Math.round(24 * scale)}px;
      color: ${colors.primary};
    }

    .brand-name {
      font-size: ${Math.round(12 * scale)}px;
      font-weight: 600;
      color: ${colors.primary};
    }

    .header {
      background: linear-gradient(135deg, ${colors.primary} 0%, ${this.adjustColor(colors.primary, 20)} 100%);
      color: white;
      padding: ${Math.round(24 * scale)}px ${Math.round(32 * scale)}px;
      border-radius: ${Math.round(12 * scale)}px;
      margin-bottom: ${Math.round(24 * scale)}px;
      text-align: center;
    }

    .main-title {
      font-size: ${Math.round(28 * scale)}px;
      font-weight: 700;
      margin-bottom: ${Math.round(6 * scale)}px;
    }

    .subtitle {
      font-size: ${Math.round(14 * scale)}px;
      opacity: 0.9;
    }

    .timeline-container {
      flex: 1;
      display: flex;
      ${isVertical ? "flex-direction: column;" : "flex-direction: row;"}
      align-items: ${isVertical ? "flex-start" : "center"};
      justify-content: space-between;
      position: relative;
      padding: ${Math.round(20 * scale)}px 0;
    }

    /* 时间线主轴 */
    .timeline-axis {
      position: absolute;
      ${
        isVertical
          ? `
        left: ${Math.round(40 * scale)}px;
        top: 0;
        bottom: 0;
        width: 4px;
      `
          : `
        left: 0;
        right: 0;
        top: 50%;
        height: 4px;
        transform: translateY(-50%);
      `
      }
      background: linear-gradient(${isVertical ? "to bottom" : "to right"}, ${colors.primary}, ${colors.accent});
      border-radius: 2px;
    }

    .timeline-item {
      display: flex;
      ${isVertical ? "flex-direction: row;" : "flex-direction: column;"}
      align-items: ${isVertical ? "flex-start" : "center"};
      position: relative;
      ${isVertical ? `padding-left: ${Math.round(80 * scale)}px;` : ""}
      flex: 1;
    }

    .timeline-node {
      width: ${Math.round(48 * scale)}px;
      height: ${Math.round(48 * scale)}px;
      background: ${isDarkMode ? "#1e293b" : "white"};
      border: 3px solid ${colors.primary};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${colors.primary};
      z-index: 2;
      ${
        isVertical
          ? `
        position: absolute;
        left: ${Math.round(16 * scale)}px;
      `
          : ""
      }
    }

    .timeline-node svg {
      width: ${Math.round(24 * scale)}px;
      height: ${Math.round(24 * scale)}px;
    }

    .timeline-content {
      background: ${isDarkMode ? "#1e293b" : "white"};
      border-radius: ${Math.round(12 * scale)}px;
      padding: ${Math.round(16 * scale)}px;
      box-shadow: 0 4px 20px ${isDarkMode ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.08)"};
      border: 1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"};
      ${isVertical ? "" : `margin-top: ${Math.round(20 * scale)}px;`}
      max-width: ${Math.round((isVertical ? 300 : 200) * scale)}px;
    }

    .timeline-title {
      font-size: ${Math.round(16 * scale)}px;
      font-weight: 700;
      color: ${colors.primary};
      margin-bottom: ${Math.round(8 * scale)}px;
    }

    .timeline-summary {
      font-size: ${Math.round(13 * scale)}px;
      color: ${isDarkMode ? "#94a3b8" : "#64748b"};
      line-height: 1.5;
      margin-bottom: ${Math.round(8 * scale)}px;
    }

    .timeline-bullets {
      list-style: none;
    }

    .timeline-bullet {
      font-size: ${Math.round(12 * scale)}px;
      color: ${colors.text};
      padding: ${Math.round(4 * scale)}px 0;
      display: flex;
      align-items: flex-start;
      gap: ${Math.round(6 * scale)}px;
    }

    .bullet-dot {
      width: ${Math.round(6 * scale)}px;
      height: ${Math.round(6 * scale)}px;
      background: ${colors.accent};
      border-radius: 50%;
      margin-top: ${Math.round(5 * scale)}px;
      flex-shrink: 0;
    }

    .cta {
      background: linear-gradient(135deg, ${colors.accent} 0%, ${this.adjustColor(colors.accent, -15)} 100%);
      color: white;
      text-align: center;
      padding: ${Math.round(16 * scale)}px;
      border-radius: ${Math.round(10 * scale)}px;
      font-size: ${Math.round(14 * scale)}px;
      font-weight: 600;
      margin-top: ${Math.round(16 * scale)}px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand-bar">
      <div class="brand-logo">${DEEPDIVE_LOGO}</div>
      <span class="brand-name">DeepDive AI</span>
    </div>

    <div class="header">
      <h1 class="main-title">${this.escapeHtml(content.title)}</h1>
      ${content.subtitle ? `<p class="subtitle">${this.escapeHtml(content.subtitle)}</p>` : ""}
    </div>

    <div class="timeline-container">
      <div class="timeline-axis"></div>

      ${content.sections
        .slice(0, 5)
        .map(
          (section) => `
        <div class="timeline-item">
          <div class="timeline-node">${this.getIcon(section.iconType)}</div>
          <div class="timeline-content">
            <h3 class="timeline-title">${this.escapeHtml(section.title)}</h3>
            ${section.summary ? `<p class="timeline-summary">${this.escapeHtml(section.summary)}</p>` : ""}
            ${
              section.bullets.length > 0
                ? `
              <ul class="timeline-bullets">
                ${section.bullets
                  .slice(0, 3)
                  .map(
                    (bullet) => `
                  <li class="timeline-bullet">
                    <span class="bullet-dot"></span>
                    <span>${this.escapeHtml(bullet)}</span>
                  </li>
                `,
                  )
                  .join("")}
              </ul>
            `
                : ""
            }
          </div>
        </div>
      `,
        )
        .join("")}
    </div>

    ${content.callToAction ? `<div class="cta">${this.escapeHtml(content.callToAction)}</div>` : ""}
  </div>
</body>
</html>`;
  }

  async generateInfographic(
    content: InfographicContent,
    options?: {
      width?: number;
      height?: number;
      backgroundImageBase64?: string;
    },
  ): Promise<string> {
    const width = options?.width || 1200;
    const height = options?.height || 800;
    const templateLayout = content.styleOptions?.templateLayout || "cards";

    this.logger.log(
      `[InfographicTemplate] Generating infographic: "${content.title}" with ${content.sections.length} sections, size: ${width}x${height}, template: ${templateLayout}`,
    );

    let html: string;

    // 根据模板类型选择渲染方法
    switch (templateLayout) {
      case "center_visual":
        html = this.generateCenterVisualHTML(
          content,
          options?.backgroundImageBase64,
          width,
          height,
        );
        break;
      case "timeline":
        html = this.generateTimelineHTML(
          content,
          options?.backgroundImageBase64,
          width,
          height,
        );
        break;
      case "cards":
      default:
        html = this.generateConsultingInfographicHTML(
          content,
          options?.backgroundImageBase64,
          width,
          height,
        );
        break;
    }

    const imageBase64 = await this.renderToImage(html, width, height);

    this.logger.log(
      `[InfographicTemplate] Infographic generated successfully with template: ${templateLayout}`,
    );
    return imageBase64;
  }
}
