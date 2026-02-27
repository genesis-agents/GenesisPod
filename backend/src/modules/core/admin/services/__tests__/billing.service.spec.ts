import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { BillingService } from "../billing.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

describe("BillingService", () => {
  let service: BillingService;
  let mockPrisma: {
    creditTransaction: {
      aggregate: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      creditTransaction: {
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getBillingOverview", () => {
    it("should return billing overview with correct totals", async () => {
      // Arrange
      mockPrisma.creditTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: -500 } }) // totalSpent
        .mockResolvedValueOnce({ _sum: { amount: -50 } }) // todaySpent
        .mockResolvedValueOnce({ _sum: { amount: -200 } }); // monthSpent

      mockPrisma.creditTransaction.groupBy
        .mockResolvedValueOnce([
          { accountId: "acc-1" },
          { accountId: "acc-2" },
          { accountId: "acc-3" },
        ]) // activeSpenders
        .mockResolvedValueOnce([
          {
            moduleType: "AI_RESEARCH",
            _sum: { amount: -100 },
            _count: 10,
          },
        ]) // byModule
        .mockResolvedValueOnce([
          {
            modelName: "gpt-4",
            _sum: { amount: -300, tokenCount: 5000 },
            _count: 5,
          },
        ]); // byModel

      mockPrisma.creditTransaction.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getBillingOverview();

      // Assert
      expect(result.totalSpent).toBe(500);
      expect(result.todaySpent).toBe(50);
      expect(result.monthSpent).toBe(200);
      expect(result.activeSpenders).toBe(3);
    });

    it("should negate negative amounts to produce positive spend values", async () => {
      // Arrange: amounts are negative (representing spend)
      mockPrisma.creditTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: -1234.56 } })
        .mockResolvedValueOnce({ _sum: { amount: -99.99 } })
        .mockResolvedValueOnce({ _sum: { amount: -499.5 } });

      mockPrisma.creditTransaction.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockPrisma.creditTransaction.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getBillingOverview();

      // Assert
      expect(result.totalSpent).toBeCloseTo(1234.56);
      expect(result.todaySpent).toBeCloseTo(99.99);
      expect(result.monthSpent).toBeCloseTo(499.5);
    });

    it("should handle null sum amounts gracefully (zero spend)", async () => {
      // Arrange: no transactions exist
      mockPrisma.creditTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } });

      mockPrisma.creditTransaction.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockPrisma.creditTransaction.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getBillingOverview();

      // Assert
      expect(result.totalSpent).toBe(0);
      expect(result.todaySpent).toBe(0);
      expect(result.monthSpent).toBe(0);
      expect(result.activeSpenders).toBe(0);
    });

    it("should build byModule breakdown with correct mapping", async () => {
      // Arrange
      mockPrisma.creditTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: -1000 } })
        .mockResolvedValueOnce({ _sum: { amount: -100 } })
        .mockResolvedValueOnce({ _sum: { amount: -400 } });

      mockPrisma.creditTransaction.groupBy
        .mockResolvedValueOnce([{ accountId: "acc-1" }]) // activeSpenders
        .mockResolvedValueOnce([
          { moduleType: "AI_ASK", _sum: { amount: -300 }, _count: 15 },
          { moduleType: "AI_RESEARCH", _sum: { amount: -700 }, _count: 5 },
        ]) // byModule
        .mockResolvedValueOnce([]); // byModel

      mockPrisma.creditTransaction.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getBillingOverview();

      // Assert
      expect(result.byModule).toHaveLength(2);
      expect(result.byModule[0]).toEqual({
        module: "AI_ASK",
        spent: 300,
        count: 15,
      });
      expect(result.byModule[1]).toEqual({
        module: "AI_RESEARCH",
        spent: 700,
        count: 5,
      });
    });

    it("should build byModel breakdown with token counts", async () => {
      // Arrange
      mockPrisma.creditTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: -500 } })
        .mockResolvedValueOnce({ _sum: { amount: -50 } })
        .mockResolvedValueOnce({ _sum: { amount: -200 } });

      mockPrisma.creditTransaction.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]) // byModule
        .mockResolvedValueOnce([
          {
            modelName: "claude-3",
            _sum: { amount: -500, tokenCount: 12000 },
            _count: 20,
          },
          {
            modelName: "gpt-4o",
            _sum: { amount: null, tokenCount: null },
            _count: 3,
          },
        ]); // byModel

      mockPrisma.creditTransaction.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getBillingOverview();

      // Assert
      expect(result.byModel).toHaveLength(2);
      expect(result.byModel[0]).toEqual({
        model: "claude-3",
        spent: 500,
        tokens: 12000,
        count: 20,
      });
      // null tokenCount falls back to 0
      expect(result.byModel[1].tokens).toBe(0);
    });

    it("should build 30-day daily trend with entries for all 30 days", async () => {
      // Arrange
      mockPrisma.creditTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } });

      mockPrisma.creditTransaction.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockPrisma.creditTransaction.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getBillingOverview();

      // Assert: daily trend has exactly 30 entries
      expect(result.dailyTrend).toHaveLength(30);
      result.dailyTrend.forEach((entry) => {
        expect(entry).toHaveProperty("date");
        expect(entry).toHaveProperty("spent");
        expect(typeof entry.date).toBe("string");
        expect(typeof entry.spent).toBe("number");
      });
    });

    it("should aggregate daily transaction amounts into the trend map", async () => {
      // Arrange
      const today = new Date();
      const todayKey = today.toISOString().split("T")[0];

      mockPrisma.creditTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: -300 } })
        .mockResolvedValueOnce({ _sum: { amount: -300 } })
        .mockResolvedValueOnce({ _sum: { amount: -300 } });

      mockPrisma.creditTransaction.groupBy
        .mockResolvedValueOnce([{ accountId: "a1" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // Two transactions on today
      mockPrisma.creditTransaction.findMany.mockResolvedValue([
        { amount: -100, createdAt: today },
        { amount: -200, createdAt: today },
      ]);

      // Act
      const result = await service.getBillingOverview();

      // Assert: today's entry should sum both transactions
      const todayEntry = result.dailyTrend.find((e) => e.date === todayKey);
      expect(todayEntry?.spent).toBe(300);
    });

    it("should call aggregate with spend type filters", async () => {
      // Arrange
      mockPrisma.creditTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      });
      mockPrisma.creditTransaction.groupBy.mockResolvedValue([]);
      mockPrisma.creditTransaction.findMany.mockResolvedValue([]);

      // Act
      await service.getBillingOverview();

      // Assert: all aggregate calls use the type filter
      const calls = mockPrisma.creditTransaction.aggregate.mock.calls;
      expect(calls.length).toBe(3);
      calls.forEach((call) => {
        expect(call[0].where.type.in).toBeDefined();
        expect(Array.isArray(call[0].where.type.in)).toBe(true);
        expect(call[0].where.type.in.length).toBeGreaterThan(0);
      });
    });

    it("should call groupBy for active spenders with month filter", async () => {
      // Arrange
      mockPrisma.creditTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      });
      mockPrisma.creditTransaction.groupBy.mockResolvedValue([]);
      mockPrisma.creditTransaction.findMany.mockResolvedValue([]);

      // Act
      await service.getBillingOverview();

      // Assert: first groupBy call (activeSpenders) groups by accountId
      const firstGroupByCall =
        mockPrisma.creditTransaction.groupBy.mock.calls[0][0];
      expect(firstGroupByCall.by).toContain("accountId");
      expect(firstGroupByCall.where.createdAt.gte).toBeDefined();
    });

    it("should return all required top-level keys in the result", async () => {
      // Arrange
      mockPrisma.creditTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      });
      mockPrisma.creditTransaction.groupBy.mockResolvedValue([]);
      mockPrisma.creditTransaction.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getBillingOverview();

      // Assert
      expect(result).toHaveProperty("totalSpent");
      expect(result).toHaveProperty("todaySpent");
      expect(result).toHaveProperty("monthSpent");
      expect(result).toHaveProperty("activeSpenders");
      expect(result).toHaveProperty("byModule");
      expect(result).toHaveProperty("byModel");
      expect(result).toHaveProperty("dailyTrend");
    });
  });
});
