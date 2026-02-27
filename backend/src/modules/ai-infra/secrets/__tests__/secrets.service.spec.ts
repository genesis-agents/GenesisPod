import { Test, TestingModule } from "@nestjs/testing";
import { Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SecretsService } from "../secrets.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { SecretCategory, SecretAction } from "@prisma/client";

describe("SecretsService", () => {
  let service: SecretsService;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;

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
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "SETTINGS_ENCRYPTION_KEY")
          return "test-encryption-key-32chars-ok!";
        if (key === "NODE_ENV") return "test";
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecretsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
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

  // ==================== constructor ====================

  describe("constructor", () => {
    it("throws when SETTINGS_ENCRYPTION_KEY missing in production", async () => {
      const prodConfigService = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === "NODE_ENV") return "production";
          return undefined;
        }),
      };

      await expect(
        Test.createTestingModule({
          providers: [
            SecretsService,
            { provide: PrismaService, useValue: mockPrisma },
            { provide: ConfigService, useValue: prodConfigService },
          ],
        })
          .compile()
          .then((m) => m.get<SecretsService>(SecretsService)),
      ).rejects.toThrow("CRITICAL");
    });

    it("uses default key in dev/test with warning", () => {
      const noKeyConfigService = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === "NODE_ENV") return "test";
          return undefined;
        }),
      };

      // Should not throw
      expect(
        () =>
          new SecretsService(
            mockPrisma as unknown as PrismaService,
            noKeyConfigService as unknown as ConfigService,
          ),
      ).not.toThrow();
    });
  });

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
});
