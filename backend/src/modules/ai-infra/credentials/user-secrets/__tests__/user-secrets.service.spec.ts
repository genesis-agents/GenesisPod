import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SecretCategory, UserApiKeyMode } from "@prisma/client";
import { UserSecretsService } from "../user-secrets.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { EncryptionService } from "../../../encryption/encryption.service";
import { UserApiKeysService } from "../../user-api-keys/user-api-keys.service";

describe("UserSecretsService", () => {
  let service: UserSecretsService;
  let prisma: {
    secret: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    userApiKey: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let encryption: {
    encryptForUser: jest.Mock;
    decryptForUser: jest.Mock;
    createKeyHint: jest.Mock;
  };
  let userApiKeys: { saveKey: jest.Mock; deleteKey: jest.Mock };

  beforeEach(async () => {
    prisma = {
      secret: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      userApiKey: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };
    encryption = {
      encryptForUser: jest
        .fn()
        .mockReturnValue({ encryptedValue: "enc", iv: "iv" }),
      decryptForUser: jest.fn().mockReturnValue("sk-plain-1234"),
      createKeyHint: jest.fn().mockReturnValue("sk-...1234"),
    };
    userApiKeys = {
      saveKey: jest.fn().mockResolvedValue({ success: true, mode: "personal" }),
      deleteKey: jest.fn().mockResolvedValue({ success: true }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UserSecretsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryption },
        { provide: UserApiKeysService, useValue: userApiKeys },
      ],
    }).compile();
    service = moduleRef.get(UserSecretsService);
  });

  describe("create — 铁律 1：按 category 分流", () => {
    it("AI_MODEL 写 user_api_keys（不落 secrets 表）", async () => {
      prisma.userApiKey.findUnique.mockResolvedValue({
        id: "uak-1",
        provider: "openai",
        keyHint: "sk-...1234",
        isActive: true,
        usageCount: 0,
        testStatus: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.create("user-1", {
        name: "openai",
        category: SecretCategory.AI_MODEL,
        provider: "openai",
        value: "sk-plain-1234",
      });

      expect(userApiKeys.saveKey).toHaveBeenCalledWith(
        "user-1",
        "openai",
        "sk-plain-1234",
        "personal",
      );
      expect(prisma.secret.create).not.toHaveBeenCalled();
      expect(res.source).toBe("llm");
    });

    it("AI_MODEL 缺 provider → BadRequest", async () => {
      await expect(
        service.create("user-1", {
          name: "x",
          category: SecretCategory.AI_MODEL,
          value: "v",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("SEARCH 类写 secrets 表（per-user 加密）", async () => {
      prisma.secret.findFirst.mockResolvedValue(null);
      prisma.secret.create.mockResolvedValue({
        id: "sec-1",
        name: "tavily-search-api-key",
        displayName: "Tavily",
        category: SecretCategory.SEARCH,
        provider: "tavily",
        accessCount: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.create("user-1", {
        name: "tavily-search-api-key",
        category: SecretCategory.SEARCH,
        provider: "tavily",
        value: "tvly-xyz",
      });

      expect(encryption.encryptForUser).toHaveBeenCalledWith(
        "tvly-xyz",
        "user-1",
      );
      expect(prisma.secret.create).toHaveBeenCalled();
      expect(userApiKeys.saveKey).not.toHaveBeenCalled();
      expect(res.source).toBe("secret");
    });
  });

  describe("list — 铁律 2：排除捐赠", () => {
    it("user_api_keys 过滤 mode != DONATED；secrets 过滤 category != USER_DONATED", async () => {
      await service.list("user-1");
      expect(prisma.userApiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1", mode: { not: UserApiKeyMode.DONATED } },
        }),
      );
      expect(prisma.secret.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: "user-1",
            deletedAt: null,
            category: { not: SecretCategory.USER_DONATED },
          },
        }),
      );
    });
  });

  describe("getUserSecretValue — owner 隔离（D6/安全关键-2）", () => {
    it("缺 userId 抛 BadRequest", async () => {
      await expect(
        service.getUserSecretValue("tavily-search-api-key", ""),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("查询强制带 userId，命中则 per-user 解密", async () => {
      prisma.secret.findFirst.mockResolvedValue({
        encryptedValue: "enc",
        iv: "iv",
        expiresAt: null,
      });
      const val = await service.getUserSecretValue("tavily", "user-1");
      expect(prisma.secret.findFirst).toHaveBeenCalledWith({
        where: {
          name: "tavily",
          userId: "user-1",
          isActive: true,
          deletedAt: null,
        },
      });
      expect(encryption.decryptForUser).toHaveBeenCalledWith(
        "enc",
        "iv",
        "user-1",
      );
      expect(val).toBe("sk-plain-1234");
    });

    it("未命中（别人的 Key）返回 null", async () => {
      prisma.secret.findFirst.mockResolvedValue(null);
      const val = await service.getUserSecretValue("tavily", "user-2");
      expect(val).toBeNull();
    });
  });

  describe("testKey — C8 Key 测试", () => {
    it("llm source: Key 存在 → success=true", async () => {
      prisma.userApiKey.findFirst.mockResolvedValue({
        id: "uak-1",
        provider: "openai",
        keyHint: "sk-...1234",
      });
      const res = await service.testKey("user-1", "llm", "uak-1");
      expect(res.success).toBe(true);
      expect(res.testedAt).toBeTruthy();
    });

    it("llm source: Key 不属于该用户 → success=false, 不抛错", async () => {
      prisma.userApiKey.findFirst.mockResolvedValue(null);
      const res = await service.testKey("user-1", "llm", "other-uak");
      expect(res.success).toBe(false);
      expect(res.message).toContain("未找到");
    });

    it("secret source: Key 存在且启用 → success=true", async () => {
      prisma.secret.findFirst.mockResolvedValue({
        id: "sec-1",
        name: "tavily-key",
        isActive: true,
      });
      const res = await service.testKey("user-1", "secret", "sec-1");
      expect(res.success).toBe(true);
    });

    it("secret source: Key 存在但已禁用 → success=false", async () => {
      prisma.secret.findFirst.mockResolvedValue({
        id: "sec-1",
        name: "tavily-key",
        isActive: false,
      });
      const res = await service.testKey("user-1", "secret", "sec-1");
      expect(res.success).toBe(false);
      expect(res.message).toContain("禁用");
    });

    it("secret source: Key 不属于该用户 → success=false, 不抛错", async () => {
      prisma.secret.findFirst.mockResolvedValue(null);
      const res = await service.testKey("user-1", "secret", "other-sec");
      expect(res.success).toBe(false);
    });
  });

  describe("remove — owner 校验防 IDOR", () => {
    it("secret 不属于该用户 → NotFound", async () => {
      prisma.secret.findFirst.mockResolvedValue(null);
      await expect(
        service.remove("user-1", "secret", "sec-of-other-user"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("secret 属于该用户 → 软删除", async () => {
      prisma.secret.findFirst.mockResolvedValue({ id: "sec-1" });
      await service.remove("user-1", "secret", "sec-1");
      expect(prisma.secret.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sec-1" },
          data: expect.objectContaining({ deletedBy: "user-1" }),
        }),
      );
    });
  });
});
