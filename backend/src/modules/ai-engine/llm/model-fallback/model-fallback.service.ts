/**
 * Model Fallback Service
 *
 * 通用的模型降级和容错服务，提供：
 * - 模型优先级管理
 * - 智能降级链构建
 * - 带重试和模型切换的执行器
 * - 区分可重试错误和需要切换模型的错误
 *
 * 设计原则：
 * 1. 可重试错误（timeout、network）：在同一模型上重试
 * 2. 需要切换模型的错误（quota、api_key、model_invalid）：直接切换到下一个模型
 * 3. 限速错误：首次重试，连续触发则切换模型
 *
 * ★ P4 沉淀：从 AI Teams LeaderModelService 提取的通用能力
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AIModelConfig } from "../index";
import {
  AIError,
  AIErrorClassifier,
  AIErrorType,
} from "@/common/ai-orchestration/error-classifier";
import { AIModelType } from "@prisma/client";

// ==================== 类型定义 ====================

/**
 * 模型执行结果
 */
export interface ModelFallbackResult<T> {
  success: boolean;
  data?: T;
  error?: AIError;
  modelUsed: string;
  fallbackUsed: boolean;
  attempts: number;
  attemptedModels: string[];
}

/**
 * 模型执行选项
 */
export interface ModelFallbackOptions {
  /** 最大重试次数（同一模型） */
  maxRetries?: number;
  /** 最大模型切换次数 */
  maxModelSwitches?: number;
  /** 操作描述（用于日志） */
  operation?: string;
  /** 模型类型过滤 */
  modelType?: AIModelType;
  /** 是否优先使用推理模型 */
  preferReasoning?: boolean;
  /** 上下文信息 */
  context?: {
    missionId?: string;
    taskId?: string;
    [key: string]: unknown;
  };
}

/**
 * 模型优先级配置
 */
export interface ModelPriorityConfig {
  /** 优先级模式列表（按顺序匹配） */
  patterns: RegExp[];
  /** 模型类型 */
  modelType: AIModelType;
}

// ==================== 常量定义 ====================

/**
 * 需要直接切换模型的错误类型（不重试）
 */
const MODEL_SWITCH_ERROR_TYPES = new Set<AIErrorType>([
  AIErrorType.QUOTA_EXCEEDED, // 配额耗尽
  AIErrorType.INVALID_API_KEY, // API Key 无效
  AIErrorType.INVALID_MODEL, // 模型不存在
  AIErrorType.CONTENT_FILTERED, // 内容被过滤（换模型可能有不同策略）
]);

/**
 * 不可恢复的错误类型 - 模型需要加入黑名单（带 TTL）
 * 这些错误不会因为重试而自愈，需要人工干预（如更换 API Key）
 */
const UNRECOVERABLE_ERROR_TYPES = new Set<AIErrorType>([
  AIErrorType.INVALID_API_KEY,
]);

/** 不可恢复错误的黑名单持续时间（10 分钟） */
const UNRECOVERABLE_BLOCK_DURATION_MS = 10 * 60 * 1000;

/** 配额/限速错误的黑名单持续时间（5 分钟） */
const QUOTA_BLOCK_DURATION_MS = 5 * 60 * 1000;

/**
 * 可重试的错误类型
 */
const RETRYABLE_ERROR_TYPES = new Set<AIErrorType>([
  AIErrorType.TIMEOUT,
  AIErrorType.NETWORK_ERROR,
  AIErrorType.TEMPORARY_UNAVAILABLE,
]);

/**
 * 默认推理模型优先级模式
 */
const DEFAULT_REASONING_MODEL_PRIORITY: RegExp[] = [
  // Tier 1: 显式推理模型
  /^o3/i, // OpenAI O3
  /^o1/i, // OpenAI O1
  /^gpt-5/i, // GPT-5
  /deepseek.*r1/i, // DeepSeek R1
  /deepseek-reasoner/i,
  /claude.*opus/i, // Claude Opus
  // Tier 2: 强推理能力模型
  /gpt-4o(?!-mini)/i, // GPT-4o (not mini)
  /gpt-4(?!o)/i, // GPT-4 (not 4o)
  /claude.*sonnet/i, // Claude Sonnet
  /gemini.*pro/i, // Gemini Pro
  /grok-2/i, // Grok 2
  // Tier 3: 标准模型
  /grok/i,
  /gemini/i,
  /claude/i,
];

/**
 * 默认快速模型优先级模式
 */
