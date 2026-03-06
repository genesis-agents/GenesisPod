/**
 * Report Quality Gate Service
 *
 * v4: 代码强制执行质量标准，替代部分 LLM 审阅循环。
 *
 * 硬性规则通过代码检查，可自动修复的项自动修复，
 * 不可自动修复的标记为需要 AI 重写。
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  detectForeignLanguageBlocks,
  limitBoldFormatting,
  limitBlockquotes,
  removeHorizontalRules,
  sanitizeHeadingLevels,
} from "../../utils/report-formatting.utils";

/**
 * 质量违规项
 */
export interface QualityViolation {
  /** 规则名称 */
  rule: string;
  /** 严重度 */
  severity: "error" | "warning";
  /** 人可读描述 */
  message: string;
  /** 当前值 */
  currentValue?: number;
  /** 阈值 */
  threshold?: number;
}

/**
 * 质量检查结果
 */
export interface QualityCheckResult {
  /** 是否通过所有 error 级别检查 */
  passed: boolean;
  /** 所有违规项 */
  violations: QualityViolation[];
  /** 自动修复后的内容（如果有修复） */
  fixedContent: string;
  /** 是否进行了自动修复 */
  wasAutoFixed: boolean;
  /** 需要 AI 重写的问题描述（传给 AI 做修改指导） */
  rewriteGuidance: string[];
}

@Injectable()
export class ReportQualityGateService {
  private readonly logger = new Logger(ReportQualityGateService.name);

  /**
   * 对维度内容执行质量门控检查
   *
   * @param content Markdown 内容
   * @param targetLanguage 目标语言
   * @returns 质量检查结果（含自动修复后的内容）
   */
  validateDimensionContent(
    content: string,
    targetLanguage: string = "zh",
  ): QualityCheckResult {
    const violations: QualityViolation[] = [];
    const rewriteGuidance: string[] = [];
    let fixedContent = content ?? "";
    let wasAutoFixed = false;

    // ========== 可自动修复的规则 ==========

    // 1. 标题层级检查 + 自动修复
    if (/^#{1,2}\s+/m.test(fixedContent)) {
      violations.push({
        rule: "heading_hierarchy",
        severity: "warning",
        message: "检测到 # 或 ## 标题（应仅使用 ### 和 ####），已自动修复",
      });
      fixedContent = sanitizeHeadingLevels(fixedContent);
      wasAutoFixed = true;
    }

    // 2. 分割线检查 + 自动移除
    const hrCount = (fixedContent.match(/^\s*[-*]{3,}\s*$/gm) || []).length;
    if (hrCount > 0) {
      violations.push({
        rule: "horizontal_rules",
        severity: "warning",
        message: `检测到 ${hrCount} 条分割线，已自动移除`,
        currentValue: hrCount,
        threshold: 0,
      });
      fixedContent = removeHorizontalRules(fixedContent);
      wasAutoFixed = true;
    }

    // 3. 加粗密度检查 + 自动限制
    const boldCount = (fixedContent.match(/\*\*[^*]+\*\*/g) || []).length;
    if (boldCount > 20) {
      violations.push({
        rule: "bold_density",
        severity: "warning",
        message: `加粗处数量 ${boldCount} 超过阈值 20/维度，已自动限制为每节 3 处`,
        currentValue: boldCount,
        threshold: 20,
      });
      fixedContent = limitBoldFormatting(fixedContent, 3);
      wasAutoFixed = true;
    }

    // 4. 引用块密度检查 + 自动限制
    const blockquoteCount = (fixedContent.match(/^>\s*.+$/gm) || []).length;
    if (blockquoteCount > 5) {
      violations.push({
        rule: "blockquote_density",
        severity: "warning",
        message: `引用块数量 ${blockquoteCount} 超过阈值 5/维度，已自动限制`,
        currentValue: blockquoteCount,
        threshold: 5,
      });
      fixedContent = limitBlockquotes(fixedContent, 5);
      wasAutoFixed = true;
    }

    // ========== 检测但不自动修复的规则（需要 AI 重写） ==========

    // 5. 语言一致性检查
    const langCheck = detectForeignLanguageBlocks(fixedContent, targetLanguage);
    if (!langCheck.passed) {
      const pct = (langCheck.foreignRatio * 100).toFixed(1);
      violations.push({
        rule: "language_consistency",
        severity: "error",
        message: `外语内容占比 ${pct}% 超过 5% 阈值，检测到 ${langCheck.blocks.length} 个外语段落`,
        currentValue: langCheck.foreignRatio,
        threshold: 0.05,
      });
      rewriteGuidance.push(
        `语言一致性不合格：报告目标语言为 ${targetLanguage === "zh" ? "中文" : "English"}，` +
          `但检测到 ${langCheck.blocks.length} 个外语段落（占比 ${pct}%）。` +
          `请将所有外语段落翻译为目标语言，专有名词首次出现时可标注原文。`,
      );
    }

    // 6. 内容长度检查
    const charCount = fixedContent.replace(/\s/g, "").length;
    if (charCount < 800) {
      violations.push({
        rule: "min_content_length",
        severity: "error",
        message: `内容长度 ${charCount} 字符不足最低要求 800 字符`,
        currentValue: charCount,
        threshold: 800,
      });
      rewriteGuidance.push(
        `内容过短：当前仅 ${charCount} 字符，需要至少 800 字符的深度分析。请增加更多证据支持的分析内容。`,
      );
    }

    // 7. 引用覆盖检查
    const citations = fixedContent.match(/\[\d+\]/g) || [];
    const uniqueCitations = new Set(citations.map((c) => c));
    if (uniqueCitations.size < 2) {
      violations.push({
        rule: "citation_coverage",
        severity: "warning",
        message: `仅引用了 ${uniqueCitations.size} 个不同来源，建议至少引用 2 个`,
        currentValue: uniqueCitations.size,
        threshold: 2,
      });
      rewriteGuidance.push(
        `引用不足：当前仅引用了 ${uniqueCitations.size} 个来源。请确保每个关键观点都有证据引用 [n]。`,
      );
    }

    // 8. "我们认为" 类主观表达过多
    const subjectivePatterns =
      targetLanguage === "zh" ||
      targetLanguage === "zh-CN" ||
      targetLanguage === "zh-TW"
        ? /我们(认为|判断|看到|发现|相信|预测|观察到|注意到)/g
        : /\b(we believe|we think|we find|we observe|we predict|in our view|in our opinion)\b/gi;
    const subjectiveCount = (fixedContent.match(subjectivePatterns) || [])
      .length;
    if (subjectiveCount > 3) {
      violations.push({
        rule: "subjective_expression",
        severity: "warning",
        message: `主观表达 ${subjectiveCount} 次超过阈值 3 次/维度`,
        currentValue: subjectiveCount,
        threshold: 3,
      });
    }

    // ========== 汇总 ==========

    const hasErrors = violations.some((v) => v.severity === "error");
    const passed = !hasErrors;

    if (violations.length > 0) {
      this.logger.log(
        `[QualityGate] ${violations.length} violations (${hasErrors ? "FAILED" : "PASSED with warnings"}): ${violations.map((v) => v.rule).join(", ")}`,
      );
    }

    return {
      passed,
      violations,
      fixedContent,
      wasAutoFixed,
      rewriteGuidance,
    };
  }

