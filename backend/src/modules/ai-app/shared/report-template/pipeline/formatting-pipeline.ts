/**
 * Unified Formatting Pipeline
 *
 * Single entry point for all dimension content formatting. Replaces the
 * previous two-pipeline approach (preprocessDimensionContent + processDimensionContent).
 *
 * Usage:
 *   - Storage time: `formatDimensionContent(content, { dimIndex })`
 *   - Assembly time: `formatDimensionContent(content, { dimIndex, globalSeenParagraphs, ... })`
 *   - Legacy:       `preprocessDimensionContent(content, dimIndex)`
 */

import {
  normalizeChapterHighlights,
  convertChineseNumeralHeadings,
  detectAndPromoteHeadings,
  sanitizeHeadingLevels,
  deduplicateHeadings,
  deduplicateHeadingEcho,
  collapsePseudoCodeHeadings,
  numberSubHeadings,
  hierarchicalNumberBoldListItems,
  convertDescriptiveListsToBullets,
  convertPlainNumberedListsUnderH3ToBullets,
  stripLLMMetaNotes,
  stripLeakedHtmlComments,
  stripInternalFigureNotation,
  normalizeArrowNotation,
  deduplicateAdjacentCitations,
  deduplicateParagraphs,
  truncateAtSentenceBoundary,
  repairTruncatedBlockquoteBullets,
  decodeHtmlEntities,
  fixDoubleSourceLabels,
  fixDuplicateHeadings,
  removeEmptySections,
  repairBrokenListItems,
  clearBrokenMediaAndEmptyBlocks,
  repairMarkdownTables,
  extractTableFootnotes,
  splitWallOfText,
  wrapPseudoCodeBlocks,
  collapseExcessSubHeadings,
  removeEmptyHeadings,
  truncateLongListItems,
  separateTrappedConclusions,
  bulletifyBlockquoteItems,
  splitEnumerationToList,
  cleanupEmptyBullets,
  boldSummaryPrefixes,
  removeHorizontalRules,
  repairBrokenBoldMarkers,
  stripFigureComments,
  wrapBareInlineLatex,
  escapeLatexPipeInTables,
  normalizeInlineDoubleDollar,
  normalizeChapterToSection,
} from "./report-formatting.utils";

// ============ Context Interface ============

/**
 * Context for the unified formatting pipeline.
 *
 * All fields are optional — when omitted, context-dependent rules are skipped.
 * This allows the same pipeline to serve both storage-time (minimal context)
 * and assembly-time (full context) use cases.
 */
export interface FormattingContext {
  /** Dimension index (0-based). When provided, enables heading numbering. */
  dimIndex?: number;
  /** Shared set for cross-dimension paragraph dedup. */
  globalSeenParagraphs?: Set<string>;
  /** Per-dimension character limit. When exceeded, truncation is applied. */
  maxDimensionChars?: number;
  /** Dimension name for logging. */
  dimensionName?: string;
  /**
   * Callback to resolve chart placeholders (<!-- figure:N:M --> → chart HTML).
   * Provided by ReportAssemblerService which owns the chart injection logic.
   */
  resolveChartPlaceholders?: (content: string) => string;
  /** Logger for warnings (e.g., truncation). */
  logger?: { warn: (msg: string) => void };
}

// ============ Unified Pipeline ============

/**
 * Unified dimension content formatting pipeline.
 *
 * Replaces the previous two-pipeline approach:
 *   - `preprocessDimensionContent()` (storage-time, no context)
 *   - `processDimensionContent()` (assembly-time, with context)
 *
 * Now a single function with optional context. Rules that need context
 * (dimIndex, globalSeenParagraphs, etc.) are skipped when context is absent.
 *
 * @param content  Raw dimension content (markdown)
 * @param ctx      Optional formatting context
 */
