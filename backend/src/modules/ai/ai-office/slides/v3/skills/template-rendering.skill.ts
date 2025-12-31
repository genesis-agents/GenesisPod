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
import {
  COMMON_CONTAINER,
  CARD_STYLE,
  FOOTER_STYLE,
  COLORS,
} from "../templates/base/common-styles";

/**
 * 模板渲染输入
 */
export interface TemplateRenderingInput {
  pageOutline: PageOutline;
  pageContent: PageContent;
  /** 使用的已用数据值集合（用于防止重复） */
  usedValues?: Set<string>;
}

/**
 * 模板渲染结果
 */
export interface TemplateRenderingResult {
  html: string;
  templateId: string;
  variables: Record<string, string>;
}

@Injectable()
export class TemplateRenderingSkill {
  private readonly logger = new Logger(TemplateRenderingSkill.name);

  /**
   * 渲染页面 - 主入口
   */
  render(input: TemplateRenderingInput): TemplateRenderingResult {
    const { pageOutline, pageContent, usedValues } = input;
    const templateType = pageOutline.templateType;

    this.logger.log(
      `[render] Rendering page ${pageOutline.pageNumber} with template type: ${templateType}`,
    );

    // 1. 获取模板
    const template = this.selectTemplate(templateType);
    if (!template) {
      this.logger.warn(
        `[render] No template found for type: ${templateType}, using fallback`,
      );
      return this.renderFallback(pageOutline, pageContent);
    }

    // 2. 提取变量
    const variables = this.extractVariables(
      templateType,
      pageOutline,
      pageContent,
      usedValues,
    );

    // 3. 应用变量到模板
    let html = applyVariables(template, variables);

    // 4. 添加脚本（如果有）
    if (template.script) {
      html += `\n<script>\n${template.script}\n</script>`;
    }

    this.logger.log(
      `[render] Page ${pageOutline.pageNumber} rendered with template ${template.metadata.id}`,
    );

    return {
      html,
      templateId: template.metadata.id,
      variables,
    };
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
   * 提取变量 - 根据模板类型从 sections 中提取
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
        return { ...baseVars, ...this.extractComparisonVariables(pageContent) };
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
   * 提取 Comparison/RiskOpportunity 模板变量
   */
  private extractComparisonVariables(
    pageContent: PageContent,
  ): Record<string, string> {
    const sections = pageContent.sections || [];
    const vars: Record<string, string> = {};

    // 左侧（风险/方案A）
    const leftSection = sections[0];
    if (leftSection && Array.isArray(leftSection.content)) {
      vars["LEFT_ITEMS"] = leftSection.content
        .map(
          (item) =>
            `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;"><span style="color: #EF4444;">✗</span> ${item}</div>`,
        )
        .join("");
    }

    // 右侧（机遇/方案B）
    const rightSection = sections[1];
    if (rightSection && Array.isArray(rightSection.content)) {
      vars["RIGHT_ITEMS"] = rightSection.content
        .map(
          (item) =>
            `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;"><span style="color: #10B981;">✓</span> ${item}</div>`,
        )
        .join("");
    }

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
   * 提取 Recommendations 模板变量
   */
  private extractRecommendationsVariables(
    pageContent: PageContent,
  ): Record<string, string> {
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

    return { ITEMS: itemsHtml };
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
  ): TemplateRenderingResult {
    const sections = pageContent.sections || [];
    let contentHtml = "";

    sections.forEach((section) => {
      if (section.type === "stat" && this.isStatContent(section.content)) {
        const stat = section.content as StatContent;
        contentHtml += `
          <div style="${CARD_STYLE} margin-bottom: 16px;">
            <div style="font-size: 48px; font-weight: 900; color: ${COLORS.primary};">${stat.value}</div>
            <div style="font-size: 16px; color: #94A3B8;">${stat.label}</div>
          </div>
        `;
      } else if (section.type === "list" && Array.isArray(section.content)) {
        contentHtml += `<ul style="list-style: none; padding: 0; margin: 0 0 16px 0;">`;
        section.content.forEach((item) => {
          contentHtml += `<li style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;"><span style="color: ${COLORS.primary};">•</span> ${item}</li>`;
        });
        contentHtml += `</ul>`;
      } else if (
        section.type === "text" &&
        typeof section.content === "string"
      ) {
        contentHtml += `<p style="font-size: 16px; color: #94A3B8; margin: 0 0 16px 0;">${section.content}</p>`;
      }
    });

    const html = `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">${pageContent.title || pageOutline.title}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 32px 0;">${pageContent.subtitle || ""}</p>
  <div style="height: calc(100% - 160px); overflow: hidden;">
    ${contentHtml || "<p style='color: #64748B;'>内容生成中...</p>"}
  </div>
  <div style="${FOOTER_STYLE}">${pageContent.footer || pageOutline.title}</div>
</div>
    `.trim();

    return {
      html,
      templateId: "fallback",
      variables: {},
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
}
