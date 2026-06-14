/**
 * Facade text/token utilities — pure, dependency-free helpers shared by the
 * harness facades (ai.facade / chat.facade / rag.facade).
 *
 * These were previously copy-pasted as private methods in each facade. Pure
 * logic does not belong inside a facade (whose role is re-export + thin
 * delegation), so it lives here as a single canonical implementation.
 *
 * NOTE: token estimation here is an intentional lightweight heuristic (no
 * tokenizer dependency) used for compaction thresholds, not for billing.
 */

/**
 * Strip markdown fences and surrounding prose from an LLM response, returning
 * the best-effort JSON substring (object or array). Does not parse/validate.
 */
export function extractJson(content: string): string {
  let cleaned = content.trim();

  // Remove markdown code block
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  }

  // Trim leading non-JSON text (find first { or [)
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  const start = Math.min(
    firstBrace >= 0 ? firstBrace : Infinity,
    firstBracket >= 0 ? firstBracket : Infinity,
  );

  if (start !== Infinity && start > 0) {
    cleaned = cleaned.substring(start);
  }

  // Trim trailing non-JSON text
  const lastBrace = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);

  if (end >= 0 && end < cleaned.length - 1) {
    cleaned = cleaned.substring(0, end + 1);
  }

  return cleaned;
}

/**
 * Lightweight token estimate: ~2 tokens per CJK char, ~1 token per 4 other
 * chars. Heuristic only — used for compaction thresholds, not billing.
 */
export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[一-龥]/g) ?? []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 2 + otherChars / 4);
}

/**
 * Compress a context string toward a target token budget by keeping the head
 * (60%) and tail (30%) and elliding the middle. Returns the input unchanged
 * when already within budget.
 */
export function compressContext(context: string, maxTokens: number): string {
  const currentTokens = estimateTokens(context);
  if (currentTokens <= maxTokens) {
    return context;
  }

  // Keep ratio of original, with a 10% safety margin
  const ratio = maxTokens / currentTokens;
  const targetLength = Math.floor(context.length * ratio * 0.9);

  // Prioritise head and tail
  const headLength = Math.floor(targetLength * 0.6);
  const tailLength = Math.floor(targetLength * 0.3);

  const head = context.substring(0, headLength);
  const tail = context.substring(context.length - tailLength);

  return `${head}\n\n[... content compressed ...]\n\n${tail}`;
}

/**
 * Minimal JSON-schema shape check: validates top-level type (object/array) and
 * the presence of `required` fields. Not a full validator — intended as a cheap
 * structural guard for LLM structured output.
 *
 * The `required` check is skipped for arrays (an array against an object schema
 * should not have its fields probed by index).
 */
export function validateJsonSchema(data: unknown, schema: object): boolean {
  const schemaObj = schema as {
    type?: string;
    required?: string[];
    properties?: Record<string, { type?: string }>;
  };

  if (schemaObj.type === "object" && typeof data !== "object") {
    return false;
  }
  if (schemaObj.type === "array" && !Array.isArray(data)) {
    return false;
  }

  if (
    schemaObj.required &&
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data)
  ) {
    const obj = data as Record<string, unknown>;
    for (const field of schemaObj.required) {
      if (!(field in obj)) {
        return false;
      }
    }
  }

  return true;
}
