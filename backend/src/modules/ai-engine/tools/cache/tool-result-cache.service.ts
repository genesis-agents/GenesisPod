/**
 * AI Engine - Tool Result Cache Service
 * 工具结果 Redis 缓存，避免同一 mission 内重复调用同一 URL
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { CacheService } from "@/common/cache/cache.service";
import * as crypto from "crypto";

@Injectable()
export class ToolResultCacheService {
  private readonly logger = new Logger(ToolResultCacheService.name);

  /**
   * 只缓存无副作用的工具（纯查询，重跑无影响）
   */
  private readonly CACHEABLE_SIDE_EFFECTS = new Set<string>(["none"]);

  /**
   * 默认 TTL 30 分钟，覆盖典型 mission 生命周期
   */
  private readonly DEFAULT_TTL_SECONDS = 30 * 60;

  constructor(@Optional() private readonly cache?: CacheService) {}

  /**
   * 判断工具是否可缓存
   * sideEffect 未定义时默认为 'none'（ITool 接口注释约定）
   */
  isCacheable(toolSideEffect?: string): boolean {
    const effect = toolSideEffect ?? "none";
    return this.CACHEABLE_SIDE_EFFECTS.has(effect);
  }

  /**
   * 构造缓存 key
   * 格式：tool:result:{scope}:{toolId}:{inputHash16}
   * scope = missionId（同 mission 内共享）或 "global"（跨 mission 共享）
   */
  buildKey(
    missionId: string | undefined,
    toolId: string,
    input: unknown,
  ): string {
    const inputHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(input ?? {}))
      .digest("hex")
      .slice(0, 16);
    const scope = missionId ?? "global";
    return `tool:result:${scope}:${toolId}:${inputHash}`;
  }

  /**
   * 尝试从缓存获取结果
   * CacheService 未注入时安静返回 null（降级透传）
   */
  async tryGet<T>(key: string): Promise<T | null> {
    if (!this.cache) return null;
    try {
      const value = await this.cache.get<T>(key);
      return value ?? null;
    } catch (e) {
      this.logger.warn(`cache get failed: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * 写入缓存
   * CacheService 未注入时为 noop
   */
  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number = this.DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    if (!this.cache) return;
    try {
      await this.cache.set(key, value, ttlSeconds);
    } catch (e) {
      this.logger.warn(`cache set failed: ${(e as Error).message}`);
    }
  }
}