export function formatDimensionContent(
  content: string,
  ctx: FormattingContext = {},
): string {
  let processed = content;

  // ── Phase 1: Structure normalization ──────────────────────────────────
  processed = normalizeChapterHighlights(processed);
  processed = removeHallucinatedImages(processed);
  processed = convertChineseNumeralHeadings(processed);
  processed = detectAndPromoteHeadings(processed);
  processed = sanitizeHeadingLevels(processed);
  processed = deduplicateHeadings(processed);
  processed = deduplicateHeadingEcho(processed);
  processed = collapsePseudoCodeHeadings(processed);

  // ── Phase 2: Context-dependent numbering (requires dimIndex) ─────────
  if (ctx.dimIndex !== undefined) {
    processed = numberSubHeadings(processed, ctx.dimIndex + 1);
    processed = hierarchicalNumberBoldListItems(processed);
  }

  // ── Phase 3: Content cleanup ─────────────────────────────────────────
  processed = normalizeChapterToSection(processed);
  processed = convertDescriptiveListsToBullets(processed);
  processed = convertPlainNumberedListsUnderH3ToBullets(processed);
  processed = stripLLMMetaNotes(processed);
  processed = stripLeakedHtmlComments(processed);
  processed = stripInternalFigureNotation(processed);
  processed = normalizeArrowNotation(processed);
  processed = deduplicateAdjacentCitations(processed);

  // ── Phase 4: Context-dependent operations ────────────────────────────
  if (ctx.globalSeenParagraphs) {
    processed = deduplicateParagraphs(processed, ctx.globalSeenParagraphs);
  }
  if (ctx.maxDimensionChars && processed.length > ctx.maxDimensionChars) {
    ctx.logger?.warn(
      `[formatDimensionContent] Dimension "${ctx.dimensionName ?? "unknown"}" content too long (${processed.length} chars), truncating to ${ctx.maxDimensionChars}`,
    );
    processed = truncateAtSentenceBoundary(processed, ctx.maxDimensionChars);
  }
  if (ctx.resolveChartPlaceholders) {
    processed = ctx.resolveChartPlaceholders(processed);
  }

  // ── Phase 5: Formatting repair ───────────────────────────────────────
  processed = repairTruncatedBlockquoteBullets(processed);
  processed = decodeHtmlEntities(processed);
  processed = fixDoubleSourceLabels(processed);
  processed = fixDuplicateHeadings(processed);
  processed = removeEmptySections(processed);
  processed = repairBrokenListItems(processed);
  processed = clearBrokenMediaAndEmptyBlocks(processed);
  processed = repairMarkdownTables(processed);
  processed = normalizeTableDataRows(processed);
  processed = extractTableFootnotes(processed);
  processed = splitWallOfText(processed);
  processed = wrapPseudoCodeBlocks(processed);
  processed = collapseExcessSubHeadings(processed, 8);
  processed = removeEmptyHeadings(processed);
  processed = truncateLongListItems(processed);
  processed = separateTrappedConclusions(processed);
  processed = bulletifyBlockquoteItems(processed);
  processed = splitEnumerationToList(processed);
  processed = cleanupEmptyBullets(processed);
  processed = boldSummaryPrefixes(processed);
  processed = removeHorizontalRules(processed);
  processed = repairBrokenBoldMarkers(processed);
  processed = stripFigureComments(processed);
  // Note: stripOrphanedChartComments is NOT called here — chart comments
  // (<!-- chart:xxx -->) are valid markers used by the frontend to position
  // figures. They are only stripped in the frontend renderer (chapter view)
  // when no charts data is available for a given chapter.
  processed = escapeLatexPipeInTables(processed);
  processed = normalizeInlineDoubleDollar(processed);
  processed = wrapBareInlineLatex(processed);
  processed = fixUnbalancedLatexDelimiters(processed);
  processed = removeOrphanedFigureReferences(processed);

  // ── Phase 6: Final cleanup ───────────────────────────────────────────
  processed = processed.replace(/\n{3,}/g, "\n\n");

  return processed;
}

