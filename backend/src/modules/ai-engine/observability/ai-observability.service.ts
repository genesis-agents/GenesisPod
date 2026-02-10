import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

/**
 * LLM 调用事件
 */
export interface LLMCallEvent {
  id: string;
  timestamp: Date;
  model: string;
  provider: string;
  modelType: string;
  module: string;
  operation: string;
  userId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCost: number;
  success: boolean;
  error?: string;
  fallbackUsed: boolean;
  retryCount: number;
}

/**
 * 模型指标
 */
export interface ModelMetrics {
  calls: number;
  tokens: number;
  cost: number;
  avgLatencyMs: number;
  errorRate: number;
}

/**
 * 模块指标
 */
export interface ModuleMetrics {
  calls: number;
  tokens: number;
  cost: number;
  topModels: string[];
}

/**
 * 可观测性仪表盘
 */
export interface ObservabilityDashboard {
  period: { start: Date; end: Date };
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  fallbackRate: number;
  byModel: Record<string, ModelMetrics>;
  byModule: Record<string, ModuleMetrics>;
  byUser: Array<{ userId: string; calls: number; tokens: number; cost: number }>;
  recentErrors: Array<{ timestamp: Date; model: string; error: string }>;
}

/**
 * LLM 成本估算（美元/1K tokens）
 */
const COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'grok-2': { input: 0.002, output: 0.01 },
  'grok-beta': { input: 0.005, output: 0.015 },
  'default': { input: 0.001, output: 0.002 },
};

/**
 * AI 可观测性服务
 *
 * 职责：
 * - 记录所有 LLM 调用的详细指标（模型、tokens、延迟、成本）
 * - 追踪成本归因（按用户、模块、模型）
 * - 计算延迟百分位数（p50/p95/p99）
 * - 提供质量信号（错误率、回退率、重试次数）
 * - 聚合数据用于仪表盘展示
 *
 * 实现特性：
 * - 环形缓冲区存储最近 10000 个事件
 * - 自动驱逐旧事件
 * - 原子操作保证数据一致性
 * - 高性能聚合计算
 */
@Injectable()
export class AiObservabilityService {
  private readonly logger = new Logger(AiObservabilityService.name);

  /**
   * 环形缓冲区，存储最近的 LLM 调用事件
   */
  private readonly events: LLMCallEvent[] = [];

  /**
   * 环形缓冲区最大容量
   */
  private readonly MAX_EVENTS = 10000;

  /**
   * 当前写入位置（环形缓冲区索引）
   */
  private writeIndex = 0;

  /**
   * 已记录的事件总数（包括已被驱逐的）
   */
  private totalEventsRecorded = 0;

  /**
   * 记录 LLM 调用事件
   *
   * 核心追踪方法，每次 LLM 调用后应调用此方法记录指标
   *
   * @param event - 调用事件（不含 id 和 timestamp，自动生成）
   */
  recordLLMCall(event: Omit<LLMCallEvent, 'id' | 'timestamp'>): void {
    const fullEvent: LLMCallEvent = {
      id: randomUUID(),
      timestamp: new Date(),
      ...event,
    };

    // 环形缓冲区写入：未满时追加，满了后覆盖旧数据
    if (this.events.length < this.MAX_EVENTS) {
      this.events.push(fullEvent);
    } else {
      this.events[this.writeIndex] = fullEvent;
    }

    this.writeIndex = (this.writeIndex + 1) % this.MAX_EVENTS;
    this.totalEventsRecorded++;

    // 记录失败调用（警告级别）
    if (!fullEvent.success && fullEvent.error) {
      this.logger.warn(
        `LLM 调用失败: ${fullEvent.model} @ ${fullEvent.module}.${fullEvent.operation} - ${fullEvent.error}`,
      );
    }

    // 记录高成本调用（超过 $0.10）
    if (fullEvent.estimatedCost > 0.1) {
      this.logger.log(
        `高成本 LLM 调用: $${fullEvent.estimatedCost.toFixed(4)} - ${fullEvent.model} (${fullEvent.totalTokens} tokens)`,
      );
    }

    // 记录高延迟调用（超过 10 秒）
    if (fullEvent.latencyMs > 10000) {
      this.logger.warn(
        `高延迟 LLM 调用: ${fullEvent.latencyMs}ms - ${fullEvent.model} @ ${fullEvent.module}.${fullEvent.operation}`,
      );
    }
  }

