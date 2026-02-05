import { Test, TestingModule } from "@nestjs/testing";
import { AiModelConfigService } from "../ai-model-config.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { SecretsService } from "../../../../core/secrets/secrets.service";
import { UserApiKeysService } from "../../../../core/user-api-keys/user-api-keys.service";
import { AIModelType } from "@prisma/client";

describe("AiModelConfigService", () => {
  let service: AiModelConfigService;
  let prismaService: jest.Mocked<PrismaService>;
  let secretsService: jest.Mocked<SecretsService>;

  const mockChatModel = {
    id: "model-1",
    name: "gpt-4o",
    displayName: "GPT-4 Optimized",
    provider: "openai",
    modelId: "gpt-4o",
    apiEndpoint: "https://api.openai.com/v1",
    apiKey: "sk-test-key",
    secretKey: null,
    maxTokens: 4000,
    temperature: 0.7,
    isEnabled: true,
    isDefault: true,
    modelType: "CHAT" as AIModelType,
    isReasoning: false,
    apiFormat: "openai",
    supportsTemperature: true,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsVision: false,
    tokenParamName: "max_tokens",
    defaultTimeoutMs: 120000,
    priceInputPerMillion: 5.0,
    priceOutputPerMillion: 15.0,
    priority: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    icon: null,
    color: null,
    description: null,
  };

  const mockReasoningModel = {
    id: "model-2",
    name: "o1-preview",
    displayName: "OpenAI O1 Preview",
    provider: "openai",
    modelId: "o1-preview",
    apiEndpoint: "https://api.openai.com/v1",
    apiKey: "sk-test-key",
    secretKey: null,
    maxTokens: 8000,
    temperature: 1.0,
    isEnabled: true,
    isDefault: false,
    modelType: "CHAT" as AIModelType,
    isReasoning: true,
    apiFormat: "openai",
    supportsTemperature: false,
    supportsStreaming: true,
    supportsFunctionCalling: false,
    supportsVision: false,
    tokenParamName: "max_completion_tokens",
    defaultTimeoutMs: 300000,
    priceInputPerMillion: 15.0,
    priceOutputPerMillion: 60.0,
    priority: 90,
    createdAt: new Date(),
    updatedAt: new Date(),
    icon: null,
    color: null,
    description: null,
  };

  const mockGeminiModel = {
    id: "model-3",
    name: "gemini",
    displayName: "Gemini 2.0 Flash",
    provider: "google",
    modelId: "gemini-2.0-flash",
    apiEndpoint: "https://generativelanguage.googleapis.com",
    apiKey: null,
    secretKey: "GEMINI_API_KEY",
    maxTokens: 8000,
    temperature: 0.7,
    isEnabled: true,
    isDefault: false,
    modelType: "CHAT" as AIModelType,
    isReasoning: false,
    apiFormat: "google",
    supportsTemperature: true,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsVision: true,
    tokenParamName: "max_tokens",
    defaultTimeoutMs: 120000,
    priceInputPerMillion: 0.1,
    priceOutputPerMillion: 0.4,
    priority: 80,
    createdAt: new Date(),
    updatedAt: new Date(),
    icon: null,
    color: null,
    description: null,
  };

  beforeEach(async () => {
    const mockPrismaService = {
      aIModel: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const mockSecretsService = {
      getValueInternal: jest.fn(),
    };

    const mockUserApiKeysService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiModelConfigService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SecretsService, useValue: mockSecretsService },
        { provide: UserApiKeysService, useValue: mockUserApiKeysService },
      ],
    }).compile();

    service = module.get<AiModelConfigService>(AiModelConfigService);
    prismaService = module.get(PrismaService);
    secretsService = module.get(SecretsService);

    // Mock initial cache load to avoid async initialization issues
    // Return empty array by default, specific tests will override
    (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("refreshModelConfigCache", () => {
    it("should load CHAT and CHAT_FAST models into cache", async () => {
      // Arrange
      const models = [mockChatModel, mockReasoningModel];
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue(models);

      // Act
      await service.refreshModelConfigCache();

      // Assert
      expect(prismaService.aIModel.findMany).toHaveBeenCalledWith({
        where: {
          modelType: { in: ["CHAT", "CHAT_FAST"] },
          isEnabled: true,
        },
      });

      // Verify cache can retrieve models
      const config = await service.getModelConfig("gpt-4o");
      expect(config).not.toBeNull();
      expect(config?.modelId).toBe("gpt-4o");
    });

    it("should cache models by both modelId and name", async () => {
      // Arrange
      const modelWithDifferentName = {
        ...mockChatModel,
        name: "gpt4",
        modelId: "gpt-4o",
      };
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        modelWithDifferentName,
      ]);

      // Act
      await service.refreshModelConfigCache();

      // Assert - should be retrievable by both keys
      const byModelId = await service.getModelConfig("gpt-4o");
      const byName = await service.getModelConfig("gpt4");

      expect(byModelId).not.toBeNull();
      expect(byName).not.toBeNull();
      expect(byModelId?.id).toBe(byName?.id);
    });

    it("should handle database error gracefully", async () => {
      // Arrange
      (prismaService.aIModel.findMany as jest.Mock).mockRejectedValue(
        new Error("Database error"),
      );

      // Act & Assert - should not throw
      await expect(service.refreshModelConfigCache()).resolves.toBeUndefined();
    });
  });

  describe("getModelConfig", () => {
    beforeEach(async () => {
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel,
        mockReasoningModel,
      ]);
      await service.refreshModelConfigCache();
    });

    it("should return model from cache on exact match", async () => {
      // Act
      const config = await service.getModelConfig("gpt-4o");

      // Assert
      expect(config).not.toBeNull();
      expect(config?.modelId).toBe("gpt-4o");
      expect(config?.provider).toBe("openai");
    });

    it("should normalize modelId by removing #N suffix", async () => {
      // Act
      const config = await service.getModelConfig("gpt-4o#2");

      // Assert
      expect(config).not.toBeNull();
      expect(config?.modelId).toBe("gpt-4o");
    });

    it("should perform case-insensitive search", async () => {
      // Act
      const config = await service.getModelConfig("GPT-4O");

      // Assert
      expect(config).not.toBeNull();
      expect(config?.modelId).toBe("gpt-4o");
    });

    it("should query database on cache miss", async () => {
      // Arrange
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(
        mockGeminiModel,
      );

      // Act
      const config = await service.getModelConfig("gemini-2.0-flash");

      // Assert
      expect(prismaService.aIModel.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { modelId: { equals: "gemini-2.0-flash", mode: "insensitive" } },
            { name: { equals: "gemini-2.0-flash", mode: "insensitive" } },
          ],
          modelType: { in: ["CHAT", "CHAT_FAST"] },
          isEnabled: true,
        },
      });
      expect(config?.modelId).toBe("gemini-2.0-flash");
    });

    it("should return null for non-existent model", async () => {
      // Arrange
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(null);

      // Act
      const config = await service.getModelConfig("non-existent-model");

      // Assert
      expect(config).toBeNull();
    });

    it("should refresh cache if TTL expired", async () => {
      // Arrange - Clear initial calls and setup mock
      jest.clearAllMocks();
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel,
      ]);

      // Force cache refresh by calling refreshModelConfigCache
      await service.refreshModelConfigCache();
      const firstCallCount = (prismaService.aIModel.findMany as jest.Mock).mock
        .calls.length;

      // Fast-forward time by 6 minutes (cache TTL is 5 minutes)
      jest.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60 * 1000);

      // Act - This should trigger a cache refresh
      await service.getModelConfig("gpt-4o");

      // Assert - Should have called findMany again due to TTL expiry
      expect(prismaService.aIModel.findMany).toHaveBeenCalledTimes(
        firstCallCount + 1,
      );
    });
  });

  describe("getApiKeyForModel", () => {
    it("should return API key from secretKey if available", async () => {
      // Arrange
      const modelWithSecret = mockGeminiModel;
      (secretsService.getValueInternal as jest.Mock).mockResolvedValue(
        "secret-api-key-value",
      );

      // Act
      const apiKey = await service.getApiKeyForModel(modelWithSecret as any);

      // Assert
      expect(secretsService.getValueInternal).toHaveBeenCalledWith(
        "GEMINI_API_KEY",
      );
      expect(apiKey).toBe("secret-api-key-value");
    });

    it("should trim API key value", async () => {
      // Arrange
      const model = mockChatModel;
      model.apiKey = "  sk-test-key  ";

      // Act
      const apiKey = await service.getApiKeyForModel(model as any);

      // Assert
      expect(apiKey).toBe("sk-test-key");
    });

    it("should fallback to apiKey if secretKey not found", async () => {
      // Arrange
      const modelWithSecret = { ...mockGeminiModel, apiKey: "fallback-key" };
      (secretsService.getValueInternal as jest.Mock).mockResolvedValue(null);

      // Act
      const apiKey = await service.getApiKeyForModel(modelWithSecret as any);

      // Assert
      expect(apiKey).toBe("fallback-key");
    });

    it("should return null if no API key available", async () => {
      // Arrange
      const modelNoKey = { ...mockChatModel, apiKey: null, secretKey: null };

      // Act
      const apiKey = await service.getApiKeyForModel(modelNoKey as any);

      // Assert
      expect(apiKey).toBeNull();
    });
  });

  describe("inferModelType - isReasoningModel", () => {
    it("should identify o1 models as reasoning", () => {
      // Act & Assert
      expect(service.isReasoningModel("o1-preview")).toBe(true);
      expect(service.isReasoningModel("o1-mini")).toBe(true);
      expect(service.isReasoningModel("o1")).toBe(true);
    });

    it("should identify o3 models as reasoning", () => {
      // Act & Assert
      expect(service.isReasoningModel("o3-mini")).toBe(true);
    });

    it("should identify gemini thinking models as reasoning", () => {
      // Act & Assert
      expect(service.isReasoningModel("gemini-2.0-flash-thinking")).toBe(true);
      expect(service.isReasoningModel("gemini-exp-1206")).toBe(true);
    });

    it("should identify deepseek r1 as reasoning", () => {
      // Act & Assert
      expect(service.isReasoningModel("deepseek-r1")).toBe(true);
      expect(service.isReasoningModel("deepseek-reasoner")).toBe(true);
    });

    it("should identify regular chat models as non-reasoning", () => {
      // Act & Assert
      expect(service.isReasoningModel("gpt-4o")).toBe(false);
      expect(service.isReasoningModel("claude-3-opus")).toBe(false);
      expect(service.isReasoningModel("gemini-2.0-flash")).toBe(false);
    });

    it("should use database config for isReasoning when available", async () => {
      // Arrange
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockReasoningModel,
      ]);
      await service.refreshModelConfigCache();

      // Act
      const isReasoning = service.isReasoningModel("o1-preview");

      // Assert
      expect(isReasoning).toBe(true);
    });
  });

  describe("getModelById", () => {
    beforeEach(async () => {
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel,
      ]);
      await service.refreshModelConfigCache();
    });

    it("should find model by modelId", async () => {
      // Act
      const config = await service.getModelById("gpt-4o");

      // Assert
      expect(config).not.toBeNull();
      expect(config?.modelId).toBe("gpt-4o");
    });

    it("should find model by database UUID", async () => {
      // Arrange
      const uuid = "550e8400-e29b-41d4-a716-446655440000";

      // Mock getModelConfig to return null (cache miss)
      (prismaService.aIModel.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // First call from getModelConfig
        .mockResolvedValueOnce(mockChatModel); // Second call for UUID lookup

      // Act
      const config = await service.getModelById(uuid);

      // Assert
      // Should have attempted getModelConfig first, then UUID lookup
      expect(config?.modelId).toBe("gpt-4o");
    });

    it("should return null for non-existent ID", async () => {
      // Arrange
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(null);

      // Act
      const config = await service.getModelById("non-existent");

      // Assert
      expect(config).toBeNull();
    });
  });

  describe("getDefaultModelConfig", () => {
    it("should return default CHAT model", async () => {
      // Arrange
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(
        mockChatModel,
      );

      // Act
      const config = await service.getDefaultModelConfig();

      // Assert
      expect(prismaService.aIModel.findFirst).toHaveBeenCalledWith({
        where: {
          modelType: "CHAT",
          isEnabled: true,
          isDefault: true,
        },
        orderBy: {
          priority: "desc",
        },
      });
      expect(config?.isDefault).toBe(true);
    });

    it("should fallback to first enabled model if no default", async () => {
      // Arrange
      (prismaService.aIModel.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // No default
        .mockResolvedValueOnce(mockChatModel); // First enabled

      // Act
      const config = await service.getDefaultModelConfig();

      // Assert
      expect(config).not.toBeNull();
      expect(config?.modelId).toBe("gpt-4o");
    });

    it("should return null if no models available", async () => {
      // Arrange
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(null);

      // Act
      const config = await service.getDefaultModelConfig();

      // Assert
      expect(config).toBeNull();
    });
  });

  describe("getDefaultModelByType", () => {
    it("should return default model for specified type", async () => {
      // Arrange
      const fullModel = { ...mockChatModel, modelType: AIModelType.CHAT };
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(
        fullModel,
      );

      // Act
      const config = await service.getDefaultModelByType(AIModelType.CHAT);

      // Assert
      expect(prismaService.aIModel.findFirst).toHaveBeenCalledWith({
        where: {
          modelType: AIModelType.CHAT,
          isEnabled: true,
          isDefault: true,
        },
        orderBy: {
          priority: "desc",
        },
      });
      // The service builds config from model, so modelType is from the returned db model
      expect(config).not.toBeNull();
      expect(config?.isDefault).toBe(true);
    });

    it("should fallback to highest priority model if no default", async () => {
      // Arrange
      (prismaService.aIModel.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockReasoningModel);

      // Act
      const config = await service.getDefaultModelByType(AIModelType.CHAT);

      // Assert
      expect(config).not.toBeNull();
    });
  });

  describe("getReasoningModelConfig", () => {
    it("should return model marked as reasoning in database", async () => {
      // Arrange
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(
        mockReasoningModel,
      );

      // Act
      const config = await service.getReasoningModelConfig();

      // Assert
      expect(prismaService.aIModel.findFirst).toHaveBeenCalledWith({
        where: {
          modelType: "CHAT",
          isEnabled: true,
          isReasoning: true,
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });
      expect(config?.isReasoning).toBe(true);
    });

    it("should fallback to known reasoning models by name", async () => {
      // Arrange
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(null);
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockReasoningModel,
      ]);

      // Act
      const config = await service.getReasoningModelConfig();

      // Assert
      expect(config?.modelId).toBe("o1-preview");
    });

    it("should return null if no reasoning model found", async () => {
      // Arrange
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(null);
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([]);

      // Act
      const config = await service.getReasoningModelConfig();

      // Assert
      expect(config).toBeNull();
    });
  });

  describe("getTimeoutForModel", () => {
    it("should return higher timeout for reasoning models", () => {
      // Act
      const timeout = service.getTimeoutForModel("o1-preview", 8000);

      // Assert
      expect(timeout).toBeGreaterThanOrEqual(300000); // At least 5 minutes
    });

    it("should return standard timeout for regular models", () => {
      // Act
      const timeout = service.getTimeoutForModel("gpt-4o", 4000);

      // Assert
      expect(timeout).toBeGreaterThanOrEqual(120000); // At least 2 minutes
      expect(timeout).toBeLessThan(300000); // Less than 5 minutes
    });

    it("should increase timeout for higher token counts", () => {
      // Act
      const smallTimeout = service.getTimeoutForModel("gpt-4o", 1000);
      const largeTimeout = service.getTimeoutForModel("gpt-4o", 10000);

      // Assert
      expect(largeTimeout).toBeGreaterThan(smallTimeout);
    });

    it("should cap timeout at maximum values", () => {
      // Act
      const timeout = service.getTimeoutForModel("gpt-4o", 1000000);

      // Assert
      expect(timeout).toBeLessThanOrEqual(600000); // Max 10 minutes for regular
    });
  });

  describe("getEnabledModelsForFrontend", () => {
    it("should return models without API keys", async () => {
      // Arrange
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel,
        mockReasoningModel,
      ]);

      // Act
      const models = await service.getEnabledModelsForFrontend();

      // Assert
      expect(models).toHaveLength(2);
      expect(models[0]).not.toHaveProperty("apiKey");
      expect(models[0]).toHaveProperty("modelId");
      expect(models[0]).toHaveProperty("provider");
    });

    it("should filter by modelType when specified", async () => {
      // Arrange
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel,
      ]);

      // Act
      await service.getEnabledModelsForFrontend(AIModelType.CHAT);

      // Assert
      expect(prismaService.aIModel.findMany).toHaveBeenCalledWith({
        where: {
          isEnabled: true,
          modelType: AIModelType.CHAT,
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: expect.any(Object),
      });
    });

    it("should include icon URLs", async () => {
      // Arrange
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel,
      ]);

      // Act
      const models = await service.getEnabledModelsForFrontend();

      // Assert
      expect(models[0]).toHaveProperty("iconUrl");
      expect(models[0].iconUrl).toContain("/icons/ai/");
    });
  });

  describe("getApiFormatForProvider", () => {
    it("should return anthropic for Claude", () => {
      expect(service.getApiFormatForProvider("anthropic")).toBe("anthropic");
      expect(service.getApiFormatForProvider("claude")).toBe("anthropic");
    });

    it("should return google for Gemini", () => {
      expect(service.getApiFormatForProvider("google")).toBe("google");
      expect(service.getApiFormatForProvider("gemini")).toBe("google");
    });

    it("should return xai for Grok", () => {
      expect(service.getApiFormatForProvider("xai")).toBe("xai");
      expect(service.getApiFormatForProvider("grok")).toBe("xai");
    });

    it("should default to openai for unknown providers", () => {
      expect(service.getApiFormatForProvider("unknown")).toBe("openai");
      expect(service.getApiFormatForProvider("openai")).toBe("openai");
    });
  });

  describe("getAllModelsForDiagnostics", () => {
    it("should return model diagnostics with API key flags", async () => {
      // Arrange
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel,
        mockGeminiModel,
      ]);

      // Act
      const diagnostics = await service.getAllModelsForDiagnostics();

      // Assert
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics[0]).toHaveProperty("hasApiKey", true);
      expect(diagnostics[0]).toHaveProperty("hasSecretKey", false);
      expect(diagnostics[1]).toHaveProperty("hasApiKey", false);
      expect(diagnostics[1]).toHaveProperty("hasSecretKey", true);
    });
  });
});
