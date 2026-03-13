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

  // Fallback: bare JSON block with generatedCharts at end of content
  const bareJsonPattern =
    /\n\s*\{\s*"(?:generatedCharts|figureReferences)"[\s\S]*$/;
  const m2 = result.match(bareJsonPattern);
  if (m2?.index !== undefined) {
    const before = result.substring(0, m2.index).trim();
    if (before.length > 100) {
      result = before;
    }
  }

  // ★ 移除 AI 错误输出的 "图表数据" 章节标题
  // 匹配模式：前后可能有分隔线(---) + "图表数据" 标题（可能是 ###、##、或纯文本）
  // 示例: ---\n### 图表数据\n--- 或 \n图表数据\n
  result = result.replace(
    /\n*-{3,}\s*\n*#{0,3}\s*图表数据\s*\n*-{3,}\s*\n*/g,
    "\n\n",
  );
  // 单独的 "图表数据" 标题行（无分隔线）
  result = result.replace(/\n#{1,3}\s*图表数据\s*\n/g, "\n");

  // ★ Strip inline JSON figure reference arrays/objects leaked mid-content
  // Pattern: { "type": "image" or { "type": "table" followed by JSON properties
  // These are raw figureReferences objects that LLM failed to separate
  result = result.replace(
    /\{[^{}]*"type"\s*:\s*"(?:image|table)"[^}]*\}(?:\s*,\s*\{[^{}]*"type"\s*:\s*"(?:image|table)"[^}]*\})*/g,
    "",
  );

  // ★ Strip leaked chart config JSON (Chart.js options)
  // Pattern: "y1": { "type": "linear", ... } — chart axis configuration
  result = result.replace(
    /"\w+"\s*:\s*\{\s*"type"\s*:\s*"(?:linear|logarithmic|category|time)"[^}]*\}/g,
    "",
  );

  return result.trim();
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
