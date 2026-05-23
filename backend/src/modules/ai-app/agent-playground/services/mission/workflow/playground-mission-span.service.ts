/**
 * PlaygroundMissionSpanService — R2-#38 OTel span emission
 *
 * Emits a root OTel span per mission and child spans per stage via AgentTracer.
 * AgentTracer is already provided by HarnessModule and routes completed spans to
 * SpanExporter sinks (Logger + Langfuse when configured).
 *
 * Remaining seam (documented):
 *   - Agent-level spans (task / iteration / tool-call) are already emitted by
 *     ReactRunner and ToolInvoker inside ai-harness/runner. Those spans share the
 *     same traceId as the mission span only if the caller propagates the parent span.
 *     Full propagation into AgentInvoker.invoke() would require threading the parent
 *     span through RunMissionInput → AgentExecutionContext, which is a broader harness
 *     change. For now, mission + stage spans are emitted independently; they appear in
 *     the same export sink but do not form a single nested trace tree with agent spans.
 */

import { Injectable, Optional } from "@nestjs/common";
import { AgentTracer } from "@/modules/ai-harness/facade";
import type { Span } from "@/modules/ai-harness/facade";

@Injectable()
export class PlaygroundMissionSpanService {
  /** Active mission-level root spans keyed by missionId */
  private readonly missionSpans = new Map<string, Span>();
  /** Active stage-level child spans keyed by `${missionId}:${stepId}` */
  private readonly stageSpans = new Map<string, Span>();

  constructor(@Optional() private readonly tracer?: AgentTracer) {}

  /** Start a root span for the entire mission. */
  startMissionSpan(missionId: string, topic: string): void {
    if (!this.tracer) return;
    const span = this.tracer.startSpan("playground.mission", {
      attributes: { missionId, topic, "playground.type": "agent-playground" },
    });
    this.missionSpans.set(missionId, span);
  }

  /** Start a child stage span under the mission root span. */
  startStageSpan(missionId: string, stepId: string, primitive: string): void {
    if (!this.tracer) return;
    const key = `${missionId}:${stepId}`;
    // Guard: if a span for this key already exists (stage re-entry on crash-resume),
    // end it as aborted before overwriting — prevents orphaned spans in the exporter.
    const existing = this.stageSpans.get(key);
    if (existing) {
      existing.end({ status: "aborted" });
      this.stageSpans.delete(key);
    }
    const parent = this.missionSpans.get(missionId);
    const span = this.tracer.startSpan(`playground.stage.${stepId}`, {
      parent,
      attributes: { missionId, stepId, primitive },
    });
    this.stageSpans.set(key, span);
  }

  /** End a stage span, recording failure if provided. */
  endStageSpan(
    missionId: string,
    stepId: string,
    status: "completed" | "failed",
    error?: unknown,
  ): void {
    const key = `${missionId}:${stepId}`;
    const span = this.stageSpans.get(key);
    if (!span) return;
    if (status === "failed" && error instanceof Error) {
      span.recordException(error);
    }
    span.end({ status });
    this.stageSpans.delete(key);
  }

  /** End the root mission span. */
  endMissionSpan(
    missionId: string,
    status: "completed" | "failed" | "aborted",
    error?: unknown,
  ): void {
    const span = this.missionSpans.get(missionId);
    if (!span) return;
    if (status === "failed" && error instanceof Error) {
      span.recordException(error);
    }
    span.end({ status });
    this.missionSpans.delete(missionId);
  }
}
