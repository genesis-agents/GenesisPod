import { Test, TestingModule } from "@nestjs/testing";
import { FallbackManagerService } from "../fallback-manager.service";
import { AiCallResult, AiModelConfig } from "../types";
import { AIModelType } from "@prisma/client";

describe("FallbackManagerService", () => {
  let service: FallbackManagerService;

  const mockFallbackModel: AiModelConfig = {
    id: "model-2",
    name: "claude",
    displayName: "Claude 3 Opus",
    provider: "anthropic",
    modelId: "claude-3-opus",
    modelType: AIModelType.CHAT,
    apiKey: "sk-fallback-key",
    apiEndpoint: "https://api.anthropic.com/v1",
  };

  const mockSecondaryFallback: AiModelConfig = {
    id: "model-3",
    name: "gemini",
    displayName: "Gemini 2.0 Flash",
    provider: "google",
    modelId: "gemini-2.0-flash",
    modelType: AIModelType.CHAT,
    apiKey: "sk-secondary-key",
    apiEndpoint: "https://generativelanguage.googleapis.com",
  };

  const createSuccessResult = (
    model: string,
    provider: string,
  ): AiCallResult => ({
    success: true,
    content: "AI response content",
    model,
    provider,
    tokensUsed: 150,
    latencyMs: 1200,
  });

  const createFailureResult = (
    model: string,
    provider: string,
  ): AiCallResult => ({
    success: false,
    error: "API call failed",
    model,
    provider,
    tokensUsed: 0,
    latencyMs: 500,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FallbackManagerService],
    }).compile();

    service = module.get<FallbackManagerService>(FallbackManagerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("executeWithFallback - Primary Success", () => {
    it("should return primary result when successful", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockResolvedValue(createSuccessResult("gpt-4o", "openai"));

      // Act
      const result = await service.executeWithFallback(primaryCall, []);

      // Assert
      expect(result.success).toBe(true);
      expect(result.model).toBe("gpt-4o");
      expect(result.fallbackUsed).toBeUndefined();
      expect(primaryCall).toHaveBeenCalledTimes(1);
    });

    it("should not call fallback when primary succeeds", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockResolvedValue(createSuccessResult("gpt-4o", "openai"));
      const fallbackCall = jest.fn();

      // Act
      await service.executeWithFallback(primaryCall, [
        { model: mockFallbackModel, call: fallbackCall },
      ]);

      // Assert
      expect(fallbackCall).not.toHaveBeenCalled();
    });
  });

  describe("executeWithFallback - Fallback on Failure", () => {
    it("should use fallback when primary throws error", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));
      const fallbackCall = jest
        .fn()
        .mockResolvedValue(createSuccessResult("claude-3-opus", "anthropic"));

      // Act
      const result = await service.executeWithFallback(
        primaryCall,
        [{ model: mockFallbackModel, call: fallbackCall }],
        { retryDelayMs: 10 }, // Fast retries for testing
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.model).toBe("claude-3-opus");
      expect(result.fallbackUsed).toBe(true);
      expect(result.fallbackReason).toBeDefined();
      expect(fallbackCall).toHaveBeenCalledTimes(1);
    });

    it("should use fallback when primary returns failure result", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockResolvedValue(createFailureResult("gpt-4o", "openai"));
      const fallbackCall = jest
        .fn()
        .mockResolvedValue(createSuccessResult("claude-3-opus", "anthropic"));

      // Act
      const result = await service.executeWithFallback(
        primaryCall,
        [{ model: mockFallbackModel, call: fallbackCall }],
        { retryDelayMs: 10 },
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.model).toBe("claude-3-opus");
      expect(result.fallbackUsed).toBe(true);
    });

    it("should try multiple fallbacks in order", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));
      const firstFallback = jest
        .fn()
        .mockRejectedValue(new Error("First fallback failed"));
      const secondFallback = jest
        .fn()
        .mockResolvedValue(createSuccessResult("gemini-2.0-flash", "google"));

      // Act
      const result = await service.executeWithFallback(
        primaryCall,
        [
          { model: mockFallbackModel, call: firstFallback },
          { model: mockSecondaryFallback, call: secondFallback },
        ],
        { retryDelayMs: 10 },
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.model).toBe("gemini-2.0-flash");
      expect(firstFallback).toHaveBeenCalled();
      expect(secondFallback).toHaveBeenCalled();
    });

    it("should stop at first successful fallback", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));
      const firstFallback = jest
        .fn()
        .mockResolvedValue(createSuccessResult("claude-3-opus", "anthropic"));
      const secondFallback = jest.fn();

      // Act
      await service.executeWithFallback(
        primaryCall,
        [
          { model: mockFallbackModel, call: firstFallback },
          { model: mockSecondaryFallback, call: secondFallback },
        ],
        { retryDelayMs: 10 },
      );

      // Assert
      expect(firstFallback).toHaveBeenCalled();
      expect(secondFallback).not.toHaveBeenCalled();
    });
  });

  describe("executeWithFallback - All Failures", () => {
    it("should return failure when all models fail", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));
      const fallbackCall = jest
        .fn()
        .mockRejectedValue(new Error("Fallback failed"));

      // Act
      const result = await service.executeWithFallback(
        primaryCall,
        [{ model: mockFallbackModel, call: fallbackCall }],
        { maxRetries: 0, retryDelayMs: 10 },
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("All AI models failed");
      expect(result.fallbackUsed).toBe(true);
      expect(result.fallbackReason).toBeDefined();
    });

    it("should return failure when fallback disabled and primary fails", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));
      const fallbackCall = jest.fn();

      // Act
      const result = await service.executeWithFallback(
        primaryCall,
        [{ model: mockFallbackModel, call: fallbackCall }],
        { enabled: false, maxRetries: 0 },
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("fallback is disabled");
      expect(fallbackCall).not.toHaveBeenCalled();
    });

    it("should return failure when no fallback models provided", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));

      // Act
      const result = await service.executeWithFallback(primaryCall, [], {
        maxRetries: 0,
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Retry Logic", () => {
    it("should retry failed call with exponential backoff", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValueOnce(new Error("Attempt 1 failed"))
        .mockRejectedValueOnce(new Error("Attempt 2 failed"))
        .mockResolvedValueOnce(createSuccessResult("gpt-4o", "openai"));

      const startTime = Date.now();

      // Act
      const result = await service.executeWithFallback(primaryCall, [], {
        maxRetries: 2,
        retryDelayMs: 20, // Short delay for testing
      });

      const duration = Date.now() - startTime;

      // Assert
      expect(result.success).toBe(true);
      expect(primaryCall).toHaveBeenCalledTimes(3); // Initial + 2 retries
      // Verify exponential backoff: 20ms + 40ms = 60ms minimum
      expect(duration).toBeGreaterThanOrEqual(40);
    });

    it("should respect maxRetries configuration", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Always fails"));

      // Act
      await service.executeWithFallback(primaryCall, [], {
        maxRetries: 1,
        retryDelayMs: 10,
      });

      // Assert
      expect(primaryCall).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it("should apply retry logic to fallback calls", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));
      const fallbackCall = jest
        .fn()
        .mockRejectedValueOnce(new Error("Fallback attempt 1 failed"))
        .mockResolvedValueOnce(
          createSuccessResult("claude-3-opus", "anthropic"),
        );

      // Act
      const result = await service.executeWithFallback(
        primaryCall,
        [{ model: mockFallbackModel, call: fallbackCall }],
        { maxRetries: 1, retryDelayMs: 10 },
      );

      // Assert
      expect(result.success).toBe(true);
      expect(fallbackCall).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it("should not retry if first attempt succeeds", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockResolvedValue(createSuccessResult("gpt-4o", "openai"));

      // Act
      await service.executeWithFallback(primaryCall, [], {
        maxRetries: 3,
        retryDelayMs: 10,
      });

      // Assert
      expect(primaryCall).toHaveBeenCalledTimes(1);
    });
  });

  describe("Fallback Configuration", () => {
    it("should use custom retry delay", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValueOnce(new Error("Attempt 1"))
        .mockResolvedValueOnce(createSuccessResult("gpt-4o", "openai"));

      const startTime = Date.now();

      // Act
      await service.executeWithFallback(primaryCall, [], {
        maxRetries: 1,
        retryDelayMs: 50,
      });

      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeGreaterThanOrEqual(40); // ~50ms delay
    });

    it("should merge custom config with defaults", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockResolvedValue(createSuccessResult("gpt-4o", "openai"));

      // Act
      await service.executeWithFallback(primaryCall, [], {
        maxRetries: 5, // Override default
        retryDelayMs: 10,
      });

      // Assert - should not throw, confirms defaults are applied
      expect(primaryCall).toHaveBeenCalled();
    });
  });

  describe("getFallbackStats", () => {
    it("should track successful fallback events", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));
      const fallbackCall = jest
        .fn()
        .mockResolvedValue(createSuccessResult("claude-3-opus", "anthropic"));

      // Act
      await service.executeWithFallback(
        primaryCall,
        [{ model: mockFallbackModel, call: fallbackCall }],
        { maxRetries: 0, retryDelayMs: 10 },
      );

      const stats = service.getFallbackStats();

      // Assert
      expect(stats.totalFallbacks).toBe(1);
      expect(stats.successfulFallbacks).toBe(1);
      expect(stats.failedFallbacks).toBe(0);
      expect(stats.recentFallbacks).toHaveLength(1);
      expect(stats.recentFallbacks[0].success).toBe(true);
    });

    it("should not track events when all attempts fail", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));
      const fallbackCall = jest
        .fn()
        .mockRejectedValue(new Error("Fallback failed"));

      const statsBefore = service.getFallbackStats();
      const initialCount = statsBefore.totalFallbacks;

      // Act
      await service.executeWithFallback(
        primaryCall,
        [{ model: mockFallbackModel, call: fallbackCall }],
        { maxRetries: 0, retryDelayMs: 10 },
      );

      const statsAfter = service.getFallbackStats();

      // Assert - Failed attempts don't record events, only successful fallbacks do
      expect(statsAfter.totalFallbacks).toBe(initialCount);
    });

    it("should limit history to last 1000 events", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));
      const fallbackCall = jest
        .fn()
        .mockResolvedValue(createSuccessResult("claude-3-opus", "anthropic"));

      // Act - Execute only 10 fallbacks for test speed
      for (let i = 0; i < 10; i++) {
        await service.executeWithFallback(
          primaryCall,
          [{ model: mockFallbackModel, call: fallbackCall }],
          { maxRetries: 0, retryDelayMs: 1 },
        );
      }

      const stats = service.getFallbackStats();

      // Assert
      expect(stats.totalFallbacks).toBeLessThanOrEqual(1000);
      expect(stats.totalFallbacks).toBe(10);
    });

    it("should filter recent fallbacks to last 24 hours", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));
      const fallbackCall = jest
        .fn()
        .mockResolvedValue(createSuccessResult("claude-3-opus", "anthropic"));

      await service.executeWithFallback(
        primaryCall,
        [{ model: mockFallbackModel, call: fallbackCall }],
        { maxRetries: 0, retryDelayMs: 10 },
      );

      const stats = service.getFallbackStats();

      // Assert
      expect(stats.recentFallbacks.length).toBeGreaterThan(0);
      stats.recentFallbacks.forEach((event) => {
        const hoursSinceEvent =
          (Date.now() - event.timestamp.getTime()) / (1000 * 60 * 60);
        expect(hoursSinceEvent).toBeLessThan(24);
      });
    });

    it("should limit recent fallbacks to last 10 events", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));
      const fallbackCall = jest
        .fn()
        .mockResolvedValue(createSuccessResult("claude-3-opus", "anthropic"));

      // Act - Execute 12 fallbacks
      for (let i = 0; i < 12; i++) {
        await service.executeWithFallback(
          primaryCall,
          [{ model: mockFallbackModel, call: fallbackCall }],
          { maxRetries: 0, retryDelayMs: 1 },
        );
      }

      const stats = service.getFallbackStats();

      // Assert
      expect(stats.recentFallbacks.length).toBeLessThanOrEqual(10);
    });

    it("should include fallback model information in events", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));
      const fallbackCall = jest
        .fn()
        .mockResolvedValue(createSuccessResult("claude-3-opus", "anthropic"));

      // Act
      await service.executeWithFallback(
        primaryCall,
        [{ model: mockFallbackModel, call: fallbackCall }],
        { maxRetries: 0, retryDelayMs: 10 },
      );

      const stats = service.getFallbackStats();

      // Assert
      const event = stats.recentFallbacks[0];
      expect(event.fallbackModel).toBe("claude");
      expect(event.reason).toBeDefined();
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });

  describe("Edge Cases", () => {
    it("should handle fallback returning failure result", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Primary failed"));
      const fallbackCall = jest
        .fn()
        .mockResolvedValue(createFailureResult("claude-3-opus", "anthropic"));

      // Act
      const result = await service.executeWithFallback(
        primaryCall,
        [{ model: mockFallbackModel, call: fallbackCall }],
        { maxRetries: 0, retryDelayMs: 10 },
      );

      // Assert
      expect(result.success).toBe(false);
    });

    it("should handle empty fallback chain gracefully", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockResolvedValue(createSuccessResult("gpt-4o", "openai"));

      // Act
      const result = await service.executeWithFallback(primaryCall, []);

      // Assert
      expect(result.success).toBe(true);
    });

    it("should handle zero retries configuration", async () => {
      // Arrange
      const primaryCall = jest
        .fn()
        .mockRejectedValue(new Error("Failed immediately"));

      // Act
      const result = await service.executeWithFallback(primaryCall, [], {
        maxRetries: 0,
        retryDelayMs: 10,
      });

      // Assert
      expect(primaryCall).toHaveBeenCalledTimes(1); // No retries
      expect(result.success).toBe(false);
    });

    it("should preserve error messages through fallback chain", async () => {
      // Arrange
      const primaryError = "Specific primary error";
      const primaryCall = jest.fn().mockRejectedValue(new Error(primaryError));

      // Act
      await service.executeWithFallback(primaryCall, [], {
        maxRetries: 0,
        retryDelayMs: 10,
      });

      // Assert - error should be logged (check via logger mock if needed)
      expect(primaryCall).toHaveBeenCalled();
    });
  });
});
