import { Test } from "@nestjs/testing";
import { ByokMode } from "@prisma/client";
import {
  NoToolKeyError,
  ToolKeyResolverService,
} from "../tool-key-resolver.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { SecretsService } from "../../../secrets/secrets.service";
import { SecretKeysService } from "../../../secrets/secret-keys.service";
import { UserSecretsService } from "../../user-secrets/user-secrets.service";

describe("ToolKeyResolverService", () => {
  let service: ToolKeyResolverService;
  let prisma: {
    user: { findUnique: jest.Mock };
    authorizationGrant: { findFirst: jest.Mock };
  };
  let secrets: { getValueInternal: jest.Mock };
  let secretKeys: { getSecretKey: jest.Mock };
  let userSecrets: { getUserSecretValue: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ byokMode: "STRICT" }) },
      authorizationGrant: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    secrets = { getValueInternal: jest.fn().mockResolvedValue(null) };
    // 默认 user-scoped secrets 读不到 → dual-read 回退既有 user_credentials 路径（现有用例不变）
    secretKeys = { getSecretKey: jest.fn().mockResolvedValue(null) };
    userSecrets = { getUserSecretValue: jest.fn().mockResolvedValue(null) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ToolKeyResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: SecretsService, useValue: secrets },
        { provide: SecretKeysService, useValue: secretKeys },
        { provide: UserSecretsService, useValue: userSecrets },
      ],
    }).compile();
    service = moduleRef.get(ToolKeyResolverService);
  });

  it("缺 userId 抛错（D6 不许静默退化 admin）", async () => {
    await expect(service.resolveToolKey("tavily", "")).rejects.toThrow(
      /userId is required/,
    );
  });

  it("优先用用户私有 Key（source=user）", async () => {
    userSecrets.getUserSecretValue.mockResolvedValue("tvly-user");
    const r = await service.resolveToolKey("tavily", "u1");
    expect(r).toEqual({
      value: "tvly-user",
      source: "user",
      secretName: "tavily-search-api-key",
    });
    expect(secrets.getValueInternal).not.toHaveBeenCalled();
  });

  it("收敛后优先 user-scoped secrets 多 Key（命中即用，不回退旧路径）", async () => {
    secretKeys.getSecretKey.mockResolvedValue({
      value: "tvly-secret-key",
      keyId: "sk-1",
      label: "primary",
    });
    const r = await service.resolveToolKey("tavily", "u1");
    expect(r?.source).toBe("user");
    expect(r?.value).toBe("tvly-secret-key");
    // dual-read：命中 secrets 后不应再走旧 user_credentials 路径
    expect(userSecrets.getUserSecretValue).not.toHaveBeenCalled();
    expect(secretKeys.getSecretKey).toHaveBeenCalledWith(
      "tavily-search-api-key",
      "u1",
    );
  });

  it("无用户 Key 但有授权 → 走 admin（source=granted）", async () => {
    prisma.authorizationGrant.findFirst.mockResolvedValue({ id: "g1" });
    secrets.getValueInternal.mockResolvedValue("tvly-admin");
    const r = await service.resolveToolKey("tavily", "u1");
    expect(r?.source).toBe("granted");
    expect(r?.value).toBe("tvly-admin");
  });

  it("STRICT 模式无 Key 无授权 → 抛 NoToolKeyError（不烧 admin 池）", async () => {
    prisma.user.findUnique.mockResolvedValue({ byokMode: ByokMode.STRICT });
    await expect(service.resolveToolKey("tavily", "u1")).rejects.toBeInstanceOf(
      NoToolKeyError,
    );
    expect(secrets.getValueInternal).not.toHaveBeenCalled();
  });

  it("FALLBACK 模式无 Key → 兜底 admin（source=admin-fallback）", async () => {
    prisma.user.findUnique.mockResolvedValue({ byokMode: ByokMode.FALLBACK });
    secrets.getValueInternal.mockResolvedValue("tvly-admin");
    const r = await service.resolveToolKey("tavily", "u1");
    expect(r?.source).toBe("admin-fallback");
    expect(r?.value).toBe("tvly-admin");
  });

  it("FALLBACK 模式但 admin 也没配 → null", async () => {
    prisma.user.findUnique.mockResolvedValue({ byokMode: ByokMode.FALLBACK });
    secrets.getValueInternal.mockResolvedValue(null);
    const r = await service.resolveToolKey("tavily", "u1");
    expect(r).toBeNull();
  });

  it("未知 toolId 按原样当 secret name", () => {
    expect(service.resolveSecretName("some-custom-tool")).toBe(
      "some-custom-tool",
    );
  });
});