  /**
   * 获取仪表盘聚合数据
   *
   * @param periodMinutes - 时间窗口（分钟），默认 60 分钟
   * @returns 包含完整指标的仪表盘数据
   */
  getDashboard(periodMinutes: number = 60): ObservabilityDashboard {
    const now = new Date();
    const startTime = new Date(now.getTime() - periodMinutes * 60 * 1000);

    // 过滤时间窗口内的事件
    const recentEvents = this.events.filter(
      (e) => e.timestamp >= startTime && e.timestamp <= now,
    );

    if (recentEvents.length === 0) {
      return this.getEmptyDashboard(startTime, now);
    }

    // 基础聚合
    const totalCalls = recentEvents.length;
    const successfulCalls = recentEvents.filter((e) => e.success).length;
    const fallbackCalls = recentEvents.filter((e) => e.fallbackUsed).length;
    const totalTokens = recentEvents.reduce((sum, e) => sum + e.totalTokens, 0);
    const totalCost = recentEvents.reduce((sum, e) => sum + e.estimatedCost, 0);
    const totalLatency = recentEvents.reduce((sum, e) => sum + e.latencyMs, 0);

    // 按维度聚合
    const byModel = this.aggregateByModel(recentEvents);
    const byModule = this.aggregateByModule(recentEvents);
    const byUser = this.aggregateByUser(recentEvents);

    // 延迟百分位数
    const latencies = recentEvents.map((e) => e.latencyMs).sort((a, b) => a - b);
    const p95LatencyMs = this.percentile(latencies, 0.95);
    const p99LatencyMs = this.percentile(latencies, 0.99);

    // 最近错误（最多 10 条）
    const recentErrors = recentEvents
      .filter((e) => !e.success && e.error)
      .slice(-10)
      .reverse()
      .map((e) => ({
        timestamp: e.timestamp,
        model: e.model,
        error: e.error!,
      }));

    return {
      period: { start: startTime, end: now },
      totalCalls,
      totalTokens,
      totalCost,
      successRate: totalCalls > 0 ? successfulCalls / totalCalls : 0,
      avgLatencyMs: totalCalls > 0 ? totalLatency / totalCalls : 0,
      p95LatencyMs,
      p99LatencyMs,
      fallbackRate: totalCalls > 0 ? fallbackCalls / totalCalls : 0,
      byModel,
      byModule,
      byUser,
      recentErrors,
    };
  }

  /**
   * 获取特定模型的指标
   *
   * @param model - 模型名称（如 "gpt-4o"）
   * @returns 模型指标，如果没有数据则返回 null
   */
  getModelMetrics(model: string): ModelMetrics | null {
    const modelEvents = this.events.filter((e) => e.model === model);

    if (modelEvents.length === 0) {
      return null;
    }

    const calls = modelEvents.length;
    const successfulCalls = modelEvents.filter((e) => e.success).length;
    const tokens = modelEvents.reduce((sum, e) => sum + e.totalTokens, 0);
    const cost = modelEvents.reduce((sum, e) => sum + e.estimatedCost, 0);
    const totalLatency = modelEvents.reduce((sum, e) => sum + e.latencyMs, 0);

    return {
      calls,
      tokens,
      cost,
      avgLatencyMs: totalLatency / calls,
      errorRate: 1 - successfulCalls / calls,
    };
  }

  /**
   * 获取用户成本归因
   *
   * 按用户追踪成本分布，支持模块和模型维度分解
   *
   * @param userId - 用户 ID
   * @returns 用户的总成本及按模块、模型的分解
   */
  getCostAttribution(userId: string): {
    total: number;
    byModule: Record<string, number>;
    byModel: Record<string, number>;
  } {
    const userEvents = this.events.filter((e) => e.userId === userId);

    const total = userEvents.reduce((sum, e) => sum + e.estimatedCost, 0);

    const byModule: Record<string, number> = {};
    const byModel: Record<string, number> = {};

    for (const event of userEvents) {
      byModule[event.module] = (byModule[event.module] || 0) + event.estimatedCost;
      byModel[event.model] = (byModel[event.model] || 0) + event.estimatedCost;
    }

    return { total, byModule, byModel };
  }

