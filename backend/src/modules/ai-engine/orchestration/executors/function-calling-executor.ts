/**
 * AI Engine - Function Calling Executor
 * 执行引擎 - 让 LLM 自主选择和调用工具
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { ToolRegistry } from "../../tools/registry";
import {
  ToolContext,
  ToolResult,
  FunctionDefinition,
} from "../../tools/abstractions/tool.interface";
import { ToolId } from "../../core/types/agent.types";
import { RetryStrategy } from "./retry-strategy";
import {
  AICapabilityResolver,
  AICapabilityContext,
} from "../../capabilities/ai-capability-resolver.service";
import { MCPManager } from "../../mcp/manager/mcp-manager";

// ============================================================================
// Types
// ============================================================================

/**
 * LLM 消息格式
 */
export interface LLMMessage {
  role: "system" | "user" | "assistant" | "function" | "tool";
  content: string | null;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

/**
 * LLM 请求选项
 */
export interface LLMRequestOptions {
  messages: LLMMessage[];
  functions?: FunctionDefinition[];
  tools?: Array<{
    type: "function";
    function: FunctionDefinition;
  }>;
  function_call?: "auto" | "none" | { name: string };
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | { type: "function"; function: { name: string } };
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** ★ TaskProfile for semantic parameter mapping */
  taskProfile?: import("../../llm/types").TaskProfile;
}

/**
 * LLM 响应格式
 */
export interface LLMResponse {
  content: string | null;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
  finishReason?: "stop" | "function_call" | "tool_calls" | "length";
}

/**
 * 工具调用请求
 */
export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: string;
}

/**
 * LLM 适配器接口
 */
export interface ILLMAdapter {
  readonly provider: string;
  formatTools(functions: FunctionDefinition[]): unknown;
  parseToolCalls(response: LLMResponse): ToolCallRequest[];
  buildToolResultMessage(
    toolCallId: string,
    toolName: string,
    result: unknown,
  ): LLMMessage;
  chat(options: LLMRequestOptions): Promise<LLMResponse>;
}

/**
 * 执行配置
 */
export interface ExecutionConfig {
  maxIterations: number;
  maxToolCalls: number;
  parallelToolCalls: boolean;
  enableRetry: boolean;
  temperature: number;
  maxTokens: number;
  /** ★ TaskProfile for semantic parameter mapping */
  taskProfile?: import("../../llm/types").TaskProfile;
}

/**
 * 执行统计
 */
export interface ExecutionMetrics {
  iterations: number;
  toolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  totalDuration: number;
  toolCallDetails: Array<{
    tool: string;
    duration: number;
    success: boolean;
    retries?: number;
  }>;
}

/**
 * Agent 事件类型
 */
export type AgentEvent =
  | { type: "tool_call"; tool: string; input: unknown }
  | { type: "tool_result"; tool: string; output: unknown; duration: number }
  | {
      type: "complete";
      result: {
        success: boolean;
        artifacts: unknown[];
        summary: string;
        tokensUsed: number;
        duration: number;
      };
    }
  | { type: "error"; error: string };

// ============================================================================
// Function Calling Executor
// ============================================================================

/**
 * Function Calling 执行器
 * ReAct 模式实现：Reasoning + Acting 循环
 */
@Injectable()
export class FunctionCallingExecutor {
  private readonly logger = new Logger(FunctionCallingExecutor.name);
  private readonly retryStrategy: RetryStrategy;

  static readonly DEFAULT_CONFIG: ExecutionConfig = {
    maxIterations: 10,
    maxToolCalls: 20,
    parallelToolCalls: false,
    enableRetry: true,
    temperature: 0.7,
    maxTokens: 4096,
    taskProfile: {
      creativity: "medium",
      outputLength: "medium",
    },
  };

  constructor(
    private readonly toolRegistry: ToolRegistry,
    @Optional() private readonly capabilityResolver?: AICapabilityResolver,
    @Optional() private readonly mcpManager?: MCPManager,
  ) {
    this.retryStrategy = new RetryStrategy();
  }

