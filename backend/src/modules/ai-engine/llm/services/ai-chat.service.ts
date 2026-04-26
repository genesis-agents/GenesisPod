import {
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiServiceUnavailableError } from "../../core/exceptions";
import { AIModelType } from "@prisma/client";
import { RequestContext } from "../../../../common/context/request-context";
import { TaskProfile, ChatMessage } from "../types";
import { TaskProfileMapperService } from "./task-profile-mapper.service";
import { AiModelConfigService, AIModelConfig } from "./ai-model-config.service";
import { AiApiCallerService } from "./ai-api-caller.service";
import { AiStreamHandlerService } from "./ai-stream-handler.service";
import { AIMetricsService } from "../../../ai-infra/facade";
import { GuardrailsPipelineService } from "../../safety/guardrails/guardrails-pipeline.service";
// ★ L2 ai-engine 内部代码禁止从 @/modules/ai-engine/facade 导入 —— facade 是 L3
// AI App 的单向入口，L2 自己走 facade barrel 会触发 barrel → 50+ 子模块 → L2
// 的回环加载，在 module-evaluation 阶段产生 undefined class ref，Nest DI 随后
// 报 "LlmExecutor dependency at index [0]"。全部改直接相对路径。
import {
  CircuitBreakerService,
  TaskCompletionType,
} from "../../runtime/resource/circuit-breaker.service";
import { TraceCollectorService } from "../../runtime/observability/trace-collector.service";
// ★ 拆分后的子服务
import { AiConnectionTestService } from "./ai-connection-test.service";
import { AiModelDiscoveryService } from "./ai-model-discovery.service";
import { AiDirectKeyService } from "./ai-direct-key.service";
import { AiImageGenerationService } from "./ai-image-generation.service";
import { AiChatRetryService } from "./ai-chat-retry.service";
import { EventJournalService } from "../../runtime/journal/event-journal.service";
import { CostAttributionService } from "../../runtime/observability/cost-attribution.service";
import { AiObservabilityService } from "../../runtime/observability/ai-observability.service";
import { KernelContext } from "../../../../common/context/kernel-context";
import { SessionLatencyTrackerService } from "../../runtime/observability/session-latency-tracker.service";
import { KeyResolverService } from "../../../ai-infra/key-resolver/key-resolver.service";
import {
  BYOKError,
  InvalidApiKeyError,
  NoAvailableKeyError,
  QuotaExceededError,
} from "../../../ai-infra/key-resolver/key-resolver.errors";

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
  /** 输入 token 数 */
  inputTokens?: number;
  /** 输出 token 数 */
  outputTokens?: number;
  /** Prompt Cache 写入 token 数（Anthropic） */
  cacheCreationTokens?: number;
  /** Prompt Cache 命中 token 数（Anthropic / OpenAI） */
  cacheReadTokens?: number;
  /** API 返回的完成原因（"stop"=正常完成, "length"=截断） */
  finishReason?: string;
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
/**
 * AiChatService.chat 的入参类型（供外部 wrapper / observer 直接引用，避免 Parameters<> 自引用）
 */
export interface ChatOptions {
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
  /** Shared cache prefix from PromptCacheCoordinatorService — uses frozen system prompt + tools */
  sharedCachePrefix?: {
    systemPromptText: string;
    toolDefinitions?: unknown[];
  };
  /** 操作名称 — 用于时延跟踪标识 step */
  operationName?: string;
  /**
   * AbortSignal — 用户取消 / 超时 / budget 耗尽时提前中止当次调用。
   *
   * 实施说明（Gate 1 决策）：
   * - 接受 signal 是 backward-compat overload；既有调用方不传 signal 行为不变
   * - AiChatService 在调用下游 API / stream 前检查 signal.aborted；
   *   已在途的 HTTP 请求不保证立刻 abort（需要 fetch 层 propagate）
   * - 最小语义：signal.aborted 时抛 DOMException("...", "AbortError")
   */
  signal?: AbortSignal;
}

/**
 * AiChatService.chat 的返回类型
 */
export interface ChatResult {
  content: string;
  usage?: {
    totalTokens: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  };
  model: string;
  finishReason?: string;
  isError?: boolean;
  apiKeySource?: "personal" | "donated" | "system";
}

