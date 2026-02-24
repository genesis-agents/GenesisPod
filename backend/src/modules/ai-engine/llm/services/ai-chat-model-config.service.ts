import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { SecretsService } from "../../../core/secrets/secrets.service";
import { AIModelType } from "@prisma/client";

/**
 * 数据库中的 AI 模型配置
 * ★ 所有模型行为完全由数据库配置驱动，消除硬编码
 */
export interface AIModelConfig {
  id: string;
  name: string;
  displayName: string;
  provider: string;
  modelId: string;
  apiEndpoint: string;
  apiKey: string | null;
  secretKey?: string | null; // 引用 Secret Manager 中的密钥名称
  maxTokens: number;
  temperature: number;
  isEnabled: boolean;
  isDefault: boolean;

  // ★ 模型能力配置 - 完全由数据库驱动
  isReasoning?: boolean; // 是否为推理模型
  apiFormat?: string; // API 格式: openai, anthropic, google, xai
  supportsTemperature?: boolean; // 是否支持 temperature 参数
  supportsStreaming?: boolean; // 是否支持流式输出
  supportsFunctionCalling?: boolean; // 是否支持函数调用
  supportsVision?: boolean; // 是否支持视觉输入
  tokenParamName?: string; // token 参数名: max_tokens 或 max_completion_tokens
  defaultTimeoutMs?: number; // 默认超时时间
  priceInputPerMillion?: number; // 输入价格
  priceOutputPerMillion?: number; // 输出价格
  priority?: number; // 模型优先级
}

/**
 * AI Chat Model Config Service
 * 职责：模型配置加载、缓存、选择、API Key 管理
 */
@Injectable()
export class AiChatModelConfigService {
  private readonly logger = new Logger(AiChatModelConfigService.name);

