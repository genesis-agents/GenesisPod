/**
 * MemoryBridge — Harness 与 MemoryCoordinator 之间的桥接层
 *
 * 职责：
 *   - preExecute()：recall 相关记忆，格式化为 system reminder 写入 envelope
 *   - postExecute()：把 agent output 持久化到 long-term memory
 *
 * 设计原则：桥接，不重写。所有实际存储由 MemoryCoordinatorService 承担。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import type {
  IContextEnvelope,
  IMemoryBinding,
  ISystemReminder,
} from "../abstractions";
import { ContextEnvelope } from "../core/context-envelope";
import { MemoryCoordinatorService } from "../../knowledge/memory/memory-coordinator.service";

export interface RecallOptions {
  query: string;
  /** 最多召回几条，默认 5 */
  limit?: number;
  /** 只查询指定层，默认全部 */
  layers?: Array<1 | 2 | 3 | 4>;
}

export interface StoreOptions {
  type: "conversation" | "working" | "preference" | "knowledge" | "summary";
  key: string;
  value: unknown;
  importance?: number;
  tags?: string[];
  ttl?: number;
}

@Injectable()
export class MemoryBridge {
  private readonly logger = new Logger(MemoryBridge.name);

  constructor(
    @Optional() private readonly coordinator?: MemoryCoordinatorService,
  ) {}

  /**
   * 在 Agent 执行前调用：召回相关记忆，返回注入后的新 envelope。
   */
  async preExecute(
    envelope: IContextEnvelope,
    options: RecallOptions,
  ): Promise<IContextEnvelope> {
    if (!this.coordinator || !envelope.memory.userId) {
      return envelope;
    }

    try {
      const context = await this.coordinator.recall(
        {
          query: options.query,
          limit: options.limit ?? 5,
          layers: options.layers,
        },
        envelope.memory.userId,
        envelope.memory.sessionId,
      );

      if (context.fragments.length === 0) {
        return envelope;
      }

      const content = this.formatRecalled(context.fragments);
      const reminder: ISystemReminder = {
        source: "memory-bridge",
        priority: "medium",
        content,
      };

      // Prefer using the concrete ContextEnvelope.withReminder if available
      if (envelope instanceof ContextEnvelope) {
        return envelope.withReminder(
          reminder.content,
          reminder.priority,
          reminder.source,
        ).envelope;
      }

      // Fallback: construct a new envelope preserving immutability
      return {
        ...envelope,
        reminders: [...envelope.reminders, reminder],
      };
    } catch (err) {
      this.logger.warn(
        `[preExecute] recall failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return envelope;
    }
  }

  /**
   * 在 Agent 执行后调用：把最终输出 fire-and-forget 存入 memory。
   * 失败不抛错，避免影响主流程。
   */
  async postExecute(
    memory: IMemoryBinding,
    options: StoreOptions,
  ): Promise<void> {
    if (!this.coordinator || !memory.userId) return;
    try {
      await this.coordinator.store(
        {
          type: options.type,
          key: options.key,
          value: options.value,
          importance: options.importance,
          tags: options.tags,
          ttl: options.ttl,
        },
        memory.userId,
        memory.sessionId,
      );
    } catch (err) {
      this.logger.warn(
        `[postExecute] store failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private formatRecalled(
    fragments: readonly {
      layer: 1 | 2 | 3 | 4;
      key: string;
      value: unknown;
      relevanceScore: number;
    }[],
  ): string {
    const lines: string[] = ["## Relevant memories recalled:"];
    for (const f of fragments) {
      const value =
        typeof f.value === "string" ? f.value : JSON.stringify(f.value);
      const snippet = value.length > 200 ? `${value.slice(0, 200)}…` : value;
      lines.push(
        `- [L${f.layer} · score=${f.relevanceScore.toFixed(2)}] ${f.key}: ${snippet}`,
      );
    }
    return lines.join("\n");
  }
}
