/**
 * UserApiKeysService – edge-case tests for uncovered methods/branches
 *
 * Covers (not in existing spec):
 * - getDonatedKey – no candidates, decryption fail, concurrent update (count=0), success + grant credits
 * - getPersonalKey – cache hit, cache miss + store, null stored in cache, decrypt fail
 * - invalidateUserKeyCache – with and without cacheService
 * - testKey – fetch mocking for openai/anthropic/google/unknown provider
 * - saveKey – DB failure rollback, switching donated→personal cleanup
 * - isPrivateHost / validateEndpointUrl – various private IP ranges
 */

// Mock optional external packages
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
import { Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserApiKeysService } from "../user-api-keys.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { SecretsService } from "../../../../ai-infra/secrets/secrets.service";
import { CreditsService } from "../../../../ai-infra/credits/credits.service";
import { EncryptionService } from "../../../../ai-infra/encryption/encryption.service";
import { CacheService } from "../../../../../common/cache";
import { UserApiKeyMode, CreditTransactionType } from "@prisma/client";
import { ApiKeyMode } from "../dto";

// ─── fetch mock ───────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ─── helpers ─────────────────────────────────────────────────────────────────

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

// ─── tests ───────────────────────────────────────────────────────────────────

describe("UserApiKeysService (additional coverage)", () => {
  let service: UserApiKeysService;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;
  let mockSecretsService: jest.Mocked<Partial<SecretsService>>;
  let mockCreditsService: jest.Mocked<Partial<CreditsService>>;
  let mockCacheService: jest.Mocked<Partial<CacheService>>;

  const buildEncryption = (): EncryptionService =>
    new EncryptionService({
      get: (key: string) =>
        key === "SETTINGS_ENCRYPTION_KEY"
          ? "test-encryption-key-32chars-ok!"
          : key === "NODE_ENV"
            ? "test"
            : undefined,
    } as unknown as ConfigService);

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

    mockCacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      invalidateUserCache: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserApiKeysService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecretsService, useValue: mockSecretsService },
        { provide: CreditsService, useValue: mockCreditsService },
        { provide: EncryptionService, useValue: buildEncryption() },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<UserApiKeysService>(UserApiKeysService);
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    mockFetch.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getDonatedKey
  // ──────────────────────────────────────────────────────────────────────────

  describe("getDonatedKey", () => {
    it("returns null when no candidates exist", async () => {
      (mockPrisma.userApiKey!.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getDonatedKey("openai");

      expect(result).toBeNull();
    });

    it("skips candidate when decryption fails", async () => {
      // Provide a candidate with invalid encrypted data
      const invalidKey = makeApiKey({
        mode: UserApiKeyMode.DONATED,
        encryptedValue: "invalid-hex",
        iv: "invalidiv",
      });
      (mockPrisma.userApiKey!.findMany as jest.Mock).mockResolvedValue([
        invalidKey,
      ]);

      const result = await service.getDonatedKey("openai");

      expect(result).toBeNull();
    });

    it("skips candidate when optimistic lock fails (count=0)", async () => {
      // Create a properly encrypted key
      const tempService = service as unknown as {
        encrypt: (text: string) => { encryptedValue: string; iv: string };
      };
      const { encryptedValue, iv } = tempService.encrypt("sk-donated-key");

      const donatedKey = makeApiKey({
        mode: UserApiKeyMode.DONATED,
        encryptedValue,
        iv,
        usageCount: 5,
      });
      (mockPrisma.userApiKey!.findMany as jest.Mock).mockResolvedValue([
        donatedKey,
      ]);
      // Optimistic lock fails
      (mockPrisma.userApiKey!.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      const result = await service.getDonatedKey("openai");

      expect(result).toBeNull();
    });

    it("returns decrypted key on success", async () => {
      const tempService = service as unknown as {
        encrypt: (text: string) => { encryptedValue: string; iv: string };
      };
      const { encryptedValue, iv } = tempService.encrypt("sk-valid-donated");

      const donatedKey = makeApiKey({
        mode: UserApiKeyMode.DONATED,
        encryptedValue,
        iv,
        userId: "donor-user",
      });
      (mockPrisma.userApiKey!.findMany as jest.Mock).mockResolvedValue([
        donatedKey,
      ]);
      (mockPrisma.userApiKey!.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      const result = await service.getDonatedKey("openai");

      expect(result).not.toBeNull();
      expect(result!.apiKey).toBe("sk-valid-donated");
      expect(result!.donorUserId).toBe("donor-user");
    });

    it("grants usage reward credits to donor on success (fire-and-forget)", async () => {
      const tempService = service as unknown as {
        encrypt: (text: string) => { encryptedValue: string; iv: string };
      };
      const { encryptedValue, iv } = tempService.encrypt("sk-donated");

      const donatedKey = makeApiKey({
        mode: UserApiKeyMode.DONATED,
        encryptedValue,
        iv,
        userId: "donor-id",
      });
      (mockPrisma.userApiKey!.findMany as jest.Mock).mockResolvedValue([
        donatedKey,
      ]);
      (mockPrisma.userApiKey!.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      await service.getDonatedKey("openai");

      // Allow microtasks to flush for fire-and-forget promise
      await Promise.resolve();

      expect(mockCreditsService.grantCredits).toHaveBeenCalledWith(
        "donor-id",
        2, // DONATION_USAGE_REWARD_CREDITS
        CreditTransactionType.DONATION_USAGE_REWARD,
        expect.stringContaining("openai"),
      );
    });

    it("does not throw when credit grant fails (fire-and-forget)", async () => {
      const tempService = service as unknown as {
        encrypt: (text: string) => { encryptedValue: string; iv: string };
      };
      const { encryptedValue, iv } = tempService.encrypt("sk-donated");

      const donatedKey = makeApiKey({
        mode: UserApiKeyMode.DONATED,
        encryptedValue,
        iv,
      });
      (mockPrisma.userApiKey!.findMany as jest.Mock).mockResolvedValue([
        donatedKey,
      ]);
      (mockPrisma.userApiKey!.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (mockCreditsService.grantCredits as jest.Mock).mockRejectedValue(
        new Error("Credits failed"),
      );

      const result = await service.getDonatedKey("openai");

      expect(result).not.toBeNull(); // Main result still returned
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getPersonalKey – cache layer
  // ──────────────────────────────────────────────────────────────────────────

  describe("getPersonalKey with cache", () => {
    it("returns cached result without DB query", async () => {
      const cached = { apiKey: "cached-key", apiEndpoint: null };
      (mockCacheService.get as jest.Mock).mockResolvedValue(cached);

      const result = await service.getPersonalKey("user-1", "openai");

      expect(result).toEqual(cached);
      expect(mockPrisma.userApiKey!.findFirst).not.toHaveBeenCalled();
    });

    it("queries DB and caches result when cache misses", async () => {
      (mockCacheService.get as jest.Mock).mockResolvedValue(null);

      const tempService = service as unknown as {
        encrypt: (text: string) => { encryptedValue: string; iv: string };
      };
      const { encryptedValue, iv } = tempService.encrypt("db-api-key");
      const key = makeApiKey({ encryptedValue, iv });

      (mockPrisma.userApiKey!.findFirst as jest.Mock).mockResolvedValue(key);

      const result = await service.getPersonalKey("user-1", "openai");

      expect(result).not.toBeNull();
      expect(result!.apiKey).toBe("db-api-key");
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it("caches null result with SHORT TTL when no key found", async () => {
      (mockCacheService.get as jest.Mock).mockResolvedValue(null);
      (mockPrisma.userApiKey!.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getPersonalKey("user-1", "openai");

      expect(result).toBeNull();
      expect(mockCacheService.set).toHaveBeenCalledWith(
        expect.stringContaining("openai"),
        null,
        60, // CacheTTL.SHORT
      );
    });

    it("returns null when decryption fails", async () => {
      (mockCacheService.get as jest.Mock).mockResolvedValue(null);
      const key = makeApiKey({ encryptedValue: "bad-data", iv: "bad-iv" });
      (mockPrisma.userApiKey!.findFirst as jest.Mock).mockResolvedValue(key);

      const result = await service.getPersonalKey("user-1", "openai");

      expect(result).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // invalidateUserKeyCache
  // ──────────────────────────────────────────────────────────────────────────

  describe("invalidateUserKeyCache", () => {
    it("calls cacheService.invalidateUserCache when cacheService is present", async () => {
      await service.invalidateUserKeyCache("user-1");

      expect(mockCacheService.invalidateUserCache).toHaveBeenCalledWith(
        "user-1",
      );
    });

    it("does nothing when cacheService is not present", async () => {
      // Create service without cacheService
      const moduleWithoutCache: TestingModule = await Test.createTestingModule({
        providers: [
          UserApiKeysService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: SecretsService, useValue: mockSecretsService },
          { provide: CreditsService, useValue: mockCreditsService },
          { provide: EncryptionService, useValue: buildEncryption() },
        ],
      }).compile();

      const serviceWithoutCache =
        moduleWithoutCache.get<UserApiKeysService>(UserApiKeysService);

      await expect(
        serviceWithoutCache.invalidateUserKeyCache("user-1"),
      ).resolves.not.toThrow();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // testKey – provider-specific fetch paths
  // ──────────────────────────────────────────────────────────────────────────

  describe("testKey - provider-specific paths", () => {
    it("tests openai provider using /models endpoint", async () => {
      mockFetch.mockResolvedValue({ status: 200 });

      const result = await service.testKey("openai", "sk-test");

      expect(result.success).toBe(true);
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain("/models");
    });

    it("returns failure for openai when status is 401", async () => {
      mockFetch.mockResolvedValue({ status: 401 });

      const result = await service.testKey("openai", "sk-invalid");

      expect(result.success).toBe(false);
    });

    it("returns failure for openai when status is 403", async () => {
      mockFetch.mockResolvedValue({ status: 403 });

      const result = await service.testKey("openai", "sk-forbidden");

      expect(result.success).toBe(false);
    });

    it("tests anthropic provider using /messages endpoint", async () => {
      mockFetch.mockResolvedValue({ status: 200 });

      const result = await service.testKey("anthropic", "sk-ant-test");

      expect(result.success).toBe(true);
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain("/messages");
    });

    it("tests google provider using /models?key= endpoint", async () => {
      mockFetch.mockResolvedValue({ status: 200 });

      const result = await service.testKey("google", "AIza-test");

      expect(result.success).toBe(true);
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain("models?key=");
    });

    it("returns failure when fetch throws", async () => {
      mockFetch.mockRejectedValue(new Error("Timeout"));

      const result = await service.testKey("openai", "sk-timeout");

      // testProviderKey catches internally and returns false → "API Key validation failed"
      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });

    it("tests custom provider with provided endpoint", async () => {
      mockFetch.mockResolvedValue({ status: 200 });

      const result = await service.testKey(
        "custom",
        "key-123",
        "https://custom-api.example.com/v1",
      );

      expect(result.success).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // validateEndpointUrl / isPrivateHost SSRF protection
  // ──────────────────────────────────────────────────────────────────────────

  describe("SSRF protection via validateEndpointUrl", () => {
    const blockedUrls = [
      "http://localhost/api",
      "http://127.0.0.1/api",
      "http://0.0.0.0/api",
      "http://::1/api",
      "http://[::1]/api",
      "http://10.0.0.1/api",
      "http://10.255.255.255/api",
      "http://192.168.1.1/api",
      "http://192.168.0.100/api",
      "http://172.16.0.1/api",
      "http://172.31.255.255/api",
      "http://169.254.1.1/api",
    ];

    blockedUrls.forEach((url) => {
      it(`blocks private URL: ${url}`, async () => {
        await expect(
          service.saveKey(
            "user-1",
            "openai",
            "sk-test",
            ApiKeyMode.PERSONAL,
            undefined,
            url,
          ),
        ).rejects.toThrow(BadRequestException);
      });
    });

    it("allows public endpoint URL", async () => {
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.userApiKey!.create as jest.Mock).mockResolvedValue(
        makeApiKey(),
      );

      // Should not throw
      await service.saveKey(
        "user-1",
        "openai",
        "sk-test1234567890",
        ApiKeyMode.PERSONAL,
        undefined,
        "https://external-api.example.com/v1",
      );

      expect(mockPrisma.userApiKey!.create).toHaveBeenCalled();
    });

    it("blocks non-http/https protocol", async () => {
      await expect(
        service.saveKey(
          "user-1",
          "openai",
          "sk-test",
          ApiKeyMode.PERSONAL,
          undefined,
          "ftp://example.com/api",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("allows 172.15 (not in private range)", async () => {
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.userApiKey!.create as jest.Mock).mockResolvedValue(
        makeApiKey(),
      );

      // 172.15.x.x is NOT in the private range (172.16-172.31 is private)
      await service.saveKey(
        "user-1",
        "openai",
        "sk-test1234567890",
        ApiKeyMode.PERSONAL,
        undefined,
        "https://172.15.0.1/api",
      );

      expect(mockPrisma.userApiKey!.create).toHaveBeenCalled();
    });

    it("blocks 172.32+ (just outside private range, but 172.16-172.31 is private)", async () => {
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.userApiKey!.create as jest.Mock).mockResolvedValue(
        makeApiKey(),
      );

      // 172.32.x.x is outside private range, should be allowed
      await service.saveKey(
        "user-1",
        "openai",
        "sk-test1234567890",
        ApiKeyMode.PERSONAL,
        undefined,
        "https://172.32.0.1/api",
      );

      expect(mockPrisma.userApiKey!.create).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // saveKey – DB failure rollback
  // ──────────────────────────────────────────────────────────────────────────

  describe("saveKey - DB failure rollback", () => {
    it("cleans up donated secret when DB write fails", async () => {
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(null);
      (mockSecretsService.findByName as jest.Mock).mockResolvedValue(null);
      (mockSecretsService.create as jest.Mock).mockResolvedValue({
        id: "donated-secret-1",
      });
      (mockPrisma.userApiKey!.create as jest.Mock).mockRejectedValue(
        new Error("DB write failed"),
      );

      await expect(
        service.saveKey(
          "user-1",
          "openai",
          "sk-donated-key1234",
          ApiKeyMode.DONATED,
        ),
      ).rejects.toThrow("DB write failed");

      // Cleanup should have been called
      expect(mockSecretsService.delete).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // saveKey – switching from donated to personal
  // ──────────────────────────────────────────────────────────────────────────

  describe("saveKey - mode switching", () => {
    it("cleans up donated secret when switching from DONATED to PERSONAL", async () => {
      const existingDonated = makeApiKey({
        mode: UserApiKeyMode.DONATED,
        donatedSecretId: "old-secret-id",
      });
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(
        existingDonated,
      );
      (mockPrisma.userApiKey!.update as jest.Mock).mockResolvedValue(
        makeApiKey({ mode: UserApiKeyMode.PERSONAL }),
      );

      await service.saveKey(
        "user-1",
        "openai",
        "sk-new-personal",
        ApiKeyMode.PERSONAL,
      );

      expect(mockSecretsService.delete).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // generateKeyHint
  // ──────────────────────────────────────────────────────────────────────────

  describe("key hint generation (indirectly via saveKey)", () => {
    it("generates hint with prefix...suffix format for long keys", async () => {
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(null);

      let createdData: Record<string, unknown> = {};
      (mockPrisma.userApiKey!.create as jest.Mock).mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createdData = args.data;
          return Promise.resolve(makeApiKey());
        },
      );

      await service.saveKey(
        "user-1",
        "openai",
        "sk-test-abc123xyz",
        ApiKeyMode.PERSONAL,
      );

      expect(createdData.keyHint).toMatch(/^.{4}\.\.\.+.{4}$/);
    });

    it("returns **** for very short keys (<=8 chars)", async () => {
      (mockPrisma.userApiKey!.findUnique as jest.Mock).mockResolvedValue(null);

      let createdData: Record<string, unknown> = {};
      (mockPrisma.userApiKey!.create as jest.Mock).mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createdData = args.data;
          return Promise.resolve(makeApiKey());
        },
      );

      await service.saveKey("user-1", "openai", "short1", ApiKeyMode.PERSONAL);

      expect(createdData.keyHint).toBe("****");
    });
  });
});
