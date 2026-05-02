/**
 * StorageOffloadService — 新数据 off-load 调度器
 *
 * 每天凌晨 02:00 UTC 扫以下 off-load 候选表，把新增的大字段搬到对象存储：
 * - topic_reports.full_report → `topic-reports/{id}/v{version}.md`
 * - dimension_analyses.data_points → `dimension-analyses/{id}/data_points.json`
 * - research_tasks.result → `research-tasks/{id}/result.json`
 *
 * 处理逻辑（每个表独立）：
 * 1. 扫 {uri} IS NULL AND {content} IS NOT NULL AND len > 2KB 的行
 * 2. 批量上传到对象存储（R2StorageService.uploadText）
 * 3. 写 URI 到 DB
 * 4. 清空 DB 里的 content 字段（文本 → ""，JSON → NULL）
 *
 * 运行时自动触发；不需要手动跑 scripts/backfill-*。
 * 失败降级：单行错误不阻塞其他行；next run 自动重试。
 *
 * 设计要点：
 * - 并发锁：run 单例，避免 24h 间隔内二次触发（启动 5min 后先跑一次做冷启动 bootstrap）
 * - 幂等：WHERE uri IS NULL 过滤已迁行
 * - 不做 VACUUM FULL（exclusive lock 影响业务），交给 postgres autovacuum
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { R2StorageService } from "../runtime/r2-storage.service";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000; // 启动 5 分钟后首次触发
const BATCH_SIZE = 50;
const CONCURRENCY = 4;
const OFFLOAD_THRESHOLD = 2048; // <2KB 不迁

// pg_advisory_lock 键：任意 64bit 整数；取自 crc32("storage_offload") 便于唯一识别
const ADVISORY_LOCK_KEY = 834_612_099;

interface OffloadTarget {
  name: string;
  // 查询符合条件的行（uri IS NULL, 内容非空/非 null）
  list: (
    prisma: PrismaService,
    take: number,
  ) => Promise<Array<{ id: string; content: string; version?: number }>>;
  // 上传成功后写 uri + size 并清空 content
  commit: (
    prisma: PrismaService,
    id: string,
    uri: string,
    size: number,
  ) => Promise<void>;
  // 太小跳过时只记录 size
  recordSmall: (
    prisma: PrismaService,
    id: string,
    size: number,
  ) => Promise<void>;
  keyFor: (id: string, version?: number) => string;
  contentType: string;
}

@Injectable()
export class StorageOffloadService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageOffloadService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
  ) {}

  onModuleInit() {
    if (!this.storage.isEnabled()) {
      this.logger.warn(
        "[StorageOffload] object storage not configured, scheduler disabled",
      );
      return;
    }
    this.logger.log(
      `[StorageOffload] scheduled: first run in ${FIRST_RUN_DELAY_MS / 60_000}min, then every 24h`,
    );
    setTimeout(() => {
      void this.runOnce();
      this.timer = setInterval(() => void this.runOnce(), INTERVAL_MS);
    }, FIRST_RUN_DELAY_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private buildTargets(): OffloadTarget[] {
    return [
      {
        name: "topic_reports.full_report",
        list: async (p, take) => {
          const rows = await p.topicReport.findMany({
            where: { fullReportUri: null, fullReport: { not: "" } },
            select: { id: true, version: true, fullReport: true },
            take,
          });
          return rows.map((r) => ({
            id: r.id,
            version: r.version,
            content: r.fullReport ?? "",
          }));
        },
        commit: async (p, id, uri, size) => {
          await p.topicReport.update({
            where: { id },
            data: {
              fullReport: "",
              fullReportUri: uri,
              fullReportSize: size,
            },
          });
        },
        recordSmall: async (p, id, size) => {
          await p.topicReport.update({
            where: { id },
            data: { fullReportSize: size },
          });
        },
        keyFor: (id, version) => `topic-reports/${id}/v${version ?? 1}.md`,
        contentType: "text/markdown; charset=utf-8",
      },
      {
        name: "dimension_analyses.data_points",
        list: async (p, take) => {
          // DbNull 表示 SQL NULL；Prisma 下过滤 JSON 字段"不为 NULL"要用 Prisma.DbNull 取反
          const rows = await p.dimensionAnalysis.findMany({
            where: {
              dataPointsUri: null,
              NOT: { dataPoints: { equals: Prisma.DbNull } },
            },
            select: { id: true, dataPoints: true },
            take,
          });
          return rows
            .filter((r) => r.dataPoints !== null)
            .map((r) => ({
              id: r.id,
              content: JSON.stringify(r.dataPoints),
            }));
        },
        commit: async (p, id, uri, size) => {
          // 一条 raw SQL 同时写 URI + 清 data_points（原子更新）
          await p.$executeRawUnsafe(
            `UPDATE dimension_analyses SET data_points=NULL, data_points_uri=$1, data_points_size=$2 WHERE id=$3`,
            uri,
            size,
            id,
          );
        },
        recordSmall: async (p, id, size) => {
          await p.dimensionAnalysis.update({
            where: { id },
            data: { dataPointsSize: size },
          });
        },
        keyFor: (id) => `dimension-analyses/${id}/data_points.json`,
        contentType: "application/json; charset=utf-8",
      },
      {
        name: "research_tasks.result",
        list: async (p, take) => {
          const rows = await p.researchTask.findMany({
            where: {
              resultUri: null,
              NOT: { result: { equals: Prisma.DbNull } },
            },
            select: { id: true, result: true },
            take,
          });
          return rows
            .filter((r) => r.result !== null)
            .map((r) => ({
              id: r.id,
              content: JSON.stringify(r.result),
            }));
        },
        commit: async (p, id, uri, size) => {
          await p.$executeRawUnsafe(
            `UPDATE research_tasks SET result=NULL, result_uri=$1, result_size=$2 WHERE id=$3`,
            uri,
            size,
            id,
          );
        },
        recordSmall: async (p, id, size) => {
          await p.researchTask.update({
            where: { id },
            data: { resultSize: size },
          });
        },
        keyFor: (id) => `research-tasks/${id}/result.json`,
        contentType: "application/json; charset=utf-8",
      },
    ];
  }

  /** 外部可手动触发（健康检查 / 手动测试） */
  async runOnce(): Promise<void> {
    if (this.running) {
      this.logger.warn("[StorageOffload] previous run still in progress, skip");
      return;
    }

    // ★ 2026-04-22 加固：跨实例 advisory lock
    // Railway 若横向扩容多 Pod，每个 Pod 都会在 02:00 UTC 触发 cron；
    // try_advisory_lock 保证同时只有一个 Pod 跑 offload，其他 Pod 直接跳过。
    // 如果本机被 SIGTERM，PostgreSQL 会话断开自动释放锁。
    const lockRows = await this.prisma.$queryRawUnsafe<{ locked: boolean }[]>(
      `SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`,
    );
    const locked = lockRows[0]?.locked === true;
    if (!locked) {
      this.logger.log(
        "[StorageOffload] another instance holds advisory lock, skip",
      );
      return;
    }

    this.running = true;
    const start = Date.now();
    const summary: Record<
      string,
      { migrated: number; failed: number; mb: number }
    > = {};

    try {
      for (const target of this.buildTargets()) {
        summary[target.name] = await this.runTarget(target);
      }
      this.logger.log(
        `[StorageOffload] run complete in ${Math.round((Date.now() - start) / 1000)}s: ${JSON.stringify(summary)}`,
      );
    } catch (error) {
      this.logger.error(
        `[StorageOffload] run failed: ${(error as Error).message}`,
      );
    } finally {
      this.running = false;
      try {
        await this.prisma.$queryRawUnsafe(
          `SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`,
        );
      } catch (error) {
        this.logger.warn(
          `[StorageOffload] unlock failed (conn may be closed already): ${(error as Error).message}`,
        );
      }
    }
  }

  private async runTarget(
    target: OffloadTarget,
  ): Promise<{ migrated: number; failed: number; mb: number }> {
    let migrated = 0;
    let failed = 0;
    let bytes = 0;

    while (true) {
      const rows = await target.list(this.prisma, BATCH_SIZE);
      if (rows.length === 0) break;

      await this.mapPool(rows, CONCURRENCY, async (r) => {
        const size = Buffer.byteLength(r.content, "utf-8");
        if (size === 0) return;
        if (size < OFFLOAD_THRESHOLD) {
          try {
            await target.recordSmall(this.prisma, r.id, size);
          } catch {
            /* ignore */
          }
          return;
        }
        const key = target.keyFor(r.id, r.version);
        const res = await this.storage.uploadText(
          r.content,
          key,
          target.contentType,
        );
        if (!res.success) {
          failed++;
          this.logger.warn(
            `[StorageOffload] upload fail ${target.name} ${r.id}: ${res.error}`,
          );
          return;
        }
        try {
          await target.commit(this.prisma, r.id, key, size);
          migrated++;
          bytes += size;
        } catch (error) {
          failed++;
          this.logger.warn(
            `[StorageOffload] DB commit fail ${target.name} ${r.id}: ${(error as Error).message}`,
          );
        }
      });
    }

    return {
      migrated,
      failed,
      mb: Math.round(bytes / 1024 / 1024),
    };
  }

  private async mapPool<T>(
    items: T[],
    n: number,
    fn: (item: T) => Promise<void>,
  ): Promise<void> {
    let idx = 0;
    await Promise.all(
      Array.from({ length: Math.min(n, items.length) }, async () => {
        while (idx < items.length) {
          const my = idx++;
          try {
            await fn(items[my]);
          } catch {
            /* isolated — don't bubble up */
          }
        }
      }),
    );
  }
}
