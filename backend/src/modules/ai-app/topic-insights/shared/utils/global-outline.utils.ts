/**
 * Global Outline Computation (算法型)
 *
 * 灵感来源：baseline `leader-planning.planGlobalOutline` (L960-L1260+)，
 * 它用 reasoning LLM 跑 3 次重试产出 GlobalOutline。harness 场景下 LLM
 * 调度已经被 AG-02-DP / AG-11-SY 占用，此处改为**纯算法跨维度协调**：
 *   - globalThemes：各 dim keyFindings 共现 top-N 关键词（跨 ≥2 dim）
 *   - deduplicationRules：识别跨 dim 高度重叠的 keyFinding（编辑距离+关键词重叠）
 *
 * 产出给 AG-11-SY（Synthesizer）作 prompt 附加上下文，让报告显式引用跨维度
 * 主题、避免重复覆盖。不走 LLM → 不占 token budget → 每次都能跑。
 */

import { extractKeywords } from "./evidence-distribution.utils";

export interface DimensionMetaLite {
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly keyFindings: ReadonlyArray<string>;
  readonly summary?: string;
}

export interface GlobalOutlineSummary {
  /** 跨维度共性主题（按共现维度数降序，最多 8 条）*/
  readonly globalThemes: string[];
  /** 去重规则（"主题 X 已在维度 A/B 出现，其他维度只做差异化补充"）*/
  readonly deduplicationRules: string[];
}

const MIN_DIM_COOCCURRENCE = 2;
const MAX_GLOBAL_THEMES = 8;
const MAX_DEDUP_RULES = 6;
const MIN_KEYWORD_LENGTH = 2;

/**
 * 跨维度关键词共现：把每个 dim 的 keyFindings 提关键词，统计"出现在几个 dim 的
 * keyFindings 里"。共现 ≥2 且排名前 N 的就是"全局主题"。
 *
 * baseline L960-L1260 的 LLM 做法更智能（会语义归纳），此处的算法退化实现
 * 保证 token budget 紧张时仍有跨维度视角。
 */
export function computeGlobalOutline(
  metas: ReadonlyArray<DimensionMetaLite>,
): GlobalOutlineSummary {
  if (metas.length < 2) {
    return { globalThemes: [], deduplicationRules: [] };
  }

  // Step 1: 每 dim 提 keyword set
  const dimKeywords = new Map<string, Set<string>>();
  for (const m of metas) {
    const combined = [m.summary ?? "", ...m.keyFindings].join(" ");
    const kws = extractKeywords(combined).filter(
      (w) => w.length >= MIN_KEYWORD_LENGTH,
    );
    dimKeywords.set(m.dimensionId, new Set(kws));
  }

  // Step 2: 统计共现（每个 kw 出现在多少 dim）
  const kwDimCount = new Map<string, Set<string>>();
  for (const [dimId, kws] of dimKeywords.entries()) {
    for (const kw of kws) {
      if (!kwDimCount.has(kw)) kwDimCount.set(kw, new Set());
      kwDimCount.get(kw)!.add(dimId);
    }
  }

  // Step 3: 排序 + 过滤 + 取前 N
  const globalThemes: string[] = Array.from(kwDimCount.entries())
    .filter(([, dims]) => dims.size >= MIN_DIM_COOCCURRENCE)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, MAX_GLOBAL_THEMES)
    .map(([kw]) => kw);

  // Step 4: 去重规则 — 为前 N 个 globalThemes 产出跨维度提示
  const dimNameById = new Map(
    metas.map((m) => [m.dimensionId, m.dimensionName] as const),
  );
  const deduplicationRules: string[] = [];
  for (const kw of globalThemes.slice(0, MAX_DEDUP_RULES)) {
    const dimsWithKw = Array.from(kwDimCount.get(kw) ?? []).map(
      (id) => dimNameById.get(id) ?? id,
    );
    if (dimsWithKw.length < 2) continue;
    deduplicationRules.push(
      `主题「${kw}」在 ${dimsWithKw.join("、")} 多个维度出现；` +
        `请在第一次出现的维度深入展开，其他维度只做差异化视角补充，避免重复描述。`,
    );
  }

  return { globalThemes, deduplicationRules };
}
