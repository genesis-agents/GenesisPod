import { Module, Global, Logger } from "@nestjs/common";
import { CacheModule as NestCacheModule } from "@nestjs/cache-manager";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { redisStore } from "cache-manager-ioredis-yet";
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
 * - Railway .railway.internal IPv6 DNS 解析异常（返回 ::1）
 * - 使用 family: 4 强制 IPv4 内网连接
 * - 降级链：REDIS_URL (IPv4) → REDIS_PUBLIC_URL → 内存缓存
 */
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
          ...(redisUrl ? [{ url: redisUrl, label: "internal" }] : []),
          ...(redisPublicUrl && redisPublicUrl !== redisUrl
            ? [{ url: redisPublicUrl, label: "public" }]
            : []),
        ];

        for (const { url, label } of urlCandidates) {
          const maskedUrl = url.replace(/\/\/.*@/, "//***@");
          logger.log(`Trying Redis (${label}): ${maskedUrl}`);

          try {
            const store = await redisStore({
              url,
              ttl: 300 * 1000,
              // 强制 IPv4，绕过 Railway IPv6 DNS 解析异常
              family: 4,
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

            // 绑定 error 事件处理器，防止 "Unhandled error event" 刷屏
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
