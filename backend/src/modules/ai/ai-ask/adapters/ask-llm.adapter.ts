/**
 * AI Ask LLM Adapter
 * 为 ai-ask 模块提供 LLM 适配层，支持 Function Calling
 * 封装 AiChatService 以兼容 ai-agents 的 ILLMAdapter 接口
 */

import { Injectable, Logger } from "@nestjs/common";
import { AiChatService } from "../../ai-core/ai-chat.service";
import {
  ILLMAdapter,
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  LLMProvider,
} from "../../ai-agents/core/llm/llm-adapter";
import {
  FunctionDefinition,
  ToolCallRequest,
} from "../../ai-agents/core/tool/tool.interface";

/**
 * 模型配置
 */
export interface ModelConfig {
  provider: string;
  modelId: string;
  apiKey: string;
  apiEndpoint?: string;
}

/**
 * AI Ask LLM 适配器
 * 将 AiChatService 适配为 ILLMAdapter 接口
 */
@Injectable()
export class AskLLMAdapter implements ILLMAdapter {
  private readonly logger = new Logger(AskLLMAdapter.name);
  readonly provider: LLMProvider = "openai"; // 默认使用 OpenAI 格式

  private modelConfig: ModelConfig | null = null;

  constructor(private readonly aiChatService: AiChatService) {}

  /**
   * 设置模型配置
   */
  setModelConfig(config: ModelConfig): void {
    this.modelConfig = config;
    // 根据 provider 更新适配器类型
    (this as any).provider = this.mapProvider(config.provider);
  }

  /**
   * 映射 provider 名称
   */
  private mapProvider(provider: string): LLMProvider {
    const providerMap: Record<string, LLMProvider> = {
      openai: "openai",
      anthropic: "anthropic",
      google: "openai", // Gemini 使用 OpenAI 兼容格式
      xai: "grok",
      deepseek: "deepseek",
    };
    return providerMap[provider.toLowerCase()] || "openai";
  }

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
   * 解析响应中的工具调用
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
   * 构建工具结果消息
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
   * 支持 Function Calling
   */
  async chat(options: LLMRequestOptions): Promise<LLMResponse> {
    if (!this.modelConfig) {
      throw new Error("Model config not set. Call setModelConfig first.");
    }

    const {
      messages,
      functions,
      temperature = 0.7,
      maxTokens = 4096,
    } = options;

    // 将 LLMMessage 转换为 ChatMessage 格式
    const chatMessages = messages
      .filter((m) => m.role !== "tool" && m.role !== "function")
      .map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: this.buildMessageContent(m),
        name: m.name,
      }));

    // 如果有 function 定义，需要在 system prompt 中添加工具描述
    // 因为当前 AiChatService 不直接支持 tools 参数
    let systemPrompt = "";
    if (functions && functions.length > 0) {
      systemPrompt = this.buildToolsSystemPrompt(functions);

      // 检查是否已有 system 消息
      const hasSystem = chatMessages.some((m) => m.role === "system");
      if (hasSystem) {
        // 在现有 system 消息后追加工具描述
        const systemIdx = chatMessages.findIndex((m) => m.role === "system");
        chatMessages[systemIdx].content += "\n\n" + systemPrompt;
      } else {
        // 添加新的 system 消息
        chatMessages.unshift({
          role: "system",
          content: systemPrompt,
          name: undefined,
        });
      }
    }

    try {
      // 调用 AI 服务
      const result = await this.aiChatService.generateChatCompletionWithKey({
        provider: this.modelConfig.provider,
        modelId: this.modelConfig.modelId,
        apiKey: this.modelConfig.apiKey,
        apiEndpoint: this.modelConfig.apiEndpoint,
        messages: chatMessages,
        maxTokens,
        temperature,
      });

      // 解析响应中的工具调用
      const parsedResponse = this.parseResponseContent(
        result.content,
        functions,
      );

      return {
        content: parsedResponse.content,
        tool_calls: parsedResponse.toolCalls,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: result.tokensUsed || 0,
        },
        model: result.model,
        finishReason: parsedResponse.toolCalls ? "tool_calls" : "stop",
      };
    } catch (error) {
      this.logger.error(`Chat error: ${error}`);
      throw error;
    }
  }

  /**
   * 构建消息内容
   */
  private buildMessageContent(message: LLMMessage): string {
    if (typeof message.content === "string") {
      return message.content;
    }
    return message.content || "";
  }

  /**
   * 构建工具描述的 System Prompt
   * 用于在不支持原生 Function Calling 的情况下模拟工具调用
   */
  private buildToolsSystemPrompt(functions: FunctionDefinition[]): string {
    const toolDescriptions = functions
      .map((fn) => {
        const params = fn.parameters
          ? JSON.stringify(fn.parameters, null, 2)
          : "{}";
        return `### ${fn.name}\n${fn.description}\nParameters:\n\`\`\`json\n${params}\n\`\`\``;
      })
      .join("\n\n");

    return `You have access to the following tools. To use a tool, respond with a JSON object in this exact format:

\`\`\`json
{
  "tool_call": {
    "name": "tool_name",
    "arguments": { ... }
  }
}
\`\`\`

Available tools:

${toolDescriptions}

If you need to use a tool, respond ONLY with the JSON object above. If you don't need any tools, respond normally with text.`;
  }

  /**
   * 解析响应内容，提取工具调用
   */
  private parseResponseContent(
    content: string,
    functions?: FunctionDefinition[],
  ): {
    content: string | null;
    toolCalls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  } {
    if (!functions || functions.length === 0) {
      return { content };
    }

    // 尝试解析 JSON 格式的工具调用
    try {
      // 匹配 JSON 代码块
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1].trim();
        const parsed = JSON.parse(jsonStr);

        if (parsed.tool_call) {
          const toolCall = parsed.tool_call;
          // 验证工具名称是否在可用工具列表中
          const isValidTool = functions.some((fn) => fn.name === toolCall.name);

          if (isValidTool) {
            return {
              content: null,
              toolCalls: [
                {
                  id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  type: "function",
                  function: {
                    name: toolCall.name,
                    arguments: JSON.stringify(toolCall.arguments),
                  },
                },
              ],
            };
          }
        }
      }

      // 尝试直接解析整个内容为 JSON
      const directParsed = JSON.parse(content);
      if (directParsed.tool_call) {
        const toolCall = directParsed.tool_call;
        const isValidTool = functions.some((fn) => fn.name === toolCall.name);

        if (isValidTool) {
          return {
            content: null,
            toolCalls: [
              {
                id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: "function",
                function: {
                  name: toolCall.name,
                  arguments: JSON.stringify(toolCall.arguments),
                },
              },
            ],
          };
        }
      }
    } catch {
      // 解析失败，返回原始内容
    }

    return { content };
  }
}
