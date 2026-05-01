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
});
