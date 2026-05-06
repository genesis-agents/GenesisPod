/**
 * AgentPlayground 事件 payload Zod schemas
 *
 * 单一来源（前后端共用）。每个事件 emit 时由 DomainEventBus.emit() 调用
 * spec.schema.safeParse(payload) 校验；失败在 dev/staging 直接 throw（让 backend
 * 自己炸而不是污染前端 ErrorBoundary），生产降级到 log.warn 不阻断业务。
 *
 * 接入：agent-playground.events.ts 用 T(suffix, schema) 把 schema 写进
 * DomainEventTypeSpec.schema 字段。
 *
 * 前端：通过 z.infer<typeof Schema> 推 TS type，不再 (p.X as Y[])。
 *
 * PoC 范围（2026-05-06）：先给 8 个高风险事件填 schema 作为模式，剩余 ~70 个事件
 * 后续 PR 批量补全。已 burn 过的事件优先：leader:goals-set initialRisks 形状漂移。
 */

import { z } from "zod";

// ─────────── 通用子 schema ───────────
export const DimensionSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  rationale: z.string().optional(),
});
export type DimensionSpec = z.infer<typeof DimensionSpecSchema>;

export const RiskItemSchema = z.object({
  type: z.string(),
  severity: z.string().optional(),
  mitigation: z.string().optional(),
});
export type RiskItem = z.infer<typeof RiskItemSchema>;

// ─────────── leader:goals-set ───────────
// 这就是让我 burn 的事件：initialRisks 是 RiskItem[] 不是 string[]，
// 前端 .map(s => s.slice()) 抛 TypeError → ErrorBoundary。
export const LeaderGoalsSetSchema = z.object({
  goals: z.object({
    successCriteria: z.array(z.string()).optional(),
    deliverables: z.array(z.string()).optional(),
    qualityBar: z
      .object({
        minSources: z.number().optional(),
        minCoverage: z.number().optional(),
        hardConstraints: z.array(z.string()).optional(),
      })
      .partial()
      .optional(),
  }),
  initialRisks: z.array(RiskItemSchema).optional(),
});
export type LeaderGoalsSetPayload = z.infer<typeof LeaderGoalsSetSchema>;

// ─────────── dimensions:appended ───────────
export const DimensionsAppendedSchema = z.object({
  items: z.array(DimensionSpecSchema),
  source: z.enum(["leader-chat", "leader-decision", "auto"]).optional(),
});
export type DimensionsAppendedPayload = z.infer<
  typeof DimensionsAppendedSchema
>;

// ─────────── dimension:retrying ───────────
export const DimensionRetryingSchema = z.object({
  dimension: z.string(),
  attempt: z.number().optional(),
  reason: z.string().optional(),
  strategy: z.string().optional(),
  retryLabel: z.string().optional(),
});
export type DimensionRetryingPayload = z.infer<typeof DimensionRetryingSchema>;

// ─────────── leader:decision ───────────
export const LeaderDecisionSchema = z.object({
  phase: z.string(),
  stats: z.record(z.number()).optional(),
  rationale: z.string().optional(),
  retried: z.array(z.string()).optional(),
  aborted: z.array(z.string()).optional(),
  appended: z.array(DimensionSpecSchema).optional(),
  skipped: z.array(z.string()).optional(),
});
export type LeaderDecisionPayload = z.infer<typeof LeaderDecisionSchema>;

// ─────────── chapter:writing:completed ───────────
export const ChapterWritingCompletedSchema = z.object({
  dimension: z.string(),
  chapterIndex: z.number(),
  attempt: z.number().optional(),
  wordCount: z.number().optional(),
  targetWordCount: z.number().optional(),
  qualified: z.boolean().optional(),
  decision: z.string().optional(),
});
export type ChapterWritingCompletedPayload = z.infer<
  typeof ChapterWritingCompletedSchema
>;

// ─────────── chapter:done ───────────
export const ChapterDoneSchema = z.object({
  dimension: z.string(),
  chapterIndex: z.number(),
  finalAttempt: z.number().optional(),
  finalScore: z.number().optional(),
  finalized: z.boolean().optional(),
  qualified: z.boolean().optional(),
  decision: z.string().optional(),
  wordCount: z.number().optional(),
  targetWordCount: z.number().optional(),
});
export type ChapterDonePayload = z.infer<typeof ChapterDoneSchema>;

// ─────────── reconciliation:completed ───────────
export const ReconciliationCompletedSchema = z.object({
  factCount: z.number().optional(),
  conflictCount: z.number().optional(),
  overlapCount: z.number().optional(),
  gapCount: z.number().optional(),
  figureCount: z.number().optional(),
  warnings: z.array(z.string()).optional(),
});
export type ReconciliationCompletedPayload = z.infer<
  typeof ReconciliationCompletedSchema
>;

// ─────────── critic:verdict ───────────
export const CriticVerdictSchema = z.object({
  agentId: z.string().optional(),
  layer: z.string().optional(),
  score: z.number().optional(),
  pass: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type CriticVerdictPayload = z.infer<typeof CriticVerdictSchema>;
