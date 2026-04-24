/**
 * Throttle key derivation utility.
 *
 * Adapters that fan out into multiple sub-HTTP calls (policy → federal-register /
 * congress-gov / whitehouse-news; academic → openalex / pubmed / arxiv / ...)
 * must route each sub-call through its own throttle bucket to prevent one
 * dimension's 6 parallel fan-outs from stampeding a single upstream API.
 *
 * The convention: `${adapter.sourceId}.${subToolId}`.
 * GlobalSourceThrottleService pre-registers these keys with sensible
 * concurrency limits in DEFAULT_CONCURRENCY; unknown keys fall back to
 * DEFAULT_CONCURRENCY_LIMIT (3).
 */

/**
 * Compose the throttle bucket id for a sub-source within an adapter.
 *
 * @example
 *   subSourceThrottleKey("policy", "federal-register")  // → "policy.federal-register"
 *   subSourceThrottleKey("academic", "arxiv-search")    // → "academic.arxiv-search"
 */
export function subSourceThrottleKey(
  adapterSourceId: string,
  subToolId: string,
): string {
  return `${adapterSourceId}.${subToolId}`;
}
