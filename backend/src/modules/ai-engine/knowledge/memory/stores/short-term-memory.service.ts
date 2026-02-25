/**
 * AI Engine - Short Term Memory Service
 * 短期记忆服务 - 会话级别的临时存储
 */

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LruMap } from "@/common/utils/lru-map";

/**
 * 内存条目
 */
interface MemoryItem {
  key: string;
  value: unknown;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 短期记忆服务
 * 基于 sessionId 隔离的临时存储
 */
@Injectable()
export class ShortTermMemoryService {
  private readonly sessions: LruMap<string, Map<string, MemoryItem>>;

  constructor(private readonly configService: ConfigService) {
    const capacity = this.configService.get<number>(
      "AI_ENGINE_STM_CAPACITY",
      1000,
    );
    this.sessions = new LruMap<string, Map<string, MemoryItem>>(capacity);
  }

  /**
   * 获取会话存储
   */
  private getSessionStore(sessionId: string): Map<string, MemoryItem> {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Map());
    }
    return this.sessions.get(sessionId)!;
  }

  /**
   * 检查是否过期
   */
  private isExpired(item: MemoryItem): boolean {
    if (!item.expiresAt) return false;
    return item.expiresAt < new Date();
  }

  /**
   * 根据 TTL 计算过期时间
   */
  private getExpiresAt(ttl?: number): Date | undefined {
    if (!ttl || ttl <= 0) return undefined;
    return new Date(Date.now() + ttl * 1000);
  }

  /**
   * 获取值（带会话隔离）
   */
  async getWithSession(sessionId: string, key: string): Promise<unknown> {
    const store = this.getSessionStore(sessionId);
    const item = store.get(key);

    if (!item) return undefined;

    if (this.isExpired(item)) {
      store.delete(key);
      return undefined;
    }

    return item.value;
  }

  /**
   * 设置值（带会话隔离）
   */
  async setWithSession(
    sessionId: string,
    key: string,
    value: unknown,
    ttl?: number,
  ): Promise<void> {
    const store = this.getSessionStore(sessionId);
    const now = new Date();

    store.set(key, {
      key,
      value,
      expiresAt: this.getExpiresAt(ttl),
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * 追加到数组（带会话隔离）
   */
  async appendWithSession(
    sessionId: string,
    key: string,
    value: unknown,
    ttl?: number,
  ): Promise<void> {
    const store = this.getSessionStore(sessionId);
    const existing = store.get(key);
    const now = new Date();

    let newValue: unknown[];

    if (!existing || this.isExpired(existing)) {
      newValue = [value];
    } else if (Array.isArray(existing.value)) {
      newValue = [...existing.value, value];
    } else {
      newValue = [existing.value, value];
    }

    store.set(key, {
      key,
      value: newValue,
      expiresAt: this.getExpiresAt(ttl),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
  }

  /**
   * 删除值（带会话隔离）
   */
  async deleteWithSession(sessionId: string, key: string): Promise<boolean> {
    const store = this.getSessionStore(sessionId);
    return store.delete(key);
  }

  /**
   * 清空会话
   */
  async clearSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  /**
   * 列出会话中的所有项
   */
  async listSession(
    sessionId: string,
  ): Promise<Array<{ key: string; value: unknown; expiresAt?: Date }>> {
    const store = this.getSessionStore(sessionId);
    const results: Array<{ key: string; value: unknown; expiresAt?: Date }> =
      [];

    for (const [key, item] of store.entries()) {
      if (!this.isExpired(item)) {
        results.push({
          key,
          value: item.value,
          expiresAt: item.expiresAt,
        });
      } else {
        // 清理过期项
        store.delete(key);
      }
    }

    return results;
  }

  /**
   * 获取所有会话 ID
   */
  getAllSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * 清理所有过期数据
   */
  cleanup(): number {
    let count = 0;
    const now = new Date();

    for (const [sessionId, store] of this.sessions.entries()) {
      for (const [key, item] of store.entries()) {
        if (item.expiresAt && item.expiresAt < now) {
          store.delete(key);
          count++;
        }
      }

      // 如果会话为空，删除会话
      if (store.size === 0) {
        this.sessions.delete(sessionId);
      }
    }

    return count;
  }
}
