/**
 * preprocessLatex
 *
 * Fixes rendering issues in stored report markdown before it is passed
 * to ReactMarkdown + remark-math + rehype-katex.
 *
 * Problems addressed:
 * 1. Display math written as \[...\] instead of $$...$$
 * 2. Inline LaTeX embedded in Chinese prose without $...$ delimiters
 * 3. Markdown italic parser eating _ inside undelimited math (y_{ik} → y<em>{ik}</em>)
 * 4. Missing subscript underscores: y{ik} → y_{ik}, p\theta → p_\theta
 * 5. Half-wrapped spurious $ characters: p_\theta(x$)$ → p_\theta(x)
 * 6. Unresolved <!-- figure:N:M --> placeholders showing as text
 * 7. Inconsistent 本章要点 blockquote formatting
 */

/**
 * Fix missing subscript underscores that are common transcription errors.
 * Examples:
 *   \sum{i=1}   → \sum_{i=1}
 *   y{ik}       → y_{ik}
 *   p\theta     → p_\theta
 *   \pi\theta   → \pi_\theta
 */
function fixLatexSubscripts(input: string): string {
  let result = input;

  // Single letter/digit followed by {subscript} that is NOT a LaTeX command argument.
  // e.g. y{ik} → y_{ik}, x{t} → x_{t}
  // Negative lookbehind ensures we don't match the last char of \command{arg}
  result = result.replace(
    /(?<![a-zA-Z\\_{])([a-zA-Z])\{([a-z0-9,: ]{1,10})\}/g,
    (match, letter, inner) => {
      if (/^[a-z0-9,: _]+$/i.test(inner)) return `${letter}_{${inner}}`;
      return match;
    }
  );

  // \sum{...} → \sum_{...}  (command followed directly by {, missing _)
  result = result.replace(
    /\\(sum|prod|int|lim|max|min|sup|inf|bigcup|bigcap|bigoplus)\{/g,
    '\\$1_{'
  );

  // p\theta → p_\theta   (single letter immediately before \command = subscript)
  // Negative lookbehind prevents matching last letter of \commands (e.g. \exp\theta)
  result = result.replace(
    /(?<![a-zA-Z\\])([a-zA-Z])\\(theta|phi|psi|alpha|beta|gamma|delta|epsilon|lambda|mu|sigma|omega|pi|rho|eta|kappa|nu|xi|zeta)\b/g,
    '$1_\\$2'
  );

  return result;
}

/**
 * Converts \[...\] display math blocks to $$...$$ format expected by remark-math.
 *
 * Handles:
 * - Multi-line display math at line start: \[\n formula \n\]
 * - Single-line display math: \[ formula \]
 * - Inline display math after text: 定义为：\[ formula \]
 * - Multi-line display math NOT at line start (formula wraps across lines)
 */
function convertDisplayMath(input: string): string {
  let result = input;

  // Phase 1: Multi-line display math starting at line beginning: \[\n formula \n\]
  result = result.replace(
    /^\\?\[\s*\n([\s\S]*?)\n\s*\\?\]\s*$/gm,
    (_m, inner) => {
      if (/\\[a-zA-Z]/.test(inner)) return `$$\n${inner.trim()}\n$$`;
      return _m;
    }
  );

  // Phase 2: Multi-line display math that may appear inline (after Chinese text).
  // Uses \[ ... \] with backslash (strong math signal) spanning multiple lines.
  result = result.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_m, inner) => {
    if (/\\[a-zA-Z]/.test(inner) && !/\]\s*\(/.test(_m)) {
      return `$$${inner.trim()}$$`;
    }
    return _m;
  });

  // Phase 3: Single-line display math with optional backslash: [ formula ] or \[ formula \]
  // Guard: must contain \command, must not match [text](url) or citation [1]
  result = result.replace(/\\?\[\s*(.+?)\s*\\?\]/g, (_m, inner) => {
    if (/\\[a-zA-Z]/.test(inner) && !/\]\s*\(/.test(_m)) {
      // Skip citation-like patterns [N] where inner is just digits
      if (/^\d+$/.test(inner.trim())) return _m;
      return `$$${inner.trim()}$$`;
    }
    return _m;
  });

  return result;
}

/**
 * Removes spurious $ characters that break KaTeX parsing.
 * Pattern: p_\theta(x$)$  →  p_\theta(x)
 */
function fixSpuriousDollarSigns(input: string): string {
  // Match a parenthetical group that has a stray $ before the closing )
  // followed by another $: (...$)$
  return input.replace(/(\([^)$\n]*)\$\)\$/g, '$1)');
}

/**
 * Wraps bare inline LaTeX expressions in Chinese prose with $...$ delimiters.
 *
 * Detects sequences that:
 * - Follow a CJK character or CJK punctuation
 * - Contain at least one \command
 * - Precede a CJK character or CJK punctuation
 * - Are not already inside $...$ or $$...$$
 */