  /**
   * 执行 Function Calling 循环
   */
  async *execute(
    llmAdapter: ILLMAdapter,
    systemPrompt: string,
    userPrompt: string,
    tools: ToolId[],
    context: ToolContext,
    config?: Partial<ExecutionConfig>,
  ): AsyncGenerator<AgentEvent> {
    const cfg: ExecutionConfig = {
      ...FunctionCallingExecutor.DEFAULT_CONFIG,
      ...config,
    };
    const startTime = Date.now();

    const metrics: ExecutionMetrics = {
      iterations: 0,
      toolCalls: 0,
      successfulToolCalls: 0,
      failedToolCalls: 0,
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      totalDuration: 0,
      toolCallDetails: [],
    };

    const functionDefinitions = this.getFunctionDefinitions(tools);

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    this.logger.log(
      `[execute] Starting with ${functionDefinitions.length} tools`,
    );

    while (
      metrics.iterations < cfg.maxIterations &&
      metrics.toolCalls < cfg.maxToolCalls
    ) {
      metrics.iterations++;

      this.logger.log(`[execute] Iteration ${metrics.iterations}`);

      let response: LLMResponse;
      try {
        response = await llmAdapter.chat({
          messages,
          functions: functionDefinitions,
          temperature: cfg.temperature,
          maxTokens: cfg.maxTokens,
          tool_choice: "auto",
        });
      } catch (error) {
        this.logger.error(`[execute] LLM call failed: ${error}`);
        yield {
          type: "error",
          error: error instanceof Error ? error.message : "LLM call failed",
        };
        break;
      }

      if (response.usage) {
        metrics.tokensUsed.prompt += response.usage.promptTokens;
        metrics.tokensUsed.completion += response.usage.completionTokens;
        metrics.tokensUsed.total += response.usage.totalTokens;
      }

      const toolCalls = llmAdapter.parseToolCalls(response);

      if (toolCalls.length === 0) {
        this.logger.log("[execute] No tool calls, task completed");

        metrics.totalDuration = Date.now() - startTime;

        yield {
          type: "complete",
          result: {
            success: true,
            artifacts: [],
            summary: response.content || "",
            tokensUsed: metrics.tokensUsed.total,
            duration: metrics.totalDuration,
          },
        };

        return;
      }

      messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      });

      this.logger.log(`[execute] Executing ${toolCalls.length} tool calls`);

