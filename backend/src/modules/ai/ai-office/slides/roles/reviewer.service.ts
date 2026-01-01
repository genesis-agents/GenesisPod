/**
 * Slides Engine v3.0 - Reviewer Service
 *
 * 审核者角色：负责质量检查、一致性验证
 * 使用 CHAT 模型 + QUALITY_FIRST 策略
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  PageState,
  OutlinePlan,
  GlobalStyles,
  QualityReport,
  QualityIssue,
  GENSPARK_DESIGN_SYSTEM,
  PageTemplateType,
} from "../checkpoint/checkpoint.types";
import {
  QualityAuditSkill,
  DiagnosticInfo,
} from "../skills/quality-audit.skill";

/**
 * 布局检查输入
 */
export interface LayoutCheckInput {
  html: string;
  pageNumber: number;
  templateType: string;
  globalStyles?: GlobalStyles;
}

/**
 * 布局检查结果
 */
export interface LayoutCheckResult {
  valid: boolean;
  issues: QualityIssue[];
  suggestions: string[];
}

/**
 * 一致性检查输入
 */
export interface ConsistencyCheckInput {
  pages: PageState[];
  outlinePlan: OutlinePlan;
}

/**
 * 一致性检查结果
 */
export interface ConsistencyCheckResult {
  consistent: boolean;
  issues: QualityIssue[];
  colorConsistency: boolean;
  fontConsistency: boolean;
  spacingConsistency: boolean;
}

/**
 * 完整性检查输入
 */
export interface CompletenessCheckInput {
  pages: PageState[];
  outlinePlan: OutlinePlan;
}

/**
 * 完整性检查结果
 */
export interface CompletenessCheckResult {
  complete: boolean;
  missingPages: number[];
  incompletePages: number[];
  issues: QualityIssue[];
}

/**
 * 单页修复结果
 */
export interface PageFixResult {
  pageNumber: number;
  fixed: boolean;
  originalTemplate?: PageTemplateType;
  newTemplate?: PageTemplateType;
  newHtml?: string;
  fixedCount: number;
  remainingCount: number;
}

/**
 * 增强版质量报告（包含修复结果和诊断信息）
 */
export interface EnhancedQualityReport extends QualityReport {
  fixes: PageFixResult[];
  totalFixed: number;
  totalRemaining: number;
  diagnostics: DiagnosticInfo[];
}

@Injectable()
export class ReviewerService {
  private readonly logger = new Logger(ReviewerService.name);

  constructor(private readonly qualityAudit: QualityAuditSkill) {}

