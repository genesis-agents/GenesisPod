/**
 * UT-CRED-COUNT · countDimensionEvidence
 *
 * 统计每个维度的证据数量 / 可用证据数量（credibility >= threshold）
 * / 独特来源域名数。
 *
 * 设计约束（原则 6 evidenceUsed 从 DB count 读，agent 报多少都不信）：
 * 这个 utility 的调用方**必须**是 DB 查询结果的消费者。不要把 agent
 * 自报的 evidenceUsed 传进来。
 */

export interface EvidenceCountInput {
  readonly dimensionId: string;
  readonly credibilityScore?: number | null;
  readonly domain?: string | null;
  readonly url?: string | null;
}

export interface DimensionEvidenceStats {
  readonly dimensionId: string;
  readonly total: number;
  readonly highCredibility: number;
  readonly uniqueDomains: number;
}

export interface CountOptions {
  /** credibility 阈值，>= 该值记入 highCredibility（默认 70） */
  highCredibilityThreshold?: number;
}

export function countDimensionEvidence(
  evidences: ReadonlyArray<EvidenceCountInput>,
  options: CountOptions = {},
): DimensionEvidenceStats[] {
  const threshold = options.highCredibilityThreshold ?? 70;

  const groups = new Map<
    string,
    { total: number; high: number; domains: Set<string> }
  >();

  for (const e of evidences) {
    if (!e.dimensionId) continue;
    let g = groups.get(e.dimensionId);
    if (!g) {
      g = { total: 0, high: 0, domains: new Set<string>() };
      groups.set(e.dimensionId, g);
    }
    g.total += 1;
    if ((e.credibilityScore ?? 0) >= threshold) g.high += 1;
    const domain = e.domain ?? hostFromUrl(e.url);
    if (domain) g.domains.add(domain);
  }

  return Array.from(groups.entries())
    .map(([dimensionId, g]) => ({
      dimensionId,
      total: g.total,
      highCredibility: g.high,
      uniqueDomains: g.domains.size,
    }))
    .sort((a, b) => a.dimensionId.localeCompare(b.dimensionId));
}

function hostFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
