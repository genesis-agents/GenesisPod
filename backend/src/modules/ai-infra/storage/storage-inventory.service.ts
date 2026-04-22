/**
 * StorageInventoryService — 数据存储位置清单
 *
 * 给 admin/数据管理界面提供"哪些数据存在 DB、哪些在 R2"的快照。
 *
 * 三类信息：
 * 1. DB 表级别：每张表的行数、heap+index+toast 尺寸
 * 2. 已 off-load 字段映射：哪个表的哪个字段 → R2 哪个 prefix（含 URI 统计）
 * 3. R2 bucket 清单：按 prefix 分组的对象数/总字节
 */

import { Injectable, Logger } from "@nestjs/common";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { R2StorageService } from "./r2-storage.service";

export interface TableStat {
  table: string;
  rows: number;
  totalBytes: number;
  totalHuman: string;
  heapBytes: number;
  indexBytes: number;
  toastBytes: number;
}

export interface OffloadFieldStat {
  table: string;
  field: string; // 原字段名
  uriField: string; // _uri 字段名
  r2Prefix: string; // R2 里的 key 前缀
  totalRows: number; // 表总行数
  rowsWithUri: number; // 已 off-load 行数（URI 非空）
  rowsWithDbContent: number; // DB 字段仍有内容的行数
}

export interface R2PrefixStat {
  prefix: string;
  objects: number;
  bytes: number;
  bytesHuman: string;
}

export interface StorageInventory {
  database: {
    totalBytes: number;
    totalHuman: string;
    tables: TableStat[];
  };
  offloadFields: OffloadFieldStat[];
  r2: {
    configured: boolean;
    bucket: string | null;
    totalObjects: number;
    totalBytes: number;
    totalHuman: string;
    byPrefix: R2PrefixStat[];
  };
  generatedAt: string;
}

/**
 * Off-load 字段定义 — 跟 StorageOffloadService 里保持一致
 */
const OFFLOAD_FIELDS = [
  {
    table: "topic_reports",
    field: "full_report",
    uriField: "full_report_uri",
    r2Prefix: "topic-reports/",
  },
  {
    table: "dimension_analyses",
    field: "data_points",
    uriField: "data_points_uri",
    r2Prefix: "dimension-analyses/",
  },
  {
    table: "research_tasks",
    field: "result",
    uriField: "result_uri",
    r2Prefix: "research-tasks/",
  },
] as const;

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} kB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

@Injectable()
export class StorageInventoryService {
  private readonly logger = new Logger(StorageInventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
  ) {}

  async getInventory(): Promise<StorageInventory> {
    const [dbStats, offloadStats, r2Stats] = await Promise.all([
      this.queryDatabase(),
      this.queryOffloadFields(),
      this.queryR2().catch((error) => {
        this.logger.warn(
          `[inventory] R2 query failed: ${(error as Error).message}`,
        );
        return {
          configured: false,
          bucket: null,
          totalObjects: 0,
          totalBytes: 0,
          totalHuman: "0 B",
          byPrefix: [] as R2PrefixStat[],
        };
      }),
    ]);

    return {
      database: dbStats,
      offloadFields: offloadStats,
      r2: r2Stats,
      generatedAt: new Date().toISOString(),
    };
  }

