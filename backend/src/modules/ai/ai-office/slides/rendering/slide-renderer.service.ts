/**
 * Slide Renderer Service
 *
 * 幻灯片渲染服务
 *
 * 职责：
 * 1. 将幻灯片规格和内容渲染为 HTML
 * 2. 支持多种布局类型
 * 3. 应用主题样式
 * 4. 🆕 支持全局样式（页眉、页脚、安全区）
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  SlideSpec,
  GeneratedSlideContent,
  GeneratedSlideImage,
  SlideLayoutType,
  PPTTheme,
  DEFAULT_GLOBAL_STYLE,
} from "../types/slides.types";

interface RenderInput {
  spec: SlideSpec;
  content: GeneratedSlideContent;
  images: GeneratedSlideImage[];
}

/** 🆕 扩展内容接口以支持全局样式 */
interface ExtendedContent {
  header?: {
    text: string;
    position: string;
    style?: Record<string, unknown>;
  };
  footer?: {
    text: string;
    position: string;
    style?: Record<string, unknown>;
  };
  safeArea?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  typography?: {
    headingFont: string;
    bodyFont: string;
    monoFont?: string;
  };
}

@Injectable()
export class SlideRendererService {
  private readonly logger = new Logger(SlideRendererService.name);

  /**
   * 渲染单个幻灯片为 HTML
   *
   * 🆕 支持全局样式：页眉、页脚、安全区
   */
  async renderSlide(input: RenderInput, theme: PPTTheme): Promise<string> {
    const { spec, content, images } = input;
    const extContent = content as ExtendedContent;

    this.logger.log(
      `[renderSlide] Rendering slide ${spec.index}: ${spec.title} (${spec.layoutType})`,
    );

    // 获取背景样式
    const backgroundStyle = this.getBackgroundStyle(spec, images, theme);

    // 🆕 获取安全区样式
    const safeAreaStyle = this.getSafeAreaStyle(extContent);

    // 获取内容 HTML
    const contentHtml = this.renderContent(
      spec.layoutType,
      content,
      images,
      theme,
    );

    // 🆕 渲染页眉
    const headerHtml = this.renderHeader(extContent, theme);

    // 🆕 渲染页脚
    const footerHtml = this.renderFooter(extContent, theme);

    // 组装完整的幻灯片 HTML
    return `
      <div class="slide" data-index="${spec.index}" data-layout="${spec.layoutType}" style="${backgroundStyle}">
        ${headerHtml}
        <div class="slide-content" style="${safeAreaStyle}">
          ${contentHtml}
        </div>
        ${footerHtml}
        ${this.renderSpeakerNotes(content.speakerNotes)}
      </div>
    `;
  }

  /**
   * 🆕 获取安全区样式
   */
  private getSafeAreaStyle(content: ExtendedContent): string {
    const safeArea = content.safeArea || DEFAULT_GLOBAL_STYLE.safeArea;

    return `
      padding-top: ${safeArea.top}px;
      padding-bottom: ${safeArea.bottom}px;
      padding-left: ${safeArea.left}px;
      padding-right: ${safeArea.right}px;
      box-sizing: border-box;
    `;
  }

  /**
   * 🆕 渲染页眉
   */
  private renderHeader(content: ExtendedContent, theme: PPTTheme): string {
    if (!content.header || !content.header.text) {
      return "";
    }

    const { text, position, style } = content.header;
    const positionStyle = this.getPositionStyle(position, "header");
    const textStyle = style
      ? `font-size: ${style.fontSize || 14}px; font-family: ${style.fontFamily || theme.fonts.body}; color: ${style.color || theme.colors.textMuted};`
      : `font-size: 14px; font-family: ${theme.fonts.body}; color: ${theme.colors.textMuted};`;

    return `
      <div class="slide-header" style="${positionStyle}${textStyle}">
        ${text}
      </div>
    `;
  }

  /**
   * 🆕 渲染页脚
   */
  private renderFooter(content: ExtendedContent, theme: PPTTheme): string {
    if (!content.footer || !content.footer.text) {
      return "";
    }

    const { text, position, style } = content.footer;
    const positionStyle = this.getPositionStyle(position, "footer");
    const textStyle = style
      ? `font-size: ${style.fontSize || 14}px; font-family: ${style.fontFamily || theme.fonts.body}; color: ${style.color || theme.colors.textMuted};`
      : `font-size: 14px; font-family: ${theme.fonts.body}; color: ${theme.colors.textMuted};`;

    return `
      <div class="slide-footer" style="${positionStyle}${textStyle}">
        ${text}
      </div>
    `;
  }

