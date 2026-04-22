/**
 * CostController Unit Tests
 * 成本控制器测试
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { CostController } from "../../../../../ai-engine/facade";
import { CacheService } from "@/common/cache/cache.service";

describe("CostController", () => {
  let service: CostController;
  let mockCacheService: any;

  beforeEach(async () => {
    jest.useFakeTimers();

    mockCacheService = {
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CostController,
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<CostController>(CostController);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("calculateCost() - pricing calculation", () => {
    it("should return correct cost for gpt-4o", () => {
      const cost = service.calculateCost("gpt-4o", 1000000, 1000000);

      // gpt-4o: $2.5/M input, $10/M output
      expect(cost).toBe(12.5);
    });

    it("should return correct cost for claude-3-5-sonnet", () => {
      const cost = service.calculateCost("claude-3-5-sonnet", 1000000, 1000000);

      // claude-3-5-sonnet: $3/M input, $15/M output
      expect(cost).toBe(18);
    });

    it("should return correct cost for gpt-4o-mini", () => {
      const cost = service.calculateCost("gpt-4o-mini", 1000000, 1000000);

      // gpt-4o-mini: $0.15/M input, $0.6/M output
      expect(cost).toBe(0.75);
    });

    it("should handle partial tokens correctly", () => {
      const cost = service.calculateCost("gpt-4o", 500000, 250000);

      // 500K input: 0.5 * $2.5 = $1.25
      // 250K output: 0.25 * $10 = $2.5
      // Total: $3.75
      expect(cost).toBeCloseTo(3.75, 2);
    });

    it("should use default estimation for unknown models", () => {
      const cost = service.calculateCost("unknown-model", 1000000, 1000000);

      // Default: (1M + 1M) * 0.001 / 1000 = 2000 / 1000 = 2
      expect(cost).toBe(2);
    });

    it("should handle zero tokens", () => {
      const cost = service.calculateCost("gpt-4o", 0, 0);
      expect(cost).toBe(0);
    });
  });

  describe("setModelPricing() - adds new model", () => {
    it("should add new model pricing", () => {
      service.setModelPricing({
        model: "custom-model",
        inputPricePerMillion: 1.0,
        outputPricePerMillion: 2.0,
      });

      const cost = service.calculateCost("custom-model", 1000000, 1000000);
      expect(cost).toBe(3.0);
    });

    it("should override existing model pricing", () => {
      service.setModelPricing({
        model: "gpt-4o",
        inputPricePerMillion: 10.0,
        outputPricePerMillion: 20.0,
      });

      const cost = service.calculateCost("gpt-4o", 1000000, 1000000);
      expect(cost).toBe(30.0);
    });
  });

  describe("recordCost() - creates cost record", () => {
    it("should create a record with ID and timestamp", () => {
      const record = service.recordCost({
        category: "llm",
        operation: "chat",
        cost: 0.1,
        tokens: { input: 1000, output: 500, total: 1500 },
      });

      expect(record.id).toBeDefined();
      expect(record.timestamp).toBeInstanceOf(Date);
      expect(record.category).toBe("llm");
      expect(record.operation).toBe("chat");
      expect(record.cost).toBe(0.1);
      expect(record.tokens?.total).toBe(1500);
    });

    it("should include optional fields", () => {
      const record = service.recordCost({
        category: "llm",
        operation: "chat",
        cost: 0.1,
        userId: "user-123",
        sessionId: "session-456",
        metadata: { model: "gpt-4o" },
      });

      expect(record.userId).toBe("user-123");
      expect(record.sessionId).toBe("session-456");
      expect(record.metadata).toEqual({ model: "gpt-4o" });
    });

    it("should update budget usage", () => {
      service.createBudget({
        name: "Test Budget",
        amount: 10.0,
        period: "daily",
        categories: ["llm"],
      });

      service.recordCost({
        category: "llm",
        operation: "chat",
        cost: 2.5,
      });

      const budgets = service.getBudgets();
      expect(budgets[0].used).toBe(2.5);
    });
  });

  describe("createBudget() - budget creation", () => {
    it("should create a budget with correct period start/end", () => {
      const budget = service.createBudget({
        name: "Daily Budget",
        amount: 100.0,
        period: "daily",
      });

      expect(budget.id).toBeDefined();
      expect(budget.name).toBe("Daily Budget");
      expect(budget.amount).toBe(100.0);
      expect(budget.period).toBe("daily");
      expect(budget.used).toBe(0);
      expect(budget.alertThreshold).toBe(0.8);
      expect(budget.periodStart).toBeInstanceOf(Date);
      expect(budget.periodEnd).toBeInstanceOf(Date);
      expect(budget.periodEnd.getTime()).toBeGreaterThan(
        budget.periodStart.getTime(),
      );
    });

    it("should create budget with custom alert threshold", () => {
      const budget = service.createBudget({
        name: "Test Budget",
        amount: 50.0,
        period: "daily",
        alertThreshold: 0.9,
      });

      expect(budget.alertThreshold).toBe(0.9);
    });

    it("should create budget with specific categories", () => {
      const budget = service.createBudget({
        name: "LLM Only",
        amount: 100.0,
        period: "daily",
        categories: ["llm", "embedding"],
      });

      expect(budget.categories).toEqual(["llm", "embedding"]);
    });

    it("should calculate daily period correctly", () => {
      const now = new Date("2024-01-15T10:30:00Z");
      jest.setSystemTime(now);

      const budget = service.createBudget({
        name: "Daily",
        amount: 10.0,
        period: "daily",
      });

      expect(budget.periodStart.getHours()).toBe(0);
      expect(budget.periodStart.getMinutes()).toBe(0);
      expect(budget.periodEnd.getDate()).toBe(budget.periodStart.getDate() + 1);
    });

    it("should calculate hourly period correctly", () => {
      const now = new Date("2024-01-15T10:30:00Z");
      jest.setSystemTime(now);

      const budget = service.createBudget({
        name: "Hourly",
        amount: 5.0,
        period: "hourly",
      });

      expect(budget.periodStart.getMinutes()).toBe(0);
      expect(budget.periodEnd.getTime() - budget.periodStart.getTime()).toBe(
        60 * 60 * 1000,
      );
    });

    it("should calculate weekly period correctly", () => {
      const budget = service.createBudget({
        name: "Weekly",
        amount: 500.0,
        period: "weekly",
      });

      const daysDiff =
        (budget.periodEnd.getTime() - budget.periodStart.getTime()) /
        (1000 * 60 * 60 * 24);
      expect(Math.round(daysDiff)).toBe(7);
    });

    it("should calculate monthly period correctly", () => {
      const now = new Date("2024-01-15T10:30:00Z");
      jest.setSystemTime(now);

      const budget = service.createBudget({
        name: "Monthly",
        amount: 1000.0,
        period: "monthly",
      });

      expect(budget.periodStart.getDate()).toBe(1);
      expect(budget.periodEnd.getMonth()).toBe(
        (budget.periodStart.getMonth() + 1) % 12,
      );
    });
  });

  describe("checkBudget() - budget checking", () => {
    it("should allow when under budget", () => {
      service.createBudget({
        name: "Test",
        amount: 10.0,
        period: "daily",
      });

      const result = service.checkBudget(5.0, "llm");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10.0);
    });

    it("should block when estimated cost would exceed budget", () => {
      service.createBudget({
        name: "Test",
        amount: 10.0,
        period: "daily",
      });

      service.recordCost({ category: "llm", operation: "chat", cost: 8.0 });

      const result = service.checkBudget(5.0, "llm");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Would exceed budget");
      expect(result.triggeredBudget).toBe("Test");
    });

    it("should trigger alert when usage exceeds threshold", () => {
      service.createBudget({
        name: "Test",
        amount: 10.0,
        period: "daily",
        alertThreshold: 0.8,
      });

      service.recordCost({ category: "llm", operation: "chat", cost: 8.5 });

      const result = service.checkBudget(0.1, "llm");

      expect(result.alertTriggered).toBe(true);
      expect(result.usageRate).toBeGreaterThanOrEqual(0.8);
    });

    it("should skip non-matching categories", () => {
      service.createBudget({
        name: "LLM Only",
        amount: 10.0,
        period: "daily",
        categories: ["llm"],
      });

      service.recordCost({ category: "llm", operation: "chat", cost: 9.0 });

      // Image category should not be affected
      const result = service.checkBudget(5.0, "image");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1); // No applicable budget
    });

    it("should allow when budget has no category restriction", () => {
      service.createBudget({
        name: "All Categories",
        amount: 100.0,
        period: "daily",
      });

      const result1 = service.checkBudget(10.0, "llm");
      const result2 = service.checkBudget(10.0, "image");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });

  describe("budget period reset - expired budgets", () => {
    it("should reset expired budgets automatically", () => {
      const budget = service.createBudget({
        name: "Daily",
        amount: 10.0,
        period: "daily",
      });

      service.recordCost({ category: "llm", operation: "chat", cost: 5.0 });

      expect(budget.used).toBe(5.0);

      // Advance time past period end
      jest.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours

      // Check budget should trigger reset
      service.checkBudget(1.0, "llm");

      const budgets = service.getBudgets();
      expect(budgets[0].used).toBe(0);
    });

    it("should update period dates after reset", () => {
      const budget = service.createBudget({
        name: "Hourly",
        amount: 5.0,
        period: "hourly",
      });

      const originalEnd = budget.periodEnd.getTime();

      jest.advanceTimersByTime(2 * 60 * 60 * 1000); // 2 hours

      service.checkBudget(1.0, "llm");

      const updatedBudget = service.getBudgets()[0];
      expect(updatedBudget.periodEnd.getTime()).toBeGreaterThan(originalEnd);
    });
  });

  describe("getBudgets() - returns all budgets", () => {
    it("should return all created budgets", () => {
      service.createBudget({ name: "Budget 1", amount: 10, period: "daily" });
      service.createBudget({ name: "Budget 2", amount: 20, period: "weekly" });
      service.createBudget({
        name: "Budget 3",
        amount: 30,
        period: "monthly",
      });

      const budgets = service.getBudgets();

      expect(budgets).toHaveLength(3);
      expect(budgets.map((b) => b.name)).toContain("Budget 1");
      expect(budgets.map((b) => b.name)).toContain("Budget 2");
      expect(budgets.map((b) => b.name)).toContain("Budget 3");
    });

    it("should return empty array when no budgets", () => {
      const budgets = service.getBudgets();
      expect(budgets).toEqual([]);
    });
  });

  describe("getStats() - cost statistics", () => {
    it("should return correct totals by category and operation", () => {
      service.recordCost({
        category: "llm",
        operation: "chat",
        cost: 1.0,
        tokens: { input: 1000, output: 500, total: 1500 },
      });
      service.recordCost({
        category: "llm",
        operation: "completion",
        cost: 2.0,
        tokens: { input: 2000, output: 1000, total: 3000 },
      });
      service.recordCost({
        category: "embedding",
        operation: "embed",
        cost: 0.5,
        tokens: { input: 500, output: 0, total: 500 },
      });

      const stats = service.getStats();

      expect(stats.totalCost).toBe(3.5);
      expect(stats.totalTokens).toBe(5000);
      expect(stats.byCategory.llm).toBe(3.0);
      expect(stats.byCategory.embedding).toBe(0.5);
      expect(stats.byOperation.chat).toBe(1.0);
      expect(stats.byOperation.completion).toBe(2.0);
      expect(stats.byOperation.embed).toBe(0.5);
    });

    it("should filter by date range", () => {
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-01-31");

      jest.setSystemTime(new Date("2024-01-15"));
      service.recordCost({ category: "llm", operation: "chat", cost: 1.0 });

      jest.setSystemTime(new Date("2024-02-15"));
      service.recordCost({ category: "llm", operation: "chat", cost: 2.0 });

      const stats = service.getStats({ startDate, endDate });

      expect(stats.totalCost).toBe(1.0);
    });

    it("should filter by category", () => {
      service.recordCost({ category: "llm", operation: "chat", cost: 1.0 });
      service.recordCost({
        category: "image",
        operation: "generate",
        cost: 2.0,
      });

      const stats = service.getStats({ category: "llm" });

      expect(stats.totalCost).toBe(1.0);
      expect(stats.byCategory.llm).toBe(1.0);
      expect(stats.byCategory.image).toBeUndefined();
    });

    it("should filter by userId", () => {
      service.recordCost({
        category: "llm",
        operation: "chat",
        cost: 1.0,
        userId: "user-1",
      });
      service.recordCost({
        category: "llm",
        operation: "chat",
        cost: 2.0,
        userId: "user-2",
      });

      const stats = service.getStats({ userId: "user-1" });

      expect(stats.totalCost).toBe(1.0);
    });

    it("should handle empty records", () => {
      const stats = service.getStats();

      expect(stats.totalCost).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.byCategory).toEqual({});
      expect(stats.byOperation).toEqual({});
    });
  });

  describe("Redis integration - recordCost", () => {
    it("should write record to Redis with correct key format", () => {
      const record = service.recordCost({
        category: "llm",
        operation: "chat",
        cost: 0.1,
      });

      const dateKey = record.timestamp.toISOString().slice(0, 10);
      const expectedKey = `ai:cost:record:llm:${dateKey}:${record.id}`;

      expect(mockCacheService.set).toHaveBeenCalledWith(
        expectedKey,
        expect.objectContaining({
          id: record.id,
          category: "llm",
          operation: "chat",
          cost: 0.1,
        }),
        86400, // 24 hours TTL
      );
    });
  });

  describe("Redis integration - createBudget", () => {
    it("should write budget to Redis with dynamic TTL", () => {
      const budget = service.createBudget({
        name: "Test",
        amount: 10.0,
        period: "hourly",
      });

      const remainingMs = budget.periodEnd.getTime() - Date.now();
      const expectedTtl = Math.max(Math.ceil(remainingMs / 1000), 60);

      expect(mockCacheService.set).toHaveBeenCalledWith(
        `ai:cost:budget:${budget.id}`,
        expect.objectContaining({
          id: budget.id,
          name: "Test",
          amount: 10.0,
        }),
        expectedTtl,
      );
    });

    it("should use minimum TTL of 60 seconds", () => {
      service.createBudget({
        name: "Test",
        amount: 10.0,
        period: "hourly",
      });

      // Advance time to near end of period
      jest.advanceTimersByTime(59 * 60 * 1000); // 59 minutes

      service.recordCost({ category: "llm", operation: "chat", cost: 1.0 });

      const calls = mockCacheService.set.mock.calls;
      const budgetUpdateCall = calls.find((call: [string, unknown, number]) =>
        call[0].startsWith("ai:cost:budget:"),
      );
      expect(budgetUpdateCall?.[2]).toBeGreaterThanOrEqual(60);
    });
  });

  describe("Redis integration - without CacheService", () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [CostController],
      }).compile();

      service = module.get<CostController>(CostController);

      jest.spyOn(Logger.prototype, "log").mockImplementation();
      jest.spyOn(Logger.prototype, "warn").mockImplementation();
    });

    it("should work without CacheService", () => {
      expect(() => {
        service.recordCost({ category: "llm", operation: "chat", cost: 0.1 });
        service.createBudget({ name: "Test", amount: 10, period: "daily" });
      }).not.toThrow();
    });
  });

  describe("budget alert logging", () => {
    it("should log warning when alert threshold is reached", () => {
      const warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation();

      service.createBudget({
        name: "Test Budget",
        amount: 10.0,
        period: "daily",
        alertThreshold: 0.8,
      });

      service.recordCost({ category: "llm", operation: "chat", cost: 8.0 });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Budget "Test Budget" reached'),
      );
    });
  });

  describe("edge cases", () => {
    it("should handle very small costs", () => {
      const cost = service.calculateCost("gpt-4o", 1, 1);
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(0.001);
    });

    it("should handle very large token counts", () => {
      const cost = service.calculateCost("gpt-4o", 100000000, 100000000);
      expect(cost).toBe(1250); // 100M * $2.5/M + 100M * $10/M
    });

    it("should handle multiple budgets with different categories", () => {
      service.createBudget({
        name: "LLM Budget",
        amount: 10.0,
        period: "daily",
        categories: ["llm"],
      });
      service.createBudget({
        name: "All Budget",
        amount: 20.0,
        period: "daily",
      });

      service.recordCost({ category: "llm", operation: "chat", cost: 5.0 });

      const budgets = service.getBudgets();
      expect(budgets[0].used).toBe(5.0);
      expect(budgets[1].used).toBe(5.0);
    });
  });
});
