/**
 * TraceCollectorService 单元测试
 *
 * 测试 AI 执行链路的 trace 和 span 收集：
 * - startTrace() 创建 Trace
 * - addSpan() 添加 Span
 * - endSpan() / endTrace() 结束
 * - getTrace() 获取详情（深拷贝）
 * - listTraces() 列表查询（筛选/排序/分页）
 * - getStats() 统计信息
 * - FIFO 淘汰（跳过 running 状态）
 * - clearAll() 清除
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { TraceCollectorService } from "../trace-collector.service";

describe("TraceCollectorService", () => {
  let service: TraceCollectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TraceCollectorService],
    }).compile();

    service = module.get<TraceCollectorService>(TraceCollectorService);

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // startTrace
  // =========================================================================

  describe("startTrace", () => {
    it("should create a new trace and return traceId", () => {
      const traceId = service.startTrace({
        name: "Test Research",
        type: "research_mission",
      });

      expect(traceId).toBeDefined();
      expect(typeof traceId).toBe("string");
      expect(traceId.length).toBeGreaterThan(0);
    });

    it("should set initial trace state to running", () => {
      const traceId = service.startTrace({
        name: "Test Trace",
        type: "tool_call",
      });

      const trace = service.getTrace(traceId);
      expect(trace).not.toBeNull();
      expect(trace!.status).toBe("running");
      expect(trace!.name).toBe("Test Trace");
      expect(trace!.type).toBe("tool_call");
      expect(trace!.spans).toEqual([]);
    });

    it("should include metadata when provided", () => {
      const traceId = service.startTrace({
        name: "Test",
        type: "mcp_request",
        metadata: { userId: "user-123", toolName: "search" },
      });

      const trace = service.getTrace(traceId);
      expect(trace!.metadata).toEqual({
        userId: "user-123",
        toolName: "search",
      });
    });

    it("should default metadata to empty object", () => {
      const traceId = service.startTrace({
        name: "Test",
        type: "tool_call",
      });

      const trace = service.getTrace(traceId);
      expect(trace!.metadata).toEqual({});
    });

    it("should generate unique IDs for each trace", () => {
      const id1 = service.startTrace({ name: "T1", type: "tool_call" });
      const id2 = service.startTrace({ name: "T2", type: "tool_call" });

      expect(id1).not.toBe(id2);
    });
  });

  // =========================================================================
  // addSpan
  // =========================================================================

  describe("addSpan", () => {
    it("should add a span to an existing trace", () => {
      const traceId = service.startTrace({
        name: "Research",
        type: "research_mission",
      });

      const spanId = service.addSpan(traceId, {
        name: "LLM Call",
        type: "llm_call",
      });

      expect(spanId).toBeDefined();
      expect(typeof spanId).toBe("string");

      const trace = service.getTrace(traceId);
      expect(trace!.spans).toHaveLength(1);
      expect(trace!.spans[0].name).toBe("LLM Call");
      expect(trace!.spans[0].type).toBe("llm_call");
      expect(trace!.spans[0].status).toBe("running");
    });

    it("should return empty string for non-existent trace", () => {
      const spanId = service.addSpan("non-existent", {
        name: "Span",
        type: "llm_call",
      });

      expect(spanId).toBe("");
    });

    it("should support multiple spans per trace", () => {
      const traceId = service.startTrace({
        name: "Pipeline",
        type: "research_mission",
      });

      service.addSpan(traceId, { name: "Plan", type: "planning" });
      service.addSpan(traceId, { name: "Search", type: "search" });
      service.addSpan(traceId, { name: "Analyze", type: "analysis" });

      const trace = service.getTrace(traceId);
      expect(trace!.spans).toHaveLength(3);
    });

    it("should include span metadata", () => {
      const traceId = service.startTrace({
        name: "T",
        type: "tool_call",
      });

      service.addSpan(traceId, {
        name: "LLM",
        type: "llm_call",
        metadata: { model: "gpt-4o", tokens: 500 },
      });

      const trace = service.getTrace(traceId);
      expect(trace!.spans[0].metadata).toEqual({
        model: "gpt-4o",
        tokens: 500,
      });
    });
  });

  // =========================================================================
  // endSpan
  // =========================================================================

  describe("endSpan", () => {
    it("should set span status and duration", () => {
      const traceId = service.startTrace({
        name: "T",
        type: "tool_call",
      });
      const spanId = service.addSpan(traceId, {
        name: "S",
        type: "llm_call",
      });

      service.endSpan(spanId, {
        status: "success",
        duration: 150,
        output: { result: "ok" },
      });

      const trace = service.getTrace(traceId);
      expect(trace!.spans[0].status).toBe("success");
      expect(trace!.spans[0].duration).toBe(150);
      expect(trace!.spans[0].output).toEqual({ result: "ok" });
    });

    it("should set error information on failure", () => {
      const traceId = service.startTrace({
        name: "T",
        type: "tool_call",
      });
      const spanId = service.addSpan(traceId, {
        name: "S",
        type: "llm_call",
      });

      service.endSpan(spanId, {
        status: "error",
        error: "Timeout exceeded",
      });

      const trace = service.getTrace(traceId);
      expect(trace!.spans[0].status).toBe("error");
      expect(trace!.spans[0].error).toBe("Timeout exceeded");
    });

    it("should auto-calculate duration when not provided", () => {
      const traceId = service.startTrace({
        name: "T",
        type: "tool_call",
      });
      const spanId = service.addSpan(traceId, {
        name: "S",
        type: "llm_call",
      });

      // Small delay to ensure duration > 0
      service.endSpan(spanId, { status: "success" });

      const trace = service.getTrace(traceId);
      expect(trace!.spans[0].duration).toBeGreaterThanOrEqual(0);
      expect(trace!.spans[0].endTime).toBeDefined();
    });

    it("should silently handle non-existent span", () => {
      expect(() => {
        service.endSpan("non-existent", { status: "success" });
      }).not.toThrow();
    });
  });

  // =========================================================================
  // endTrace
  // =========================================================================

  describe("endTrace", () => {
    it("should set trace status and duration", () => {
      const traceId = service.startTrace({
        name: "T",
        type: "research_mission",
      });

      service.endTrace(traceId, {
        status: "success",
        totalDuration: 5000,
      });

      const trace = service.getTrace(traceId);
      expect(trace!.status).toBe("success");
      expect(trace!.duration).toBe(5000);
      expect(trace!.endTime).toBeDefined();
    });

    it("should auto-calculate duration when not provided", () => {
      const traceId = service.startTrace({
        name: "T",
        type: "tool_call",
      });

      service.endTrace(traceId, { status: "error" });

      const trace = service.getTrace(traceId);
      expect(trace!.duration).toBeGreaterThanOrEqual(0);
    });

    it("should silently handle non-existent trace", () => {
      expect(() => {
        service.endTrace("non-existent", { status: "success" });
      }).not.toThrow();
    });
  });

  // =========================================================================
  // getTrace (deep copy)
  // =========================================================================

  describe("getTrace", () => {
    it("should return null for non-existent trace", () => {
      expect(service.getTrace("non-existent")).toBeNull();
    });

    it("should return a deep copy (mutations do not affect internal state)", () => {
      const traceId = service.startTrace({
        name: "Original",
        type: "tool_call",
      });

      const copy = service.getTrace(traceId)!;
      copy.name = "Mutated";
      copy.spans.push({} as any);

      const original = service.getTrace(traceId)!;
      expect(original.name).toBe("Original");
      expect(original.spans).toHaveLength(0);
    });
  });

  // =========================================================================
  // listTraces
  // =========================================================================

  describe("listTraces", () => {
    beforeEach(() => {
      // Create multiple traces of different types
      const t1 = service.startTrace({
        name: "Research 1",
        type: "research_mission",
      });
      service.endTrace(t1, { status: "success", totalDuration: 100 });

      const t2 = service.startTrace({
        name: "Tool Call 1",
        type: "tool_call",
      });
      service.endTrace(t2, { status: "error", totalDuration: 50 });

      service.startTrace({ name: "Research 2", type: "research_mission" });
      // t3 remains running
    });

    it("should return all traces by default (limit 50)", () => {
      const result = service.listTraces();

      expect(result).toHaveLength(3);
    });

    it("should return traces sorted by startTime descending (newest first)", () => {
      const result = service.listTraces();

      // Most recent first
      expect(result[0].name).toBe("Research 2");
    });

    it("should filter by type", () => {
      const result = service.listTraces({ type: "research_mission" });

      expect(result).toHaveLength(2);
      expect(result.every((t) => t.type === "research_mission")).toBe(true);
    });

    it("should limit results", () => {
      const result = service.listTraces({ limit: 1 });

      expect(result).toHaveLength(1);
    });

    it("should return TraceSummary format", () => {
      const result = service.listTraces();
      const first = result[0];

      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("name");
      expect(first).toHaveProperty("type");
      expect(first).toHaveProperty("status");
      expect(first).toHaveProperty("startTime");
      expect(first).toHaveProperty("spanCount");
    });

    it("should include correct span count", () => {
      const traceId = service.startTrace({
        name: "With Spans",
        type: "tool_call",
      });
      service.addSpan(traceId, { name: "S1", type: "llm_call" });
      service.addSpan(traceId, { name: "S2", type: "search" });

      const result = service.listTraces();
      const withSpans = result.find((t) => t.name === "With Spans");
      expect(withSpans!.spanCount).toBe(2);
    });
  });

  // =========================================================================
  // getStats
  // =========================================================================

  describe("getStats", () => {
    it("should return zero stats when empty", () => {
      const stats = service.getStats();

      expect(stats.totalTraces).toBe(0);
      expect(stats.runningTraces).toBe(0);
      expect(stats.totalSpans).toBe(0);
      expect(stats.byType).toEqual({});
      expect(stats.byStatus).toEqual({ running: 0, success: 0, error: 0 });
    });

    it("should count traces by type", () => {
      service.startTrace({ name: "R1", type: "research_mission" });
      service.startTrace({ name: "R2", type: "research_mission" });
      service.startTrace({ name: "T1", type: "tool_call" });

      const stats = service.getStats();

      expect(stats.totalTraces).toBe(3);
      expect(stats.byType.research_mission).toBe(2);
      expect(stats.byType.tool_call).toBe(1);
    });

    it("should count traces by status", () => {
      const t1 = service.startTrace({ name: "R1", type: "tool_call" });
      service.endTrace(t1, { status: "success" });

      const t2 = service.startTrace({ name: "R2", type: "tool_call" });
      service.endTrace(t2, { status: "error" });

      service.startTrace({ name: "R3", type: "tool_call" }); // running

      const stats = service.getStats();

      expect(stats.byStatus.success).toBe(1);
      expect(stats.byStatus.error).toBe(1);
      expect(stats.byStatus.running).toBe(1);
      expect(stats.runningTraces).toBe(1);
    });

    it("should count total spans", () => {
      const t1 = service.startTrace({ name: "T", type: "tool_call" });
      service.addSpan(t1, { name: "S1", type: "llm_call" });
      service.addSpan(t1, { name: "S2", type: "search" });

      const t2 = service.startTrace({ name: "T2", type: "mcp_request" });
      service.addSpan(t2, { name: "S3", type: "tool_execution" });

      const stats = service.getStats();
      expect(stats.totalSpans).toBe(3);
    });
  });

  // =========================================================================
  // FIFO eviction
  // =========================================================================

  describe("FIFO eviction", () => {
    it("should evict oldest completed trace when at capacity", () => {
      const maxTraces = (service as any).MAX_TRACES;

      // Fill to capacity with completed traces
      for (let i = 0; i < maxTraces; i++) {
        const traceId = service.startTrace({
          name: `Trace-${i}`,
          type: "tool_call",
        });
        service.endTrace(traceId, { status: "success" });
      }

      const statsBefore = service.getStats();
      expect(statsBefore.totalTraces).toBeLessThanOrEqual(maxTraces);

      // Adding one more should trigger eviction
      service.startTrace({ name: "Overflow", type: "tool_call" });

      const statsAfter = service.getStats();
      expect(statsAfter.totalTraces).toBeLessThanOrEqual(maxTraces);
    });

    it("should skip running traces during eviction", () => {
      const maxTraces = (service as any).MAX_TRACES;

      // Create one running trace first
      const runningTraceId = service.startTrace({
        name: "Running-Trace",
        type: "research_mission",
      });

      // Fill remaining with completed traces
      for (let i = 0; i < maxTraces - 1; i++) {
        const traceId = service.startTrace({
          name: `Completed-${i}`,
          type: "tool_call",
        });
        service.endTrace(traceId, { status: "success" });
      }

      // Trigger eviction
      service.startTrace({ name: "Overflow", type: "tool_call" });

      // Running trace should still exist
      const runningTrace = service.getTrace(runningTraceId);
      expect(runningTrace).not.toBeNull();
      expect(runningTrace!.name).toBe("Running-Trace");
    });
  });

  // =========================================================================
  // clearAll
  // =========================================================================

  describe("clearAll", () => {
    it("should remove all traces and spans", () => {
      const traceId = service.startTrace({
        name: "T",
        type: "tool_call",
      });
      service.addSpan(traceId, { name: "S", type: "llm_call" });

      service.clearAll();

      const stats = service.getStats();
      expect(stats.totalTraces).toBe(0);
      expect(stats.totalSpans).toBe(0);
    });

    it("should make previously existing traces inaccessible", () => {
      const traceId = service.startTrace({
        name: "T",
        type: "tool_call",
      });

      service.clearAll();

      expect(service.getTrace(traceId)).toBeNull();
    });
  });
});
