import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CreditTransactionType, Prisma } from "@prisma/client";
import { CreditRulesService } from "./policy/credit-rules.service";
import {
  InsufficientCreditsException,
  AccountFrozenException,
} from "./exceptions/insufficient-credits.exception";
import {
  ConsumeCreditsParams,
  ConsumeCreditsResult,
} from "./dto/consume-credits.dto";
import {
  TransactionQueryDto,
  PaginatedTransactionsResponse,
} from "./dto/transaction-query.dto";

/**
 * 余额阈值配置
 */
const BALANCE_THRESHOLDS = {
  low: 500, // 低余额警告阈值
  critical: 100, // 极低余额阈值
};

/**
 * 积分账户信息
 */
export interface CreditAccountInfo {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  giftBalance: number;
  giftExpiresAt: Date | null;
  isActive: boolean;
  isFrozen: boolean;
  todaySpent: number;
  isLow: boolean;
  isCritical: boolean;
}

/**
 * 余额检查结果
 */
export interface BalanceCheckResult {
  sufficient: boolean;
  balance: number;
  required: number;
  deficit: number;
}

/**
 * 积分服务
 * 核心积分管理服务
 */
@Injectable()
export class CreditsService implements OnModuleInit {
  private readonly logger = new Logger(CreditsService.name);

  constructor(
    private prisma: PrismaService,
    private creditRulesService: CreditRulesService,
  ) {}

  async onModuleInit() {
    this.logger.log("Credits service initialized");
  }

  /**
   * 获取或创建积分账户
   */
  async getOrCreateAccount(userId: string): Promise<CreditAccountInfo> {
    let account = await this.prisma.creditAccount.findUnique({
      where: { userId },
    });

    if (!account) {
      // 创建新账户
      account = await this.prisma.creditAccount.create({
        data: {
          userId,
          balance: 10000,
          totalEarned: 10000,
        },
      });

      // 创建初始积分交易记录
      await this.prisma.creditTransaction.create({
        data: {
          accountId: account.id,
          type: CreditTransactionType.INITIAL,
          amount: 10000,
          balanceAfter: 10000,
          description: "Welcome bonus credits",
        },
      });

      this.logger.log(`Created new credit account for user ${userId}`);
    }

    return this.formatAccountInfo(account);
  }

  /**
   * 获取账户信息
   */
  async getAccount(userId: string): Promise<CreditAccountInfo | null> {
    const account = await this.prisma.creditAccount.findUnique({
      where: { userId },
    });

    if (!account) {
      return null;
    }

    return this.formatAccountInfo(account);
  }

  /**
   * 获取余额（轻量级查询）
   */
  async getBalance(userId: string): Promise<{
    balance: number;
    isLow: boolean;
    isCritical: boolean;
    todaySpent: number;
  }> {
    const account = await this.prisma.creditAccount.findUnique({
      where: { userId },
      select: {
        balance: true,
        todaySpent: true,
        todayDate: true,
      },
    });

    if (!account) {
      return {
        balance: 0,
        isLow: true,
        isCritical: true,
        todaySpent: 0,
      };
    }

    // 检查是否需要重置今日消费
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySpent =
      account.todayDate && account.todayDate >= today ? account.todaySpent : 0;

    return {
      balance: account.balance,
      isLow: account.balance <= BALANCE_THRESHOLDS.low,
      isCritical: account.balance <= BALANCE_THRESHOLDS.critical,
      todaySpent,
    };
  }

  /**
   * 检查余额是否足够
   */
  async checkBalance(
    userId: string,
    required: number,
  ): Promise<BalanceCheckResult> {
    const account = await this.prisma.creditAccount.findUnique({
      where: { userId },
      select: { balance: true, isFrozen: true },
    });

    if (!account) {
      return {
        sufficient: false,
        balance: 0,
        required,
        deficit: required,
      };
    }

    if (account.isFrozen) {
      throw new AccountFrozenException();
    }

    const sufficient = account.balance >= required;

    return {
      sufficient,
      balance: account.balance,
      required,
      deficit: sufficient ? 0 : required - account.balance,
    };
  }

  /**
   * 预估积分消耗
   */
  async estimateCredits(
    moduleType: string,
    operationType: string,
    tokenCount?: number,
    modelName?: string,
  ): Promise<number> {
    return this.creditRulesService.calculateCredits(
      moduleType,
      operationType,
      tokenCount,
      modelName,
    );
  }