function wrapInlineLatex(input: string): string {
  const LATEX_COMMANDS =
    /\\(?:dots|ldots|cdots|tilde|hat|bar|frac|sqrt|sum|prod|int|log|exp|theta|phi|psi|alpha|beta|gamma|delta|epsilon|lambda|mu|sigma|omega|pi|mathcal|text|mathbb|subset|in|mid|cdot|quad|left|right|leq|geq|neq|approx|infty|forall|exists|partial|nabla|times|div|pm|mp|cup|cap|vee|wedge|oplus|otimes|to|rightarrow|leftarrow|Rightarrow|Leftarrow|rho|eta|kappa|nu|xi|zeta)/;

  const CJK = '[\u4e00-\u9fff\u3400-\u4dbf\uff0c\u3002\u3001\uff1b\uff1a]';
  const pattern = new RegExp(
    `(?<=${CJK})\\s*([^$\\n]*?${LATEX_COMMANDS.source}\\b[^$\\n]*?)(?=${CJK})`,
    'g'
  );

  return input.replace(pattern, (_m, expr) => {
    const trimmed = expr.trim();
    if (!trimmed) return _m;
    return ` $${trimmed}$ `;
  });
}

/**
 * Strips unresolved <!-- figure:N:M --> placeholders that were not mapped to
 * chart IDs during report assembly. In chapter view (raw detailedContent),
 * these remain and show as literal text since ReactMarkdown doesn't process
 * HTML comments.
 *
 * Also strips HTML-escaped variants: &lt;!-- figure:N:M --&gt;
 */
function stripFigureComments(input: string): string {
  let result = input;
  // Standard HTML comment form
  result = result.replace(/<!--\s*figure:\d+:\d+\s*-->/g, '');
  // HTML-escaped form (sometimes stored from HTML round-trips)
  result = result.replace(/&lt;!--\s*figure:\d+:\d+\s*--&gt;/g, '');
  return result;
}

/**
 * Header pattern for 本章要点 / Chapter Highlights in various LLM output formats:
 *   > **本章要点**
 *   **本章要点**
 *   本章要点
 *   > **Chapter Highlights**
 *   - **本章要点**
 */
const CHAPTER_HIGHLIGHTS_RE =
  /^(?:>\s*)?[-*]*\s*\**(?:本章要点|Chapter Highlights)\**[：:]*\**\s*$/i;

/**
 * Normalizes 本章要点 blocks to consistent blockquote card format.
 *
 * Raw detailedContent from LLM has inconsistent formats:
 *   Chapter 1: > **本章要点** + > - bullet (correct)
 *   Chapter 2: **本章要点** + - bullet (missing > prefix)
 *   Chapter 3: 本章要点 + - bullet (no bold, no blockquote)
 *
 * This function normalizes ALL to:
 *   > **本章要点**
 *   > - bullet point 1
 *   > - bullet point 2
 */
