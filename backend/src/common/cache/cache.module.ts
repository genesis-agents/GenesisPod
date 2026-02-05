import { Module, Global, Logger } from "@nestjs/common";
import { CacheModule as NestCacheModule } from "@nestjs/cache-manager";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { redisStore } from "cache-manager-ioredis-yet";
import Redis from "ioredis";
import { promises as dns } from "dns";
import { CacheService } from "./cache.service";

/**
 * 全局缓存模块
 *
 * 支持两种模式：
 * 1. Redis 模式（生产环境）：使用 Railway Redis 服务
 * 2. 内存模式（开发环境）：使用内存缓存
 *
 * 通过 REDIS_URL 环境变量自动切换模式
 *
 * Railway 注意事项：
 * - Railway .railway.internal DNS 可能解析到 ::1（IPv6 回环），Redis 不监听此地址
 * - DNS 预检：解析到 ::1 时立即跳过，零延迟降级
 * - 连接探测：用独立 ioredis 客户端 PING 验证，确保 store 可用
 * - 降级链：REDIS_URL（内网）→ REDIS_PUBLIC_URL（TCP Proxy）→ 内存缓存
 */

/** DNS 预检：检测 Railway 内网 DNS 是否解析到回环地址 */
async function isInternalDnsValid(
  redisUrl: string,
  logger: Logger,
): Promise<boolean> {
  try {
    const hostname = new URL(redisUrl).hostname;
    if (!hostname.endsWith(".railway.internal")) return true;

    const addresses = await dns.resolve6(hostname);
    if (addresses.every((a) => a === "::1")) {
      logger.warn(
        `Railway DNS: ${hostname} → ::1 (loopback). Internal networking unavailable.`,
      );
      return false;
    }
    logger.log(`Railway DNS: ${hostname} → ${addresses[0]} (OK)`);
    return true;
  } catch (err) {
    logger.warn(
      `DNS resolution failed: ${err instanceof Error ? err.message : err}`,
    );
    return false;
  }
}

/** 连接探测：用独立客户端 PING 验证 Redis 可达性 */
async function probeRedisConnection(
  url: string,
  logger: Logger,
  label: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const client = new Redis(url, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    client.on("error", () => {});
    const timer = setTimeout(() => {
      client.disconnect();
      logger.warn(`Redis probe timeout (${label})`);
      resolve(false);
    }, 4000);
    client
      .connect()
      .then(() => client.ping())
      .then(() => {
        clearTimeout(timer);
        client.disconnect();
        logger.log(`Redis probe OK (${label}): PONG`);
        resolve(true);
      })
      .catch((err) => {
        clearTimeout(timer);
        client.disconnect();
        logger.warn(`Redis probe failed (${label}): ${err.message}`);
        resolve(false);
      });
  });
}

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger("CacheModule");
        const redisUrl = configService.get<string>("REDIS_URL");
        const redisPublicUrl = configService.get<string>("REDIS_PUBLIC_URL");

        if (!redisUrl && !redisPublicUrl) {
          logger.log("REDIS_URL not set, using in-memory cache");
          return { ttl: 300 * 1000, max: 1000 };
        }

        // 内网优先，公网降级
        const urlCandidates = [
          ...(redisUrl ? [{ url: redisUrl, label: "internal" as const }] : []),
          ...(redisPublicUrl && redisPublicUrl !== redisUrl
            ? [{ url: redisPublicUrl, label: "public" as const }]
            : []),
        ];

        for (const { url, label } of urlCandidates) {
          const maskedUrl = url.replace(/\/\/.*@/, "//***@");
          logger.log(`Trying Redis (${label}): ${maskedUrl}`);

          // 1) 内网 DNS 预检：::1 则立即跳过
          if (label === "internal") {
            const dnsOk = await isInternalDnsValid(url, logger);
            if (!dnsOk) {
              logger.log("Skipping internal URL, trying next candidate...");
              continue;
            }
          }

          // 2) 连接探测：PING 验证可达性
          const reachable = await probeRedisConnection(url, logger, label);
          if (!reachable) {
            logger.warn(`Redis (${label}) unreachable, trying next...`);
            continue;
          }

          // 3) 创建 cache store
          try {
            const store = await redisStore({
              url,
              ttl: 300 * 1000,
              maxRetriesPerRequest: 3,
              enableOfflineQueue: false,
              connectTimeout: 5000,
              retryStrategy(times: number) {
                if (times > 5) {
                  logger.warn(
                    `Redis retry limit reached (${times}). Stopping.`,
                  );
                  return null;
                }
                const delay = Math.min(times * 500, 3000);
                logger.warn(
                  `Redis reconnecting in ${delay}ms (attempt ${times})...`,
                );
                return delay;
              },
            });

            const client = (store as any).client;
            if (client?.on) {
              client.on("error", (err: Error) => {
                logger.warn(`Redis error: ${err.message}`);
              });
            }

            logger.log(`Redis cache connected successfully (${label})`);
            return { store, ttl: 300 * 1000 };
          } catch (error) {
            logger.error(
              `Failed to create Redis store (${label}): ${error instanceof Error ? error.message : error}`,
            );
          }
        }

        logger.warn(
          "All Redis connections failed. Falling back to memory cache.",
        );
        return { ttl: 300 * 1000, max: 1000 };
      },
    }),
  ],
  providers: [CacheService],
  exports: [NestCacheModule, CacheService],
})
export class CacheModule {}
