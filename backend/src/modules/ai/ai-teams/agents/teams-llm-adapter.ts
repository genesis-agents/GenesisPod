/**
 * TeamsLLMAdapter - AI Teams 的 LLM 适配器
 *
 * 将 AiChatService 包装为符合 ILLMAdapter 接口的适配器
 * 支持从数据库获取 API Key 或使用环境变量
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  ILLMAdapter,
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  ToolCallRequest,
} from "../../ai-engine/orchestration/executors/function-calling-executor";
import { LLMProvider } from "../../ai-engine/llm/abstractions/llm-adapter.interface";
import { FunctionDefinition } from "../../ai-engine/tools/abstractions/tool.interface";
import { AiChatService, ChatMessage } from "../../ai-core/ai-chat.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";

/**
 * Teams LLM 适配器配置
 */
export interface TeamsLLMAdapterConfig {
  /**
   * AI Member ID (用于获取模型配置)
   */
  aiMemberId: string;

  /**
   * Topic ID (用于上下文)
   */
  topicId: string;

  /**
   * Provider 覆盖 (可选)
   */
  provider?: string;

  /**
   * Model ID 覆盖 (可选)
   */
  modelId?: string;

  /**
   * API Key 覆盖 (可选)
   */
  apiKey?: string;
}

/**
 * Teams LLM Adapter
 *
 * 复用 AiChatService 的能力，支持多 Provider 的 Function Calling
 */
@Injectable()
export class TeamsLLMAdapter implements ILLMAdapter {
  private readonly logger = new Logger(TeamsLLMAdapter.name);
  readonly provider: LLMProvider = "openai"; // 默认使用 OpenAI 格式

  private config?: TeamsLLMAdapterConfig;

