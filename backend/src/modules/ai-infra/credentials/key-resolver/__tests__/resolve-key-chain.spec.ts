import { Test, TestingModule } from "@nestjs/testing";
import { KeyResolverService } from "../key-resolver.service";
import { KeyAssignmentsService } from "../../key-assignments/key-assignments.service";
import { UserApiKeysService } from "../../user-api-keys/user-api-keys.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { KeyHealthStore } from "../../health";

describe("KeyResolverService.resolveKeyChain", () => {
  let service: KeyResolverService;
  let userApiKeys: jest.Mocked<Partial<UserApiKeysService>>;
  let assignments: jest.Mocked<Partial<KeyAssignmentsService>>;
  let healthStore: jest.Mocked<Partial<KeyHealthStore>>;

  beforeEach(async () => {
    userApiKeys = {
      getPersonalKey: jest.fn().mockResolvedValue(null),
      listPersonalKeys: jest.fn().mockResolvedValue([]),
      getAvailableProviders: jest.fn().mockResolvedValue([]),
    };
    assignments = {
      resolveActive: jest.fn().mockResolvedValue(null),
      listActive: jest.fn().mockResolvedValue([]),
      getAvailableProviders: jest.fn().mockResolvedValue([]),
    };
    healthStore = {
      filterUsable: jest.fn(async (ids: string[]) => ids),
      getLastGood: jest.fn().mockResolvedValue(null),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyResolverService,
        {
          provide: PrismaService,
          useValue: { user: { findUnique: jest.fn() } },
        },
        { provide: UserApiKeysService, useValue: userApiKeys },
        { provide: KeyAssignmentsService, useValue: assignments },
        { provide: KeyHealthStore, useValue: healthStore },
      ],
    }).compile();
    service = module.get(KeyResolverService);
  });

  it("returns empty chain when user has no keys", async () => {
    const chain = await service.resolveKeyChain("u1", "openai");
    expect(chain.size).toBe(0);
    expect(await chain.next()).toBeNull();
  });

  it("returns single PERSONAL chain", async () => {
    (userApiKeys.listPersonalKeys as jest.Mock).mockResolvedValue([
      {
        keyRowId: "row1",
        label: "default",
        apiKey: "sk-1",
        apiEndpoint: null,
        preferredModelId: null,
      },
    ]);
    const chain = await service.resolveKeyChain("u1", "openai");
    expect(chain.size).toBe(1);
    const k = await chain.next();
    expect(k?.source).toBe("PERSONAL");
    expect(k?.label).toBe("default");
    expect(k?.healthKeyId).toBe("personal:u1:openai:default");
  });

  it("PERSONAL keys ordered by label asc, ASSIGNED appended", async () => {
    (userApiKeys.listPersonalKeys as jest.Mock).mockResolvedValue([
      {
        keyRowId: "r1",
        label: "default",
        apiKey: "sk-d",
        apiEndpoint: null,
        preferredModelId: null,
      },
      {
        keyRowId: "r2",
        label: "backup",
        apiKey: "sk-b",
        apiEndpoint: null,
        preferredModelId: null,
      },
    ]);
    (assignments.listActive as jest.Mock).mockResolvedValue([
      {
        assignmentId: "asg-1",
        keyId: "kid-1",
        apiKey: "sk-a",
        apiEndpoint: null,
        userQuotaCents: null,
        userSpendCents: 0,
      },
    ]);
    const chain = await service.resolveKeyChain("u1", "openai");
    expect(chain.size).toBe(3);
    const k1 = await chain.next();
    const k2 = await chain.next();
    const k3 = await chain.next();
    expect(k1?.label).toBe("default");
    expect(k2?.label).toBe("backup");
    expect(k3?.source).toBe("ASSIGNED");
    expect(k3?.assignmentId).toBe("asg-1");
  });

  it("LastGood is moved to head of chain", async () => {
    (userApiKeys.listPersonalKeys as jest.Mock).mockResolvedValue([
      {
        keyRowId: "r1",
        label: "default",
        apiKey: "sk-d",
        apiEndpoint: null,
        preferredModelId: null,
      },
      {
        keyRowId: "r2",
        label: "backup",
        apiKey: "sk-b",
        apiEndpoint: null,
        preferredModelId: null,
      },
    ]);
    // backup 是 LastGood
    (healthStore.getLastGood as jest.Mock).mockResolvedValue(
      "personal:u1:openai:backup",
    );

    const chain = await service.resolveKeyChain("u1", "openai");
    const k1 = await chain.next();
    const k2 = await chain.next();
    expect(k1?.label).toBe("backup"); // LastGood 顶置
    expect(k2?.label).toBe("default");
  });

  it("filterUsable removes DEAD keys from chain", async () => {
    (userApiKeys.listPersonalKeys as jest.Mock).mockResolvedValue([
      {
        keyRowId: "r1",
        label: "a",
        apiKey: "sk-a",
        apiEndpoint: null,
        preferredModelId: null,
      },
      {
        keyRowId: "r2",
        label: "b",
        apiKey: "sk-b",
        apiEndpoint: null,
        preferredModelId: null,
      },
    ]);
    // health 过滤掉 a
    (healthStore.filterUsable as jest.Mock).mockResolvedValue([
      "personal:u1:openai:b",
    ]);

    const chain = await service.resolveKeyChain("u1", "openai");
    expect(chain.size).toBe(1);
    const k = await chain.next();
    expect(k?.label).toBe("b");
  });

  it("LastGood is ignored if filtered out by health", async () => {
    (userApiKeys.listPersonalKeys as jest.Mock).mockResolvedValue([
      {
        keyRowId: "r1",
        label: "default",
        apiKey: "sk-d",
        apiEndpoint: null,
        preferredModelId: null,
      },
      {
        keyRowId: "r2",
        label: "backup",
        apiKey: "sk-b",
        apiEndpoint: null,
        preferredModelId: null,
      },
    ]);
    // backup 已 DEAD（被 filterUsable 过滤）
    (healthStore.filterUsable as jest.Mock).mockResolvedValue([
      "personal:u1:openai:default",
    ]);
    (healthStore.getLastGood as jest.Mock).mockResolvedValue(
      "personal:u1:openai:backup",
    );

    const chain = await service.resolveKeyChain("u1", "openai");
    expect(chain.size).toBe(1);
    const k = await chain.next();
    expect(k?.label).toBe("default"); // 不是 LastGood，因为 LastGood 已死
  });

  it("reportFailure / reportSuccess fanout to KeyHealthStore", async () => {
    const markFailure = jest.fn().mockResolvedValue(undefined);
    const markSuccess = jest.fn().mockResolvedValue(undefined);
    (healthStore as any).markFailure = markFailure;
    (healthStore as any).markSuccess = markSuccess;
    (userApiKeys.listPersonalKeys as jest.Mock).mockResolvedValue([
      {
        keyRowId: "r1",
        label: "default",
        apiKey: "sk-d",
        apiEndpoint: null,
        preferredModelId: null,
      },
    ]);

    const chain = await service.resolveKeyChain("u1", "openai");
    const k = await chain.next();
    if (!k) throw new Error("expected key");

    await chain.reportSuccess(k);
    expect(markSuccess).toHaveBeenCalledWith(
      "personal:u1:openai:default",
      "openai",
      "u1",
    );

    await chain.reportFailure(k, {
      action: "NEXT_KEY",
      reason: "AUTH_FAILED",
      cooldownMs: Number.POSITIVE_INFINITY,
      markDead: true,
      shouldStopChain: false,
      originalMessage: "401",
      httpStatus: 401,
    });
    expect(markFailure).toHaveBeenCalledWith(
      "personal:u1:openai:default",
      expect.objectContaining({ reason: "AUTH_FAILED" }),
      "openai",
    );
  });
});
