// Mock optional external packages that may not be installed in test environment
jest.mock("@nestjs/cache-manager", () => ({
  CacheModule: {
    registerAsync: jest.fn().mockReturnValue({ module: class {} }),
  },
  CACHE_MANAGER: "CACHE_MANAGER",
  Cache: jest.fn(),
}));
jest.mock("cache-manager-ioredis-yet", () => ({
  redisStore: jest.fn(),
}));

import { Test, TestingModule } from "@nestjs/testing";
import { Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserApiKeysService } from "../user-api-keys.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { SecretsService } from "../../../../ai-infra/secrets/secrets.service";
import { CreditsService } from "../../../../ai-infra/credits/credits.service";
import { EncryptionService } from "../../../../ai-infra/encryption/encryption.service";
import { UserApiKeyMode, CreditTransactionType } from "@prisma/client";
import { ApiKeyMode } from "../dto";

const buildEncryption = (): EncryptionService =>
  new EncryptionService({
    get: (key: string) =>
      key === "SETTINGS_ENCRYPTION_KEY"
        ? "test-encryption-key-32chars-ok!"
        : key === "NODE_ENV"
          ? "test"
          : undefined,
  } as unknown as ConfigService);

describe("UserApiKeysService", () => {
  let service: UserApiKeysService;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;
  let mockSecretsService: jest.Mocked<Partial<SecretsService>>;
  let mockCreditsService: jest.Mocked<Partial<CreditsService>>;

  const makeApiKey = (overrides: Record<string, unknown> = {}) => ({
    id: "key-1",
    userId: "user-1",
    provider: "openai",
    encryptedValue: "encrypted",
    iv: "abcd1234abcd1234abcd1234abcd1234",
    keyHint: "sk-t...est1",
    mode: UserApiKeyMode.PERSONAL,
    apiEndpoint: null,
    preferredModelId: null,
    donatedSecretId: null,
    donationRewardedAt: null,
    isActive: true,
    lastTestedAt: null,
    testStatus: null,
    usageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    mockPrisma = {
      userApiKey: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(makeApiKey()),
        update: jest.fn().mockResolvedValue(makeApiKey()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn().mockResolvedValue(makeApiKey()),
      } as unknown as PrismaService["userApiKey"],
    };

    mockSecretsService = {
      findByName: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "secret-1" }),
      update: jest.fn().mockResolvedValue({ id: "secret-1" }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    mockCreditsService = {
      grantCredits: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserApiKeysService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecretsService, useValue: mockSecretsService },
        { provide: CreditsService, useValue: mockCreditsService },
        { provide: EncryptionService, useValue: buildEncryption() },
      ],
    }).compile();

    service = module.get<UserApiKeysService>(UserApiKeysService);
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== listUserApiKeys ====================

  describe("listUserApiKeys", () => {
    it("returns list of keys without exposing encrypted values", async () => {
      // Simulate what Prisma's select returns — only the selected fields, no encryptedValue/iv
      const keysFromSelect = [
        {
          id: "key-1",
          provider: "openai",
          mode: UserApiKeyMode.PERSONAL,
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
        {
          id: "key-2",
          provider: "anthropic",
          mode: UserApiKeyMode.PERSONAL,
          keyHint: "sk-a...234",
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
      (mockPrisma.userApiKey!.findMany as jest.Mock).mockResolvedValue(
        keysFromSelect,
      );

      const result = await service.listUserApiKeys("user-1");

      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty("encryptedValue");
      expect(result[0]).not.toHaveProperty("iv");
    });

    it("normalizes mode to lowercase", async () => {
      const keys = [makeApiKey({ mode: UserApiKeyMode.DONATED })];
      (mockPrisma.userApiKey!.findMany as jest.Mock).mockResolvedValue(keys);

      const result = await service.listUserApiKeys("user-1");

      expect(result[0].mode).toBe("donated");
    });

    it("returns empty array when no keys exist", async () => {
      (mockPrisma.userApiKey!.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.listUserApiKeys("user-1");

      expect(result).toEqual([]);
    });
  });

  // ==================== saveKey ====================

  describe("saveKey", () => {
    it("validates provider name format", async () => {
      await expect(
        service.saveKey(
          "user-1",
          "invalid provider!",
          "sk-test",
          ApiKeyMode.PERSONAL,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects too-long provider names", async () => {
      const longName = "a".repeat(51);
      await expect(
        service.saveKey("user-1", longName, "sk-test", ApiKeyMode.PERSONAL),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a new personal key when none exists", async () => {
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.userApiKey!.create as jest.Mock).mockResolvedValue(
        makeApiKey(),
      );

      const result = await service.saveKey(
        "user-1",
        "openai",
        "sk-test1234567890",
        ApiKeyMode.PERSONAL,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe(ApiKeyMode.PERSONAL);
      expect(mockPrisma.userApiKey!.create).toHaveBeenCalled();
    });

    it("updates existing key", async () => {
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(
        makeApiKey(),
      );
      (mockPrisma.userApiKey!.update as jest.Mock).mockResolvedValue(
        makeApiKey(),
      );

      const result = await service.saveKey(
        "user-1",
        "openai",
        "sk-new-key1234",
        ApiKeyMode.PERSONAL,
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.userApiKey!.update).toHaveBeenCalled();
    });

    it("creates donated secret when mode is DONATED", async () => {
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(null);
      (mockSecretsService.findByName as jest.Mock).mockResolvedValue(null);
      (mockSecretsService.create as jest.Mock).mockResolvedValue({
        id: "donated-secret-1",
      });
      (mockPrisma.userApiKey!.create as jest.Mock).mockResolvedValue(
        makeApiKey({ mode: UserApiKeyMode.DONATED }),
      );

      await service.saveKey(
        "user-1",
        "openai",
        "sk-donated1234567",
        ApiKeyMode.DONATED,
      );

      expect(mockSecretsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringContaining("donated-openai"),
        }),
        expect.any(Object),
      );
    });

    it("grants DONATION_REWARD credits for first-time donation", async () => {
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(null);
      (mockSecretsService.findByName as jest.Mock).mockResolvedValue(null);
      (mockSecretsService.create as jest.Mock).mockResolvedValue({
        id: "secret-1",
      });
      (mockPrisma.userApiKey!.create as jest.Mock).mockResolvedValue(
        makeApiKey({
          mode: UserApiKeyMode.DONATED,
          donationRewardedAt: null,
        }),
      );

      await service.saveKey(
        "user-1",
        "openai",
        "sk-new-donated-key",
        ApiKeyMode.DONATED,
      );

      expect(mockCreditsService.grantCredits).toHaveBeenCalledWith(
        "user-1",
        5000, // DONATION_REWARD_CREDITS
        CreditTransactionType.DONATION_REWARD,
        expect.stringContaining("openai"),
      );
    });

    it("does not grant reward for repeated donation", async () => {
      const existingDonated = makeApiKey({
        mode: UserApiKeyMode.DONATED,
        donationRewardedAt: new Date(), // already rewarded
      });
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(
        existingDonated,
      );
      (mockSecretsService.findByName as jest.Mock).mockResolvedValue({
        id: "existing-secret",
      });
      (mockSecretsService.update as jest.Mock).mockResolvedValue({
        id: "existing-secret",
      });
      (mockPrisma.userApiKey!.update as jest.Mock).mockResolvedValue(
        existingDonated,
      );

      await service.saveKey(
        "user-1",
        "openai",
        "sk-update-donated",
        ApiKeyMode.DONATED,
      );

      expect(mockCreditsService.grantCredits).not.toHaveBeenCalled();
    });

    it("validates endpoint URL format", async () => {
      await expect(
        service.saveKey(
          "user-1",
          "openai",
          "sk-test",
          ApiKeyMode.PERSONAL,
          undefined,
          "not-a-url",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("blocks private/internal endpoint URLs (SSRF protection)", async () => {
      await expect(
        service.saveKey(
          "user-1",
          "openai",
          "sk-test",
          ApiKeyMode.PERSONAL,
          undefined,
          "http://localhost:8080/api",
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== deleteKey ====================

  describe("deleteKey", () => {
    it("throws NotFoundException when key not found", async () => {
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteKey("user-1", "openai")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("deletes the API key", async () => {
      const key = makeApiKey();
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(key);
      (mockPrisma.userApiKey!.delete as jest.Mock).mockResolvedValue(key);

      const result = await service.deleteKey("user-1", "openai");

      expect(result.success).toBe(true);
      expect(mockPrisma.userApiKey!.delete).toHaveBeenCalledWith({
        where: { id: key.id },
      });
    });

    it("cleans up donated secret when deleting donated key", async () => {
      const donatedKey = makeApiKey({
        mode: UserApiKeyMode.DONATED,
        donatedSecretId: "secret-1",
      });
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(
        donatedKey,
      );
      (mockPrisma.userApiKey!.delete as jest.Mock).mockResolvedValue(
        donatedKey,
      );

      await service.deleteKey("user-1", "openai");

      expect(mockSecretsService.delete).toHaveBeenCalled();
    });
  });

  // ==================== testKey ====================

  describe("testKey", () => {
    it("returns failure for unknown provider without endpoint", async () => {
      const result = await service.testKey("completely-unknown", "sk-test");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Unknown provider");
    });

    it("validates endpoint URL before testing", async () => {
      await expect(
        service.testKey("openai", "sk-test", "http://localhost/evil"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== getPersonalKey ====================

  describe("getPersonalKey", () => {
    it("returns null when no personal key found", async () => {
      (mockPrisma.userApiKey!.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getPersonalKey("user-1", "openai");

      expect(result).toBeNull();
    });

    it("decrypts and returns key data", async () => {
      // Create a real encrypted key
      const tempService = service as unknown as {
        encrypt: (text: string) => { encryptedValue: string; iv: string };
      };
      const { encryptedValue, iv } = tempService.encrypt("real-api-key");

      const key = makeApiKey({ encryptedValue, iv });
      (mockPrisma.userApiKey!.findFirst as jest.Mock).mockResolvedValue(key);

      const result = await service.getPersonalKey("user-1", "openai");

      expect(result).not.toBeNull();
      expect(result!.apiKey).toBe("real-api-key");
    });
  });

  // ==================== withdrawDonation ====================

  describe("withdrawDonation", () => {
    it("throws BadRequestException when no donated key found", async () => {
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.withdrawDonation("user-1", "openai"),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when key is not donated", async () => {
      const personalKey = makeApiKey({ mode: UserApiKeyMode.PERSONAL });
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(
        personalKey,
      );

      await expect(
        service.withdrawDonation("user-1", "openai"),
      ).rejects.toThrow(BadRequestException);
    });

    it("converts donated key to personal on withdrawal", async () => {
      const donatedKey = makeApiKey({
        mode: UserApiKeyMode.DONATED,
        donatedSecretId: "secret-1",
      });
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(
        donatedKey,
      );
      (mockPrisma.userApiKey!.update as jest.Mock).mockResolvedValue({
        ...donatedKey,
        mode: UserApiKeyMode.PERSONAL,
      });

      const result = await service.withdrawDonation("user-1", "openai");

      expect(result.success).toBe(true);
      expect(mockPrisma.userApiKey!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { mode: UserApiKeyMode.PERSONAL, donatedSecretId: null },
        }),
      );
    });
  });

  // ==================== getSupportedProviders ====================

  describe("getSupportedProviders", () => {
    it("returns list of known providers", async () => {
      const providers = await service.getSupportedProviders();

      expect(providers.length).toBeGreaterThan(0);
      const ids = providers.map((p: { id: string }) => p.id);
      expect(ids).toContain("openai");
      expect(ids).toContain("anthropic");
    });

    it("includes endpoint for each provider", async () => {
      const providers = await service.getSupportedProviders();

      for (const provider of providers) {
        expect(provider.endpoint).toBeDefined();
        expect(provider.endpoint).toMatch(/^https?:\/\//);
      }
    });
  });
});
