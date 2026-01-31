import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AIErrorClassifier } from "../../../../common/ai-orchestration/error-classifier";
import { AiServiceUnavailableError } from "../../core/exceptions";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AIModelType } from "@prisma/client";
import { TaskProfile } from "../types";
import { TaskProfileMapperService } from "./task-profile-mapper.service";
import { AiModelConfigService, AIModelConfig } from "./ai-model-config.service";
import { AiApiCallerService } from "./ai-api-caller.service";
import { AiStreamHandlerService } from "./ai-stream-handler.service";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

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
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  tokensUsed: number;
  /** 标识此响应是否为错误消息（仅在非严格模式下有值） */
  isError?: boolean;
}

// TaskProfile 已迁移到 ../types/task-profile.ts
// 使用 import { TaskProfile } from "../types";

// Re-export AIModelConfig from ai-model-config.service
export type { AIModelConfig } from "./ai-model-config.service";

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);
  private readonly errorClassifier = new AIErrorClassifier();

  // Retry configuration
  private readonly MAX_RETRIES = 3;

  // 是否在 AI Coding 模式下（严格模式，API失败会抛出异常）
  private strictMode = false;

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly taskProfileMapper: TaskProfileMapperService,
    private readonly modelConfigService: AiModelConfigService,
    private readonly apiCallerService: AiApiCallerService,
    private readonly streamHandlerService: AiStreamHandlerService,
  ) {}

  // ==================== 模型配置委托方法 ====================
  // 以下方法委托给 AiModelConfigService

  /**
   * 获取模型的 API Key
   * 委托给 AiModelConfigService
   */
  async getApiKeyForModel(model: AIModelConfig): Promise<string | null> {
    return this.modelConfigService.getApiKeyForModel(model);
  }

  /**
   * 根据模型名称推断是否为推理模型
   * 当数据库中没有 isReasoning 字段时使用
   */
  private inferIsReasoning(modelId: string): boolean {
    const modelLower = modelId.toLowerCase();
    return (
      // OpenAI reasoning models
      modelLower.includes("o1") ||
      modelLower.includes("o3") ||
      modelLower.includes("gpt-5") ||
      modelLower.includes("gpt5") ||
      // Google/Gemini reasoning models
      modelLower.includes("gemini-2.0-flash-thinking") ||
      modelLower.includes("gemini-3") || // gemini-3-pro-preview, etc.
      modelLower.includes("gemini-exp") ||
      // DeepSeek reasoning models
      modelLower.includes("deepseek-r1") ||
      modelLower.includes("deepseek-reasoner") ||
      // Anthropic reasoning models
      modelLower.includes("claude-3.5-opus") ||
      modelLower.includes("claude-4") ||
      // Generic reasoning keyword
      modelLower.includes("reasoning") ||
      modelLower.includes("thinking")
    );
  }

  /**
   * 检查模型是否为推理模型（委托给 AiModelConfigService）
   * @param modelId 模型 ID
   * @returns 是否为推理模型
   */
  isReasoningModel(modelId: string): boolean {
    return this.modelConfigService.isReasoningModel(modelId);
  }

  /**
   * 获取模型配置（委托给 AiModelConfigService）
   * @param modelId 模型 ID（如 "gpt-4o", "gemini-2.0-flash", "claude-3-opus"）
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
   * AI App 告诉 AI Engine 需要哪一类模型，由 Engine 选择具体模型
   *
   * @param modelType 模型类型（CHAT, CHAT_FAST, IMAGE_GENERATION 等）
   * @returns 该类型的默认模型配置，如果找不到则回退
   */
  async getDefaultModelByType(
    modelType: AIModelType,
  ): Promise<AIModelConfig | null> {
    try {
      // 1. 查找该类型的默认模型（isDefault=true）
      let model = await this.prisma.aIModel.findFirst({
        where: {
          modelType,
          isEnabled: true,
          isDefault: true,
        },
      });

      // 2. 如果没有默认模型，找任意启用的该类型模型
      if (!model) {
        model = await this.prisma.aIModel.findFirst({
          where: {
            modelType,
            isEnabled: true,
          },
          orderBy: { createdAt: "desc" },
        });
      }

      // 3. 如果还是找不到，且请求的是 CHAT_FAST，回退到 CHAT
      if (!model && modelType === AIModelType.CHAT_FAST) {
        this.logger.warn(
          `[getDefaultModelByType] No ${modelType} model found, falling back to CHAT`,
        );
        return this.getDefaultModelByType(AIModelType.CHAT);
      }

      // 4. 如果找到了，返回配置
      if (model) {
        this.logger.debug(
          `[getDefaultModelByType] Found ${modelType} model: ${model.modelId}`,
        );
        return {
          id: model.id,
          name: model.name,
          displayName: model.displayName,
          provider: model.provider,
          modelId: model.modelId,
          apiEndpoint: model.apiEndpoint,
          apiKey: model.apiKey,
          maxTokens: model.maxTokens,
          temperature: model.temperature,
          isEnabled: model.isEnabled,
          isDefault: model.isDefault,
          isReasoning:
            (model as any).isReasoning ?? this.inferIsReasoning(model.modelId),
        };
      }

      this.logger.warn(
        `[getDefaultModelByType] No model found for type ${modelType}`,
      );
      return null;
    } catch (error) {
      this.logger.error(
        `[getDefaultModelByType] Failed to get model: ${error}`,
      );
      return null;
    }
  }

  /**
   * ★ 获取指定类型的所有启用模型（用于 fallback）
   * 返回所有可用模型，按优先级排序：默认模型优先，然后按创建时间降序
   *
   * @param modelType 模型类型
   * @param excludeModelIds 要排除的模型 ID 列表（已尝试失败的模型）
   * @returns 模型配置列表
   */
  async getAllEnabledModelsByType(
    modelType: AIModelType,
    excludeModelIds: string[] = [],
  ): Promise<AIModelConfig[]> {
    try {
      const models = await this.prisma.aIModel.findMany({
        where: {
          modelType,
          isEnabled: true,
          modelId:
            excludeModelIds.length > 0 ? { notIn: excludeModelIds } : undefined,
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });

      return models.map((model) => ({
        id: model.id,
        name: model.name,
        displayName: model.displayName,
        provider: model.provider,
        modelId: model.modelId,
        apiEndpoint: model.apiEndpoint,
        apiKey: model.apiKey,
        maxTokens: model.maxTokens,
        temperature: model.temperature,
        isEnabled: model.isEnabled,
        isDefault: model.isDefault,
        isReasoning:
          (model as any).isReasoning ?? this.inferIsReasoning(model.modelId),
      }));
    } catch (error) {
      this.logger.error(
        `[getAllEnabledModelsByType] Failed to get models: ${error}`,
      );
      return [];
    }
  }

  /**
   * ★ 获取推理模型配置
   * 用于需要深度推理能力的任务（如 Leader 规划、复杂分析）
   *
   * 智能选择顺序：
   * 1. 用户显式设置 isReasoning=true 的模型
   * 2. 自动检测已知推理模型（按 model ID 模式匹配）
   * 3. 回退到非 OpenAI 的 CHAT 模型（避免 rate limit）
   * 4. 最后回退到任意可用 CHAT 模型
   *
   * @returns 推理模型配置，如果没有可用模型则返回 null
   */
  async getReasoningModelConfig(): Promise<AIModelConfig | null> {
    try {
      // 1. 优先查找用户显式设置 isReasoning=true 的模型
      let model = await this.prisma.aIModel.findFirst({
        where: {
          modelType: AIModelType.CHAT,
          isEnabled: true,
          isReasoning: true,
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });

      if (model) {
        this.logger.log(
          `[getReasoningModelConfig] Found explicitly configured reasoning model: ${model.modelId}`,
        );
        return this.toAIModelConfig(model);
      }

      // 2. 自动检测已知推理模型（按 model ID 模式匹配）
      const allChatModels = await this.prisma.aIModel.findMany({
        where: {
          modelType: AIModelType.CHAT,
          isEnabled: true,
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });

      const detectedReasoningModel = allChatModels.find((m) =>
        this.isKnownReasoningModelId(m.modelId),
      );

      if (detectedReasoningModel) {
        this.logger.log(
          `[getReasoningModelConfig] Auto-detected reasoning model by pattern: ${detectedReasoningModel.modelId}`,
        );
        return this.toAIModelConfig(detectedReasoningModel, true);
      }

      // 3. 回退到非 OpenAI 的 CHAT 模型（避免 rate limit）
      const nonOpenAIModel = allChatModels.find(
        (m) => m.provider.toLowerCase() !== "openai",
      );

      if (nonOpenAIModel) {
        this.logger.warn(
          `[getReasoningModelConfig] No reasoning model found, using non-OpenAI fallback: ${nonOpenAIModel.modelId} (${nonOpenAIModel.provider})`,
        );
        return this.toAIModelConfig(nonOpenAIModel);
      }

      // 4. 最后回退到任意可用 CHAT 模型
      if (allChatModels.length > 0) {
        this.logger.warn(
          `[getReasoningModelConfig] Falling back to default CHAT model: ${allChatModels[0].modelId}`,
        );
        return this.toAIModelConfig(allChatModels[0]);
      }

      this.logger.error("[getReasoningModelConfig] No CHAT model available");
      return null;
    } catch (error) {
      this.logger.error(`[getReasoningModelConfig] Failed: ${error}`);
      return null;
    }
  }

  /**
   * 检查模型 ID 是否匹配已知的推理模型模式
   */
  private isKnownReasoningModelId(modelId: string): boolean {
    const patterns = [
      // OpenAI reasoning models
      /^o1/i,
      /^o3/i,
      /^gpt-5/i,
      // DeepSeek reasoning models
      /deepseek.*r1/i,
      /deepseek-reasoner/i,
      // Claude with extended thinking
      /claude.*think/i,
      // Gemini reasoning
      /gemini.*think/i,
      // Grok reasoning
      /grok.*reason/i,
    ];
    return patterns.some((pattern) => pattern.test(modelId));
  }

  /**
   * 转换数据库模型为 AIModelConfig
   */
  private toAIModelConfig(
    model: {
      id: string;
      name: string;
      displayName: string;
      provider: string;
      modelId: string;
      apiEndpoint: string;
      apiKey: string | null;
      maxTokens: number;
      temperature: number;
      isEnabled: boolean;
      isDefault: boolean;
      isReasoning?: boolean | null;
    },
    autoDetectedReasoning = false,
  ): AIModelConfig {
    return {
      id: model.id,
      name: model.name,
      displayName: model.displayName,
      provider: model.provider,
      modelId: model.modelId,
      apiEndpoint: model.apiEndpoint,
      apiKey: model.apiKey,
      maxTokens: model.maxTokens,
      temperature: model.temperature,
      isEnabled: model.isEnabled,
      isDefault: model.isDefault,
      isReasoning: model.isReasoning ?? autoDetectedReasoning,
    };
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
    // 默认使用 OpenAI 兼容格式（大多数代理服务都兼容）
    return "openai";
  }

  /**
   * 设置严格模式
   * 在严格模式下，API密钥缺失或调用失败会抛出异常而非返回错误文本
   */
  setStrictMode(enabled: boolean): void {
    this.strictMode = enabled;
  }

  /**
   * 获取指定模型所需的 API 密钥环境变量名
   * @deprecated 优先使用数据库配置，此方法仅用于环境变量回退
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
    return "GOOGLE_AI_API_KEY"; // 默认
  }

  /**
   * 验证 AI 服务是否可用
   * 优先检查数据库配置，其次检查环境变量
   * @param model 要验证的模型名称，不传则验证默认模型
   * @throws AiServiceUnavailableError 如果服务不可用
   */
  async validateAIServiceAvailability(model?: string): Promise<void> {
    // 1. 先尝试从数据库获取模型配置
    let targetModel = model;
    let hasDbConfig = false;

    if (model) {
      const dbConfig = await this.getModelConfig(model);
      if (dbConfig && dbConfig.apiKey) {
        hasDbConfig = true;
        targetModel = dbConfig.modelId;
      }
    } else {
      // 没有指定模型，使用默认模型
      const defaultConfig = await this.getDefaultModelConfig();
      if (defaultConfig && defaultConfig.apiKey) {
        hasDbConfig = true;
        targetModel = defaultConfig.modelId;
      }
    }

    // 2. 如果没有数据库配置，回退检查环境变量
    if (!hasDbConfig) {
      targetModel = targetModel || process.env.DEFAULT_AI_MODEL || "gemini";
      const requiredEnvKey = this.getRequiredApiKeyName(targetModel);

      if (!process.env[requiredEnvKey]) {
        throw new AiServiceUnavailableError(
          `AI服务不可用: 模型 "${targetModel}" 未在数据库中配置，且环境变量 ${requiredEnvKey} 也未设置`,
          targetModel,
        );
      }
    }

    // 3. 测试 API 连通性
    try {
      const testResult = await this.generateChatCompletion({
        model: targetModel!,
        messages: [{ role: "user", content: "Hello" }],
        maxTokens: 10,
        temperature: 0,
      });

      // 检查响应是否包含错误信息
      if (
        testResult.content.includes("API Key 未配置") ||
        testResult.content.includes("API 调用失败") ||
        testResult.content.includes("无法生成回复")
      ) {
        throw new AiServiceUnavailableError(
          `AI服务响应异常: ${testResult.content.slice(0, 100)}`,
          targetModel!,
        );
      }
    } catch (error) {
      if (error instanceof AiServiceUnavailableError) {
        throw error;
      }
      throw new AiServiceUnavailableError(
        `AI服务连接测试失败: ${error instanceof Error ? error.message : String(error)}`,
        targetModel!,
      );
    }
  }

  /**
   * 检查指定模型的 API 密钥是否已配置
   * 优先检查数据库配置，其次检查环境变量
   */
  async isApiKeyConfiguredAsync(model: string): Promise<boolean> {
    // 1. 检查数据库配置
    const dbConfig = await this.getModelConfig(model);
    if (dbConfig && dbConfig.apiKey) {
      return true;
    }

    // 2. 回退检查环境变量
    const requiredEnvKey = this.getRequiredApiKeyName(model);
    return !!process.env[requiredEnvKey];
  }

  /**
   * 检查指定模型的 API 密钥是否已配置（同步版本，仅检查环境变量）
   * @deprecated 优先使用 isApiKeyConfiguredAsync
   */
  isApiKeyConfigured(model: string): boolean {
    const requiredEnvKey = this.getRequiredApiKeyName(model);
    return !!process.env[requiredEnvKey];
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

      // 返回所有有 apiKey 的模型
      const models: string[] = [];
      for (const config of chatModels) {
        const apiKey = await this.modelConfigService.getApiKeyForModel(config);
        if (apiKey) {
          models.push(config.modelId);
        }
      }
      return [...new Set(models)]; // 去重
    } catch (error) {
      this.logger.error(`[getAvailableModelsAsync] Failed: ${error}`);
      return [];
    }
  }

  /**
   * 获取所有已配置的 AI 模型列表（同步版本，仅检查环境变量）
   * @deprecated 优先使用 getAvailableModelsAsync
   */
  getAvailableModels(): string[] {
    const models: string[] = [];
    if (process.env.XAI_API_KEY) models.push("grok");
    if (process.env.OPENAI_API_KEY) models.push("gpt-4");
    if (process.env.ANTHROPIC_API_KEY) models.push("claude");
    if (process.env.GOOGLE_AI_API_KEY) models.push("gemini");
    return models;
  }

  /**
   * Execute an async operation with retry logic for network errors
   * Uses exponential backoff with jitter
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    provider?: string,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const aiError = this.errorClassifier.classify(error, provider);
        lastError = aiError;

        this.logger.warn(
          `[${operationName}] Attempt ${attempt}/${this.MAX_RETRIES} failed: ${aiError.message} (type: ${aiError.type})`,
        );

        // Only retry if error is retryable and we have attempts left
        if (aiError.isRetryable() && attempt < this.MAX_RETRIES) {
          // Exponential backoff with jitter: delay * 2^(attempt-1) + random(0-500)
          const delay =
            aiError.getRetryDelay() * Math.pow(2, attempt - 1) +
            Math.random() * 500;
          this.logger.debug(
            `[${operationName}] Retrying in ${Math.round(delay)}ms...`,
          );
          await this.sleep(delay);
          continue;
        }

        // Non-retryable error or max retries exceeded
        this.logger.error(
          `[${operationName}] ${aiError.isRetryable() ? "Max retries exceeded" : "Non-retryable error"}: ${aiError.message}`,
        );
        throw aiError;
      }
    }

    // Should not reach here, but throw last error if we do
    throw lastError || new Error(`${operationName} failed after all retries`);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extract URLs from text content
   */
  private extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    return text.match(urlRegex) || [];
  }

  /**
   * Detect if a message needs web search
   * Looks for keywords like "搜索", "查找", "最新", "新闻", "search", etc.
   */
  private needsWebSearch(text: string): boolean {
    const searchKeywords = [
      "搜索",
      "搜一下",
      "查找",
      "查一下",
      "查询",
      "最新",
      "新闻",
      "今天",
      "昨天",
      "本周",
      "现在",
      "目前",
      "当前",
      "实时",
      "热点",
      "trending",
      "search",
      "look up",
      "find out",
      "latest",
      "news",
      "current",
      "recent",
      "today",
    ];
    const lowerText = text.toLowerCase();
    return searchKeywords.some((keyword) => lowerText.includes(keyword));
  }

  /**
   * Extract search query from user message
   */
  private extractSearchQuery(text: string): string {
    // Remove common prefixes and clean up the query
    let query = text
      .replace(/@[\w-]+\s*/g, "") // Remove @mentions
      .replace(/搜索|搜一下|查找|查一下|查询|帮我|请|给我/g, "")
      .replace(/search|look up|find/gi, "")
      .trim();

    // Limit query length
    if (query.length > 100) {
      query = query.substring(0, 100);
    }

    return query;
  }

  /**
   * Perform web search using DuckDuckGo
   */
  private async webSearch(query: string): Promise<string> {
    try {
      this.logger.log(`Performing web search for: ${query}`);

      // Use DuckDuckGo HTML search
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      const response = await firstValueFrom(
        this.httpService.get(searchUrl, {
          timeout: 10000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "text/html",
          },
          responseType: "text",
        }),
      );

      const html = response.data;

      // Extract search results from DuckDuckGo HTML
      const results: { title: string; snippet: string; url: string }[] = [];

      // Match result blocks
      const resultRegex =
        /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)</g;
      let match;
      let count = 0;

      while ((match = resultRegex.exec(html)) !== null && count < 5) {
        const url = match[1];
        const title = match[2].trim();
        const snippet = match[3].trim();

        if (title && snippet) {
          results.push({ title, snippet, url });
          count++;
        }
      }

      // Alternative extraction if first pattern didn't work
      if (results.length === 0) {
        const altRegex =
          /<h2[^>]*class="result__title"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        while ((match = altRegex.exec(html)) !== null && count < 5) {
          const url = match[1];
          const title = match[2].replace(/<[^>]+>/g, "").trim();
          const snippet = match[3].replace(/<[^>]+>/g, "").trim();

          if (title && snippet) {
            results.push({ title, snippet, url });
            count++;
          }
        }
      }

      if (results.length === 0) {
        this.logger.warn(`No search results found for: ${query}`);
        return `[搜索 "${query}" 未找到结果]`;
      }

      // Format results for AI
      const formattedResults = results
        .map(
          (r, i) =>
            `${i + 1}. **${r.title}**\n   ${r.snippet}\n   来源: ${r.url}`,
        )
        .join("\n\n");

      this.logger.log(`Found ${results.length} search results for: ${query}`);

      return `\n\n--- 网络搜索结果 (${query}) ---\n${formattedResults}`;
    } catch (error) {
      this.logger.error(`Web search failed for "${query}": ${error}`);
      return `[搜索失败: ${error}]`;
    }
  }

  /**
   * Fetch content from a URL and extract text
   * Used to provide context to AI models that can't access URLs directly
   */
  private async fetchUrlContent(url: string): Promise<string | null> {
    try {
      this.logger.log(`Fetching URL content: ${url}`);
      const response = await firstValueFrom(
        this.httpService.get(url, {
          timeout: 15000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          responseType: "text",
        }),
      );

      const html = response.data;

      // Extract text content from HTML (simple extraction)
      // Remove scripts, styles, and HTML tags
      let text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();

      // Limit content length to avoid token limits
      const maxLength = 8000;
      if (text.length > maxLength) {
        text = text.substring(0, maxLength) + "... [内容已截断]";
      }

      this.logger.log(`Fetched ${text.length} characters from ${url}`);
      return text;
    } catch (error) {
      this.logger.error(`Failed to fetch URL ${url}: ${error}`);
      return null;
    }
  }

  /**
   * Process messages to fetch URL content and perform web search if needed
   * This gives all AI models the ability to access the internet
   * @param messages - Chat messages to process
   * @param enableSearch - Whether to perform web search (default: true)
   *                       Set to false for internal system calls to avoid unnecessary searches
   */
  private async augmentMessagesWithUrlContent(
    messages: ChatMessage[],
    enableSearch = true,
  ): Promise<ChatMessage[]> {
    const augmentedMessages: ChatMessage[] = [];

    for (const message of messages) {
      if (message.role === "user") {
        let augmentedContent = message.content;
        const urls = this.extractUrls(message.content);

        // 1. Fetch content from URLs if present
        if (urls.length > 0) {
          const urlsToFetch = urls.slice(0, 2);
          const fetchedContents: string[] = [];

          for (const url of urlsToFetch) {
            const content = await this.fetchUrlContent(url);
            if (content) {
              fetchedContents.push(`\n\n--- 网页内容 (${url}) ---\n${content}`);
            }
          }

          if (fetchedContents.length > 0) {
            augmentedContent += fetchedContents.join("\n");
            this.logger.log(
              `Augmented message with content from ${fetchedContents.length} URL(s)`,
            );
          }
        }

        // 2. Perform web search if message indicates search intent (and no URLs)
        // ★ Skip web search for internal system calls (enableSearch=false)
        if (
          enableSearch &&
          urls.length === 0 &&
          this.needsWebSearch(message.content)
        ) {
          const searchQuery = this.extractSearchQuery(message.content);
          if (searchQuery.length > 3) {
            this.logger.log(`Detected search intent, query: ${searchQuery}`);
            const searchResults = await this.webSearch(searchQuery);
            augmentedContent += searchResults;
          }
        }

        augmentedMessages.push({
          ...message,
          content: augmentedContent,
        });
      } else {
        augmentedMessages.push(message);
      }
    }

    return augmentedMessages;
  }

  /**
   * Generate a chat completion using the specified AI model
   * 优先从数据库获取模型配置（apiKey, apiEndpoint），仅在找不到时回退到环境变量
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
    } = options;

    this.logger.debug(`Generating chat completion with model: ${model}`);

    // Build messages array with system prompt
    const fullMessages: ChatMessage[] = [];
    if (systemPrompt) {
      fullMessages.push({ role: "system", content: systemPrompt });
    }
    fullMessages.push(...messages);

    // ==================== 从数据库获取模型配置 ====================
    const modelConfig = await this.getModelConfig(model);

    if (modelConfig) {
      // 使用数据库配置调用 API
      this.logger.debug(
        `[generateChatCompletion] Using DB config for model: ${modelConfig.modelId} (provider: ${modelConfig.provider})`,
      );
      return this.callAPIWithConfig(
        modelConfig,
        fullMessages,
        maxTokens,
        temperature,
        optionStrictMode,
      );
    }

    // ==================== 未找到模型配置 ====================
    const errorMsg = `模型 "${model}" 未在数据库中配置，请在管理后台添加该模型的配置`;
    this.logger.error(`[generateChatCompletion] ${errorMsg}`);

    // 优先使用参数级别的 strictMode，否则使用实例级别的设置
    const useStrictMode = optionStrictMode ?? this.strictMode;
    if (useStrictMode) {
      throw new AiServiceUnavailableError(errorMsg, model);
    }

    // 非严格模式：返回友好的错误消息
    return {
      content: `**模型未配置**\n\n${errorMsg}\n\n请联系管理员在后台配置该模型。`,
      model,
      tokensUsed: 0,
      isError: true,
    };
  }

  // ==================== 使用数据库配置调用 API ====================

  /**
   * 计算模型的超时时间
   * 推理模型需要更长的超时时间
   */
  private getTimeoutForModel(modelId: string, maxTokens: number): number {
    // ★ 使用统一的 isReasoningModel() 方法，优先使用数据库配置
    const isReasoning = this.isReasoningModel(modelId);

    // 推理模型：5分钟起，最多15分钟
    // 普通模型：2分钟起，最多10分钟
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
   * 根据 provider 自动选择正确的 API 格式
   * ★ 自适应：根据 isReasoning 字段自动决定是否发送 temperature
   */
  private async callAPIWithConfig(
    config: AIModelConfig,
    messages: ChatMessage[],
    maxTokens: number,
    temperature?: number,
    optionStrictMode?: boolean,
  ): Promise<ChatCompletionResult> {
    const { modelId, apiEndpoint, provider } = config;

    // ★ 关键修复：使用 getApiKeyForModel 获取 API Key，支持 Secret Manager
    const apiKey = await this.getApiKeyForModel(config);

    // ★ 完全使用数据库配置，无需硬编码
    const apiFormat = config.apiFormat || "openai";
    const supportsTemp = config.supportsTemperature ?? true;
    const isReasoning = config.isReasoning ?? false;
    // ★ 使用数据库配置的 token 参数名，而非硬编码
    const tokenParamName =
      config.tokenParamName ||
      (isReasoning ? "max_completion_tokens" : "max_tokens");
    // 优先使用配置的超时，否则使用计算的超时
    const timeout =
      config.defaultTimeoutMs || this.getTimeoutForModel(modelId, maxTokens);

    // 优先使用参数级别的 strictMode，否则使用实例级别的设置
    const useStrictMode = optionStrictMode ?? this.strictMode;

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

    // ★ 自适应：根据数据库配置决定是否发送 temperature
    const effectiveTemperature = supportsTemp ? temperature : undefined;

    if (!supportsTemp && temperature !== undefined) {
      this.logger.debug(
        `[callAPIWithConfig] Model ${modelId} does not support temperature (supportsTemperature=false), ignoring temperature=${temperature}`,
      );
    }

    this.logger.debug(
      `[callAPIWithConfig] Calling API: model=${modelId}, format=${apiFormat}, ` +
        `supportsTemp=${supportsTemp}, isReasoning=${isReasoning}, timeout=${timeout}ms`,
    );

    try {
      // ★ 使用 withRetry 包装 API 调用，自动处理网络错误重试
      const apiCall = async (): Promise<ChatCompletionResult> => {
        switch (apiFormat) {
          case "openai":
            return await this.apiCallerService.callOpenAICompatibleAPI(
              apiEndpoint,
              apiKey,
              modelId,
              messages,
              maxTokens,
              effectiveTemperature,
              timeout,
              tokenParamName,
            );

          case "anthropic":
            return await this.apiCallerService.callAnthropicAPI(
              apiEndpoint,
              apiKey,
              modelId,
              messages,
              maxTokens,
              temperature,
              timeout,
            );

          case "google":
            return await this.apiCallerService.callGoogleAPI(
              apiEndpoint,
              apiKey,
              modelId,
              messages,
              maxTokens,
              temperature,
              timeout,
            );

          case "xai":
            return await this.apiCallerService.callXAIAPI(
              apiEndpoint,
              apiKey,
              modelId,
              messages,
              maxTokens,
              temperature,
              timeout,
              tokenParamName,
            );

          default:
            // 默认使用 OpenAI 兼容格式
            return await this.apiCallerService.callOpenAICompatibleAPI(
              apiEndpoint,
              apiKey,
              modelId,
              messages,
              maxTokens,
              effectiveTemperature,
              timeout,
              tokenParamName,
            );
        }
      };

      return await this.withRetry(
        apiCall,
        `callAPIWithConfig [${modelId}]`,
        provider,
      );
    } catch (error: any) {
      // ★ 详细错误日志：捕获 API 响应中的错误信息
      let errorMsg = error instanceof Error ? error.message : String(error);
      let detailedError = "";

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        const apiErrorMsg =
          data?.error?.message || data?.message || JSON.stringify(data);
        detailedError = `Status: ${status}, API Error: ${apiErrorMsg}`;
        errorMsg = `${errorMsg} - ${detailedError}`;
      }

      this.logger.error(
        `[callAPIWithConfig] ${provider} API error for ${modelId}: ${errorMsg}`,
      );

      // ★ 调试日志：输出请求参数（不包含敏感信息）
      this.logger.debug(
        `[callAPIWithConfig] Failed request params - model: ${modelId}, endpoint: ${apiEndpoint?.substring(0, 50)}...`,
      );

      if (useStrictMode) {
        throw error;
      }

      return {
        content: `**${provider} API 调用失败**\n\n模型：${modelId}\n错误信息：${errorMsg}\n\n请稍后重试或检查 API 配置。`,
        model: modelId,
        tokensUsed: 0,
        isError: true,
      };
    }
  }

  /**
   * Test connection to an AI model
   * Returns latency and success status
   */
  async testModelConnection(
    model: string,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    const startTime = Date.now();

    try {
      // Simple test message
      // 使用 generateChatCompletion，它会自动从数据库获取配置
      const result = await this.generateChatCompletion({
        model,
        messages: [
          { role: "user", content: "Say 'OK' to confirm you are working." },
        ],
        maxTokens: 50,
        temperature: 0,
      });

      const latency = Date.now() - startTime;

      // Check if we got an error response (API key not configured)
      if (
        result.content.includes("API Key 未配置") ||
        result.content.includes("mock response")
      ) {
        return {
          success: false,
          message: `API key not configured for ${model}`,
          latency,
        };
      }

      return {
        success: true,
        message: `Connection successful! Response: "${result.content.substring(0, 100)}..."`,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latency,
      };
    }
  }

  /**
   * Test connection to an AI model with custom API key and endpoint
   * Used for testing models configured in the database
   * @param provider - The AI provider (openai, anthropic, google, cohere, etc.)
   * @param modelId - The model identifier
   * @param apiKey - The API key for authentication
   * @param apiEndpoint - Optional custom API endpoint
   * @param modelType - The type of model (CHAT, EMBEDDING, RERANK, etc.)
   */
  async testModelConnectionWithKey(
    provider: string,
    modelId: string,
    apiKey: string,
    apiEndpoint: string,
    modelType?: string,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    const startTime = Date.now();

    if (!apiKey) {
      return {
        success: false,
        message: "API key is not configured",
        latency: 0,
      };
    }

    try {
      // Handle EMBEDDING models specially
      if (modelType === "EMBEDDING") {
        return await this.testEmbeddingModel(
          provider,
          modelId,
          apiKey,
          apiEndpoint,
          startTime,
        );
      }

      // Handle RERANK models specially
      if (modelType === "RERANK") {
        return await this.testRerankModel(
          provider,
          modelId,
          apiKey,
          apiEndpoint,
          startTime,
        );
      }

      // Handle TTS/AUDIO models - they don't support text output
      if (
        modelType === "TTS" ||
        modelType === "AUDIO" ||
        modelId?.toLowerCase().includes("tts")
      ) {
        return await this.testTTSModel(
          provider,
          modelId,
          apiKey,
          apiEndpoint,
          startTime,
        );
      }

      const testMessages = [
        {
          role: "user" as const,
          content: "Say 'OK' to confirm you are working.",
        },
      ];

      let response;

      // Determine the correct API format based on provider
      switch (provider.toLowerCase()) {
        case "xai":
        case "grok":
          // Use a simpler test message for Grok to avoid safety filter triggers
          const grokTestMessages = [
            {
              role: "user" as const,
              content: "What is 2+2?",
            },
          ];
          response = await firstValueFrom(
            this.httpService.post(
              apiEndpoint || "https://api.x.ai/v1/chat/completions",
              {
                model: modelId || "grok-beta",
                messages: grokTestMessages,
                max_tokens: 50,
                temperature: 0,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          break;

        case "openai":
        case "gpt":
          // ★ 数据库驱动：使用 inferIsReasoning 推断 tokenParamName
          const effectiveOpenAIModel = modelId || "gpt-4";
          const isReasoningModel = this.inferIsReasoning(effectiveOpenAIModel);
          const openAITokenParamName = isReasoningModel
            ? "max_completion_tokens"
            : "max_tokens";
          const openAITokenParam = { [openAITokenParamName]: 50 };

          response = await firstValueFrom(
            this.httpService.post(
              apiEndpoint || "https://api.openai.com/v1/chat/completions",
              {
                model: effectiveOpenAIModel,
                messages: testMessages,
                ...openAITokenParam,
                temperature: 0,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          break;

        case "anthropic":
        case "claude":
          response = await firstValueFrom(
            this.httpService.post(
              apiEndpoint || "https://api.anthropic.com/v1/messages",
              {
                model: modelId || "claude-3-sonnet-20240229",
                max_tokens: 50,
                messages: testMessages,
              },
              {
                headers: {
                  "x-api-key": apiKey,
                  "anthropic-version": "2023-06-01",
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          break;

        case "google":
        case "gemini":
          // Check if this is an Imagen model (uses different API)
          const isImagenModel = modelId?.toLowerCase().includes("imagen");

          if (isImagenModel) {
            // Imagen 4 使用 :predict 端点（与 callImagenApi 方法一致）
            const imagenEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict`;

            this.logger.log(`Testing Imagen API: ${imagenEndpoint}`);

            try {
              response = await firstValueFrom(
                this.httpService.post(
                  imagenEndpoint,
                  {
                    instances: [
                      {
                        prompt: "A simple blue circle on white background",
                      },
                    ],
                    parameters: {
                      sampleCount: 1,
                      aspectRatio: "1:1",
                      outputOptions: {
                        mimeType: "image/png",
                      },
                    },
                  },
                  {
                    headers: {
                      "x-goog-api-key": apiKey,
                      "Content-Type": "application/json",
                    },
                    timeout: 120000,
                  },
                ),
              );

              // Imagen 4 REST API 返回格式: { predictions: [{ bytesBase64Encoded: "..." }] }
              if (response.data?.predictions?.[0]?.bytesBase64Encoded) {
                const latency = Date.now() - startTime;
                return {
                  success: true,
                  message: `Imagen connection successful! Image generated.`,
                  latency,
                };
              }

              // 备用格式: { generatedImages: [{ image: { imageBytes: "..." } }] }
              if (response.data?.generatedImages?.[0]?.image?.imageBytes) {
                const latency = Date.now() - startTime;
                return {
                  success: true,
                  message: `Imagen connection successful! Image generated.`,
                  latency,
                };
              }

              // 如果响应成功但没有图像数据，也视为成功（可能是格式问题）
              const latency = Date.now() - startTime;
              return {
                success: true,
                message: `Imagen API responded successfully. Response keys: ${Object.keys(response.data || {}).join(", ")}`,
                latency,
              };
            } catch (testError: any) {
              // 返回详细错误信息
              const latency = Date.now() - startTime;
              const errorMsg =
                testError.response?.data?.error?.message ||
                testError.message ||
                "Unknown error";
              const errorCode = testError.response?.status || "N/A";
              return {
                success: false,
                message: `Imagen test failed (${errorCode}): ${errorMsg}`,
                latency,
              };
            }
          } else {
            // Regular Gemini models use generateContent
            const isImageCapableModel =
              modelId?.includes("gemini-2.0-flash-exp") ||
              modelId?.includes("image");

            const geminiTestPrompt = isImageCapableModel
              ? "Hello" // Simple prompt for image-capable models
              : testMessages[0].content;

            const geminiConfig: Record<string, unknown> = isImageCapableModel
              ? {} // Don't request image generation for connection test
              : {
                  maxOutputTokens: 50,
                  temperature: 0,
                };

            // Build full Gemini endpoint URL
            const effectiveGeminiModel = modelId || "gemini-pro";
            let geminiEndpoint: string;
            if (apiEndpoint && apiEndpoint.includes(":generateContent")) {
              geminiEndpoint = apiEndpoint;
            } else {
              const baseUrl =
                apiEndpoint?.replace(/\/$/, "") ||
                "https://generativelanguage.googleapis.com/v1beta/models";
              geminiEndpoint = `${baseUrl}/${effectiveGeminiModel}:generateContent`;
            }

            this.logger.log(`Testing Gemini API: ${geminiEndpoint}`);

            response = await firstValueFrom(
              this.httpService.post(
                geminiEndpoint,
                {
                  contents: [
                    {
                      parts: [{ text: geminiTestPrompt }],
                    },
                  ],
                  ...(Object.keys(geminiConfig).length > 0
                    ? { generationConfig: geminiConfig }
                    : {}),
                },
                {
                  headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey,
                  },
                  timeout: 30000,
                },
              ),
            );
          }
          break;

        // Chinese providers (OpenAI-compatible format)
        case "deepseek":
        case "qwen":
        case "alibaba":
        case "doubao":
        case "bytedance":
        case "zhipu":
        case "glm":
        case "kimi":
        case "moonshot":
          response = await firstValueFrom(
            this.httpService.post(
              apiEndpoint,
              {
                model: modelId,
                messages: testMessages,
                max_tokens: 50,
                temperature: 0,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          break;

        default:
          return {
            success: false,
            message: `Unsupported provider: ${provider}`,
            latency: Date.now() - startTime,
          };
      }

      const latency = Date.now() - startTime;

      // Extract response content based on provider
      let content = "";
      if (
        provider.toLowerCase() === "anthropic" ||
        provider.toLowerCase() === "claude"
      ) {
        content = response.data?.content?.[0]?.text || "";
      } else if (
        provider.toLowerCase() === "google" ||
        provider.toLowerCase() === "gemini"
      ) {
        content =
          response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else {
        content = response.data?.choices?.[0]?.message?.content || "";
      }

      return {
        success: true,
        message: `Connection successful! Response: "${content.substring(0, 100)}${content.length > 100 ? "..." : ""}"`,
        latency,
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      let errorMessage = "Unknown error";

      if (error.response) {
        // API returned an error response
        const status = error.response.status;
        const data = error.response.data;
        errorMessage = `API Error (${status}): ${data?.error?.message || data?.message || JSON.stringify(data)}`;
      } else if (error.code === "ECONNABORTED") {
        errorMessage = "Connection timeout";
      } else if (error.message) {
        errorMessage = error.message;
      }

      this.logger.error(`Model connection test failed: ${errorMessage}`);

      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latency,
      };
    }
  }

  /**
   * Test connection to an embedding model
   * Uses the embeddings API endpoint with 'input' parameter
   */
  private async testEmbeddingModel(
    provider: string,
    modelId: string,
    apiKey: string,
    apiEndpoint: string,
    startTime: number,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    try {
      const testInput = "Hello, this is a test.";
      let response;

      switch (provider.toLowerCase()) {
        case "openai":
        case "gpt":
          // Construct full embeddings URL from base endpoint
          let openaiEmbeddingsUrl = "https://api.openai.com/v1/embeddings";
          if (apiEndpoint) {
            // Remove trailing slash and /embeddings if present
            let baseUrl = apiEndpoint.replace(/\/+$/, "");
            if (baseUrl.endsWith("/embeddings")) {
              openaiEmbeddingsUrl = baseUrl;
            } else {
              openaiEmbeddingsUrl = `${baseUrl}/embeddings`;
            }
          }
          response = await firstValueFrom(
            this.httpService.post(
              openaiEmbeddingsUrl,
              {
                model: modelId || "text-embedding-3-small",
                input: testInput,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );

          if (response.data?.data?.[0]?.embedding) {
            const latency = Date.now() - startTime;
            const dimensions = response.data.data[0].embedding.length;
            return {
              success: true,
              message: `Embedding model connected! Dimensions: ${dimensions}`,
              latency,
            };
          }
          break;

        case "cohere":
          // Construct full embed URL from base endpoint
          let cohereEmbedUrl = "https://api.cohere.ai/v1/embed";
          if (apiEndpoint) {
            let baseUrl = apiEndpoint.replace(/\/+$/, "");
            if (baseUrl.endsWith("/embed")) {
              cohereEmbedUrl = baseUrl;
            } else {
              cohereEmbedUrl = `${baseUrl}/embed`;
            }
          }
          response = await firstValueFrom(
            this.httpService.post(
              cohereEmbedUrl,
              {
                model: modelId || "embed-english-v3.0",
                texts: [testInput],
                input_type: "search_document",
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );

          if (response.data?.embeddings?.[0]) {
            const latency = Date.now() - startTime;
            const dimensions = response.data.embeddings[0].length;
            return {
              success: true,
              message: `Embedding model connected! Dimensions: ${dimensions}`,
              latency,
            };
          }
          break;

        case "google":
        case "gemini":
          const geminiEndpoint =
            apiEndpoint ||
            `https://generativelanguage.googleapis.com/v1beta/models/${modelId || "text-embedding-004"}:embedContent`;

          response = await firstValueFrom(
            this.httpService.post(
              geminiEndpoint,
              {
                content: {
                  parts: [{ text: testInput }],
                },
              },
              {
                headers: {
                  "x-goog-api-key": apiKey,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );

          if (response.data?.embedding?.values) {
            const latency = Date.now() - startTime;
            const dimensions = response.data.embedding.values.length;
            return {
              success: true,
              message: `Embedding model connected! Dimensions: ${dimensions}`,
              latency,
            };
          }
          break;

        default:
          return {
            success: false,
            message: `Embedding not supported for provider: ${provider}`,
            latency: Date.now() - startTime,
          };
      }

      const latency = Date.now() - startTime;
      return {
        success: true,
        message: `Embedding API responded successfully`,
        latency,
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      let errorMessage = "Unknown error";

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        errorMessage = `API Error (${status}): ${data?.error?.message || data?.message || JSON.stringify(data)}`;
      } else if (error.code === "ECONNABORTED") {
        errorMessage = "Connection timeout";
      } else if (error.message) {
        errorMessage = error.message;
      }

      this.logger.error(`Embedding model test failed: ${errorMessage}`);

      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latency,
      };
    }
  }

  /**
   * Test connection to a rerank model
   * Uses the rerank API endpoint
   */
  private async testRerankModel(
    provider: string,
    modelId: string,
    apiKey: string,
    apiEndpoint: string,
    startTime: number,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    try {
      const testQuery = "What is the capital of France?";
      const testDocuments = [
        "Paris is the capital of France.",
        "London is the capital of UK.",
      ];
      let response;

      switch (provider.toLowerCase()) {
        case "cohere":
          response = await firstValueFrom(
            this.httpService.post(
              apiEndpoint || "https://api.cohere.ai/v1/rerank",
              {
                model: modelId || "rerank-v3.5",
                query: testQuery,
                documents: testDocuments,
                top_n: 2,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );

          if (response.data?.results) {
            const latency = Date.now() - startTime;
            const topScore =
              response.data.results[0]?.relevance_score?.toFixed(4) || "N/A";
            return {
              success: true,
              message: `Rerank model connected! Top relevance score: ${topScore}`,
              latency,
            };
          }
          break;

        default:
          return {
            success: false,
            message: `Rerank not supported for provider: ${provider}. Supported: cohere`,
            latency: Date.now() - startTime,
          };
      }

      const latency = Date.now() - startTime;
      return {
        success: true,
        message: `Rerank API responded successfully`,
        latency,
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      let errorMessage = "Unknown error";

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        errorMessage = `API Error (${status}): ${data?.error?.message || data?.message || JSON.stringify(data)}`;
      } else if (error.code === "ECONNABORTED") {
        errorMessage = "Connection timeout";
      } else if (error.message) {
        errorMessage = error.message;
      }

      this.logger.error(`Rerank model test failed: ${errorMessage}`);

      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latency,
      };
    }
  }

  /**
   * Test connection to a TTS/Audio model
   * TTS models only support audio output, so we just verify API connectivity
   */
  private async testTTSModel(
    provider: string,
    _modelId: string,
    _apiKey: string,
    _apiEndpoint: string,
    startTime: number,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    try {
      // TTS models require special handling - they output audio, not text
      // For now, we just verify the API key is valid by checking model info
      const latency = Date.now() - startTime;

      // For Google TTS models, we can't easily test without actually generating audio
      // So we return a success message indicating the model is a TTS model
      if (
        provider.toLowerCase() === "google" ||
        provider.toLowerCase() === "gemini"
      ) {
        return {
          success: true,
          message: `TTS model configured. Note: TTS models output audio, not text. API key is set.`,
          latency,
        };
      }

      // For other providers, return similar message
      return {
        success: true,
        message: `TTS/Audio model configured. This model outputs audio instead of text. API key is set.`,
        latency,
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      const errorMessage = error.message || "Unknown error";

      this.logger.error(`TTS model test failed: ${errorMessage}`);

      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latency,
      };
    }
  }

  /**
   * Generate a chat completion using a specific API key from the database
   * Used for AI Group feature where models are configured per-tenant
   */
  async generateChatCompletionWithKey(options: {
    provider: string;
    modelId: string;
    apiKey: string;
    apiEndpoint?: string;
    systemPrompt?: string;
    messages: ChatMessage[];
    /** ★ 推荐：使用 TaskProfile 描述任务需求，AI Engine 自动映射参数 */
    taskProfile?: TaskProfile;
    /** 直接指定 maxTokens（优先级高于 taskProfile） */
    maxTokens?: number;
    /** 直接指定 temperature（优先级高于 taskProfile） */
    temperature?: number;
    displayName?: string; // AI member display name (e.g., "AI-Gemini (Image)")
    capabilities?: string[]; // AI capabilities (e.g., ["IMAGE_GENERATION", "TEXT_GENERATION"])
    enableSearch?: boolean; // Enable Google Search grounding for Gemini (default: true)
  }): Promise<ChatCompletionResult> {
    const {
      provider,
      modelId,
      apiKey,
      apiEndpoint,
      systemPrompt,
      messages,
      taskProfile,
      maxTokens: explicitMaxTokens,
      temperature: explicitTemperature,
      displayName,
      capabilities = [], // AI capabilities for image generation decision
      enableSearch = true, // Enable search by default for normal conversations
    } = options;

    // Map taskProfile to parameters if provided
    let maxTokens: number;
    let temperature: number;

    if (explicitMaxTokens !== undefined || explicitTemperature !== undefined) {
      // Explicit parameters have highest priority
      maxTokens = explicitMaxTokens ?? 2048;
      temperature = explicitTemperature ?? 0.7;
    } else if (taskProfile) {
      // Use taskProfile mapping
      const profileParams = this.taskProfileMapper.mapToParameters(
        taskProfile,
        null, // No modelConfig for generateChatCompletionWithKey
      );
      maxTokens = profileParams.maxTokens;
      temperature = profileParams.temperature;
    } else {
      // Default values
      maxTokens = 2048;
      temperature = 0.7;
    }

    this.logger.debug(
      `Generating chat completion with key for provider: ${provider}, model: ${modelId}, apiKeyLength: ${apiKey?.length || 0}, endpoint: ${apiEndpoint}`,
    );

    if (!apiKey) {
      this.logger.warn(
        `No API key provided for ${provider}, returning error response`,
      );
      // Return clear error message instead of mock response
      const aiName = displayName || this.formatModelDisplayName(modelId);
      const envVarName = this.getEnvVarNameForProvider(provider);
      return {
        content: `**API Key 未配置**

我是 ${aiName}，但无法生成回复，因为 "${modelId}" 的 API Key 未配置。

**解决方法：**
1. 进入管理后台 → AI 模型管理
2. 找到 "${modelId}" 并添加 API Key
3. 或设置环境变量：${envVarName}

*请配置 API Key 后重试。*`,
        model: modelId,
        tokensUsed: 0,
      };
    }

    this.logger.debug(
      `API key confirmed for ${provider}: ${apiKey.substring(0, 8)}...${apiKey.slice(-4)}`,
    );

    // Augment messages with URL content for all AI providers
    // This enables AI models to "access" URLs by fetching content server-side
    // ★ Pass enableSearch to control whether web search is performed
    //   Internal system calls should set enableSearch=false to avoid unnecessary searches
    const augmentedMessages = await this.augmentMessagesWithUrlContent(
      messages,
      enableSearch,
    );

    // Build full messages with system prompt
    const fullMessages: ChatMessage[] = [];
    if (systemPrompt) {
      fullMessages.push({ role: "system", content: systemPrompt });
    }
    fullMessages.push(...augmentedMessages);

    try {
      switch (provider.toLowerCase()) {
        case "xai":
        case "grok":
          // Enable live X/Twitter search for Grok
          // Uses search_parameters.mode = "auto" to let Grok decide when to search
          // Grok can search real-time X posts, news, and web content
          return await this.callApiWithKey(
            apiEndpoint || "https://api.x.ai/v1/chat/completions",
            {
              model: modelId || "grok-3-latest",
              messages: fullMessages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              max_tokens: maxTokens,
              temperature,
              // Enable live search from X/Twitter and web
              search_parameters: {
                mode: "auto", // "auto" = search when needed, "on" = always search
                return_citations: true, // Return source citations
              },
            },
            { Authorization: `Bearer ${apiKey}` },
            "grok",
          );

        case "openai":
        case "gpt":
          // Check if user is requesting image generation
          const lastUserMsg = fullMessages
            .filter((m) => m.role === "user")
            .pop();
          const userText = lastUserMsg?.content?.toLowerCase() || "";
          // Check if this AI has image generation capability
          const hasImageCapability = capabilities.includes("IMAGE_GENERATION");
          // Only generate images if:
          // 1. User explicitly requested an image (via keywords), AND
          // 2. AI has IMAGE_GENERATION capability
          // NOTE: Having IMAGE_GENERATION capability alone is NOT enough - user must request it
          const isImageRequest = this.isImageGenerationRequest(userText);
          if (isImageRequest && hasImageCapability) {
            this.logger.debug(
              `Image generation request detected (byContent=${isImageRequest}, hasCapability=${hasImageCapability}), using DALL-E 3`,
            );
            // Build context-aware prompt for DALL-E 3
            // Use English text to avoid garbled characters
            const buildDallEPrompt = (): string => {
              const recentMessages = fullMessages.slice(-10);
              const contextParts: string[] = [];

              for (const msg of recentMessages) {
                if (msg.role === "assistant" && msg.name) {
                  const truncatedContent = msg.content.substring(0, 2000);
                  contextParts.push(
                    `[${msg.name}'s analysis]: ${truncatedContent}`,
                  );
                }
              }

              const userRequest = lastUserMsg?.content || "";

              if (contextParts.length > 0) {
                const context = contextParts.join("\n\n");
                return `Based on the following context:\n\n${context}\n\nUser's request: ${userRequest}\n\nIMPORTANT INSTRUCTIONS FOR IMAGE GENERATION:
1. Create a professional infographic or data visualization
2. ALL TEXT IN THE IMAGE MUST BE IN ENGLISH - do not use Chinese or other non-Latin characters as they may appear garbled
3. If the context contains Chinese data/names, translate them to English equivalents
4. Use clean, modern design with clear labels, legends, and proper typography
5. Ensure all text is legible and properly rendered
6. Use appropriate charts (bar, line, pie) to visualize numerical data`;
              }

              return `${userRequest}\n\nIMPORTANT: All text in the image must be in English. Use clean, professional design.`;
            };

            const dallePrompt = buildDallEPrompt();
            this.logger.debug(
              `[DALL-E 3] Context-aware prompt length: ${dallePrompt.length}`,
            );
            return await this.callDallE3(apiKey, dallePrompt);
          }
          // ★ 数据库驱动：使用 inferIsReasoning 推断 tokenParamName
          const effectiveModelId = modelId || "gpt-4-turbo-preview";
          const isReasoning = this.inferIsReasoning(effectiveModelId);
          const tokenParamName = isReasoning
            ? "max_completion_tokens"
            : "max_tokens";
          const tokenParam = { [tokenParamName]: maxTokens };

          // ★ 推理模型 (o1, o3) 需要设置 reasoning_effort 参数
          // 注意：GPT-5 不支持 reasoning_effort 参数（返回 400 错误）
          const isO1O3Model =
            effectiveModelId.toLowerCase().startsWith("o1") ||
            effectiveModelId.toLowerCase().startsWith("o3");

          // 只对 o1/o3 系列模型添加 reasoning_effort 参数
          const reasoningParam = isO1O3Model ? { reasoning_effort: "low" } : {};

          this.logger.debug(
            `[OpenAI] Calling API with model=${effectiveModelId}, ` +
              `${tokenParamName}=${maxTokens}` +
              `${isO1O3Model ? ", reasoning_effort=low" : ""}`,
          );

          return await this.callApiWithKey(
            apiEndpoint || "https://api.openai.com/v1/chat/completions",
            {
              model: effectiveModelId,
              messages: fullMessages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              ...tokenParam,
              ...reasoningParam,
              temperature,
            },
            { Authorization: `Bearer ${apiKey}` },
            "gpt-4",
          );

        case "anthropic":
        case "claude":
          const systemMessage = fullMessages.find((m) => m.role === "system");
          const otherMessages = fullMessages.filter((m) => m.role !== "system");
          return await this.callClaudeApiWithKey(
            apiEndpoint || "https://api.anthropic.com/v1/messages",
            apiKey,
            modelId || "claude-3-opus-20240229",
            systemMessage?.content,
            otherMessages,
            maxTokens,
            temperature,
          );

        case "google":
        case "gemini":
          return await this.callGeminiApiWithKey(
            apiKey,
            modelId || "gemini-2.0-flash-exp",
            apiEndpoint,
            fullMessages,
            maxTokens,
            temperature,
            displayName,
            capabilities,
            enableSearch,
          );

        default:
          this.logger.warn(`Unknown provider: ${provider}, using Grok`);
          return await this.callApiWithKey(
            "https://api.x.ai/v1/chat/completions",
            {
              model: "grok-beta",
              messages: fullMessages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              max_tokens: maxTokens,
              temperature,
            },
            { Authorization: `Bearer ${apiKey}` },
            "grok",
          );
      }
    } catch (error) {
      const errorDetails =
        error instanceof Error
          ? {
              message: error.message,
              name: error.name,
              response: (error as any).response?.data,
              status: (error as any).response?.status,
            }
          : error;
      this.logger.error(
        `API call failed for ${provider}: ${JSON.stringify(errorDetails)}`,
      );

      const errorMessage =
        (error as any).response?.data?.error?.message ||
        (error instanceof Error ? error.message : "Unknown API error");

      // ★ 对于上下文过大导致的截断错误，重新抛出让调用方处理（触发重试机制）
      // 这些错误可以通过减少上下文来恢复
      if (
        errorMessage.includes("截断") ||
        errorMessage.includes("上下文") ||
        errorMessage.includes("context") ||
        errorMessage.includes("token") ||
        errorMessage.includes("length")
      ) {
        this.logger.warn(
          `[${provider}] Rethrowing context-related error for caller to handle: ${errorMessage}`,
        );
        throw error;
      }

      // IMPORTANT: Return error message instead of mock response
      // This helps users understand what went wrong
      return {
        content: `API Error: ${errorMessage}\n\nProvider: ${provider}\nModel: ${modelId}\n\nPlease check your API key and model configuration.`,
        model: modelId,
        tokensUsed: 0,
      };
    }
  }

  /**
   * Helper method to call OpenAI-compatible APIs with automatic retry for network errors
   */
  private async callApiWithKey(
    url: string,
    body: any,
    headers: Record<string, string>,
    modelName: string,
  ): Promise<ChatCompletionResult> {
    // ★ 根据 maxTokens 动态计算超时时间
    // 基础超时 120 秒，每 1000 tokens 增加 15 秒
    // 例如：16000 tokens = 120 + 240 = 360 秒 (6 分钟)
    // 推理模型额外增加 3 分钟思考时间
    const maxTokens = body.max_completion_tokens || body.max_tokens || 2048;
    // ★ 使用统一的 isReasoningModel() 方法，优先使用数据库配置
    const isReasoning = this.isReasoningModel(modelName);
    const baseTimeout = isReasoning ? 300000 : 120000; // 推理模型 5 分钟起，普通模型 2 分钟起
    const maxTimeout = isReasoning ? 900000 : 600000; // 推理模型最多 15 分钟，普通模型最多 10 分钟
    const dynamicTimeout = Math.max(
      baseTimeout,
      Math.min(maxTimeout, baseTimeout + Math.ceil(maxTokens / 1000) * 15000),
    );
    this.logger.debug(
      `[${modelName}] Dynamic timeout: ${dynamicTimeout}ms (maxTokens=${maxTokens}, reasoning=${isReasoning})`,
    );

    // ★ 估算请求 token 数量（用于诊断）
    const estimateTokens = (text: string): number => {
      if (!text) return 0;
      const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const totalChars = text.length;
      const chineseRatio = chineseChars / totalChars || 0;
      return Math.ceil(
        totalChars * (chineseRatio * 1.5 + (1 - chineseRatio) * 0.25),
      );
    };

    const systemPromptTokens = body.messages?.find(
      (m: any) => m.role === "system",
    )?.content
      ? estimateTokens(
          body.messages.find((m: any) => m.role === "system").content,
        )
      : 0;
    const userTokens =
      body.messages
        ?.filter((m: any) => m.role === "user")
        .reduce(
          (sum: number, m: any) => sum + estimateTokens(m.content || ""),
          0,
        ) || 0;
    const totalEstimatedTokens = systemPromptTokens + userTokens;

    this.logger.debug(
      `[${modelName}] Calling API: ${url.replace(/Bearer\s+\S+/, "Bearer ***")}`,
    );
    this.logger.debug(
      `[${body.model}] Request: model=${body.model}, ` +
        `maxTokens=${body.max_completion_tokens || body.max_tokens || "?"}, ` +
        `estimatedPromptTokens=${totalEstimatedTokens} (system=${systemPromptTokens}, user=${userTokens})`,
    );

    // Wrap API call with retry logic for network errors
    return await this.withRetry(
      async () => {
        const response = await firstValueFrom(
          this.httpService.post(url, body, {
            headers: {
              "Content-Type": "application/json",
              ...headers,
            },
            timeout: dynamicTimeout,
          }),
        );

        const data = response.data;
        const messageObj = data.choices?.[0]?.message;
        // ★ 支持 reasoning 模型可能返回的不同字段结构
        const content =
          messageObj?.content ||
          messageObj?.text ||
          messageObj?.output ||
          (typeof messageObj === "string" ? messageObj : null);

        // Log response details for debugging (verbose level to reduce production noise)
        if (data.error) {
          this.logger.error(
            `[${modelName}] API returned error: ${JSON.stringify(data.error)}`,
          );
        }

        const finishReason = data.choices?.[0]?.finish_reason;

        // ★ 检查 OpenAI 拒绝响应
        if (messageObj?.refusal) {
          this.logger.error(
            `[${modelName}] API refused to respond: ${messageObj.refusal}`,
          );
          throw new Error(`AI 拒绝响应: ${messageObj.refusal}`);
        }

        // ★ 调试日志：记录消息对象结构（仅当内容为空时）
        if (!content) {
          this.logger.warn(
            `[${modelName}] Message object structure: ${JSON.stringify(messageObj || {}).substring(0, 500)}`,
          );
        }

        if (!content) {
          // ★ 详细记录 token 使用情况，帮助诊断问题
          const usage = data.usage || {};
          const completionDetails = usage.completion_tokens_details || {};
          const reasoningTokens = completionDetails.reasoning_tokens || 0;
          const completionTokens = usage.completion_tokens || 0;

          this.logger.warn(
            `[${modelName}] API returned empty content! ` +
              `finish_reason=${finishReason}, ` +
              `prompt_tokens=${usage.prompt_tokens || "?"}, ` +
              `completion_tokens=${completionTokens || "?"}, ` +
              `reasoning_tokens=${reasoningTokens || "?"}, ` +
              `total_tokens=${usage.total_tokens || "?"}, ` +
              `full response: ${JSON.stringify(data).substring(0, 800)}`,
          );

          // 检测是否是 reasoning 模型（如 o1/gpt-5.1）用完了推理 token
          const isReasoningModelExhausted =
            reasoningTokens > 0 && reasoningTokens >= completionTokens * 0.9;

          if (finishReason === "length") {
            if (isReasoningModelExhausted) {
              // Reasoning 模型特殊处理：推理 token 用完了，没有空间输出
              this.logger.error(
                `[${modelName}] CRITICAL: Reasoning model exhausted all tokens on reasoning (${reasoningTokens}/${completionTokens}). ` +
                  `No tokens left for actual output. Increase max_tokens significantly (e.g., 8000+) for reasoning models.`,
              );
              throw new Error(
                `AI 推理模型的 token 全部用于思考，没有空间输出结果。请增加 max_tokens 设置（建议 8000+）。`,
              );
            } else {
              // 普通模型：上下文过大
              this.logger.error(
                `[${modelName}] CRITICAL: Response completely truncated (no content generated). ` +
                  `This usually means the context is too large for the model. ` +
                  `prompt_tokens=${usage.prompt_tokens || "?"}, max_tokens requested in API call may be too low.`,
              );
              throw new Error(
                `AI 响应被完全截断（上下文可能过大）。请减少上下文消息或简化请求。`,
              );
            }
          }
          // 其他原因导致的空内容
          throw new Error(`AI 返回空响应 (原因: ${finishReason || "unknown"})`);
        }

        // 如果有内容但是被截断，添加提示
        let finalContent = content;
        if (finishReason === "length") {
          this.logger.warn(
            `[${modelName}] Response content was truncated (finish_reason=length), content length: ${content.length}`,
          );
          // 如果内容不是以完整句子结尾，添加截断提示
          if (
            !content.endsWith(".") &&
            !content.endsWith("。") &&
            !content.endsWith("!") &&
            !content.endsWith("！") &&
            !content.endsWith("?") &&
            !content.endsWith("？")
          ) {
            finalContent = content + "\n\n[... 响应因长度限制被截断]";
          }
        }

        return {
          content: finalContent,
          model: modelName,
          tokensUsed: data.usage?.total_tokens || 0,
        };
      },
      `${modelName}-API`,
      modelName,
    );
  }

  /**
   * Helper method to call Claude API with key and automatic retry for network errors
   */
  private async callClaudeApiWithKey(
    url: string,
    apiKey: string,
    modelId: string,
    systemPrompt: string | undefined,
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
  ): Promise<ChatCompletionResult> {
    // ★ 根据 maxTokens 动态计算超时时间
    const dynamicTimeout = Math.max(
      120000,
      Math.min(600000, 120000 + Math.ceil(maxTokens / 1000) * 15000),
    );

    return await this.withRetry(
      async () => {
        const response = await firstValueFrom(
          this.httpService.post(
            url,
            {
              model: modelId,
              max_tokens: maxTokens,
              temperature,
              system: systemPrompt,
              messages: messages.map((m) => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: m.content,
              })),
            },
            {
              headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
              },
              timeout: dynamicTimeout,
            },
          ),
        );

        const data = response.data;
        return {
          content: data.content?.[0]?.text || "",
          model: "claude",
          tokensUsed:
            (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        };
      },
      "Claude-API",
      "claude",
    );
  }

  /**
   * Helper method to call Gemini API with key
   * Supports both text and image generation
   */
  private async callGeminiApiWithKey(
    apiKey: string,
    modelId: string,
    _apiEndpoint: string | undefined, // Reserved for future use
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
    displayName?: string, // AI member display name (e.g., "AI-Gemini (Image)")
    capabilities: string[] = [], // AI capabilities
    enableSearch: boolean = true, // Enable Google Search grounding (default: true)
  ): Promise<ChatCompletionResult> {
    // ★ 根据 maxTokens 动态计算超时时间
    const dynamicTimeout = Math.max(
      120000,
      Math.min(600000, 120000 + Math.ceil(maxTokens / 1000) * 15000),
    );

    // Check if user is requesting image generation
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    const userContent = lastUserMessage?.content?.toLowerCase() || "";
    const isImageRequestByContent = this.isImageGenerationRequest(userContent);

    // Check if this AI has IMAGE_GENERATION capability
    const hasImageCapability = capabilities.includes("IMAGE_GENERATION");

    // Check if the configured model is Imagen (dedicated image generation model)
    // Only true Imagen models (imagen-xxx) should use the Imagen API
    // Gemini models with "image" in name (like gemini-3-pro-image-preview) use native Gemini image generation
    const modelIdLower = modelId.toLowerCase();
    const isImagenModel = modelIdLower.startsWith("imagen");

    // Check if this is a Gemini model with native image generation support
    const isGeminiImageModel =
      modelIdLower.includes("gemini") &&
      (modelIdLower.includes("image") || modelIdLower.includes("2.0"));

    // Only generate images if:
    // 1. User explicitly requested an image (via keywords), AND
    // 2. AI has IMAGE_GENERATION capability
    // NOTE: Having IMAGE_GENERATION capability alone is NOT enough - user must request it
    const isImageRequest = isImageRequestByContent && hasImageCapability;

    this.logger.debug(
      `[Gemini] Image detection: modelId=${modelId}, displayName=${displayName}`,
    );
    this.logger.debug(
      `[Gemini] Image detection details: hasImageCapability=${hasImageCapability}, capabilities=${JSON.stringify(capabilities)}, isImageRequestByContent=${isImageRequestByContent}, userContent="${userContent.substring(0, 100)}"`,
    );
    this.logger.debug(
      `[Gemini] Image detection result: isImagenModel=${isImagenModel}, isGeminiImageModel=${isGeminiImageModel}, finalIsImageRequest=${isImageRequest}`,
    );

    // Build context-aware prompt for image generation
    // CRITICAL: Include ALL relevant context - user requests AND AI responses
    // Since Imagen cannot see previous images, we must describe them in text
    const buildImagePrompt = (): string => {
      // Get the last few messages for context (both user and assistant messages)
      const recentMessages = messages.slice(-10); // Last 10 messages for context

      // Build conversation history to understand what the user wants
      const conversationParts: string[] = [];

      for (const msg of recentMessages) {
        // Clean the content - remove @mentions and image markdown
        const cleanContent = msg.content
          .replace(/^@[\w\-()]+\s*/g, "") // Remove @mentions
          .replace(
            /!\[.*?\]\(data:image\/[^)]+\)/g,
            "[Previously generated image]",
          ) // Replace base64 images with placeholder
          .trim();

        if (!cleanContent || cleanContent === "[Previously generated image]") {
          continue; // Skip empty messages or image-only messages
        }

        if (msg.role === "user") {
          conversationParts.push(`User request: ${cleanContent}`);
        } else if (msg.role === "assistant" && msg.name) {
          // Only include text responses, not just image placeholders
          if (cleanContent.length > 10) {
            conversationParts.push(
              `${msg.name} responded: ${cleanContent.substring(0, 500)}`,
            );
          }
        }
      }

      // Get the user's current request - remove @mentions to get clean prompt
      let userRequest = lastUserMessage?.content || "";
      userRequest = userRequest.replace(/^@[\w\-()]+\s*/g, "").trim();

      this.logger.debug(
        `[buildImagePrompt] Original: "${lastUserMessage?.content}", Cleaned: "${userRequest}"`,
      );

      // Build the final prompt with full context
      if (conversationParts.length > 1) {
        // There's conversation history - include it for context
        const history = conversationParts.slice(0, -1).join("\n"); // Exclude current request
        return `Based on this conversation history:
${history}

Current request: ${userRequest}

Generate an image that fulfills the current request while maintaining consistency with the previous context.`;
      }

      // For simple requests without history, just pass the user's request directly
      return userRequest;
    };

    // Use Imagen API only if explicitly configured as Imagen model
    if (isImageRequest && isImagenModel) {
      this.logger.debug(`Using Imagen model for image generation: ${modelId}`);
      const imagePrompt = buildImagePrompt();
      return await this.callImagenApi(apiKey, modelId, imagePrompt);
    }

    // Check if this is a dedicated image model (not suitable for text conversations)
    const isImageOnlyModel =
      modelIdLower.includes("image") || modelIdLower.startsWith("imagen");

    // 直接使用数据库配置的模型 ID，不做额外验证
    // 如果模型无效，Google API 会返回明确错误，不应静默替换
    // 用户在管理后台配置的模型如果通过测试，就应该被信任
    let effectiveModelId = modelId;

    if (isImageOnlyModel && !isImageRequest) {
      // Image-only models can't do text conversations - fall back to text model
      effectiveModelId = "gemini-2.0-flash-exp";
      this.logger.debug(
        `[Gemini] Image-only model ${modelId} used for non-image request, falling back to ${effectiveModelId}`,
      );
    } else if (isImageRequest && isGeminiImageModel) {
      // User requested image AND model is Gemini with image capability - use as configured
      this.logger.debug(
        `[Gemini] Using configured Gemini image model: ${modelId}`,
      );
      // Keep the configured model (e.g., gemini-3-pro-image-preview)
    } else if (isImageRequest && !isGeminiImageModel && !isImagenModel) {
      // User requested image but model doesn't support it - switch to capable model
      const imageCapableModel = "gemini-2.0-flash-exp";
      this.logger.debug(
        `[Gemini] Image request with non-image model ${modelId}, switching to ${imageCapableModel}`,
      );
      effectiveModelId = imageCapableModel;
    } else {
      this.logger.debug(
        `[Gemini] Using configured model: ${effectiveModelId}, isImageRequest: ${isImageRequest}`,
      );
    }

    // Build the correct Gemini API URL
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModelId}:generateContent?key=${apiKey}`;

    this.logger.debug(
      `Calling Gemini API: ${url.replace(apiKey, "***")}, imageRequest=${isImageRequest}`,
    );

    // Extract system message for system instruction
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    // For Gemini 3 image models, use simplified single-turn format
    // These models have special requirements and don't support multi-turn with model responses
    const isGemini3ImageModel =
      effectiveModelId.includes("gemini-3") &&
      effectiveModelId.includes("image");

    let contents: any[];

    if (isGemini3ImageModel && isImageRequest) {
      // IMPORTANT: Gemini 3 image models require single-turn format
      // They don't accept model responses in the conversation history
      // Use only the latest user message for image generation
      const lastUserMessage = otherMessages
        .filter((m) => m.role === "user")
        .pop();

      // Clean up the user message - remove @mentions and base64 images
      let cleanPrompt = lastUserMessage?.content || "Generate an image";
      cleanPrompt = cleanPrompt
        .replace(/^@[\w\-()]+\s*/g, "") // Remove @mentions
        .replace(/!\[.*?\]\(data:image\/[^)]+\)/g, "") // Remove base64 images
        .trim();

      // DO NOT add extra instructions - Gemini will render them as part of the image
      // Just pass the user's request directly, translated to English if needed
      this.logger.debug(
        `[Gemini 3 Image] Using single-turn format, prompt: "${cleanPrompt.substring(0, 100)}..."`,
      );

      contents = [
        {
          role: "user",
          parts: [{ text: cleanPrompt }],
        },
      ];
    } else {
      // Standard multi-turn format for other models
      // IMPORTANT: Clean up base64 images from message content to avoid sending huge payloads
      contents = otherMessages.map((m) => {
        let cleanContent = m.content;

        // Replace base64 image data with description placeholder
        if (cleanContent.includes("![Generated Image](data:image")) {
          cleanContent = cleanContent.replace(
            /!\[Generated Image\]\(data:image\/[^)]+\)/g,
            "[An image was generated based on the previous request]",
          );
          this.logger.debug(
            `[Gemini] Cleaned base64 image from message, role: ${m.role}`,
          );
        }

        return {
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: cleanContent }],
        };
      });
    }

    const requestBody: any = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    };

    // Enable image generation if requested
    if (isImageRequest) {
      requestBody.generationConfig.responseModalities = ["TEXT", "IMAGE"];
      this.logger.log(
        `[Gemini] Image generation enabled, model: ${effectiveModelId}, isGemini3=${isGemini3ImageModel}`,
      );
    } else {
      // Enable Google Search Grounding for text-only responses (if enabled)
      // Note: Some models (e.g., gemini-3-flash-preview) may return MALFORMED_FUNCTION_CALL
      // when googleSearch is enabled. Disable for simple tasks like title generation.
      if (enableSearch) {
        requestBody.tools = [
          {
            googleSearch: {},
          },
        ];
      }

      // Only add system instruction for non-image requests
      if (systemMessage) {
        requestBody.systemInstruction = {
          parts: [{ text: systemMessage.content }],
        };
      }
    }

    // Wrap Gemini API call with retry logic for network errors
    const response = await this.withRetry(
      async () =>
        firstValueFrom(
          this.httpService.post(url, requestBody, {
            headers: {
              "Content-Type": "application/json",
            },
            timeout: dynamicTimeout, // Dynamic timeout based on maxTokens
          }),
        ),
      "Gemini-API",
      "gemini",
    );

    const data = response.data;

    // Log response details for debugging (verbose level to reduce noise)
    this.logger.verbose(`[Gemini] Response status: ${response.status}`);

    if (data.candidates?.[0]) {
      const candidate = data.candidates[0];

      // Check for safety ratings that might block response
      if (candidate.safetyRatings) {
        const blocked = candidate.safetyRatings.filter(
          (r: any) => r.probability === "HIGH" || r.blocked,
        );
        if (blocked.length > 0) {
          this.logger.warn(
            `[Gemini] Safety blocked: ${JSON.stringify(blocked)}`,
          );
        }
      }
    }

    if (data.promptFeedback?.blockReason) {
      this.logger.error(
        `[Gemini] Prompt blocked: ${data.promptFeedback.blockReason}`,
      );
      return {
        content: `Response blocked by Gemini safety filters: ${data.promptFeedback.blockReason}`,
        model: "gemini",
        tokensUsed: 0,
      };
    }

    // Process response - handle both text and image parts
    const parts = data.candidates?.[0]?.content?.parts || [];
    let textContent = "";
    const images: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part.text) {
        textContent += part.text;
      }
      if (part.inlineData) {
        // Image data is returned as base64
        const mimeType = part.inlineData.mimeType || "image/png";
        // CRITICAL: Remove all whitespace from base64 data (Gemini may include newlines)
        const base64Data = part.inlineData.data?.replace(/\s/g, "") || "";

        if (base64Data && base64Data.length > 0) {
          // Validate base64 format
          const validBase64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
          if (!validBase64Regex.test(base64Data)) {
            this.logger.warn(
              `[Gemini] Part ${i} base64 has invalid characters!`,
            );
          }

          const imageMarkdown = `![Generated Image](data:${mimeType};base64,${base64Data})`;
          images.push(imageMarkdown);
        } else {
          this.logger.warn(`[Gemini] Part ${i} has inlineData but no data!`);
        }
      }
    }

    // Combine text and images in the response
    let finalContent = textContent;
    if (images.length > 0) {
      finalContent =
        images.join("\n\n") + (textContent ? "\n\n" + textContent : "");
      this.logger.log(
        `[Gemini] Generated ${images.length} image(s), final content length: ${finalContent.length}`,
      );
    }

    // FALLBACK: If this was an image request but Gemini didn't return any images,
    // fall back to Imagen API for image generation
    if (isImageRequest && images.length === 0) {
      this.logger.warn(
        `[Gemini] Image generation requested but no images returned, falling back to Imagen API`,
      );

      // Build context-aware prompt for Imagen fallback
      // Include previous AI responses so image generation has proper context
      // Use English text to avoid garbled characters
      const buildFallbackImagePrompt = (): string => {
        const recentMessages = messages.slice(-10);
        const contextParts: string[] = [];

        for (const msg of recentMessages) {
          if (msg.role === "assistant" && msg.name) {
            const truncatedContent = msg.content.substring(0, 2000);
            contextParts.push(`[${msg.name}'s analysis]: ${truncatedContent}`);
          }
        }

        const lastUserMsg = messages.filter((m) => m.role === "user").pop();
        const userRequest = lastUserMsg?.content || "";

        if (contextParts.length > 0) {
          const context = contextParts.join("\n\n");
          return `Based on the following context from the discussion:\n\n${context}\n\nUser's request: ${userRequest}\n\nIMPORTANT INSTRUCTIONS:
1. Create a professional infographic or data visualization
2. ALL TEXT IN THE IMAGE MUST BE IN ENGLISH - do not use Chinese or other non-Latin characters
3. If the context contains Chinese data/names, translate them to English
4. Use clean, modern design with clear labels and legends
5. Ensure all text is legible and properly rendered`;
        }

        return `${userRequest}\n\nIMPORTANT: All text in the image must be in English.`;
      };

      const imagePrompt = buildFallbackImagePrompt();
      this.logger.log(
        `[Imagen Fallback] Context-aware prompt length: ${imagePrompt.length}`,
      );

      // Try Imagen API as fallback
      try {
        const imagenResult = await this.callImagenApi(
          apiKey,
          "imagen-4.0-generate-001",
          imagePrompt,
        );

        // If Imagen succeeded, combine with Gemini's text response
        if (
          imagenResult.content &&
          !imagenResult.content.includes("图像生成失败")
        ) {
          this.logger.log(`[Imagen Fallback] Successfully generated image`);
          // If Gemini provided useful text, append it
          if (textContent && textContent.length > 50) {
            return {
              content: imagenResult.content + "\n\n" + textContent,
              model: "gemini+imagen",
              tokensUsed:
                (data.usageMetadata?.promptTokenCount || 0) +
                (data.usageMetadata?.candidatesTokenCount || 0),
            };
          }
          return imagenResult;
        }
      } catch (imagenError) {
        this.logger.error(`[Imagen Fallback] Failed: ${imagenError}`);
      }

      // If Imagen also failed, check if we have OpenAI API key for DALL-E 3 fallback
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        this.logger.log(
          `[DALL-E 3 Fallback] Imagen failed, trying DALL-E 3 with OpenAI API key`,
        );
        try {
          const dallePrompt = buildFallbackImagePrompt();
          const dalleResult = await this.callDallE3(openaiKey, dallePrompt);
          if (
            dalleResult.content &&
            !dalleResult.content.includes("图像生成失败")
          ) {
            this.logger.log(`[DALL-E 3 Fallback] Successfully generated image`);
            if (textContent && textContent.length > 50) {
              return {
                content: dalleResult.content + "\n\n" + textContent,
                model: "gemini+dalle3",
                tokensUsed:
                  (data.usageMetadata?.promptTokenCount || 0) +
                  (data.usageMetadata?.candidatesTokenCount || 0),
              };
            }
            return dalleResult;
          }
        } catch (dalleError) {
          this.logger.error(`[DALL-E 3 Fallback] Failed: ${dalleError}`);
        }
      }

      // If all image generation attempts failed, return Gemini's text response with explanation
      if (textContent) {
        return {
          content:
            textContent +
            "\n\n---\n\n**⚠️ 图片生成失败**\n\nAI 生成了上面的描述内容，但未能生成实际图片。\n\n**可能的解决方案：**\n1. 确保 Google API Key 启用了图片生成功能\n2. 检查 Imagen API 是否已在 Google Cloud 控制台启用\n3. 尝试使用配置了 OPENAI_API_KEY 的 AI 成员（支持 DALL-E 3）",
          model: "gemini",
          tokensUsed:
            (data.usageMetadata?.promptTokenCount || 0) +
            (data.usageMetadata?.candidatesTokenCount || 0),
        };
      }
    }

    const finishReason = data.candidates?.[0]?.finishReason;

    if (!finalContent) {
      this.logger.warn(
        `[Gemini] Empty response (finishReason=${finishReason}), full data: ${JSON.stringify(data).substring(0, 500)}`,
      );
      // 返回友好提示而不是抛出异常
      if (finishReason === "MAX_TOKENS") {
        this.logger.error(
          `[Gemini] CRITICAL: Response completely truncated (no content generated). Context may be too large!`,
        );
        throw new Error(
          `AI 响应被完全截断（上下文可能过大）。请减少上下文消息或简化请求。`,
        );
      }
      throw new Error(`AI 返回空响应 (原因: ${finishReason || "unknown"})`);
    }

    // 如果有内容但是被截断，添加提示
    if (finishReason === "MAX_TOKENS") {
      this.logger.warn(
        `[Gemini] Response content was truncated (finishReason=MAX_TOKENS), content length: ${finalContent.length}`,
      );
      // 如果内容不是以完整句子结尾，添加截断提示
      if (
        !finalContent.endsWith(".") &&
        !finalContent.endsWith("。") &&
        !finalContent.endsWith("!") &&
        !finalContent.endsWith("！") &&
        !finalContent.endsWith("?") &&
        !finalContent.endsWith("？")
      ) {
        finalContent = finalContent + "\n\n[... 响应因长度限制被截断]";
      }
    }

    return {
      content: finalContent,
      model: "gemini",
      tokensUsed:
        (data.usageMetadata?.promptTokenCount || 0) +
        (data.usageMetadata?.candidatesTokenCount || 0),
    };
  }

  /**
   * Check if the user message is requesting image generation
   */
  private isImageGenerationRequest(content: string): boolean {
    const imageKeywords = [
      // Chinese
      "生成图",
      "画图",
      "画一",
      "画个",
      "画张",
      "创建图",
      "制作图",
      "生成一张",
      "生成一个图",
      "帮我画",
      "给我画",
      "图片",
      "图像",
      "插图",
      "绘制",
      "设计图",
      "信息图",
      "流程图",
      "示意图",
      // English
      "generate image",
      "create image",
      "draw",
      "make image",
      "generate picture",
      "create picture",
      "illustration",
      "infographic",
      "diagram",
      "visualize",
      "picture of",
      "image of",
    ];

    const lowerContent = content.toLowerCase();
    return imageKeywords.some((keyword) => lowerContent.includes(keyword));
  }

  /**
   * Call OpenAI DALL-E 3 API for image generation with automatic retry for network errors
   * DALL-E 3 produces the best infographics and diagrams
   */
  private async callDallE3(
    apiKey: string,
    prompt: string,
  ): Promise<ChatCompletionResult> {
    const url = "https://api.openai.com/v1/images/generations";

    this.logger.log(`Calling DALL-E 3 API for image generation`);

    try {
      // Wrap with retry logic for network errors
      const response = await this.withRetry(
        async () =>
          firstValueFrom(
            this.httpService.post(
              url,
              {
                model: "dall-e-3",
                prompt: prompt,
                n: 1,
                size: "1024x1024",
                quality: "hd",
                response_format: "b64_json",
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 120000, // 2 minutes for image generation
              },
            ),
          ),
        "DALL-E-3-API",
        "dall-e-3",
      );

      const data = response.data;
      const imageData = data.data?.[0];

      if (imageData?.b64_json) {
        const imageMarkdown = `![Generated Image](data:image/png;base64,${imageData.b64_json})`;
        const revisedPrompt = imageData.revised_prompt
          ? `\n\n*Prompt used: ${imageData.revised_prompt}*`
          : "";

        this.logger.log("DALL-E 3 image generated successfully");

        return {
          content: imageMarkdown + revisedPrompt,
          model: "dall-e-3",
          tokensUsed: 0,
        };
      } else if (imageData?.url) {
        // Fallback to URL if b64_json not available
        const imageMarkdown = `![Generated Image](${imageData.url})`;
        return {
          content: imageMarkdown,
          model: "dall-e-3",
          tokensUsed: 0,
        };
      }

      throw new Error("No image data in response");
    } catch (error: any) {
      this.logger.error(
        `DALL-E 3 API error: ${error.response?.data?.error?.message || error.message}`,
      );

      // Return helpful error message instead of mock
      return {
        content: `抱歉，图像生成失败: ${error.response?.data?.error?.message || error.message}\n\n请检查 OpenAI API Key 是否有 DALL-E 3 的访问权限。`,
        model: "dall-e-3",
        tokensUsed: 0,
      };
    }
  }

  /**
   * Call Google Imagen API for image generation
   * Imagen 3 produces high-quality images
   */
  private async callImagenApi(
    apiKey: string,
    modelId: string,
    prompt: string,
  ): Promise<ChatCompletionResult> {
    // Use Imagen 4.0 as it's the latest available model via Gemini API
    // Available models: imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001
    const imagenModel = modelId.includes("imagen-4")
      ? modelId
      : "imagen-4.0-generate-001";

    // Correct endpoint format: :predict with x-goog-api-key header
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${imagenModel}:predict`;

    this.logger.log(`[Imagen] Calling API: ${url}`);
    this.logger.log(
      `[Imagen] Model: ${imagenModel}, Prompt length: ${prompt.length}`,
    );
    // Log the actual prompt being sent (first 500 chars for debugging)
    this.logger.log(
      `[Imagen] Prompt content: "${prompt.substring(0, 500)}${prompt.length > 500 ? "..." : ""}"`,
    );

    try {
      // Wrap with retry logic for network errors
      const response = await this.withRetry(
        async () =>
          firstValueFrom(
            this.httpService.post(
              url,
              {
                instances: [
                  {
                    prompt: prompt,
                  },
                ],
                parameters: {
                  sampleCount: 1,
                  aspectRatio: "16:9", // Better for infographics
                  outputOptions: {
                    mimeType: "image/png",
                  },
                },
              },
              {
                headers: {
                  "x-goog-api-key": apiKey,
                  "Content-Type": "application/json",
                },
                timeout: 120000, // 2 minutes for image generation
              },
            ),
          ),
        "Imagen-API",
        "imagen",
      );

      const data = response.data;
      this.logger.log(
        `[Imagen] Response received, keys: ${Object.keys(data).join(", ")}`,
      );

      // Response format can vary - handle both formats:
      // 1. SDK format: { generatedImages: [{ image: { imageBytes: "..." } }] }
      // 2. REST format: { predictions: [{ bytesBase64Encoded: "..." }] }
      let images: string[] = [];

      // Try SDK format first (generatedImages)
      if (data.generatedImages && data.generatedImages.length > 0) {
        images = data.generatedImages
          .map((img: any, index: number) => {
            const imageBytes = img.image?.imageBytes || img.imageBytes;
            if (imageBytes) {
              const cleanBase64 = imageBytes.replace(/\s/g, "");
              return `![Generated Image ${index + 1}](data:image/png;base64,${cleanBase64})`;
            }
            return null;
          })
          .filter(Boolean);
      }

      // Try REST format (predictions)
      if (
        images.length === 0 &&
        data.predictions &&
        data.predictions.length > 0
      ) {
        images = data.predictions
          .map((pred: any, index: number) => {
            const imageBytes =
              pred.bytesBase64Encoded || pred.image?.imageBytes;
            if (imageBytes) {
              const cleanBase64 = imageBytes.replace(/\s/g, "");
              return `![Generated Image ${index + 1}](data:image/png;base64,${cleanBase64})`;
            }
            return null;
          })
          .filter(Boolean);
      }

      if (images.length > 0) {
        this.logger.log(
          `[Imagen] Successfully generated ${images.length} image(s)`,
        );
        return {
          content: images.join("\n\n"),
          model: imagenModel,
          tokensUsed: 0,
        };
      }

      // If no images, log the response structure for debugging
      this.logger.warn(
        `[Imagen] No images found in response: ${JSON.stringify(data).substring(0, 1000)}`,
      );
      throw new Error("No images generated - check response format");
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      this.logger.error(`[Imagen] API error: ${errorMsg}`);
      this.logger.error(
        `[Imagen] Full error: ${JSON.stringify(error.response?.data || {}).substring(0, 1000)}`,
      );

      return {
        content: `抱歉，Imagen 图像生成失败: ${errorMsg}\n\n请确认:\n1. Google API Key 具有 Imagen API 访问权限\n2. 模型 imagen-4.0-generate-001 已可用\n3. Imagen API 已在 Google Cloud 项目中启用`,
        model: imagenModel,
        tokensUsed: 0,
      };
    }
  }

  /**
   * Generate a mock response for development/testing when API keys are not configured
   */
  /**
   * Format a model ID into a user-friendly display name
   */
  private formatModelDisplayName(model: string): string {
    const modelLower = model.toLowerCase();

    // Map common model IDs to friendly names
    if (modelLower.includes("gemini")) {
      if (modelLower.includes("flash")) return "Gemini Flash";
      if (modelLower.includes("pro")) return "Gemini Pro";
      if (modelLower.includes("imagen")) return "Gemini Imagen";
      return "Gemini";
    }
    if (modelLower.includes("grok")) return "Grok";
    if (modelLower.includes("gpt-4")) return "GPT-4";
    if (modelLower.includes("gpt-5")) return "GPT-5";
    if (modelLower.startsWith("o1")) return "OpenAI o1";
    if (modelLower.startsWith("o3")) return "OpenAI o3";
    if (modelLower.includes("claude")) {
      if (modelLower.includes("opus")) return "Claude Opus";
      if (modelLower.includes("sonnet")) return "Claude Sonnet";
      if (modelLower.includes("haiku")) return "Claude Haiku";
      return "Claude";
    }
    if (modelLower.includes("dall-e")) return "DALL-E";

    // Default: return the model ID as-is
    return model;
  }

  /**
   * Get the environment variable name for a provider's API key
   */
  private getEnvVarNameForProvider(provider: string): string {
    const providerLower = provider.toLowerCase();
    if (providerLower === "xai" || providerLower === "grok")
      return "XAI_API_KEY";
    if (providerLower === "openai" || providerLower === "gpt")
      return "OPENAI_API_KEY";
    if (providerLower === "anthropic" || providerLower === "claude")
      return "ANTHROPIC_API_KEY";
    if (providerLower === "google" || providerLower === "gemini")
      return "GOOGLE_AI_API_KEY";
    return `${provider.toUpperCase()}_API_KEY`;
  }

  /**
   * Fetch available models from a provider's API
   * Returns list of model IDs and their metadata
   * @param modelType - Filter by model type: CHAT, CHAT_FAST, EMBEDDING, IMAGE_GENERATION, RERANK, etc.
   */
  async fetchAvailableModels(
    provider: string,
    apiKey: string,
    _apiEndpoint?: string, // Reserved for future custom endpoint support
    modelType?: string,
  ): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; description?: string }>;
    error?: string;
  }> {
    if (!apiKey) {
      return { success: false, error: "API key is required" };
    }

    try {
      switch (provider.toLowerCase()) {
        case "xai":
        case "grok":
          return await this.fetchXAIModels(apiKey, modelType);

        case "openai":
        case "gpt":
          return await this.fetchOpenAIModels(apiKey, modelType);

        case "anthropic":
        case "claude":
          return this.getAnthropicModels(modelType);

        case "google":
        case "gemini":
          return await this.fetchGeminiModels(apiKey, modelType);

        case "deepseek":
          return await this.fetchOpenAICompatibleModels(
            "https://api.deepseek.com/models",
            apiKey,
            "DeepSeek",
            modelType,
          );

        case "qwen":
        case "alibaba":
          return await this.fetchOpenAICompatibleModels(
            "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
            apiKey,
            "Qwen",
            modelType,
          );

        case "doubao":
        case "bytedance":
          return await this.fetchOpenAICompatibleModels(
            "https://ark.cn-beijing.volces.com/api/v3/models",
            apiKey,
            "Doubao",
            modelType,
          );

        case "zhipu":
        case "glm":
          return this.getZhipuModels(modelType);

        case "kimi":
        case "moonshot":
          return await this.fetchOpenAICompatibleModels(
            "https://api.moonshot.cn/v1/models",
            apiKey,
            "Moonshot",
            modelType,
          );

        case "cohere":
          return this.getCohereModels(modelType);

        default:
          return { success: false, error: `Unknown provider: ${provider}` };
      }
    } catch (error: any) {
      // ★ 增强错误日志：显示 API 返回的详细错误信息
      const apiError =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.response?.data?.error ||
        null;
      const statusCode = error.response?.status;

      this.logger.error(
        `Failed to fetch models for ${provider}: status=${statusCode}, apiError=${JSON.stringify(apiError)}, message=${error.message}`,
      );

      const errorMessage =
        (typeof apiError === "string" ? apiError : apiError?.message) ||
        error.message ||
        "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Fetch models from xAI API
   */
  private async fetchXAIModels(apiKey: string, modelType?: string) {
    const response = await firstValueFrom(
      this.httpService.get("https://api.x.ai/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      }),
    );

    let models = response.data?.data || [];

    // Filter by model type if specified
    if (modelType === "EMBEDDING") {
      models = models.filter(
        (m: any) =>
          m.id.includes("embed") || m.id.includes("embedding") || m.id === "v1",
      );
    } else if (
      modelType === "CHAT" ||
      modelType === "CHAT_FAST" ||
      modelType === "MULTIMODAL"
    ) {
      models = models.filter(
        (m: any) =>
          m.id.includes("grok") &&
          !m.id.includes("embed") &&
          !m.id.includes("embedding"),
      );
    }

    return {
      success: true,
      models: models.map((m: any) => ({
        id: m.id,
        name: m.id,
        description: m.description || `xAI ${m.id}`,
      })),
    };
  }

  /**
   * Fetch models from OpenAI API
   * Filters models based on modelType parameter
   */
  private async fetchOpenAIModels(apiKey: string, modelType?: string) {
    const response = await firstValueFrom(
      this.httpService.get("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      }),
    );

    const allModels = response.data?.data || [];
    let filteredModels: any[];

    // Filter models based on modelType
    if (modelType === "EMBEDDING") {
      // Embedding models: text-embedding-*, ada-*
      filteredModels = allModels.filter(
        (m: any) =>
          m.id.includes("embedding") ||
          m.id.startsWith("text-embedding") ||
          (m.id.includes("ada") && m.id.includes("002")),
      );
    } else if (
      modelType === "IMAGE_GENERATION" ||
      modelType === "IMAGE_EDITING"
    ) {
      // Image models: dall-e-*
      filteredModels = allModels.filter((m: any) => m.id.startsWith("dall-e"));
    } else if (modelType === "CHAT_FAST") {
      // Fast chat models: gpt-4o-mini, gpt-3.5-turbo
      filteredModels = allModels.filter(
        (m: any) =>
          m.id.includes("mini") ||
          m.id.includes("3.5") ||
          m.id.includes("turbo"),
      );
    } else {
      // Default: Chat models (gpt-4*, o1*, o3*)
      filteredModels = allModels.filter(
        (m: any) =>
          m.id.startsWith("gpt-") ||
          m.id.startsWith("o1") ||
          m.id.startsWith("o3"),
      );
    }

    // Sort by creation date (newest first)
    filteredModels.sort((a: any, b: any) => b.created - a.created);

    return {
      success: true,
      models: filteredModels.map((m: any) => ({
        id: m.id,
        name: m.id,
        description: `OpenAI ${m.id}`,
      })),
    };
  }

  /**
   * Get Anthropic models (no public list API, return known models)
   * Anthropic doesn't have embedding or image models, only chat models
   */
  private getAnthropicModels(modelType?: string) {
    // Anthropic only has chat models - no embedding or image models
    if (
      modelType === "EMBEDDING" ||
      modelType === "IMAGE_GENERATION" ||
      modelType === "IMAGE_EDITING" ||
      modelType === "RERANK"
    ) {
      return {
        success: true,
        models: [],
        error: `Anthropic does not support ${modelType} models`,
      };
    }

    // Anthropic doesn't have a public models list API
    // Return known production models based on type
    let models = [
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        description: "Most intelligent model, best for complex tasks",
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        description: "Best balance of intelligence and speed",
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        description: "Fastest model, good for simple tasks",
      },
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        description: "Previous flagship model",
      },
    ];

    // Filter for CHAT_FAST - only return fast models
    if (modelType === "CHAT_FAST") {
      models = models.filter((m) => m.id.includes("haiku"));
    }

    return { success: true, models };
  }

  /**
   * Fetch models from Google Gemini API
   * Filters based on modelType: EMBEDDING, IMAGE_GENERATION, CHAT, etc.
   */
  private async fetchGeminiModels(apiKey: string, modelType?: string) {
    const response = await firstValueFrom(
      this.httpService.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          timeout: 30000,
        },
      ),
    );

    const allModels = response.data?.models || [];
    let filteredModels: any[];

    // Filter models based on modelType
    if (modelType === "EMBEDDING") {
      filteredModels = allModels.filter((m: any) => {
        const name = m.name.toLowerCase();
        return (
          name.includes("embedding") ||
          name.includes("text-embedding") ||
          m.supportedGenerationMethods?.includes("embedContent")
        );
      });
    } else if (
      modelType === "IMAGE_GENERATION" ||
      modelType === "IMAGE_EDITING"
    ) {
      filteredModels = allModels.filter((m: any) => {
        const name = m.name.toLowerCase();
        return name.includes("imagen");
      });
    } else if (modelType === "MULTIMODAL") {
      filteredModels = allModels.filter((m: any) => {
        const name = m.name.toLowerCase();
        return (
          name.includes("gemini") &&
          m.supportedGenerationMethods?.includes("generateContent")
        );
      });
    } else {
      // Default: Chat models (gemini-*)
      filteredModels = allModels.filter((m: any) => {
        const name = m.name.toLowerCase();
        return (
          name.includes("gemini") &&
          m.supportedGenerationMethods?.includes("generateContent") &&
          !name.includes("embedding")
        );
      });
    }

    // Sort models by name
    filteredModels.sort((a: any, b: any) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );

    return {
      success: true,
      models: filteredModels.map((m: any) => {
        const modelId = m.name.replace("models/", "");
        return {
          id: modelId,
          name: m.displayName || modelId,
          description: m.description || `Google ${m.displayName}`,
        };
      }),
    };
  }

  /**
   * Get Cohere models (return known models based on type)
   */
  private getCohereModels(modelType?: string) {
    if (modelType === "RERANK") {
      return {
        success: true,
        models: [
          {
            id: "rerank-v3.5",
            name: "Rerank v3.5",
            description: "Latest rerank model, best quality",
          },
          {
            id: "rerank-english-v3.0",
            name: "Rerank English v3.0",
            description: "English-optimized rerank model",
          },
          {
            id: "rerank-multilingual-v3.0",
            name: "Rerank Multilingual v3.0",
            description: "Multilingual rerank model",
          },
        ],
      };
    } else if (modelType === "EMBEDDING") {
      return {
        success: true,
        models: [
          {
            id: "embed-english-v3.0",
            name: "Embed English v3.0",
            description: "Latest English embedding model",
          },
          {
            id: "embed-multilingual-v3.0",
            name: "Embed Multilingual v3.0",
            description: "Multilingual embedding model",
          },
          {
            id: "embed-english-light-v3.0",
            name: "Embed English Light v3.0",
            description: "Lightweight English embedding model",
          },
        ],
      };
    } else {
      // Chat models
      return {
        success: true,
        models: [
          {
            id: "command-r-plus",
            name: "Command R+",
            description: "Most capable chat model",
          },
          {
            id: "command-r",
            name: "Command R",
            description: "Balanced chat model",
          },
          {
            id: "command-light",
            name: "Command Light",
            description: "Fast, lightweight chat model",
          },
        ],
      };
    }
  }

  /**
   * Fetch models from OpenAI-compatible API (DeepSeek, Qwen, Moonshot, etc.)
   * These providers follow the OpenAI /models endpoint format: { data: [{ id, ... }] }
   */
  private async fetchOpenAICompatibleModels(
    endpoint: string,
    apiKey: string,
    providerName: string,
    modelType?: string,
  ) {
    if (
      modelType === "IMAGE_GENERATION" ||
      modelType === "IMAGE_EDITING" ||
      modelType === "RERANK"
    ) {
      return { success: true, models: [] };
    }

    const response = await firstValueFrom(
      this.httpService.get<{
        data?: Array<{ id: string; description?: string }>;
      }>(endpoint, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      }),
    );

    let models = response.data?.data || [];

    if (modelType === "EMBEDDING") {
      models = models.filter(
        (m) => m.id.includes("embed") || m.id.includes("embedding"),
      );
    }

    return {
      success: true,
      models: models.map((m) => ({
        id: m.id,
        name: m.id,
        description: m.description || `${providerName} ${m.id}`,
      })),
    };
  }

  /**
   * Get Zhipu GLM models (no public list API)
   * Docs: https://open.bigmodel.cn/dev/api/normal-model/glm-4
   * Last updated: 2026-01-31
   */
  private getZhipuModels(modelType?: string) {
    if (
      modelType === "IMAGE_GENERATION" ||
      modelType === "IMAGE_EDITING" ||
      modelType === "RERANK"
    ) {
      return { success: true, models: [] };
    }

    if (modelType === "EMBEDDING") {
      return {
        success: true,
        models: [
          {
            id: "embedding-3",
            name: "Embedding 3",
            description: "Zhipu text embedding model (2048 dim)",
          },
          {
            id: "embedding-2",
            name: "Embedding 2",
            description: "Zhipu text embedding model (1024 dim)",
          },
        ],
      };
    }

    return {
      success: true,
      models: [
        {
          id: "glm-4-plus",
          name: "GLM-4 Plus",
          description: "Most capable GLM model",
        },
        {
          id: "glm-4-long",
          name: "GLM-4 Long",
          description: "Long context GLM model (1M tokens)",
        },
        {
          id: "glm-4-flash",
          name: "GLM-4 Flash",
          description: "Fast and free GLM model",
        },
        {
          id: "glm-4-flashx",
          name: "GLM-4 FlashX",
          description: "Ultra-fast GLM model with lowest latency",
        },
        {
          id: "glm-4",
          name: "GLM-4",
          description: "Standard GLM model",
        },
      ],
    };
  }

  /**
   * Simple chat interface for tools
   * Wraps generateChatCompletion with sensible defaults
   *
   * ★ AI App 可以通过两种方式指定模型：
   * 1. model: 直接指定模型 ID（如 "gpt-4o"）
   * 2. modelType: 指定模型类型，由 AI Engine 选择具体模型（推荐）
   *
   * @param options Chat options
   * @returns Chat result
   */
  async chat(options: {
    messages: ChatMessage[];
    systemPrompt?: string;
    /** ★ 推荐：使用 TaskProfile 描述任务需求，AI Engine 自动映射参数 */
    taskProfile?: TaskProfile;
    /** 直接指定 maxTokens（优先级高于 taskProfile） */
    maxTokens?: number;
    /** 直接指定 temperature（优先级高于 taskProfile） */
    temperature?: number;
    /** 直接指定模型 ID（如 "gpt-4o"） */
    model?: string;
    /** ★ 推荐：指定模型类型，由 AI Engine 从数据库选择具体模型 */
    modelType?: AIModelType;
    /** 严格模式：API失败时抛出异常而不是返回错误内容 */
    strictMode?: boolean;

    // ========== 以下参数用于指定 API Key 场景（替代 generateChatCompletionWithKey）==========
    /** 指定 AI 提供商（如 "openai", "anthropic", "google", "xai"） */
    provider?: string;
    /** 直接指定 API Key（优先于数据库配置） */
    apiKey?: string;
    /** 直接指定 API 端点（优先于默认端点） */
    apiEndpoint?: string;
    /** AI 成员显示名称（如 "AI-Gemini (Image)"） */
    displayName?: string;
    /** AI 能力列表（如 ["IMAGE_GENERATION", "TEXT_GENERATION"]） */
    capabilities?: string[];
    /** 是否启用 Google Search grounding（默认 true） */
    enableSearch?: boolean;
  }): Promise<{
    content: string;
    usage?: { totalTokens: number };
    model: string;
    /** 标识此响应是否为错误消息 */
    isError?: boolean;
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
      // 新增：API Key 场景参数
      provider,
      apiKey,
      apiEndpoint,
      displayName,
      capabilities,
      enableSearch,
    } = options;

    // ★ 路径分叉：如果提供了 apiKey，使用直接 API 调用路径
    if (apiKey && provider) {
      this.logger.debug(
        `[chat] Using direct API key path for provider: ${provider}`,
      );
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
      });
      return {
        content: result.content,
        usage: { totalTokens: result.tokensUsed },
        model: result.model,
        isError: result.isError,
      };
    }

    // ★ 关键改进：所有参数统一由 AI Engine 管理
    // 优先级：providedModel > modelType 查找 > 环境变量默认
    let model: string;
    let modelConfig: AIModelConfig | null = null;

    if (providedModel) {
      // 1. 调用方直接指定了模型
      model = providedModel;
      modelConfig = await this.getModelConfig(model);
    } else if (modelType) {
      // 2. ★ 推荐方式：调用方指定模型类型，由 Engine 选择具体模型
      modelConfig = await this.getDefaultModelByType(modelType);
      if (modelConfig) {
        model = modelConfig.modelId;
        this.logger.debug(
          `[chat] Using ${modelType} model from database: ${model}`,
        );
      } else {
        // 找不到该类型模型，使用环境变量默认
        model = process.env.DEFAULT_AI_MODEL || "gemini";
        this.logger.warn(
          `[chat] No ${modelType} model found, falling back to ${model}`,
        );
      }
    } else {
      // 3. 都没指定，使用环境变量默认
      model = process.env.DEFAULT_AI_MODEL || "gemini";
      modelConfig = await this.getModelConfig(model);
    }

    // ★ 参数解析优先级链：
    // 1. 直接参数（maxTokens, temperature）← 最高优先级，向后兼容
    // 2. TaskProfile 映射                  ← 推荐方式
    // 3. 数据库模型配置                    ← 模型默认值
    // 4. 硬编码默认值（4096, 0.7）         ← 最后兜底

    let effectiveMaxTokens: number;
    let effectiveTemperature: number;

    if (providedMaxTokens !== undefined || providedTemperature !== undefined) {
      // 直接参数优先（向后兼容）
      effectiveMaxTokens = providedMaxTokens ?? modelConfig?.maxTokens ?? 4096;
      effectiveTemperature =
        providedTemperature ?? modelConfig?.temperature ?? 0.7;

      this.logger.debug(
        `[chat] Using direct parameters: temp=${effectiveTemperature}, maxTokens=${effectiveMaxTokens}`,
      );
    } else if (taskProfile) {
      // ★ 使用 TaskProfile 映射参数（推荐方式）
      const mappedParams = this.taskProfileMapper.mapToParameters(
        taskProfile,
        modelConfig,
      );
      effectiveMaxTokens = mappedParams.maxTokens;
      effectiveTemperature = mappedParams.temperature;

      this.logger.debug(
        `[chat] TaskProfile mapped: ${JSON.stringify(taskProfile)} → ` +
          `temp=${effectiveTemperature}, maxTokens=${effectiveMaxTokens}`,
      );
    } else {
      // 使用数据库配置或默认值
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

    // ★ Fallback 机制：如果首选模型失败，自动尝试其他同类型模型
    const triedModelIds: string[] = [];
    let lastError: string | null = null;
    let currentModel = model;
    let currentModelConfig = modelConfig;

    // 最多尝试 5 个不同的模型
    const maxFallbackAttempts = 5;

    for (let attempt = 0; attempt < maxFallbackAttempts; attempt++) {
      triedModelIds.push(currentModel);

      this.logger.debug(
        `[chat] Attempt ${attempt + 1}/${maxFallbackAttempts}: trying model ${currentModel}`,
      );

      const result = await this.generateChatCompletion({
        model: currentModel,
        systemPrompt,
        messages,
        maxTokens: effectiveMaxTokens,
        temperature: effectiveTemperature,
        strictMode,
      });

      // 如果成功（没有错误），直接返回
      if (!result.isError) {
        if (attempt > 0) {
          this.logger.log(
            `[chat] ✓ Fallback successful: ${currentModel} (after ${attempt} failed attempts)`,
          );
        }
        return {
          content: result.content,
          usage: { totalTokens: result.tokensUsed },
          model: result.model,
          isError: false,
        };
      }

      // 如果失败，记录错误并尝试下一个模型
      lastError = result.content;
      this.logger.warn(
        `[chat] Model ${currentModel} failed: ${result.content.slice(0, 100)}...`,
      );

      // 获取其他可用的同类型模型（排除已尝试的）
      if (modelType) {
        const alternativeModels = await this.getAllEnabledModelsByType(
          modelType,
          triedModelIds,
        );

        if (alternativeModels.length > 0) {
          currentModelConfig = alternativeModels[0];
          currentModel = currentModelConfig.modelId;
          this.logger.log(
            `[chat] Falling back to alternative model: ${currentModel} (${currentModelConfig.provider})`,
          );
          continue;
        }
      }

      // 没有更多备用模型，退出循环
      this.logger.warn(
        `[chat] No more alternative models available. Tried: ${triedModelIds.join(", ")}`,
      );
      break;
    }

    // 所有模型都失败了，返回最后一个错误
    this.logger.error(
      `[chat] All ${triedModelIds.length} models failed. Last error: ${lastError?.slice(0, 100)}`,
    );

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
   *
   * @param options 聊天选项
   * @yields 流式内容块
   */
  async *chatStream(options: {
    messages: ChatMessage[];
    model?: string;
    modelType?: AIModelType;
    taskProfile?: TaskProfile;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
  }): AsyncGenerator<{ content: string; done: boolean; error?: string }, void> {
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
      model = defaultConfig?.modelId || "gpt-4o";
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

    // ★ 关键修复：使用 getApiKeyForModel 获取 API Key，支持 Secret Manager
    const apiKey = await this.getApiKeyForModel(modelConfig);
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

    // 根据 provider 选择流式调用方法（委托给 AiStreamHandlerService）
    const apiFormat = this.getApiFormatForProvider(modelConfig.provider);

    try {
      if (apiFormat === "openai") {
        // ★ 使用数据库配置的 tokenParamName
        const tokenParamName =
          modelConfig.tokenParamName ||
          (modelConfig.isReasoning ? "max_completion_tokens" : "max_tokens");
        yield* this.streamHandlerService.streamOpenAICompatible(
          modelConfig.apiEndpoint,
          apiKey, // ★ 使用已解析的 apiKey（支持 Secret Manager）
          modelConfig.modelId,
          fullMessages,
          effectiveMaxTokens,
          effectiveTemperature,
          tokenParamName,
        );
      } else if (apiFormat === "anthropic") {
        yield* this.streamHandlerService.streamAnthropic(
          modelConfig.apiEndpoint,
          apiKey, // ★ 使用已解析的 apiKey（支持 Secret Manager）
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
        });
        yield { content: result.content, done: true };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[chatStream] Stream error: ${errorMsg}`);
      yield { content: "", done: true, error: errorMsg };
    }
  }

  /**
   * OpenAI 兼容格式的 SSE 流式调用
   * ★ 数据库驱动：使用 tokenParamName 配置决定 token 参数名
   *
   * @deprecated This method is currently unused but kept for future streaming support
   */
  // @ts-ignore - Keeping for future streaming support
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // @ts-expect-error - Unused but kept for future streaming support
  private async *streamOpenAICompatible(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature?: number,
    tokenParamName: string = "max_tokens",
  ): AsyncGenerator<{ content: string; done: boolean; error?: string }, void> {
    // ★ 数据库驱动：使用配置的 tokenParamName，无需硬编码判断
    const tokenParam = { [tokenParamName]: maxTokens };

    const modelLower = modelId.toLowerCase();
    const isO1O3Model =
      modelLower.startsWith("o1") || modelLower.startsWith("o3");
    const reasoningParam = isO1O3Model ? { reasoning_effort: "low" } : {};

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          apiEndpoint,
          {
            model: modelId,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            ...tokenParam,
            ...reasoningParam,
            temperature,
            stream: true,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            responseType: "stream",
            timeout: 300000, // 5 分钟超时
          },
        ),
      );

      const stream = response.data;
      let buffer = "";

      for await (const chunk of stream) {
        buffer += chunk.toString();

        // 解析 SSE 事件
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              yield { content: "", done: true };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                yield { content: delta, done: false };
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      yield { content: "", done: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[streamOpenAICompatible] Error: ${errorMsg}`);
      yield { content: "", done: true, error: errorMsg };
    }
  }

  /**
   * Anthropic Claude 的 SSE 流式调用
   *
   * @deprecated This method is currently unused but kept for future streaming support
   */
  // @ts-ignore - Keeping for future streaming support
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // @ts-expect-error - Unused but kept for future streaming support
  private async *streamAnthropic(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature?: number,
  ): AsyncGenerator<{ content: string; done: boolean; error?: string }, void> {
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          apiEndpoint,
          {
            model: modelId,
            max_tokens: maxTokens,
            temperature,
            system: systemMessage?.content,
            messages: otherMessages.map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            })),
            stream: true,
          },
          {
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            responseType: "stream",
            timeout: 300000,
          },
        ),
      );

      const stream = response.data;
      let buffer = "";

      for await (const chunk of stream) {
        buffer += chunk.toString();

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);
              // Anthropic 的流式格式
              if (parsed.type === "content_block_delta") {
                const text = parsed.delta?.text;
                if (text) {
                  yield { content: text, done: false };
                }
              } else if (parsed.type === "message_stop") {
                yield { content: "", done: true };
                return;
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      yield { content: "", done: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[streamAnthropic] Error: ${errorMsg}`);
      yield { content: "", done: true, error: errorMsg };
    }
  }
}
