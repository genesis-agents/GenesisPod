import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  TraceData,
  SpanData,
  TraceSummary,
  CreateTraceInput,
  CreateSpanInput,
  EndSpanInput,
  EndTraceInput,
  ListTracesOptions,
  ExecutionStatus,
} from "./trace.interface";
import { LruMap } from "@/common/utils/lru-map";

/**
 * Trace 收集器服务
 *
 * 提供执行级别的 trace 和 span 收集，用于 AI 执行链路可视化。
 * - 内存存储（Map），支持 FIFO 淘汰
 * - 支持嵌套 span（通过 parentSpanId）
 * - 自动计算执行时长
 * - 全局可注入，可在任何模块中使用
 */
@Injectable()
export class TraceCollectorService {
  private readonly logger = new Logger(TraceCollectorService.name);

  /** 最大存储的 Trace 数量 */
  private readonly MAX_TRACES = 1000;

  /** Trace 存储（按时间顺序） - 使用 LRU 替代手动淘汰 */
  private readonly traces = new LruMap<string, TraceData>(1000);

  /** Span 存储（用于快速查找） */
  private readonly spans = new Map<string, SpanData>();

  /** Trace 按时间排序的 ID 列表（用于 FIFO 淘汰） */
  private traceIdsByTime: string[] = [];

  /**
   * 开始一个新的 Trace
   * @param input Trace 创建参数
   * @returns Trace ID
   */
  startTrace(input: CreateTraceInput): string {
    const traceId = randomUUID();
    const now = new Date();

    const trace: TraceData = {
      id: traceId,
      name: input.name,
      type: input.type,
      status: "running",
      startTime: now,
      metadata: input.metadata || {},
      spans: [],
    };

    this.traces.set(traceId, trace);
    this.traceIdsByTime.push(traceId);

    // FIFO 淘汰 - 修复 off-by-one 错误
    if (this.traces.size >= this.MAX_TRACES) {
      this.evictOldestTrace();
    }

    this.logger.debug(
      `[Trace] Started: ${input.name} (${input.type}) [${traceId}]`,
    );

    return traceId;
  }

  /**
   * 添加一个 Span 到现有 Trace
   * @param traceId Trace ID
   * @param input Span 创建参数
   * @returns Span ID
   */
  addSpan(traceId: string, input: CreateSpanInput): string {
    const trace = this.traces.get(traceId);
    if (!trace) {
      this.logger.warn(`[Trace] Trace not found: ${traceId}`);
      return "";
    }

    const spanId = randomUUID();
    const now = new Date();

    const span: SpanData = {
      id: spanId,
      traceId,
      name: input.name,
      type: input.type,
      status: "running",
      startTime: now,
      metadata: input.metadata || {},
    };

    this.spans.set(spanId, span);
    trace.spans.push(span);

    this.logger.debug(
      `[Trace] Span added: ${input.name} (${input.type}) [${spanId}] -> Trace [${traceId}]`,
    );

    return spanId;
  }

  /**
   * 结束一个 Span
   * @param spanId Span ID
   * @param result 执行结果
   */
  endSpan(spanId: string, result: EndSpanInput): void {
    const span = this.spans.get(spanId);
    if (!span) {
      this.logger.warn(`[Trace] Span not found: ${spanId}`);
      return;
    }

    const now = new Date();
    span.endTime = now;
    span.status = result.status;
    span.duration = result.duration ?? now.getTime() - span.startTime.getTime();
    span.output = result.output;
    span.error = result.error;

    this.logger.debug(
      `[Trace] Span ended: ${span.name} [${spanId}] - ${result.status} (${span.duration}ms)`,
    );
  }

  /**
   * 结束一个 Trace
   * @param traceId Trace ID
   * @param result 执行结果
   */
  endTrace(traceId: string, result: EndTraceInput): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      this.logger.warn(`[Trace] Trace not found: ${traceId}`);
      return;
    }

    const now = new Date();
    trace.endTime = now;
    trace.status = result.status;
    trace.duration =
      result.totalDuration ?? now.getTime() - trace.startTime.getTime();

    this.logger.log(
      `[Trace] Ended: ${trace.name} [${traceId}] - ${result.status} (${trace.duration}ms, ${trace.spans.length} spans)`,
    );
  }

  /**
   * 获取 Trace 详情（用于可视化）
   * @param traceId Trace ID
   * @returns Trace 数据，不存在返回 null
   */
  getTrace(traceId: string): TraceData | null {
    const trace = this.traces.get(traceId);
    if (!trace) {
      return null;
    }

    // 返回深拷贝，避免外部修改
    return JSON.parse(JSON.stringify(trace));
  }

  /**
   * 列出最近的 Trace
   * @param options 筛选选项
   * @returns Trace 摘要列表
   */
  listTraces(options: ListTracesOptions = {}): TraceSummary[] {
    const limit = options.limit ?? 50;
    const traces = Array.from(this.traces.values());

    // 按类型筛选
    let filtered = traces;
    if (options.type) {
      filtered = traces.filter((t) => t.type === options.type);
    }

    // 按时间倒序（最新的在前）
    filtered.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    // 限制数量
    return filtered.slice(0, limit).map((trace) => ({
      id: trace.id,
      name: trace.name,
      type: trace.type,
      status: trace.status,
      startTime: trace.startTime,
      duration: trace.duration,
      spanCount: trace.spans.length,
    }));
  }

  /**
   * 获取 Trace 统计信息
   */
  getStats(): {
    totalTraces: number;
    runningTraces: number;
    totalSpans: number;
    byType: Record<string, number>;
    byStatus: Record<ExecutionStatus, number>;
  } {
    const traces = Array.from(this.traces.values());

    const byType: Record<string, number> = {};
    const byStatus: Record<ExecutionStatus, number> = {
      running: 0,
      success: 0,
      error: 0,
    };

    for (const trace of traces) {
      byType[trace.type] = (byType[trace.type] || 0) + 1;
      byStatus[trace.status] = (byStatus[trace.status] || 0) + 1;
    }

    return {
      totalTraces: traces.length,
      runningTraces: byStatus.running,
      totalSpans: this.spans.size,
      byType,
      byStatus,
    };
  }

  /**
   * 清除所有 Trace（仅用于测试）
   */
  clearAll(): void {
    this.traces.clear();
    this.spans.clear();
    this.traceIdsByTime = [];
    this.logger.log("[Trace] All traces cleared");
  }

  // ==================== Private Methods ====================

  /**
   * FIFO 淘汰最旧的 Trace
   * 跳过 ACTIVE 状态的 trace（只淘汰已完成的）
   */
  private evictOldestTrace(): void {
    // 查找第一个非 ACTIVE 状态的 trace
    let evictedIndex = -1;
    for (let i = 0; i < this.traceIdsByTime.length; i++) {
      const traceId = this.traceIdsByTime[i];
      const trace = this.traces.get(traceId);
      if (trace && trace.status !== "running") {
        evictedIndex = i;
        break;
      }
    }

    if (evictedIndex === -1) {
      // 所有 trace 都是 ACTIVE，不淘汰
      this.logger.warn(`[Trace] All traces are active, cannot evict`);
      return;
    }

    const oldestTraceId = this.traceIdsByTime.splice(evictedIndex, 1)[0];
    const trace = this.traces.get(oldestTraceId);
    if (trace) {
      // 清除相关 Span
      for (const span of trace.spans) {
        this.spans.delete(span.id);
      }
      this.traces.delete(oldestTraceId);
      this.logger.debug(`[Trace] Evicted oldest trace: ${oldestTraceId}`);
    }
  }
}
