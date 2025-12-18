/**
 * Short Term Memory Service
 * 短期记忆服务 - 会话级别的临时存储
 *
 * 特点:
 * - 基于内存 Map 存储（可后续替换为 Redis）
 * - 支持 TTL 过期机制
 * - 支持 sessionId 隔离
 * - 适用于临时状态、会话上下文等
 */

import { Injectable, Logger } from "@nestjs/common";
import { IMemoryStore, MemoryItem, MemoryMetadata } from "./memory.interface";

/**
 * 内存存储项
 */
interface StorageItem {
  value: unknown;
  metadata: MemoryMetadata;
  expiresAt?: number; // 过期时间戳（毫秒）
}

/**
 * 短期记忆服务
 * 使用内存 Map 实现，支持 sessionId 隔离
 */
@Injectable()
export class ShortTermMemoryService implements IMemoryStore {
  private readonly logger = new Logger(ShortTermMemoryService.name);

  /**
   * 存储容器: sessionId -> (key -> StorageItem)
   */
  private readonly storage = new Map<string, Map<string, StorageItem>>();

  /**
   * 清理定时器
   */
  private cleanupInterval?: NodeJS.Timeout;

  /**
   * 默认过期时间（秒）
   */
  private readonly defaultTTL = 3600; // 1小时

  /**
   * 清理间隔（毫秒）
   */
  private readonly cleanupIntervalMs = 60000; // 1分钟

  constructor() {
    // 启动定期清理过期数据
    this.startCleanup();
  }

  /**
   * 获取会话存储
   */
  private getSessionStorage(sessionId: string): Map<string, StorageItem> {
    let sessionStorage = this.storage.get(sessionId);
    if (!sessionStorage) {
      sessionStorage = new Map();
      this.storage.set(sessionId, sessionStorage);
    }
    return sessionStorage;
  }

  /**
   * 检查是否过期
   */
  private isExpired(item: StorageItem): boolean {
    if (!item.expiresAt) return false;
    return Date.now() > item.expiresAt;
  }

  /**
   * 获取记忆（带 sessionId）
   */
  async getWithSession(sessionId: string, key: string): Promise<unknown> {
    const sessionStorage = this.storage.get(sessionId);
    if (!sessionStorage) {
      return undefined;
    }

    const item = sessionStorage.get(key);
    if (!item) {
      return undefined;
    }

    // 检查是否过期
    if (this.isExpired(item)) {
      sessionStorage.delete(key);
      this.logger.debug(
        `Memory expired: session=${sessionId}, key=${key}`,
      );
      return undefined;
    }

    return item.value;
  }

  /**
   * 设置记忆（带 sessionId）
   */
  async setWithSession(
    sessionId: string,
    key: string,
    value: unknown,
    ttl?: number,
  ): Promise<void> {
    const sessionStorage = this.getSessionStorage(sessionId);

    const now = new Date();
    const effectiveTTL = ttl ?? this.defaultTTL;
    const expiresAt = effectiveTTL > 0 ? Date.now() + effectiveTTL * 1000 : undefined;

    const item: StorageItem = {
      value,
      metadata: {
        createdAt: now,
        updatedAt: now,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
      expiresAt,
    };

    sessionStorage.set(key, item);

    this.logger.debug(
      `Memory set: session=${sessionId}, key=${key}, ttl=${effectiveTTL}s`,
    );
  }

  /**
   * 删除记忆（带 sessionId）
   */
  async deleteWithSession(sessionId: string, key: string): Promise<boolean> {
    const sessionStorage = this.storage.get(sessionId);
    if (!sessionStorage) {
      return false;
    }

    const deleted = sessionStorage.delete(key);
    if (deleted) {
      this.logger.debug(
        `Memory deleted: session=${sessionId}, key=${key}`,
      );
    }

    return deleted;
  }

  /**
   * 清空会话记忆
   */
  async clearSession(sessionId: string): Promise<void> {
    const deleted = this.storage.delete(sessionId);
    if (deleted) {
      this.logger.debug(`Session memory cleared: session=${sessionId}`);
    }
  }

  /**
   * 追加值到数组（带 sessionId）
   */
  async appendWithSession(
    sessionId: string,
    key: string,
    value: unknown,
    ttl?: number,
  ): Promise<void> {
    const current = await this.getWithSession(sessionId, key);

    let newValue: unknown[];
    if (Array.isArray(current)) {
      newValue = [...current, value];
    } else if (current === undefined) {
      newValue = [value];
    } else {
      newValue = [current, value];
    }

    await this.setWithSession(sessionId, key, newValue, ttl);
  }

  /**
   * 获取会话的所有记忆
   */
  async listSession(sessionId: string): Promise<MemoryItem[]> {
    const sessionStorage = this.storage.get(sessionId);
    if (!sessionStorage) {
      return [];
    }

    const items: MemoryItem[] = [];
    for (const [key, item] of sessionStorage.entries()) {
      // 跳过过期项
      if (this.isExpired(item)) {
        sessionStorage.delete(key);
        continue;
      }

      items.push({
        key,
        value: item.value,
        metadata: item.metadata,
      });
    }

    return items;
  }

  /**
   * 清理过期数据
   */
  private cleanup(): void {
    let totalDeleted = 0;

    for (const [sessionId, sessionStorage] of this.storage.entries()) {
      const keysToDelete: string[] = [];

      for (const [key, item] of sessionStorage.entries()) {
        if (this.isExpired(item)) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        sessionStorage.delete(key);
        totalDeleted++;
      }

      // 如果会话为空，删除会话
      if (sessionStorage.size === 0) {
        this.storage.delete(sessionId);
      }
    }

    if (totalDeleted > 0) {
      this.logger.debug(`Cleaned up ${totalDeleted} expired memory items`);
    }
  }

  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);
  }

  /**
   * 停止清理
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    sessions: number;
    totalItems: number;
    memoryUsage: string;
  } {
    let totalItems = 0;
    for (const sessionStorage of this.storage.values()) {
      totalItems += sessionStorage.size;
    }

    return {
      sessions: this.storage.size,
      totalItems,
      memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    };
  }

  // ============================================================================
  // IMemoryStore Interface (默认实现，不带 sessionId)
  // ============================================================================

  async get(key: string): Promise<unknown> {
    return this.getWithSession("default", key);
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    return this.setWithSession("default", key, value, ttl);
  }

  async delete(key: string): Promise<boolean> {
    return this.deleteWithSession("default", key);
  }

  async clear(): Promise<void> {
    return this.clearSession("default");
  }
}
