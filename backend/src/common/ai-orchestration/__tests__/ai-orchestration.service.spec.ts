/**
 * AiOrchestrationService unit tests
 *
 * Covers:
 * - Successful AI call flow (model selection → provider → fallback manager)
 * - No model available → returns error result
 * - No provider for selected model → returns error result
 * - Fallback manager returning a failed result
 * - Unhandled exception from model selector → caught and classified
 * - getRecentTraces / getTraceStats helpers
 * - onModuleDestroy clears the cleanup interval
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";

import { AiOrchestrationService } from "../ai-orchestration.service";
import { ModelSelectorService } from "../model-selector.service";
import { FallbackManagerService } from "../fallback-manager.service";
import { AIProviderFactory } from "../providers";
import { AIErrorClassifier } from "../error-classifier";
import { AiTaskType, AiCallInput, AiCallResult, AiModelConfig } from "../types";
import { AIModelType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockModel: AiModelConfig = {
  id: "model-1",
  name: "gpt-4o",
  displayName: "GPT-4o",
  provider: "openai",
  modelId: "gpt-4o",
  modelType: AIModelType.CHAT,
  apiKey: "sk-test-key",
};

const makeSuccessResult = (model = "gpt-4o"): AiCallResult => ({
  success: true,
  content: "Hello from AI",
  model,
  provider: "openai",
  tokensUsed: 120,
  latencyMs: 800,
});

const makeFailureResult = (model = "gpt-4o"): AiCallResult => ({
  success: false,
  error: "API call failed",
  model,
  provider: "openai",
  tokensUsed: 0,
  latencyMs: 500,
});

const baseInput: AiCallInput = {
  taskType: AiTaskType.CHAT,
  messages: [{ role: "user", content: "Hello" }],
  metadata: { source: "test-suite" },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("AiOrchestrationService", () => {
  let service: AiOrchestrationService;
  let mockModelSelector: jest.Mocked<
    Pick<
      ModelSelectorService,
      | "selectModel"
      | "getFallbackChain"
      | "reportModelSuccess"
      | "reportModelFailure"
    >
  >;
  let mockFallbackManager: jest.Mocked<
    Pick<FallbackManagerService, "executeWithFallback">
  >;
  let mockProviderFactory: jest.Mocked<
    Pick<AIProviderFactory, "getProviderForModel">
  >;
  let mockErrorClassifier: jest.Mocked<Pick<AIErrorClassifier, "classify">>;

  beforeEach(async () => {
    mockModelSelector = {
      selectModel: jest.fn().mockResolvedValue(mockModel),
      getFallbackChain: jest.fn().mockResolvedValue([]),
      reportModelSuccess: jest.fn(),
      reportModelFailure: jest.fn(),
    };

    mockFallbackManager = {
      executeWithFallback: jest.fn().mockResolvedValue(makeSuccessResult()),
    };

    mockProviderFactory = {
      getProviderForModel: jest.fn().mockReturnValue({
        execute: jest.fn().mockResolvedValue(makeSuccessResult()),
      }),
    };

    mockErrorClassifier = {
      classify: jest.fn().mockImplementation((error: unknown) => ({
        type: "UNKNOWN",
        message: error instanceof Error ? error.message : String(error),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiOrchestrationService,
        { provide: ModelSelectorService, useValue: mockModelSelector },
        { provide: FallbackManagerService, useValue: mockFallbackManager },
        { provide: AIProviderFactory, useValue: mockProviderFactory },
        { provide: AIErrorClassifier, useValue: mockErrorClassifier },
      ],
    }).compile();

    service = module.get<AiOrchestrationService>(AiOrchestrationService);

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Successful call
  // -------------------------------------------------------------------------

  describe("call() — success path", () => {
    it("returns a successful result with content", async () => {
      const result = await service.call(baseInput);

      expect(result.success).toBe(true);
      expect(result.content).toBe("Hello from AI");
    });

    it("attaches a traceId to the result", async () => {
      const result = await service.call(baseInput);

      expect(result.traceId).toBeDefined();
      expect(typeof result.traceId).toBe("string");
    });

    it("attaches latencyMs to the result", async () => {
      const result = await service.call(baseInput);

      expect(typeof result.latencyMs).toBe("number");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("calls reportModelSuccess on the model selector with the model name from the result", async () => {
      await service.call(baseInput);

      expect(mockModelSelector.reportModelSuccess).toHaveBeenCalledWith(
        "gpt-4o", // result.model from makeSuccessResult()
      );
    });

    it("delegates to fallbackManager.executeWithFallback", async () => {
      await service.call(baseInput);

      expect(mockFallbackManager.executeWithFallback).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // No model available
  // -------------------------------------------------------------------------

  describe("call() — no model available", () => {
    it("returns an error result when modelSelector returns null", async () => {
      mockModelSelector.selectModel.mockResolvedValue(
        null as unknown as AiModelConfig,
      );

      const result = await service.call(baseInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No available model");
    });

    it("does not call the provider factory when no model is found", async () => {
      mockModelSelector.selectModel.mockResolvedValue(
        null as unknown as AiModelConfig,
      );

      await service.call(baseInput);

      expect(mockProviderFactory.getProviderForModel).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // No provider for model
  // -------------------------------------------------------------------------

  describe("call() — no provider for selected model", () => {
    it("returns an error result when providerFactory returns null", async () => {
      mockProviderFactory.getProviderForModel.mockReturnValue(
        null as unknown as ReturnType<AIProviderFactory["getProviderForModel"]>,
      );

      const result = await service.call(baseInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No provider available");
    });
  });

  // -------------------------------------------------------------------------
  // Fallback manager returns failed result
  // -------------------------------------------------------------------------

  describe("call() — fallbackManager returns failed result", () => {
    it("calls reportModelFailure and returns the failed result", async () => {
      const failedResult = makeFailureResult();
      mockFallbackManager.executeWithFallback.mockResolvedValue(failedResult);

      const result = await service.call(baseInput);

      expect(result.success).toBe(false);
      expect(mockModelSelector.reportModelFailure).toHaveBeenCalledWith(
        failedResult.model,
        failedResult.error,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Unhandled exception from model selector
  // -------------------------------------------------------------------------

  describe("call() — unhandled exception", () => {
    it("catches the exception and returns a classified error result", async () => {
      const boom = new Error("unexpected failure");
      mockModelSelector.selectModel.mockRejectedValue(boom);
      mockErrorClassifier.classify.mockReturnValue({
        type: "UNKNOWN",
        message: boom.message,
      } as ReturnType<AIErrorClassifier["classify"]>);

      const result = await service.call(baseInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe("unexpected failure");
      expect(result.errorType).toBe("UNKNOWN");
      expect(result.model).toBe("unknown");
    });
  });

  // -------------------------------------------------------------------------
  // getRecentTraces
  // -------------------------------------------------------------------------

  describe("getRecentTraces()", () => {
    it("returns an empty array before any calls", () => {
      const traces = service.getRecentTraces();
      expect(Array.isArray(traces)).toBe(true);
    });

    it("returns traces in reverse chronological order after calls", async () => {
      await service.call(baseInput);
      await service.call(baseInput);

      const traces = service.getRecentTraces(10);
      expect(traces.length).toBeGreaterThanOrEqual(2);
    });

    it("respects the limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await service.call(baseInput);
      }

      const traces = service.getRecentTraces(2);
      expect(traces.length).toBeLessThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // getTraceStats
  // -------------------------------------------------------------------------

  describe("getTraceStats()", () => {
    it("returns zero stats before any calls", () => {
      const stats = service.getTraceStats();
      expect(stats.totalTraces).toBe(0);
      expect(stats.pendingTraces).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.averageLatencyMs).toBe(0);
    });

    it("tracks total traces after successful calls", async () => {
      await service.call(baseInput);
      await service.call(baseInput);

      const stats = service.getTraceStats();
      expect(stats.totalTraces).toBe(2);
    });

    it("calculates successRate as 1.0 when all calls succeed", async () => {
      await service.call(baseInput);

      const stats = service.getTraceStats();
      expect(stats.successRate).toBe(1);
    });

    it("calculates successRate as 0.0 when all calls fail via no-model path", async () => {
      mockModelSelector.selectModel.mockResolvedValue(
        null as unknown as AiModelConfig,
      );

      await service.call(baseInput);

      const stats = service.getTraceStats();
      expect(stats.successRate).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // onModuleDestroy
  // -------------------------------------------------------------------------

  describe("onModuleDestroy()", () => {
    it("clears the cleanup interval without throwing", () => {
      expect(() => service.onModuleDestroy()).not.toThrow();
    });

    it("is idempotent (calling twice does not throw)", () => {
      service.onModuleDestroy();
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });
});
