/**
 * Token Budget Service
 * Token 预算管理服务 - 跟踪和执行 Token 使用限额
 */

import { Injectable, Logger } from "@nestjs/common";

/**
 * Token 预算条目
 */
export interface TokenBudgetEntry {
  /** 预算 ID（通常是 missionId 或 sessionId） */
  id: string;
  /** 最大 Token 数 */
  maxTokens: number;
  /** 已使用 Token 数 */
  usedTokens: number;
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
}

/**
 * Token 使用记录
 */
export interface TokenUsageRecord {
  /** 所属预算 ID */
  budgetId: string;
  /** 操作名称 */
  operation: string;
  /** 输入 Token 数 */
  inputTokens: number;
  /** 输出 Token 数 */
  outputTokens: number;
  /** 总 Token 数 */
  totalTokens: number;
  /** 记录时间 */
  timestamp: Date;
}

/**
 * Token 预算检查结果
 */
export interface TokenBudgetCheckResult {
  /** 是否允许 */
  allowed: boolean;
  /** 剩余 Token 数 */
  remaining: number;
  /** 使用率（0-1） */
  usageRate: number;
  /** 拒绝原因（如果不允许） */
  reason?: string;
}

/**
 * Token 预算服务
 *
 * 负责追踪各 Mission/Session 的 Token 消耗，执行预算上限约束。
 */
@Injectable()
export class TokenBudgetService {
  private readonly logger = new Logger(TokenBudgetService.name);

  private readonly budgets = new Map<string, TokenBudgetEntry>();
  private readonly usageHistory = new Map<string, TokenUsageRecord[]>();

  /**
   * 创建 Token 预算
   */
  createBudget(id: string, maxTokens: number): TokenBudgetEntry {
    const entry: TokenBudgetEntry = {
      id,
      maxTokens,
      usedTokens: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.budgets.set(id, entry);
    this.usageHistory.set(id, []);
    this.logger.debug(
      `[TokenBudget] Created budget ${id} with limit ${maxTokens} tokens`,
    );
    return entry;
  }

  /**
   * 检查是否有足够预算
   */
  check(budgetId: string, estimatedTokens: number): TokenBudgetCheckResult {
    const budget = this.budgets.get(budgetId);
    if (!budget) {
      // 没有预算约束时默认允许
      return { allowed: true, remaining: Infinity, usageRate: 0 };
    }

    const remaining = budget.maxTokens - budget.usedTokens;
    const usageRate =
      budget.maxTokens > 0 ? budget.usedTokens / budget.maxTokens : 0;

    if (budget.usedTokens + estimatedTokens > budget.maxTokens) {
      return {
        allowed: false,
        remaining,
        usageRate,
        reason: `Token budget exceeded: ${budget.usedTokens + estimatedTokens} > ${budget.maxTokens}`,
      };
    }

    return { allowed: true, remaining, usageRate };
  }

  /**
   * 消耗 Token 预算
   */
  consume(
    budgetId: string,
    operation: string,
    inputTokens: number,
    outputTokens: number,
  ): void {
    const totalTokens = inputTokens + outputTokens;

    // 记录使用历史
    const record: TokenUsageRecord = {
      budgetId,
      operation,
      inputTokens,
      outputTokens,
      totalTokens,
      timestamp: new Date(),
    };

    const history = this.usageHistory.get(budgetId) ?? [];
    history.push(record);
    this.usageHistory.set(budgetId, history);

    // 更新预算使用量
    const budget = this.budgets.get(budgetId);
    if (budget) {
      budget.usedTokens += totalTokens;
      budget.updatedAt = new Date();

      const usageRate =
        budget.maxTokens > 0 ? budget.usedTokens / budget.maxTokens : 0;
      if (usageRate >= 0.9) {
        this.logger.warn(
          `[TokenBudget] Budget ${budgetId} at ${(usageRate * 100).toFixed(1)}% usage (${budget.usedTokens}/${budget.maxTokens})`,
        );
      }
    }

    this.logger.debug(
      `[TokenBudget] Budget ${budgetId} consumed ${totalTokens} tokens for "${operation}"`,
    );
  }

  /**
   * 获取预算状态
   */
  getBudget(budgetId: string): TokenBudgetEntry | null {
    return this.budgets.get(budgetId) ?? null;
  }

  /**
   * 获取预算使用历史
   */
  getUsageHistory(budgetId: string): TokenUsageRecord[] {
    return this.usageHistory.get(budgetId) ?? [];
  }

  /**
   * 获取预算汇总统计
   */
  getSummary(budgetId: string): {
    totalUsed: number;
    maxTokens: number;
    remaining: number;
    usageRate: number;
    operationCount: number;
  } | null {
    const budget = this.budgets.get(budgetId);
    if (!budget) return null;

    const history = this.usageHistory.get(budgetId) ?? [];
    const remaining = Math.max(0, budget.maxTokens - budget.usedTokens);

    return {
      totalUsed: budget.usedTokens,
      maxTokens: budget.maxTokens,
      remaining,
      usageRate:
        budget.maxTokens > 0 ? budget.usedTokens / budget.maxTokens : 0,
      operationCount: history.length,
    };
  }

  /**
   * 删除预算（任务完成后清理）
   */
  deleteBudget(budgetId: string): void {
    this.budgets.delete(budgetId);
    this.usageHistory.delete(budgetId);
    this.logger.debug(`[TokenBudget] Deleted budget ${budgetId}`);
  }

  /**
   * 获取所有活跃预算数量
   */
  getActiveBudgetCount(): number {
    return this.budgets.size;
  }
}
