/**
 * Long Term Memory Service
 * 长期记忆服务 - 持久化存储和语义搜索
 *
 * 特点:
 * - 使用 PostgreSQL 持久化存储
 * - 支持向量化存储和语义搜索（未来可扩展）
 * - 支持 userId 隔离
 * - 支持 importance 排序
 * - 适用于知识库、用户偏好、历史记录等
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  ILongTermMemoryStore,
  MemoryItem,
  MemoryMetadata,
  MemorySearchResult,
  SearchOptions,
  ListOptions,
} from "./memory.interface";

/**
 * 数据库存储结构
 * 注意：此处使用通用 JSON 存储，实际生产环境可能需要专门的表结构
 */
interface DatabaseMemoryRecord {
  id: string;
  userId: string;
  key: string;
  value: unknown; // JSON
  type?: string;
  importance?: number;
  tags?: string[];
  embedding?: number[]; // 向量（未来扩展）
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * 长期记忆服务
 * 使用数据库实现，支持持久化和高级查询
 */
@Injectable()
export class LongTermMemoryService implements ILongTermMemoryStore {
  private readonly logger = new Logger(LongTermMemoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取记忆（带 userId）
   */
  async getWithUser(userId: string, key: string): Promise<unknown> {
    try {
      // 注意：这是模拟实现，实际需要根据 Prisma schema 调整
      const record = await this.findRecord(userId, key);

      if (!record) {
        return undefined;
      }

      // 检查是否过期
      if (record.expiresAt && new Date() > record.expiresAt) {
        await this.deleteWithUser(userId, key);
        this.logger.debug(`Memory expired: userId=${userId}, key=${key}`);
        return undefined;
      }

      return record.value;
    } catch (error) {
      this.logger.error(
        `Failed to get memory: userId=${userId}, key=${key}`,
        error,
      );
      return undefined;
    }
  }

  /**
   * 设置记忆（带 userId）
   */
  async setWithUser(
    userId: string,
    key: string,
    value: unknown,
    options?: {
      ttl?: number;
      type?: string;
      importance?: number;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = options?.ttl
        ? new Date(now.getTime() + options.ttl * 1000)
        : undefined;

      // 注意：这是模拟实现，实际需要根据 Prisma schema 调整
      await this.upsertRecord({
        userId,
        key,
        value,
        type: options?.type,
        importance: options?.importance ?? 5, // 默认中等重要性
        tags: options?.tags,
        expiresAt,
        metadata: options?.metadata,
        createdAt: now,
        updatedAt: now,
      });

      this.logger.debug(
        `Memory set: userId=${userId}, key=${key}, type=${options?.type}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to set memory: userId=${userId}, key=${key}`,
        error,
      );
      throw error;
    }
  }

  /**
   * 删除记忆（带 userId）
   */
  async deleteWithUser(userId: string, key: string): Promise<boolean> {
    try {
      const deleted = await this.deleteRecord(userId, key);

      if (deleted) {
        this.logger.debug(`Memory deleted: userId=${userId}, key=${key}`);
      }

      return deleted;
    } catch (error) {
      this.logger.error(
        `Failed to delete memory: userId=${userId}, key=${key}`,
        error,
      );
      return false;
    }
  }

  /**
   * 清空用户记忆
   */
  async clearUser(userId: string): Promise<void> {
    try {
      await this.deleteUserRecords(userId);
      this.logger.debug(`User memory cleared: userId=${userId}`);
    } catch (error) {
      this.logger.error(`Failed to clear user memory: userId=${userId}`, error);
      throw error;
    }
  }

  /**
   * 搜索记忆
   * 注意：当前实现为简单的文本匹配，未来可扩展为向量语义搜索
   */
  async search(
    query: string,
    options?: SearchOptions & { userId?: string },
  ): Promise<MemorySearchResult[]> {
    try {
      const userId = options?.userId ?? "default";
      const limit = options?.limit ?? 10;

      // 注意：这是简化实现，实际应使用向量搜索
      const records = await this.searchRecords(userId, query, {
        limit,
        tags: options?.tags,
        type: options?.type,
      });

      return records.map((record) => ({
        key: record.key,
        value: record.value,
        metadata: {
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          expiresAt: record.expiresAt,
          importance: record.importance,
          tags: record.tags,
          custom: record.metadata,
        },
        score: 0.8, // 简化实现，固定分数
      }));
    } catch (error) {
      this.logger.error(`Failed to search memory: query=${query}`, error);
      return [];
    }
  }

  /**
   * 获取记忆列表
   */
  async list(
    options?: ListOptions & { userId?: string },
  ): Promise<MemoryItem[]> {
    try {
      const userId = options?.userId ?? "default";

      const records = await this.listRecords(userId, {
        offset: options?.offset ?? 0,
        limit: options?.limit ?? 50,
        sortBy: options?.sortBy ?? "updatedAt",
        sortOrder: options?.sortOrder ?? "desc",
        tags: options?.tags,
        type: options?.type,
      });

      return records.map((record) => ({
        key: record.key,
        value: record.value,
        metadata: {
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          expiresAt: record.expiresAt,
          importance: record.importance,
          tags: record.tags,
          custom: record.metadata,
        },
      }));
    } catch (error) {
      this.logger.error(`Failed to list memory`, error);
      return [];
    }
  }

  /**
   * 更新记忆元数据
   */
  async updateMetadata(
    key: string,
    metadata: Partial<MemoryMetadata>,
    userId?: string,
  ): Promise<void> {
    try {
      const effectiveUserId = userId ?? "default";

      await this.updateRecordMetadata(effectiveUserId, key, {
        importance: metadata.importance,
        tags: metadata.tags,
        expiresAt: metadata.expiresAt,
        metadata: metadata.custom,
      });

      this.logger.debug(
        `Memory metadata updated: userId=${effectiveUserId}, key=${key}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update memory metadata: userId=${userId}, key=${key}`,
        error,
      );
      throw error;
    }
  }

  // ============================================================================
  // 数据库操作（模拟实现）
  // 注意：以下方法需要根据实际的 Prisma schema 调整
  // ============================================================================

  private async findRecord(
    userId: string,
    key: string,
  ): Promise<DatabaseMemoryRecord | null> {
    // 使用通用 JSON 存储表的模拟查询
    // 实际实现需要创建专门的 agent_memories 表
    const result = await this.prisma.$queryRaw<DatabaseMemoryRecord[]>`
      SELECT * FROM agent_memories
      WHERE user_id = ${userId} AND key = ${key}
      LIMIT 1
    `.catch(() => []);

    return result[0] ?? null;
  }

  private async upsertRecord(
    record: Partial<DatabaseMemoryRecord> & { userId: string; key: string },
  ): Promise<void> {
    // 模拟 upsert 操作
    await this.prisma.$executeRaw`
      INSERT INTO agent_memories (
        user_id, key, value, type, importance, tags,
        expires_at, metadata, created_at, updated_at
      ) VALUES (
        ${record.userId}, ${record.key}, ${JSON.stringify(record.value)}::jsonb,
        ${record.type}, ${record.importance}, ${record.tags ?? []}::text[],
        ${record.expiresAt}, ${JSON.stringify(record.metadata ?? {})}::jsonb,
        ${record.createdAt}, ${record.updatedAt}
      )
      ON CONFLICT (user_id, key)
      DO UPDATE SET
        value = EXCLUDED.value,
        type = EXCLUDED.type,
        importance = EXCLUDED.importance,
        tags = EXCLUDED.tags,
        expires_at = EXCLUDED.expires_at,
        metadata = EXCLUDED.metadata,
        updated_at = EXCLUDED.updated_at
    `.catch((error) => {
      this.logger.warn("Memory upsert failed (table may not exist)", error.message);
      // 表可能不存在，这是正常的（开发阶段）
    });
  }

  private async deleteRecord(userId: string, key: string): Promise<boolean> {
    const result = await this.prisma.$executeRaw`
      DELETE FROM agent_memories
      WHERE user_id = ${userId} AND key = ${key}
    `.catch(() => 0);

    return result > 0;
  }

  private async deleteUserRecords(userId: string): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM agent_memories WHERE user_id = ${userId}
    `.catch(() => {});
  }

  private async searchRecords(
    userId: string,
    query: string,
    options: { limit: number; tags?: string[]; type?: string },
  ): Promise<DatabaseMemoryRecord[]> {
    // 简化的文本搜索实现
    const records = await this.prisma.$queryRaw<DatabaseMemoryRecord[]>`
      SELECT * FROM agent_memories
      WHERE user_id = ${userId}
        AND (
          key ILIKE ${"%" + query + "%"} OR
          value::text ILIKE ${"%" + query + "%"}
        )
        ${options.type ? this.prisma.$queryRaw`AND type = ${options.type}` : this.prisma.$queryRaw``}
      ORDER BY importance DESC, updated_at DESC
      LIMIT ${options.limit}
    `.catch(() => []);

    return records;
  }

  private async listRecords(
    userId: string,
    options: {
      offset: number;
      limit: number;
      sortBy: string;
      sortOrder: string;
      tags?: string[];
      type?: string;
    },
  ): Promise<DatabaseMemoryRecord[]> {
    const records = await this.prisma.$queryRaw<DatabaseMemoryRecord[]>`
      SELECT * FROM agent_memories
      WHERE user_id = ${userId}
        ${options.type ? this.prisma.$queryRaw`AND type = ${options.type}` : this.prisma.$queryRaw``}
      ORDER BY ${this.prisma.$queryRaw`${options.sortBy}`} ${this.prisma.$queryRaw`${options.sortOrder}`}
      LIMIT ${options.limit} OFFSET ${options.offset}
    `.catch(() => []);

    return records;
  }

  private async updateRecordMetadata(
    userId: string,
    key: string,
    metadata: {
      importance?: number;
      tags?: string[];
      expiresAt?: Date;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE agent_memories
      SET
        importance = COALESCE(${metadata.importance}, importance),
        tags = COALESCE(${metadata.tags ?? []}::text[], tags),
        expires_at = COALESCE(${metadata.expiresAt}, expires_at),
        metadata = COALESCE(${JSON.stringify(metadata.metadata ?? {})}::jsonb, metadata),
        updated_at = NOW()
      WHERE user_id = ${userId} AND key = ${key}
    `.catch(() => {});
  }

  // ============================================================================
  // IMemoryStore Interface (默认实现，不带 userId)
  // ============================================================================

  async get(key: string): Promise<unknown> {
    return this.getWithUser("default", key);
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    return this.setWithUser("default", key, value, { ttl });
  }

  async delete(key: string): Promise<boolean> {
    return this.deleteWithUser("default", key);
  }

  async clear(): Promise<void> {
    return this.clearUser("default");
  }
}
