/**
 * AI Engine - Cost Controller
 * 成本控制器实现
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { LruMap } from "@/common/utils/lru-map";
import { CacheService } from "@/common/cache/cache.service";

/**
 * 成本记录
 */
export interface CostRecord {
  id: string;
  timestamp: Date;
  category: CostCategory;
  operation: string;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 成本类别
 */
export type CostCategory =
  | "llm" // LLM 调用
  | "embedding" // 嵌入向量
  | "image" // 图像生成
  | "speech" // 语音
  | "search" // 搜索
  | "storage" // 存储
  | "other"; // 其他

/**
 * 成本预算
 */
export interface CostBudget {
  /**
   * 预算 ID
   */
  id: string;

  /**
   * 预算名称
   */
  name: string;

  /**
   * 预算金额
   */
  amount: number;

  /**
   * 预算周期
   */
  period: BudgetPeriod;

  /**
   * 适用类别（空表示所有）
   */
  categories?: CostCategory[];

  /**
   * 已使用金额
   */
  used: number;

  /**
   * 告警阈值 (0-1)
   */
  alertThreshold?: number;

  /**
   * 周期开始时间
   */
  periodStart: Date;

  /**
   * 周期结束时间
   */
  periodEnd: Date;
}

/**
 * 预算周期
 */
export type BudgetPeriod = "hourly" | "daily" | "weekly" | "monthly" | "yearly";

/**
 * 成本检查结果
 */
export interface CostCheckResult {
  /**
   * 是否允许
   */
  allowed: boolean;

  /**
   * 剩余预算
   */
  remaining: number;

  /**
   * 预算使用率
   */
  usageRate: number;

  /**
   * 是否达到告警阈值
   */
  alertTriggered: boolean;

  /**
   * 超出预算的原因
   */
  reason?: string;

  /**
   * 触发的预算
   */
  triggeredBudget?: string;
}

/**
 * 模型定价
 */
export interface ModelPricing {
  model: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  currency?: string;
}

/**
 * 成本控制器
 */
@Injectable()
export class CostController {
  private readonly logger = new Logger(CostController.name);
  private readonly records: CostRecord[] = [];
  private readonly budgets = new LruMap<string, CostBudget>(1000);
  private readonly pricing = new LruMap<string, ModelPricing>(200);

  /**
   * 默认定价（USD per million tokens）
   *
   * NOTE: Model name strings here are intentional — this is a pricing reference table
   * for cost estimation, not LLM call configuration. New models should be added when
   * their public pricing is available. This is a legitimate exception to the no-hardcoded-
   * model-names rule (which applies to LLM call sites, not pricing metadata).
   */
  private static readonly DEFAULT_PRICING: ModelPricing[] = [
    { model: "gpt-4o", inputPricePerMillion: 2.5, outputPricePerMillion: 10 },
    {
      model: "gpt-4o-mini",
      inputPricePerMillion: 0.15,
      outputPricePerMillion: 0.6,
    },
    {
      model: "gpt-4-turbo",
      inputPricePerMillion: 10,
      outputPricePerMillion: 30,
    },
    {
      model: "claude-3-5-sonnet",
      inputPricePerMillion: 3,
      outputPricePerMillion: 15,
    },
    {
      model: "claude-3-opus",
      inputPricePerMillion: 15,
      outputPricePerMillion: 75,
    },
    {
      model: "claude-3-haiku",
      inputPricePerMillion: 0.25,
      outputPricePerMillion: 1.25,
    },
  ];

  constructor(@Optional() private readonly cacheService?: CacheService) {
    this.initializeDefaultPricing();
  }

  /**
   * 初始化默认定价
   */
  private initializeDefaultPricing(): void {
    for (const pricing of CostController.DEFAULT_PRICING) {
      this.pricing.set(pricing.model, pricing);
    }
  }

  /**
   * 计算预算的 Redis TTL（秒），基于周期剩余时间
   */
  private budgetTtlSeconds(budget: CostBudget): number {
    const remainingMs = budget.periodEnd.getTime() - Date.now();
    return Math.max(Math.ceil(remainingMs / 1000), 60); // 至少 60 秒
  }

