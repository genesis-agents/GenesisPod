// Module-level mocks to prevent transitive import failures in the test environment
jest.mock("cache-manager-ioredis-yet", () => ({
  redisStore: jest.fn(),
}));
jest.mock("@nestjs/cache-manager", () => ({
  CacheModule: {
    registerAsync: jest.fn().mockReturnValue({ module: class {} }),
  },
  CACHE_MANAGER: "CACHE_MANAGER",
  Cache: jest.fn(),
}));

import { Test, TestingModule } from "@nestjs/testing";
import {
  NotFoundException,
  BadRequestException,
  ExecutionContext,
} from "@nestjs/common";
import { UserApiKeysController } from "../../../../ai-app/byok/user-api-keys.controller";
import { UserApiKeysService } from "../user-api-keys.service";
import { JwtAuthGuard } from "../../../../../common/guards/jwt-auth.guard";
import { ApiKeyMode, SaveUserApiKeyDto, TestApiKeyDto } from "../dto";

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockUserApiKeysService = {
  listUserApiKeys: jest.fn(),
  getSupportedProviders: jest.fn(),
  saveKey: jest.fn(),
  deleteKey: jest.fn(),
  testKey: jest.fn(),
  withdrawDonation: jest.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(userId = "user-1") {
  return { user: { id: userId, email: "test@example.com" } };
}

const MOCK_PROVIDERS = [
  { id: "openai", name: "OpenAI", endpoint: "https://api.openai.com/v1" },
  {
    id: "anthropic",
    name: "Anthropic",
    endpoint: "https://api.anthropic.com/v1",
  },
];

const MOCK_KEYS = [
  {
    id: "key-1",
    provider: "openai",
    mode: "personal" as const,
    keyHint: "sk-t...est1",
    apiEndpoint: null,
    preferredModelId: null,
    isActive: true,
    lastTestedAt: null,
    testStatus: null,
    usageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("UserApiKeysController", () => {
  let controller: UserApiKeysController;

  beforeEach(async () => {
    const mockJwtGuard = {
      canActivate: (_ctx: ExecutionContext) => true,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserApiKeysController],
      providers: [
        { provide: UserApiKeysService, useValue: mockUserApiKeysService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtGuard)
      .compile();

    controller = module.get<UserApiKeysController>(UserApiKeysController);

    jest.clearAllMocks();
  });

  // ==================== GET / (listKeys) ====================

  describe("GET / (listKeys)", () => {
    it("returns keys and supported providers for the authenticated user", async () => {
      mockUserApiKeysService.listUserApiKeys.mockResolvedValue(MOCK_KEYS);
      mockUserApiKeysService.getSupportedProviders.mockReturnValue(
        MOCK_PROVIDERS,
      );

      const result = await controller.listKeys(makeRequest());

      expect(result).toEqual({ keys: MOCK_KEYS, providers: MOCK_PROVIDERS });
      expect(mockUserApiKeysService.listUserApiKeys).toHaveBeenCalledWith(
        "user-1",
      );
      expect(mockUserApiKeysService.getSupportedProviders).toHaveBeenCalled();
    });

    it("returns empty keys array when user has no configured keys", async () => {
      mockUserApiKeysService.listUserApiKeys.mockResolvedValue([]);
      mockUserApiKeysService.getSupportedProviders.mockReturnValue(
        MOCK_PROVIDERS,
      );

      const result = await controller.listKeys(makeRequest());

      expect(result.keys).toEqual([]);
      expect(result.providers).toHaveLength(MOCK_PROVIDERS.length);
    });

    it("propagates service errors", async () => {
      mockUserApiKeysService.listUserApiKeys.mockRejectedValue(
        new Error("DB connection failed"),
      );

      await expect(controller.listKeys(makeRequest())).rejects.toThrow(
        "DB connection failed",
      );
    });
  });

  // ==================== PUT /:provider (saveKey) ====================

  describe("PUT /:provider (saveKey)", () => {
    const buildDto = (
      overrides: Partial<SaveUserApiKeyDto> = {},
    ): SaveUserApiKeyDto => ({
      apiKey: "sk-test1234567890",
      mode: ApiKeyMode.PERSONAL,
      ...overrides,
    });

    it("saves a personal API key and returns success", async () => {
      mockUserApiKeysService.saveKey.mockResolvedValue({
        success: true,
        mode: ApiKeyMode.PERSONAL,
      });

      const result = await controller.saveKey(
        makeRequest(),
        "openai",
        buildDto(),
      );

      expect(result).toEqual({ success: true, mode: ApiKeyMode.PERSONAL });
      expect(mockUserApiKeysService.saveKey).toHaveBeenCalledWith(
        "user-1",
        "openai",
        "sk-test1234567890",
        ApiKeyMode.PERSONAL,
        undefined,
        undefined,
      );
    });

    it("saves a donated API key with optional fields forwarded", async () => {
      mockUserApiKeysService.saveKey.mockResolvedValue({
        success: true,
        mode: ApiKeyMode.DONATED,
      });

      const dto = buildDto({
        mode: ApiKeyMode.DONATED,
        preferredModelId: "gpt-4o",
        apiEndpoint: "https://proxy.example.com/v1",
      });

      const result = await controller.saveKey(makeRequest(), "openai", dto);

      expect(result.mode).toBe(ApiKeyMode.DONATED);
      expect(mockUserApiKeysService.saveKey).toHaveBeenCalledWith(
        "user-1",
        "openai",
        dto.apiKey,
        ApiKeyMode.DONATED,
        "gpt-4o",
        "https://proxy.example.com/v1",
      );
    });

    it("propagates BadRequestException from service (invalid provider)", async () => {
      mockUserApiKeysService.saveKey.mockRejectedValue(
        new BadRequestException("Invalid provider name"),
      );

      await expect(
        controller.saveKey(makeRequest(), "invalid!", buildDto()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== DELETE /:provider (deleteKey) ====================

  describe("DELETE /:provider (deleteKey)", () => {
    it("deletes an existing key and returns success", async () => {
      mockUserApiKeysService.deleteKey.mockResolvedValue({ success: true });

      const result = await controller.deleteKey(makeRequest(), "openai");

      expect(result).toEqual({ success: true });
      expect(mockUserApiKeysService.deleteKey).toHaveBeenCalledWith(
        "user-1",
        "openai",
      );
    });

    it("propagates NotFoundException when key does not exist", async () => {
      mockUserApiKeysService.deleteKey.mockRejectedValue(
        new NotFoundException("No API Key found for this provider"),
      );

      await expect(
        controller.deleteKey(makeRequest(), "anthropic"),
      ).rejects.toThrow(NotFoundException);
    });

    it("passes the correct user id to the service", async () => {
      mockUserApiKeysService.deleteKey.mockResolvedValue({ success: true });

      await controller.deleteKey(makeRequest("user-42"), "deepseek");

      expect(mockUserApiKeysService.deleteKey).toHaveBeenCalledWith(
        "user-42",
        "deepseek",
      );
    });
  });

  // ==================== POST /:provider/test (testKey) ====================

  describe("POST /:provider/test (testKey)", () => {
    const buildTestDto = (
      overrides: Partial<TestApiKeyDto> = {},
    ): TestApiKeyDto => ({
      apiKey: "sk-valid-key-123",
      ...overrides,
    });

    it("returns success result when key is valid", async () => {
      mockUserApiKeysService.testKey.mockResolvedValue({
        success: true,
        message: "Connection successful",
      });

      const result = await controller.testKey("openai", buildTestDto());

      expect(result.success).toBe(true);
      expect(result.message).toBe("Connection successful");
      expect(mockUserApiKeysService.testKey).toHaveBeenCalledWith(
        "openai",
        "sk-valid-key-123",
        undefined,
      );
    });

    it("returns failure result when key is invalid", async () => {
      mockUserApiKeysService.testKey.mockResolvedValue({
        success: false,
        message: "API Key validation failed",
      });

      const result = await controller.testKey("openai", buildTestDto());

      expect(result.success).toBe(false);
    });

    it("forwards optional apiEndpoint to the service", async () => {
      mockUserApiKeysService.testKey.mockResolvedValue({
        success: true,
        message: "Connection successful",
      });

      const dto = buildTestDto({ apiEndpoint: "https://custom.api.com/v1" });
      await controller.testKey("openai", dto);

      expect(mockUserApiKeysService.testKey).toHaveBeenCalledWith(
        "openai",
        dto.apiKey,
        "https://custom.api.com/v1",
      );
    });

    it("propagates BadRequestException for SSRF-protected endpoints", async () => {
      mockUserApiKeysService.testKey.mockRejectedValue(
        new BadRequestException("Internal endpoints are not allowed"),
      );

      await expect(
        controller.testKey(
          "openai",
          buildTestDto({ apiEndpoint: "http://localhost:8080" }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== DELETE /:provider/donate (withdrawDonation) ====================

  describe("DELETE /:provider/donate (withdrawDonation)", () => {
    it("withdraws donation and returns success", async () => {
      mockUserApiKeysService.withdrawDonation.mockResolvedValue({
        success: true,
      });

      const result = await controller.withdrawDonation(makeRequest(), "openai");

      expect(result).toEqual({ success: true });
      expect(mockUserApiKeysService.withdrawDonation).toHaveBeenCalledWith(
        "user-1",
        "openai",
      );
    });

    it("propagates BadRequestException when no donated key exists", async () => {
      mockUserApiKeysService.withdrawDonation.mockRejectedValue(
        new BadRequestException("No donated Key found for this provider"),
      );

      await expect(
        controller.withdrawDonation(makeRequest(), "openai"),
      ).rejects.toThrow(BadRequestException);
    });

    it("passes the correct user id to the service", async () => {
      mockUserApiKeysService.withdrawDonation.mockResolvedValue({
        success: true,
      });

      await controller.withdrawDonation(makeRequest("user-99"), "anthropic");

      expect(mockUserApiKeysService.withdrawDonation).toHaveBeenCalledWith(
        "user-99",
        "anthropic",
      );
    });
  });
});
