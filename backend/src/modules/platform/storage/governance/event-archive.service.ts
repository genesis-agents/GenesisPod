/**
 * EventArchiveService —— 高行数事件/日志/metrics 大表的「无损卸载」（2026-06-20）。
 *
 * 与两个邻居的区别：
 *   - StorageOffloadService：搬「单列大 blob」到 R2（清列留行）——只对有大文本/JSON 列的业务表有用。
 *   - DataRetentionScheduler：按龄「删行」——有损，老数据彻底丢。
 *   - 本服务：按龄把整行「归档到 R2 再删」——DB 释放、数据一行不丢（冷备在 R2，可审计/回放）。
 *
 * 这才是 harness_agent_events / harness_checkpoints / *_mission_events / *_metrics / traces 这类
 * 「行多、每行小、无单一大 blob 列」的大表唯一能无损释放 DB 的方式（R2 无 SQL，搬过去不可查，
 * 只能当冷归档）。
 *
 * 处理逻辑（每表独立、分批）：
 *   1. 取 dateField < cutoff 的最老一批（ORDER BY dateField,id ASC LIMIT BATCH）
 *   2. 序列化为 NDJSON、gzip，上传 R2：`event-archive/{table}/{first}_{last}_{idsHash}.ndjson.gz`
 *   3. 上传成功后，才按 id 删除这批行（顺序保证：先落 R2 再删 DB，崩溃只会重传同一批=覆盖同 key）
 *   4. 循环直到该表无更老行或达单次上限
 *
 * 安全：
 *   - ENABLE_EVENT_ARCHIVE !== "true" 时不自动调度（与 retention 同款开关）
 *   - R2 未配置时不调度（无处可归档）
 *   - dry-run 只统计「会归档多少行」，不传不删
 *   - pg_try_advisory_lock 防多 Pod 并发
 *   - 单表失败不阻塞其余表；单批上传失败即停该表（不会删未成功归档的行）
 *
 * 每天 03:40 UTC 执行（避开 retention 03:10 / offload 02:00 / radar 02:00）。
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import * as zlib from "zlib";
import * as crypto from "crypto";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { ObjectStorageService } from "../object-store/object-storage.service";

const FIRST_RUN_DELAY_MS = 7 * 60 * 1000; // 启动 7min 后冷启动一次
const BATCH = 500; // 每批行数（一个 R2 对象）
const PER_TABLE_CAP = 500_000; // 单表单次上限，backlog 分多天排空

type ArchiveRow = { id: string } & Record<string, unknown>;

interface ArchiveTarget {
  table: string; // 物理表名（仅用于 R2 key + 展示）
  dateField: string; // Prisma 字段名（用于取批边界做 key）
  envDaysKey: string;
  defaultDays: number;
  note: string;
  countOlder: (cutoff: Date) => Promise<number>;
  selectBatch: (cutoff: Date, limit: number) => Promise<ArchiveRow[]>;
  deleteByIds: (ids: string[]) => Promise<number>;
}

export interface ArchiveResult {
  table: string;
  retentionDays: number;
  /** dry-run：会归档的行数；真实：已归档并删除的行数 */
  rows: number;
  /** 写到 R2 的压缩字节（dry-run 为 0） */
  bytesArchived: number;
  objects: number;
  dryRun: boolean;
  error?: string;
}

export interface ArchiveLastRun {
  at: string;
  dryRun: boolean;
  results: ArchiveResult[];
}

export interface ArchiveStatus {
  enabled: boolean;
  r2Configured: boolean;
  schedule: string;
  targets: Array<{
    table: string;
    retentionDays: number;
    envKey: string;
    note: string;
  }>;
  lastRun: ArchiveLastRun | null;
}

const TERMINAL_AGENT_STATES = ["completed", "failed", "cancelled"];

