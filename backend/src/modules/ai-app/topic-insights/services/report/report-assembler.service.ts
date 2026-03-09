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
  mergeAdjacentMathBlocks,
  decodeHtmlEntities,
  convertChineseNumeralHeadings,
  repairBrokenListItems,
  clearBrokenMediaAndEmptyBlocks,
  fixDoubleSourceLabels,
  fixDuplicateHeadings,
  removeEmptySections,
  splitWallOfText,
  repairMarkdownTables,
  deduplicateHeadingEcho,
  detectAndPromoteHeadings,
  wrapPseudoCodeBlocks,
  collapsePseudoCodeHeadings,
  collapseExcessSubHeadings,
  removeEmptyHeadings,
  repairTruncatedBlockquoteBullets,
  truncateLongListItems,
  separateTrappedConclusions,
  enforceExecSummarySections,
  truncateAtSentenceBoundary,
  normalizeArrowNotation,
  stripLeakedHtmlComments,
  deduplicateAdjacentCitations,
  extractTableFootnotes,
  boldSummaryPrefixes,
  bulletifyBlockquoteItems,
  splitEnumerationToList,
  convertDescriptiveListsToBullets,
  repairBrokenBoldMarkers,
  stripFigureComments,
  normalizeHighlightsInPlace,
  renumberHeadings,
  ensureBlankLineAfterTables,
  stripHtmlCitationLinks,
  stripCitationsFromHeadings,
  wrapBareDisplayMath,
  deduplicateTerminalSections,
  stripChapterHighlights,
  cleanupEmptyBullets,
  normalizeInformalTerms,
  normalizeSourceLabels,
} from "@/modules/ai-app/shared/report-template";
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

// ==================== Helpers ====================

/**
 * Detect chapter highlights header in a line.
 * Matches all LLM format variants:
 *   > 本章要点 / > **本章要点** / > - 本章要点 / > - **本章要点：**
 *   本章要点（没有 blockquote 前缀）/ **本章要点** / - 本章要点
 *   > Chapter Highlights / Chapter Highlights
 */
const CHAPTER_HIGHLIGHTS_RE =
  /^(?:>\s*)?[-*]*\s*\**(?:本章要点|Chapter Highlights)\**[：:]*\**\s*$/i;

/**
 * Normalize chapter highlights: keep only the FIRST "本章要点" / "Chapter Highlights"
 * block, remove ALL blocks from their original positions, and prepend the first
 * block's content at the very beginning of the output.
 *
 * This handles LLMs that place the block mid-content (e.g. at sub-section 4.2).
 *
 * Formatting fixes applied to the kept block:
 * - Header line normalized to: `> **本章要点**`
 * - Bullet lines normalized to: `> - point`
 */
