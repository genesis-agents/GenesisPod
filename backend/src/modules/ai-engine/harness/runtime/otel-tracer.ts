/**
 * SOTA Runtime · OTel Tracer
 *
 * 方案文档 §4 / §9。LLM-native observability 标准：每 mission / task / iteration /
 * llm-call / tool-call 是 span，嵌套完整。
 *
 * 本实现提供最小 OTel 兼容接口（不强依赖 @opentelemetry/api 包），后续可平滑接入
 * Langfuse / Jaeger / Arize。当前阶段 span 数据仅 log + 存 AgentStep 的 trace/span id。
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "crypto";

export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly attributes: Record<string, unknown>;
  readonly startedAt: number;
  end(attributes?: Record<string, unknown>): void;
  recordException(err: Error): void;
  setAttributes(attrs: Record<string, unknown>): void;
}

export interface StartSpanOptions {
  readonly parent?: Span;
  readonly attributes?: Record<string, unknown>;
}

@Injectable()
export class AgentTracer {
  private readonly logger = new Logger(AgentTracer.name);

  private generateId(bytes: number): string {
    return randomBytes(bytes).toString("hex");
  }

  startSpan(name: string, options: StartSpanOptions = {}): Span {
    const traceId = options.parent?.traceId ?? this.generateId(16);
    const spanId = this.generateId(8);
    const startedAt = Date.now();
    const attributes = { ...(options.attributes ?? {}) };
    const parentSpanId = options.parent?.spanId;

    const span: Span = {
      traceId,
      spanId,
      parentSpanId,
      name,
      attributes,
      startedAt,
      end: (endAttrs) => {
        const durationMs = Date.now() - startedAt;
        const merged = { ...attributes, ...(endAttrs ?? {}), durationMs };
        this.logger.debug(
          `[span.end] name=${name} trace=${traceId} span=${spanId}${parentSpanId ? ` parent=${parentSpanId}` : ""} ${durationMs}ms`,
        );
        // TODO Phase 7: export to Langfuse
        void merged;
      },
      recordException: (err) => {
        this.logger.warn(
          `[span.exception] name=${name} trace=${traceId} span=${spanId} err=${err.message}`,
        );
      },
      setAttributes: (attrs) => {
        Object.assign(attributes, attrs);
      },
    };
    return span;
  }
}