  /**
   * 🆕 获取位置样式
   */
  private getPositionStyle(
    position: string,
    type: "header" | "footer",
  ): string {
    const base =
      type === "header"
        ? "position: absolute; top: 20px; width: 100%;"
        : "position: absolute; bottom: 20px; width: 100%;";

    switch (position) {
      case "top-left":
      case "bottom-left":
        return `${base} text-align: left; padding-left: 40px;`;
      case "top-center":
      case "bottom-center":
        return `${base} text-align: center;`;
      case "top-right":
      case "bottom-right":
        return `${base} text-align: right; padding-right: 40px;`;
      default:
        return `${base} text-align: right; padding-right: 40px;`;
    }
  }

  /**
   * 获取背景样式
   */
  private getBackgroundStyle(
    spec: SlideSpec,
    images: GeneratedSlideImage[],
    theme: PPTTheme,
  ): string {
    const bgDecision = spec.backgroundDecision;
    const bgImage = images.find((img) => img.position === "background");

    // AI 生成的背景
    if (bgDecision.type === "ai_generated" && bgImage) {
      return `
        background-image: linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)), url('${bgImage.url}');
        background-size: cover;
        background-position: center;
        color: ${theme.colors.text};
      `;
    }

    // 渐变背景
    if (bgDecision.type === "gradient" && bgDecision.colors) {
      const { primary, secondary, direction } = bgDecision.colors;
      const gradientDirection =
        direction === "horizontal"
          ? "to right"
          : direction === "vertical"
            ? "to bottom"
            : direction === "radial"
              ? "circle"
              : "135deg";

      if (direction === "radial") {
        return `
          background: radial-gradient(${gradientDirection}, ${primary}, ${secondary || theme.colors.backgroundSecondary});
          color: ${theme.colors.text};
        `;
      }

      return `
        background: linear-gradient(${gradientDirection}, ${primary}, ${secondary || theme.colors.backgroundSecondary});
        color: ${theme.colors.text};
      `;
    }

    // 纯色背景
    const bgColor = bgDecision.colors?.primary || theme.colors.background;
    return `
      background-color: ${bgColor};
      color: ${theme.colors.text};
    `;
  }

  /**
   * 渲染内容
   */
  private renderContent(
    layoutType: SlideLayoutType,
    content: GeneratedSlideContent,
    images: GeneratedSlideImage[],
    theme: PPTTheme,
  ): string {
    const contentImage = images.find((img) => img.position !== "background");

    switch (layoutType) {
      case "title_center":
        return this.renderTitleCenter(content, theme);

      case "title_subtitle":
        return this.renderTitleSubtitle(content, theme);

      case "text_only":
        return this.renderTextOnly(content, theme);

      case "text_image_left":
        return this.renderTextImageSplit(content, contentImage, theme, "left");

      case "text_image_right":
        return this.renderTextImageSplit(content, contentImage, theme, "right");

      case "image_full":
        return this.renderImageFull(content, contentImage, theme);

      case "two_columns":
        return this.renderTwoColumns(content, theme);

      case "three_columns":
        return this.renderThreeColumns(content, theme);

      case "bullet_points":
        return this.renderBulletPoints(content, theme);

      case "numbered_list":
        return this.renderNumberedList(content, theme);

      case "comparison_split":
        return this.renderComparison(content, theme);

      case "timeline_horizontal":
        return this.renderTimelineHorizontal(content, theme);

      case "statistics_cards":
        return this.renderStatisticsCards(content, theme);

      case "quote_highlight":
        return this.renderQuote(content, theme);

      case "cards_grid":
        return this.renderCardsGrid(content, theme);

      default:
        return this.renderBulletPoints(content, theme);
    }
  }

  /**
   * 渲染标题居中布局
   */
  private renderTitleCenter(
    content: GeneratedSlideContent,
    theme: PPTTheme,
  ): string {
    return `
      <div class="layout-title-center" style="
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        text-align: center;
        padding: 60px;
      ">
        <h1 style="
          font-family: ${theme.fonts.heading};
          font-size: 64px;
          font-weight: 700;
          color: ${theme.colors.text};
          margin-bottom: 24px;
          line-height: 1.2;
        ">${this.escapeHtml(content.title)}</h1>
        ${
          content.subtitle
            ? `
          <h2 style="
            font-family: ${theme.fonts.body};
            font-size: 28px;
            font-weight: 400;
            color: ${theme.colors.textLight};
            margin-top: 0;
          ">${this.escapeHtml(content.subtitle)}</h2>
        `
            : ""
        }
      </div>
    `;
  }

