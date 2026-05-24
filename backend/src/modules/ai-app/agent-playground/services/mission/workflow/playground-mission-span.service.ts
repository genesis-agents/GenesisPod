/**
 * PlaygroundMissionSpanService — R2-#38 OTel span emission
 *
 * Emits a root OTel span per mission and child spans per stage via AgentTracer.
 * AgentTracer is already provided by HarnessModule and routes completed spans to
 * SpanExporter sinks (Logger + Langfuse when configured).
 *
 * #38 agent-level nesting (minimal, implemented):
 *   startAgentSpan / endAgentSpan create a child span parented to the currently
 *   active stage span for the given missionId. AgentInvoker wraps each role
 *   invocation with these calls so the agent span is nested under its stage span
 *   in the trace tree.
 *
 * Remaining seam (deferred — iteration/tool-level threading):
 *   Full iteration/tool-level nesting would require propagating the parent span
 *   through RunOptions.parentSpan → AgentRunner.run() → loop → AgentTracer.startSpan.
 *   That path needs AgentRunner to accept and inject AgentTracer (touching
 *   ai-harness/harness.module DI, which is outside the R3-#38 minimal whitelist).
 *   RunOptions.parentSpan JSDoc seam is already present as the hook point.
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
  /**
   * Tracks the currently-active stepId per mission so startAgentSpan can
   * resolve the parent stage span without the caller needing to pass stepId.
   */
  private readonly currentStepId = new Map<string, string>();
  /** Active agent-level child spans keyed by `${missionId}:${agentId}` */
  private readonly agentSpans = new Map<string, Span>();

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
    // Track active step so startAgentSpan can parent itself here.
    this.currentStepId.set(missionId, stepId);
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
    // Clear current step tracking if it still points to this stepId.
    if (this.currentStepId.get(missionId) === stepId) {
      this.currentStepId.delete(missionId);
    }
  }

  /**
   * Start a child span for a single agent role invocation.
   *
   * The span is parented to the currently active stage span for the mission.
   * If no stage span is active (or tracer is absent), returns undefined — the
   * caller must handle this gracefully (i.e. skip endAgentSpan).
   *
   * Parent linkage: currentStepId[missionId] → stageSpans[missionId:stepId] → span.
   * The returned span's parentSpanId equals the stage span's spanId, placing it
   * directly under the stage node in the trace tree.
   */
  startAgentSpan(missionId: string, agentId: string): Span | undefined {
    if (!this.tracer) return undefined;
    const stepId = this.currentStepId.get(missionId);
    if (!stepId) return undefined;
    const parent = this.stageSpans.get(`${missionId}:${stepId}`);
    if (!parent) return undefined;
    const span = this.tracer.startSpan("playground.agent", {
      parent,
      attributes: { missionId, agentId, stepId },
    });
    // Key by missionId:agentId — one active agent span per (mission, agentId) at a time.
    this.agentSpans.set(`${missionId}:${agentId}`, span);
    return span;
  }

  /** End the agent-level span for the given missionId + agentId. No-op if absent. */
  endAgentSpan(
    missionId: string,
    agentId: string,
    status: "completed" | "failed",
    error?: unknown,
  ): void {
    const key = `${missionId}:${agentId}`;
    const span = this.agentSpans.get(key);
    if (!span) return;
    if (status === "failed" && error instanceof Error) {
      span.recordException(error);
    }
    span.end({ status });
    this.agentSpans.delete(key);
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
