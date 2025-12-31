/**
 * Slides Engine v3.0 - Template Rendering Skill
 *
 * 确定性模板渲染：将 PageContent.sections 映射到模板变量，生成 HTML
 * 完全不依赖 AI，确保输出稳定可控
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  PageOutline,
  PageContent,
  ContentSection,
  StatContent,
  PageTemplateType,
} from "../checkpoint/checkpoint.types";
import { templateRegistry, applyVariables, SlideTemplate } from "../templates";
import { CARD_STYLE, COLORS } from "../templates/base/common-styles";
import {
  getTheme,
  getThemeContainerStyle,
  getThemeDecorationHtml,
  ThemeConfig,
} from "../templates/base/themes";
import { ChartRendererSkill } from "./chart-renderer.skill";

/**
 * 模板渲染输入
 */
export interface TemplateRenderingInput {
  pageOutline: PageOutline;
  pageContent: PageContent;
  /** 使用的已用数据值集合（用于防止重复） */
  usedValues?: Set<string>;
  /** 主题ID，默认为 'genspark-dark' */
  themeId?: string;
}

/**
 * 模板渲染结果
 */
export interface TemplateRenderingResult {
  html: string;
  templateId: string;
  variables: Record<string, string>;
  themeId: string;
}

@Injectable()
export class TemplateRenderingSkill {
  private readonly logger = new Logger(TemplateRenderingSkill.name);

  constructor(private readonly chartRenderer: ChartRendererSkill) {}

  /**
   * 渲染页面 - 主入口
   */
  render(input: TemplateRenderingInput): TemplateRenderingResult {
    const {
      pageOutline,
      pageContent,
      usedValues,
      themeId = "genspark-dark",
    } = input;
    const templateType = pageOutline.templateType;

    this.logger.log(
      `[render] Rendering page ${pageOutline.pageNumber} with template type: ${templateType}, theme: ${themeId}`,
    );

    // 0. 获取主题配置
    const theme = getTheme(themeId);

    // 1. 获取模板
    const template = this.selectTemplate(templateType);
    if (!template) {
      this.logger.warn(
        `[render] No template found for type: ${templateType}, using fallback`,
      );
      return this.renderFallback(pageOutline, pageContent, themeId);
    }

    const templateId = template.metadata.id;

    // 2. 提取变量 - 根据模板ID精确匹配变量提取逻辑
    const variables = this.extractVariablesByTemplateId(
      templateId,
      templateType,
      pageOutline,
      pageContent,
      usedValues,
    );

    // 3. 应用变量到模板
    let contentHtml = applyVariables(template, variables);

    // 4. 注入图表 SVG（如果模板包含图表占位符）
    contentHtml = this.injectChartSvg(contentHtml, pageContent, theme);

    // 5. 添加脚本（如果有）
    if (template.script) {
      contentHtml += `\n<script>\n${template.script}\n</script>`;
    }

    // 6. 包装主题容器和装饰元素
    const html = this.wrapWithTheme(contentHtml, theme);

    this.logger.log(
      `[render] Page ${pageOutline.pageNumber} rendered with template ${templateId}, theme ${themeId}`,
    );

    return {
      html,
      templateId,
      variables,
      themeId,
    };
  }

  /**
   * 包装HTML内容到主题容器，添加装饰元素
   */
  private wrapWithTheme(contentHtml: string, theme: ThemeConfig): string {
    const containerStyle = getThemeContainerStyle(theme);
    const decorationHtml = getThemeDecorationHtml(theme);

    return `
<div class="slide-container" style="${containerStyle.replace(/\n/g, " ").trim()}">
  ${decorationHtml}
  <div class="slide-content" style="position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column;">
    ${contentHtml}
  </div>
</div>
    `.trim();
  }

  /**
   * 注入图表 SVG 到 HTML
   * 查找图表占位符（id="chart-*" 的空 div）并替换为实际图表
   */
  private injectChartSvg(
    html: string,
    pageContent: PageContent,
    theme: ThemeConfig,
  ): string {
    // 匹配图表容器占位符
    const chartPlaceholderPattern =
      /<div\s+id="chart-(\w+)"[^>]*style="[^"]*"[^>]*>\s*<\/div>/gi;

