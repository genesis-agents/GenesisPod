/**
 * LLM Adapter Layer
 * 多模型适配层 - 统一不同 LLM 的 Function Calling 格式
 */

import { Injectable, Logger } from "@nestjs/common";
import { FunctionDefinition, ToolCallRequest } from "../tool/tool.interface";

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
 * 支持的 LLM Provider
 */
export type LLMProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "grok"
  | "deepseek";

// ============================================================================
// LLM Adapter Interface
// ============================================================================

/**
 * LLM 适配器接口
 */
export interface ILLMAdapter {
  /**
   * Provider 名称
   */
  readonly provider: LLMProvider;

  /**
   * 将工具转换为 Provider 特定格式
   */
  formatTools(functions: FunctionDefinition[]): unknown;

  /**
   * 解析 Provider 响应中的工具调用
   */
  parseToolCalls(response: unknown): ToolCallRequest[];

  /**
   * 构建工具结果消息
   */
  buildToolResultMessage(
    toolCallId: string,
    toolName: string,
    result: unknown,
  ): LLMMessage;

  /**
   * 执行 Chat Completion
   */
  chat(options: LLMRequestOptions): Promise<LLMResponse>;
}

// ============================================================================
// OpenAI Adapter
// ============================================================================

@Injectable()
export class OpenAIAdapter implements ILLMAdapter {
  readonly provider: LLMProvider = "openai";

  constructor(private readonly aiChatService: any) {}

  /**
   * 将工具格式化为 OpenAI tools 格式
   */
  formatTools(
    functions: FunctionDefinition[],
  ): Array<{ type: "function"; function: FunctionDefinition }> {
    return functions.map((fn) => ({
      type: "function" as const,
      function: fn,
    }));
  }

  /**
   * 解析 OpenAI 响应中的 tool_calls
   */
  parseToolCalls(response: LLMResponse): ToolCallRequest[] {
    const toolCalls: ToolCallRequest[] = [];

    // OpenAI 新格式 (tool_calls)
    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const call of response.tool_calls) {
        toolCalls.push({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        });
      }
    }

    // OpenAI 旧格式 (function_call) - 兼容
    if (response.function_call) {
      toolCalls.push({
        id: `call_${Date.now()}`,
        name: response.function_call.name,
        arguments: response.function_call.arguments,
      });
    }

    return toolCalls;
  }

  /**
   * 构建工具结果消息（OpenAI 格式）
   */
  buildToolResultMessage(
    toolCallId: string,
    toolName: string,
    result: unknown,
  ): LLMMessage {
    return {
      role: "tool",
      content: typeof result === "string" ? result : JSON.stringify(result),
      tool_call_id: toolCallId,
      name: toolName,
    };
  }

  /**
   * 执行 Chat Completion
   */
  async chat(options: LLMRequestOptions): Promise<LLMResponse> {
    const {
      messages,
      functions,
      temperature = 0.7,
      maxTokens = 4096,
    } = options;

    // 构建请求
    const requestBody: any = {
      messages: messages.map((m) => this.formatMessage(m)),
      temperature,
      max_tokens: maxTokens,
    };

    // 添加工具定义
    if (functions && functions.length > 0) {
      requestBody.tools = this.formatTools(functions);
      requestBody.tool_choice = options.tool_choice || "auto";
    }

    // 调用 AI 服务
    const response = await this.aiChatService.chatWithFunctions(requestBody);

    return this.parseResponse(response);
  }

  private formatMessage(message: LLMMessage): any {
    const formatted: any = {
      role: message.role,
      content: message.content,
    };

    if (message.name) {
      formatted.name = message.name;
    }

    if (message.tool_calls) {
      formatted.tool_calls = message.tool_calls;
    }

    if (message.tool_call_id) {
      formatted.tool_call_id = message.tool_call_id;
    }

    return formatted;
  }

  private parseResponse(response: any): LLMResponse {
    const choice = response.choices?.[0];
    const message = choice?.message;

    return {
      content: message?.content || null,
      function_call: message?.function_call,
      tool_calls: message?.tool_calls,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
      model: response.model,
      finishReason: choice?.finish_reason,
    };
  }
}

// ============================================================================
// Anthropic Adapter
// ============================================================================

@Injectable()
export class AnthropicAdapter implements ILLMAdapter {
  readonly provider: LLMProvider = "anthropic";

  constructor(private readonly aiChatService: any) {}

  /**
   * 将工具格式化为 Anthropic tools 格式
   */
  formatTools(functions: FunctionDefinition[]): Array<{
    name: string;
    description: string;
    input_schema: any;
  }> {
    return functions.map((fn) => ({
      name: fn.name,
      description: fn.description,
      input_schema: fn.parameters,
    }));
  }

  /**
   * 解析 Anthropic 响应中的 tool_use
   */
  parseToolCalls(response: any): ToolCallRequest[] {
    const toolCalls: ToolCallRequest[] = [];

    // Anthropic 格式：content 数组中的 tool_use 块
    if (response.content && Array.isArray(response.content)) {
      for (const block of response.content) {
        if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input),
          });
        }
      }
    }

    return toolCalls;
  }

  /**
   * 构建工具结果消息（Anthropic 格式）
   */
  buildToolResultMessage(
    toolCallId: string,
    _toolName: string,
    result: unknown,
  ): LLMMessage {
    return {
      role: "user",
      content: JSON.stringify([
        {
          type: "tool_result",
          tool_use_id: toolCallId,
          content: typeof result === "string" ? result : JSON.stringify(result),
        },
      ]),
    };
  }

  async chat(options: LLMRequestOptions): Promise<LLMResponse> {
    // Anthropic 实现（通过 LiteLLM 代理）
    const response = await this.aiChatService.chatWithFunctions({
      messages: options.messages,
      tools: options.functions
        ? this.formatTools(options.functions)
        : undefined,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    });

    return this.parseResponse(response);
  }

  private parseResponse(response: any): LLMResponse {
    let content: string | null = null;
    const toolCalls: any[] = [];

    if (response.content && Array.isArray(response.content)) {
      for (const block of response.content) {
        if (block.type === "text") {
          content = (content || "") + block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
        }
      }
    }

    return {
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: response.usage
        ? {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens:
              response.usage.input_tokens + response.usage.output_tokens,
          }
        : undefined,
      model: response.model,
      finishReason: response.stop_reason === "tool_use" ? "tool_calls" : "stop",
    };
  }
}

// ============================================================================
// LLM Adapter Factory
// ============================================================================

@Injectable()
export class LLMAdapterFactory {
  private readonly logger = new Logger(LLMAdapterFactory.name);
  private readonly adapters = new Map<LLMProvider, ILLMAdapter>();

  /**
   * 注册适配器
   */
  register(adapter: ILLMAdapter): void {
    this.adapters.set(adapter.provider, adapter);
    this.logger.log(`Registered LLM adapter: ${adapter.provider}`);
  }

  /**
   * 获取适配器
   */
  get(provider: LLMProvider): ILLMAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`LLM adapter not found for provider: ${provider}`);
    }
    return adapter;
  }

  /**
   * 获取默认适配器（OpenAI）
   */
  getDefault(): ILLMAdapter {
    return this.get("openai");
  }

  /**
   * 检查适配器是否存在
   */
  has(provider: LLMProvider): boolean {
    return this.adapters.has(provider);
  }
}
