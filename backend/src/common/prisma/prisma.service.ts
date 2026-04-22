import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// 慢查询阈值 (毫秒)
const SLOW_QUERY_THRESHOLD = parseInt(
  process.env.SLOW_QUERY_THRESHOLD || "1000",
  10,
);

// 是否启用查询日志
const ENABLE_QUERY_LOG = process.env.ENABLE_QUERY_LOG === "true";

// 数据库连接池配置
const DB_POOL_SIZE = parseInt(process.env.DB_POOL_SIZE || "10", 10);
const DB_POOL_TIMEOUT = parseInt(process.env.DB_POOL_TIMEOUT || "30", 10);

// 事务超时配置 (毫秒) - 降至 30 秒以避免长事务阻塞
const PRISMA_TRANSACTION_TIMEOUT = parseInt(
  process.env.PRISMA_TRANSACTION_TIMEOUT || "30000",
  10,
);

/**
 * 构建数据库 URL 并添加连接池参数
 * Prisma 使用 URL 中的 connection_limit 和 pool_timeout 参数控制连接池
 *
 * 推荐配置：
 * - DB_POOL_SIZE: 10 (默认) - 每个 Prisma 实例的最大连接数
 * - DB_POOL_TIMEOUT: 30 (默认) - 获取连接的超时时间（秒）
 *
 * PostgreSQL 连接池限制：
 * - Railway: max_connections = 100 (默认)
 * - 建议每个实例使用 10 个连接，支持最多 10 个并发实例
 */
function buildDatabaseUrl(): string | undefined {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) return undefined;

  try {
    const url = new URL(baseUrl);

    // 检查是否已有 connection_limit 参数
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", DB_POOL_SIZE.toString());
    }

    // 检查是否已有 pool_timeout 参数
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", DB_POOL_TIMEOUT.toString());
    }

    return url.toString();
  } catch {
    // 如果 URL 解析失败，返回原始值
    return baseUrl;
  }
}

/**
 * 获取日志配置（静态函数，在 super() 之前调用）
 */
