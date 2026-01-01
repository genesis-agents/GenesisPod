/**
 * Slides Engine - Quality Audit Skill
 *
 * 输出后质量审核：检测模板-内容语义匹配、图表类型合理性、内容逻辑等
 * 这是最后一道防线，用于在输出前发现并报告质量问题
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  PageOutline,
  PageContent,
  PageTemplateType,
  ContentSection,
} from "../checkpoint/checkpoint.types";

/**
 * 语义审核问题类型（与 checkpoint.types 中的 QualityIssue 区分）
 */
export type SemanticIssueType =
  | "template_mismatch" // 模板与内容语义不匹配
  | "chart_type_wrong" // 图表类型选择错误
  | "content_logic" // 内容逻辑问题
  | "layout_issue" // 布局问题
  | "data_inconsistency" // 数据不一致
  | "visual_issue"; // 视觉问题

/**
 * 质量问题严重级别
 */
export type QualitySeverity = "error" | "warning" | "info";

/**
 * 语义审核问题报告（与 checkpoint.types 中的 QualityIssue 区分）
 */
export interface SemanticIssue {
  type: SemanticIssueType;
  severity: QualitySeverity;
  message: string;
  pageNumber: number;
  suggestion?: string;
  autoFixed?: boolean;
}

/**
 * 语义审核结果
 */
export interface SemanticAuditResult {
  passed: boolean;
  score: number; // 0-100
  issues: SemanticIssue[];
  summary: string;
}

/**
 * 模板-内容语义规则
 */
const TEMPLATE_CONTENT_RULES: Record<
  string,
  {
    validFor: string[];
    invalidFor: string[];
    description: string;
  }
> = {
  framework: {
    validFor: ["流程", "步骤", "方法", "策略", "框架", "模型", "方案"],
    invalidFor: [
      "地理",
      "位置",
      "地点",
      "城市",
      "国家",
      "区域",
      "面积",
      "人口",
    ],
    description: "框架模板适用于流程/步骤/方法论，不适用于地理/位置描述",
  },
  timeline: {
    validFor: [
      "历史",
      "发展",
      "演变",
      "里程碑",
      "进程",
      "时间",
      "阶段",
      "变迁",
    ],
    invalidFor: ["对比", "比较", "位置", "统计"],
    description: "时间线模板适用于时间演变，不适用于静态对比",
  },
  evolutionRoadmap: {
    validFor: ["发展", "演变", "规划", "路线", "未来", "趋势"],
    invalidFor: ["位置", "地理", "对比"],
    description: "路线图模板适用于发展规划，不适用于位置描述",
  },
  comparison: {
    validFor: ["对比", "比较", "差异", "优劣", "VS", "异同"],
    invalidFor: ["流程", "步骤", "时间线"],
    description: "对比模板适用于A/B比较，不适用于流程描述",
  },
  dashboard: {
    validFor: ["数据", "统计", "指标", "KPI", "分析", "概况", "面积", "人口"],
    invalidFor: ["流程", "方法"],
    description: "仪表板模板适用于数据展示",
  },
  pillars: {
    validFor: ["支柱", "核心", "要素", "维度", "方面"],
    invalidFor: ["时间", "历史", "地理"],
    description: "支柱模板适用于多维度并列展示",
  },
  splitLayout: {
    validFor: ["介绍", "概述", "位置", "地理", "背景"],
    invalidFor: [],
    description: "分栏布局适用于图文并排的通用展示",
  },
  multiColumn: {
    validFor: ["分类", "类型", "多项", "列表"],
    invalidFor: [],
    description: "多列布局适用于多项并列展示",
  },
};

/**
 * 图表类型-数据特征规则
 */
const CHART_DATA_RULES = {
  // 分类数据关键词（应该用 bar）
  categoryKeywords: [
    "人口",
    "面积",
    "规模",
    "数量",
    "产品",
    "部门",
    "区域",
    "类型",
    "种类",
    "项目",
    "城市",
    "国家",
    "市区",
    "首都",
  ],
  // 时间序列关键词（应该用 line）
  timeSeriesKeywords: [
    "年",
    "月",
    "季度",
    "Q1",
    "Q2",
    "Q3",
    "Q4",
    "阶段",
    "时期",
    "周期",
  ],
  // 占比关键词（应该用 pie）
  proportionKeywords: ["占比", "比例", "份额", "构成", "组成", "分布"],
};