@Injectable()
export class EventArchiveService implements OnModuleInit {
  private readonly logger = new Logger(EventArchiveService.name);
  private running = false;
  private lastRun: ArchiveLastRun | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.storage.isEnabled()) {
      this.logger.warn(
        "[EventArchive] object storage not configured, scheduler disabled",
      );
      return;
    }
    if (process.env.ENABLE_EVENT_ARCHIVE !== "true") {
      this.logger.log(
        "[EventArchive] ENABLE_EVENT_ARCHIVE!=true, 自动调度关闭（仍可手动 dry-run 预演）",
      );
      return;
    }
    // 与 retention（按龄硬删）二选一：同时开启时 retention(03:10) 会先删掉本应归档的行
    if (process.env.ENABLE_DATA_RETENTION === "true") {
      this.logger.warn(
        "[EventArchive] 检测到 ENABLE_DATA_RETENTION 同时开启 —— 两机制对同批大表互斥，" +
          "retention(03:10 硬删) 会先于归档(03:40) 删掉本应无损归档的行。请只保留其一。",
      );
    }
    // 调度统一走 @Cron（每天 03:40 UTC，见 scheduledSweep）；启动后冷跑一次排空 backlog。
    this.logger.log(
      `[EventArchive] scheduled (daily @Cron 03:40 UTC); cold run in ${FIRST_RUN_DELAY_MS / 60_000}min`,
    );
    setTimeout(() => void this.runOnce(), FIRST_RUN_DELAY_MS);
  }

  /** 兜底定时：03:40 UTC（@Cron 与 setInterval 双保险，disabled 由 env 控制） */
  @Cron("40 3 * * *", {
    name: "event-archive-sweep",
    timeZone: "UTC",
    disabled: process.env.ENABLE_EVENT_ARCHIVE !== "true",
  })
  async scheduledSweep(): Promise<void> {
    await this.runOnce();
  }

  private days(envKey: string, fallback: number): number {
    const raw = this.config.get<string>(envKey);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private cutoff(daysAgo: number): Date {
    return new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
  }

  /** 归档目标表 —— 新增大表在此登记一行（用 Prisma 访问器，类型安全、无物理列名风险）。 */
  private targets(): ArchiveTarget[] {
    const p = this.prisma;
    return [
      {
        table: "harness_agent_events",
        dateField: "emittedAt",
        envDaysKey: "ARCHIVE_HARNESS_EVENTS_DAYS",
        defaultDays: 30,
        note: "agent 事件流（resume/replay 用）",
        countOlder: (c) =>
          p.harnessAgentEvent.count({ where: { emittedAt: { lt: c } } }),
        selectBatch: (c, n) =>
          p.harnessAgentEvent.findMany({
            where: { emittedAt: { lt: c } },
            orderBy: [{ emittedAt: "asc" }, { id: "asc" }],
            take: n,
          }) as Promise<ArchiveRow[]>,
        deleteByIds: (ids) =>
          p.harnessAgentEvent
            .deleteMany({ where: { id: { in: ids } } })
            .then((r) => r.count),
      },
      {
        table: "harness_checkpoints",
        dateField: "takenAt",
        envDaysKey: "ARCHIVE_CHECKPOINT_DAYS",
        defaultDays: 14,
        note: "仅归档终态 agent 的过期断点（running 永不动 —— resume 依赖）",
        countOlder: (c) =>
          p.harnessCheckpoint.count({
            where: {
              takenAt: { lt: c },
              agentState: { in: TERMINAL_AGENT_STATES },
            },
          }),
        selectBatch: (c, n) =>
          p.harnessCheckpoint.findMany({
            where: {
              takenAt: { lt: c },
              agentState: { in: TERMINAL_AGENT_STATES },
            },
            orderBy: [{ takenAt: "asc" }, { id: "asc" }],
            take: n,
          }) as Promise<ArchiveRow[]>,
        deleteByIds: (ids) =>
          p.harnessCheckpoint
            .deleteMany({ where: { id: { in: ids } } })
            .then((r) => r.count),
      },
      {
        table: "agent_playground_mission_events",
        dateField: "createdAt",
        envDaysKey: "ARCHIVE_MISSION_EVENTS_DAYS",
        defaultDays: 30,
        note: "mission 事件 journal",
        countOlder: (c) =>
          p.agentPlaygroundMissionEvent.count({
            where: { createdAt: { lt: c } },
          }),
        selectBatch: (c, n) =>
          p.agentPlaygroundMissionEvent.findMany({
            where: { createdAt: { lt: c } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: n,
          }) as Promise<ArchiveRow[]>,
        deleteByIds: (ids) =>
          p.agentPlaygroundMissionEvent
            .deleteMany({ where: { id: { in: ids } } })
            .then((r) => r.count),
      },
      {
        table: "ai_engine_metrics",
        dateField: "createdAt",
        envDaysKey: "ARCHIVE_METRICS_DAYS",
        defaultDays: 30,
        note: "观测指标",
        countOlder: (c) =>
          p.aIEngineMetric.count({ where: { createdAt: { lt: c } } }),
        selectBatch: (c, n) =>
          p.aIEngineMetric.findMany({
            where: { createdAt: { lt: c } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: n,
          }) as Promise<ArchiveRow[]>,
        deleteByIds: (ids) =>
          p.aIEngineMetric
            .deleteMany({ where: { id: { in: ids } } })
            .then((r) => r.count),
      },
      {
        table: "harness_run_metrics",
        dateField: "createdAt",
        envDaysKey: "ARCHIVE_RUN_METRICS_DAYS",
        defaultDays: 60,
        note: "harness run 指标（cost/quality，归档后可离线分析）",
        countOlder: (c) =>
          p.harnessRunMetric.count({ where: { createdAt: { lt: c } } }),
        selectBatch: (c, n) =>
          p.harnessRunMetric.findMany({
            where: { createdAt: { lt: c } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: n,
          }) as Promise<ArchiveRow[]>,
        deleteByIds: (ids) =>
          p.harnessRunMetric
            .deleteMany({ where: { id: { in: ids } } })
            .then((r) => r.count),
      },
      {
        table: "research_agent_activities",
        dateField: "createdAt",
        envDaysKey: "ARCHIVE_RESEARCH_ACTIVITY_DAYS",
        defaultDays: 30,
        note: "research agent 活动/思考流",
        countOlder: (c) =>
          p.researchAgentActivity.count({ where: { createdAt: { lt: c } } }),
        selectBatch: (c, n) =>
          p.researchAgentActivity.findMany({
            where: { createdAt: { lt: c } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: n,
          }) as Promise<ArchiveRow[]>,
        deleteByIds: (ids) =>
          p.researchAgentActivity
            .deleteMany({ where: { id: { in: ids } } })
            .then((r) => r.count),
      },
      {
        table: "agent_spans",
        dateField: "createdAt",
        envDaysKey: "ARCHIVE_AGENT_SPANS_DAYS",
        defaultDays: 30,
        note: "otel 式 span（trace 子表，量大）",
        countOlder: (c) =>
          p.agentSpan.count({ where: { createdAt: { lt: c } } }),
        selectBatch: (c, n) =>
          p.agentSpan.findMany({
            where: { createdAt: { lt: c } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: n,
          }) as Promise<ArchiveRow[]>,
        deleteByIds: (ids) =>
          p.agentSpan
            .deleteMany({ where: { id: { in: ids } } })
            .then((r) => r.count),
      },
      {
        table: "agent_traces",
        dateField: "createdAt",
        envDaysKey: "ARCHIVE_AGENT_TRACES_DAYS",
        defaultDays: 30,
        note: "otel 式 trace 根（span 走自身归档）",
        countOlder: (c) =>
          p.agentTrace.count({ where: { createdAt: { lt: c } } }),
        selectBatch: (c, n) =>
          p.agentTrace.findMany({
            where: { createdAt: { lt: c } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: n,
          }) as Promise<ArchiveRow[]>,
        deleteByIds: (ids) =>
          p.agentTrace
            .deleteMany({ where: { id: { in: ids } } })
            .then((r) => r.count),
      },
    ];
  }

  /**
   * 执行一轮归档。
   * @param opts.dryRun 省略取 EVENT_ARCHIVE_DRY_RUN 配置；预演传 true（只统计不传不删）。
   */
  async runOnce(opts?: { dryRun?: boolean }): Promise<ArchiveResult[]> {
    const dryRun =
      opts?.dryRun ??
      this.config.get<string>("EVENT_ARCHIVE_DRY_RUN") === "true";

    // dry-run 只读统计（不传不删、无副作用）→ 不受重入护栏限制，预演随时可跑，
    // 不会被正在跑的真实归档挡住而误返回上一轮结果。
    if (dryRun) return this.sweep(true);

    // 同步置位重入护栏（在任何 await 之前）—— 杜绝"检查与置位之间夹 await"的竞态窗口。
    if (this.running) {
      this.logger.warn("[EventArchive] 上一轮仍在跑，跳过本次");
      return this.lastRun?.results ?? [];
    }
    this.running = true;
    try {
      return await this.sweep(false);
    } finally {
      this.running = false;
    }
  }

  /**
   * 一轮归档主体（dry-run 与真实共用）。
   *
   * 不再用 pg advisory lock 做跨 Pod 互斥：① Prisma 连接池无 pinning，acquire/release
   * 跑在不同连接 → 锁释放几乎必失败、长挂泄漏锁，反成可用性隐患；② 归档本身幂等——
   * 先落 R2 再删、确定性 key（同批 rows → 同 key 覆盖、不产生重复对象）、WHERE 只选未归档行，
   * 故即便两 Pod 并发跑，最坏只是重叠批重传同一对象，无数据丢失、无重复。故只保留单进程
   * this.running 去重即可。
   */
  private async sweep(dryRun: boolean): Promise<ArchiveResult[]> {
    this.logger.log(
      `[EventArchive] sweep start (dryRun=${dryRun ? "yes" : "no"})`,
    );
    const results: ArchiveResult[] = [];
    for (const target of this.targets()) {
      results.push(await this.archiveTable(target, dryRun));
    }
    this.lastRun = { at: new Date().toISOString(), dryRun, results };
    this.logger.log(
      `[EventArchive] sweep done: ${
        results
          .map(
            (r) =>
              `${r.table}=${r.rows}row${r.dryRun ? "(dry)" : `/${Math.round(r.bytesArchived / 1024)}KB`}${r.error ? "(ERR)" : ""}`,
          )
          .join("; ") || "nothing"
      }`,
    );
    return results;
  }

  private async archiveTable(
    target: ArchiveTarget,
    dryRun: boolean,
  ): Promise<ArchiveResult> {
    const retentionDays = this.days(target.envDaysKey, target.defaultDays);
    const cutoff = this.cutoff(retentionDays);
    const base: ArchiveResult = {
      table: target.table,
      retentionDays,
      rows: 0,
      bytesArchived: 0,
      objects: 0,
      dryRun,
    };

    try {
      if (dryRun) {
        base.rows = await target.countOlder(cutoff);
        return base;
      }

      while (base.rows < PER_TABLE_CAP) {
        const rows = await target.selectBatch(cutoff, BATCH);
        if (rows.length === 0) break;

        const { key, gz } = this.buildObject(target, rows);
        const res = await this.storage.uploadBufferToKey(
          gz,
          key,
          "application/gzip",
          { table: target.table, rows: String(rows.length) },
        );
        if (!res.success) {
          // 上传失败 → 绝不删，停该表，下一轮重试
          throw new Error(`upload failed: ${res.error}`);
        }

        const deleted = await target.deleteByIds(rows.map((r) => r.id));
        base.rows += deleted;
        base.bytesArchived += gz.length;
        base.objects += 1;
      }
      return base;
    } catch (err) {
      base.error = err instanceof Error ? err.message : String(err);
      this.logger.error(`[EventArchive] ${target.table} failed: ${base.error}`);
      return base;
    }
  }

  /** 序列化一批行为 gzip NDJSON，并算出确定性 key（崩溃重传覆盖同 key，不产生重复对象）。 */
  private buildObject(
    target: ArchiveTarget,
    rows: ArchiveRow[],
  ): { key: string; gz: Buffer } {
    const replacer = (_k: string, v: unknown) =>
      typeof v === "bigint" ? v.toString() : v;
    const ndjson = rows.map((r) => JSON.stringify(r, replacer)).join("\n");
    const gz = zlib.gzipSync(Buffer.from(ndjson, "utf-8"));

    const stamp = (v: unknown): string => {
      const d = v instanceof Date ? v : new Date(v as string);
      return Number.isNaN(d.getTime())
        ? "na"
        : d.toISOString().slice(0, 10).replace(/-/g, "");
    };
    const first = stamp(rows[0][target.dateField]);
    const last = stamp(rows[rows.length - 1][target.dateField]);
    const idsHash = crypto
      .createHash("sha1")
      .update(rows.map((r) => r.id).join(","))
      .digest("hex")
      .slice(0, 8);
    const key = `event-archive/${target.table}/${first}_${last}_${idsHash}.ndjson.gz`;
    return { key, gz };
  }

  /** 当前归档配置 + 最近一次执行（供 admin「数据管理」页展示）。 */
  getStatus(): ArchiveStatus {
    return {
      enabled: process.env.ENABLE_EVENT_ARCHIVE === "true",
      r2Configured: this.storage.isEnabled(),
      schedule: "40 3 * * * (UTC)",
      targets: this.targets().map((t) => ({
        table: t.table,
        retentionDays: this.days(t.envDaysKey, t.defaultDays),
        envKey: t.envDaysKey,
        note: t.note,
      })),
      lastRun: this.lastRun,
    };
  }
}
