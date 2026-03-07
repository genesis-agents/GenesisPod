/**
 * Content Defect Scanner
 *
 * Scans LLM raw output for formatting/structural defects WITHOUT fixing them.
 * Each counter function corresponds to a fix function in report-formatting.utils.ts.
 * This is the "measurement" side; the fix functions are the "treatment" side.
 */

export interface ContentDefectScan {
  /** Bare LaTeX not wrapped in $ delimiters */
  bareLatexCount: number;
  /** Broken $ nesting (e.g., $$...$..$$) */
  brokenDollarNesting: number;
  /** \begin{} environments not wrapped in $$ */
  unwrappedEnvironments: number;
  /** Pseudocode lines (if/for/while/return patterns) */
  pseudoCodeLines: number;
  /** Leaked meta-annotations (word counts, role names, etc.) */
  leakedMetaNotes: number;
  /** Leaked figure annotations ("no image", etc.) */
  leakedFigureNotes: number;
  /** List items exceeding 120 characters */
  longListItems: number;
  /** Conclusion-like content trapped inside list items */
  trappedConclusions: number;
  /** Content blocks missing ### headings */
  missingHeadings: number;
  /** Plain text echoing adjacent headings */
  headingEchoes: number;
  /** HTML entities leaked into markdown */
  htmlEntities: number;
  /** Ratio of non-target-language content */
  foreignContentRatio: number;
}

/**
 * Scan content for defects and return counts.
 * This function is designed to be fast and non-destructive.
 */
export function scanContentDefects(content: string): ContentDefectScan {
  if (!content || content.length === 0) {
    return createEmptyScan();
  }

  return {
    bareLatexCount: countBareLatex(content),
    brokenDollarNesting: countBrokenDollarNesting(content),
    unwrappedEnvironments: countUnwrappedEnvironments(content),
    pseudoCodeLines: countPseudoCodeLines(content),
    leakedMetaNotes: countLeakedMetaNotes(content),
    leakedFigureNotes: countLeakedFigureNotes(content),
    longListItems: countLongListItems(content),
    trappedConclusions: countTrappedConclusions(content),
    missingHeadings: countMissingHeadings(content),
    headingEchoes: countHeadingEchoes(content),
    htmlEntities: countHtmlEntities(content),
    foreignContentRatio: measureForeignContentRatio(content),
  };
}

export function createEmptyScan(): ContentDefectScan {
  return {
    bareLatexCount: 0,
    brokenDollarNesting: 0,
    unwrappedEnvironments: 0,
    pseudoCodeLines: 0,
    leakedMetaNotes: 0,
    leakedFigureNotes: 0,
    longListItems: 0,
    trappedConclusions: 0,
    missingHeadings: 0,
    headingEchoes: 0,
    htmlEntities: 0,
    foreignContentRatio: 0,
  };
}

// ==================== Counter Functions ====================

function countBareLatex(content: string): number {
  // LaTeX commands not inside $ or $$ delimiters
  // Match \frac, \sum, \int, \alpha, etc. that are NOT preceded by $
  const lines = content.split("\n");
  let count = 0;
  for (const line of lines) {
    // Skip lines already in math blocks or code blocks
    if (line.trim().startsWith("```") || line.trim().startsWith("$$")) continue;
    // Count LaTeX commands outside of $ delimiters
    const stripped = line
      .replace(/\$\$[^$]*\$\$/g, "") // remove display math
      .replace(/\$[^$]+\$/g, ""); // remove inline math
    const matches = stripped.match(
      /\\(?:frac|sum|int|prod|sqrt|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|omega|pi|infty|partial|nabla|cdot|times|leq|geq|neq|approx|sim|equiv|subset|supset|cap|cup|in|notin|forall|exists|mathbb|mathcal|mathbf|mathrm|text|left|right|begin|end)\b/g,
    );
    if (matches) count += matches.length;
  }
  return count;
}

function countBrokenDollarNesting(content: string): number {
  let count = 0;
  // Pattern: $$ ... $ ... $$ (single $ inside display math)
  const displayMathBlocks = content.match(/\$\$[\s\S]*?\$\$/g) || [];
  for (const block of displayMathBlocks) {
    const inner = block.slice(2, -2);
    // Count lone $ that aren't part of $$ inside display math
    const loneMatches = inner.match(/(?<!\$)\$(?!\$)/g);
    if (loneMatches) count += loneMatches.length;
  }
  return count;
}

function countUnwrappedEnvironments(content: string): number {
  let count = 0;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (
      line.match(
        /^\\begin\{(?:pmatrix|bmatrix|matrix|aligned|align|cases|array|equation)/,
      )
    ) {
      // Check if previous non-empty line has $$
      let hasDollar = false;
      for (let j = i - 1; j >= 0; j--) {
        const prev = lines[j].trim();
        if (prev === "") continue;
        if (prev === "$$" || prev.endsWith("$$")) hasDollar = true;
        break;
      }
      if (!hasDollar) count++;
    }
  }
  return count;
}