// ============ Legacy Wrapper ============

/**
 * @deprecated Use `formatDimensionContent()` instead.
 *
 * Legacy wrapper that delegates to the unified pipeline without context.
 * Kept for backward compatibility with existing callsites.
 *
 * For new code, prefer `formatDimensionContent(content, { dimIndex })` to
 * get heading numbering and other context-dependent rules.
 */
export function preprocessDimensionContent(
  content: string,
  dimIndex?: number,
): string {
  return formatDimensionContent(
    content,
    dimIndex !== undefined ? { dimIndex } : {},
  );
}

// ============ New Formatting Rules ============

/**
 * Remove hallucinated markdown images (data URIs, placeholder domains, broken paths).
 */
function removeHallucinatedImages(content: string): string {
  return content.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, _alt: string, url: string) => {
      const lower = url.toLowerCase();
      if (lower.startsWith("data:")) return "";
      if (
        lower.includes("placeholder.com") ||
        lower.includes("example.com") ||
        lower.includes("via.placeholder")
      )
        return "";
      if (lower.includes("image-not-found") || lower.includes("no-image"))
        return "";
      if (!lower.startsWith("http") && !lower.startsWith("/")) return "";
      return _match;
    },
  );
}

/**
 * Normalize table data rows to match the column count of the separator row.
 *
 * After `repairMarkdownTables` ensures a valid separator, this function
 * fixes data rows that have too few or too many columns:
 *   - Short rows: pad with empty cells
 *   - Long rows: truncate excess columns
 */
export function normalizeTableDataRows(content: string): string {
  return content.replace(
    /((?:^\|[^\n]+\|\s*\n){3,})/gm,
    (tableBlock: string) => {
      const lines = tableBlock.trimEnd().split("\n");
      if (lines.length < 3) return tableBlock;

      // Find separator row to determine expected column count
      const isSeparator = (line: string) =>
        /^\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(line.trim());

      let sepIndex = -1;
      for (let i = 0; i < Math.min(lines.length, 3); i++) {
        if (isSeparator(lines[i])) {
          sepIndex = i;
          break;
        }
      }
      if (sepIndex < 0) return tableBlock;

      const expectedCols = (lines[sepIndex].match(/\|/g) || []).length - 1;
      if (expectedCols < 1) return tableBlock;

      let changed = false;
      for (let i = 0; i < lines.length; i++) {
        if (i === sepIndex) continue;
        const line = lines[i].trim();
        if (!line.startsWith("|") || !line.endsWith("|")) continue;

        const cells = line.slice(1, -1).split("|");
        if (cells.length === expectedCols) continue;

        changed = true;
        if (cells.length < expectedCols) {
          // Pad with empty cells
          while (cells.length < expectedCols) cells.push(" ");
        } else {
          // Truncate excess columns
          cells.length = expectedCols;
        }
        lines[i] = "| " + cells.join(" | ") + " |";
      }

      return changed ? lines.join("\n") + "\n" : tableBlock;
    },
  );
}

/**
 * Remove orphaned figure/chart references from text.
 *
 * AI often generates "如图1所示" / "as shown in Figure 1" / "(见图3)" but
 * no corresponding figure data exists. These orphaned references confuse readers.
 *
 * Only removes parenthetical/inline references. Preserves heading-level captions
 * and lines that contain chart placeholder comments (<!-- chart:... -->).
 */
