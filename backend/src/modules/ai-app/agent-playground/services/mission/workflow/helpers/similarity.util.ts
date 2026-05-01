/**
 * similarity.util.ts
 *
 * Lightweight text similarity helpers (zero LLM calls).
 * Used by per-dim-pipeline to detect "stuck revision" loops where
 * successive chapter drafts are virtually identical despite repeated
 * reviewer-reject → revise cycles.
 */

/**
 * Jaccard similarity over word tokens (length > 2, case-insensitive).
 * Returns a value in [0, 1] where 1 = identical token sets.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
  const tokensB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.size / union.size;
}
