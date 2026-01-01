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
   * 增强：添加全局溢出保护样式
   */
  private wrapWithTheme(contentHtml: string, theme: ThemeConfig): string {
    const containerStyle = getThemeContainerStyle(theme);
    const decorationHtml = getThemeDecorationHtml(theme);

    // 全局溢出保护 CSS（增强版 v3.2）
    const overflowProtectionStyles = `
<style>
  /* 基础盒模型 */
  .slide-container * {
    box-sizing: border-box;
  }

  /* 标题溢出保护 */
  .slide-container h1, .slide-container h2, .slide-container h3, .slide-container h4 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 段落文字限制行数 */
  .slide-container p {
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    line-height: 1.5;
  }

  /* 列表溢出保护 */
  .slide-container ul, .slide-container ol {
    overflow: hidden;
    margin: 0;
    padding-left: 20px;
  }
  .slide-container li {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 4px;
  }

  /* 内容区域溢出保护 */
  .slide-content > div {
    overflow: hidden;
  }

  /* ⭐ 图片溢出保护（v3.2 新增） */
  .slide-container img {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
  }

  /* 图片容器强制限制 */
  .slide-container [class*="image"],
  .slide-container [style*="background-image"] {
    overflow: hidden;
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
  }

  /* SVG 溢出保护 */
  .slide-container svg {
    max-width: 100%;
    max-height: 100%;
    overflow: hidden;
  }

  /* Flex 子元素防溢出 */
  .slide-container [style*="display: flex"] > * {
    min-width: 0;
    min-height: 0;
    flex-shrink: 1;
  }

  /* Grid 子元素防溢出 */
  .slide-container [style*="display: grid"] > * {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
</style>`;

    return `
${overflowProtectionStyles}
<div class="slide-container" style="${containerStyle.replace(/\n/g, " ").trim()}">
  ${decorationHtml}
  <div class="slide-content" style="position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; overflow: hidden;">
    ${contentHtml}
  </div>
</div>
    `.trim();
  }

  /**
   * 注入图表 SVG 到 HTML
   * 查找图表占位符（id="chart-*" 的 div）并替换为实际图表
   * 增强版：更灵活的匹配 + 失败时提供占位图表
   */
  private injectChartSvg(
    html: string,
    pageContent: PageContent,
    theme: ThemeConfig,
  ): string {
    // 更灵活的匹配模式：支持各种属性顺序和可选内容
    const chartPlaceholderPatterns = [
      // 模式1: id="chart-xxx" style="..." (空div)
      /<div\s+id="chart-(\w+)"[^>]*>\s*<\/div>/gi,
      // 模式2: style="..." id="chart-xxx" (空div)
      /<div\s+[^>]*id="chart-(\w+)"[^>]*>\s*<\/div>/gi,
      // 模式3: 包含占位文本的div
      /<div\s+id="chart-(\w+)"[^>]*>[^<]*<\/div>/gi,
    ];

    let processedHtml = html;

    for (const pattern of chartPlaceholderPatterns) {
      processedHtml = processedHtml.replace(pattern, (_match, chartType) => {
        return this.renderChartReplacement(chartType, pageContent, theme);
      });
    }

    return processedHtml;
  }

  /**
   * 渲染图表替换内容
   */
  private renderChartReplacement(
    chartType: string,
    pageContent: PageContent,
    theme: ThemeConfig,
  ): string {
    const mappedType = this.mapChartType(chartType);
    const themeMode =
      theme.id.includes("white") || theme.id.includes("light")
        ? "light"
        : "dark";

    try {
      // 从内容中提取图表数据，或生成示例数据
      const chartData =
        this.chartRenderer.extractChartData(
          pageContent.sections || [],
          mappedType,
        ) || this.chartRenderer.generateSampleData(mappedType);

      // 渲染 SVG
      const svgStr = this.chartRenderer.renderToSvg(chartData, {
        width: 500,
        height: 300,
        theme: themeMode,
        showLegend: true,
      });

      this.logger.log(`[injectChartSvg] Injected ${chartType} chart SVG`);
      return `<div id="chart-${chartType}" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">${svgStr}</div>`;
    } catch (error) {
      this.logger.warn(`[injectChartSvg] Failed to render chart: ${error}`);
      // 失败时返回占位图表，而非空div
      return this.renderFallbackChart(chartType, mappedType, themeMode);
    }
  }

  /**
   * 渲染降级占位图表
   */
  private renderFallbackChart(
    chartType: string,
    mappedType: string,
    themeMode: "dark" | "light",
  ): string {
    const bgColor = themeMode === "dark" ? "#1E293B" : "#F1F5F9";
    const textColor = themeMode === "dark" ? "#94A3B8" : "#475569";
    const accentColor = "#F97316";

    const typeLabels: Record<string, string> = {
      line: "趋势图",
      bar: "柱状图",
      pie: "饼图",
      radar: "雷达图",
      trend: "趋势图",
    };
    const label = typeLabels[mappedType] || "数据图表";

    // 生成简单的占位图表 SVG
    const fallbackSvg = `
<svg width="500" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${bgColor}" rx="8"/>
  <g transform="translate(250, 120)">
    <circle r="40" fill="${accentColor}20" stroke="${accentColor}" stroke-width="2"/>
    <text text-anchor="middle" y="5" fill="${textColor}" font-size="24">📊</text>
  </g>
  <text x="50%" y="200" text-anchor="middle" fill="${textColor}" font-size="16" font-weight="500">${label}</text>
  <text x="50%" y="230" text-anchor="middle" fill="${textColor}80" font-size="12">数据可视化</text>
</svg>`.trim();

    return `<div id="chart-${chartType}" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">${fallbackSvg}</div>`;
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
        return {
          ...baseVars,
          ...this.extractTocVariables(pageContent, pageOutline),
        };
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
        return {
          ...baseVars,
          ...this.extractTocVariables(pageContent, pageOutline),
        };
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
      case "chapterTitle":
        // v3.5: 章节分隔页特殊处理
        return {
          ...baseVars,
          ...this.extractChapterTitleVariables(pageOutline, pageContent),
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
        return {
          ...baseVars,
          ...this.extractTocVariables(pageContent, pageOutline),
        };
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
   * 增强版：使用页面上下文生成更有意义的默认值
   */
  private extractPillarsVariables(
    pageContent: PageContent,
    usedValues?: Set<string>,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};
    const pageTitle = pageContent.title || "";

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

    // 根据页面标题生成上下文相关的默认标题
    const contextualTitles = this.generateContextualPillarTitles(pageTitle);
    const contextualDescs = this.generateContextualPillarDescs(pageTitle);

    // 支持最多5个支柱（三支柱、四支柱、五支柱模板）
    for (let i = 0; i < 5; i++) {
      const section = sections[i];
      const pillarNum = i + 1;

      // 使用上下文相关的默认值，而非通用占位符
      let title = contextualTitles[i] || `核心要素 ${pillarNum}`;
      let desc =
        pageContent.citations?.[i] ||
        contextualDescs[i] ||
        `${pageTitle}的关键组成部分`;
      let stat = diverseStats[i] || `${85 + i * 3}%`;
      let label = diverseLabels[i] || "关键数据";

      if (section) {
        if (section.type === "stat" && this.isStatContent(section.content)) {
          const statContent = section.content as StatContent;
          title = statContent.label || title;
          // v3.5: 传入pageTitle以生成有意义的描述
          desc = this.getDescriptionFromSections(sections, i, pageTitle);
          stat = this.ensureUniqueValue(
            statContent.value,
            usedValues,
            diverseStats,
          );
          label = diverseLabels[i] || "关键数据";
        } else if (section.type === "list" && Array.isArray(section.content)) {
          title = section.content[0] || title;
          desc =
            section.content.slice(1, 3).join("；") ||
            `${pageTitle || "核心能力"}的关键要素`;
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
          // v3.5: 使用pageTitle生成有意义的描述
          desc =
            section.content.slice(0, 100) ||
            `${pageTitle || "战略"}的核心支撑能力`;
          stat = this.ensureUniqueValue(
            diverseStats[i],
            usedValues,
            diverseStats,
          );
        }
      }

      // v3.5: 默认图标列表（基于内容主题匹配）
      const defaultIcons = ["🎯", "⚡", "👥", "🌐", "💡"];
      const icon = defaultIcons[i] || "📌";

      // PILLAR{N} 格式 (用于 S-003, S-004)
      vars[`PILLAR${pillarNum}_TITLE`] = title;
      vars[`PILLAR${pillarNum}_DESC`] = desc;
      vars[`PILLAR${pillarNum}_STAT`] = stat;
      vars[`PILLAR${pillarNum}_LABEL`] = label;
      vars[`PILLAR${pillarNum}_ICON`] = icon; // v3.5: 添加图标变量

      // P{N} 格式 (用于 S-005 五支柱模板)
      vars[`P${pillarNum}_TITLE`] = title;
      vars[`P${pillarNum}_DESC`] = desc;
      vars[`P${pillarNum}_ICON`] = icon; // v3.5: 添加图标变量
    }

    return vars;
  }

  /**
   * 提取 Dashboard 模板变量
   * v3.5.1: 根据页面标题生成上下文相关的KPI
   */
  private extractDashboardVariables(
    pageContent: PageContent,
    usedValues?: Set<string>,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};
    const pageTitle = pageContent.title || "";

    // v3.5.1: 根据主题生成上下文相关的KPI
    const contextKpis = this.generateContextualKpis(pageTitle);
    const diverseValues = contextKpis.values;
    const diverseLabels = contextKpis.labels;
    const diverseChanges = contextKpis.changes;

    for (let i = 0; i < 4; i++) {
      const section = sections.find((s, idx) => s.type === "stat" && idx >= i);
      const kpiNum = i + 1;

      if (section && this.isStatContent(section.content)) {
        const stat = section.content as StatContent;
        vars[`KPI${kpiNum}_VALUE`] = this.ensureUniqueValue(
          this.sanitizeValue(stat.value, diverseValues[i]),
          usedValues,
          diverseValues,
        );
        vars[`KPI${kpiNum}_LABEL`] = this.sanitizeValue(
          stat.label,
          diverseLabels[i],
        );
        vars[`KPI${kpiNum}_CHANGE`] = this.sanitizeValue(
          stat.change,
          diverseChanges[i],
        );
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
      vars["CURRENT_VALUE"] = this.sanitizeValue(
        firstStat.value,
        diverseValues[0],
      );
      vars["MOM_CHANGE"] = this.sanitizeValue(firstStat.change, "+12%");
      vars["YOY_CHANGE"] = statSections[1]
        ? this.sanitizeValue(
            (statSections[1].content as StatContent).change,
            "+25%",
          )
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
   * v3.5.1: 使用上下文相关的时间线阶段
   */
  private extractTimelineVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};
    const pageTitle = pageContent.title || "";

    // v3.5.1: 根据主题生成上下文相关的时间线
    const contextTimeline = this.generateContextualTimeline(pageTitle);
    const defaultDates = contextTimeline.dates;
    const defaultTitles = contextTimeline.titles;
    const defaultDescs = contextTimeline.descs;

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
   * 提取章节分隔页变量 (v3.5 新增)
   * 正确提取章节编号，避免总是显示"1"
   */
  private extractChapterTitleVariables(
    pageOutline: PageOutline,
    pageContent: PageContent,
  ): Record<string, string> {
    // 从 subtitle 提取章节编号（格式：CHAPTER 02）
    const subtitleMatch = pageContent.subtitle?.match(/CHAPTER\s*(\d+)/i);
    const outlineMatch = pageOutline.subtitle?.match(/CHAPTER\s*(\d+)/i);

    // 尝试从页面编号推断（如果是第3页之后的chapterTitle，计算实际章节号）
    let chapterNum = "01";

    if (subtitleMatch) {
      chapterNum = subtitleMatch[1].padStart(2, "0");
    } else if (outlineMatch) {
      chapterNum = outlineMatch[1].padStart(2, "0");
    } else {
      // 从 keyElements 或内容推断
      const firstSection = pageContent.sections?.[0];
      if (
        firstSection?.type === "text" &&
        typeof firstSection.content === "string"
      ) {
        const numMatch = firstSection.content.match(
          /第(\d+)章|Chapter\s*(\d+)/i,
        );
        if (numMatch) {
          chapterNum = (numMatch[1] || numMatch[2]).padStart(2, "0");
        }
      }
    }

    return {
      CHAPTER_NUM: chapterNum,
      // 确保标题不重复包含 CHAPTER 信息
      TITLE:
        pageContent.title?.replace(/CHAPTER\s*\d+\s*[:：]?\s*/gi, "").trim() ||
        pageOutline.title?.replace(/CHAPTER\s*\d+\s*[:：]?\s*/gi, "").trim() ||
        "章节标题",
      SUBTITLE:
        pageContent.subtitle
          ?.replace(/CHAPTER\s*\d+\s*[:：]?\s*/gi, "")
          .trim() ||
        pageOutline.contentBrief ||
        "",
    };
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
   * 优先使用 sections，如果为空或不足则回退到 keyElements
   */
  private extractTocVariables(
    pageContent: PageContent,
    pageOutline?: PageOutline,
  ): Record<string, string> {
    const sections = pageContent.sections || [];

    // 获取章节标题列表：优先使用 sections，不足时回退到 keyElements
    let chapterTitles: string[] = [];

    if (sections.length >= 2) {
      // 从 sections 提取章节标题
      chapterTitles = sections.map((section, index) => {
        if (Array.isArray(section.content)) {
          return section.content[0] || `章节 ${index + 1}`;
        }
        return typeof section.content === "string"
          ? section.content
          : `章节 ${index + 1}`;
      });
    } else if (
      pageOutline?.keyElements &&
      pageOutline.keyElements.length >= 2
    ) {
      // 回退到 keyElements（通常包含所有章节标题）
      chapterTitles = pageOutline.keyElements;
    } else if (sections.length === 1) {
      // 只有 1 个 section，使用它
      const section = sections[0];
      chapterTitles = [
        Array.isArray(section.content)
          ? section.content[0]
          : typeof section.content === "string"
            ? section.content
            : "章节 1",
      ];
    }

    // 生成 chaptersHtml
    let chaptersHtml = "";
    chapterTitles.forEach((title, index) => {
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
      chapterTitles.slice(0, 3).join("、") ||
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
   * 辅助：清理 N/A 值，返回默认值
   * 当值为 N/A、空、null 等时返回默认值
   */
  private sanitizeValue(
    value: string | undefined,
    defaultValue: string,
  ): string {
    if (!value) return defaultValue;
    const trimmed = value.trim();
    // 检查常见的无效值模式
    if (
      trimmed === "" ||
      trimmed.toLowerCase() === "n/a" ||
      trimmed === "N/A" ||
      trimmed === "-" ||
      trimmed === "--" ||
      trimmed === "null" ||
      trimmed === "undefined" ||
      trimmed === "暂无" ||
      trimmed === "无" ||
      trimmed === "待定"
    ) {
      return defaultValue;
    }
    return trimmed;
  }

  /**
   * 辅助：从 sections 获取描述文本
   * v3.5: 改进默认值生成，避免通用占位符
   */
  private getDescriptionFromSections(
    sections: ContentSection[],
    index: number,
    pageTitle?: string,
  ): string {
    const section = sections[index];

    // 如果没有section，尝试使用页面标题生成有意义的描述
    if (!section) {
      return pageTitle
        ? `${pageTitle}的核心组成部分与关键价值`
        : "驱动业务发展的关键要素";
    }

    if (section.type === "text" && typeof section.content === "string") {
      return section.content.slice(0, 100);
    }
    if (section.type === "list" && Array.isArray(section.content)) {
      return section.content.slice(0, 2).join("；");
    }

    // v3.5: 对于 stat 类型，尝试从 label 生成描述
    if (section.type === "stat" && this.isStatContent(section.content)) {
      const statContent = section.content as StatContent;
      if (statContent.label) {
        return `${statContent.label}相关的核心能力与战略价值`;
      }
    }

    // 使用页面标题生成有意义的描述
    return pageTitle
      ? `${pageTitle}的关键能力与竞争优势`
      : "持续创造价值的核心能力";
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
      vars["CURRENT_VALUE"] = this.sanitizeValue(firstStat.value, "$2.5M");
      vars["MOM_CHANGE"] = this.sanitizeValue(firstStat.change, "+12%");
      vars["YOY_CHANGE"] = statSections[1]
        ? this.sanitizeValue(
            (statSections[1].content as StatContent).change,
            "+25%",
          )
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
    vars["INSIGHT"] = this.sanitizeValue(
      (textSection?.content as string)?.slice(0, 100),
      "数据显示持续增长趋势，预计下季度将保持稳定发展",
    );
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

  /**
   * 根据页面标题生成支柱标题（最小化降级）
   * 注意：这只是安全网，真正的内容应该由 AI 生成
   */
  private generateContextualPillarTitles(_pageTitle: string): string[] {
    // 返回空数组，让调用方使用 section 数据
    // 如果 section 也没有数据，会使用默认的 "核心要素 N"
    return [];
  }

  /**
   * 根据页面标题生成支柱描述（最小化降级）
   * 注意：这只是安全网，真正的内容应该由 AI 生成
   */
  private generateContextualPillarDescs(_pageTitle: string): string[] {
    // 返回空数组，让调用方使用 section 数据或 citations
    return [];
  }

  /**
   * v3.5.1: 根据页面标题生成上下文相关的KPI
   * 通过关键词匹配选择合适的KPI主题
   */
  private generateContextualKpis(pageTitle: string): {
    values: string[];
    labels: string[];
    changes: string[];
  } {
    const title = pageTitle.toLowerCase();

    // 天气/气候相关
    if (
      title.includes("天气") ||
      title.includes("气候") ||
      title.includes("weather") ||
      title.includes("climate")
    ) {
      return {
        values: ["-15°C", "45%", "120mm", "280天"],
        labels: ["平均气温", "相对湿度", "年降水量", "晴天天数"],
        changes: ["-2°C", "+5%", "+10mm", "+15天"],
      };
    }

    // 旅游相关
    if (
      title.includes("旅游") ||
      title.includes("景点") ||
      title.includes("travel") ||
      title.includes("tourism")
    ) {
      return {
        values: ["850万", "4.8分", "120+", "92%"],
        labels: ["年游客量", "游客评分", "景点数量", "满意度"],
        changes: ["+15%", "+0.2", "+8个", "+3%"],
      };
    }

    // 城市/地理相关
    if (
      title.includes("城市") ||
      title.includes("地理") ||
      title.includes("首都") ||
      title.includes("city")
    ) {
      return {
        values: ["98万", "2,778km²", "4季", "Top10"],
        labels: ["城市人口", "城市面积", "气候类型", "宜居排名"],
        changes: ["+2.5%", "-", "分明", "↑2位"],
      };
    }

    // 购物/消费相关
    if (
      title.includes("购物") ||
      title.includes("超市") ||
      title.includes("消费") ||
      title.includes("shopping")
    ) {
      return {
        values: ["500+", "24h", "15km", "95%"],
        labels: ["商店数量", "营业时长", "平均距离", "便利指数"],
        changes: ["+50家", "部分", "-2km", "+3%"],
      };
    }

    // 网络/通信相关
    if (
      title.includes("网络") ||
      title.includes("通信") ||
      title.includes("5G") ||
      title.includes("network")
    ) {
      return {
        values: ["99.5%", "500Mbps", "4G/5G", "85%"],
        labels: ["网络覆盖", "平均速度", "网络类型", "用户满意度"],
        changes: ["+0.5%", "+50Mbps", "升级中", "+5%"],
      };
    }

    // 教育相关
    if (
      title.includes("教育") ||
      title.includes("学校") ||
      title.includes("大学") ||
      title.includes("education")
    ) {
      return {
        values: ["12所", "95%", "Top50", "8.5万"],
        labels: ["高校数量", "入学率", "世界排名", "在校学生"],
        changes: ["+2所", "+2%", "↑5位", "+1.2万"],
      };
    }

    // 医疗健康相关
    if (
      title.includes("医疗") ||
      title.includes("健康") ||
      title.includes("医院") ||
      title.includes("health")
    ) {
      return {
        values: ["45所", "98%", "3.5:1000", "92%"],
        labels: ["医院数量", "医保覆盖", "医生比例", "就医满意度"],
        changes: ["+5所", "+1%", "+0.3", "+4%"],
      };
    }

    // 科技/创新相关
    if (
      title.includes("科技") ||
      title.includes("创新") ||
      title.includes("AI") ||
      title.includes("tech")
    ) {
      return {
        values: ["2,500+", "45%", "$12B", "Top3"],
        labels: ["科技企业", "研发投入占比", "行业规模", "创新指数"],
        changes: ["+300家", "+5%", "+$2B", "稳定"],
      };
    }

    // 默认：通用商业KPI
    return {
      values: ["$2.5M", "85%", "520+", "92%"],
      labels: ["年度营收", "客户满意度", "活跃用户", "目标达成率"],
      changes: ["+15%", "+8%", "+120", "+5%"],
    };
  }

  /**
   * v3.5.1: 根据页面标题生成上下文相关的时间线阶段
   */
  private generateContextualTimeline(pageTitle: string): {
    dates: string[];
    titles: string[];
    descs: string[];
  } {
    const title = pageTitle.toLowerCase();

    // 历史/发展相关
    if (
      title.includes("历史") ||
      title.includes("发展") ||
      title.includes("history") ||
      title.includes("发展历程")
    ) {
      return {
        dates: ["早期", "发展期", "成熟期", "现代"],
        titles: ["起源阶段", "快速发展", "稳定增长", "创新突破"],
        descs: [
          "奠定基础与初步探索",
          "规模扩张与体系建设",
          "深度优化与品质提升",
          "数字化转型与创新",
        ],
      };
    }

    // 季节/年度相关
    if (
      title.includes("季节") ||
      title.includes("四季") ||
      title.includes("年度") ||
      title.includes("season")
    ) {
      return {
        dates: ["春季", "夏季", "秋季", "冬季"],
        titles: ["春暖花开", "盛夏时节", "金秋收获", "冬日静谧"],
        descs: [
          "万物复苏，气温回升",
          "阳光充沛，活动丰富",
          "景色宜人，硕果累累",
          "银装素裹，别有风情",
        ],
      };
    }

    // 规划/战略相关
    if (
      title.includes("规划") ||
      title.includes("战略") ||
      title.includes("plan") ||
      title.includes("strategy")
    ) {
      return {
        dates: ["第一阶段", "第二阶段", "第三阶段", "第四阶段"],
        titles: ["调研分析", "方案制定", "落地执行", "评估优化"],
        descs: [
          "深入调研现状与需求",
          "制定切实可行的方案",
          "有序推进各项措施",
          "持续改进与完善",
        ],
      };
    }

    // 旅游行程相关
    if (
      title.includes("行程") ||
      title.includes("游览") ||
      title.includes("旅游") ||
      title.includes("tour")
    ) {
      return {
        dates: ["Day 1", "Day 2", "Day 3", "Day 4"],
        titles: ["抵达与探索", "深度游览", "文化体验", "返程总结"],
        descs: [
          "到达目的地，初步探索",
          "深入游览主要景点",
          "体验当地文化特色",
          "整理行囊，满载而归",
        ],
      };
    }

    // 默认：项目阶段
    return {
      dates: ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024"],
      titles: ["启动阶段", "推进阶段", "深化阶段", "收官阶段"],
      descs: [
        "项目启动与资源准备",
        "核心工作稳步推进",
        "深入实施与优化调整",
        "成果总结与未来规划",
      ],
    };
  }
}