@Injectable()
export class QualityAuditSkill {
  private readonly logger = new Logger(QualityAuditSkill.name);

  /**
   * 审核单页幻灯片质量
   */
  auditPage(
    pageOutline: PageOutline,
    pageContent: PageContent,
    html: string,
  ): SemanticAuditResult {
    const issues: SemanticIssue[] = [];

    // 1. 检查模板-内容语义匹配
    const templateIssues = this.checkTemplateSemantic(pageOutline, pageContent);
    issues.push(...templateIssues);

    // 2. 检查图表类型合理性
    const chartIssues = this.checkChartType(pageContent, html);
    issues.push(...chartIssues);

    // 3. 检查内容逻辑
    const logicIssues = this.checkContentLogic(pageOutline, pageContent);
    issues.push(...logicIssues);

    // 4. 检查布局问题
    const layoutIssues = this.checkLayout(html, pageOutline.pageNumber);
    issues.push(...layoutIssues);

    // 计算得分
    const score = this.calculateScore(issues);
    const passed = score >= 60 && !issues.some((i) => i.severity === "error");

    // 生成摘要
    const summary = this.generateSummary(issues, score);

    // 记录审核结果
    if (issues.length > 0) {
      this.logger.warn(
        `[auditPage] Page ${pageOutline.pageNumber} audit: score=${score}, issues=${issues.length}`,
      );
      issues.forEach((issue) => {
        const logFn =
          issue.severity === "error"
            ? this.logger.error.bind(this.logger)
            : this.logger.warn.bind(this.logger);
        logFn(`  - [${issue.type}] ${issue.message}`);
      });
    }

    return { passed, score, issues, summary };
  }

  /**
   * 审核整个幻灯片演示的质量
   */
  auditPresentation(
    pages: Array<{
      outline: PageOutline;
      content: PageContent;
      html: string;
    }>,
  ): SemanticAuditResult {
    const allIssues: SemanticIssue[] = [];

    // 审核每一页
    pages.forEach((page) => {
      const result = this.auditPage(page.outline, page.content, page.html);
      allIssues.push(...result.issues);
    });

    // 检查跨页一致性
    const consistencyIssues = this.checkCrossPageConsistency(pages);
    allIssues.push(...consistencyIssues);

    // 计算总体得分
    const score = this.calculateScore(allIssues);
    const passed =
      score >= 60 && !allIssues.some((i) => i.severity === "error");

    const summary = this.generateSummary(allIssues, score);

    this.logger.log(
      `[auditPresentation] Total audit: score=${score}, issues=${allIssues.length}, passed=${passed}`,
    );

    return { passed, score, issues: allIssues, summary };
  }

  /**
   * 检查模板-内容语义匹配
   */
  private checkTemplateSemantic(
    pageOutline: PageOutline,
    pageContent: PageContent,
  ): SemanticIssue[] {
    const issues: SemanticIssue[] = [];
    const templateType = pageOutline.templateType;
    const rules = TEMPLATE_CONTENT_RULES[templateType];

    if (!rules) return issues;

    // 获取内容文本
    const contentText = [
      pageOutline.title,
      pageOutline.subtitle || "",
      pageOutline.contentBrief,
      pageContent.title,
      pageContent.subtitle || "",
      ...pageContent.sections.map((s) => this.getSectionText(s)),
    ]
      .join(" ")
      .toLowerCase();

    // 检查是否包含不适用的关键词
    const invalidMatches = rules.invalidFor.filter((keyword) =>
      contentText.includes(keyword.toLowerCase()),
    );

    if (invalidMatches.length > 0) {
      // 检查是否同时包含适用的关键词
      const validMatches = rules.validFor.filter((keyword) =>
        contentText.includes(keyword.toLowerCase()),
      );

      // 如果不适用关键词多于适用关键词，则报告问题
      if (invalidMatches.length > validMatches.length) {
        issues.push({
          type: "template_mismatch",
          severity: "error",
          message: `模板"${templateType}"与内容语义不匹配：内容包含"${invalidMatches.join("、")}"，${rules.description}`,
          pageNumber: pageOutline.pageNumber,
          suggestion: this.suggestTemplate(contentText, templateType),
        });
      }
    }

    return issues;
  }

