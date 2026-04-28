import { Injectable, Logger } from "@nestjs/common";
import { AIErrorClassifier, AIError } from "../abstractions/error-classifier";

/**
 * AI Chat Retry Service
 * 职责：API 调用重试、错误分类、降级处理
 */
@Injectable()
export class AiChatRetryService {
  private readonly logger = new Logger(AiChatRetryService.name);
  private readonly errorClassifier = new AIErrorClassifier();

  // Retry configuration
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [1000, 2000, 4000]; // ms

  /**
   * Sleep 工具方法
   */
  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 分类错误并决定是否可重试
   */
  classifyError(error: unknown): {
    isRetriable: boolean;
    category: string;
    message: string;
  } {
    const err = error as Record<string, unknown>;
    const errorMessage = (err?.message as string) || String(error);

    // 使用 AIErrorClassifier 分类错误
    const aiError: AIError = this.errorClassifier.classify(error);

    return {
      isRetriable: aiError.isRetryable(),
      category: aiError.type,
      message: aiError.message || errorMessage,
    };
  }

  /**
   * 带重试的执行函数
   * @param fn 要执行的异步函数
   * @param options 重试选项
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      retryDelays?: number[];
      onRetry?: (attempt: number, error: unknown) => void;
      context?: string;
    } = {},
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? this.MAX_RETRIES;
    const retryDelays = options.retryDelays ?? this.RETRY_DELAYS;
    const context = options.context || "API call";

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // 最后一次尝试，不再重试
        if (attempt >= maxRetries) {
          break;
        }

        // 分类错误
        const classification = this.classifyError(error);

        // 如果错误不可重试，直接抛出
        if (!classification.isRetriable) {
          this.logger.warn(
            `[executeWithRetry] ${context} failed with non-retriable error: ${classification.category}`,
          );
          throw error;
        }

        // 记录重试
        const delay =
          retryDelays[attempt] || retryDelays[retryDelays.length - 1];
        this.logger.warn(
          `[executeWithRetry] ${context} attempt ${attempt + 1}/${maxRetries} failed (${classification.category}), retrying in ${delay}ms...`,
        );

        // 调用回调
        if (options.onRetry) {
          options.onRetry(attempt, error);
        }

        // 等待后重试
        await this.sleep(delay);
      }
    }

    // 所有重试都失败了
    this.logger.error(
      `[executeWithRetry] ${context} failed after ${maxRetries} retries`,
    );
    throw lastError;
  }

  /**
   * 验证 AI 服务可用性
   */
  async validateAIServiceAvailability(model?: string): Promise<void> {
    // TODO: 实现服务可用性检查逻辑
    // 例如：检查 API Key 是否配置，检查网络连接等
    const modelInfo = model ? ` for model ${model}` : "";
    this.logger.debug(`[validateAIServiceAvailability] Checking${modelInfo}`);

    // 如果服务不可用，抛出异常
    // throw new AiServiceUnavailableError(`AI service is unavailable${modelInfo}`);
  }

  /**
   * 构建错误响应（用于非严格模式）
   */
  buildErrorResponse(
    error: unknown,
    model: string,
  ): {
    content: string;
    tokensUsed: number;
    model: string;
    isError: boolean;
  } {
    const classification = this.classifyError(error);

    let errorMessage = `AI 服务调用失败 (${model})`;

    if (classification.category === "RATE_LIMIT") {
      errorMessage = `API 调用频率限制，请稍后重试`;
    } else if (classification.category === "TIMEOUT") {
      errorMessage = `API 调用超时，请重试或使用更小的输入`;
    } else if (classification.category === "INVALID_REQUEST") {
      errorMessage = `请求参数错误: ${classification.message}`;
    } else if (classification.category === "INVALID_API_KEY") {
      errorMessage = `API Key 未配置或无效`;
    } else if (classification.message) {
      errorMessage = `${errorMessage}: ${classification.message}`;
    }

    return {
      content: errorMessage,
      tokensUsed: 0,
      model,
      isError: true,
    };
  }

  /**
   * 指数退避重试（含 provider 上下文）
   * 替代各服务中重复的私有 withRetry 方法，统一策略：
   * - 延迟 = baseRetryDelay * 2^(attempt-1) + random(0~500ms) jitter
   * - 不可重试错误立即抛出
   */
  async withExponentialBackoff<T>(
    operation: () => Promise<T>,
    operationName: string,
    provider?: string,
  ): Promise<T> {
    const maxRetries = this.MAX_RETRIES;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const aiError: AIError = this.errorClassifier.classify(error, provider);
        lastError = aiError;

        this.logger.warn(
          `[${operationName}] Attempt ${attempt}/${maxRetries} failed: ${aiError.message} (type: ${aiError.type})`,
        );

        if (aiError.isRetryable() && attempt < maxRetries) {
          const delay =
            aiError.getRetryDelay() * Math.pow(2, attempt - 1) +
            Math.random() * 500;
          this.logger.debug(
            `[${operationName}] Retrying in ${Math.round(delay)}ms...`,
          );
          await this.sleep(delay);
          continue;
        }

        this.logger.error(
          `[${operationName}] ${aiError.isRetryable() ? "Max retries exceeded" : "Non-retryable error"}: ${aiError.message}`,
        );
        throw aiError;
      }
    }

    throw lastError || new Error(`${operationName} failed after all retries`);
  }

  /**
   * 处理 API 错误（根据严格模式决定抛出异常还是返回错误响应）
   */
  handleApiError(
    error: unknown,
    model: string,
    strictMode: boolean = false,
  ): {
    content: string;
    tokensUsed: number;
    model: string;
    isError: boolean;
  } {
    const classification = this.classifyError(error);

    this.logger.error(
      `[handleApiError] ${model} API call failed: ${classification.category} - ${classification.message}`,
    );

    // 严格模式下直接抛出异常
    if (strictMode) {
      throw error;
    }

    // 非严格模式返回错误响应
    return this.buildErrorResponse(error, model);
  }
}
