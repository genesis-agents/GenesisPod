/**
 * Model Selector Service
 *
 * 智能模型选择服务，负责：
 * 1. 根据任务类型选择最佳模型
 * 2. 实现多种选择策略
 * 3. 维护模型可用性状态
 *
 * 配置通过 ConfigService 注入，支持环境变量覆盖
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { AIModelType } from "@prisma/client";
import { AiTaskType, AiModelConfig, ModelSelectionStrategy } from "./types";
import {
  AiOrchestrationConfig,
  DEFAULT_CONFIG,
  ModelRankingConfig,
  HealthCheckConfig,
} from "./config";

@Injectable()
export class ModelSelectorService {
  private readonly logger = new Logger(ModelSelectorService.name);

  // 模型健康状态缓存（用于避免选择失败的模型）
  private modelHealthCache: Map<
    string,
    { healthy: boolean; lastCheck: Date; failCount: number }
  > = new Map();

  // 配置
  private readonly modelRanking: ModelRankingConfig;
  private readonly healthCheckConfig: HealthCheckConfig;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly configService?: ConfigService,
  ) {
    // 从 ConfigService 获取配置，或使用默认值
    const config =
      this.configService?.get<AiOrchestrationConfig>("aiOrchestration");
    this.modelRanking = config?.modelRanking || DEFAULT_CONFIG.modelRanking;
    this.healthCheckConfig = config?.healthCheck || DEFAULT_CONFIG.healthCheck;
  }

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
   * 使用配置中的成本排名
   */
  private selectCostOptimized(models: AiModelConfig[]): AiModelConfig {
    return models.sort((a, b) => {
      const aCost = this.getModelRank(a.modelId, this.modelRanking.cost);
      const bCost = this.getModelRank(b.modelId, this.modelRanking.cost);
      return aCost - bCost;
    })[0];
  }

  /**
   * 质量优先选择
   * 使用配置中的质量排名
   */
  private selectQualityFirst(models: AiModelConfig[]): AiModelConfig {
    return models.sort((a, b) => {
      const aQuality = this.getModelRank(a.modelId, this.modelRanking.quality);
      const bQuality = this.getModelRank(b.modelId, this.modelRanking.quality);
      return aQuality - bQuality;
    })[0];
  }

  /**
   * 速度优先选择
   * 使用配置中的速度排名
   */
  private selectSpeedFirst(models: AiModelConfig[]): AiModelConfig {
    return models.sort((a, b) => {
      const aSpeed = this.getModelRank(a.modelId, this.modelRanking.speed);
      const bSpeed = this.getModelRank(b.modelId, this.modelRanking.speed);
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
   * 获取模型排名
   */
  private getModelRank(
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
   * 使用配置中的健康检查参数
   */
  isModelHealthy(modelId: string): boolean {
    const health = this.modelHealthCache.get(modelId);
    if (!health) return true; // 未知状态视为健康

    // 使用配置的恢复窗口和失败阈值
    const recoveryWindow = new Date(
      Date.now() - this.healthCheckConfig.recoveryWindowMs,
    );
    if (
      health.lastCheck > recoveryWindow &&
      health.failCount >= this.healthCheckConfig.failureThreshold
    ) {
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
    health.healthy = health.failCount < this.healthCheckConfig.failureThreshold;

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
