/**
 * ToolInvoker — 把 IToolCallAction 翻译成 ToolRegistry 调用
 *
 * 职责：
 *   - 校验 toolId 存在于 registry
 *   - 构造 ToolContext（sessionId / userId / signal / timeout 从 envelope 继承）
 *   - 执行 tool.execute(input, ctx)
 *   - 把 ToolResult 规范化为 IActionResult
 *
 * 不做：
 *   - Guardrails（由 PreToolUse hook 做）
 *   - 预算扣除（由 loop 做）
 *   - 重试（由 loop / circuit breaker 做）
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import type {
  IActionResult,
  IContextEnvelope,
  IToolCallAction,
} from "../abstractions";
import { ToolRegistry } from "../../tools/registry/tool-registry";
import type { ToolContext } from "../../tools/abstractions/tool.interface";

export class ToolNotFoundError extends Error {
  constructor(toolId: string) {
    super(`Tool not found in registry: ${toolId}`);
    this.name = "ToolNotFoundError";
  }
}

@Injectable()
export class ToolInvoker {
  private readonly logger = new Logger(ToolInvoker.name);

  constructor(private readonly toolRegistry: ToolRegistry) {}

  async invoke(
    action: IToolCallAction,
    envelope: IContextEnvelope,
    options: {
      agentId: string;
      signal?: AbortSignal;
      timeoutMs?: number;
    },
  ): Promise<IActionResult> {
    const startMs = Date.now();

    if (!this.toolRegistry.has(action.toolId)) {
      const err = new ToolNotFoundError(action.toolId);
      return {
        action,
        output: undefined,
        error: err,
        latencyMs: Date.now() - startMs,
      };
    }

    const tool = this.toolRegistry.get(action.toolId);
    const toolContext: ToolContext = {
      executionId: randomUUID(),
      toolId: action.toolId,
      sessionId: envelope.memory.sessionId,
      userId: envelope.memory.userId,
      callerId: options.agentId,
      callerType: "agent",
      signal: options.signal,
      timeout: options.timeoutMs,
      createdAt: new Date(),
    };

    try {
      const result = await tool.execute(action.input, toolContext);

      if (!result.success) {
        const err = new Error(
          result.error?.message ?? `Tool ${action.toolId} failed`,
        );
        this.logger.warn(
          `Tool ${action.toolId} failed: ${result.error?.message ?? "unknown"}`,
        );
        return {
          action,
          output: result.data,
          error: err,
          latencyMs: Date.now() - startMs,
        };
      }

      return {
        action,
        output: result.data,
        latencyMs: Date.now() - startMs,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Tool ${action.toolId} threw: ${err.message}`);
      return {
        action,
        output: undefined,
        error: err,
        latencyMs: Date.now() - startMs,
      };
    }
  }
}
