import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { SecretsService } from "../../../core/secrets/secrets.service";
import { UserApiKeysService } from "../../../core/user-api-keys/user-api-keys.service";
import { AIModelType } from "@prisma/client";

/**
 * API Key 来源标识
 * personal: 用户自用 Key（不扣积分）
 * donated: 共享池捐赠 Key（扣积分）
 * system: 系统管理员配置 Key（扣积分）
 */
export type ApiKeySource = "personal" | "donated" | "system";

export interface ResolvedApiKey {
  apiKey: string;
  source: ApiKeySource;
  apiEndpoint?: string | null;
}

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
 * AI 模型配置管理服务
 * 负责：模型配置的缓存、读取、选择和推断
 */
@Injectable()
export class AiModelConfigService {
  private readonly logger = new Logger(AiModelConfigService.name);

  // ==================== 模型配置缓存 ====================
  // 从数据库加载的模型配置缓存
  private modelConfigCache = new Map<string, AIModelConfig>();
  private modelConfigCacheTime = 0;
  private readonly MODEL_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
    private readonly userApiKeysService: UserApiKeysService,
  ) {
    // 初始化时异步加载模型配置
    this.refreshModelConfigCache().catch((err) =>
      this.logger.warn(`Failed to initialize model config cache: ${err}`),
    );
  }

  /**
   * 获取模型的 API Key（原有方法，保持向后兼容）
   * 不含用户 Key 优先级逻辑，仅使用系统 Key
   */
  async getApiKeyForModel(model: AIModelConfig): Promise<string | null> {
    const resolved = await this.resolveApiKey(model);
    return resolved?.apiKey || null;
  }

  /**
   * 获取模型的 API Key（含用户 Key 优先级）
   * 优先级: 用户自用 Key → 共享池捐赠 Key → 系统 Key
   */
  async resolveApiKey(
    model: AIModelConfig,
    userId?: string,
  ): Promise<ResolvedApiKey | null> {
    // Priority 1: 用户自用 Key
    if (userId) {
      try {
        const personalKey = await this.userApiKeysService.getPersonalKey(
          userId,
          model.provider,
        );
        if (personalKey) {
          return {
            apiKey: personalKey.apiKey,
            source: "personal",
            apiEndpoint: personalKey.apiEndpoint,
          };
        }
      } catch (error) {
        this.logger.warn(
          `Failed to get personal key for user ${userId}, provider ${model.provider}: ${error}`,
        );
      }
    }

    // Priority 2: 共享池（用户捐赠）
    try {
      const donatedKey = await this.userApiKeysService.getDonatedKey(
        model.provider,
      );
      if (donatedKey) {
        return {
          apiKey: donatedKey.apiKey,
          source: "donated",
          apiEndpoint: donatedKey.apiEndpoint,
        };
      }
    } catch (error) {
      this.logger.warn(
        `Failed to get donated key for provider ${model.provider}: ${error}`,
      );
    }

    // Priority 3: Secret Manager 系统 Key
    if (model.secretKey) {
      const secretValue = await this.secretsService.getValueInternal(
        model.secretKey,
      );
      if (secretValue) {
        return { apiKey: secretValue.trim(), source: "system" };
      }
      this.logger.warn(
        `Secret '${model.secretKey}' not found for model ${model.name}, falling back to apiKey`,
      );
    }

    // Priority 4: Legacy apiKey
    if (model.apiKey?.trim()) {
      return { apiKey: model.apiKey.trim(), source: "system" };
    }

    return null;
  }

  /**
   * 根据 provider 推断 API 格式
   */
  private inferApiFormat(provider: string): string {
    const lower = provider.toLowerCase();
    if (lower === "anthropic" || lower === "claude") return "anthropic";
    if (lower === "google" || lower === "gemini") return "google";
    if (lower === "xai" || lower === "grok") return "xai";
    return "openai"; // 默认使用 OpenAI 兼容格式
  }

  /**
   * 解析 apiFormat：优先用数据库值，但当 provider 与 apiFormat 明显矛盾时以 provider 为准
   * 例如 provider=Google + apiFormat=openai 是配置错误，应自动修正为 google
   */
  private resolveApiFormat(
    dbApiFormat: string | null | undefined,
    provider: string,
    modelId: string,
  ): string {
    const inferred = this.inferApiFormat(provider);
    if (!dbApiFormat) return inferred;

    // 如果 DB 值与 provider 推断一致，直接返回
    if (dbApiFormat === inferred) return dbApiFormat;

    // 检测矛盾：非 openai provider 存了 openai format（常见配置错误）
    if (dbApiFormat === "openai" && inferred !== "openai") {
      this.logger.warn(
        `[resolveApiFormat] Model ${modelId}: apiFormat="${dbApiFormat}" conflicts with provider="${provider}", using inferred "${inferred}"`,
      );
      return inferred;
    }

    // 其他情况信任数据库值（如用户有意配置 OpenAI 兼容代理）
    return dbApiFormat;
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
   * 从数据库模型构建 AIModelConfig
   * ★ 统一处理所有字段，兼容新旧数据库
   */
  private buildModelConfig(model: any): AIModelConfig {
    const modelAny = model as any;
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
      secretKey: model.secretKey, // ★ 添加 secretKey 以支持 Secret Manager
      maxTokens: model.maxTokens,
      temperature: model.temperature,
      isEnabled: model.isEnabled,
      isDefault: model.isDefault,

      // ★ 模型能力配置 - 优先使用数据库值，否则根据 isReasoning 推断
      isReasoning,
      apiFormat: this.resolveApiFormat(
        modelAny.apiFormat,
        model.provider,
        model.modelId,
      ),
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
   * 刷新模型配置缓存
   * 从数据库加载所有启用的 CHAT 和 CHAT_FAST 模型配置
   * ★ 必须同时加载 CHAT_FAST，否则快速模型无法通过工具调用
   */
  async refreshModelConfigCache(): Promise<void> {
    try {
      const models = await this.prisma.aIModel.findMany({
        where: {
          modelType: { in: ["CHAT", "CHAT_FAST"] },
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
        `[refreshModelConfigCache] Loaded ${models.length} CHAT/CHAT_FAST models from database`,
      );
    } catch (error) {
      this.logger.error(`[refreshModelConfigCache] Failed: ${error}`);
    }
  }

  /**
   * 检查模型是否为推理模型
   * ★ 统一入口：优先使用数据库配置的 isReasoning 字段，否则推断
   * @param modelId 模型 ID
   * @returns 是否为推理模型
   */
  isReasoningModel(modelId: string): boolean {
    // 1. 从缓存获取配置（同步方法，缓存应该已经加载）
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

    // 3. 缓存未命中，使用名称推断（兼容旧数据）
    return this.inferIsReasoning(modelId);
  }

  /**
   * 获取模型配置（优先从数据库，缓存 5 分钟）
   * @param modelId 模型 ID（如 "gpt-4o", "gemini-2.0-flash", "claude-3-opus"）
   */
  async getModelConfig(modelId: string): Promise<AIModelConfig | null> {
    // 检查缓存是否过期
    if (Date.now() - this.modelConfigCacheTime > this.MODEL_CONFIG_CACHE_TTL) {
      await this.refreshModelConfigCache();
    }

    // ★ 预处理：去掉可能的 #N 后缀（AI 可能误生成的无效后缀）
    const normalizedModelId = modelId.replace(/#\d+$/, "");
    if (normalizedModelId !== modelId) {
      this.logger.debug(
        `[getModelConfig] Normalized modelId: "${modelId}" -> "${normalizedModelId}"`,
      );
    }

    // 1. 精确匹配（区分大小写）- 先尝试原始 ID，再尝试规范化后的 ID
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

    // 3. 直接从数据库精确查询（同时支持 modelId 和 name 字段）
    // ★ 必须同时查询 CHAT 和 CHAT_FAST，否则快速模型无法使用工具调用
    try {
      const model = await this.prisma.aIModel.findFirst({
        where: {
          OR: [
            { modelId: { equals: normalizedModelId, mode: "insensitive" } },
            { name: { equals: normalizedModelId, mode: "insensitive" } },
          ],
          modelType: { in: ["CHAT", "CHAT_FAST"] },
          isEnabled: true,
        },
      });

      if (model) {
        // ★ 使用统一的 buildModelConfig 方法
        const config = this.buildModelConfig(model);
        this.modelConfigCache.set(normalizedModelId, config);
        // 同时缓存 modelId 和 name 以提高后续查找效率
        if (model.modelId !== normalizedModelId) {
          this.modelConfigCache.set(model.modelId, config);
        }
        if (model.name !== normalizedModelId && model.name !== model.modelId) {
          this.modelConfigCache.set(model.name, config);
        }
        return config;
      }
    } catch (error) {
      this.logger.warn(`[getModelConfig] Database query failed: ${error}`);
    }

    return null;
  }

  /**
   * 获取默认模型配置
   */
  async getDefaultModelConfig(): Promise<AIModelConfig | null> {
    try {
      const model = await this.prisma.aIModel.findFirst({
        where: {
          modelType: "CHAT",
          isEnabled: true,
          isDefault: true,
        },
        orderBy: {
          priority: "desc",
        },
      });

      if (model) {
        return this.buildModelConfig(model);
      }

      // 如果没有默认模型，返回第一个启用的模型
      const fallback = await this.prisma.aIModel.findFirst({
        where: {
          modelType: "CHAT",
          isEnabled: true,
        },
        orderBy: {
          priority: "desc",
        },
      });

      return fallback ? this.buildModelConfig(fallback) : null;
    } catch (error) {
      this.logger.error(`[getDefaultModelConfig] Failed: ${error}`);
      return null;
    }
  }

  /**
   * 根据类型获取默认模型
   * @param modelType 模型类型（CHAT, EMBEDDING, IMAGE, etc.）
   */
  async getDefaultModelByType(
    modelType: AIModelType,
  ): Promise<AIModelConfig | null> {
    try {
      // 1. 查找该类型的默认模型
      const model = await this.prisma.aIModel.findFirst({
        where: {
          modelType,
          isEnabled: true,
          isDefault: true,
        },
        orderBy: {
          priority: "desc",
        },
      });

      if (model) {
        this.logger.debug(
          `[getDefaultModelByType] Found default ${modelType} model: ${model.modelId}`,
        );
        return this.buildModelConfig(model);
      }

      // 2. 如果没有默认模型，返回该类型优先级最高的启用模型
      const fallback = await this.prisma.aIModel.findFirst({
        where: {
          modelType,
          isEnabled: true,
        },
        orderBy: {
          priority: "desc",
        },
      });

      if (fallback) {
        this.logger.debug(
          `[getDefaultModelByType] No default ${modelType} model, using highest priority: ${fallback.modelId}`,
        );
        return this.buildModelConfig(fallback);
      }

      this.logger.warn(`[getDefaultModelByType] No ${modelType} model found`);
      return null;
    } catch (error) {
      this.logger.error(`[getDefaultModelByType] Failed: ${error}`);
      return null;
    }
  }

  /**
   * 获取所有启用的指定类型的模型
   * @param modelType 模型类型
   */
  async getAllEnabledModelsByType(
    modelType: AIModelType,
  ): Promise<AIModelConfig[]> {
    try {
      const models = await this.prisma.aIModel.findMany({
        where: {
          modelType,
          isEnabled: true,
        },
        orderBy: {
          priority: "desc",
        },
      });

      return models.map((m) => this.buildModelConfig(m));
    } catch (error) {
      this.logger.error(`[getAllEnabledModelsByType] Failed: ${error}`);
      return [];
    }
  }

  /**
   * 获取推理模型配置
   * 优先返回数据库配置的推理模型，否则根据名称推断
   */
  async getReasoningModelConfig(): Promise<AIModelConfig | null> {
    try {
      // ★ 1. 优先查找数据库中标记为推理模型的配置
      const reasoningModel = await this.prisma.aIModel.findFirst({
        where: {
          modelType: "CHAT",
          isEnabled: true,
          isReasoning: true, // ★ 依赖数据库配置
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });

      if (reasoningModel) {
        this.logger.debug(
          `[getReasoningModelConfig] Found reasoning model from DB: ${reasoningModel.modelId}`,
        );
        return this.buildModelConfig(reasoningModel);
      }

      // ★ 2. 回退：根据已知模型名称推断
      const knownReasoningModels = await this.prisma.aIModel.findMany({
        where: {
          modelType: "CHAT",
          isEnabled: true,
          OR: [
            { modelId: { contains: "o1", mode: "insensitive" } },
            { modelId: { contains: "o3", mode: "insensitive" } },
            { modelId: { contains: "gpt-5", mode: "insensitive" } },
            {
              modelId: {
                contains: "gemini-2.0-flash-thinking",
                mode: "insensitive",
              },
            },
            { modelId: { contains: "deepseek-r1", mode: "insensitive" } },
            { modelId: { contains: "reasoning", mode: "insensitive" } },
          ],
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });

      if (knownReasoningModels.length > 0) {
        const model = knownReasoningModels[0];
        this.logger.debug(
          `[getReasoningModelConfig] Found reasoning model by name: ${model.modelId}`,
        );
        return this.buildModelConfig(model);
      }

      this.logger.warn(`[getReasoningModelConfig] No reasoning model found`);
      return null;
    } catch (error) {
      this.logger.error(`[getReasoningModelConfig] Failed: ${error}`);
      return null;
    }
  }

  /**
   * 获取 provider 的 API 格式
   */
  getApiFormatForProvider(provider: string): string {
    return this.inferApiFormat(provider);
  }

  // ==================== 统一模型查询方法 ====================
  // ★ 以下方法是数据库访问的唯一入口，其他服务应该委托给这里

  /**
   * 获取所有启用的模型列表（用于前端下拉列表）
   * ★ 不包含 API Key，安全返回给前端
   */
  async getEnabledModelsForFrontend(modelType?: AIModelType): Promise<
    {
      id: string;
      dbId: string;
      name: string;
      modelName: string;
      provider: string;
      modelId: string;
      modelType: string;
      icon: string | null;
      iconUrl: string;
      color: string | null;
      description: string;
      isDefault: boolean;
    }[]
  > {
    try {
      const where: any = { isEnabled: true };
      if (modelType) {
        where.modelType = modelType;
      }

      const models = await this.prisma.aIModel.findMany({
        where,
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          displayName: true,
          provider: true,
          modelId: true,
          modelType: true,
          icon: true,
          color: true,
          description: true,
          isDefault: true,
        },
      });

      // Ensure models is always an array
      if (!models || !Array.isArray(models)) {
        this.logger.warn(
          `[getEnabledModelsForFrontend] Prisma returned non-array: ${typeof models}`,
        );
        return [];
      }

      return models.map((model) => ({
        id: model.id,
        dbId: model.id,
        name: model.displayName,
        modelName: model.name,
        provider: model.provider,
        modelId: model.modelId,
        modelType: model.modelType,
        icon: model.icon,
        iconUrl: this.getIconUrl(model.name, model.provider),
        color: model.color,
        description:
          model.description || `${model.provider} ${model.displayName}`,
        isDefault: model.isDefault,
      }));
    } catch (error) {
      this.logger.error(`[getEnabledModelsForFrontend] Failed: ${error}`);
      // Always return an empty array, never null/undefined
      return [];
    }
  }

  /**
   * 根据模型名称获取图标 URL
   */
  private getIconUrl(name: string, provider?: string): string {
    const lowerName = name.toLowerCase();
    const lowerProvider = (provider || "").toLowerCase();

    if (lowerName.includes("grok") || lowerProvider === "xai") {
      return "/icons/ai/grok.svg";
    }
    if (
      lowerName.includes("gpt") ||
      lowerName.includes("chatgpt") ||
      lowerProvider === "openai"
    ) {
      return "/icons/ai/openai.svg";
    }
    if (lowerName.includes("claude") || lowerProvider === "anthropic") {
      return "/icons/ai/claude.svg";
    }
    if (lowerName.includes("gemini") || lowerProvider === "google") {
      return "/icons/ai/gemini.svg";
    }
    if (
      lowerName.includes("doubao") ||
      lowerName.includes("豆包") ||
      lowerProvider === "bytedance"
    ) {
      return "/icons/ai/doubao.svg";
    }
    if (lowerName.includes("deepseek") || lowerProvider === "deepseek") {
      return "/icons/ai/deepseek.svg";
    }
    if (
      lowerName.includes("qwen") ||
      lowerName.includes("通义") ||
      lowerProvider === "alibaba"
    ) {
      return "/icons/ai/qwen.svg";
    }
    if (lowerName.includes("kimi") || lowerProvider === "moonshot") {
      return "/icons/ai/kimi.svg";
    }
    if (lowerName.includes("glm") || lowerProvider === "zhipu") {
      return "/icons/ai/zhipu.svg";
    }
    // 无法识别时不返回错误图标，让前端 PROVIDER_ICONS fallback 处理
    return "";
  }

  /**
   * 根据 ID（数据库 UUID 或 modelId）查找模型
   * ★ 统一入口，支持多种 ID 格式
   * ★ 支持所有 modelType（包括 IMAGE_GENERATION、EMBEDDING 等）
   */
  async getModelById(idOrModelId: string): Promise<AIModelConfig | null> {
    // 1. 先尝试按 modelId/name 查找（使用缓存，仅 CHAT/CHAT_FAST）
    const configByModelId = await this.getModelConfig(idOrModelId);
    if (configByModelId) {
      return configByModelId;
    }

    // 2. 如果是 UUID 格式，尝试按数据库 ID 查找
    if (idOrModelId.length > 30) {
      try {
        const model = await this.prisma.aIModel.findFirst({
          where: {
            id: idOrModelId,
            isEnabled: true,
          },
        });
        if (model) {
          return this.buildModelConfig(model);
        }
      } catch (error) {
        this.logger.warn(`[getModelById] Database query failed: ${error}`);
      }
    }

    // 3. ★ 直接按 modelId/name 查找所有类型的模型（包括 IMAGE_GENERATION、EMBEDDING 等）
    //    这是为了支持非 CHAT 类型模型的查找
    try {
      const model = await this.prisma.aIModel.findFirst({
        where: {
          OR: [
            { modelId: { equals: idOrModelId, mode: "insensitive" } },
            { name: { equals: idOrModelId, mode: "insensitive" } },
          ],
          isEnabled: true,
        },
      });
      if (model) {
        this.logger.debug(
          `[getModelById] Found model ${model.modelId} (type: ${model.modelType}) via direct query`,
        );
        return this.buildModelConfig(model);
      }
    } catch (error) {
      this.logger.warn(`[getModelById] Direct modelId query failed: ${error}`);
    }

    return null;
  }

  /**
   * 获取指定 provider 的模型列表
   */
  async getModelsByProvider(providerName: string): Promise<AIModelConfig[]> {
    const models = await this.prisma.aIModel.findMany({
      where: {
        isEnabled: true,
        OR: [
          { provider: { contains: providerName, mode: "insensitive" } },
          { modelId: { contains: providerName, mode: "insensitive" } },
        ],
      },
    });
    return models.map((m) => this.buildModelConfig(m));
  }

  /**
   * 获取第一个可用的指定 provider 模型（带完整配置）
   */
  async getFirstModelByProvider(
    providerName: string,
  ): Promise<AIModelConfig | null> {
    const model = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        OR: [
          { provider: { contains: providerName, mode: "insensitive" } },
          { modelId: { contains: providerName, mode: "insensitive" } },
        ],
        apiKey: { not: null },
      },
    });
    return model ? this.buildModelConfig(model) : null;
  }

  /**
   * 获取所有模型（诊断用，包含 API Key 信息）
   * ⚠️ 仅用于内部诊断，不要暴露给前端
   */
  async getAllModelsForDiagnostics(): Promise<
    {
      id: string;
      name: string;
      modelId: string;
      provider: string;
      modelType: string;
      isEnabled: boolean;
      isDefault: boolean;
      hasApiKey: boolean;
      hasSecretKey: boolean;
      apiEndpoint: string | null;
    }[]
  > {
    const models = await this.prisma.aIModel.findMany({
      select: {
        id: true,
        name: true,
        modelId: true,
        provider: true,
        modelType: true,
        isEnabled: true,
        isDefault: true,
        apiKey: true,
        secretKey: true,
        apiEndpoint: true,
      },
    });

    return models.map((m) => ({
      id: m.id,
      name: m.name,
      modelId: m.modelId,
      provider: m.provider,
      modelType: m.modelType,
      isEnabled: m.isEnabled,
      isDefault: m.isDefault,
      hasApiKey: !!m.apiKey,
      hasSecretKey: !!m.secretKey,
      apiEndpoint: m.apiEndpoint,
    }));
  }

  /**
   * 计算模型的超时时间
   * 推理模型需要更长的超时时间
   */
  getTimeoutForModel(modelId: string, maxTokens: number): number {
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
}