  /**
   * 执行完整的质量审核（v3.2 增强：自动修复）
   *
   * 返回增强版质量报告，包含修复结果
   */
  async reviewAll(
    pages: PageState[],
    outlinePlan: OutlinePlan,
    _sessionId?: string,
  ): Promise<EnhancedQualityReport> {
    this.logger.log(`[reviewAll] Reviewing ${pages.length} pages`);

    const startTime = Date.now();

    // 并行执行各项检查
    const [layoutResults, consistencyResult, completenessResult] =
      await Promise.all([
        this.checkAllLayouts(pages),
        this.checkConsistency({ pages, outlinePlan }),
        this.checkCompleteness({ pages, outlinePlan }),
      ]);

    // v3.2: 执行语义级质量审核 + 自动修复
    const fixes: PageFixResult[] = [];
    const diagnostics: DiagnosticInfo[] = [];
    const semanticIssues: QualityIssue[] = [];
    let totalFixed = 0;
    let totalRemaining = 0;

    const pagesWithContent = pages.filter((p) => p.content && p.html);

    for (const page of pagesWithContent) {
      // 使用 auditAndFix 而不是单纯的 auditPage（返回诊断信息）
      const { audit, fix, diagnostic } = this.qualityAudit.auditAndFix(
        page.outline,
        page.content!,
        page.html!,
      );

      // 记录修复结果
      const pageFixResult: PageFixResult = {
        pageNumber: page.pageNumber,
        fixed: fix.fixed,
        originalTemplate: fix.originalTemplate,
        newTemplate: fix.newTemplate,
        newHtml: fix.newHtml,
        fixedCount: fix.fixedIssues.length,
        remainingCount: fix.remainingIssues.length,
      };
      fixes.push(pageFixResult);
      diagnostics.push(diagnostic);

      // 统计
      totalFixed += fix.fixedIssues.length;
      totalRemaining += fix.remainingIssues.length;

      // 如果有修复，更新 page 的 HTML（直接修改引用）
      if (fix.fixed && fix.newHtml) {
        page.html = fix.newHtml;
        this.logger.log(
          `[reviewAll] Page ${page.pageNumber}: Auto-fixed ${fix.fixedIssues.length} issues`,
        );
      }

      // 如果需要更换模板，标记 page（需要重新渲染）
      if (fix.newTemplate && fix.newTemplate !== page.outline.templateType) {
        page.outline.templateType = fix.newTemplate;
        page.status = "pending"; // 标记需要重新渲染
        this.logger.log(
          `[reviewAll] Page ${page.pageNumber}: Template changed to ${fix.newTemplate}, needs re-render`,
        );
      }

      // 收集剩余问题（已修复的不计入）
      const remainingIssues = audit.issues.map((issue) => ({
        type: this.mapAuditIssueType(issue.type),
        severity: issue.severity,
        pageNumber: issue.pageNumber,
        description: issue.message,
        suggestion: issue.suggestion,
        autoFixed: issue.autoFixed,
      }));
      semanticIssues.push(...remainingIssues);
    }

    // 汇总所有问题（不包含已自动修复的）
    const allIssues: QualityIssue[] = [
      ...layoutResults.flatMap((r) => r.issues),
      ...consistencyResult.issues,
      ...completenessResult.issues,
      ...semanticIssues.filter((i) => !i.autoFixed),
    ];

    // 计算总体评分
    const score = this.calculateScore(allIssues, pages.length);
    const overall = this.determineOverallStatus(score, allIssues);

    // 生成建议
    const suggestions = this.generateSuggestions(allIssues, completenessResult);

    // v3.2: 添加修复相关建议
    if (totalFixed > 0) {
      suggestions.unshift(`✅ 已自动修复 ${totalFixed} 个问题`);
    }
    if (totalRemaining > 0) {
      suggestions.push(`⚠️ 仍有 ${totalRemaining} 个问题需要人工处理`);
    }

    const report: EnhancedQualityReport = {
      overall,
      score,
      issues: allIssues,
      suggestions,
      checkedAt: new Date(),
      fixes,
      totalFixed,
      totalRemaining,
      diagnostics,
    };

    // v3.2: 输出诊断汇总（用于持续改进）
    this.logDiagnosticSummary(diagnostics, totalFixed, totalRemaining);

    const duration = Date.now() - startTime;
    this.logger.log(
      `[reviewAll] Review completed in ${duration}ms, score: ${score}, fixed: ${totalFixed}, remaining: ${totalRemaining}`,
    );

    return report;
  }

  /**
   * 检查单页布局
   */
  async checkLayout(input: LayoutCheckInput): Promise<LayoutCheckResult> {
    const { html, pageNumber, templateType, globalStyles } = input;
    const issues: QualityIssue[] = [];
    const suggestions: string[] = [];

    const styles = globalStyles || GENSPARK_DESIGN_SYSTEM;

    // 检查画布尺寸
    if (
      !html.includes(`${styles.canvasWidth}`) ||
      !html.includes(`${styles.canvasHeight}`)
    ) {
      issues.push({
        type: "layout",
        severity: "warning",
        pageNumber,
        description: "画布尺寸可能不正确",
        suggestion: `确保画布为 ${styles.canvasWidth}x${styles.canvasHeight}px`,
      });
    }

    // 检查底部安全区
    const bottomPatterns = [/bottom:\s*0/i, /bottom:\s*[0-5]px/i];
    for (const pattern of bottomPatterns) {
      if (pattern.test(html)) {
        issues.push({
          type: "layout",
          severity: "warning",
          pageNumber,
          description: "内容可能侵入底部安全区",
          suggestion: `保持底部至少 ${styles.bottomSafeZone}px 的安全区域`,
        });
        break;
      }
    }

    // 检查字体
    if (!html.includes("font-family") && !html.includes("Noto Sans")) {
      issues.push({
        type: "layout",
        severity: "info",
        pageNumber,
        description: "未检测到字体设置",
        suggestion: "建议使用 Noto Sans SC 字体",
      });
    }

    // 检查颜色一致性
    const expectedColors = [
      styles.backgroundColor,
      styles.textPrimary,
      styles.accentColor,
    ];
    const hasExpectedColors = expectedColors.some((color) =>
      html.toLowerCase().includes(color.toLowerCase()),
    );

    if (!hasExpectedColors) {
      issues.push({
        type: "layout",
        severity: "info",
        pageNumber,
        description: "颜色可能与全局样式不一致",
        suggestion: "检查颜色是否符合设计规范",
      });
    }

    // 根据模板类型进行特定检查
    const templateIssues = this.checkTemplateSpecificLayout(
      html,
      templateType,
      pageNumber,
    );
    issues.push(...templateIssues);

    return {
      valid: issues.filter((i) => i.severity === "error").length === 0,
      issues,
      suggestions,
    };
  }

