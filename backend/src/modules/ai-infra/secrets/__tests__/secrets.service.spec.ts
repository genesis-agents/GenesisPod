import { Test, TestingModule } from "@nestjs/testing";
import { Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SecretsService } from "../secrets.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { EncryptionService } from "../../encryption/encryption.service";
import { SecretCategory, SecretAction } from "@prisma/client";

const buildEncryption = (): EncryptionService =>
  new EncryptionService({
    get: (key: string) =>
      key === "SETTINGS_ENCRYPTION_KEY"
        ? "test-encryption-key-32chars-ok!"
        : key === "NODE_ENV"
          ? "test"
          : undefined,
  } as unknown as ConfigService);

describe("SecretsService", () => {
  let service: SecretsService;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;

  const makeSecret = (overrides: Record<string, unknown> = {}) => ({
    id: "secret-1",
    name: "test-api-key",
    displayName: "Test API Key",
    category: "AI_MODEL" as SecretCategory,
    description: "A test secret",
    encryptedValue: "encrypted-data",
    iv: "abcd1234abcd1234abcd1234abcd1234",
    keyVersion: 1,
    provider: "openai",
    isActive: true,
    maskedValue: "****test****",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastAccessedAt: null,
    accessCount: 0,
    expiresAt: null,
    lastRotatedAt: null,
    currentVersion: 1,
    deletedAt: null,
    deletedBy: null,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  });

  beforeEach(async () => {
    mockPrisma = {
      secret: {
        create: jest.fn().mockResolvedValue(makeSecret()),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(makeSecret()),
        count: jest.fn().mockResolvedValue(0),
      } as unknown as PrismaService["secret"],
      secretAccessLog: {
        create: jest.fn().mockResolvedValue({ id: "log-1" }),
        findMany: jest.fn().mockResolvedValue([]),
      } as unknown as PrismaService["secretAccessLog"],
      secretVersion: {
        create: jest.fn().mockResolvedValue({ id: "ver-1" }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      } as unknown as PrismaService["secretVersion"],
      aIModel: {
        findMany: jest.fn().mockResolvedValue([]),
      } as unknown as PrismaService["aIModel"],
      systemSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
      } as unknown as PrismaService["systemSetting"],
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecretsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: buildEncryption() },
      ],
    }).compile();

    service = module.get<SecretsService>(SecretsService);
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 加密/密钥派生的边界用例已迁移到 encryption.service.spec.ts，此处不再重复。

  // ==================== create ====================

  describe("create", () => {
    it("creates a secret and logs access", async () => {
      (mockPrisma.secret!.create as jest.Mock).mockResolvedValue(makeSecret());

      const result = await service.create({
        name: "test-api-key",
        displayName: "Test API Key",
        value: "sk-secret-value",
        category: SecretCategory.AI_MODEL,
        provider: "openai",
      });

      expect(result.name).toBe("test-api-key");
      expect(result.isActive).toBe(true);
      expect(mockPrisma.secret!.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "test-api-key",
            isActive: true,
          }),
        }),
      );
      expect(mockPrisma.secretAccessLog!.create).toHaveBeenCalled();
    });

    it("encrypts the value before storing", async () => {
      const secret = makeSecret();
      (mockPrisma.secret!.create as jest.Mock).mockResolvedValue(secret);

      await service.create({
        name: "encrypted-secret",
        displayName: "Encrypted",
        value: "my-plain-text",
        category: SecretCategory.AI_MODEL,
      });

      const createCall = (mockPrisma.secret!.create as jest.Mock).mock
        .calls[0][0];
      // Value should be encrypted (not plain text)
      expect(createCall.data.encryptedValue).not.toBe("my-plain-text");
      expect(createCall.data.iv).toBeDefined();
    });

    it("stores audit context in access log", async () => {
      (mockPrisma.secret!.create as jest.Mock).mockResolvedValue(makeSecret());

      await service.create(
        {
          name: "audited-key",
          displayName: "Audited",
          value: "value",
          category: SecretCategory.AI_MODEL,
        },
        {
          userId: "admin-1",
          userEmail: "admin@test.com",
          ipAddress: "1.2.3.4",
        },
      );

      expect(mockPrisma.secretAccessLog!.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "admin-1",
            userEmail: "admin@test.com",
            ipAddress: "1.2.3.4",
            action: SecretAction.CREATE,
          }),
        }),
      );
    });
  });

  // ==================== getValue ====================

  describe("getValue", () => {
    it("returns null when secret not found", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getValue("nonexistent");

      expect(result).toBeNull();
    });

    it("returns null for deleted secret", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret({ deletedAt: new Date() }),
      );

      const result = await service.getValue("deleted-key");

      expect(result).toBeNull();
    });

    it("returns null for inactive secret", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret({ isActive: false }),
      );

      const result = await service.getValue("inactive-key");

      expect(result).toBeNull();
    });

    it("returns null for expired secret", async () => {
      const pastDate = new Date(Date.now() - 1000);
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret({ expiresAt: pastDate }),
      );

      const result = await service.getValue("expired-key");

      expect(result).toBeNull();
    });

    it("increments access count on successful retrieval", async () => {
      // Store and retrieve a real encrypted secret
      (mockPrisma.secret!.create as jest.Mock).mockResolvedValue(makeSecret());
      await service.create({
        name: "access-key",
        displayName: "Access",
        value: "plain-value",
        category: SecretCategory.AI_MODEL,
      });

      const createCall = (mockPrisma.secret!.create as jest.Mock).mock
        .calls[0][0];
      const realSecret = {
        ...makeSecret(),
        encryptedValue: createCall.data.encryptedValue,
        iv: createCall.data.iv,
      };

      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        realSecret,
      );
      (mockPrisma.secret!.update as jest.Mock).mockResolvedValue(realSecret);

      await service.getValue("access-key");

      expect(mockPrisma.secret!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accessCount: { increment: 1 },
          }),
        }),
      );
    });

    it("decrypts the value for return", async () => {
      // Create a real secret so we have valid encrypted data
      (mockPrisma.secret!.create as jest.Mock).mockResolvedValue(makeSecret());
      await service.create({
        name: "decrypt-test",
        displayName: "Decrypt Test",
        value: "my-actual-value",
        category: SecretCategory.AI_MODEL,
      });

      const createCall = (mockPrisma.secret!.create as jest.Mock).mock
        .calls[0][0];

      const realEncrypted = makeSecret({
        encryptedValue: createCall.data.encryptedValue,
        iv: createCall.data.iv,
      });

      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        realEncrypted,
      );
      (mockPrisma.secret!.update as jest.Mock).mockResolvedValue(realEncrypted);

      const value = await service.getValue("decrypt-test");

      expect(value).toBe("my-actual-value");
    });

    it("logs access denied when secret is inactive", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret({ isActive: false }),
      );

      await service.getValue("inactive-key", { userId: "user-1" });

      expect(mockPrisma.secretAccessLog!.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: SecretAction.ACCESS_DENIED,
          }),
        }),
      );
    });
  });

  // ==================== findAll ====================

  describe("findAll", () => {
    it("returns all active secrets", async () => {
      const secrets = [makeSecret(), makeSecret({ id: "secret-2" })];
      (mockPrisma.secret!.findMany as jest.Mock).mockResolvedValue(secrets);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(mockPrisma.secret!.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
        }),
      );
    });

    it("filters by category", async () => {
      (mockPrisma.secret!.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll(SecretCategory.AI_MODEL);

      expect(mockPrisma.secret!.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, category: SecretCategory.AI_MODEL },
        }),
      );
    });
  });

  // ==================== update ====================

  describe("update", () => {
    it("throws NotFoundException when secret not found", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update("nonexistent", { displayName: "New Name" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates a new version when value changes", async () => {
      const existing = makeSecret();
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(existing);
      (mockPrisma.secret!.update as jest.Mock).mockResolvedValue(existing);

      await service.update("test-api-key", { value: "new-value" });

      expect(mockPrisma.secretVersion!.create).toHaveBeenCalled();
    });

    it("does not create version when only metadata changes", async () => {
      const existing = makeSecret();
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(existing);
      (mockPrisma.secret!.update as jest.Mock).mockResolvedValue(existing);

      await service.update("test-api-key", { displayName: "New Name" });

      expect(mockPrisma.secretVersion!.create).not.toHaveBeenCalled();
    });
  });

  // ==================== delete ====================

  describe("delete", () => {
    it("soft deletes a secret without references", async () => {
      const existing = makeSecret();
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(existing);
      (mockPrisma.aIModel!.findMany as jest.Mock).mockResolvedValue([]); // no references
      (mockPrisma.secret!.update as jest.Mock).mockResolvedValue(existing);

      await service.delete("test-api-key");

      expect(mockPrisma.secret!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            isActive: false,
          }),
        }),
      );
    });

    it("throws when secret is referenced by AI models", async () => {
      const existing = makeSecret();
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(existing);
      (mockPrisma.aIModel!.findMany as jest.Mock).mockResolvedValue([
        { id: "model-1", displayName: "GPT-4" },
      ]);

      await expect(service.delete("test-api-key")).rejects.toThrow(
        "still referenced",
      );
    });
  });

  // ==================== exists ====================

  describe("exists", () => {
    it("returns true for active non-expired non-deleted secret", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue({
        isActive: true,
        deletedAt: null,
        expiresAt: null,
      });

      const result = await service.exists("active-key");

      expect(result).toBe(true);
    });

    it("returns false when secret is deleted", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue({
        isActive: true,
        deletedAt: new Date(),
        expiresAt: null,
      });

      const result = await service.exists("deleted-key");

      expect(result).toBe(false);
    });

    it("returns false when secret has expired", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue({
        isActive: true,
        deletedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = await service.exists("expired-key");

      expect(result).toBe(false);
    });

    it("returns false when secret not found", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.exists("missing-key");

      expect(result).toBe(false);
    });
  });

  // ==================== getVersions ====================

  describe("getVersions", () => {
    it("throws NotFoundException when secret not found", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getVersions("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns versions with isCurrent flag", async () => {
      const secret = makeSecret({ currentVersion: 2 });
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(secret);
      (mockPrisma.secretVersion!.findMany as jest.Mock).mockResolvedValue([
        {
          id: "ver-1",
          version: 1,
          checksum: "abc",
          createdBy: null,
          createdAt: new Date(),
          changeNote: null,
        },
        {
          id: "ver-2",
          version: 2,
          checksum: "def",
          createdBy: null,
          createdAt: new Date(),
          changeNote: null,
        },
      ]);

      const versions = await service.getVersions("test-api-key");

      expect(versions).toHaveLength(2);
      expect(versions.find((v) => v.version === 2)?.isCurrent).toBe(true);
      expect(versions.find((v) => v.version === 1)?.isCurrent).toBe(false);
    });
  });

  // ==================== getSecretNames ====================

  describe("getSecretNames", () => {
    it("returns list of active secret names", async () => {
      (mockPrisma.secret!.findMany as jest.Mock).mockResolvedValue([
        { name: "key-a" },
        { name: "key-b" },
      ]);

      const names = await service.getSecretNames();

      expect(names).toEqual(["key-a", "key-b"]);
    });

    it("filters by category", async () => {
      (mockPrisma.secret!.findMany as jest.Mock).mockResolvedValue([]);

      await service.getSecretNames(SecretCategory.USER_DONATED);

      expect(mockPrisma.secret!.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: SecretCategory.USER_DONATED,
          }),
        }),
      );
    });
  });

  // ==================== findByName ====================

  describe("findByName", () => {
    it("returns null when secret not found", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.findByName("nonexistent");

      expect(result).toBeNull();
    });

    it("returns null for soft-deleted secret", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret({ deletedAt: new Date() }),
      );

      const result = await service.findByName("deleted-key");

      expect(result).toBeNull();
    });

    it("returns list item for active secret", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret(),
      );

      const result = await service.findByName("test-api-key");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("test-api-key");
    });
  });

  // ==================== getValueInternal ====================

  describe("getValueInternal", () => {
    it("returns null when secret not found", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getValueInternal("nonexistent");

      expect(result).toBeNull();
    });

    it("returns null for inactive secret", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret({ isActive: false }),
      );

      const result = await service.getValueInternal("inactive-key");

      expect(result).toBeNull();
    });

    it("returns null for soft-deleted secret", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret({ deletedAt: new Date() }),
      );

      const result = await service.getValueInternal("deleted-key");

      expect(result).toBeNull();
    });

    it("returns null for expired secret", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret({ expiresAt: new Date(Date.now() - 1000) }),
      );

      const result = await service.getValueInternal("expired-key");

      expect(result).toBeNull();
    });

    it("normalizes legacy SCREAMING_SNAKE_CASE names automatically", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);

      // TAVILY_API_KEY should be normalized to tavily-search-api-key
      await service.getValueInternal("TAVILY_API_KEY");

      expect(mockPrisma.secret!.findUnique).toHaveBeenCalledWith({
        where: { name: "tavily-search-api-key" },
      });
    });

    it("increments access count for internal calls", async () => {
      // Create a real encrypted value
      (mockPrisma.secret!.create as jest.Mock).mockResolvedValue(makeSecret());
      await service.create({
        name: "internal-key",
        displayName: "Internal",
        value: "internal-value",
        category: SecretCategory.AI_MODEL,
      });

      const createCall = (mockPrisma.secret!.create as jest.Mock).mock
        .calls[0][0];
      const realSecret = {
        ...makeSecret(),
        encryptedValue: createCall.data.encryptedValue,
        iv: createCall.data.iv,
      };

      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        realSecret,
      );
      (mockPrisma.secret!.update as jest.Mock).mockResolvedValue(realSecret);

      await service.getValueInternal("internal-key");

      expect(mockPrisma.secret!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accessCount: { increment: 1 },
          }),
        }),
      );
    });
  });

  // ==================== getAccessLogs ====================

  describe("getAccessLogs", () => {
    it("returns access logs for existing secret", async () => {
      const secret = makeSecret();
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(secret);
      const fakeLogs = [
        { id: "log-1", action: SecretAction.VIEW, timestamp: new Date() },
      ];
      (mockPrisma.secretAccessLog!.findMany as jest.Mock).mockResolvedValue(
        fakeLogs,
      );

      const result = await service.getAccessLogs("test-api-key");

      expect(result).toHaveLength(1);
      expect(mockPrisma.secretAccessLog!.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ secretId: secret.id }]),
          }),
          take: 50,
        }),
      );
    });

    it("returns access logs with custom limit", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret(),
      );
      (mockPrisma.secretAccessLog!.findMany as jest.Mock).mockResolvedValue([]);

      await service.getAccessLogs("test-api-key", 100);

      expect(mockPrisma.secretAccessLog!.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it("handles null secret by still querying by name", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.secretAccessLog!.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getAccessLogs("unknown-key");

      expect(result).toEqual([]);
      // Should still query by secretName
      expect(mockPrisma.secretAccessLog!.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ secretId: undefined }, { secretName: "unknown-key" }],
          },
        }),
      );
    });
  });

  // ==================== getReferences ====================

  describe("getReferences", () => {
    it("returns empty array when no AI models reference the secret", async () => {
      (mockPrisma.aIModel!.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getReferences("my-api-key");

      expect(result).toEqual([]);
    });

    it("returns reference for each AI model using the secret name", async () => {
      (mockPrisma.aIModel!.findMany as jest.Mock).mockResolvedValue([
        { id: "model-1", displayName: "GPT-4" },
        { id: "model-2", displayName: "Claude" },
      ]);

      const result = await service.getReferences("openai-api-key");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        type: "ai_model",
        id: "model-1",
        name: "GPT-4",
      });
      expect(result[1]).toEqual({
        type: "ai_model",
        id: "model-2",
        name: "Claude",
      });
    });
  });

  // ==================== getVersionValue ====================

  describe("getVersionValue", () => {
    it("throws NotFoundException when secret not found", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getVersionValue("missing", 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns current version value directly from secret", async () => {
      // Create real encrypted data
      (mockPrisma.secret!.create as jest.Mock).mockResolvedValue(makeSecret());
      await service.create({
        name: "vv-key",
        displayName: "VV Key",
        value: "my-value",
        category: SecretCategory.AI_MODEL,
      });

      const createCall = (mockPrisma.secret!.create as jest.Mock).mock
        .calls[0][0];
      const secret = {
        ...makeSecret({ currentVersion: 1 }),
        encryptedValue: createCall.data.encryptedValue,
        iv: createCall.data.iv,
      };

      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(secret);
      (mockPrisma.secret!.update as jest.Mock).mockResolvedValue(secret);

      const value = await service.getVersionValue("vv-key", 1);

      expect(value).toBe("my-value");
    });

    it("throws NotFoundException for non-existent version", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret({ currentVersion: 1 }),
      );
      (mockPrisma.secretVersion!.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(service.getVersionValue("test-api-key", 99)).rejects.toThrow(
        "Version 99 not found",
      );
    });

    it("fetches value from version history for non-current version", async () => {
      // Create real encrypted data for a "version 0" scenario
      (mockPrisma.secret!.create as jest.Mock).mockResolvedValue(makeSecret());
      await service.create({
        name: "hist-key",
        displayName: "Hist Key",
        value: "old-value",
        category: SecretCategory.AI_MODEL,
      });
      const createCall = (mockPrisma.secret!.create as jest.Mock).mock
        .calls[0][0];

      const secret = makeSecret({ currentVersion: 3 });
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(secret);
      (mockPrisma.secretVersion!.findUnique as jest.Mock).mockResolvedValue({
        id: "ver-2",
        version: 2,
        encryptedValue: createCall.data.encryptedValue,
        iv: createCall.data.iv,
      });

      const value = await service.getVersionValue("hist-key", 2);

      expect(value).toBe("old-value");
    });
  });

  // ==================== rollback ====================

  describe("rollback", () => {
    it("throws NotFoundException when secret not found", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.rollback("missing", 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws BadRequestException when rolling back to current version", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret({ currentVersion: 2 }),
      );

      await expect(service.rollback("test-api-key", 2)).rejects.toThrow(
        "Cannot rollback to current version",
      );
    });

    it("throws NotFoundException when target version not found", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret({ currentVersion: 3 }),
      );
      (mockPrisma.secretVersion!.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(service.rollback("test-api-key", 1)).rejects.toThrow(
        "Version 1 not found",
      );
    });

    it("creates a new version and updates secret on successful rollback", async () => {
      // Setup real encryption for the target version
      (mockPrisma.secret!.create as jest.Mock).mockResolvedValue(makeSecret());
      await service.create({
        name: "rb-key",
        displayName: "RB Key",
        value: "rollback-value",
        category: SecretCategory.AI_MODEL,
      });
      const createCall = (mockPrisma.secret!.create as jest.Mock).mock
        .calls[0][0];

      const secret = makeSecret({ currentVersion: 3 });
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(secret);
      (mockPrisma.secretVersion!.findUnique as jest.Mock).mockResolvedValue({
        id: "ver-1",
        version: 1,
        encryptedValue: createCall.data.encryptedValue,
        iv: createCall.data.iv,
      });
      (mockPrisma.secretVersion!.create as jest.Mock).mockResolvedValue({
        id: "ver-4",
      });
      (mockPrisma.secret!.update as jest.Mock).mockResolvedValue(
        makeSecret({ currentVersion: 4 }),
      );

      const result = await service.rollback("test-api-key", 1, {
        userId: "admin",
      });

      expect(result).toBeDefined();
      expect(mockPrisma.secretVersion!.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 4,
            changeNote: "Rollback from version 1",
          }),
        }),
      );
      expect(mockPrisma.secret!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentVersion: 4,
          }),
        }),
      );
    });
  });

  // ==================== createInitialVersion ====================

  describe("createInitialVersion", () => {
    it("throws NotFoundException when secret not found", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.createInitialVersion("missing")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("does nothing if version 1 already exists", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret(),
      );
      (mockPrisma.secretVersion!.findUnique as jest.Mock).mockResolvedValue({
        id: "ver-1",
        version: 1,
      });

      await service.createInitialVersion("test-api-key");

      expect(mockPrisma.secretVersion!.create).not.toHaveBeenCalled();
    });

    it("creates initial version for secret without version history", async () => {
      // Need a secret with real encryption
      (mockPrisma.secret!.create as jest.Mock).mockResolvedValue(makeSecret());
      await service.create({
        name: "init-key",
        displayName: "Init Key",
        value: "initial-value",
        category: SecretCategory.AI_MODEL,
      });
      const createCall = (mockPrisma.secret!.create as jest.Mock).mock
        .calls[0][0];

      const secret = makeSecret({
        encryptedValue: createCall.data.encryptedValue,
        iv: createCall.data.iv,
        currentVersion: null,
      });
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(secret);
      // No existing version
      (mockPrisma.secretVersion!.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      (mockPrisma.secretVersion!.create as jest.Mock).mockResolvedValue({
        id: "ver-1",
      });
      (mockPrisma.secret!.update as jest.Mock).mockResolvedValue(secret);

      await service.createInitialVersion("init-key");

      expect(mockPrisma.secretVersion!.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 1,
            changeNote: "Initial version",
          }),
        }),
      );
    });
  });

  // ==================== initializeAllVersions ====================

  describe("initializeAllVersions", () => {
    it("processes all non-deleted secrets", async () => {
      const secrets = [
        makeSecret(),
        makeSecret({ id: "secret-2", name: "key-2" }),
      ];
      (mockPrisma.secret!.findMany as jest.Mock).mockResolvedValue(secrets);
      // Both secrets already have version 1
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret(),
      );
      (mockPrisma.secretVersion!.findUnique as jest.Mock).mockResolvedValue({
        id: "ver-1",
        version: 1,
      });

      const result = await service.initializeAllVersions();

      expect(result.processed).toBe(2);
      expect(result.skipped).toBe(0);
    });

    it("counts skipped when createInitialVersion throws", async () => {
      const secrets = [makeSecret()];
      (mockPrisma.secret!.findMany as jest.Mock).mockResolvedValue(secrets);
      // findUnique returns null (throws NotFoundException path)
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.initializeAllVersions();

      // createInitialVersion throws -> counted as skipped
      expect(result.skipped).toBe(1);
      expect(result.processed).toBe(0);
    });
  });

  // ==================== getExpectedSecrets ====================

  describe("getExpectedSecrets", () => {
    it("marks secrets as configured when they exist in DB and missing otherwise", async () => {
      (mockPrisma.secret!.findMany as jest.Mock).mockResolvedValue([
        { id: "s1", name: "tavily-search-api-key", displayName: "Tavily Search API Key" },
        { id: "s2", name: "perplexity-api-key", displayName: "Perplexity API Key" },
      ]);

      const result = await service.getExpectedSecrets();

      const tavily = result.items.find((i) => i.name === "tavily-search-api-key");
      const perplexity = result.items.find((i) => i.name === "perplexity-api-key");
      const serper = result.items.find((i) => i.name === "serper-api-key");

      expect(tavily?.status).toBe("configured");
      expect(tavily?.secretId).toBe("s1");
      expect(perplexity?.status).toBe("configured");
      expect(perplexity?.secretId).toBe("s2");
      expect(serper?.status).toBe("missing");
      expect(serper?.secretId).toBeUndefined();

      expect(result.summary.configured).toBe(2);
      expect(result.summary.missing).toBe(result.summary.total - 2);
      expect(result.summary.total).toBe(result.items.length);
      expect(result.orphans).toEqual([]);
    });

    it("puts unknown DB secrets into orphans", async () => {
      (mockPrisma.secret!.findMany as jest.Mock).mockResolvedValue([
        { id: "s1", name: "tavily-search-api-key", displayName: "Tavily Search API Key" },
        { id: "s99", name: "legacy-foo-key", displayName: "Legacy Foo Key" },
      ]);

      const result = await service.getExpectedSecrets();

      expect(result.orphans).toHaveLength(1);
      expect(result.orphans[0]).toEqual({
        name: "legacy-foo-key",
        displayName: "Legacy Foo Key",
        secretId: "s99",
      });
    });

    it("returns relatedToolIds for each item", async () => {
      (mockPrisma.secret!.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getExpectedSecrets();

      const tavily = result.items.find((i) => i.name === "tavily-search-api-key");
      expect(tavily?.relatedToolIds).toContain("tavily");
    });

    it("returns empty orphans when DB only has expected secrets", async () => {
      (mockPrisma.secret!.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getExpectedSecrets();

      expect(result.orphans).toEqual([]);
      expect(result.summary.configured).toBe(0);
      expect(result.summary.missing).toBe(result.summary.total);
    });
  });

  // ==================== migrateExistingKeys ====================

  describe("migrateExistingKeys", () => {
    it("skips AI models with null apiKey", async () => {
      (mockPrisma.aIModel!.findMany as jest.Mock).mockResolvedValue([
        {
          id: "m1",
          name: "gpt4",
          displayName: "GPT-4",
          provider: "openai",
          apiKey: null,
        },
      ]);
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.systemSetting!.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      const result = await service.migrateExistingKeys();

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it("skips already-existing secrets", async () => {
      (mockPrisma.aIModel!.findMany as jest.Mock).mockResolvedValue([
        {
          id: "m1",
          name: "gpt4",
          displayName: "GPT-4",
          provider: "openai",
          apiKey: "some-plain-key",
        },
      ]);
      // secret already exists
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret(),
      );
      (mockPrisma.systemSetting!.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      const result = await service.migrateExistingKeys();

      expect(result.skipped).toBeGreaterThan(0);
      expect(result.imported).toBe(0);
    });

    it("records error when legacy decryption fails", async () => {
      // Legacy format: "iv:encrypted" - provide something that will fail decryption
      (mockPrisma.aIModel!.findMany as jest.Mock).mockResolvedValue([
        {
          id: "m1",
          name: "gpt4",
          displayName: "GPT-4",
          provider: "openai",
          apiKey: "badhex:badhex", // two-part format triggers decryptLegacy
        },
      ]);
      // secret doesn't exist yet
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.systemSetting!.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      const result = await service.migrateExistingKeys();

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("handles errors in individual model migration gracefully", async () => {
      (mockPrisma.aIModel!.findMany as jest.Mock).mockResolvedValue([
        {
          id: "m1",
          name: "gpt4",
          displayName: "GPT-4",
          provider: "openai",
          apiKey: "plain-key-value",
        },
      ]);
      // findUnique returns null (no existing), create throws
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.secret!.create as jest.Mock).mockRejectedValue(
        new Error("DB error"),
      );
      (mockPrisma.systemSetting!.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      const result = await service.migrateExistingKeys();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("DB error");
    });
  });

  // ==================== update (additional branches) ====================

  describe("update (additional branches)", () => {
    it("skips version creation when value is empty string", async () => {
      const existing = makeSecret();
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(existing);
      (mockPrisma.secret!.update as jest.Mock).mockResolvedValue(existing);

      await service.update("test-api-key", { value: "" });

      expect(mockPrisma.secretVersion!.create).not.toHaveBeenCalled();
    });

    it("updates metadata fields without value change", async () => {
      const existing = makeSecret();
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(existing);
      (mockPrisma.secret!.update as jest.Mock).mockResolvedValue(existing);

      await service.update("test-api-key", {
        displayName: "Updated Name",
        description: "New desc",
        provider: "anthropic",
        isActive: false,
        category: SecretCategory.AI_MODEL,
      });

      const updateCall = (mockPrisma.secret!.update as jest.Mock).mock
        .calls[0][0];
      expect(updateCall.data.displayName).toBe("Updated Name");
      expect(updateCall.data.isActive).toBe(false);
    });

    it("throws NotFoundException for soft-deleted secret on update", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret({ deletedAt: new Date() }),
      );

      await expect(
        service.update("deleted-key", { displayName: "X" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== delete (additional branches) ====================

  describe("delete (additional branches)", () => {
    it("throws NotFoundException for soft-deleted secret", async () => {
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(
        makeSecret({ deletedAt: new Date() }),
      );

      await expect(service.delete("deleted-key")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("logs access with userEmail when context provided", async () => {
      const existing = makeSecret();
      (mockPrisma.secret!.findUnique as jest.Mock).mockResolvedValue(existing);
      (mockPrisma.aIModel!.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.secret!.update as jest.Mock).mockResolvedValue(existing);

      await service.delete("test-api-key", {
        userId: "u1",
        userEmail: "admin@test.com",
      });

      expect(mockPrisma.secretAccessLog!.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: SecretAction.DELETE,
          }),
        }),
      );
    });
  });
});
