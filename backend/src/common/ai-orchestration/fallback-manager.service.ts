/**
 * Fallback Manager Service
 *
 * AI 调用降级管理服务，负责：
 * 1. 自动重试失败的请求
 * 2. 在主模型失败时切换到备用模型
 * 3. 实现指数退避策略
 * 4. 记录降级历史供分析
 */

import { Injectable, Logger } from "@nestjs/common";
import { FallbackConfig, AiCallResult, AiModelConfig } from "./types";

/**
 * 降级事件记录
 */
interface FallbackEvent {
  timestamp: Date;
  originalModel: string;
  fallbackModel: string;
  reason: string;
  success: boolean;
}

@Injectable()
export class FallbackManagerService {
  private readonly logger = new Logger(FallbackManagerService.name);

  // 降级事件历史（用于分析和监控）
  private fallbackHistory: FallbackEvent[] = [];
  private readonly maxHistorySize = 1000;

  /**
   * 默认降级配置
   */
  private defaultConfig: FallbackConfig = {
    enabled: true,
    maxRetries: 2,
    retryDelayMs: 1000,
  };

  /**
   * 执行带降级的 AI 调用
   *
   * @param primaryCall 主要调用函数
   * @param fallbackModels 降级模型列表
   * @param config 降级配置
   */
  async executeWithFallback<T extends AiCallResult>(
    primaryCall: () => Promise<T>,
    fallbackCalls: Array<{
      model: AiModelConfig;
      call: () => Promise<T>;
    }>,
    config?: Partial<FallbackConfig>,
  ): Promise<T> {
    const finalConfig = { ...this.defaultConfig, ...config };

    // 1. 尝试主要调用
    try {
      const result = await this.executeWithRetry(primaryCall, finalConfig);
      if (result.success) {
        return result;
      }
      // 如果返回了失败结果但没有抛出异常，继续尝试降级
      this.logger.warn(`Primary call returned failure: ${result.error}`);
    } catch (error) {
      this.logger.warn(`Primary call threw error: ${error}`);
    }

    // 2. 如果降级未启用，返回错误
    if (!finalConfig.enabled || fallbackCalls.length === 0) {
      return {
        success: false,
        error: "Primary AI call failed and fallback is disabled",
        model: "unknown",
        provider: "unknown",
        tokensUsed: 0,
        latencyMs: 0,
      } as T;
    }

    // 3. 尝试降级模型
    for (const fallback of fallbackCalls) {
      this.logger.log(
        `[Fallback] Trying fallback model: ${fallback.model.name} (${fallback.model.provider})`,
      );

      try {
        const result = await this.executeWithRetry(fallback.call, finalConfig);

        if (result.success) {
          // 记录降级事件
          this.recordFallbackEvent({
            timestamp: new Date(),
            originalModel: "primary",
            fallbackModel: fallback.model.name,
            reason: "Primary model failed",
            success: true,
          });

          // 标记使用了降级
          result.fallbackUsed = true;
          result.fallbackReason = "Primary model failed, using fallback";

          this.logger.log(
            `[Fallback] Success with fallback model: ${fallback.model.name}`,
          );

          return result;
        }
      } catch (error) {
        this.logger.warn(
          `[Fallback] Fallback model ${fallback.model.name} failed: ${error}`,
        );
        continue;
      }
    }

    // 4. 所有模型都失败
    this.logger.error("[Fallback] All models failed");

    return {
      success: false,
      error: "All AI models failed (primary and fallbacks)",
      model: "unknown",
      provider: "unknown",
      tokensUsed: 0,
      latencyMs: 0,
      fallbackUsed: true,
      fallbackReason: "All fallback models exhausted",
    } as T;
  }

  /**
   * 执行带重试的调用
   */
  private async executeWithRetry<T extends AiCallResult>(
    call: () => Promise<T>,
    config: FallbackConfig,
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = config.retryDelayMs;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.logger.debug(
            `[Retry] Attempt ${attempt + 1}/${config.maxRetries + 1}`,
          );
          await this.sleep(delay);
          delay *= 2; // 指数退避
        }

        const result = await call();
        return result;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `[Retry] Attempt ${attempt + 1} failed: ${lastError.message}`,
        );
      }
    }

    // 所有重试都失败
    throw lastError || new Error("All retry attempts failed");
  }

  /**
   * 记录降级事件
   */
  private recordFallbackEvent(event: FallbackEvent): void {
    this.fallbackHistory.push(event);

    // 限制历史记录大小
    if (this.fallbackHistory.length > this.maxHistorySize) {
      this.fallbackHistory = this.fallbackHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * 获取降级统计
   */
  getFallbackStats(): {
    totalFallbacks: number;
    successfulFallbacks: number;
    failedFallbacks: number;
    recentFallbacks: FallbackEvent[];
  } {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentFallbacks = this.fallbackHistory.filter(
      (e) => e.timestamp > last24Hours,
    );

    return {
      totalFallbacks: this.fallbackHistory.length,
      successfulFallbacks: this.fallbackHistory.filter((e) => e.success).length,
      failedFallbacks: this.fallbackHistory.filter((e) => !e.success).length,
      recentFallbacks: recentFallbacks.slice(-10),
    };
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
