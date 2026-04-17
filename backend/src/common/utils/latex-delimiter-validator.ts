/**
 * LaTeX Delimiter Validator
 *
 * Validates LaTeX math-delimiter integrity in LLM-generated markdown.
 * Used at the LLM output boundary so malformed content is detected AT
 * THE SOURCE and re-generated, rather than patched downstream via a
 * fragile regex pipeline.
 *
 * Checks:
 *   1. Inline math `$...$` pairs — count of unescaped `$` must be even
 *      on each line (ignoring `$$` display math)
 *   2. Display math `$$...$$` pairs — overall count of `$$` must be even
 *   3. Backslash-bracket display math `\[...\]` must be paired
 *   4. LaTeX environments `\begin{X}...\end{X}` must be paired and matched
 *   5. No "prose inside inline math" — `$...$` block contains CJK comma
 *      or period outside `\text{…}` groups (likely displaced `$`)
 *   6. No "unbalanced braces inside math" — opens/closes mismatch
 *
 * Design intent:
 *   - Zero false positives: be CONSERVATIVE, only flag clear violations.
 *   - Fast: pure string scanning, no AST.
 *   - Composable: return structured issues so caller can build a
 *     repair prompt ("please close the `$` after …").
 *
 * Usage:
 *   const result = validateLatexDelimiters(markdown);
 *   if (!result.valid) {
 *     // retry LLM with result.repairHint as guidance
 *   }
 */

export type LatexIssueKind =
  | "inline-unbalanced" // odd $ count on a line
  | "display-unbalanced" // odd $$ count
  | "bracket-display-unbalanced" // \[ without \] or vice versa
  | "environment-unbalanced" // \begin without \end or vice versa
  | "prose-in-inline-math" // $...$ contains CJK punctuation outside \text{}
  | "brace-unbalanced"; // unmatched { or } inside math

export interface LatexIssue {
  kind: LatexIssueKind;
  /** 1-based line number where the issue was detected (or 0 for document-wide) */
  line: number;
  /** Human-readable message usable as LLM repair instruction */
  message: string;
  /** Snippet of offending content (truncated) */
  snippet?: string;
}

export interface LatexValidationResult {
  valid: boolean;
  issues: LatexIssue[];
  /** Ready-to-inject instruction for LLM retry */
  repairHint: string;
}

const CJK_PUNCT_RE = /[\uff0c\u3002\uff1b\uff1a\uff01\uff1f]/;

/**
 * Count unescaped `$` in a string (ignoring `\$`), treating `$$` as
 * a single display-math delimiter (returns 0 for the `$$` pair inline,
 * since we validate display math separately).
 *
 * Returns inline-$ count (excluding $$ pairs).
 */
function countInlineDollars(line: string): number {
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "$" && (i === 0 || line[i - 1] !== "\\")) {
      // Skip `$$` — display math delimiter
      if (line[i + 1] === "$") {
        i++; // skip the next $ too
        continue;
      }
      count++;
    }
  }
  return count;
}

/**
 * Count `$$` display math delimiters in the entire document.
 */
function countDisplayDollars(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "$" && text[i + 1] === "$") {
      if (i === 0 || text[i - 1] !== "\\") {
        count++;
        i++; // skip next
      }
    }
  }
  return count;
}

/**
 * Extract content of inline math blocks (`$...$`, not `$$...$$`).
 * Returns array of `{ content, line }` where line is 1-based.
 */
function extractInlineMathBlocks(
  text: string,
): Array<{ content: string; line: number }> {
  const blocks: Array<{ content: string; line: number }> = [];
  let line = 1;
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\n") {
      line++;
      i++;
      continue;
    }
    if (text[i] === "$" && text[i + 1] === "$") {
      // skip display math block entirely
      i += 2;
      const endIdx = text.indexOf("$$", i);
      if (endIdx === -1) break;
      // count newlines inside
      for (let j = i; j < endIdx; j++) if (text[j] === "\n") line++;
      i = endIdx + 2;
      continue;
    }
    if (text[i] === "$" && (i === 0 || text[i - 1] !== "\\")) {
      // inline math
      const startLine = line;
      const start = i + 1;
      let end = -1;
      for (let j = start; j < text.length; j++) {
        if (text[j] === "\n") {
          // inline math doesn't span lines — treat as unterminated
          break;
        }
        if (text[j] === "$" && text[j - 1] !== "\\") {
          end = j;
          break;
        }
      }
      if (end === -1) {
        i = start; // advance past opening $
        continue;
      }
      blocks.push({
        content: text.substring(start, end),
        line: startLine,
      });
      i = end + 1;
      continue;
    }
    i++;
  }
  return blocks;
}

