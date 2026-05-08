import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, Logger, NotFoundException } from "@nestjs/common";
import { KeyAssignmentsService } from "../key-assignments.service";
import { DistributableKeysService } from "../../distributable-keys/distributable-keys.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { KeyAssignmentStatus } from "@prisma/client";
import { QuotaExceededError } from "../../key-resolver/key-resolver.errors";

describe("KeyAssignmentsService", () => {
  let service: KeyAssignmentsService;
  let prisma: any;
  let distributable: jest.Mocked<Partial<DistributableKeysService>>;

  const makeAssignment = (overrides: Record<string, unknown> = {}) => ({
    id: "a-1",
    keyId: "k-1",
    userId: "u-1",
    provider: "openai",
    userQuotaCents: 1000,
    userSpendCents: 0,
    status: KeyAssignmentStatus.ACTIVE,
    assignedAt: new Date(),
    assignedBy: "admin",
    expiresAt: null,
    revokedAt: null,
    revokedBy: null,
    revokedReason: null,
    note: null,
    notifiedExpiringAt: null,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      distributableKey: {
        findUnique: jest.fn().mockResolvedValue({
          id: "k-1",
          provider: "openai",
          isActive: true,
          expiresAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      keyAssignment: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(makeAssignment()),
        update: jest.fn().mockResolvedValue(makeAssignment()),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      $transaction: jest.fn().mockImplementation(async (arg) => {
        if (typeof arg === "function") return arg(prisma);
        return Promise.all(arg);
      }),
    };
    distributable = {
      getDecryptedValue: jest.fn().mockResolvedValue({
        apiKey: "sk-decrypted",
        apiEndpoint: null,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyAssignmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DistributableKeysService, useValue: distributable },
      ],
    }).compile();
    service = module.get(KeyAssignmentsService);
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
  });

  describe("assign", () => {
    it("rejects when the underlying key is inactive", async () => {
      prisma.distributableKey.findUnique.mockResolvedValueOnce({
        id: "k",
        provider: "openai",
        isActive: false,
        expiresAt: null,
      });
      await expect(service.assign({ keyId: "k", userId: "u" })).rejects.toThrow(
        ConflictException,
      );
    });

    it("rejects when user already has an ACTIVE assignment for the same provider", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValueOnce(makeAssignment());
      await expect(
        service.assign({ keyId: "k-1", userId: "u-1" }),
      ).rejects.toThrow(ConflictException);
    });

    it("replaces a non-ACTIVE prior assignment (e.g. REVOKED) before creating", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValueOnce(
        makeAssignment({ status: KeyAssignmentStatus.REVOKED }),
      );
      await service.assign({ keyId: "k-1", userId: "u-1" });
      expect(prisma.keyAssignment.delete).toHaveBeenCalled();
      expect(prisma.keyAssignment.create).toHaveBeenCalled();
    });
  });

  describe("resolveActive", () => {
    it("returns null when no assignment exists", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValueOnce(null);
      expect(await service.resolveActive("u", "openai")).toBeNull();
    });

    it("returns null when status is not ACTIVE", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValueOnce(
        makeAssignment({ status: KeyAssignmentStatus.SUSPENDED }),
      );
      expect(await service.resolveActive("u", "openai")).toBeNull();
    });

    it("marks expired assignments and returns null", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValueOnce(
        makeAssignment({ expiresAt: new Date(Date.now() - 1000) }),
      );
      expect(await service.resolveActive("u", "openai")).toBeNull();
      expect(prisma.keyAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: KeyAssignmentStatus.EXPIRED },
        }),
      );
    });

    it("throws QuotaExceededError when user spend >= quota", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValueOnce(
        makeAssignment({ userSpendCents: 1000, userQuotaCents: 1000 }),
      );
      await expect(service.resolveActive("u", "openai")).rejects.toThrow(
        QuotaExceededError,
      );
    });

    it("returns decrypted key when within quota", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValueOnce(
        makeAssignment({ userSpendCents: 500 }),
      );
      const result = await service.resolveActive("u-1", "openai");
      expect(result?.apiKey).toBe("sk-decrypted");
      expect(result?.assignmentId).toBe("a-1");
    });

    it("returns null when pool-level key is unavailable (decryption yields null)", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValueOnce(makeAssignment());
      (distributable.getDecryptedValue as jest.Mock).mockResolvedValueOnce(
        null,
      );
      expect(await service.resolveActive("u-1", "openai")).toBeNull();
    });
  });

  describe("incrementSpend", () => {
    it("no-ops on non-positive cost", async () => {
      await service.incrementSpend("a-1", 0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("increments both user and pool spend in a transaction", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValueOnce({ keyId: "k-1" });
      await service.incrementSpend("a-1", 150);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe("revoke", () => {
    it("throws NotFound when assignment missing", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValueOnce(null);
      await expect(service.revoke("missing", "admin")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("sets REVOKED status and records auditor", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValueOnce(makeAssignment());
      await service.revoke("a-1", "admin@ex", "security");
      const call = prisma.keyAssignment.update.mock.calls[0][0];
      expect(call.data.status).toBe(KeyAssignmentStatus.REVOKED);
      expect(call.data.revokedBy).toBe("admin@ex");
      expect(call.data.revokedReason).toBe("security");
    });
  });

  describe("getAvailableProviders", () => {
    it("returns distinct provider strings", async () => {
      prisma.keyAssignment.findMany.mockResolvedValueOnce([
        { provider: "openai" },
        { provider: "anthropic" },
      ]);
      const ps = await service.getAvailableProviders("u");
      expect(ps).toEqual(expect.arrayContaining(["openai", "anthropic"]));
    });
  });

  // PR-E 2026-05-08: 模型粒度 resolveActive 双查路径
  describe("resolveActive with modelId fallback", () => {
    it("returns specific modelId match when present", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValueOnce(
        makeAssignment({ modelId: "gpt-4o" }),
      );
      const r = await service.resolveActive("u-1", "openai", "gpt-4o");
      expect(r).toBeTruthy();
      expect(r!.assignmentId).toBe("a-1");
      expect(prisma.keyAssignment.findUnique).toHaveBeenCalledTimes(1);
    });

    it("falls back to wildcard modelId='*' when specific not found", async () => {
      prisma.keyAssignment.findUnique
        .mockResolvedValueOnce(null) // 第一次具体 modelId 查无
        .mockResolvedValueOnce(makeAssignment({ modelId: "*" })); // fallback 通配命中
      const r = await service.resolveActive("u-1", "openai", "gpt-4o");
      expect(r).toBeTruthy();
      expect(prisma.keyAssignment.findUnique).toHaveBeenCalledTimes(2);
    });

    it("returns null when neither specific nor wildcard exist", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValue(null);
      const r = await service.resolveActive("u-1", "openai", "gpt-4o");
      expect(r).toBeNull();
    });

    it("legacy caller without modelId only queries wildcard once", async () => {
      prisma.keyAssignment.findUnique.mockResolvedValueOnce(
        makeAssignment({ modelId: "*" }),
      );
      const r = await service.resolveActive("u-1", "openai");
      expect(r).toBeTruthy();
      expect(prisma.keyAssignment.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  // PR-E 2026-05-08: computeNextRenewalAt 跨月 clamp（修 R1 评审 FAIL）
  // 实现用 local time（admin 直觉），所以 spec 用 local 时间方法判断（不用 UTC）
  describe("computeNextRenewalAt", () => {
    it("WEEK adds days correctly (14 天差)", () => {
      const from = new Date(2026, 0, 1); // 2026-01-01 local
      const next = service.computeNextRenewalAt(from, "WEEK", 2);
      const diffDays = (next.getTime() - from.getTime()) / 86_400_000;
      expect(diffDays).toBe(14);
    });

    it("MONTH from Jan 31 clamps to Feb 28 (non-leap year)", () => {
      const from = new Date(2026, 0, 31); // 2026-01-31 local
      const next = service.computeNextRenewalAt(from, "MONTH", 1);
      expect(next.getMonth()).toBe(1); // Feb
      expect(next.getDate()).toBeLessThanOrEqual(28);
      expect(next.getFullYear()).toBe(2026);
    });

    it("MONTH from Jan 31 clamps to Feb 29 in leap year 2028", () => {
      const from = new Date(2028, 0, 31); // 2028-01-31 local
      const next = service.computeNextRenewalAt(from, "MONTH", 1);
      expect(next.getMonth()).toBe(1); // Feb
      expect(next.getDate()).toBe(29);
    });

    it("MONTH 12→1 跨年正确", () => {
      const from = new Date(2026, 11, 15); // 2026-12-15
      const next = service.computeNextRenewalAt(from, "MONTH", 1);
      expect(next.getFullYear()).toBe(2027);
      expect(next.getMonth()).toBe(0); // Jan
      expect(next.getDate()).toBe(15);
    });

    it("YEAR Feb 29 leap → next year Feb 28 clamped", () => {
      const from = new Date(2028, 1, 29); // 2028-02-29 leap
      const next = service.computeNextRenewalAt(from, "YEAR", 1);
      expect(next.getFullYear()).toBe(2029);
      expect(next.getMonth()).toBe(1); // Feb
      expect(next.getDate()).toBe(28); // 2029 非闰
    });
  });

  // PR-E 2026-05-08: grantBatch 模型粒度批量授权
  describe("grantBatch", () => {
    beforeEach(() => {
      prisma.aIModel = {
        findFirst: jest.fn(),
      };
      prisma.distributableKey.findMany = jest.fn().mockResolvedValue([
        {
          id: "pool-1",
          monthlyQuotaCents: 100000,
          currentSpendCents: 10000,
          createdAt: new Date("2026-01-01"),
        },
      ]);
    });

    it("creates assignments for each model with auto-mapped pool", async () => {
      prisma.aIModel.findFirst
        .mockResolvedValueOnce({ provider: "OpenAI", modelId: "gpt-4o" })
        .mockResolvedValueOnce({
          provider: "Anthropic",
          modelId: "claude-opus-4",
        });
      prisma.keyAssignment.findUnique.mockResolvedValue(null);
      prisma.keyAssignment.create
        .mockResolvedValueOnce(makeAssignment({ modelId: "gpt-4o" }))
        .mockResolvedValueOnce(
          makeAssignment({ id: "a-2", modelId: "claude-opus-4" }),
        );

      const result = await service.grantBatch({
        userId: "u-1",
        models: [
          { modelId: "gpt-4o", userQuotaCents: 2000 },
          { modelId: "claude-opus-4", userQuotaCents: 3000 },
        ],
        validityType: "ONE_TIME",
        expiresAt: new Date("2026-12-31"),
      });

      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    it("partial failure: missing model pushes to failed[] not throws", async () => {
      prisma.aIModel.findFirst
        .mockResolvedValueOnce({ provider: "OpenAI", modelId: "gpt-4o" })
        .mockResolvedValueOnce(null); // 第二个 model 不存在
      prisma.keyAssignment.findUnique.mockResolvedValue(null);
      prisma.keyAssignment.create.mockResolvedValueOnce(
        makeAssignment({ modelId: "gpt-4o" }),
      );

      const result = await service.grantBatch({
        userId: "u-1",
        models: [{ modelId: "gpt-4o" }, { modelId: "nonexistent-model" }],
        validityType: "ONE_TIME",
        expiresAt: new Date("2026-12-31"),
      });

      expect(result.succeeded).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].modelId).toBe("nonexistent-model");
      expect(result.failed[0].reason).toContain("Model not found");
    });

    it("partial failure: no available pool pushes to failed[]", async () => {
      prisma.aIModel.findFirst.mockResolvedValueOnce({
        provider: "OpenAI",
        modelId: "gpt-4o",
      });
      prisma.distributableKey.findMany.mockResolvedValueOnce([]); // 无可用池

      const result = await service.grantBatch({
        userId: "u-1",
        models: [{ modelId: "gpt-4o" }],
        validityType: "ONE_TIME",
        expiresAt: new Date("2026-12-31"),
      });

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].reason).toContain("No available pool");
    });

    it("duplicate ACTIVE assignment pushes to failed[] not throws", async () => {
      prisma.aIModel.findFirst.mockResolvedValueOnce({
        provider: "OpenAI",
        modelId: "gpt-4o",
      });
      prisma.keyAssignment.findUnique.mockResolvedValue(
        makeAssignment({ modelId: "gpt-4o" }),
      );

      const result = await service.grantBatch({
        userId: "u-1",
        models: [{ modelId: "gpt-4o" }],
        validityType: "ONE_TIME",
        expiresAt: new Date("2026-12-31"),
      });

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].reason).toContain("already has active");
    });

    it("RECURRING without recurrenceUnit/Interval throws ConflictException", async () => {
      await expect(
        service.grantBatch({
          userId: "u-1",
          models: [{ modelId: "gpt-4o" }],
          validityType: "RECURRING",
          // 故意缺 recurrenceUnit + recurrenceInterval
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("RECURRING computes nextRenewalAt and creates with recurrence fields", async () => {
      prisma.aIModel.findFirst.mockResolvedValueOnce({
        provider: "OpenAI",
        modelId: "gpt-4o",
      });
      prisma.keyAssignment.findUnique.mockResolvedValue(null);
      prisma.keyAssignment.create.mockResolvedValueOnce(
        makeAssignment({ modelId: "gpt-4o" }),
      );

      await service.grantBatch({
        userId: "u-1",
        models: [{ modelId: "gpt-4o" }],
        validityType: "RECURRING",
        recurrenceUnit: "MONTH",
        recurrenceInterval: 1,
      });

      const createCall = prisma.keyAssignment.create.mock.calls[0][0];
      expect(createCall.data.validityType).toBe("RECURRING");
      expect(createCall.data.recurrenceUnit).toBe("MONTH");
      expect(createCall.data.recurrenceInterval).toBe(1);
      expect(createCall.data.nextRenewalAt).toBeInstanceOf(Date);
      expect(createCall.data.expiresAt).toBeNull(); // RECURRING 不用 expiresAt
    });

    it("returns empty result when models[] is empty", async () => {
      const result = await service.grantBatch({
        userId: "u-1",
        models: [],
        validityType: "ONE_TIME",
      });
      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
    });
  });
});