  /**
   * 消耗积分
   */
  async consumeCredits(
    params: ConsumeCreditsParams,
  ): Promise<ConsumeCreditsResult> {
    const {
      userId,
      moduleType,
      operationType,
      tokenCount,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      modelName,
      referenceId,
      description,
      idempotencyKey,
    } = params;

    // 检查幂等性
    if (idempotencyKey) {
      const existing = await this.prisma.creditTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        this.logger.log(`Idempotent request detected: ${idempotencyKey}`);
        return {
          consumed: Math.abs(existing.amount),
          balanceAfter: existing.balanceAfter,
          transactionId: existing.id,
        };
      }
    }

    // 计算消耗积分
    const creditsToConsume = await this.creditRulesService.calculateCredits(
      moduleType,
      operationType,
      tokenCount,
      modelName,
    );

    // 获取规则名称用于描述
    const rule = await this.creditRulesService.getRule(
      moduleType,
      operationType,
    );
    const ruleName = rule?.name;

    // 获取交易类型
    const transactionType = this.getTransactionType(moduleType);

    // 使用事务执行扣减（增加超时以应对高并发连接池竞争）
    const result = await this.prisma.$transaction(
      async (tx) => {
        // 获取账户并检查
        let account = await tx.creditAccount.findUnique({
          where: { userId },
        });

        // 如果账户不存在，自动创建
        if (!account) {
          this.logger.log(`Auto-creating credit account for user ${userId}`);
          account = await tx.creditAccount.create({
            data: {
              userId,
              balance: 10000,
              totalEarned: 10000,
            },
          });
          // 创建初始积分交易记录
          await tx.creditTransaction.create({
            data: {
              accountId: account.id,
              type: CreditTransactionType.INITIAL,
              amount: 10000,
              balanceAfter: 10000,
              description: "初始积分 / Initial credits",
            },
          });
        }

        if (account.isFrozen) {
          throw new AccountFrozenException();
        }

        if (account.balance < creditsToConsume) {
          throw new InsufficientCreditsException(
            creditsToConsume,
            account.balance,
          );
        }

        // 更新余额
        const newBalance = account.balance - creditsToConsume;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 计算今日消费
        let newTodaySpent = creditsToConsume;
        if (account.todayDate && account.todayDate >= today) {
          newTodaySpent = account.todaySpent + creditsToConsume;
        }

        await tx.creditAccount.update({
          where: { id: account.id },
          data: {
            balance: newBalance,
            totalSpent: account.totalSpent + creditsToConsume,
            todaySpent: newTodaySpent,
            todayDate: today,
          },
        });

        // 创建交易记录
        const transaction = await tx.creditTransaction.create({
          data: {
            accountId: account.id,
            type: transactionType,
            amount: -creditsToConsume,
            balanceAfter: newBalance,
            description:
              description || ruleName || `${moduleType} - ${operationType}`,
            moduleType,
            operationType,
            referenceId,
            tokenCount,
            inputTokens,
            outputTokens,
            cacheCreationTokens,
            cacheReadTokens,
            modelName,
            idempotencyKey,
          },
        });

        return {
          consumed: creditsToConsume,
          balanceAfter: newBalance,
          transactionId: transaction.id,
        };
      },
      { timeout: 60000 },
    );

    this.logger.log(
      `User ${userId} consumed ${creditsToConsume} credits for ${moduleType}:${operationType}`,
    );

