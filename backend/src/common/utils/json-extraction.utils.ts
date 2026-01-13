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
  content: string,
  options: JsonExtractionOptions = {},
): JsonExtractionResult<T> {
  const { requiredKey, errorPreviewLength = 500 } = options;

  // Method 1: Try direct JSON parse
  try {
    const parsed = JSON.parse(content) as T;
    if (!requiredKey || hasKey(parsed, requiredKey)) {
      return { success: true, data: parsed, method: "direct" };
    }
  } catch {
    // Continue to next method
  }

  // Method 2: Extract from ```json code block
  const jsonBlockMatch = content.match(/```json\s*([\s\S]+?)\s*```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]) as T;
      if (!requiredKey || hasKey(parsed, requiredKey)) {
        return { success: true, data: parsed, method: "jsonBlock" };
      }
    } catch {
      // Continue to next method
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
 * Try to repair truncated JSON by adding missing closing brackets
 * Handles cases where JSON is truncated mid-string or mid-value
 */
function tryRepairTruncatedJson(content: string): string | null {
  // Extract potential JSON from code block first
  let jsonContent = content;
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]+?)(?:```|$)/);
  if (codeBlockMatch) {
    jsonContent = codeBlockMatch[1];
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