/**
 * Chat 调用观察者事件（observer pattern）
 *
 * 订阅 AiChatService.chat 的入参 / 返回值 / 异常 / 延迟，用于：
 * - Topic Insights baseline 录制（fixture 对比）
 * - 调试 / 审计场景
 *
 * 订阅通过 `addChatObserver(fn)`，解除用 `removeChatObserver(fn)`。
 * Observer 函数抛错会被 catch 并降级为 warn log，不影响 chat 主流程。
 */
export interface ChatObserverEvent {
  options: ChatOptions;
  result?: ChatResult;
  error?: Error;
  durationMs: number;
  /** 便于观察者从 KernelContext 取 missionId / baselineTag 之外直接拿到 */
  kernelContext?: import("../../../../common/context/kernel-context").KernelContextData;
}

export type ChatObserver = (event: ChatObserverEvent) => void;

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  /** Chat 观察者列表 — 非生产热路径，Set 保持去重 + 插入顺序 */
  private readonly chatObservers = new Set<ChatObserver>();

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
    @Optional() private readonly kernelMetrics?: AiObservabilityService,
    @Optional()
    private readonly latencyTracker?: SessionLatencyTrackerService,
    @Optional() private readonly keyResolver?: KeyResolverService,
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
   * 自动将 LLM 调用记录到 KernelContext 中活跃的 LatencySession（如有）
   */
  private recordToLatencySession(
    model: string,
    provider: string,
    durationMs: number,
    totalTokens: number,
    streaming: boolean,
    ttftMs?: number,
    inputTokens?: number,
    outputTokens?: number,
    operationName?: string,
  ): void {
    if (!this.latencyTracker) return;
    const ctx = KernelContext.get();
    if (!ctx?.latencySessionId) return;

    this.latencyTracker.recordAction(ctx.latencySessionId, {
      stepId: ctx.latencyPhaseId, // 显式传 stepId，避免 getActiveStepId 的并发竞争
      name: operationName || "llm_call",
      type: "llm_call",
      model,
      provider,
      streaming,
      ttftMs,
      ttltMs: durationMs,
      totalDurationMs: durationMs,
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? (totalTokens || 0),
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
      // CLAUDE.md 红线：fallback 模型名必须为空字符串，由下游 UserModelResolver
      // 从 DB 解析。绝不硬编码 "gemini" / "gpt-4" 等字面量，否则 DB 没配对应
      // 模型时会把一个根本不存在的 modelId 透传下去并报"模型未配置"。
      targetModel =
        targetModel || this.configService.get<string>("DEFAULT_AI_MODEL", "");
      if (!targetModel) {
        throw new AiServiceUnavailableError(
          "AI 服务不可用：没有可用模型。请在数据库中至少配置 1 个启用的 AI 模型，或设置 DEFAULT_AI_MODEL 环境变量。",
          "",
        );
      }
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
        // maxTokens=10 之前在推理模型上经常 truncate 到空输出（o1/o3/gpt-5
        // 系列会先消耗 reasoning tokens 再出可见内容）。100 是覆盖绝大多数
        // provider 最小 output buffer 的安全值，同时成本可忽略。
        maxTokens: 100,
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
   *
   * @deprecated 这个方法曾经返回硬编码字面量（"grok"/"gpt-4"/"claude"/"gemini"）
   * 作为"有 key 就算有模型"的粗略信号，但字面量本身不是 DB 中的真实 modelId，
   * 透传下去必然导致"模型未配置"错误。**永远不要用返回值做模型名**——只用来
   * 做"是否有任意 provider 凭证"的布尔判断；要拿真正的 modelId 请用
   * `getAvailableModelsAsync()` 或 `AiModelConfigService.getEnabledModels()`。
   */
  getAvailableProviders(): string[] {
    const providers: string[] = [];
    if (this.configService.get<string>("XAI_API_KEY")) providers.push("xai");
    if (this.configService.get<string>("OPENAI_API_KEY"))
      providers.push("openai");
    if (this.configService.get<string>("ANTHROPIC_API_KEY"))
      providers.push("anthropic");
    if (this.configService.get<string>("GOOGLE_AI_API_KEY"))
      providers.push("google");
    return providers;
  }

  /**
   * @deprecated Use {@link getAvailableProviders} + {@link getAvailableModelsAsync}.
   * Kept only as a thin alias because a handful of legacy callers still
   * destructure the returned array — they should migrate before the next
   * minor release. Never use the returned strings as model ids.
   */
  getAvailableModels(): string[] {
    return this.getAvailableProviders();
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
              useStrictMode,
              isReasoning,
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
              useStrictMode,
              isReasoning,
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
              useStrictMode,
              isReasoning,
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

      const status = httpErr.response?.status;
      const data = httpErr.response?.data;
      const apiErrorPayload = data?.error as
        | { message?: string; code?: string; type?: string }
        | undefined;
      const apiErrorMsg =
        apiErrorPayload?.message || (data?.message as string) || "";

      if (status !== undefined) {
        detailedError = `Status: ${status}, API Error: ${
          apiErrorMsg || JSON.stringify(data)
        }`;
        errorMsg = `${errorMsg} - ${detailedError}`;
      }

      this.logger.error(
        `[callAPIWithConfig] ${provider} API error for ${modelId}: ${errorMsg}`,
      );

      this.logger.debug(
        `[callAPIWithConfig] Failed request params - model: ${modelId}, endpoint: ${effectiveEndpoint?.substring(0, 50)}..., keySource: ${apiKeySource}`,
      );

      // ★ BYOK：用户自己的 Key 或管理员分配的 Key 被 Provider 拒绝时，
      // 抛成特定的 BYOKError，让 HTTP 层返回 403 + code，前端全局
      // Modal 弹出引导卡片，而不是把错误文本当 AI 回复渲染。
      // source === "system" 时（管理员走系统 Secret）保留原有的 isError 行为。
      const isUserScopedKey =
        apiKeySource === "personal" || apiKeySource === "donated";
      const source =
        apiKeySource === "personal"
          ? "PERSONAL"
          : apiKeySource === "donated"
            ? "ASSIGNED"
            : "SYSTEM";

      if (isUserScopedKey && status !== undefined) {
        const isAuthError =
          status === 401 ||
          apiErrorPayload?.code === "invalid_api_key" ||
          apiErrorPayload?.type === "invalid_request_error";
        const isQuotaError =
          status === 429 ||
          apiErrorPayload?.code === "insufficient_quota" ||
          /quota|billing|exceeded/i.test(apiErrorMsg);

        if (isAuthError && !isQuotaError) {
          throw new InvalidApiKeyError(provider, source, {
            meta: { providerMessage: apiErrorMsg, status },
          } as never);
        }
        if (isQuotaError) {
          throw new QuotaExceededError(provider, source, {
            providerMessage: apiErrorMsg,
            status,
          } as never);
        }
      }

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

  // ==================== Observer pattern（chat 调用观察）====================

  /**
   * 注册 chat 调用观察者。
   *
   * 返回一个 dispose 函数；调用 dispose 等同于 `removeChatObserver(fn)`。
   * 典型消费者：Topic Insights baseline 录制（通过 KernelContext.missionId 过滤）。
   */
  addChatObserver(fn: ChatObserver): () => void {
    this.chatObservers.add(fn);
    return () => this.chatObservers.delete(fn);
  }

  removeChatObserver(fn: ChatObserver): boolean {
    return this.chatObservers.delete(fn);
  }

  private dispatchChatObservers(event: ChatObserverEvent): void {
    if (this.chatObservers.size === 0) return;
    for (const observer of this.chatObservers) {
      try {
        observer(event);
      } catch (err) {
        this.logger.warn(
          `[chat] Observer threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // ==================== 统一入口 ====================

  /**
   * ★ 统一 chat 入口
   * AI App 可以通过两种方式指定模型：
   * 1. model: 直接指定模型 ID
   * 2. modelType: 指定模型类型，由 AI Engine 选择具体模型（推荐）
   *
   * 本方法是 thin wrapper：委托 `chatInner` 执行，并在 `finally` 调用观察者。
   * Observer 故障不影响主流程返回。
   */
  async chat(options: ChatOptions): Promise<ChatResult> {
    const startedAt = Date.now();
    let result: ChatResult | undefined;
    let error: Error | undefined;
    try {
      result = await this.chatInner(options);
      return result;
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
      throw e;
    } finally {
      this.dispatchChatObservers({
        options,
        result,
        error,
        durationMs: Date.now() - startedAt,
        kernelContext: KernelContext.get(),
      });
    }
  }

  /**
   * Chat 主逻辑（原 `chat` 方法 body）
   * 拆分动机：外层 `chat()` 负责 observer dispatch，本方法保持单一职责。
   */
  private async chatInner(options: ChatOptions): Promise<ChatResult> {
    // ★ AbortSignal fast-path check
    if (options.signal?.aborted) {
      throw new DOMException("AiChatService.chat aborted", "AbortError");
    }
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
      userId: rawUserId,
      traceId,
      responseFormat,
      processId: explicitProcessId,
      skipGuardrails,
      cachePolicy,
      outputSchema,
      sharedCachePrefix,
    } = options;

    // ★ BYOK v2 防呆：普通路径必须有 userId（来自参数或 RequestContext）。
    // 直连路径（BYOK direct，apiKey+provider 都显式传入）豁免，因为它自带 Key 不走 Resolver。
    // 异步任务 / Cron 漏写 withUserContext 时会在这里被立即拦截，而非静默走系统 Secret。
    //
    // ★★ 关键：把 options.userId 和 RequestContext.userId 合并到 `userId` 后再往下游传，
    //    否则"参数没传但 middleware 已经设 ctx"的调用链会让下游 resolveApiKey 拿到 undefined，
    //    进入过渡路径误用系统 Secret。
    const isDirectBYOKPath = !!(apiKey && provider);
    const ctxUserId = RequestContext.getUserId();
    const userId: string | undefined = rawUserId ?? ctxUserId;
    if (!isDirectBYOKPath && !userId) {
      this.logger.error(
        "[chat] Refused: no userId in params nor RequestContext. " +
          "Async tasks must wrap the call in withUserContext(userId, ...) " +
          "so KeyResolver can route to PERSONAL/ASSIGNED (user) or SYSTEM (admin).",
      );
      throw new UnauthorizedException(
        "BYOK v2: userId is required. Wrap async calls in withUserContext.",
      );
    }

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
          usage: {
            totalTokens: result.tokensUsed,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            cacheCreationTokens: result.cacheCreationTokens,
            cacheReadTokens: result.cacheReadTokens,
          },
          model: result.model,
          finishReason: result.finishReason,
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

    // ★ BYOK v2：按用户可用 provider 过滤，保证初始模型选择就命中用户有 Key 的 provider。
    // 管理员 / BYOK 直连 / 无 userId 的老路径不过滤。
    const effectiveUserIdForInitial = userId ?? RequestContext.getUserId();
    let userAvailableProviders: Set<string> | null = null;
    if (effectiveUserIdForInitial && this.keyResolver && !isDirectBYOKPath) {
      try {
        const list = await this.keyResolver.getAvailableProviders(
          effectiveUserIdForInitial,
        );
        userAvailableProviders = new Set(list.map((p) => p.toLowerCase()));
        // ★ 预检：普通用户一个 provider 都没配（Personal 空 + 无 ACTIVE Assignment）
        // 时，提前抛 NoAvailableKeyError，让前端拿到明确错误码「NO_AVAILABLE_KEY」
        // 并引导到 /settings/api-keys。
        // 管理员的 availableProviders 来自系统 Secret，极少为空；即便为空也应让
        // resolveSystemKey 抛 NoSystemKeyError 以区分语义。
        //
        // 错误里不传具体 provider（传空字符串）—— 这种场景是「用户一个 Key 都没配」，
        // 不指向特定 provider；前端 ByokErrorCard 会显示"该 Provider"/"any Provider"。
        if (userAvailableProviders.size === 0) {
          throw new NoAvailableKeyError("");
        }
      } catch (error) {
        if (error instanceof BYOKError) throw error;
        this.logger.warn(
          `[chat] getAvailableProviders for initial selection failed: ${(error as Error).message}`,
        );
      }
    }

    let userDefaultHit = false;
    if (providedModel) {
      model = providedModel;
      modelConfig = await this.getModelConfig(model);
    } else if (modelType) {
      // ★ BYOK v3：如果用户有 UserModelConfig 里设为 default 的同类型模型，
      //   直接用用户的。跳过全局默认的 provider 过滤逻辑。
      if (effectiveUserIdForInitial && !isDirectBYOKPath) {
        const userDefault = await this.modelConfigService
          .findUserDefaultByType(effectiveUserIdForInitial, modelType)
          .catch(() => null);
        if (userDefault) {
          modelConfig = userDefault;
          model = userDefault.modelId;
          userDefaultHit = true;
          this.logger.log(
            `[chat] Using user default for ${modelType}: ${model} (${userDefault.provider})`,
          );
        }
      }

      // 没有用户自定义默认 → 走全局默认，再用 availableProviders 过滤
      if (!modelConfig) {
        modelConfig = await this.getDefaultModelByType(modelType);
        if (
          modelConfig &&
          userAvailableProviders &&
          userAvailableProviders.size > 0 &&
          !userAvailableProviders.has(modelConfig.provider.toLowerCase())
        ) {
          const pool =
            await this.modelConfigService.getAllEnabledModelsByType(modelType);
          const filtered = pool.filter((m) =>
            userAvailableProviders.has(m.provider.toLowerCase()),
          );
          if (filtered.length > 0) {
            modelConfig = filtered[0];
            this.logger.log(
              `[chat] Default ${modelType} model (${(await this.getDefaultModelByType(modelType))?.provider}) not in user availableProviders; using ${modelConfig.modelId} (${modelConfig.provider}) instead`,
            );
          }
        }
      }

      if (modelConfig) {
        model = modelConfig.modelId;
        this.logger.debug(
          `[chat] Using ${modelType} model from database: ${model}`,
        );
      } else {
        // No DB config for the requested modelType. DO NOT fall back to a
        // hard-coded string like "gemini" — that silently routes the call to
        // a modelId the DB may not have, producing the misleading "模型未配置"
        // error. Honour DEFAULT_AI_MODEL only when operators explicitly set it.
        const envDefault = this.configService.get<string>(
          "DEFAULT_AI_MODEL",
          "",
        );
        if (!envDefault) {
          throw new AiServiceUnavailableError(
            `AI 服务不可用：没有可用的 ${modelType} 模型。请在数据库中启用至少 1 个该用途的模型，或设置 DEFAULT_AI_MODEL 环境变量。`,
            "",
          );
        }
        model = envDefault;
        this.logger.warn(
          `[chat] No ${modelType} model found, falling back to DEFAULT_AI_MODEL=${model}`,
        );
      }
    } else {
      model = this.configService.get<string>("DEFAULT_AI_MODEL", "");
      if (!model) {
        throw new AiServiceUnavailableError(
          "AI 服务不可用：DEFAULT_AI_MODEL 未设置且未指定 modelType/modelId。",
          "",
        );
      }
      modelConfig = await this.getModelConfig(model);
    }

    // ★ BYOK v2（向后兼容）：用户只设了 UserApiKey.preferredModelId 但
    // 没建 UserModelConfig 时的 override。UserModelConfig（v3）若已命中则
    // 跳过 —— v3 优先级高于 v2。providedModel 显式指定时也不覆盖。
    if (
      !providedModel &&
      !userDefaultHit &&
      !isDirectBYOKPath &&
      effectiveUserIdForInitial &&
      this.keyResolver &&
      modelConfig
    ) {
      try {
        const preferredModelId =
          await this.keyResolver.getPreferredModelIdForProvider(
            effectiveUserIdForInitial,
            modelConfig.provider,
          );
        if (preferredModelId && preferredModelId !== modelConfig.modelId) {
          const preferredConfig = await this.getModelConfig(preferredModelId);
          if (preferredConfig) {
            this.logger.log(
              `[chat] Using user preferredModelId=${preferredModelId} ` +
                `(provider=${modelConfig.provider}) over default ${modelConfig.modelId}`,
            );
            modelConfig = preferredConfig;
            model = preferredConfig.modelId;
          } else {
            this.logger.warn(
              `[chat] User preferredModelId=${preferredModelId} cannot be ` +
                `resolved (no DB record and synthesis failed), keeping default ${modelConfig.modelId}`,
            );
          }
        }
      } catch (error) {
        this.logger.warn(
          `[chat] Failed to resolve user preferredModelId: ${(error as Error).message}`,
        );
      }
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

    // ★ sharedCachePrefix: override system prompt + force caching when a frozen prefix is provided
    const effectiveSystemPrompt =
      sharedCachePrefix?.systemPromptText ?? systemPrompt;
    const effectiveCachePolicy: "auto" | undefined = sharedCachePrefix
      ? "auto"
      : cachePolicy;

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
        systemPrompt: effectiveSystemPrompt,
        messages,
        maxTokens: effectiveMaxTokens,
        temperature: effectiveTemperature,
        strictMode,
        userId,
        responseFormat,
        reasoningDepth: effectiveReasoningDepth,
        cachePolicy: effectiveCachePolicy,
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
            estimatedCost: AiObservabilityService.estimateCost(
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
            estimatedCost: AiObservabilityService.estimateCost(
              currentModel,
              0,
              result.tokensUsed,
            ),
            success: true,
            fallbackUsed: attempt > 0,
            retryCount: attempt,
          });
        }

        // ★ Session Latency Tracker: 自动记录 LLM 调用到活跃会话
        this.recordToLatencySession(
          currentModel,
          currentModelConfig?.provider ?? "",
          duration,
          result.tokensUsed,
          false,
          undefined,
          undefined,
          undefined,
          options.operationName,
        );

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
          usage: {
            totalTokens: result.tokensUsed,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            cacheCreationTokens: result.cacheCreationTokens,
            cacheReadTokens: result.cacheReadTokens,
          },
          model: result.model,
          finishReason: result.finishReason,
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

        // ★ BYOK v2：按用户可用 provider 过滤。避免 fallback 到用户没配 Key
        // 的 provider（例如只配 OpenAI 的用户被 fallback 到 Claude 而立即失败）。
        // 管理员 / 无 userId 的系统路径不过滤。
        const effectiveUserId = userId ?? RequestContext.getUserId();
        let providerFilteredModels = alternativeModels;
        if (effectiveUserId && this.keyResolver && !isDirectBYOKPath) {
          try {
            const availableProviders =
              await this.keyResolver.getAvailableProviders(effectiveUserId);
            const allowed = new Set(
              availableProviders.map((p) => p.toLowerCase()),
            );
            if (allowed.size > 0) {
              providerFilteredModels = alternativeModels.filter((c) =>
                allowed.has(c.provider.toLowerCase()),
              );
              if (providerFilteredModels.length < alternativeModels.length) {
                this.logger.debug(
                  `[chat] Filtered ${alternativeModels.length - providerFilteredModels.length} model(s) not in user availableProviders=${[...allowed].join(",")}`,
                );
              }
            }
          } catch (error) {
            this.logger.warn(
              `[chat] getAvailableProviders failed (non-fatal, fallback to unfiltered): ${(error as Error).message}`,
            );
          }
        }

        // ★ Circuit Breaker: Filter out models with OPEN circuit breakers
        const availableModels = this.circuitBreaker
          ? providerFilteredModels.filter((config) =>
              this.circuitBreaker!.canExecute(config.modelId),
            )
          : providerFilteredModels;

        if (availableModels.length < providerFilteredModels.length) {
          this.logger.debug(
            `[chat] CircuitBreaker filtered out ${providerFilteredModels.length - availableModels.length} model(s) with OPEN circuits`,
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
    /** 操作名称 — 用于时延跟踪标识 step */
    operationName?: string;
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
    // ★ 流式时延指标
    let streamTiming:
      | { ttftMs: number; ttltMs: number; streamStartTime: number }
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
          timing?: {
            ttftMs: number;
            ttltMs: number;
            streamStartTime: number;
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
          modelConfig.isReasoning ?? false,
          taskProfile?.reasoningDepth,
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

        // ★ 提取流式时延指标
        if (chunk.timing) {
          streamTiming = chunk.timing;
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
      const streamDuration = Date.now() - streamStartTime;
      if (this.circuitBreaker) {
        this.circuitBreaker.recordSuccess(model, streamDuration);
      }

      // ★ Kernel Metrics: Record stream TTFT/TTLT
      if (this.kernelMetrics) {
        this.kernelMetrics.recordLLMCall({
          model,
          provider: modelConfig.provider ?? "",
          modelType: modelType ?? "CHAT",
          module: "ai-engine",
          operation: "chatStream",
          userId: options.userId,
          inputTokens: streamUsage?.promptTokens ?? 0,
          outputTokens: streamUsage?.completionTokens ?? 0,
          totalTokens: streamUsage?.totalTokens ?? 0,
          latencyMs: streamDuration,
          ttftMs: streamTiming?.ttftMs,
          ttltMs: streamTiming?.ttltMs,
          estimatedCost: AiObservabilityService.estimateCost(
            model,
            streamUsage?.promptTokens ?? 0,
            streamUsage?.completionTokens ?? 0,
          ),
          success: true,
          fallbackUsed: false,
          retryCount: 0,
        });
      }

      // ★ Session Latency Tracker: 自动记录流式 LLM 调用到活跃会话
      this.recordToLatencySession(
        model,
        modelConfig.provider ?? "",
        streamDuration,
        streamUsage?.totalTokens ?? 0,
        true,
        streamTiming?.ttftMs,
        streamUsage?.promptTokens,
        streamUsage?.completionTokens,
        options.operationName,
      );

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
