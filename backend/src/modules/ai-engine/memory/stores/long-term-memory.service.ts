/**
 * AI Engine - Long Term Memory Service
 * 长期记忆服务 - 持久化存储（基于用户隔离）
 */

import { Injectable } from "@nestjs/common";
import { v4 as uuid } from "uuid";

/**
 * 长期记忆条目
 */
interface LongTermMemoryEntry {
  id: string;
  key: string;
  value: unknown;
  userId: string;
  type?: string;
  importance?: number;
  tags?: string[];
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 搜索选项
 */
interface SearchOptions {
  userId?: string;
  limit?: number;
  threshold?: number;
  tags?: string[];
  type?: string;
}

/**
 * 列表选项
 */
interface ListOptions {
  userId?: string;
  offset?: number;
  limit?: number;
  sortBy?: "createdAt" | "updatedAt" | "importance";
  sortOrder?: "asc" | "desc";
  tags?: string[];
  type?: string;
}

/**
 * 设置选项
 */
interface SetOptions {
  ttl?: number;
  type?: string;
  importance?: number;
  tags?: string[];
}

/**
 * 长期记忆服务
 * 基于 userId 隔离的持久存储
 *
 * TODO: 当前为内存实现，生产环境应使用数据库
 */
@Injectable()
export class LongTermMemoryService {
  private readonly entries = new Map<string, LongTermMemoryEntry>();

  /**
   * 生成组合键
   */
  private getCompositeKey(userId: string, key: string): string {
    return `${userId}:${key}`;
  }

  /**
   * 检查是否过期
   */
  private isExpired(entry: LongTermMemoryEntry): boolean {
    if (!entry.expiresAt) return false;
    return entry.expiresAt < new Date();
  }

  /**
   * 根据 TTL 计算过期时间
   */
  private getExpiresAt(ttl?: number): Date | undefined {
    if (!ttl || ttl <= 0) return undefined;
    return new Date(Date.now() + ttl * 1000);
  }

