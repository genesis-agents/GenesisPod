/**
 * evidence-budget.ts — 来源充分性的单一权威（Capability Contract · "Resolve")
 *
 * 背景（2026-05-21 根因）：质量闸的来源要求（chapter-reviewer 每章≥2 引用、
 * dimension-quality-judge 每章≥2 域名 / 维度≥5 唯一 URL）与采集端的供给下限
 * （minFindingsThreshold=4，无域名多样性约束）各写各的常量，留出"采得少却要得多"
 * 的不可满足死区 → 章节被结构性打回 → 重写循环 → 超时失败。
 *
 * 本模块把"来源供给"算成一份契约：采集后算一次，下游的章节数 / 每章引用阈值都
 * 由它**派生**，而不是各自断言固定值。供给多则不缩水，供给少则少开章、降阈值，
 * 让审核**永远可满足**。
 *
 * 纯函数，0 DI，0 LLM 调用 —— 易测、易守护。
 */

export interface EvidenceBudget {
  /** 去重后的唯一来源数（按 source 字符串）—— 章节封顶 deriveMaxChapters 的依据 */
  uniqueSources: number;
  /**
   * 去重后的唯一域名数（URL 取 hostname，非 URL 取来源串本身）。
   * ★ 信息性字段：仅用于日志 / 降级叙述；章节封顶用 uniqueSources，不用本字段。
   */
  uniqueDomains: number;
  /** finding 总数（含重复来源） */
  totalFindings: number;
}

/** 从 source 串提取域名：URL 取 hostname（去 www.），非 URL 退化为来源串本身。 */
export function extractDomain(source: string): string {
  const s = (source ?? "").trim();
  if (!s) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    // `https://非URL文本` 会被解析成 hostname=非url文本片段 —— 仅当含点号才当作真实域名
    if (host.includes(".")) return host;
  } catch {
    /* 非 URL，退化 */
  }
  return s.toLowerCase().slice(0, 80);
}

/** 采集结束后算一次来源契约。 */
export function computeEvidenceBudget(
  findings: ReadonlyArray<{ source: string }>,
): EvidenceBudget {
  const sources = new Set<string>();
  const domains = new Set<string>();
  for (const f of findings) {
    const s = (f?.source ?? "").trim();
    if (!s) continue;
    sources.add(s.toLowerCase());
    const d = extractDomain(s);
    if (d) domains.add(d);
  }
  return {
    uniqueSources: sources.size,
    uniqueDomains: domains.size,
    totalFindings: findings.length,
  };
}

/**
 * 由来源供给推导章节数上限：每章尽量分到 ≥2 个唯一来源。
 * 5 个唯一来源 → 最多 2 章（而非硬开 7 章），≥1。供给充足时不缩水（取 idealChapters）。
 */
export function deriveMaxChapters(
  budget: EvidenceBudget,
  idealChapters: number,
): number {
  const bySources = Math.floor(budget.uniqueSources / 2);
  return Math.max(1, Math.min(idealChapters, bySources));
}

/**
 * 由本章实际分到的来源数推导"引用下限"。
 * 标准 ≥2；本章来源不足 2 时降到实际数；0 来源不要求引用（无源可引）。
 */
export function deriveCitationFloor(sourcesInChapter: number): number {
  return Math.min(2, Math.max(0, Math.floor(sourcesInChapter)));
}