function getLogConfig(): Prisma.LogLevel[] | Prisma.LogDefinition[] {
  if (ENABLE_QUERY_LOG) {
    return [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "error" },
      { emit: "stdout", level: "warn" },
    ];
  }
  return ["error", "warn"];
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // ★ 数据库 URL（包含连接池配置）
      datasources: {
        db: {
          url: buildDatabaseUrl(),
        },
      },
      // ★ 配置事务超时时间（可通过环境变量配置）
      transactionOptions: {
        maxWait: 10000, // 等待获取事务的最大时间 (10秒)
        timeout: PRISMA_TRANSACTION_TIMEOUT, // 事务执行的最大时间（默认 30 秒）
      },
      // ★ 启用查询日志（开发环境或明确启用时）
      log: getLogConfig(),
    });

    // ★ 设置查询事件监听器
    this.setupQueryLogging();
  }

  /**
   * 设置查询日志和慢查询检测
   */
  private setupQueryLogging(): void {
    if (!ENABLE_QUERY_LOG) return;

    // 使用类型断言来访问 $on 方法
    const client = this as unknown as {
      $on: (event: string, callback: (e: QueryEvent) => void) => void;
    };

    interface QueryEvent {
      query: string;
      params: string;
      duration: number;
      target: string;
    }

    client.$on("query", (e: QueryEvent) => {
      const duration = e.duration;

      // 记录慢查询
      if (duration > SLOW_QUERY_THRESHOLD) {
        this.logger.warn(
          `[SlowQuery] ${duration}ms | ${e.query} | params: ${e.params}`,
        );
      }

      // 调试模式下记录所有查询
      if (process.env.DEBUG_QUERIES === "true") {
        this.logger.debug(`[Query] ${duration}ms | ${e.query}`);
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log("[Prisma] Prisma connected to database");

    // 记录配置信息
    if (ENABLE_QUERY_LOG) {
      this.logger.log(
        `[Prisma] Query logging enabled, slow query threshold: ${SLOW_QUERY_THRESHOLD}ms`,
      );
    }

    // ★ 注入 TopicReport full_report 透明 hydrate（Phase 2）。
    // 当 full_report 字段为空 && full_report_uri 有值时，自动从对象存储拉正文。
    // 对所有 findUnique/findFirst/findMany/findUniqueOrThrow/findFirstOrThrow 生效。
    this.installTopicReportHydration();
  }

  // ────────────────────── TopicReport full_report 透明 hydrate ──────────────────────

  /** 对象存储 S3 客户端（按需初始化，只给 topicReport hydrate 用） */
  private objectStorage: { client: S3Client; bucket: string } | null = null;

  private initObjectStorage(): { client: S3Client; bucket: string } | null {
    if (this.objectStorage) return this.objectStorage;

    const b2KeyId = process.env.B2_KEY_ID;
    const b2AppKey = process.env.B2_APP_KEY;
    const b2Endpoint = process.env.B2_ENDPOINT;
    const b2Bucket = process.env.B2_BUCKET_NAME;
    if (b2KeyId && b2AppKey && b2Endpoint && b2Bucket) {
      const regionMatch = b2Endpoint.match(/s3\.([^.]+)\.backblazeb2\.com/);
      this.objectStorage = {
        client: new S3Client({
          region: regionMatch ? regionMatch[1] : "us-east-005",
          endpoint: b2Endpoint,
          credentials: { accessKeyId: b2KeyId, secretAccessKey: b2AppKey },
        }),
        bucket: b2Bucket,
      };
      return this.objectStorage;
    }

    const r2AccountId = process.env.R2_ACCOUNT_ID;
    const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
    const r2Secret = process.env.R2_SECRET_ACCESS_KEY;
    const r2Bucket = process.env.R2_BUCKET_NAME;
    if (r2AccountId && r2AccessKey && r2Secret && r2Bucket) {
      this.objectStorage = {
        client: new S3Client({
          region: "auto",
          endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId: r2AccessKey, secretAccessKey: r2Secret },
        }),
        bucket: r2Bucket,
      };
      return this.objectStorage;
    }
    return null;
  }

  private async downloadText(key: string): Promise<string | null> {
    const storage = this.initObjectStorage();
    if (!storage) return null;
    try {
      const res = await storage.client.send(
        new GetObjectCommand({ Bucket: storage.bucket, Key: key }),
      );
      if (!res.Body) return null;
      return await res.Body.transformToString("utf-8");
    } catch (error) {
      const code = (error as { name?: string })?.name;
      if (code !== "NoSuchKey" && code !== "NotFound") {
        this.logger.warn(
          `[hydrate] downloadText failed for ${key}: ${(error as Error).message}`,
        );
      }
      return null;
    }
  }

  private async hydrateRow(
    row: Record<string, unknown> | null | undefined,
  ): Promise<void> {
    if (!row) return;
    const uri = row.fullReportUri as string | null | undefined;
    const current = row.fullReport as string | null | undefined;
    if (!uri) return;
    // 当 DB 字段为空串或 null（Phase 2 清空后状态）才去 B2 拉；
    // Phase 1 dual-write 期间 DB 仍有正文，直接用，省一次 round-trip。
    if (current && current.length > 0) return;
    const text = await this.downloadText(uri);
    if (text !== null) {
      row.fullReport = text;
    }
  }

  /**
   * 用 $extends 的 query 钩子拦截 topicReport 所有 find 操作，
   * 把扩展后的 topicReport model 替换回 this.topicReport 属性。
   *
   * TS 类型挑战：$extends 返回的客户端类型跟 PrismaClient 分叉，
   * 为了让所有已有 Service 注入的 PrismaService 不改代码就生效，
   * 这里用 Object.defineProperty 在运行时 shadow 掉 topicReport 属性。
   */
  private installTopicReportHydration(): void {
    const hydrateResult = async (result: unknown) => {
      if (Array.isArray(result)) {
        await Promise.all(
          result.map((r) => this.hydrateRow(r as Record<string, unknown>)),
        );
      } else if (result && typeof result === "object") {
        await this.hydrateRow(result as Record<string, unknown>);
      }
    };

    const extended = this.$extends({
      query: {
        topicReport: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async $allOperations({ operation, args, query }: any) {
            const result = await query(args);
            if (
              operation === "findUnique" ||
              operation === "findUniqueOrThrow" ||
              operation === "findFirst" ||
              operation === "findFirstOrThrow" ||
              operation === "findMany"
            ) {
              await hydrateResult(result);
            }
            return result;
          },
        },
      },
    });

    // 运行时 shadow 掉 topicReport 指向扩展 client 的同名 model
    Object.defineProperty(this, "topicReport", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      value: (extended as any).topicReport,
      writable: false,
      configurable: true,
    });

    this.logger.log(
      `[Prisma] TopicReport fullReport hydration installed (provider=${this.objectStorage?.bucket ?? "none"})`,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * 数据库健康检查
   */
  async healthCheck(): Promise<{
    status: "healthy" | "unhealthy";
    latency: number;
    message?: string;
  }> {
    const start = Date.now();
    try {
      await this.$queryRaw`SELECT 1`;
      return {
        status: "healthy",
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        latency: Date.now() - start,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 获取数据库统计信息（用于监控）
   */
  async getPoolStats(): Promise<{
    activeConnections: number;
    idleConnections: number;
    waitingRequests: number;
  }> {
    // Prisma 不直接暴露连接池统计，通过 pg_stat_activity 获取
    try {
      const result = await this.$queryRaw<
        { state: string; count: bigint }[]
      >`SELECT state, COUNT(*) as count FROM pg_stat_activity WHERE datname = current_database() GROUP BY state`;

      let active = 0;
      let idle = 0;

      for (const row of result) {
        if (row.state === "active") active = Number(row.count);
        if (row.state === "idle") idle = Number(row.count);
      }

      return {
        activeConnections: active,
        idleConnections: idle,
        waitingRequests: 0, // Prisma 不暴露这个信息
      };
    } catch {
      return {
        activeConnections: 0,
        idleConnections: 0,
        waitingRequests: 0,
      };
    }
  }

  /**
   * Migration History (Moved to Prisma migrations):
   *
   * 1. ResourceUpvote table
   *    - Created via Prisma migration
   *    - Previously auto-created in runtime (removed 2025-01-24)
   *
   * 2. SystemSetting columns
   *    - encrypted: Added via Prisma migration
   *    - Previously auto-created in runtime (removed 2025-01-24)
   *
   * 3. WritingChapter columns
   *    - metadata: Added via Prisma migration
   *    - Previously auto-created in runtime (removed 2025-01-24)
   *
   * All schema changes should now be managed through Prisma migrations:
   * - Run: npx prisma migrate dev --name description
   * - Deploy: npx prisma migrate deploy
   */
}