  /**
   * 检查所有页面布局
   */
  async checkAllLayouts(pages: PageState[]): Promise<LayoutCheckResult[]> {
    const results: LayoutCheckResult[] = [];

    for (const page of pages) {
      if (!page.html) {
        results.push({
          valid: false,
          issues: [
            {
              type: "layout",
              severity: "error",
              pageNumber: page.pageNumber,
              description: "页面缺少 HTML 内容",
              suggestion: "重新生成该页面",
            },
          ],
          suggestions: [],
        });
        continue;
      }

      const result = await this.checkLayout({
        html: page.html,
        pageNumber: page.pageNumber,
        templateType: page.outline.templateType,
      });

      results.push(result);
    }

    return results;
  }

  /**
   * 检查一致性
   */
  async checkConsistency(
    input: ConsistencyCheckInput,
  ): Promise<ConsistencyCheckResult> {
    const { pages } = input;
    const issues: QualityIssue[] = [];

    // 提取各页面使用的颜色
    const colorSets = pages.map((page) => this.extractColors(page.html || ""));
    const colorConsistency = this.checkColorConsistency(colorSets, pages);

    // 检查字体一致性
    const fontSets = pages.map((page) => this.extractFonts(page.html || ""));
    const fontConsistency = this.checkFontConsistency(fontSets, pages);

    // 检查间距一致性
    const spacingConsistency = true; // 简化处理

    if (!colorConsistency.consistent) {
      issues.push(...colorConsistency.issues);
    }

    if (!fontConsistency.consistent) {
      issues.push(...fontConsistency.issues);
    }

    return {
      consistent: issues.filter((i) => i.severity === "error").length === 0,
      issues,
      colorConsistency: colorConsistency.consistent,
      fontConsistency: fontConsistency.consistent,
      spacingConsistency,
    };
  }

  /**
   * 检查完整性
   */
  async checkCompleteness(
    input: CompletenessCheckInput,
  ): Promise<CompletenessCheckResult> {
    const { pages, outlinePlan } = input;
    const issues: QualityIssue[] = [];

    const expectedPageNumbers = outlinePlan.pages.map((p) => p.pageNumber);
    const actualPageNumbers = new Set(pages.map((p) => p.pageNumber));

    // 检查缺失页面
    const missingPages = expectedPageNumbers.filter(
      (n) => !actualPageNumbers.has(n),
    );
    for (const pageNum of missingPages) {
      issues.push({
        type: "content",
        severity: "error",
        pageNumber: pageNum,
        description: "页面缺失",
        suggestion: "生成该页面内容",
      });
    }

    // 检查不完整页面
    const incompletePages = pages
      .filter((p) => p.status !== "completed" || !p.html)
      .map((p) => p.pageNumber);

    for (const pageNum of incompletePages) {
      if (!missingPages.includes(pageNum)) {
        issues.push({
          type: "content",
          severity: "warning",
          pageNumber: pageNum,
          description: "页面未完成",
          suggestion: "完成该页面的渲染",
        });
      }
    }

    return {
      complete: missingPages.length === 0 && incompletePages.length === 0,
      missingPages,
      incompletePages,
      issues,
    };
  }