  /**
   * 设置值（带用户隔离）
   */
  async setWithUser(
    userId: string,
    key: string,
    value: unknown,
    options?: SetOptions,
  ): Promise<void> {
    const compositeKey = this.getCompositeKey(userId, key);
    const now = new Date();
    const existing = this.entries.get(compositeKey);

    this.entries.set(compositeKey, {
      id: existing?.id || uuid(),
      key,
      value,
      userId,
      type: options?.type,
      importance: options?.importance ?? 5,
      tags: options?.tags,
      expiresAt: this.getExpiresAt(options?.ttl),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
  }

  /**
   * 获取值（带用户隔离）
   */
  async getWithUser(userId: string, key: string): Promise<unknown> {
    const compositeKey = this.getCompositeKey(userId, key);
    const entry = this.entries.get(compositeKey);

    if (!entry) return undefined;

    if (this.isExpired(entry)) {
      this.entries.delete(compositeKey);
      return undefined;
    }

    return {
      value: entry.value,
      type: entry.type,
      importance: entry.importance,
      tags: entry.tags,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  /**
   * 语义搜索
   * TODO: 实际应使用向量数据库进行语义搜索
   */
  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<
    Array<{ key: string; value: unknown; score: number; metadata: unknown }>
  > {
    const results: Array<{
      key: string;
      value: unknown;
      score: number;
      metadata: unknown;
    }> = [];
    const queryLower = query.toLowerCase();

    for (const entry of this.entries.values()) {
      // 用户过滤
      if (options?.userId && entry.userId !== options.userId) {
        continue;
      }

      // 过期检查
      if (this.isExpired(entry)) {
        continue;
      }

      // 类型过滤
      if (options?.type && entry.type !== options.type) {
        continue;
      }

      // 标签过滤
      if (options?.tags && options.tags.length > 0) {
        const hasMatchingTag = options.tags.some((tag) =>
          entry.tags?.includes(tag),
        );
        if (!hasMatchingTag) continue;
      }

      // 简单关键词匹配（模拟语义搜索）
      const valueStr = JSON.stringify(entry.value).toLowerCase();
      const keyLower = entry.key.toLowerCase();

      if (valueStr.includes(queryLower) || keyLower.includes(queryLower)) {
        // 计算简单相似度分数
        const score = this.calculateSimpleScore(
          queryLower,
          valueStr,
          keyLower,
          entry.importance,
        );

        if (!options?.threshold || score >= options.threshold) {
          results.push({
            key: entry.key,
            value: entry.value,
            score,
            metadata: {
              type: entry.type,
              importance: entry.importance,
              tags: entry.tags,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt,
            },
          });
        }
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);

    // 限制数量
    if (options?.limit) {
      return results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * 计算简单相似度分数
   */
  private calculateSimpleScore(
    query: string,
    valueStr: string,
    key: string,
    importance?: number,
  ): number {
    let score = 0;

    // 完全匹配得高分
    if (key === query) {
      score += 1.0;
    } else if (key.includes(query)) {
      score += 0.5;
    }

    if (valueStr.includes(query)) {
      score += 0.3;
    }

    // 重要性加权
    if (importance) {
      score *= 1 + (importance / 10) * 0.5;
    }

    return Math.min(score, 1);
  }

  /**
   * 删除值（带用户隔离）
   */
  async deleteWithUser(userId: string, key: string): Promise<boolean> {
    const compositeKey = this.getCompositeKey(userId, key);
    return this.entries.delete(compositeKey);
  }

  /**
   * 列出记忆
   */
  async list(options?: ListOptions): Promise<
    Array<{
      key: string;
      value: unknown;
      type?: string;
      importance?: number;
      tags?: string[];
    }>
  > {
    let results = Array.from(this.entries.values()).filter(
      (entry) => !this.isExpired(entry),
    );

    // 用户过滤
    if (options?.userId) {
      results = results.filter((entry) => entry.userId === options.userId);
    }

    // 类型过滤
    if (options?.type) {
      results = results.filter((entry) => entry.type === options.type);
    }

    // 标签过滤
    if (options?.tags && options.tags.length > 0) {
      results = results.filter((entry) =>
        options.tags!.some((tag) => entry.tags?.includes(tag)),
      );
    }

    // 排序
    const sortBy = options?.sortBy || "updatedAt";
    const sortOrder = options?.sortOrder || "desc";

    results.sort((a, b) => {
      let aVal: number;
      let bVal: number;

      if (sortBy === "importance") {
        aVal = a.importance || 0;
        bVal = b.importance || 0;
      } else if (sortBy === "createdAt") {
        aVal = a.createdAt.getTime();
        bVal = b.createdAt.getTime();
      } else {
        aVal = a.updatedAt.getTime();
        bVal = b.updatedAt.getTime();
      }

      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });

    // 分页
    if (options?.offset) {
      results = results.slice(options.offset);
    }

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results.map((entry) => ({
      key: entry.key,
      value: entry.value,
      type: entry.type,
      importance: entry.importance,
      tags: entry.tags,
    }));
  }

  /**
   * 更新元数据
   */
  async updateMetadata(
    key: string,
    metadata: { importance?: number; tags?: string[] },
    userId?: string,
  ): Promise<boolean> {
    // 如果提供了 userId，使用组合键
    if (userId) {
      const compositeKey = this.getCompositeKey(userId, key);
      const entry = this.entries.get(compositeKey);

      if (!entry || this.isExpired(entry)) {
        return false;
      }

      if (metadata.importance !== undefined) {
        entry.importance = metadata.importance;
      }

      if (metadata.tags !== undefined) {
        entry.tags = metadata.tags;
      }

      entry.updatedAt = new Date();
      return true;
    }

    // 否则搜索所有匹配的键
    let found = false;
    for (const entry of this.entries.values()) {
      if (entry.key === key && !this.isExpired(entry)) {
        if (metadata.importance !== undefined) {
          entry.importance = metadata.importance;
        }

        if (metadata.tags !== undefined) {
          entry.tags = metadata.tags;
        }

        entry.updatedAt = new Date();
        found = true;
      }
    }

    return found;
  }

  /**
   * 清理过期数据
   */
  cleanup(): number {
    let count = 0;
    const now = new Date();

    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.entries.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * 获取统计信息
   */
  getStats(): { totalEntries: number; userCount: number } {
    const users = new Set<string>();

    for (const entry of this.entries.values()) {
      users.add(entry.userId);
    }

    return {
      totalEntries: this.entries.size,
      userCount: users.size,
    };
  }
}
