import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../../common/prisma/prisma.service";

/**
 * DataRetentionScheduler —— 高增长表的统一老化清理（2026-06-12）。
 *
 * 背景：admin 数据管理实测 harness_agent_events 339MB / agent_playground_mission_events
 * 183MB / harness_checkpoints 147MB / ai_engine_metrics 69MB 持续膨胀——这些表此前
 * **没有任何老化机制**（仅 radar 简报与 BYOK 有自己的 cron 清理）。
 *
 * 策略（保守、可配置）：
 *   - 事件/指标/审计类按 age 删除（replay/观测价值随时间归零）
 *   - checkpoint 仅删终态 agent 的过期断点（running 的永不动 —— resume 依赖）
 *   - 每表保留天数可用环境变量覆盖（RETENTION_*_DAYS）
 *   - ENABLE_DATA_RETENTION !== "true" 时整体禁用（与 radar scheduler 同款开关模式）
 *   - DATA_RETENTION_DRY_RUN=true 时只统计不删除（上线前先观察一轮）
 *
 * 凌晨 03:10 UTC 执行，避开 radar 简报清理（02:00）与 BYOK 维护（00:20/00:30）。
 *
 * 可观测 / 可预演（2026-06-20）：
 *   - getStatus()：开关、调度、各表保留天数、最近一次执行结果 —— 供 admin「数据管理」页展示，
 *     把"这些大表无声膨胀"从隐性故障变成可见状态。
 *   - runSweep({ dryRun })：手动触发（含 dry-run 预演），返回结构化命中/删除数 ——
 *     供运维在开启 ENABLE_DATA_RETENTION 前先量化"会删多少行"。
 */

/** 单表老化策略：保留天数可被环境变量覆盖，execute 内联各表 where 子句。 */
interface RetentionPolicy {
  /** 物理表名（仅用于展示/日志，删除走 Prisma model） */
  table: string;
  /** 保留天数的环境变量名（覆盖 defaultDays） */
  envKey: string;
  /** 默认保留天数 */
  defaultDays: number;
  /** 人类可读的策略说明（admin 页展示） */
  note: string;
  /** dryRun=true 时 count，false 时 deleteMany，统一返回受影响行数 */
  execute: (cutoff: Date, dryRun: boolean) => Promise<number>;
}

export interface RetentionResult {
  table: string;
  retentionDays: number;
  /** dry-run 时为命中（待删）行数，真实模式为已删除行数 */
  affected: number;
  dryRun: boolean;
  error?: string;
}

export interface RetentionLastRun {
  at: string;
  dryRun: boolean;
  results: RetentionResult[];
}

export interface RetentionStatus {
  /** ENABLE_DATA_RETENTION === "true"：cron 是否启用（关闭时大表永不老化） */
  enabled: boolean;
  /** DATA_RETENTION_DRY_RUN === "true"：定时跑时是否只统计不删 */
  dryRunDefault: boolean;
  /** cron 表达式（UTC） */
  schedule: string;
  policies: Array<{
    table: string;
    retentionDays: number;
    envKey: string;
    note: string;
  }>;
  /** 最近一次（定时或手动）执行结果；从未跑过为 null */
  lastRun: RetentionLastRun | null;
}