    return result;
  }

  /**
   * 发放积分
   */
  async grantCredits(
    userId: string,
    amount: number,
    type: CreditTransactionType,
    description: string,
    referenceId?: string,
  ): Promise<{
    success: boolean;
    balanceAfter: number;
    transactionId: string;
  }> {
    const result = await this.prisma.$transaction(async (tx) => {
      // 获取或创建账户
      let account = await tx.creditAccount.findUnique({
        where: { userId },
      });

      if (!account) {
        // 创建新账户，给予初始积分
        account = await tx.creditAccount.create({
          data: {
            userId,
            balance: 10000,
            totalEarned: 10000,
          },
        });

        // 创建初始积分交易记录
        await tx.creditTransaction.create({
          data: {
            accountId: account.id,
            type: CreditTransactionType.INITIAL,
            amount: 10000,
            balanceAfter: 10000,
            description: "Welcome bonus credits",
          },
        });

        this.logger.log(
          `Created new credit account with initial credits for user ${userId}`,
        );
      }

      // 更新余额
      const newBalance = account.balance + amount;

      await tx.creditAccount.update({
        where: { id: account.id },
        data: {
          balance: newBalance,
          totalEarned: account.totalEarned + amount,
        },
      });

      // 创建交易记录
      const transaction = await tx.creditTransaction.create({
        data: {
          accountId: account.id,
          type,
          amount,
          balanceAfter: newBalance,
          description,
          referenceId,
        },
      });

      return {
        success: true,
        balanceAfter: newBalance,
        transactionId: transaction.id,
      };
    });

    this.logger.log(
      `Granted ${amount} credits to user ${userId}: ${description}`,
    );

    return result;
  }

  /**
   * 退还积分
   */
  async refundCredits(
    userId: string,
    amount: number,
    referenceId: string,
    reason: string,
  ): Promise<{ success: boolean; balanceAfter: number }> {
    const result = await this.grantCredits(
      userId,
      amount,
      CreditTransactionType.REFUND,
      `Refund: ${reason}`,
      referenceId,
    );

    return {
      success: result.success,
      balanceAfter: result.balanceAfter,
    };
  }

  /**
   * 获取交易记录
   */
  async getTransactions(
    userId: string,
    query: TransactionQueryDto,
  ): Promise<PaginatedTransactionsResponse> {
    const account = await this.prisma.creditAccount.findUnique({
      where: { userId },
    });

    if (!account) {
      return {
        data: [],
        total: 0,
        limit: query.limit || 20,
        offset: query.offset || 0,
        hasMore: false,
      };
    }

    const where: Prisma.CreditTransactionWhereInput = {
      accountId: account.id,
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.moduleType) {
      where.moduleType = query.moduleType;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    const [transactions, total] = await Promise.all([
      this.prisma.creditTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit || 20,
        skip: query.offset || 0,
      }),
      this.prisma.creditTransaction.count({ where }),
    ]);

    const limit = query.limit || 20;
    const offset = query.offset || 0;

    return {
      data: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        description: t.description,
        moduleType: t.moduleType || undefined,
        operationType: t.operationType || undefined,
        tokenCount: t.tokenCount || undefined,
        modelName: t.modelName || undefined,
        createdAt: t.createdAt,
      })),
      total,
      limit,
      offset,
      hasMore: offset + transactions.length < total,
    };
  }

  /**
   * 冻结账户
   */
  async freezeAccount(userId: string, reason: string): Promise<void> {
    await this.prisma.creditAccount.update({
      where: { userId },
      data: { isFrozen: true },
    });

    this.logger.warn(`Account frozen for user ${userId}: ${reason}`);
  }

  /**
   * 解冻账户
   */
  async unfreezeAccount(userId: string): Promise<void> {
    await this.prisma.creditAccount.update({
      where: { userId },
      data: { isFrozen: false },
    });

    this.logger.log(`Account unfrozen for user ${userId}`);
  }

  /**
   * 格式化账户信息
   */
  private formatAccountInfo(account: {
    balance: number;
    totalEarned: number;
    totalSpent: number;
    giftBalance: number;
    giftExpiresAt: Date | null;
    isActive: boolean;
    isFrozen: boolean;
    todaySpent: number;
  }): CreditAccountInfo {
    return {
      balance: account.balance,
      totalEarned: account.totalEarned,
      totalSpent: account.totalSpent,
      giftBalance: account.giftBalance,
      giftExpiresAt: account.giftExpiresAt,
      isActive: account.isActive,
      isFrozen: account.isFrozen,
      todaySpent: account.todaySpent,
      isLow: account.balance <= BALANCE_THRESHOLDS.low,
      isCritical: account.balance <= BALANCE_THRESHOLDS.critical,
    };
  }

  /**
   * 根据模块类型获取交易类型
   */
  private getTransactionType(moduleType: string): CreditTransactionType {
    const typeMap: Record<string, CreditTransactionType> = {
      "ai-ask": CreditTransactionType.AI_ASK,
      "ai-engine": CreditTransactionType.ADJUSTMENT,
      "ai-teams": CreditTransactionType.AI_TEAMS,
      "ai-planning": CreditTransactionType.AI_PLANNING,
      explore: CreditTransactionType.EXPLORE,
      "ai-office": CreditTransactionType.AI_OFFICE,
      "ai-simulation": CreditTransactionType.AI_SIMULATION,
      "ai-writing": CreditTransactionType.AI_WRITING,
      "ai-image": CreditTransactionType.AI_IMAGE,
      "ai-social": CreditTransactionType.AI_SOCIAL,
      "deep-research": CreditTransactionType.AI_RESEARCH,
      "topic-insights": CreditTransactionType.AI_INSIGHTS,
      "notebook-research": CreditTransactionType.NOTEBOOK_RESEARCH,
      library: CreditTransactionType.LIBRARY,
      notes: CreditTransactionType.NOTES,
      collections: CreditTransactionType.COLLECTIONS,
    };

    return typeMap[moduleType] || CreditTransactionType.ADJUSTMENT;
  }

  /**
   * 为所有现有用户初始化积分账户
   * 用于迁移现有用户
   */
  async initializeAllUserAccounts(): Promise<{
    total: number;
    created: number;
    skipped: number;
  }> {
    // 获取所有没有积分账户的用户
    const usersWithoutAccount = await this.prisma.user.findMany({
      where: {
        creditAccount: null,
      },
      select: {
        id: true,
        username: true,
      },
    });

    let created = 0;
    let skipped = 0;

    for (const user of usersWithoutAccount) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // 双重检查账户不存在
          const existing = await tx.creditAccount.findUnique({
            where: { userId: user.id },
          });

          if (existing) {
            skipped++;
            return;
          }

          // 创建账户
          const account = await tx.creditAccount.create({
            data: {
              userId: user.id,
              balance: 10000,
              totalEarned: 10000,
            },
          });

          // 创建初始积分交易记录
          await tx.creditTransaction.create({
            data: {
              accountId: account.id,
              type: CreditTransactionType.INITIAL,
              amount: 10000,
              balanceAfter: 10000,
              description: "Welcome bonus credits (migration)",
            },
          });

          created++;
        });
      } catch (error) {
        this.logger.error(
          `Failed to create account for user ${user.id}: ${error}`,
        );
        skipped++;
      }
    }

    this.logger.log(
      `Initialized credit accounts: ${created} created, ${skipped} skipped out of ${usersWithoutAccount.length} users`,
    );

    return {
      total: usersWithoutAccount.length,
      created,
      skipped,
    };
  }

  /**
   * 获取用户积分统计
   */
  async getCreditsStats(userId: string): Promise<{
    totalEarned: number;
    totalSpent: number;
    currentBalance: number;
    todaySpent: number;
    weekSpent: number;
    monthSpent: number;
    topModules: Array<{ module: string; spent: number }>;
  }> {
    // Validate userId to prevent Prisma errors
    if (!userId) {
      this.logger.warn("getCreditsStats called with empty userId");
      return {
        totalEarned: 0,
        totalSpent: 0,
        currentBalance: 0,
        todaySpent: 0,
        weekSpent: 0,
        monthSpent: 0,
        topModules: [],
      };
    }

    const account = await this.prisma.creditAccount.findUnique({
      where: { userId },
    });

    if (!account) {
      return {
        totalEarned: 0,
        totalSpent: 0,
        currentBalance: 0,
        todaySpent: 0,
        weekSpent: 0,
        monthSpent: 0,
        topModules: [],
      };
    }

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    const startOfMonth = new Date(now);
    startOfMonth.setMonth(now.getMonth() - 1);

    // 获取各时间段消费
    const [weekSpent, monthSpent, moduleStats] = await Promise.all([
      this.prisma.creditTransaction.aggregate({
        where: {
          accountId: account.id,
          amount: { lt: 0 },
          createdAt: { gte: startOfWeek },
        },
        _sum: { amount: true },
      }),
      this.prisma.creditTransaction.aggregate({
        where: {
          accountId: account.id,
          amount: { lt: 0 },
          createdAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
      this.prisma.creditTransaction.groupBy({
        by: ["moduleType"],
        where: {
          accountId: account.id,
          amount: { lt: 0 },
          moduleType: { not: null },
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "asc" } },
        take: 5,
      }),
    ]);

    return {
      totalEarned: account.totalEarned,
      totalSpent: account.totalSpent,
      currentBalance: account.balance,
      todaySpent: account.todaySpent,
      weekSpent: Math.abs(weekSpent._sum.amount || 0),
      monthSpent: Math.abs(monthSpent._sum.amount || 0),
      topModules: moduleStats.map((m) => ({
        module: m.moduleType || "unknown",
        spent: Math.abs(m._sum.amount || 0),
      })),
    };
  }
}
