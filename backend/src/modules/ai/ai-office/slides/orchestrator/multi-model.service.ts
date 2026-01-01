/**
 * Slides Engine v3.0 - Multi-Model Service
 *
 * 多模型协作服务，负责：
 * 1. 根据角色选择合适的模型类型和策略
 * 2. 提供统一的 AI 调用接口
 * 3. 处理降级和重试逻辑
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AiOrchestrationService } from "@/common/ai-orchestration/ai-orchestration.service";
import { ModelSelectorService } from "@/common/ai-orchestration/model-selector.service";
import {
  AiTaskType,
  AiCallInput,
  ModelSelectionStrategy,
  ChatMessage,
} from "@/common/ai-orchestration/types";
import { SlidesRole, ROLE_CONFIGS } from "../checkpoint/checkpoint.types";

/**
 * 角色调用输入
 */
export interface RoleCallInput {
  role: SlidesRole;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  metadata?: {
    sessionId?: string;
    pageNumber?: number;
    phase?: string;
    [key: string]: unknown;
  };
}

/**
 * 角色调用结果
 */
export interface RoleCallResult {
  success: boolean;
  content?: string;
  role: SlidesRole;
  modelUsed: string;
  provider: string;
  tokensUsed: number;
  latencyMs: number;
  error?: string;
  fallbackUsed?: boolean;
}

/**
 * 图像生成输入
 */
export interface ImageGenerationInput {
  prompt: string;
  semanticContext: string;
  style?: string;
  aspectRatio?: "16:9" | "4:3" | "1:1" | "9:16";
  negativePrompt?: string;
  metadata?: {
    sessionId?: string;
    pageNumber?: number;
    [key: string]: unknown;
  };
}

/**
 * 图像生成结果
 */
export interface ImageGenerationResult {
  success: boolean;
  url?: string;
  width?: number;
  height?: number;
  modelUsed: string;
  provider: string;
  latencyMs: number;
  error?: string;
}

/**
 * 模型类型到任务类型的映射
 */
const MODEL_TYPE_TO_TASK_TYPE: Record<AIModelType, AiTaskType> = {
  CHAT: AiTaskType.CHAT,
  CHAT_FAST: AiTaskType.CHAT, // CHAT_FAST 使用 CHAT 任务类型，但策略不同
  IMAGE_GENERATION: AiTaskType.IMAGE_GENERATION,
  IMAGE_EDITING: AiTaskType.IMAGE_EDITING,
  MULTIMODAL: AiTaskType.MULTIMODAL,
  EMBEDDING: AiTaskType.COMPLETION, // 使用 COMPLETION 作为默认
  RERANK: AiTaskType.COMPLETION,
};

@Injectable()
export class MultiModelService {
  private readonly logger = new Logger(MultiModelService.name);

  constructor(
    private readonly aiOrchestration: AiOrchestrationService,
    private readonly modelSelector: ModelSelectorService,
  ) {}

  /**
   * 获取指定角色的可用模型列表
   */
  async getAvailableModelsForRole(role: SlidesRole): Promise<string[]> {
    const taskType = this.getTaskTypeForRole(role);

    // 使用 modelSelector 获取降级链作为可用模型列表
    const fallbackChain = await this.modelSelector.getFallbackChain(
      taskType,
      "", // 空字符串表示获取所有可用模型
    );

    return fallbackChain.map((model) => model.name);
  }

  /**
   * 检查模型健康状态
   */
  isModelHealthy(modelId: string): boolean {
    return this.modelSelector.isModelHealthy(modelId);
  }

  /**
   * 报告模型调用结果
   */
  reportModelResult(modelId: string, success: boolean, error?: string): void {
    if (success) {
      this.modelSelector.reportModelSuccess(modelId);
    } else {
      this.modelSelector.reportModelFailure(modelId, error || "Unknown error");
    }
  }

