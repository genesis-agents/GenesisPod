import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { KeyResolverService } from "../key-resolver.service";
import { KeyAssignmentsService } from "../../key-assignments/key-assignments.service";
import { UserApiKeysService } from "../../user-api-keys/user-api-keys.service";
import { SecretsService } from "../../../../ai-infra/secrets/secrets.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  NoAvailableKeyError,
  NoSystemKeyError,
  QuotaExceededError,
} from "../key-resolver.errors";

describe("KeyResolverService", () => {
  let service: KeyResolverService;
  let prisma: any;
  let userApiKeys: jest.Mocked<Partial<UserApiKeysService>>;
  let assignments: jest.Mocked<Partial<KeyAssignmentsService>>;
  let secrets: jest.Mocked<Partial<SecretsService>>;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ role: UserRole.USER }),
      },
    };
    userApiKeys = {
      getPersonalKey: jest.fn().mockResolvedValue(null),
      getAvailableProviders: jest.fn().mockResolvedValue([]),
    };
    assignments = {
      resolveActive: jest.fn().mockResolvedValue(null),
      getAvailableProviders: jest.fn().mockResolvedValue([]),
      incrementSpend: jest.fn().mockResolvedValue(undefined),
    };
    secrets = {
      getValueInternal: jest.fn().mockResolvedValue(null),
      listAvailableProviders: jest.fn().mockResolvedValue([]),
      findByProviderAlias: jest.fn().mockResolvedValue(null),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: UserApiKeysService, useValue: userApiKeys },
        { provide: KeyAssignmentsService, useValue: assignments },
        { provide: SecretsService, useValue: secrets },
      ],
    }).compile();
    service = module.get(KeyResolverService);
  });

  describe("resolveKey", () => {
    it("rejects missing userId", async () => {
      await expect(service.resolveKey("", "openai")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects unknown user", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.resolveKey("ghost", "openai")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    describe("ADMIN", () => {
      beforeEach(() => {
        prisma.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN });
      });

      it("returns SYSTEM when secret is configured (ADMIN no BYOK)", async () => {
        (userApiKeys.getPersonalKey as jest.Mock).mockResolvedValue(null);
        (assignments.resolveActive as jest.Mock).mockResolvedValue(null);
        (secrets.getValueInternal as jest.Mock)
          .mockResolvedValueOnce("sys-openai-secret")
          .mockResolvedValueOnce("https://endpoint");
        const r = await service.resolveKey("admin", "openai");
        expect(r).toEqual(
          expect.objectContaining({
            source: "SYSTEM",
            apiKey: "sys-openai-secret",
            apiEndpoint: "https://endpoint",
            provider: "openai",
          }),
        );
      });

      it("throws NoSystemKeyError when ADMIN has no BYOK and no SYSTEM", async () => {
        (userApiKeys.getPersonalKey as jest.Mock).mockResolvedValue(null);
        (assignments.resolveActive as jest.Mock).mockResolvedValue(null);
        (secrets.getValueInternal as jest.Mock).mockResolvedValue(null);
        await expect(service.resolveKey("admin", "openai")).rejects.toThrow(
          NoSystemKeyError,
        );
      });

      it("returns PERSONAL when ADMIN has BYOK Personal Key", async () => {
        // 2026-04-30 admin priority: PERSONAL -> ASSIGNED -> SYSTEM
        (userApiKeys.getPersonalKey as jest.Mock).mockResolvedValue({
          apiKey: "admin-byok-key",
          apiEndpoint: null,
          preferredModelId: null,
        });
        const r = await service.resolveKey("admin", "openai");
        expect(r.source).toBe("PERSONAL");
        expect(r.apiKey).toBe("admin-byok-key");
        expect(secrets.getValueInternal).not.toHaveBeenCalled();
      });

      it("falls back to SYSTEM only when ADMIN has no Personal/Assigned", async () => {
        (userApiKeys.getPersonalKey as jest.Mock).mockResolvedValue(null);
        (assignments.resolveActive as jest.Mock).mockResolvedValue(null);
        (secrets.getValueInternal as jest.Mock).mockResolvedValue("sys");
        const r = await service.resolveKey("admin", "openai");
        expect(userApiKeys.getPersonalKey).toHaveBeenCalled();
        expect(assignments.resolveActive).toHaveBeenCalled();
        expect(r.source).toBe("SYSTEM");
      });

      it("honors explicit systemSecretName before conventional name", async () => {
        (userApiKeys.getPersonalKey as jest.Mock).mockResolvedValue(null);
        (assignments.resolveActive as jest.Mock).mockResolvedValue(null);
        (secrets.getValueInternal as jest.Mock).mockImplementation(
          (name: string) =>
            name === "claude-api-key"
              ? "sys-claude-actual"
              : name === "anthropic-api-endpoint"
                ? null
                : null,
        );
        const r = await service.resolveKey("admin", "anthropic", {
          systemSecretName: "claude-api-key",
        });
        expect(r.source).toBe("SYSTEM");
        expect(r.apiKey).toBe("sys-claude-actual");
        expect(r.keyId).toBe("claude-api-key");
      });

      it("falls back to provider-alias lookup when conventional name missing", async () => {
        (userApiKeys.getPersonalKey as jest.Mock).mockResolvedValue(null);
        (assignments.resolveActive as jest.Mock).mockResolvedValue(null);
        (secrets.getValueInternal as jest.Mock).mockImplementation(
          (name: string) => (name === "gemini-api" ? "sys-gemini-value" : null),
        );
        (secrets.findByProviderAlias as jest.Mock).mockResolvedValue({
          id: "secret-1",
          name: "gemini-api",
        });
        const r = await service.resolveKey("admin", "google");
        expect(r.source).toBe("SYSTEM");
        expect(r.apiKey).toBe("sys-gemini-value");
        expect(r.keyId).toBe("gemini-api");
      });
    });

    describe("USER", () => {
      it("returns PERSONAL when user has Personal Key", async () => {
        (userApiKeys.getPersonalKey as jest.Mock).mockResolvedValueOnce({
          apiKey: "sk-personal",
          apiEndpoint: null,
        });
        const r = await service.resolveKey("u", "openai");
        expect(r.source).toBe("PERSONAL");
        expect(r.apiKey).toBe("sk-personal");
        expect(assignments.resolveActive).not.toHaveBeenCalled();
      });

      it("falls through to Assignment when no Personal Key", async () => {
        (assignments.resolveActive as jest.Mock).mockResolvedValueOnce({
          assignmentId: "a-1",
          keyId: "k-1",
          apiKey: "sk-assigned",
          apiEndpoint: null,
          userQuotaCents: 500,
          userSpendCents: 0,
        });
        const r = await service.resolveKey("u", "openai");
        expect(r.source).toBe("ASSIGNED");
        expect(r.assignmentId).toBe("a-1");
      });

      it("propagates QuotaExceededError from assignment resolver", async () => {
        (assignments.resolveActive as jest.Mock).mockRejectedValueOnce(
          new QuotaExceededError("openai", "ASSIGNED"),
        );
        await expect(service.resolveKey("u", "openai")).rejects.toThrow(
          QuotaExceededError,
        );
      });

      it("throws NoAvailableKeyError when neither personal nor assignment exist", async () => {
        await expect(service.resolveKey("u", "openai")).rejects.toThrow(
          NoAvailableKeyError,
        );
      });

      it("normalizes provider casing", async () => {
        (userApiKeys.getPersonalKey as jest.Mock).mockImplementation(
          async (_u, p) => (p === "openai" ? { apiKey: "k" } : null),
        );
        const r = await service.resolveKey("u", "OpenAI");
        expect(r.provider).toBe("openai");
      });
    });
  });

  describe("getAvailableProviders", () => {
    it("returns empty for unknown user", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      expect(await service.getAvailableProviders("ghost")).toEqual([]);
    });

    it("returns system providers for admin", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN });
      (secrets.listAvailableProviders as jest.Mock).mockResolvedValue([
        "openai",
        "anthropic",
      ]);
      expect(await service.getAvailableProviders("admin")).toEqual([
        "openai",
        "anthropic",
      ]);
    });

    it("merges personal and assigned for user (dedup)", async () => {
      (userApiKeys.getAvailableProviders as jest.Mock).mockResolvedValue([
        "openai",
      ]);
      (assignments.getAvailableProviders as jest.Mock).mockResolvedValue([
        "openai",
        "anthropic",
      ]);
      const ps = await service.getAvailableProviders("u");
      expect([...ps].sort()).toEqual(["anthropic", "openai"]);
    });
  });

  describe("recordSpend", () => {
    it("is a no-op for non-ASSIGNED sources", async () => {
      await service.recordSpend(
        {
          source: "PERSONAL",
          apiKey: "k",
          apiEndpoint: null,
          provider: "openai",
          userId: "u",
        },
        100,
      );
      expect(assignments.incrementSpend).not.toHaveBeenCalled();
    });

    it("calls incrementSpend for ASSIGNED source", async () => {
      await service.recordSpend(
        {
          source: "ASSIGNED",
          apiKey: "k",
          apiEndpoint: null,
          provider: "openai",
          userId: "u",
          assignmentId: "a-1",
        },
        150,
      );
      expect(assignments.incrementSpend).toHaveBeenCalledWith("a-1", 150);
    });
  });
});
