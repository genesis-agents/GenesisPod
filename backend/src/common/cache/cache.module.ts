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
 * - Railway 私有网络使用 IPv6，需设置 family: 6
 * - 优先使用 REDIS_URL（内网），降级到 REDIS_PUBLIC_URL（公网）
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
          return {
            ttl: 300 * 1000, // 5 分钟
            max: 1000, // 最多 1000 条
          };
        }

        // 尝试连接 Redis（优先内网，降级公网）
        const urlsToTry = [
          ...(redisUrl ? [{ url: redisUrl, label: "internal" }] : []),
          ...(redisPublicUrl && redisPublicUrl !== redisUrl
            ? [{ url: redisPublicUrl, label: "public" }]
            : []),
        ];

        for (const { url, label } of urlsToTry) {
          const maskedUrl = url.replace(/\/\/.*@/, "//***@");
          logger.log(`Trying Redis (${label}): ${maskedUrl}`);

          try {
            // Railway 私有网络使用 IPv6
            const isRailwayInternal = url.includes(".railway.internal");

            const store = await redisStore({
              url,
              ttl: 300 * 1000,
              // Railway 私有网络需要 IPv6
              ...(isRailwayInternal ? { family: 6 } : {}),
              // 连接选项：限制重试，防止无限刷屏
              maxRetriesPerRequest: 3,
              enableOfflineQueue: false,
              connectTimeout: 5000,
              retryStrategy(times: number) {
                if (times > 5) {
                  logger.warn(
                    `Redis connection failed after ${times} attempts. Stopping retries.`,
                  );
                  return null; // 停止重试
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

            logger.log(
              `Redis cache connected successfully (${label})${isRailwayInternal ? " [IPv6]" : ""}`,
            );

            return {
              store,
              ttl: 300 * 1000,
            };
          } catch (error) {
            logger.error(
              `Failed to connect Redis (${label}): ${error instanceof Error ? error.message : error}`,
            );
          }
        }

        // 所有 Redis URL 都失败，回退到内存缓存
        logger.warn(
          "All Redis connections failed. Falling back to memory cache.",
        );
        return {
          ttl: 300 * 1000,
          max: 1000,
        };
      },
    }),
  ],
  providers: [CacheService],
  exports: [NestCacheModule, CacheService],
})
export class CacheModule {}