function normalizeChapterHighlights(content: string): string {
  const lines = content.split("\n");

  // Pass 1: collect the first block's normalized lines and build the rest without any block
  let firstBlockLines: string[] | null = null;
  let currentBlockLines: string[] = [];
  let insideBlock = false;
  const bodyLines: string[] = [];

  const flushBlock = () => {
    if (currentBlockLines.length > 0 && firstBlockLines === null) {
      firstBlockLines = currentBlockLines;
    }
    currentBlockLines = [];
    insideBlock = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (CHAPTER_HIGHLIGHTS_RE.test(line)) {
      if (insideBlock) {
        // A new header while already inside — treat previous block as complete
        flushBlock();
      }
      insideBlock = true;
      const isEn = /Chapter Highlights/i.test(line);
      const label = isEn ? "Chapter Highlights" : "本章要点";
      currentBlockLines = [`> **${label}**`];
      continue;
    }

    if (insideBlock) {
      const trimmed = line.replace(/^>\s*/, "").trim();

      // Blockquote bullet continuation
      if (/^>\s*[-*]/.test(line) || /^\s*[-*]\s/.test(line)) {
        const pointText = trimmed.replace(/^[-*]\s*/, "").trim();
        if (pointText) {
          currentBlockLines.push(`> - ${pointText}`);
        }
        continue;
      }

      // Empty line or bare blockquote marker ends the block
      if (line.trim() === "" || line.trim() === ">") {
        flushBlock();
        bodyLines.push(line);
        continue;
      }

      // Non-blockquote, non-list line ends the block
      if (!/^>/.test(line)) {
        flushBlock();
        bodyLines.push(line);
        continue;
      }

      // Blockquote line without list marker — treat as continuation point
      if (trimmed) {
        currentBlockLines.push(`> - ${trimmed}`);
        continue;
      }
    }

    bodyLines.push(line);
  }

  // Flush any block still open at EOF
  flushBlock();

  if (firstBlockLines === null) {
    return content;
  }

  // Prepend the first block at the very top, separated from body by a blank line
  const blockText = (firstBlockLines as string[]).join("\n");
  const bodyText = bodyLines.join("\n").replace(/^\n+/, ""); // strip leading blanks from body
  return `${blockText}\n\n${bodyText}`;
}

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

    // BUG-1/2 fix: Normalize chapter highlights — keep only the first block,
    // remove all duplicates (LLM sometimes adds 本章要点 in sub-sections or at
    // both the start and end of detailedContent)
    processed = normalizeChapterHighlights(processed);

    // Safety net: remove chart JSON residue not separated by parseChartOutput
    processed = stripChartJsonFromContent(processed);

    // Remove ONLY AI-hallucinated markdown images (fake URLs that return 404)
    // Keep legitimate images from evidence sources
    processed = processed.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_match, _alt: string, url: string) => {
        const lower = url.toLowerCase();
        // Strip data URIs (bloated, not real images)
        if (lower.startsWith("data:")) return "";
        // Strip placeholder/example domains
        if (
          lower.includes("placeholder.com") ||
          lower.includes("example.com") ||
          lower.includes("via.placeholder")
        )
          return "";
        // Strip obviously fake AI-generated URLs (common patterns)
        if (lower.includes("image-not-found") || lower.includes("no-image"))
          return "";
        // Strip broken relative paths (no protocol, not starting with /)
        if (!lower.startsWith("http") && !lower.startsWith("/")) return "";
        // Keep all other images (legitimate evidence source images)
        return _match;
      },
    );

    // Convert Chinese numeral headings (一、标题 → ### 标题) BEFORE heading normalization
    processed = convertChineseNumeralHeadings(processed);

    // Detect and promote heading-like plain text lines to ### headings
    processed = detectAndPromoteHeadings(processed);

    // Heading level safety net: demote # / ## to ###; keep ### / #### unchanged
    processed = sanitizeHeadingLevels(processed);

    // Remove duplicate headings (AI sometimes emits "### N. Xxx" then "### Xxx")
    processed = deduplicateHeadings(processed);

    // Remove plain text lines that echo the preceding heading
    processed = deduplicateHeadingEcho(processed);

    // Demote headings that contain pseudocode (e.g., "### if mask is not None")
    processed = collapsePseudoCodeHeadings(processed);

    // Unified sub-heading numbering: ### Title → ### N.M. Title
    processed = numberSubHeadings(processed, dimIndex + 1);

    // Hierarchical bold list item numbering
    processed = hierarchicalNumberBoldListItems(processed);

    // Convert plain ordered lists under #### to bullets (avoids numbering ambiguity)
    processed = convertDescriptiveListsToBullets(processed);

    // Cross-dimension paragraph deduplication (first 120 chars key)
    processed = deduplicateParagraphs(processed, globalSeenParagraphs);

    // Truncate content that exceeds the per-dimension character limit
    // Uses sentence-safe truncation to avoid cutting mid-sentence
    if (processed.length > MAX_DIMENSION_CHARS) {
      this.logger.warn(
        `[ReportAssembler] Dimension "${dimensionName ?? `dim${dimIndex}`}" content too long (${processed.length} chars), truncating to ${MAX_DIMENSION_CHARS}`,
      );
      processed = truncateAtSentenceBoundary(processed, MAX_DIMENSION_CHARS);
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

    // Strip leaked HTML comments (LLM authoring notes)
    processed = stripLeakedHtmlComments(processed);

    // Normalize arrow notation corruption (进而推动 → →)
    processed = normalizeArrowNotation(processed);

    // Deduplicate adjacent identical citations ([5][5] → [5])
    processed = deduplicateAdjacentCitations(processed);

    // Repair blockquote bullets truncated mid-sentence (from token budget limits)
    processed = repairTruncatedBlockquoteBullets(processed);

    // Decode HTML entities (&gt; &lt; &amp;) leaked by LLM
    processed = decodeHtmlEntities(processed);

    // Fix double source labels (来源：来源：→ 来源：)
    processed = fixDoubleSourceLabels(processed);

    // Fix duplicate adjacent headings (## Title\n\nTitle → ## Title)
    processed = fixDuplicateHeadings(processed);

    // Remove empty sections (heading followed immediately by next heading with no content)
    processed = removeEmptySections(processed);

    // Repair broken list items (empty bullet + content on next line)
    processed = repairBrokenListItems(processed);

    // Clear empty blockquotes and broken image placeholders
    processed = clearBrokenMediaAndEmptyBlocks(processed);

    // Repair Markdown tables (missing separator rows, blank lines)
    processed = repairMarkdownTables(processed);

    // Extract footnote rows from tables (long explanatory text in last row)
    processed = extractTableFootnotes(processed);

    // Split wall-of-text paragraphs (> 400 chars) at sentence boundaries
    processed = splitWallOfText(processed);

    // Wrap pseudocode/code-like blocks in fenced code blocks
    processed = wrapPseudoCodeBlocks(processed);

    // Collapse excess sub-headings (> 8 per dimension → demote to ####)
    processed = collapseExcessSubHeadings(processed, 8);

    // Remove empty headings (heading followed immediately by another heading with no content)
    processed = removeEmptyHeadings(processed);

    // Enforce max list item length (split long items at sentence boundaries)
    processed = truncateLongListItems(processed);

    // Separate conclusion paragraphs trapped in list structures
    processed = separateTrappedConclusions(processed);

    // Add bullet markers to consecutive blockquote lines without them
    processed = bulletifyBlockquoteItems(processed);

    // Split enumeration patterns (一是/二是...) into bullet lists
    processed = splitEnumerationToList(processed);

    // Clean up empty bullet items left by bulletify/enumeration steps
    processed = cleanupEmptyBullets(processed);

    // Bold summary prefix before Chinese colon (短语：→ **短语**：)
    processed = boldSummaryPrefixes(processed);

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
    // Extract plain markdown from raw JSON strings, strip LLM meta-notes,
    // and remove blockquotes from supplementary sections (spec: 禁止补充节使用引用块)
    const sc: SupplementaryContent = {};
    for (const key of Object.keys(
      supplementaryContent,
    ) as (keyof SupplementaryContent)[]) {
      const val = supplementaryContent[key];
      if (val) {
        let cleaned = stripLLMMetaNotes(extractMarkdownFromJsonString(val));
        // Strip blockquotes from supplementary sections (cross-dimension, risk, strategy)
        if (
          key === "crossDimensionAnalysis" ||
          key === "riskAssessment" ||
          key === "strategicRecommendations"
        ) {
          cleaned = cleaned.replace(/^>\s*(.+)$/gm, "$1");
        }
        sc[key] = cleaned;
      } else {
        sc[key] = val;
      }
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
      const rawContent = dim.detailedContent || dim.summary || "";

      const processed = this.processDimensionContent(
        rawContent,
        idx,
        globalSeenParagraphs,
        dim.dimensionName,
        dim.figureReferences as FigureReference[] | undefined,
        dim.generatedCharts as GeneratedChart[] | undefined,
      );

      // ★ Skip empty dimensions: if processed content is blank after all pipeline
      // steps (e.g. all sub-headings removed by removeEmptyHeadings), don't emit
      // the ## heading at all — avoids consecutive empty section headers.
      const contentBody = processed
        .replace(/^\s*#{1,6}\s+[^\n]*\n?/gm, "")
        .trim();
      if (!contentBody) {
        this.logger.warn(
          `[assembleFullReport] Skipping empty dimension: ${dim.dimensionName}`,
        );
        return; // forEach continue
      }

      parts.push(`## ${idx + 1}. ${dim.dimensionName}\n`);

      // ★ Chapter Highlights: LLM is instructed to generate "本章要点" in detailedContent.
      // Previously the assembler also injected one from keyFindings, causing duplication.
      // Now we only rely on LLM-generated highlights; normalizeChapterHighlights()
      // handles dedup if the LLM accidentally produces multiple blocks.

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

    // ── 9. Conclusion (AI-generated) — with enhanced duplication guard ────
    if (sc.conclusion) {
      let conclusionText = stripLeadingHeading(sc.conclusion).trim();

      // Collect all supplementary sections to check against
      const supplementarySections = [
        sc.crossDimensionAnalysis,
        sc.riskAssessment,
        sc.strategicRecommendations,
      ]
        .filter(Boolean)
        .map((s) => (s as string).trim());

      // Extract 120-char paragraph keys from supplementary sections
      const supplementaryParagraphKeys = new Set<string>();
      for (const section of supplementarySections) {
        const paras = section.split("\n\n");
        for (const p of paras) {
          const trimmed = p.trim();
          if (trimmed.length >= 60 && !/^[#>|!\-*\d]/.test(trimmed)) {
            supplementaryParagraphKeys.add(
              trimmed.substring(0, 120).replace(/\s/g, ""),
            );
          }
        }
      }

      // Check 1: paragraph-level content overlap
      const conclusionParas = conclusionText
        .split("\n\n")
        .filter((p) => p.trim().length >= 60);
      const duplicateParas = conclusionParas.filter((p) => {
        const key = p.trim().substring(0, 120).replace(/\s/g, "");
        return supplementaryParagraphKeys.has(key);
      });
      const overlapRatio =
        conclusionParas.length > 0
          ? duplicateParas.length / conclusionParas.length
          : 0;

      // Check 2: H3 heading overlap with cross-dimension analysis
      const extractH3 = (t: string): string[] =>
        (t.match(/^###\s+(.+)$/gm) ?? []).map((h) =>
          h
            .replace(/^###\s+/, "")
            .replace(/^[\d.]+\s*/, "")
            .trim(),
        );
      const conclusionH3 = extractH3(conclusionText);
      const crossH3 = extractH3(
        (sc.crossDimensionAnalysis || "") +
          (sc.riskAssessment || "") +
          (sc.strategicRecommendations || ""),
      );
      const h3Overlap =
        crossH3.length > 0 && conclusionH3.length > 0
          ? conclusionH3.filter((h) => crossH3.includes(h)).length /
            conclusionH3.length
          : 0;

      if (overlapRatio > 0.4 || h3Overlap > 0.5) {
        // Strip duplicate paragraphs but keep unique content
        if (
          overlapRatio < 1.0 &&
          conclusionParas.length > duplicateParas.length
        ) {
          // Partial overlap: remove only duplicate paragraphs
          const uniqueParas = conclusionText.split("\n\n").filter((p) => {
            const trimmed = p.trim();
            if (trimmed.length < 60 || /^[#>|!\-*\d]/.test(trimmed))
              return true;
            const key = trimmed.substring(0, 120).replace(/\s/g, "");
            return !supplementaryParagraphKeys.has(key);
          });
          conclusionText = uniqueParas.join("\n\n").trim();
          this.logger.warn(
            `[assembleFullReport] Conclusion had ${duplicateParas.length}/${conclusionParas.length} duplicate paragraphs, stripped duplicates`,
          );
          if (conclusionText.length > 50) {
            parts.push(`## ${labels.conclusion}\n`);
            parts.push(conclusionText);
            parts.push("\n");
          }
        } else {
          this.logger.warn(
            `[assembleFullReport] Conclusion is fully duplicate (overlap=${(overlapRatio * 100).toFixed(0)}%, h3=${(h3Overlap * 100).toFixed(0)}%), skipping`,
          );
        }
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
      if (boldCount > 60) {
        content = limitBoldFormatting(content, 2);
        warnings.push(
          `Bold formatting count ${boldCount} exceeds limit 60, reduced`,
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

    // Repair blockquote bullets truncated mid-sentence
    content = repairTruncatedBlockquoteBullets(content);

    // Decode HTML entities (&gt; &lt; &amp;) in body text
    content = decodeHtmlEntities(content);

    // Fix double source labels (来源：来源：→ 来源：)
    content = fixDoubleSourceLabels(content);

    // Repair broken list items (empty bullet + content on next line)
    content = repairBrokenListItems(content);

    // Clear empty blockquotes and broken image placeholders
    content = clearBrokenMediaAndEmptyBlocks(content);

    // Repair Markdown tables (missing separator rows, blank lines)
    content = repairMarkdownTables(content);

    // Ensure blank line after tables (prevents footnotes from becoming table rows)
    content = ensureBlankLineAfterTables(content);

    // Extract footnote rows from tables (long explanatory text in last row)
    content = extractTableFootnotes(content);

    // Split wall-of-text paragraphs (> 400 chars) at sentence boundaries
    content = splitWallOfText(content);

    // Detect and promote heading-like plain text lines in supplementary sections
    content = detectAndPromoteHeadings(content);

    // Remove plain text echoes of headings
    content = deduplicateHeadingEcho(content);

    // Repair ordered list continuity (LLM often restarts from 1 mid-section)
    content = repairOrderedListContinuity(content);

    // Demote headings that contain pseudocode (e.g., "### if mask is not None")
    content = collapsePseudoCodeHeadings(content);

    // Wrap pseudocode blocks in fenced code blocks
    content = wrapPseudoCodeBlocks(content);

    // Collapse excess sub-headings (> 8 per dimension → demote to ####)
    content = collapseExcessSubHeadings(content, 8);

    // Remove empty headings (heading → next heading with no content between)
    content = removeEmptyHeadings(content);

    // Close numbering gaps immediately after heading removal (before other steps
    // that depend on correct heading numbers, e.g. truncateLongListItems)
    content = renumberHeadings(content);

    // Enforce max list item length
    content = truncateLongListItems(content);

    // Separate conclusion paragraphs trapped in list structures
    content = separateTrappedConclusions(content);

    // Enforce structural separators in executive summary
    content = enforceExecSummarySections(content);

    // Merge fragmented adjacent $...$ math blocks into single blocks
    content = mergeAdjacentMathBlocks(content);

    // NOTE: anchorReferences + linkifyCitations produce HTML <a> tags that
    // ReactMarkdown (without rehypeRaw) renders as literal text. Skip them.
    // Citations remain as plain [N] which is standard academic format.
    // content = anchorReferences(content);
    // content = linkifyCitations(content);

    // Normalize arrow notation: fix prior "进而推动" corruption back to →
    content = normalizeArrowNotation(content);

    // Strip leaked HTML comments (LLM internal authoring notes)
    content = stripLeakedHtmlComments(content);

    // Deduplicate adjacent identical citations ([5][5] → [5])
    content = deduplicateAdjacentCitations(content);

    // Add bullet markers to consecutive blockquote lines without them
    content = bulletifyBlockquoteItems(content);

    // Split enumeration patterns (一是/二是...) into bullet lists
    content = splitEnumerationToList(content);

    // Clean up empty bullet items left by bulletify/enumeration steps
    content = cleanupEmptyBullets(content);

    // Bold summary prefix before Chinese colon (短语：→ **短语**：)
    content = boldSummaryPrefixes(content);

    // Repair broken bold markers (**，text or ** [N])
    content = repairBrokenBoldMarkers(content);

    // Normalize 本章要点 headers in-place (> 本章要点 → > **本章要点**, add > prefix to bullets)
    content = normalizeHighlightsInPlace(content);

    // Strip residual figure placeholders (catch any missed by per-dimension pass)
    content = stripFigureComments(content);

    // Strip 本章要点 blocks from continuous view (redundant with exec summary)
    content = stripChapterHighlights(content);

    // Re-number headings to close gaps from removed/collapsed headings
    content = renumberHeadings(content);

    // Strip HTML citation links from historical data or upstream transforms
    content = stripHtmlCitationLinks(content);

    // Strip citation markers from heading lines (belong in body, not titles)
    content = stripCitationsFromHeadings(content);

    // Wrap standalone LaTeX display-math lines in $$ delimiters
    content = wrapBareDisplayMath(content);

    // Normalize informal English terms to formal Chinese (e.g. "hype" → "炒作")
    content = normalizeInformalTerms(content);

    // Normalize citation source labels to consistent format (Source: [N])
    content = normalizeSourceLabels(content);

    // Remove duplicate terminal sections (结语 repeating 跨维度关联分析 sub-sections)
    content = deduplicateTerminalSections(content);

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

  /**
   * Re-process an already-stored fullReport through the latest post-processing pipeline.
   *
   * This is a lightweight operation (no LLM call) that applies all formatting fixes
   * to an existing report. Use this to fix reports generated with older pipeline versions.
   *
   * @param storedMarkdown  The fullReport field from TopicReport
   * @param targetLanguage  Target language (default "zh")
   * @returns Updated markdown with all fixes applied
   */
  reprocessStoredReport(
    storedMarkdown: string,
    targetLanguage: string = "zh",
  ): PostProcessResult {
    return this.postProcessFinalReport(storedMarkdown, targetLanguage);
  }

  /**
   * Apply citation-related post-processing to a complete report
   * (body + references section already concatenated).
   *
   * Use this when references are appended AFTER postProcessFinalReport
   * (e.g. in synthesizeReport where references are built separately).
   *
   * Steps: mergeAdjacentMathBlocks (anchorReferences + linkifyCitations disabled —
   * ReactMarkdown has no rehypeRaw, HTML <a> renders as literal text)
   */
  finalizeReportWithCitations(content: string): string {
    return mergeAdjacentMathBlocks(content);
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
  /**
   * Returns true if the figure reference URL is a garbage/non-chart image
   * (QR codes, logos, favicons, app icons scraped from web pages).
   * These external reference images are unreliable and should be suppressed.
   */
  private isGarbageFigureUrl(url: string | undefined): boolean {
    if (!url) return true;
    const lower = url.toLowerCase();
    // QR code and app-code images (common on Chinese tech sites)
    if (lower.includes("appcode") || lower.includes("aicode")) return true;
    if (
      lower.includes("qrcode") ||
      lower.includes("qr_code") ||
      lower.includes("qr-code")
    )
      return true;
    // Favicons, logos, and icon assets
    if (lower.includes("favicon")) return true;
    if (
      /(?:logo|icon|sprite|badge|avatar|banner|ads?)[-_]?\w*\.(?:png|jpg|gif|svg|webp)/i.test(
        lower,
      )
    )
      return true;
    // Stock photo and placeholder image domains (aligned with FigureExtractorService)
    const garbageDomains = [
      "unsplash.com",
      "pexels.com",
      "shutterstock.com",
      "istockphoto.com",
      "gettyimages.com",
      "placeholder.com",
      "via.placeholder",
      "placeholdit.imgix",
      "placehold.co",
    ];
    if (garbageDomains.some((d) => lower.includes(d))) return true;
    // Tracking pixels and very small images (1x1, 2x2)
    if (/[?&](?:w|width|h|height)=[12]\b/.test(url)) return true;
    // Data URIs (bloated, not real chart images)
    if (lower.startsWith("data:")) return true;
    return false;
  }

  private resolveChartPlaceholders(
    content: string,
    dimIndex: number,
    figureReferences?: FigureReference[],
    _generatedCharts?: GeneratedChart[],
  ): string {
    let result = content;
    const dimPrefix = `d${dimIndex}-`;

    // 1. Convert <!-- figure:N:M --> placeholders to <!-- chart:chartId -->
    // Filter out garbage figure URLs (QR codes, logos, icons) before resolving
    const validFigureReferences = figureReferences?.filter(
      (r) => !this.isGarbageFigureUrl(r.imageUrl),
    );

    if (validFigureReferences && validFigureReferences.length > 0) {
      const existingPlaceholders = (
        result.match(/<!--\s*figure:\d+:\d+\s*-->/g) ?? []
      ).length;

      if (existingPlaceholders > 0) {
        // Normal path: AI wrote <!-- figure:N:M --> placeholders — resolve them
        result = result.replace(
          /<!--\s*figure:(\d+):(\d+)\s*-->/g,
          (_match, evidenceIdx, figIdx) => {
            const ref = validFigureReferences.find(
              (r) =>
                r.evidenceCitationIndex === Number(evidenceIdx) &&
                r.figureIndex === Number(figIdx),
            );
            return ref ? `<!-- chart:${dimPrefix}${ref.id} -->` : _match;
          },
        );
      } else {
        // Fallback path: AI did NOT write any <!-- figure:N:M --> placeholders.
        // Inject <!-- chart:ID --> directly into the content based on the
        // position hints stored in each figureReference.position ("after_paragraph_N").
        this.logger.debug(
          `[resolveChartPlaceholders] dim${dimIndex}: no figure placeholders found in content, ` +
            `injecting ${validFigureReferences.length} chart(s) by position hint`,
        );
        result = this.injectChartsByPosition(
          result,
          validFigureReferences,
          dimPrefix,
        );
      }
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
   * Injects <!-- chart:ID --> placeholders into content based on position hints.
   *
   * The `position` field from figureReferences follows the pattern "after_paragraph_N"
   * (1-based). When no explicit position is given, figures are distributed evenly
   * across the content paragraphs.
   *
   * A "paragraph boundary" is defined as the end of a non-empty line that is
   * followed by a blank line (standard Markdown paragraph break). Headings, list
   * items, blockquote lines, and table rows are also treated as valid insertion
   * points to avoid injecting mid-block.
   */
  private injectChartsByPosition(
    content: string,
    refs: FigureReference[],
    dimPrefix: string,
  ): string {
    // Split into lines so we can find paragraph boundaries
    const lines = content.split("\n");

    // Identify paragraph-end line indices: a line that is non-empty AND is
    // followed by a blank line (or is the last line). Headings, table
    // separator rows, and code fence lines are excluded as insertion points
    // because injecting after them breaks structure.
    const insertionPoints: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      // Skip blank lines themselves
      if (!trimmed) continue;
      // Skip code fence boundaries
      if (trimmed.startsWith("```")) continue;
      // Skip table separator rows (---|--- patterns)
      if (/^[\|\s\-:]+$/.test(trimmed) && trimmed.includes("-")) continue;
      // Line is a valid insertion point if the next line is blank or it is the last line
      const nextLine = lines[i + 1];
      if (nextLine === undefined || nextLine.trim() === "") {
        insertionPoints.push(i);
      }
    }

    if (insertionPoints.length === 0) {
      // Edge case: no paragraph breaks found — append all charts at the end
      const chartTags = refs
        .map((r) => `<!-- chart:${dimPrefix}${r.id} -->`)
        .join("\n\n");
      return content + "\n\n" + chartTags;
    }

    // Build a map: insertion line index → chart tags to inject after it
    const injectionMap = new Map<number, string[]>();

    for (const ref of refs) {
      // Parse "after_paragraph_N" (1-based). Fall back to evenly distributed index.
      let paragraphHint: number | null = null;
      const match = /after_paragraph_(\d+)/i.exec(ref.position ?? "");
      if (match) {
        paragraphHint = parseInt(match[1], 10); // 1-based paragraph number
      }

      let targetLineIdx: number;
      if (
        paragraphHint !== null &&
        paragraphHint >= 1 &&
        paragraphHint <= insertionPoints.length
      ) {
        // Map 1-based paragraph hint to the corresponding insertion point
        targetLineIdx = insertionPoints[paragraphHint - 1];
      } else {
        // No valid hint: spread figures evenly across insertion points
        const refIdx = refs.indexOf(ref);
        const step = Math.max(
          1,
          Math.floor(insertionPoints.length / refs.length),
        );
        const pointIdx = Math.min(
          (refIdx + 1) * step - 1,
          insertionPoints.length - 1,
        );
        targetLineIdx = insertionPoints[pointIdx];
      }

      const tag = `<!-- chart:${dimPrefix}${ref.id} -->`;
      const existing = injectionMap.get(targetLineIdx) ?? [];
      existing.push(tag);
      injectionMap.set(targetLineIdx, existing);
    }

    // Rebuild content by inserting chart tags after their target lines
    const output: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      output.push(lines[i]);
      if (injectionMap.has(i)) {
        const tags = injectionMap.get(i)!;
        // Blank line before and after each chart tag for Markdown separation
        output.push("");
        output.push(...tags.flatMap((t) => [t, ""]));
      }
    }

    return output.join("\n");
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
      // Title is the hyperlink; domain and raw URL are hidden
      // Escape brackets in title to avoid breaking markdown link syntax
      const safeTitle = e.title.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
      return `[${e.index}] [${safeTitle}](${e.url}). ${accessedLabel}: ${accessDate}`;
    });

    let section = `\n\n---\n\n# ${referencesLabel}\n\n${refLines.join("\n\n")}`;

    // Apply citation index remapping to the references section itself
    if (indexMapping.size > 0) {
      section = remapCitationIndices(section, indexMapping);
    }

    // NOTE: anchorReferences disabled — produces HTML <a id> that ReactMarkdown
    // renders as literal text (no rehypeRaw). stripHtmlCitationLinks cleans up.
    // section = anchorReferences(section);

    return section;
  }
}
