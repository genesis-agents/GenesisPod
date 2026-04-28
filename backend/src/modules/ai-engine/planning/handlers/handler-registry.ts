/**
 * AI Engine - Workflow Handler Registry
 *
 * App 层在 onModuleInit 中向此 Registry 注册自定义 Handler，
 * Executor 在运行 "handler" 类型步骤时通过此 Registry 查找并执行。
 *
 * 与 ToolRegistry/SkillRegistry/AgentRegistry 对齐的注册模式。
 */

import { Injectable, Logger } from "@nestjs/common";
import type { WorkflowNodeHandler } from "./workflow-node-handler.interface";

@Injectable()
export class WorkflowHandlerRegistry {
  private readonly logger = new Logger(WorkflowHandlerRegistry.name);
  private readonly handlers = new Map<string, WorkflowNodeHandler>();

  /**
   * 注册一个 Handler
   * 如果 handlerId 已存在，覆盖并警告（code-based 优先于 skill-based）
   */
  register(handler: WorkflowNodeHandler): void {
    if (this.handlers.has(handler.handlerId)) {
      this.logger.warn(
        `Handler "${handler.handlerId}" already registered, overwriting`,
      );
    }
    this.handlers.set(handler.handlerId, handler);
    this.logger.log(`Registered handler: ${handler.handlerId}`);
  }

  /**
   * 获取 Handler，不存在则返回 undefined
   */
  get(handlerId: string): WorkflowNodeHandler | undefined {
    return this.handlers.get(handlerId);
  }

  /**
   * 获取 Handler，不存在则抛异常
   */
  getOrThrow(handlerId: string): WorkflowNodeHandler {
    const handler = this.handlers.get(handlerId);
    if (!handler) {
      throw new Error(
        `Workflow handler "${handlerId}" not found. Registered: [${this.listIds().join(", ")}]`,
      );
    }
    return handler;
  }

  /**
   * 注销 Handler
   */
  unregister(handlerId: string): boolean {
    const deleted = this.handlers.delete(handlerId);
    if (deleted) {
      this.logger.log(`Unregistered handler: ${handlerId}`);
    }
    return deleted;
  }

  /**
   * 列出所有已注册的 Handler ID
   */
  listIds(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * 已注册的 Handler 数量
   */
  get size(): number {
    return this.handlers.size;
  }
}
