import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SecretCategory } from "@prisma/client";
import { UserCredentialsService } from "../user-credentials.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { EncryptionService } from "../../../../ai-infra/encryption/encryption.service";

const buildEncryption = (): EncryptionService =>
  new EncryptionService({
    get: (key: string) =>
      key === "SETTINGS_ENCRYPTION_KEY"
        ? "unit-test-master-key"
        : key === "NODE_ENV"
          ? "test"
          : undefined,
  } as unknown as ConfigService);

describe("UserCredentialsService", () => {
  let service: UserCredentialsService;
  let prisma: { userCredential: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      userCredential: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserCredentialsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: buildEncryption() },
      ],
    }).compile();

    service = module.get(UserCredentialsService);
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
  });

  describe("create", () => {
    it("rejects AI_MODEL category", async () => {
      await expect(
        service.create("user-1", {
          name: "x",
          category: SecretCategory.AI_MODEL,
          value: "sk-x",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("envelope-encrypts and stores v2 columns", async () => {
      let createdData: Record<string, unknown> = {};
      prisma.userCredential.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createdData = args.data;
          return Promise.resolve({
            id: "c1",
            name: "tavily",
            displayName: "Tavily",
            category: SecretCategory.SEARCH,
            provider: "tavily",
            keyHint: "sk-...cdef",
            isActive: true,
            accessCount: 0,
            testStatus: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        },
      );

      const res = await service.create("user-1", {
        name: "tavily",
        category: SecretCategory.SEARCH,
        provider: "tavily",
        value: "sk-tavily-abcdef",
      });

      expect(createdData.encVersion).toBe(2);
      expect(createdData.authTag).toMatch(/^[0-9a-f]{32}$/);
      expect(typeof createdData.wrappedDek).toBe("string");
      expect(createdData.encryptedValue).not.toBe("sk-tavily-abcdef");
      expect(res.id).toBe("c1");
      expect(res.maskedValue).toBe("sk-...cdef");
    });

    it("throws ConflictException on active duplicate name", async () => {
      prisma.userCredential.findFirst.mockResolvedValue({
        id: "existing",
        deletedAt: null,
      });
      await expect(
        service.create("user-1", {
          name: "dup",
          category: SecretCategory.SEARCH,
          value: "sk-x",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("getCredentialValue", () => {
    it("throws when userId missing (BYOK isolation)", async () => {
      await expect(service.getCredentialValue("tavily", "")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("roundtrips: returns decrypted plaintext for an envelope row", async () => {
      const enc = await buildEncryption().encryptEnvelope("sk-runtime-secret");
      prisma.userCredential.findFirst.mockResolvedValue({
        id: "c1",
        ...enc,
        expiresAt: null,
      });
      const val = await service.getCredentialValue("tavily", "user-1");
      expect(val).toBe("sk-runtime-secret");
      expect(prisma.userCredential.findFirst).toHaveBeenCalledWith({
        where: {
          name: "tavily",
          userId: "user-1",
          isActive: true,
          deletedAt: null,
        },
      });
    });

    it("returns null when not found", async () => {
      prisma.userCredential.findFirst.mockResolvedValue(null);
      expect(await service.getCredentialValue("nope", "user-1")).toBeNull();
    });

    it("returns null when expired", async () => {
      const enc = await buildEncryption().encryptEnvelope("sk-expired");
      prisma.userCredential.findFirst.mockResolvedValue({
        id: "c1",
        ...enc,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await service.getCredentialValue("tavily", "user-1")).toBeNull();
    });
  });

  describe("remove / update owner isolation", () => {
    it("remove throws NotFound when row not owned", async () => {
      prisma.userCredential.findFirst.mockResolvedValue(null);
      await expect(service.remove("user-1", "c1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("update throws NotFound when row not owned", async () => {
      prisma.userCredential.findFirst.mockResolvedValue(null);
      await expect(
        service.update("user-1", "c1", { displayName: "x" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