  /**
   * 获取延迟百分位数
   *
   * @param model - 可选，指定模型筛选
   * @returns p50/p95/p99 延迟（毫秒）
   */
  getLatencyPercentiles(model?: string): { p50: number; p95: number; p99: number } {
    let relevantEvents = this.events;

    if (model) {
      relevantEvents = relevantEvents.filter((e) => e.model === model);
    }

    if (relevantEvents.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const latencies = relevantEvents.map((e) => e.latencyMs).sort((a, b) => a - b);

    return {
      p50: this.percentile(latencies, 0.5),
      p95: this.percentile(latencies, 0.95),
      p99: this.percentile(latencies, 0.99),
    };
  }

  /**
   * 获取最近的错误事件
   *
   * @param limit - 返回数量限制，默认 20
   * @returns 最近的失败调用事件（时间倒序）
   */
  getRecentErrors(limit: number = 20): LLMCallEvent[] {
    return this.events
      .filter((e) => !e.success)
      .slice(-limit)
      .reverse();
  }

  /**
   * 重置所有数据
   *
   * 清空环形缓冲区和计数器，主要用于测试
   */
  reset(): void {
    this.events.length = 0;
    this.writeIndex = 0;
    this.totalEventsRecorded = 0;
    this.logger.log('可观测性数据已重置');
  }

  /**
   * 估算 LLM 调用成本
   *
   * 基于预定义的价格表计算成本（输入和输出 tokens 分别计价）
   *
   * @param model - 模型名称
   * @param inputTokens - 输入 tokens 数
   * @param outputTokens - 输出 tokens 数
   * @returns 估算成本（美元）
   */
  static estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = COST_PER_1K_TOKENS[model] || COST_PER_1K_TOKENS['default'];
    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * 按模型聚合事件
   */
  private aggregateByModel(events: LLMCallEvent[]): Record<string, ModelMetrics> {
    const modelMap = new Map<string, LLMCallEvent[]>();

    for (const event of events) {
      if (!modelMap.has(event.model)) {
        modelMap.set(event.model, []);
      }
      modelMap.get(event.model)!.push(event);
    }

    const result: Record<string, ModelMetrics> = {};

    for (const [model, modelEvents] of modelMap.entries()) {
      const calls = modelEvents.length;
      const successfulCalls = modelEvents.filter((e) => e.success).length;
      const tokens = modelEvents.reduce((sum, e) => sum + e.totalTokens, 0);
      const cost = modelEvents.reduce((sum, e) => sum + e.estimatedCost, 0);
      const totalLatency = modelEvents.reduce((sum, e) => sum + e.latencyMs, 0);

      result[model] = {
        calls,
        tokens,
        cost,
        avgLatencyMs: totalLatency / calls,
        errorRate: 1 - successfulCalls / calls,
      };
    }

    return result;
  }

  /**
   * 按模块聚合事件
   */
  private aggregateByModule(events: LLMCallEvent[]): Record<string, ModuleMetrics> {
    const moduleMap = new Map<string, LLMCallEvent[]>();

    for (const event of events) {
      if (!moduleMap.has(event.module)) {
        moduleMap.set(event.module, []);
      }
      moduleMap.get(event.module)!.push(event);
    }

    const result: Record<string, ModuleMetrics> = {};

    for (const [moduleName, moduleEvents] of moduleMap.entries()) {
      const calls = moduleEvents.length;
      const tokens = moduleEvents.reduce((sum, e) => sum + e.totalTokens, 0);
      const cost = moduleEvents.reduce((sum, e) => sum + e.estimatedCost, 0);

      // 统计该模块最常用的模型（Top 3）
      const modelCounts = new Map<string, number>();
      for (const event of moduleEvents) {
        modelCounts.set(event.model, (modelCounts.get(event.model) || 0) + 1);
      }

      const topModels = Array.from(modelCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([model]) => model);

      result[moduleName] = {
        calls,
        tokens,
        cost,
        topModels,
      };
    }

    return result;
  }

  /**
   * 按用户聚合事件
   */
  private aggregateByUser(
    events: LLMCallEvent[],
  ): Array<{ userId: string; calls: number; tokens: number; cost: number }> {
    const userMap = new Map<string, { calls: number; tokens: number; cost: number }>();

    for (const event of events) {
      if (!event.userId) continue;

      if (!userMap.has(event.userId)) {
        userMap.set(event.userId, { calls: 0, tokens: 0, cost: 0 });
      }

      const userStats = userMap.get(event.userId)!;
      userStats.calls++;
      userStats.tokens += event.totalTokens;
      userStats.cost += event.estimatedCost;
    }

    return Array.from(userMap.entries())
      .map(([userId, stats]) => ({ userId, ...stats }))
      .sort((a, b) => b.cost - a.cost) // 按成本降序
      .slice(0, 20); // 取 Top 20 用户
  }

  /**
   * 计算百分位数
   *
   * @param sortedArray - 已排序的数组
   * @param p - 百分位（0-1，如 0.95 表示 p95）
   * @returns 百分位数值
   */
  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;

    const index = Math.ceil(sortedArray.length * p) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * 获取空仪表盘（无数据时）
   */
  private getEmptyDashboard(start: Date, end: Date): ObservabilityDashboard {
    return {
      period: { start, end },
      totalCalls: 0,
      totalTokens: 0,
      totalCost: 0,
      successRate: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      fallbackRate: 0,
      byModel: {},
      byModule: {},
      byUser: [],
      recentErrors: [],
    };
  }
}
