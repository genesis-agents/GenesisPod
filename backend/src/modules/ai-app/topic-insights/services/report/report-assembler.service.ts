import { Injectable, Logger } from "@nestjs/common";
import {
  sanitizeMarkdownContent,
  stripLeadingHeading,
} from "@/common/utils/sanitize-content.utils";
import {
  sanitizeHeadingLevels,
  numberSubHeadings,
  hierarchicalNumberBoldListItems,
  deduplicateParagraphs,
  deduplicateHeadings,
  stripLLMMetaNotes,
  filterJunkReferences,
  deduplicateReferencesByUrl,
  upgradeHttpToHttps,
  decodeUrlEntities,
  remapCitationIndices,
  limitBoldFormatting,
  removeHorizontalRules,
  repairOrderedListContinuity,
  stripInternalFigureNotation,
} from "../../utils/report-formatting.utils";
import {
  stripChartJsonFromContent,
  extractMarkdownFromJsonString,
} from "../../utils/strip-chart-json.utils";
import type { ResearchTopic } from "@prisma/client";
import type { DimensionAnalysisInput } from "../../types/report.types";
import type {
  FigureReference,
  GeneratedChart,
} from "../../types/research.types";
import type { ReportQualityGateService } from "../quality/report-quality-gate.service";

// ==================== Public Interfaces ====================

export interface SupplementaryContent {
  preface?: string;
  executiveSummary?: string;
  crossDimensionAnalysis?: string;
  riskAssessment?: string;
  strategicRecommendations?: string;
  conclusion?: string;
}

export interface ReportReference {
  index?: number;
  title: string;
  domain?: string;
  url: string;
  accessDate?: string;
}

export interface AssembleOptions {
  /** References to append. If provided, runs the reference pipeline. */
  references?: ReportReference[];
  /** Language labels for appendices and references sections */
  appendices?: Array<{ title: string; content: string }>;
}

export interface PostProcessResult {
  content: string;
  warnings: string[];
}

// ==================== Constants ====================

/** Maximum characters per dimension content block (~8000 Chinese characters) */
const MAX_DIMENSION_CHARS = 24000;

// ==================== Service ====================

/**
 * ReportAssemblerService — unified report assembly pipeline.
 *
 * Replaces the near-identical `buildFullReportFromDimensions` implementations
 * that existed in both ReportGeneratorService and ReportSynthesisService.
 *
 * Public API:
 *   processDimensionContent()  — per-dimension content normalization
 *   assembleFullReport()       — build complete markdown from parts
 *   postProcessFinalReport()   — quality gate + final cleanup
 */
@Injectable()
export class ReportAssemblerService {
  private readonly logger = new Logger(ReportAssemblerService.name);

  // ==================== Public Methods ====================