      for (const toolCall of toolCalls) {
        metrics.toolCalls++;

        const toolId = toolCall.name;
        let input: unknown;

        try {
          input = JSON.parse(toolCall.arguments);
        } catch {
          input = toolCall.arguments;
        }

        yield {
          type: "tool_call",
          tool: toolId,
          input,
        };

        const toolResult = await this.executeTool(
          toolId,
          input,
          context,
          cfg.enableRetry,
        );

        metrics.toolCallDetails.push({
          tool: toolId,
          duration: toolResult.metadata?.duration || 0,
          success: toolResult.success,
        });

        if (toolResult.success) {
          metrics.successfulToolCalls++;
        } else {
          metrics.failedToolCalls++;
        }

        yield {
          type: "tool_result",
          tool: toolId,
          output: toolResult.data,
          duration: toolResult.metadata?.duration || 0,
        };

        const toolResultMessage = llmAdapter.buildToolResultMessage(
          toolCall.id,
          toolCall.name,
          toolResult.success ? toolResult.data : { error: toolResult.error },
        );
        messages.push(toolResultMessage);
      }
    }

    if (metrics.iterations >= cfg.maxIterations) {
      this.logger.warn("[execute] Max iterations reached");
      yield {
        type: "error",
        error: "Max iterations reached, task may be incomplete",
      };
    }

    if (metrics.toolCalls >= cfg.maxToolCalls) {
      this.logger.warn("[execute] Max tool calls reached");
      yield {
        type: "error",
        error: "Max tool calls reached, task may be incomplete",
      };
    }

    metrics.totalDuration = Date.now() - startTime;

    yield {
      type: "complete",
      result: {
        success: true,
        artifacts: [],
        summary: "Task execution completed",
        tokensUsed: metrics.tokensUsed.total,
        duration: metrics.totalDuration,
      },
    };
  }

  /**
   * 执行单个工具
   * A3 Fix: 支持 MCP 工具（工具名以 mcp_ 开头）
   */
  private async executeTool(
    toolId: string,
    input: unknown,
    context: ToolContext,
    enableRetry: boolean,
  ): Promise<ToolResult> {
    const startTime = Date.now();

    // A3 Fix: 检查是否为 MCP 工具（格式: mcp_{serverId}_{toolName}）
    if (toolId.startsWith("mcp_") && this.mcpManager) {
      return this.executeMCPTool(toolId, input, context, startTime);
    }

    if (!this.toolRegistry.has(toolId)) {
      this.logger.warn(`[executeTool] Tool not found: ${toolId}`);
      return {
        success: false,
        error: { message: `Tool not found: ${toolId}`, code: "NOT_FOUND" },
        metadata: {
          executionId: context.executionId,
          startTime: new Date(startTime),
          endTime: new Date(),
          duration: Date.now() - startTime,
        },
      };
    }

    const tool = this.toolRegistry.get(toolId);

    if (enableRetry) {
      const result = await this.retryStrategy.executeWithRetry(
        () => tool.execute(input, context),
        toolId,
        `Tool:${toolId}`,
      );

      if (result.success && result.data) {
        return result.data;
      }

      return {
        success: false,
        error: {
          message: result.error?.message || "Tool execution failed",
          code: "EXECUTION_FAILED",
        },
        metadata: {
          executionId: context.executionId,
          startTime: new Date(startTime),
          endTime: new Date(),
          duration: result.totalDuration,
          extra: { attempts: result.attempts },
        },
      };
    }

    return tool.execute(input, context);
  }

  /**
   * A3 Fix: 执行 MCP 工具
   */
  private async executeMCPTool(
    toolId: string,
    input: unknown,
    context: ToolContext,
    startTime: number,
  ): Promise<ToolResult> {
    // 解析 MCP 工具名（格式: mcp_{serverId}_{toolName}）
    const parts = toolId.split("_");
    if (parts.length < 3) {
      return {
        success: false,
        error: {
          message: `Invalid MCP tool ID format: ${toolId}`,
          code: "INVALID_FORMAT",
        },
        metadata: {
          executionId: context.executionId,
          startTime: new Date(startTime),
          endTime: new Date(),
          duration: Date.now() - startTime,
        },
      };
    }

    const serverId = parts[1];
    const toolName = parts.slice(2).join("_"); // 工具名可能包含下划线

    try {
      const result = await this.mcpManager!.callTool(
        serverId,
        toolName,
        input as Record<string, unknown>,
      );

      // 转换 MCP 结果为 ToolResult 格式
      const content = result.content
        .map((c) => c.text || c.data || "")
        .join("\n");

      return {
        success: !result.isError,
        data: result.isError ? undefined : content,
        error: result.isError
          ? {
              message: content || "MCP tool execution failed",
              code: "MCP_ERROR",
            }
          : undefined,
        metadata: {
          executionId: context.executionId,
          startTime: new Date(startTime),
          endTime: new Date(),
          duration: Date.now() - startTime,
          extra: { serverId, toolName, mcpTool: true },
        },
      };
    } catch (error) {
      this.logger.error(
        `[executeMCPTool] Failed to execute ${serverId}:${toolName}: ${(error as Error).message}`,
      );
      return {
        success: false,
        error: {
          message: (error as Error).message || "MCP tool execution failed",
          code: "MCP_EXECUTION_FAILED",
        },
        metadata: {
          executionId: context.executionId,
          startTime: new Date(startTime),
          endTime: new Date(),
          duration: Date.now() - startTime,
          extra: { serverId, toolName, mcpTool: true },
        },
      };
    }
  }

  /**
   * 获取工具的 Function 定义
   */
  private getFunctionDefinitions(tools: ToolId[]): FunctionDefinition[] {
    const definitions: FunctionDefinition[] = [];

    for (const toolId of tools) {
      if (this.toolRegistry.has(toolId)) {
        const tool = this.toolRegistry.get(toolId);
        definitions.push(tool.toFunctionDefinition());
      } else {
        this.logger.warn(
          `[getFunctionDefinitions] Tool not registered: ${toolId}`,
        );
      }
    }

    return definitions;
  }

  /**
   * 获取所有已注册工具的 Function 定义
   */
  getAllFunctionDefinitions(): FunctionDefinition[] {
    const tools = this.toolRegistry.getAll();
    return tools.map((tool) => tool.toFunctionDefinition());
  }

  /**
   * ★ NEW: 执行 Function Calling with AICapabilityContext
   *
   * 使用 AICapabilityResolver 来解析可用的工具，自动处理权限和配置
   * A3 Fix: 现在包含 MCP 工具
   */
  async *executeWithContext(
    llmAdapter: ILLMAdapter,
    systemPrompt: string,
    userPrompt: string,
    context: AICapabilityContext,
    config?: Partial<ExecutionConfig>,
  ): AsyncGenerator<AgentEvent> {
    if (!this.capabilityResolver) {
      this.logger.warn(
        "[executeWithContext] AICapabilityResolver not available, using empty tool list",
      );
      yield {
        type: "error",
        error: "AICapabilityResolver not available",
      };
      return;
    }

    // A3 Fix: 获取包含 MCP 工具的完整 Function Definitions
    const functionDefinitions =
      await this.capabilityResolver.getToolFunctionDefinitions(context);

    this.logger.log(
      `[executeWithContext] Resolved ${functionDefinitions.length} tools (including MCP) for context`,
    );

    // 2. 构建 ToolContext
    const toolContext: ToolContext = {
      executionId: context.agentId || `exec-${Date.now()}`,
      toolId: "function-calling",
      userId: context.userId,
      createdAt: new Date(),
    };

    // 3. A3 Fix: 执行 Function Calling（使用 function definitions 直接）
    let successfulCalls = 0;
    let failedCalls = 0;

    for await (const event of this.executeWithDefinitions(
      llmAdapter,
      systemPrompt,
      userPrompt,
      functionDefinitions,
      toolContext,
      config,
    )) {
      // 4. 记录工具调用日志
      if (event.type === "tool_result") {
        const success = event.output !== undefined && event.output !== null;

        if (success) {
          successfulCalls++;
        } else {
          failedCalls++;
        }

        // 记录到 AIUsageLog（fire-and-forget 模式，不阻塞主流程）
        if (this.capabilityResolver) {
          this.capabilityResolver
            .logCapabilityUsage({
              capabilityType: "tool",
              capabilityId: event.tool,
              agentId: context.agentId,
              teamId: context.teamId,
              userId: context.userId,
              success,
              duration: event.duration,
            })
            .catch((err) => {
              this.logger.warn(
                `Failed to log tool usage: ${err instanceof Error ? err.message : String(err)}`,
              );
            });
        }
      }

      yield event;
    }

    this.logger.log(
      `[executeWithContext] Completed with ${successfulCalls} successful and ${failedCalls} failed tool calls`,
    );
  }

  /**
   * A3 Fix: 内部方法 - 使用 FunctionDefinitions 直接执行
   * 支持内置工具和 MCP 工具的混合执行
   */
  private async *executeWithDefinitions(
    llmAdapter: ILLMAdapter,
    systemPrompt: string,
    userPrompt: string,
    functionDefinitions: FunctionDefinition[],
    context: ToolContext,
    config?: Partial<ExecutionConfig>,
  ): AsyncGenerator<AgentEvent> {
    const cfg: ExecutionConfig = {
      ...FunctionCallingExecutor.DEFAULT_CONFIG,
      ...config,
    };
    const startTime = Date.now();

    const metrics: ExecutionMetrics = {
      iterations: 0,
      toolCalls: 0,
      successfulToolCalls: 0,
      failedToolCalls: 0,
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      totalDuration: 0,
      toolCallDetails: [],
    };

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    this.logger.log(
      `[executeWithDefinitions] Starting with ${functionDefinitions.length} tools`,
    );

    // ★ Map legacy parameters to taskProfile if taskProfile not provided
    const requestOptions: LLMRequestOptions = {
      messages,
      functions: functionDefinitions,
      tool_choice: "auto",
    };

    if (cfg.taskProfile) {
      // Use provided taskProfile
      requestOptions.taskProfile = cfg.taskProfile;
    } else {
      // Map legacy temperature/maxTokens to taskProfile
      requestOptions.taskProfile = {
        creativity: this.mapTemperatureToCreativity(cfg.temperature),
        outputLength: this.mapMaxTokensToOutputLength(cfg.maxTokens),
      };
    }

    while (
      metrics.iterations < cfg.maxIterations &&
      metrics.toolCalls < cfg.maxToolCalls
    ) {
      metrics.iterations++;

      this.logger.log(
        `[executeWithDefinitions] Iteration ${metrics.iterations}`,
      );

      let response: LLMResponse;
      try {
        response = await llmAdapter.chat(requestOptions);
      } catch (error) {
        this.logger.error(`[executeWithDefinitions] LLM call failed: ${error}`);
        yield {
          type: "error",
          error: error instanceof Error ? error.message : "LLM call failed",
        };
        break;
      }

      if (response.usage) {
        metrics.tokensUsed.prompt += response.usage.promptTokens;
        metrics.tokensUsed.completion += response.usage.completionTokens;
        metrics.tokensUsed.total += response.usage.totalTokens;
      }

      const toolCalls = llmAdapter.parseToolCalls(response);

      if (toolCalls.length === 0) {
        this.logger.log(
          "[executeWithDefinitions] No tool calls, task completed",
        );

        metrics.totalDuration = Date.now() - startTime;

        yield {
          type: "complete",
          result: {
            success: true,
            artifacts: [],
            summary: response.content || "",
            tokensUsed: metrics.tokensUsed.total,
            duration: metrics.totalDuration,
          },
        };

        return;
      }

      messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      });

      this.logger.log(
        `[executeWithDefinitions] Executing ${toolCalls.length} tool calls`,
      );

      for (const toolCall of toolCalls) {
        metrics.toolCalls++;

        const toolId = toolCall.name;
        let input: unknown;

        try {
          input = JSON.parse(toolCall.arguments);
        } catch {
          input = toolCall.arguments;
        }

        yield {
          type: "tool_call",
          tool: toolId,
          input,
        };

        const toolResult = await this.executeTool(
          toolId,
          input,
          context,
          cfg.enableRetry,
        );

        metrics.toolCallDetails.push({
          tool: toolId,
          duration: toolResult.metadata?.duration || 0,
          success: toolResult.success,
        });

        if (toolResult.success) {
          metrics.successfulToolCalls++;
        } else {
          metrics.failedToolCalls++;
        }

        yield {
          type: "tool_result",
          tool: toolId,
          output: toolResult.data,
          duration: toolResult.metadata?.duration || 0,
        };

        const toolResultMessage = llmAdapter.buildToolResultMessage(
          toolCall.id,
          toolCall.name,
          toolResult.success ? toolResult.data : { error: toolResult.error },
        );
        messages.push(toolResultMessage);
      }
    }

    if (metrics.iterations >= cfg.maxIterations) {
      this.logger.warn("[executeWithDefinitions] Max iterations reached");
      yield {
        type: "error",
        error: "Max iterations reached, task may be incomplete",
      };
    }

    if (metrics.toolCalls >= cfg.maxToolCalls) {
      this.logger.warn("[executeWithDefinitions] Max tool calls reached");
      yield {
        type: "error",
        error: "Max tool calls reached, task may be incomplete",
      };
    }

    metrics.totalDuration = Date.now() - startTime;

    yield {
      type: "complete",
      result: {
        success: true,
        artifacts: [],
        summary: "Task execution completed",
        tokensUsed: metrics.tokensUsed.total,
        duration: metrics.totalDuration,
      },
    };
  }

  /**
   * Map legacy temperature values to creativity levels
   */
  private mapTemperatureToCreativity(
    temperature: number,
  ): "deterministic" | "low" | "medium" | "high" {
    if (temperature <= 0.2) return "deterministic";
    if (temperature <= 0.3) return "low";
    if (temperature <= 0.7) return "medium";
    return "high";
  }

  /**
   * Map legacy maxTokens values to outputLength levels
   */
  private mapMaxTokensToOutputLength(
    maxTokens: number,
  ): "minimal" | "short" | "medium" | "standard" | "long" | "extended" {
    if (maxTokens <= 1000) return "minimal";
    if (maxTokens <= 2000) return "short";
    if (maxTokens <= 4000) return "medium";
    if (maxTokens <= 6000) return "standard";
    if (maxTokens <= 8000) return "long";
    return "extended";
  }
}