function normalizeChapterHighlights(content: string): string {
  const lines = content.split('\n');

  let firstBlockLines: string[] | null = null;
  let currentBlockLines: string[] = [];
  let insideBlock = false;
  const bodyLines: string[] = [];

  const flushBlock = () => {
    if (currentBlockLines.length > 0 && firstBlockLines === null) {
      firstBlockLines = currentBlockLines;
    }
    // Discard duplicate blocks (LLM sometimes repeats)
    currentBlockLines = [];
    insideBlock = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (CHAPTER_HIGHLIGHTS_RE.test(line)) {
      if (insideBlock) {
        flushBlock();
      }
      insideBlock = true;
      const isEn = /Chapter Highlights/i.test(line);
      const label = isEn ? 'Chapter Highlights' : '本章要点';
      currentBlockLines = [`> **${label}**`];
      continue;
    }

    if (insideBlock) {
      const trimmed = line.replace(/^>\s*/, '').trim();

      // Blockquote bullet or plain bullet continuation
      if (/^>\s*[-*]/.test(line) || /^\s*[-*]\s/.test(line)) {
        const pointText = trimmed.replace(/^[-*]\s*/, '').trim();
        if (pointText) {
          currentBlockLines.push(`> - ${pointText}`);
        }
        continue;
      }

      // Empty line or bare blockquote marker ends the block
      if (line.trim() === '' || line.trim() === '>') {
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
  const blockText = (firstBlockLines as string[]).join('\n');
  const bodyText = bodyLines.join('\n').replace(/^\n+/, '');
  return `${blockText}\n\n${bodyText}`;
}

/**
 * Repair broken bold markers in report content.
 *
 * LLMs sometimes produce incomplete bold syntax:
 *   **，值得警惕的是...  →  值得警惕的是...  (orphan opening **)
 *   ** [104]。          →  [104]。           (orphan opening **)
 */
function repairBrokenBoldMarkers(input: string): string {
  return input
    .split('\n')
    .map((line) => {
      const boldCount = (line.match(/\*\*/g) || []).length;
      if (boldCount === 0 || boldCount % 2 === 0) return line;

      let repaired = line.replace(/^\*\*([，,。.；;：:\s\[])/g, '$1');
      repaired = repaired.replace(/([。.！!？?\]）)])\*\*\s*$/g, '$1');

      if ((repaired.match(/\*\*/g) || []).length % 2 !== 0) {
        let firstRemoved = false;
        repaired = repaired.replace(/\*\*/g, (match) => {
          if (!firstRemoved) {
            firstRemoved = true;
            return '';
          }
          return match;
        });
      }

      return repaired;
    })
    .join('\n');
}

/**
 * Strip HTML citation links back to plain [N] markers.
 * ReactMarkdown (without rehypeRaw) renders <a href> as literal text.
 *   <a href="#ref-N" class="citation-link">[N]</a>  →  [N]
 *   <a id="ref-N"></a>  →  (removed)
 */
function stripHtmlCitationLinks(input: string): string {
  let result = input;
  result = result.replace(
    /<a\s+href="#ref-\d+"\s+class="citation-link">\[(\d+)\]<\/a>/g,
    '[$1]'
  );
  result = result.replace(/<a\s+id="ref-\d+"><\/a>/g, '');
  return result;
}

/**
 * Wrap standalone LaTeX display-math lines in $$ delimiters.
 * Bare LaTeX on its own line (surrounded by blank lines) needs wrapping.
 */
function wrapBareDisplayMath(input: string): string {
  const lines = input.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let inMathBlock = false;

  const LATEX_CMD =
    /\\(?:mathrm|frac|sum|prod|int|alpha|beta|gamma|delta|theta|phi|psi|sigma|omega|pi|lambda|mu|epsilon|log|exp|sqrt|mathbb|mathcal|text|left|right|quad|cdot|dots|ldots|cdots|operatorname|mid|leq|geq|neq|approx|infty|forall|exists|partial|nabla|times|begin|end)\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    if (inCodeBlock) {
      result.push(line);
      continue;
    }
    if (trimmed === '$$') {
      inMathBlock = !inMathBlock;
      result.push(line);
      continue;
    }
    if (inMathBlock) {
      result.push(line);
      continue;
    }

    const hasCmd = LATEX_CMD.test(trimmed);
    const skip =
      trimmed.startsWith('$') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('|') ||
      /^[>|\-*\d]/.test(trimmed);

    if (hasCmd && !skip) {
      const prevBlank =
        i === 0 || lines[i - 1].trim() === '' || lines[i - 1].trim() === '$$';
      const nextBlank =
        i === lines.length - 1 ||
        lines[i + 1].trim() === '' ||
        lines[i + 1].trim() === '$$';
      const cjkCount = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length;

      if (prevBlank && nextBlank && cjkCount < 5) {
        result.push(`$$${trimmed}$$`);
        continue;
      }
    }

    result.push(line);
  }

  return result.join('\n');
}

/**
 * Strip stray single $ delimiters inside $$ display math blocks.
 *
 * LLMs sometimes produce:
 *   $$
 *   PE_{(pos,2i)} = $\sin\left(\frac{...}\right),$
 *   $$
 *
 * The inner $ confuses remark-math/KaTeX. This function removes
 * lone $ characters (not $$) from inside display math blocks.
 */
function stripInnerDollarsInDisplayMath(input: string): string {
  return input.replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner: string) => {
    // Only act if the inner content actually has stray $
    if (!inner.includes('$')) return _m;
    const cleaned = inner.replace(/(?<!\$)\$(?!\$)/g, '');
    return `$$${cleaned}$$`;
  });
}

/**
 * Preprocesses a markdown string to fix common rendering issues before
 * passing it to ReactMarkdown with remark-math / rehype-katex.
 */
export function preprocessLatex(markdown: string): string {
  let result = markdown;

  // Step 0: Strip HTML citation links (ReactMarkdown has no rehypeRaw)
  result = stripHtmlCitationLinks(result);

  // Step 1: Strip unresolved figure placeholders
  result = stripFigureComments(result);

  // Step 2: Normalize 本章要点 to consistent blockquote format
  result = normalizeChapterHighlights(result);

  // Step 3: Repair broken bold markers (**，text or ** [N])
  result = repairBrokenBoldMarkers(result);

  // Step 4: Convert \[...\] display math to $$...$$
  result = convertDisplayMath(result);

  // Step 5: Wrap bare standalone LaTeX lines in $$
  result = wrapBareDisplayMath(result);

  // Step 5.5: Strip stray $ delimiters inside $$ display math blocks.
  // LLMs sometimes produce $$\n PE = $\sin...\right),$ \n$$ where the
  // inner $...$ confuses KaTeX. Remove single $ inside $$ blocks.
  result = stripInnerDollarsInDisplayMath(result);

  // Step 6: Fix missing subscript underscores
  result = fixLatexSubscripts(result);

  // Step 7: Remove spurious $ signs inside formulas
  result = fixSpuriousDollarSigns(result);

  // Step 8: Wrap bare inline LaTeX in Chinese prose with $...$
  result = wrapInlineLatex(result);

  return result;
}
