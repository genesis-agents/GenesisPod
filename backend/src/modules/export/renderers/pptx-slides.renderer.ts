/**
 * AI Slides PPTX 渲染器
 * 支持15种专业模板的PPT导出
 *
 * 模板类型：
 * 1. Structural: cover, toc, chapterTitle, chapterSummary, conclusion
 * 2. Timeline: timeline, evolutionRoadmap
 * 3. Layout: multiColumn, splitLayout
 * 4. Data: dashboard
 * 5. Analysis: comparison, caseStudy, maturityModel, riskOpportunity
 * 6. Action: recommendations
 */

import { Injectable, Logger } from "@nestjs/common";
import PptxGenJS from "pptxgenjs";
import type {
  SlideTemplateContent,
  CoverSlideContent,
  TocSlideContent,
  ChapterTitleSlideContent,
  ChapterSummarySlideContent,
  ConclusionSlideContent,
  TimelineSlideContent,
  MultiColumnSlideContent,
  SplitLayoutSlideContent,
  DashboardSlideContent,
  EvolutionRoadmapSlideContent,
  ComparisonSlideContent,
  CaseStudySlideContent,
  MaturityModelSlideContent,
  RiskOpportunitySlideContent,
  RecommendationsSlideContent,
} from "../../ai/ai-office/slides/types/slides-templates.types";

// PPTX 类型
type Slide = ReturnType<InstanceType<typeof PptxGenJS>["addSlide"]>;

// 颜色配置
interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  textLight: string;
  textMuted: string;
}

// 文本样式（保留供未来扩展）
// @ts-ignore - Reserved for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type TextStyleConfig = {
  fontFace: string;
  fontSize: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
};

@Injectable()
export class PptxSlidesRenderer {
  private readonly logger = new Logger(PptxSlidesRenderer.name);

  // 默认颜色方案（深蓝专业风格）
  private readonly defaultColors: ColorScheme = {
    primary: "0A2B4E",
    secondary: "1e4976",
    accent: "3B82F6",
    background: "0A2B4E",
    text: "E5E7EB",
    textLight: "9CA3AF",
    textMuted: "6B7280",
  };

  /**
   * 渲染单个幻灯片
   * 支持洞察框、演讲备注、页脚等增强功能
   */
  async renderSlide(
    pptx: InstanceType<typeof PptxGenJS>,
    slideContent: SlideTemplateContent,
    colors: ColorScheme = this.defaultColors,
    options?: { pageNumber?: number; brand?: string },
  ): Promise<void> {
    const slide = pptx.addSlide();

    // 根据模板类型渲染
    switch (slideContent.templateType) {
      case "cover":
        await this.renderCoverSlide(slide, slideContent, colors);
        break;
      case "toc":
        await this.renderTocSlide(slide, slideContent, colors);
        break;
      case "chapterTitle":
        await this.renderChapterTitleSlide(slide, slideContent, colors);
        break;
      case "chapterSummary":
        await this.renderChapterSummarySlide(slide, slideContent, colors);
        break;
      case "conclusion":
        await this.renderConclusionSlide(slide, slideContent, colors);
        break;
      case "timeline":
        await this.renderTimelineSlide(slide, slideContent, colors);
        break;
      case "multiColumn":
        await this.renderMultiColumnSlide(slide, slideContent, colors);
        break;
      case "splitLayout":
        await this.renderSplitLayoutSlide(slide, slideContent, colors);
        break;
      case "dashboard":
        await this.renderDashboardSlide(slide, slideContent, colors);
        break;
      case "evolutionRoadmap":
        await this.renderEvolutionRoadmapSlide(slide, slideContent, colors);
        break;
      case "comparison":
        await this.renderComparisonSlide(slide, slideContent, colors);
        break;
      case "caseStudy":
        await this.renderCaseStudySlide(slide, slideContent, colors);
        break;
      case "maturityModel":
        await this.renderMaturityModelSlide(slide, slideContent, colors);
        break;
      case "riskOpportunity":
        await this.renderRiskOpportunitySlide(slide, slideContent, colors);
        break;
      case "recommendations":
        await this.renderRecommendationsSlide(slide, slideContent, colors);
        break;
      default:
        this.logger.warn(
          `Unknown template type: ${(slideContent as any).templateType}`,
        );
    }

    // 添加底部洞察框 (如果有)
    if (slideContent.insight) {
      this.renderInsightBox(slide, slideContent.insight, colors);
    }

    // 添加演讲备注 (如果有)
    if (slideContent.speakerNotes) {
      slide.addNotes(slideContent.speakerNotes);
    }

    // 添加页脚 (除封面和结论页)
    if (
      slideContent.templateType !== "cover" &&
      slideContent.templateType !== "conclusion" &&
      options?.pageNumber
    ) {
      this.renderFooter(slide, options.pageNumber, options.brand, colors);
    }
  }

  // ============================================================================
  // 1. Structural Templates (结构类模板)
  // ============================================================================

  /**
   * 封面页模板
   */
  private async renderCoverSlide(
    slide: Slide,
    content: CoverSlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    // 背景渐变
    slide.background = { color: colors.background };

    // 装饰条
    slide.addShape("rect", {
      x: 0,
      y: 0,
      w: "100%",
      h: 2,
      fill: { color: colors.primary },
    });

    // 主标题
    slide.addText(content.title, {
      x: 0.5,
      y: 2.5,
      w: 12.33,
      h: 1.5,
      fontSize: 54,
      fontFace: "Microsoft YaHei",
      color: colors.text,
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
        fontFace: "Microsoft YaHei",
        color: colors.textLight,
        align: "center",
      });
    }

