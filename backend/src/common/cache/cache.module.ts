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

        if (redisUrl) {
          // 生产模式：使用 Redis
          logger.log(
            `Initializing Redis cache: ${redisUrl.replace(/\/\/.*@/, "//***@")}`,
          );

          try {
            const store = await redisStore({
              url: redisUrl,
              ttl: 300 * 1000, // 默认 5 分钟 (毫秒)
            });

            logger.log("Redis cache initialized successfully");

            return {
              store,
              ttl: 300 * 1000, // 5 分钟
            };
          } catch (error) {
            logger.error(
              `Failed to connect to Redis: ${error}. Falling back to memory cache.`,
            );
            // Redis 连接失败时回退到内存缓存
            return {
              ttl: 300 * 1000,
              max: 1000,
            };
          }
        } else {
          // 开发模式：使用内存缓存
          logger.log("REDIS_URL not set, using in-memory cache");
          return {
            ttl: 300 * 1000, // 5 分钟
            max: 1000, // 最多 1000 条
          };
        }
      },
    }),
  ],
  providers: [CacheService],
  exports: [NestCacheModule, CacheService],
})
export class CacheModule {}
