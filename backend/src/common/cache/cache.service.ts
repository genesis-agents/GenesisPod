import { Injectable, Inject, Logger } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";

/**
 * 缓存键前缀，用于命名空间隔离
 */
export enum CachePrefix {
  /** AI 模型配置 */
  AI_MODEL = "ai:model:",
  /** AI 模型列表（按类型） */
  AI_MODEL_LIST = "ai:model:list:",
  /** 用户信息 */
  USER = "user:",
  /** 用户 API Keys */
  USER_API_KEY = "user:apikey:",
  /** 系统设置 */
  SETTINGS = "settings:",
  /** 会话数据 */
  SESSION = "session:",
  /** 临时数据 */
  TEMP = "temp:",
  /** OAuth 授权码 */
  AUTH_CODE = "auth:code:",
  /** 社交平台登录会话 */
  SOCIAL_LOGIN = "social:login:",
  /** 社交平台连接验证锁 */
  SOCIAL_VERIFYING = "social:verifying:",
}

/**
 * 缓存 TTL 预设（秒）
 */
export enum CacheTTL {
  /** 1 分钟 - 高频变化数据 */
  SHORT = 60,
  /** 5 分钟 - 默认 */
  DEFAULT = 300,
  /** 10 分钟 - 登录会话 */
  LOGIN_SESSION = 600,
  /** 15 分钟 - 中等频率 */
  MEDIUM = 900,
  /** 1 小时 - 低频变化 */
  LONG = 3600,
  /** 24 小时 - 几乎不变 */
  DAY = 86400,
}

/**
 * 缓存服务
 *
 * 提供类型安全的缓存操作接口，支持：
 * - 自动序列化/反序列化
 * - 命名空间隔离
 * - 错误容错（缓存失败不影响主流程）
 * - 批量操作
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  /**
   * 获取缓存值
   * @param key 缓存键
   * @returns 缓存值，不存在则返回 undefined
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.cacheManager.get<T>(key);
      return value ?? undefined;
    } catch (error) {
      this.logger.warn(`Cache get failed for key ${key}: ${error}`);
      return undefined;
    }
  }

  /**
   * 设置缓存值
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（秒），默认 5 分钟
   */
  async set<T>(
    key: string,
    value: T,
    ttl: number = CacheTTL.DEFAULT,
  ): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl * 1000); // cache-manager 使用毫秒
    } catch (error) {
      this.logger.warn(`Cache set failed for key ${key}: ${error}`);
    }
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
    } catch (error) {
      this.logger.warn(`Cache del failed for key ${key}: ${error}`);
    }
  }

  /**
   * 获取或设置缓存（常用模式）
   * 如果缓存存在则返回，否则执行 factory 并缓存结果
   *
   * @param key 缓存键
   * @param factory 数据获取函数
   * @param ttl 过期时间（秒）
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = CacheTTL.DEFAULT,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * 按前缀删除缓存
   * 注意：此操作在 Redis 中使用 SCAN，在内存缓存中可能不支持
   *
   * @param prefix 缓存键前缀
   */
  async delByPrefix(prefix: string): Promise<void> {
    try {
      // 尝试获取底层存储客户端进行 keys 操作
      const cacheManagerInternal = this.cacheManager as unknown as {
        stores?: Array<{ keys?: (pattern: string) => Promise<string[]> }>;
        store?: { keys?: (pattern: string) => Promise<string[]> };
      };
      const stores = cacheManagerInternal.stores;
      const store = stores?.[0] || cacheManagerInternal.store;
      if (store?.keys) {
        const keys = await store.keys(`${prefix}*`);
        if (keys && keys.length > 0) {
          // Batch delete in chunks to avoid memory spikes
          const BATCH_SIZE = 100;
          for (let i = 0; i < keys.length; i += BATCH_SIZE) {
            const batch = keys.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map((key: string) => this.del(key)));
          }
          this.logger.debug(
            `Deleted ${keys.length} keys with prefix ${prefix}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Cache delByPrefix failed for prefix ${prefix}: ${error}`,
      );
    }
  }

  /**
   * 使 AI 模型缓存失效
   * 当模型配置变更时调用
   */
  async invalidateAIModelCache(): Promise<void> {
    await this.delByPrefix(CachePrefix.AI_MODEL);
    await this.delByPrefix(CachePrefix.AI_MODEL_LIST);
    this.logger.log("AI model cache invalidated");
  }

  /**
   * 使用户缓存失效
   * @param userId 用户 ID
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.del(`${CachePrefix.USER}${userId}`);
    await this.delByPrefix(`${CachePrefix.USER_API_KEY}${userId}`);
    this.logger.debug(`User cache invalidated for ${userId}`);
  }

  /**
   * 构建带前缀的缓存键
   */
  buildKey(prefix: CachePrefix, ...parts: string[]): string {
    return `${prefix}${parts.join(":")}`;
  }
}
