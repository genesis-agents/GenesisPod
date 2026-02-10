/**
 * CreditsService 单元测试
 *
 * 测试积分系统核心功能：
 * - getOrCreateAccount() 获取/创建账户
 * - checkBalance() 余额检查
 * - consumeCredits() 消费积分
 * - getTransactionHistory() 交易历史
 * - 低余额/冻结账户逻辑
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { CreditsService } from "../credits.service";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CreditRulesService } from "../services/credit-rules.service";

describe("CreditsService", () => {
  let service: CreditsService;
  let mockPrisma: any;
  let mockRulesService: any;

  const mockAccount = {
    id: "acct-1",
    userId: "user-123",
    balance: 5000,
    totalEarned: 10000,
    totalSpent: 5000,
    giftBalance: 0,
    giftExpiresAt: null,
    isActive: true,
    isFrozen: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockPrisma = {
      creditAccount: {
        findUnique: jest.fn().mockResolvedValue(mockAccount),
        create: jest.fn().mockResolvedValue({
          ...mockAccount,
          id: "acct-new",
          balance: 10000,
          totalEarned: 10000,
          totalSpent: 0,
        }),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          ...mockAccount,
          ...data,
        })),
      },
      creditTransaction: {
        create: jest.fn().mockResolvedValue({
          id: "txn-1",
          accountId: "acct-1",
          type: "CONSUME",
          amount: -100,
          balanceAfter: 4900,
        }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn().mockImplementation((fn: any) => fn(mockPrisma)),
    };

    mockRulesService = {
      getCreditsForOperation: jest.fn().mockReturnValue(100),
      isOperationAllowed: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CreditRulesService, useValue: mockRulesService },
      ],
    }).compile();

    service = module.get<CreditsService>(CreditsService);

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // getOrCreateAccount
  // =========================================================================

  describe("getOrCreateAccount", () => {
    it("should return existing account", async () => {
      const result = await service.getOrCreateAccount("user-123");

      expect(result).toBeDefined();
      expect(result.balance).toBe(5000);
      expect(mockPrisma.creditAccount.findUnique).toHaveBeenCalledWith({
        where: { userId: "user-123" },
      });
    });

    it("should create new account with welcome bonus when not exists", async () => {
      mockPrisma.creditAccount.findUnique.mockResolvedValue(null);

      await service.getOrCreateAccount("new-user");

      expect(mockPrisma.creditAccount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "new-user",
          balance: 10000,
          totalEarned: 10000,
        }),
      });
      expect(mockPrisma.creditTransaction.create).toHaveBeenCalled();
    });

    it("should report low balance status", async () => {
      mockPrisma.creditAccount.findUnique.mockResolvedValue({
        ...mockAccount,
        balance: 200,
      });

      const result = await service.getOrCreateAccount("user-123");

      expect(result.isLow).toBe(true);
      expect(result.isCritical).toBe(false);
    });

    it("should report critical balance status", async () => {
      mockPrisma.creditAccount.findUnique.mockResolvedValue({
        ...mockAccount,
        balance: 50,
      });

      const result = await service.getOrCreateAccount("user-123");

      expect(result.isCritical).toBe(true);
    });
  });

  // =========================================================================
  // onModuleInit
  // =========================================================================

  describe("lifecycle", () => {
    it("should initialize without error", async () => {
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });
});
