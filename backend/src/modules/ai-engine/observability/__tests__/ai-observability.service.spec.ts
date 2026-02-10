/**
 * AiObservabilityService 单元测试
 *
 * 测试覆盖：
 * - recordLLMCall(): 事件记录、环形缓冲区驱逐
 * - getDashboard(): 仪表盘聚合、时间窗口过滤
 * - getModelMetrics(): 模型维度查询
 * - getCostAttribution(): 用户成本归因
 * - getLatencyPercentiles(): 延迟百分位数计算
 * - getRecentErrors(): 错误事件查询
 * - estimateCost(): 静态成本估算
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import {
  AiObservabilityService,
  LLMCallEvent,
} from "../ai-observability.service";

describe("AiObservabilityService", () => {
  let service: AiObservabilityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiObservabilityService],
    }).compile();

    service = module.get<AiObservabilityService>(AiObservabilityService);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper: create a minimal LLM call event
  function createEvent(
    overrides: Partial<Omit<LLMCallEvent, "id" | "timestamp">> = {},
  ): Omit<LLMCallEvent, "id" | "timestamp"> {
    return {
      model: "gpt-4o",
      provider: "openai",
      modelType: "CHAT",
      module: "ai-ask",
      operation: "chat",
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      latencyMs: 500,
      estimatedCost: 0.005,
      success: true,
      fallbackUsed: false,
      retryCount: 0,
      ...overrides,
    };
  }

  // ============================================================================
  // recordLLMCall()
  // ============================================================================

  describe("recordLLMCall()", () => {
    it("should record an event with auto-generated id and timestamp", () => {
      service.recordLLMCall(createEvent());

      const dashboard = service.getDashboard(60);
      expect(dashboard.totalCalls).toBe(1);
      expect(dashboard.totalTokens).toBe(300);
    });

    it("should record multiple events", () => {
      service.recordLLMCall(createEvent());
      service.recordLLMCall(createEvent({ model: "claude-3.5-sonnet" }));
      service.recordLLMCall(createEvent({ model: "grok-2" }));

      const dashboard = service.getDashboard(60);
      expect(dashboard.totalCalls).toBe(3);
    });

    it("should log warning for failed calls", () => {
      const warnSpy = jest.spyOn(Logger.prototype, "warn");

      service.recordLLMCall(
        createEvent({
          success: false,
          error: "rate_limit_exceeded",
        }),
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("LLM 调用失败"),
      );
    });

    it("should log high-cost calls (> $0.10)", () => {
      const logSpy = jest.spyOn(Logger.prototype, "log");

      service.recordLLMCall(
        createEvent({
          estimatedCost: 0.15,
          totalTokens: 50000,
        }),
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("高成本 LLM 调用"),
      );
    });

    it("should log high-latency calls (> 10s)", () => {
      const warnSpy = jest.spyOn(Logger.prototype, "warn");

      service.recordLLMCall(
        createEvent({
          latencyMs: 15000,
        }),
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("高延迟 LLM 调用"),
      );
    });
  });

  // ============================================================================
  // Ring Buffer eviction
  // ============================================================================

  describe("ring buffer", () => {
    it("should evict old events when exceeding MAX_EVENTS", () => {
      // Access private MAX_EVENTS via casting
      const maxEvents = (service as any).MAX_EVENTS;

      // Fill beyond capacity
      for (let i = 0; i < maxEvents + 100; i++) {
        service.recordLLMCall(createEvent({ module: `module-${i}` }));
      }

      // Dashboard should contain at most MAX_EVENTS events
      const dashboard = service.getDashboard(60);
      expect(dashboard.totalCalls).toBeLessThanOrEqual(maxEvents);
    });
  });

  // ============================================================================
  // getDashboard()
  // ============================================================================

  describe("getDashboard()", () => {
    it("should return empty dashboard when no events", () => {
      const dashboard = service.getDashboard(60);

      expect(dashboard.totalCalls).toBe(0);
      expect(dashboard.totalTokens).toBe(0);
      expect(dashboard.totalCost).toBe(0);
      expect(dashboard.successRate).toBe(0);
      expect(dashboard.byModel).toEqual({});
      expect(dashboard.byModule).toEqual({});
      expect(dashboard.byUser).toEqual([]);
      expect(dashboard.recentErrors).toEqual([]);
    });

    it("should aggregate by model correctly", () => {
      service.recordLLMCall(createEvent({ model: "gpt-4o" }));
      service.recordLLMCall(createEvent({ model: "gpt-4o" }));
      service.recordLLMCall(
        createEvent({ model: "claude-3.5-sonnet", latencyMs: 1000 }),
      );

      const dashboard = service.getDashboard(60);

      expect(dashboard.byModel["gpt-4o"].calls).toBe(2);
      expect(dashboard.byModel["claude-3.5-sonnet"].calls).toBe(1);
    });

    it("should aggregate by module correctly", () => {
      service.recordLLMCall(createEvent({ module: "ai-ask" }));
      service.recordLLMCall(createEvent({ module: "ai-ask" }));
      service.recordLLMCall(createEvent({ module: "research" }));

      const dashboard = service.getDashboard(60);

      expect(dashboard.byModule["ai-ask"].calls).toBe(2);
      expect(dashboard.byModule["research"].calls).toBe(1);
    });

    it("should aggregate by user correctly", () => {
      service.recordLLMCall(createEvent({ userId: "user-1" }));
      service.recordLLMCall(createEvent({ userId: "user-1" }));
      service.recordLLMCall(createEvent({ userId: "user-2" }));

      const dashboard = service.getDashboard(60);

      expect(dashboard.byUser).toHaveLength(2);
      const user1 = dashboard.byUser.find((u) => u.userId === "user-1");
      expect(user1?.calls).toBe(2);
    });

    it("should calculate success rate", () => {
      service.recordLLMCall(createEvent({ success: true }));
      service.recordLLMCall(createEvent({ success: true }));
      service.recordLLMCall(
        createEvent({ success: false, error: "timeout" }),
      );

      const dashboard = service.getDashboard(60);

      expect(dashboard.successRate).toBeCloseTo(2 / 3, 5);
    });

    it("should calculate fallback rate", () => {
      service.recordLLMCall(createEvent({ fallbackUsed: false }));
      service.recordLLMCall(createEvent({ fallbackUsed: true }));

      const dashboard = service.getDashboard(60);

      expect(dashboard.fallbackRate).toBeCloseTo(0.5, 5);
    });

    it("should collect recent errors (max 10)", () => {
      for (let i = 0; i < 15; i++) {
        service.recordLLMCall(
          createEvent({ success: false, error: `error-${i}` }),
        );
      }

      const dashboard = service.getDashboard(60);
      expect(dashboard.recentErrors.length).toBeLessThanOrEqual(10);
    });
  });

  // ============================================================================
  // getModelMetrics()
  // ============================================================================

  describe("getModelMetrics()", () => {
    it("should return null for unknown model", () => {
      const result = service.getModelMetrics("unknown-model");
      expect(result).toBeNull();
    });

    it("should return correct metrics for a model", () => {
      service.recordLLMCall(
        createEvent({
          model: "gpt-4o",
          latencyMs: 400,
          totalTokens: 300,
          estimatedCost: 0.005,
        }),
      );
      service.recordLLMCall(
        createEvent({
          model: "gpt-4o",
          latencyMs: 600,
          totalTokens: 500,
          estimatedCost: 0.008,
        }),
      );

      const metrics = service.getModelMetrics("gpt-4o");

      expect(metrics).not.toBeNull();
      expect(metrics!.calls).toBe(2);
      expect(metrics!.tokens).toBe(800);
      expect(metrics!.cost).toBeCloseTo(0.013, 5);
      expect(metrics!.avgLatencyMs).toBe(500);
      expect(metrics!.errorRate).toBe(0);
    });

    it("should calculate error rate for model", () => {
      service.recordLLMCall(createEvent({ model: "gpt-4o", success: true }));
      service.recordLLMCall(
        createEvent({ model: "gpt-4o", success: false, error: "timeout" }),
      );

      const metrics = service.getModelMetrics("gpt-4o");
      expect(metrics!.errorRate).toBeCloseTo(0.5, 5);
    });
  });

  // ============================================================================
  // getCostAttribution()
  // ============================================================================

  describe("getCostAttribution()", () => {
    it("should return zero cost for unknown user", () => {
      const result = service.getCostAttribution("unknown-user");

      expect(result.total).toBe(0);
      expect(result.byModule).toEqual({});
      expect(result.byModel).toEqual({});
    });

    it("should attribute cost by module and model", () => {
      service.recordLLMCall(
        createEvent({
          userId: "user-1",
          module: "ai-ask",
          model: "gpt-4o",
          estimatedCost: 0.01,
        }),
      );
      service.recordLLMCall(
        createEvent({
          userId: "user-1",
          module: "research",
          model: "claude-3.5-sonnet",
          estimatedCost: 0.03,
        }),
      );

      const result = service.getCostAttribution("user-1");

      expect(result.total).toBeCloseTo(0.04, 5);
      expect(result.byModule["ai-ask"]).toBeCloseTo(0.01, 5);
      expect(result.byModule["research"]).toBeCloseTo(0.03, 5);
      expect(result.byModel["gpt-4o"]).toBeCloseTo(0.01, 5);
      expect(result.byModel["claude-3.5-sonnet"]).toBeCloseTo(0.03, 5);
    });
  });

  // ============================================================================
  // getLatencyPercentiles()
  // ============================================================================

  describe("getLatencyPercentiles()", () => {
    it("should return zeros when no events", () => {
      const result = service.getLatencyPercentiles();
      expect(result).toEqual({ p50: 0, p95: 0, p99: 0 });
    });

    it("should calculate percentiles from events", () => {
      // Record 100 events with increasing latency
      for (let i = 1; i <= 100; i++) {
        service.recordLLMCall(createEvent({ latencyMs: i * 10 }));
      }

      const result = service.getLatencyPercentiles();

      expect(result.p50).toBeGreaterThan(0);
      expect(result.p95).toBeGreaterThan(result.p50);
      expect(result.p99).toBeGreaterThanOrEqual(result.p95);
    });

    it("should filter by model when specified", () => {
      service.recordLLMCall(
        createEvent({ model: "gpt-4o", latencyMs: 200 }),
      );
      service.recordLLMCall(
        createEvent({ model: "claude-3.5-sonnet", latencyMs: 1500 }),
      );

      const gptPercentiles = service.getLatencyPercentiles("gpt-4o");
      const claudePercentiles =
        service.getLatencyPercentiles("claude-3.5-sonnet");

      expect(gptPercentiles.p50).toBe(200);
      expect(claudePercentiles.p50).toBe(1500);
    });
  });

  // ============================================================================
  // getRecentErrors()
  // ============================================================================

  describe("getRecentErrors()", () => {
    it("should return empty array when no errors", () => {
      service.recordLLMCall(createEvent({ success: true }));
      expect(service.getRecentErrors()).toEqual([]);
    });

    it("should return failed events in reverse chronological order", () => {
      service.recordLLMCall(
        createEvent({ success: false, error: "error-1" }),
      );
      service.recordLLMCall(
        createEvent({ success: false, error: "error-2" }),
      );

      const errors = service.getRecentErrors();

      expect(errors).toHaveLength(2);
      expect(errors[0].error).toBe("error-2");
    });

    it("should respect limit parameter", () => {
      for (let i = 0; i < 30; i++) {
        service.recordLLMCall(
          createEvent({ success: false, error: `error-${i}` }),
        );
      }

      const errors = service.getRecentErrors(5);
      expect(errors).toHaveLength(5);
    });
  });

  // ============================================================================
  // estimateCost()
  // ============================================================================

  describe("estimateCost()", () => {
    it("should calculate cost for known model", () => {
      const cost = AiObservabilityService.estimateCost("gpt-4o", 1000, 500);
      // gpt-4o: input=0.0025/1K, output=0.01/1K
      // 1000 * 0.0025/1000 + 500 * 0.01/1000 = 0.0025 + 0.005 = 0.0075
      expect(cost).toBeCloseTo(0.0075, 5);
    });

    it("should use default pricing for unknown model", () => {
      const cost = AiObservabilityService.estimateCost(
        "unknown-model",
        1000,
        1000,
      );
      // default: input=0.001/1K, output=0.002/1K
      // 1000 * 0.001/1000 + 1000 * 0.002/1000 = 0.001 + 0.002 = 0.003
      expect(cost).toBeCloseTo(0.003, 5);
    });
  });

  // ============================================================================
  // reset()
  // ============================================================================

  describe("reset()", () => {
    it("should clear all events", () => {
      service.recordLLMCall(createEvent());
      service.recordLLMCall(createEvent());

      service.reset();

      const dashboard = service.getDashboard(60);
      expect(dashboard.totalCalls).toBe(0);
    });
  });
});
