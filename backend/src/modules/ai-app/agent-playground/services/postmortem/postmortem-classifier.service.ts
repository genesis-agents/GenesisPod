import { Injectable } from "@nestjs/common";

export type FailureMode =
  | "reviewer_loop" // 进度判别 stuckCount 触发
  | "tool_truncation" // truncated=true 频次高
  | "llm_timeout" // AiObservabilityService 高延迟告警 / TIMEOUT 错误
  | "pod_recycle" // mission status 突然 cancelled / heartbeat 超时
  | "schema_reject" // ValidationError 频次高
  | "success"
  | "user_cancel"
  | "unknown";

export interface ClassifyInput {
  status: string;
  events: Array<{ type: string; ts: number; payload?: unknown }>;
  metrics?: {
    totalTokens?: number;
    wallTimeMs?: number;
    toolCalls?: number;
  };
}

export interface ClassifyResult {
  mode: FailureMode;
  signals: string[];
  confidence: number;
}

@Injectable()
export class PostmortemClassifierService {
  classify(input: ClassifyInput): ClassifyResult {
    if (input.status === "completed") {
      return { mode: "success", signals: [], confidence: 1 };
    }

    if (input.status === "cancelled") {
      const lastEvent = input.events[input.events.length - 1];
      if (lastEvent?.type?.includes("user-cancel")) {
        return {
          mode: "user_cancel",
          signals: ["user-initiated"],
          confidence: 1,
        };
      }
      // no user-cancel event → pod recycle
      return {
        mode: "pod_recycle",
        signals: ["no_user_cancel_event"],
        confidence: 0.7,
      };
    }

    // failed status: scan events for dominant signal
    let truncationCount = 0;
    let timeoutCount = 0;
    let schemaRejectCount = 0;
    let stuckRevisionCount = 0;

    for (const e of input.events) {
      if (e.type.includes("tool:truncated")) truncationCount++;
      if (e.type.includes("llm:timeout") || e.type.includes("timeout"))
        timeoutCount++;
      if (
        e.type.includes("validation:failed") ||
        e.type.includes("schema_reject")
      )
        schemaRejectCount++;
      if (
        e.type.includes("revision:stuck") ||
        e.type.includes("chapter:revision")
      )
        stuckRevisionCount++;
    }

    const counts: Array<{
      mode: FailureMode;
      count: number;
      threshold: number;
    }> = [
      { mode: "reviewer_loop", count: stuckRevisionCount, threshold: 5 },
      { mode: "tool_truncation", count: truncationCount, threshold: 5 },
      { mode: "llm_timeout", count: timeoutCount, threshold: 3 },
      { mode: "schema_reject", count: schemaRejectCount, threshold: 3 },
    ];

    counts.sort((a, b) => b.count - a.count);
    const top = counts[0];

    if (top.count >= top.threshold) {
      return {
        mode: top.mode,
        signals: counts
          .filter((c) => c.count > 0)
          .map((c) => `${c.mode}:${c.count}`),
        confidence: Math.min(1, top.count / (top.threshold * 2)),
      };
    }

    return {
      mode: "unknown",
      signals: counts
        .filter((c) => c.count > 0)
        .map((c) => `${c.mode}:${c.count}`),
      confidence: 0,
    };
  }
}
