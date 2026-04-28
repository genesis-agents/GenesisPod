import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { SecretsService } from "../../../ai-infra/facade";
// PR-X9: BYOK 服务已搬到 ai-engine/credentials/
import { KeyResolverService } from "../../credentials/key-resolver/key-resolver.service";
import { NoAvailableKeyError } from "../../credentials/key-resolver/key-resolver.errors";
import { UserApiKeysService } from "../../credentials/user-api-keys/user-api-keys.service";
import { UserModelConfigsService } from "../../credentials/user-model-configs/user-model-configs.service";
import { RequestContext } from "../../../../common/context/request-context";
import { AIModelType, UserModelConfig } from "@prisma/client";
import { inferIsReasoning } from "../types";

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
 * BYOK 默认模型配置
 * 当用户配置了 API Key 但数据库中没有对应 provider 的模型时，
 * 使用这些默认配置动态生成模型列表
 */
const BYOK_DEFAULT_MODELS: Record<
  string,
  Array<{
    name: string;
    displayName: string;
    modelId: string;
    modelType: string;
    icon: string;
    color: string;
    description: string;
  }>
> = {
  anthropic: [
    {
      name: "claude-sonnet",
      displayName: "Claude Sonnet 4",
      modelId: "claude-sonnet-4-20250514",
      modelType: "CHAT",
      icon: "/icons/ai/claude.svg",
      color: "from-orange-500 to-orange-600",
      description: "Anthropic Claude Sonnet 4 - 高性能对话模型",
    },
    {
      name: "claude-opus",
      displayName: "Claude Opus 4",
      modelId: "claude-opus-4-20250514",
      modelType: "CHAT",
      icon: "/icons/ai/claude.svg",
      color: "from-orange-500 to-orange-600",
      description: "Anthropic Claude Opus 4 - 最强分析能力",
    },
    {
      name: "claude-haiku",
      displayName: "Claude Haiku 3.5",
      modelId: "claude-3-5-haiku-20241022",
      modelType: "CHAT_FAST",
      icon: "/icons/ai/claude.svg",
      color: "from-orange-400 to-orange-500",
      description: "Anthropic Claude Haiku - 快速响应",
    },
  ],
  openai: [
    {
      name: "gpt-4o",
      displayName: "GPT-4o",
      modelId: "gpt-4o",
      modelType: "CHAT",
      icon: "/icons/ai/openai.svg",
      color: "from-green-500 to-green-600",
      description: "OpenAI GPT-4o - 多模态旗舰模型",
    },
    {
      name: "gpt-4o-mini",
      displayName: "GPT-4o Mini",
      modelId: "gpt-4o-mini",
      modelType: "CHAT_FAST",
      icon: "/icons/ai/openai.svg",
      color: "from-green-400 to-green-500",
      description: "OpenAI GPT-4o Mini - 快速经济",
    },
  ],
  google: [
    {
      name: "gemini-2-flash",
      displayName: "Gemini 2.0 Flash",
      modelId: "gemini-2.0-flash",
      modelType: "CHAT",
      icon: "/icons/ai/gemini.svg",
      color: "from-blue-500 to-purple-600",
      description: "Google Gemini 2.0 Flash - 快速多模态",
    },
    {
      name: "gemini-2-pro",
      displayName: "Gemini 2.0 Pro",
      modelId: "gemini-2.0-pro-exp-02-05",
      modelType: "CHAT",
      icon: "/icons/ai/gemini.svg",
      color: "from-blue-500 to-purple-600",
      description: "Google Gemini 2.0 Pro - 高级推理",
    },
  ],
  deepseek: [
    {
      name: "deepseek-chat",
      displayName: "DeepSeek Chat",
      modelId: "deepseek-chat",
      modelType: "CHAT",
      icon: "/icons/ai/deepseek.svg",
      color: "from-blue-500 to-blue-600",
      description: "DeepSeek Chat - 高性价比对话模型",
    },
    {
      name: "deepseek-reasoner",
      displayName: "DeepSeek R1",
      modelId: "deepseek-reasoner",
      modelType: "CHAT",
      icon: "/icons/ai/deepseek.svg",
      color: "from-blue-500 to-blue-600",
      description: "DeepSeek R1 - 深度推理模型",
    },
  ],
  xai: [
    {
      name: "grok-3",
      displayName: "Grok 3",
      modelId: "grok-3-latest",
      modelType: "CHAT",
      icon: "/icons/ai/grok.svg",
      color: "from-gray-700 to-gray-800",
      description: "xAI Grok 3 - 实时信息对话",
    },
  ],
  qwen: [
    {
      name: "qwen-max",
      displayName: "Qwen Max",
      modelId: "qwen-max",
      modelType: "CHAT",
      icon: "/icons/ai/qwen.svg",
      color: "from-purple-500 to-purple-600",
      description: "Qwen Max - 通义千问旗舰模型",
    },
  ],
  cohere: [
    {
      name: "command-r-plus",
      displayName: "Command R+",
      modelId: "command-r-plus",
      modelType: "CHAT",
      icon: "",
      color: "from-indigo-500 to-indigo-600",
      description: "Cohere Command R+ - 企业级对话模型",
    },
  ],
};