  private async queryDatabase() {
    const totalRaw = await this.prisma.$queryRawUnsafe<{ sz: bigint }[]>(
      `SELECT pg_database_size(current_database()) AS sz`,
    );
    const totalBytes = Number(totalRaw[0].sz);

    const tablesRaw = await this.prisma.$queryRawUnsafe<
      Array<{
        relname: string;
        rows: bigint;
        total_bytes: bigint;
        heap_bytes: bigint;
        index_bytes: bigint;
        toast_bytes: bigint;
      }>
    >(
      `SELECT
         c.relname,
         COALESCE(s.n_live_tup, 0)::bigint AS rows,
         pg_total_relation_size(c.oid)::bigint AS total_bytes,
         pg_relation_size(c.oid)::bigint AS heap_bytes,
         pg_indexes_size(c.oid)::bigint AS index_bytes,
         COALESCE(pg_total_relation_size(c.reltoastrelid), 0)::bigint AS toast_bytes
       FROM pg_class c
       LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE c.relkind='r' AND c.relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
       ORDER BY pg_total_relation_size(c.oid) DESC`,
    );

    const tables: TableStat[] = tablesRaw.map((r) => ({
      table: r.relname,
      rows: Number(r.rows),
      totalBytes: Number(r.total_bytes),
      totalHuman: humanBytes(Number(r.total_bytes)),
      heapBytes: Number(r.heap_bytes),
      indexBytes: Number(r.index_bytes),
      toastBytes: Number(r.toast_bytes),
    }));

    return {
      totalBytes,
      totalHuman: humanBytes(totalBytes),
      tables,
    };
  }

  private async queryOffloadFields(): Promise<OffloadFieldStat[]> {
    const results: OffloadFieldStat[] = [];
    for (const def of OFFLOAD_FIELDS) {
      const [total, withUri, withContent] = await Promise.all([
        this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT COUNT(*)::bigint AS n FROM "${def.table}"`,
        ),
        this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT COUNT(*)::bigint AS n FROM "${def.table}" WHERE "${def.uriField}" IS NOT NULL`,
        ),
        this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
          def.field === "full_report"
            ? `SELECT COUNT(*)::bigint AS n FROM "${def.table}" WHERE char_length("${def.field}") > 0`
            : `SELECT COUNT(*)::bigint AS n FROM "${def.table}" WHERE "${def.field}" IS NOT NULL`,
        ),
      ]);
      results.push({
        table: def.table,
        field: def.field,
        uriField: def.uriField,
        r2Prefix: def.r2Prefix,
        totalRows: Number(total[0].n),
        rowsWithUri: Number(withUri[0].n),
        rowsWithDbContent: Number(withContent[0].n),
      });
    }
    return results;
  }

  private async queryR2(): Promise<StorageInventory["r2"]> {
    if (!this.storage.isEnabled()) {
      return {
        configured: false,
        bucket: null,
        totalObjects: 0,
        totalBytes: 0,
        totalHuman: "0 B",
        byPrefix: [],
      };
    }
    const client = (this.storage as unknown as { s3Client: unknown })
      .s3Client as {
      send: (cmd: unknown) => Promise<{
        Contents?: Array<{ Key?: string; Size?: number }>;
        IsTruncated?: boolean;
        NextContinuationToken?: string;
      }>;
    };
    const bucket = (this.storage as unknown as { bucketName: string })
      .bucketName;

    const byPrefixMap = new Map<string, { objects: number; bytes: number }>();
    let totalObjects = 0;
    let totalBytes = 0;
    let token: string | undefined;
    while (true) {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: token,
          MaxKeys: 1000,
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (!obj.Key) continue;
        const top = obj.Key.split("/")[0] + "/";
        const size = obj.Size ?? 0;
        const entry = byPrefixMap.get(top) ?? { objects: 0, bytes: 0 };
        entry.objects++;
        entry.bytes += size;
        byPrefixMap.set(top, entry);
        totalObjects++;
        totalBytes += size;
      }
      if (!res.IsTruncated) break;
      token = res.NextContinuationToken;
    }

    const byPrefix: R2PrefixStat[] = Array.from(byPrefixMap.entries())
      .map(([prefix, v]) => ({
        prefix,
        objects: v.objects,
        bytes: v.bytes,
        bytesHuman: humanBytes(v.bytes),
      }))
      .sort((a, b) => b.bytes - a.bytes);

    return {
      configured: true,
      bucket,
      totalObjects,
      totalBytes,
      totalHuman: humanBytes(totalBytes),
      byPrefix,
    };
  }
}
