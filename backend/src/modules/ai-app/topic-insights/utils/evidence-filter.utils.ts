/**
 * Evidence filtering utilities for Topic Insights.
 *
 * Focuses on URL normalization (dedup) and low-credibility filtering.
 * Design decision: No domain blacklist (high false-positive risk, high maintenance cost).
 */

interface FilterableEvidence {
  id: string;
  url: string;
  credibilityScore: number | null;
}

interface EvidenceFilterResult<T extends FilterableEvidence> {
  passed: T[];
  filtered: { evidence: T; reason: string }[];
}

/**
 * Filter evidence by URL normalization dedup + credibility threshold.
 *
 * Steps:
 * 1. Detect wrapped redirect URLs (search engine redirects with embedded URLs)
 * 2. Normalize URLs (strip query params, fragment, trailing slash) for dedup
 * 3. Remove low-credibility evidence (score < threshold)
 */
export function filterEvidence<T extends FilterableEvidence>(
  evidence: T[],
  credibilityThreshold: number = 30,
): EvidenceFilterResult<T> {
  const passed: T[] = [];
  const filtered: { evidence: T; reason: string }[] = [];
  const seenNormalizedUrls = new Set<string>();

  for (const e of evidence) {
    // 1. Detect wrapped redirect URLs
    if (isWrappedRedirectUrl(e.url)) {
      filtered.push({
        evidence: e,
        reason: `Wrapped redirect URL detected: ${e.url}`,
      });
      continue;
    }

    // 2. URL normalization dedup
    const normalizedUrl = normalizeUrl(e.url);
    if (seenNormalizedUrls.has(normalizedUrl)) {
      filtered.push({
        evidence: e,
        reason: `Duplicate of normalized URL: ${normalizedUrl}`,
      });
      continue;
    }
    seenNormalizedUrls.add(normalizedUrl);

    // 3. Low credibility filter
    if (
      e.credibilityScore !== null &&
      e.credibilityScore < credibilityThreshold
    ) {
      filtered.push({
        evidence: e,
        reason: `Low credibility score: ${e.credibilityScore} < ${credibilityThreshold}`,
      });
      continue;
    }

    passed.push(e);
  }

  return { passed, filtered };
}

/**
 * Normalize a URL for dedup comparison.
 * Strips query params, fragment, and trailing slash.
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.href.replace(/\/+$/, "");
  } catch {
    return url;
  }
}

/**
 * Detect URLs that are search engine redirect wrappers.
 * These have another full URL embedded in their path (e.g., google.com/url?q=...).
 *
 * Pattern: the pathname contains "http://" or "https://" indicating a wrapped URL.
 */
export function isWrappedRedirectUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /https?:\/\//.test(u.pathname);
  } catch {
    return false;
  }
}
