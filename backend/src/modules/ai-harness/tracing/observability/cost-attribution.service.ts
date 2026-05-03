import {
  Injectable,
  Logger,
  Optional,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * 成本事件
 */
export interface CostEvent {
  userId: string;
  moduleType: string; // e.g., "ai-ask", "ai-teams", "research", "mcp-server"
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number; // USD
  timestamp?: Date;
  /**
   * BYOK v2：Key 来源。用于按「用户自付」vs「管理员分配」vs「系统」聚合。
   * - PERSONAL：用户自己的 Key
   * - ASSIGNED：管理员从分发池分配的 Key
   * - SYSTEM：系统 Secret（仅管理员账号）
   */
  apiKeySource?: "PERSONAL" | "ASSIGNED" | "SYSTEM";
}

/**
 * 成本报告
 */
export interface CostReport {
  period: { start: Date; end: Date };
  totalCost: number;
  totalTokens: number;
  byUser: CostByUser[];
  byModule: CostByModule[];
  byModel: CostByModel[];
  hourlyTrend: HourlyBucket[];
}

/**
 * 用户成本统计
 */
export interface CostByUser {
  userId: string;
  totalCost: number;
  totalTokens: number;
  callCount: number;
  topModule: string;
  topModel: string;
}

/**
 * 模块成本统计
 */
export interface CostByModule {
  moduleType: string;
  totalCost: number;
  totalTokens: number;
  callCount: number;
  avgCostPerCall: number;
}

/**
 * 模型成本统计
 */
export interface CostByModel {
  model: string;
  provider: string;
  totalCost: number;
  totalTokens: number;
  callCount: number;
  avgTokensPerCall: number;
}

/**
 * 小时级别成本桶
 */
export interface HourlyBucket {
  hour: string; // ISO format "2026-02-10T14:00:00Z"
  cost: number;
  tokens: number;
  calls: number;
}

/**
 * 预算告警
 */
export interface BudgetAlert {
  userId: string;
  threshold: number; // USD
  currentSpend: number;
  period: "daily" | "monthly";
  triggered: boolean;
  triggeredAt?: Date;
}

/**
 * 小时桶聚合数据
 */
interface HourlyBucketData {
  cost: number;
  tokens: number;
  calls: number;
  byUser: Map<string, { cost: number; tokens: number; calls: number }>;
  byModule: Map<string, { cost: number; tokens: number; calls: number }>;
  byModel: Map<
    string,
    { cost: number; tokens: number; calls: number; provider: string }
  >;
}

/**
 * 用户聚合数据
 */
interface UserAggregation {
  totalCost: number;
  totalTokens: number;
  callCount: number;
  byModule: Map<string, { cost: number; tokens: number; calls: number }>;
  byModel: Map<string, { cost: number; tokens: number; calls: number }>;
  lastAccess: number; // timestamp for LRU
}

/**
 * 预算告警配置
 */
interface BudgetConfig {
  threshold: number;
  period: "daily" | "monthly";
  lastTriggered?: Date;
}

/**
 * 成本归因服务
 *
 * 追踪和分析 AI 调用成本，支持多维度聚合和预算告警
 */
@Injectable()
export class CostAttributionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CostAttributionService.name);

  // 小时桶存储: "2026-02-10T14" -> HourlyBucketData
  private readonly hourlyBuckets = new Map<string, HourlyBucketData>();

  // 用户聚合数据: userId -> UserAggregation
  private readonly userAggregations = new Map<string, UserAggregation>();

  // 预算告警配置: userId -> BudgetConfig
  private readonly budgetConfigs = new Map<string, BudgetConfig>();

  // LRU 配置
  private readonly MAX_USERS = 10000;
  private readonly BUCKET_RETENTION_DAYS = 30;

  // DB persistence
  private readonly pendingCostEvents: CostEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private readonly FLUSH_INTERVAL_MS = 5 * 60 * 1000;
  private readonly FLUSH_BATCH_SIZE = 500;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  onModuleInit() {
    if (this.prisma) {
      this.flushInterval = setInterval(
        () => this.flushCostsToDB(),
        this.FLUSH_INTERVAL_MS,
      ).unref();
      this.logger.log(
        `Cost DB persistence enabled, flush interval: ${this.FLUSH_INTERVAL_MS / 1000}s`,
      );
    }
  }

  onModuleDestroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    if (this.prisma && this.pendingCostEvents.length > 0) {
      this.flushCostsToDB().catch((err) =>
        this.logger.error(`Final cost flush failed: ${err}`),
      );
    }
  }

  /**
   * 记录成本事件
   */
  recordCost(event: CostEvent): void {
    const timestamp = event.timestamp || new Date();
    const hourKey = this.getHourKey(timestamp);

    // 获取或创建小时桶
    let bucket = this.hourlyBuckets.get(hourKey);
    if (!bucket) {
      bucket = this.createEmptyBucket();
      this.hourlyBuckets.set(hourKey, bucket);
    }

    // 更新小时桶聚合
    bucket.cost += event.estimatedCost;
    bucket.tokens += event.inputTokens + event.outputTokens;
    bucket.calls += 1;

    // 更新用户维度
    this.updateBucketDimension(
      bucket.byUser,
      event.userId,
      event.estimatedCost,
      event.inputTokens + event.outputTokens,
    );

    // 更新模块维度
    this.updateBucketDimension(
      bucket.byModule,
      event.moduleType,
      event.estimatedCost,
      event.inputTokens + event.outputTokens,
    );

    // 更新模型维度
    const modelKey = `${event.provider}:${event.model}`;
    this.updateBucketDimension(
      bucket.byModel,
      modelKey,
      event.estimatedCost,
      event.inputTokens + event.outputTokens,
      event.provider,
    );

    // 更新用户聚合数据
    this.updateUserAggregation(event);

    // 加入待持久化队列
    if (this.prisma) {
      this.pendingCostEvents.push(event);
    }

    // 清理过期数据
    this.cleanupExpiredBuckets();
    this.evictLRU();
  }

  /**
   * 获取成本报告
   */
  getCostReport(options?: {
    periodHours?: number;
    userId?: string;
  }): CostReport {
    const periodHours = options?.periodHours || 24;
    const now = new Date();
    const startTime = new Date(now.getTime() - periodHours * 60 * 60 * 1000);

    const hourlyTrend: HourlyBucket[] = [];
    const userCosts = new Map<
      string,
      {
        cost: number;
        tokens: number;
        calls: number;
        modules: Map<string, number>;
        models: Map<string, number>;
      }
    >();
    const moduleCosts = new Map<
      string,
      { cost: number; tokens: number; calls: number }
    >();
    const modelCosts = new Map<
      string,
      { cost: number; tokens: number; calls: number; provider: string }
    >();

    let totalCost = 0;
    let totalTokens = 0;

    // 遍历小时桶收集数据
    for (const [hourKey, bucket] of this.hourlyBuckets.entries()) {
      const bucketTime = this.parseHourKey(hourKey);
      if (bucketTime >= startTime && bucketTime <= now) {
        // 添加到小时趋势
        hourlyTrend.push({
          hour: bucketTime.toISOString(),
          cost: bucket.cost,
          tokens: bucket.tokens,
          calls: bucket.calls,
        });

        totalCost += bucket.cost;
        totalTokens += bucket.tokens;

        // 聚合用户数据
        for (const [userId, data] of bucket.byUser.entries()) {
          if (options?.userId && userId !== options.userId) continue;

          if (!userCosts.has(userId)) {
            userCosts.set(userId, {
              cost: 0,
              tokens: 0,
              calls: 0,
              modules: new Map(),
              models: new Map(),
            });
          }
          const userCost = userCosts.get(userId)!;
          userCost.cost += data.cost;
          userCost.tokens += data.tokens;
          userCost.calls += data.calls;
        }

        // 聚合模块数据
        for (const [moduleType, data] of bucket.byModule.entries()) {
          if (!moduleCosts.has(moduleType)) {
            moduleCosts.set(moduleType, { cost: 0, tokens: 0, calls: 0 });
          }
          const moduleCost = moduleCosts.get(moduleType)!;
          moduleCost.cost += data.cost;
          moduleCost.tokens += data.tokens;
          moduleCost.calls += data.calls;
        }

        // 聚合模型数据
        for (const [modelKey, data] of bucket.byModel.entries()) {
          if (!modelCosts.has(modelKey)) {
            modelCosts.set(modelKey, {
              cost: 0,
              tokens: 0,
              calls: 0,
              provider: data.provider,
            });
          }
          const modelCost = modelCosts.get(modelKey)!;
          modelCost.cost += data.cost;
          modelCost.tokens += data.tokens;
          modelCost.calls += data.calls;
        }
      }
    }

    // 构建用户报告（需要从用户聚合数据获取 topModule 和 topModel）
    const byUser: CostByUser[] = [];
    for (const [userId, costs] of userCosts.entries()) {
      const userAgg = this.userAggregations.get(userId);
      let topModule = "";
      let topModel = "";

      if (userAgg) {
        topModule = this.getTopEntry(userAgg.byModule);
        topModel = this.getTopEntry(userAgg.byModel);
      }

      byUser.push({
        userId,
        totalCost: costs.cost,
        totalTokens: costs.tokens,
        callCount: costs.calls,
        topModule,
        topModel,
      });
    }

    // 构建模块报告
    const byModule: CostByModule[] = Array.from(moduleCosts.entries()).map(
      ([moduleType, data]) => ({
        moduleType,
        totalCost: data.cost,
        totalTokens: data.tokens,
        callCount: data.calls,
        avgCostPerCall: data.calls > 0 ? data.cost / data.calls : 0,
      }),
    );

    // 构建模型报告
    const byModel: CostByModel[] = Array.from(modelCosts.entries()).map(
      ([modelKey, data]) => {
        const [provider, model] = modelKey.split(":");
        return {
          model,
          provider,
          totalCost: data.cost,
          totalTokens: data.tokens,
          callCount: data.calls,
          avgTokensPerCall: data.calls > 0 ? data.tokens / data.calls : 0,
        };
      },
    );

    // 排序小时趋势
    hourlyTrend.sort((a, b) => a.hour.localeCompare(b.hour));

    return {
      period: { start: startTime, end: now },
      totalCost,
      totalTokens,
      byUser: byUser.sort((a, b) => b.totalCost - a.totalCost),
      byModule: byModule.sort((a, b) => b.totalCost - a.totalCost),
      byModel: byModel.sort((a, b) => b.totalCost - a.totalCost),
      hourlyTrend,
    };
  }

  /**
   * 获取用户成本
   */
  getUserCost(userId: string, periodHours?: number): CostByUser {
    const report = this.getCostReport({ periodHours, userId });
    const userCost = report.byUser.find((u) => u.userId === userId);

    if (userCost) {
      return userCost;
    }

    // 如果在指定周期内没有数据，返回空统计
    return {
      userId,
      totalCost: 0,
      totalTokens: 0,
      callCount: 0,
      topModule: "",
      topModel: "",
    };
  }

  /**
   * 设置预算告警
   */
  setBudgetAlert(
    userId: string,
    threshold: number,
    period: "daily" | "monthly",
  ): void {
    this.budgetConfigs.set(userId, {
      threshold,
      period,
    });
    this.logger.log(
      `设置预算告警: userId=${userId}, threshold=${threshold} USD, period=${period}`,
    );
  }

  /**
   * 检查预算告警
   */
  checkBudgetAlerts(): BudgetAlert[] {
    const alerts: BudgetAlert[] = [];
    const now = new Date();

    for (const [userId, config] of this.budgetConfigs.entries()) {
      const periodHours = config.period === "daily" ? 24 : 24 * 30;
      const userCost = this.getUserCost(userId, periodHours);
      const currentSpend = userCost.totalCost;

      const triggered = currentSpend >= config.threshold;

      // 检查是否需要触发告警（避免重复触发）
      let shouldTrigger = false;
      if (triggered) {
        if (!config.lastTriggered) {
          shouldTrigger = true;
        } else {
          // 检查距离上次触发是否超过一个周期
          const hoursSinceLastTrigger =
            (now.getTime() - config.lastTriggered.getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastTrigger >= periodHours) {
            shouldTrigger = true;
          }
        }
      }

      if (shouldTrigger) {
        config.lastTriggered = now;
        this.logger.warn(
          `预算告警触发: userId=${userId}, threshold=${config.threshold}, currentSpend=${currentSpend}`,
        );
      }

      alerts.push({
        userId,
        threshold: config.threshold,
        currentSpend,
        period: config.period,
        triggered,
        triggeredAt: triggered ? config.lastTriggered : undefined,
      });
    }

    return alerts;
  }

  /**
   * 获取小时趋势
   */
  getHourlyTrend(hours?: number): HourlyBucket[] {
    const periodHours = hours || 24;
    const report = this.getCostReport({ periodHours });
    return report.hourlyTrend;
  }

  /**
   * 将待持久化成本事件批量写入数据库
   */
  async flushCostsToDB(): Promise<number> {
    if (!this.prisma || this.pendingCostEvents.length === 0) {
      return 0;
    }

    const batch = this.pendingCostEvents.splice(0, this.FLUSH_BATCH_SIZE);
    const flushed = batch.length;

    try {
      await this.prisma.aIEngineMetric.createMany({
        data: batch.map((event) => ({
          metricType: "cost_event",
          operationId: event.moduleType,
          modelId: event.model,
          providerId: event.provider,
          userId: event.userId,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          totalTokens: event.inputTokens + event.outputTokens,
          estimatedCost: new Decimal(event.estimatedCost.toFixed(6)),
          success: true,
          metadata: { moduleType: event.moduleType },
          createdAt: event.timestamp || new Date(),
        })),
        skipDuplicates: true,
      });

      this.logger.log(`Flushed ${flushed} cost events to DB`);

      if (this.pendingCostEvents.length > 0) {
        return flushed + (await this.flushCostsToDB());
      }

      return flushed;
    } catch (error) {
      this.pendingCostEvents.unshift(...batch);
      this.logger.error(
        `Failed to flush ${flushed} cost events: ${error instanceof Error ? error.message : error}`,
      );
      return 0;
    }
  }

  /**
   * 获取待持久化事件数量
   */
  getPendingFlushCount(): number {
    return this.pendingCostEvents.length;
  }

  /**
   * 重置所有数据
   */
  reset(): void {
    this.hourlyBuckets.clear();
    this.userAggregations.clear();
    this.budgetConfigs.clear();
    this.pendingCostEvents.length = 0;
    this.logger.log("成本归因数据已重置");
  }

  /**
   * 获取小时桶的键
   */
  private getHourKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hour = String(date.getUTCHours()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}`;
  }

  /**
   * 解析小时桶键为日期
   */
  private parseHourKey(hourKey: string): Date {
    return new Date(`${hourKey}:00:00Z`);
  }

  /**
   * 创建空的小时桶
   */
  private createEmptyBucket(): HourlyBucketData {
    return {
      cost: 0,
      tokens: 0,
      calls: 0,
      byUser: new Map(),
      byModule: new Map(),
      byModel: new Map(),
    };
  }

  /**
   * 更新桶维度数据
   */
  private updateBucketDimension(
    dimensionMap: Map<
      string,
      { cost: number; tokens: number; calls: number; provider?: string }
    >,
    key: string,
    cost: number,
    tokens: number,
    provider?: string,
  ): void {
    let data = dimensionMap.get(key);
    if (!data) {
      data = { cost: 0, tokens: 0, calls: 0 };
      if (provider) {
        data.provider = provider;
      }
      dimensionMap.set(key, data);
    }
    data.cost += cost;
    data.tokens += tokens;
    data.calls += 1;
  }

  /**
   * 更新用户聚合数据
   */
  private updateUserAggregation(event: CostEvent): void {
    let userAgg = this.userAggregations.get(event.userId);
    if (!userAgg) {
      userAgg = {
        totalCost: 0,
        totalTokens: 0,
        callCount: 0,
        byModule: new Map(),
        byModel: new Map(),
        lastAccess: Date.now(),
      };
      this.userAggregations.set(event.userId, userAgg);
    }

    const totalTokens = event.inputTokens + event.outputTokens;

    userAgg.totalCost += event.estimatedCost;
    userAgg.totalTokens += totalTokens;
    userAgg.callCount += 1;
    userAgg.lastAccess = Date.now();

    // 更新模块统计
    this.updateBucketDimension(
      userAgg.byModule,
      event.moduleType,
      event.estimatedCost,
      totalTokens,
    );

    // 更新模型统计
    const modelKey = `${event.provider}:${event.model}`;
    this.updateBucketDimension(
      userAgg.byModel,
      modelKey,
      event.estimatedCost,
      totalTokens,
    );
  }

  /**
   * 清理过期的小时桶
   */
  private cleanupExpiredBuckets(): void {
    const now = new Date();
    const retentionMs = this.BUCKET_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    for (const [hourKey, _] of this.hourlyBuckets.entries()) {
      const bucketTime = this.parseHourKey(hourKey);
      if (now.getTime() - bucketTime.getTime() > retentionMs) {
        this.hourlyBuckets.delete(hourKey);
      }
    }
  }

  /**
   * LRU 淘汰用户数据
   */
  private evictLRU(): void {
    if (this.userAggregations.size <= this.MAX_USERS) {
      return;
    }

    // 按最后访问时间排序，淘汰最旧的
    const entries = Array.from(this.userAggregations.entries());
    entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    const toRemove = entries.slice(0, entries.length - this.MAX_USERS);
    for (const [userId, _] of toRemove) {
      this.userAggregations.delete(userId);
    }

    if (toRemove.length > 0) {
      this.logger.debug(`LRU 淘汰了 ${toRemove.length} 个用户的聚合数据`);
    }
  }

  /**
   * 获取 Map 中成本最高的条目
   */
  private getTopEntry(
    map: Map<string, { cost: number; tokens: number; calls: number }>,
  ): string {
    let topKey = "";
    let maxCost = 0;

    for (const [key, data] of map.entries()) {
      if (data.cost > maxCost) {
        maxCost = data.cost;
        topKey = key;
      }
    }

    return topKey;
  }
}
