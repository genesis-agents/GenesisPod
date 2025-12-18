/**
 * Retry Strategy
 * 工具执行重试策略 - 指数退避、降级处理
 */

import { Logger } from "@nestjs/common";
import { ToolType } from "./agent.types";

// ============================================================================
// Types
// ============================================================================

/**
 * 工具错误类型
 */
export enum ToolErrorType {
  // 可重试错误
  RATE_LIMIT = "RATE_LIMIT", // API 限流
  TIMEOUT = "TIMEOUT", // 超时
  NETWORK_ERROR = "NETWORK_ERROR", // 网络错误
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE", // 服务不可用

  // 需要降级/替代的错误
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED", // 配额用尽
  FEATURE_NOT_SUPPORTED = "FEATURE_NOT_SUPPORTED", // 功能不支持

  // 不可恢复错误
  INVALID_INPUT = "INVALID_INPUT", // 输入无效
  PERMISSION_DENIED = "PERMISSION_DENIED", // 权限拒绝
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND", // 资源不存在
  UNKNOWN = "UNKNOWN", // 未知错误
}

/**
 * 工具错误
 */
export interface ToolError {
  type: ToolErrorType;
  toolType: ToolType;
  message: string;
  originalError?: Error;
  retryable: boolean;
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /**
   * 最大重试次数
   */
  maxRetries: number;

  /**
   * 初始延迟（毫秒）
   */
  initialDelay: number;

  /**
   * 最大延迟（毫秒）
   */
  maxDelay: number;

  /**
   * 退避倍数
   */
  backoffMultiplier: number;

  /**
   * 是否添加抖动
   */
  jitter: boolean;
}

/**
 * 重试结果
 */
export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: ToolError;
  attempts: number;
  totalDuration: number;
}

// ============================================================================
// Retry Strategy
// ============================================================================

/**
 * 重试策略
 */
export class RetryStrategy {
  private readonly logger = new Logger(RetryStrategy.name);
  private readonly config: RetryConfig;

  /**
   * 默认配置
   */
  static readonly DEFAULT_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelay: 1000, // 1 秒
    maxDelay: 30000, // 30 秒
    backoffMultiplier: 2,
    jitter: true,
  };

  /**
   * 工具降级映射
   */
  private static readonly FALLBACK_TOOLS: Partial<
    Record<ToolType, ToolType | null>
  > = {
    // 目前没有定义降级，可以根据需要添加
  };

  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...RetryStrategy.DEFAULT_CONFIG, ...config };
  }

  /**
   * 执行带重试的操作
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    toolType: ToolType,
    operationName?: string,
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: ToolError | undefined;
    let attempts = 0;

    while (attempts <= this.config.maxRetries) {
      attempts++;

      try {
        const result = await operation();
        return {
          success: true,
          data: result,
          attempts,
          totalDuration: Date.now() - startTime,
        };
      } catch (error) {
        const toolError = this.classifyError(error, toolType);
        lastError = toolError;

        this.logger.warn(
          `[${operationName || toolType}] Attempt ${attempts} failed: ${toolError.message}`,
        );

        // 检查是否应该重试
        if (!this.shouldRetry(toolError, attempts)) {
          break;
        }

        // 计算延迟
        const delay = this.getDelay(attempts);
        this.logger.log(
          `[${operationName || toolType}] Retrying in ${delay}ms...`,
        );

        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError,
      attempts,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * 判断是否应该重试
   */
  shouldRetry(error: ToolError, attempt: number): boolean {
    // 超过最大重试次数 (attempt > maxRetries means we've done all retries)
    if (attempt > this.config.maxRetries) {
      return false;
    }

    // 检查错误是否可重试
    return error.retryable;
  }

  /**
   * 计算重试延迟（指数退避 + 抖动）
   */
  getDelay(attempt: number): number {
    // 指数退避
    let delay =
      this.config.initialDelay *
      Math.pow(this.config.backoffMultiplier, attempt - 1);

    // 限制最大延迟
    delay = Math.min(delay, this.config.maxDelay);

    // 添加抖动（±25%）
    if (this.config.jitter) {
      const jitterFactor = 0.75 + Math.random() * 0.5;
      delay = Math.floor(delay * jitterFactor);
    }

    return delay;
  }

  /**
   * 获取降级工具
   */
  getFallback(toolType: ToolType): ToolType | null {
    return RetryStrategy.FALLBACK_TOOLS[toolType] || null;
  }

  /**
   * 分类错误类型
   */
  classifyError(error: unknown, toolType: ToolType): ToolError {
    const err = error instanceof Error ? error : new Error(String(error));
    const message = err.message.toLowerCase();

    // 根据错误消息分类
    let errorType = ToolErrorType.UNKNOWN;
    let retryable = false;

    if (message.includes("rate limit") || message.includes("429")) {
      errorType = ToolErrorType.RATE_LIMIT;
      retryable = true;
    } else if (message.includes("timeout") || message.includes("timed out")) {
      errorType = ToolErrorType.TIMEOUT;
      retryable = true;
    } else if (
      message.includes("network") ||
      message.includes("econnrefused") ||
      message.includes("enotfound")
    ) {
      errorType = ToolErrorType.NETWORK_ERROR;
      retryable = true;
    } else if (
      message.includes("503") ||
      message.includes("service unavailable")
    ) {
      errorType = ToolErrorType.SERVICE_UNAVAILABLE;
      retryable = true;
    } else if (
      message.includes("quota") ||
      message.includes("limit exceeded")
    ) {
      errorType = ToolErrorType.QUOTA_EXCEEDED;
      retryable = false;
    } else if (
      message.includes("invalid") ||
      message.includes("validation") ||
      message.includes("400")
    ) {
      errorType = ToolErrorType.INVALID_INPUT;
      retryable = false;
    } else if (
      message.includes("permission") ||
      message.includes("unauthorized") ||
      message.includes("403")
    ) {
      errorType = ToolErrorType.PERMISSION_DENIED;
      retryable = false;
    } else if (message.includes("not found") || message.includes("404")) {
      errorType = ToolErrorType.RESOURCE_NOT_FOUND;
      retryable = false;
    }

    return {
      type: errorType,
      toolType,
      message: err.message,
      originalError: err,
      retryable,
    };
  }

  /**
   * 睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Retry Decorator (可选，用于方法装饰)
// ============================================================================

/**
 * 重试装饰器选项
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
}

/**
 * 创建重试装饰器
 */
export function WithRetry(options?: RetryOptions) {
  return function (
    _target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const strategy = new RetryStrategy(options);

    descriptor.value = async function (...args: any[]) {
      const result = await strategy.executeWithRetry(
        () => originalMethod.apply(this, args),
        ToolType.DATA_FETCH, // 默认类型
        propertyKey,
      );

      if (!result.success) {
        throw result.error?.originalError || new Error(result.error?.message);
      }

      return result.data;
    };

    return descriptor;
  };
}
