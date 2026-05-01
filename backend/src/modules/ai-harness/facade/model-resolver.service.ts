/**
 * Model Resolver Service
 * 模型解析子门面
 *
 * 从 AIFacade 提取的模型管理职责：
 * - 模型选择（含推理模型优先、熔断器、黑名单过滤）
 * - 模型列表查询（扩展/简化两种视图）
 * - 默认模型获取（按类型）
 * - 模型配置获取（含完整配置/安全配置）
 *
 * 设计原则：
 * - 作为 Facade 的内部委托，不直接暴露给 AI Apps
 * - 消费者仍通过 AIFacade 调用
 */

import { Injectable, Logger, Optional, Inject } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AiChatService } from "../../ai-engine/llm/services/ai-chat.service";
import { AiModelConfigService } from "../../ai-engine/llm/services/ai-model-config.service";
import { ModelFallbackService } from "../../ai-engine/llm/selection/model-fallback.service";
import type { ModelInfo, ModelSelectionOptions } from "./types/facade.types";
import {
  OrchestrationFeature,
  ORCHESTRATION_FEATURE,
} from "./facade.providers";

@Injectable()
export class ModelResolverService {
  private readonly logger = new Logger(ModelResolverService.name);

  constructor(
    private readonly aiChatService: AiChatService,
    private readonly modelConfigService: AiModelConfigService,
    @Optional() private readonly modelFallbackService?: ModelFallbackService,
    @Optional()
    @Inject(ORCHESTRATION_FEATURE)
    private readonly orchestration?: OrchestrationFeature,
  ) {}