  /**
   * Unified per-dimension content processing pipeline.
   *
   * Applies, in order:
   *   1. stripLeadingHeading
   *   2. stripChartJsonFromContent
   *   3. Remove inline markdown images
   *   4. sanitizeHeadingLevels
   *   5. deduplicateHeadings
   *   6. numberSubHeadings (using dimIndex + 1 as section number)
   *   7. hierarchicalNumberBoldListItems
   *   8. deduplicateParagraphs (caller supplies globalSeenParagraphs)
   *   9. Truncate to MAX_DIMENSION_CHARS at a paragraph boundary
   *  10. resolveChartPlaceholders
   *  11. stripInternalFigureNotation
   *  12. stripLLMMetaNotes
   *
   * @param content           Raw dimension content (detailedContent or summary)
   * @param dimIndex          Zero-based dimension index (used for section numbering)
   * @param globalSeenParagraphs  Shared set for cross-dimension paragraph dedup
   * @param dimensionName     Used in truncation warning logs
   * @param figureReferences  Optional figure-to-chart reference map
   * @param generatedCharts   Optional AI-generated chart data (currently disabled in v4)
   */
  processDimensionContent(
    content: string,
    dimIndex: number,
    globalSeenParagraphs: Set<string>,
    dimensionName?: string,
    figureReferences?: FigureReference[],
    generatedCharts?: GeneratedChart[],
  ): string {
    let processed = stripLeadingHeading(content);

    // Safety net: remove chart JSON residue not separated by parseChartOutput
    processed = stripChartJsonFromContent(processed);

    // Remove inline markdown images (AI-generated external URLs are often 404;
    // charts are managed via the <!-- chart --> placeholder mechanism)
    processed = processed.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");

    // Heading level safety net: demote # / ## to ###; keep ### / #### unchanged
    processed = sanitizeHeadingLevels(processed);

    // Remove duplicate headings (AI sometimes emits "### N. Xxx" then "### Xxx")
    processed = deduplicateHeadings(processed);

    // Unified sub-heading numbering: ### Title → ### N.M. Title
    processed = numberSubHeadings(processed, dimIndex + 1);

    // Hierarchical bold list item numbering
    processed = hierarchicalNumberBoldListItems(processed);

    // Cross-dimension paragraph deduplication (first 120 chars key)
    processed = deduplicateParagraphs(processed, globalSeenParagraphs);

    // Truncate content that exceeds the per-dimension character limit
    if (processed.length > MAX_DIMENSION_CHARS) {
      this.logger.warn(
        `[ReportAssembler] Dimension "${dimensionName ?? `dim${dimIndex}`}" content too long (${processed.length} chars), truncating to ${MAX_DIMENSION_CHARS}`,
      );
      const truncated = processed.substring(0, MAX_DIMENSION_CHARS);
      const lastParagraph = truncated.lastIndexOf("\n\n");
      processed =
        lastParagraph > MAX_DIMENSION_CHARS * 0.7
          ? truncated.substring(0, lastParagraph)
          : truncated;
    }

    // Resolve <!-- figure:N:M --> → <!-- chart:dX-id --> placeholders
    processed = this.resolveChartPlaceholders(
      processed,
      dimIndex,
      figureReferences,
      generatedCharts,
    );

    // Strip leaked internal figure/evidence notation ([证据[N] 图M], orphan refs, etc.)
    processed = stripInternalFigureNotation(processed);

    // Strip LLM meta-notes (word-count annotations, editorial instructions, etc.)
    processed = stripLLMMetaNotes(processed);

    return processed;
  }