  /**
   * 提取 HTML 中的颜色
   */
  private extractColors(html: string): Set<string> {
    const colors = new Set<string>();
    const colorPatterns = [
      /#[0-9A-Fa-f]{6}/g,
      /#[0-9A-Fa-f]{3}/g,
      /rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/gi,
      /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)/gi,
    ];

    for (const pattern of colorPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        matches.forEach((m) => colors.add(m.toLowerCase()));
      }
    }

    return colors;
  }

  /**
   * 提取 HTML 中的字体
   */
  private extractFonts(html: string): Set<string> {
    const fonts = new Set<string>();
    const fontPattern = /font-family:\s*([^;]+)/gi;

    let match;
    while ((match = fontPattern.exec(html)) !== null) {
      fonts.add(match[1].trim().toLowerCase());
    }

    return fonts;
  }

  /**
   * 检查颜色一致性
   */
  private checkColorConsistency(
    colorSets: Set<string>[],
    pages: PageState[],
  ): { consistent: boolean; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];

    // 统计颜色使用频率
    const colorCounts = new Map<string, number>();
    for (const colorSet of colorSets) {
      for (const color of colorSet) {
        colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
      }
    }

    // 如果某个颜色只在少数页面使用，可能是不一致
    const totalPages = colorSets.length;
    for (const [color, count] of colorCounts) {
      if (count === 1 && totalPages > 3) {
        // 只在一个页面使用的颜色
        const pageIndex = colorSets.findIndex((set) => set.has(color));
        if (pageIndex !== -1) {
          issues.push({
            type: "consistency",
            severity: "info",
            pageNumber: pages[pageIndex]?.pageNumber,
            description: `颜色 ${color} 仅在此页面使用`,
            suggestion: "检查颜色是否符合设计规范",
          });
        }
      }
    }

    return {
      consistent: issues.filter((i) => i.severity === "error").length === 0,
      issues,
    };
  }

  /**
   * 检查字体一致性
   */
  private checkFontConsistency(
    fontSets: Set<string>[],
    _pages: PageState[],
  ): { consistent: boolean; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];

    // 收集所有使用的字体
    const allFonts = new Set<string>();
    for (const fontSet of fontSets) {
      for (const font of fontSet) {
        allFonts.add(font);
      }
    }

    // 如果使用了多种不同的字体，可能是不一致
    if (allFonts.size > 3) {
      issues.push({
        type: "consistency",
        severity: "warning",
        description: `使用了 ${allFonts.size} 种不同的字体`,
        suggestion: "建议统一使用 1-2 种字体",
      });
    }

    return {
      consistent: issues.filter((i) => i.severity === "error").length === 0,
      issues,
    };
  }

  /**
   * 模板特定布局检查
   */
  private checkTemplateSpecificLayout(
    html: string,
    templateType: string,
    pageNumber: number,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    switch (templateType) {
      case "cover":
        // 封面应该有大标题
        if (!html.includes("font-size: 36") && !html.includes("font-size:36")) {
          issues.push({
            type: "layout",
            severity: "info",
            pageNumber,
            description: "封面标题字号可能过小",
            suggestion: "封面标题建议使用 36px 以上字号",
          });
        }
        break;

      case "dashboard":
        // 仪表板应该有数据卡片
        if (!html.includes("card") && !html.includes("kpi")) {
          issues.push({
            type: "layout",
            severity: "info",
            pageNumber,
            description: "仪表板可能缺少数据卡片",
            suggestion: "添加 KPI 卡片展示关键指标",
          });
        }
        break;

      // 可以添加更多模板特定检查
    }

    return issues;
  }

  /**
   * 计算质量评分
   */
  private calculateScore(issues: QualityIssue[], _totalPages: number): number {
    let score = 100;

    for (const issue of issues) {
      switch (issue.severity) {
        case "error":
          score -= 10;
          break;
        case "warning":
          score -= 5;
          break;
        case "info":
          score -= 1;
          break;
      }
    }

    // 确保分数在 0-100 之间
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 确定总体状态
   */
  private determineOverallStatus(
    score: number,
    issues: QualityIssue[],
  ): "pass" | "warning" | "fail" {
    const errorCount = issues.filter((i) => i.severity === "error").length;

    if (errorCount > 0 || score < 60) {
      return "fail";
    }

    if (score < 80) {
      return "warning";
    }

    return "pass";
  }

  /**
   * 映射语义审核问题类型到 ReviewerService 格式
   */
  private mapAuditIssueType(
    auditType: string,
  ): "layout" | "content" | "consistency" {
    switch (auditType) {
      case "template_mismatch":
      case "chart_type_wrong":
      case "content_logic":
        return "content";
      case "layout_issue":
        return "layout";
      case "visual_issue":
      case "data_inconsistency":
        return "consistency";
      default:
        return "content";
    }
  }

  /**
   * 输出诊断汇总（用于持续改进分析）
   */
  private logDiagnosticSummary(
    diagnostics: DiagnosticInfo[],
    totalFixed: number,
    totalRemaining: number,
  ): void {
    if (diagnostics.length === 0) return;

    // 汇总问题类型分布
    const issueTypeDistribution: Record<string, number> = {};
    const templateMismatchPages: number[] = [];
    const lowFixRatePages: number[] = [];

    for (const diag of diagnostics) {
      for (const [type, count] of Object.entries(diag.issueTypes)) {
        if (count > 0) {
          issueTypeDistribution[type] =
            (issueTypeDistribution[type] || 0) + count;
        }
      }

      // 记录模板不匹配的页面
      if (diag.issueTypes.template_mismatch > 0) {
        templateMismatchPages.push(diag.pageNumber);
      }

      // 记录修复成功率低的页面
      if (diag.fixAttempted && diag.fixSuccessRate < 50) {
        lowFixRatePages.push(diag.pageNumber);
      }
    }

    // 输出汇总日志
    this.logger.log(
      `[REVIEW-SUMMARY] Pages: ${diagnostics.length}, Fixed: ${totalFixed}, Remaining: ${totalRemaining}`,
    );

    if (Object.keys(issueTypeDistribution).length > 0) {
      this.logger.log(
        `[ISSUE-DISTRIBUTION] ${JSON.stringify(issueTypeDistribution)}`,
      );
    }

    if (templateMismatchPages.length > 0) {
      this.logger.warn(
        `[TEMPLATE-MISMATCH] Pages with template issues: ${templateMismatchPages.join(", ")}`,
      );
    }

    if (lowFixRatePages.length > 0) {
      this.logger.warn(
        `[LOW-FIX-RATE] Pages needing attention: ${lowFixRatePages.join(", ")}`,
      );
    }

    // 计算整体修复成功率
    const overallFixRate =
      totalFixed + totalRemaining > 0
        ? Math.round((totalFixed / (totalFixed + totalRemaining)) * 100)
        : 100;

    this.logger.log(
      `[FIX-RATE] Overall: ${overallFixRate}% (${totalFixed}/${totalFixed + totalRemaining})`,
    );
  }

  /**
   * 生成建议
   */
  private generateSuggestions(
    issues: QualityIssue[],
    completenessResult: CompletenessCheckResult,
  ): string[] {
    const suggestions: string[] = [];

    if (completenessResult.missingPages.length > 0) {
      suggestions.push(
        `补充缺失的 ${completenessResult.missingPages.length} 个页面`,
      );
    }

    if (completenessResult.incompletePages.length > 0) {
      suggestions.push(
        `完成 ${completenessResult.incompletePages.length} 个未完成的页面`,
      );
    }

    const layoutIssues = issues.filter((i) => i.type === "layout");
    if (layoutIssues.length > 3) {
      suggestions.push("检查布局一致性，确保所有页面遵循设计规范");
    }

    const consistencyIssues = issues.filter((i) => i.type === "consistency");
    if (consistencyIssues.length > 0) {
      suggestions.push("统一颜色和字体使用，保持视觉一致性");
    }

    return suggestions;
  }
}
