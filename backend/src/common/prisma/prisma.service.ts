import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

// 慢查询阈值 (毫秒)
const SLOW_QUERY_THRESHOLD = parseInt(
  process.env.SLOW_QUERY_THRESHOLD || "1000",
  10,
);

// 是否启用查询日志
const ENABLE_QUERY_LOG = process.env.ENABLE_QUERY_LOG === "true";

// 数据库连接池配置
const DB_POOL_SIZE = parseInt(process.env.DB_POOL_SIZE || "10", 10);
const DB_POOL_TIMEOUT = parseInt(process.env.DB_POOL_TIMEOUT || "10", 10);

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
 * - DB_POOL_TIMEOUT: 10 (默认) - 获取连接的超时时间（秒）
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
  }

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
