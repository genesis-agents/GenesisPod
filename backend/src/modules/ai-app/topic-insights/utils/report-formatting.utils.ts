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
        .replace(/^(?!\d{4}[年\-–—/至])[\d.]+\s*/, "")
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
 *
 * Bold markers on hierarchical numbered list items (e.g. "1.2.3. **Title**")
 * are structural and are never stripped regardless of the count.
 */
export function limitBoldFormatting(
  content: string,
  maxPerSection: number = 3,
): string {
  const sections = content.split(/(?=^###\s)/m);

  return sections
    .map((section) => {
      let boldCount = 0;
      return section.replace(/\*\*([^*]+)\*\*/g, (match, inner, offset) => {
        // Preserve bold on hierarchical numbered list items (e.g. "1.2.3. **Title**")
        const beforeMatch = section.substring(
          Math.max(0, section.lastIndexOf("\n", offset) + 1),
          offset,
        );
        if (/^\d+(\.\d+)*\.\s*$/.test(beforeMatch.trim())) {
          return match;
        }
        boldCount++;
        if (boldCount > maxPerSection) {
          return inner;
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
  result = result.replace(/\\textbf\{([^}]+)\}/g, "**$1**");
  result = result.replace(/\\textit\{([^}]+)\}/g, "*$1*");
  result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1/$2");
  result = result.replace(/\\sqrt\{([^}]+)\}/g, "√$1");
  result = result.replace(/\\mathbb\{R\}/g, "ℝ");
  result = result.replace(/\\mathbb\{N\}/g, "ℕ");
  result = result.replace(/\\mathbb\{Z\}/g, "ℤ");
  // Common Greek letters not in cleanLatexContent
  result = result.replace(/\\alpha(?![a-zA-Z])/g, "α");
  result = result.replace(/\\beta(?![a-zA-Z])/g, "β");
  result = result.replace(/\\gamma(?![a-zA-Z])/g, "γ");
  result = result.replace(/\\delta(?![a-zA-Z])/g, "δ");
  result = result.replace(/\\epsilon(?![a-zA-Z])/g, "ε");
  result = result.replace(/\\lambda(?![a-zA-Z])/g, "λ");
  result = result.replace(/\\mu(?![a-zA-Z])/g, "μ");
  result = result.replace(/\\sigma(?![a-zA-Z])/g, "σ");
  result = result.replace(/\\pi(?![a-zA-Z])/g, "π");
  result = result.replace(/\\omega(?![a-zA-Z])/g, "ω");
  result = result.replace(/\\times(?![a-zA-Z])/g, "×");
  result = result.replace(/\\neq(?![a-zA-Z])/g, "≠");
  result = result.replace(/\\pm(?![a-zA-Z])/g, "±");
  // Dollar-sign delimited inline math: $formula$ → cleaned content
  result = result.replace(/\$([^$]{2,80})\$/g, (_match, inner: string) => {
    if (!/[\\^_]/.test(inner)) return inner; // Not LaTeX, keep as-is
    return cleanLatexContent(inner);
  });

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
 * Strip LLM-leaked meta-notes, internal markers, and broken HTML escapes.
 *
 * Unified implementation shared by report-synthesis and report-generator.
 * Rules must be GENERIC — they must work for any report topic/language.
 */
export function stripLLMMetaNotes(content: string): string {
  return (
    content
      // ── 字数统计（各种变体） ──
      .replace(/（精简字数[^）]*）/g, "")
      .replace(/（原\d+[^）]*）/g, "")
      .replace(/（[约共]\d+字）/g, "")
      .replace(/（\d+字）/g, "")
      .replace(/[（(]字数[：:]?\s*[约共]?\d+[字词][)）]/g, "")
      .replace(/[（(]当前字数[：:]?\s*\d+[)）]/g, "")
      .replace(/\[当前字数[：:]\s*\d+\]/g, "")
      .replace(/\(字数[^)]{0,30}\)/g, "")
      .replace(/（字数[^）]{0,30}）/g, "")
      // English variants
      .replace(/\(\s*word\s+count[:\s]*\d+\s*\)/gi, "")
      .replace(/\(\s*approximately\s+\d+\s+words?\s*\)/gi, "")
      // ── 内部角色名泄露（Leader, Agent 等多 Agent 流程术语） ──
      .replace(/Leader\s*分配的/g, "")
      .replace(/(?:研究|分析)?Agent\s*(?:分配|指派|生成)的/g, "")
      // ── 内部术语泄露 ──
      .replace(/独立洞察[：:]/g, "")
      .replace(/需补充\d{4}\s*Q\d\s*企业报告验证/g, "")
      .replace(/(?:需|应)补充.*?(?:验证|数据|报告)/g, "")
      // ── 数据支撑总结块（内部标注） ──
      .replace(/^数据支撑总结[：:].+$/gm, "")
      // ── 教材/课程类源语言泄露 ──
      .replace(/从学习路线图可见[，,]?/g, "")
      .replace(/(?:多模态)?课程常将/g, "研究表明")
      .replace(/数据与课程实践表明/g, "数据与实践表明")
      .replace(/在安全与对齐学习路线中/g, "在安全与对齐研究中")
      // ── LLM 元分析标记（**分析判断：** 等）──
      // These appear as raw markdown in rendered HTML and should be stripped.
      // Remove the bold marker and label, keep the analysis text.
      .replace(/\*{2}分析判断[：:]\*{2}\s*/g, "")
      .replace(/\*{2}总结[：:]\*{2}\s*/g, "")
      .replace(/\*{2}小结[：:]\*{2}\s*/g, "")
      .replace(/\*{2}结论[：:]\*{2}\s*/g, "")
      .replace(/\*{2}综合分析[：:]\*{2}\s*/g, "")
      .replace(/\*{2}综合判断[：:]\*{2}\s*/g, "")
      .replace(/\*{2}综上所述[：:]\*{2}\s*/g, "")
      .replace(/\*{2}要点[：:]\*{2}\s*/g, "")
      // Also handle HTML <strong> wrapped variants (post markdown→HTML conversion)
      .replace(
        /<strong>(?:分析判断|总结|小结|结论|综合分析|综合判断|综上所述|要点)[：:]<\/strong>\s*/g,
        "",
      )
      // ── 内部交叉引用占位符 ──
      // LLM generates [前文], [上文], [前述] as cross-references that are never resolved
      .replace(/\[前文\]/g, "")
      .replace(/\[上文\]/g, "")
      .replace(/\[前述\]/g, "")
      .replace(/\[详见前文\]/g, "")
      .replace(/\[见前文\]/g, "")
      // ── 转义 HTML 标签修复 ──
      // LLM sometimes outputs <\span>, <\strong> etc. instead of </span>, </strong>
      .replace(/<\\\/?(span|strong|em|p|div|li|ul|ol|a|h[1-6])>/gi, (m) =>
        m.replace(/\\/g, ""),
      )
      // ── LLM 过渡短语冗余（高频模板句式） ──
      // Remove only when they appear as sentence starters followed by comma/colon
      .replace(
        /(?:^|\n)\s*(?:综合来看|总体来看|综上所述|值得注意的是|值得警惕的是|需要指出的是|不可忽视的是|毋庸置疑)[，,：:]\s*/g,
        (m) => (m.startsWith("\n") ? "\n" : ""),
      )
      // ── 清理多余空行 ──
      .replace(/\n{3,}/g, "\n\n")
  );
}

// ============ Reference Cleanup Utilities ============

/**
 * Domains known to be irrelevant to research reports.
 * Entries are matched against the reference domain field.
 */
const JUNK_REFERENCE_DOMAINS: ReadonlySet<string> = new Set([
  "dollskill.com",
  "shein.com",
  "temu.com",
  "aliexpress.com",
  "amazon.com",
  "ebay.com",
  "etsy.com",
  "wish.com",
  "taobao.com",
  "jd.com",
  "pinduoduo.com",
  "pinterest.com",
  "instagram.com",
  "tiktok.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "reddit.com",
  "youtube.com",
  "bilibili.com",
  "douyin.com",
  "weibo.com",
  "zhihu.com",
]);

/**
 * Filter out junk references whose domain matches known irrelevant sites.
 * Generic: works for any topic by checking against a domain blacklist.
 */
export function filterJunkReferences<
  T extends { domain?: string | null; url?: string },
>(references: T[]): T[] {
  return references.filter((ref) => {
    const domain = (
      ref.domain || extractDomainFromUrl(ref.url || "")
    )?.toLowerCase();
    if (!domain) return true;
    // Check exact match or subdomain match (e.g. "www.dollskill.com" matches "dollskill.com")
    for (const junk of JUNK_REFERENCE_DOMAINS) {
      if (domain === junk || domain.endsWith(`.${junk}`)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Deduplicate references by normalized URL.
 * When multiple references share the same URL, keep only the first occurrence.
 * Returns the filtered references and a mapping from old indices to new indices.
 */
export function deduplicateReferencesByUrl<
  T extends { url?: string; index?: number },
>(references: T[]): { deduplicated: T[]; indexMapping: Map<number, number> } {
  const seen = new Map<string, number>(); // normalizedUrl → first ref's NEW index
  const deduplicated: T[] = [];
  const indexMapping = new Map<number, number>(); // oldIndex → newIndex

  for (const ref of references) {
    const normalizedUrl = normalizeUrl(ref.url || "");
    const existingNewIndex = seen.get(normalizedUrl);
    if (existingNewIndex !== undefined) {
      // Map old index to the existing reference's new index
      if (ref.index !== undefined) {
        indexMapping.set(ref.index, existingNewIndex);
      }
    } else {
      const newIndex = deduplicated.length + 1;
      seen.set(normalizedUrl, newIndex);
      if (ref.index !== undefined) {
        indexMapping.set(ref.index, newIndex);
      }
      deduplicated.push({ ...ref, index: newIndex });
    }
  }

  return { deduplicated, indexMapping };
}

/**
 * Upgrade HTTP URLs to HTTPS where possible.
 * Skips localhost and IP addresses.
 */
export function upgradeHttpToHttps<T extends { url?: string }>(
  references: T[],
): T[] {
  return references.map((ref) => {
    if (!ref.url) return ref;
    const url = ref.url.trim();
    // Only upgrade http:// to https:// (skip localhost/IP)
    if (
      url.startsWith("http://") &&
      !url.startsWith("http://localhost") &&
      !url.startsWith("http://127.") &&
      !url.startsWith("http://192.168.") &&
      !url.startsWith("http://10.")
    ) {
      return { ...ref, url: url.replace(/^http:\/\//, "https://") };
    }
    return ref;
  });
}

/**
 * Decode HTML entities in URLs (e.g. &amp; → &).
 */
export function decodeUrlEntities<T extends { url?: string }>(
  references: T[],
): T[] {
  return references.map((ref) => {
    if (!ref.url) return ref;
    const decoded = ref.url
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    return decoded !== ref.url ? { ...ref, url: decoded } : ref;
  });
}

/**
 * Remap citation indices in report body text after reference deduplication.
 */
export function remapCitationIndices(
  content: string,
  indexMapping: Map<number, number>,
): string {
  if (indexMapping.size === 0) return content;
  return content.replace(/\[(\d+)\]/g, (match, numStr) => {
    const oldIndex = Number(numStr);
    const newIndex = indexMapping.get(oldIndex);
    return newIndex !== undefined ? `[${newIndex}]` : match;
  });
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.replace(/&amp;/g, "&"));
    // Normalize: lowercase host, remove trailing slash, remove www prefix
    let normalized = `${u.protocol}//${u.host.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
    if (u.search) normalized += u.search;
    return normalized.toLowerCase();
  } catch {
    return url
      .toLowerCase()
      .replace(/\/+$/, "")
      .replace(/^https?:\/\/www\./, "");
  }
}

function extractDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    const match = url.match(/\/\/([^/?#]+)/);
    return match ? match[1].replace(/^www\./, "") : "";
  }
}

/**
 * Repair broken ordered list continuity in markdown.
 *
 * LLMs often restart list numbering after interruptions (paragraphs, blockquotes,
 * code blocks between list items). This function re-numbers ordered list items
 * so they form continuous sequences within each section.
 *
 * Example:
 *   1. First item
 *   Some paragraph text
 *   1. Second item (should be 2.)
 *   1. Third item  (should be 3.)
 *
 * Resets counter at each ### heading boundary.
 */
export function repairOrderedListContinuity(content: string): string {
  const lines = content.split("\n");
  let lastListNum = 0; // last seen list item number
  let gapLines = 0; // non-list lines since last list item

  return lines
    .map((line) => {
      // Reset at heading boundaries
      if (/^#{2,4}\s+/.test(line)) {
        lastListNum = 0;
        gapLines = 0;
        return line;
      }

      // Match simple ordered list item: "N. text" (not hierarchical "N.M.K. text")
      const listMatch = line.match(/^(\s*)(\d+)\.\s+(?!\d+\.)(.+)/);
      if (listMatch) {
        const currentNum = Number(listMatch[2]);

        // Only fix if this looks like a restart (current ≤ last) within a
        // recent list context (gap < 3 non-empty lines). This avoids
        // merging two intentionally separate lists.
        if (lastListNum > 0 && currentNum <= lastListNum && gapLines < 3) {
          lastListNum++;
          gapLines = 0;
          return `${listMatch[1]}${lastListNum}. ${listMatch[3]}`;
        }

        // Otherwise accept the number as-is (new list or correct continuation)
        lastListNum = currentNum;
        gapLines = 0;
        return line;
      }

      // Track gap between list items (only non-empty lines count)
      if (line.trim() !== "" && lastListNum > 0) {
        gapLines++;
      }

      // Large gap or structural break → reset list tracking
      if (gapLines >= 3 || /^\s*[-*]\s/.test(line) || /^>\s/.test(line)) {
        lastListNum = 0;
        gapLines = 0;
      }

      return line;
    })
    .join("\n");
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
