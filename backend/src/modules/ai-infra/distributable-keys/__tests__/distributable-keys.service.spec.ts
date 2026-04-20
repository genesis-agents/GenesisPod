import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DistributableKeysService } from "../distributable-keys.service";
import { EncryptionService } from "../../encryption/encryption.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";

const buildEncryption = () =>
  new EncryptionService({
    get: (key: string) =>
      key === "SETTINGS_ENCRYPTION_KEY"
        ? "test-encryption-key-32chars-ok!"
        : key === "NODE_ENV"
          ? "test"
          : undefined,
  } as unknown as ConfigService);

describe("DistributableKeysService", () => {
  let service: DistributableKeysService;
  let prisma: jest.Mocked<Partial<PrismaService>>;

  const makeKey = (overrides: Record<string, unknown> = {}) => ({
    id: "key-1",
    provider: "openai",
    label: "Pool 2026Q2",
    encryptedValue: "enc",
    iv: "iv",
    keyHint: "sk-...1234",
    keyVersion: 1,
    apiEndpoint: null,
    monthlyQuotaCents: 50000,
    currentSpendCents: 0,
    quotaResetAt: new Date("2026-05-01"),
    isActive: true,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "admin@example.com",
    updatedBy: null,
    _count: { assignments: 0 },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      distributableKey: {
        create: jest.fn().mockResolvedValue(makeKey()),
        findUnique: jest.fn().mockResolvedValue(makeKey()),
        findMany: jest.fn().mockResolvedValue([makeKey()]),
        update: jest.fn().mockResolvedValue(makeKey()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      } as unknown as PrismaService["distributableKey"],
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DistributableKeysService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: buildEncryption() },
      ],
    }).compile();
    service = module.get(DistributableKeysService);
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  describe("create", () => {
    it("encrypts key and normalizes provider", async () => {
      await service.create({
        provider: "OpenAI",
        label: "  Batch A  ",
        apiKey: "sk-secret-xyz",
      });
      const call = (prisma.distributableKey!.create as jest.Mock).mock
        .calls[0][0];
      expect(call.data.provider).toBe("openai");
      expect(call.data.label).toBe("Batch A");
      expect(call.data.encryptedValue).toEqual(expect.any(String));
      expect(call.data.iv).toMatch(/^[0-9a-f]{32}$/);
      expect(call.data.keyHint).toBe("sk-...-xyz");
    });

    it("rejects invalid provider names", async () => {
      await expect(
        service.create({ provider: "bad name!", label: "x", apiKey: "k" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects empty apiKey", async () => {
      await expect(
        service.create({ provider: "openai", label: "x", apiKey: "   " }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("hasAvailableCapacity", () => {
    it("returns false when key is inactive", async () => {
      (prisma.distributableKey!.findUnique as jest.Mock).mockResolvedValue({
        isActive: false,
        expiresAt: null,
        monthlyQuotaCents: null,
        currentSpendCents: 0,
      });
      expect(await service.hasAvailableCapacity("k")).toBe(false);
    });

    it("returns false when expired", async () => {
      (prisma.distributableKey!.findUnique as jest.Mock).mockResolvedValue({
        isActive: true,
        expiresAt: new Date(Date.now() - 1000),
        monthlyQuotaCents: null,
        currentSpendCents: 0,
      });
      expect(await service.hasAvailableCapacity("k")).toBe(false);
    });

    it("returns true when no quota limit and active", async () => {
      (prisma.distributableKey!.findUnique as jest.Mock).mockResolvedValue({
        isActive: true,
        expiresAt: null,
        monthlyQuotaCents: null,
        currentSpendCents: 10,
      });
      expect(await service.hasAvailableCapacity("k")).toBe(true);
    });

    it("returns false when spend has reached quota", async () => {
      (prisma.distributableKey!.findUnique as jest.Mock).mockResolvedValue({
        isActive: true,
        expiresAt: null,
        monthlyQuotaCents: 100,
        currentSpendCents: 100,
      });
      expect(await service.hasAvailableCapacity("k")).toBe(false);
    });
  });

  describe("incrementPoolSpend", () => {
    it("skips 0 / negative cost", async () => {
      await service.incrementPoolSpend("k", 0);
      await service.incrementPoolSpend("k", -5);
      expect(prisma.distributableKey!.update).not.toHaveBeenCalled();
    });

    it("increments currentSpendCents", async () => {
      await service.incrementPoolSpend("k", 123);
      expect(prisma.distributableKey!.update).toHaveBeenCalledWith({
        where: { id: "k" },
        data: { currentSpendCents: { increment: 123 } },
      });
    });
  });

  describe("resetMonthlyQuotas", () => {
    it("resets currentSpendCents to 0 and pushes quotaResetAt to next month UTC", async () => {
      const now = new Date(Date.UTC(2026, 3, 15, 12, 0, 0));
      await service.resetMonthlyQuotas(now);
      const call = (prisma.distributableKey!.updateMany as jest.Mock).mock
        .calls[0][0];
      expect(call.where).toEqual({ quotaResetAt: { lte: now } });
      expect(call.data.currentSpendCents).toBe(0);
      expect((call.data.quotaResetAt as Date).toISOString()).toBe(
        "2026-05-01T00:00:00.000Z",
      );
    });
  });

  describe("update", () => {
    it("throws NotFound for missing key", async () => {
      (prisma.distributableKey!.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      await expect(service.update("k", { label: "new" })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("re-encrypts when apiKey is provided", async () => {
      await service.update("key-1", { apiKey: "sk-new-value" });
      const call = (prisma.distributableKey!.update as jest.Mock).mock
        .calls[0][0];
      expect(call.data.encryptedValue).toEqual(expect.any(String));
      expect(call.data.iv).toMatch(/^[0-9a-f]{32}$/);
      expect(call.data.keyHint).toBe("sk-...alue");
      expect(call.data.keyVersion).toEqual({ increment: 1 });
    });
  });

  describe("pickBestForProvider", () => {
    it("returns first key with remaining quota", async () => {
      (prisma.distributableKey!.findMany as jest.Mock).mockResolvedValue([
        makeKey({ monthlyQuotaCents: 100, currentSpendCents: 100 }),
        makeKey({
          id: "key-2",
          monthlyQuotaCents: 500,
          currentSpendCents: 200,
        }),
      ]);
      const key = await service.pickBestForProvider("openai");
      expect(key?.id).toBe("key-2");
    });

    it("returns null when all candidates are full", async () => {
      (prisma.distributableKey!.findMany as jest.Mock).mockResolvedValue([
        makeKey({ monthlyQuotaCents: 100, currentSpendCents: 100 }),
      ]);
      expect(await service.pickBestForProvider("openai")).toBeNull();
    });
  });
});
