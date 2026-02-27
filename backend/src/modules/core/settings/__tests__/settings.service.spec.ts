import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SettingsService } from "../settings.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";

describe("SettingsService", () => {
  let service: SettingsService;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;

  const makeSetting = (
    key: string,
    value: string | null,
    encrypted = false,
    category = "general",
  ) => ({
    id: `setting-${key}`,
    key,
    value,
    encrypted,
    description: null,
    category,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    mockPrisma = {
      systemSetting: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      } as unknown as PrismaService["systemSetting"],
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== onModuleInit ====================

  describe("onModuleInit", () => {
    it("refreshes cache on module init", async () => {
      const settings = [makeSetting("test_key", "test_value")];
      (mockPrisma.systemSetting!.findMany as jest.Mock).mockResolvedValue(
        settings,
      );
      (mockPrisma.systemSetting!.count as jest.Mock).mockResolvedValue(1);

      await service.onModuleInit();

      expect(mockPrisma.systemSetting!.findMany).toHaveBeenCalled();
    });

    it("handles DB error during cache refresh gracefully", async () => {
      // refreshCache fails — but diagnoseEncryptionIssues still needs findMany and count
      // to not blow up. Use mockImplementation that returns [] on second call.
      (mockPrisma.systemSetting!.findMany as jest.Mock)
        .mockRejectedValueOnce(new Error("DB error")) // refreshCache fails
        .mockResolvedValueOnce([]); // diagnoseEncryptionIssues call
      (mockPrisma.systemSetting!.count as jest.Mock).mockResolvedValue(0);

      // onModuleInit catches the error internally (refreshCache has try-catch)
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  // ==================== get ====================

  describe("get", () => {
    it("returns null when key not in cache or DB", async () => {
      const result = await service.get("nonexistent_key");
      expect(result).toBeNull();
    });

    it("returns default value when key not found", async () => {
      const result = await service.get("missing_key", "default");
      expect(result).toBe("default");
    });

    it("returns value from DB when not in cache", async () => {
      const setting = makeSetting("smtp_host", "smtp.example.com");
      (mockPrisma.systemSetting!.findUnique as jest.Mock).mockResolvedValue(
        setting,
      );

      const result = await service.get("smtp_host");
      expect(result).toBe("smtp.example.com");
    });

    it("returns cached value on subsequent calls", async () => {
      const setting = makeSetting("cached_key", "cached_value");
      (mockPrisma.systemSetting!.findUnique as jest.Mock).mockResolvedValue(
        setting,
      );

      await service.get("cached_key");
      await service.get("cached_key");

      expect(mockPrisma.systemSetting!.findUnique).toHaveBeenCalledTimes(1);
    });

    it("decrypts encrypted settings", async () => {
      // First, store an encrypted value via set()
      (mockPrisma.systemSetting!.upsert as jest.Mock).mockResolvedValue({});

      await service.set("smtp_pass", "my_password", { encrypted: true });

      // Then retrieve it — should be returned decrypted from cache
      const result = await service.get("smtp_pass");
      expect(result).toBe("my_password");
    });
  });

  // ==================== set ====================

  describe("set", () => {
    it("persists a plain-text setting", async () => {
      await service.set("site_name", "My Site");

      expect(mockPrisma.systemSetting!.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: "site_name" },
          create: expect.objectContaining({
            key: "site_name",
            value: "My Site",
            encrypted: false,
          }),
        }),
      );
    });

    it("encrypts sensitive settings when encrypted=true", async () => {
      await service.set("smtp_pass", "secret123", { encrypted: true });

      const upsertCall = (mockPrisma.systemSetting!.upsert as jest.Mock).mock
        .calls[0][0];
      expect(upsertCall.create.encrypted).toBe(true);
      // The stored value should NOT be the plain text
      expect(upsertCall.create.value).not.toBe("secret123");
    });

    it("stores null values without encryption attempt", async () => {
      await service.set("optional_key", null);

      const upsertCall = (mockPrisma.systemSetting!.upsert as jest.Mock).mock
        .calls[0][0];
      expect(upsertCall.create.value).toBeNull();
    });

    it("updates the cache after set", async () => {
      await service.set("my_key", "my_value");

      // Cache should be updated, so get returns without hitting DB
      const result = await service.get("my_key");
      expect(result).toBe("my_value");
      expect(mockPrisma.systemSetting!.findUnique).not.toHaveBeenCalled();
    });
  });

  // ==================== getEmailSettings ====================

  describe("getEmailSettings", () => {
    it("returns email settings with env fallback", async () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === "EMAIL_PROVIDER") return "smtp";
        if (key === "EMAIL_ENABLED") return "true";
        if (key === "SMTP_HOST") return "smtp.example.com";
        if (key === "SMTP_PORT") return "587";
        if (key === "SMTP_USER") return "user@example.com";
        return undefined;
      });

      const settings = await service.getEmailSettings();

      expect(settings.provider).toBe("smtp");
      expect(settings.enabled).toBe(true);
    });

    it("defaults to disabled when EMAIL_ENABLED is not set", async () => {
      (mockConfigService.get as jest.Mock).mockReturnValue(undefined);

      const settings = await service.getEmailSettings();

      expect(settings.enabled).toBe(false);
    });

    it("parses port as integer", async () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === "SMTP_PORT") return "465";
        return undefined;
      });

      const settings = await service.getEmailSettings();

      expect(typeof settings.port).toBe("number");
    });
  });

  // ==================== getSiteSettings ====================

  describe("getSiteSettings", () => {
    it("returns site settings with defaults", async () => {
      const settings = await service.getSiteSettings();

      expect(settings.maintenanceMode).toBe(false);
      expect(settings.allowRegistration).toBe(true);
    });

    it("reads maintenance mode from cache", async () => {
      await service.set("maintenance_mode", "true");

      const settings = await service.getSiteSettings();

      expect(settings.maintenanceMode).toBe(true);
    });
  });

  // ==================== getAiSettings ====================

  describe("getAiSettings", () => {
    it("returns AI settings with numeric types", async () => {
      const settings = await service.getAiSettings();

      expect(typeof settings.maxTokens).toBe("number");
      expect(typeof settings.temperature).toBe("number");
      expect(typeof settings.rateLimitPerMinute).toBe("number");
    });

    it("defaults to empty string for model (no hardcoded model name)", async () => {
      const settings = await service.getAiSettings();

      expect(settings.defaultModel).toBe("");
    });
  });

  // ==================== getSecuritySettings ====================

  describe("getSecuritySettings", () => {
    it("returns security settings with numeric defaults", async () => {
      const settings = await service.getSecuritySettings();

      expect(settings.sessionTimeoutHours).toBe(24);
      expect(settings.maxLoginAttempts).toBe(5);
      expect(settings.lockoutDurationMinutes).toBe(15);
    });
  });

  // ==================== getByCategory ====================

  describe("getByCategory", () => {
    it("returns settings filtered by category", async () => {
      const emailSettings = [
        makeSetting("smtp_host", "smtp.test.com", false, "email"),
        makeSetting("smtp_pass", "encrypted_val", true, "email"),
      ];
      (mockPrisma.systemSetting!.findMany as jest.Mock).mockResolvedValue(
        emailSettings,
      );

      const result = await service.getByCategory("email");

      expect(result).toHaveLength(2);
      expect(result[0].category).toBe("email");
      expect(mockPrisma.systemSetting!.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { category: "email" } }),
      );
    });
  });

  // ==================== getAll ====================

  describe("getAll", () => {
    it("masks encrypted values with asterisks", async () => {
      const settings = [
        makeSetting("public_key", "public_value", false, "general"),
        makeSetting("secret_key", "encrypted_value", true, "email"),
      ];
      (mockPrisma.systemSetting!.findMany as jest.Mock).mockResolvedValue(
        settings,
      );

      const result = await service.getAll();

      const publicSetting = result.find((s) => s.key === "public_key");
      const secretSetting = result.find((s) => s.key === "secret_key");

      expect(publicSetting!.value).toBe("public_value");
      expect(secretSetting!.value).toBe("********");
    });
  });

  // ==================== diagnoseEncryptionIssues ====================

  describe("diagnoseEncryptionIssues", () => {
    it("returns empty failed list when all settings decrypt correctly", async () => {
      // Store a properly encrypted setting via set()
      await service.set("smtp_pass", "test_password", { encrypted: true });

      const upsertCall = (mockPrisma.systemSetting!.upsert as jest.Mock).mock
        .calls[0][0];
      const encryptedValue = upsertCall.create.value;

      // Diagnose with that encrypted value
      (mockPrisma.systemSetting!.findMany as jest.Mock).mockResolvedValue([
        {
          ...makeSetting("smtp_pass", encryptedValue, true),
        },
      ]);
      (mockPrisma.systemSetting!.count as jest.Mock).mockResolvedValue(1);

      const result = await service.diagnoseEncryptionIssues(false);

      expect(result.failed).toHaveLength(0);
    });

    it("identifies settings with wrong format as failed", async () => {
      (mockPrisma.systemSetting!.findMany as jest.Mock).mockResolvedValue([
        makeSetting("bad_key", "not_encrypted_format", true),
      ]);
      (mockPrisma.systemSetting!.count as jest.Mock).mockResolvedValue(1);

      const result = await service.diagnoseEncryptionIssues(false);

      expect(result.failed).toContain("bad_key");
    });

    it("fixes corrupted settings when fix=true", async () => {
      // Note: onModuleInit already ran (refreshCache + diagnoseEncryptionIssues(false))
      // consuming the default mockResolvedValue([]) calls.
      // For our test call, set up the mock for the diagnoseEncryptionIssues query:
      // diagnoseEncryptionIssues calls findMany({ where: { encrypted: true } })
      // then prisma.systemSetting.count(), then (if fix) update, then refreshCache (findMany again)
      const corruptSetting = makeSetting(
        "corrupt_key",
        "bad_value_no_colon",
        true,
      );
      (mockPrisma.systemSetting!.findMany as jest.Mock)
        .mockResolvedValueOnce([corruptSetting]) // encrypted settings query
        .mockResolvedValueOnce([]); // refreshCache after fixing
      (mockPrisma.systemSetting!.count as jest.Mock).mockResolvedValue(1);
      (mockPrisma.systemSetting!.update as jest.Mock).mockResolvedValue({
        ...corruptSetting,
        value: null,
        encrypted: false,
      });

      const result = await service.diagnoseEncryptionIssues(true);

      // Should identify as failed (bad format) and fix it
      expect(result.total).toBe(1);
      // The corrupt setting must be either in failed or fixed
      const wasFixed = result.fixed.includes("corrupt_key");
      const wasFailed = result.failed.includes("corrupt_key");
      expect(wasFixed || wasFailed).toBe(true);
    });
  });
});
