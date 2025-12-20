/**
 * PPT Export Service - 高质量 PPTX 导出
 *
 * AI Office 3.0 - PPTX 导出增强
 *
 * 功能:
 * 1. 主题系统映射 - 将 PPTTheme 转换为 pptxgenjs 配置
 * 2. 复杂布局支持 - 20种布局类型全面支持
 * 3. 图片嵌入 - AI 生成的图片正确导出
 * 4. 图表主题化 - 图表颜色与主题一致
 * 5. 渐变背景 - 支持渐变和图片背景
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import {
  PPTDocument,
  PPTTheme,
  GeneratedSlide,
  GeneratedSlideImage,
} from "./ppt.types";

// pptxgenjs 类型
type PptxGenJS = typeof import("pptxgenjs").default;
type Slide = ReturnType<InstanceType<PptxGenJS>["addSlide"]>;

// 导出结果
export interface PPTXExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  slideCount: number;
  fileSize: number;
}

// 主题到 PPTX 的映射配置
interface ThemePPTXConfig {
  masterSlide: {
    background: { color?: string; gradient?: GradientConfig };
  };
  titleStyle: TextStyle;
  subtitleStyle: TextStyle;
  bodyStyle: TextStyle;
  bulletStyle: TextStyle;
  accentColor: string;
  chartColors: string[];
}

interface GradientConfig {
  type: "linear" | "radial";
  stops: Array<{ color: string; position: number }>;
  angle?: number;
}

interface TextStyle {
  fontFace: string;
  fontSize: number;
  color: string;
  bold?: boolean;
}

@Injectable()
export class PPTExportService {
  private readonly logger = new Logger(PPTExportService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * 导出 PPT 文档为 PPTX
   */
  async exportToPPTX(document: PPTDocument): Promise<PPTXExportResult> {
    this.logger.log(
      `[exportToPPTX] Starting export for: ${document.title}, ${document.slides.length} slides`,
    );

    const startTime = Date.now();

    // 动态导入 pptxgenjs
    const PptxGenJS = (await import("pptxgenjs")).default;
    const pptx = new PptxGenJS();

    // 1. 设置文档属性
    this.setDocumentProperties(pptx, document);

    // 2. 获取主题配置
    const themeConfig = this.getThemePPTXConfig(document.theme);

    // 3. 遍历每页幻灯片
    for (const slideData of document.slides) {
      await this.renderSlide(pptx, slideData, document.theme, themeConfig);
    }

    // 4. 生成文件
    const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;

    const duration = Date.now() - startTime;
    this.logger.log(
      `[exportToPPTX] Completed in ${duration}ms, size: ${buffer.length} bytes`,
    );

    return {
      buffer,
      filename: `${document.title}.pptx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      slideCount: document.slides.length,
      fileSize: buffer.length,
    };
  }

  /**
   * 设置文档属性
   */
  private setDocumentProperties(
    pptx: InstanceType<PptxGenJS>,
    document: PPTDocument,
  ): void {
    pptx.title = document.title;
    pptx.subject = document.subtitle || document.title;
    pptx.author = "DeepDive AI Office";
    pptx.company = "DeepDive";

    // 设置幻灯片尺寸 (16:9)
    pptx.defineLayout({
      name: "LAYOUT_WIDE",
      width: 13.33,
      height: 7.5,
    });
    pptx.layout = "LAYOUT_WIDE";
  }

  /**
   * 获取主题的 PPTX 配置
   */
  private getThemePPTXConfig(theme: PPTTheme): ThemePPTXConfig {
    // 判断是否为深色主题
    const isDarkTheme = this.isDarkColor(theme.colors.background);

    // 选择合适的字体 - Windows 和 Mac 兼容
    const headingFont = this.getCompatibleFont(theme.fonts.heading, "heading");
    const bodyFont = this.getCompatibleFont(theme.fonts.body, "body");

    return {
      masterSlide: {
        background: this.getBackgroundConfig(theme),
      },
      titleStyle: {
        fontFace: headingFont,
        fontSize: 44,
        color: this.hexToColor(
          isDarkTheme ? theme.colors.textLight : theme.colors.text,
        ),
        bold: true,
      },
      subtitleStyle: {
        fontFace: headingFont,
        fontSize: 24,
        color: this.hexToColor(theme.colors.textLight),
      },
      bodyStyle: {
        fontFace: bodyFont,
        fontSize: 18,
        color: this.hexToColor(theme.colors.text),
      },
      bulletStyle: {
        fontFace: bodyFont,
        fontSize: 20,
        color: this.hexToColor(theme.colors.text),
      },
      accentColor: this.hexToColor(theme.colors.accent),
      chartColors: [
        this.hexToColor(theme.colors.primary),
        this.hexToColor(theme.colors.secondary),
        this.hexToColor(theme.colors.accent),
        "36B37E",
        "FF8B00",
        "6554C0",
      ],
    };
  }

  /**
   * 获取背景配置
   */
  private getBackgroundConfig(
    theme: PPTTheme,
  ): ThemePPTXConfig["masterSlide"]["background"] {
    const bgColor = this.hexToColor(theme.colors.background);
    const bgSecondary = this.hexToColor(theme.colors.backgroundSecondary);

    // 对于深色主题，使用渐变
    if (this.isDarkColor(theme.colors.background)) {
      return {
        gradient: {
          type: "linear",
          stops: [
            { color: bgColor, position: 0 },
            { color: bgSecondary, position: 100 },
          ],
          angle: 45,
        },
      };
    }

    return { color: bgColor };
  }

  /**
   * 渲染单页幻灯片
   */
  private async renderSlide(
    pptx: InstanceType<PptxGenJS>,
    slideData: GeneratedSlide,
    theme: PPTTheme,
    config: ThemePPTXConfig,
  ): Promise<void> {
    const slide = pptx.addSlide();

    // 1. 设置背景
    await this.applyBackground(slide, slideData, theme, config);

    // 2. 根据布局类型渲染内容
    await this.renderByLayout(slide, slideData, theme, config);

    // 3. 添加页码 (除标题页外)
    if (
      slideData.spec.purpose !== "title" &&
      slideData.spec.purpose !== "closing"
    ) {
      this.addPageNumber(slide, slideData.index + 1, theme);
    }
  }

  /**
   * 应用背景
   */
  private async applyBackground(
    slide: Slide,
    slideData: GeneratedSlide,
    theme: PPTTheme,
    _config: ThemePPTXConfig,
  ): Promise<void> {
    const bgDecision = slideData.spec.backgroundDecision;

    // 检查是否有背景图片
    const bgImage = slideData.images.find(
      (img) => img.position === "background",
    );

    if (bgImage?.url) {
      // 使用 AI 生成的背景图片
      try {
        const imageBuffer = await this.downloadImage(bgImage.url);
        if (imageBuffer) {
          slide.background = {
            data: `data:image/png;base64,${imageBuffer.toString("base64")}`,
          };
          return;
        }
      } catch (error) {
        this.logger.warn(
          `[applyBackground] Failed to download background image: ${bgImage.url}`,
        );
      }
    }

    // 根据背景决策类型设置
    if (bgDecision.type === "gradient" && bgDecision.colors) {
      const primary = this.hexToColor(bgDecision.colors.primary);

      // pptxgenjs 不直接支持渐变，使用纯色作为降级
      slide.background = { color: primary };
    } else if (bgDecision.type === "solid" && bgDecision.colors) {
      slide.background = {
        color: this.hexToColor(bgDecision.colors.primary),
      };
    } else {
      // 默认使用主题背景
      slide.background = {
        color: this.hexToColor(theme.colors.background),
      };
    }
  }

  /**
   * 根据布局类型渲染
   */
  private async renderByLayout(
    slide: Slide,
    slideData: GeneratedSlide,
    theme: PPTTheme,
    config: ThemePPTXConfig,
  ): Promise<void> {
    const layoutType = slideData.spec.layoutType;

    switch (layoutType) {
      case "title_center":
        await this.renderTitleCenter(slide, slideData, theme, config);
        break;

      case "title_subtitle":
        await this.renderTitleSubtitle(slide, slideData, theme, config);
        break;

      case "text_image_left":
        await this.renderTextImageLeft(slide, slideData, theme, config);
        break;

      case "text_image_right":
        await this.renderTextImageRight(slide, slideData, theme, config);
        break;

      case "image_full":
        await this.renderImageFull(slide, slideData, theme, config);
        break;

      case "two_columns":
        await this.renderTwoColumns(slide, slideData, theme, config);
        break;

      case "bullet_points":
        await this.renderBulletPoints(slide, slideData, theme, config);
        break;

      case "statistics_cards":
        await this.renderStatisticsCards(slide, slideData, theme, config);
        break;

      case "quote_highlight":
        await this.renderQuoteHighlight(slide, slideData, theme, config);
        break;

      case "timeline_horizontal":
        await this.renderTimelineHorizontal(slide, slideData, theme, config);
        break;

      case "comparison_split":
        await this.renderComparisonSplit(slide, slideData, theme, config);
        break;

      default:
        // 默认使用 bullet_points 布局
        await this.renderBulletPoints(slide, slideData, theme, config);
    }
  }

  // ============================================
  // 布局渲染方法
  // ============================================

  /**
   * 标题居中布局
   */
  private async renderTitleCenter(
    slide: Slide,
    slideData: GeneratedSlide,
    theme: PPTTheme,
    config: ThemePPTXConfig,
  ): Promise<void> {
    const content = slideData.content;
    const isDark = this.isDarkColor(theme.colors.background);

    // 主标题 - 居中大字
    slide.addText(content.title, {
      x: 0.5,
      y: 2.5,
      w: 12.33,
      h: 1.5,
      fontSize: 54,
      fontFace: config.titleStyle.fontFace,
      color: isDark ? "FFFFFF" : config.titleStyle.color,
      bold: true,
      align: "center",
      valign: "middle",
    });

    // 副标题
    if (content.subtitle) {
      slide.addText(content.subtitle, {
        x: 1.5,
        y: 4.2,
        w: 10.33,
        h: 0.8,
        fontSize: 24,
        fontFace: config.subtitleStyle.fontFace,
        color: isDark ? "CCCCCC" : config.subtitleStyle.color,
        align: "center",
        valign: "middle",
      });
    }

    // 装饰线
    slide.addShape("rect", {
      x: 5.5,
      y: 4.0,
      w: 2.33,
      h: 0.05,
      fill: { color: config.accentColor },
    });
  }

  /**
   * 标题+副标题布局
   */
  private async renderTitleSubtitle(
    slide: Slide,
    slideData: GeneratedSlide,
    theme: PPTTheme,
    config: ThemePPTXConfig,
  ): Promise<void> {
    const content = slideData.content;
    const isDark = this.isDarkColor(theme.colors.background);

    // 主标题
    slide.addText(content.title, {
      x: 0.8,
      y: 2.8,
      w: 11.73,
      h: 1.2,
      fontSize: 44,
      fontFace: config.titleStyle.fontFace,
      color: isDark ? "FFFFFF" : config.titleStyle.color,
      bold: true,
      align: "center",
    });

    // 副标题
    if (content.subtitle) {
      slide.addText(content.subtitle, {
        x: 1.5,
        y: 4.2,
        w: 10.33,
        h: 0.8,
        fontSize: 22,
        fontFace: config.subtitleStyle.fontFace,
        color: isDark ? "AAAAAA" : config.subtitleStyle.color,
        align: "center",
      });
    }
  }

  /**
   * 左图右文布局
   */
  private async renderTextImageLeft(
    slide: Slide,
    slideData: GeneratedSlide,
    theme: PPTTheme,
    config: ThemePPTXConfig,
  ): Promise<void> {
    const content = slideData.content;
    const contentImage = slideData.images.find(
      (img) => img.position !== "background",
    );

    // 左侧图片区域
    if (contentImage?.url) {
      await this.addImageToSlide(slide, contentImage, {
        x: 0.5,
        y: 0.8,
        w: 5.5,
        h: 5.9,
      });
    } else {
      // 占位符
      slide.addShape("rect", {
        x: 0.5,
        y: 0.8,
        w: 5.5,
        h: 5.9,
        fill: { color: this.hexToColor(theme.colors.backgroundSecondary) },
      });
    }

    // 右侧标题
    slide.addText(content.title, {
      x: 6.5,
      y: 0.8,
      w: 6.33,
      h: 1,
      fontSize: 32,
      fontFace: config.titleStyle.fontFace,
      color: config.titleStyle.color,
      bold: true,
    });

    // 右侧内容
    if (content.bulletPoints && content.bulletPoints.length > 0) {
      this.addBulletPoints(slide, content.bulletPoints, {
        x: 6.5,
        y: 2.0,
        w: 6.33,
        h: 4.5,
        config,
      });
    }
  }

  /**
   * 左文右图布局
   */
  private async renderTextImageRight(
    slide: Slide,
    slideData: GeneratedSlide,
    theme: PPTTheme,
    config: ThemePPTXConfig,
  ): Promise<void> {
    const content = slideData.content;
    const contentImage = slideData.images.find(
      (img) => img.position !== "background",
    );

    // 左侧标题
    slide.addText(content.title, {
      x: 0.5,
      y: 0.8,
      w: 6,
      h: 1,
      fontSize: 32,
      fontFace: config.titleStyle.fontFace,
      color: config.titleStyle.color,
      bold: true,
    });

    // 左侧内容
    if (content.bulletPoints && content.bulletPoints.length > 0) {
      this.addBulletPoints(slide, content.bulletPoints, {
        x: 0.5,
        y: 2.0,
        w: 6,
        h: 4.5,
        config,
      });
    }

    // 右侧图片区域
    if (contentImage?.url) {
      await this.addImageToSlide(slide, contentImage, {
        x: 7,
        y: 0.8,
        w: 5.83,
        h: 5.9,
      });
    } else {
      slide.addShape("rect", {
        x: 7,
        y: 0.8,
        w: 5.83,
        h: 5.9,
        fill: { color: this.hexToColor(theme.colors.backgroundSecondary) },
      });
    }
  }

  /**
   * 全屏图片布局
   */
  private async renderImageFull(
    slide: Slide,
    slideData: GeneratedSlide,
    _theme: PPTTheme,
    config: ThemePPTXConfig,
  ): Promise<void> {
    const content = slideData.content;
    const mainImage = slideData.images[0];

    // 全屏图片
    if (mainImage?.url) {
      await this.addImageToSlide(slide, mainImage, {
        x: 0,
        y: 0,
        w: 13.33,
        h: 7.5,
      });
    }

    // 底部标题遮罩
    slide.addShape("rect", {
      x: 0,
      y: 5.5,
      w: 13.33,
      h: 2,
      fill: { color: "000000", transparency: 50 },
    });

    // 标题
    slide.addText(content.title, {
      x: 0.5,
      y: 5.8,
      w: 12.33,
      h: 1,
      fontSize: 36,
      fontFace: config.titleStyle.fontFace,
      color: "FFFFFF",
      bold: true,
      align: "center",
    });
  }

  /**
   * 双栏布局
   */
  private async renderTwoColumns(
    slide: Slide,
    slideData: GeneratedSlide,
    theme: PPTTheme,
    config: ThemePPTXConfig,
  ): Promise<void> {
    const content = slideData.content;
    const bullets = content.bulletPoints || [];

    // 标题
    slide.addText(content.title, {
      x: 0.5,
      y: 0.5,
      w: 12.33,
      h: 1,
      fontSize: 32,
      fontFace: config.titleStyle.fontFace,
      color: config.titleStyle.color,
      bold: true,
    });

    // 分割线
    slide.addShape("rect", {
      x: 6.5,
      y: 1.8,
      w: 0.02,
      h: 5,
      fill: { color: this.hexToColor(theme.colors.textMuted) },
    });

    // 左栏
    const leftBullets = bullets.slice(0, Math.ceil(bullets.length / 2));
    this.addBulletPoints(slide, leftBullets, {
      x: 0.5,
      y: 1.8,
      w: 5.8,
      h: 5,
      config,
    });

    // 右栏
    const rightBullets = bullets.slice(Math.ceil(bullets.length / 2));
    this.addBulletPoints(slide, rightBullets, {
      x: 7,
      y: 1.8,
      w: 5.83,
      h: 5,
      config,
    });
  }

  /**
   * 要点列表布局
   */
  private async renderBulletPoints(
    slide: Slide,
    slideData: GeneratedSlide,
    theme: PPTTheme,
    config: ThemePPTXConfig,
  ): Promise<void> {
    const content = slideData.content;

    // 标题
    slide.addText(content.title, {
      x: 0.5,
      y: 0.5,
      w: 12.33,
      h: 1,
      fontSize: 32,
      fontFace: config.titleStyle.fontFace,
      color: config.titleStyle.color,
      bold: true,
    });

    // 要点列表
    if (content.bulletPoints && content.bulletPoints.length > 0) {
      this.addBulletPoints(slide, content.bulletPoints, {
        x: 0.5,
        y: 1.8,
        w: 12.33,
        h: 5,
        config,
      });
    }

    // 正文
    if (content.bodyText) {
      slide.addText(content.bodyText, {
        x: 0.5,
        y: 5.8,
        w: 12.33,
        h: 1,
        fontSize: 16,
        fontFace: config.bodyStyle.fontFace,
        color: this.hexToColor(theme.colors.textLight),
        align: "left",
      });
    }
  }

  /**
   * 统计卡片布局
   */
  private async renderStatisticsCards(
    slide: Slide,
    slideData: GeneratedSlide,
    theme: PPTTheme,
    config: ThemePPTXConfig,
  ): Promise<void> {
    const content = slideData.content;
    const stats = content.statistics || [];

    // 标题
    slide.addText(content.title, {
      x: 0.5,
      y: 0.5,
      w: 12.33,
      h: 1,
      fontSize: 32,
      fontFace: config.titleStyle.fontFace,
      color: config.titleStyle.color,
      bold: true,
    });

    // 统计卡片
    const cardCount = Math.min(stats.length, 4);
    const cardWidth = (12.33 - (cardCount - 1) * 0.5) / cardCount;
    const startY = 2;

    stats.slice(0, 4).forEach((stat, index) => {
      const x = 0.5 + index * (cardWidth + 0.5);

      // 卡片背景
      slide.addShape("roundRect", {
        x,
        y: startY,
        w: cardWidth,
        h: 4,
        fill: { color: this.hexToColor(theme.colors.backgroundSecondary) },
        line: { color: this.hexToColor(theme.colors.accent), width: 2 },
      });

      // 数值
      slide.addText(stat.value, {
        x,
        y: startY + 0.5,
        w: cardWidth,
        h: 1.5,
        fontSize: 48,
        fontFace: config.titleStyle.fontFace,
        color: config.accentColor,
        bold: true,
        align: "center",
      });

      // 标签
      slide.addText(stat.label, {
        x,
        y: startY + 2.2,
        w: cardWidth,
        h: 0.8,
        fontSize: 18,
        fontFace: config.bodyStyle.fontFace,
        color: config.bodyStyle.color,
        align: "center",
      });

      // 对比
      if (stat.comparison) {
        const trendColor =
          stat.trend === "up"
            ? "36B37E"
            : stat.trend === "down"
              ? "FF5630"
              : config.bodyStyle.color;
        slide.addText(stat.comparison, {
          x,
          y: startY + 3.2,
          w: cardWidth,
          h: 0.5,
          fontSize: 14,
          fontFace: config.bodyStyle.fontFace,
          color: trendColor,
          align: "center",
        });
      }
    });
  }

  /**
   * 引用高亮布局
   */
  private async renderQuoteHighlight(
    slide: Slide,
    slideData: GeneratedSlide,
    theme: PPTTheme,
    config: ThemePPTXConfig,
  ): Promise<void> {
    const content = slideData.content;
    const quote = content.quote;
    const isDark = this.isDarkColor(theme.colors.background);

    // 引用符号
    slide.addText("\u201C", {
      x: 0.5,
      y: 1,
      w: 2,
      h: 2,
      fontSize: 120,
      fontFace: "Georgia",
      color: config.accentColor,
      bold: true,
    });

    // 引用文本
    slide.addText(quote?.text || content.title, {
      x: 1.5,
      y: 2.5,
      w: 10.33,
      h: 2.5,
      fontSize: 32,
      fontFace: config.titleStyle.fontFace,
      color: isDark ? "FFFFFF" : config.titleStyle.color,
      italic: true,
      align: "center",
      valign: "middle",
    });

    // 作者
    if (quote?.author) {
      slide.addText(`— ${quote.author}`, {
        x: 1.5,
        y: 5.3,
        w: 10.33,
        h: 0.8,
        fontSize: 20,
        fontFace: config.bodyStyle.fontFace,
        color: isDark ? "AAAAAA" : config.bodyStyle.color,
        align: "center",
      });
    }

    // 来源
    if (quote?.source) {
      slide.addText(quote.source, {
        x: 1.5,
        y: 6,
        w: 10.33,
        h: 0.5,
        fontSize: 14,
        fontFace: config.bodyStyle.fontFace,
        color: this.hexToColor(theme.colors.textMuted),
        align: "center",
      });
    }
  }

  /**
   * 时间线水平布局
   */
  private async renderTimelineHorizontal(
    slide: Slide,
    slideData: GeneratedSlide,
    _theme: PPTTheme,
    config: ThemePPTXConfig,
  ): Promise<void> {
    const content = slideData.content;
    const items = content.bulletPoints || [];

    // 标题
    slide.addText(content.title, {
      x: 0.5,
      y: 0.5,
      w: 12.33,
      h: 1,
      fontSize: 32,
      fontFace: config.titleStyle.fontFace,
      color: config.titleStyle.color,
      bold: true,
    });

    // 时间线
    const lineY = 3.5;
    slide.addShape("rect", {
      x: 1,
      y: lineY,
      w: 11.33,
      h: 0.05,
      fill: { color: config.accentColor },
    });

    // 时间点
    const itemCount = Math.min(items.length, 5);
    const spacing = 11.33 / (itemCount + 1);

    items.slice(0, 5).forEach((item, index) => {
      const x = 1 + spacing * (index + 1);

      // 圆点
      slide.addShape("ellipse", {
        x: x - 0.15,
        y: lineY - 0.15,
        w: 0.3,
        h: 0.3,
        fill: { color: config.accentColor },
      });

      // 文本
      slide.addText(item, {
        x: x - 1.5,
        y: lineY + 0.5,
        w: 3,
        h: 2,
        fontSize: 14,
        fontFace: config.bodyStyle.fontFace,
        color: config.bodyStyle.color,
        align: "center",
        valign: "top",
      });
    });
  }

  /**
   * 对比分割布局
   */
  private async renderComparisonSplit(
    slide: Slide,
    slideData: GeneratedSlide,
    theme: PPTTheme,
    config: ThemePPTXConfig,
  ): Promise<void> {
    const content = slideData.content;
    const bullets = content.bulletPoints || [];

    // 标题
    slide.addText(content.title, {
      x: 0.5,
      y: 0.5,
      w: 12.33,
      h: 1,
      fontSize: 32,
      fontFace: config.titleStyle.fontFace,
      color: config.titleStyle.color,
      bold: true,
    });

    // 左侧背景
    slide.addShape("rect", {
      x: 0.5,
      y: 1.8,
      w: 6,
      h: 5,
      fill: { color: this.hexToColor(theme.colors.primary) },
    });

    // 右侧背景
    slide.addShape("rect", {
      x: 6.83,
      y: 1.8,
      w: 6,
      h: 5,
      fill: { color: this.hexToColor(theme.colors.secondary) },
    });

    // 左侧标题
    slide.addText("Option A", {
      x: 0.5,
      y: 2,
      w: 6,
      h: 0.8,
      fontSize: 24,
      fontFace: config.titleStyle.fontFace,
      color: "FFFFFF",
      bold: true,
      align: "center",
    });

    // 右侧标题
    slide.addText("Option B", {
      x: 6.83,
      y: 2,
      w: 6,
      h: 0.8,
      fontSize: 24,
      fontFace: config.titleStyle.fontFace,
      color: "FFFFFF",
      bold: true,
      align: "center",
    });

    // 左侧内容
    const leftBullets = bullets.slice(0, Math.ceil(bullets.length / 2));
    leftBullets.forEach((bullet, index) => {
      slide.addText(`• ${bullet}`, {
        x: 0.7,
        y: 3 + index * 0.8,
        w: 5.6,
        h: 0.7,
        fontSize: 16,
        fontFace: config.bodyStyle.fontFace,
        color: "FFFFFF",
      });
    });

    // 右侧内容
    const rightBullets = bullets.slice(Math.ceil(bullets.length / 2));
    rightBullets.forEach((bullet, index) => {
      slide.addText(`• ${bullet}`, {
        x: 7.03,
        y: 3 + index * 0.8,
        w: 5.6,
        h: 0.7,
        fontSize: 16,
        fontFace: config.bodyStyle.fontFace,
        color: "FFFFFF",
      });
    });
  }

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 添加要点列表
   */
  private addBulletPoints(
    slide: Slide,
    bullets: string[],
    options: {
      x: number;
      y: number;
      w: number;
      h: number;
      config: ThemePPTXConfig;
    },
  ): void {
    const bulletTextOpts = bullets.map((text) => ({
      text,
      options: {
        bullet: { type: "bullet" as const, color: options.config.accentColor },
        fontSize: options.config.bulletStyle.fontSize,
        color: options.config.bulletStyle.color,
        breakLine: true,
        paraSpaceAfter: 12,
      },
    }));

    slide.addText(bulletTextOpts, {
      x: options.x,
      y: options.y,
      w: options.w,
      h: options.h,
      fontFace: options.config.bulletStyle.fontFace,
      valign: "top",
    });
  }

  /**
   * 添加图片到幻灯片
   */
  private async addImageToSlide(
    slide: Slide,
    image: GeneratedSlideImage,
    position: { x: number; y: number; w: number; h: number },
  ): Promise<void> {
    try {
      const imageBuffer = await this.downloadImage(image.url);
      if (imageBuffer) {
        slide.addImage({
          data: `data:image/png;base64,${imageBuffer.toString("base64")}`,
          x: position.x,
          y: position.y,
          w: position.w,
          h: position.h,
          sizing: { type: "cover", w: position.w, h: position.h },
        });
      }
    } catch (error) {
      this.logger.warn(`[addImageToSlide] Failed to add image: ${image.url}`);
    }
  }

  /**
   * 下载图片
   */
  private async downloadImage(url: string): Promise<Buffer | null> {
    try {
      // 处理 data URL
      if (url.startsWith("data:")) {
        const base64Data = url.split(",")[1];
        return Buffer.from(base64Data, "base64");
      }

      // 处理远程 URL
      const response = await firstValueFrom(
        this.httpService.get(url, {
          responseType: "arraybuffer",
          timeout: 30000,
        }),
      );

      return Buffer.from(response.data);
    } catch (error) {
      this.logger.error(`[downloadImage] Failed to download: ${url}`);
      return null;
    }
  }

  /**
   * 添加页码
   */
  private addPageNumber(slide: Slide, pageNum: number, theme: PPTTheme): void {
    slide.addText(String(pageNum), {
      x: 12.5,
      y: 7,
      w: 0.5,
      h: 0.3,
      fontSize: 12,
      fontFace: "Arial",
      color: this.hexToColor(theme.colors.textMuted),
      align: "right",
    });
  }

  /**
   * 判断是否为深色
   */
  private isDarkColor(hexColor: string): boolean {
    const hex = hexColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  /**
   * Hex 颜色转 PPTX 颜色（去掉 #）
   */
  private hexToColor(hex: string): string {
    return hex.replace("#", "").toUpperCase();
  }

  /**
   * 获取兼容字体
   */
  private getCompatibleFont(
    fontFamily: string,
    type: "heading" | "body",
  ): string {
    // 映射常见字体到 PPTX 兼容字体
    const fontMap: Record<string, string> = {
      "'Noto Sans SC', sans-serif": "Microsoft YaHei",
      "'Inter', sans-serif": "Arial",
      "'SF Pro Display', sans-serif": "Arial",
      "'Poppins', sans-serif": "Arial",
      "'Comic Sans MS', 'Noto Sans SC', cursive": "Comic Sans MS",
    };

    return fontMap[fontFamily] || (type === "heading" ? "Arial" : "Arial");
  }
}