  /**
   * 渲染标题+副标题布局
   */
  private renderTitleSubtitle(
    content: GeneratedSlideContent,
    theme: PPTTheme,
  ): string {
    return `
      <div class="layout-title-subtitle" style="
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        height: 100%;
        padding: 80px;
      ">
        <h1 style="
          font-family: ${theme.fonts.heading};
          font-size: 56px;
          font-weight: 700;
          color: ${theme.colors.text};
          margin-bottom: 16px;
        ">${this.escapeHtml(content.title)}</h1>
        ${
          content.subtitle
            ? `
          <h2 style="
            font-family: ${theme.fonts.body};
            font-size: 24px;
            font-weight: 400;
            color: ${theme.colors.textLight};
          ">${this.escapeHtml(content.subtitle)}</h2>
        `
            : ""
        }
        ${
          content.bodyText
            ? `
          <p style="
            font-family: ${theme.fonts.body};
            font-size: 20px;
            color: ${theme.colors.textMuted};
            margin-top: 40px;
            max-width: 800px;
          ">${this.escapeHtml(content.bodyText)}</p>
        `
            : ""
        }
      </div>
    `;
  }

  /**
   * 渲染纯文本布局
   */
  private renderTextOnly(
    content: GeneratedSlideContent,
    theme: PPTTheme,
  ): string {
    return `
      <div class="layout-text-only" style="
        padding: 60px 80px;
        height: 100%;
        display: flex;
        flex-direction: column;
      ">
        <h1 style="
          font-family: ${theme.fonts.heading};
          font-size: 40px;
          font-weight: 600;
          color: ${theme.colors.text};
          margin-bottom: 40px;
        ">${this.escapeHtml(content.title)}</h1>
        ${
          content.bodyText
            ? `
          <p style="
            font-family: ${theme.fonts.body};
            font-size: 22px;
            line-height: 1.8;
            color: ${theme.colors.textLight};
          ">${this.escapeHtml(content.bodyText)}</p>
        `
            : ""
        }
        ${this.renderBulletList(content.bulletPoints, theme)}
      </div>
    `;
  }

  /**
   * 渲染左右分割布局（图文）
   */
  private renderTextImageSplit(
    content: GeneratedSlideContent,
    image: GeneratedSlideImage | undefined,
    theme: PPTTheme,
    imagePosition: "left" | "right",
  ): string {
    const imageHtml = image
      ? `<img src="${image.url}" alt="" style="
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: ${this.getBorderRadius(theme)};
        "/>`
      : `<div style="
          width: 100%;
          height: 100%;
          background: ${theme.colors.backgroundSecondary};
          border-radius: ${this.getBorderRadius(theme)};
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${theme.colors.textMuted};
        ">Image Placeholder</div>`;

    const textHtml = `
      <div style="display: flex; flex-direction: column; justify-content: center; height: 100%;">
        <h1 style="
          font-family: ${theme.fonts.heading};
          font-size: 36px;
          font-weight: 600;
          color: ${theme.colors.text};
          margin-bottom: 24px;
        ">${this.escapeHtml(content.title)}</h1>
        ${this.renderBulletList(content.bulletPoints, theme)}
        ${
          content.highlightText
            ? `
          <div style="
            margin-top: 24px;
            padding: 16px 24px;
            background: ${theme.colors.accent}22;
            border-left: 4px solid ${theme.colors.accent};
            border-radius: 4px;
            font-size: 18px;
            color: ${theme.colors.text};
          ">${this.escapeHtml(content.highlightText)}</div>
        `
            : ""
        }
      </div>
    `;

    const leftContent = imagePosition === "left" ? imageHtml : textHtml;
    const rightContent = imagePosition === "left" ? textHtml : imageHtml;

    return `
      <div class="layout-text-image-split" style="
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 40px;
        height: 100%;
        padding: 60px;
        align-items: center;
      ">
        <div style="height: 100%;">${leftContent}</div>
        <div style="padding: 20px;">${rightContent}</div>
      </div>
    `;
  }

