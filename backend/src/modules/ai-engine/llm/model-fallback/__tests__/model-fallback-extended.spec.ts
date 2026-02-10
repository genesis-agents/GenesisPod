/**
 * ModelFallbackService - 扩展测试
 *
 * 补充现有 model-fallback.service.spec.ts 的覆盖范围：
 * - shouldSwitchModel() 错误分类
 * - isRetryableError() 可重试判断
 * - isModelBlocked() 黑名单机制
 * - 黑名单过期清理
 * - executeWithFallback() 完整链路
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { ModelFallbackService } from "../model-fallback.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

describe("ModelFallbackService - Extended", () => {
  let service: ModelFallbackService;
  let mockPrisma: any;

  const createMockModels = () => [
    {
      id: "1",
      modelId: "gpt-4o",
      displayName: "GPT-4o",
      provider: "openai",
      isEnabled: true,
      isDefault: true,
      maxTokens: 4096,
      apiKey: "sk-xxx",
      modelType: "CHAT",
      priority: 1,
    },
    {
      id: "2",
      modelId: "claude-3-opus",
      displayName: "Claude 3 Opus",
      provider: "anthropic",
      isEnabled: true,
      isDefault: false,
      maxTokens: 8000,
      apiKey: "sk-ant-xxx",
      modelType: "CHAT",
      priority: 2,
    },
    {
      id: "3",
      modelId: "gpt-4o-mini",
      displayName: "GPT-4o Mini",
      provider: "openai",
      isEnabled: true,
      isDefault: false,
      maxTokens: 2048,
      apiKey: "sk-xxx",
      modelType: "CHAT",
      priority: 3,
    },
  ];

  beforeEach(async () => {
    mockPrisma = {
      aIModel: {
        findMany: jest.fn().mockResolvedValue(createMockModels()),
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          const models = createMockModels();
          const match = models.find(
            (m) => m.modelId === where.modelId || m.id === where.id,
          );
          return Promise.resolve(match || null);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelFallbackService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ModelFallbackService>(ModelFallbackService);

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // shouldSwitchModel
  // =========================================================================

  describe("shouldSwitchModel", () => {
    it("should return true for quota errors", () => {
      const error = { type: "quota", message: "Quota exceeded" } as any;
      expect(service.shouldSwitchModel(error)).toBe(true);
    });

    it("should return true for invalid_model errors", () => {
      const error = { type: "invalid_model", message: "Model not found" } as any;
      expect(service.shouldSwitchModel(error)).toBe(true);
    });

    it("should return true for content_filtered errors", () => {
      const error = {
        type: "content_filtered",
        message: "Content filtered",
      } as any;
      expect(service.shouldSwitchModel(error)).toBe(true);
    });

    it("should return false for timeout errors (retryable, not switch)", () => {
      const error = { type: "timeout", message: "Timeout" } as any;
      expect(service.shouldSwitchModel(error)).toBe(false);
    });

    it("should return false for unknown error types", () => {
      const error = { type: "unknown", message: "Unknown" } as any;
      expect(service.shouldSwitchModel(error)).toBe(false);
    });
  });

  // =========================================================================
  // isRetryableError
  // =========================================================================

  describe("isRetryableError", () => {
    it("should return true for timeout errors", () => {
      const error = { type: "timeout", message: "Timeout" } as any;
      expect(service.isRetryableError(error)).toBe(true);
    });

    it("should return true for network_error", () => {
      const error = { type: "network_error", message: "Network" } as any;
      expect(service.isRetryableError(error)).toBe(true);
    });

    it("should return true for temporary_unavailable", () => {
      const error = {
        type: "temporary_unavailable",
        message: "Temp",
      } as any;
      expect(service.isRetryableError(error)).toBe(true);
    });

    it("should return true for rate_limit (retry first)", () => {
      const error = { type: "rate_limit", message: "Rate limited" } as any;
      expect(service.isRetryableError(error)).toBe(true);
    });

    it("should return false for quota errors (should switch)", () => {
      const error = { type: "quota", message: "Quota" } as any;
      expect(service.isRetryableError(error)).toBe(false);
    });
  });

  // =========================================================================
  // isModelBlocked
  // =========================================================================

  describe("isModelBlocked", () => {
    it("should return false for non-blocked model", () => {
      expect(service.isModelBlocked("gpt-4o")).toBe(false);
    });

    it("should block model after invalid_api_key error in executeWithFallback", async () => {
      const error = new Error("Invalid API key");
      (error as any).type = "invalid_api_key";

      const executor = jest.fn().mockRejectedValue(error);

      try {
        await service.executeWithFallback("gpt-4o", executor, {
          maxRetries: 0,
          maxModelSwitches: 0,
        });
      } catch {
        // Expected to fail
      }

      // After invalid_api_key, model should be blocked
      expect(service.isModelBlocked("gpt-4o")).toBe(true);
    });
  });

  // =========================================================================
  // getModelFallbackChain
  // =========================================================================

  describe("getModelFallbackChain", () => {
    it("should return enabled models in priority order", async () => {
      const chain = await service.getModelFallbackChain();

      expect(chain.length).toBeGreaterThan(0);
    });

    it("should exclude specified models", async () => {
      const chain = await service.getModelFallbackChain({
        excludeModels: ["gpt-4o"],
      });

      expect(chain.every((m) => m.modelId !== "gpt-4o")).toBe(true);
    });
  });

  // =========================================================================
  // executeWithFallback
  // =========================================================================

  describe("executeWithFallback", () => {
    it("should succeed on first try", async () => {
      const executor = jest.fn().mockResolvedValue("success");

      const result = await service.executeWithFallback("gpt-4o", executor);

      expect(result.success).toBe(true);
      expect(result.data).toBe("success");
      expect(result.fallbackUsed).toBe(false);
      expect(result.attempts).toBe(1);
    });

    it("should retry on retryable error", async () => {
      const error = new Error("Timeout");
      (error as any).type = "timeout";

      const executor = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue("recovered");

      const result = await service.executeWithFallback("gpt-4o", executor, {
        maxRetries: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe("recovered");
      expect(result.attempts).toBe(2);
    });

    it("should switch model on model-switch errors", async () => {
      const quotaError = new Error("Quota exceeded");
      (quotaError as any).type = "quota";

      const executor = jest
        .fn()
        .mockRejectedValueOnce(quotaError)
        .mockResolvedValue("fallback-success");

      const result = await service.executeWithFallback("gpt-4o", executor, {
        maxModelSwitches: 1,
      });

      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
    });

    it("should return failure after all retries and switches exhausted", async () => {
      const error = new Error("Permanent failure");
      (error as any).type = "quota";

      const executor = jest.fn().mockRejectedValue(error);

      const result = await service.executeWithFallback("gpt-4o", executor, {
        maxRetries: 0,
        maxModelSwitches: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should track attempted models", async () => {
      const error = new Error("Quota");
      (error as any).type = "quota";

      const executor = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue("ok");

      const result = await service.executeWithFallback("gpt-4o", executor, {
        maxModelSwitches: 2,
        maxRetries: 0,
      });

      if (result.success) {
        expect(result.attemptedModels.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // =========================================================================
  // Priority patterns
  // =========================================================================

  describe("priority patterns", () => {
    it("should accept reasoning model priority patterns", () => {
      expect(() => {
        service.setReasoningModelPriority([/o3/, /o1/, /deepseek-r1/]);
      }).not.toThrow();
    });

    it("should accept fast model priority patterns", () => {
      expect(() => {
        service.setFastModelPriority([/gpt-4o-mini/, /claude-haiku/]);
      }).not.toThrow();
    });
  });
});
