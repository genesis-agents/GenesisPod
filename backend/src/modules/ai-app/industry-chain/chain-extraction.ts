/**
 * Industry Chain — Extraction Schema & Deterministic Mapping
 *
 * chain-mapper agent 直出的结构化产业链抽取结果（Zod 约束），以及把它映射/校验为
 * 可落库 IndustryRelation 行的**纯函数**（M2 映射 + M8 结构校验，零 LLM、零 DB，可离线单测）。
 */

import { z } from "zod";

// ── 枚举（app 层 TS 联合，DB 用 String 存）──────────────────────────────────
export const RELATION_TYPES = [
  "SUPPLIES",
  "CONSUMES",
  "COMPETES_WITH",
  "PARTNERS_WITH",
  "BELONGS_TO",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const ENTITY_TYPES = ["SEGMENT", "COMPANY", "PRODUCT"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

// ── Zod schema：chain-mapper agent 的结构化输出契约 ─────────────────────────
export const SourceRefSchema = z.object({
  accessionNumber: z.string().optional(),
  url: z.string().optional(),
  reportType: z.string().optional(),
  date: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const ChainSegmentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  order: z.number().optional(),
});

export const ChainCompanySchema = z.object({
  name: z.string().min(1),
  cik: z.string().optional(),
  segment: z.string().optional(),
  description: z.string().optional(),
  sourceRefs: z.array(SourceRefSchema).optional(),
});

export const ChainRelationSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  relationType: z.string().min(1),
  evidence: z.string().optional(),
  weight: z.number().optional(),
});

export const ChainExtractionResultSchema = z.object({
  segments: z.array(ChainSegmentSchema).default([]),
  companies: z.array(ChainCompanySchema).default([]),
  relations: z.array(ChainRelationSchema).default([]),
});
export type ChainExtractionResult = z.infer<typeof ChainExtractionResultSchema>;

export interface ResolvedRelationRow {
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  weight: number | null;
  evidence: string | null;
}

export interface RelationMappingResult {
  rows: ResolvedRelationRow[];
  dropped: Array<{ reason: string; relation: unknown }>;
}

/** M8：sourceRefs.url 协议白名单（仅 http/https，挡 javascript:/data: 等 XSS 入口）。 */
export function isSafeSourceUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  return /^https?:\/\//i.test(url.trim());
}

/** 过滤 sourceRefs，剔除非法 URL 的引用。 */
export function sanitizeSourceRefs(refs: unknown): SourceRef[] {
  if (!Array.isArray(refs)) return [];
  return refs
    .filter((r): r is SourceRef => !!r && typeof r === "object")
    .map((r) => ({ ...r }))
    .filter((r) => r.url === undefined || isSafeSourceUrl(r.url));
}

/**
 * M2 + M8：把抽取的自然语言关系映射为可落库行 + 确定性结构校验。
 *
 * @param relations    chain-mapper 抽取的关系
 * @param canonicalOf  原始名 → canonical 名（来自 EntityResolutionService）
 * @param canonicalToId canonical 名 → 已落库 IndustryEntity.id
 */
export function buildRelationRows(
  relations: ChainExtractionResult["relations"],
  canonicalOf: Record<string, string>,
  canonicalToId: Map<string, string>,
): RelationMappingResult {
  const rows: ResolvedRelationRow[] = [];
  const dropped: Array<{ reason: string; relation: unknown }> = [];
  const seen = new Set<string>();

  const resolveId = (name: string): string | undefined => {
    const canonical = canonicalOf[name] ?? name;
    return canonicalToId.get(canonical);
  };

  for (const rel of relations) {
    const relationType = String(
      rel.relationType || "",
    ).toUpperCase() as RelationType;
    if (!RELATION_TYPES.includes(relationType)) {
      dropped.push({
        reason: `invalid relationType: ${rel.relationType}`,
        relation: rel,
      });
      continue;
    }
    const sourceId = resolveId(rel.source);
    const targetId = resolveId(rel.target);
    if (!sourceId || !targetId) {
      dropped.push({
        reason: "unresolved source/target entity",
        relation: rel,
      });
      continue;
    }
    if (sourceId === targetId) {
      dropped.push({ reason: "self-loop rejected", relation: rel });
      continue;
    }
    const key = `${sourceId}|${targetId}|${relationType}`;
    if (seen.has(key)) {
      dropped.push({ reason: "duplicate edge", relation: rel });
      continue;
    }
    seen.add(key);

    // weight：越界/NaN → null（不丢整条关系）
    let weight: number | null = null;
    if (typeof rel.weight === "number" && rel.weight >= 0 && rel.weight <= 1) {
      weight = rel.weight;
    }

    rows.push({
      sourceId,
      targetId,
      relationType,
      weight,
      evidence: rel.evidence ?? null,
    });
  }

  return { rows, dropped };
}