  /**
   * 对完整报告执行质量门控检查
   */
  validateFullReport(
    content: string,
    targetLanguage: string = "zh",
  ): QualityCheckResult {
    const violations: QualityViolation[] = [];
    const rewriteGuidance: string[] = [];
    let fixedContent = content ?? "";
    let wasAutoFixed = false;

    // 1. 分割线移除
    const hrCount = (fixedContent.match(/^\s*[-*]{3,}\s*$/gm) || []).length;
    if (hrCount > 0) {
      fixedContent = removeHorizontalRules(fixedContent);
      wasAutoFixed = true;
      violations.push({
        rule: "horizontal_rules",
        severity: "warning",
        message: `移除了 ${hrCount} 条分割线`,
      });
    }

    // 2. 全文加粗密度
    const boldCount = (fixedContent.match(/\*\*[^*]+\*\*/g) || []).length;
    if (boldCount > 80) {
      violations.push({
        rule: "bold_density_report",
        severity: "warning",
        message: `全文加粗 ${boldCount} 处超过阈值 80`,
        currentValue: boldCount,
        threshold: 80,
      });
      fixedContent = limitBoldFormatting(fixedContent, 3);
      wasAutoFixed = true;
    }

    // 3. 全文引用块密度
    const blockquoteCount = (fixedContent.match(/^>\s*.+$/gm) || []).length;
    if (blockquoteCount > 15) {
      violations.push({
        rule: "blockquote_density_report",
        severity: "warning",
        message: `全文引用块 ${blockquoteCount} 个超过阈值 15`,
        currentValue: blockquoteCount,
        threshold: 15,
      });
      fixedContent = limitBlockquotes(fixedContent, 15);
      wasAutoFixed = true;
    }

    // 4. 语言一致性
    const langCheck = detectForeignLanguageBlocks(fixedContent, targetLanguage);
    if (!langCheck.passed) {
      const pct = (langCheck.foreignRatio * 100).toFixed(1);
      violations.push({
        rule: "language_consistency",
        severity: "warning",
        message: `外语内容占比 ${pct}%，检测到 ${langCheck.blocks.length} 个外语段落`,
      });
    }

    // 5. 主观表达
    const subjectivePatterns =
      targetLanguage === "zh" ||
      targetLanguage === "zh-CN" ||
      targetLanguage === "zh-TW"
        ? /我们(认为|判断|看到|发现|相信|预测|观察到|注意到)/g
        : /\b(we believe|we think|we find|we observe|we predict|in our view|in our opinion)\b/gi;
    const subjectiveCount = (fixedContent.match(subjectivePatterns) || [])
      .length;
    if (subjectiveCount > 10) {
      violations.push({
        rule: "subjective_expression_report",
        severity: "warning",
        message: `全文主观表达 ${subjectiveCount} 次超过阈值 10`,
        currentValue: subjectiveCount,
        threshold: 10,
      });
    }

    const hasErrors = violations.some((v) => v.severity === "error");

    return {
      passed: !hasErrors,
      violations,
      fixedContent,
      wasAutoFixed,
      rewriteGuidance,
    };
  }
}
