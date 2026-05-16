/**
 * RadarEvents —— DomainEventBus 事件类型注册清单
 *
 * 所有 radar.* 事件必须在此声明。DomainEventBus 校验：未注册 type 一律 drop+warn。
 *
 * Scope: payload.missionId 字段实际是 RadarRun.id（路由到 socket room "radar:<runId>"）；
 *        topicId 单独放 payload，前端用 runId 加房间，用 topicId 做业务关联。
 */

import { z } from "zod";
import type { DomainEventTypeSpec } from "@/modules/ai-harness/facade";

// run lifecycle
export const RunStartedSchema = z.object({
  runId: z.string(),
  topicId: z.string(),
  trigger: z.enum(["MANUAL", "SCHEDULED", "FIRST_RUN"]),
  startedAt: z.string(),
});

export const RunStageSchema = z.object({
  runId: z.string(),
  topicId: z.string(),
  stage: z.enum([
    "collect",
    "dedupe",
    "relevance",
    "quality",
    "entity",
    "insight",
    "persist",
  ]),
  status: z.enum(["started", "completed", "failed", "skipped"]),
  message: z.string().optional(),
  metrics: z.record(z.unknown()).optional(),
});

export const RunCompletedSchema = z.object({
  runId: z.string(),
  topicId: z.string(),
  status: z.enum(["COMPLETED", "FAILED", "CANCELLED"]),
  durationMs: z.number(),
  metrics: z.object({
    itemsFetched: z.number(),
    itemsDeduped: z.number(),
    itemsInserted: z.number(),
    sourcesAttempted: z.number(),
    sourcesFailed: z.number(),
    itemsEvaluated: z.number().optional(),
    itemsAccepted: z.number().optional(),
    insightCreated: z.boolean().optional(),
  }),
});

export const RunFailedSchema = z.object({
  runId: z.string(),
  topicId: z.string(),
  error: z.string(),
  durationMs: z.number(),
});

export const RunCancelledSchema = z.object({
  runId: z.string(),
  topicId: z.string(),
  reason: z.string(),
});

export const InsightCreatedSchema = z.object({
  runId: z.string(),
  topicId: z.string(),
  insightId: z.string(),
  signalCount: z.number(),
  entityCount: z.number(),
});

export const SourceHealthChangedSchema = z.object({
  runId: z.string(),
  topicId: z.string(),
  sourceId: z.string(),
  health: z.enum(["HEALTHY", "DEGRADED", "FAILING", "UNKNOWN"]),
  consecutiveFailures: z.number(),
});

const S = <TPayload>(
  type: string,
  schema: z.ZodType<TPayload>,
): DomainEventTypeSpec<TPayload> => ({ type, schema });

export const RADAR_DOMAIN_EVENTS: readonly DomainEventTypeSpec[] = [
  S("radar.run.started", RunStartedSchema),
  S("radar.run.stage", RunStageSchema),
  S("radar.run.completed", RunCompletedSchema),
  S("radar.run.failed", RunFailedSchema),
  S("radar.run.cancelled", RunCancelledSchema),
  S("radar.insight.created", InsightCreatedSchema),
  S("radar.source.health-changed", SourceHealthChangedSchema),
];