/** 环节名归一（trim + lowercase），供公司 segment 字段匹配已声明环节。 */
export function normalizeSegmentName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * 合成产业链**结构骨架**边（确定性，零 LLM）——使图谱必然连通：
 *   - 环节脊柱：按 order 排好的相邻环节 upstream SUPPLIES downstream
 *   - 公司归属：公司 BELONGS_TO 其所属环节
 *
 * 背景：chain-mapper agent 实测常吐空 relations 或名字对不上落库实体（→ buildRelationRows
 * 全 drop），导致"20 节点 0 关系"的散点图。结构边由已落库实体 id 直接合成，不依赖 LLM。
 *
 * @param orderedSegmentIds  已按 order 排序的环节实体 id
 * @param companySegmentPairs 公司 id → 其所属环节 id
 */
export function buildStructuralRows(
  orderedSegmentIds: string[],
  companySegmentPairs: Array<{ companyId: string; segmentId: string }>,
): ResolvedRelationRow[] {
  const rows: ResolvedRelationRow[] = [];
  for (let i = 0; i + 1 < orderedSegmentIds.length; i++) {
    rows.push({
      sourceId: orderedSegmentIds[i],
      targetId: orderedSegmentIds[i + 1],
      relationType: "SUPPLIES",
      weight: null,
      evidence: null,
    });
  }
  for (const { companyId, segmentId } of companySegmentPairs) {
    rows.push({
      sourceId: companyId,
      targetId: segmentId,
      relationType: "BELONGS_TO",
      weight: null,
      evidence: null,
    });
  }
  return rows;
}

// SEC 8-K item 代码 → 中文事件一句话（9.01=财务附件，仅作兜底不优先）。
const EIGHTK_ITEM_LABELS: Record<string, string> = {
  "1.01": "签署重大协议",
  "1.02": "终止重大协议",
  "1.03": "破产 / 重整",
  "2.01": "完成并购 / 资产处置",
  "2.02": "业绩发布",
  "2.03": "新增重大债务",
  "2.05": "重组 / 减值",
  "3.01": "退市 / 上市规则事项",
  "3.02": "股票增发",
  "5.01": "控制权变更",
  "5.02": "高管 / 董事变动",
  "5.07": "股东投票结果",
  "7.01": "信息披露 (Reg FD)",
  "8.01": "其他重大事项",
  "9.01": "财务报表 / 附件",
};

/**
 * 把一条 SEC 备案分类成「一句话事件标签 + 是否内部人」。纯函数，可离线单测。
 *   - 3/4/5（含 /A）→ 内部人交易（insider=true，调用方应归并计数，避免一排重复）
 *   - SC 13D/13G → 举牌 / 大股东
 *   - 8-K → 按 items 代码提炼具体事件（优先非 9.01）
 *   - 其余 → null（过滤）
 */
export function classifyFiling(
  form: string,
  items?: string,
): { label: string | null; insider: boolean } {
  const f = (form || "").toUpperCase().trim();
  if (["3", "4", "5", "3/A", "4/A", "5/A"].includes(f)) {
    return { label: "内部人交易", insider: true };
  }
  if (f.startsWith("SC 13D"))
    return { label: "举牌（主动增持）", insider: false };
  if (f.startsWith("SC 13G"))
    return { label: "大股东持股（被动）", insider: false };
  if (f.startsWith("8-K")) {
    const codes = (items || "")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const code of codes) {
      if (code !== "9.01" && EIGHTK_ITEM_LABELS[code]) {
        return { label: EIGHTK_ITEM_LABELS[code], insider: false };
      }
    }
    return { label: "重大事件", insider: false };
  }
  return { label: null, insider: false };
}

/** 合并多组关系行：按 (source|target|type) 去重 + 去自环。结构边与 LLM 边在此并轨。 */
export function mergeRelationRows(
  ...groups: ResolvedRelationRow[][]
): ResolvedRelationRow[] {
  const seen = new Set<string>();
  const out: ResolvedRelationRow[] = [];
  for (const group of groups) {
    for (const r of group) {
      if (r.sourceId === r.targetId) continue;
      const key = `${r.sourceId}|${r.targetId}|${r.relationType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}
