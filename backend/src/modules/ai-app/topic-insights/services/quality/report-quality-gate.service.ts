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
  deduplicateHeadings,
  stripLLMMetaNotes,
  stripInternalFigureNotation,
} from "@/modules/ai-app/shared/report-template";
import { stripChartJsonFromContent } from "../../utils/strip-chart-json.utils";

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
    if (boldCount > 12) {
      violations.push({
        rule: "bold_density",
        severity: "warning",
        message: `加粗处数量 ${boldCount} 超过阈值 12/维度，已自动限制为每节 2 处`,
        currentValue: boldCount,
        threshold: 12,
      });
      fixedContent = limitBoldFormatting(fixedContent, 2);
      wasAutoFixed = true;
    }

    // 4. 引用块密度检查 + 自动限制（规范：每维度最多 1 个，不含章节要点）
    const blockquoteLines = fixedContent.match(/^>\s*.+$/gm) || [];
    // Exclude chapter highlights blockquotes (本章要点/Chapter Highlights)
    const nonHighlightBlockquotes = blockquoteLines.filter(
      (line) => !/本章要点|Chapter Highlights/i.test(line),
    );
    const blockquoteCount = nonHighlightBlockquotes.length;
    if (blockquoteCount > 1) {
      violations.push({
        rule: "blockquote_density",
        severity: "warning",
        message: `引用块数量 ${blockquoteCount} 超过阈值 1/维度（不含章节要点），已自动限制`,
        currentValue: blockquoteCount,
        threshold: 1,
      });
      fixedContent = limitBlockquotes(fixedContent, 1);
      wasAutoFixed = true;
    }

    // 4.5 LLM meta-notes 清理（字数统计、角色名泄露、内部标注等）
    const beforeMetaNotes = fixedContent;
    fixedContent = stripLLMMetaNotes(fixedContent);
    if (fixedContent !== beforeMetaNotes) {
      violations.push({
        rule: "llm_meta_notes",
        severity: "warning",
        message:
          "检测到 LLM 泄露的内部标注（字数统计/角色名/编辑指令），已自动清理",
      });
      wasAutoFixed = true;
    }

    // 4.6 内部图表/证据标注清理（[证据[N] 图M] 等）
    const beforeFigNotation = fixedContent;
    fixedContent = stripInternalFigureNotation(fixedContent);
    if (fixedContent !== beforeFigNotation) {
      violations.push({
        rule: "internal_figure_notation",
        severity: "warning",
        message: "检测到泄露的内部图表/证据标注，已自动清理",
      });
      wasAutoFixed = true;
    }

    // 4.7 重复标题清理（AI 有时生成 "### 1. Title" 后又生成 "### Title"）
    const beforeDedup = fixedContent;
    fixedContent = deduplicateHeadings(fixedContent);
    if (fixedContent !== beforeDedup) {
      violations.push({
        rule: "duplicate_headings",
        severity: "warning",
        message: "检测到重复标题，已自动去重",
      });
      wasAutoFixed = true;
    }

    // 4.8 图表 JSON 残留清理（parseChartOutput 未正确分离的残留）
    const beforeChartJson = fixedContent;
    fixedContent = stripChartJsonFromContent(fixedContent);
    if (fixedContent !== beforeChartJson) {
      violations.push({
        rule: "chart_json_residue",
        severity: "warning",
        message: "检测到图表 JSON 残留数据，已自动清理",
      });
      wasAutoFixed = true;
    }

    // 4.9 内联 Markdown 图片清理（AI 生成的外部 URL 通常 404）
    const beforeImages = fixedContent;
    fixedContent = fixedContent.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");
    if (fixedContent !== beforeImages) {
      violations.push({
        rule: "inline_images",
        severity: "warning",
        message:
          "检测到内联 Markdown 图片引用（AI 生成 URL 通常 404），已自动移除",
      });
      wasAutoFixed = true;
    }

    // ========== 检测但不自动修复的规则（需要 AI 重写） ==========

    // 5. 语言一致性检查
    const langCheck = detectForeignLanguageBlocks(fixedContent, targetLanguage);
    if (!langCheck.passed) {
      const pct = (langCheck.foreignRatio * 100).toFixed(1);
      violations.push({
        rule: "language_consistency",
        severity: "warning",
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

    // 6.5 ★ v4.3: 空小节检查 — 检测有标题但没有实际内容的小节
    const sections = fixedContent.split(/^(#{2,4}\s+.+)$/gm);
    for (let i = 1; i < sections.length; i += 2) {
      const heading = sections[i]?.trim();
      const body = sections[i + 1] || "";
      const bodyText = body.replace(/\s/g, "");
      if (heading && bodyText.length < 50) {
        violations.push({
          rule: "empty_section",
          severity: "error",
          message: `小节 "${heading.replace(/^#+\s*/, "")}" 内容为空或过短（${bodyText.length} 字符），需要补充`,
          currentValue: bodyText.length,
          threshold: 50,
        });
        rewriteGuidance.push(
          `空小节：「${heading.replace(/^#+\s*/, "")}」仅有 ${bodyText.length} 字符，请补充至少 50 字符的实质内容。`,
        );
      }
    }

    // 7. 引用覆盖检查
    const citations = fixedContent.match(/\[\d+\](?![:(\[])/g) || [];
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

    // 9. 引用集中度检查（单个引用出现 >5 次 warning，>8 次 error）
    const citationCounts = new Map<string, number>();
    for (const c of citations) {
      citationCounts.set(c, (citationCounts.get(c) ?? 0) + 1);
    }
    for (const [cite, count] of citationCounts) {
      if (count > 8) {
        violations.push({
          rule: "citation_concentration",
          severity: "error",
          message: `引用 ${cite} 在维度内出现 ${count} 次，严重超过阈值 8 次，必须分散引用来源`,
          currentValue: count,
          threshold: 8,
        });
        rewriteGuidance.push(
          `引用过度集中：${cite} 在本维度出现 ${count} 次。请减少对单一来源的依赖，用其他证据替换部分引用。`,
        );
      } else if (count > 5) {
        violations.push({
          rule: "citation_concentration",
          severity: "warning",
          message: `引用 ${cite} 在维度内出现 ${count} 次，超过建议阈值 5 次，建议分散引用来源`,
          currentValue: count,
          threshold: 5,
        });
      }
    }

    // 9.5 ★ v4.3: 来源多样性 — 维度内引用来源过少
    if (uniqueCitations.size >= 3) {
      const topCiteCount = Math.max(...citationCounts.values(), 0);
      const topCiteRatio = topCiteCount / citations.length;
      if (topCiteRatio > 0.4) {
        violations.push({
          rule: "source_diversity",
          severity: "warning",
          message: `最高频引用占全部引用的 ${(topCiteRatio * 100).toFixed(0)}%，超过 40% 阈值，来源多样性不足`,
          currentValue: topCiteRatio,
          threshold: 0.4,
        });
        rewriteGuidance.push(
          `来源多样性不足：最高频引用占比 ${(topCiteRatio * 100).toFixed(0)}%。请确保各观点来自不同信息源，避免过度依赖单一来源。`,
        );
      }
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

    // 2. 全文加粗密度（规范：每节最多 2 处）
    const boldCount = (fixedContent.match(/\*\*[^*]+\*\*/g) || []).length;
    if (boldCount > 60) {
      violations.push({
        rule: "bold_density_report",
        severity: "warning",
        message: `全文加粗 ${boldCount} 处超过阈值 60`,
        currentValue: boldCount,
        threshold: 60,
      });
      fixedContent = limitBoldFormatting(fixedContent, 2);
      wasAutoFixed = true;
    }

    // 3. 全文引用块密度（规范：全文最多 8 个，不含章节要点）
    const blockquoteCount = (fixedContent.match(/^>\s*.+$/gm) || []).length;
    if (blockquoteCount > 8) {
      violations.push({
        rule: "blockquote_density_report",
        severity: "warning",
        message: `全文引用块 ${blockquoteCount} 个超过阈值 8`,
        currentValue: blockquoteCount,
        threshold: 8,
      });
      fixedContent = limitBlockquotes(fixedContent, 8);
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

    // 6. 引用孤儿检查：正文中引用了但参考文献区没有对应条目
    // 参考文献区通常以 "## 参考文献" / "## References" / "## 参考资料" 开头
    const refSectionMatch = fixedContent.match(
      /^#{1,3}\s*(?:参考文献|参考资料|References|Bibliography)\s*$/im,
    );
    const bodyText = refSectionMatch
      ? fixedContent.substring(0, fixedContent.indexOf(refSectionMatch[0]))
      : fixedContent;
    const refText = refSectionMatch
      ? fixedContent.substring(fixedContent.indexOf(refSectionMatch[0]))
      : "";

    // Citation markers in body: [N] not followed by : or [ (exclude reference entries)
    const bodyCitations =
      bodyText
        .match(/\[(\d+)\](?![\s]*[:(\[])/g)
        ?.map((m) => m.match(/\d+/)?.[0] ?? "") ?? [];
    const bodyCitationSet = new Set(bodyCitations.filter(Boolean));

    // Reference entries: lines starting with [N] followed by title text
    const refEntries =
      refText
        .match(/^\[(\d+)\]\s+\S/gm)
        ?.map((m) => m.match(/\d+/)?.[0] ?? "") ?? [];
    const refEntrySet = new Set(refEntries.filter(Boolean));

    const orphanCitations = [...bodyCitationSet].filter(
      (n) => !refEntrySet.has(n),
    );
    if (orphanCitations.length > 0) {
      violations.push({
        rule: "citation_orphans",
        severity: "warning",
        message: `正文引用 [${orphanCitations.join("], [")}] 在参考文献区无对应条目`,
        currentValue: orphanCitations.length,
        threshold: 0,
      });
    }

    // 7. 低权威来源占比检查（#19）
    // Citation numbers in body → count how many unique sources exist
    // We cannot access DB credibility scores here, but we can warn when
    // the reference section contains too few entries relative to citations used.
    // This is a proxy for source diversity.
    if (bodyCitationSet.size > 0 && refEntrySet.size > 0) {
      const coverageRatio = refEntrySet.size / bodyCitationSet.size;
      if (coverageRatio < 0.5) {
        violations.push({
          rule: "low_source_diversity",
          severity: "warning",
          message: `正文引用了 ${bodyCitationSet.size} 个编号，但参考文献仅 ${refEntrySet.size} 条，来源多样性不足`,
          currentValue: refEntrySet.size,
          threshold: bodyCitationSet.size,
        });
      }
    }

    // 8. 单源声明检测（#49）
    // Detect bold claims (bold text) that cite only a single source
    const singleSourceClaims: string[] = [];
    const boldClaimPattern = /\*\*([^*]{15,})\*\*\s*\[(\d+)\](?!\s*\[)/g;
    let claimMatch: RegExpExecArray | null;
    while ((claimMatch = boldClaimPattern.exec(bodyText)) !== null) {
      singleSourceClaims.push(claimMatch[1].substring(0, 60));
    }
    if (singleSourceClaims.length > 5) {
      violations.push({
        rule: "single_source_claims",
        severity: "warning",
        message: `检测到 ${singleSourceClaims.length} 个重要论断仅引用单一来源，建议多源交叉验证`,
        currentValue: singleSourceClaims.length,
        threshold: 5,
      });
    }

    // 9. 引用集中度检查：单个引用在正文某节出现 >8 次
    const fullCitations = fixedContent.match(/\[(\d+)\](?![\s]*[:(\[])/g) ?? [];
    const fullCitationCounts = new Map<string, number>();
    for (const c of fullCitations) {
      const n = c.match(/\d+/)?.[0] ?? "";
      if (n) fullCitationCounts.set(n, (fullCitationCounts.get(n) ?? 0) + 1);
    }
    // Check per-section concentration by splitting on ## headings
    const reportSections = fixedContent.split(/^#{2,3}\s+/m);
    for (const sec of reportSections) {
      const secCitations = sec.match(/\[(\d+)\](?![\s]*[:(\[])/g) ?? [];
      const secCounts = new Map<string, number>();
      for (const c of secCitations) {
        const n = c.match(/\d+/)?.[0] ?? "";
        if (n) secCounts.set(n, (secCounts.get(n) ?? 0) + 1);
      }
      for (const [cite, count] of secCounts) {
        if (count > 8) {
          violations.push({
            rule: "citation_concentration",
            severity: "warning",
            message: `引用 [${cite}] 在某节内出现 ${count} 次，超过阈值 8 次，建议分散引用来源`,
            currentValue: count,
            threshold: 8,
          });
          break; // one violation per section is enough
        }
      }
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
