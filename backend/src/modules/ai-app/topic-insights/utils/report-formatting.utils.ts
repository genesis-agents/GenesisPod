/**
 * Shared report formatting utilities.
 *
 * Extracted from report-synthesis.service.ts and report-generator.service.ts
 * to eliminate code duplication (both files had identical private methods).
 */

/**
 * Heading level safety net: downgrades # and ## (which AI should not use
 * in detailedContent) to ###. Leaves ### and #### untouched.
 *
 * Paired with prompt instruction HEADING_HIERARCHY that tells AI:
 * "Use ### and #### only. # and ## are reserved for the report framework."
 *
 * Replaces the old `+2 elevation` logic that collapsed all headings.
 */
export function sanitizeHeadingLevels(content: string): string {
  return content.replace(/^(#{1,2})\s+/gm, () => "### ");
  // ### and #### are preserved as-is for numberSubHeadings to process.
  // ##### and ###### should not appear (prompt forbids them); if they do, they pass through.
}

/**
 * Give dimension sub-headings hierarchical numbering.
 *
 * ### Title → ### N.M. Title   (from AI's ###)
 * #### Title → #### N.M.K. Title (from AI's ####)
 *
 * Strips existing numbering prefixes:
 * - Arabic: "1. ", "1.2. ", "1.2.3. "
 * - Chinese ordinal: "一、", "十二．"
 * - Parenthesized: "（一）", "（1）"
 */
export function numberSubHeadings(content: string, dimIndex: number): string {
  let h3Count = 0;
  let h4Count = 0;

  return content.replace(
    /^(#{3,4})\s+(.+)$/gm,
    (_match, hashes: string, title: string) => {
      // Strip existing numbering prefixes but preserve 4-digit years (e.g. "2026年")
      const cleanTitle = title
        .replace(/^(?!\d{4}[年-])[\d.]+\s*/, "")
        .replace(/^[一二三四五六七八九十百]+[、．.]\s*/, "")
        .replace(/^（[一二三四五六七八九十百\d]+）\s*/, "")
        .trim();

      if (hashes === "###") {
        h3Count++;
        h4Count = 0;
        return `### ${dimIndex}.${h3Count}. ${cleanTitle}`;
      }
      if (hashes === "####") {
        if (h3Count === 0) h3Count = 1; // implicit parent when h4 appears before any h3
        h4Count++;
        return `#### ${dimIndex}.${h3Count}.${h4Count}. ${cleanTitle}`;
      }
      return `${hashes} ${title}`;
    },
  );
}

/**
 * Renumber bold ordered list items within numbered ### sections
 * to follow hierarchical numbering.
 *
 * Under "### N.M. Title":
 *   "1. **Item**" → "N.M.1. **Item**"
 *   "2. **Item**" → "N.M.2. **Item**"
 *
 * Only affects list items starting with bold text (structural sub-items).
 * Regular list items (no bold) are left unchanged.
 *
 * Must be called AFTER numberSubHeadings (which creates the N.M. prefix).
 */
export function hierarchicalNumberBoldListItems(content: string): string {
  const lines = content.split("\n");
  let currentPrefix = ""; // e.g., "5.14"
  let listCounter = 0;

  return lines
    .map((line) => {
      // Track ### N.M. headings (output of numberSubHeadings)
      const h3Match = line.match(/^###\s+(\d+\.\d+)\.\s+/);
      if (h3Match) {
        currentPrefix = h3Match[1];
        listCounter = 0;
        return line;
      }

      // Track #### headings — they already have proper N.M.K. numbering
      if (/^#{4,}\s+/.test(line)) {
        listCounter = 0;
        return line;
      }

      // Match "N. **bold text**" pattern — structural sub-item
      if (currentPrefix && /^\d+\.\s+\*\*/.test(line)) {
        listCounter++;
        return line.replace(/^\d+\./, `${currentPrefix}.${listCounter}.`);
      }

      return line;
    })
    .join("\n");
}

/**
 * Cross-dimension paragraph deduplication.
 * Paragraphs sharing the first DEDUP_KEY_LENGTH characters are removed (keep first occurrence).
 * Headings, comments, list items, and blockquotes are exempt.
 */
export function deduplicateParagraphs(
  content: string,
  globalSeenParagraphs: Set<string>,
): string {
  const DEDUP_MIN_LENGTH = 60;
  const DEDUP_KEY_LENGTH = 120;
  const paragraphs = content.split("\n\n");

  return paragraphs
    .filter((p) => {
      const trimmed = p.trim();
      if (trimmed.length < DEDUP_MIN_LENGTH) return true;
      // Exempt headings, comments, list items, blockquotes
      if (/^(#|<!--|[-*>|]|\d+\.)/.test(trimmed)) return true;
      const key = trimmed.substring(0, DEDUP_KEY_LENGTH);
      if (globalSeenParagraphs.has(key)) return false;
      globalSeenParagraphs.add(key);
      return true;
    })
    .join("\n\n");
}

/**
 * Deduplicate headings: if two headings have the same normalized text, keep only the first.
 * AI sometimes generates "### 1. Title" followed by "### Title".
 */
export function deduplicateHeadings(content: string): string {
  const lines = content.split("\n");
  const seenHeadings = new Set<string>();

  return lines
    .filter((line) => {
      const m = line.match(/^#{3,6}\s+(.+)/);
      if (!m) return true;
      const normalized = m[1]
        .replace(/^(?:\d+\.)+\s*/, "")
        .replace(/^[一二三四五六七八九十百]+[、．.]\s*/, "")
        .trim();
      if (seenHeadings.has(normalized)) return false;
      seenHeadings.add(normalized);
      return true;
    })
    .join("\n");
}

// ============ v4: Language Consistency Detection ============

/**
 * Foreign language block detected in content
 */
export interface ForeignLanguageBlock {
  /** Start character offset */
  start: number;
  /** End character offset */
  end: number;
  /** The foreign text */
  text: string;
}

/**
 * Result of language consistency check
 */
export interface LanguageConsistencyResult {
  /** Ratio of foreign language content (0-1) */
  foreignRatio: number;
  /** Foreign language blocks found */
  blocks: ForeignLanguageBlock[];
  /** Whether the content passes the threshold */
  passed: boolean;
}

/**
 * Detect foreign language blocks in content relative to target language.
 *
 * For Chinese target: detects continuous Latin-script passages (>= 80 chars)
 * For English target: detects continuous CJK passages (>= 40 chars)
 *
 * Excludes:
 * - Code blocks (```...```)
 * - Inline code (`...`)
 * - URLs (http://, https://)
 * - Citation markers ([1], [2])
 * - Chart/figure comments (<!-- ... -->)
 * - Known technical terms and proper nouns (short runs)
 *
 * @param content The report content (Markdown)
 * @param targetLanguage Target language code ("zh" or "en")
 * @param threshold Maximum allowed foreign ratio (default 0.05 = 5%)
 */
export function detectForeignLanguageBlocks(
  content: string,
  targetLanguage: string = "zh",
  threshold: number = 0.05,
): LanguageConsistencyResult {
  // Strip code blocks and inline code first
  const stripped = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/https?:\/\/[^\s)]+/g, "")
    .replace(/\[[\d,\s]+\]/g, ""); // citation markers like [1], [1,2]

  const blocks: ForeignLanguageBlock[] = [];
  const totalChars = stripped.replace(/\s/g, "").length;

  if (totalChars === 0) {
    return { foreignRatio: 0, blocks: [], passed: true };
  }

  if (
    targetLanguage === "zh" ||
    targetLanguage === "zh-CN" ||
    targetLanguage === "zh-TW"
  ) {
    // For Chinese target: find long Latin-script runs
    // Match continuous ASCII letter sequences (with spaces/punctuation) >= 80 chars
    const latinPattern = /[A-Za-z][A-Za-z\s,.:;'"!?()\-]{79,}/g;
    let match: RegExpExecArray | null;
    while ((match = latinPattern.exec(stripped)) !== null) {
      const text = match[0].trim();
      // Skip if it's mostly short technical terms (average word length < 10 and < 5 words)
      const words = text.split(/\s+/);
      if (words.length < 5) continue;

      blocks.push({
        start: match.index,
        end: match.index + match[0].length,
        text: text.length > 200 ? text.substring(0, 200) + "..." : text,
      });
    }
  } else if (targetLanguage === "en") {
    // For English target: find long CJK runs
    const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf]{40,}/g;
    let match: RegExpExecArray | null;
    while ((match = cjkPattern.exec(stripped)) !== null) {
      blocks.push({
        start: match.index,
        end: match.index + match[0].length,
        text:
          match[0].length > 200 ? match[0].substring(0, 200) + "..." : match[0],
      });
    }
  }

  const foreignChars = blocks.reduce((sum, b) => sum + (b.end - b.start), 0);
  const foreignRatio = foreignChars / totalChars;

  return {
    foreignRatio,
    blocks,
    passed: foreignRatio <= threshold,
  };
}

/**
 * Remove excessive bold formatting.
 * If bold count exceeds maxPerSection per section, strip extra bolds.
 */
export function limitBoldFormatting(
  content: string,
  maxPerSection: number = 3,
): string {
  // Split by ### headings (sections)
  const sections = content.split(/(?=^###\s)/m);

  return sections
    .map((section) => {
      let boldCount = 0;
      return section.replace(/\*\*([^*]+)\*\*/g, (match, inner) => {
        boldCount++;
        if (boldCount > maxPerSection) {
          return inner; // Strip bold, keep text
        }
        return match;
      });
    })
    .join("");
}

/**
 * Remove blockquote lines that exceed the limit.
 * Keeps the first `maxCount` blockquotes, converts excess to regular paragraphs.
 */
export function limitBlockquotes(
  content: string,
  maxCount: number = 15,
): string {
  let count = 0;
  return content.replace(/^>\s*(.+)$/gm, (match, inner) => {
    count++;
    if (count > maxCount) {
      return inner; // Convert to regular paragraph
    }
    return match;
  });
}

/**
 * Remove all horizontal rules (---, ***) from content.
 * These are unprofessional in formal reports.
 */
export function removeHorizontalRules(content: string): string {
  return content.replace(/^\s*[-*]{3,}\s*$/gm, "");
}

/**
 * Convert raw LaTeX notation in markdown to readable text.
 *
 * LLMs sometimes output LaTeX math like `(O(n^2))` or `[\text{Attention}(...)]`
 * which renders as raw text in non-LaTeX-aware viewers.
 *
 * Strategy: simplify common patterns to readable Unicode/plain text.
 * For complex formulas, strip the LaTeX wrapper and keep the raw content.
 */
export function simplifyLatexNotation(content: string): string {
  let result = content;

  // Display math blocks: [formula] on its own line → strip brackets, keep content
  result = result.replace(
    /^\[\s*\n([\s\S]*?)\n\]\s*$/gm,
    (_match, inner: string) => {
      // Clean up LaTeX commands for readability
      return cleanLatexContent(inner);
    },
  );

  // Inline display math: [...] within a paragraph
  // Negative lookahead (?!\() prevents matching Markdown links [text](url)
  // Only process content that actually contains LaTeX-like syntax (backslashes, ^, _)
  result = result.replace(
    /\[([^\]]{10,})\](?!\()/g,
    (_match, inner: string) => {
      // Skip citation markers like [1], [236 等3项]
      if (/^\d/.test(inner.trim())) return _match;
      // Only clean if content contains LaTeX commands or math syntax
      if (!/[\\^_]/.test(inner)) return _match;
      return cleanLatexContent(inner);
    },
  );

  // Inline math: (formula) — only match LaTeX-like content with backslashes or ^/_
  result = result.replace(
    /\(([^)]*\\[^)]+)\)/g,
    (_match, inner: string) => `(${cleanLatexContent(inner)})`,
  );

  // Bare LaTeX commands outside of delimiters (e.g. \text{model}, \frac{a}{b})
  result = result.replace(/\\text\{([^}]+)\}/g, "$1");
  result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1/$2");
  result = result.replace(/\\sqrt\{([^}]+)\}/g, "√$1");
  result = result.replace(/\\mathbb\{R\}/g, "ℝ");

  return result;
}

function cleanLatexContent(latex: string): string {
  return (
    latex
      // \text{xxx} → xxx
      .replace(/\\text\{([^}]+)\}/g, "$1")
      // \mathbb{R} → ℝ
      .replace(/\\mathbb\{R\}/g, "ℝ")
      // \frac{a}{b} → a/b
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1/$2")
      // \sqrt{x} → √x
      .replace(/\\sqrt\{([^}]+)\}/g, "√$1")
      // \left( \right) → ( )
      .replace(/\\left\(/g, "(")
      .replace(/\\left\[/g, "[")
      .replace(/\\left\{/g, "{")
      .replace(/\\right\)/g, ")")
      .replace(/\\right]/g, "]")
      .replace(/\\right\}/g, "}")
      // \quad → space
      .replace(/\\quad/g, " ")
      // ^{n} → ^n, _{n} → _n (superscript/subscript)
      .replace(/\^\{([^}]+)\}/g, "^$1")
      .replace(/_\{([^}]+)\}/g, "_$1")
      // \top → ᵀ
      .replace(/\\top/g, "ᵀ")
      // \cdot → ·
      .replace(/\\cdot/g, "·")
      // \dots → ...
      .replace(/\\dots/g, "...")
      // \langle \rangle → < >
      .replace(/\\langle/g, "⟨")
      .replace(/\\rangle/g, "⟩")
      // \approx → ≈
      .replace(/\\approx/g, "≈")
      // \leq \geq → ≤ ≥
      .replace(/\\leq/g, "≤")
      .replace(/\\geq/g, "≥")
      // \infty → ∞ (must be before \in to avoid \in matching first)
      .replace(/\\infty/g, "∞")
      // \int → ∫ (must be before \in)
      .replace(/\\int(?![a-zA-Z])/g, "∫")
      // \in → ∈ (word boundary: not followed by letters)
      .replace(/\\in(?![a-zA-Z])/g, "∈")
      // \sum → Σ
      .replace(/\\sum/g, "Σ")
      // \leftarrow → ←
      .replace(/\\leftarrow/g, "←")
      // \eta → η, \tau → τ, \Phi → Φ
      .replace(/\\eta/g, "η")
      .replace(/\\tau/g, "τ")
      .replace(/\\Phi/g, "Φ")
      .replace(/\\phi/g, "φ")
      .replace(/\\nabla/g, "∇")
      .replace(/\\theta/g, "θ")
      // Remove remaining backslash commands
      .replace(/\\[a-zA-Z]+/g, "")
      // Clean up extra spaces and braces
      .replace(/\{([^}]*)\}/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/**
 * Strip raw markdown bold syntax (**text**) that wasn't converted to HTML.
 * Some LLM outputs contain mixed markdown + plain text where **bold** markers
 * leak through to the final rendered output.
 */
export function stripRawMarkdownInContent(content: string): string {
  // Only strip ** markers, keep the text inside
  return content.replace(/\*\*([^*]+)\*\*/g, "$1");
}

/**
 * Minimum data points required per chart type.
 */
export function getMinDataPoints(chartType: string): number {
  switch (chartType) {
    case "line":
    case "area":
      return 5;
    case "bar":
    case "pie":
      return 3;
    case "radar":
      return 10;
    default:
      return 3;
  }
}
