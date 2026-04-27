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

import { Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "crypto";
import type {
  IActionResult,
  IContextEnvelope,
  IParallelToolCallAction,
  IToolCallAction,
} from "../../kernel/abstractions";
import { ToolRegistry } from "../../../ai-engine/tools/registry/tool-registry";
import type { ToolContext } from "../../../ai-engine/tools/abstractions/tool.interface";
import { ToolCircuitBreaker } from "./tool-circuit-breaker";
import { AgentTracer } from "../../runtime/tracer/otel-tracer";

/**
 * PR-I 修复 #6：tool result 默认截断阈值（约 4K tokens for cl100k）
 * 大输出（DB 查询、API 列表）超此长度被压缩为 "<head>…<truncated>"。
 */
const DEFAULT_RESULT_MAX_CHARS = 16_000;

function truncateResult(
  value: unknown,
  maxChars: number,
): {
  output: unknown;
  truncated: boolean;
} {
  if (value == null) return { output: value, truncated: false };
  if (typeof value === "string") {
    if (value.length <= maxChars) return { output: value, truncated: false };
    return {
      output: `${value.slice(0, maxChars)}\n…[TRUNCATED ${value.length - maxChars} chars]`,
      truncated: true,
    };
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { output: value, truncated: false };
  }
  if (serialized.length <= maxChars) return { output: value, truncated: false };
  // 保头不保尾（agent 通常需要看到 schema/字段名而非末尾数据）
  return {
    output: `${serialized.slice(0, maxChars)}\n…[TRUNCATED ${serialized.length - maxChars} chars; original was ${typeof value}]`,
    truncated: true,
  };
}

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

  constructor(
    private readonly toolRegistry: ToolRegistry,
    @Optional() private readonly circuitBreaker?: ToolCircuitBreaker,
    @Optional() private readonly tracer?: AgentTracer,
  ) {}

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
      /** PR-I 修复 #6: tool result max chars; 0 = no truncation */
      maxResultChars?: number;
    },
  ): Promise<IActionResult> {
    const startMs = Date.now();

    // PR-I 修复 #6: circuit breaker 短路检查
    if (this.circuitBreaker && !this.circuitBreaker.allow(action.toolId)) {
      return {
        action,
        output: undefined,
        error: new Error(
          `Tool ${action.toolId} is open-circuited (too many recent failures); will retry after cool-down`,
        ),
        failureCode: "TOOL_RUNTIME_ERROR",
        diagnostic: {
          toolId: action.toolId,
          reason: "circuit_breaker_open",
        },
        latencyMs: Date.now() - startMs,
      };
    }

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
        failureCode: "TOOL_INPUT_VALIDATION_FAILED",
        diagnostic: {
          toolId: action.toolId,
          reason: "forbidden_by_access_matrix",
        },
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
        failureCode: "TOOL_INPUT_VALIDATION_FAILED",
        diagnostic: {
          toolId: action.toolId,
          reason: "not_in_whitelist",
        },
        latencyMs: Date.now() - startMs,
      };
    }

    if (!this.toolRegistry.has(action.toolId)) {
      const err = new ToolNotFoundError(action.toolId);
      return {
        action,
        output: undefined,
        error: err,
        failureCode: "TOOL_NOT_FOUND",
        diagnostic: { toolId: action.toolId },
        latencyMs: Date.now() - startMs,
      };
    }

    const tool = this.toolRegistry.get(action.toolId);
    const toolContext: ToolContext = {
      // PR-I 修复 #6: 优先使用 LLM 给的 callId 做 trace 关联，缺省时随机
      executionId: action.callId ?? randomUUID(),
      toolId: action.toolId,
      sessionId: envelope.memory.sessionId,
      userId: envelope.memory.userId,
      callerId: options.agentId,
      callerType: "agent",
      signal: options.signal,
      timeout: options.timeoutMs,
      createdAt: new Date(),
    };

    const maxChars = options.maxResultChars ?? DEFAULT_RESULT_MAX_CHARS;
    // PR-I 修复 #8: tool tracing —— ToolInvoker 自己 emit span，
    // 让 observability 链路把每个 tool 调用都记到 trace 里
    const span = this.tracer?.startSpan(`tool.${action.toolId}`, {
      attributes: {
        agentId: options.agentId,
        toolId: action.toolId,
        callId: action.callId,
      },
    });

    try {
      const result = await tool.execute(action.input, toolContext);

      if (!result.success) {
        // PR-I: 失败上报到 circuit breaker
        this.circuitBreaker?.recordFailure(action.toolId);
        const errMsg = result.error?.message ?? `Tool ${action.toolId} failed`;
        const err = new Error(errMsg);
        this.logger.warn(`Tool ${action.toolId} failed: ${errMsg}`);
        // ★ failureCode 推断
        let failureCode = "TOOL_RUNTIME_ERROR";
        if (/timeout|timed out/i.test(errMsg)) failureCode = "TOOL_TIMEOUT";
        else if (/invalid input|validation/i.test(errMsg))
          failureCode = "TOOL_INPUT_VALIDATION_FAILED";
        span?.recordException(err);
        span?.end({ success: false });
        return {
          action,
          output: result.data,
          error: err,
          failureCode,
          diagnostic: {
            toolId: action.toolId,
            toolError: errMsg,
            input: action.input,
          },
          latencyMs: Date.now() - startMs,
        };
      }

      // PR-I 修复 #6: result truncation（保护 envelope 不爆）
      const { output: maybeTruncated, truncated } =
        maxChars > 0
          ? truncateResult(result.data, maxChars)
          : { output: result.data, truncated: false };
      if (truncated) {
        this.logger.warn(
          `Tool ${action.toolId} output truncated to ${maxChars} chars`,
        );
      }

      // PR-I: 成功重置 breaker
      this.circuitBreaker?.recordSuccess(action.toolId);
      span?.end({ success: true, truncated });

      return {
        action,
        output: maybeTruncated,
        latencyMs: Date.now() - startMs,
      };
    } catch (error) {
      this.circuitBreaker?.recordFailure(action.toolId);
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Tool ${action.toolId} threw: ${err.message}`);
      // ★ failureCode 推断 (timeout / abort / 默认 runtime)
      let failureCode = "TOOL_RUNTIME_ERROR";
      if (/timeout|timed out/i.test(err.message)) failureCode = "TOOL_TIMEOUT";
      span?.recordException(err);
      span?.end({ success: false });
      return {
        action,
        output: undefined,
        error: err,
        failureCode,
        diagnostic: {
          toolId: action.toolId,
          toolError: err.message,
          input: action.input,
          stack: err.stack,
        },
        latencyMs: Date.now() - startMs,
      };
    }
  }

  /**
   * 并行执行多个 tool_call。
   *
   * 语义：
   * - 用 Promise.allSettled 保证单个失败不影响其它
   * - concurrency 上限按批切片（默认 5）
   * - 返回聚合 IActionResult：output 是数组，subResults 含每个 call 的详细结果
   * - latencyMs 是整批的 wall time（不是 sum）
   * - error 仅在「全部失败」时设置；部分失败时由调用方按 subResults 判断
   */
  async invokeMany(
    parallel: IParallelToolCallAction,
    envelope: IContextEnvelope,
    options: {
      agentId: string;
      signal?: AbortSignal;
      timeoutMs?: number;
      allowedTools?: readonly string[];
      forbiddenTools?: readonly string[];
    },
  ): Promise<IActionResult> {
    const startMs = Date.now();
    const concurrency = parallel.maxConcurrency ?? 5;
    const calls = [...parallel.calls];
    const results: IActionResult[] = [];

    for (let i = 0; i < calls.length; i += concurrency) {
      if (options.signal?.aborted) break;
      const batch = calls.slice(i, i + concurrency);
      const settled = await Promise.allSettled(
        batch.map((call) => this.invoke(call, envelope, options)),
      );
      for (let j = 0; j < settled.length; j += 1) {
        const s = settled[j];
        if (s.status === "fulfilled") {
          results.push(s.value);
        } else {
          // Promise.allSettled rarely rejects (invoke catches), but be defensive
          const err =
            s.reason instanceof Error ? s.reason : new Error(String(s.reason));
          results.push({
            action: batch[j],
            output: undefined,
            error: err,
            latencyMs: 0,
          });
        }
      }
    }

    const allFailed = results.length > 0 && results.every((r) => r.error);
    const aggregateOutput = results.map((r) =>
      r.error ? { error: r.error.message } : { output: r.output },
    );

    return {
      action: parallel,
      output: aggregateOutput,
      error: allFailed
        ? new Error(`all ${results.length} parallel tool calls failed`)
        : undefined,
      latencyMs: Date.now() - startMs,
      subResults: results,
    };
  }
}
