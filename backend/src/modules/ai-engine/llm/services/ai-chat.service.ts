import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiServiceUnavailableError } from "../../core/exceptions";
import { AIModelType } from "@prisma/client";
import { TaskProfile, ChatMessage } from "../types";
import { TaskProfileMapperService } from "./task-profile-mapper.service";
import { AiModelConfigService, AIModelConfig } from "./ai-model-config.service";
import { AiApiCallerService } from "./ai-api-caller.service";
import { AiStreamHandlerService } from "./ai-stream-handler.service";
import { AIMetricsService } from "../../../ai-infra/facade";
import { GuardrailsPipelineService } from "../../safety/guardrails/guardrails-pipeline.service";
import {
  CircuitBreakerService,
  TaskCompletionType,
} from "../../../ai-kernel/facade";
import { ProcessEventLogService as TraceCollectorService } from "../../../ai-kernel/facade";
// ★ 拆分后的子服务
import { AiConnectionTestService } from "./ai-connection-test.service";
import { AiModelDiscoveryService } from "./ai-model-discovery.service";
import { AiDirectKeyService } from "./ai-direct-key.service";
import { AiImageGenerationService } from "./ai-image-generation.service";
import { AiChatRetryService } from "./ai-chat-retry.service";
import { EventJournalService } from "../../../ai-kernel/facade";
import { CostAttributionService } from "../../../ai-kernel/facade";
import { KernelMetricsService } from "../../../ai-kernel/facade";
import { KernelContext } from "../../../ai-kernel/facade";

export interface ChatCompletionOptions {
  model: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** 任务配置：语义化方式描述任务需求，AI Engine 自动映射参数 */
  taskProfile?: TaskProfile;
  /** 严格模式：API失败时抛出异常而不是返回错误内容 */
  strictMode?: boolean;
  /** 用户 ID（用于 BYOK Key 优先级解析） */
  userId?: string;
  /** Trace ID（用于可观测性链路追踪） */
  traceId?: string;
  /** 响应格式：json 时启用 JSON mode */
  responseFormat?: string;
  /** AI Kernel 进程 ID（用于 Journal/Cost/Metrics 追踪） */
  processId?: string;
  /** Reasoning depth for reasoning models (mapped from TaskProfile) */
  reasoningDepth?: import("../types").ReasoningDepth;
  /** Prompt cache policy */
  cachePolicy?: "auto";
  /** Native structured output schema */
  outputSchema?: { type: "json_schema"; schema: Record<string, unknown> };
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  tokensUsed: number;
  /** 标识此响应是否为错误消息（仅在非严格模式下有值） */
  isError?: boolean;
  /** 错误分类类型（仅在 isError=true 时有值，用于 fallback 决策） */
  errorType?: string;
  /** BYOK: API Key 来源（personal=用户自用, donated=共享池, system=系统） */
  apiKeySource?: "personal" | "donated" | "system";
}

// Re-export types for backward compatibility
export type { AIModelConfig } from "./ai-model-config.service";
export type { ChatMessage } from "../types";

/**
 * AI Chat Service - Thin Coordinator
 *
 * 核心职责：
 * 1. chat() — 统一入口，参数解析 + 路由到 Path A (系统配置) 或 Path B (BYOK 直连)
 * 2. chatStream() — 流式输出
 * 3. generateChatCompletion() — Path A 核心调用
 * 4. callAPIWithConfig() — 路由到 AiApiCallerService
 *
 * 已提取到独立服务：
 * - AiConnectionTestService: 连接测试
 * - AiModelDiscoveryService: 模型发现/列表
 * - AiDirectKeyService: BYOK 直连 (Path B)
 * - AiImageGenerationService: 图片生成 (DALL-E/Imagen)
 * - AiChatPromptService: Web 搜索、URL 增强（已存在）
 * - AiChatRetryService: 重试策略（已存在）
 * - AiModelConfigService: 模型配置查询（已存在）
 */