  /**
   * 检查图表类型合理性
   */
  private checkChartType(
    pageContent: PageContent,
    html: string,
  ): SemanticIssue[] {
    const issues: SemanticIssue[] = [];

    // 从 HTML 中检测图表类型
    const chartTypeMatch = html.match(
      /type:\s*['"]?(line|bar|pie|radar)['"]?/i,
    );
    if (!chartTypeMatch) return issues;

    const usedChartType = chartTypeMatch[1].toLowerCase();

    // 从内容中提取数据标签
    const chartSection = pageContent.sections.find((s) => s.type === "chart");
    if (!chartSection) return issues;

    const labels = this.extractChartLabels(chartSection, html);
    if (labels.length === 0) return issues;

    const labelsText = labels.join(" ").toLowerCase();

    // 检查分类数据误用折线图
    const hasCategoryKeywords = CHART_DATA_RULES.categoryKeywords.some(
      (keyword) => labelsText.includes(keyword.toLowerCase()),
    );
    const hasTimeKeywords = CHART_DATA_RULES.timeSeriesKeywords.some(
      (keyword) => labelsText.includes(keyword.toLowerCase()),
    );

    if (usedChartType === "line" && hasCategoryKeywords && !hasTimeKeywords) {
      issues.push({
        type: "chart_type_wrong",
        severity: "error",
        message: `折线图用于分类数据"${labels.slice(0, 3).join("、")}"是错误的，分类数据应使用柱状图`,
        pageNumber: 0, // 会在调用时更新
        suggestion: "将图表类型从 line 改为 bar",
        autoFixed: false,
      });
    }

    // 检查时间序列数据误用柱状图
    if (usedChartType === "bar" && hasTimeKeywords && !hasCategoryKeywords) {
      issues.push({
        type: "chart_type_wrong",
        severity: "warning",
        message: `时间序列数据"${labels.slice(0, 3).join("、")}"建议使用折线图而非柱状图`,
        pageNumber: 0,
        suggestion: "考虑将图表类型从 bar 改为 line 以更好展示趋势",
      });
    }

    return issues;
  }

  /**
   * 检查内容逻辑
   */
  private checkContentLogic(
    pageOutline: PageOutline,
    pageContent: PageContent,
  ): SemanticIssue[] {
    const issues: SemanticIssue[] = [];

    // 检查 framework 模板的步骤是否与内容相关
    if (pageOutline.templateType === "framework") {
      const contentText = [
        pageOutline.title,
        pageOutline.contentBrief,
        ...pageOutline.keyElements,
      ].join(" ");

      // 检测是否使用了通用/不相关的步骤名称
      const genericSteps = [
        "需求分析",
        "方案设计",
        "开发实施",
        "上线运维",
        "测试验收",
      ];
      const sectionsText = pageContent.sections
        .map((s) => this.getSectionText(s))
        .join(" ");

      const hasGenericSteps = genericSteps.some(
        (step) =>
          sectionsText.includes(step) &&
          !contentText.includes(step.slice(0, 2)),
      );

      if (hasGenericSteps) {
        // 检查标题是否是技术/流程主题
        const isTechTopic =
          contentText.includes("开发") ||
          contentText.includes("实施") ||
          contentText.includes("项目") ||
          contentText.includes("系统");

        if (!isTechTopic) {
          issues.push({
            type: "content_logic",
            severity: "error",
            message: `框架模板使用了与主题"${pageOutline.title}"不相关的通用步骤（需求分析、方案设计等）`,
            pageNumber: pageOutline.pageNumber,
            suggestion:
              "内容步骤应该与页面主题语义相关，或选择更合适的模板类型",
          });
        }
      }
    }

    return issues;
  }

  /**
   * 检查布局问题
   */
  private checkLayout(html: string, pageNumber: number): SemanticIssue[] {
    const issues: SemanticIssue[] = [];

    // 检查是否有大片空白（通过检测固定小高度容器）
    const smallHeightContainers =
      html.match(/height:\s*(1[0-4]\d|1[5-9]\d)px/gi) || [];
    if (smallHeightContainers.length > 2) {
      issues.push({
        type: "layout_issue",
        severity: "warning",
        message: `检测到 ${smallHeightContainers.length} 个固定小高度容器，可能导致空白区域`,
        pageNumber,
        suggestion: "使用 flex: 1 或 calc(100% - Npx) 替代固定高度",
      });
    }

    // 检查内容是否过于稀疏（文本内容过少）
    const textContent = html
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (textContent.length < 100 && !html.includes("echarts")) {
      issues.push({
        type: "layout_issue",
        severity: "warning",
        message: "页面文本内容过少，可能显得空洞",
        pageNumber,
        suggestion: "增加内容或使用更紧凑的模板",
      });
    }

    return issues;
  }

  /**
   * 检查跨页一致性
   */
  private checkCrossPageConsistency(
    pages: Array<{
      outline: PageOutline;
      content: PageContent;
      html: string;
    }>,
  ): SemanticIssue[] {
    const issues: SemanticIssue[] = [];

    // 检查标题风格一致性
    const titleStyles = pages.map((p) => {
      const match = p.html.match(/font-size:\s*(\d+)px.*?font-weight:\s*(\d+)/);
      return match ? `${match[1]}-${match[2]}` : "unknown";
    });

    const uniqueStyles = [...new Set(titleStyles)];
    if (uniqueStyles.length > 2) {
      issues.push({
        type: "visual_issue",
        severity: "warning",
        message: `标题样式不一致：检测到 ${uniqueStyles.length} 种不同的标题样式`,
        pageNumber: 0,
        suggestion: "统一所有页面的标题字号和字重",
      });
    }

    return issues;
  }

  /**
   * 计算质量得分
   */
  private calculateScore(issues: SemanticIssue[]): number {
    let score = 100;

    issues.forEach((issue) => {
      switch (issue.severity) {
        case "error":
          score -= 20;
          break;
        case "warning":
          score -= 10;
          break;
        case "info":
          score -= 2;
          break;
      }
    });

    return Math.max(0, score);
  }

  /**
   * 生成审核摘要
   */
  private generateSummary(issues: SemanticIssue[], score: number): string {
    if (issues.length === 0) {
      return `质量审核通过，得分 ${score}/100`;
    }

    const errorCount = issues.filter((i) => i.severity === "error").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;

    const parts = [];
    if (errorCount > 0) parts.push(`${errorCount} 个错误`);
    if (warningCount > 0) parts.push(`${warningCount} 个警告`);

    return `质量得分 ${score}/100，发现 ${parts.join("、")}`;
  }

  /**
   * 建议更合适的模板
   */
  private suggestTemplate(
    contentText: string,
    currentTemplate: PageTemplateType,
  ): string {
    const suggestions: string[] = [];

    // 根据内容关键词推荐模板
    if (
      contentText.includes("位置") ||
      contentText.includes("地理") ||
      contentText.includes("城市")
    ) {
      suggestions.push("splitLayout（分栏布局，适合位置描述）");
      suggestions.push("dashboard（仪表板，适合展示数据统计）");
    }

    if (
      contentText.includes("人口") ||
      contentText.includes("面积") ||
      contentText.includes("统计")
    ) {
      suggestions.push("dashboard（仪表板，适合数据展示）");
    }

    if (contentText.includes("历史") || contentText.includes("发展")) {
      suggestions.push("timeline（时间线，适合历史演变）");
    }

    if (suggestions.length > 0) {
      return `建议使用：${suggestions.slice(0, 2).join(" 或 ")}`;
    }

    return `当前模板 ${currentTemplate} 可能不适合此内容`;
  }

  /**
   * 从 Section 获取文本内容
   */
  private getSectionText(section: ContentSection): string {
    if (typeof section.content === "string") {
      return section.content;
    }
    if (Array.isArray(section.content)) {
      return section.content.join(" ");
    }
    if (typeof section.content === "object" && section.content !== null) {
      return Object.values(section.content).join(" ");
    }
    return "";
  }

  /**
   * 从图表配置中提取标签
   */
  private extractChartLabels(
    chartSection: ContentSection,
    html: string,
  ): string[] {
    // 尝试从 HTML 中提取 xAxis data 或 series data
    const xAxisMatch = html.match(/xAxis[\s\S]*?data:\s*\[([\s\S]*?)\]/);
    if (xAxisMatch) {
      const labels = xAxisMatch[1].match(/['"]([^'"]+)['"]/g);
      if (labels) {
        return labels.map((l) => l.replace(/['"]/g, ""));
      }
    }

    // 从 section content 中提取
    if (typeof chartSection.content === "object" && chartSection.content) {
      const content = chartSection.content as unknown as Record<
        string,
        unknown
      >;
      if (Array.isArray(content.labels)) {
        return content.labels as string[];
      }
    }

    return [];
  }
}