function countPseudoCodeLines(content: string): number {
  // Lines that look like pseudocode (not inside code blocks)
  let count = 0;
  let inCodeBlock = false;
  for (const line of content.split("\n")) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const trimmed = line.trim();
    if (
      trimmed.match(
        /^(?:if|else|for|while|return|def|function|class|import|from|try|catch|switch|case)\s/i,
      ) &&
      !trimmed.startsWith("-") &&
      !trimmed.startsWith("*")
    ) {
      count++;
    }
  }
  return count;
}

function countLeakedMetaNotes(content: string): number {
  const patterns = [
    /【.*?字.*?】/g,
    /\[.*?words?\]/gi,
    /\(约?\s*\d+\s*字\)/g,
    /\(approximately?\s*\d+\s*words?\)/gi,
    /^注[：:]/gm,
    /^Note[：:]/gm,
    /^备注[：:]/gm,
    /本报告/g,
    /作为.*?助手/g,
    /作为AI/g,
  ];
  let count = 0;
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

function countLeakedFigureNotes(content: string): number {
  const patterns = [
    /图片没有[：:]/g,
    /图片缺失/g,
    /无图片/g,
    /Image not available/gi,
    /No image/gi,
    /\[图片\]/g,
    /\[Image\]/gi,
  ];
  let count = 0;
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

function countLongListItems(content: string): number {
  let count = 0;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (
      (trimmed.startsWith("- ") ||
        trimmed.startsWith("* ") ||
        trimmed.match(/^\d+\.\s/)) &&
      trimmed.length > 120
    ) {
      count++;
    }
  }
  return count;
}

function countTrappedConclusions(content: string): number {
  let count = 0;
  const conclusionPatterns =
    /^[-*]\s*(?:综上所述|总(?:的来|而言之)|由此可见|总结|In\s+(?:summary|conclusion))/;
  for (const line of content.split("\n")) {
    if (conclusionPatterns.test(line.trim())) {
      count++;
    }
  }
  return count;
}

function countMissingHeadings(content: string): number {
  // Count long content blocks (>500 chars) between headings that don't have ### subheadings
  const sections = content.split(/^#{1,3}\s/m);
  let count = 0;
  for (const section of sections) {
    if (section.length > 500 && !section.includes("### ")) {
      count++;
    }
  }
  return count;
}

function countHeadingEchoes(content: string): number {
  let count = 0;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const heading = lines[i].match(/^#{1,4}\s+(.+)/);
    if (heading) {
      const headingText = heading[1].trim();
      // Check next non-empty line
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (nextLine === "") continue;
        if (
          nextLine === headingText ||
          nextLine === `**${headingText}**` ||
          nextLine.startsWith(`${headingText}：`) ||
          nextLine.startsWith(`${headingText}:`)
        ) {
          count++;
        }
        break;
      }
    }
  }
  return count;
}

function countHtmlEntities(content: string): number {
  const matches = content.match(/&(?:amp|lt|gt|quot|nbsp|apos|#\d+);/g);
  return matches ? matches.length : 0;
}

function measureForeignContentRatio(content: string): number {
  if (content.length === 0) return 0;

  // Detect if primary language is Chinese (by checking proportion of CJK chars)
  const cjkChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  const totalChars = content.replace(/\s/g, "").length;

  if (totalChars === 0) return 0;

  const cjkRatio = cjkChars / totalChars;

  // If predominantly Chinese (>30% CJK), measure non-CJK ratio
  // Exclude common non-CJK content: numbers, punctuation, URLs, code blocks, LaTeX
  if (cjkRatio > 0.3) {
    const cleaned = content
      .replace(/```[\s\S]*?```/g, "") // code blocks
      .replace(/\$\$[\s\S]*?\$\$/g, "") // display math
      .replace(/\$[^$]+\$/g, "") // inline math
      .replace(/https?:\/\/[^\s]+/g, "") // URLs
      .replace(/[0-9.,;:!?()[\]{}'"<>@#$%^&*+=\\/_-]/g, "") // punctuation/symbols
      .replace(/\s+/g, "");

    if (cleaned.length === 0) return 0;
    const cleanedCjk = (cleaned.match(/[\u4e00-\u9fff]/g) || []).length;
    // Foreign content = latin characters that aren't common abbreviations
    const latinChars = (cleaned.match(/[a-zA-Z]{3,}/g) || []).filter(
      (w) =>
        ![
          "the",
          "and",
          "for",
          "with",
          "from",
          "that",
          "this",
          "are",
          "was",
          "has",
          "not",
          "but",
        ].includes(w.toLowerCase()) && w.length > 4, // Only count longer words as truly foreign
    ).length;

    return cleanedCjk > 0
      ? Math.min(1, latinChars / (cleanedCjk + latinChars))
      : 0;
  }

  return 0; // For English content, no foreign content measurement
}
