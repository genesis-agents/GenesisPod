/**
 * social-event-schemas — Zod schemas for social.* DomainEventBus events
 *
 * Mirror of agent-playground/agent-playground.event-schemas.ts。
 *
 * 设计原则：
 *   - lifecycle 事件给最小可观测 payload（status / stage / error）
 *   - narrative / agent / stage 事件给宽容 payload（passthrough record）
 *   - schema fail 走 DomainEventBus 默认 drop+warn（不阻断业务），后续 PR
 *     按字段收紧
 */

import { z } from "zod";

const RecordSchema = z.record(z.string(), z.unknown());

// ── mission lifecycle ─────────────────────────────────────────
export const MissionStartedSchema = z.object({
  platforms: z.array(z.string()).optional(),
  contentId: z.string().optional(),
  depth: z.string().optional(),
  budgetProfile: z.string().optional(),
  language: z.string().optional(),
});

export const MissionCompletedSchema = z.object({
  wallTimeMs: z.number().optional(),
  publishedCount: z.number().optional(),
  failedCount: z.number().optional(),
});

export const MissionFailedSchema = z.object({
  message: z.string(),
  failureCode: z.string().optional(),
  errorName: z.string().optional(),
  wallTimeMs: z.number().optional(),
  source: z.string().optional(),
});

export const MissionAbortedSchema = z.object({
  reason: z.string().optional(),
  wallTimeMs: z.number().optional(),
});

export const MissionDegradedSchema = z.object({
  reason: z.string(),
  stage: z.string().optional(),
});

export const MissionWarningSchema = z.object({
  message: z.string(),
  ageMs: z.number().optional(),
  source: z.string().optional(),
});

export const MissionPostludeStartedSchema = z.object({
  stage: z.string(),
  startedAt: z.number().optional(),
});

export const MissionPostludeCompletedSchema = z.object({
  stage: z.string(),
  wallTimeMs: z.number().optional(),
});

export const MissionPostludeFailedSchema = z.object({
  stage: z.string(),
  error: z.string(),
  wallTimeMs: z.number().optional(),
});

// ── stage lifecycle ───────────────────────────────────────────
export const StageStartedSchema = z.object({
  stepId: z.string(),
  primitive: z.string().optional(),
});

export const StageCompletedSchema = z.object({
  stepId: z.string(),
  primitive: z.string().optional(),
  output: RecordSchema.optional(),
});

export const StageFailedSchema = z.object({
  stepId: z.string(),
  primitive: z.string().optional(),
  error: z.string(),
});

export const StageDegradedSchema = z.object({
  stepId: z.string(),
  reason: z.string(),
});

export const StageStalledSchema = z.object({
  stepId: z.string(),
  elapsedMs: z.number().optional(),
  reason: z.string().optional(),
});

export const StageLifecycleSchema = z.object({
  stage: z.string(),
  stepId: z.string(),
  primitive: z.string().optional(),
  status: z.enum(["started", "completed", "failed"]),
  output: RecordSchema.optional(),
  error: z.string().optional(),
});

// ── agent lifecycle / narrative ──────────────────────────────
export const AgentLifecycleSchema = z.object({
  agentId: z.string(),
  role: z.string(),
  phase: z.enum(["started", "completed", "failed"]),
  detail: RecordSchema.optional(),
});

export const AgentThoughtSchema = RecordSchema;
export const AgentActionSchema = RecordSchema;
export const AgentObservationSchema = RecordSchema;
export const AgentErrorSchema = RecordSchema;

export const AgentNarrativeSchema = z.object({
  stage: z.string(),
  role: z.string(),
  tag: z.string(),
  text: z.string(),
});

// ── cost / budget ─────────────────────────────────────────────
export const CostTickSchema = z.object({
  stage: z.string(),
  tokensUsed: z.number().optional(),
  costUsd: z.number().optional(),
});

export const BudgetExhaustedSchema = z.object({
  reason: z.string(),
  tokensUsed: z.number().optional(),
  costUsd: z.number().optional(),
});

// ── publish-specific（业务）──────────────────────────────────
export const PublishExecuteSummarySchema = z.object({
  platform: z.string(),
  status: z.enum(["PUBLISHED", "FAILED", "SKIPPED"]),
  draftUrl: z.string().nullable().optional(),
  attempt: z.number().optional(),
  errorCode: z.string().optional(),
});

export const PublishVerifySummarySchema = z.object({
  platform: z.string(),
  publishedUrl: z.string().optional(),
  titleMatch: z.boolean().optional(),
  bodySimilarity: z.number().optional(),
});