  /**
   * 渲染全屏图片布局
   */
  private renderImageFull(
    content: GeneratedSlideContent,
    image: GeneratedSlideImage | undefined,
    theme: PPTTheme,
  ): string {
    const bgStyle = image
      ? `background-image: linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url('${image.url}'); background-size: cover; background-position: center;`
      : `background: ${theme.colors.backgroundSecondary};`;

    return `
      <div class="layout-image-full" style="
        ${bgStyle}
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding: 80px;
      ">
        <h1 style="
          font-family: ${theme.fonts.heading};
          font-size: 48px;
          font-weight: 700;
          color: white;
          margin-bottom: 16px;
          text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        ">${this.escapeHtml(content.title)}</h1>
        ${
          content.subtitle
            ? `
          <h2 style="
            font-family: ${theme.fonts.body};
            font-size: 24px;
            font-weight: 400;
            color: rgba(255,255,255,0.9);
            text-shadow: 0 1px 2px rgba(0,0,0,0.2);
          ">${this.escapeHtml(content.subtitle)}</h2>
        `
            : ""
        }
      </div>
    `;
  }

  /**
   * 渲染双栏布局
   */
  private renderTwoColumns(
    content: GeneratedSlideContent,
    theme: PPTTheme,
  ): string {
    const points = content.bulletPoints || [];
    const midpoint = Math.ceil(points.length / 2);
    const leftPoints = points.slice(0, midpoint);
    const rightPoints = points.slice(midpoint);

    return `
      <div class="layout-two-columns" style="
        padding: 60px 80px;
        height: 100%;
      ">
        <h1 style="
          font-family: ${theme.fonts.heading};
          font-size: 36px;
          font-weight: 600;
          color: ${theme.colors.text};
          margin-bottom: 40px;
        ">${this.escapeHtml(content.title)}</h1>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 60px;">
          <div>${this.renderBulletList(leftPoints, theme)}</div>
          <div>${this.renderBulletList(rightPoints, theme)}</div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染三栏布局
   */
  private renderThreeColumns(
    content: GeneratedSlideContent,
    theme: PPTTheme,
  ): string {
    const points = content.bulletPoints || [];
    const third = Math.ceil(points.length / 3);

    return `
      <div class="layout-three-columns" style="
        padding: 60px 80px;
        height: 100%;
      ">
        <h1 style="
          font-family: ${theme.fonts.heading};
          font-size: 36px;
          font-weight: 600;
          color: ${theme.colors.text};
          margin-bottom: 40px;
        ">${this.escapeHtml(content.title)}</h1>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px;">
          <div>${this.renderBulletList(points.slice(0, third), theme)}</div>
          <div>${this.renderBulletList(points.slice(third, third * 2), theme)}</div>
          <div>${this.renderBulletList(points.slice(third * 2), theme)}</div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染要点列表布局
   */
  private renderBulletPoints(
    content: GeneratedSlideContent,
    theme: PPTTheme,
  ): string {
    return `
      <div class="layout-bullet-points" style="
        padding: 60px 80px;
        height: 100%;
      ">
        <h1 style="
          font-family: ${theme.fonts.heading};
          font-size: 36px;
          font-weight: 600;
          color: ${theme.colors.text};
          margin-bottom: 40px;
        ">${this.escapeHtml(content.title)}</h1>
        ${this.renderBulletList(content.bulletPoints, theme, true)}
      </div>
    `;
  }

  /**
   * 渲染编号列表布局
   */
  private renderNumberedList(
    content: GeneratedSlideContent,
    theme: PPTTheme,
  ): string {
    const items = content.numberedItems || content.bulletPoints || [];

    return `
      <div class="layout-numbered-list" style="
        padding: 60px 80px;
        height: 100%;
      ">
        <h1 style="
          font-family: ${theme.fonts.heading};
          font-size: 36px;
          font-weight: 600;
          color: ${theme.colors.text};
          margin-bottom: 40px;
        ">${this.escapeHtml(content.title)}</h1>
        <ol style="
          font-family: ${theme.fonts.body};
          font-size: 22px;
          line-height: 2;
          color: ${theme.colors.textLight};
          padding-left: 30px;
        ">
          ${items
            .map(
              (item, i) => `
            <li style="margin-bottom: 16px;">
              <span style="color: ${theme.colors.accent}; font-weight: 600;">${i + 1}.</span>
              ${this.escapeHtml(item)}
            </li>
          `,
            )
            .join("")}
        </ol>
      </div>
    `;
  }

  /**
   * 渲染对比布局
   */
  private renderComparison(
    content: GeneratedSlideContent,
    theme: PPTTheme,
  ): string {
    const points = content.bulletPoints || [];
    const midpoint = Math.ceil(points.length / 2);

    return `
      <div class="layout-comparison" style="
        padding: 60px 80px;
        height: 100%;
      ">
        <h1 style="
          font-family: ${theme.fonts.heading};
          font-size: 36px;
          font-weight: 600;
          color: ${theme.colors.text};
          margin-bottom: 40px;
          text-align: center;
        ">${this.escapeHtml(content.title)}</h1>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; height: calc(100% - 100px);">
          <div style="
            background: ${theme.colors.primary}11;
            border-radius: ${this.getBorderRadius(theme)};
            padding: 40px;
            border-top: 4px solid ${theme.colors.primary};
          ">
            ${this.renderBulletList(points.slice(0, midpoint), theme)}
          </div>
          <div style="
            background: ${theme.colors.accent}11;
            border-radius: ${this.getBorderRadius(theme)};
            padding: 40px;
            border-top: 4px solid ${theme.colors.accent};
          ">
            ${this.renderBulletList(points.slice(midpoint), theme)}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染水平时间线布局
   */
  private renderTimelineHorizontal(
    content: GeneratedSlideContent,
    theme: PPTTheme,
  ): string {
    const points = content.bulletPoints || [];

    return `
      <div class="layout-timeline" style="
        padding: 60px 80px;
        height: 100%;
      ">
        <h1 style="
          font-family: ${theme.fonts.heading};
          font-size: 36px;
          font-weight: 600;
          color: ${theme.colors.text};
          margin-bottom: 60px;
        ">${this.escapeHtml(content.title)}</h1>
        <div style="
          display: flex;
          justify-content: space-between;
          position: relative;
          padding-top: 20px;
        ">
          <div style="
            position: absolute;
            top: 30px;
            left: 0;
            right: 0;
            height: 4px;
            background: ${theme.colors.primary};
          "></div>
          ${points
            .map(
              (point) => `
            <div style="
              text-align: center;
              flex: 1;
              position: relative;
              padding: 0 20px;
            ">
              <div style="
                width: 20px;
                height: 20px;
                background: ${theme.colors.accent};
                border-radius: 50%;
                margin: 0 auto 20px;
                position: relative;
                z-index: 1;
              "></div>
              <div style="
                font-family: ${theme.fonts.body};
                font-size: 16px;
                color: ${theme.colors.textLight};
                line-height: 1.5;
              ">${this.escapeHtml(point)}</div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  /**
   * 渲染统计卡片布局
   */
  private renderStatisticsCards(
    content: GeneratedSlideContent,
    theme: PPTTheme,
  ): string {
    const stats = content.statistics || [];

    return `
      <div class="layout-statistics" style="
        padding: 60px 80px;
        height: 100%;
      ">
        <h1 style="
          font-family: ${theme.fonts.heading};
          font-size: 36px;
          font-weight: 600;
          color: ${theme.colors.text};
          margin-bottom: 40px;
        ">${this.escapeHtml(content.title)}</h1>
        <div style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 30px;
        ">
          ${stats
            .map(
              (stat) => `
            <div style="
              background: ${theme.colors.backgroundSecondary};
              border-radius: ${this.getBorderRadius(theme)};
              padding: 30px;
              text-align: center;
              ${this.getShadow(theme)}
            ">
              <div style="
                font-family: ${theme.fonts.heading};
                font-size: 48px;
                font-weight: 700;
                color: ${theme.colors.accent};
                margin-bottom: 8px;
              ">${this.escapeHtml(stat.value)}</div>
              <div style="
                font-family: ${theme.fonts.body};
                font-size: 16px;
                color: ${theme.colors.textLight};
              ">${this.escapeHtml(stat.label)}</div>
              ${
                stat.comparison
                  ? `
                <div style="
                  font-size: 14px;
                  color: ${stat.trend === "up" ? "#22c55e" : stat.trend === "down" ? "#ef4444" : theme.colors.textMuted};
                  margin-top: 8px;
                ">
                  ${stat.trend === "up" ? "↑" : stat.trend === "down" ? "↓" : "→"} ${this.escapeHtml(stat.comparison)}
                </div>
              `
                  : ""
              }
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  /**
   * 渲染引用布局
   */
  private renderQuote(content: GeneratedSlideContent, theme: PPTTheme): string {
    const quote = content.quote || {
      text: content.highlightText || content.title,
    };

    return `
      <div class="layout-quote" style="
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        padding: 80px;
        text-align: center;
      ">
        <div style="
          font-size: 72px;
          color: ${theme.colors.accent};
          font-family: Georgia, serif;
          line-height: 1;
          margin-bottom: 20px;
        ">"</div>
        <blockquote style="
          font-family: ${theme.fonts.heading};
          font-size: 32px;
          font-style: italic;
          color: ${theme.colors.text};
          max-width: 800px;
          line-height: 1.6;
          margin: 0;
        ">${this.escapeHtml(quote.text)}</blockquote>
        ${
          quote.author
            ? `
          <div style="
            font-family: ${theme.fonts.body};
            font-size: 20px;
            color: ${theme.colors.textLight};
            margin-top: 30px;
          ">— ${this.escapeHtml(quote.author)}${quote.source ? `, ${this.escapeHtml(quote.source)}` : ""}</div>
        `
            : ""
        }
      </div>
    `;
  }

  /**
   * 渲染卡片网格布局
   */
  private renderCardsGrid(
    content: GeneratedSlideContent,
    theme: PPTTheme,
  ): string {
    const points = content.bulletPoints || [];

    return `
      <div class="layout-cards-grid" style="
        padding: 60px 80px;
        height: 100%;
      ">
        <h1 style="
          font-family: ${theme.fonts.heading};
          font-size: 36px;
          font-weight: 600;
          color: ${theme.colors.text};
          margin-bottom: 40px;
        ">${this.escapeHtml(content.title)}</h1>
        <div style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
        ">
          ${points
            .map(
              (point, i) => `
            <div style="
              background: ${theme.colors.backgroundSecondary};
              border-radius: ${this.getBorderRadius(theme)};
              padding: 24px;
              ${this.getShadow(theme)}
            ">
              <div style="
                width: 40px;
                height: 40px;
                background: ${theme.colors.accent}22;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: ${theme.colors.accent};
                font-weight: 600;
                font-size: 18px;
                margin-bottom: 16px;
              ">${i + 1}</div>
              <div style="
                font-family: ${theme.fonts.body};
                font-size: 16px;
                color: ${theme.colors.textLight};
                line-height: 1.6;
              ">${this.escapeHtml(point)}</div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  /**
   * 渲染要点列表
   */
  private renderBulletList(
    points: string[] | undefined,
    theme: PPTTheme,
    large: boolean = false,
  ): string {
    if (!points || points.length === 0) {
      return "";
    }

    return `
      <ul style="
        font-family: ${theme.fonts.body};
        font-size: ${large ? "24px" : "20px"};
        line-height: ${large ? "2" : "1.8"};
        color: ${theme.colors.textLight};
        list-style: none;
        padding: 0;
        margin: 0;
      ">
        ${points
          .map(
            (point) => `
          <li style="
            display: flex;
            align-items: flex-start;
            margin-bottom: ${large ? "20px" : "12px"};
          ">
            <span style="
              width: 8px;
              height: 8px;
              background: ${theme.colors.accent};
              border-radius: 50%;
              margin-top: 10px;
              margin-right: 16px;
              flex-shrink: 0;
            "></span>
            <span>${this.escapeHtml(point)}</span>
          </li>
        `,
          )
          .join("")}
      </ul>
    `;
  }

  /**
   * 渲染演讲者备注
   */
  private renderSpeakerNotes(notes: string | undefined): string {
    if (!notes) {
      return "";
    }

    return `
      <div class="speaker-notes" style="display: none;" data-notes="${this.escapeHtml(notes)}">
        ${this.escapeHtml(notes)}
      </div>
    `;
  }

  /**
   * 获取边框圆角
   */
  private getBorderRadius(theme: PPTTheme): string {
    const radiusMap = {
      none: "0",
      small: "4px",
      medium: "8px",
      large: "16px",
    };
    return radiusMap[theme.borderRadius] || "8px";
  }

  /**
   * 获取阴影样式
   */
  private getShadow(theme: PPTTheme): string {
    const shadowMap = {
      none: "",
      subtle: "box-shadow: 0 1px 3px rgba(0,0,0,0.1);",
      medium: "box-shadow: 0 4px 6px rgba(0,0,0,0.1);",
      strong: "box-shadow: 0 10px 25px rgba(0,0,0,0.15);",
    };
    return shadowMap[theme.shadowStyle] || "";
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