@Injectable()
export class DataRetentionScheduler {
  private readonly logger = new Logger(DataRetentionScheduler.name);
  private lastRun: RetentionLastRun | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private days(envKey: string, fallback: number): number {
    const raw = this.config.get<string>(envKey);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private cutoff(daysAgo: number): Date {
    return new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
  }

  /** 老化策略表 —— 顺序即执行顺序；新增高增长表在此登记一行即可。 */
  private policies(): RetentionPolicy[] {
    return [
      {
        table: "harness_agent_events",
        envKey: "RETENTION_HARNESS_EVENTS_DAYS",
        defaultDays: 30,
        note: "agent 事件流（resume/replay 用），按 emittedAt 删除",
        execute: (cutoff, dryRun) => {
          const where = { emittedAt: { lt: cutoff } };
          return dryRun
            ? this.prisma.harnessAgentEvent.count({ where })
            : this.prisma.harnessAgentEvent
                .deleteMany({ where })
                .then((r) => r.count);
        },
      },
      {
        table: "harness_checkpoints",
        envKey: "RETENTION_CHECKPOINT_DAYS",
        defaultDays: 14,
        note: "仅删终态 agent 的过期断点（running 永不动 —— resume 依赖）",
        execute: (cutoff, dryRun) => {
          const where = {
            takenAt: { lt: cutoff },
            agentState: { in: ["completed", "failed", "cancelled"] },
          };
          return dryRun
            ? this.prisma.harnessCheckpoint.count({ where })
            : this.prisma.harnessCheckpoint
                .deleteMany({ where })
                .then((r) => r.count);
        },
      },
      {
        table: "agent_playground_mission_events",
        envKey: "RETENTION_MISSION_EVENTS_DAYS",
        defaultDays: 30,
        note: "mission 事件 journal，按 createdAt 删除",
        execute: (cutoff, dryRun) => {
          const where = { createdAt: { lt: cutoff } };
          return dryRun
            ? this.prisma.agentPlaygroundMissionEvent.count({ where })
            : this.prisma.agentPlaygroundMissionEvent
                .deleteMany({ where })
                .then((r) => r.count);
        },
      },
      {
        table: "ai_engine_metrics",
        envKey: "RETENTION_METRICS_DAYS",
        defaultDays: 30,
        note: "观测指标（billing 走 credit 表不受影响），按 createdAt 删除",
        execute: (cutoff, dryRun) => {
          const where = { createdAt: { lt: cutoff } };
          return dryRun
            ? this.prisma.aIEngineMetric.count({ where })
            : this.prisma.aIEngineMetric
                .deleteMany({ where })
                .then((r) => r.count);
        },
      },
      {
        table: "research_agent_activities",
        envKey: "RETENTION_RESEARCH_ACTIVITY_DAYS",
        defaultDays: 30,
        note: "research agent 活动/思考流（纯观测叶子日志，无 resume 依赖），按 createdAt 删除",
        execute: (cutoff, dryRun) => {
          const where = { createdAt: { lt: cutoff } };
          return dryRun
            ? this.prisma.researchAgentActivity.count({ where })
            : this.prisma.researchAgentActivity
                .deleteMany({ where })
                .then((r) => r.count);
        },
      },
      {
        table: "secret_access_logs",
        envKey: "RETENTION_SECRET_LOGS_DAYS",
        defaultDays: 90,
        note: "安全审计日志（合规保留最长），按 timestamp 删除",
        execute: (cutoff, dryRun) => {
          const where = { timestamp: { lt: cutoff } };
          return dryRun
            ? this.prisma.secretAccessLog.count({ where })
            : this.prisma.secretAccessLog
                .deleteMany({ where })
                .then((r) => r.count);
        },
      },
    ];
  }

  @Cron("10 3 * * *", {
    name: "data-retention-sweep",
    timeZone: "UTC",
    disabled: process.env.ENABLE_DATA_RETENTION !== "true",
  })
  async sweep(): Promise<void> {
    await this.runSweep();
  }

  /**
   * 执行一轮老化（定时或手动共用）。
   * @param opts.dryRun 省略时取 DATA_RETENTION_DRY_RUN 配置；手动预演传 true。
   * @returns 每表的命中/删除行数（单表失败不阻塞其余表，错误记在该行 error 上）
   */
  async runSweep(opts?: { dryRun?: boolean }): Promise<RetentionResult[]> {
    const dryRun =
      opts?.dryRun ??
      this.config.get<string>("DATA_RETENTION_DRY_RUN") === "true";
    this.logger.log(
      `[data-retention] sweep start (dryRun=${dryRun ? "yes" : "no"})`,
    );

    const results: RetentionResult[] = [];
    for (const policy of this.policies()) {
      const retentionDays = this.days(policy.envKey, policy.defaultDays);
      const cutoff = this.cutoff(retentionDays);
      try {
        const affected = await policy.execute(cutoff, dryRun);
        results.push({ table: policy.table, retentionDays, affected, dryRun });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[data-retention] ${policy.table} failed: ${message}`,
        );
        results.push({
          table: policy.table,
          retentionDays,
          affected: 0,
          dryRun,
          error: message,
        });
      }
    }

    this.lastRun = { at: new Date().toISOString(), dryRun, results };
    this.logger.log(
      `[data-retention] sweep done: ${
        results
          .map(
            (r) =>
              `${r.table}=${r.affected}${r.dryRun ? "(dry)" : ""}${
                r.error ? "(ERR)" : ""
              }`,
          )
          .join("; ") || "nothing to do"
      }`,
    );
    return results;
  }

  /** 当前老化配置 + 最近一次执行结果（供 admin「数据管理」页展示）。 */
  getStatus(): RetentionStatus {
    return {
      enabled: process.env.ENABLE_DATA_RETENTION === "true",
      dryRunDefault:
        this.config.get<string>("DATA_RETENTION_DRY_RUN") === "true",
      schedule: "10 3 * * * (UTC)",
      policies: this.policies().map((p) => ({
        table: p.table,
        retentionDays: this.days(p.envKey, p.defaultDays),
        envKey: p.envKey,
        note: p.note,
      })),
      lastRun: this.lastRun,
    };
  }
}