const DEFAULT_FAST_MODEL_PRIORITY: RegExp[] = [
  /gpt-4o-mini/i,
  /gpt-3\.5/i,
  /claude.*haiku/i,
  /gemini.*flash/i,
  /deepseek.*chat/i,
];

// ==================== 服务实现 ====================

@Injectable()
export class ModelFallbackService {
  private readonly logger = new Logger(ModelFallbackService.name);
  private readonly errorClassifier = new AIErrorClassifier();

  /** 模型优先级配置（可通过 setModelPriority 自定义） */
  private reasoningPriorityPatterns = DEFAULT_REASONING_MODEL_PRIORITY;
  private fastPriorityPatterns = DEFAULT_FAST_MODEL_PRIORITY;

  /** 模型黑名单：modelId → 解除时间戳 */
  private readonly modelBlocklist = new Map<
    string,
    { until: number; reason: string }
  >();

  constructor(private readonly prisma: PrismaService) {}

  // ==================== 公共 API ====================

  /**
   * 设置推理模型优先级模式
   */
  setReasoningModelPriority(patterns: RegExp[]): void {
    this.reasoningPriorityPatterns = patterns;
    this.logger.log(
      `[setReasoningModelPriority] Updated with ${patterns.length} patterns`,
    );
  }

  /**
   * 设置快速模型优先级模式
   */
  setFastModelPriority(patterns: RegExp[]): void {
    this.fastPriorityPatterns = patterns;
    this.logger.log(
      `[setFastModelPriority] Updated with ${patterns.length} patterns`,
    );
  }

