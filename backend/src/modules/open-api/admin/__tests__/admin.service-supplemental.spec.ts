/**
 * AdminService Supplemental Tests
 *
 * Covers methods NOT tested in admin.service.spec.ts:
 * - diagnoseAIModels()
 * - getAIModelsByType()
 * - getDefaultModelByType() — no default found branch
 * - getDefaultModelByTypeInternal()
 * - setDefaultAIModelForType()
 * - getAllModelTypeDefaults()
 * - getSmtpSettings() — defaults, password masking
 * - updateSmtpSettings() — skip masked password
 * - testSmtpConnection() — incomplete config, network error
 * - validateAndCorrectModelConfig() branches via createAIModel/updateAIModel:
 *   - maxTokens correction when exceeds known limit
 *   - non-reasoning model auto-sets max_tokens / supportsTemperature=true
 */

import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { AdminService } from "../admin.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { SecretsService } from "../../../ai-infra/secrets/secrets.service";
import { UserManagementService } from "../services/user-management.service";
import { ResourceManagementService } from "../services/resource-management.service";
import { StatisticsService } from "../services/statistics.service";
import { AIModelType } from "@prisma/client";

describe("AdminService (supplemental)", () => {
  let service: AdminService;

  const mockPrismaService = {
    aIModel: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    systemSetting: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    rawData: { count: jest.fn(), deleteMany: jest.fn() },
    deduplicationRecord: { count: jest.fn(), deleteMany: jest.fn() },
    note: { deleteMany: jest.fn() },
    comment: { deleteMany: jest.fn() },
    resource: { count: jest.fn(), deleteMany: jest.fn() },
    collectionTask: { updateMany: jest.fn() },
    dataSource: { updateMany: jest.fn() },
    creditAccount: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      findUnique: jest.fn(),
    },
    creditTransaction: { findMany: jest.fn(), count: jest.fn() },
    skillConfig: { upsert: jest.fn() },
  };

  const mockUserMgmtService = {
    getAllUsers: jest.fn(),
    getUserDetail: jest.fn(),
    updateUserRole: jest.fn(),
    toggleUserStatus: jest.fn(),
    isUserAdmin: jest.fn(),
    getUserStats: jest.fn(),
    getUserLoginHistory: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    getUserCredits: jest.fn(),
    grantCredits: jest.fn(),
    toggleCreditFreeze: jest.fn(),
  };

  const mockResourceMgmtService = {
    getResourceById: jest.fn(),
    deleteResource: jest.fn(),
    deleteResources: jest.fn(),
  };

  const mockStatisticsService = {
    getSystemStats: jest.fn(),
    getResourceStats: jest.fn(),
    getOverviewStats: jest.fn(),
  };

  const mockSecretsService = {
    getValue: jest.fn(),
    getValueInternal: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SecretsService, useValue: mockSecretsService },
        { provide: UserManagementService, useValue: mockUserMgmtService },
        {
          provide: ResourceManagementService,
          useValue: mockResourceMgmtService,
        },
        { provide: StatisticsService, useValue: mockStatisticsService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  // ==================== diagnoseAIModels ====================

  describe("diagnoseAIModels()", () => {
    it("should return diagnostic info with masked apiKey prefix and length", async () => {
      mockPrismaService.aIModel.findMany.mockResolvedValue([
        {
          id: "model-1",
          name: "GPT-4o",
          displayName: "GPT-4o",
          provider: "openai",
          modelId: "gpt-4o",
          modelType: "CHAT",
          apiEndpoint: "https://api.openai.com",
          isEnabled: true,
          isDefault: true,
          apiKey: "sk-abcdef1234567890",
          secretKey: null,
          maxTokens: 4096,
          temperature: 0.7,
          updatedAt: new Date(),
        },
      ]);

      const result = await service.diagnoseAIModels();

      expect(result).toHaveLength(1);
      expect(result[0].hasApiKey).toBe(true);
      expect(result[0].apiKeyLength).toBe(19);
      expect(result[0].apiKeyPrefix).toContain("...");
      expect(result[0].apiKeyPrefix).not.toContain("abcdef1234567890");
    });

    it("should return hasApiKey=false and null prefix when no apiKey or secretKey", async () => {
      mockPrismaService.aIModel.findMany.mockResolvedValue([
        {
          id: "model-2",
          name: "Claude",
          displayName: "Claude",
          provider: "anthropic",
          modelId: "claude-3",
          modelType: "CHAT",
          apiEndpoint: "https://api.anthropic.com",
          isEnabled: false,
          isDefault: false,
          apiKey: null,
          secretKey: null,
          maxTokens: 8000,
          temperature: 0.7,
          updatedAt: new Date(),
        },
      ]);

      const result = await service.diagnoseAIModels();

      expect(result[0].hasApiKey).toBe(false);
      expect(result[0].apiKeyLength).toBe(0);
      expect(result[0].apiKeyPrefix).toBeNull();
    });

    it("should return hasApiKey=true when secretKey is set (even without apiKey)", async () => {
      mockPrismaService.aIModel.findMany.mockResolvedValue([
        {
          id: "model-3",
          name: "Model via Secret",
          displayName: "Model",
          provider: "openai",
          modelId: "gpt-4-secret",
          modelType: "CHAT",
          apiEndpoint: "https://api.openai.com",
          isEnabled: true,
          isDefault: false,
          apiKey: null,
          secretKey: "my-secret-name",
          maxTokens: 4096,
          temperature: 0.7,
          updatedAt: new Date(),
        },
      ]);

      const result = await service.diagnoseAIModels();

      expect(result[0].hasApiKey).toBe(true);
    });

    it("should return empty array when no models exist", async () => {
      mockPrismaService.aIModel.findMany.mockResolvedValue([]);

      const result = await service.diagnoseAIModels();

      expect(result).toHaveLength(0);
    });
  });

  // ==================== getAIModelsByType ====================

  describe("getAIModelsByType()", () => {
    it("should return enabled models of a given type with masked apiKey", async () => {
      mockPrismaService.aIModel.findMany.mockResolvedValue([
        {
          id: "model-1",
          name: "Stable Diffusion",
          apiKey: "sd-longkey1234567890",
          secretKey: null,
          modelType: "IMAGE_GENERATION",
          isEnabled: true,
          isDefault: true,
        },
      ]);

      const result = await service.getAIModelsByType(
        AIModelType.IMAGE_GENERATION,
      );

      expect(result).toHaveLength(1);
      expect(result[0].apiKey).toContain("****");
      expect(result[0].hasApiKey).toBe(true);
    });

    it("should return models with null apiKey when no key configured", async () => {
      mockPrismaService.aIModel.findMany.mockResolvedValue([
        {
          id: "model-2",
          name: "Embedding Model",
          apiKey: null,
          secretKey: null,
          modelType: "EMBEDDING",
          isEnabled: true,
          isDefault: false,
        },
      ]);

      const result = await service.getAIModelsByType(AIModelType.EMBEDDING);

      expect(result[0].apiKey).toBeNull();
      expect(result[0].hasApiKey).toBe(false);
    });
  });

  // ==================== getDefaultModelByType ====================

  describe("getDefaultModelByType()", () => {
    it("should return default model when one exists", async () => {
      mockPrismaService.aIModel.findFirst.mockResolvedValueOnce({
        id: "model-default",
        name: "Default Chat",
        displayName: "Default Chat",
        modelId: "gpt-4o",
        provider: "openai",
        apiKey: "sk-12345678901234",
        secretKey: null,
        isDefault: true,
      });

      const result = await service.getDefaultModelByType(AIModelType.CHAT);

      expect(result).not.toBeNull();
      expect(result!.hasApiKey).toBe(true);
      expect(result!.apiKey).toContain("****");
    });

    it("should fall back to first enabled model when no default is set", async () => {
      // First call: no default found
      mockPrismaService.aIModel.findFirst
        .mockResolvedValueOnce(null)
        // Second call: fallback to first enabled
        .mockResolvedValueOnce({
          id: "model-fallback",
          name: "Fallback Model",
          displayName: "Fallback",
          modelId: "gpt-4",
          provider: "openai",
          apiKey: null,
          secretKey: null,
          isDefault: false,
        });

      const result = await service.getDefaultModelByType(AIModelType.CHAT);

      expect(result).not.toBeNull();
      expect(result!.id).toBe("model-fallback");
      expect(mockPrismaService.aIModel.findFirst).toHaveBeenCalledTimes(2);
    });

    it("should return null when no enabled model exists for type", async () => {
      mockPrismaService.aIModel.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.getDefaultModelByType(AIModelType.RERANK);

      expect(result).toBeNull();
    });
  });

  // ==================== getDefaultModelByTypeInternal ====================

  describe("getDefaultModelByTypeInternal()", () => {
    it("should return full model object including apiKey", async () => {
      const fullModel = {
        id: "model-int",
        name: "Internal Model",
        apiKey: "sk-internal-key",
        modelType: "CHAT",
        isDefault: true,
      };
      mockPrismaService.aIModel.findFirst.mockResolvedValueOnce(fullModel);

      const result = await service.getDefaultModelByTypeInternal(
        AIModelType.CHAT,
      );

      // Returns raw model with no masking
      expect(result).toEqual(fullModel);
    });

    it("should fall back to first enabled model when no default", async () => {
      const fallbackModel = { id: "fb-1", apiKey: null };
      mockPrismaService.aIModel.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(fallbackModel);

      const result = await service.getDefaultModelByTypeInternal(
        AIModelType.EMBEDDING,
      );

      expect(result).toEqual(fallbackModel);
    });

    it("should return null when no models available", async () => {
      mockPrismaService.aIModel.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.getDefaultModelByTypeInternal(
        AIModelType.MULTIMODAL,
      );

      expect(result).toBeNull();
    });
  });

  // ==================== setDefaultAIModelForType ====================

  describe("setDefaultAIModelForType()", () => {
    it("should clear defaults for same type and set new default", async () => {
      mockPrismaService.aIModel.findUnique.mockResolvedValue({
        id: "model-1",
        name: "New Default",
        modelType: "CHAT",
      });
      mockPrismaService.aIModel.updateMany.mockResolvedValue({ count: 3 });
      mockPrismaService.aIModel.update.mockResolvedValue({
        id: "model-1",
        name: "New Default",
        modelType: "CHAT",
        isDefault: true,
        apiKey: null,
        secretKey: null,
      });

      const result = await service.setDefaultAIModelForType("model-1");

      expect(mockPrismaService.aIModel.updateMany).toHaveBeenCalledWith({
        where: { modelType: "CHAT" },
        data: { isDefault: false },
      });
      expect(result.hasApiKey).toBe(false);
    });

    it("should throw NotFoundException when model not found", async () => {
      mockPrismaService.aIModel.findUnique.mockResolvedValue(null);

      await expect(
        service.setDefaultAIModelForType("not-found"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== getAllModelTypeDefaults ====================

  describe("getAllModelTypeDefaults()", () => {
    it("should return defaults for all standard model types", async () => {
      // findFirst returns null (no defaults), then null (no fallback) → getDefaultModelByType returns null
      mockPrismaService.aIModel.findFirst.mockResolvedValue(null);
      mockPrismaService.aIModel.count.mockResolvedValue(0);

      const result = await service.getAllModelTypeDefaults();

      // Should have 6 types: CHAT, IMAGE_GENERATION, IMAGE_EDITING, MULTIMODAL, EMBEDDING, RERANK
      expect(Object.keys(result)).toHaveLength(6);
      expect(result["CHAT"]).toBeDefined();
      expect(result["CHAT"].defaultModel).toBeNull();
      expect(result["CHAT"].availableModels).toBe(0);
    });

    it("should include available model count for each type", async () => {
      mockPrismaService.aIModel.findFirst.mockResolvedValue({
        id: "m-1",
        name: "GPT-4",
        displayName: "GPT-4",
        modelId: "gpt-4",
        provider: "openai",
        apiKey: null,
        secretKey: null,
      });
      mockPrismaService.aIModel.count.mockResolvedValue(5);

      const result = await service.getAllModelTypeDefaults();

      expect(result["CHAT"].availableModels).toBe(5);
      expect(result["CHAT"].defaultModel).not.toBeNull();
    });
  });

  // ==================== getSmtpSettings ====================

  describe("getSmtpSettings()", () => {
    it("should return SMTP settings with password masked", async () => {
      mockPrismaService.systemSetting.findUnique
        .mockResolvedValueOnce({ key: "smtp.host", value: '"smtp.gmail.com"' })
        .mockResolvedValueOnce({ key: "smtp.port", value: "587" })
        .mockResolvedValueOnce({
          key: "smtp.user",
          value: '"user@example.com"',
        })
        .mockResolvedValueOnce({ key: "smtp.pass", value: '"secretpassword"' })
        .mockResolvedValueOnce({
          key: "smtp.from",
          value: '"noreply@example.com"',
        })
        .mockResolvedValueOnce({ key: "smtp.enabled", value: "true" })
        .mockResolvedValueOnce({
          key: "smtp.adminEmail",
          value: '"admin@example.com"',
        });

      const result = await service.getSmtpSettings();

      expect(result.host).toBe("smtp.gmail.com");
      expect(result.port).toBe(587);
      expect(result.user).toBe("user@example.com");
      expect(result.pass).toBe("********"); // always masked
      expect(result.from).toBe("noreply@example.com");
      expect(result.enabled).toBe(true);
      expect(result.adminEmail).toBe("admin@example.com");
    });

    it("should return defaults when settings not configured", async () => {
      mockPrismaService.systemSetting.findUnique.mockResolvedValue(null);

      const result = await service.getSmtpSettings();

      expect(result.host).toBeNull();
      expect(result.port).toBe(587); // default
      expect(result.user).toBeNull();
      expect(result.pass).toBeNull(); // null when not set
      expect(result.enabled).toBe(false);
    });
  });

  // ==================== updateSmtpSettings ====================

  describe("updateSmtpSettings()", () => {
    it("should save smtp host, port, user, from, enabled, adminEmail", async () => {
      mockPrismaService.systemSetting.upsert.mockResolvedValue({});

      const result = await service.updateSmtpSettings({
        host: "smtp.example.com",
        port: 465,
        user: "user@example.com",
        from: "noreply@example.com",
        enabled: true,
        adminEmail: "admin@example.com",
      });

      expect(result.success).toBe(true);
      expect(mockPrismaService.systemSetting.upsert).toHaveBeenCalledTimes(6);
    });

    it("should skip password update when masked value provided", async () => {
      mockPrismaService.systemSetting.upsert.mockResolvedValue({});

      await service.updateSmtpSettings({
        pass: "********", // masked — should be skipped
        host: "smtp.example.com",
      });

      const calls = mockPrismaService.systemSetting.upsert.mock.calls;
      const passCall = calls.find((call) => call[0].where?.key === "smtp.pass");
      expect(passCall).toBeUndefined();
    });

    it("should save password when it is not masked", async () => {
      mockPrismaService.systemSetting.upsert.mockResolvedValue({});

      await service.updateSmtpSettings({
        pass: "new-real-password",
      });

      const calls = mockPrismaService.systemSetting.upsert.mock.calls;
      const passCall = calls.find((call) => call[0].where?.key === "smtp.pass");
      expect(passCall).toBeDefined();
    });

    it("should do nothing when no fields provided", async () => {
      mockPrismaService.systemSetting.upsert.mockResolvedValue({});

      const result = await service.updateSmtpSettings({});

      expect(mockPrismaService.systemSetting.upsert).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  // ==================== testSmtpConnection ====================

  describe("testSmtpConnection()", () => {
    it("should return failure when SMTP host is not configured", async () => {
      mockPrismaService.systemSetting.findUnique.mockResolvedValue(null);

      const result = await service.testSmtpConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain("incomplete");
    });

    it("should return failure when user is missing", async () => {
      mockPrismaService.systemSetting.findUnique
        .mockResolvedValueOnce({
          key: "smtp.host",
          value: '"smtp.example.com"',
        })
        .mockResolvedValueOnce({ key: "smtp.port", value: "587" })
        .mockResolvedValueOnce(null) // user missing
        .mockResolvedValueOnce({ key: "smtp.pass", value: '"pass"' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.testSmtpConnection();

      expect(result.success).toBe(false);
    });
  });

  // ==================== validateAndCorrectModelConfig edge cases ====================

  describe("validateAndCorrectModelConfig() edge cases (via createAIModel)", () => {
    it("should auto-correct maxTokens when it exceeds known model limit", async () => {
      // o1 has a known limit of 100000; if we pass 200000 it should be corrected
      mockPrismaService.aIModel.findFirst.mockResolvedValue(null);
      mockPrismaService.aIModel.create.mockResolvedValue({
        id: "new-o1",
        name: "o1",
        apiKey: null,
        secretKey: null,
      });

      await service.createAIModel({
        name: "o1",
        displayName: "o1",
        provider: "openai",
        modelId: "o1",
        icon: "icon",
        color: "#000",
        apiEndpoint: "https://api.openai.com",
        maxTokens: 999999, // Exceeds known limit
        isReasoning: true,
      });

      // The create call should have a corrected maxTokens
      const createCall = mockPrismaService.aIModel.create.mock.calls[0][0];
      // The known limit for o1 is less than 999999; corrected maxTokens should be <= known limit
      expect(createCall.data.maxTokens).toBeLessThan(999999);
    });

    it("should auto-set tokenParamName=max_tokens for non-reasoning model when not provided", async () => {
      mockPrismaService.aIModel.findFirst.mockResolvedValue(null);
      mockPrismaService.aIModel.create.mockResolvedValue({
        id: "new-chat",
        name: "Regular Chat",
        apiKey: null,
        secretKey: null,
      });

      await service.createAIModel({
        name: "Regular Chat",
        displayName: "Regular Chat",
        provider: "openai",
        modelId: "gpt-4o",
        icon: "icon",
        color: "#000",
        apiEndpoint: "https://api.openai.com",
        isReasoning: false, // explicitly not reasoning
      });

      const createCall = mockPrismaService.aIModel.create.mock.calls[0][0];
      expect(createCall.data.tokenParamName).toBe("max_tokens");
      expect(createCall.data.supportsTemperature).toBe(true);
    });

    it("should skip tokenParamName auto-set when already explicitly provided for non-reasoning", async () => {
      mockPrismaService.aIModel.findFirst.mockResolvedValue(null);
      mockPrismaService.aIModel.create.mockResolvedValue({
        id: "custom-model",
        name: "Custom",
        apiKey: null,
        secretKey: null,
      });

      await service.createAIModel({
        name: "Custom",
        displayName: "Custom",
        provider: "custom",
        modelId: "custom-model-id",
        icon: "icon",
        color: "#000",
        apiEndpoint: "https://api.example.com",
        isReasoning: false,
        tokenParamName: "custom_token_param",
        supportsTemperature: false,
      });

      const createCall = mockPrismaService.aIModel.create.mock.calls[0][0];
      expect(createCall.data.tokenParamName).toBe("custom_token_param");
      expect(createCall.data.supportsTemperature).toBe(false);
    });
  });

  // ==================== updateAIModel — validateAndCorrectModelConfig ====================

  describe("updateAIModel() — reasoning auto-correction via validateAndCorrectModelConfig", () => {
    it("should auto-set reasoning params when isReasoning=true in update", async () => {
      const existingModel = {
        id: "model-1",
        name: "o3",
        modelId: "o3-mini",
        apiKey: null,
        secretKey: null,
        isReasoning: false,
      };
      mockPrismaService.aIModel.findUnique.mockResolvedValue(existingModel);
      mockPrismaService.aIModel.update.mockResolvedValue({
        ...existingModel,
        isReasoning: true,
        tokenParamName: "max_completion_tokens",
        supportsTemperature: false,
        apiKey: null,
        secretKey: null,
      });

      const result = await service.updateAIModel("model-1", {
        isReasoning: true,
      });

      const updateCall = mockPrismaService.aIModel.update.mock.calls[0][0];
      expect(updateCall.data.tokenParamName).toBe("max_completion_tokens");
      expect(updateCall.data.supportsTemperature).toBe(false);
      expect(result.warnings).toBeDefined();
    });

    it("should apply new apiKey when valid non-masked key provided in update", async () => {
      const existingModel = {
        id: "model-1",
        name: "Test",
        modelId: "gpt-4",
        apiKey: "old-key",
        secretKey: null,
        isReasoning: false,
      };
      mockPrismaService.aIModel.findUnique.mockResolvedValue(existingModel);
      mockPrismaService.aIModel.update.mockResolvedValue({
        ...existingModel,
        apiKey: "new-key-12345678",
        secretKey: null,
      });

      await service.updateAIModel("model-1", {
        apiKey: "  new-key-12345678  ", // should be trimmed
      });

      const updateCall = mockPrismaService.aIModel.update.mock.calls[0][0];
      expect(updateCall.data.apiKey).toBe("new-key-12345678");
    });
  });
});
