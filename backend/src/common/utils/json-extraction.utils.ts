/**
 * JSON Extraction Utilities
 *
 * Robust JSON extraction from AI responses that may be wrapped in
 * markdown code blocks or contain other formatting.
 */

/**
 * Options for JSON extraction
 */
export interface JsonExtractionOptions {
  /** Key that must exist in the extracted object for validation */
  requiredKey?: string;
  /** Maximum content length to log on error */
  errorPreviewLength?: number;
}

/**
 * Result of JSON extraction attempt
 */
export interface JsonExtractionResult<T> {
  success: boolean;
  data: T | null;
  error?: string;
  method?: string;
}

/**
 * Extract JSON from AI response content
 *
 * Tries multiple methods in order:
 * 1. Direct JSON.parse
 * 2. Extract from ```json code block
 * 3. Extract from ``` code block (no language marker)
 * 4. Find JSON object with required key
 * 5. Find any valid JSON object
 *
 * @param content - The AI response content
 * @param options - Extraction options
 * @returns Extraction result with parsed data or error
 */
export function extractJsonFromAIResponse<T = unknown>(
  rawContent: string,
  options: JsonExtractionOptions = {},
): JsonExtractionResult<T> {
  const { requiredKey, errorPreviewLength = 500 } = options;

  // ★ Preprocessing 1: strip reasoning-model chain-of-thought blocks
  // Reasoning models (Nemotron, DeepSeek-R1, QwQ, etc.) prefix structured output
  // with <think>…</think> or <thinking>…</thinking> blocks that break JSON.parse.
  const content = stripReasoningBlocks(rawContent);

  // ★ Preprocessing 2: deduplicate consecutive identical lines
  // Reasoning models sometimes output each JSON line twice
  const deduplicated = deduplicateConsecutiveLines(content);

  // Use deduplicated content for all subsequent methods
  const processedContent = deduplicated !== content ? deduplicated : content;

  // Method 1: Try direct JSON parse
  try {
    const parsed = JSON.parse(content) as T;
    if (!requiredKey || hasKey(parsed, requiredKey)) {
      return { success: true, data: parsed, method: "direct" };
    }
  } catch {
    // Continue to next method
  }

  // Method 1.5: If content starts with {, try brace-counting extraction
  // Handles cases where model appends text after valid JSON, or content has trailing noise
  const trimmedContent = content.trim();
  if (trimmedContent.startsWith("{")) {
    const extracted = extractJsonByBraceCounting(trimmedContent);
    if (extracted) {
      try {
        const parsed = JSON.parse(extracted) as T;
        if (!requiredKey || hasKey(parsed, requiredKey)) {
          return { success: true, data: parsed, method: "braceCounting" };
        }
      } catch {
        // Continue to next method
      }
    }
  }

  // Method 2: Extract from ```json code block using brace counting
  // ★ Non-greedy regex fails when fullText contains ``` (markdown code blocks in JSON string values)
  // Instead, find the ```json marker, locate the first {, then use brace counting
  const jsonBlockStart = content.indexOf("```json");
  if (jsonBlockStart !== -1) {
    const afterMarker = content.substring(jsonBlockStart + 7); // skip "```json"
    const bracePos = afterMarker.indexOf("{");
    if (bracePos !== -1) {
      const jsonObj = extractJsonByBraceCounting(
        afterMarker.substring(bracePos),
      );
      if (jsonObj) {
        try {
          const parsed = JSON.parse(jsonObj) as T;
          if (!requiredKey || hasKey(parsed, requiredKey)) {
            return { success: true, data: parsed, method: "jsonBlock" };
          }
        } catch {
          // Continue to next method
        }
      }
      // Fallback: try the unclosed/truncated content after ```json
      const jsonContent = afterMarker.trim();
      // Try direct parse first (complete JSON without closing ```)
      try {
        const trimmed = jsonContent.replace(/\s*```\s*$/, "").trim();
        const parsed = JSON.parse(trimmed) as T;
        if (!requiredKey || hasKey(parsed, requiredKey)) {
          return { success: true, data: parsed, method: "unclosedJsonBlock" };
        }
      } catch {
        // Try repair
        const repaired = tryRepairTruncatedJson(jsonContent);
        if (repaired) {
          try {
            const parsed = JSON.parse(repaired) as T;
            if (!requiredKey || hasKey(parsed, requiredKey)) {
              return {
                success: true,
                data: parsed,
                method: "unclosedJsonBlockRepaired",
              };
            }
          } catch {
            // Continue to next method
          }
        }
      }
    }
  }

  // Method 3: Extract from ``` code block (no language marker)
  const codeBlockMatch = content.match(/```\s*([\s\S]+?)\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]) as T;
      if (!requiredKey || hasKey(parsed, requiredKey)) {
        return { success: true, data: parsed, method: "codeBlock" };
      }
    } catch {
      // Continue to next method
    }
  }

  // Method 4: Find JSON object with required key
  if (requiredKey) {
    const keyPattern = new RegExp(
      `\\{[\\s\\S]*"${requiredKey}"[\\s\\S]*\\}`,
      "g",
    );
    const matches = content.match(keyPattern);
    if (matches) {
      for (const match of matches) {
        try {
          const parsed = JSON.parse(match) as T;
          if (hasKey(parsed, requiredKey)) {
            return { success: true, data: parsed, method: "keySearch" };
          }
        } catch {
          // Try next match
        }
      }
    }
  }

  // Method 5: Find any valid JSON object
  const anyJsonMatch = content.match(/\{[\s\S]*\}/);
  if (anyJsonMatch) {
    try {
      const parsed = JSON.parse(anyJsonMatch[0]) as T;
      if (!requiredKey || hasKey(parsed, requiredKey)) {
        return { success: true, data: parsed, method: "anyJson" };
      }
    } catch {
      // Continue
    }
  }

  // Method 6: Try to repair truncated JSON
  const repairedJson = tryRepairTruncatedJson(content);
  if (repairedJson) {
    try {
      const parsed = JSON.parse(repairedJson) as T;
      if (!requiredKey || hasKey(parsed, requiredKey)) {
        return { success: true, data: parsed, method: "repaired" };
      }
    } catch {
      // Continue
    }
  }

  // Method 7: If deduplication produced different content, retry all methods on it
  if (processedContent !== content) {
    const retryResult = extractJsonFromAIResponse<T>(processedContent, {
      ...options,
      // Use a marker to prevent infinite recursion
      requiredKey,
    });
    if (retryResult.success) {
      return {
        ...retryResult,
        method: `deduplicated+${retryResult.method}`,
      };
    }
  }

  // All methods failed
  const preview = content.substring(0, errorPreviewLength);
  return {
    success: false,
    data: null,
    error: `Failed to extract JSON from content. Preview: ${preview}${content.length > errorPreviewLength ? "..." : ""}`,
  };
}

/**
 * Check if an object has a specific key
 */
function hasKey(obj: unknown, key: string): boolean {
  return typeof obj === "object" && obj !== null && key in obj;
}

/**
 * Strip reasoning-model chain-of-thought blocks from text.
 *
 * Reasoning models (NVIDIA Nemotron, DeepSeek-R1, QwQ, OpenAI o-series with
 * raw reasoning leak, etc.) often prefix structured output with internal
 * reasoning wrapped in `<think>…</think>` or `<thinking>…</thinking>` tags.
 * These break direct `JSON.parse` and downstream Zod validation when the
 * model is asked to return structured JSON.
 *
 * This helper is the single source of truth — callers should NOT re-implement
 * `replace(/<think>…/gi, "")` inline. It also strips unclosed `<think>` blocks
 * that occur when output is truncated mid-reasoning.
 */
export function stripReasoningBlocks(content: string): string {
  if (!content) return content;
  let out = content;
  // Closed blocks: <think>…</think>, <thinking>…</thinking>, <reasoning>…</reasoning>
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, "");
  out = out.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  out = out.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "");
  // Unclosed leading blocks: model started reasoning but output was truncated
  // before the closing tag, OR reasoning leaked into the answer with no close.
  out = out.replace(/^[\s\S]*?<\/think>/i, (m) =>
    /<think>/i.test(m) ? "" : m,
  );
  out = out.replace(/^[\s\S]*?<\/thinking>/i, (m) =>
    /<thinking>/i.test(m) ? "" : m,
  );
  out = out.replace(/^[\s\S]*?<\/reasoning>/i, (m) =>
    /<reasoning>/i.test(m) ? "" : m,
  );
  return out.trim();
}

/**
 * Remove consecutive duplicate lines from content.
 * Reasoning models sometimes output each line twice, producing invalid JSON
 * with duplicate keys and missing commas.
 */
function deduplicateConsecutiveLines(content: string): string {
  const lines = content.split("\n");
  if (lines.length <= 1) return content;

  const result: string[] = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    // Skip if this line is identical to the previous (after trimming)
    if (lines[i].trim() === lines[i - 1].trim() && lines[i].trim().length > 0) {
      continue;
    }
    result.push(lines[i]);
  }

  return result.join("\n");
}

/**
 * Try to repair truncated JSON by adding missing closing brackets
 * Handles cases where JSON is truncated mid-string or mid-value
 */
function tryRepairTruncatedJson(content: string): string | null {
  // Extract potential JSON from code block first
  let jsonContent = content;

  // ★ 改进：优先使用贪婪匹配来处理没有结束 ``` 的情况
  const closedBlockMatch = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const unclosedBlockMatch = content.match(/```(?:json)?\s*([\s\S]+)$/);

  if (closedBlockMatch) {
    jsonContent = closedBlockMatch[1];
  } else if (unclosedBlockMatch) {
    // 没有结束的 ```，使用贪婪匹配获取全部内容
    jsonContent = unclosedBlockMatch[1];
  }

  // Find where JSON starts
  const jsonStart = jsonContent.indexOf("{");
  if (jsonStart === -1) return null;

  jsonContent = jsonContent.substring(jsonStart);

  // Count brackets and track string state
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;
  let lastValidStringEnd = -1;

  for (let i = 0; i < jsonContent.length; i++) {
    const char = jsonContent[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      if (!inString) {
        lastValidStringEnd = i;
      }
      continue;
    }

    if (!inString) {
      if (char === "{") braceCount++;
      if (char === "}") braceCount--;
      if (char === "[") bracketCount++;
      if (char === "]") bracketCount--;
    }
  }

  // If brackets are unbalanced or we're in an incomplete string, try to repair
  if (braceCount > 0 || bracketCount > 0 || inString) {
    let repaired = jsonContent;

    // If we're in the middle of a string, close it and truncate the incomplete value
    if (inString) {
      // Find the last complete property before the truncated string
      const lastCommaBeforeEnd = jsonContent.lastIndexOf(
        ",",
        lastValidStringEnd,
      );
      const truncatePoint = Math.max(lastCommaBeforeEnd, 0);

      if (truncatePoint > 0) {
        // Truncate to last complete property
        repaired = jsonContent.substring(0, truncatePoint);
      } else if (lastValidStringEnd > 0) {
        // Fall back to last valid string end
        repaired = jsonContent.substring(0, lastValidStringEnd + 1);
      }

      // Recount brackets after truncation
      braceCount = 0;
      bracketCount = 0;
      inString = false;
      escapeNext = false;

      for (const char of repaired) {
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        if (char === "\\") {
          escapeNext = true;
          continue;
        }
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "{") braceCount++;
          if (char === "}") braceCount--;
          if (char === "[") bracketCount++;
          if (char === "]") bracketCount--;
        }
      }
    } else {
      // Not in string, find last complete property
      const lastComma = jsonContent.lastIndexOf(",");
      const lastBrace = Math.max(
        jsonContent.lastIndexOf("}"),
        jsonContent.lastIndexOf("]"),
      );

      if (lastBrace > lastComma && lastBrace > 0) {
        repaired = jsonContent.substring(0, lastBrace + 1);
      } else if (lastComma > 0) {
        repaired = jsonContent.substring(0, lastComma);
      }

      // Recount brackets after truncation
      braceCount = 0;
      bracketCount = 0;
      for (const char of repaired) {
        if (char === "{") braceCount++;
        if (char === "}") braceCount--;
        if (char === "[") bracketCount++;
        if (char === "]") bracketCount--;
      }
    }

    // Remove trailing comma if present
    repaired = repaired.replace(/,\s*$/, "");

    // Add closing brackets
    if (bracketCount > 0) repaired += "]".repeat(bracketCount);
    if (braceCount > 0) repaired += "}".repeat(braceCount);

    return repaired;
  }

  return null;
}

/**
 * Extract a complete JSON object from a string using brace counting.
 * Correctly handles nested braces inside JSON string values (e.g. markdown with ```)
 * Returns the complete JSON substring, or null if no balanced object found.
 */
function extractJsonByBraceCounting(content: string): string | null {
  if (!content.startsWith("{")) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
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
        return content.substring(0, i + 1);
      }
    }
  }

  return null; // Unbalanced — truncated JSON
}