  /**
   * Unified full-report builder.
   *
   * Assembly order:
   *   title → generatedAt → preface → executiveSummary → TOC
   *   → dimension sections → fallback sections (when supplementary is empty)
   *   → crossDimension → riskAssessment → strategicRecommendations
   *   → conclusion (with duplication guard) → appendices → references
   *
   * Returns the assembled markdown after `sanitizeMarkdownContent`.
   * Call `postProcessFinalReport` separately for quality-gate processing.
   *
   * @param topic               ResearchTopic (used for name and language)
   * @param dimensionInputs     Per-dimension analysis results
   * @param supplementaryContent  AI-generated supplementary sections
   * @param options             Optional references and appendices
   */
  assembleFullReport(
    topic: ResearchTopic,
    dimensionInputs: DimensionAnalysisInput[],
    supplementaryContent: SupplementaryContent,
    options?: AssembleOptions,
  ): string {
    // ── Language-aware labels ──────────────────────────────────────────────
    const isEn = topic.language === "en";
    const labels = {
      generatedAt: isEn ? "Generated" : "生成时间",
      preface: isEn ? "Preface" : "前言",
      executiveSummary: isEn ? "Executive Summary" : "执行摘要",
      toc: isEn ? "Table of Contents" : "目录",
      dimension: isEn ? "Dimension" : "维度",
      crossDimension: isEn ? "Cross-Dimension Analysis" : "跨维度关联分析",
      riskAssessment: isEn ? "Risk Assessment" : "风险评估",
      strategicRec: isEn ? "Strategic Recommendations" : "战略建议",
      conclusion: isEn ? "Conclusion" : "结语",
      references: isEn ? "References" : "参考文献",
      accessed: isEn ? "Accessed" : "访问日期",
      appendix: isEn ? "Appendix" : "附录",
    };
    const locale = isEn ? "en-US" : "zh-CN";

    // ── Sanitize supplementary content ────────────────────────────────────
    // Extract plain markdown from raw JSON strings, then strip LLM meta-notes
    const sc: SupplementaryContent = {};
    for (const key of Object.keys(
      supplementaryContent,
    ) as (keyof SupplementaryContent)[]) {
      const val = supplementaryContent[key];
      sc[key] = val
        ? stripLLMMetaNotes(extractMarkdownFromJsonString(val))
        : val;
    }

    // ── Sort dimensions by priority ────────────────────────────────────────
    const sortedDimensions = [...dimensionInputs].sort((a, b) => {
      const pa = a.priority ?? 999;
      const pb = b.priority ?? 999;
      return pa - pb;
    });

    const parts: string[] = [];

    // ── 1. Report title ───────────────────────────────────────────────────
    parts.push(`# ${topic.name}`);
    parts.push(
      `\n> ${labels.generatedAt}：${new Date().toLocaleDateString(locale)}\n`,
    );

    // ── 2. Preface (AI-generated) ─────────────────────────────────────────
    if (sc.preface) {
      parts.push(`## ${labels.preface}\n`);
      parts.push(stripLeadingHeading(sc.preface));
      parts.push("\n");
    }

    // ── 3. Executive summary (AI-generated) ──────────────────────────────
    if (sc.executiveSummary) {
      parts.push(`## ${labels.executiveSummary}\n`);
      parts.push(stripLeadingHeading(sc.executiveSummary));
      parts.push("\n");
    }

    // ── 4. Table of contents ──────────────────────────────────────────────
    parts.push(`## ${labels.toc}\n`);
    let tocIndex = 0;
    sortedDimensions.forEach((dim, idx) => {
      const dimName = dim.dimensionName || `${labels.dimension}${idx + 1}`;
      tocIndex = idx + 1;
      // Anchor matches CommonMark slug for "## N. DimName" → "#n-dimname"
      const anchor = `${tocIndex}-${dimName.toLowerCase().replace(/\s+/g, "-")}`;
      parts.push(`${tocIndex}. [${dimName}](#${anchor})`);
    });
    // Only add TOC entries for non-empty supplementary sections
    if (sc.crossDimensionAnalysis) {
      tocIndex++;
      parts.push(
        `${tocIndex}. [${labels.crossDimension}](#${labels.crossDimension.toLowerCase().replace(/\s+/g, "-")})`,
      );
    }
    if (sc.riskAssessment) {
      tocIndex++;
      parts.push(
        `${tocIndex}. [${labels.riskAssessment}](#${labels.riskAssessment.toLowerCase().replace(/\s+/g, "-")})`,
      );
    }
    if (sc.strategicRecommendations) {
      tocIndex++;
      parts.push(
        `${tocIndex}. [${labels.strategicRec}](#${labels.strategicRec.toLowerCase().replace(/\s+/g, "-")})`,
      );
    }
    parts.push("\n\n");

    // ── 5. Dimension sections ─────────────────────────────────────────────
    const globalSeenParagraphs = new Set<string>();

    // Diagnostic log: record content lengths for observability
    const dimContentLengths = sortedDimensions.map(
      (d) =>
        `${d.dimensionName}:${(d.detailedContent || "").length}/${(d.summary || "").length}`,
    );
    this.logger.log(
      `[assembleFullReport] Dimension content lengths (detailed/summary): ${dimContentLengths.join(", ")}`,
    );

    sortedDimensions.forEach((dim, idx) => {
      parts.push(`## ${idx + 1}. ${dim.dimensionName}\n`);

      const rawContent = dim.detailedContent || dim.summary || "暂无详细内容";

      const processed = this.processDimensionContent(
        rawContent,
        idx,
        globalSeenParagraphs,
        dim.dimensionName,
        dim.figureReferences as FigureReference[] | undefined,
        dim.generatedCharts as GeneratedChart[] | undefined,
      );

      parts.push(processed);
      parts.push("\n\n");
    });

    // ── Collect existing H2 titles for duplicate guard ────────────────────
    const existingH2Titles = new Set(
      parts
        .join("\n")
        .match(/^## .+$/gm)
        ?.map((h) => h.replace(/^## /, "").trim()) ?? [],
    );

    // ── A4 Fallback: auto-generate supplementary sections from dimension data
    // when all three supplementary sections are empty
    if (
      !sc.crossDimensionAnalysis &&
      !sc.riskAssessment &&
      !sc.strategicRecommendations
    ) {
      this.logger.warn(
        "[assembleFullReport] crossDimensionAnalysis, riskAssessment, strategicRecommendations are all empty. Generating fallback from dimension data.",
      );

      // Cross-dimension: synthesized from keyFindings
      const fallbackCross = sortedDimensions
        .filter((d) => d.keyFindings?.length > 0)
        .map(
          (d) =>
            `**${d.dimensionName}**：${d.keyFindings
              .slice(0, 2)
              .map((f) => f.finding)
              .join("；")}`,
        )
        .join("\n\n");
      if (fallbackCross) {
        parts.push(`## ${labels.crossDimension}\n`);
        parts.push(fallbackCross);
        parts.push("\n\n");
      }

      // Risk assessment: synthesized from challenges
      const fallbackRisks = sortedDimensions
        .flatMap(
          (d) => d.challenges?.slice(0, 1).map((c) => `- ${c.challenge}`) ?? [],
        )
        .join("\n");
      if (fallbackRisks) {
        parts.push(`## ${labels.riskAssessment}\n`);
        parts.push(fallbackRisks);
        parts.push("\n\n");
      }

      // Strategic recommendations: synthesized from opportunities
      const fallbackRecs = sortedDimensions
        .flatMap(
          (d) =>
            d.opportunities?.slice(0, 1).map((o) => `- ${o.opportunity}`) ?? [],
        )
        .join("\n");
      if (fallbackRecs) {
        parts.push(`## ${labels.strategicRec}\n`);
        parts.push(fallbackRecs);
        parts.push("\n\n");
      }
    }

    // ── 6. Cross-dimension analysis (AI-generated) — duplicate guard ──────
    if (
      sc.crossDimensionAnalysis &&
      !existingH2Titles.has(labels.crossDimension)
    ) {
      parts.push(`## ${labels.crossDimension}\n`);
      parts.push(stripLeadingHeading(sc.crossDimensionAnalysis));
      parts.push("\n\n");
    }

    // ── 7. Risk assessment (AI-generated) ────────────────────────────────
    if (sc.riskAssessment && !existingH2Titles.has(labels.riskAssessment)) {
      parts.push(`## ${labels.riskAssessment}\n`);
      parts.push(stripLeadingHeading(sc.riskAssessment));
      parts.push("\n\n");
    }

    // ── 8. Strategic recommendations (AI-generated) ───────────────────────
    if (
      sc.strategicRecommendations &&
      !existingH2Titles.has(labels.strategicRec)
    ) {
      parts.push(`## ${labels.strategicRec}\n`);
      parts.push(stripLeadingHeading(sc.strategicRecommendations));
      parts.push("\n\n");
    }

    // ── 9. Conclusion (AI-generated) — with duplication guard ─────────────
    if (sc.conclusion) {
      const conclusionText = stripLeadingHeading(sc.conclusion).trim();
      const crossText = (sc.crossDimensionAnalysis || "").trim();

      // Check 1: first 500 chars exact match (whitespace-normalized)
      const conclusionKey = conclusionText.substring(0, 500).replace(/\s/g, "");
      const crossKey = crossText.substring(0, 500).replace(/\s/g, "");
      const isExactDuplicate =
        conclusionKey.length > 50 &&
        crossKey.length > 50 &&
        conclusionKey === crossKey;

      // Check 2: H3 heading overlap > 50% indicates structural duplication
      const extractH3 = (t: string): string[] =>
        (t.match(/^###\s+(.+)$/gm) ?? []).map((h) =>
          h
            .replace(/^###\s+/, "")
            .replace(/^[\d.]+\s*/, "")
            .trim(),
        );
      const conclusionH3 = extractH3(conclusionText);
      const crossH3 = extractH3(crossText);
      const h3Overlap =
        crossH3.length > 0 && conclusionH3.length > 0
          ? conclusionH3.filter((h) => crossH3.includes(h)).length /
            conclusionH3.length
          : 0;
      const isStructuralDuplicate = h3Overlap > 0.5;

      if (isExactDuplicate || isStructuralDuplicate) {
        this.logger.warn(
          `[assembleFullReport] Conclusion is duplicate of crossDimensionAnalysis (exact=${isExactDuplicate}, h3Overlap=${(h3Overlap * 100).toFixed(0)}%), skipping`,
        );
      } else if (conclusionText.length > 0) {
        parts.push(`## ${labels.conclusion}\n`);
        parts.push(conclusionText);
        parts.push("\n");
      }
    }

    // ── 10. Appendices ────────────────────────────────────────────────────
    if (options?.appendices && options.appendices.length > 0) {
      for (const appendix of options.appendices) {
        parts.push(`\n## ${appendix.title}\n`);
        parts.push(appendix.content);
        parts.push("\n");
      }
    }

    // ── 11. References ────────────────────────────────────────────────────
    if (options?.references && options.references.length > 0) {
      const refSection = this.buildReferencesSection(
        options.references,
        labels.references,
        labels.accessed,
        locale,
      );
      if (refSection) {
        parts.push(refSection);
      }
    }

    return sanitizeMarkdownContent(parts.join("\n"));
  }

  /**
   * Unified final report cleanup and quality-gate pass.
   *
   * Steps:
   *   1. Quality gate (if qualityGate provided): validateFullReport
   *      Fallback (no quality gate): removeHorizontalRules + limitBoldFormatting if bold > 120
   *   2. Strip stray `---` separators in flow text
   *   3. Strip figure placeholders (<!-- figure:N:M --> and HTML-escaped forms)
   *   4. stripInternalFigureNotation (full-document pass)
   *   5. stripLLMMetaNotes (full-document pass)
   *   6. repairOrderedListContinuity
   *   7. Arrow chain warning (> 5 arrows)
   *   8. Deep heading warning (h5/h6 present)
   *
   * @param markdown        Assembled report markdown
   * @param targetLanguage  Language code ("zh" | "en")
   * @param qualityGate     Optional quality gate service; if omitted, minimal cleanup is applied
   */
  postProcessFinalReport(
    markdown: string,
    targetLanguage: string = "zh",
    qualityGate?: ReportQualityGateService,
  ): PostProcessResult {
    const warnings: string[] = [];
    let content = markdown;

    if (qualityGate) {
      // Full quality-gate path
      const qc = qualityGate.validateFullReport(content, targetLanguage);
      warnings.push(...qc.violations.map((v) => v.message));
      content = qc.wasAutoFixed ? qc.fixedContent : content;
    } else {
      // Minimal fallback: horizontal rules + excessive bold
      const hrCount = (content.match(/^\s*[-*]{3,}\s*$/gm) ?? []).length;
      if (hrCount > 0) {
        content = removeHorizontalRules(content);
        warnings.push(`Removed ${hrCount} horizontal rule(s)`);
      }
      const boldCount = (content.match(/\*\*[^*]+\*\*/g) ?? []).length;
      if (boldCount > 120) {
        content = limitBoldFormatting(content, 5);
        warnings.push(
          `Bold formatting count ${boldCount} exceeds limit 120, reduced`,
        );
      }
    }

    // Strip stray --- separators in flow text (not caught by HR regex)
    content = content.replace(/\n---\n/g, "\n\n");

    // Strip residual figure placeholders (plain and HTML-escaped)
    content = content.replace(/<!--\s*figure:\d+:\d+\s*-->/g, "");
    content = content.replace(/&lt;!--\s*figure:\d+:\d+\s*--&gt;/g, "");

    // Full-document pass: strip leaked internal figure/evidence notation
    content = stripInternalFigureNotation(content);

    // Full-document pass: strip LLM meta-notes
    content = stripLLMMetaNotes(content);

    // Repair ordered list continuity (LLM often restarts from 1 mid-section)
    content = repairOrderedListContinuity(content);

    // Warn-only checks
    const arrowCount = (content.match(/→/g) ?? []).length;
    if (arrowCount > 5) {
      warnings.push(`Arrow chain count ${arrowCount} exceeds limit 5`);
    }

    const deepHeadingCount = (content.match(/^#{5,6}\s+/gm) ?? []).length;
    if (deepHeadingCount > 0) {
      warnings.push(
        `Deep headings (h5/h6) count ${deepHeadingCount}, should be 0`,
      );
    }

    if (warnings.length > 0) {
      this.logger.warn(
        `[postProcessFinalReport] Quality fixes/warnings:\n${warnings.join("\n")}`,
      );
    }

    return { content, warnings };
  }

  // ==================== Private Methods ====================

  /**
   * Resolves chart placeholders in dimension content:
   *   1. Converts <!-- figure:N:M --> to <!-- chart:dX-id --> via figureReferences
   *   2. Strips unresolved <!-- figure:N:M --> placeholders
   *   3. Deduplicates chart placeholders by chartId
   *
   * Note: generatedCharts injection is disabled in v4 (AI-fabricated charts disabled).
   */
  private resolveChartPlaceholders(
    content: string,
    dimIndex: number,
    figureReferences?: FigureReference[],
    _generatedCharts?: GeneratedChart[],
  ): string {
    let result = content;
    const dimPrefix = `d${dimIndex}-`;

    // 1. Convert <!-- figure:N:M --> placeholders to <!-- chart:chartId -->
    if (figureReferences && figureReferences.length > 0) {
      result = result.replace(
        /<!--\s*figure:(\d+):(\d+)\s*-->/g,
        (_match, evidenceIdx, figIdx) => {
          const ref = figureReferences.find(
            (r) =>
              r.evidenceCitationIndex === Number(evidenceIdx) &&
              r.figureIndex === Number(figIdx),
          );
          return ref ? `<!-- chart:${dimPrefix}${ref.id} -->` : _match;
        },
      );
    }

    // 2. Skip generatedCharts injection (v4: AI-fabricated charts disabled)

    // 3. Strip unresolved figure placeholders (no matching figureReference found)
    result = result.replace(/<!--\s*figure:\d+:\d+\s*-->/g, "");

    // 4. Deduplicate chart placeholders: same chartId only appears once
    const seenChartIds = new Set<string>();
    result = result.replace(/<!-- chart:([^\s]+?) -->/g, (match, chartId) => {
      if (seenChartIds.has(chartId)) return "";
      seenChartIds.add(chartId);
      return match;
    });

    return result;
  }

  /**
   * Builds and returns the references section markdown string,
   * after running the full reference cleanup pipeline:
   *   filterJunkReferences → decodeUrlEntities → upgradeHttpToHttps
   *   → deduplicateReferencesByUrl → remapCitationIndices (applied to caller's content)
   *
   * Note: `remapCitationIndices` cannot be applied here because it operates on
   * the full report body, not on the references alone. The caller should pass
   * the returned `citationIndexMapping` to `remapCitationIndices` separately
   * when needed. This method applies the mapping to the section itself.
   */
  private buildReferencesSection(
    references: ReportReference[],
    referencesLabel: string,
    accessedLabel: string,
    locale: string,
  ): string {
    if (references.length === 0) return "";

    // Normalize entries to the shape expected by reference pipeline utilities
    let refEntries = references
      .filter((r) => r.url)
      .map((r, i) => ({
        index: r.index ?? i + 1,
        title: r.title,
        url: r.url,
        domain: r.domain ?? null,
        accessedAt: r.accessDate ? new Date(r.accessDate) : undefined,
      }));

    const beforeCount = refEntries.length;

    refEntries = filterJunkReferences(refEntries);
    refEntries = decodeUrlEntities(refEntries);
    refEntries = upgradeHttpToHttps(refEntries);

    const { deduplicated, indexMapping } = deduplicateReferencesByUrl(
      refEntries as Parameters<typeof deduplicateReferencesByUrl>[0],
    );
    refEntries = deduplicated as typeof refEntries;

    if (refEntries.length < beforeCount) {
      this.logger.log(
        `[buildReferencesSection] Reference cleanup: ${beforeCount} → ${refEntries.length} (removed ${beforeCount - refEntries.length} junk/duplicate references)`,
      );
    }

    if (refEntries.length === 0) return "";

    const refLines = refEntries.map((e) => {
      const accessDate = e.accessedAt
        ? new Date(e.accessedAt).toLocaleDateString(locale)
        : new Date().toLocaleDateString(locale);
      return `[${e.index}] ${e.title}. ${e.domain || ""}. ${e.url}. ${accessedLabel}: ${accessDate}`;
    });

    let section = `\n\n---\n\n# ${referencesLabel}\n\n${refLines.join("\n\n")}`;

    // Apply citation index remapping to the references section itself
    if (indexMapping.size > 0) {
      section = remapCitationIndices(section, indexMapping);
    }

    return section;
  }
}
