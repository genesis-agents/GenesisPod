import { Test, TestingModule } from "@nestjs/testing";
import { TaskProfileMapperService } from "../task-profile-mapper.service";
import type { TaskProfile } from "../../types";
import { REASONING_MODEL_MIN_TOKENS } from "../../types";
import type { AIModelConfig } from "../ai-chat.service";

// Helper to create mock AIModelConfig
function createMockModelConfig(
  overrides: Partial<AIModelConfig> = {},
): AIModelConfig {
  return {
    id: "test-model-id",
    name: "test-model",
    displayName: "Test Model",
    provider: "openai",
    modelId: overrides.isReasoning ? "o1" : "gpt-4",
    apiEndpoint: "https://api.openai.com/v1",
    apiKey: "test-key",
    maxTokens: 8000,
    temperature: 0.7,
    isEnabled: true,
    isDefault: false,
    isReasoning: false,
    ...overrides,
  };
}

describe("TaskProfileMapperService", () => {
  let service: TaskProfileMapperService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskProfileMapperService],
    }).compile();

    service = module.get<TaskProfileMapperService>(TaskProfileMapperService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== 基础映射测试 ====================

  describe("Basic Mapping", () => {
    it("should return defaults when profile is undefined", () => {
      const result = service.mapToParameters(undefined, null);

      expect(result.temperature).toBe(0.7);
      expect(result.maxTokens).toBe(4096);
    });

    it("should return model config defaults when profile is undefined", () => {
      const modelConfig = createMockModelConfig({
        temperature: 0.8,
        maxTokens: 8000,
      });

      const result = service.mapToParameters(undefined, modelConfig);

      expect(result.temperature).toBe(0.8);
      expect(result.maxTokens).toBe(8000);
    });

    it("should map creativity to temperature correctly", () => {
      const testCases: Array<{
        creativity: TaskProfile["creativity"];
        expected: number;
      }> = [
        { creativity: "deterministic", expected: 0.1 },
        { creativity: "low", expected: 0.3 },
        { creativity: "medium", expected: 0.7 },
        { creativity: "high", expected: 0.9 },
      ];

      testCases.forEach(({ creativity, expected }) => {
        const result = service.mapToParameters({ creativity }, null);
        expect(result.temperature).toBe(expected);
      });
    });

    it("should map outputLength to maxTokens correctly", () => {
      const testCases: Array<{
        outputLength: TaskProfile["outputLength"];
        expected: number;
      }> = [
        { outputLength: "minimal", expected: 500 },
        { outputLength: "short", expected: 1500 },
        { outputLength: "medium", expected: 4000 },
        { outputLength: "standard", expected: 6000 },
        { outputLength: "long", expected: 8000 },
        { outputLength: "extended", expected: 16000 },
      ];

      testCases.forEach(({ outputLength, expected }) => {
        const result = service.mapToParameters({ outputLength }, null);
        expect(result.maxTokens).toBe(expected);
      });
    });
  });

  // ==================== 推理模型测试 ====================

  describe("Reasoning Model Handling", () => {
    it("should boost tokens for reasoning models to minimum when model supports it", () => {
      const modelConfig = createMockModelConfig({
        isReasoning: true,
        maxTokens: 50000, // Model supports enough tokens
      });

      const result = service.mapToParameters(
        { outputLength: "medium" },
        modelConfig,
      );

      expect(result.maxTokens).toBe(REASONING_MODEL_MIN_TOKENS);
    });

    it("should boost extended output to 32000 for reasoning models when supported", () => {
      const modelConfig = createMockModelConfig({
        isReasoning: true,
        maxTokens: 50000, // Model supports enough tokens
      });

      const result = service.mapToParameters(
        { outputLength: "extended" },
        modelConfig,
      );

      expect(result.maxTokens).toBe(32000);
    });

    it("should boost long output to 28000 for reasoning models when supported", () => {
      const modelConfig = createMockModelConfig({
        isReasoning: true,
        maxTokens: 50000, // Model supports enough tokens
      });

      const result = service.mapToParameters(
        { outputLength: "long" },
        modelConfig,
      );

      expect(result.maxTokens).toBe(28000);
    });

    it("should cap reasoning model tokens to model max to prevent API errors", () => {
      const modelConfig = createMockModelConfig({
        maxTokens: 12000, // Lower than REASONING_MODEL_MIN_TOKENS
        isReasoning: true,
      });

      const result = service.mapToParameters(
        { outputLength: "medium" },
        modelConfig,
      );

      // Should cap to model's maxTokens to prevent API 400 errors
      // The service will log a warning about suboptimal configuration
      expect(result.maxTokens).toBe(12000);
    });

    it("should use model maxTokens when it meets reasoning minimum", () => {
      const modelConfig = createMockModelConfig({
        maxTokens: 30000, // Higher than REASONING_MODEL_MIN_TOKENS
        isReasoning: true,
      });

      const result = service.mapToParameters(
        { outputLength: "medium" },
        modelConfig,
      );

      // Should use REASONING_MODEL_MIN_TOKENS since it's within model limits
      expect(result.maxTokens).toBe(REASONING_MODEL_MIN_TOKENS);
    });
  });

  // ==================== JSON 输出格式测试 ====================

  describe("JSON Output Format", () => {
    it("should cap temperature at 0.3 for JSON output", () => {
      const result = service.mapToParameters(
        { creativity: "high", outputFormat: "json" },
        null,
      );

      expect(result.temperature).toBe(0.3);
    });

    it("should not change temperature for non-JSON output", () => {
      const result = service.mapToParameters(
        { creativity: "high", outputFormat: "markdown" },
        null,
      );

      expect(result.temperature).toBe(0.9);
    });
  });

  // ==================== Reasoning Depth 测试 ====================

  describe("Reasoning Depth Mapping", () => {
    it("should pass through reasoningDepth for reasoning models", () => {
      const modelConfig = createMockModelConfig({
        isReasoning: true,
        maxTokens: 50000,
      });

      const result = service.mapToParameters(
        {
          creativity: "medium",
          outputLength: "medium",
          reasoningDepth: "deep",
        },
        modelConfig,
      );

      expect(result.reasoningDepth).toBe("deep");
    });

    it("should NOT set reasoningDepth for non-reasoning models", () => {
      const modelConfig = createMockModelConfig({
        isReasoning: false,
        maxTokens: 8000,
      });

      const result = service.mapToParameters(
        {
          creativity: "medium",
          outputLength: "medium",
          reasoningDepth: "deep",
        },
        modelConfig,
      );

      expect(result.reasoningDepth).toBeUndefined();
    });

    it("should NOT set reasoningDepth when profile has no reasoningDepth", () => {
      const modelConfig = createMockModelConfig({
        isReasoning: true,
        maxTokens: 50000,
      });

      const result = service.mapToParameters(
        { creativity: "medium", outputLength: "medium" },
        modelConfig,
      );

      expect(result.reasoningDepth).toBeUndefined();
    });

    it("should boost tokens to 32000 for deep reasoning when below threshold", () => {
      const modelConfig = createMockModelConfig({
        isReasoning: true,
        maxTokens: 50000,
      });

      const result = service.mapToParameters(
        { outputLength: "medium", reasoningDepth: "deep" },
        modelConfig,
      );

      expect(result.maxTokens).toBeGreaterThanOrEqual(32000);
    });

    it("should NOT boost tokens for light/moderate reasoning", () => {
      const modelConfig = createMockModelConfig({
        isReasoning: true,
        maxTokens: 50000,
      });

      const result = service.mapToParameters(
        { outputLength: "medium", reasoningDepth: "light" },
        modelConfig,
      );

      // Should not get the 32K deep boost (still gets reasoning model boost)
      expect(result.reasoningDepth).toBe("light");
    });

    it("should cap deep reasoning boost at model maxTokens", () => {
      const modelConfig = createMockModelConfig({
        isReasoning: true,
        maxTokens: 16384, // Model can't do 32000
      });

      const result = service.mapToParameters(
        { outputLength: "medium", reasoningDepth: "deep" },
        modelConfig,
      );

      expect(result.maxTokens).toBeLessThanOrEqual(16384);
    });
  });

  // ==================== Task-Aware Model Routing ====================

  describe("task-aware model routing", () => {
    describe("pickModelType", () => {
      it("taskKind=review + outputLength=short → CHAT_FAST", () => {
        const result = service.pickModelType({
          taskKind: "review",
          outputLength: "short",
          creativity: "deterministic",
        });

        expect(result).toBe("CHAT_FAST");
      });

      it("taskKind=write + outputLength=long → CHAT (not CHAT_FAST)", () => {
        const result = service.pickModelType({
          taskKind: "write",
          outputLength: "long",
          creativity: "medium",
        });

        expect(result).toBe("CHAT");
      });

      it("taskKind=sanity-check → CHAT_FAST regardless of outputLength", () => {
        const lengths: Array<TaskProfile["outputLength"]> = [
          "minimal",
          "short",
          "medium",
          "standard",
        ];

        lengths.forEach((outputLength) => {
          const result = service.pickModelType({
            taskKind: "sanity-check",
            outputLength,
          });
          expect(result).toBe("CHAT_FAST");
        });
      });

      it("taskKind=classify + outputLength=minimal → CHAT_FAST", () => {
        const result = service.pickModelType({
          taskKind: "classify",
          outputLength: "minimal",
        });

        expect(result).toBe("CHAT_FAST");
      });

      it("no taskKind → falls back to existing logic (CHAT)", () => {
        const result = service.pickModelType({
          creativity: "medium",
          outputLength: "medium",
        });

        expect(result).toBe("CHAT");
      });

      it("no profile at all → CHAT (backward compatible)", () => {
        const result = service.pickModelType(undefined);

        expect(result).toBe("CHAT");
      });

      it("taskKind=plan + outputLength=long → CHAT (plan is not in FAST_TASK_KINDS)", () => {
        const result = service.pickModelType({
          taskKind: "plan",
          outputLength: "long",
        });

        expect(result).toBe("CHAT");
      });

      it("taskKind=review + reasoningDepth=deep → REASONING (reasoningDepth wins over taskKind)", () => {
        const result = service.pickModelType({
          taskKind: "review",
          outputLength: "short",
          reasoningDepth: "deep",
        });

        expect(result).toBe("REASONING");
      });

      it("taskKind=sanity-check + reasoningDepth=moderate → REASONING (not downgraded to CHAT_FAST)", () => {
        const result = service.pickModelType({
          taskKind: "sanity-check",
          outputLength: "medium",
          reasoningDepth: "moderate",
        });

        expect(result).toBe("REASONING");
      });

      it("taskKind=summarize + outputLength=medium → CHAT_FAST", () => {
        const result = service.pickModelType({
          taskKind: "summarize",
          outputLength: "medium",
        });

        expect(result).toBe("CHAT_FAST");
      });

      it("taskKind=review + outputLength=long → CHAT (long output exceeds FAST threshold)", () => {
        const result = service.pickModelType({
          taskKind: "review",
          outputLength: "long",
        });

        expect(result).toBe("CHAT");
      });

      it("taskKind=research → CHAT (research is not in FAST_TASK_KINDS)", () => {
        const result = service.pickModelType({
          taskKind: "research",
          outputLength: "medium",
        });

        expect(result).toBe("CHAT");
      });
    });
  });
});