  /**
   * 智能模型选择
   *
   * 综合考虑推理能力、提供商偏好、模型黑名单、token 容量、熔断器状态
   */
  async selectModel(
    options: ModelSelectionOptions = {},
  ): Promise<ModelInfo | null> {
    this.logger.log(
      `[selectModel] Starting selection with options=${JSON.stringify(options)}`,
    );

    const models = await this.getAvailableModelsExtended(
      options.modelType || AIModelType.CHAT,
    );

    if (models.length === 0) {
      this.logger.error("[selectModel] No models available!");
      return null;
    }

    let candidates = models;

    // 0. BYOK v2：按用户可用 provider 过滤。管理员或后台任务传 undefined 跳过。
    if (options.availableProviders !== undefined) {
      const allowed = new Set(
        options.availableProviders.map((p) => p.toLowerCase()),
      );
      const filtered = candidates.filter((m) =>
        allowed.has(m.provider.toLowerCase()),
      );
      if (filtered.length === 0) {
        this.logger.warn(
          `[selectModel] No models match availableProviders=${[...allowed].join(",")}`,
        );
        return null;
      }
      candidates = filtered;
    }

    // 1. 过滤推理模型
    if (options.requireReasoning) {
      const reasoningModels = candidates.filter((m) => m.isReasoning);
      if (reasoningModels.length > 0) {
        candidates = reasoningModels;
      } else {
        this.logger.warn(
          "[selectModel] No reasoning models found, falling back to all models",
        );
      }
    }

    // 2. 过滤提供商
    if (options.preferredProvider) {
      const preferred = candidates.filter(
        (m) =>
          m.provider.toLowerCase() === options.preferredProvider?.toLowerCase(),
      );
      if (preferred.length > 0) {
        candidates = preferred;
      }
    }

    // 2.5 过滤模型黑名单
    if (this.modelFallbackService) {
      const unblocked = candidates.filter(
        (m) => !this.modelFallbackService!.isModelBlocked(m.id),
      );
      if (unblocked.length > 0) {
        candidates = unblocked;
      }
    }

    // 3. 过滤 maxTokens
    if (options.minMaxTokens) {
      const filtered = candidates.filter(
        (m) => (m.maxTokens || 0) >= (options.minMaxTokens || 0),
      );
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    // 4. 考虑熔断器状态
    if (this.orchestration?.circuitBreaker) {
      const entityIds = candidates.map((m) => `chat:${m.id}`);
      const bestEntityId =
        this.orchestration.circuitBreaker.selectBest(entityIds);

      if (bestEntityId) {
        const modelId = bestEntityId.replace("chat:", "");
        const selected = candidates.find((m) => m.id === modelId);
        if (selected) {
          this.logger.log(
            `[selectModel] Selected ${modelId} via circuit breaker`,
          );
          return selected;
        }
      }
    }

    const selected = candidates[0] || null;
    this.logger.log(`[selectModel] Selected ${selected?.id || "NONE"}`);
    return selected;
  }

  /**
   * 获取最佳推理模型
   */
  async getReasoningModel(): Promise<ModelInfo | null> {
    return this.selectModel({ requireReasoning: true });
  }

  /**
   * 获取扩展模型信息（含可用性、推理能力）
   */
  async getAvailableModelsExtended(
    modelType: AIModelType = AIModelType.CHAT,
  ): Promise<ModelInfo[]> {
    const models =
      await this.modelConfigService.getAllEnabledModelsByType(modelType);

    return models.map((m) => {
      const isReasoning =
        m.isReasoning ?? this.aiChatService.isReasoningModel(m.modelId);
      const isBlocked =
        this.modelFallbackService?.isModelBlocked(m.modelId) ?? false;
      const isAvailable =
        !isBlocked &&
        (this.orchestration?.circuitBreaker?.canExecute(`chat:${m.modelId}`) ??
          true);

      return {
        id: m.modelId,
        dbId: m.id,
        name: m.displayName || m.modelId,
        provider: m.provider,
        isReasoning,
        isAvailable,
        maxTokens: m.maxTokens,
        icon: undefined,
        isDefault: m.isDefault,
      };
    });
  }

  /**
   * 获取简化模型列表（供 UI 展示）
   */
  async getAvailableModels(modelType: AIModelType = AIModelType.CHAT): Promise<
    Array<{
      id: string;
      dbId?: string;
      name: string;
      provider: string;
      icon?: string | null;
      isDefault?: boolean;
    }>
  > {
    const models =
      await this.modelConfigService.getEnabledModelsForFrontend(modelType);

    return models.map((m) => ({
      id: m.modelId,
      dbId: m.id,
      name: m.name,
      provider: m.provider,
      icon: m.icon,
      isDefault: m.isDefault,
    }));
  }

  /**
   * 获取默认文本模型
   */
  async getDefaultTextModel(): Promise<{
    id: string;
    modelId: string;
    displayName: string;
    provider: string;
    maxTokens?: number;
  } | null> {
    return this.getDefaultModelByType(AIModelType.CHAT);
  }

  /**
   * 获取默认图像模型
   */
  async getDefaultImageModel(): Promise<{
    id: string;
    modelId: string;
    displayName: string;
    provider: string;
    maxTokens?: number;
  } | null> {
    return this.getDefaultModelByType(AIModelType.IMAGE_GENERATION);
  }

  /**
   * 根据 ID 获取模型配置
   */
  async getModelById(idOrModelId: string): Promise<{
    id: string;
    modelId: string;
    displayName: string;
    provider: string;
    maxTokens?: number;
    apiEndpoint?: string;
    isReasoning?: boolean;
    apiKey?: string | null;
    secretKey?: string | null;
    modelType?: string;
  } | null> {
    const config = await this.modelConfigService.getModelById(idOrModelId);
    if (!config) return null;

    // ★ v3.1: 通过 Secret Manager 解析 apiKey，不直接暴露明文
    const resolved = await this.modelConfigService.resolveApiKey(config);
    return {
      id: config.id,
      modelId: config.modelId,
      displayName: config.displayName || config.modelId,
      provider: config.provider,
      maxTokens: config.maxTokens,
      apiEndpoint: config.apiEndpoint,
      isReasoning: config.isReasoning ?? false,
      apiKey: resolved?.apiKey || null,
      secretKey: config.secretKey,
    };
  }

  /**
   * 获取完整模型配置（含敏感信息）
   */
  async getFullModelConfig(modelId: string): Promise<{
    id: string;
    modelId: string;
    displayName: string;
    name: string;
    provider: string;
    apiKey: string;
    secretKey?: string | null;
    apiEndpoint?: string | null;
    maxTokens?: number | null;
    temperature?: number | null;
    isEnabled: boolean;
    isDefault: boolean;
    isReasoning?: boolean;
    apiFormat?: string | null;
    supportsTemperature?: boolean;
    supportsStreaming?: boolean;
    supportsFunctionCalling?: boolean;
    supportsVision?: boolean;
    tokenParamName?: string | null;
    defaultTimeoutMs?: number | null;
    priceInputPerMillion?: number | null;
    priceOutputPerMillion?: number | null;
    priority?: number | null;
  } | null> {
    const config = await this.modelConfigService.getModelById(modelId);
    if (!config) return null;

    // ★ v3.1: 通过 Secret Manager 解析 apiKey
    const resolved = await this.modelConfigService.resolveApiKey(config);
    return {
      id: config.id || config.modelId,
      modelId: config.modelId,
      displayName: config.displayName || config.modelId,
      name: config.name || config.modelId,
      provider: config.provider,
      apiKey: resolved?.apiKey || "",
      secretKey: config.secretKey || null,
      apiEndpoint: config.apiEndpoint || null,
      maxTokens: config.maxTokens || null,
      temperature: config.temperature || null,
      isEnabled: config.isEnabled ?? true,
      isDefault: config.isDefault ?? false,
      isReasoning: config.isReasoning ?? false,
      apiFormat: config.apiFormat || null,
      supportsTemperature: config.supportsTemperature ?? true,
      supportsStreaming: config.supportsStreaming ?? false,
      supportsFunctionCalling: config.supportsFunctionCalling ?? false,
      supportsVision: config.supportsVision ?? false,
      tokenParamName: config.tokenParamName || null,
      defaultTimeoutMs: config.defaultTimeoutMs || null,
      priceInputPerMillion: config.priceInputPerMillion || null,
      priceOutputPerMillion: config.priceOutputPerMillion || null,
      priority: config.priority || null,
    };
  }

  /**
   * 获取指定类型的默认模型
   */
  async getDefaultModelByType(modelType: AIModelType): Promise<{
    id: string;
    modelId: string;
    displayName: string;
    provider: string;
    maxTokens?: number;
  } | null> {
    const config = await this.aiChatService.getDefaultModelByType(modelType);
    if (!config) return null;
    return {
      id: config.id || config.modelId,
      modelId: config.modelId,
      displayName: config.displayName || config.modelId,
      provider: config.provider,
      maxTokens: config.maxTokens,
    };
  }
}
