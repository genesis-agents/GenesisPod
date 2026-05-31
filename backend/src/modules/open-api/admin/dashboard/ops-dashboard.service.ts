import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  OpsOverviewDto,
  OpsModuleStatDto,
  OpsTopicStatDto,
  OpsModuleCost,
} from "./dto/ops-dashboard.dto";

/**
 * Ops Dashboard Service
 *
 * 运营看板聚合：用户活跃（PWAU / 今日活跃 / 今日新增）、模块漏斗、热门话题、成本。
 *
 * 数据源：
 *  - user_events(user_id, module, action, resource_id, topic_key, success, created_at)
 *  - ai_engine_metrics(user_id, operation_id, input_tokens, output_tokens, estimated_cost, created_at)
 *  - users(id, created_at)
 *
 * 约束：
 *  - 成本聚合只用 ai_engine_metrics（唯一真源），禁止 UNION user_events。
 *  - 所有 SQL 走 $queryRaw 参数化（Prisma.sql / 模板插值），不做字符串拼接。
 *  - 完成类行为定义：action ∈ (completed, saved, published) 且 success != false。
 *
 * 注：user_events 表当前在本仓库未发现对应 Prisma model / 迁移，故所有依赖 user_events
 * 的查询都包在 safeRows 里——表不存在时降级为零值/空数组，而不是让端点 500。
 */
@Injectable()
export class OpsDashboardService {
  private readonly logger = new Logger(OpsDashboardService.name);

  /** 计入 PWAU / 完成类的 action 值 */
  private static readonly COMPLETION_ACTIONS = [
    "completed",
    "saved",
    "published",
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /overview
   */
  async getOverview(days: number): Promise<OpsOverviewDto> {
    const windowDays = this.normalizeDays(days);

    const [pwau, todayActive, todayNew, totalEvents, byModule] =
      await Promise.all([
        this.getPwau(),
        this.getTodayActive(),
        this.getTodayNew(),
        this.getTotalEvents(windowDays),
        this.getCostByModule(windowDays),
      ]);

    const totalUsd = byModule.reduce((sum, m) => sum + m.costUsd, 0);

    return {
      pwau,
      todayActive,
      todayNew,
      totalEvents,
      cost: {
        totalUsd: this.round(totalUsd, 6),
        byModule,
      },
    };
  }

  /**
   * GET /modules — 按 module 分组的漏斗统计（时间窗内）
   */
  async getModules(days: number): Promise<OpsModuleStatDto[]> {
    const windowDays = this.normalizeDays(days);

    const rows = await this.safeRows<{
      module: string | null;
      active_users: bigint | number;
      started: bigint | number;
      completed: bigint | number;
      failed: bigint | number;
    }>(
      () => this.prisma.$queryRaw`
        SELECT
          module AS module,
          COUNT(DISTINCT user_id) AS active_users,
          COUNT(*) FILTER (WHERE action = 'started') AS started,
          COUNT(*) FILTER (WHERE action = 'completed') AS completed,
          COUNT(*) FILTER (WHERE action = 'failed' OR success = false) AS failed
        FROM user_events
        WHERE created_at >= NOW() - (${windowDays} || ' days')::interval
          AND module IS NOT NULL
        GROUP BY module
        ORDER BY active_users DESC
      `,
      "getModules",
    );

    return rows.map((r) => {
      const started = this.toNumber(r.started);
      const completed = this.toNumber(r.completed);
      return {
        module: r.module ?? "unknown",
        activeUsers: this.toNumber(r.active_users),
        started,
        completed,
        failed: this.toNumber(r.failed),
        completionRate: started > 0 ? this.round(completed / started, 4) : 0,
      };
    });
  }

  /**
   * GET /topics — 非空 topic_key 的频次 top 20（时间窗内）
   */
  async getTopics(days: number): Promise<OpsTopicStatDto[]> {
    const windowDays = this.normalizeDays(days);

    const rows = await this.safeRows<{
      topic_key: string;
      count: bigint | number;
    }>(
      () => this.prisma.$queryRaw`
        SELECT topic_key AS topic_key, COUNT(*) AS count
        FROM user_events
        WHERE created_at >= NOW() - (${windowDays} || ' days')::interval
          AND topic_key IS NOT NULL
          AND topic_key <> ''
        GROUP BY topic_key
        ORDER BY count DESC
        LIMIT 20
      `,
      "getTopics",
    );

    return rows.map((r) => ({
      topicKey: r.topic_key,
      count: this.toNumber(r.count),
    }));
  }

  // ==================== 私有聚合 ====================

  /** 近 7 天完成类行为（success != false）的去重用户数 */
  private async getPwau(): Promise<number> {
    const rows = await this.safeRows<{ count: bigint | number }>(
      () => this.prisma.$queryRaw`
        SELECT COUNT(DISTINCT user_id) AS count
        FROM user_events
        WHERE created_at >= NOW() - INTERVAL '7 days'
          AND action = ANY(${OpsDashboardService.COMPLETION_ACTIONS})
          AND success IS DISTINCT FROM false
          AND user_id IS NOT NULL
      `,
      "getPwau",
    );
    return this.toNumber(rows[0]?.count ?? 0);
  }

  /** 今天有 user_event 的去重用户数 */
  private async getTodayActive(): Promise<number> {
    const rows = await this.safeRows<{ count: bigint | number }>(
      () => this.prisma.$queryRaw`
        SELECT COUNT(DISTINCT user_id) AS count
        FROM user_events
        WHERE created_at >= date_trunc('day', NOW())
          AND user_id IS NOT NULL
      `,
      "getTodayActive",
    );
    return this.toNumber(rows[0]?.count ?? 0);
  }

  /** 今天注册的用户数（users 表确定存在，直接用 Prisma count） */
  private async getTodayNew(): Promise<number> {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      return await this.prisma.user.count({
        where: { createdAt: { gte: startOfDay } },
      });
    } catch (error) {
      this.logger.warn(`getTodayNew failed: ${(error as Error).message}`);
      return 0;
    }
  }