    // 作者信息
    const metaY = 5.5;
    const metaItems: string[] = [];
    if (content.author) metaItems.push(content.author);
    if (content.organization) metaItems.push(content.organization);
    if (content.date) metaItems.push(content.date);

    if (metaItems.length > 0) {
      slide.addText(metaItems.join(" | "), {
        x: 1.5,
        y: metaY,
        w: 10.33,
        h: 0.5,
        fontSize: 16,
        fontFace: "Microsoft YaHei",
        color: colors.textMuted,
        align: "center",
      });
    }

    // 标语
    if (content.tagline) {
      slide.addText(content.tagline, {
        x: 1.5,
        y: 6.3,
        w: 10.33,
        h: 0.5,
        fontSize: 14,
        fontFace: "Microsoft YaHei",
        color: colors.accent,
        italic: true,
        align: "center",
      });
    }
  }

  /**
   * 目录页模板
   */
  private async renderTocSlide(
    slide: Slide,
    content: TocSlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };

    // 金色装饰竖条
    this.renderAccentBar(slide, 0.5);

    // 标题
    slide.addText(content.title, {
      x: 0.55,
      y: 0.5,
      w: 12.28,
      h: 0.8,
      fontSize: 36,
      fontFace: "Noto Sans SC",
      color: colors.text,
      bold: true,
    });

    // 分隔线
    slide.addShape("line", {
      x: 0.55,
      y: 1.2,
      w: 2,
      h: 0,
      line: { color: colors.accent, width: 3 },
    });

    // 目录项
    const startY = 1.8;
    const itemHeight = 0.7;
    const maxItems = 8;

    content.items.slice(0, maxItems).forEach((item, index) => {
      const y = startY + index * itemHeight;
      const isActive = item.isActive ?? false;

      // 编号背景
      slide.addShape("ellipse", {
        x: 0.5,
        y: y + 0.05,
        w: 0.5,
        h: 0.5,
        fill: { color: isActive ? colors.accent : colors.secondary },
      });

      // 编号
      slide.addText(String(item.number), {
        x: 0.5,
        y: y + 0.05,
        w: 0.5,
        h: 0.5,
        fontSize: 18,
        fontFace: "Microsoft YaHei",
        color: "FFFFFF",
        bold: true,
        align: "center",
        valign: "middle",
      });

      // 标题
      slide.addText(item.title, {
        x: 1.2,
        y: y,
        w: 9,
        h: 0.5,
        fontSize: isActive ? 22 : 20,
        fontFace: "Microsoft YaHei",
        color: isActive ? colors.text : colors.textLight,
        bold: isActive,
      });

      // 副标题
      if (item.subtitle) {
        slide.addText(item.subtitle, {
          x: 10.5,
          y: y,
          w: 2.33,
          h: 0.5,
          fontSize: 14,
          fontFace: "Microsoft YaHei",
          color: colors.textMuted,
          align: "right",
        });
      }
    });
  }

  /**
   * 章节标题页模板 (增强版)
   * 包含：巨大编号(135pt)、金色装饰条、透明边框装饰框
   */
  private async renderChapterTitleSlide(
    slide: Slide,
    content: ChapterTitleSlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };

    // 1. 巨大章节编号 (135pt) - 左上角
    slide.addText(String(content.chapterNumber).padStart(2, "0"), {
      x: 0.6,
      y: 0.2,
      w: 3.5,
      h: 2.5,
      fontSize: 135,
      fontFace: "Noto Sans SC",
      color: "FFFFFF",
      bold: true,
    });

    // 2. 金色装饰条 (居中横线)
    slide.addShape("rect", {
      x: 4.5,
      y: 1.2,
      w: 1.2,
      h: 0.08,
      fill: { color: "D4AF37" },
    });

    // 3. 透明边框装饰框 (右上角)
    slide.addShape("rect", {
      x: 10.2,
      y: 0.4,
      w: 2,
      h: 2,
      fill: { type: "none" },
      line: { color: "D4AF37", width: 2.5, transparency: 70 },
    });

    // 4. 透明边框装饰框 (左下角)
    slide.addShape("rect", {
      x: 0.4,
      y: 4.8,
      w: 2,
      h: 2,
      fill: { type: "none" },
      line: { color: "D4AF37", width: 2.5, transparency: 70 },
    });

    // 5. CHAPTER 标签
    const chapterLabel = `CHAPTER ${content.chapterNumber > 9 ? "" : "0"}${content.chapterNumber}`;
    slide.addText(chapterLabel, {
      x: 4.2,
      y: 1.6,
      w: 4,
      h: 0.4,
      fontSize: 18,
      fontFace: "Noto Sans SC",
      color: "94A3B8",
      align: "center",
    });

    // 6. 章节标题 (居中)
    slide.addText(content.title, {
      x: 1,
      y: 2.5,
      w: 11.33,
      h: 1,
      fontSize: 48,
      fontFace: "Noto Sans SC",
      color: "F8FAFC",
      bold: true,
      align: "center",
    });

    // 7. 副标题
    if (content.subtitle) {
      slide.addText(content.subtitle, {
        x: 2,
        y: 3.6,
        w: 9.33,
        h: 0.5,
        fontSize: 18,
        fontFace: "Noto Sans SC",
        color: "CBD5E1",
        align: "center",
      });
    }

    // 8. 分隔线 (淡白色)
    slide.addShape("rect", {
      x: 3,
      y: 4.2,
      w: 7.33,
      h: 0.01,
      fill: { color: "FFFFFF", transparency: 85 },
    });

    // 9. 描述
    if (content.description) {
      slide.addText(content.description, {
        x: 2.5,
        y: 4.5,
        w: 8.33,
        h: 0.8,
        fontSize: 15,
        fontFace: "Noto Sans SC",
        color: "94A3B8",
        align: "center",
      });
    }
  }

  /**
   * 章节摘要页模板
   */
  private async renderChapterSummarySlide(
    slide: Slide,
    content: ChapterSummarySlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };

    // 金色装饰竖条
    this.renderAccentBar(slide, 0.5);

    // 标题
    slide.addText(content.title, {
      x: 0.55,
      y: 0.5,
      w: 12.28,
      h: 0.8,
      fontSize: 32,
      fontFace: "Noto Sans SC",
      color: colors.text,
      bold: true,
    });

    // 关键要点
    const startY = 1.5;
    const itemHeight = 1.2;
    const maxPoints = 4;

    content.keyPoints.slice(0, maxPoints).forEach((point, index) => {
      const y = startY + index * itemHeight;
      const isHighlight = point.highlight ?? false;

      // 卡片背景
      slide.addShape("roundRect", {
        x: 0.5,
        y: y,
        w: 12.33,
        h: 1,
        fill: { color: isHighlight ? colors.secondary : colors.primary },
        line: {
          color: isHighlight ? colors.accent : colors.secondary,
          width: 2,
        },
      });

      // 图标（如果有）
      if (point.icon) {
        slide.addText(point.icon, {
          x: 0.7,
          y: y + 0.1,
          w: 0.8,
          h: 0.8,
          fontSize: 32,
          align: "center",
          valign: "middle",
        });
      }

      // 标题
      slide.addText(point.title, {
        x: point.icon ? 1.7 : 0.7,
        y: y + 0.1,
        w: 6,
        h: 0.4,
        fontSize: 20,
        fontFace: "Microsoft YaHei",
        color: colors.text,
        bold: true,
      });

      // 描述
      slide.addText(point.description, {
        x: point.icon ? 1.7 : 0.7,
        y: y + 0.5,
        w: 11,
        h: 0.4,
        fontSize: 14,
        fontFace: "Microsoft YaHei",
        color: colors.textLight,
      });
    });

    // 总结
    if (content.summary) {
      slide.addText(content.summary, {
        x: 0.5,
        y: 6.5,
        w: 12.33,
        h: 0.8,
        fontSize: 16,
        fontFace: "Microsoft YaHei",
        color: colors.textMuted,
        italic: true,
      });
    }
  }

  /**
   * 结论页模板
   */
  private async renderConclusionSlide(
    slide: Slide,
    content: ConclusionSlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };

    // 标题
    slide.addText(content.title, {
      x: 0.5,
      y: 0.5,
      w: 12.33,
      h: 0.8,
      fontSize: 36,
      fontFace: "Microsoft YaHei",
      color: colors.text,
      bold: true,
      align: "center",
    });

    // 关键要点
    const startY = 1.8;
    const itemHeight = 0.8;
    const maxTakeaways = 5;

    content.keyTakeaways.slice(0, maxTakeaways).forEach((takeaway, index) => {
      const y = startY + index * itemHeight;
      const emphasis = takeaway.emphasis || "medium";
      const fontSize =
        emphasis === "high" ? 22 : emphasis === "medium" ? 20 : 18;
      const color = emphasis === "high" ? colors.accent : colors.text;

      // 要点项
      slide.addText(
        [
          {
            text: `${takeaway.icon || "✓"} ${takeaway.text}`,
            options: {
              fontSize,
              fontFace: "Microsoft YaHei",
              color,
              bold: emphasis === "high",
            },
          },
        ],
        {
          x: 1,
          y,
          w: 11.33,
          h: 0.7,
        },
      );
    });

    // 行动号召
    if (content.callToAction) {
      slide.addShape("roundRect", {
        x: 2,
        y: 5.5,
        w: 9.33,
        h: 0.8,
        fill: { color: colors.accent },
      });

      slide.addText(content.callToAction, {
        x: 2,
        y: 5.5,
        w: 9.33,
        h: 0.8,
        fontSize: 24,
        fontFace: "Microsoft YaHei",
        color: "FFFFFF",
        bold: true,
        align: "center",
        valign: "middle",
      });
    }

    // 结束语
    if (content.closingMessage) {
      slide.addText(content.closingMessage, {
        x: 0.5,
        y: 6.8,
        w: 12.33,
        h: 0.5,
        fontSize: 18,
        fontFace: "Microsoft YaHei",
        color: colors.textLight,
        align: "center",
      });
    }
  }

  // ============================================================================
  // 2. Timeline Templates (时间线模板)
  // ============================================================================

  /**
   * 时间线页模板
   */
  private async renderTimelineSlide(
    slide: Slide,
    content: TimelineSlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };

    // 金色装饰竖条
    this.renderAccentBar(slide, 0.5);

    // 标题
    slide.addText(content.title, {
      x: 0.55,
      y: 0.5,
      w: 12.28,
      h: 0.8,
      fontSize: 32,
      fontFace: "Noto Sans SC",
      color: colors.text,
      bold: true,
    });

    if (content.orientation === "horizontal") {
      // 水平时间线
      const lineY = 3.5;
      const startX = 1;
      const endX = 12.33;
      const lineWidth = endX - startX;

      // 时间线主线
      slide.addShape("rect", {
        x: startX,
        y: lineY,
        w: lineWidth,
        h: 0.05,
        fill: { color: colors.accent },
      });

      // 事件节点
      const maxEvents = Math.min(content.events.length, 6);
      const spacing = lineWidth / (maxEvents + 1);

      content.events.slice(0, maxEvents).forEach((event, index) => {
        const x = startX + spacing * (index + 1);
        const isCurrent = event.status === "current";
        const isHighlight = event.highlight ?? false;

        // 节点圆点
        slide.addShape("ellipse", {
          x: x - 0.2,
          y: lineY - 0.2,
          w: 0.4,
          h: 0.4,
          fill: {
            color: isCurrent || isHighlight ? colors.accent : colors.secondary,
          },
        });

        // 日期
        slide.addText(event.date, {
          x: x - 0.8,
          y: lineY - 0.8,
          w: 1.6,
          h: 0.4,
          fontSize: 14,
          fontFace: "Microsoft YaHei",
          color: colors.textLight,
          align: "center",
          bold: isCurrent,
        });

        // 标题
        slide.addText(event.title, {
          x: x - 1.2,
          y: lineY + 0.5,
          w: 2.4,
          h: 0.6,
          fontSize: 16,
          fontFace: "Microsoft YaHei",
          color: isCurrent ? colors.accent : colors.text,
          align: "center",
          bold: isCurrent,
        });

        // 描述
        if (event.description) {
          slide.addText(event.description, {
            x: x - 1.2,
            y: lineY + 1.2,
            w: 2.4,
            h: 1,
            fontSize: 12,
            fontFace: "Microsoft YaHei",
            color: colors.textMuted,
            align: "center",
          });
        }
      });
    } else {
      // 垂直时间线
      const lineX = 2;
      const startY = 1.8;
      const itemHeight = 1.2;

      content.events.slice(0, 5).forEach((event, index) => {
        const y = startY + index * itemHeight;
        const isCurrent = event.status === "current";

        // 时间线段
        if (index < content.events.length - 1) {
          slide.addShape("rect", {
            x: lineX,
            y,
            w: 0.05,
            h: itemHeight,
            fill: { color: colors.accent },
          });
        }

        // 节点
        slide.addShape("ellipse", {
          x: lineX - 0.15,
          y: y - 0.15,
          w: 0.3,
          h: 0.3,
          fill: { color: isCurrent ? colors.accent : colors.secondary },
        });

        // 日期
        slide.addText(event.date, {
          x: 0.5,
          y,
          w: 1.3,
          h: 0.4,
          fontSize: 14,
          fontFace: "Microsoft YaHei",
          color: colors.textLight,
          align: "right",
        });

        // 内容卡片
        slide.addShape("roundRect", {
          x: 2.5,
          y: y - 0.15,
          w: 10,
          h: 1,
          fill: { color: isCurrent ? colors.secondary : colors.primary },
          line: {
            color: isCurrent ? colors.accent : colors.secondary,
            width: 1,
          },
        });

        // 标题
        slide.addText(event.title, {
          x: 2.7,
          y: y,
          w: 9.6,
          h: 0.4,
          fontSize: 18,
          fontFace: "Microsoft YaHei",
          color: colors.text,
          bold: isCurrent,
        });

        // 描述
        if (event.description) {
          slide.addText(event.description, {
            x: 2.7,
            y: y + 0.45,
            w: 9.6,
            h: 0.4,
            fontSize: 14,
            fontFace: "Microsoft YaHei",
            color: colors.textLight,
          });
        }
      });
    }
  }

  /**
   * 演进路线图页模板
   */
  private async renderEvolutionRoadmapSlide(
    slide: Slide,
    content: EvolutionRoadmapSlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };

    // 金色装饰竖条
    this.renderAccentBar(slide, 0.5);

    // 标题
    slide.addText(content.title, {
      x: 0.55,
      y: 0.5,
      w: 12.28,
      h: 0.8,
      fontSize: 32,
      fontFace: "Noto Sans SC",
      color: colors.text,
      bold: true,
    });

    // 阶段卡片
    const maxStages = Math.min(content.stages.length, 4);
    const cardWidth = (12.33 - (maxStages - 1) * 0.3) / maxStages;
    const startY = 2;

    content.stages.slice(0, maxStages).forEach((stage, index) => {
      const x = 0.5 + index * (cardWidth + 0.3);
      const isCurrent = content.currentStage === index;
      const statusColor =
        stage.status === "completed"
          ? "36B37E"
          : stage.status === "in_progress"
            ? colors.accent
            : colors.textMuted;

      // 卡片背景
      slide.addShape("roundRect", {
        x,
        y: startY,
        w: cardWidth,
        h: 4.5,
        fill: { color: isCurrent ? colors.secondary : colors.primary },
        line: { color: statusColor, width: 3 },
      });

      // 阶段标签
      slide.addText(stage.phase || stage.name || "", {
        x,
        y: startY + 0.2,
        w: cardWidth,
        h: 0.4,
        fontSize: 14,
        fontFace: "Microsoft YaHei",
        color: statusColor,
        bold: true,
        align: "center",
      });

      // 标题
      slide.addText(stage.title || stage.name || "", {
        x,
        y: startY + 0.7,
        w: cardWidth,
        h: 0.8,
        fontSize: 18,
        fontFace: "Microsoft YaHei",
        color: colors.text,
        bold: true,
        align: "center",
      });

      // 描述
      slide.addText(stage.description || "", {
        x: x + 0.1,
        y: startY + 1.6,
        w: cardWidth - 0.2,
        h: 1.5,
        fontSize: 12,
        fontFace: "Microsoft YaHei",
        color: colors.textLight,
        align: "left",
      });

      // 时间框架
      if (stage.timeframe) {
        slide.addText(stage.timeframe, {
          x,
          y: startY + 4,
          w: cardWidth,
          h: 0.3,
          fontSize: 12,
          fontFace: "Microsoft YaHei",
          color: colors.textMuted,
          italic: true,
          align: "center",
        });
      }

      // 连接箭头（除最后一个）
      if (index < maxStages - 1) {
        slide.addShape("rightArrow", {
          x: x + cardWidth,
          y: startY + 2,
          w: 0.3,
          h: 0.4,
          fill: { color: colors.accent },
        });
      }
    });
  }

  // ============================================================================
  // 3. Layout Templates (布局模板)
  // ============================================================================

  /**
   * 多栏布局页模板 (增强版)
   * 支持品牌颜色头部和KPI统计
   */
  private async renderMultiColumnSlide(
    slide: Slide,
    content: MultiColumnSlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };

    // 金色装饰竖条
    this.renderAccentBar(slide, 0.5);

    // 标题
    slide.addText(content.title, {
      x: 0.55,
      y: 0.5,
      w: 12.28,
      h: 0.8,
      fontSize: 32,
      fontFace: "Noto Sans SC",
      color: colors.text,
      bold: true,
    });

    // 副标题
    if (content.subtitle) {
      slide.addText(content.subtitle, {
        x: 0.5,
        y: 1.3,
        w: 12.33,
        h: 0.5,
        fontSize: 18,
        fontFace: "Microsoft YaHei",
        color: colors.textLight,
      });
    }

    // 栏目
    const columnCount = Math.min(
      content.columnCount || content.columns.length,
      4,
    );
    const gap = 0.3;
    const totalGap = gap * (columnCount - 1);
    const columnWidth = (12.33 - totalGap) / columnCount;
    const startY = 2;

    content.columns
      .slice(0, columnCount)
      .forEach((column: any, index: number) => {
        const x = 0.5 + index * (columnWidth + gap);
        const hasBrandHeader = !!column.brandColor;
        const hasKpis = column.kpis && column.kpis.length > 0;

        // 品牌颜色头部 (如果有)
        if (hasBrandHeader) {
          this.renderBrandHeader(
            slide,
            x,
            startY,
            columnWidth,
            column.brandColor,
            column.title,
            column.subtitle,
          );
        }

        // 栏目背景
        slide.addShape("roundRect", {
          x,
          y: hasBrandHeader ? startY + 0.8 : startY,
          w: columnWidth,
          h: hasBrandHeader ? 3.7 : 4.5,
          fill: { color: column.highlight ? colors.secondary : colors.primary },
          line: {
            color: column.highlight ? colors.accent : colors.secondary,
            width: 2,
          },
        });

        // 图标 (仅当没有品牌头部时显示)
        if (column.icon && !hasBrandHeader) {
          slide.addText(column.icon, {
            x,
            y: startY + 0.3,
            w: columnWidth,
            h: 0.6,
            fontSize: 36,
            align: "center",
          });
        }

        // 标题 (仅当没有品牌头部时显示，因为品牌头部已包含标题)
        const contentStartY = hasBrandHeader ? startY + 0.9 : startY;
        if (!hasBrandHeader) {
          slide.addText(column.title, {
            x: x + 0.1,
            y: contentStartY + (column.icon ? 1 : 0.3),
            w: columnWidth - 0.2,
            h: 0.6,
            fontSize: 18,
            fontFace: "Noto Sans SC",
            color: colors.text,
            bold: true,
            align: "center",
          });
        }

        // 内容
        slide.addText(column.content, {
          x: x + 0.1,
          y: hasBrandHeader
            ? contentStartY + 0.2
            : contentStartY + (column.icon ? 1.7 : 1),
          w: columnWidth - 0.2,
          h: hasKpis ? 1.5 : 2,
          fontSize: 14,
          fontFace: "Noto Sans SC",
          color: colors.textLight,
          align: "left",
        });

        // 列表项 (带金色圆点)
        if (column.items && column.items.length > 0) {
          const itemsStartY = hasBrandHeader
            ? contentStartY + 1.8
            : contentStartY + (column.icon ? 3.7 : 3);
          column.items.slice(0, 5).forEach((item: any, itemIndex: number) => {
            const itemY = itemsStartY + itemIndex * 0.35;
            // 金色圆点
            slide.addShape("ellipse", {
              x: x + 0.15,
              y: itemY + 0.08,
              w: 0.1,
              h: 0.1,
              fill: { color: "D4AF37" },
            });
            // 文字
            slide.addText(String(item), {
              x: x + 0.3,
              y: itemY,
              w: columnWidth - 0.4,
              h: 0.35,
              fontSize: 11,
              fontFace: "Noto Sans SC",
              color: colors.textMuted,
            });
          });
        }

        // 底部KPI展示 (如果有)
        if (hasKpis) {
          const kpiY = startY + (hasBrandHeader ? 3.5 : 3.8);
          this.renderKpiStats(slide, column.kpis, x, kpiY, columnWidth, colors);
        }
      });
  }

  /**
   * 分屏布局页模板
   */
  private async renderSplitLayoutSlide(
    slide: Slide,
    content: SplitLayoutSlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };

    // 金色装饰竖条
    this.renderAccentBar(slide, 0.5);

    // 标题
    slide.addText(content.title, {
      x: 0.55,
      y: 0.5,
      w: 12.28,
      h: 0.8,
      fontSize: 32,
      fontFace: "Microsoft YaHei",
      color: colors.text,
      bold: true,
    });

    // 计算分屏比例
    const ratios = {
      "50-50": [6.165, 6.165],
      "60-40": [7.398, 4.932],
      "40-60": [4.932, 7.398],
      "70-30": [8.631, 3.699],
      "30-70": [3.699, 8.631],
    };
    const ratio = content.ratio || "50-50";
    const [leftWidth, rightWidth] =
      ratios[ratio as keyof typeof ratios] || ratios["50-50"];

    const startY = 1.5;
    const height = 5.5;

    // 左侧内容
    const leftSection = content.left || content.leftContent;
    if (leftSection) {
      this.renderSplitSection(
        slide,
        leftSection,
        {
          x: 0.5,
          y: startY,
          w: leftWidth,
          h: height,
        },
        colors,
      );
    }

    // 右侧内容
    const rightSection = content.right || content.rightContent;
    if (rightSection) {
      this.renderSplitSection(
        slide,
        rightSection,
        {
          x: 0.5 + leftWidth,
          y: startY,
          w: rightWidth,
          h: height,
        },
        colors,
      );
    }

    // 分隔线
    if (content.dividerStyle === "line") {
      slide.addShape("rect", {
        x: 0.5 + leftWidth - 0.01,
        y: startY,
        w: 0.02,
        h: height,
        fill: { color: colors.accent },
      });
    }
  }

  /**
   * 渲染分屏内容区域
   */
  private renderSplitSection(
    slide: Slide,
    section: any,
    pos: { x: number; y: number; w: number; h: number },
    colors: ColorScheme,
  ): void {
    if (!section) return;
    const { x, y, w, h } = pos;

    switch (section.type) {
      case "text":
        if (section.title) {
          slide.addText(section.title, {
            x: x + 0.2,
            y: y + 0.2,
            w: w - 0.4,
            h: 0.6,
            fontSize: 22,
            fontFace: "Microsoft YaHei",
            color: colors.text,
            bold: true,
          });
        }
        if (section.content) {
          slide.addText(section.content, {
            x: x + 0.2,
            y: y + (section.title ? 0.9 : 0.2),
            w: w - 0.4,
            h: h - (section.title ? 1.1 : 0.4),
            fontSize: 16,
            fontFace: "Microsoft YaHei",
            color: colors.textLight,
          });
        }
        break;

      case "list":
        if (section.items) {
          const itemsText = section.items
            .map((item: any, idx: number) => `${idx + 1}. ${item}`)
            .join("\n\n");
          slide.addText(itemsText, {
            x: x + 0.2,
            y: y + 0.2,
            w: w - 0.4,
            h: h - 0.4,
            fontSize: 16,
            fontFace: "Microsoft YaHei",
            color: colors.text,
          });
        }
        break;

      case "quote":
        if (section.quote) {
          slide.addText(`"${section.quote.text}"`, {
            x: x + 0.3,
            y: y + h / 2 - 0.8,
            w: w - 0.6,
            h: 1.2,
            fontSize: 20,
            fontFace: "Microsoft YaHei",
            color: colors.text,
            italic: true,
            align: "center",
            valign: "middle",
          });
          if (section.quote.author) {
            slide.addText(`— ${section.quote.author}`, {
              x: x + 0.3,
              y: y + h / 2 + 0.5,
              w: w - 0.6,
              h: 0.4,
              fontSize: 16,
              fontFace: "Microsoft YaHei",
              color: colors.textLight,
              align: "center",
            });
          }
        }
        break;

      case "stats":
        if (section.stats) {
          section.stats.forEach((stat: any, index: number) => {
            const statY = y + 0.5 + index * 1.5;
            slide.addText(stat.value, {
              x: x + 0.2,
              y: statY,
              w: w - 0.4,
              h: 0.8,
              fontSize: 42,
              fontFace: "Microsoft YaHei",
              color: colors.accent,
              bold: true,
              align: "center",
            });
            slide.addText(stat.label, {
              x: x + 0.2,
              y: statY + 0.9,
              w: w - 0.4,
              h: 0.4,
              fontSize: 16,
              fontFace: "Microsoft YaHei",
              color: colors.textLight,
              align: "center",
            });
          });
        }
        break;
    }
  }

  // ============================================================================
  // 4. Data Templates (数据模板)
  // ============================================================================

  /**
   * 仪表盘页模板
   */
  private async renderDashboardSlide(
    slide: Slide,
    content: DashboardSlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };

    // 金色装饰竖条
    this.renderAccentBar(slide, 0.5);

    // 标题
    slide.addText(content.title, {
      x: 0.55,
      y: 0.5,
      w: 12.28,
      h: 0.8,
      fontSize: 32,
      fontFace: "Noto Sans SC",
      color: colors.text,
      bold: true,
    });

    // 指标卡片（网格布局）
    const startY = 1.5;
    const cardGap = 0.3;
    const metricsPerRow = 4;
    const cardWidth = (12.33 - (metricsPerRow - 1) * cardGap) / metricsPerRow;
    const cardHeight = 1.5;

    content.metrics.slice(0, 8).forEach((metric, index) => {
      const row = Math.floor(index / metricsPerRow);
      const col = index % metricsPerRow;
      const x = 0.5 + col * (cardWidth + cardGap);
      const y = startY + row * (cardHeight + cardGap);

      // 卡片背景
      slide.addShape("roundRect", {
        x,
        y,
        w: cardWidth,
        h: cardHeight,
        fill: { color: colors.primary },
        line: {
          color: metric.color ? this.hexToColor(metric.color) : colors.accent,
          width: 2,
        },
      });

      // 数值
      slide.addText(`${metric.value}${metric.unit || ""}`, {
        x,
        y: y + 0.2,
        w: cardWidth,
        h: 0.6,
        fontSize: 32,
        fontFace: "Microsoft YaHei",
        color: metric.color ? this.hexToColor(metric.color) : colors.accent,
        bold: true,
        align: "center",
      });

      // 标签
      slide.addText(metric.label, {
        x,
        y: y + 0.9,
        w: cardWidth,
        h: 0.4,
        fontSize: 14,
        fontFace: "Microsoft YaHei",
        color: colors.textLight,
        align: "center",
      });

      // 趋势
      if (metric.trend && metric.trendValue) {
        const trendIcon =
          metric.trend === "up" ? "↑" : metric.trend === "down" ? "↓" : "→";
        const trendColor =
          metric.trend === "up"
            ? "36B37E"
            : metric.trend === "down"
              ? "FF5630"
              : colors.textMuted;
        slide.addText(`${trendIcon} ${metric.trendValue}`, {
          x,
          y: y + 1.2,
          w: cardWidth,
          h: 0.2,
          fontSize: 11,
          fontFace: "Microsoft YaHei",
          color: trendColor,
          align: "center",
        });
      }
    });
  }

  // ============================================================================
  // 5-6. Analysis & Action Templates (分析与行动模板 - 简化实现)
  // ============================================================================

  private async renderComparisonSlide(
    slide: Slide,
    content: ComparisonSlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };
    slide.addText(content.title, {
      x: 0.5,
      y: 0.5,
      w: 12.33,
      h: 0.8,
      fontSize: 32,
      fontFace: "Microsoft YaHei",
      color: colors.text,
      bold: true,
    });
    slide.addText("对比分析内容（待完善）", {
      x: 0.5,
      y: 2,
      w: 12.33,
      h: 4,
      fontSize: 18,
      fontFace: "Microsoft YaHei",
      color: colors.textLight,
    });
  }

  private async renderCaseStudySlide(
    slide: Slide,
    content: CaseStudySlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };
    slide.addText(content.title, {
      x: 0.5,
      y: 0.5,
      w: 12.33,
      h: 0.8,
      fontSize: 32,
      fontFace: "Microsoft YaHei",
      color: colors.text,
      bold: true,
    });
    slide.addText("案例研究内容（待完善）", {
      x: 0.5,
      y: 2,
      w: 12.33,
      h: 4,
      fontSize: 18,
      fontFace: "Microsoft YaHei",
      color: colors.textLight,
    });
  }

  private async renderMaturityModelSlide(
    slide: Slide,
    content: MaturityModelSlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };
    slide.addText(content.title, {
      x: 0.5,
      y: 0.5,
      w: 12.33,
      h: 0.8,
      fontSize: 32,
      fontFace: "Microsoft YaHei",
      color: colors.text,
      bold: true,
    });
    slide.addText("成熟度模型内容（待完善）", {
      x: 0.5,
      y: 2,
      w: 12.33,
      h: 4,
      fontSize: 18,
      fontFace: "Microsoft YaHei",
      color: colors.textLight,
    });
  }

  private async renderRiskOpportunitySlide(
    slide: Slide,
    content: RiskOpportunitySlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };
    slide.addText(content.title, {
      x: 0.5,
      y: 0.5,
      w: 12.33,
      h: 0.8,
      fontSize: 32,
      fontFace: "Microsoft YaHei",
      color: colors.text,
      bold: true,
    });
    slide.addText("风险机会矩阵内容（待完善）", {
      x: 0.5,
      y: 2,
      w: 12.33,
      h: 4,
      fontSize: 18,
      fontFace: "Microsoft YaHei",
      color: colors.textLight,
    });
  }

  private async renderRecommendationsSlide(
    slide: Slide,
    content: RecommendationsSlideContent,
    colors: ColorScheme,
  ): Promise<void> {
    slide.background = { color: colors.background };

    // 金色装饰竖条
    this.renderAccentBar(slide, 0.5);

    // 标题
    slide.addText(content.title, {
      x: 0.55,
      y: 0.5,
      w: 12.28,
      h: 0.8,
      fontSize: 32,
      fontFace: "Noto Sans SC",
      color: colors.text,
      bold: true,
    });

    // 建议列表
    const startY = 1.5;
    const itemHeight = 1;
    const maxRecommendations = Math.min(content.recommendations.length, 5);

    content.recommendations
      .slice(0, maxRecommendations)
      .forEach((rec: any, index: number) => {
        const y = startY + index * itemHeight;
        const priorityColors: Record<string, string> = {
          critical: "FF5630",
          high: "FF8B00",
          medium: colors.accent,
          low: colors.textMuted,
        };

        // 优先级标签
        slide.addShape("roundRect", {
          x: 0.5,
          y: y + 0.1,
          w: 0.8,
          h: 0.4,
          fill: { color: priorityColors[rec.priority] || colors.textMuted },
        });

        slide.addText(rec.priority.toUpperCase(), {
          x: 0.5,
          y: y + 0.1,
          w: 0.8,
          h: 0.4,
          fontSize: 10,
          fontFace: "Microsoft YaHei",
          color: "FFFFFF",
          bold: true,
          align: "center",
          valign: "middle",
        });

        // 标题
        slide.addText(`${rec.number || index + 1}. ${rec.title}`, {
          x: 1.5,
          y: y,
          w: 10.83,
          h: 0.4,
          fontSize: 18,
          fontFace: "Microsoft YaHei",
          color: colors.text,
          bold: true,
        });

        // 描述
        slide.addText(rec.description, {
          x: 1.5,
          y: y + 0.45,
          w: 10.83,
          h: 0.45,
          fontSize: 14,
          fontFace: "Microsoft YaHei",
          color: colors.textLight,
        });
      });
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * Hex 颜色转 PPTX 颜色（去掉 #）
   */
  private hexToColor(hex: string): string {
    return hex.replace("#", "").toUpperCase();
  }

  // ============================================================================
  // 增强组件辅助方法
  // ============================================================================

  /**
   * 渲染金色装饰竖条（标题旁）
   */
  private renderAccentBar(
    slide: Slide,
    titleY: number,
    color: string = "D4AF37",
  ): void {
    slide.addShape("rect", {
      x: 0.35,
      y: titleY + 0.1,
      w: 0.05,
      h: 0.35,
      fill: { color },
    });
  }

  /**
   * 渲染底部洞察框
   */
  private renderInsightBox(
    slide: Slide,
    insight: { type: string; text: string; icon?: string },
    _colors: ColorScheme,
    y: number = 5.9,
  ): void {
    const typeColors: Record<
      string,
      { bg: string; bar: string; text: string }
    > = {
      insight: { bg: "10B981", bar: "10B981", text: "D1FAE5" },
      warning: { bg: "F59E0B", bar: "F59E0B", text: "FEF3C7" },
      tip: { bg: "3B82F6", bar: "3B82F6", text: "DBEAFE" },
      summary: { bg: "D4AF37", bar: "D4AF37", text: "FEF9C3" },
    };

    const color = typeColors[insight.type] || typeColors.insight;

    // 背景框
    slide.addShape("rect", {
      x: 0.5,
      y,
      w: 12.33,
      h: 0.5,
      fill: { color: color.bg, transparency: 90 },
    });

    // 左侧竖条
    slide.addShape("rect", {
      x: 0.5,
      y,
      w: 0.04,
      h: 0.5,
      fill: { color: color.bar },
    });

    // 图标
    const icon =
      insight.icon ||
      (insight.type === "insight"
        ? "💡"
        : insight.type === "warning"
          ? "⚠️"
          : insight.type === "tip"
            ? "💭"
            : "📌");
    slide.addText(icon, {
      x: 0.7,
      y: y + 0.12,
      w: 0.3,
      h: 0.26,
      fontSize: 14,
    });

    // 文字
    slide.addText(insight.text, {
      x: 1.1,
      y: y + 0.12,
      w: 11.5,
      h: 0.26,
      fontSize: 11,
      fontFace: "Noto Sans SC",
      color: color.text,
    });
  }

  /**
   * 渲染页脚
   */
  private renderFooter(
    slide: Slide,
    pageNumber: number,
    brand?: string,
    _colors: ColorScheme = this.defaultColors,
  ): void {
    const footerY = 6.6;
    const footerText = brand
      ? `第${pageNumber}页 | 🔷 ${brand}`
      : `第${pageNumber}页`;

    slide.addText(footerText, {
      x: 9.5,
      y: footerY,
      w: 3.33,
      h: 0.25,
      fontSize: 10,
      fontFace: "Noto Sans SC",
      color: "94A3B8", // 使用固定的页脚颜色
      align: "right",
    });
  }

  /**
   * 渲染KPI统计展示
   */
  private renderKpiStats(
    slide: Slide,
    kpis: Array<{ value: string; label: string }>,
    x: number,
    y: number,
    width: number,
    colors: ColorScheme,
  ): void {
    if (!kpis || kpis.length === 0) return;

    const kpiWidth = (width - 0.2) / kpis.length;

    // 分隔线
    slide.addShape("rect", {
      x: x + 0.1,
      y: y - 0.1,
      w: width - 0.2,
      h: 0.01,
      fill: { color: colors.secondary },
    });

    kpis.forEach((kpi, kpiIndex) => {
      const kpiX = x + 0.1 + kpiIndex * kpiWidth;

      // KPI值
      slide.addText(kpi.value, {
        x: kpiX,
        y: y + 0.1,
        w: kpiWidth,
        h: 0.4,
        fontSize: 18,
        fontFace: "Noto Sans SC",
        color: colors.text,
        bold: true,
        align: "center",
      });

      // KPI标签
      slide.addText(kpi.label, {
        x: kpiX,
        y: y + 0.5,
        w: kpiWidth,
        h: 0.25,
        fontSize: 10,
        fontFace: "Noto Sans SC",
        color: colors.textMuted,
        align: "center",
      });
    });
  }

  /**
   * 渲染品牌颜色头部
   */
  private renderBrandHeader(
    slide: Slide,
    x: number,
    y: number,
    width: number,
    brandColor: string,
    title: string,
    subtitle?: string,
  ): void {
    // 头部背景
    slide.addShape("roundRect", {
      x,
      y,
      w: width,
      h: 0.8,
      fill: { color: this.hexToColor(brandColor) },
    });

    // 标题
    slide.addText(title, {
      x: x + 0.1,
      y: y + 0.1,
      w: width - 0.2,
      h: 0.4,
      fontSize: 14,
      fontFace: "Noto Sans SC",
      color: "FFFFFF",
      bold: true,
      align: "center",
    });

    // 副标题
    if (subtitle) {
      slide.addText(subtitle, {
        x: x + 0.1,
        y: y + 0.45,
        w: width - 0.2,
        h: 0.25,
        fontSize: 10,
        fontFace: "Noto Sans SC",
        color: "FFFFFF",
        transparency: 20,
        align: "center",
      });
    }
  }
}
