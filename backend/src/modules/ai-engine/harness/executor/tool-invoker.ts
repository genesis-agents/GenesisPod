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

/**
 * Access matrix 违反：agent 声明的 forbiddenTools 包含被调用的 toolId，
 * 或 tools 白名单非空且不包含该 toolId。
 */
export class AgentAccessDeniedError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly toolId: string,
    public readonly reason: "forbidden" | "not_in_whitelist",
  ) {
    super(
      `[${agentId}] Access denied to tool "${toolId}" (${reason === "forbidden" ? "in forbiddenTools" : "not in tools whitelist"})`,
    );
    this.name = "AgentAccessDeniedError";
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
      /** v2 · access matrix 白名单（空 = 无限制） */
      allowedTools?: readonly string[];
      /** v2 · access matrix 黑名单（优先级高于白名单） */
      forbiddenTools?: readonly string[];
    },
  ): Promise<IActionResult> {
    const startMs = Date.now();

    // ★ v2 Access matrix 强校验
    if (options.forbiddenTools?.includes(action.toolId)) {
      const err = new AgentAccessDeniedError(
        options.agentId,
        action.toolId,
        "forbidden",
      );
      return {
        action,
        output: undefined,
        error: err,
        latencyMs: Date.now() - startMs,
      };
    }
    if (
      options.allowedTools &&
      options.allowedTools.length > 0 &&
      !options.allowedTools.includes(action.toolId)
    ) {
      const err = new AgentAccessDeniedError(
        options.agentId,
        action.toolId,
        "not_in_whitelist",
      );
      return {
        action,
        output: undefined,
        error: err,
        latencyMs: Date.now() - startMs,
      };
    }

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
