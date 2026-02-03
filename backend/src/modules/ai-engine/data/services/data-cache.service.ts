/**
 * Data Cache Service
 * 数据缓存服务 - 缓存数据获取和增强结果
 */

import { Injectable, Logger, Optional, Inject } from "@nestjs/common";
import { createHash } from "crypto";
import {
  DataFetchRequest,
  DataFetchResult,
} from "../abstractions/data-source.interface";
import {
  EnrichedDataItem,
  EnrichmentOptions,
} from "../abstractions/data-enricher.interface";

/**
 * 缓存条目
 */
interface CacheEntry<T> {
  data: T;
  createdAt: Date;
  expiresAt: Date;
  hits: number;
}

/**
 * 缓存配置
 */
export interface DataCacheConfig {
  enabled: boolean;
  fetchResultTTL: number; // 获取结果缓存时间 (ms)
  enrichmentResultTTL: number; // 增强结果缓存时间 (ms)
  maxEntries: number; // 最大缓存条目数
  cleanupInterval: number; // 清理间隔 (ms)
}

const DEFAULT_CONFIG: DataCacheConfig = {
  enabled: true,
  fetchResultTTL: 5 * 60 * 1000, // 5 分钟
  enrichmentResultTTL: 30 * 60 * 1000, // 30 分钟
  maxEntries: 1000,
  cleanupInterval: 60 * 1000, // 1 分钟
};

/**
 * 数据缓存服务
 */
export const DATA_CACHE_CONFIG = "DATA_CACHE_CONFIG";

@Injectable()
export class DataCacheService {
  private readonly logger = new Logger(DataCacheService.name);
  private readonly fetchCache = new Map<string, CacheEntry<DataFetchResult>>();
  private readonly enrichmentCache = new Map<
    string,
    CacheEntry<EnrichedDataItem[]>
  >();
  private readonly config: DataCacheConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    @Optional() @Inject(DATA_CACHE_CONFIG) config?: Partial<DataCacheConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...(config || {}) };

    if (this.config.enabled) {
      this.startCleanupTimer();
    }
  }

  /**
   * 获取缓存的获取结果
   */
  getFetchResult(request: DataFetchRequest): DataFetchResult | null {
    if (!this.config.enabled) return null;

    const key = this.generateFetchKey(request);
    const entry = this.fetchCache.get(key);

    if (!entry) return null;

    if (new Date() > entry.expiresAt) {
      this.fetchCache.delete(key);
      return null;
    }

    entry.hits++;
    return entry.data;
  }

  /**
   * 缓存获取结果
   */
  setFetchResult(request: DataFetchRequest, result: DataFetchResult): void {
    if (!this.config.enabled) return;

    this.ensureCapacity(this.fetchCache);

    const key = this.generateFetchKey(request);
    const now = new Date();

    this.fetchCache.set(key, {
      data: result,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.config.fetchResultTTL),
      hits: 0,
    });
  }

  /**
   * 获取缓存的增强结果
   */
  getEnrichmentResult(
    itemIds: string[],
    options: EnrichmentOptions,
  ): EnrichedDataItem[] | null {
    if (!this.config.enabled) return null;

    const key = this.generateEnrichmentKey(itemIds, options);
    const entry = this.enrichmentCache.get(key);

    if (!entry) return null;

    if (new Date() > entry.expiresAt) {
      this.enrichmentCache.delete(key);
      return null;
    }

    entry.hits++;
    return entry.data;
  }

  /**
   * 缓存增强结果
   */
  setEnrichmentResult(
    itemIds: string[],
    options: EnrichmentOptions,
    result: EnrichedDataItem[],
  ): void {
    if (!this.config.enabled) return;

    this.ensureCapacity(this.enrichmentCache);

    const key = this.generateEnrichmentKey(itemIds, options);
    const now = new Date();

    this.enrichmentCache.set(key, {
      data: result,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.config.enrichmentResultTTL),
      hits: 0,
    });
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.fetchCache.clear();
    this.enrichmentCache.clear();
    this.logger.log("Cache cleared");
  }

  /**
   * 清除过期缓存
   */
  cleanup(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [key, entry] of this.fetchCache) {
      if (now > entry.expiresAt) {
        this.fetchCache.delete(key);
        cleaned++;
      }
    }

    for (const [key, entry] of this.enrichmentCache) {
      if (now > entry.expiresAt) {
        this.enrichmentCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned ${cleaned} expired cache entries`);
    }

    return cleaned;
  }

  /**
   * 获取缓存统计
   */
  getStats(): {
    fetchCache: { size: number; totalHits: number };
    enrichmentCache: { size: number; totalHits: number };
  } {
    let fetchHits = 0;
    for (const entry of this.fetchCache.values()) {
      fetchHits += entry.hits;
    }

    let enrichmentHits = 0;
    for (const entry of this.enrichmentCache.values()) {
      enrichmentHits += entry.hits;
    }

    return {
      fetchCache: {
        size: this.fetchCache.size,
        totalHits: fetchHits,
      },
      enrichmentCache: {
        size: this.enrichmentCache.size,
        totalHits: enrichmentHits,
      },
    };
  }

  /**
   * 生成获取结果的缓存键
   */
  private generateFetchKey(request: DataFetchRequest): string {
    const parts = [
      request.query,
      request.sources?.sort().join(",") || "auto",
      request.context?.domain || "",
      request.context?.taskType || "",
      request.options?.maxResults?.toString() || "50",
    ];
    return `fetch:${this.hashString(parts.join("|"))}`;
  }

  /**
   * 生成增强结果的缓存键
   */
  private generateEnrichmentKey(
    itemIds: string[],
    options: EnrichmentOptions,
  ): string {
    const parts = [
      itemIds.sort().join(","),
      options.types.sort().join(","),
      options.maxContentLength?.toString() || "",
    ];
    return `enrich:${this.hashString(parts.join("|"))}`;
  }

  /**
   * 使用 MD5 生成缓存键哈希
   * ★ 修复：使用 crypto 避免哈希冲突
   */
  private hashString(str: string): string {
    return createHash("md5").update(str).digest("hex").slice(0, 16);
  }

  /**
   * 确保缓存容量
   * ★ 优化：超过阈值时批量清理，避免频繁的 O(n) 遍历
   */
  private ensureCapacity<T>(cache: Map<string, CacheEntry<T>>): void {
    // 当超过 110% 容量时批量清理到 80%
    if (cache.size >= this.config.maxEntries * 1.1) {
      const targetSize = Math.floor(this.config.maxEntries * 0.8);
      const entriesToRemove = cache.size - targetSize;

      // 按 hits 排序，删除最少使用的
      const entries = Array.from(cache.entries())
        .sort((a, b) => a[1].hits - b[1].hits)
        .slice(0, entriesToRemove);

      for (const [key] of entries) {
        cache.delete(key);
      }

      this.logger.debug(
        `Evicted ${entriesToRemove} cache entries (batch cleanup)`,
      );
    } else if (cache.size >= this.config.maxEntries) {
      // 单个驱逐（仅在边界情况）
      let minHits = Infinity;
      let minKey: string | null = null;

      for (const [key, entry] of cache) {
        if (entry.hits < minHits) {
          minHits = entry.hits;
          minKey = key;
        }
      }

      if (minKey) {
        cache.delete(minKey);
      }
    }
  }

  /**
   * 启动清理定时器
   * ★ 修复：添加异常处理防止定时器停止
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanup();
      } catch (error) {
        this.logger.error(`Cache cleanup failed: ${error}`);
      }
    }, this.config.cleanupInterval);
  }

  /**
   * 停止清理定时器
   */
  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}