export function validateLatexDelimiters(
  markdown: string,
): LatexValidationResult {
  const issues: LatexIssue[] = [];

  // ── 1. Display math $$ count ─────────────────────────────────────────
  const displayCount = countDisplayDollars(markdown);
  if (displayCount % 2 !== 0) {
    issues.push({
      kind: "display-unbalanced",
      line: 0,
      message: `Display math delimiter \`$$\` count is odd (${displayCount}). Every \`$$\` opening must have a matching \`$$\` closing.`,
    });
  }

  // ── 2. Inline $ parity per line (ignoring $$ pairs) ──────────────────
  const lines = markdown.split("\n");
  let inDisplayBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // Track multi-line $$ blocks: a line that has odd $$ toggles the state
    const ddOnThisLine = (raw.match(/(?<!\\)\$\$/g) || []).length;
    const lineIsInDisplay = inDisplayBlock && ddOnThisLine === 0;
    if (ddOnThisLine % 2 !== 0) inDisplayBlock = !inDisplayBlock;

    // Skip lines fully inside $$...$$ block
    if (lineIsInDisplay) continue;

    const inlineCount = countInlineDollars(raw);
    if (inlineCount % 2 !== 0) {
      issues.push({
        kind: "inline-unbalanced",
        line: i + 1,
        message: `Line ${i + 1} has ${inlineCount} unescaped \`$\` signs (must be even). Close every inline math expression with a matching \`$\`.`,
        snippet: raw.substring(0, 120),
      });
    }
  }

  // ── 3. \[ ... \] pairing ──────────────────────────────────────────────
  const openBrackets = (markdown.match(/(?<!\\)\\\[/g) || []).length;
  const closeBrackets = (markdown.match(/(?<!\\)\\\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    issues.push({
      kind: "bracket-display-unbalanced",
      line: 0,
      message: `\`\\[\` count (${openBrackets}) does not match \`\\]\` count (${closeBrackets}). Pair all display-math brackets, or convert them to \`$$...$$\`.`,
    });
  }

  // ── 4. \begin{X} / \end{X} pairing ────────────────────────────────────
  const envStack: Array<{ name: string; line: number }> = [];
  const envOpenRe = /\\begin\{([a-zA-Z]+)\}/g;
  const envCloseRe = /\\end\{([a-zA-Z]+)\}/g;
  const opens: Array<{ name: string; index: number }> = [];
  const closes: Array<{ name: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = envOpenRe.exec(markdown)) !== null) {
    opens.push({ name: m[1], index: m.index });
  }
  while ((m = envCloseRe.exec(markdown)) !== null) {
    closes.push({ name: m[1], index: m.index });
  }
  const merged = [
    ...opens.map((o) => ({ ...o, kind: "open" as const })),
    ...closes.map((c) => ({ ...c, kind: "close" as const })),
  ].sort((a, b) => a.index - b.index);
  for (const ev of merged) {
    if (ev.kind === "open") {
      envStack.push({
        name: ev.name,
        line: markdown.substring(0, ev.index).split("\n").length,
      });
    } else {
      const last = envStack.pop();
      if (!last || last.name !== ev.name) {
        issues.push({
          kind: "environment-unbalanced",
          line: markdown.substring(0, ev.index).split("\n").length,
          message: last
            ? `Found \`\\end{${ev.name}}\` but innermost open environment was \`\\begin{${last.name}}\`. Nest environments properly.`
            : `Found \`\\end{${ev.name}}\` with no matching \`\\begin{${ev.name}}\`.`,
        });
      }
    }
  }
  for (const remaining of envStack) {
    issues.push({
      kind: "environment-unbalanced",
      line: remaining.line,
      message: `\`\\begin{${remaining.name}}\` at line ${remaining.line} has no matching \`\\end{${remaining.name}}\`.`,
    });
  }

  // ── 5. Prose inside inline math ($...$ containing CJK punct) ─────────
  const inlineBlocks = extractInlineMathBlocks(markdown);
  for (const blk of inlineBlocks) {
    // Strip \text{...} groups first — CJK inside those is legitimate
    const stripped = blk.content.replace(/\\text\{[^}]*\}/g, "");
    if (CJK_PUNCT_RE.test(stripped)) {
      issues.push({
        kind: "prose-in-inline-math",
        line: blk.line,
        message: `Inline math on line ${blk.line} contains CJK punctuation (\`，。；\`) — this usually means a closing \`$\` was placed too late. Close the formula BEFORE the prose.`,
        snippet: blk.content.substring(0, 80),
      });
    }
    // Also flag long CJK strings (> 3 consecutive CJK chars) outside \text{}
    const cjkRun = stripped.match(/[\u4e00-\u9fff]{4,}/);
    if (cjkRun) {
      issues.push({
        kind: "prose-in-inline-math",
        line: blk.line,
        message: `Inline math on line ${blk.line} contains a run of CJK characters (\`${cjkRun[0]}\`). Either wrap them in \`\\text{…}\` or close the formula before them.`,
        snippet: blk.content.substring(0, 80),
      });
    }
  }

  // ── 6. Braces inside math blocks must balance ─────────────────────────
  for (const blk of inlineBlocks) {
    const opens = (blk.content.match(/(?<!\\)\{/g) || []).length;
    const cl = (blk.content.match(/(?<!\\)\}/g) || []).length;
    if (opens !== cl) {
      issues.push({
        kind: "brace-unbalanced",
        line: blk.line,
        message: `Inline math on line ${blk.line} has unbalanced braces (\`{\`=${opens}, \`}\`=${cl}). Every \`{\` must close with a matching \`}\`.`,
        snippet: blk.content.substring(0, 80),
      });
    }
  }

  // ── Build repair hint for LLM retry ──────────────────────────────────
  const repairHint =
    issues.length === 0
      ? ""
      : [
          "The previous output had the following LaTeX formatting issues:",
          ...issues
            .slice(0, 8)
            .map((issue, idx) => `  ${idx + 1}. ${issue.message}`),
          issues.length > 8 ? `  ...and ${issues.length - 8} more.` : "",
          "Please regenerate the SAME content with these fixes:",
          "  - Every `$` must be paired. Use `$formula$` for inline, `$$formula$$` for display.",
          "  - Never place Chinese punctuation (，。；) INSIDE `$...$` — close the formula first, then write prose.",
          "  - Every `{` must have a matching `}`.",
          "  - Every `\\begin{env}` must have `\\end{env}`.",
        ]
          .filter(Boolean)
          .join("\n");

  return {
    valid: issues.length === 0,
    issues,
    repairHint,
  };
}