  /**
   * 根据角色调用 AI（带超时和重试）
   */
  async callByRole(input: RoleCallInput): Promise<RoleCallResult> {
    const { role, messages, maxTokens, temperature, metadata } = input;
    const roleConfig = ROLE_CONFIGS[role];

    this.logger.log(
      `[callByRole] Role: ${role}, ModelType: ${roleConfig.modelType}, Strategy: ${roleConfig.strategy}`,
    );

    const startTime = Date.now();
    const timeoutMs = this.getTimeoutForRole(role);
    const maxRetries = this.getMaxRetriesForRole(role);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 构建 AI 调用输入
        const aiInput: AiCallInput = {
          taskType: this.getTaskTypeForRole(role),
          messages,
          strategy: this.mapStrategy(roleConfig.strategy),
          maxTokens: maxTokens || this.getDefaultMaxTokens(role),
          temperature: temperature || this.getDefaultTemperature(role),
          metadata: {
            source: "slides",
            role,
            attempt,
            ...metadata,
          },
        };

        // 调用 AI（带超时）
        const result = await this.callWithTimeout(
          this.aiOrchestration.call(aiInput),
          timeoutMs,
          `AI call for role ${role} timed out after ${timeoutMs}ms`,
        );

        // 检查结果是否有效
        if (result.success && result.content) {
          return {
            success: result.success,
            content: result.content,
            role,
            modelUsed: result.model,
            provider: result.provider,
            tokensUsed: result.tokensUsed,
            latencyMs: Date.now() - startTime,
            error: result.error,
            fallbackUsed: result.fallbackUsed || attempt > 1,
          };
        }

        // 结果不成功，记录错误并重试
        lastError = new Error(result.error || "AI returned empty content");
        this.logger.warn(
          `[callByRole] Attempt ${attempt}/${maxRetries} failed for role ${role}: ${lastError.message}`,
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `[callByRole] Attempt ${attempt}/${maxRetries} failed for role ${role}: ${lastError.message}`,
        );
      }