@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly taskProfileMapper: TaskProfileMapperService,
    private readonly modelConfigService: AiModelConfigService,
    private readonly apiCallerService: AiApiCallerService,
    private readonly streamHandlerService: AiStreamHandlerService,
    private readonly retryService: AiChatRetryService,
    @Optional() private readonly aiMetricsService?: AIMetricsService,
    @Optional()
    private readonly guardrailsPipeline?: GuardrailsPipelineService,
    @Optional() private readonly circuitBreaker?: CircuitBreakerService,
    @Optional()
    private readonly connectionTestService?: AiConnectionTestService,
    @Optional()
    private readonly modelDiscoveryService?: AiModelDiscoveryService,
    @Optional() private readonly directKeyService?: AiDirectKeyService,
    @Optional()
    private readonly imageGenerationService?: AiImageGenerationService,
    @Optional() private readonly traceCollector?: TraceCollectorService,
    @Optional() private readonly eventJournal?: EventJournalService,
    @Optional() private readonly costAttribution?: CostAttributionService,
    @Optional() private readonly kernelMetrics?: KernelMetricsService,
  ) {}

  // ==================== 模型配置委托方法 ====================

  /**
   * 获取模型的 API Key
   * 委托给 AiModelConfigService
   */
  async getApiKeyForModel(model: AIModelConfig): Promise<string | null> {
    return this.modelConfigService.getApiKeyForModel(model);
  }

  /**
   * 检查模型是否为推理模型（委托给 AiModelConfigService）
   */
  isReasoningModel(modelId: string): boolean {
    return this.modelConfigService.isReasoningModel(modelId);
  }

  /**
   * 记录 LLM 调用指标（非阻塞）
   */
  private recordLLMMetrics(params: {
    modelId: string;
    providerId?: string;
    userId?: string;
    duration: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    success: boolean;
    errorCode?: string;
    errorMsg?: string;
    operationId?: string;
  }): void {
    if (!this.aiMetricsService) {
      return;
    }

    this.aiMetricsService
      .recordMetric({
        metricType: "llm_call",
        operationId: params.operationId,
        modelId: params.modelId,
        providerId: params.providerId,
        userId: params.userId,
        duration: params.duration,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        success: params.success,
        errorCode: params.errorCode,
        errorMsg: params.errorMsg,
      })
      .catch((err) => {
        this.logger.warn(`[AIMetrics] Failed to record metric: ${err.message}`);
      });
  }

  /**
   * 获取模型配置（委托给 AiModelConfigService）
   */
  async getModelConfig(modelId: string): Promise<AIModelConfig | null> {
    return this.modelConfigService.getModelConfig(modelId);
  }

  /**
   * 获取默认模型配置（委托给 AiModelConfigService）
   */
  async getDefaultModelConfig(): Promise<AIModelConfig | null> {
    return this.modelConfigService.getDefaultModelConfig();
  }

  /**
   * ★ 按模型类型获取默认模型配置
   * @deprecated 使用 AiModelConfigService.getDefaultModelByType() 替代
   */
  async getDefaultModelByType(
    modelType: AIModelType,
  ): Promise<AIModelConfig | null> {
    return this.modelConfigService.getDefaultModelByType(modelType);
  }

  /**
   * ★ 获取指定类型的所有启用模型（用于 fallback）
   * @deprecated 使用 AiModelConfigService.getAllEnabledModelsByType() 替代
   */
  async getAllEnabledModelsByType(
    modelType: AIModelType,
    excludeModelIds: string[] = [],
  ): Promise<AIModelConfig[]> {
    return this.modelConfigService.getAllEnabledModelsByType(
      modelType,
      excludeModelIds,
    );
  }

  /**
   * 根据 provider 确定 API 格式类型
   */
  private getApiFormatForProvider(
    provider: string,
  ): "openai" | "anthropic" | "google" | "xai" {
    const p = provider.toLowerCase();
    if (p === "anthropic" || p === "claude") return "anthropic";
    if (p === "google" || p === "gemini") return "google";
    if (p === "xai" || p === "grok") return "xai";
    return "openai";
  }

  /**
   * 获取指定模型所需的 API 密钥环境变量名
   * @deprecated 优先使用数据库配置
   */
  getRequiredApiKeyName(model: string): string {
    const modelLower = model.toLowerCase();
    if (modelLower === "grok" || modelLower.includes("grok")) {
      return "XAI_API_KEY";
    } else if (
      modelLower === "gpt-4" ||
      modelLower.includes("gpt") ||
      modelLower.startsWith("o1") ||
      modelLower.startsWith("o3")
    ) {
      return "OPENAI_API_KEY";
    } else if (modelLower === "claude" || modelLower.includes("claude")) {
      return "ANTHROPIC_API_KEY";
    } else if (modelLower === "gemini" || modelLower.includes("gemini")) {
      return "GOOGLE_AI_API_KEY";
    }
    return "GOOGLE_AI_API_KEY";
  }

  /**
   * 验证 AI 服务是否可用
   */
  async validateAIServiceAvailability(model?: string): Promise<void> {
    let targetModel = model;
    let hasDbConfig = false;

    if (model) {
      const dbConfig = await this.getModelConfig(model);
      if (dbConfig && dbConfig.apiKey) {
        hasDbConfig = true;
        targetModel = dbConfig.modelId;
      }
    } else {
      const defaultConfig = await this.getDefaultModelConfig();
      if (defaultConfig && defaultConfig.apiKey) {
        hasDbConfig = true;
        targetModel = defaultConfig.modelId;
      }
    }

    if (!hasDbConfig) {
      targetModel =
        targetModel ||
        this.configService.get<string>("DEFAULT_AI_MODEL", "gemini");
      const requiredEnvKey = this.getRequiredApiKeyName(targetModel);

      if (!this.configService.get<string>(requiredEnvKey)) {
        throw new AiServiceUnavailableError(
          `AI服务不可用: 模型 "${targetModel}" 未在数据库中配置，且环境变量 ${requiredEnvKey} 也未设置`,
          targetModel,
        );
      }
    }

    try {
      const testResult = await this.generateChatCompletion({
        model: targetModel!,
        messages: [{ role: "user", content: "Hello" }],
        maxTokens: 10,
        temperature: 0,
      });

      if (
        testResult.content.includes("API Key 未配置") ||
        testResult.content.includes("API 调用失败") ||
        testResult.content.includes("无法生成回复")
      ) {
        throw new AiServiceUnavailableError(
          `AI服务响应异常: ${testResult.content.slice(0, 100)}`,
          targetModel,
        );
      }
    } catch (error) {
      if (error instanceof AiServiceUnavailableError) {
        throw error;
      }
      throw new AiServiceUnavailableError(
        `AI服务连接测试失败: ${error instanceof Error ? error.message : String(error)}`,
        targetModel,
      );
    }
  }

  /**
   * 检查指定模型的 API 密钥是否已配置（异步）
   */
  async isApiKeyConfiguredAsync(model: string): Promise<boolean> {
    const dbConfig = await this.getModelConfig(model);
    if (dbConfig && dbConfig.apiKey) {
      return true;
    }
    const requiredEnvKey = this.getRequiredApiKeyName(model);
    return !!this.configService.get<string>(requiredEnvKey);
  }

  /**
   * 检查指定模型的 API 密钥是否已配置（同步）
   * @deprecated 优先使用 isApiKeyConfiguredAsync
   */
  isApiKeyConfigured(model: string): boolean {
    const requiredEnvKey = this.getRequiredApiKeyName(model);
    return !!this.configService.get<string>(requiredEnvKey);
  }

  /**
   * 获取所有已配置的 AI 模型列表（从数据库）
   */
  async getAvailableModelsAsync(): Promise<string[]> {
    try {
      const chatModels =
        await this.modelConfigService.getAllEnabledModelsByType(
          AIModelType.CHAT,
        );
      const models: string[] = [];
      for (const config of chatModels) {
        const apiKey = await this.modelConfigService.getApiKeyForModel(config);
        if (apiKey) {
          models.push(config.modelId);
        }
      }
      return [...new Set(models)];
    } catch (error) {
      this.logger.error(`[getAvailableModelsAsync] Failed: ${error}`);
      return [];
    }
  }

  /**
   * 获取所有已配置的 AI 模型列表（同步，仅检查环境变量）
   * @deprecated 优先使用 getAvailableModelsAsync
   */
  getAvailableModels(): string[] {
    const models: string[] = [];
    if (this.configService.get<string>("XAI_API_KEY")) models.push("grok");
    if (this.configService.get<string>("OPENAI_API_KEY")) models.push("gpt-4");
    if (this.configService.get<string>("ANTHROPIC_API_KEY"))
      models.push("claude");
    if (this.configService.get<string>("GOOGLE_AI_API_KEY"))
      models.push("gemini");
    return models;
  }

  /**
   * 将 AIError.type 字符串映射到 CircuitBreaker 的 TaskCompletionType
   * 当 ChatCompletionResult.errorType 可用时使用，避免字符串解析丢失精度
   */
  private mapAIErrorTypeToTaskCompletion(
    aiErrorType: string,
  ): TaskCompletionType {
    switch (aiErrorType) {
      case "RATE_LIMIT":
      case "QUOTA_EXCEEDED":
        return TaskCompletionType.RATE_LIMITED;
      case "TIMEOUT":
        return TaskCompletionType.TIMEOUT;
      case "INVALID_API_KEY":
      case "INVALID_MODEL":
        return TaskCompletionType.AUTH_ERROR;
      case "CONTENT_FILTERED":
        return TaskCompletionType.CONTENT_ERROR;
      case "CONTEXT_LENGTH_EXCEEDED":
        return TaskCompletionType.CONTEXT_OVERFLOW;
      case "NETWORK_ERROR":
      case "TEMPORARY_UNAVAILABLE":
      default:
        return TaskCompletionType.API_ERROR;
    }
  }

  // ==================== Path A: 系统配置调用 ====================

  /**
   * Generate a chat completion using the specified AI model
   * 优先从数据库获取模型配置，仅在找不到时回退到环境变量
   */
  async generateChatCompletion(
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const {
      model,
      systemPrompt,
      messages,
      maxTokens = 2048,
      temperature,
      strictMode: optionStrictMode,
      userId,
      responseFormat,
      reasoningDepth,
      cachePolicy,
      outputSchema,
    } = options;

    this.logger.debug(`Generating chat completion with model: ${model}`);

    const fullMessages: ChatMessage[] = [];
    if (systemPrompt) {
      fullMessages.push({ role: "system", content: systemPrompt });
    }
    fullMessages.push(...messages);

    const modelConfig = await this.getModelConfig(model);

    if (modelConfig) {
      this.logger.debug(
        `[generateChatCompletion] Using DB config for model: ${modelConfig.modelId} (provider: ${modelConfig.provider})`,
      );
      return this.callAPIWithConfig(
        modelConfig,
        fullMessages,
        maxTokens,
        temperature,
        optionStrictMode,
        userId,
        responseFormat,
        reasoningDepth,
        cachePolicy,
        outputSchema,
      );
    }

    const errorMsg = `模型 "${model}" 未在数据库中配置，请在管理后台添加该模型的配置`;
    this.logger.error(`[generateChatCompletion] ${errorMsg}`);

    const useStrictMode = optionStrictMode ?? false;
    if (useStrictMode) {
      throw new AiServiceUnavailableError(errorMsg, model);
    }

    return {
      content: `**模型未配置**\n\n${errorMsg}\n\n请联系管理员在后台配置该模型。`,
      model,
      tokensUsed: 0,
      isError: true,
    };
  }

  /**
   * 计算模型的超时时间
   */
  private getTimeoutForModel(modelId: string, maxTokens: number): number {
    const isReasoning = this.isReasoningModel(modelId);
    const baseTimeout = isReasoning ? 300000 : 120000;
    const maxTimeout = isReasoning ? 900000 : 600000;

    const dynamicTimeout = Math.max(
      baseTimeout,
      Math.min(maxTimeout, baseTimeout + Math.ceil(maxTokens / 1000) * 15000),
    );

    this.logger.debug(
      `[getTimeoutForModel] ${modelId}: ${dynamicTimeout}ms (maxTokens=${maxTokens}, reasoning=${isReasoning})`,
    );

    return dynamicTimeout;
  }

  /**
   * 使用数据库配置调用 AI API
   */
  private async callAPIWithConfig(
    config: AIModelConfig,
    messages: ChatMessage[],
    maxTokens: number,
    temperature?: number,
    optionStrictMode?: boolean,
    userId?: string,
    responseFormat?: string,
    reasoningDepth?: import("../types").ReasoningDepth,
    cachePolicy?: "auto",
    outputSchema?: { type: "json_schema"; schema: Record<string, unknown> },
  ): Promise<ChatCompletionResult> {
    const { modelId, apiEndpoint, provider } = config;

    const resolved = await this.modelConfigService.resolveApiKey(
      config,
      userId,
    );
    const apiKey = resolved?.apiKey || null;
    const apiKeySource = resolved?.source;
    const effectiveEndpoint = resolved?.apiEndpoint || apiEndpoint;

    const apiFormat = config.apiFormat || "openai";
    const supportsTemp = config.supportsTemperature ?? true;
    const isReasoning = config.isReasoning ?? false;
    const tokenParamName =
      config.tokenParamName ||
      (isReasoning ? "max_completion_tokens" : "max_tokens");

    // ★ Safety clamp: 如果模型配置了 maxTokens 限制，确保请求不超出
    const configLimit = config.maxTokens;
    if (configLimit > 0 && maxTokens > configLimit) {
      this.logger.warn(
        `[callAPIWithConfig] Clamping maxTokens from ${maxTokens} to model limit ${configLimit} for ${modelId}`,
      );
      maxTokens = configLimit;
    }

    const timeout =
      config.defaultTimeoutMs || this.getTimeoutForModel(modelId, maxTokens);

    const useStrictMode = optionStrictMode ?? false;

    if (!apiKey) {
      const errorMsg = `模型 ${modelId} 的 API Key 未配置（直接输入或 Secret Manager 均未找到）`;
      this.logger.error(`[callAPIWithConfig] ${errorMsg}`);
      if (useStrictMode) {
        throw new AiServiceUnavailableError(errorMsg, modelId);
      }
      return {
        content: `**API Key 未配置**\n\n${errorMsg}\n\n请在管理后台配置该模型的 API Key。`,
        model: modelId,
        tokensUsed: 0,
        isError: true,
      };
    }

    const effectiveTemperature = supportsTemp ? temperature : undefined;

    if (!supportsTemp && temperature !== undefined) {
      this.logger.debug(
        `[callAPIWithConfig] Model ${modelId} does not support temperature, ignoring temperature=${temperature}`,
      );
    }

    this.logger.debug(
      `[callAPIWithConfig] Calling API: model=${modelId}, format=${apiFormat}, ` +
        `supportsTemp=${supportsTemp}, isReasoning=${isReasoning}, timeout=${timeout}ms`,
    );

    try {
      const apiCall = async (): Promise<ChatCompletionResult> => {
        switch (apiFormat) {
          case "openai":
            return await this.apiCallerService.callOpenAICompatibleAPI(
              effectiveEndpoint,
              apiKey,
              modelId,
              messages,
              maxTokens,
              effectiveTemperature,
              timeout,
              tokenParamName,
              responseFormat,
              reasoningDepth,
              outputSchema,
            );

          case "anthropic":
            return await this.apiCallerService.callAnthropicAPI(
              effectiveEndpoint,
              apiKey,
              modelId,
              messages,
              maxTokens,
              effectiveTemperature,
              timeout,
              responseFormat,
              reasoningDepth,
              cachePolicy,
            );

          case "google":
            return await this.apiCallerService.callGoogleAPI(
              effectiveEndpoint,
              apiKey,
              modelId,
              messages,
              maxTokens,
              effectiveTemperature,
              timeout,
              responseFormat,
              reasoningDepth,
            );

          case "xai":
            return await this.apiCallerService.callXAIAPI(
              effectiveEndpoint,
              apiKey,
              modelId,
              messages,
              maxTokens,
              effectiveTemperature,
              timeout,
              tokenParamName,
              responseFormat,
              reasoningDepth,
              outputSchema,
            );

          default:
            return await this.apiCallerService.callOpenAICompatibleAPI(
              effectiveEndpoint,
              apiKey,
              modelId,
              messages,
              maxTokens,
              effectiveTemperature,
              timeout,
              tokenParamName,
              responseFormat,
              reasoningDepth,
              outputSchema,
            );
        }
      };

      const result = await this.retryService.withExponentialBackoff(
        apiCall,
        `callAPIWithConfig [${modelId}]`,
        provider,
      );
      result.apiKeySource = apiKeySource;
      return result;
    } catch (error: unknown) {
      const httpErr = error as {
        type?: string;
        response?: { status: number; data: Record<string, unknown> };
      };
      let errorMsg = error instanceof Error ? error.message : String(error);
      let detailedError = "";

      // ★ Preserve AIError type for fallback decisions
      const classifiedErrorType = httpErr.type;

      if (httpErr.response) {
        const status = httpErr.response.status;
        const data = httpErr.response.data;
        const errorData = data?.error as Record<string, unknown> | undefined;
        const apiErrorMsg =
          errorData?.message || data?.message || JSON.stringify(data);
        detailedError = `Status: ${status}, API Error: ${apiErrorMsg}`;
        errorMsg = `${errorMsg} - ${detailedError}`;
      }

      this.logger.error(
        `[callAPIWithConfig] ${provider} API error for ${modelId}: ${errorMsg}`,
      );

      this.logger.debug(
        `[callAPIWithConfig] Failed request params - model: ${modelId}, endpoint: ${effectiveEndpoint?.substring(0, 50)}..., keySource: ${apiKeySource}`,
      );

      if (useStrictMode) {
        throw error;
      }

      return {
        content: `**${provider} API 调用失败**\n\n模型：${modelId}\n错误信息：${errorMsg}\n\n请稍后重试或检查 API 配置。`,
        model: modelId,
        tokensUsed: 0,
        isError: true,
        errorType: classifiedErrorType,
      };
    }
  }

  // ==================== 委托给提取的子服务 ====================

  /**
   * Test connection to an AI model with custom API key and endpoint
   * 委托给 AiConnectionTestService
   */
  async testModelConnectionWithKey(
    provider: string,
    modelId: string,
    apiKey: string,
    apiEndpoint: string,
    modelType?: string,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    if (this.connectionTestService) {
      return this.connectionTestService.testModelConnectionWithKey(
        provider,
        modelId,
        apiKey,
        apiEndpoint,
        modelType,
      );
    }
    return {
      success: false,
      message: "AiConnectionTestService not available",
    };
  }

  /**
   * Generate a chat completion using a specific API key
   * 委托给 AiDirectKeyService
   */
  async generateChatCompletionWithKey(options: {
    provider: string;
    modelId: string;
    apiKey: string;
    apiEndpoint?: string;
    systemPrompt?: string;
    messages: ChatMessage[];
    taskProfile?: TaskProfile;
    maxTokens?: number;
    temperature?: number;
    displayName?: string;
    capabilities?: string[];
    enableSearch?: boolean;
    responseFormat?: string;
  }): Promise<ChatCompletionResult> {
    if (this.directKeyService) {
      return this.directKeyService.generateChatCompletionWithKey(options);
    }
    return {
      content: "AiDirectKeyService not available",
      model: options.modelId,
      tokensUsed: 0,
      isError: true,
    };
  }

  /**
   * Check if the user message is requesting image generation
   * 委托给 AiImageGenerationService
   */
  isImageGenerationRequest(content: string): boolean {
    if (this.imageGenerationService) {
      return this.imageGenerationService.isImageGenerationRequest(content);
    }
    return false;
  }

  /**
   * Format a model ID into a user-friendly display name
   * 委托给 AiModelDiscoveryService
   */
  formatModelDisplayName(model: string): string {
    if (this.modelDiscoveryService) {
      return this.modelDiscoveryService.formatModelDisplayName(model);
    }
    return model;
  }

  /**
   * Get the environment variable name for a provider's API key
   * 委托给 AiModelDiscoveryService
   */
  getEnvVarNameForProvider(provider: string): string {
    if (this.modelDiscoveryService) {
      return this.modelDiscoveryService.getEnvVarNameForProvider(provider);
    }
    return `${provider.toUpperCase()}_API_KEY`;
  }

  /**
   * Fetch available models from a provider's API
   * 委托给 AiModelDiscoveryService
   */
  async fetchAvailableModels(
    provider: string,
    apiKey: string,
    apiEndpoint?: string,
    modelType?: string,
  ): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; description?: string }>;
    error?: string;
  }> {
    if (this.modelDiscoveryService) {
      return this.modelDiscoveryService.fetchAvailableModels(
        provider,
        apiKey,
        apiEndpoint,
        modelType,
      );
    }
    return {
      success: false,
      error: "AiModelDiscoveryService not available",
    };
  }

  // ==================== 统一入口 ====================

  /**
   * ★ 统一 chat 入口
   * AI App 可以通过两种方式指定模型：
   * 1. model: 直接指定模型 ID
   * 2. modelType: 指定模型类型，由 AI Engine 选择具体模型（推荐）
   */
  async chat(options: {
    messages: ChatMessage[];
    systemPrompt?: string;
    taskProfile?: TaskProfile;
    maxTokens?: number;
    temperature?: number;
    model?: string;
    modelType?: AIModelType;
    strictMode?: boolean;
    provider?: string;
    apiKey?: string;
    apiEndpoint?: string;
    displayName?: string;
    capabilities?: string[];
    enableSearch?: boolean;
    userId?: string;
    traceId?: string;
    responseFormat?: string;
    processId?: string;
    /** Skip input/output guardrails for internal system calls */
    skipGuardrails?: boolean;
    /** Prompt cache policy */
    cachePolicy?: "auto";
    /** Native structured output schema */
    outputSchema?: { type: "json_schema"; schema: Record<string, unknown> };
  }): Promise<{
    content: string;
    usage?: { totalTokens: number };
    model: string;
    isError?: boolean;
    apiKeySource?: "personal" | "donated" | "system";
  }> {
    const {
      messages,
      systemPrompt,
      taskProfile,
      maxTokens: providedMaxTokens,
      temperature: providedTemperature,
      model: providedModel,
      modelType,
      strictMode,
      provider,
      apiKey,
      apiEndpoint,
      displayName,
      capabilities,
      enableSearch,
      userId,
      traceId,
      responseFormat,
      processId: explicitProcessId,
      skipGuardrails,
      cachePolicy,
      outputSchema,
    } = options;

    // ★ KernelContext: fallback to AsyncLocalStorage if processId not explicitly provided
    const processId = explicitProcessId ?? KernelContext.getProcessId();

    // ★ Observability: Start trace span
    let spanId: string | undefined;
    if (this.traceCollector && traceId) {
      spanId = this.traceCollector.addSpan(traceId, {
        name: "ai-chat",
        type: "llm_call",
        metadata: {
          modelType,
          providedModel,
          messageCount: messages.length,
          hasSystemPrompt: !!systemPrompt,
          hasTaskProfile: !!taskProfile,
        },
      });
    }

    // ★ 路径分叉：如果提供了 apiKey，使用直接 API 调用路径 (Path B)
    if (apiKey && provider) {
      if (!this.directKeyService) {
        this.logger.error(
          "[chat] Path B (BYOK) requested but AiDirectKeyService not available",
        );
        return {
          content:
            "BYOK (Bring Your Own Key) feature is not available. Please contact administrator.",
          model: providedModel || "unknown",
          usage: { totalTokens: 0 },
          isError: true,
        };
      }
      this.logger.debug(
        `[chat] Using direct API key path for provider: ${provider}`,
      );

      // ★ Guardrails: Input validation for BYOK path (skip for internal system calls)
      if (!skipGuardrails) {
        const inputGuardrailResult = await this.runInputGuardrails(messages, {
          provider,
          modelId: providedModel,
          spanId,
          pathName: "BYOK",
        });
        if (!inputGuardrailResult.passed) {
          return {
            content: `Request blocked by content safety guardrail: ${inputGuardrailResult.blockedBy}`,
            model: providedModel || "unknown",
            usage: { totalTokens: 0 },
            isError: true,
          };
        }
      }

      try {
        const result = await this.generateChatCompletionWithKey({
          provider,
          modelId: providedModel || "default",
          apiKey,
          apiEndpoint,
          systemPrompt,
          messages,
          taskProfile,
          maxTokens: providedMaxTokens,
          temperature: providedTemperature,
          displayName,
          capabilities,
          enableSearch,
          responseFormat,
        });

        // ★ Guardrails: Output validation for BYOK path (skip for internal system calls)
        if (!skipGuardrails && !result.isError) {
          const outputGuardrailResult = await this.runOutputGuardrails(
            result.content,
            result.model,
            {
              spanId,
              tokensUsed: result.tokensUsed,
              pathName: "BYOK",
            },
          );
          if (!outputGuardrailResult.passed) {
            return {
              content: "Response filtered by content safety guardrail",
              usage: { totalTokens: result.tokensUsed },
              model: result.model,
              isError: true,
            };
          }
        }

        // ★ Observability: End trace span
        if (this.traceCollector && spanId) {
          this.traceCollector.endSpan(spanId, {
            status: result.isError ? "error" : "success",
            output: {
              model: result.model,
              tokensUsed: result.tokensUsed,
            },
          });
        }

        return {
          content: result.content,
          usage: { totalTokens: result.tokensUsed },
          model: result.model,
          isError: result.isError,
        };
      } catch (error) {
        // ★ Observability: End trace span on error
        if (this.traceCollector && spanId) {
          this.traceCollector.endSpan(spanId, {
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
        throw error;
      }
    }

    // ★ Path A: 系统配置调用
    let model: string;
    let modelConfig: AIModelConfig | null = null;

    if (providedModel) {
      model = providedModel;
      modelConfig = await this.getModelConfig(model);
    } else if (modelType) {
      modelConfig = await this.getDefaultModelByType(modelType);
      if (modelConfig) {
        model = modelConfig.modelId;
        this.logger.debug(
          `[chat] Using ${modelType} model from database: ${model}`,
        );
      } else {
        model = this.configService.get<string>("DEFAULT_AI_MODEL", "gemini");
        this.logger.warn(
          `[chat] No ${modelType} model found, falling back to ${model}`,
        );
      }
    } else {
      model = this.configService.get<string>("DEFAULT_AI_MODEL", "gemini");
      modelConfig = await this.getModelConfig(model);
    }

    // ★ 参数解析优先级链
    let effectiveMaxTokens: number;
    let effectiveTemperature: number;
    let effectiveReasoningDepth: import("../types").ReasoningDepth | undefined;

    if (providedMaxTokens !== undefined || providedTemperature !== undefined) {
      effectiveMaxTokens = providedMaxTokens ?? modelConfig?.maxTokens ?? 4096;
      effectiveTemperature =
        providedTemperature ?? modelConfig?.temperature ?? 0.7;

      this.logger.debug(
        `[chat] Using direct parameters: temp=${effectiveTemperature}, maxTokens=${effectiveMaxTokens}`,
      );
    } else if (taskProfile) {
      const mappedParams = this.taskProfileMapper.mapToParameters(
        taskProfile,
        modelConfig,
      );
      effectiveMaxTokens = mappedParams.maxTokens;
      effectiveTemperature = mappedParams.temperature;
      effectiveReasoningDepth = mappedParams.reasoningDepth;

      this.logger.debug(
        `[chat] TaskProfile mapped: ${JSON.stringify(taskProfile)} → ` +
          `temp=${effectiveTemperature}, maxTokens=${effectiveMaxTokens}`,
      );
    } else {
      const defaultParams = this.taskProfileMapper.mapToParameters(
        undefined,
        modelConfig,
      );
      effectiveMaxTokens = defaultParams.maxTokens;
      effectiveTemperature = defaultParams.temperature;

      this.logger.debug(
        `[chat] Using model defaults: temp=${effectiveTemperature}, maxTokens=${effectiveMaxTokens}`,
      );
    }

    this.logger.debug(
      `[chat] Final: model=${model}, maxTokens=${effectiveMaxTokens}, ` +
        `temperature=${effectiveTemperature}, isReasoning=${modelConfig?.isReasoning ?? false}`,
    );

    // ★ Guardrails: Input validation (skip for internal system calls)
    if (!skipGuardrails) {
      const inputGuardrailResult = await this.runInputGuardrails(messages, {
        modelType,
        model,
        spanId,
        pathName: "Standard",
      });
      if (!inputGuardrailResult.passed) {
        return {
          content: `Request blocked by content safety guardrail: ${inputGuardrailResult.blockedBy}`,
          model,
          usage: { totalTokens: 0 },
          isError: true,
        };
      }
    }

    // ★ Fallback 机制
    const triedModelIds: string[] = [];
    let lastError: string | null = null;
    let currentModel = model;
    let currentModelConfig = modelConfig;

    const maxFallbackAttempts = 5;

    for (let attempt = 0; attempt < maxFallbackAttempts; attempt++) {
      triedModelIds.push(currentModel);

      this.logger.debug(
        `[chat] Attempt ${attempt + 1}/${maxFallbackAttempts}: trying model ${currentModel}`,
      );

      const startTime = Date.now();
      const result = await this.generateChatCompletion({
        model: currentModel,
        systemPrompt,
        messages,
        maxTokens: effectiveMaxTokens,
        temperature: effectiveTemperature,
        strictMode,
        userId,
        responseFormat,
        reasoningDepth: effectiveReasoningDepth,
        cachePolicy,
        outputSchema,
      });
      const duration = Date.now() - startTime;

      this.recordLLMMetrics({
        modelId: currentModel,
        providerId: currentModelConfig?.provider,
        userId,
        duration,
        totalTokens: result.tokensUsed,
        success: !result.isError,
        errorCode: result.isError ? "LLM_CALL_FAILED" : undefined,
        errorMsg: result.isError ? result.content.substring(0, 500) : undefined,
      });

      if (!result.isError) {
        // ★ Circuit Breaker: Record success
        if (this.circuitBreaker) {
          this.circuitBreaker.recordSuccess(currentModel, duration);
        }

        // ★ Kernel: Record LLM call event, cost, and metrics
        if (processId && this.eventJournal) {
          void this.eventJournal
            .record(processId, "LLM_CALL", {
              model: currentModel,
              tokens: result.tokensUsed,
              latencyMs: duration,
            })
            .catch((err) =>
              this.logger.debug("Process event emission failed", err),
            );
        }
        if (processId && this.costAttribution) {
          this.costAttribution.recordCost({
            userId: userId ?? "",
            moduleType: "ai-engine",
            model: currentModel,
            provider: currentModelConfig?.provider ?? "",
            inputTokens: 0,
            outputTokens: result.tokensUsed,
            estimatedCost: KernelMetricsService.estimateCost(
              currentModel,
              0,
              result.tokensUsed,
            ),
          });
        }
        if (this.kernelMetrics) {
          this.kernelMetrics.recordLLMCall({
            model: currentModel,
            provider: currentModelConfig?.provider ?? "",
            modelType: modelType ?? "CHAT",
            module: "ai-engine",
            operation: "chat",
            userId,
            inputTokens: 0,
            outputTokens: result.tokensUsed,
            totalTokens: result.tokensUsed,
            latencyMs: duration,
            estimatedCost: KernelMetricsService.estimateCost(
              currentModel,
              0,
              result.tokensUsed,
            ),
            success: true,
            fallbackUsed: attempt > 0,
            retryCount: attempt,
          });
        }

        // ★ Guardrails: Output validation (skip for internal system calls)
        if (!skipGuardrails) {
          const outputGuardrailResult = await this.runOutputGuardrails(
            result.content,
            result.model,
            {
              spanId,
              tokensUsed: result.tokensUsed,
              pathName: "Standard",
            },
          );
          if (!outputGuardrailResult.passed) {
            return {
              content: "Response filtered by content safety guardrail",
              usage: { totalTokens: result.tokensUsed },
              model: result.model,
              isError: true,
            };
          }
        }

        if (attempt > 0) {
          this.logger.log(
            `[chat] Fallback successful: ${currentModel} (after ${attempt} failed attempts)`,
          );
        }

        // ★ Observability: End trace span on success
        if (this.traceCollector && spanId) {
          this.traceCollector.endSpan(spanId, {
            status: "success",
            output: {
              model: result.model,
              tokensUsed: result.tokensUsed,
              apiKeySource: result.apiKeySource,
              attemptCount: attempt + 1,
            },
          });
        }

        return {
          content: result.content,
          usage: { totalTokens: result.tokensUsed },
          model: result.model,
          isError: false,
          apiKeySource: result.apiKeySource,
        };
      }

      lastError = result.content;
      this.logger.warn(
        `[chat] Model ${currentModel} failed: ${result.content.slice(0, 100)}...`,
      );

      // ★ Circuit Breaker: Record failure (prefer preserved errorType over string parsing)
      if (this.circuitBreaker) {
        const errorType = result.errorType
          ? this.mapAIErrorTypeToTaskCompletion(result.errorType)
          : this.circuitBreaker.parseErrorType(result.content);
        this.circuitBreaker.recordFailure(
          currentModel,
          errorType,
          result.content,
        );
      }

      // ★ Kernel: Record LLM error event and metrics
      if (processId && this.eventJournal) {
        void this.eventJournal
          .record(processId, "LLM_ERROR", {
            model: currentModel,
            error: result.content.substring(0, 200),
          })
          .catch((err) =>
            this.logger.debug("Process event emission failed", err),
          );
      }
      if (this.kernelMetrics) {
        this.kernelMetrics.recordLLMCall({
          model: currentModel,
          provider: currentModelConfig?.provider ?? "",
          modelType: modelType ?? "CHAT",
          module: "ai-engine",
          operation: "chat",
          userId,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          latencyMs: duration,
          estimatedCost: 0,
          success: false,
          error: result.content.substring(0, 200),
          fallbackUsed: attempt > 0,
          retryCount: attempt,
        });
      }

      // 获取其他可用的同类型模型
      if (modelType) {
        const alternativeModels =
          await this.modelConfigService.getAllEnabledModelsByType(
            modelType,
            triedModelIds,
          );

        // ★ Circuit Breaker: Filter out models with OPEN circuit breakers
        const availableModels = this.circuitBreaker
          ? alternativeModels.filter((config) =>
              this.circuitBreaker!.canExecute(config.modelId),
            )
          : alternativeModels;

        if (availableModels.length < alternativeModels.length) {
          this.logger.debug(
            `[chat] CircuitBreaker filtered out ${alternativeModels.length - availableModels.length} model(s) with OPEN circuits`,
          );
        }

        if (availableModels.length > 0) {
          currentModelConfig = availableModels[0];
          currentModel = currentModelConfig.modelId;
          this.logger.log(
            `[chat] Falling back to alternative model: ${currentModel} (${currentModelConfig.provider})`,
          );
          continue;
        }
      }

      this.logger.warn(
        `[chat] No more alternative models available. Tried: ${triedModelIds.join(", ")}`,
      );
      break;
    }

    this.logger.error(
      `[chat] All ${triedModelIds.length} models failed. Last error: ${lastError?.slice(0, 100)}`,
    );

    // ★ Observability: End trace span on all models failed
    if (this.traceCollector && spanId) {
      this.traceCollector.endSpan(spanId, {
        status: "error",
        error: `All ${triedModelIds.length} models failed: ${lastError?.slice(0, 200)}`,
        output: { triedModels: triedModelIds },
      });
    }

    return {
      content: lastError || "所有可用模型均调用失败，请检查 API 配置",
      usage: { totalTokens: 0 },
      model: currentModel,
      isError: true,
    };
  }

  // ==================== 流式输出 ====================

  /**
   * ★ 流式聊天
   * 支持真正的 SSE 流式响应
   */
  async *chatStream(options: {
    messages: ChatMessage[];
    model?: string;
    modelType?: AIModelType;
    taskProfile?: TaskProfile;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    userId?: string;
    /** Skip input/output guardrails for internal system calls */
    skipGuardrails?: boolean;
  }): AsyncGenerator<
    {
      content: string;
      done: boolean;
      error?: string;
      apiKeySource?: "personal" | "donated" | "system";
      usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    },
    void
  > {
    const {
      messages,
      systemPrompt,
      model: inputModel,
      modelType,
      taskProfile,
    } = options;

    // 解析模型
    let model = inputModel;
    if (!model && modelType) {
      const modelConfig = await this.getDefaultModelByType(modelType);
      model = modelConfig?.modelId;
    }
    if (!model) {
      const defaultConfig = await this.getDefaultModelConfig();
      model = defaultConfig?.modelId || "";
    }

    // 获取模型配置
    const modelConfig = await this.getModelConfig(model);
    if (!modelConfig) {
      yield {
        content: `模型 ${model} 未在数据库中配置`,
        done: true,
        error: "MODEL_NOT_CONFIGURED",
      };
      return;
    }

    // ★ BYOK: 使用优先级解析 API Key
    const resolved = await this.modelConfigService.resolveApiKey(
      modelConfig,
      options.userId,
    );
    const apiKey = resolved?.apiKey || null;
    const streamApiKeySource = resolved?.source;
    const effectiveStreamEndpoint =
      resolved?.apiEndpoint || modelConfig.apiEndpoint;
    if (!apiKey) {
      yield {
        content: `模型 ${model} 的 API Key 未配置（直接输入或 Secret Manager 均未找到）`,
        done: true,
        error: "API_KEY_NOT_CONFIGURED",
      };
      return;
    }

    // 应用 taskProfile
    let effectiveMaxTokens = options.maxTokens;
    let effectiveTemperature = options.temperature;

    if (taskProfile) {
      const mapped = this.taskProfileMapper.mapToParameters(
        taskProfile,
        modelConfig,
      );
      effectiveMaxTokens = effectiveMaxTokens ?? mapped.maxTokens;
      effectiveTemperature = effectiveTemperature ?? mapped.temperature;
    }

    effectiveMaxTokens = effectiveMaxTokens || 4000;
    effectiveTemperature = effectiveTemperature ?? 0.7;

    // 构建消息
    const fullMessages: ChatMessage[] = [];
    if (systemPrompt) {
      fullMessages.push({ role: "system", content: systemPrompt });
    }
    fullMessages.push(...messages);

    // 根据 provider 选择流式调用方法
    const apiFormat = this.getApiFormatForProvider(modelConfig.provider);

    // ★ Circuit Breaker: Track load for streaming calls
    if (this.circuitBreaker) {
      this.circuitBreaker.incrementLoad(model);
    }
    const streamStartTime = Date.now();

    // ★ 累积流式输出内容（用于 Guardrails 和 token 估算）
    let accumulatedContent = "";
    let streamUsage:
      | { promptTokens: number; completionTokens: number; totalTokens: number }
      | undefined;

    try {
      // 根据 apiFormat 选择流式处理器
      let streamGenerator: AsyncGenerator<
        {
          content: string;
          done: boolean;
          error?: string;
          usage?: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
          };
        },
        void
      >;

      if (apiFormat === "openai") {
        const tokenParamName =
          modelConfig.tokenParamName ||
          (modelConfig.isReasoning ? "max_completion_tokens" : "max_tokens");
        streamGenerator = this.streamHandlerService.streamOpenAICompatible(
          effectiveStreamEndpoint,
          apiKey,
          modelConfig.modelId,
          fullMessages,
          effectiveMaxTokens,
          effectiveTemperature,
          tokenParamName,
        );
      } else if (apiFormat === "anthropic") {
        streamGenerator = this.streamHandlerService.streamAnthropic(
          effectiveStreamEndpoint,
          apiKey,
          modelConfig.modelId,
          fullMessages,
          effectiveMaxTokens,
          effectiveTemperature,
        );
      } else {
        // 不支持流式的 provider，回退到非流式
        const result = await this.chat({
          messages,
          model,
          taskProfile,
          systemPrompt,
          maxTokens: effectiveMaxTokens,
          temperature: effectiveTemperature,
          userId: options.userId,
        });
        yield {
          content: result.content,
          done: true,
          apiKeySource: result.apiKeySource,
        };
        return;
      }

      // ★ 遍历流式 chunks，累积内容
      for await (const chunk of streamGenerator) {
        if (chunk.error) {
          yield chunk;
          return;
        }

        // 累积内容
        if (chunk.content) {
          accumulatedContent += chunk.content;
        }

        // 提取 usage 信息
        if (chunk.usage) {
          streamUsage = chunk.usage;
        }

        // 如果不是最后一个 chunk，直接 yield
        if (!chunk.done) {
          yield chunk;
        }
      }

      // ★ Guardrails: Output validation (skip for internal system calls)
      if (
        !options.skipGuardrails &&
        this.guardrailsPipeline &&
        this.configService.get<string>("GUARDRAILS_ENABLED") !== "false" &&
        accumulatedContent
      ) {
        try {
          const outputResult = await this.guardrailsPipeline.processOutput({
            content: accumulatedContent,
            modelId: model,
          });
          if (!outputResult.passed) {
            this.logger.warn(
              `[chatStream] Output blocked by guardrail: ${outputResult.blockedBy}`,
            );

            // Note: guardrails block is NOT a model failure — do not record in Circuit Breaker

            yield {
              content: "",
              done: true,
              error: `内容违反安全策略: ${outputResult.blockedBy}`,
            };
            return;
          }
        } catch (guardrailsError) {
          const errMsg =
            guardrailsError instanceof Error
              ? guardrailsError.message
              : String(guardrailsError);
          this.logger.error(
            `[chatStream] Guardrails processing error: ${errMsg}`,
          );
          // 不阻塞输出，继续返回结果
        }
      }

      // ★ Circuit Breaker: Record success after stream completes
      if (this.circuitBreaker) {
        this.circuitBreaker.recordSuccess(model, Date.now() - streamStartTime);
      }

      // ★ 流式完成后，发出一个带 apiKeySource 和 usage 的终止信号
      yield {
        content: "",
        done: true,
        apiKeySource: streamApiKeySource,
        usage: streamUsage,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[chatStream] Stream error: ${errorMsg}`);

      // ★ Circuit Breaker: Record failure on stream error
      if (this.circuitBreaker) {
        const errorType = this.circuitBreaker.parseErrorType(errorMsg);
        this.circuitBreaker.recordFailure(model, errorType, errorMsg);
      }

      yield { content: "", done: true, error: errorMsg };
    } finally {
      // ★ Circuit Breaker: Always release load when stream ends
      if (this.circuitBreaker) {
        this.circuitBreaker.decrementLoad(model);
      }
    }
  }

  // ==================== Guardrails 私有方法 ====================

  /**
   * 运行输入 Guardrails 检查
   * 从 Path A 和 Path B 提取的通用逻辑
   *
   * @param messages - 聊天消息列表
   * @param context - 上下文信息（可选，用于日志和追踪）
   * @returns Guardrail 检查结果，如果通过则返回 null
   */
  private async runInputGuardrails(
    messages: ChatMessage[],
    context?: {
      modelType?: AIModelType;
      model?: string;
      provider?: string;
      modelId?: string;
      spanId?: string;
      pathName?: string; // 'BYOK' or 'Standard'
    },
  ): Promise<{
    passed: boolean;
    blockedBy?: string;
  }> {
    if (
      !this.guardrailsPipeline ||
      this.configService.get<string>("GUARDRAILS_ENABLED") === "false"
    ) {
      return { passed: true };
    }

    const userContent = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");

    try {
      const inputResult = await this.guardrailsPipeline.processInput({
        content: userContent,
        context: {
          modelType: context?.modelType,
          model: context?.model,
          provider: context?.provider,
          modelId: context?.modelId,
        },
      });

      if (!inputResult.passed) {
        const pathLabel = context?.pathName || "chat";
        this.logger.warn(
          `[${pathLabel}] Input blocked by guardrail: ${inputResult.blockedBy}`,
        );

        // ★ Observability: End trace span on guardrail block
        if (this.traceCollector && context?.spanId) {
          this.traceCollector.endSpan(context.spanId, {
            status: "error",
            error: `Blocked by guardrail: ${inputResult.blockedBy}`,
          });
        }

        return {
          passed: false,
          blockedBy: inputResult.blockedBy,
        };
      }

      return { passed: true };
    } catch (error) {
      const pathLabel = context?.pathName || "chat";
      this.logger.error(
        `[${pathLabel}] Guardrail input check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      // 检查失败时允许继续（fail-open 策略）
      return { passed: true };
    }
  }

  /**
   * 运行输出 Guardrails 检查
   * 从 Path A 和 Path B 提取的通用逻辑
   *
   * @param content - AI 生成的内容
   * @param modelId - 使用的模型 ID
   * @param context - 上下文信息（可选，用于日志和追踪）
   * @returns Guardrail 检查结果，如果通过则返回 null
   */
  private async runOutputGuardrails(
    content: string,
    modelId: string,
    context?: {
      spanId?: string;
      tokensUsed?: number;
      pathName?: string; // 'BYOK' or 'Standard'
    },
  ): Promise<{
    passed: boolean;
    blockedBy?: string;
  }> {
    if (
      !this.guardrailsPipeline ||
      this.configService.get<string>("GUARDRAILS_ENABLED") === "false"
    ) {
      return { passed: true };
    }

    try {
      const outputResult = await this.guardrailsPipeline.processOutput({
        content,
        modelId,
      });

      if (!outputResult.passed) {
        const pathLabel = context?.pathName || "chat";
        this.logger.warn(
          `[${pathLabel}] Output blocked by guardrail: ${outputResult.blockedBy}`,
        );

        // ★ Observability: End trace span on guardrail block
        if (this.traceCollector && context?.spanId) {
          this.traceCollector.endSpan(context.spanId, {
            status: "error",
            error: `Output blocked by guardrail: ${outputResult.blockedBy}`,
            output: {
              model: modelId,
              tokensUsed: context?.tokensUsed,
            },
          });
        }

        return {
          passed: false,
          blockedBy: outputResult.blockedBy,
        };
      }

      return { passed: true };
    } catch (error) {
      const pathLabel = context?.pathName || "chat";
      this.logger.error(
        `[${pathLabel}] Guardrail output check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      // 检查失败时允许继续（fail-open 策略）
      return { passed: true };
    }
  }
}
