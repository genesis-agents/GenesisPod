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
    const relationType = String(rel.relationType || "").toUpperCase() as RelationType;
    if (!RELATION_TYPES.includes(relationType)) {
      dropped.push({ reason: `invalid relationType: ${rel.relationType}`, relation: rel });
      continue;
    }
    const sourceId = resolveId(rel.source);
    const targetId = resolveId(rel.target);
    if (!sourceId || !targetId) {
      dropped.push({ reason: "unresolved source/target entity", relation: rel });
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
