import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SecretCategory } from "@prisma/client";
import { UserSecretsService } from "../user-secrets.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { EncryptionService } from "../../../encryption/encryption.service";
import { UserApiKeysService } from "../../user-api-keys/user-api-keys.service";
import { UserCredentialsService } from "../../user-credentials/user-credentials.service";
import { SecretsService } from "../../../secrets/secrets.service";

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
    userCredential: { findFirst: jest.Mock };
  };
  let encryption: {
    encryptForUser: jest.Mock;
    decryptForUser: jest.Mock;
    decryptAny: jest.Mock;
    createKeyHint: jest.Mock;
  };
  let userApiKeys: { saveKey: jest.Mock; deleteKey: jest.Mock };
  let userCredentials: {
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    testKey: jest.Mock;
    getCredentialValue: jest.Mock;
  };
  let secrets: {
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    getByIdForUser: jest.Mock;
  };

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
      // 默认：id 不属于 user_credentials → 走 legacy secrets 路径
      userCredential: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    encryption = {
      encryptForUser: jest
        .fn()
        .mockReturnValue({ encryptedValue: "enc", iv: "iv" }),
      decryptForUser: jest.fn().mockReturnValue("sk-plain-1234"),
      decryptAny: jest.fn().mockResolvedValue("sk-plain-1234"),
      createKeyHint: jest.fn().mockReturnValue("sk-...1234"),
    };
    userApiKeys = {
      saveKey: jest.fn().mockResolvedValue({ success: true, mode: "personal" }),
      deleteKey: jest.fn().mockResolvedValue({ success: true }),
    };
    userCredentials = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({ success: true }),
      remove: jest.fn().mockResolvedValue({ success: true }),
      testKey: jest
        .fn()
        .mockResolvedValue({ success: true, message: "ok", testedAt: "t" }),
      getCredentialValue: jest.fn().mockResolvedValue(null),
    };
    // ★ 2026-05-29 P4：工具类收敛到 user-scoped secrets，create/update/delete 走 SecretsService
    secrets = {
      create: jest.fn().mockResolvedValue({
        id: "sec-new",
        name: "tavily",
        displayName: "Tavily",
        category: SecretCategory.SEARCH,
        provider: "tavily",
        maskedValue: "tv-...1234",
        isActive: true,
        accessCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue(undefined),
      getByIdForUser: jest.fn().mockResolvedValue(null),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UserSecretsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryption },
        { provide: UserApiKeysService, useValue: userApiKeys },
        { provide: UserCredentialsService, useValue: userCredentials },
        { provide: SecretsService, useValue: secrets },
      ],
    }).compile();
    service = moduleRef.get(UserSecretsService);
  });

  describe("create — 铁律 1：按 category 分流", () => {
    it("AI_MODEL 写 user_api_keys（不落工具表）", async () => {
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
      expect(userCredentials.create).not.toHaveBeenCalled();
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

    it("SEARCH 类收敛到 user-scoped secrets（2026-05-29 P4，含 primary key）", async () => {
      secrets.create.mockResolvedValue({
        id: "sec-new",
        name: "tavily-search-api-key",
        displayName: "Tavily",
        category: SecretCategory.SEARCH,
        provider: "tavily",
        maskedValue: "tv-...1234",
        isActive: true,
        accessCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.create("user-1", {
        name: "tavily-search-api-key",
        category: SecretCategory.SEARCH,
        provider: "tavily",
        value: "tvly-xyz",
      });

      // 走 SecretsService.create（user 作用域 ownerUserId），不再落 user_credentials
      expect(secrets.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "tavily-search-api-key",
          value: "tvly-xyz",
        }),
        { userId: "user-1" },
        "user-1",
      );
      expect(userCredentials.create).not.toHaveBeenCalled();
      expect(userApiKeys.saveKey).not.toHaveBeenCalled();
      expect(res.source).toBe("secret");
      expect(res.id).toBe("sec-new");
    });
  });

  describe("list — UNION user_api_keys + user_credentials (+legacy secrets)", () => {
    it("聚合三来源，legacy secrets 与 cred 同名去重", async () => {
      prisma.userApiKey.findMany.mockResolvedValue([]);
      userCredentials.list.mockResolvedValue([
        {
          id: "cred-1",
          name: "tavily",
          displayName: "Tavily",
          category: SecretCategory.SEARCH,
          provider: "tavily",
          maskedValue: "sk-...aaaa",
          isActive: true,
          usageCount: 0,
          testStatus: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      prisma.secret.findMany.mockResolvedValue([
        {
          id: "sec-dup",
          name: "tavily", // 同名 → 被去重
          displayName: "old",
          category: SecretCategory.SEARCH,
          provider: "tavily",
          keyHint: "sk-...bbbb",
          isActive: true,
          accessCount: 0,
          encryptedValue: "e",
          iv: "i",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await service.list("user-1");

      expect(userCredentials.list).toHaveBeenCalledWith("user-1");
      // cred 保留，legacy 同名被过滤
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe("cred-1");
    });
  });

  describe("getUserSecretValue — owner 隔离（D6/安全关键-2）", () => {
    it("缺 userId 抛 BadRequest", async () => {
      await expect(
        service.getUserSecretValue("tavily-search-api-key", ""),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("优先命中 user_credentials（信封 v2）", async () => {
      userCredentials.getCredentialValue.mockResolvedValue("sk-from-cred");
      const val = await service.getUserSecretValue("tavily", "user-1");
      expect(userCredentials.getCredentialValue).toHaveBeenCalledWith(
        "tavily",
        "user-1",
      );
      expect(val).toBe("sk-from-cred");
      // 命中新表则不再查 legacy secrets
      expect(prisma.secret.findFirst).not.toHaveBeenCalled();
    });

    it("新表未命中则回退 secrets 行（decryptAny 按 encVersion 分派，兼容 envelope v2 与 legacy HKDF）", async () => {
      userCredentials.getCredentialValue.mockResolvedValue(null);
      const row = { encryptedValue: "enc", iv: "iv", expiresAt: null };
      prisma.secret.findFirst.mockResolvedValue(row);
      const val = await service.getUserSecretValue("tavily", "user-1");
      // ★ 评审修复：用 decryptAny（不再写死 decryptForUser），envelope v2 行才能解开
      expect(encryption.decryptAny).toHaveBeenCalledWith(row, {
        userId: "user-1",
      });
      expect(val).toBe("sk-plain-1234");
    });

    it("两处都未命中返回 null", async () => {
      userCredentials.getCredentialValue.mockResolvedValue(null);
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

    it("secret source: id 命中 user_credentials → 委托新表", async () => {
      prisma.userCredential.findFirst.mockResolvedValue({ id: "cred-1" });
      const res = await service.testKey("user-1", "secret", "cred-1");
      expect(userCredentials.testKey).toHaveBeenCalledWith("user-1", "cred-1");
      expect(res.success).toBe(true);
    });

    it("secret source: legacy Key 存在且启用 → success=true", async () => {
      prisma.userCredential.findFirst.mockResolvedValue(null);
      prisma.secret.findFirst.mockResolvedValue({
        id: "sec-1",
        name: "tavily-key",
        isActive: true,
      });
      const res = await service.testKey("user-1", "secret", "sec-1");
      expect(res.success).toBe(true);
    });

    it("secret source: legacy Key 已禁用 → success=false", async () => {
      prisma.userCredential.findFirst.mockResolvedValue(null);
      prisma.secret.findFirst.mockResolvedValue({
        id: "sec-1",
        name: "tavily-key",
        isActive: false,
      });
      const res = await service.testKey("user-1", "secret", "sec-1");
      expect(res.success).toBe(false);
      expect(res.message).toContain("禁用");
    });
  });

  describe("remove — owner 校验防 IDOR", () => {
    it("id 命中 user_credentials → 委托新表软删", async () => {
      prisma.userCredential.findFirst.mockResolvedValue({ id: "cred-1" });
      await service.remove("user-1", "secret", "cred-1");
      expect(userCredentials.remove).toHaveBeenCalledWith("user-1", "cred-1");
    });

    it("legacy secret 不属于该用户 → NotFound", async () => {
      prisma.userCredential.findFirst.mockResolvedValue(null);
      prisma.secret.findFirst.mockResolvedValue(null);
      await expect(
        service.remove("user-1", "secret", "sec-of-other-user"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("user-scoped secret 属于该用户 → 走 SecretsService.delete（软删+级联禁用子key）", async () => {
      prisma.userCredential.findFirst.mockResolvedValue(null);
      secrets.getByIdForUser.mockResolvedValue({
        id: "sec-1",
        name: "tavily-search-api-key",
      });
      await service.remove("user-1", "secret", "sec-1");
      expect(secrets.delete).toHaveBeenCalledWith(
        "tavily-search-api-key",
        { userId: "user-1" },
        "user-1",
      );
    });
  });
});
