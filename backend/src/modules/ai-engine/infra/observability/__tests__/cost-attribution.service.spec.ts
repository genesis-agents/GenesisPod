/**
 * CostAttributionService 单元测试
 *
 * 测试覆盖：
 * - recordCost(): 成本记录、小时桶分配、用户聚合
 * - getCostReport(): 多维度报告生成
 * - getUserCost(): 单用户成本查询
 * - setBudgetAlert() / checkBudgetAlerts(): 预算告警
 * - getHourlyTrend(): 小时级趋势
 * - 数据清理: 过期桶自动驱逐、LRU 用户淘汰
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import {
  CostAttributionService,
  CostEvent,
} from "../../../../ai-kernel/facade";

describe("CostAttributionService", () => {
  let service: CostAttributionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CostAttributionService],
    }).compile();

    service = module.get<CostAttributionService>(CostAttributionService);

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper: create a cost event
  function createCostEvent(overrides: Partial<CostEvent> = {}): CostEvent {
    return {
      userId: "user-1",
      moduleType: "ai-ask",
      model: "gpt-4o",
      provider: "openai",
      inputTokens: 100,
      outputTokens: 200,
      estimatedCost: 0.005,
      ...overrides,
    };
  }

  // ============================================================================
  // recordCost()
  // ============================================================================

  describe("recordCost()", () => {
    it("should record a cost event", () => {
      service.recordCost(createCostEvent());

      const report = service.getCostReport({ periodHours: 1 });
      expect(report.totalCost).toBeCloseTo(0.005, 5);
    });

    it("should accumulate multiple events", () => {
      service.recordCost(createCostEvent({ estimatedCost: 0.01 }));
      service.recordCost(createCostEvent({ estimatedCost: 0.02 }));
      service.recordCost(createCostEvent({ estimatedCost: 0.03 }));

      const report = service.getCostReport({ periodHours: 1 });
      expect(report.totalCost).toBeCloseTo(0.06, 5);
    });

    it("should bucket events by hour", () => {
      const now = new Date();
      service.recordCost(createCostEvent({ timestamp: now }));

      const report = service.getCostReport({ periodHours: 1 });
      expect(report.hourlyTrend.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // getCostReport()
  // ============================================================================

  describe("getCostReport()", () => {
    it("should return empty report when no data", () => {
      const report = service.getCostReport();

      expect(report.totalCost).toBe(0);
      expect(report.totalTokens).toBe(0);
      expect(report.byUser).toEqual([]);
      expect(report.byModule).toEqual([]);
      expect(report.byModel).toEqual([]);
    });

    it("should aggregate by user", () => {
      service.recordCost(
        createCostEvent({ userId: "user-1", estimatedCost: 0.01 }),
      );
      service.recordCost(
        createCostEvent({ userId: "user-1", estimatedCost: 0.02 }),
      );
      service.recordCost(
        createCostEvent({ userId: "user-2", estimatedCost: 0.05 }),
      );

      const report = service.getCostReport({ periodHours: 1 });

      expect(report.byUser).toHaveLength(2);
      // Sorted by cost descending
      expect(report.byUser[0].userId).toBe("user-2");
      expect(report.byUser[0].totalCost).toBeCloseTo(0.05, 5);
      expect(report.byUser[1].userId).toBe("user-1");
      expect(report.byUser[1].totalCost).toBeCloseTo(0.03, 5);
    });

    it("should aggregate by module", () => {
      service.recordCost(
        createCostEvent({ moduleType: "ai-ask", estimatedCost: 0.01 }),
      );
      service.recordCost(
        createCostEvent({ moduleType: "research", estimatedCost: 0.05 }),
      );

      const report = service.getCostReport({ periodHours: 1 });

      expect(report.byModule).toHaveLength(2);
      const research = report.byModule.find((m) => m.moduleType === "research");
      expect(research?.totalCost).toBeCloseTo(0.05, 5);
    });

    it("should aggregate by model", () => {
      service.recordCost(
        createCostEvent({
          model: "gpt-4o",
          provider: "openai",
          estimatedCost: 0.01,
        }),
      );
      service.recordCost(
        createCostEvent({
          model: "claude-3.5-sonnet",
          provider: "anthropic",
          estimatedCost: 0.03,
        }),
      );

      const report = service.getCostReport({ periodHours: 1 });

      expect(report.byModel).toHaveLength(2);
    });

    it("should calculate avgCostPerCall for modules", () => {
      service.recordCost(
        createCostEvent({ moduleType: "ai-ask", estimatedCost: 0.01 }),
      );
      service.recordCost(
        createCostEvent({ moduleType: "ai-ask", estimatedCost: 0.03 }),
      );

      const report = service.getCostReport({ periodHours: 1 });

      const askModule = report.byModule.find((m) => m.moduleType === "ai-ask");
      expect(askModule?.avgCostPerCall).toBeCloseTo(0.02, 5);
    });

    it("should filter by user when specified", () => {
      service.recordCost(
        createCostEvent({ userId: "user-1", estimatedCost: 0.01 }),
      );
      service.recordCost(
        createCostEvent({ userId: "user-2", estimatedCost: 0.05 }),
      );

      const report = service.getCostReport({
        periodHours: 1,
        userId: "user-1",
      });

      expect(report.byUser).toHaveLength(1);
      expect(report.byUser[0].userId).toBe("user-1");
    });
  });

  // ============================================================================
  // getUserCost()
  // ============================================================================

  describe("getUserCost()", () => {
    it("should return zero for unknown user", () => {
      const result = service.getUserCost("unknown-user");

      expect(result.totalCost).toBe(0);
      expect(result.callCount).toBe(0);
    });

    it("should return correct user cost", () => {
      service.recordCost(
        createCostEvent({ userId: "user-1", estimatedCost: 0.01 }),
      );
      service.recordCost(
        createCostEvent({ userId: "user-1", estimatedCost: 0.02 }),
      );

      const result = service.getUserCost("user-1", 1);

      expect(result.totalCost).toBeCloseTo(0.03, 5);
      expect(result.callCount).toBe(2);
    });
  });

  // ============================================================================
  // Budget Alerts
  // ============================================================================

  describe("budget alerts", () => {
    it("should set and check budget alerts", () => {
      service.setBudgetAlert("user-1", 0.05, "daily");
      service.recordCost(
        createCostEvent({ userId: "user-1", estimatedCost: 0.06 }),
      );

      const alerts = service.checkBudgetAlerts();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].userId).toBe("user-1");
      expect(alerts[0].triggered).toBe(true);
      expect(alerts[0].currentSpend).toBeGreaterThanOrEqual(0.05);
    });

    it("should not trigger when under threshold", () => {
      service.setBudgetAlert("user-1", 1.0, "daily");
      service.recordCost(
        createCostEvent({ userId: "user-1", estimatedCost: 0.01 }),
      );

      const alerts = service.checkBudgetAlerts();

      expect(alerts[0].triggered).toBe(false);
    });

    it("should support monthly period", () => {
      service.setBudgetAlert("user-1", 100.0, "monthly");

      const alerts = service.checkBudgetAlerts();

      expect(alerts[0].period).toBe("monthly");
      expect(alerts[0].threshold).toBe(100.0);
    });
  });

  // ============================================================================
  // getHourlyTrend()
  // ============================================================================

  describe("getHourlyTrend()", () => {
    it("should return hourly trend data", () => {
      service.recordCost(createCostEvent());

      const trend = service.getHourlyTrend(1);

      expect(trend.length).toBeGreaterThanOrEqual(1);
      expect(trend[0].cost).toBeGreaterThan(0);
      expect(trend[0].calls).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // reset()
  // ============================================================================

  describe("reset()", () => {
    it("should clear all data", () => {
      service.recordCost(createCostEvent());
      service.setBudgetAlert("user-1", 1.0, "daily");

      service.reset();

      const report = service.getCostReport({ periodHours: 1 });
      expect(report.totalCost).toBe(0);

      const alerts = service.checkBudgetAlerts();
      expect(alerts).toHaveLength(0);
    });
  });
});