      // 如果不是最后一次尝试，等待后重试
      if (attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // 指数退避，最大10秒
        this.logger.log(
          `[callByRole] Retrying in ${backoffMs}ms... (attempt ${attempt + 1}/${maxRetries})`,
        );
        await this.sleep(backoffMs);
      }
    }

    // 所有重试都失败
    this.logger.error(
      `[callByRole] All ${maxRetries} attempts failed for role ${role}`,
    );

    return {
      success: false,
      role,
      modelUsed: "unknown",
      provider: "unknown",
      tokensUsed: 0,
      latencyMs: Date.now() - startTime,
      error: lastError?.message || "All retry attempts failed",
    };
  }

  /**
   * 获取角色的最大重试次数
   */
  private getMaxRetriesForRole(role: SlidesRole): number {
    switch (role) {
      case "architect":
        return 3; // 架构角色重要，多重试几次
      case "writer":
        return 2;
      case "renderer":
        return 2;
      case "reviewer":
        return 2;
      case "image":
        return 3; // 图像生成容易失败，多重试
      default:
        return 2;
    }
  }

  /**
   * 休眠指定毫秒数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 带超时的 Promise 调用
   */
  private async callWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string,
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (error) {
      clearTimeout(timeoutId!);
      throw error;
    }
  }

  /**
   * 获取角色的超时时间（毫秒）
   */
  private getTimeoutForRole(role: SlidesRole): number {
    switch (role) {
      case "architect":
        return 120000; // 120s - 任务分解和大纲需要更多时间（大文档可能很慢）
      case "writer":
        return 60000; // 60s - 内容填充（增加容错）
      case "renderer":
        return 90000; // 90s - HTML 生成可能较慢
      case "reviewer":
        return 45000; // 45s - 质量审核
      case "image":
        return 90000; // 90s - 图像生成（网络延迟可能较大）
      default:
        return 45000; // 默认 45s
    }
  }

  /**
   * 生成图像
   */
  async generateImage(
    input: ImageGenerationInput,
  ): Promise<ImageGenerationResult> {
    const {
      prompt,
      semanticContext,
      style,
      aspectRatio,
      negativePrompt,
      metadata,
    } = input;

    this.logger.log(
      `[generateImage] Context: ${semanticContext.substring(0, 50)}..., Style: ${style || "default"}`,
    );

    const startTime = Date.now();

    try {
      // 构建增强的提示词
      const enhancedPrompt = this.buildImagePrompt(
        prompt,
        semanticContext,
        style,
      );

      const aiInput: AiCallInput = {
        taskType: AiTaskType.IMAGE_GENERATION,
        prompt: enhancedPrompt,
        strategy: ModelSelectionStrategy.DEFAULT,
        imageOptions: {
          aspectRatio: aspectRatio || "16:9", // PPT 默认宽屏
          style: style || "professional",
          negativePrompt,
        },
        metadata: {
          source: "slides",
          role: "image",
          ...metadata,
        },
      };

      const result = await this.aiOrchestration.call(aiInput);

      if (result.success && result.images && result.images.length > 0) {
        const image = result.images[0];
        return {
          success: true,
          url: image.url,
          width: image.width,
          height: image.height,
          modelUsed: result.model,
          provider: result.provider,
          latencyMs: Date.now() - startTime,
        };
      }

      return {
        success: false,
        modelUsed: result.model,
        provider: result.provider,
        latencyMs: Date.now() - startTime,
        error: result.error || "No image generated",
      };
    } catch (error) {
      this.logger.error("[generateImage] Failed:", error);

      return {
        success: false,
        modelUsed: "unknown",
        provider: "unknown",
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 批量调用多个角色（串行）
   */
  async callRolesSequentially(
    calls: RoleCallInput[],
  ): Promise<Map<SlidesRole, RoleCallResult>> {
    const results = new Map<SlidesRole, RoleCallResult>();

    for (const call of calls) {
      const result = await this.callByRole(call);
      results.set(call.role, result);

      // 如果失败，可以提前终止
      if (!result.success) {
        this.logger.warn(
          `[callRolesSequentially] Role ${call.role} failed, stopping chain`,
        );
        break;
      }
    }

    return results;
  }

  /**
   * 批量调用多个角色（并行）
   */
  async callRolesParallel(
    calls: RoleCallInput[],
  ): Promise<Map<SlidesRole, RoleCallResult>> {
    const results = new Map<SlidesRole, RoleCallResult>();

    const promises = calls.map(async (call) => {
      const result = await this.callByRole(call);
      return { role: call.role, result };
    });

    const settled = await Promise.allSettled(promises);

    for (const item of settled) {
      if (item.status === "fulfilled") {
        results.set(item.value.role, item.value.result);
      } else {
        this.logger.error("[callRolesParallel] Promise rejected:", item.reason);
      }
    }

    return results;
  }

  /**
   * 获取角色对应的任务类型
   */
  private getTaskTypeForRole(role: SlidesRole): AiTaskType {
    const roleConfig = ROLE_CONFIGS[role];
    return MODEL_TYPE_TO_TASK_TYPE[roleConfig.modelType] || AiTaskType.CHAT;
  }

  /**
   * 映射策略字符串到枚举
   */
  private mapStrategy(strategy: string): ModelSelectionStrategy {
    switch (strategy) {
      case "COST_OPTIMIZED":
        return ModelSelectionStrategy.COST_OPTIMIZED;
      case "QUALITY_FIRST":
        return ModelSelectionStrategy.QUALITY_FIRST;
      case "SPEED_FIRST":
        return ModelSelectionStrategy.SPEED_FIRST;
      case "ROUND_ROBIN":
        return ModelSelectionStrategy.ROUND_ROBIN;
      default:
        return ModelSelectionStrategy.DEFAULT;
    }
  }

  /**
   * 获取角色默认的 maxTokens
   */
  private getDefaultMaxTokens(role: SlidesRole): number {
    switch (role) {
      case "architect":
        return 4096; // 任务分解和大纲需要较多 token
      case "writer":
        return 2048; // 内容填充中等
      case "renderer":
        return 8192; // HTML 生成需要较多 token
      case "reviewer":
        return 2048; // 质量审核中等
      default:
        return 2048;
    }
  }

  /**
   * 获取角色默认的 temperature
   */
  private getDefaultTemperature(role: SlidesRole): number {
    switch (role) {
      case "architect":
        return 0.3; // 架构规划需要稳定性
      case "writer":
        return 0.5; // 内容创作需要一些创意
      case "renderer":
        return 0.2; // HTML 生成需要精确
      case "reviewer":
        return 0.1; // 审核需要高度一致性
      case "image":
        return 0.7; // 图像生成可以有创意
      default:
        return 0.5;
    }
  }

  /**
   * 构建增强的图像提示词
   */
  private buildImagePrompt(
    prompt: string,
    semanticContext: string,
    style?: string,
  ): string {
    const stylePrefix = style
      ? `${style} style, `
      : "Professional business presentation style, ";

    return `${stylePrefix}${prompt}. Context: ${semanticContext}. High quality, clean design, suitable for corporate presentation.`;
  }

  /**
   * 获取模型使用统计
   */
  getModelUsageStats(): {
    byRole: Record<
      SlidesRole,
      { calls: number; tokens: number; avgLatency: number }
    >;
    totalCalls: number;
    totalTokens: number;
  } {
    // TODO: 实现统计逻辑，从追踪数据中聚合
    return {
      byRole: {
        architect: { calls: 0, tokens: 0, avgLatency: 0 },
        writer: { calls: 0, tokens: 0, avgLatency: 0 },
        renderer: { calls: 0, tokens: 0, avgLatency: 0 },
        image: { calls: 0, tokens: 0, avgLatency: 0 },
        reviewer: { calls: 0, tokens: 0, avgLatency: 0 },
      },
      totalCalls: 0,
      totalTokens: 0,
    };
  }
}