export function removeOrphanedFigureReferences(content: string): string {
  return (
    content
      // "如图N所示" / "如图 N 所示" → ""
      .replace(/如图\s*\d+\s*所示[，,。；]?/g, "")
      // "(见图N)" / "（见图N）" → ""
      .replace(/[（(]见图\s*\d+[）)][，,。；]?/g, "")
      // "图N展示了" / "图N显示" (subject-position Chinese) → ""
      .replace(
        /图\s*\d+\s*(?:展示了|显示了?|呈现了?|描述了?|说明了?|反映了?|列出了?)/g,
        "",
      )
      // "(Figure N)" / "(Fig. N)" → ""
      .replace(/\((?:Figure|Fig\.?)\s*\d+\)/gi, "")
      // "as shown in Figure N" / "as illustrated in Figure N" → ""
      .replace(
        /[,，]?\s*as\s+(?:shown|illustrated|depicted|presented|seen)\s+in\s+(?:Figure|Fig\.?)\s*\d+/gi,
        "",
      )
      // "Figure N shows/illustrates/presents..." (subject-position English) → ""
      .replace(
        /(?:Figure|Fig\.?)\s*\d+\s+(?:shows?|illustrates?|presents?|depicts?|displays?|demonstrates?|summarizes?)\s*/gi,
        "",
      )
      // Inline "see Figure N" at end of sentence → ""
      .replace(/[,，]\s*(?:see|参见)\s+(?:Figure|Fig\.?)\s*\d+/gi, "")
      // Clean up double spaces left by removals
      .replace(/ {2,}/g, " ")
  );
}

/**
 * Fix unbalanced LaTeX inline delimiters on a line.
 *
 * Detects lines with an odd number of `$` (excluding `$$` display math)
 * and attempts to close or remove the orphan delimiter.
 *
 * Strategy:
 *   - Opening `$` with LaTeX content after it → find closing boundary
 *     at Chinese char or Chinese punctuation (NOT whitespace — LaTeX
 *     expressions like `$\alpha = 0.95$` contain spaces).
 *   - Orphan `$` with no LaTeX content (no backslash) → remove it.
 */
export function fixUnbalancedLatexDelimiters(content: string): string {
  let inCodeBlock = false;
  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      // Track fenced code blocks (``` ... ```)
      if (trimmed.startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        return line;
      }
      // Skip everything inside code blocks, display math, headings, table rows
      if (
        inCodeBlock ||
        trimmed.startsWith("$$") ||
        /^#{1,6}\s/.test(trimmed) ||
        trimmed.startsWith("|")
      ) {
        return line;
      }

      // Count single $ (not $$)
      const withoutDisplay = line.replace(/\$\$/g, "\x00");
      const dollarCount = (withoutDisplay.match(/\$/g) || []).length;

      if (dollarCount % 2 !== 0) {
        const lastIdx = line.lastIndexOf("$");
        const before = line.slice(0, lastIdx);
        const after = line.slice(lastIdx + 1);

        // Determine if this is an opening $ (LaTeX content follows)
        const hasLatexAfter = /\\[a-zA-Z]/.test(after);
        const hasLatexBefore = /\\[a-zA-Z]/.test(before);

        if (hasLatexAfter) {
          // Opening $ without closing — find boundary at Chinese char/punctuation
          // Do NOT treat ASCII space as boundary (LaTeX has spaces: $\alpha = 0.95$)
          const endMatch = after.match(/[\u4e00-\u9fff，。；：、！？]/);
          if (endMatch?.index !== undefined && endMatch.index > 0) {
            return (
              line.slice(0, lastIdx + 1 + endMatch.index) +
              "$" +
              line.slice(lastIdx + 1 + endMatch.index)
            );
          }
          // No Chinese boundary — close at EOL
          return line + "$";
        }

        // Orphan $ with no LaTeX content after it — remove it
        // Also handle: content before has LaTeX (closing $ was misplaced)
        if (!hasLatexAfter && !hasLatexBefore) {
          // Stray $ with no LaTeX anywhere near it — just remove
          return before + after;
        }

        // LaTeX is before this $ but nothing after — likely a misplaced closing $
        // Remove it (the LaTeX was already closed or wrapped by wrapBareInlineLatex)
        return before + after;
      }

      return line;
    })
    .join("\n");
}