    return html.replace(chartPlaceholderPattern, (match, chartType) => {
      try {
        // 从内容中提取图表数据，或生成示例数据
        const chartData =
          this.chartRenderer.extractChartData(
            pageContent.sections || [],
            this.mapChartType(chartType),
          ) ||
          this.chartRenderer.generateSampleData(this.mapChartType(chartType));

        // 渲染 SVG
        const svgStr = this.chartRenderer.renderToSvg(chartData, {
          width: 500,
          height: 300,
          theme:
            theme.id.includes("white") || theme.id.includes("light")
              ? "light"
              : "dark",
          showLegend: true,
        });

        this.logger.log(`[injectChartSvg] Injected ${chartType} chart SVG`);
        return `<div id="chart-${chartType}" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">${svgStr}</div>`;
      } catch (error) {
        this.logger.warn(`[injectChartSvg] Failed to render chart: ${error}`);
        return match; // 保留原占位符
      }
    });
  }

  /**
   * 映射图表类型名称到 ChartData 类型
   */
  private mapChartType(typeName: string): "line" | "bar" | "pie" | "radar" {
    const mapping: Record<string, "line" | "bar" | "pie" | "radar"> = {
      trend: "line",
      line: "line",
      bar: "bar",
      column: "bar",
      pie: "pie",
      donut: "pie",
      radar: "radar",
      spider: "radar",
    };
    return mapping[typeName.toLowerCase()] || "bar";
  }

  /**
   * 选择模板
   */
  private selectTemplate(templateType: PageTemplateType): SlideTemplate | null {
    const templates = templateRegistry.getByType(templateType);
    if (templates.length > 0) {
      // 优先选择 medium 密度的模板
      const medium = templates.find(
        (t) => t.metadata.contentDensity === "medium",
      );
      return medium || templates[0];
    }
    return null;
  }

  /**
   * 根据模板ID精确提取变量
   * 解决同一类型多个模板变量不一致的问题
   */
  private extractVariablesByTemplateId(
    templateId: string,
    templateType: PageTemplateType,
    pageOutline: PageOutline,
    pageContent: PageContent,
    usedValues?: Set<string>,
  ): Record<string, string> {
    const baseVars: Record<string, string> = {
      TITLE: pageContent.title || pageOutline.title,
      SUBTITLE: pageContent.subtitle || pageOutline.subtitle || "",
      DATE: new Date().toLocaleDateString("zh-CN"),
    };

    // 根据具体模板ID精确匹配变量提取逻辑
    switch (templateId) {
      // ========== Data Templates (D-001 ~ D-006) ==========
      case "D-001": // Big Number
        return { ...baseVars, ...this.extractBigNumberVariables(pageContent) };
      case "D-002": // Dashboard 4KPI
        return {
          ...baseVars,
          ...this.extractDashboardVariables(pageContent, usedValues),
        };
      case "D-003": // Trend Chart
        return {
          ...baseVars,
          ...this.extractTrendChartVariables(pageContent),
        };
      case "D-004": // Comparison Dual
        return {
          ...baseVars,
          ...this.extractComparisonDualVariables(pageContent),
        };
      case "D-005": // Comparison Table
        return {
          ...baseVars,
          ...this.extractComparisonTableVariables(pageContent),
        };
      case "D-006": // Ranking List
        return {
          ...baseVars,
          ...this.extractRankingListVariables(pageContent),
        };

      // ========== Structural Templates (S-001 ~ S-009) ==========
      case "S-001": // TOC Dual
        return { ...baseVars, ...this.extractTocVariables(pageContent) };
      case "S-002": // Section Divider
        return { ...baseVars, ...this.extractFrameworkVariables(pageContent) };
      case "S-003": // 3-Pillar
      case "S-004": // 4-Pillar
      case "S-005": // 5-Pillar
        return {
          ...baseVars,
          ...this.extractPillarsVariables(pageContent, usedValues),
        };
      case "S-006": // Timeline Horizontal
        return { ...baseVars, ...this.extractTimelineVariables(pageContent) };
      case "S-007": // Timeline Card (Evolution Roadmap)
        return { ...baseVars, ...this.extractTimelineVariables(pageContent) };
      case "S-008": // Process Steps
        return { ...baseVars, ...this.extractFrameworkVariables(pageContent) };
      case "S-009": // Pyramid
        return { ...baseVars, ...this.extractFrameworkVariables(pageContent) };

      // ========== Content Templates (C-001 ~ C-007) ==========
      case "C-001": // Image Left Text Right
      case "C-002": // Text Left Image Right
      case "C-003": // Bullet List
        return {
          ...baseVars,
          ...this.extractMultiColumnVariables(pageContent),
        };
      case "C-004": // Card Grid 2
      case "C-005": // Card Grid 3
      case "C-006": // Card Grid 4
        return {
          ...baseVars,
          ...this.extractMultiColumnVariables(pageContent),
        };
      case "C-007": // Case Detail
        return {
          ...baseVars,
          ...this.extractCaseStudyVariables(pageContent),
        };

      // ========== Narrative Templates (N-001 ~ N-005) ==========
      case "N-001": // Cover
        return { ...baseVars, ...this.extractCoverVariables(pageContent) };
      case "N-002": // Closing
        return {
          ...baseVars,
          ...this.extractCoverVariables(pageContent),
          TITLE: pageContent.title || "感谢聆听",
        };
      case "N-003": // Chapter Divider
        return {
          ...baseVars,
          ...this.extractFrameworkVariables(pageContent),
          CHAPTER_NUM: "01",
          CHAPTER_EN: "CHAPTER ONE",
        };
      case "N-004": // Table of Contents
        return { ...baseVars, ...this.extractTocVariables(pageContent) };
      case "N-005": // Closing with Contact
        return {
          ...baseVars,
          ...this.extractCoverVariables(pageContent),
          TITLE: pageContent.title || "感谢聆听",
        };

      // ========== Action Templates (A-001 ~ A-005) ==========
      case "A-001": // Recommendations 3Col
        return {
          ...baseVars,
          ...this.extractRecommendations3ColVariables(pageContent),
        };
      case "A-002": // Risk-Opportunity
        return {
          ...baseVars,
          ...this.extractRiskOpportunityVariables(pageContent),
        };
      case "A-003": // Key Conclusions
        return {
          ...baseVars,
          ...this.extractKeyConclusionsVariables(pageContent),
        };
      case "A-004": // Next Steps
        return {
          ...baseVars,
          ...this.extractNextStepsVariables(pageContent),
        };
      case "A-005": // Thank-You
        return {
          ...baseVars,
          ...this.extractCoverVariables(pageContent),
          TITLE: pageContent.title || "感谢聆听",
          SUBTITLE: pageContent.subtitle || "期待与您进一步合作",
          PRESENTER: "演示者",
          EMAIL: "contact@example.com",
          COMPANY: "公司名称",
        };

      default:
        // 降级到按类型提取
        return this.extractVariables(
          templateType,
          pageOutline,
          pageContent,
          usedValues,
        );
    }
  }

  /**
   * 提取变量 - 根据模板类型从 sections 中提取（降级方案）
   */
  private extractVariables(
    templateType: PageTemplateType,
    pageOutline: PageOutline,
    pageContent: PageContent,
    usedValues?: Set<string>,
  ): Record<string, string> {
    const baseVars: Record<string, string> = {
      TITLE: pageContent.title || pageOutline.title,
      SUBTITLE: pageContent.subtitle || pageOutline.subtitle || "",
      DATE: new Date().toLocaleDateString("zh-CN"),
    };

    // 根据模板类型提取特定变量
    switch (templateType) {
      case "pillars":
        return {
          ...baseVars,
          ...this.extractPillarsVariables(pageContent, usedValues),
        };
      case "dashboard":
        return {
          ...baseVars,
          ...this.extractDashboardVariables(pageContent, usedValues),
        };
      case "timeline":
      case "evolutionRoadmap":
        return { ...baseVars, ...this.extractTimelineVariables(pageContent) };
      case "comparison":
      case "riskOpportunity":
        return {
          ...baseVars,
          ...this.extractComparisonDualVariables(pageContent),
        };
      case "framework":
        return { ...baseVars, ...this.extractFrameworkVariables(pageContent) };
      case "cover":
        return { ...baseVars, ...this.extractCoverVariables(pageContent) };
      case "closing":
        // closing 模板使用与 cover 类似的变量，但 TITLE 默认为"感谢聆听"
        return {
          ...baseVars,
          ...this.extractCoverVariables(pageContent),
          TITLE: pageContent.title || "感谢聆听",
        };
      case "toc":
        return { ...baseVars, ...this.extractTocVariables(pageContent) };
      case "recommendations":
        return {
          ...baseVars,
          ...this.extractRecommendationsVariables(pageContent),
        };
      case "multiColumn":
        return {
          ...baseVars,
          ...this.extractMultiColumnVariables(pageContent),
        };
      case "splitLayout":
        // splitLayout 使用与 multiColumn 相同的变量
        return {
          ...baseVars,
          ...this.extractMultiColumnVariables(pageContent),
        };
      case "caseStudy":
        return {
          ...baseVars,
          ...this.extractCaseStudyVariables(pageContent),
        };
      case "questions":
        // questions 类型使用基础变量 + 列表提取
        return {
          ...baseVars,
          ...this.extractQuestionsVariables(pageContent),
        };
      case "maturityModel":
        // maturityModel 类型使用层级变量
        return {
          ...baseVars,
          ...this.extractMaturityModelVariables(pageContent),
        };
      default:
        return { ...baseVars, ...this.extractDefaultVariables(pageContent) };
    }
  }

  /**
   * 提取 Pillars 模板变量
   * 同时生成 PILLAR{N} 和 P{N} 两套变量名，兼容 S-003/S-004 和 S-005 模板
   */
  private extractPillarsVariables(
    pageContent: PageContent,
    usedValues?: Set<string>,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    // 预定义的多样化数据
    const diverseStats = [
      "85%",
      "520+",
      "3.2x",
      "92%",
      "47%",
      "180+",
      "65%",
      "2.8x",
    ];
    const diverseLabels = [
      "核心指标",
      "客户数量",
      "增长倍数",
      "满意度",
      "市场份额",
      "合作伙伴",
      "效率提升",
      "ROI",
    ];

    // 支持最多5个支柱（三支柱、四支柱、五支柱模板）
    for (let i = 0; i < 5; i++) {
      const section = sections[i];
      const pillarNum = i + 1;

      let title = `支柱 ${pillarNum}`;
      let desc = pageContent.citations?.[i] || `核心支柱 ${pillarNum}`;
      let stat = diverseStats[i] || `${85 + i * 3}%`;
      let label = diverseLabels[i] || "关键数据";

      if (section) {
        if (section.type === "stat" && this.isStatContent(section.content)) {
          const statContent = section.content as StatContent;
          title = statContent.label || title;
          desc = this.getDescriptionFromSections(sections, i);
          stat = this.ensureUniqueValue(
            statContent.value,
            usedValues,
            diverseStats,
          );
          label = diverseLabels[i] || "关键数据";
        } else if (section.type === "list" && Array.isArray(section.content)) {
          title = section.content[0] || title;
          desc = section.content.slice(1, 3).join("；") || "核心能力描述";
          stat = this.ensureUniqueValue(
            diverseStats[i],
            usedValues,
            diverseStats,
          );
        } else if (
          section.type === "text" &&
          typeof section.content === "string"
        ) {
          title = section.content.slice(0, 20) || title;
          desc = section.content.slice(0, 100) || "核心能力描述";
          stat = this.ensureUniqueValue(
            diverseStats[i],
            usedValues,
            diverseStats,
          );
        }
      }

      // PILLAR{N} 格式 (用于 S-003, S-004)
      vars[`PILLAR${pillarNum}_TITLE`] = title;
      vars[`PILLAR${pillarNum}_DESC`] = desc;
      vars[`PILLAR${pillarNum}_STAT`] = stat;
      vars[`PILLAR${pillarNum}_LABEL`] = label;

      // P{N} 格式 (用于 S-005 五支柱模板)
      vars[`P${pillarNum}_TITLE`] = title;
      vars[`P${pillarNum}_DESC`] = desc;
    }

    return vars;
  }

  /**
   * 提取 Dashboard 模板变量
   */
  private extractDashboardVariables(
    pageContent: PageContent,
    usedValues?: Set<string>,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    const diverseValues = ["$2.5M", "85%", "520+", "92%"];
    const diverseLabels = ["年度营收", "客户满意度", "活跃用户", "目标达成率"];
    const diverseChanges = ["+15%", "+8%", "+120", "+5%"];

    for (let i = 0; i < 4; i++) {
      const section = sections.find((s, idx) => s.type === "stat" && idx >= i);
      const kpiNum = i + 1;

      if (section && this.isStatContent(section.content)) {
        const stat = section.content as StatContent;
        vars[`KPI${kpiNum}_VALUE`] = this.ensureUniqueValue(
          stat.value,
          usedValues,
          diverseValues,
        );
        vars[`KPI${kpiNum}_LABEL`] = stat.label || diverseLabels[i];
        vars[`KPI${kpiNum}_CHANGE`] = stat.change || diverseChanges[i];
      } else {
        vars[`KPI${kpiNum}_VALUE`] = diverseValues[i];
        vars[`KPI${kpiNum}_LABEL`] = diverseLabels[i];
        vars[`KPI${kpiNum}_CHANGE`] = diverseChanges[i];
      }
    }

    // 趋势图表额外变量（D-003 模板）
    const statSections = sections.filter(
      (s) => s.type === "stat" && this.isStatContent(s.content),
    );
    if (statSections.length > 0) {
      const firstStat = statSections[0].content as StatContent;
      vars["CURRENT_VALUE"] = firstStat.value || diverseValues[0];
      vars["MOM_CHANGE"] = firstStat.change || "+12%";
      vars["YOY_CHANGE"] = statSections[1]
        ? (statSections[1].content as StatContent).change || "+25%"
        : "+25%";
    } else {
      vars["CURRENT_VALUE"] = diverseValues[0];
      vars["MOM_CHANGE"] = "+12%";
      vars["YOY_CHANGE"] = "+25%";
    }

    // 洞察和周期
    const textSection = sections.find(
      (s) => s.type === "text" && typeof s.content === "string",
    );
    vars["INSIGHT"] =
      (textSection?.content as string)?.slice(0, 100) ||
      "数据显示持续增长趋势，预计下季度将保持稳定发展";
    vars["PERIOD"] = "2024年Q4";

    return vars;
  }

  /**
   * 提取 Timeline 模板变量
   */
  private extractTimelineVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    const defaultDates = ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024"];
    const defaultTitles = ["规划阶段", "开发阶段", "测试阶段", "上线阶段"];
    const defaultDescs = [
      "需求分析与架构设计",
      "核心功能开发",
      "系统测试与优化",
      "正式上线运营",
    ];

    for (let i = 0; i < 4; i++) {
      const section = sections[i];
      const mNum = i + 1;

      if (section) {
        if (section.type === "stat" && this.isStatContent(section.content)) {
          const stat = section.content as StatContent;
          vars[`M${mNum}_DATE`] = stat.value || defaultDates[i];
          vars[`M${mNum}_TITLE`] = stat.label || defaultTitles[i];
          vars[`M${mNum}_DESC`] = defaultDescs[i];
        } else if (section.type === "list" && Array.isArray(section.content)) {
          vars[`M${mNum}_DATE`] = defaultDates[i];
          vars[`M${mNum}_TITLE`] = section.content[0] || defaultTitles[i];
          vars[`M${mNum}_DESC`] = section.content[1] || defaultDescs[i];
        } else if (
          section.type === "text" &&
          typeof section.content === "string"
        ) {
          vars[`M${mNum}_DATE`] = defaultDates[i];
          vars[`M${mNum}_TITLE`] =
            section.content.slice(0, 20) || defaultTitles[i];
          vars[`M${mNum}_DESC`] =
            section.content.slice(0, 50) || defaultDescs[i];
        }
      } else {
        vars[`M${mNum}_DATE`] = defaultDates[i];
        vars[`M${mNum}_TITLE`] = defaultTitles[i];
        vars[`M${mNum}_DESC`] = defaultDescs[i];
      }

      // 也设置 STAGE 变量（用于 evolutionRoadmap 模板）
      vars[`STAGE${mNum}_TITLE`] = vars[`M${mNum}_TITLE`];
      vars[`STAGE${mNum}_DESC`] = vars[`M${mNum}_DESC`];
    }

    // Vision 变量
    vars["VISION_TITLE"] = pageContent.title || "愿景目标";
    vars["VISION_DESC"] = pageContent.subtitle || "实现业务数字化转型";

    return vars;
  }

  /**
   * 提取 Framework 模板变量
   */
  private extractFrameworkVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    // 章节编号
    vars["CHAPTER_NUM"] = "1";

    // 步骤变量
    const defaultSteps = [
      { title: "需求分析", desc: "明确业务目标和用户需求" },
      { title: "方案设计", desc: "制定技术方案和实施计划" },
      { title: "开发实施", desc: "按计划推进开发工作" },
      { title: "上线运维", desc: "系统上线和持续优化" },
    ];

    for (let i = 0; i < 4; i++) {
      const section = sections[i];
      const stepNum = i + 1;

      if (
        section &&
        section.type === "text" &&
        typeof section.content === "string"
      ) {
        vars[`STEP${stepNum}_TITLE`] =
          section.content.slice(0, 15) || defaultSteps[i].title;
        vars[`STEP${stepNum}_DESC`] =
          section.content.slice(15, 60) || defaultSteps[i].desc;
      } else {
        vars[`STEP${stepNum}_TITLE`] = defaultSteps[i].title;
        vars[`STEP${stepNum}_DESC`] = defaultSteps[i].desc;
      }

      // 金字塔层级变量
      vars[`L${stepNum}_TITLE`] = vars[`STEP${stepNum}_TITLE`];
      vars[`L${stepNum}_DESC`] = vars[`STEP${stepNum}_DESC`];
    }

    return vars;
  }

  /**
   * 提取 Cover 模板变量（也用于感谢聆听页面）
   */
  private extractCoverVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    return {
      MAIN_TITLE: pageContent.title || "演示文稿标题",
      SUB_TITLE: pageContent.subtitle || "",
      AUTHOR: "DeepDive Research",
      DATE: new Date().toLocaleDateString("zh-CN"),
      // 感谢聆听页面额外变量 (N-005 closing 模板)
      PRESENTER: "演讲者",
      EMAIL: "contact@deepdive.com",
      COMPANY: "DeepDive Research",
      // N-005 模板专用变量
      MESSAGE: pageContent.subtitle || "期待与您进一步交流",
      CONTACT_NAME: "DeepDive Research",
      CONTACT_EMAIL: "contact@deepdive.com",
      CONTACT_PHONE: "+86 400-xxx-xxxx",
    };
  }

  /**
   * 提取 TOC 模板变量
   */
  private extractTocVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    let chaptersHtml = "";

    sections.forEach((section, index) => {
      const title = Array.isArray(section.content)
        ? section.content[0]
        : typeof section.content === "string"
          ? section.content
          : `章节 ${index + 1}`;

      chaptersHtml += `
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, ${COLORS.primary}, rgba(212, 175, 55, 0.7)); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px;">${String(index + 1).padStart(2, "0")}</div>
          <div style="flex: 1;">
            <div style="font-size: 18px; font-weight: 600;">${title}</div>
          </div>
        </div>
      `;
    });

    // 生成 OVERVIEW 变量
    const overview =
      pageContent.subtitle ||
      sections
        .slice(0, 3)
        .map((s) =>
          Array.isArray(s.content)
            ? s.content[0]
            : typeof s.content === "string"
              ? s.content.slice(0, 30)
              : "",
        )
        .filter(Boolean)
        .join("、") ||
      "本报告涵盖多个关键主题的深度分析";

    return {
      CHAPTERS: chaptersHtml,
      OVERVIEW: overview,
    };
  }

  /**
   * 提取 A-001 Recommendations 3Col 模板变量
   * 需要: URGENT1/2_TITLE/DESC, SHORT1/2/3_TITLE/DESC, LONG1/2/3_TITLE/DESC, OWNER
   */
  private extractRecommendations3ColVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    // 默认建议内容
    const defaultRecommendations = {
      urgent: [
        { title: "立即启动试点项目", desc: "选择1-2个关键业务场景进行验证" },
        { title: "组建专项团队", desc: "明确职责分工，确保资源到位" },
      ],
      short: [
        { title: "完善基础设施", desc: "搭建必要的技术平台和数据管道" },
        { title: "培训核心人员", desc: "提升团队专业能力" },
        { title: "建立评估体系", desc: "制定量化指标和评估标准" },
      ],
      long: [
        { title: "规模化推广", desc: "将成功经验复制到更多场景" },
        { title: "持续优化迭代", desc: "根据反馈不断改进方案" },
        { title: "构建生态体系", desc: "整合内外部资源形成合力" },
      ],
    };

    // 从 sections 提取内容
    const listSections = sections.filter(
      (s) => s.type === "list" && Array.isArray(s.content),
    );

    // 紧急建议 (2个)
    for (let i = 0; i < 2; i++) {
      const idx = i;
      const section = listSections[idx];
      if (section && Array.isArray(section.content)) {
        vars[`URGENT${i + 1}_TITLE`] =
          section.content[0] || defaultRecommendations.urgent[i].title;
        vars[`URGENT${i + 1}_DESC`] =
          section.content[1] || defaultRecommendations.urgent[i].desc;
      } else {
        vars[`URGENT${i + 1}_TITLE`] = defaultRecommendations.urgent[i].title;
        vars[`URGENT${i + 1}_DESC`] = defaultRecommendations.urgent[i].desc;
      }
    }

    // 短期建议 (3个)
    for (let i = 0; i < 3; i++) {
      const idx = 2 + i;
      const section = listSections[idx];
      if (section && Array.isArray(section.content)) {
        vars[`SHORT${i + 1}_TITLE`] =
          section.content[0] || defaultRecommendations.short[i].title;
        vars[`SHORT${i + 1}_DESC`] =
          section.content[1] || defaultRecommendations.short[i].desc;
      } else {
        vars[`SHORT${i + 1}_TITLE`] = defaultRecommendations.short[i].title;
        vars[`SHORT${i + 1}_DESC`] = defaultRecommendations.short[i].desc;
      }
    }

    // 长期建议 (3个)
    for (let i = 0; i < 3; i++) {
      const idx = 5 + i;
      const section = listSections[idx];
      if (section && Array.isArray(section.content)) {
        vars[`LONG${i + 1}_TITLE`] =
          section.content[0] || defaultRecommendations.long[i].title;
        vars[`LONG${i + 1}_DESC`] =
          section.content[1] || defaultRecommendations.long[i].desc;
      } else {
        vars[`LONG${i + 1}_TITLE`] = defaultRecommendations.long[i].title;
        vars[`LONG${i + 1}_DESC`] = defaultRecommendations.long[i].desc;
      }
    }

    vars["OWNER"] = "项目负责人";

    return vars;
  }

  /**
   * 提取 A-002 Risk-Opportunity 模板变量
   * 需要: RISK1/2/3_TITLE/DESC, OPP1/2/3_TITLE/DESC
   */
  private extractRiskOpportunityVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    const defaultRisks = [
      { title: "市场竞争加剧", desc: "竞争对手加大投入，市场份额面临压力" },
      { title: "技术迭代风险", desc: "技术更新换代快，需持续投入研发" },
      { title: "人才流失风险", desc: "核心人才竞争激烈，需加强团队建设" },
    ];

    const defaultOpps = [
      { title: "市场扩张机会", desc: "新兴市场需求旺盛，增长潜力大" },
      { title: "技术突破机遇", desc: "新技术应用带来效率提升空间" },
      { title: "合作共赢机会", desc: "产业链整合带来协同效应" },
    ];

    const listSections = sections.filter(
      (s) => s.type === "list" && Array.isArray(s.content),
    );

    // 风险 (3个)
    for (let i = 0; i < 3; i++) {
      const section = listSections[i];
      if (section && Array.isArray(section.content)) {
        vars[`RISK${i + 1}_TITLE`] =
          section.content[0] || defaultRisks[i].title;
        vars[`RISK${i + 1}_DESC`] =
          section.content.slice(1).join("；") || defaultRisks[i].desc;
      } else {
        vars[`RISK${i + 1}_TITLE`] = defaultRisks[i].title;
        vars[`RISK${i + 1}_DESC`] = defaultRisks[i].desc;
      }
    }

    // 机遇 (3个)
    for (let i = 0; i < 3; i++) {
      const section = listSections[3 + i];
      if (section && Array.isArray(section.content)) {
        vars[`OPP${i + 1}_TITLE`] = section.content[0] || defaultOpps[i].title;
        vars[`OPP${i + 1}_DESC`] =
          section.content.slice(1).join("；") || defaultOpps[i].desc;
      } else {
        vars[`OPP${i + 1}_TITLE`] = defaultOpps[i].title;
        vars[`OPP${i + 1}_DESC`] = defaultOpps[i].desc;
      }
    }

    return vars;
  }

  /**
   * 提取 A-003 Key Conclusions 模板变量
   * 需要: CONCLUSION1/2/3/4_TITLE/DESC
   */
  private extractKeyConclusionsVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    const defaultConclusions = [
      {
        title: "市场机会显著",
        desc: "目标市场规模持续增长，渗透率有较大提升空间",
      },
      { title: "技术优势明显", desc: "核心技术能力领先，具备差异化竞争优势" },
      { title: "团队执行力强", desc: "专业团队配置完整，项目交付能力获得验证" },
      {
        title: "投资回报可期",
        desc: "财务模型健康，预期投资回报率超过行业平均",
      },
    ];

    const listSections = sections.filter(
      (s) => s.type === "list" && Array.isArray(s.content),
    );
    const textSections = sections.filter(
      (s) => s.type === "text" && typeof s.content === "string",
    );

    for (let i = 0; i < 4; i++) {
      const listSection = listSections[i];
      const textSection = textSections[i];

      if (listSection && Array.isArray(listSection.content)) {
        vars[`CONCLUSION${i + 1}_TITLE`] =
          listSection.content[0] || defaultConclusions[i].title;
        vars[`CONCLUSION${i + 1}_DESC`] =
          listSection.content.slice(1).join("；") || defaultConclusions[i].desc;
      } else if (textSection && typeof textSection.content === "string") {
        const parts = textSection.content.split(/[：:]/);
        vars[`CONCLUSION${i + 1}_TITLE`] =
          parts[0]?.slice(0, 20) || defaultConclusions[i].title;
        vars[`CONCLUSION${i + 1}_DESC`] =
          parts[1] ||
          textSection.content.slice(0, 80) ||
          defaultConclusions[i].desc;
      } else {
        vars[`CONCLUSION${i + 1}_TITLE`] = defaultConclusions[i].title;
        vars[`CONCLUSION${i + 1}_DESC`] = defaultConclusions[i].desc;
      }
    }

    return vars;
  }

  /**
   * 提取 A-004 Next Steps 模板变量
   * 需要: STEP1/2/3_TITLE/DESC/OWNER/DUE, MILESTONE1/2/3_DATE/TITLE
   */
  private extractNextStepsVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    const defaultSteps = [
      {
        title: "启动项目准备",
        desc: "完成团队组建和资源调配",
        owner: "项目经理",
        due: "本周五",
      },
      {
        title: "完成方案设计",
        desc: "输出详细实施方案和技术文档",
        owner: "技术负责人",
        due: "两周内",
      },
      {
        title: "开始试点实施",
        desc: "在选定场景开展试点验证",
        owner: "实施团队",
        due: "一个月内",
      },
    ];

    const defaultMilestones = [
      { date: "第1周", title: "项目启动会" },
      { date: "第4周", title: "方案评审通过" },
      { date: "第8周", title: "试点验收完成" },
    ];

    const listSections = sections.filter(
      (s) => s.type === "list" && Array.isArray(s.content),
    );

    // 步骤 (3个)
    for (let i = 0; i < 3; i++) {
      const section = listSections[i];
      if (section && Array.isArray(section.content)) {
        vars[`STEP${i + 1}_TITLE`] =
          section.content[0] || defaultSteps[i].title;
        vars[`STEP${i + 1}_DESC`] = section.content[1] || defaultSteps[i].desc;
      } else {
        vars[`STEP${i + 1}_TITLE`] = defaultSteps[i].title;
        vars[`STEP${i + 1}_DESC`] = defaultSteps[i].desc;
      }
      vars[`STEP${i + 1}_OWNER`] = defaultSteps[i].owner;
      vars[`STEP${i + 1}_DUE`] = defaultSteps[i].due;
    }

    // 里程碑 (3个)
    for (let i = 0; i < 3; i++) {
      const section = listSections[3 + i];
      if (section && Array.isArray(section.content)) {
        vars[`MILESTONE${i + 1}_DATE`] =
          section.content[0] || defaultMilestones[i].date;
        vars[`MILESTONE${i + 1}_TITLE`] =
          section.content[1] || defaultMilestones[i].title;
      } else {
        vars[`MILESTONE${i + 1}_DATE`] = defaultMilestones[i].date;
        vars[`MILESTONE${i + 1}_TITLE`] = defaultMilestones[i].title;
      }
    }

    return vars;
  }

  /**
   * 提取 Recommendations 模板变量 (旧版兼容)
   */
  private extractRecommendationsVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    // 使用新的 3Col 变量提取，同时保持 ITEMS 兼容
    const vars = this.extractRecommendations3ColVariables(pageContent);

    // 兼容旧的 ITEMS 格式
    const sections = pageContent.sections || [];
    let itemsHtml = "";

    const listSection = sections.find((s) => s.type === "list");
    const items =
      listSection && Array.isArray(listSection.content)
        ? listSection.content
        : ["建议一", "建议二", "建议三"];

    items.slice(0, 5).forEach((item, index) => {
      itemsHtml += `
        <div style="flex: 1; background: rgba(30, 41, 59, 0.6); border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 20px;">
          <div style="width: 48px; height: 48px; background: linear-gradient(135deg, ${COLORS.primary}, #B8962E); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #0F172A; font-weight: 900; font-size: 20px;">${index + 1}</div>
          <div style="flex: 1;">
            <h4 style="font-size: 18px; font-weight: 600; margin: 0 0 8px 0;">${item}</h4>
          </div>
        </div>
      `;
    });

    return { ...vars, ITEMS: itemsHtml };
  }

  /**
   * 提取默认变量
   */
  private extractDefaultVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    let contentHtml = "";

    sections.forEach((section) => {
      if (section.type === "list" && Array.isArray(section.content)) {
        contentHtml += `<ul style="list-style: none; padding: 0; margin: 0 0 16px 0;">`;
        section.content.forEach((item) => {
          contentHtml += `<li style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;"><span style="color: ${COLORS.primary};">•</span> ${item}</li>`;
        });
        contentHtml += `</ul>`;
      } else if (
        section.type === "text" &&
        typeof section.content === "string"
      ) {
        contentHtml += `<p style="font-size: 16px; color: #94A3B8; margin: 0 0 16px 0; line-height: 1.6;">${section.content}</p>`;
      }
    });

    return { CONTENT: contentHtml };
  }

  /**
   * 降级渲染 - 当没有匹配模板时
   */
  private renderFallback(
    pageOutline: PageOutline,
    pageContent: PageContent,
    themeId: string = "genspark-dark",
  ): TemplateRenderingResult {
    const theme = getTheme(themeId);
    const sections = pageContent.sections || [];
    let contentHtml = "";

    sections.forEach((section) => {
      if (section.type === "stat" && this.isStatContent(section.content)) {
        const stat = section.content as StatContent;
        contentHtml += `
          <div style="${CARD_STYLE} margin-bottom: 16px;">
            <div style="font-size: 48px; font-weight: 900; color: ${theme.colors.accent.primary};">${stat.value}</div>
            <div style="font-size: 16px; color: ${theme.colors.text.muted};">${stat.label}</div>
          </div>
        `;
      } else if (section.type === "list" && Array.isArray(section.content)) {
        contentHtml += `<ul style="list-style: none; padding: 0; margin: 0 0 16px 0;">`;
        section.content.forEach((item) => {
          contentHtml += `<li style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;"><span style="color: ${theme.colors.accent.primary};">•</span> ${item}</li>`;
        });
        contentHtml += `</ul>`;
      } else if (
        section.type === "text" &&
        typeof section.content === "string"
      ) {
        contentHtml += `<p style="font-size: 16px; color: ${theme.colors.text.muted}; margin: 0 0 16px 0;">${section.content}</p>`;
      }
    });

    const fallbackContentHtml = `
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0; color: ${theme.colors.text.primary};">${pageContent.title || pageOutline.title}</h1>
  <p style="font-size: 18px; color: ${theme.colors.text.muted}; margin: 0 0 32px 0;">${pageContent.subtitle || ""}</p>
  <div style="height: calc(100% - 160px); overflow: hidden;">
    ${contentHtml || `<p style='color: ${theme.colors.text.subtle};'>内容生成中...</p>`}
  </div>
  <div style="position: absolute; bottom: 24px; left: 80px; right: 80px; font-size: 12px; color: ${theme.colors.text.subtle};">${pageContent.footer || pageOutline.title}</div>
    `.trim();

    // 使用主题包装
    const html = this.wrapWithTheme(fallbackContentHtml, theme);

    return {
      html,
      templateId: "fallback",
      variables: {},
      themeId,
    };
  }

  /**
   * 辅助：检查是否为 StatContent
   */
  private isStatContent(content: unknown): content is StatContent {
    return (
      typeof content === "object" &&
      content !== null &&
      "value" in content &&
      "label" in content
    );
  }

  /**
   * 辅助：从 sections 获取描述文本
   */
  private getDescriptionFromSections(
    sections: ContentSection[],
    index: number,
  ): string {
    const section = sections[index];
    if (!section) return "核心能力和关键优势描述";

    if (section.type === "text" && typeof section.content === "string") {
      return section.content.slice(0, 100);
    }
    if (section.type === "list" && Array.isArray(section.content)) {
      return section.content.slice(0, 2).join("；");
    }
    return "核心能力和关键优势描述";
  }

  /**
   * 辅助：确保数据值唯一（防止 75% 重复）
   */
  private ensureUniqueValue(
    value: string,
    usedValues?: Set<string>,
    alternatives?: string[],
  ): string {
    if (!usedValues) return value;

    if (!usedValues.has(value)) {
      usedValues.add(value);
      return value;
    }

    // 已被使用，找替代值
    if (alternatives) {
      for (const alt of alternatives) {
        if (!usedValues.has(alt)) {
          usedValues.add(alt);
          return alt;
        }
      }
    }

    // 生成随机变体
    const numMatch = value.match(/(\d+)/);
    if (numMatch) {
      const num = parseInt(numMatch[1]);
      const newNum = num + Math.floor(Math.random() * 20) - 10;
      const newValue = value.replace(/\d+/, String(Math.max(1, newNum)));
      usedValues.add(newValue);
      return newValue;
    }

    return value;
  }

  /**
   * 提取 MultiColumn 模板变量
   * 同时生成 POINT{N} 和 CARD{N} 两套变量名，兼容多种模板
   */
  private extractMultiColumnVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    // 扩展到6个，支持各种多列布局
    const defaultTitles = [
      "核心优势",
      "技术能力",
      "服务保障",
      "创新驱动",
      "全球布局",
      "生态合作",
    ];
    const defaultDescs = [
      "提供行业领先的解决方案",
      "拥有先进的技术储备",
      "7x24小时专业支持",
      "持续创新迭代升级",
      "覆盖全球主要市场",
      "构建完善合作生态",
    ];
    const defaultIcons = ["🎯", "⚡", "🛡️", "💡", "🌐", "🤝"];
    const defaultStats = ["95%", "120+", "24/7", "3.5x", "50+", "200+"];
    const defaultLabels = [
      "满意度",
      "项目数",
      "服务",
      "增长",
      "市场",
      "合作伙伴",
    ];

    // 支持最多6个要点（2列、3列、4列、6列布局）
    for (let i = 0; i < 6; i++) {
      const section = sections[i];
      const num = i + 1;

      let title = defaultTitles[i] || `要点 ${num}`;
      let desc = defaultDescs[i] || `详细描述 ${num}`;
      let stat = defaultStats[i] || `${85 + i * 5}%`;

      if (section) {
        if (section.type === "list" && Array.isArray(section.content)) {
          title = section.content[0] || title;
          desc = section.content.slice(1).join("；") || desc;
        } else if (
          section.type === "text" &&
          typeof section.content === "string"
        ) {
          const parts = section.content.split(/[：:]/);
          title = parts[0]?.slice(0, 20) || title;
          desc = parts[1] || section.content.slice(0, 80) || desc;
        } else if (
          section.type === "stat" &&
          this.isStatContent(section.content)
        ) {
          const statContent = section.content as StatContent;
          title = statContent.label || title;
          desc = statContent.value || desc;
          stat = statContent.value || stat;
        }
      }

      // POINT{N} 格式 (用于 C-001, C-002, C-003)
      vars[`POINT${num}_TITLE`] = title;
      vars[`POINT${num}_DESC`] = desc;

      // CARD{N} 格式 (用于 C-004, C-005, C-006)
      vars[`CARD${num}_TITLE`] = title;
      vars[`CARD${num}_DESC`] = desc;
      vars[`CARD${num}_ICON`] = defaultIcons[i] || "📌";
      vars[`CARD${num}_STAT`] = stat;
      vars[`CARD${num}_LABEL`] = defaultLabels[i] || "指标";
    }

    // 图片占位符
    vars["IMAGE_PLACEHOLDER"] = "📊";

    return vars;
  }

  /**
   * 提取 Questions 模板变量
   */
  private extractQuestionsVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    const defaultQuestions = [
      "如何实现业务目标？",
      "关键成功因素是什么？",
      "如何衡量进展？",
      "下一步行动计划？",
    ];

    // 从 sections 中提取问题列表
    let questionsHtml = "";
    const listSection = sections.find(
      (s) => s.type === "list" && Array.isArray(s.content),
    );
    const questions =
      listSection && Array.isArray(listSection.content)
        ? listSection.content
        : defaultQuestions;

    questions.slice(0, 6).forEach((q, index) => {
      questionsHtml += `
        <div style="display: flex; align-items: flex-start; gap: 16px; margin-bottom: 16px;">
          <div style="width: 32px; height: 32px; background: ${COLORS.primary}; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 700;">${index + 1}</div>
          <div style="font-size: 16px; line-height: 1.6;">${q}</div>
        </div>
      `;
      vars[`Q${index + 1}`] = String(q);
    });

    vars["QUESTIONS"] = questionsHtml;
    vars["QUESTIONS_COUNT"] = String(questions.length);

    return vars;
  }

  /**
   * 提取 MaturityModel 模板变量
   */
  private extractMaturityModelVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    const defaultLevels = [
      { title: "初始级", desc: "流程不规范，结果不可预测" },
      { title: "管理级", desc: "基本流程建立，可重复执行" },
      { title: "定义级", desc: "标准流程定义，组织级实施" },
      { title: "量化级", desc: "数据驱动，量化管理" },
      { title: "优化级", desc: "持续改进，创新驱动" },
    ];

    // 生成5个成熟度等级的变量
    for (let i = 0; i < 5; i++) {
      const section = sections[i];
      const levelNum = i + 1;

      let title = defaultLevels[i]?.title || `等级 ${levelNum}`;
      let desc = defaultLevels[i]?.desc || `成熟度等级 ${levelNum} 描述`;

      if (section) {
        if (section.type === "list" && Array.isArray(section.content)) {
          title = section.content[0] || title;
          desc = section.content.slice(1).join("；") || desc;
        } else if (
          section.type === "text" &&
          typeof section.content === "string"
        ) {
          const parts = section.content.split(/[：:]/);
          title = parts[0]?.slice(0, 15) || title;
          desc = parts[1] || section.content.slice(0, 60) || desc;
        }
      }

      vars[`LEVEL${levelNum}_TITLE`] = title;
      vars[`LEVEL${levelNum}_DESC`] = desc;
      vars[`L${levelNum}_TITLE`] = title;
      vars[`L${levelNum}_DESC`] = desc;
    }

    // 当前等级（默认为3）
    vars["CURRENT_LEVEL"] = "3";
    vars["TARGET_LEVEL"] = "5";

    return vars;
  }

  /**
   * 提取 CaseStudy 模板变量
   */
  private extractCaseStudyVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    // 基础信息
    vars["INDUSTRY"] = "科技行业";
    vars["CLIENT_NAME"] = pageContent.title?.split(/[：:]/)[0] || "客户案例";

    // 从 sections 提取挑战、解决方案、成果
    const textSections = sections.filter(
      (s) => s.type === "text" && typeof s.content === "string",
    );
    const listSections = sections.filter(
      (s) => s.type === "list" && Array.isArray(s.content),
    );

    vars["CHALLENGE"] =
      textSections[0]?.content?.toString().slice(0, 150) ||
      "面临数字化转型的关键挑战，需要提升运营效率";
    vars["SOLUTION"] =
      textSections[1]?.content?.toString().slice(0, 150) ||
      "采用创新解决方案，实现全流程数字化升级";
    vars["RESULT"] =
      textSections[2]?.content?.toString().slice(0, 150) ||
      "显著提升业务效率，实现降本增效目标";

    // 统计数据
    const statSections = sections.filter(
      (s) => s.type === "stat" && this.isStatContent(s.content),
    );
    const defaultStats = [
      { value: "85%", label: "效率提升" },
      { value: "50%", label: "成本降低" },
      { value: "3x", label: "产出增长" },
    ];

    for (let i = 0; i < 3; i++) {
      const stat = statSections[i];
      if (stat && this.isStatContent(stat.content)) {
        const s = stat.content as StatContent;
        vars[`STAT${i + 1}_VALUE`] = s.value || defaultStats[i].value;
        vars[`STAT${i + 1}_LABEL`] = s.label || defaultStats[i].label;
      } else {
        vars[`STAT${i + 1}_VALUE`] = defaultStats[i].value;
        vars[`STAT${i + 1}_LABEL`] = defaultStats[i].label;
      }
    }

    // 客户评价
    const firstListContent = listSections[0]?.content;
    const testimonial =
      (Array.isArray(firstListContent) ? firstListContent[0] : null) ||
      "这是一次非常成功的合作，帮助我们实现了业务目标";

    vars["TESTIMONIAL"] = testimonial;
    // C-007 模板使用 QUOTE 和 AUTHOR
    vars["QUOTE"] = testimonial;
    vars["AUTHOR"] = pageContent.subtitle || "客户代表";

    return vars;
  }

  /**
   * 提取 D-001 Big Number 模板变量
   */
  private extractBigNumberVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    // 查找 stat 类型的 section
    const statSection = sections.find(
      (s) => s.type === "stat" && this.isStatContent(s.content),
    );

    if (statSection && this.isStatContent(statSection.content)) {
      const stat = statSection.content as StatContent;
      vars["NUMBER"] = stat.value || "$2.5M";
      vars["LABEL"] = stat.label || "年度营收";
      vars["CHANGE"] = stat.change || "+15%";
    } else {
      // 默认值
      vars["NUMBER"] = "$2.5M";
      vars["LABEL"] = "年度营收";
      vars["CHANGE"] = "+15%";
    }

    return vars;
  }

  /**
   * 提取 D-003 Trend Chart 模板变量
   */
  private extractTrendChartVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    // 查找 stat 类型的 sections
    const statSections = sections.filter(
      (s) => s.type === "stat" && this.isStatContent(s.content),
    );

    if (statSections.length > 0) {
      const firstStat = statSections[0].content as StatContent;
      vars["CURRENT_VALUE"] = firstStat.value || "$2.5M";
      vars["MOM_CHANGE"] = firstStat.change || "+12%";
      vars["YOY_CHANGE"] = statSections[1]
        ? (statSections[1].content as StatContent).change || "+25%"
        : "+25%";
    } else {
      vars["CURRENT_VALUE"] = "$2.5M";
      vars["MOM_CHANGE"] = "+12%";
      vars["YOY_CHANGE"] = "+25%";
    }

    // 洞察和周期
    const textSection = sections.find(
      (s) => s.type === "text" && typeof s.content === "string",
    );
    vars["INSIGHT"] =
      (textSection?.content as string)?.slice(0, 100) ||
      "数据显示持续增长趋势，预计下季度将保持稳定发展";
    vars["PERIOD"] = "2024年Q4";

    // 图表数据 (默认值)
    vars["X_DATA"] = '["1月", "2月", "3月", "4月", "5月", "6月"]';
    vars["Y_DATA"] = "[120, 150, 180, 220, 280, 350]";

    return vars;
  }

  /**
   * 提取 D-004 Comparison Dual 模板变量
   */
  private extractComparisonDualVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    // 默认值
    const defaultOptionA = {
      title: "方案 A",
      pros: ["成本较低", "实施快速"],
      cons: ["扩展性有限"],
      cost: "¥50万",
    };
    const defaultOptionB = {
      title: "方案 B",
      pros: ["扩展性强", "长期收益高"],
      cons: ["前期投入大"],
      cost: "¥120万",
    };

    // 从 sections 提取数据 - 只保留 list 类型的 sections
    const listSections = sections.filter(
      (s) => s.type === "list" && Array.isArray(s.content),
    );

    // 提取 Option A 的内容
    const optionAContent =
      listSections[0] && Array.isArray(listSections[0].content)
        ? (listSections[0].content as string[])
        : [];
    vars["OPTION_A_TITLE"] = optionAContent[0] || defaultOptionA.title;
    vars["A_PRO1"] = optionAContent[1] || defaultOptionA.pros[0];
    vars["A_PRO2"] = optionAContent[2] || defaultOptionA.pros[1];
    vars["A_CON1"] = optionAContent[3] || defaultOptionA.cons[0];
    vars["A_COST"] = defaultOptionA.cost;

    // 提取 Option B 的内容
    const optionBContent =
      listSections[1] && Array.isArray(listSections[1].content)
        ? (listSections[1].content as string[])
        : [];
    vars["OPTION_B_TITLE"] = optionBContent[0] || defaultOptionB.title;
    vars["B_PRO1"] = optionBContent[1] || defaultOptionB.pros[0];
    vars["B_PRO2"] = optionBContent[2] || defaultOptionB.pros[1];
    vars["B_CON1"] = optionBContent[3] || defaultOptionB.cons[0];
    vars["B_COST"] = defaultOptionB.cost;

    // 也提供 LEFT_ITEMS 和 RIGHT_ITEMS 用于兼容性
    if (optionAContent.length > 0) {
      vars["LEFT_ITEMS"] = optionAContent
        .map(
          (item) =>
            `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;"><span style="color: #EF4444;">✗</span> ${item}</div>`,
        )
        .join("");
    }
    if (optionBContent.length > 0) {
      vars["RIGHT_ITEMS"] = optionBContent
        .map(
          (item) =>
            `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;"><span style="color: #10B981;">✓</span> ${item}</div>`,
        )
        .join("");
    }

    return vars;
  }

  /**
   * 提取 D-005 Comparison Table 模板变量
   */
  private extractComparisonTableVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    // 默认表头
    vars["COL1_HEADER"] = "产品 A";
    vars["COL2_HEADER"] = "产品 B";
    vars["COL3_HEADER"] = "产品 C";

    // 默认行数据
    const defaultRows = [
      { label: "价格", col1: "¥1,000", col2: "¥2,000", col3: "¥3,000" },
      { label: "性能", col1: "★★★", col2: "★★★★", col3: "★★★★★" },
      { label: "易用性", col1: "★★★★", col2: "★★★", col3: "★★★★" },
      { label: "扩展性", col1: "★★", col2: "★★★★", col3: "★★★★★" },
      { label: "推荐指数", col1: "7.5", col2: "8.5", col3: "9.0" },
    ];

    // 从 sections 提取数据
    const listSections = sections.filter(
      (s) => s.type === "list" && Array.isArray(s.content),
    );

    // 如果有足够的 list sections，用来填充表格
    for (let i = 0; i < 5; i++) {
      const rowNum = i + 1;
      const section = listSections[i];
      const defaultRow = defaultRows[i];

      if (section && Array.isArray(section.content)) {
        const items = section.content as string[];
        vars[`ROW${rowNum}_LABEL`] = items[0] || defaultRow.label;
        vars[`ROW${rowNum}_COL1`] = items[1] || defaultRow.col1;
        vars[`ROW${rowNum}_COL2`] = items[2] || defaultRow.col2;
        vars[`ROW${rowNum}_COL3`] = items[3] || defaultRow.col3;
      } else {
        vars[`ROW${rowNum}_LABEL`] = defaultRow.label;
        vars[`ROW${rowNum}_COL1`] = defaultRow.col1;
        vars[`ROW${rowNum}_COL2`] = defaultRow.col2;
        vars[`ROW${rowNum}_COL3`] = defaultRow.col3;
      }
    }

    return vars;
  }

  /**
   * 提取 D-006 Ranking List 模板变量
   */
  private extractRankingListVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    // 默认排名数据
    const defaultRanks = [
      { name: "项目 Alpha", desc: "核心业务线", value: "¥2.5M" },
      { name: "项目 Beta", desc: "创新产品", value: "¥1.8M" },
      { name: "项目 Gamma", desc: "战略合作", value: "¥1.2M" },
      { name: "项目 Delta", desc: "新兴市场", value: "¥0.9M" },
      { name: "项目 Epsilon", desc: "研发投入", value: "¥0.6M" },
    ];

    // 从 sections 提取数据
    const listSections = sections.filter(
      (s) => s.type === "list" && Array.isArray(s.content),
    );
    const statSections = sections.filter(
      (s) => s.type === "stat" && this.isStatContent(s.content),
    );

    for (let i = 0; i < 5; i++) {
      const rankNum = i + 1;
      const listSection = listSections[i];
      const statSection = statSections[i];
      const defaultRank = defaultRanks[i];

      if (listSection && Array.isArray(listSection.content)) {
        const items = listSection.content as string[];
        vars[`RANK${rankNum}_NAME`] = items[0] || defaultRank.name;
        vars[`RANK${rankNum}_DESC`] = items[1] || defaultRank.desc;
        vars[`RANK${rankNum}_VALUE`] = items[2] || defaultRank.value;
      } else if (statSection && this.isStatContent(statSection.content)) {
        const stat = statSection.content as StatContent;
        vars[`RANK${rankNum}_NAME`] = stat.label || defaultRank.name;
        vars[`RANK${rankNum}_DESC`] = defaultRank.desc;
        vars[`RANK${rankNum}_VALUE`] = stat.value || defaultRank.value;
      } else {
        vars[`RANK${rankNum}_NAME`] = defaultRank.name;
        vars[`RANK${rankNum}_DESC`] = defaultRank.desc;
        vars[`RANK${rankNum}_VALUE`] = defaultRank.value;
      }
    }

    // 洞察
    const textSection = sections.find(
      (s) => s.type === "text" && typeof s.content === "string",
    );
    vars["INSIGHT"] =
      (textSection?.content as string)?.slice(0, 150) ||
      "前三名占据总收入的70%，显示市场集中度较高";

    return vars;
  }
}