  // 模型配置缓存
  private modelConfigCache = new Map<string, AIModelConfig>();
  private modelConfigCacheTime = 0;
  private readonly MODEL_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
  ) {
    // 初始化时异步加载模型配置
    this.refreshModelConfigCache().catch((err) =>
      this.logger.warn(`Failed to initialize model config cache: ${err}`),
    );
  }

  /**
   * 获取模型的 API Key
   * 优先从 Secret Manager 获取（如果 secretKey 已配置），否则使用直接存储的 apiKey
   * ★ 对返回值做 trim 处理，避免空格导致 API 调用失败
   */
  async getApiKeyForModel(model: AIModelConfig): Promise<string | null> {
    // 优先使用 secretKey 从 Secret Manager 获取
    if (model.secretKey) {
      const secretValue = await this.secretsService.getValueInternal(
        model.secretKey,
      );
      if (secretValue) {
        return secretValue.trim();
      }
      this.logger.warn(
        `Secret '${model.secretKey}' not found for model ${model.name}, falling back to apiKey`,
      );
    }
    // 回退到直接存储的 apiKey
    return model.apiKey?.trim() || null;
  }

  /**
   * 从数据库模型构建 AIModelConfig
   * ★ 统一处理所有字段，兼容新旧数据库
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma result with complex select loses its inferred type at the call site; typed at the return boundary via AIModelConfig
  private buildModelConfig(model: any): AIModelConfig {
    const modelAny = model;
    const isReasoning =
      modelAny.isReasoning ?? this.inferIsReasoning(model.modelId);

    return {
      id: model.id,
      name: model.name,
      displayName: model.displayName,
      provider: model.provider,
      modelId: model.modelId,
      apiEndpoint: model.apiEndpoint,
      apiKey: model.apiKey,
      secretKey: model.secretKey,
      maxTokens: model.maxTokens,
      temperature: model.temperature,
      isEnabled: model.isEnabled,
      isDefault: model.isDefault,

      // ★ 模型能力配置 - 优先使用数据库值，否则根据 isReasoning 推断
      isReasoning,
      apiFormat: this.resolveApiFormat(modelAny.apiFormat, model.provider),
      supportsTemperature: modelAny.supportsTemperature ?? !isReasoning,
      supportsStreaming: modelAny.supportsStreaming ?? true,
      supportsFunctionCalling: modelAny.supportsFunctionCalling ?? true,
      supportsVision: modelAny.supportsVision ?? false,
      tokenParamName:
        modelAny.tokenParamName ??
        (isReasoning ? "max_completion_tokens" : "max_tokens"),
      defaultTimeoutMs:
        modelAny.defaultTimeoutMs ?? (isReasoning ? 300000 : 120000),
      priceInputPerMillion: modelAny.priceInputPerMillion
        ? Number(modelAny.priceInputPerMillion)
        : undefined,
      priceOutputPerMillion: modelAny.priceOutputPerMillion
        ? Number(modelAny.priceOutputPerMillion)
        : undefined,
      priority: modelAny.priority ?? 50,
    };
  }

  /**
   * 解析 API 格式：如果 DB 值是 schema 默认值 "openai"，但 provider 暗示另一种格式，
   * 则使用 provider 推断值（修复用户添加 Google/Anthropic 模型时忘记改 apiFormat 的问题）
   */
  private resolveApiFormat(
    dbApiFormat: string | undefined | null,
    provider: string,
  ): string {
    if (!provider) return dbApiFormat || "openai";
    const inferred = this.inferApiFormat(provider);
    // 如果 DB 显式设置了非默认值，尊重 DB 设置
    if (dbApiFormat && dbApiFormat !== "openai") return dbApiFormat;
    // 如果 DB 是默认值 "openai" 但 provider 暗示其他格式，使用推断值
    return inferred;
  }

  /**
   * 根据 provider 推断 API 格式
   */
  inferApiFormat(provider: string): string {
    const lower = provider.toLowerCase();
    if (lower === "anthropic" || lower === "claude") return "anthropic";
    if (lower === "google" || lower === "gemini") return "google";
    if (lower === "xai" || lower === "grok") return "xai";
    if (lower === "cohere") return "cohere";
    return "openai"; // 默认使用 OpenAI 兼容格式
  }

  /**
   * 刷新模型配置缓存
   * 从数据库加载所有启用的 CHAT 模型配置
   */
  async refreshModelConfigCache(): Promise<void> {
    try {
      const models = await this.prisma.aIModel.findMany({
        where: {
          modelType: "CHAT",
          isEnabled: true,
        },
      });

      this.modelConfigCache.clear();
      for (const model of models) {
        const config = this.buildModelConfig(model);
        // 使用 modelId 作为主键（如 "gpt-4o", "gemini-2.0-flash"）
        this.modelConfigCache.set(model.modelId, config);
        // 同时使用 name 作为别名（如 "grok", "claude"）
        if (model.name !== model.modelId) {
          this.modelConfigCache.set(model.name, config);
        }
      }

      this.modelConfigCacheTime = Date.now();
      this.logger.log(
        `[refreshModelConfigCache] Loaded ${models.length} CHAT models from database`,
      );
    } catch (error) {
      this.logger.error(`[refreshModelConfigCache] Failed: ${error}`);
    }
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
      modelLower.includes("gemini-2.5") ||
      modelLower.includes("gemini-3") ||
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
   * 检查模型是否为推理模型
   * ★ 统一入口：优先使用数据库配置的 isReasoning 字段，否则推断
   */
  isReasoningModel(modelId: string): boolean {
    // 1. 从缓存获取配置
    const config = this.modelConfigCache.get(modelId);
    if (config?.isReasoning !== undefined) {
      return config.isReasoning;
    }

    // 2. 尝试不区分大小写匹配
    const modelLower = modelId.toLowerCase();
    for (const [key, cfg] of this.modelConfigCache.entries()) {
      if (key.toLowerCase() === modelLower && cfg.isReasoning !== undefined) {
        return cfg.isReasoning;
      }
    }

    // 3. 缓存未命中，使用名称推断
    return this.inferIsReasoning(modelId);
  }

  /**
   * 获取模型配置（优先从数据库，缓存 5 分钟）
   */
  async getModelConfig(modelId: string): Promise<AIModelConfig | null> {
    // 检查缓存是否过期
    if (Date.now() - this.modelConfigCacheTime > this.MODEL_CONFIG_CACHE_TTL) {
      await this.refreshModelConfigCache();
    }

    // ★ 预处理：去掉可能的 #N 后缀
    const normalizedModelId = modelId.replace(/#\d+$/, "");
    if (normalizedModelId !== modelId) {
      this.logger.debug(
        `[getModelConfig] Normalized modelId: "${modelId}" -> "${normalizedModelId}"`,
      );
    }

    // 1. 精确匹配（区分大小写）
    if (this.modelConfigCache.has(modelId)) {
      return this.modelConfigCache.get(modelId)!;
    }
    if (
      normalizedModelId !== modelId &&
      this.modelConfigCache.has(normalizedModelId)
    ) {
      return this.modelConfigCache.get(normalizedModelId)!;
    }

    // 2. 精确匹配（不区分大小写）
    const modelLower = normalizedModelId.toLowerCase();
    for (const [key, config] of this.modelConfigCache.entries()) {
      if (key.toLowerCase() === modelLower) {
        return config;
      }
    }

    // 3. 直接从数据库精确查询
    try {
      const model = await this.prisma.aIModel.findFirst({
        where: {
          modelId: { equals: normalizedModelId, mode: "insensitive" },
          modelType: "CHAT",
          isEnabled: true,
        },
      });

      if (model) {
        const config = this.buildModelConfig(model);
        this.modelConfigCache.set(normalizedModelId, config);
        return config;
      }
    } catch (error) {
      this.logger.warn(
        `[getModelConfig] Database query failed for "${normalizedModelId}": ${error}`,
      );
    }

    return null;
  }

  /**
   * 获取默认模型配置
   */
  async getDefaultModelConfig(): Promise<AIModelConfig | null> {
    // 检查缓存是否过期
    if (Date.now() - this.modelConfigCacheTime > this.MODEL_CONFIG_CACHE_TTL) {
      await this.refreshModelConfigCache();
    }

    // 从缓存查找默认模型
    for (const config of this.modelConfigCache.values()) {
      if (config.isDefault) {
        return config;
      }
    }

    // 从数据库查找
    const model = await this.prisma.aIModel.findFirst({
      where: {
        modelType: "CHAT",
        isEnabled: true,
        isDefault: true,
      },
    });

    if (model) {
      return this.buildModelConfig(model);
    }

    // 如果没有默认模型，返回第一个启用的模型
    const firstModel = await this.prisma.aIModel.findFirst({
      where: {
        modelType: "CHAT",
        isEnabled: true,
      },
      orderBy: {
        priority: "desc",
      },
    });

    return firstModel ? this.buildModelConfig(firstModel) : null;
  }

  /**
   * 根据模型类型获取默认模型
   */
  async getDefaultModelByType(
    modelType: AIModelType,
  ): Promise<AIModelConfig | null> {
    // 检查缓存是否过期
    if (Date.now() - this.modelConfigCacheTime > this.MODEL_CONFIG_CACHE_TTL) {
      await this.refreshModelConfigCache();
    }

    const model = await this.prisma.aIModel.findFirst({
      where: {
        modelType,
        isEnabled: true,
        isDefault: true,
      },
    });

    if (model) {
      return this.buildModelConfig(model);
    }

    // 如果没有默认模型，返回第一个启用的该类型模型
    const firstModel = await this.prisma.aIModel.findFirst({
      where: {
        modelType,
        isEnabled: true,
      },
      orderBy: {
        priority: "desc",
      },
    });

    return firstModel ? this.buildModelConfig(firstModel) : null;
  }

  /**
   * 获取所有启用的模型（按类型）
   * @param modelType 模型类型
   * @param excludeModelIds 要排除的模型 ID 列表
   */
  async getAllEnabledModelsByType(
    modelType: AIModelType,
    excludeModelIds: string[] = [],
  ): Promise<AIModelConfig[]> {
    const models = await this.prisma.aIModel.findMany({
      where: {
        modelType,
        isEnabled: true,
        modelId: {
          notIn: excludeModelIds,
        },
      },
      orderBy: {
        priority: "desc",
      },
    });

    return models.map((model) => this.buildModelConfig(model));
  }

  /**
   * 检查 Temperature 参数是否支持
   * 推理模型（o1, o3, gpt-5 系列）不支持 temperature 参数
   */
  isTemperatureSupported(model: string): boolean {
    const modelLower = model.toLowerCase();

    // ★ 推理模型不支持 temperature 参数
    const isReasoningModel =
      modelLower.startsWith("o1") ||
      modelLower.startsWith("o3") ||
      modelLower.startsWith("gpt-5") ||
      modelLower.includes("gpt-5");

    if (isReasoningModel) {
      this.logger.debug(
        `[isTemperatureSupported] Model "${model}" is a reasoning model, temperature not supported`,
      );
      return false;
    }

    return true;
  }

  /**
   * 根据模型和 Token 数计算超时时间
   */
  getTimeoutForModel(modelId: string, maxTokens: number): number {
    const isReasoning = this.isReasoningModel(modelId);

    // ★ 推理模型需要更长的超时时间（5分钟起步）
    const baseTimeout = isReasoning ? 300000 : 120000; // 5分钟 vs 2分钟
    const maxTimeout = isReasoning ? 600000 : 300000; // 10分钟 vs 5分钟

    // 根据 maxTokens 动态调整（每 1000 tokens 增加 15 秒）
    const dynamicTimeout = Math.min(
      maxTimeout,
      baseTimeout + Math.ceil(maxTokens / 1000) * 15000,
    );

    this.logger.debug(
      `[getTimeoutForModel] ${modelId}: ${dynamicTimeout}ms (maxTokens=${maxTokens}, reasoning=${isReasoning})`,
    );

    return dynamicTimeout;
  }
}