  /**
   * 获取模型降级链
   * 返回按优先级排序的可用模型列表
   */
  async getModelFallbackChain(
    options: {
      modelType?: AIModelType;
      preferReasoning?: boolean;
      excludeModels?: string[];
    } = {},
  ): Promise<AIModelConfig[]> {
    const {
      modelType = AIModelType.CHAT,
      preferReasoning = false,
      excludeModels = [],
    } = options;

    try {
      // 1. 获取所有启用的模型
      const allModels = await this.prisma.aIModel.findMany({
        where: {
          modelType: modelType,
          isEnabled: true,
          modelId: {
            notIn: excludeModels,
          },
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });

      if (allModels.length === 0) {
        this.logger.warn(
          `[getModelFallbackChain] No ${modelType} models available`,
        );
        return [];
      }

      // 2. 根据优先级排序
      let sortedModels: typeof allModels;

      if (preferReasoning) {
        // 分离显式推理模型和其他模型
        const explicitReasoningModels = allModels.filter((m) => m.isReasoning);
        const otherModels = allModels.filter((m) => !m.isReasoning);

        // 按优先级模式排序其他模型
        const sortedOtherModels = this.sortByPriority(
          otherModels,
          this.reasoningPriorityPatterns,
        );

        // 显式推理模型优先
        sortedModels = [...explicitReasoningModels, ...sortedOtherModels];
      } else {
        // 使用快速模型优先级
        sortedModels = this.sortByPriority(
          allModels,
          this.fastPriorityPatterns,
        );
      }

      // 3. 过滤被阻断的模型
      const unblockedModels = sortedModels.filter((m) => {
        if (this.isModelBlocked(m.modelId)) {
          const entry = this.modelBlocklist.get(m.modelId);
          this.logger.debug(
            `[getModelFallbackChain] Skipping blocked model ${m.modelId} (${entry?.reason})`,
          );
          return false;
        }
        return true;
      });

      // 4. 转换为 AIModelConfig
      const result = unblockedModels.map((m) => this.toAIModelConfig(m));

      this.logger.debug(
        `[getModelFallbackChain] Built fallback chain (${preferReasoning ? "reasoning" : "standard"}): ${result.map((m) => m.modelId).join(" → ")}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `[getModelFallbackChain] Failed to get fallback chain: ${error}`,
      );
      return [];
    }
  }

  /**
   * 带重试和模型切换的执行方法
   *
   * @param preferredModelId 首选模型 ID
   * @param executor 执行函数，接收模型配置，返回执行结果
   * @param options 执行选项
   */
  async executeWithFallback<T>(
    preferredModelId: string,
    executor: (modelConfig: AIModelConfig) => Promise<T>,
    options: ModelFallbackOptions = {},
  ): Promise<ModelFallbackResult<T>> {
    const {
      maxRetries = 2,
      maxModelSwitches = 3,
      operation = "model_call",
      modelType = AIModelType.CHAT,
      preferReasoning = false,
      context: _context = {},
    } = options;
    void _context; // 保留用于未来日志增强

    const attemptedModels: string[] = [];
    let totalAttempts = 0;
    let currentModelId = preferredModelId;
    let modelSwitchCount = 0;
    let lastError: AIError | undefined;
    let rateLimitRetryCount = 0;

    // 获取降级链
    const fallbackChain = await this.getModelFallbackChain({
      modelType,
      preferReasoning,
    });

    if (fallbackChain.length === 0) {
      return {
        success: false,
        error: new AIError(
          AIErrorType.INVALID_MODEL,
          "No available models for fallback",
          undefined,
          undefined,
          undefined,
        ),
        modelUsed: preferredModelId,
        fallbackUsed: false,
        attempts: 0,
        attemptedModels: [],
      };
    }

    // 主循环：模型切换
    while (modelSwitchCount <= maxModelSwitches) {
      // 获取当前模型配置
      let modelConfig = await this.getModelConfig(currentModelId);

      // 如果首选模型不可用，从降级链中选择
      if (!modelConfig) {
        const availableModel = fallbackChain.find(
          (m) => !attemptedModels.includes(m.modelId),
        );
        if (!availableModel) {
          this.logger.error(
            `[${operation}] No more models available after ${attemptedModels.length} attempts`,
          );
          break;
        }
        modelConfig = availableModel;
        currentModelId = modelConfig.modelId;
        this.logger.warn(
          `[${operation}] Preferred model ${preferredModelId} not available, using ${currentModelId}`,
        );
      }

      // 内层循环：同一模型的重试
      for (let retry = 0; retry <= maxRetries; retry++) {
        totalAttempts++;

        try {
          this.logger.debug(
            `[${operation}] Attempting with model ${currentModelId} (attempt ${retry + 1}/${maxRetries + 1}, switch ${modelSwitchCount}/${maxModelSwitches})`,
          );

          const result = await executor(modelConfig);

          // 成功
          this.logger.log(
            `[${operation}] Success with model ${currentModelId} after ${totalAttempts} total attempts`,
          );

          return {
            success: true,
            data: result,
            modelUsed: currentModelId,
            fallbackUsed: currentModelId !== preferredModelId,
            attempts: totalAttempts,
            attemptedModels: [...new Set(attemptedModels)],
          };
        } catch (error) {
          const classifiedError = this.errorClassifier.classify(
            error,
            modelConfig.provider,
          );
          lastError = classifiedError;

          this.logger.warn(
            `[${operation}] Error with model ${currentModelId}: ${classifiedError.type} - ${classifiedError.message}`,
          );

          // 判断是否需要立即切换模型
          if (MODEL_SWITCH_ERROR_TYPES.has(classifiedError.type)) {
            this.logger.log(
              `[${operation}] Error type ${classifiedError.type} requires immediate model switch`,
            );
            // 不可恢复错误（如 API Key 无效）加入黑名单，避免后续请求重复尝试
            if (
              UNRECOVERABLE_ERROR_TYPES.has(classifiedError.type) ||
              classifiedError.type === AIErrorType.QUOTA_EXCEEDED
            ) {
              this.blockModel(currentModelId, classifiedError.type);
            }
            attemptedModels.push(currentModelId);
            break;
          }

          // 限速错误：首次重试，连续则切换
          if (classifiedError.type === AIErrorType.RATE_LIMIT) {
            rateLimitRetryCount++;
            if (rateLimitRetryCount >= 2) {
              this.logger.log(
                `[${operation}] Consecutive rate limits, switching model`,
              );
              attemptedModels.push(currentModelId);
              rateLimitRetryCount = 0;
              break;
            }
            await this.delay(classifiedError.getRetryDelay());
            continue;
          }

          // 可重试错误：等待后重试
          if (RETRYABLE_ERROR_TYPES.has(classifiedError.type)) {
            if (retry < maxRetries) {
              const delay = this.calculateRetryDelay(
                retry,
                classifiedError.getRetryDelay(),
              );
              this.logger.debug(
                `[${operation}] Retrying after ${delay}ms (${classifiedError.type})`,
              );
              await this.delay(delay);
              continue;
            }
          }

          // 其他错误或重试次数用完：切换模型
          if (retry >= maxRetries) {
            this.logger.log(
              `[${operation}] Max retries reached for model ${currentModelId}, switching`,
            );
            attemptedModels.push(currentModelId);
            break;
          }
        }
      }

      // 选择下一个模型
      modelSwitchCount++;
      const nextModel = fallbackChain.find(
        (m) => !attemptedModels.includes(m.modelId),
      );

      if (!nextModel) {
        this.logger.error(`[${operation}] No more models in fallback chain`);
        break;
      }

      currentModelId = nextModel.modelId;
      this.logger.log(
        `[${operation}] Switching to fallback model: ${currentModelId}`,
      );
    }

    // 所有尝试都失败了
    this.logger.error(
      `[${operation}] All attempts failed. Models tried: ${attemptedModels.join(", ")}`,
    );

    return {
      success: false,
      error:
        lastError ||
        new AIError(
          AIErrorType.UNKNOWN,
          "All model attempts failed",
          undefined,
          undefined,
          undefined,
        ),
      modelUsed: currentModelId,
      fallbackUsed: true,
      attempts: totalAttempts,
      attemptedModels,
    };
  }

  /**
   * 获取单个模型配置
   */
  async getModelConfig(modelId: string): Promise<AIModelConfig | null> {
    try {
      const model = await this.prisma.aIModel.findFirst({
        where: {
          OR: [
            { modelId: { equals: modelId, mode: "insensitive" } },
            { name: { equals: modelId, mode: "insensitive" } },
          ],
          isEnabled: true,
        },
      });

      if (!model) {
        return null;
      }

      return this.toAIModelConfig(model);
    } catch (error) {
      this.logger.error(`[getModelConfig] Failed for ${modelId}: ${error}`);
      return null;
    }
  }

  /**
   * 检查错误是否应该切换模型
   */
  shouldSwitchModel(error: AIError): boolean {
    return (
      MODEL_SWITCH_ERROR_TYPES.has(error.type) ||
      error.type === AIErrorType.RATE_LIMIT
    );
  }

  /**
   * 检查错误是否可重试
   */
  isRetryableError(error: AIError): boolean {
    return RETRYABLE_ERROR_TYPES.has(error.type);
  }

  // ==================== 模型黑名单 ====================

  /**
   * 检查模型是否被阻断
   */
  isModelBlocked(modelId: string): boolean {
    const entry = this.modelBlocklist.get(modelId);
    if (!entry) return false;
    if (Date.now() >= entry.until) {
      this.modelBlocklist.delete(modelId);
      this.logger.log(
        `[modelBlocklist] Model ${modelId} block expired, removed from blocklist`,
      );
      return false;
    }
    return true;
  }

  /**
   * 将模型加入黑名单
   */
  private blockModel(modelId: string, errorType: AIErrorType): void {
    const durationMs = UNRECOVERABLE_ERROR_TYPES.has(errorType)
      ? UNRECOVERABLE_BLOCK_DURATION_MS
      : QUOTA_BLOCK_DURATION_MS;
    const until = Date.now() + durationMs;
    this.modelBlocklist.set(modelId, { until, reason: errorType });
    this.logger.warn(
      `[modelBlocklist] Blocked model ${modelId} for ${durationMs / 1000}s due to ${errorType}`,
    );
  }

  // ==================== 私有方法 ====================

  /**
   * 按优先级模式排序模型
   */
  private sortByPriority<T extends { modelId: string }>(
    models: T[],
    priorityPatterns: RegExp[],
  ): T[] {
    return [...models].sort((a, b) => {
      const priorityA = this.getModelPriority(a.modelId, priorityPatterns);
      const priorityB = this.getModelPriority(b.modelId, priorityPatterns);
      return priorityA - priorityB;
    });
  }

  /**
   * 获取模型优先级（数字越小优先级越高）
   */
  private getModelPriority(modelId: string, patterns: RegExp[]): number {
    for (let i = 0; i < patterns.length; i++) {
      if (patterns[i].test(modelId)) {
        return i;
      }
    }
    return patterns.length;
  }

  /**
   * 转换数据库模型为 AIModelConfig
   */
  private toAIModelConfig(model: {
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
    isReasoning: boolean;
  }): AIModelConfig {
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
      isReasoning: model.isReasoning,
    };
  }

  /**
   * 计算重试延迟（指数退避 + 抖动）
   */
  private calculateRetryDelay(attempt: number, baseDelay: number): number {
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = 0.75 + Math.random() * 0.5; // 0.75 - 1.25
    return Math.min(exponentialDelay * jitter, 30000); // 最大 30 秒
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
