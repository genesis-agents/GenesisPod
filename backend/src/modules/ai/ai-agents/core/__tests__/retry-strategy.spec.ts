/**
 * Retry Strategy Tests
 */

import { RetryStrategy, ToolErrorType } from "../execution/retry-strategy";
import { ToolType } from "../agent/agent.types";

describe("RetryStrategy", () => {
  let strategy: RetryStrategy;

  beforeEach(() => {
    strategy = new RetryStrategy();
  });

  describe("默认配置", () => {
    it("should have correct default config", () => {
      expect(RetryStrategy.DEFAULT_CONFIG).toEqual({
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: true,
      });
    });
  });

  describe("错误分类", () => {
    it("should classify rate limit errors as retryable", () => {
      const error = new Error("Rate limit exceeded 429");
      const classified = strategy.classifyError(error, ToolType.WEB_SEARCH);

      expect(classified.type).toBe(ToolErrorType.RATE_LIMIT);
      expect(classified.retryable).toBe(true);
    });

    it("should classify timeout errors as retryable", () => {
      const error = new Error("Request timed out");
      const classified = strategy.classifyError(error, ToolType.WEB_SCRAPER);

      expect(classified.type).toBe(ToolErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });

    it("should classify network errors as retryable", () => {
      const error = new Error("ECONNREFUSED connection refused");
      const classified = strategy.classifyError(error, ToolType.DATA_FETCH);

      expect(classified.type).toBe(ToolErrorType.NETWORK_ERROR);
      expect(classified.retryable).toBe(true);
    });

    it("should classify 503 service unavailable as retryable", () => {
      const error = new Error("503 Service Unavailable");
      const classified = strategy.classifyError(error, ToolType.WEB_SEARCH);

      expect(classified.type).toBe(ToolErrorType.SERVICE_UNAVAILABLE);
      expect(classified.retryable).toBe(true);
    });

    it("should classify invalid input as non-retryable", () => {
      const error = new Error("Invalid input: validation failed");
      const classified = strategy.classifyError(
        error,
        ToolType.TEXT_GENERATION,
      );

      expect(classified.type).toBe(ToolErrorType.INVALID_INPUT);
      expect(classified.retryable).toBe(false);
    });

    it("should classify permission denied as non-retryable", () => {
      const error = new Error("403 Permission denied");
      const classified = strategy.classifyError(error, ToolType.DATA_FETCH);

      expect(classified.type).toBe(ToolErrorType.PERMISSION_DENIED);
      expect(classified.retryable).toBe(false);
    });

    it("should classify resource not found as non-retryable", () => {
      const error = new Error("404 Resource not found");
      const classified = strategy.classifyError(error, ToolType.WEB_SCRAPER);

      expect(classified.type).toBe(ToolErrorType.RESOURCE_NOT_FOUND);
      expect(classified.retryable).toBe(false);
    });

    it("should classify unknown errors as non-retryable", () => {
      const error = new Error("Some random error");
      const classified = strategy.classifyError(
        error,
        ToolType.CODE_GENERATION,
      );

      expect(classified.type).toBe(ToolErrorType.UNKNOWN);
      expect(classified.retryable).toBe(false);
    });
  });

  describe("延迟计算", () => {
    it("should calculate exponential backoff delay", () => {
      // 使用无抖动的策略来测试
      const noJitterStrategy = new RetryStrategy({
        initialDelay: 1000,
        backoffMultiplier: 2,
        jitter: false,
      });

      expect(noJitterStrategy.getDelay(1)).toBe(1000);
      expect(noJitterStrategy.getDelay(2)).toBe(2000);
      expect(noJitterStrategy.getDelay(3)).toBe(4000);
    });

    it("should cap delay at maxDelay", () => {
      const strategy = new RetryStrategy({
        initialDelay: 1000,
        maxDelay: 5000,
        backoffMultiplier: 10,
        jitter: false,
      });

      expect(strategy.getDelay(3)).toBe(5000);
    });

    it("should add jitter when enabled", () => {
      const jitterStrategy = new RetryStrategy({
        initialDelay: 1000,
        backoffMultiplier: 2,
        jitter: true,
      });

      const delays: number[] = [];
      for (let i = 0; i < 10; i++) {
        delays.push(jitterStrategy.getDelay(1));
      }

      // 应该有不同的值（抖动效果）
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);

      // 应该在合理范围内（±25%）
      delays.forEach((d) => {
        expect(d).toBeGreaterThanOrEqual(750);
        expect(d).toBeLessThanOrEqual(1250);
      });
    });
  });

  describe("重试执行", () => {
    it("should succeed on first try", async () => {
      const operation = jest.fn().mockResolvedValue("success");

      const result = await strategy.executeWithRetry(
        operation,
        ToolType.WEB_SEARCH,
        "test-operation",
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe("success");
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should retry on retryable errors", async () => {
      const fastStrategy = new RetryStrategy({
        maxRetries: 3,
        initialDelay: 10, // 快速测试
        backoffMultiplier: 1,
        jitter: false,
      });

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("Rate limit 429"))
        .mockRejectedValueOnce(new Error("Rate limit 429"))
        .mockResolvedValue("success");

      const result = await fastStrategy.executeWithRetry(
        operation,
        ToolType.WEB_SEARCH,
        "test-operation",
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe("success");
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it("should not retry non-retryable errors", async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error("Invalid input validation"));

      const result = await strategy.executeWithRetry(
        operation,
        ToolType.TEXT_GENERATION,
        "test-operation",
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe(ToolErrorType.INVALID_INPUT);
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should fail after max retries", async () => {
      const fastStrategy = new RetryStrategy({
        maxRetries: 2,
        initialDelay: 10,
        backoffMultiplier: 1,
        jitter: false,
      });

      const operation = jest
        .fn()
        .mockRejectedValue(new Error("Service unavailable 503"));

      const result = await fastStrategy.executeWithRetry(
        operation,
        ToolType.WEB_SEARCH,
        "test-operation",
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3); // 1 initial + 2 retries
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe("shouldRetry", () => {
    it("should return false when max retries reached", () => {
      const error = {
        type: ToolErrorType.RATE_LIMIT,
        toolType: ToolType.WEB_SEARCH,
        message: "test",
        retryable: true,
      };

      // Default maxRetries is 3, meaning 1 initial + 3 retries = 4 total attempts
      // After 4th attempt, shouldRetry returns false
      expect(strategy.shouldRetry(error, 4)).toBe(false);
      // On 3rd attempt, still can retry
      expect(strategy.shouldRetry(error, 3)).toBe(true);
    });

    it("should return false for non-retryable errors", () => {
      const error = {
        type: ToolErrorType.INVALID_INPUT,
        toolType: ToolType.WEB_SEARCH,
        message: "test",
        retryable: false,
      };

      expect(strategy.shouldRetry(error, 1)).toBe(false);
    });

    it("should return true for retryable errors under limit", () => {
      const error = {
        type: ToolErrorType.RATE_LIMIT,
        toolType: ToolType.WEB_SEARCH,
        message: "test",
        retryable: true,
      };

      expect(strategy.shouldRetry(error, 1)).toBe(true);
    });
  });
});
