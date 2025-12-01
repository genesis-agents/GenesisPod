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
}

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

// DeepDive Logo SVG
const DEEPDIVE_LOGO = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 3v14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  <path d="M5 10l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  <path d="M8 20h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5" />
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
   * 生成咨询风格信息图 HTML
   * 布局：三列网格，顶部标题栏，底部行动号召
   */
  generateConsultingInfographicHTML(
    content: InfographicContent,
    backgroundImageBase64?: string,
    width: number = 1200,
    height: number = 800,
  ): string {
    // 商务专业配色：深蓝灰主色 + 冷青强调色 + 干净背景
    const colors = content.colorScheme || {
      primary: "#1e3a5f", // 深蓝灰 - 专业稳重
      accent: "#0891b2", // 冷青色 - 现代科技感
      background: "#f8fafc", // 浅灰白 - 干净背景
      text: "#334155", // 深灰 - 易读文字
    };

    // 根据宽高比调整列数：宽屏用3列，竖屏用2列，正方形用3列
    const isVertical = height > width;
    const numColumns = isVertical ? 2 : 3;
    const columns = this.distributeToColumns(content.sections, numColumns);

    // 根据尺寸调整字体和间距
    const scale = width / 1200;
    const padding = Math.round(40 * scale);
    const titleSize = Math.round(32 * scale);
    const subtitleSize = Math.round(16 * scale);
    const sectionTitleSize = Math.round(18 * scale);
    const bulletSize = Math.round(14 * scale);

    const backgroundStyle = backgroundImageBase64
      ? `background-image: linear-gradient(rgba(247, 249, 252, 0.92), rgba(247, 249, 252, 0.92)), url(${backgroundImageBase64});
         background-size: cover;
         background-position: center;`
      : `background: ${colors.background};`;

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${width}">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', sans-serif;
      ${backgroundStyle}
      color: ${colors.text};
      width: ${width}px;
      min-height: ${height}px;
      padding: 0;
    }

    .infographic {
      padding: ${padding}px;
    }

    /* 顶部品牌栏 */
    .brand-bar {
      display: flex;
      align-items: center;
      gap: ${Math.round(8 * scale)}px;
      margin-bottom: ${Math.round(16 * scale)}px;
      padding: 0 4px;
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
      letter-spacing: 0.5px;
    }

    /* 顶部标题区 */
    .header {
      background: linear-gradient(135deg, ${colors.primary} 0%, ${this.adjustColor(colors.primary, 20)} 100%);
      color: white;
      padding: ${Math.round(28 * scale)}px ${Math.round(36 * scale)}px;
      border-radius: ${Math.round(12 * scale)}px;
      margin-bottom: ${Math.round(28 * scale)}px;
      position: relative;
      overflow: hidden;
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
      margin-bottom: ${Math.round(6 * scale)}px;
      line-height: 1.3;
    }

    .subtitle {
      font-size: ${subtitleSize}px;
      opacity: 0.9;
      font-weight: 400;
    }

    .hero-statement {
      margin-top: ${Math.round(14 * scale)}px;
      padding: ${Math.round(10 * scale)}px ${Math.round(16 * scale)}px;
      background: rgba(255,255,255,0.15);
      border-left: 3px solid ${colors.accent};
      border-radius: 0 ${Math.round(6 * scale)}px ${Math.round(6 * scale)}px 0;
      font-size: ${bulletSize}px;
      font-style: italic;
      max-width: 80%;
    }

    /* 动态列布局 */
    .columns {
      display: grid;
      grid-template-columns: repeat(${numColumns}, 1fr);
      gap: ${Math.round(24 * scale)}px;
      margin-bottom: ${Math.round(32 * scale)}px;
    }

    .column {
      display: flex;
      flex-direction: column;
      gap: ${Math.round(20 * scale)}px;
    }

    /* Section 卡片 */
    .section-card {
      background: white;
      border-radius: ${Math.round(12 * scale)}px;
      padding: ${Math.round(24 * scale)}px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      border: 1px solid rgba(0,0,0,0.06);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .section-header {
      display: flex;
      align-items: flex-start;
      gap: ${Math.round(14 * scale)}px;
      margin-bottom: ${Math.round(16 * scale)}px;
    }

    .section-icon {
      width: ${Math.round(44 * scale)}px;
      height: ${Math.round(44 * scale)}px;
      min-width: ${Math.round(44 * scale)}px;
      background: linear-gradient(135deg, ${colors.primary} 0%, ${this.adjustColor(colors.primary, 15)} 100%);
      border-radius: ${Math.round(10 * scale)}px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }

    .section-icon svg {
      width: ${Math.round(24 * scale)}px;
      height: ${Math.round(24 * scale)}px;
    }

    .section-number {
      position: absolute;
      top: ${Math.round(-6 * scale)}px;
      right: ${Math.round(-6 * scale)}px;
      width: ${Math.round(22 * scale)}px;
      height: ${Math.round(22 * scale)}px;
      background: ${colors.accent};
      color: white;
      border-radius: 50%;
      font-size: ${Math.round(12 * scale)}px;
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
      line-height: 1.4;
    }

    .section-summary {
      font-size: ${bulletSize}px;
      color: #64748b;
      margin-top: ${Math.round(4 * scale)}px;
      line-height: 1.5;
    }

    /* 要点列表 */
    .bullets {
      list-style: none;
      margin-bottom: ${Math.round(16 * scale)}px;
    }

    .bullet-item {
      display: flex;
      align-items: flex-start;
      gap: ${Math.round(10 * scale)}px;
      padding: ${Math.round(8 * scale)}px 0;
      font-size: ${bulletSize}px;
      line-height: 1.5;
      border-bottom: 1px solid #f1f5f9;
    }

    .bullet-item:last-child {
      border-bottom: none;
    }

    .bullet-dot {
      width: ${Math.round(8 * scale)}px;
      height: ${Math.round(8 * scale)}px;
      min-width: ${Math.round(8 * scale)}px;
      background: ${colors.accent};
      border-radius: 50%;
      margin-top: ${Math.round(6 * scale)}px;
    }

    /* 指标展示 */
    .metrics {
      display: flex;
      flex-wrap: wrap;
      gap: ${Math.round(12 * scale)}px;
    }

    .metric {
      background: linear-gradient(135deg, ${colors.primary}08 0%, ${colors.primary}15 100%);
      border: 1px solid ${colors.primary}20;
      border-radius: ${Math.round(8 * scale)}px;
      padding: ${Math.round(12 * scale)}px ${Math.round(16 * scale)}px;
      flex: 1;
      min-width: ${Math.round(100 * scale)}px;
    }

    .metric-value {
      font-size: ${Math.round(24 * scale)}px;
      font-weight: 700;
      color: ${colors.primary};
      line-height: 1.2;
    }

    .metric-label {
      font-size: ${Math.round(12 * scale)}px;
      color: #64748b;
      margin-top: ${Math.round(4 * scale)}px;
    }

    .metric-comparison {
      font-size: ${Math.round(11 * scale)}px;
      color: ${colors.accent};
      font-weight: 600;
      margin-top: ${Math.round(2 * scale)}px;
    }

    /* 底部行动号召 */
    .cta {
      background: linear-gradient(135deg, ${colors.accent} 0%, ${this.adjustColor(colors.accent, -15)} 100%);
      color: white;
      text-align: center;
      padding: ${Math.round(20 * scale)}px ${Math.round(40 * scale)}px;
      border-radius: ${Math.round(12 * scale)}px;
      font-size: ${sectionTitleSize}px;
      font-weight: 600;
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
                  <h3 class="section-title">${this.escapeHtml(section.title)}</h3>
                  ${section.summary ? `<p class="section-summary">${this.escapeHtml(this.truncateText(section.summary, 60))}</p>` : ""}
                </div>
              </div>

              ${
                section.bullets.length > 0
                  ? `
                <ul class="bullets">
                  ${section.bullets
                    .slice(0, 3)
                    .map(
                      (bullet) => `
                    <li class="bullet-item">
                      <span class="bullet-dot"></span>
                      <span>${this.escapeHtml(this.truncateText(bullet, 50))}</span>
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
                    .slice(0, 2)
                    .map(
                      (metric) => `
                    <div class="metric">
                      <div class="metric-value">${this.escapeHtml(metric.value)}</div>
                      <div class="metric-label">${this.escapeHtml(this.truncateText(metric.label, 20))}</div>
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
    ${content.callToAction ? `<div class="cta">${this.escapeHtml(this.truncateText(content.callToAction, 80))}</div>` : ""}
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
   * 截断文本
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + "…";
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
   */
  async renderToImage(
    html: string,
    width: number = 1200,
    height: number = 800,
  ): Promise<string> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // 设置视口
      await page.setViewport({ width, height, deviceScaleFactor: 2 });

      // 加载 HTML
      await page.setContent(html, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      // 等待字体加载
      await page.evaluate(() => document.fonts.ready);

      // 获取实际内容高度
      const bodyHandle = await page.$("body");
      const boundingBox = await bodyHandle?.boundingBox();
      const actualHeight = boundingBox ? Math.ceil(boundingBox.height) : height;

      // 重新设置视口以适应内容
      await page.setViewport({
        width,
        height: actualHeight,
        deviceScaleFactor: 2,
      });

      // 截图
      const screenshot = await page.screenshot({
        type: "png",
        fullPage: true,
        encoding: "base64",
      });

      return `data:image/png;base64,${screenshot}`;
    } finally {
      await page.close();
    }
  }

  /**
   * 从 AI 分析结果生成信息图
   * 这是主要入口方法
   */
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

    this.logger.log(
      `[InfographicTemplate] Generating infographic: "${content.title}" with ${content.sections.length} sections, size: ${width}x${height}`,
    );

    const html = this.generateConsultingInfographicHTML(
      content,
      options?.backgroundImageBase64,
      width,
      height,
    );

    const imageBase64 = await this.renderToImage(html, width, height);

    this.logger.log(`[InfographicTemplate] Infographic generated successfully`);
    return imageBase64;
  }
}
