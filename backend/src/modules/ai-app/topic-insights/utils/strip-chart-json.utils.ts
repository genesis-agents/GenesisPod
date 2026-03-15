/**
 * Chart JSON Stripping Utilities
 *
 * Shared functions for removing chart JSON blocks that were not properly
 * separated by parseChartOutput from dimension/report content.
 *
 * Used by:
 * - report-synthesis.service.ts (buildFullReportFromDimensions)
 * - report-generator.service.ts (buildFullReportFromDimensions)
 */

/**
 * Strip chart JSON blocks that were not properly separated by parseChartOutput.
 * Handles patterns like: ---CHARTS--- {...}, CHARTS--- {...}, ---CHARTS {...},
 * or bare "CHARTS" followed by JSON array/object on next line.
 * ★ Also strips "Figure References" metadata sections.
 */
export function stripChartJsonFromContent(content: string): string {
  // ★ Strip "Figure References" metadata sections (LLM leaks internal figure allocation data)
  // Pattern: "Figure References" header followed by non-empty lines until first blank line or heading.
  // Each continuation line must be non-empty and NOT a heading.
  let result = content.replace(
    /(?:^|\n)\s*\*{0,2}Figure\s*References\*{0,2}\s*\n(?:(?!#{1,6}\s)[^\n]+\n)*/gim,
    "\n",
  );

  // ★ Handle bare "CHARTS" (no dashes) followed by JSON array on next line
  // Pattern: standalone "CHARTS" line + "[" on next line + JSON content + "]"
  result = result.replace(
    /(?:^|\n)\s*CHARTS\s*\n\s*\[[\s\S]*?\n\s*\]\s*(?:\n|$)/gi,
    "\n",
  );

  // Find all CHARTS separator occurrences - require at least one side to have dash
  const separatorPattern = /(?:-+\s*CHARTS\s*-*|CHARTS\s*-+)/gi;
  let match: RegExpExecArray | null;

  // Process from last occurrence to first (to preserve indices)
  const matches: { index: number; length: number }[] = [];
  while ((match = separatorPattern.exec(result)) !== null) {
    matches.push({ index: match.index, length: match[0].length });
  }

  for (let i = matches.length - 1; i >= 0; i--) {
    const sep = matches[i];
    // Find the opening { after the separator
    const afterSep = result.substring(sep.index + sep.length);
    const braceStart = afterSep.search(/\{/);
    if (braceStart === -1) continue;

    // Use brace counting to find matching closing }
    const jsonStart = sep.index + sep.length + braceStart;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let jsonEnd = -1;

    for (let j = jsonStart; j < result.length; j++) {
      const ch = result[j];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          jsonEnd = j + 1;
          break;
        }
      }
    }

    // Strip from separator start to end of JSON block (or end of content)
    // Also strip leading whitespace/newlines before the separator
    let stripStart = sep.index;
    while (stripStart > 0 && "\n\r \t".includes(result[stripStart - 1])) {
      stripStart--;
    }
    const stripEnd = jsonEnd > 0 ? jsonEnd : result.length;
    result = result.substring(0, stripStart) + result.substring(stripEnd);
  }

  // ★ v3.2: 通用 JSON 块清理 — markdown 正文中不应出现任何 JSON
  // 不再按字段名逐个匹配，而是检测所有 "key": value 模式的 JSON 块
  result = stripAllJsonBlocks(result);

  // ★ 移除 AI 错误输出的 "图表数据" 章节标题
  result = result.replace(
    /\n*-{3,}\s*\n*#{0,3}\s*图表数据\s*\n*-{3,}\s*\n*/g,
    "\n\n",
  );
  result = result.replace(/\n#{1,3}\s*图表数据\s*\n/g, "\n");

  return result.trim();
}

/**
 * 通用 JSON 块清理 — 从 markdown 正文中移除所有泄漏的 JSON 内容
 *
 * Markdown 正文中不应出现 JSON。检测逻辑：
 * 1. 独立行以 `"key":` 开头 → JSON 属性泄漏
 * 2. `{` 或 `[` 开头后跟 `"key":` → JSON 对象/数组泄漏
 * 3. `"figureReferences":`、`"generatedCharts":` 等已知标签 + 后续多行
 *
 * 不处理 ``` 代码块内的内容。
 */
function stripAllJsonBlocks(content: string): string {
  const lines = content.split("\n");
  const cleaned: string[] = [];
  let inCodeBlock = false;
  let inJsonBlock = false;
  let jsonBraceDepth = 0;
  let jsonBracketDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 代码块内不处理
    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
      cleaned.push(line);
      continue;
    }
    if (inCodeBlock) {
      cleaned.push(line);
      continue;
    }

    // 正在跟踪 JSON 块
    if (inJsonBlock) {
      for (const ch of trimmed) {
        if (ch === "{") jsonBraceDepth++;
        else if (ch === "}") jsonBraceDepth--;
        else if (ch === "[") jsonBracketDepth++;
        else if (ch === "]") jsonBracketDepth--;
      }
      if (jsonBraceDepth <= 0 && jsonBracketDepth <= 0) {
        inJsonBlock = false;
        jsonBraceDepth = 0;
        jsonBracketDepth = 0;
      }
      continue; // 跳过 JSON 块内的所有行
    }

    // 检测 JSON 块开始
    const isJsonLine =
      // "key": value 格式的独立行
      /^\s*"[a-zA-Z_]\w*"\s*:/.test(line) ||
      // { 开头后跟 "key": — JSON 对象开始
      /^\s*\{\s*"[a-zA-Z_]/.test(line) ||
      // [ 开头后跟 { 或 "key" — JSON 数组开始
      (/^\s*\[\s*\{?\s*"?[a-zA-Z_]/.test(line) && /"\s*:/.test(line));

    if (isJsonLine) {
      // 开始跟踪 JSON 块深度
      inJsonBlock = true;
      jsonBraceDepth = 0;
      jsonBracketDepth = 0;
      for (const ch of trimmed) {
        if (ch === "{") jsonBraceDepth++;
        else if (ch === "}") jsonBraceDepth--;
        else if (ch === "[") jsonBracketDepth++;
        else if (ch === "]") jsonBracketDepth--;
      }
      if (jsonBraceDepth <= 0 && jsonBracketDepth <= 0) {
        inJsonBlock = false; // 单行 JSON，已闭合
      }
      continue; // 跳过这行
    }

    cleaned.push(line);
  }

  return cleaned.join("\n");
}

/**
 * If a string looks like raw JSON, try to extract fullText from it.
 */
export function extractMarkdownFromJsonString(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return text;

  try {
    const parsed = JSON.parse(trimmed);
    const ft =
      parsed.fullText ||
      parsed.executiveSummary?.fullText ||
      (typeof parsed.executiveSummary === "string"
        ? parsed.executiveSummary
        : null);
    if (ft && typeof ft === "string") return ft;
  } catch {
    // Try regex fallback
  }

  const match = trimmed.match(/"fullText"\s*:\s*"/);
  if (match?.index !== undefined) {
    const valueStart = match.index + match[0].length;
    let i = valueStart;
    while (i < trimmed.length) {
      if (trimmed[i] === "\\") {
        i += 2;
        continue;
      }
      if (trimmed[i] === '"') {
        const raw = trimmed.slice(valueStart, i);
        const unescaped = raw
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\\r/g, "\r")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
        if (unescaped.length > 50) return unescaped;
        break;
      }
      i++;
    }
  }

  return text;
}
