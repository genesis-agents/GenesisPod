/**
 * Retry Utilities
 *
 * 重试相关的工具函数
 * 从 team-mission.service.ts 提取，便于复用
 */

import { Logger } from "@nestjs/common";
import { RETRY_CONFIG } from "../config/mission.config";

const logger = new Logger("RetryUtils");

/**
 * 检查错误是否可重试
 *
 * 可重试：网络超时、5xx 错误、连接问题
 * 不可重试：上下文过大、认证错误、无效请求（4xx）
 */
export function isRetryableError(errorMsg: string): boolean {
  // 先检查不可重试的错误（优先级更高）
  for (const pattern of RETRY_CONFIG.nonRetryablePatterns) {
    if (pattern.test(errorMsg)) {
      logger.debug(
        `[isRetryableError] Non-retryable error detected: ${errorMsg}`,
      );
      return false;
    }
  }

  // 检查可重试的错误
  for (const pattern of RETRY_CONFIG.retryablePatterns) {
    if (pattern.test(errorMsg)) {
      logger.debug(`[isRetryableError] Retryable error detected: ${errorMsg}`);
      return true;
    }
  }

  // 默认：重试（大多数未知错误是临时性的）
  return true;
}

/**
 * 检查是否是 Rate Limit 错误
 * Rate Limit 错误需要特殊处理：不重试，但可以切换 Agent
 */
export function isRateLimitError(errorMsg: string): boolean {
  const rateLimitPatterns = [
    /rate.?limit/i,
    /too many requests/i,
    /429/,
    /quota/i,
  ];
  return rateLimitPatterns.some((pattern) => pattern.test(errorMsg));
}

/**
 * 检查是否是永久性错误（不能通过切换 Agent 解决）
 * 如：上下文过大、认证错误、无效请求等
 */
export function isPermanentError(errorMsg: string): boolean {
  const permanentPatterns = [
    /context.*(too large|overflow|exceed)/i,
    /token.*(limit|exceed|max)/i,
    /invalid.*(request|api.?key|model)/i,
    /authentication/i,
    /authorization/i,
    /forbidden/i,
    /not found/i,
    /model.*not.*available/i,
    /content.*policy/i,
    /403/,
    /401/,
    /404/,
  ];
  return permanentPatterns.some((pattern) => pattern.test(errorMsg));
}

/**
 * 检查内容是否包含API错误信息
 * 用于识别那些虽然请求成功但内容实际上是错误的情况
 */
export function isApiErrorContent(content: string): boolean {
  if (!content) return false;

  const errorPatterns = [
    /API Error[:：]/i,
    /Rate limit exceeded/i,
    /Please check your API key/i,
    /请检查.*API/,
    /Provider[:：]\s*\w+\s*Model[:：]/i, // "Provider: xAI\nModel: grok-3" 这种格式
    /\[修订失败\]/,
    /\[任务执行失败\]/,
    /ECONNREFUSED/,
    /ETIMEDOUT/,
    /500 Internal Server Error/i,
    /503 Service Unavailable/i,
    /quota exceeded/i,
    /insufficient.*quota/i,
  ];

  for (const pattern of errorPatterns) {
    if (pattern.test(content)) {
      logger.debug(
        `[isApiErrorContent] API error pattern detected: ${pattern}`,
      );
      return true;
    }
  }

  // 检查内容是否过短且不像正常内容（API错误通常很短）
  const trimmedContent = content.trim();
  if (
    trimmedContent.length < 100 &&
    (trimmedContent.includes("Error") || trimmedContent.includes("错误"))
  ) {
    return true;
  }

  return false;
}

/**
 * 计算指数退避延迟
 */
export function calculateBackoffDelay(
  attempt: number,
  config = RETRY_CONFIG,
): number {
  const delay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelayMs,
  );
  // 添加 10% 的随机抖动
  const jitter = delay * 0.1 * Math.random();
  return Math.floor(delay + jitter);
}

/**
 * 睡眠指定毫秒数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带重试的异步操作执行器
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: {
    maxRetries?: number;
    onRetry?: (attempt: number, error: Error) => void;
    shouldRetry?: (error: Error) => boolean;
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? RETRY_CONFIG.maxRetries;
  const shouldRetry =
    options?.shouldRetry ?? ((e) => isRetryableError(e.message));

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries && shouldRetry(lastError)) {
        const delay = calculateBackoffDelay(attempt);
        logger.warn(
          `[withRetry] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`,
        );
        options?.onRetry?.(attempt, lastError);
        await sleep(delay);
      } else {
        break;
      }
    }
  }

  throw lastError;
}
