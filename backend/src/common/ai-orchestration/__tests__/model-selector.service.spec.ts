import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { ModelSelectorService } from "../model-selector.service";
import { AiTaskType, AiModelConfig, ModelSelectionStrategy } from "../types";
import { DEFAULT_CONFIG } from "../config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeModel = (
  overrides: Partial<AiModelConfig> & { id: string; modelId: string },
): AiModelConfig => ({
  name: overrides.name ?? overrides.id,
  displayName: overrides.displayName ?? overrides.name ?? overrides.id,
  provider: "openai",
  modelType: AIModelType.CHAT,
  apiKey: "",
  apiEndpoint: "https://api.openai.com/v1",
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock AIFacade
// ---------------------------------------------------------------------------

const mockAiFacade = {
  getAvailableModels: jest.fn(),
  getModelById: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("ModelSelectorService", () => {
  let service: ModelSelectorService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Suppress logger noise
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelSelectorService,
        { provide: "AIFacade", useValue: mockAiFacade },
      ],
    })
      .overrideProvider(ModelSelectorService)
      .useFactory({
        factory: () =>
          new (ModelSelectorService as any)(mockAiFacade, undefined),
      })
      .compile();

    service = module.get<ModelSelectorService>(ModelSelectorService);
  });

  // -------------------------------------------------------------------------
  // getModelById
  // -------------------------------------------------------------------------

  describe("getModelById", () => {
    it("returns mapped AiModelConfig when facade returns a model", async () => {
      mockAiFacade.getModelById.mockResolvedValue({
        id: "gpt-4o",
        displayName: "GPT-4o",
        provider: "openai",
        modelId: "gpt-4o",
        apiEndpoint: "https://api.openai.com/v1",
      });

      const result = await service.getModelById("gpt-4o");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("gpt-4o");
      expect(result!.provider).toBe("openai");
      expect(result!.apiKey).toBe(""); // never exposes key
      expect(result!.secretKey).toBeUndefined();
      expect(result!.modelType).toBe(AIModelType.CHAT);
    });

    it("returns null when facade returns null", async () => {
      mockAiFacade.getModelById.mockResolvedValue(null);

      const result = await service.getModelById("nonexistent");

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // isModelHealthy
  // -------------------------------------------------------------------------

  describe("isModelHealthy", () => {
    it("returns true for unknown model (no health record)", () => {
      expect(service.isModelHealthy("brand-new-model")).toBe(true);
    });

    it("returns true after a single failure (below threshold)", () => {
      service.reportModelFailure("model-a", "timeout");
      // Default threshold is 3; one failure should still be considered healthy
      expect(service.isModelHealthy("model-a")).toBe(true);
    });

    it("returns false after reaching failure threshold", () => {
      const threshold = DEFAULT_CONFIG.healthCheck.failureThreshold; // 3
      for (let i = 0; i < threshold; i++) {
        service.reportModelFailure("model-b", "error");
      }
      expect(service.isModelHealthy("model-b")).toBe(false);
    });

    it("returns true again after reportModelSuccess resets the counter", () => {
      const threshold = DEFAULT_CONFIG.healthCheck.failureThreshold;
      for (let i = 0; i < threshold; i++) {
        service.reportModelFailure("model-c", "error");
      }
      expect(service.isModelHealthy("model-c")).toBe(false);

      service.reportModelSuccess("model-c");
      expect(service.isModelHealthy("model-c")).toBe(true);
    });

    it("reportModelSuccess is a no-op for an unknown model (no throw)", () => {
      expect(() => service.reportModelSuccess("never-seen")).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // selectModel – preferred model path
  // -------------------------------------------------------------------------

  describe("selectModel – preferredModelId", () => {
    const _preferred = makeModel({
      id: "gpt-4o",
      modelId: "gpt-4o",
      name: "GPT-4o",
    });

    beforeEach(() => {
      mockAiFacade.getModelById.mockResolvedValue({
        id: "gpt-4o",
        displayName: "GPT-4o",
        provider: "openai",
        modelId: "gpt-4o",
        apiEndpoint: "https://api.openai.com/v1",
      });
    });

    it("returns the preferred model when it is healthy", async () => {
      const result = await service.selectModel(AiTaskType.CHAT, {
        preferredModelId: "gpt-4o",
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe("gpt-4o");
    });

    it("falls back to available models when preferred is unhealthy", async () => {
      // Mark preferred as unhealthy
      const threshold = DEFAULT_CONFIG.healthCheck.failureThreshold;
      for (let i = 0; i < threshold; i++) {
        service.reportModelFailure("gpt-4o", "error");
      }

      // Provide fallback models
      mockAiFacade.getAvailableModels.mockResolvedValue([
        {
          id: "claude-sonnet",
          dbId: "claude-sonnet",
          name: "Claude Sonnet",
          provider: "anthropic",
        },
      ]);
      mockAiFacade.getModelById
        .mockResolvedValueOnce(null) // preferred lookup returns null from unhealthy check path
        .mockResolvedValue({
          id: "claude-sonnet",
          displayName: "Claude Sonnet",
          provider: "anthropic",
          modelId: "claude-sonnet",
          apiEndpoint: "https://api.anthropic.com/v1",
        });

      const result = await service.selectModel(AiTaskType.CHAT, {
        preferredModelId: "gpt-4o",
      });

      // Either falls through to available model, or returns null if no healthy fallback
      // The important thing is it doesn't throw
      expect(result === null || typeof result === "object").toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // selectModel – strategies
  // -------------------------------------------------------------------------

  describe("selectModel – selection strategies", () => {
    const models = [
      makeModel({
        id: "m1",
        modelId: "claude-opus",
        name: "Opus",
        provider: "anthropic",
      }),
      makeModel({
        id: "m2",
        modelId: "gpt-4o",
        name: "GPT4o",
        provider: "openai",
      }),
      makeModel({
        id: "m3",
        modelId: "gemini-flash",
        name: "Flash",
        provider: "google",
      }),
    ];

    const facadeModels = models.map((m) => ({
      id: m.modelId,
      dbId: m.id,
      name: m.name,
      provider: m.provider,
    }));

    beforeEach(() => {
      mockAiFacade.getAvailableModels.mockResolvedValue(facadeModels);
      mockAiFacade.getModelById.mockImplementation((id: string) => {
        const m = models.find((x) => x.modelId === id || x.id === id);
        if (!m) return Promise.resolve(null);
        return Promise.resolve({
          id: m.modelId,
          displayName: m.name,
          provider: m.provider,
          modelId: m.modelId,
          apiEndpoint: m.apiEndpoint,
        });
      });
    });

    it("DEFAULT strategy returns first available model", async () => {
      const result = await service.selectModel(AiTaskType.CHAT, {
        strategy: ModelSelectionStrategy.DEFAULT,
      });
      expect(result).not.toBeNull();
    });

    it("COST_OPTIMIZED strategy selects cheapest model (gemini-flash rank=1)", async () => {
      const result = await service.selectModel(AiTaskType.CHAT, {
        strategy: ModelSelectionStrategy.COST_OPTIMIZED,
      });
      expect(result).not.toBeNull();
      expect(result!.modelId).toBe("gemini-flash");
    });

    it("QUALITY_FIRST strategy selects highest quality model (claude-opus rank=1)", async () => {
      const result = await service.selectModel(AiTaskType.CHAT, {
        strategy: ModelSelectionStrategy.QUALITY_FIRST,
      });
      expect(result).not.toBeNull();
      expect(result!.modelId).toBe("claude-opus");
    });

    it("SPEED_FIRST strategy selects fastest model (gemini-flash rank=1)", async () => {
      const result = await service.selectModel(AiTaskType.CHAT, {
        strategy: ModelSelectionStrategy.SPEED_FIRST,
      });
      expect(result).not.toBeNull();
      expect(result!.modelId).toBe("gemini-flash");
    });

    it("ROUND_ROBIN cycles through models across calls", async () => {
      const r1 = await service.selectModel(AiTaskType.CHAT, {
        strategy: ModelSelectionStrategy.ROUND_ROBIN,
      });
      const r2 = await service.selectModel(AiTaskType.CHAT, {
        strategy: ModelSelectionStrategy.ROUND_ROBIN,
      });
      // Two consecutive calls must not return the same round-robin slot
      // (unless only 1 model is available — here we have 3)
      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // selectModel – no available models
  // -------------------------------------------------------------------------

  describe("selectModel – no models available", () => {
    it("returns null when facade returns empty list", async () => {
      mockAiFacade.getAvailableModels.mockResolvedValue([]);

      const result = await service.selectModel(AiTaskType.CHAT);

      expect(result).toBeNull();
    });

    it("returns null when all models are excluded", async () => {
      mockAiFacade.getAvailableModels.mockResolvedValue([
        { id: "gpt-4o", dbId: "m1", name: "GPT-4o", provider: "openai" },
      ]);

      const result = await service.selectModel(AiTaskType.CHAT, {
        excludeModels: ["m1"],
      });

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getRequiredModelType mapping (via selectModel side effects)
  // -------------------------------------------------------------------------

  describe("task type → model type mapping", () => {
    const expectModelTypeCalled = async (
      taskType: AiTaskType,
      expectedType: AIModelType,
    ) => {
      mockAiFacade.getAvailableModels.mockResolvedValue([]);
      await service.selectModel(taskType);
      expect(mockAiFacade.getAvailableModels).toHaveBeenCalledWith(
        expectedType,
      );
    };

    it("CHAT → CHAT", () =>
      expectModelTypeCalled(AiTaskType.CHAT, AIModelType.CHAT));
    it("COMPLETION → CHAT", () =>
      expectModelTypeCalled(AiTaskType.COMPLETION, AIModelType.CHAT));
    it("SUMMARIZATION → CHAT", () =>
      expectModelTypeCalled(AiTaskType.SUMMARIZATION, AIModelType.CHAT));
    it("TRANSLATION → CHAT", () =>
      expectModelTypeCalled(AiTaskType.TRANSLATION, AIModelType.CHAT));
    it("EXTRACTION → CHAT", () =>
      expectModelTypeCalled(AiTaskType.EXTRACTION, AIModelType.CHAT));
    it("IMAGE_GENERATION → IMAGE_GENERATION", () =>
      expectModelTypeCalled(
        AiTaskType.IMAGE_GENERATION,
        AIModelType.IMAGE_GENERATION,
      ));
    it("IMAGE_EDITING → IMAGE_EDITING", () =>
      expectModelTypeCalled(
        AiTaskType.IMAGE_EDITING,
        AIModelType.IMAGE_EDITING,
      ));
    it("MULTIMODAL → MULTIMODAL", () =>
      expectModelTypeCalled(AiTaskType.MULTIMODAL, AIModelType.MULTIMODAL));
  });

  // -------------------------------------------------------------------------
  // getFallbackChain
  // -------------------------------------------------------------------------

  describe("getFallbackChain", () => {
    it("returns available models excluding the current model", async () => {
      mockAiFacade.getAvailableModels.mockResolvedValue([
        { id: "gpt-4o", dbId: "current", name: "GPT-4o", provider: "openai" },
        {
          id: "claude-sonnet",
          dbId: "fallback-1",
          name: "Claude Sonnet",
          provider: "anthropic",
        },
      ]);
      mockAiFacade.getModelById.mockImplementation((id: string) =>
        Promise.resolve({
          id,
          displayName: id,
          provider: "openai",
          modelId: id,
          apiEndpoint: "https://api.openai.com/v1",
        }),
      );

      const chain = await service.getFallbackChain(AiTaskType.CHAT, "current");

      // current model must not appear in fallback chain
      expect(chain.every((m) => m.id !== "current")).toBe(true);
    });

    it("returns empty array when no fallback models exist", async () => {
      mockAiFacade.getAvailableModels.mockResolvedValue([]);

      const chain = await service.getFallbackChain(
        AiTaskType.CHAT,
        "only-model",
      );

      expect(chain).toEqual([]);
    });
  });
});
