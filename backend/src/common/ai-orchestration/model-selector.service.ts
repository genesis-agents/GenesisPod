/**
 * Model Selector Service
 *
 * 智能模型选择服务，负责：
 * 1. 根据任务类型选择最佳模型
 * 2. 实现多种选择策略
 * 3. 维护模型可用性状态
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AIModelType } from "@prisma/client";
import { AiTaskType, AiModelConfig, ModelSelectionStrategy } from "./types";

@Injectable()
export class ModelSelectorService {
  private readonly logger = new Logger(ModelSelectorService.name);

  // 模型健康状态缓存（用于避免选择失败的模型）
  private modelHealthCache: Map<
    string,
    { healthy: boolean; lastCheck: Date; failCount: number }
  > = new Map();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 根据任务类型选择最佳模型
   */
  async selectModel(
    taskType: AiTaskType,
    options?: {
      preferredModelId?: string;
      strategy?: ModelSelectionStrategy;
      excludeModels?: string[];
    },
  ): Promise<AiModelConfig | null> {
    const {
      preferredModelId,
      strategy = ModelSelectionStrategy.DEFAULT,
      excludeModels = [],
    } = options || {};

    this.logger.debug(
      `[selectModel] Task: ${taskType}, preferred: ${preferredModelId}, strategy: ${strategy}`,
    );

    // 1. 如果指定了模型，优先使用
    if (preferredModelId) {
      const preferred = await this.getModelById(preferredModelId);
      if (preferred && this.isModelHealthy(preferred.id)) {
        this.logger.debug(
          `[selectModel] Using preferred model: ${preferred.name}`,
        );
        return preferred;
      }
      this.logger.warn(
        `[selectModel] Preferred model ${preferredModelId} not available, falling back`,
      );
    }

    // 2. 确定需要的模型类型
    const requiredModelType = this.getRequiredModelType(taskType);

    // 3. 获取所有可用模型
    const availableModels = await this.getAvailableModels(
      requiredModelType,
      excludeModels,
    );

    if (availableModels.length === 0) {
      this.logger.error(
        `[selectModel] No available models for type: ${requiredModelType}`,
      );
      return null;
    }

    // 4. 根据策略选择模型
    const selected = this.applySelectionStrategy(availableModels, strategy);

    this.logger.log(
      `[selectModel] Selected: ${selected.name} (${selected.provider}) for task: ${taskType}`,
    );

    return selected;
  }

  /**
   * 获取任务类型对应的模型类型
   */
  private getRequiredModelType(taskType: AiTaskType): AIModelType {
    switch (taskType) {
      case AiTaskType.CHAT:
      case AiTaskType.COMPLETION:
      case AiTaskType.SUMMARIZATION:
      case AiTaskType.TRANSLATION:
      case AiTaskType.EXTRACTION:
        return AIModelType.CHAT;

      case AiTaskType.IMAGE_GENERATION:
        return AIModelType.IMAGE_GENERATION;

      case AiTaskType.IMAGE_EDITING:
        return AIModelType.IMAGE_EDITING;

      case AiTaskType.MULTIMODAL:
        return AIModelType.MULTIMODAL;

      default:
        return AIModelType.CHAT;
    }
  }

  /**
   * 获取所有可用模型
   */
  private async getAvailableModels(
    modelType: AIModelType,
    excludeIds: string[] = [],
  ): Promise<AiModelConfig[]> {
    const models = await this.prisma.aIModel.findMany({
      where: {
        modelType,
        isEnabled: true,
        id: { notIn: excludeIds },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    // 过滤掉不健康的模型
    return models
      .filter((m) => this.isModelHealthy(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        displayName: m.displayName,
        provider: m.provider,
        modelId: m.modelId,
        modelType: m.modelType,
        apiKey: m.apiKey || "",
        apiEndpoint: m.apiEndpoint || undefined,
      }));
  }

  /**
   * 根据 ID 获取模型
   */
  async getModelById(id: string): Promise<AiModelConfig | null> {
    const model = await this.prisma.aIModel.findFirst({
      where: { id, isEnabled: true },
    });

    if (!model) return null;

    return {
      id: model.id,
      name: model.name,
      displayName: model.displayName,
      provider: model.provider,
      modelId: model.modelId,
      modelType: model.modelType,
      apiKey: model.apiKey || "",
      apiEndpoint: model.apiEndpoint || undefined,
    };
  }

  /**
   * 应用选择策略
   */
  private applySelectionStrategy(
    models: AiModelConfig[],
    strategy: ModelSelectionStrategy,
  ): AiModelConfig {
    switch (strategy) {
      case ModelSelectionStrategy.COST_OPTIMIZED:
        // 优先选择便宜的模型（根据 provider 判断）
        return this.selectCostOptimized(models);

      case ModelSelectionStrategy.QUALITY_FIRST:
        // 优先选择高质量模型
        return this.selectQualityFirst(models);

      case ModelSelectionStrategy.SPEED_FIRST:
        // 优先选择快速模型
        return this.selectSpeedFirst(models);

      case ModelSelectionStrategy.ROUND_ROBIN:
        // 轮询选择
        return this.selectRoundRobin(models);

      case ModelSelectionStrategy.DEFAULT:
      default:
        // 默认选择（按 isDefault 和 priority 排序）
        return models[0];
    }
  }

  /**
   * 成本优化选择
   */
  private selectCostOptimized(models: AiModelConfig[]): AiModelConfig {
    // 成本排序：Gemini Flash < GPT-3.5 < Claude Haiku < GPT-4 < Claude Sonnet < Claude Opus
    const costRanking: Record<string, number> = {
      "gemini-flash": 1,
      "gemini-2.0-flash": 1,
      "gpt-3.5": 2,
      "claude-haiku": 2,
      "gpt-4-turbo": 3,
      "gpt-4o": 3,
      "claude-sonnet": 4,
      grok: 4,
      "gpt-4": 5,
      "claude-opus": 6,
    };

    return models.sort((a, b) => {
      const aCost = this.getModelCostRank(a.modelId, costRanking);
      const bCost = this.getModelCostRank(b.modelId, costRanking);
      return aCost - bCost;
    })[0];
  }

  /**
   * 质量优先选择
   */
  private selectQualityFirst(models: AiModelConfig[]): AiModelConfig {
    // 质量排序（与成本相反）
    const qualityRanking: Record<string, number> = {
      "claude-opus": 1,
      "gpt-4": 2,
      "claude-sonnet": 3,
      grok: 3,
      "gpt-4o": 4,
      "gpt-4-turbo": 4,
      "claude-haiku": 5,
      "gpt-3.5": 6,
      "gemini-flash": 7,
    };

    return models.sort((a, b) => {
      const aQuality = this.getModelCostRank(a.modelId, qualityRanking);
      const bQuality = this.getModelCostRank(b.modelId, qualityRanking);
      return aQuality - bQuality;
    })[0];
  }

  /**
   * 速度优先选择
   */
  private selectSpeedFirst(models: AiModelConfig[]): AiModelConfig {
    // 速度排序：Flash 模型最快
    const speedRanking: Record<string, number> = {
      "gemini-flash": 1,
      "gemini-2.0-flash": 1,
      "claude-haiku": 2,
      "gpt-3.5": 2,
      "gpt-4o": 3,
      "gpt-4-turbo": 4,
      "claude-sonnet": 5,
      grok: 5,
      "gpt-4": 6,
      "claude-opus": 7,
    };

    return models.sort((a, b) => {
      const aSpeed = this.getModelCostRank(a.modelId, speedRanking);
      const bSpeed = this.getModelCostRank(b.modelId, speedRanking);
      return aSpeed - bSpeed;
    })[0];
  }

  /**
   * 轮询选择
   */
  private roundRobinIndex = 0;
  private selectRoundRobin(models: AiModelConfig[]): AiModelConfig {
    const selected = models[this.roundRobinIndex % models.length];
    this.roundRobinIndex++;
    return selected;
  }

  /**
   * 获取模型成本排名
   */
  private getModelCostRank(
    modelId: string,
    ranking: Record<string, number>,
  ): number {
    const lowerModelId = modelId.toLowerCase();
    for (const [key, rank] of Object.entries(ranking)) {
      if (lowerModelId.includes(key)) {
        return rank;
      }
    }
    return 99; // 未知模型排最后
  }

  /**
   * 检查模型是否健康
   */
  isModelHealthy(modelId: string): boolean {
    const health = this.modelHealthCache.get(modelId);
    if (!health) return true; // 未知状态视为健康

    // 如果最近 5 分钟内失败超过 3 次，视为不健康
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (health.lastCheck > fiveMinutesAgo && health.failCount >= 3) {
      return false;
    }

    return health.healthy;
  }

  /**
   * 报告模型失败
   */
  reportModelFailure(modelId: string, error: string): void {
    const health = this.modelHealthCache.get(modelId) || {
      healthy: true,
      lastCheck: new Date(),
      failCount: 0,
    };

    health.failCount++;
    health.lastCheck = new Date();
    health.healthy = health.failCount < 3;

    this.modelHealthCache.set(modelId, health);

    this.logger.warn(
      `[reportModelFailure] Model ${modelId} failed (count: ${health.failCount}): ${error}`,
    );
  }

  /**
   * 报告模型成功
   */
  reportModelSuccess(modelId: string): void {
    const health = this.modelHealthCache.get(modelId);
    if (health) {
      health.healthy = true;
      health.failCount = 0;
      health.lastCheck = new Date();
      this.modelHealthCache.set(modelId, health);
    }
  }

  /**
   * 获取降级模型链
   */
  async getFallbackChain(
    taskType: AiTaskType,
    currentModelId: string,
  ): Promise<AiModelConfig[]> {
    const requiredModelType = this.getRequiredModelType(taskType);

    // 获取所有可用模型，排除当前模型
    const models = await this.getAvailableModels(requiredModelType, [
      currentModelId,
    ]);

    // 按优先级排序
    return models;
  }
}