  /** 时间窗内 user_event 总数 */
  private async getTotalEvents(windowDays: number): Promise<number> {
    const rows = await this.safeRows<{ count: bigint | number }>(
      () => this.prisma.$queryRaw`
        SELECT COUNT(*) AS count
        FROM user_events
        WHERE created_at >= NOW() - (${windowDays} || ' days')::interval
      `,
      "getTotalEvents",
    );
    return this.toNumber(rows[0]?.count ?? 0);
  }

  /**
   * 时间窗内成本按 operation_id 聚合（唯一真源 ai_engine_metrics）。
   * 这里以 operation_id 作为"module"维度——ai_engine_metrics 无 module 列，
   * operation_id 是最接近模块/操作语义的字段。
   */
  private async getCostByModule(windowDays: number): Promise<OpsModuleCost[]> {
    const rows = await this.safeRows<{
      module: string | null;
      cost_usd: Prisma.Decimal | number | null;
      tokens: bigint | number | null;
    }>(
      () => this.prisma.$queryRaw`
        SELECT
          COALESCE(operation_id, 'unknown') AS module,
          COALESCE(SUM(estimated_cost), 0) AS cost_usd,
          COALESCE(SUM(COALESCE(total_tokens, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0))), 0) AS tokens
        FROM ai_engine_metrics
        WHERE created_at >= NOW() - (${windowDays} || ' days')::interval
        GROUP BY operation_id
        ORDER BY cost_usd DESC
      `,
      "getCostByModule",
    );

    return rows.map((r) => ({
      module: r.module ?? "unknown",
      costUsd: this.round(this.toNumber(r.cost_usd ?? 0), 6),
      tokens: this.toNumber(r.tokens ?? 0),
    }));
  }

  // ==================== 工具方法 ====================

  /** days 归一化：取整、下限 1、上限 365 */
  private normalizeDays(days: number): number {
    if (!Number.isFinite(days)) return 30;
    return Math.min(365, Math.max(1, Math.trunc(days)));
  }

  /** bigint / Decimal / number 统一转 number */
  private toNumber(value: bigint | number | Prisma.Decimal): number {
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    return Number(value.toString());
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  /**
   * 执行只读聚合查询；查询失败（含目标表不存在）时记录 warn 并返回空数组，
   * 让端点降级而非 500。
   */
  private async safeRows<T>(
    query: () => Promise<T[]>,
    label: string,
  ): Promise<T[]> {
    try {
      return await query();
    } catch (error) {
      this.logger.warn(
        `Ops dashboard query "${label}" failed: ${(error as Error).message}`,
      );
      return [];
    }
  }
}