/**
 * 数据库中的 AI 模型配置
 * ★ 所有模型行为完全由数据库配置驱动，消除硬编码
 */
/**
 * 严格 BYOK 下，**不允许**回落到管理员 AIModel 的"增强"类型。
 * 用户没配 → 返回空 → 上层自动跳过（例如 RAG skip rerank 阶段）。
 * 原因：这些 provider 通常按次付费（Cohere rerank $2/1k），不应由 admin 代付。
 * CHAT / CHAT_FAST / EMBEDDING / MULTIMODAL / CODE / IMAGE_* 仍然会 fallback（基础功能必需）。
 */
const BYOK_OPTIONAL_TYPES = new Set<AIModelType>([
  AIModelType.RERANK,
  AIModelType.EVALUATOR,
]);

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
  // 防 stampede：并发刷新时共享同一个 Promise
  private refreshPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
    private readonly userApiKeysService: UserApiKeysService,
    @Optional() private readonly keyResolver?: KeyResolverService,
    @Optional() private readonly userModelConfigs?: UserModelConfigsService,
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
   * 获取模型的 API Key。
   *
   * BYOK v2 优先级（由 {@link KeyResolverService} 统一裁决）：
   * - 管理员（User.role = ADMIN）→ 仅系统 Secret
   * - 普通用户 → Personal → Assigned；两者都没有 → 返回 null（让调用方以
   *   "API Key not configured" 语义提示用户），不再静默回退到系统 Secret
   *
   * 没有 userId 的后台任务（过渡期保留）：走系统 Secret 的旧路径，保证现
   * 有定时任务在 Phase 4 改造完成前仍可运行。
   */
  async resolveApiKey(
    model: AIModelConfig,
    userId?: string,
  ): Promise<ResolvedApiKey | null> {
    if (userId && this.keyResolver) {
      try {
        const resolved = await this.keyResolver.resolveKey(
          userId,
          model.provider,
          // 透传 AIModel 上记录的 secretKey，供管理员路径精确定位 Secret，
          // 避免因命名不规范（claude-api-key / gemini-api 等）查不到。
          { systemSecretName: model.secretKey ?? null },
        );
        const sourceMap = {
          PERSONAL: "personal",
          ASSIGNED: "donated",
          SYSTEM: "system",
        } as const;
        return {
          apiKey: resolved.apiKey,
          source: sourceMap[resolved.source],
          apiEndpoint: resolved.apiEndpoint,
        };
      } catch (error) {
        if (error instanceof NoAvailableKeyError) {
          // 用户没有 Personal 也没有 Assignment：返回 null，让上层给出
          // "API Key not configured" 或透传 NO_AVAILABLE_KEY 错误
          return null;
        }
        // QuotaExceededError / NoSystemKeyError 等需要传给前端
        throw error;
      }
    }

    // 过渡期：无 userId 上下文时退化为系统 Secret 路径
    if (model.secretKey) {
      const secretValue = await this.secretsService.getValueInternal(
        model.secretKey,
      );
      if (secretValue) {
        return { apiKey: secretValue.trim(), source: "system" };
      }
      this.logger.error(
        `[resolveApiKey] Secret '${model.secretKey}' not found for model ${model.name}.`,
      );
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
    if (lower === "cohere") return "cohere";
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

    // 反向矛盾：OpenAI 兼容 provider 存了非 openai format（如 OpenRouter 误存 "google"）
    if (dbApiFormat !== "openai" && inferred === "openai") {
      this.logger.warn(
        `[resolveApiFormat] Model ${modelId}: apiFormat="${dbApiFormat}" conflicts with OpenAI-compatible provider="${provider}", forcing "openai"`,
      );
      return "openai";
    }

    // 其他情况信任数据库值
    return dbApiFormat;
  }

  /**
   * 根据模型名称推断是否为推理模型
   * 当数据库中没有 isReasoning 字段时使用
   * ★ 委托给共享纯函数 inferIsReasoning()
   */
  private inferIsReasoning(modelId: string): boolean {
    return inferIsReasoning(modelId);
  }

  /**
   * 从数据库模型构建 AIModelConfig
   * ★ 统一处理所有字段，兼容新旧数据库
   */
  private buildModelConfig(model: Record<string, unknown>): AIModelConfig {
    const isReasoning =
      (model.isReasoning as boolean | undefined) ??
      this.inferIsReasoning(model.modelId as string);

    return {
      id: model.id as string,
      name: model.name as string,
      displayName: model.displayName as string,
      provider: model.provider as string,
      modelId: model.modelId as string,
      apiEndpoint: model.apiEndpoint as string,
      apiKey: (model.apiKey as string | null) || null,
      secretKey: (model.secretKey as string | null) || undefined, // ★ 添加 secretKey 以支持 Secret Manager
      maxTokens: model.maxTokens as number,
      temperature: model.temperature as number,
      isEnabled: model.isEnabled as boolean,
      isDefault: model.isDefault as boolean,

      // ★ 模型能力配置 - 优先使用数据库值，否则根据 isReasoning 推断
      isReasoning,
      apiFormat: this.resolveApiFormat(
        model.apiFormat as string | undefined,
        model.provider as string,
        model.modelId as string,
      ),
      supportsTemperature:
        (model.supportsTemperature as boolean | undefined) ?? !isReasoning,
      supportsStreaming:
        (model.supportsStreaming as boolean | undefined) ?? true,
      supportsFunctionCalling:
        (model.supportsFunctionCalling as boolean | undefined) ?? true,
      supportsVision: (model.supportsVision as boolean | undefined) ?? false,
      tokenParamName:
        (model.tokenParamName as string | undefined) ??
        (isReasoning ? "max_completion_tokens" : "max_tokens"),
      defaultTimeoutMs:
        (model.defaultTimeoutMs as number | undefined) ??
        (isReasoning ? 300000 : 120000),
      priceInputPerMillion: model.priceInputPerMillion
        ? Number(model.priceInputPerMillion)
        : undefined,
      priceOutputPerMillion: model.priceOutputPerMillion
        ? Number(model.priceOutputPerMillion)
        : undefined,
      priority: (model.priority as number | undefined) ?? 50,
    };
  }

  /**
   * 刷新模型配置缓存
   * 从数据库加载所有启用的 CHAT 和 CHAT_FAST 模型配置
   * ★ 必须同时加载 CHAT_FAST，否则快速模型无法通过工具调用
   */
  async refreshModelConfigCache(): Promise<void> {
    try {
      // ★ 加载所有启用模型（不限类型），确保 MULTIMODAL/CODE 等类型的模型也能被 getModelConfig 找到
      const models = await this.prisma.aIModel.findMany({
        where: {
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
        `[refreshModelConfigCache] Loaded ${models.length} enabled models from database`,
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
    // 检查缓存是否过期，共享 Promise 防止并发 stampede
    if (Date.now() - this.modelConfigCacheTime > this.MODEL_CONFIG_CACHE_TTL) {
      if (!this.refreshPromise) {
        this.refreshPromise = this.refreshModelConfigCache().finally(() => {
          this.refreshPromise = null;
        });
      }
      await this.refreshPromise;
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
    // ★ 不限 modelType — getModelConfig 的职责是按 ID 查配置，类型过滤由调用方负责
    try {
      const model = await this.prisma.aIModel.findFirst({
        where: {
          OR: [
            { modelId: { equals: normalizedModelId, mode: "insensitive" } },
            { name: { equals: normalizedModelId, mode: "insensitive" } },
          ],
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

    // 4. ★ BYOK v3: 用户自定义模型配置（UserModelConfig 表）
    //    用户像管理员那样配的完整 profile，按 modelId 精确匹配。
    const userConfig =
      await this.findUserModelConfigByModelId(normalizedModelId);
    if (userConfig) return userConfig;

    // 5. ★ BYOK: 查找 disabled 模型（用户有对应 provider 的 Key 时可用）
    const disabledConfig =
      await this.findDisabledModelForUser(normalizedModelId);
    if (disabledConfig) return disabledConfig;

    // 6. ★ BYOK: 用户只填了 UserApiKey.preferredModelId 但没建 UserModelConfig
    //    时的向后兼容路径 —— 用 provider 默认参数合成一个 AIModelConfig。
    const synthesized =
      await this.synthesizeConfigForUserModel(normalizedModelId);
    if (synthesized) return synthesized;

    return null;
  }

  /**
   * 查找用户自配的 UserModelConfig（按 modelId 精确匹配，不区分大小写）。
   * 命中时按用户的参数构造 AIModelConfig。
   */
  private async findUserModelConfigByModelId(
    modelId: string,
  ): Promise<AIModelConfig | null> {
    const userId = RequestContext.getUserId();
    if (!userId || !this.userModelConfigs) return null;
    try {
      const cfg = await this.userModelConfigs.findByModelId(userId, modelId);
      if (!cfg) return null;
      return this.toAIModelConfigFromUserConfig(cfg);
    } catch (error) {
      this.logger.warn(
        `[findUserModelConfigByModelId] Failed for ${userId}/${modelId}: ${error}`,
      );
      return null;
    }
  }

  /**
   * 查用户在指定 modelType 下的默认 UserModelConfig（供 chat 选初始模型）。
   */
  async findUserDefaultByType(
    userId: string,
    modelType: AIModelType,
  ): Promise<AIModelConfig | null> {
    if (!this.userModelConfigs) return null;
    try {
      const cfg = await this.userModelConfigs.findDefaultForType(
        userId,
        modelType,
      );
      if (!cfg) return null;
      return this.toAIModelConfigFromUserConfig(cfg);
    } catch (error) {
      this.logger.warn(
        `[findUserDefaultByType] Failed for ${userId}/${modelType}: ${error}`,
      );
      return null;
    }
  }

  private toAIModelConfigFromUserConfig(cfg: UserModelConfig): AIModelConfig {
    const providerDefaults =
      AiModelConfigService.PROVIDER_API_DEFAULTS[cfg.provider] ??
      AiModelConfigService.PROVIDER_API_DEFAULTS.openai;
    return {
      id: `user-model-config-${cfg.id}`,
      name: cfg.modelId,
      displayName: cfg.displayName,
      provider: cfg.provider,
      modelId: cfg.modelId,
      apiEndpoint: cfg.apiEndpoint || providerDefaults.endpoint,
      apiKey: null, // resolveApiKey 会用用户 Key
      secretKey: null,
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
      isEnabled: cfg.isEnabled,
      isDefault: cfg.isDefault,
      isReasoning: cfg.isReasoning,
      apiFormat: cfg.apiFormat,
      supportsTemperature: cfg.supportsTemperature,
      supportsStreaming: cfg.supportsStreaming,
      supportsFunctionCalling: cfg.supportsFunctionCalling,
      supportsVision: cfg.supportsVision,
      tokenParamName: cfg.tokenParamName,
      defaultTimeoutMs: cfg.defaultTimeoutMs,
      priceInputPerMillion: cfg.priceInputPerMillion
        ? Number(cfg.priceInputPerMillion)
        : undefined,
      priceOutputPerMillion: cfg.priceOutputPerMillion
        ? Number(cfg.priceOutputPerMillion)
        : undefined,
      priority: cfg.priority,
    };
  }

  /**
   * Provider → API 默认端点/格式。与 UserApiKeysService.PROVIDER_DEFAULTS 对齐
   * （复制以避免循环依赖；两处长期应迁到 shared util）。
   */
  private static readonly PROVIDER_API_DEFAULTS: Record<
    string,
    { endpoint: string; apiFormat: string }
  > = {
    openai: {
      endpoint: "https://api.openai.com/v1",
      apiFormat: "openai",
    },
    anthropic: {
      endpoint: "https://api.anthropic.com/v1",
      apiFormat: "anthropic",
    },
    deepseek: {
      endpoint: "https://api.deepseek.com/v1",
      apiFormat: "openai",
    },
    google: {
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
      apiFormat: "google",
    },
    xai: { endpoint: "https://api.x.ai/v1", apiFormat: "openai" },
    qwen: {
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiFormat: "openai",
    },
    cohere: { endpoint: "https://api.cohere.com/v2", apiFormat: "openai" },
    groq: {
      endpoint: "https://api.groq.com/openai/v1",
      apiFormat: "openai",
    },
    openrouter: {
      endpoint: "https://openrouter.ai/api/v1",
      apiFormat: "openai",
    },
    minimax: {
      endpoint: "https://api.minimax.chat/v1",
      apiFormat: "openai",
    },
  };

  private async synthesizeConfigForUserModel(
    modelId: string,
  ): Promise<AIModelConfig | null> {
    const userId = RequestContext.getUserId();
    if (!userId) return null;

    // 用户为哪个 provider 配过 Key，就认为这个 modelId 属于那个 provider。
    // 这里不做复杂推断（避免把 "gpt-4o" 误绑到其他 OpenAI-compatible provider）
    // —— 只要用户配了某 provider 的 Key + preferredModelId 匹配就走合成。
    const providers =
      await this.userApiKeysService.getAvailableProviders(userId);
    for (const provider of providers) {
      const personal = await this.userApiKeysService.getPersonalKey(
        userId,
        provider,
      );
      if (!personal) continue;
      if (
        personal.preferredModelId &&
        personal.preferredModelId.toLowerCase() === modelId.toLowerCase()
      ) {
        const defaults =
          AiModelConfigService.PROVIDER_API_DEFAULTS[provider] ??
          AiModelConfigService.PROVIDER_API_DEFAULTS.openai;
        this.logger.log(
          `[synthesizeConfigForUserModel] Synthesizing config for user ` +
            `${userId}: provider=${provider}, modelId=${modelId}`,
        );
        return {
          id: `user-${userId}-${provider}-${modelId}`,
          name: modelId,
          displayName: modelId,
          provider,
          modelId,
          apiEndpoint: personal.apiEndpoint || defaults.endpoint,
          apiKey: null, // resolveApiKey 会用用户 Key
          secretKey: null,
          maxTokens: 8192,
          temperature: 0.7,
          isEnabled: true,
          isDefault: false,
          isReasoning: inferIsReasoning(modelId),
          apiFormat: defaults.apiFormat,
          supportsTemperature: true,
          supportsStreaming: true,
          supportsFunctionCalling: true,
          supportsVision: false,
          tokenParamName: inferIsReasoning(modelId)
            ? "max_completion_tokens"
            : "max_tokens",
          defaultTimeoutMs: 120000,
          priority: 0,
        };
      }
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
    excludeModelIds: string[] = [],
  ): Promise<AIModelConfig[]> {
    try {
      // ★ BYOK v3: 若当前请求上下文有 userId 且用户已配了 UserModelConfig
      // （对应 modelType，isEnabled），用用户自己的模型；否则回落到管理员全局模型
      // （但仅限"刚需"类型，见下方 BYOK_OPTIONAL_TYPES）。
      const userId = RequestContext.getUserId();
      if (userId) {
        try {
          // 先不带 excludeModelIds 查一次"用户是否有该 type 的任何 UserModelConfig"——
          // 区分「用户真的没配」vs「用户配了但都在本次 retry 的黑名单里」两种场景。
          const userHasAny = await this.prisma.userModelConfig.count({
            where: { userId, modelType, isEnabled: true },
          });

          const userRows = await this.prisma.userModelConfig.findMany({
            where: {
              userId,
              modelType,
              isEnabled: true,
              ...(excludeModelIds.length > 0 && {
                modelId: { notIn: excludeModelIds },
              }),
            },
            orderBy: [{ isDefault: "desc" }, { priority: "desc" }],
          });
          if (userRows.length > 0) {
            this.logger.debug(
              `[getAllEnabledModelsByType] Using ${userRows.length} UserModelConfig rows for user=${userId}, type=${modelType}`,
            );
            return userRows.map((r) => this.toAIModelConfigFromUserConfig(r));
          }

          // ★ 严格 BYOK 隔离：用户有 UserModelConfig 但都被排除（本次失败重试链耗尽）→
          // 返回空。**绝不回落 admin AIModel**，否则 admin key + admin modelId 会被偷用。
          if (userHasAny > 0) {
            this.logger.warn(
              `[getAllEnabledModelsByType] User ${userId} has ${userHasAny} UserModelConfig for ${modelType}, but all excluded by retry list. Strict BYOK: NOT falling back to admin.`,
            );
            return [];
          }
        } catch (error) {
          this.logger.warn(
            `[getAllEnabledModelsByType] Failed to load UserModelConfig for ${userId}: ${(error as Error).message}; will consider admin fallback`,
          );
        }

        // 用户根本没配任何 UserModelConfig 时才走 admin fallback：
        // - RERANK / EVALUATOR 等"增强"类型：直接返回空（不烧 admin 的付费 key）
        // - CHAT / EMBEDDING 等"刚需"类型：回落 admin，保证新用户基本功能可用
        if (BYOK_OPTIONAL_TYPES.has(modelType)) {
          this.logger.debug(
            `[getAllEnabledModelsByType] User ${userId} has no ${modelType} UserModelConfig — returning empty (no admin fallback for optional types)`,
          );
          return [];
        }
      }

      const models = await this.prisma.aIModel.findMany({
        where: {
          modelType,
          isEnabled: true,
          ...(excludeModelIds.length > 0 && {
            modelId: { notIn: excludeModelIds },
          }),
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
  async getEnabledModelsForFrontend(
    modelType?: AIModelType,
    userId?: string,
  ): Promise<
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
      isUserKey?: boolean;
    }[]
  > {
    try {
      this.logger.debug(
        `[getEnabledModelsForFrontend] Called with userId=${userId || "NONE"}, modelType=${modelType || "ALL"}`,
      );

      const where: Record<string, unknown> = { isEnabled: true };
      if (modelType) {
        where.modelType = modelType;
      }

      const modelSelect = {
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
      };

      const models = await this.prisma.aIModel.findMany({
        where,
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: modelSelect,
      });

      // Ensure models is always an array
      if (!models || !Array.isArray(models)) {
        this.logger.warn(
          `[getEnabledModelsForFrontend] Prisma returned non-array: ${typeof models}`,
        );
        return [];
      }

      // Check user API keys if userId is provided
      let userProviders = new Set<string>();
      if (userId) {
        try {
          const userKeys = await this.prisma.userApiKey.findMany({
            where: { userId, isActive: true },
            select: { provider: true },
          });
          userProviders = new Set(
            userKeys.map((k) => k.provider.toLowerCase()),
          );
          this.logger.debug(
            `[getEnabledModelsForFrontend] User ${userId} has keys for providers: [${[...userProviders].join(", ")}]`,
          );
        } catch (error) {
          this.logger.warn(
            `[getEnabledModelsForFrontend] Failed to fetch user API keys: ${error}`,
          );
        }
      }

      // Find additional models from user's API key providers that are not already enabled
      let userExtraModels: typeof models = [];
      const byokGeneratedModels: Array<{
        id: string;
        name: string;
        displayName: string;
        provider: string;
        modelId: string;
        modelType: string;
        icon: string | null;
        color: string | null;
        description: string | null;
        isDefault: boolean;
      }> = [];

      if (userProviders.size > 0) {
        const enabledProviders = new Set(
          models.map((m) => m.provider.toLowerCase()),
        );
        const extraProviders = [...userProviders].filter(
          (p) => !enabledProviders.has(p),
        );
        if (extraProviders.length > 0) {
          // First, try to find disabled models in database
          const extraWhere: Record<string, unknown> = {
            isEnabled: false,
            provider: { in: extraProviders, mode: "insensitive" as const },
          };
          if (modelType) {
            extraWhere.modelType = modelType;
          }
          userExtraModels = await this.prisma.aIModel.findMany({
            where: extraWhere,
            orderBy: [{ isDefault: "desc" }, { name: "asc" }],
            select: modelSelect,
          });

          // Check which providers still have no models (not in DB at all)
          const foundProviders = new Set(
            userExtraModels.map((m) => m.provider.toLowerCase()),
          );
          const missingProviders = extraProviders.filter(
            (p) => !foundProviders.has(p),
          );

          // Generate BYOK default models for missing providers
          for (const provider of missingProviders) {
            const defaultModels = BYOK_DEFAULT_MODELS[provider];
            if (defaultModels) {
              const providerDisplayName =
                provider.charAt(0).toUpperCase() + provider.slice(1);
              for (const dm of defaultModels) {
                // Filter by modelType if specified
                if (modelType && dm.modelType !== modelType) {
                  continue;
                }
                byokGeneratedModels.push({
                  id: `byok-${provider}-${dm.name}`,
                  name: dm.name,
                  displayName: dm.displayName,
                  provider: providerDisplayName,
                  modelId: dm.modelId,
                  modelType: dm.modelType,
                  icon: dm.icon || null,
                  color: dm.color || null,
                  description: dm.description || null,
                  isDefault: false,
                });
              }
              this.logger.debug(
                `[getEnabledModelsForFrontend] Generated ${defaultModels.length} BYOK default models for provider: ${provider}`,
              );
            }
          }
        }
      }

      const mapModel = (model: (typeof models)[0], isUserKey: boolean) => ({
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
        ...(isUserKey ? { isUserKey: true } : {}),
      });

      // Map BYOK generated models (they don't have all fields from DB)
      const mapByokModel = (model: (typeof byokGeneratedModels)[0]) => ({
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
        isUserKey: true, // BYOK models are always user key models
        isByokGenerated: true, // Mark as dynamically generated
      });

      const result = [
        ...models.map((m) =>
          mapModel(m, userProviders.has(m.provider.toLowerCase())),
        ),
        ...userExtraModels.map((m) => mapModel(m, true)),
        ...byokGeneratedModels.map(mapByokModel),
      ];

      if (userId) {
        const userKeyModels = result.filter((m) => m.isUserKey);
        const byokModels = result.filter(
          (m) => (m as Record<string, unknown>).isByokGenerated,
        );
        this.logger.debug(
          `[getEnabledModelsForFrontend] Returning ${result.length} models, ${userKeyModels.length} with isUserKey (${byokModels.length} BYOK generated): [${userKeyModels.map((m) => m.name).join(", ")}]`,
        );
      }

      return result;
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

    // 4. ★ BYOK: 查找 disabled 模型（用户有对应 provider 的 Key 时可用）
    const disabledConfig = await this.findDisabledModelForUser(idOrModelId);
    if (disabledConfig) return disabledConfig;

    return null;
  }

  /**
   * ★ BYOK: 查找 disabled 模型，验证用户有对应 provider 的 active key
   * 不污染公共缓存，disabled 模型走独立查询
   */
  private async findDisabledModelForUser(
    idOrModelId: string,
    modelTypes?: string[],
  ): Promise<AIModelConfig | null> {
    const userId = RequestContext.getUserId();
    if (!userId) return null;

    try {
      const orClauses: Array<Record<string, unknown>> = [
        { modelId: { equals: idOrModelId, mode: "insensitive" } },
        { name: { equals: idOrModelId, mode: "insensitive" } },
      ];
      // Also try UUID match
      if (idOrModelId.length > 30) {
        orClauses.push({ id: idOrModelId });
      }
      const where: Record<string, unknown> = {
        OR: orClauses,
        isEnabled: false,
      };
      if (modelTypes) {
        where.modelType = { in: modelTypes };
      }

      const model = await this.prisma.aIModel.findFirst({ where });
      if (!model) return null;

      // Verify user has an active key for this provider
      const hasKey = await this.userApiKeysService.getPersonalKey(
        userId,
        model.provider.toLowerCase(),
      );
      if (!hasKey) return null;

      this.logger.debug(
        `[BYOK] Found disabled model ${model.modelId} for user ${userId} (has ${model.provider} key)`,
      );
      return this.buildModelConfig(model);
    } catch (error) {
      this.logger.warn(`[findDisabledModelForUser] Failed: ${error}`);
      return null;
    }
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
