/**
 * RadarEvents —— DomainEventBus 事件 schema 注册清单
 *
 * 所有 ai-radar.* 事件必须在此声明 zod schema；DomainEventBus 校验未注册的
 * type 一律 drop+warn 不广播。
 *
 * scope.missionId 实际是 RadarRun.id，前端 socket.io room "radar:<runId>"。
 */
import { z } from "zod";
import type { DomainEventTypeSpec } from "@/modules/ai-harness/facade";

export const RunStartedSchema = z.object({
  runId: z.string(),
  topicId: z.string(),
  trigger: z.enum(["MANUAL", "SCHEDULED", "FIRST_RUN"]),
  startedAt: z.string(),
});

export const RunStageSchema = z.object({
  runId: z.string(),
  topicId: z.string(),
  stage: z.string(),
  status: z.enum(["started", "completed", "failed"]),
  message: z.string().optional(),
  metrics: z.record(z.unknown()).optional(),
});

export const RunCompletedSchema = z.object({
  runId: z.string(),
  topicId: z.string(),
  status: z.enum(["COMPLETED", "FAILED", "CANCELLED"]),
  durationMs: z.number(),
  metrics: z.record(z.unknown()),
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
  runId: z.string().optional(),
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
  S("ai-radar.run.started", RunStartedSchema),
  S("ai-radar.run.stage", RunStageSchema),
  S("ai-radar.run.completed", RunCompletedSchema),
  S("ai-radar.run.failed", RunFailedSchema),
  S("ai-radar.run.cancelled", RunCancelledSchema),
  S("ai-radar.insight.created", InsightCreatedSchema),
  S("ai-radar.source.health-changed", SourceHealthChangedSchema),
];