  /**
   * 设置模型定价
   */
  setModelPricing(pricing: ModelPricing): void {
    this.pricing.set(pricing.model, pricing);
  }

  /**
   * 计算成本
   */
  calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): number {
    const pricing = this.pricing.get(model);
    if (!pricing) {
      // 使用默认估算
      return ((inputTokens + outputTokens) * 0.001) / 1000;
    }

    const inputCost = (inputTokens / 1000000) * pricing.inputPricePerMillion;
    const outputCost = (outputTokens / 1000000) * pricing.outputPricePerMillion;

    return inputCost + outputCost;
  }

  /**
   * 记录成本
   */
  recordCost(record: Omit<CostRecord, "id" | "timestamp">): CostRecord {
    const fullRecord: CostRecord = {
      ...record,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };

    this.records.push(fullRecord);

    // 更新预算使用量
    this.updateBudgets(fullRecord);

    // Write record to Redis (CacheService handles errors internally)
    if (this.cacheService) {
      const dateKey = fullRecord.timestamp.toISOString().slice(0, 10);
      void this.cacheService.set(
        `ai:cost:record:${fullRecord.category}:${dateKey}:${fullRecord.id}`,
        fullRecord,
        86400,
      );
    }

    return fullRecord;
  }

  /**
   * 检查预算
   */
  checkBudget(
    estimatedCost: number,
    category?: CostCategory,
    _userId?: string,
  ): CostCheckResult {
    let lowestRemaining = Infinity;
    let highestUsageRate = 0;
    let alertTriggered = false;
    let triggeredBudget: string | undefined;
    let reason: string | undefined;

    for (const budget of this.budgets.values()) {
      // 检查预算是否过期
      if (new Date() > budget.periodEnd) {
        this.resetBudget(budget.id);
        continue;
      }

      // 检查类别是否匹配
      if (
        budget.categories &&
        category &&
        !budget.categories.includes(category)
      ) {
        continue;
      }

      const remaining = budget.amount - budget.used;
      const usageRate = budget.used / budget.amount;

      if (remaining < lowestRemaining) {
        lowestRemaining = remaining;
      }

      if (usageRate > highestUsageRate) {
        highestUsageRate = usageRate;
      }

      // 检查是否达到告警阈值
      if (budget.alertThreshold && usageRate >= budget.alertThreshold) {
        alertTriggered = true;
      }

      // 检查是否超出预算
      if (budget.used + estimatedCost > budget.amount) {
        triggeredBudget = budget.name;
        reason = `Would exceed budget "${budget.name}" (${budget.used.toFixed(4)} + ${estimatedCost.toFixed(4)} > ${budget.amount.toFixed(4)})`;
      }
    }

    return {
      allowed: !triggeredBudget,
      remaining: lowestRemaining === Infinity ? -1 : lowestRemaining,
      usageRate: highestUsageRate,
      alertTriggered,
      reason,
      triggeredBudget,
    };
  }

  /**
   * 创建预算
   */
  createBudget(options: {
    name: string;
    amount: number;
    period: BudgetPeriod;
    categories?: CostCategory[];
    alertThreshold?: number;
  }): CostBudget {
    const now = new Date();
    const { periodStart, periodEnd } = this.calculatePeriod(
      now,
      options.period,
    );

    const budget: CostBudget = {
      id: crypto.randomUUID(),
      name: options.name,
      amount: options.amount,
      period: options.period,
      categories: options.categories,
      used: 0,
      alertThreshold: options.alertThreshold ?? 0.8,
      periodStart,
      periodEnd,
    };

    this.budgets.set(budget.id, budget);

    if (this.cacheService) {
      void this.cacheService.set(
        `ai:cost:budget:${budget.id}`,
        budget,
        this.budgetTtlSeconds(budget),
      );
    }

    return budget;
  }

