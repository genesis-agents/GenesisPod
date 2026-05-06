import { Test, TestingModule } from "@nestjs/testing";
import { AiModelConfigService } from "../ai-model-config.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { SecretsService } from "@/modules/ai-infra/secrets/secrets.service";
import { UserApiKeysService } from "@/modules/ai-infra/credentials/user-api-keys/user-api-keys.service";
import { AIModelType } from "@prisma/client";

describe("AiModelConfigService", () => {
  let service: AiModelConfigService;
  let prismaService: jest.Mocked<PrismaService>;
  let secretsService: jest.Mocked<SecretsService>;
  let userApiKeysService: jest.Mocked<UserApiKeysService>;

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
      userApiKey: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const mockSecretsService = {
      getValueInternal: jest.fn(),
    };

    const mockUserApiKeysService = {
      getPersonalKey: jest.fn().mockResolvedValue(null),
      getDonatedKey: jest.fn().mockResolvedValue(null),
      getAvailableProviders: jest.fn().mockResolvedValue([]),
    };

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
    userApiKeysService = module.get(UserApiKeysService);

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

    it("should trim API key value from secretKey", async () => {
      // Arrange - model with secretKey that returns a value with whitespace
      (secretsService.getValueInternal as jest.Mock).mockResolvedValue(
        "  sk-test-key  ",
      );
      const model = { ...mockGeminiModel }; // has secretKey: "GEMINI_API_KEY"

      // Act
      const apiKey = await service.getApiKeyForModel(model as any);

      // Assert
      expect(apiKey).toBe("sk-test-key");
    });

    it("should return null if secretKey not found (no apiKey fallback)", async () => {
      // Arrange
      const modelWithSecret = { ...mockGeminiModel, apiKey: "fallback-key" };
      (secretsService.getValueInternal as jest.Mock).mockResolvedValue(null);

      // Act
      const apiKey = await service.getApiKeyForModel(modelWithSecret as any);

      // Assert - Priority 4 (plain apiKey) removed; returns null when secret not found
      expect(apiKey).toBeNull();
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

    // ─── BYOK isUserKey 标记（W4-byok 2026-05-05 真根因覆盖）──────────

    it("isUserKey=true when user has PERSONAL key for matching provider", async () => {
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel, // openai
        mockGeminiModel, // google
      ]);
      (prismaService.userApiKey.findMany as jest.Mock).mockResolvedValue([
        { provider: "openai" }, // user has openai key
      ]);

      const models = await service.getEnabledModelsForFrontend(
        undefined,
        "user-1",
      );

      const openai = models.find((m) => m.provider.toLowerCase() === "openai");
      const google = models.find((m) => m.provider.toLowerCase() === "google");
      expect(openai?.isUserKey).toBe(true);
      expect(google?.isUserKey).toBeUndefined(); // 没 isUserKey 字段（mapModel conditional spread）
    });

    it("provider name comparison is case-insensitive", async () => {
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        { ...mockChatModel, provider: "OpenAI" }, // 大小写混
      ]);
      (prismaService.userApiKey.findMany as jest.Mock).mockResolvedValue([
        { provider: "openai" }, // 用户存的是小写
      ]);

      const models = await service.getEnabledModelsForFrontend(
        undefined,
        "user-1",
      );

      expect(models[0].isUserKey).toBe(true);
    });

    it("no isUserKey when no userId passed (anonymous)", async () => {
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel,
      ]);

      const models = await service.getEnabledModelsForFrontend();

      // 没 userId → 不查 user keys → 全 false
      expect(models[0].isUserKey).toBeUndefined();
    });

    it("no isUserKey when user has no PERSONAL keys", async () => {
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel,
      ]);
      (prismaService.userApiKey.findMany as jest.Mock).mockResolvedValue([]);

      const models = await service.getEnabledModelsForFrontend(
        undefined,
        "user-1",
      );

      expect(models[0].isUserKey).toBeUndefined();
    });

    it("graceful degrade when user key DB lookup fails", async () => {
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel,
      ]);
      (prismaService.userApiKey.findMany as jest.Mock).mockRejectedValue(
        new Error("DB unreachable"),
      );

      // 不抛错，退回无 BYOK 模式
      const models = await service.getEnabledModelsForFrontend(
        undefined,
        "user-1",
      );

      expect(models).toHaveLength(1);
      expect(models[0].isUserKey).toBeUndefined();
    });

    it("BYOK_DEFAULT_MODELS dynamically generates xai models when user has xai key but no enabled xai model", async () => {
      // DB 只有 openai enabled，用户配了 xai PERSONAL key
      (prismaService.aIModel.findMany as jest.Mock)
        .mockResolvedValueOnce([mockChatModel]) // 第一次调用：enabled openai
        .mockResolvedValueOnce([]); // 第二次：disabled xai (none)
      (prismaService.userApiKey.findMany as jest.Mock).mockResolvedValue([
        { provider: "xai" },
      ]);

      const models = await service.getEnabledModelsForFrontend(
        AIModelType.CHAT,
        "user-1",
      );

      // 应该有 openai (system, no isUserKey) + xai grok (BYOK 生成, isUserKey=true)
      const xaiModels = models.filter((m) =>
        m.provider.toLowerCase().includes("xai"),
      );
      expect(xaiModels.length).toBeGreaterThan(0);
      xaiModels.forEach((m) => {
        expect(m.isUserKey).toBe(true);
      });
    });

    it("preserves model ordering (admin isDefault first)", async () => {
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        { ...mockChatModel, isDefault: true, displayName: "GPT-5 Default" },
        { ...mockReasoningModel, isDefault: false, displayName: "O1 Sub" },
      ]);

      const models = await service.getEnabledModelsForFrontend();

      // findMany 已按 [{isDefault: 'desc'}, {name: 'asc'}] 排序，service 不应重排
      expect(models[0].isDefault).toBe(true);
      expect(models[1].isDefault).toBe(false);
    });

    it("user has key for provider AND BYOK extra → both branches kept distinct", async () => {
      // openai 同时是 system enabled + 用户配 key（同 provider）
      // → openai 模型 isUserKey=true
      // 用户额外配 xai key 但 xai 没 enabled → BYOK_DEFAULT_MODELS 生成
      (prismaService.aIModel.findMany as jest.Mock)
        .mockResolvedValueOnce([mockChatModel])
        .mockResolvedValueOnce([]); // disabled xai not in DB
      (prismaService.userApiKey.findMany as jest.Mock).mockResolvedValue([
        { provider: "openai" },
        { provider: "xai" },
      ]);

      const models = await service.getEnabledModelsForFrontend(
        AIModelType.CHAT,
        "user-1",
      );

      const openai = models.find((m) => m.provider.toLowerCase() === "openai");
      const xai = models.find((m) => m.provider.toLowerCase().includes("xai"));
      expect(openai?.isUserKey).toBe(true);
      expect(xai?.isUserKey).toBe(true);
    });

    it("returns empty array when DB throws on main findMany (defensive)", async () => {
      (prismaService.aIModel.findMany as jest.Mock).mockRejectedValue(
        new Error("DB down"),
      );

      const models = await service.getEnabledModelsForFrontend();

      expect(Array.isArray(models)).toBe(true);
      expect(models).toHaveLength(0);
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

  // ==================== resolveApiKey - uncovered branches ====================

  describe("resolveApiKey - additional coverage", () => {
    // BYOK v2: 无 userId 时只保留系统 Secret 回退路径（过渡期，供旧定时任务使用）。
    // 捐赠共享池已废弃，getDonatedKey 在 BYOK v2 代码路径中不再被调用。
    it("falls back to system secret when userId is absent and model.secretKey exists", async () => {
      (secretsService.getValueInternal as jest.Mock).mockResolvedValue(
        "sys-secret-value",
      );
      const result = await service.resolveApiKey(mockGeminiModel as any);
      expect(result).toEqual({
        apiKey: "sys-secret-value",
        source: "system",
      });
    });

    it("returns null when userId is absent and secretKey is missing", async () => {
      (secretsService.getValueInternal as jest.Mock).mockResolvedValue(null);
      const modelWithNoSecret = { ...mockChatModel, secretKey: null };
      const result = await service.resolveApiKey(modelWithNoSecret as any);
      expect(result).toBeNull();
    });

    it("returns null when secretKey is configured but not found", async () => {
      (secretsService.getValueInternal as jest.Mock).mockResolvedValue(null);
      const result = await service.resolveApiKey(mockGeminiModel as any);
      expect(result).toBeNull();
    });
  });

  // ==================== getEnabledModelsForFrontend - BYOK paths ====================

  describe("getEnabledModelsForFrontend - BYOK coverage", () => {
    it("should generate BYOK default models for providers not in DB", async () => {
      // Enabled models: none from anthropic
      (prismaService.aIModel.findMany as jest.Mock)
        .mockResolvedValueOnce([mockChatModel]) // enabled models (openai)
        .mockResolvedValueOnce([]); // disabled anthropic models - none in DB

      const _mockUserApiKeysService = (service as any).userApiKeysService as {
        getPersonalKey: jest.Mock;
        getDonatedKey: jest.Mock;
      };
      // Simulate user having anthropic key
      (prismaService as any).userApiKey = {
        findMany: jest.fn().mockResolvedValue([{ provider: "anthropic" }]),
      };

      const result = await service.getEnabledModelsForFrontend(
        undefined,
        "user-with-anthropic",
      );

      // Should include enabled openai model + BYOK anthropic models
      const byokModels = result.filter(
        (m) => (m as Record<string, unknown>).isByokGenerated,
      );
      expect(byokModels.length).toBeGreaterThan(0);
      // They should be marked with isUserKey
      byokModels.forEach((m) => expect(m.isUserKey).toBe(true));
    });

    it("should include disabled models from DB for user's provider", async () => {
      const disabledAnthropicModel = {
        ...mockChatModel,
        id: "disabled-model",
        provider: "anthropic",
        isEnabled: false,
        icon: null,
        color: null,
        description: null,
      };

      // Enabled models: only openai
      (prismaService.aIModel.findMany as jest.Mock)
        .mockResolvedValueOnce([mockChatModel]) // enabled models
        .mockResolvedValueOnce([disabledAnthropicModel]); // disabled anthropic models found in DB

      (prismaService as any).userApiKey = {
        findMany: jest.fn().mockResolvedValue([{ provider: "anthropic" }]),
      };

      const result = await service.getEnabledModelsForFrontend(
        undefined,
        "user-anthropic",
      );

      // Should include openai + the disabled anthropic model (with isUserKey)
      const anthropicModels = result.filter(
        (m) => m.provider.toLowerCase() === "anthropic",
      );
      expect(anthropicModels.length).toBeGreaterThan(0);
      anthropicModels.forEach((m) => expect(m.isUserKey).toBe(true));
    });

    it("should handle user API key fetch error gracefully", async () => {
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValueOnce([
        mockChatModel,
      ]);
      (prismaService as any).userApiKey = {
        findMany: jest.fn().mockRejectedValue(new Error("Key fetch error")),
      };

      const result = await service.getEnabledModelsForFrontend(
        undefined,
        "user-123",
      );

      // Should still return enabled models even if user key fetch fails
      expect(result).toHaveLength(1);
    });

    it("should filter BYOK generated models by modelType", async () => {
      // User has anthropic key, but filter by IMAGE modelType
      (prismaService.aIModel.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // no enabled models
        .mockResolvedValueOnce([]); // no disabled models
      (prismaService as any).userApiKey = {
        findMany: jest.fn().mockResolvedValue([{ provider: "anthropic" }]),
      };

      // anthropic BYOK models are all CHAT type, filtering by IMAGE should return none from BYOK
      const result = await service.getEnabledModelsForFrontend(
        "IMAGE" as any,
        "user-123",
      );

      const byokModels = result.filter(
        (m) => (m as Record<string, unknown>).isByokGenerated,
      );
      // All anthropic default models are CHAT type, filtering by IMAGE = 0 BYOK models
      expect(byokModels.length).toBe(0);
    });
  });

  // ==================== findDisabledModelForUser (via getModelConfig) ====================

  describe("findDisabledModelForUser - via getModelConfig", () => {
    it("should return disabled model config when user has provider key", async () => {
      const { RequestContext } =
        await import("../../../../../common/context/request-context");
      const spy = jest
        .spyOn(RequestContext, "getUserId")
        .mockReturnValue("user-byok-123");

      // Cache miss, DB query for enabled models returns nothing
      (prismaService.aIModel.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // no enabled model found
        .mockResolvedValueOnce({
          ...mockChatModel,
          isEnabled: false,
          provider: "openai",
        }); // disabled model found

      // User has key for openai
      (userApiKeysService.getPersonalKey as jest.Mock).mockResolvedValue({
        apiKey: "user-openai-key",
        apiEndpoint: null,
      });

      const result = await service.getModelConfig("gpt-4o-disabled");

      spy.mockRestore();
      expect(result).not.toBeNull();
      expect(result?.provider).toBe("openai");
    });

    it("should return null when user has no key for provider", async () => {
      const { RequestContext } =
        await import("../../../../../common/context/request-context");
      const spy = jest
        .spyOn(RequestContext, "getUserId")
        .mockReturnValue("user-no-key-123");

      (prismaService.aIModel.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // no enabled model
        .mockResolvedValueOnce({
          ...mockChatModel,
          isEnabled: false,
        }); // disabled model found

      // User has no key
      (userApiKeysService.getPersonalKey as jest.Mock).mockResolvedValue(null);

      const result = await service.getModelConfig("gpt-4o-disabled-no-key");

      spy.mockRestore();
      expect(result).toBeNull();
    });

    it("should return null when no user context", async () => {
      const { RequestContext } =
        await import("../../../../../common/context/request-context");
      const spy = jest
        .spyOn(RequestContext, "getUserId")
        .mockReturnValue(undefined);

      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getModelConfig("some-disabled-model");
      spy.mockRestore();
      expect(result).toBeNull();
    });
  });

  // ==================== getModelsByProvider + getFirstModelByProvider ====================

  describe("getModelsByProvider", () => {
    it("should return models matching provider name", async () => {
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel,
      ]);

      const result = await service.getModelsByProvider("openai");
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("openai");
    });
  });

  describe("getFirstModelByProvider", () => {
    it("should return first model with apiKey for given provider", async () => {
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(
        mockChatModel,
      );

      const result = await service.getFirstModelByProvider("openai");
      expect(result?.modelId).toBe("gpt-4o");
    });

    it("should return null when no matching model exists", async () => {
      (prismaService.aIModel.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getFirstModelByProvider("nonexistent");
      expect(result).toBeNull();
    });
  });

  // ==================== getIconUrl (via getEnabledModelsForFrontend) ====================

  describe("getIconUrl - provider-based icon routing", () => {
    // getIconUrl checks name first then provider. Each case uses a unique combination
    // to ensure the expected icon branch fires correctly.
    const iconTestCases = [
      // Name-based detection (provider is neutral "custom" to avoid early matches)
      {
        name: "grok-model",
        provider: "custom",
        expectedIcon: "/icons/ai/grok.svg",
      },
      {
        name: "chatgpt-4",
        provider: "custom",
        expectedIcon: "/icons/ai/openai.svg",
      },
      {
        name: "claude-3",
        provider: "custom",
        expectedIcon: "/icons/ai/claude.svg",
      },
      {
        name: "gemini-flash",
        provider: "custom",
        expectedIcon: "/icons/ai/gemini.svg",
      },
      {
        name: "deepseek-chat",
        provider: "custom",
        expectedIcon: "/icons/ai/deepseek.svg",
      },
      {
        name: "qwen-max",
        provider: "custom",
        expectedIcon: "/icons/ai/qwen.svg",
      },
      {
        name: "kimi-v1",
        provider: "custom",
        expectedIcon: "/icons/ai/kimi.svg",
      },
      {
        name: "glm-4",
        provider: "custom",
        expectedIcon: "/icons/ai/zhipu.svg",
      },
      {
        name: "doubao-turbo",
        provider: "custom",
        expectedIcon: "/icons/ai/doubao.svg",
      },
      // Provider-based detection (name is neutral "unknown-model")
      {
        name: "unknown-model",
        provider: "xai",
        expectedIcon: "/icons/ai/grok.svg",
      },
      {
        name: "unknown-model",
        provider: "anthropic",
        expectedIcon: "/icons/ai/claude.svg",
      },
      {
        name: "unknown-model",
        provider: "google",
        expectedIcon: "/icons/ai/gemini.svg",
      },
      {
        name: "unknown-model",
        provider: "deepseek",
        expectedIcon: "/icons/ai/deepseek.svg",
      },
      {
        name: "unknown-model",
        provider: "alibaba",
        expectedIcon: "/icons/ai/qwen.svg",
      },
      {
        name: "unknown-model",
        provider: "moonshot",
        expectedIcon: "/icons/ai/kimi.svg",
      },
      {
        name: "unknown-model",
        provider: "zhipu",
        expectedIcon: "/icons/ai/zhipu.svg",
      },
      {
        name: "unknown-model",
        provider: "bytedance",
        expectedIcon: "/icons/ai/doubao.svg",
      },
      {
        name: "unknown-model",
        provider: "openai",
        expectedIcon: "/icons/ai/openai.svg",
      },
    ];

    it.each(iconTestCases)(
      "maps name='$name' provider='$provider' to '$expectedIcon'",
      async ({ name, provider, expectedIcon }) => {
        const modelRow = {
          ...mockChatModel,
          id: `test-${name}`,
          name,
          displayName: name,
          provider,
          modelId: name,
          icon: null,
          color: null,
          description: null,
        };
        (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
          modelRow,
        ]);

        const result = await service.getEnabledModelsForFrontend();
        expect(result[0].iconUrl).toBe(expectedIcon);
      },
    );

    it("returns empty string for unrecognized model/provider", async () => {
      const modelRow = {
        ...mockChatModel,
        name: "mystery-model",
        displayName: "Mystery",
        provider: "unknown-corp",
        modelId: "mystery-1",
        icon: null,
        color: null,
        description: null,
      };
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        modelRow,
      ]);

      const result = await service.getEnabledModelsForFrontend();
      expect(result[0].iconUrl).toBe("");
    });
  });

  // ==================== buildModelConfig - additional branches ====================

  describe("buildModelConfig - additional inference branches", () => {
    it("should use DB apiFormat when it does not conflict with provider", async () => {
      // xai provider with xai apiFormat - no conflict
      const row = {
        ...mockChatModel,
        provider: "xai",
        modelId: "grok-3",
        name: "grok-3",
        apiFormat: "xai",
      };
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([row]);
      await service.refreshModelConfigCache();

      const config = await service.getModelConfig("grok-3");
      expect(config?.apiFormat).toBe("xai");
    });

    it("should use 'max_tokens' tokenParamName for non-reasoning model without DB value", async () => {
      const row = {
        ...mockChatModel,
        modelId: "gpt-4o-mini",
        name: "gpt-4o-mini",
        isReasoning: false,
        tokenParamName: null,
      };
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([row]);
      await service.refreshModelConfigCache();

      const config = await service.getModelConfig("gpt-4o-mini");
      expect(config?.tokenParamName).toBe("max_tokens");
    });

    it("should use default 300000ms timeout for reasoning model without DB value", async () => {
      const row = {
        ...mockChatModel,
        modelId: "o1-mini",
        name: "o1-mini",
        isReasoning: true,
        defaultTimeoutMs: null,
      };
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([row]);
      await service.refreshModelConfigCache();

      const config = await service.getModelConfig("o1-mini");
      expect(config?.defaultTimeoutMs).toBe(300000);
    });

    it("should use default 120000ms timeout for non-reasoning model without DB value", async () => {
      const row = {
        ...mockChatModel,
        modelId: "gpt-4-standard",
        name: "gpt-4-standard",
        isReasoning: false,
        defaultTimeoutMs: null,
      };
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([row]);
      await service.refreshModelConfigCache();

      const config = await service.getModelConfig("gpt-4-standard");
      expect(config?.defaultTimeoutMs).toBe(120000);
    });

    it("should default priority to 50 when not set", async () => {
      const row = {
        ...mockChatModel,
        modelId: "gpt-no-priority",
        name: "gpt-no-priority",
        priority: null,
      };
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([row]);
      await service.refreshModelConfigCache();

      const config = await service.getModelConfig("gpt-no-priority");
      expect(config?.priority).toBe(50);
    });
  });

  // ==================== getModelById - additional path coverage ====================

  describe("getModelById - additional paths", () => {
    it("should find non-CHAT model by direct query when not in CHAT cache", async () => {
      // Cache has only CHAT models, but IMAGE model exists
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel,
      ]);
      await service.refreshModelConfigCache();

      const imageModel = {
        ...mockChatModel,
        modelId: "dall-e-3",
        name: "dall-e-3",
        modelType: "IMAGE_GENERATION",
      };

      // First findFirst (from getModelConfig cache miss) = null, then direct query
      (prismaService.aIModel.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // CHAT/CHAT_FAST query miss
        .mockResolvedValueOnce(imageModel); // direct all-types query

      const { RequestContext } = jest.requireMock(
        "../../../../../common/context/request-context",
      );
      RequestContext.getUserId.mockReturnValue(null);

      const result = await service.getModelById("dall-e-3");
      expect(result?.modelId).toBe("dall-e-3");
    });

    it("should handle UUID-based lookup error gracefully", async () => {
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([]);
      await service.refreshModelConfigCache();

      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      (prismaService.aIModel.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // getModelConfig miss
        .mockRejectedValueOnce(new Error("DB error on uuid")) // UUID lookup error
        .mockResolvedValueOnce(null); // direct query

      const { RequestContext } = jest.requireMock(
        "../../../../../common/context/request-context",
      );
      RequestContext.getUserId.mockReturnValue(null);

      const result = await service.getModelById(uuid);
      expect(result).toBeNull();
    });
  });

  // ==================== getAllEnabledModelsByType - error path ====================

  describe("getAllEnabledModelsByType - additional coverage", () => {
    it("should not apply modelId filter when excludeModelIds is empty", async () => {
      (prismaService.aIModel.findMany as jest.Mock).mockResolvedValue([
        mockChatModel,
      ]);

      await service.getAllEnabledModelsByType("CHAT" as any);

      const callArg = (prismaService.aIModel.findMany as jest.Mock).mock
        .calls[0][0];
      // modelId filter should NOT be present when excludeModelIds is []
      expect(callArg.where.modelId).toBeUndefined();
    });
  });

  // ==================== getDefaultModelByType - error path ====================

  describe("getDefaultModelByType - error path", () => {
    it("should return null and log error on DB failure", async () => {
      (prismaService.aIModel.findFirst as jest.Mock).mockRejectedValue(
        new Error("DB failure"),
      );

      const result = await service.getDefaultModelByType("CHAT" as any);
      expect(result).toBeNull();
    });
  });
});
