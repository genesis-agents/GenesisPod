/**
 * Evidence Distribution Utils
 *
 * 来源：baseline `38347e2a7:services/dimension/dimension-mission.service.ts`
 *   - extractKeywords (L2321-L2456)
 *   - scoreEvidenceForSection (L2137-L2184)
 *   - filterEvidenceForSection (L2192-L2261)
 *   - distributeDiverseEvidence (L2064-L2130)
 *
 * 业务用途：Section-level evidence 分配。
 *   - 每个 section 先拿 top-3 最相关 evidence（跨 section 允许共享）
 *   - 剩余轮询分配（每 section 最多补 5 条独占）
 *   - promptIndex 全局 1-based 编号（跨 section 引用同一来源时编号一致）
 *
 * 业务不变量：
 *   - 每个 section 最多 core(3) + extra(5) = 8 条
 *   - keywords 至少 > 2 字符且不在停用词中
 *   - 时效性加成：<=3 月 +2, <=6 月 +1, 否则 0
 *   - weightProfile 可选（Leader evidenceWeightHint 派生）
 */

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "of",
  "in",
  "to",
  "for",
  "and",
  "or",
  "on",
  "at",
  "by",
  "with",
  "from",
  "as",
  "it",
  "that",
  "this",
  "have",
  "been",
  "will",
  "would",
  "could",
  "should",
  "about",
  "into",
  "more",
  "some",
  "than",
  "them",
  "then",
  "these",
  "those",
  "what",
  "when",
  "where",
  "which",
  "while",
  "also",
  "each",
  "only",
  "such",
  "very",
  "just",
  "over",
  "after",
  "before",
  "between",
  "under",
  "through",
  "during",
  "most",
  "other",
  "being",
  "both",
  "does",
  "done",
  "made",
  "make",
  "many",
  "much",
  "must",
  "need",
  "next",
  "like",
  "well",
  "back",
  "even",
  "still",
  "way",
  // 中文停用词（对齐 baseline L2398-L2448）
  "的",
  "了",
  "在",
  "是",
  "我",
  "有",
  "和",
  "就",
  "不",
  "人",
  "都",
  "一",
  "一个",
  "上",
  "也",
  "很",
  "到",
  "说",
  "要",
  "去",
  "你",
  "会",
  "着",
  "没有",
  "看",
  "好",
  "自己",
  "这",
  "他",
  "她",
  "它",
  "们",
  "那",
  "对",
  "与",
  "及",
  "其",
  "或",
  "但",
  "而",
  "如",
  "中",
  "以",
  "为",
  "等",
  "所",
  "被",
  "把",
  "从",
  "并",
]);

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
const CORE_EVIDENCE_PER_SECTION = 3;
const MAX_EXTRA_EVIDENCE_PER_SECTION = 5;

export interface EvidenceWeightProfile {
  readonly sourceTypeMultipliers: Readonly<Record<string, number>>;
  readonly freshnessBoostFactor: number;
}

export interface EvidenceData {
  readonly id?: string;
  readonly title?: string | null;
  readonly snippet?: string | null;
  readonly url?: string | null;
  readonly sourceType?: string | null;
  readonly publishedAt?: Date | string | null;
  readonly domain?: string | null;
  /** 分配后回填的 1-based 全局 prompt 编号（跨 section 引用同一来源时一致） */
  promptIndex?: number;
}

export interface SectionLite {
  readonly id: string;
  readonly title: string;
  readonly keyPoints: ReadonlyArray<string>;
  readonly description?: string | null;
}

/**
 * 从文本中提取关键词（简单分词 + 停用词过滤）。
 * baseline L2321-L2456 完整对齐。
 *
 * 正则用 Unicode 转义 `一-鿿` 表达 CJK 统一汉字区间，
 * 避免源文件编码/transpile 过程中的字面量漂移。
 */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w一-鿿\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i);
}

/**
 * 对 evidence 按 section 关键词相关性 + 时效性 + source type 加权打分。
 * baseline L2137-L2184。
 */
export function scoreEvidenceForSection(
  section: SectionLite,
  evidenceData: ReadonlyArray<EvidenceData>,
  weightProfile?: EvidenceWeightProfile,
  now: number = Date.now(),
): Array<{ evidence: EvidenceData; score: number }> {
  const keywords = extractKeywords(
    `${section.title} ${section.keyPoints.join(" ")} ${section.description || ""}`,
  );
  if (keywords.length === 0)
    return evidenceData.map((e) => ({ evidence: e, score: 0 }));

  return evidenceData
    .map((e) => {
      const text = `${e.title || ""} ${e.snippet || ""}`.toLowerCase();
      let relevanceScore = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) relevanceScore++;
      }
      let score = relevanceScore;

      if (weightProfile) {
        const sourceKey = (e.sourceType ?? "").toUpperCase();
        const multiplier =
          weightProfile.sourceTypeMultipliers[sourceKey] ?? 1.0;
        score *= multiplier;

        const publishedAt = e.publishedAt
          ? new Date(e.publishedAt).getTime()
          : null;
        if (publishedAt && !Number.isNaN(publishedAt)) {
          const age = now - publishedAt;
          const bonus =
            age <= THREE_MONTHS_MS ? 2 : age <= SIX_MONTHS_MS ? 1 : 0;
          score += bonus * weightProfile.freshnessBoostFactor;
        }
      }

      return { evidence: e, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * 跨 section 多样性分配 evidence。
 * baseline L2064-L2130 完整语义对齐。
 *
 * @returns Map<sectionId, EvidenceData[]>，每个 section 最多 core(3) + extra(5) = 8 条
 */
export function distributeDiverseEvidence(
  sections: ReadonlyArray<SectionLite>,
  evidenceData: ReadonlyArray<EvidenceData>,
  weightProfile?: EvidenceWeightProfile,
): Map<string, EvidenceData[]> {
  const result = new Map<string, EvidenceData[]>();
  if (evidenceData.length === 0 || sections.length === 0) return result;

  // 标记全局 promptIndex（1-based）
  const indexed: EvidenceData[] = evidenceData.map((e, i) => ({
    ...e,
    promptIndex: i + 1,
  }));

  // Step 1: 每 section top-N core (允许跨 section 共享)
  const sectionCore = new Map<string, EvidenceData[]>();
  for (const section of sections) {
    const scored = scoreEvidenceForSection(section, indexed, weightProfile);
    sectionCore.set(
      section.id,
      scored.slice(0, CORE_EVIDENCE_PER_SECTION).map((s) => s.evidence),
    );
  }

  // Step 2: 已被 core 选中的 promptIndex
  const coreIdx = new Set<number>();
  for (const core of sectionCore.values()) {
    for (const e of core) {
      if (typeof e.promptIndex === "number") coreIdx.add(e.promptIndex);
    }
  }

  // Step 3: 剩余轮询分配独占
  const remaining = indexed.filter(
    (e) => typeof e.promptIndex === "number" && !coreIdx.has(e.promptIndex),
  );
  const sectionIds = sections.map((s) => s.id);
  const extras = new Map<string, EvidenceData[]>(
    sectionIds.map((id) => [id, []]),
  );
  for (let i = 0; i < remaining.length; i++) {
    const targetId = sectionIds[i % sectionIds.length];
    const arr = extras.get(targetId)!;
    if (arr.length < MAX_EXTRA_EVIDENCE_PER_SECTION) {
      arr.push(remaining[i]);
    }
  }

  // Step 4: 合并 core + extra
  for (const section of sections) {
    const core = sectionCore.get(section.id) || [];
    const extra = extras.get(section.id) || [];
    result.set(section.id, [...core, ...extra]);
  }

  return result;
}
