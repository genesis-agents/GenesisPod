import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { TokenBudgetService } from "../token-budget.service";

jest.spyOn(Logger.prototype, "log").mockImplementation();
jest.spyOn(Logger.prototype, "debug").mockImplementation();
jest.spyOn(Logger.prototype, "warn").mockImplementation();
jest.spyOn(Logger.prototype, "error").mockImplementation();

describe("TokenBudgetService", () => {
  let service: TokenBudgetService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenBudgetService],
    }).compile();
    service = module.get<TokenBudgetService>(TokenBudgetService);
  });

  afterEach(() => jest.clearAllMocks());

  // ==================== createBudget ====================

  describe("createBudget", () => {
    it("should create budget entry with correct fields", () => {
      const entry = service.createBudget("mission-1", 10000);
      expect(entry.id).toBe("mission-1");
      expect(entry.maxTokens).toBe(10000);
      expect(entry.usedTokens).toBe(0);
      expect(entry.createdAt).toBeInstanceOf(Date);
      expect(entry.updatedAt).toBeInstanceOf(Date);
    });

    it("should initialize empty usage history", () => {
      service.createBudget("mission-2", 5000);
      const history = service.getUsageHistory("mission-2");
      expect(history).toEqual([]);
    });

    it("should overwrite existing budget with same id", () => {
      service.createBudget("mission-3", 1000);
      service.consume("mission-3", "op1", 100, 50);
      service.createBudget("mission-3", 9999);
      const budget = service.getBudget("mission-3");
      expect(budget?.maxTokens).toBe(9999);
      expect(budget?.usedTokens).toBe(0);
    });

    it("should return the created entry", () => {
      const entry = service.createBudget("mission-ret", 5000);
      expect(entry).toBeDefined();
      expect(entry.maxTokens).toBe(5000);
    });
  });

  // ==================== check ====================

  describe("check", () => {
    it("should return allowed=true with Infinity remaining for unknown budgetId", () => {
      const result = service.check("nonexistent-budget", 1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Infinity);
      expect(result.usageRate).toBe(0);
    });

    it("should allow when estimated tokens are within remaining budget", () => {
      service.createBudget("check-1", 1000);
      const result = service.check("check-1", 500);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1000);
      expect(result.usageRate).toBe(0);
    });

    it("should deny when estimated tokens would exceed budget", () => {
      service.createBudget("check-2", 1000);
      service.consume("check-2", "op", 900, 0);
      const result = service.check("check-2", 200);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(100);
      expect(result.reason).toContain("Token budget exceeded");
    });

    it("should return correct usageRate", () => {
      service.createBudget("check-3", 1000);
      service.consume("check-3", "op", 250, 250);
      const result = service.check("check-3", 1);
      expect(result.usageRate).toBeCloseTo(0.5, 4);
    });

    it("should return 0 usageRate when maxTokens is 0", () => {
      service.createBudget("check-zero", 0);
      const result = service.check("check-zero", 0);
      expect(result.usageRate).toBe(0);
    });

    it("should allow exactly at budget boundary", () => {
      service.createBudget("check-boundary", 1000);
      service.consume("check-boundary", "op", 500, 500);
      // usedTokens=1000, checking 0 additional -> allowed
      const result = service.check("check-boundary", 0);
      expect(result.allowed).toBe(true);
    });

    it("should deny when exactly one over budget", () => {
      service.createBudget("check-over", 1000);
      service.consume("check-over", "op", 1000, 0);
      const result = service.check("check-over", 1);
      expect(result.allowed).toBe(false);
    });
  });

  // ==================== consume ====================

  describe("consume", () => {
    it("should update usedTokens by inputTokens + outputTokens", () => {
      service.createBudget("cons-1", 10000);
      service.consume("cons-1", "chat", 300, 150);
      const budget = service.getBudget("cons-1");
      expect(budget?.usedTokens).toBe(450);
    });

    it("should append usage history record", () => {
      service.createBudget("cons-2", 10000);
      service.consume("cons-2", "embed", 100, 0);
      const history = service.getUsageHistory("cons-2");
      expect(history).toHaveLength(1);
      expect(history[0].operation).toBe("embed");
      expect(history[0].inputTokens).toBe(100);
      expect(history[0].outputTokens).toBe(0);
      expect(history[0].totalTokens).toBe(100);
      expect(history[0].budgetId).toBe("cons-2");
      expect(history[0].timestamp).toBeInstanceOf(Date);
    });

    it("should accumulate multiple consume calls", () => {
      service.createBudget("cons-3", 10000);
      service.consume("cons-3", "op1", 100, 50);
      service.consume("cons-3", "op2", 200, 100);
      const budget = service.getBudget("cons-3");
      expect(budget?.usedTokens).toBe(450);
    });

    it("should update updatedAt timestamp on consume", async () => {
      service.createBudget("cons-ts", 10000);
      const before = service.getBudget("cons-ts")!.updatedAt;
      await new Promise((r) => setTimeout(r, 10));
      service.consume("cons-ts", "op", 100, 50);
      const after = service.getBudget("cons-ts")!.updatedAt;
      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it("should warn when usage reaches 90%", () => {
      const warnSpy = jest.spyOn(Logger.prototype, "warn");
      service.createBudget("cons-warn", 1000);
      service.consume("cons-warn", "op", 900, 0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("cons-warn"),
      );
    });

    it("should not warn below 90% usage", () => {
      const warnSpy = jest.spyOn(Logger.prototype, "warn");
      service.createBudget("cons-no-warn", 1000);
      service.consume("cons-no-warn", "op", 800, 0);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should still record history even for unknown budgetId (no budget)", () => {
      // No budget created, but consume still records history
      service.consume("unknown-id", "op", 100, 50);
      const history = service.getUsageHistory("unknown-id");
      expect(history).toHaveLength(1);
    });

    it("should create history entry for unknown budgetId", () => {
      service.consume("no-budget", "op", 10, 5);
      const history = service.getUsageHistory("no-budget");
      expect(history[0].totalTokens).toBe(15);
    });
  });

  // ==================== getBudget ====================

  describe("getBudget", () => {
    it("should return null for unknown budgetId", () => {
      expect(service.getBudget("unknown")).toBeNull();
    });

    it("should return the budget entry for known budgetId", () => {
      service.createBudget("gb-1", 5000);
      const entry = service.getBudget("gb-1");
      expect(entry).not.toBeNull();
      expect(entry?.id).toBe("gb-1");
      expect(entry?.maxTokens).toBe(5000);
    });
  });

  // ==================== getUsageHistory ====================

  describe("getUsageHistory", () => {
    it("should return empty array for unknown budgetId", () => {
      expect(service.getUsageHistory("unknown")).toEqual([]);
    });

    it("should return all usage records in order", () => {
      service.createBudget("gh-1", 10000);
      service.consume("gh-1", "op1", 100, 50);
      service.consume("gh-1", "op2", 200, 100);
      const history = service.getUsageHistory("gh-1");
      expect(history).toHaveLength(2);
      expect(history[0].operation).toBe("op1");
      expect(history[1].operation).toBe("op2");
    });
  });

  // ==================== getSummary ====================

  describe("getSummary", () => {
    it("should return null for unknown budgetId", () => {
      expect(service.getSummary("unknown")).toBeNull();
    });

    it("should return correct summary for fresh budget", () => {
      service.createBudget("sum-1", 1000);
      const summary = service.getSummary("sum-1");
      expect(summary).not.toBeNull();
      expect(summary?.totalUsed).toBe(0);
      expect(summary?.maxTokens).toBe(1000);
      expect(summary?.remaining).toBe(1000);
      expect(summary?.usageRate).toBe(0);
      expect(summary?.operationCount).toBe(0);
    });

    it("should return correct summary after consuming", () => {
      service.createBudget("sum-2", 1000);
      service.consume("sum-2", "op1", 300, 200);
      service.consume("sum-2", "op2", 100, 50);
      const summary = service.getSummary("sum-2");
      expect(summary?.totalUsed).toBe(650);
      expect(summary?.remaining).toBe(350);
      expect(summary?.usageRate).toBeCloseTo(0.65, 4);
      expect(summary?.operationCount).toBe(2);
    });

    it("should return 0 usageRate when maxTokens is 0", () => {
      service.createBudget("sum-zero", 0);
      const summary = service.getSummary("sum-zero");
      expect(summary?.usageRate).toBe(0);
    });

    it("should clamp remaining to 0 when over budget", () => {
      service.createBudget("sum-over", 100);
      // Simulate overconsumption by consuming more than budget
      service.consume("sum-over", "op", 60, 60); // 120 > 100
      const summary = service.getSummary("sum-over");
      expect(summary?.remaining).toBe(0);
    });
  });

  // ==================== deleteBudget ====================

  describe("deleteBudget", () => {
    it("should remove budget and history", () => {
      service.createBudget("del-1", 5000);
      service.consume("del-1", "op", 100, 50);
      service.deleteBudget("del-1");
      expect(service.getBudget("del-1")).toBeNull();
      expect(service.getUsageHistory("del-1")).toEqual([]);
    });

    it("should not throw when deleting unknown budgetId", () => {
      expect(() => service.deleteBudget("nonexistent")).not.toThrow();
    });

    it("should decrement active budget count", () => {
      service.createBudget("del-count-1", 1000);
      service.createBudget("del-count-2", 2000);
      expect(service.getActiveBudgetCount()).toBe(2);
      service.deleteBudget("del-count-1");
      expect(service.getActiveBudgetCount()).toBe(1);
    });
  });

  // ==================== getActiveBudgetCount ====================

  describe("getActiveBudgetCount", () => {
    it("should return 0 when no budgets exist", () => {
      expect(service.getActiveBudgetCount()).toBe(0);
    });

    it("should count multiple budgets", () => {
      service.createBudget("abc-1", 1000);
      service.createBudget("abc-2", 2000);
      service.createBudget("abc-3", 3000);
      expect(service.getActiveBudgetCount()).toBe(3);
    });

    it("should reflect deletions", () => {
      service.createBudget("cnt-1", 1000);
      service.createBudget("cnt-2", 2000);
      service.deleteBudget("cnt-1");
      expect(service.getActiveBudgetCount()).toBe(1);
    });
  });

  // ==================== Edge cases ====================

  describe("edge cases", () => {
    it("should handle 0 token consumption", () => {
      service.createBudget("edge-1", 1000);
      service.consume("edge-1", "noop", 0, 0);
      const budget = service.getBudget("edge-1");
      expect(budget?.usedTokens).toBe(0);
    });

    it("should correctly show 100% usage rate", () => {
      service.createBudget("edge-full", 1000);
      service.consume("edge-full", "op", 1000, 0);
      const result = service.check("edge-full", 1);
      expect(result.usageRate).toBe(1.0);
      expect(result.allowed).toBe(false);
    });

    it("should allow check with 0 estimated tokens even when at budget", () => {
      service.createBudget("edge-zero-est", 100);
      service.consume("edge-zero-est", "op", 100, 0);
      // 100 + 0 = 100 which is NOT > 100, so allowed
      const result = service.check("edge-zero-est", 0);
      expect(result.allowed).toBe(true);
    });
  });
});