  /**
   * 计算周期时间
   */
  private calculatePeriod(
    date: Date,
    period: BudgetPeriod,
  ): { periodStart: Date; periodEnd: Date } {
    const start = new Date(date);
    const end = new Date(date);

    switch (period) {
      case "hourly":
        start.setMinutes(0, 0, 0);
        end.setMinutes(0, 0, 0);
        end.setHours(end.getHours() + 1);
        break;

      case "daily":
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() + 1);
        break;

      case "weekly": {
        const day = start.getDay();
        start.setDate(start.getDate() - day);
        start.setHours(0, 0, 0, 0);
        // ★ Fix: copy from start (which may have crossed month boundary),
        // not from original end (which stays in the original month)
        end.setTime(start.getTime());
        end.setDate(end.getDate() + 7);
        break;
      }

      case "monthly":
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth() + 1);
        end.setDate(1);
        end.setHours(0, 0, 0, 0);
        break;

      case "yearly":
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        end.setFullYear(end.getFullYear() + 1);
        end.setMonth(0, 1);
        end.setHours(0, 0, 0, 0);
        break;
    }

    return { periodStart: start, periodEnd: end };
  }

  /**
   * 更新预算使用量
   */
  private updateBudgets(record: CostRecord): void {
    for (const budget of this.budgets.values()) {
      // 检查预算是否过期
      if (new Date() > budget.periodEnd) {
        this.resetBudget(budget.id);
        continue;
      }

      // 检查类别是否匹配
      if (budget.categories && !budget.categories.includes(record.category)) {
        continue;
      }

      budget.used += record.cost;

      // 检查是否触发告警
      if (budget.alertThreshold) {
        const usageRate = budget.used / budget.amount;
        if (usageRate >= budget.alertThreshold) {
          this.logger.warn(
            `Budget "${budget.name}" reached ${(usageRate * 100).toFixed(1)}% of limit`,
          );
        }
      }

      // Sync updated budget to Redis
      if (this.cacheService) {
        void this.cacheService.set(
          `ai:cost:budget:${budget.id}`,
          budget,
          this.budgetTtlSeconds(budget),
        );
      }
    }
  }

  /**
   * 重置预算
   */
  private resetBudget(budgetId: string): void {
    const budget = this.budgets.get(budgetId);
    if (!budget) return;

    const now = new Date();
    const { periodStart, periodEnd } = this.calculatePeriod(now, budget.period);

    budget.used = 0;
    budget.periodStart = periodStart;
    budget.periodEnd = periodEnd;
  }

  /**
   * 获取成本统计
   */
  getStats(options?: {
    startDate?: Date;
    endDate?: Date;
    category?: CostCategory;
    userId?: string;
  }): {
    totalCost: number;
    totalTokens: number;
    byCategory: Record<string, number>;
    byOperation: Record<string, number>;
  } {
    let filteredRecords = this.records;

    if (options?.startDate) {
      filteredRecords = filteredRecords.filter(
        (r) => r.timestamp >= options.startDate!,
      );
    }

    if (options?.endDate) {
      filteredRecords = filteredRecords.filter(
        (r) => r.timestamp <= options.endDate!,
      );
    }

    if (options?.category) {
      filteredRecords = filteredRecords.filter(
        (r) => r.category === options.category,
      );
    }

    if (options?.userId) {
      filteredRecords = filteredRecords.filter(
        (r) => r.userId === options.userId,
      );
    }

    const byCategory: Record<string, number> = {};
    const byOperation: Record<string, number> = {};
    let totalCost = 0;
    let totalTokens = 0;

    for (const record of filteredRecords) {
      totalCost += record.cost;
      totalTokens += record.tokens?.total || 0;

      byCategory[record.category] =
        (byCategory[record.category] || 0) + record.cost;
      byOperation[record.operation] =
        (byOperation[record.operation] || 0) + record.cost;
    }

    return {
      totalCost,
      totalTokens,
      byCategory,
      byOperation,
    };
  }

  /**
   * 获取所有预算
   */
  getBudgets(): CostBudget[] {
    return Array.from(this.budgets.values());
  }
}