  constructor(
    private readonly aiChatService: AiChatService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 设置适配器配置
   */
  setConfig(config: TeamsLLMAdapterConfig): void {
    this.config = config;
    this.logger.debug(
      `[setConfig] Configured for aiMember: ${config.aiMemberId}, topic: ${config.topicId}`,
    );
  }

  /**
   * 格式化工具定义为 OpenAI tools 格式
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
   * 解析工具调用 (OpenAI 格式)
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
   * 构建工具结果消息 (OpenAI 格式)
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
      model,
    } = options;

    this.logger.debug(
      `[chat] Calling with ${messages.length} messages, ${functions?.length || 0} functions`,
    );

    // 获取 AI Member 配置
    const aiMemberConfig = await this.getAIMemberConfig();

    // 转换消息格式
    const chatMessages: ChatMessage[] = messages.map((m) =>
      this.convertLLMMessageToChatMessage(m),
    );

    // 构建请求参数
    const requestParams: any = {
      provider: this.config?.provider || aiMemberConfig.provider,
      modelId: this.config?.modelId || model || aiMemberConfig.modelId,
      apiKey: this.config?.apiKey || aiMemberConfig.apiKey,
      apiEndpoint: aiMemberConfig.apiEndpoint,
      messages: chatMessages,
      maxTokens,
      temperature,
    };

    // 添加系统提示词 (从第一条系统消息中提取)
    const systemMessage = messages.find((m) => m.role === "system");
    if (systemMessage?.content) {
      requestParams.systemPrompt = systemMessage.content;
    }

    // 如果有工具定义，添加 tools 参数
    if (functions && functions.length > 0) {
      // 注意：AiChatService 可能还不支持直接传递 tools
      // 这里我们需要通过请求体直接传递
      // 暂时存储在 requestParams 中，后续在调用时处理
      requestParams.tools = this.formatTools(functions);
      requestParams.tool_choice = options.tool_choice || "auto";
    }

    try {
      // 调用 AiChatService
      const result = await this.callAiChatServiceWithTools(requestParams);

      // 转换响应格式
      return this.convertToLLMResponse(result, requestParams.provider);
    } catch (error) {
      this.logger.error(`[chat] Failed to call AI service:`, error);
      throw error;
    }
  }

  /**
   * 调用 AiChatService (支持工具调用)
   */
  private async callAiChatServiceWithTools(params: any): Promise<any> {
    const {
      provider,
      modelId,
      apiKey,
      apiEndpoint,
      systemPrompt,
      messages,
      maxTokens,
      temperature,
      tools,
      tool_choice,
    } = params;

    // 如果有工具定义，需要直接调用底层 API
    if (tools && tools.length > 0) {
      this.logger.debug(`[callAiChatServiceWithTools] Calling with tools`);

      // 构建完整的消息数组 (包括系统提示词)
      const fullMessages: any[] = [];
      if (systemPrompt) {
        fullMessages.push({ role: "system", content: systemPrompt });
      }
      fullMessages.push(
        ...messages.map((m: ChatMessage) => ({
          role: m.role,
          content: m.content,
          name: m.name,
        })),
      );

      // 使用 HttpService 直接调用
      // 这里我们复用 AiChatService 的能力，但需要扩展它支持工具
      return this.aiChatService.generateChatCompletionWithKey({
        provider,
        modelId,
        apiKey,
        apiEndpoint,
        systemPrompt,
        messages,
        maxTokens,
        temperature,
        // 注意：这里传递 tools，但 AiChatService 可能还不支持
        // 需要在 AiChatService 中添加对 tools 的支持
        // 暂时作为扩展参数传递
        ...(tools ? { tools, tool_choice } : {}),
      } as any);
    }

    // 没有工具时，使用标准调用
    return this.aiChatService.generateChatCompletionWithKey({
      provider,
      modelId,
      apiKey,
      apiEndpoint,
      systemPrompt,
      messages,
      maxTokens,
      temperature,
    });
  }

  /**
   * 获取 AI Member 配置
   */
  private async getAIMemberConfig(): Promise<{
    provider: string;
    modelId: string;
    apiKey: string;
    apiEndpoint?: string;
  }> {
    if (!this.config) {
      throw new Error(
        "TeamsLLMAdapter not configured. Call setConfig() first.",
      );
    }

    // 从数据库获取 AI Member 配置
    const aiMember = await this.prisma.topicAIMember.findUnique({
      where: { id: this.config.aiMemberId },
      select: {
        aiModel: true,
        displayName: true,
      },
    });

    if (!aiMember) {
      throw new Error(`AI Member not found: ${this.config.aiMemberId}`);
    }

    // 查找 AI Model 配置
    let aiModelConfig = await this.prisma.aIModel.findFirst({
      where: {
        modelId: {
          equals: aiMember.aiModel,
          mode: "insensitive",
        },
        isEnabled: true,
      },
      select: {
        modelId: true,
        provider: true,
        apiKey: true,
        apiEndpoint: true,
      },
    });

    // 如果找不到，尝试按名称查找
    if (!aiModelConfig) {
      aiModelConfig = await this.prisma.aIModel.findFirst({
        where: {
          name: {
            equals: aiMember.aiModel,
            mode: "insensitive",
          },
          isEnabled: true,
        },
        select: {
          modelId: true,
          provider: true,
          apiKey: true,
          apiEndpoint: true,
        },
      });
    }

    // 提取配置
    const provider =
      aiModelConfig?.provider || this.inferProvider(aiMember.aiModel);
    const modelId = aiModelConfig?.modelId || aiMember.aiModel;
    let apiKey = aiModelConfig?.apiKey || "";

    // 如果数据库没有 API Key，尝试从环境变量获取
    if (!apiKey) {
      apiKey = this.getApiKeyFromEnv(provider) || "";
    }

    const apiEndpoint =
      aiModelConfig?.apiEndpoint || this.getDefaultEndpoint(provider);

    this.logger.debug(
      `[getAIMemberConfig] provider=${provider}, modelId=${modelId}, hasApiKey=${!!apiKey}`,
    );

    return {
      provider,
      modelId,
      apiKey,
      apiEndpoint,
    };
  }

  /**
   * 从 Provider 推断默认 API Endpoint
   */
  private getDefaultEndpoint(provider: string): string {
    const lower = provider.toLowerCase();

    if (lower.includes("xai") || lower.includes("grok")) {
      return "https://api.x.ai/v1/chat/completions";
    }
    if (lower.includes("openai") || lower.includes("gpt")) {
      return "https://api.openai.com/v1/chat/completions";
    }
    if (lower.includes("anthropic") || lower.includes("claude")) {
      return "https://api.anthropic.com/v1/messages";
    }
    if (lower.includes("google") || lower.includes("gemini")) {
      return "https://generativelanguage.googleapis.com/v1beta/models";
    }

    return "";
  }

  /**
   * 从模型名称推断 Provider
   */
  private inferProvider(modelName: string): string {
    const lower = modelName.toLowerCase();

    if (lower.includes("grok")) return "xai";
    if (
      lower.includes("gpt") ||
      lower.startsWith("o1") ||
      lower.startsWith("o3")
    )
      return "openai";
    if (lower.includes("claude")) return "anthropic";
    if (lower.includes("gemini")) return "google";
    if (lower.includes("deepseek")) return "deepseek";

    return "openai"; // 默认
  }

  /**
   * 从环境变量获取 API Key
   */
  private getApiKeyFromEnv(provider: string): string | null {
    const lower = provider.toLowerCase();

    if (lower.includes("xai") || lower.includes("grok")) {
      return process.env.XAI_API_KEY || null;
    }
    if (lower.includes("openai") || lower.includes("gpt")) {
      return process.env.OPENAI_API_KEY || null;
    }
    if (lower.includes("anthropic") || lower.includes("claude")) {
      return process.env.ANTHROPIC_API_KEY || null;
    }
    if (lower.includes("google") || lower.includes("gemini")) {
      return process.env.GOOGLE_AI_API_KEY || null;
    }

    return null;
  }

  /**
   * 转换 LLMMessage 到 ChatMessage
   */
  private convertLLMMessageToChatMessage(message: LLMMessage): ChatMessage {
    return {
      role:
        message.role === "system"
          ? "system"
          : message.role === "assistant"
            ? "assistant"
            : "user",
      content: message.content || "",
      name: message.name,
    };
  }

  /**
   * 转换 AiChatService 响应到 LLMResponse
   */
  private convertToLLMResponse(result: any, provider: string): LLMResponse {
    // 处理不同 Provider 的响应格式
    const lower = provider.toLowerCase();

    if (lower.includes("anthropic") || lower.includes("claude")) {
      // Anthropic 格式
      return this.parseAnthropicResponse(result);
    }

    if (lower.includes("google") || lower.includes("gemini")) {
      // Google 格式
      return this.parseGoogleResponse(result);
    }

    // OpenAI 格式 (默认)
    return this.parseOpenAIResponse(result);
  }

  /**
   * 解析 OpenAI 响应
   */
  private parseOpenAIResponse(result: any): LLMResponse {
    // AiChatService 返回的是简化格式
    if (result.content !== undefined) {
      return {
        content: result.content,
        usage: result.tokensUsed
          ? {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: result.tokensUsed,
            }
          : undefined,
        model: result.model,
        finishReason: "stop",
      };
    }

    // 原始 API 响应格式
    const choice = result.choices?.[0];
    const message = choice?.message;

    return {
      content: message?.content || null,
      function_call: message?.function_call,
      tool_calls: message?.tool_calls,
      usage: result.usage
        ? {
            promptTokens: result.usage.prompt_tokens || 0,
            completionTokens: result.usage.completion_tokens || 0,
            totalTokens: result.usage.total_tokens || 0,
          }
        : undefined,
      model: result.model,
      finishReason: choice?.finish_reason,
    };
  }

  /**
   * 解析 Anthropic 响应
   */
  private parseAnthropicResponse(result: any): LLMResponse {
    let content: string | null = null;
    const toolCalls: any[] = [];

    if (result.content && Array.isArray(result.content)) {
      for (const block of result.content) {
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
      usage: result.usage
        ? {
            promptTokens: result.usage.input_tokens || 0,
            completionTokens: result.usage.output_tokens || 0,
            totalTokens:
              (result.usage.input_tokens || 0) +
              (result.usage.output_tokens || 0),
          }
        : undefined,
      model: result.model,
      finishReason: result.stop_reason === "tool_use" ? "tool_calls" : "stop",
    };
  }

  /**
   * 解析 Google 响应
   */
  private parseGoogleResponse(result: any): LLMResponse {
    const candidate = result.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text || null;

    // Google 暂不支持 function calling in this adapter
    // 可以后续扩展

    return {
      content,
      usage: result.usageMetadata
        ? {
            promptTokens: result.usageMetadata.promptTokenCount || 0,
            completionTokens: result.usageMetadata.candidatesTokenCount || 0,
            totalTokens: result.usageMetadata.totalTokenCount || 0,
          }
        : undefined,
      model: result.model,
      finishReason: "stop",
    };
  }
}
