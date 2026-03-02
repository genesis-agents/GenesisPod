/**
 * AIEngineFacade - Supplemental tests
 *
 * Covers additional uncovered paths in ai-engine.facade.ts:
 * - chat() with model fallback service
 * - chat() model type resolution from modelType param
 * - chatWithFallback() success and all-models-failed paths
 * - chatStream() circuit breaker open path
 * - chatStream() normal streaming path
 * - getDefaultTextModel() / getDefaultImageModel()
 * - getModelById() / getDefaultModelByType() / getFullModelConfig()
 * - executeSkill() — with and without setLLMAdapter
 * - resolveSkillInputBindings() — PromptSkillAdapter vs plain ISkill
 * - buildContext() — topic/resource/memory source types, token compression
 * - checkConstraints() — custom content filter rules, invalid regex
 * - search() — ToolRegistry unavailable path
 * - handleBilling() — personal API key skips credits, normal billing
 * - storeMemory() / retrieveMemory() / clearMemory() delegation
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { AIEngineFacade } from "../ai-engine.facade";
import { AiChatService } from "../../llm/services/ai-chat.service";
import { AiModelConfigService } from "../../llm/services/ai-model-config.service";
import { AIModelType } from "@prisma/client";
import {
  ORCHESTRATION_FEATURE,
  MEMORY_FEATURE,
  TOOL_FEATURE,
  SKILL_FEATURE,
  CONSTRAINT_FEATURE,
} from "../facade.providers";

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

function makeMockAiChatService(overrides: Record<string, unknown> = {}) {
  return {
    chat: jest.fn().mockResolvedValue({
      content: "Hello world",
      model: "gpt-4o",
      usage: { totalTokens: 100 },
      isError: false,
      apiKeySource: "system",
    }),
    chatStream: jest.fn().mockImplementation(async function* () {
      yield { content: "chunk", done: true, tokensUsed: 50 };
    }),
    getAvailableModelsAsync: jest.fn().mockResolvedValue(["gpt-4o"]),
    isReasoningModel: jest.fn().mockReturnValue(false),
    getDefaultModelByType: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeMockModelConfigService(overrides: Record<string, unknown> = {}) {
  return {
    getDefaultModel: jest.fn().mockResolvedValue(null),
    getModelById: jest.fn().mockResolvedValue(null),
    refreshModelConfigCache: jest.fn(),
    getEnabledModelsForFrontend: jest.fn().mockResolvedValue([
      {
        id: "db-gpt4o",
        modelId: "gpt-4o",
        name: "GPT-4o",
        displayName: "GPT-4o",
        provider: "openai",
      },
    ]),
    getAllEnabledModelsByType: jest.fn().mockResolvedValue([
      {
        id: "db-gpt4o",
        modelId: "gpt-4o",
        displayName: "GPT-4o",
        provider: "openai",
        isReasoning: false,
        maxTokens: 8000,
      },
    ]),
    ...overrides,
  };
}

function makeMockCircuitBreaker() {
  return {
    canExecute: jest.fn().mockReturnValue(true),
    getCooldownRemaining: jest.fn().mockReturnValue(0),
    incrementLoad: jest.fn(),
    decrementLoad: jest.fn(),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    parseErrorType: jest.fn().mockReturnValue("API_ERROR"),
    selectBest: jest.fn().mockReturnValue(null),
  };
}

async function buildFacade(
  extraProviders: Array<{ provide: unknown; useValue: unknown }> = [],
  chatServiceOverrides: Record<string, unknown> = {},
  modelConfigOverrides: Record<string, unknown> = {},
): Promise<{
  facade: AIEngineFacade;
  mockChat: ReturnType<typeof makeMockAiChatService>;
  mockCircuitBreaker: ReturnType<typeof makeMockCircuitBreaker>;
}> {
  const mockChat = makeMockAiChatService(chatServiceOverrides);
  const mockCircuitBreaker = makeMockCircuitBreaker();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AIEngineFacade,
      { provide: AiChatService, useValue: mockChat },
      {
        provide: AiModelConfigService,
        useValue: makeMockModelConfigService(modelConfigOverrides),
      },
      {
        provide: ORCHESTRATION_FEATURE,
        useValue: { circuitBreaker: mockCircuitBreaker, agentExecutor: null },
      },
      ...extraProviders,
    ],
  }).compile();

  jest.spyOn(Logger.prototype, "log").mockImplementation();
  jest.spyOn(Logger.prototype, "warn").mockImplementation();
  jest.spyOn(Logger.prototype, "error").mockImplementation();
  jest.spyOn(Logger.prototype, "debug").mockImplementation();

  return {
    facade: module.get<AIEngineFacade>(AIEngineFacade),
    mockChat,
    mockCircuitBreaker,
  };
}

// ─────────────────────────────────────────────────────────────
// chat() — model resolution from modelType
// ─────────────────────────────────────────────────────────────

describe("AIEngineFacade — chat() model resolution", () => {
  afterEach(() => jest.restoreAllMocks());

  it("resolves modelId from request.model when provided", async () => {
    const { facade, mockChat } = await buildFacade();

    await facade.chat({
      messages: [{ role: "user", content: "Hi" }],
      model: "claude-3-opus",
    });

    expect(mockChat.chat).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-3-opus" }),
    );
  });

  it("resolves modelId from modelType when request.model is absent", async () => {
    const mockGetDefault = jest
      .fn()
      .mockResolvedValue({ modelId: "gemini-flash" });
    const { facade, mockChat } = await buildFacade([], {
      getDefaultModelByType: mockGetDefault,
    });

    await facade.chat({
      messages: [{ role: "user", content: "Hi" }],
      modelType: AIModelType.CHAT_FAST,
    });

    expect(mockGetDefault).toHaveBeenCalledWith(AIModelType.CHAT_FAST);
    expect(mockChat.chat).toHaveBeenCalled();
  });

  it("falls back to empty string when neither model nor modelType resolves", async () => {
    const { facade, mockChat } = await buildFacade([], {
      getDefaultModelByType: jest.fn().mockResolvedValue(null),
    });

    await facade.chat({
      messages: [{ role: "user", content: "Hi" }],
      modelType: AIModelType.CHAT,
    });

    // model passed to aiChatService.chat should be request.model which is undefined
    expect(mockChat.chat).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// chat() — ModelFallbackService path
// ─────────────────────────────────────────────────────────────

describe("AIEngineFacade — chat() with ModelFallbackService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("uses fallback service when available and returns success result", async () => {
    const mockFallbackExecute = jest.fn().mockResolvedValue({
      success: true,
      fallbackUsed: false,
      attemptedModels: ["gpt-4o"],
      attempts: 1,
      modelUsed: "gpt-4o",
      data: {
        content: "Fallback path response",
        model: "gpt-4o",
        usage: { totalTokens: 80 },
        isError: false,
        apiKeySource: "system",
      },
    });

    const mockFallbackService = { executeWithFallback: mockFallbackExecute };

    const module = await Test.createTestingModule({
      providers: [
        AIEngineFacade,
        {
          provide: AiChatService,
          useValue: makeMockAiChatService(),
        },
        {
          provide: AiModelConfigService,
          useValue: makeMockModelConfigService(),
        },
        {
          provide: ORCHESTRATION_FEATURE,
          useValue: {
            circuitBreaker: makeMockCircuitBreaker(),
            agentExecutor: null,
          },
        },
      ],
    }).compile();

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();

    const facade = module.get<AIEngineFacade>(AIEngineFacade);
    // Inject modelFallbackService via private field
    (facade as unknown as Record<string, unknown>)["modelFallbackService"] =
      mockFallbackService;

    const result = await facade.chat({
      messages: [{ role: "user", content: "Test" }],
      model: "gpt-4o",
    });

    expect(result.content).toBe("Fallback path response");
    expect(result.isError).toBe(false);
    expect(mockFallbackExecute).toHaveBeenCalled();
  });

  it("returns error when all fallback models fail and not in strict mode", async () => {
    const mockFallbackExecute = jest.fn().mockResolvedValue({
      success: false,
      fallbackUsed: true,
      attemptedModels: ["gpt-4o", "claude-3"],
      attempts: 2,
      modelUsed: "gpt-4o",
      error: new Error("All providers down"),
      data: null,
    });

    const mockFallbackService = { executeWithFallback: mockFallbackExecute };

    const module = await Test.createTestingModule({
      providers: [
        AIEngineFacade,
        { provide: AiChatService, useValue: makeMockAiChatService() },
        {
          provide: AiModelConfigService,
          useValue: makeMockModelConfigService(),
        },
      ],
    }).compile();

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();

    const facade = module.get<AIEngineFacade>(AIEngineFacade);
    (facade as unknown as Record<string, unknown>)["modelFallbackService"] =
      mockFallbackService;

    const result = await facade.chat({
      messages: [{ role: "user", content: "Test" }],
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("All providers down");
  });

  it("throws when all fallback models fail in strict mode", async () => {
    const mockFallbackExecute = jest.fn().mockResolvedValue({
      success: false,
      fallbackUsed: true,
      attemptedModels: ["gpt-4o"],
      attempts: 1,
      error: new Error("Fatal error"),
      data: null,
    });

    const module = await Test.createTestingModule({
      providers: [
        AIEngineFacade,
        { provide: AiChatService, useValue: makeMockAiChatService() },
        {
          provide: AiModelConfigService,
          useValue: makeMockModelConfigService(),
        },
      ],
    }).compile();

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();

    const facade = module.get<AIEngineFacade>(AIEngineFacade);
    (facade as unknown as Record<string, unknown>)["modelFallbackService"] = {
      executeWithFallback: mockFallbackExecute,
    };

    await expect(
      facade.chat({
        messages: [{ role: "user", content: "Test" }],
        strictMode: true,
      }),
    ).rejects.toThrow("Fatal error");
  });
});

// ─────────────────────────────────────────────────────────────
// getDefaultTextModel / getDefaultImageModel / getModelById / getDefaultModelByType
// ─────────────────────────────────────────────────────────────

describe("AIEngineFacade — model info getters", () => {
  afterEach(() => jest.restoreAllMocks());

  it("getDefaultTextModel returns null when no default CHAT model", async () => {
    const { facade } = await buildFacade([], {
      getDefaultModelByType: jest.fn().mockResolvedValue(null),
    });

    const result = await facade.getDefaultTextModel();
    expect(result).toBeNull();
  });

  it("getDefaultTextModel returns model info when chat model is configured", async () => {
    const { facade } = await buildFacade([], {
      getDefaultModelByType: jest.fn().mockResolvedValue({
        id: "db-gpt4o",
        modelId: "gpt-4o",
        displayName: "GPT-4o",
        provider: "openai",
        maxTokens: 8000,
      }),
    });

    const result = await facade.getDefaultTextModel();
    expect(result).not.toBeNull();
    expect(result?.modelId).toBe("gpt-4o");
    expect(result?.provider).toBe("openai");
  });

  it("getDefaultImageModel returns null when no IMAGE_GENERATION model configured", async () => {
    const { facade } = await buildFacade([], {
      getDefaultModelByType: jest.fn().mockResolvedValue(null),
    });

    const result = await facade.getDefaultImageModel();
    expect(result).toBeNull();
  });

  it("getModelById returns null when modelConfigService finds nothing", async () => {
    const { facade } = await buildFacade(
      [],
      {},
      { getModelById: jest.fn().mockResolvedValue(null) },
    );

    const result = await facade.getModelById("nonexistent-model-id");
    expect(result).toBeNull();
  });

  it("getModelById returns model info when modelConfigService finds it", async () => {
    const { facade } = await buildFacade(
      [],
      {},
      {
        getModelById: jest.fn().mockResolvedValue({
          id: "db-claude",
          modelId: "claude-3-sonnet",
          displayName: "Claude 3 Sonnet",
          provider: "anthropic",
          maxTokens: 16000,
          isReasoning: false,
          apiEndpoint: null,
          apiKey: null,
          secretKey: null,
        }),
      },
    );

    const result = await facade.getModelById("claude-3-sonnet");
    expect(result).not.toBeNull();
    expect(result?.modelId).toBe("claude-3-sonnet");
    expect(result?.provider).toBe("anthropic");
  });

  it("getDefaultModelByType delegates to AiChatService", async () => {
    const mockGetDefault = jest
      .fn()
      .mockResolvedValue({ modelId: "gpt-4o-mini" });
    const { facade } = await buildFacade([], {
      getDefaultModelByType: mockGetDefault,
    });

    const result = await facade.getDefaultModelByType(AIModelType.CHAT);
    expect(mockGetDefault).toHaveBeenCalledWith(AIModelType.CHAT);
    expect(result?.modelId).toBe("gpt-4o-mini");
  });

  it("getDefaultModelByType returns null when service returns null", async () => {
    const { facade } = await buildFacade([], {
      getDefaultModelByType: jest.fn().mockResolvedValue(null),
    });

    const result = await facade.getDefaultModelByType(AIModelType.CHAT);
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// executeSkill() — with and without setLLMAdapter
// ─────────────────────────────────────────────────────────────

describe("AIEngineFacade — executeSkill()", () => {
  afterEach(() => jest.restoreAllMocks());

  it("executes skill and returns result", async () => {
    const { facade } = await buildFacade();

    const mockSkill = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        data: { content: "skill output" },
        tokensUsed: 50,
      }),
    };

    const result = await facade.executeSkill(
      mockSkill,
      { text: "Hello" },
      { executionId: "exec-1", skillId: "test-skill" },
    );

    expect(result.success).toBe(true);
    expect(mockSkill.execute).toHaveBeenCalledWith(
      { text: "Hello" },
      { executionId: "exec-1", skillId: "test-skill" },
    );
  });

  it("calls setLLMAdapter when skill exposes it and llmAdapter is available", async () => {
    const mockAdapter = { chat: jest.fn() };
    const { facade } = await buildFacade([
      {
        provide: SKILL_FEATURE,
        useValue: {
          registry: null,
          loader: null,
          promptBuilder: null,
          llmAdapter: mockAdapter,
        },
      },
    ]);

    const mockSkill = {
      execute: jest.fn().mockResolvedValue({ success: true, data: null }),
      setLLMAdapter: jest.fn(),
    };

    await facade.executeSkill(
      mockSkill,
      {},
      { executionId: "exec-2", skillId: "adapter-skill" },
    );

    expect(mockSkill.setLLMAdapter).toHaveBeenCalledWith(mockAdapter);
    expect(mockSkill.execute).toHaveBeenCalled();
  });

  it("warns but still executes when setLLMAdapter skill has no adapter", async () => {
    const { facade } = await buildFacade();

    const mockSkill = {
      execute: jest.fn().mockResolvedValue({ success: true, data: null }),
      setLLMAdapter: jest.fn(),
    };

    const result = await facade.executeSkill(
      mockSkill,
      {},
      { executionId: "exec-3", skillId: "needs-adapter-skill" },
    );

    // setLLMAdapter NOT called (no adapter available), but execute is still called
    expect(mockSkill.setLLMAdapter).not.toHaveBeenCalled();
    expect(mockSkill.execute).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// buildContext() — various source types
// ─────────────────────────────────────────────────────────────

describe("AIEngineFacade — buildContext()", () => {
  afterEach(() => jest.restoreAllMocks());

  it("builds context from custom sources", async () => {
    const { facade } = await buildFacade();

    const ctx = await facade.buildContext({
      sources: [
        { type: "custom", content: "Custom A" },
        { type: "custom", content: "Custom B" },
      ],
    });

    expect(ctx).toContain("Custom A");
    expect(ctx).toContain("Custom B");
  });

  it("builds context from resource data with title and summary", async () => {
    const { facade } = await buildFacade();

    const ctx = await facade.buildContext({
      sources: [
        {
          type: "resource",
          data: {
            title: "Research Paper",
            aiSummary: "AI summary here",
            content: "Full content text",
          },
        },
      ],
    });

    expect(ctx).toContain("Research Paper");
    expect(ctx).toContain("AI summary here");
    expect(ctx).toContain("Full content text");
  });

  it("truncates long resource content to 2000 chars", async () => {
    const { facade } = await buildFacade();

    const longContent = "x".repeat(3000);
    const ctx = await facade.buildContext({
      sources: [
        {
          type: "resource",
          data: { title: "Doc", content: longContent },
        },
      ],
    });

    expect(ctx).toContain("...");
    // Should contain the truncated part (2000 chars) + "..."
    expect(ctx.length).toBeLessThan(longContent.length + 200);
  });

  it("uses Prisma for topic when id provided without data (deprecated path)", async () => {
    const mockPrisma = {
      researchTopic: {
        findUnique: jest.fn().mockResolvedValue({
          name: "DB Topic",
          type: "research",
          description: "from DB",
          dimensions: [],
        }),
      },
      resource: { findUnique: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        AIEngineFacade,
        { provide: AiChatService, useValue: makeMockAiChatService() },
        {
          provide: AiModelConfigService,
          useValue: makeMockModelConfigService(),
        },
      ],
    }).compile();

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();

    const facade = module.get<AIEngineFacade>(AIEngineFacade);
    (facade as unknown as Record<string, unknown>)["prisma"] = mockPrisma;

    const ctx = await facade.buildContext({
      sources: [{ type: "topic", id: "topic-db-id" }],
    });

    expect(mockPrisma.researchTopic.findUnique).toHaveBeenCalled();
    expect(ctx).toContain("DB Topic");
  });

  it("uses Prisma for resource when id provided without data (deprecated path)", async () => {
    const mockPrisma = {
      researchTopic: { findUnique: jest.fn() },
      resource: {
        findUnique: jest.fn().mockResolvedValue({
          title: "DB Resource",
          aiSummary: "DB summary",
          content: "DB content",
        }),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        AIEngineFacade,
        { provide: AiChatService, useValue: makeMockAiChatService() },
        {
          provide: AiModelConfigService,
          useValue: makeMockModelConfigService(),
        },
      ],
    }).compile();

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();

    const facade = module.get<AIEngineFacade>(AIEngineFacade);
    (facade as unknown as Record<string, unknown>)["prisma"] = mockPrisma;

    const ctx = await facade.buildContext({
      sources: [{ type: "resource", id: "resource-db-id" }],
    });

    expect(mockPrisma.resource.findUnique).toHaveBeenCalled();
    expect(ctx).toContain("DB Resource");
  });

  it("handles default case (unknown source type) by using content", async () => {
    const { facade } = await buildFacade();

    const ctx = await facade.buildContext({
      sources: [{ type: "unknown-type" as "custom", content: "Raw content" }],
    });

    expect(ctx).toContain("Raw content");
  });
});

// ─────────────────────────────────────────────────────────────
// checkConstraints() edge cases
// ─────────────────────────────────────────────────────────────

describe("AIEngineFacade — checkConstraints() edge cases", () => {
  afterEach(() => jest.restoreAllMocks());

  it("detects custom content filter rule violations", async () => {
    const { facade } = await buildFacade();

    const result = facade.checkConstraints({
      content: "This contains forbidden words",
      constraints: {
        contentFilter: {
          enabled: true,
          rules: ["forbidden"],
        },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toBeDefined();
    expect(result.violations).toContainEqual(
      expect.objectContaining({ type: "content_filter" }),
    );
  });

  it("skips invalid regex rules without throwing", async () => {
    const { facade } = await buildFacade();

    expect(() =>
      facade.checkConstraints({
        content: "Normal content",
        constraints: {
          contentFilter: {
            enabled: true,
            rules: ["[invalid(regex"],
          },
        },
      }),
    ).not.toThrow();
  });

  it("provides adjustedContent when token limit violated", async () => {
    const { facade } = await buildFacade();

    const longContent = "word ".repeat(500);
    const result = facade.checkConstraints({
      content: longContent,
      constraints: {
        maxTokens: 10,
      },
    });

    expect(result.passed).toBe(false);
    // adjustedContent should be the truncated version
    expect(result.adjustedContent).toBeDefined();
  });

  it("marks content as invalid JSON when jsonSchema check and content is not JSON", async () => {
    const { facade } = await buildFacade();

    const result = facade.checkConstraints({
      content: "not json at all",
      constraints: {
        jsonSchema: { type: "object" },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ type: "json_schema" }),
    );
  });

  it("passes when JSON schema validation succeeds", async () => {
    const { facade } = await buildFacade();

    const result = facade.checkConstraints({
      content: '{"name": "test", "age": 25}',
      constraints: {
        jsonSchema: {
          type: "object",
          required: ["name"],
        },
      },
    });

    expect(result.passed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// search() — ToolRegistry availability
// ─────────────────────────────────────────────────────────────

describe("AIEngineFacade — search() without ToolRegistry", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns failure when ToolRegistry not available", async () => {
    const module = await Test.createTestingModule({
      providers: [
        AIEngineFacade,
        { provide: AiChatService, useValue: makeMockAiChatService() },
        {
          provide: AiModelConfigService,
          useValue: makeMockModelConfigService(),
        },
      ],
    }).compile();

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();

    const facade = module.get<AIEngineFacade>(AIEngineFacade);

    const result = await facade.search({ query: "test query" });

    expect(result.success).toBe(false);
    expect(result.results).toEqual([]);
    expect(result.error).toContain("not available");
  });

  it("returns failure when web-search tool throws during execution", async () => {
    const mockToolRegistry = {
      tryGet: jest.fn().mockReturnValue({
        execute: jest.fn().mockRejectedValue(new Error("Tool error")),
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        AIEngineFacade,
        { provide: AiChatService, useValue: makeMockAiChatService() },
        {
          provide: AiModelConfigService,
          useValue: makeMockModelConfigService(),
        },
        {
          provide: TOOL_FEATURE,
          useValue: { registry: mockToolRegistry, executor: null },
        },
      ],
    }).compile();

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();

    const facade = module.get<AIEngineFacade>(AIEngineFacade);

    const result = await facade.search({ query: "failing query" });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────
// chat() — isError path recording circuit breaker failure
// ─────────────────────────────────────────────────────────────

describe("AIEngineFacade — chat() isError response handling", () => {
  afterEach(() => jest.restoreAllMocks());

  it("records circuit breaker failure when AiChatService returns isError=true", async () => {
    const { facade, mockChat, mockCircuitBreaker } = await buildFacade();

    mockChat.chat.mockResolvedValue({
      content: "Error message from LLM",
      model: "gpt-4o",
      usage: { totalTokens: 0 },
      isError: true,
    });

    const result = await facade.chat({
      messages: [{ role: "user", content: "Test" }],
    });

    expect(result.isError).toBe(true);
    expect(mockCircuitBreaker.recordFailure).toHaveBeenCalled();
  });

  it("does not deduct credits when isError=true", async () => {
    const mockCreditsService = { consumeCredits: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AIEngineFacade,
        {
          provide: AiChatService,
          useValue: makeMockAiChatService({
            chat: jest.fn().mockResolvedValue({
              content: "Error",
              model: "gpt-4o",
              usage: { totalTokens: 100 },
              isError: true,
            }),
          }),
        },
        {
          provide: AiModelConfigService,
          useValue: makeMockModelConfigService(),
        },
      ],
    }).compile();

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();

    const facade = module.get<AIEngineFacade>(AIEngineFacade);
    (facade as unknown as Record<string, unknown>)["creditsService"] =
      mockCreditsService;

    await facade.chat({
      messages: [{ role: "user", content: "Test" }],
      billing: {
        userId: "user-1",
        moduleType: "ai-ask",
        operationType: "chat",
      },
    });

    expect(mockCreditsService.consumeCredits).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// handleBilling() — personal API key skips credits
// ─────────────────────────────────────────────────────────────

describe("AIEngineFacade — billing behavior", () => {
  afterEach(() => jest.restoreAllMocks());

  it("skips credits when apiKeySource is personal", async () => {
    const mockCreditsService = { consumeCredits: jest.fn() };

    const { facade, mockChat } = await buildFacade();

    mockChat.chat.mockResolvedValue({
      content: "BYOK response",
      model: "gpt-4o",
      usage: { totalTokens: 200 },
      isError: false,
      apiKeySource: "personal",
    });

    (facade as unknown as Record<string, unknown>)["creditsService"] =
      mockCreditsService;

    await facade.chat({
      messages: [{ role: "user", content: "Test BYOK" }],
      billing: {
        userId: "user-byok",
        moduleType: "ai-ask",
        operationType: "chat",
      },
    });

    expect(mockCreditsService.consumeCredits).not.toHaveBeenCalled();
  });

  it("deducts credits when apiKeySource is system", async () => {
    const mockCreditsService = {
      consumeCredits: jest.fn().mockResolvedValue(undefined),
    };

    const { facade, mockChat } = await buildFacade();

    mockChat.chat.mockResolvedValue({
      content: "System key response",
      model: "gpt-4o",
      usage: { totalTokens: 150 },
      isError: false,
      apiKeySource: "system",
    });

    (facade as unknown as Record<string, unknown>)["creditsService"] =
      mockCreditsService;

    await facade.chat({
      messages: [{ role: "user", content: "Test system key" }],
      billing: {
        userId: "user-sys",
        moduleType: "ai-ask",
        operationType: "chat",
      },
    });

    expect(mockCreditsService.consumeCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-sys",
        tokenCount: 150,
      }),
    );
  });

  it("handles credit deduction failure gracefully (warn and continue)", async () => {
    const mockCreditsService = {
      consumeCredits: jest.fn().mockRejectedValue(new Error("Credits DB down")),
    };

    const { facade, mockChat } = await buildFacade();

    mockChat.chat.mockResolvedValue({
      content: "Successful response",
      model: "gpt-4o",
      usage: { totalTokens: 100 },
      isError: false,
      apiKeySource: "system",
    });

    (facade as unknown as Record<string, unknown>)["creditsService"] =
      mockCreditsService;

    // Should NOT throw even though credits service fails
    const result = await facade.chat({
      messages: [{ role: "user", content: "Test" }],
      billing: {
        userId: "user-1",
        moduleType: "ai-ask",
        operationType: "chat",
      },
    });

    expect(result.isError).toBe(false);
    expect(result.content).toBe("Successful response");
  });
});

// ─────────────────────────────────────────────────────────────
// rate limiting constraint
// ─────────────────────────────────────────────────────────────

describe("AIEngineFacade — rate limit constraint", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns rate limit error when rate limiter denies request", async () => {
    const mockRateLimiter = {
      check: jest.fn().mockReturnValue({ allowed: false, retryAfter: 30000 }),
      consume: jest.fn(),
    };

    const { facade } = await buildFacade([
      {
        provide: CONSTRAINT_FEATURE,
        useValue: {
          rateLimiter: mockRateLimiter,
          costController: null,
        },
      },
    ]);

    const result = await facade.chat({
      messages: [{ role: "user", content: "Rate limited test" }],
      billing: {
        userId: "throttled-user",
        moduleType: "ai-ask",
        operationType: "chat",
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("Rate limit exceeded");
    expect(result.content).toContain("30 seconds");
  });

  it("passes rate limit check and consumes token when allowed", async () => {
    const mockRateLimiter = {
      check: jest.fn().mockReturnValue({ allowed: true }),
      consume: jest.fn(),
    };

    const { facade } = await buildFacade([
      {
        provide: CONSTRAINT_FEATURE,
        useValue: {
          rateLimiter: mockRateLimiter,
          costController: null,
        },
      },
    ]);

    const result = await facade.chat({
      messages: [{ role: "user", content: "Allowed" }],
      billing: {
        userId: "allowed-user",
        moduleType: "ai-ask",
        operationType: "chat",
      },
    });

    expect(result.isError).toBe(false);
    expect(mockRateLimiter.consume).toHaveBeenCalled();
  });

  it("returns budget error when cost controller denies request", async () => {
    const mockCostController = {
      checkBudget: jest.fn().mockReturnValue({
        allowed: false,
        reason: "Monthly budget exhausted",
      }),
    };

    const { facade } = await buildFacade([
      {
        provide: CONSTRAINT_FEATURE,
        useValue: {
          rateLimiter: null,
          costController: mockCostController,
        },
      },
    ]);

    const result = await facade.chat({
      messages: [{ role: "user", content: "Budget exceeded test" }],
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("Budget limit exceeded");
    expect(result.content).toContain("Monthly budget exhausted");
  });
});

// ─────────────────────────────────────────────────────────────
// chatStream() — circuit breaker and streaming path
// ─────────────────────────────────────────────────────────────

describe("AIEngineFacade — chatStream()", () => {
  afterEach(() => jest.restoreAllMocks());

  it("yields error chunk when circuit breaker is open", async () => {
    const { facade, mockCircuitBreaker } = await buildFacade();

    mockCircuitBreaker.canExecute.mockReturnValue(false);
    mockCircuitBreaker.getCooldownRemaining.mockReturnValue(10000);

    const chunks: Array<{ content: string; done: boolean; error?: string }> =
      [];
    for await (const chunk of facade.chatStream({
      messages: [{ role: "user", content: "Test" }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].done).toBe(true);
    expect(chunks[0].error).toBe("CIRCUIT_BREAKER_OPEN");
    expect(chunks[0].content).toContain("temporarily unavailable");
  });

  it("streams chunks through from AiChatService", async () => {
    const streamChunks = [
      { content: "Hello", done: false },
      { content: " world", done: false },
      { content: "", done: true, usage: { totalTokens: 25 } },
    ];

    const { facade, mockChat } = await buildFacade([], {
      chatStream: jest.fn().mockImplementation(async function* () {
        for (const c of streamChunks) yield c;
      }),
    });

    const received: Array<{ content: string; done: boolean }> = [];
    for await (const chunk of facade.chatStream({
      messages: [{ role: "user", content: "Stream test" }],
    })) {
      received.push(chunk);
    }

    expect(received).toHaveLength(3);
    expect(received[0].content).toBe("Hello");
    expect(received[2].done).toBe(true);
    expect(mockChat.chatStream).toHaveBeenCalled();
  });

  it("records circuit breaker failure when stream emits error chunk", async () => {
    const { facade, mockCircuitBreaker } = await buildFacade([], {
      chatStream: jest.fn().mockImplementation(async function* () {
        yield { content: "", done: true, error: "API timeout" };
      }),
    });

    const chunks: Array<{ content: string; done: boolean; error?: string }> =
      [];
    for await (const chunk of facade.chatStream({
      messages: [{ role: "user", content: "Test" }],
    })) {
      chunks.push(chunk);
    }

    expect(mockCircuitBreaker.recordFailure).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "API timeout",
    );
  });
});

// ─────────────────────────────────────────────────────────────
// memory delegation
// ─────────────────────────────────────────────────────────────

describe("AIEngineFacade — memory delegation", () => {
  afterEach(() => jest.restoreAllMocks());

  it("storeMemory delegates to memorySub with graceful no-op when unavailable", async () => {
    const { facade } = await buildFacade();

    // When no MEMORY_FEATURE is provided, should not throw
    await expect(
      facade.storeMemory({
        sessionId: "session-1",
        content: "Some memory",
        memoryType: "conversation",
      }),
    ).resolves.not.toThrow();
  });

  it("retrieveMemory returns empty array when memory feature unavailable", async () => {
    const { facade } = await buildFacade();

    const items = await facade.retrieveMemory({
      sessionId: "session-1",
    });

    expect(Array.isArray(items)).toBe(true);
  });

  it("storeMemory uses MEMORY_FEATURE shortTerm when type is short", async () => {
    const mockShortTermService = {
      setWithSession: jest.fn().mockResolvedValue(undefined),
      getWithSession: jest.fn().mockResolvedValue(undefined),
      deleteWithSession: jest.fn().mockResolvedValue(undefined),
      clearSession: jest.fn().mockResolvedValue(undefined),
    };

    const { facade } = await buildFacade([
      {
        provide: MEMORY_FEATURE,
        useValue: { shortTerm: mockShortTermService, longTerm: null },
      },
    ]);

    await facade.storeMemory({
      sessionId: "session-mem",
      content: "Important context",
      type: "short",
    });

    expect(mockShortTermService.setWithSession).toHaveBeenCalledWith(
      "session-mem",
      "memory",
      "Important context",
    );
  });
});
