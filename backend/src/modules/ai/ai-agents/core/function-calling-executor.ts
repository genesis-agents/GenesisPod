/**
 * Function Calling Executor
 * 执行引擎 - 让 LLM 自主选择和调用工具
 */

import { Injectable, Logger } from "@nestjs/common";
import { ToolRegistry } from "./tool.registry";
import { ToolContext, ToolResult, FunctionDefinition } from "./tool.interface";
import { ToolType, AgentEvent } from "./agent.types";
import { ILLMAdapter, LLMMessage, LLMResponse } from "./llm-adapter";
import { RetryStrategy } from "./retry-strategy";

// ============================================================================
// Types
// ============================================================================

/**
 * 执行配置
 */
export interface ExecutionConfig {
  /**
   * 最大迭代次数（防止无限循环）
   */
  maxIterations: number;

  /**
   * 最大工具调用次数
   */
  maxToolCalls: number;

  /**
   * 是否并行执行工具
   */
  parallelToolCalls: boolean;

  /**
   * 是否启用重试
   */
  enableRetry: boolean;

  /**
   * 温度参数
   */
  temperature: number;

  /**
   * 最大 Token
   */
  maxTokens: number;
}

/**
 * 执行统计
 */
export interface ExecutionMetrics {
  /**
   * 总迭代次数
   */
  iterations: number;

  /**
   * 工具调用次数
   */
  toolCalls: number;

  /**
   * 成功的工具调用
   */
  successfulToolCalls: number;

  /**
   * 失败的工具调用
   */
  failedToolCalls: number;

  /**
   * Token 使用量
   */
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };

  /**
   * 总耗时（毫秒）
   */
  totalDuration: number;

  /**
   * 工具调用详情
   */
  toolCallDetails: Array<{
    tool: ToolType;
    duration: number;
    success: boolean;
    retries?: number;
  }>;
}

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

  /**
   * 默认配置
   */
  static readonly DEFAULT_CONFIG: ExecutionConfig = {
    maxIterations: 10,
    maxToolCalls: 20,
    parallelToolCalls: false,
    enableRetry: true,
    temperature: 0.7,
    maxTokens: 4096,
  };

  constructor(private readonly toolRegistry: ToolRegistry) {
    this.retryStrategy = new RetryStrategy();
  }

  /**
   * 执行 Function Calling 循环
   *
   * @param llmAdapter LLM 适配器
   * @param systemPrompt 系统提示词
   * @param userPrompt 用户输入
   * @param tools 可用工具列表
   * @param context 执行上下文
   * @param config 执行配置
   * @yields AgentEvent 事件流
   */
  async *execute(
    llmAdapter: ILLMAdapter,
    systemPrompt: string,
    userPrompt: string,
    tools: ToolType[],
    context: ToolContext,
    config?: Partial<ExecutionConfig>,
  ): AsyncGenerator<AgentEvent> {
    const cfg: ExecutionConfig = {
      ...FunctionCallingExecutor.DEFAULT_CONFIG,
      ...config,
    };
    const startTime = Date.now();

    // 初始化指标
    const metrics: ExecutionMetrics = {
      iterations: 0,
      toolCalls: 0,
      successfulToolCalls: 0,
      failedToolCalls: 0,
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      totalDuration: 0,
      toolCallDetails: [],
    };

    // 获取工具的 Function 定义
    const functionDefinitions = this.getFunctionDefinitions(tools);

    // 初始化消息列表
    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    this.logger.log(
      `[execute] Starting with ${functionDefinitions.length} tools`,
    );

    // ReAct 循环
    while (
      metrics.iterations < cfg.maxIterations &&
      metrics.toolCalls < cfg.maxToolCalls
    ) {
      metrics.iterations++;

      this.logger.log(`[execute] Iteration ${metrics.iterations}`);

      // 调用 LLM
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

      // 更新 Token 统计
      if (response.usage) {
        metrics.tokensUsed.prompt += response.usage.promptTokens;
        metrics.tokensUsed.completion += response.usage.completionTokens;
        metrics.tokensUsed.total += response.usage.totalTokens;
      }

      // 解析工具调用
      const toolCalls = llmAdapter.parseToolCalls(response);

      // 如果没有工具调用，说明 LLM 完成了任务
      if (toolCalls.length === 0) {
        this.logger.log("[execute] No tool calls, task completed");

        // 返回最终结果
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

      // 添加助手消息
      messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      });

      // 执行工具调用
      this.logger.log(`[execute] Executing ${toolCalls.length} tool calls`);

      for (const toolCall of toolCalls) {
        metrics.toolCalls++;

        // 发送工具调用事件
        const toolType = toolCall.name as ToolType;
        let input: unknown;

        try {
          input = JSON.parse(toolCall.arguments);
        } catch {
          input = toolCall.arguments;
        }

        yield {
          type: "tool_call",
          tool: toolType,
          input,
        };

        // 执行工具
        const toolResult = await this.executeTool(
          toolType,
          input,
          context,
          cfg.enableRetry,
        );

        // 记录工具调用详情
        metrics.toolCallDetails.push({
          tool: toolType,
          duration: toolResult.duration,
          success: toolResult.success,
        });

        if (toolResult.success) {
          metrics.successfulToolCalls++;
        } else {
          metrics.failedToolCalls++;
        }

        // 发送工具结果事件
        yield {
          type: "tool_result",
          tool: toolType,
          output: toolResult.data,
          duration: toolResult.duration,
        };

        // 添加工具结果消息
        const toolResultMessage = llmAdapter.buildToolResultMessage(
          toolCall.id,
          toolCall.name,
          toolResult.success ? toolResult.data : { error: toolResult.error },
        );
        messages.push(toolResultMessage);
      }
    }

    // 超过最大迭代次数
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

    // 返回最终状态
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
   */
  private async executeTool(
    toolType: ToolType,
    input: unknown,
    context: ToolContext,
    enableRetry: boolean,
  ): Promise<ToolResult> {
    const startTime = Date.now();

    // 检查工具是否存在
    if (!this.toolRegistry.has(toolType)) {
      this.logger.warn(`[executeTool] Tool not found: ${toolType}`);
      return {
        success: false,
        error: `Tool not found: ${toolType}`,
        duration: Date.now() - startTime,
      };
    }

    const tool = this.toolRegistry.get(toolType);

    // 如果启用重试
    if (enableRetry) {
      const result = await this.retryStrategy.executeWithRetry(
        () => tool.execute(input, context),
        toolType,
        `Tool:${toolType}`,
      );

      if (result.success && result.data) {
        return result.data;
      }

      return {
        success: false,
        error: result.error?.message || "Tool execution failed",
        duration: result.totalDuration,
        metadata: { attempts: result.attempts },
      };
    }

    // 直接执行
    return tool.execute(input, context);
  }

  /**
   * 获取工具的 Function 定义
   */
  private getFunctionDefinitions(tools: ToolType[]): FunctionDefinition[] {
    const definitions: FunctionDefinition[] = [];

    for (const toolType of tools) {
      if (this.toolRegistry.has(toolType)) {
        const tool = this.toolRegistry.get(toolType);
        definitions.push(tool.toFunctionDefinition());
      } else {
        this.logger.warn(
          `[getFunctionDefinitions] Tool not registered: ${toolType}`,
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
}
