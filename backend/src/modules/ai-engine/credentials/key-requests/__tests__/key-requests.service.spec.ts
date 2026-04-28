import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { KeyRequestsService } from "../key-requests.service";
import { KeyAssignmentsService } from "../../key-assignments/key-assignments.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { KeyRequestStatus } from "@prisma/client";

describe("KeyRequestsService", () => {
  let service: KeyRequestsService;
  let prisma: any;
  let assignments: jest.Mocked<Partial<KeyAssignmentsService>>;

  const makeRequest = (overrides: Record<string, unknown> = {}) => ({
    id: "r-1",
    userId: "u-1",
    provider: "openai",
    reason: "I need it",
    estimatedUsage: "MEDIUM",
    note: null,
    status: KeyRequestStatus.PENDING,
    handledBy: null,
    handledAt: null,
    rejectionReason: null,
    resultingAssignmentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      keyRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(makeRequest()),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(makeRequest()),
        update: jest.fn().mockResolvedValue(makeRequest()),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn().mockImplementation(async (fn) => fn(prisma)),
    };
    assignments = {
      assign: jest.fn().mockResolvedValue({ id: "a-1" }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: KeyAssignmentsService, useValue: assignments },
      ],
    }).compile();
    service = module.get(KeyRequestsService);
  });

  describe("create", () => {
    it("rejects empty provider", async () => {
      await expect(service.create("u", { provider: "  " })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects invalid estimatedUsage", async () => {
      await expect(
        service.create("u", {
          provider: "openai",
          estimatedUsage: "WRONG" as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects duplicate PENDING request for same provider", async () => {
      prisma.keyRequest.findFirst.mockResolvedValueOnce(makeRequest());
      await expect(
        service.create("u-1", { provider: "openai" }),
      ).rejects.toThrow(ConflictException);
    });

    it("normalizes provider and persists", async () => {
      await service.create("u-1", {
        provider: "OpenAI",
        reason: "  r  ",
        estimatedUsage: "LIGHT",
      });
      expect(prisma.keyRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "u-1",
          provider: "openai",
          reason: "r",
          estimatedUsage: "LIGHT",
        }),
      });
    });
  });

  describe("approve", () => {
    it("throws when request is not PENDING", async () => {
      prisma.keyRequest.findUnique.mockResolvedValueOnce(
        makeRequest({ status: KeyRequestStatus.APPROVED }),
      );
      await expect(
        service.approve("r-1", { keyId: "k", approvedBy: "admin" }),
      ).rejects.toThrow(ConflictException);
    });

    it("creates assignment and marks request APPROVED in a transaction", async () => {
      await service.approve("r-1", {
        keyId: "k-1",
        userQuotaCents: 500,
        approvedBy: "admin@ex",
      });
      expect(assignments.assign).toHaveBeenCalledWith(
        expect.objectContaining({
          keyId: "k-1",
          userQuotaCents: 500,
          assignedBy: "admin@ex",
        }),
      );
      const update = prisma.keyRequest.update.mock.calls[0][0];
      expect(update.data.status).toBe(KeyRequestStatus.APPROVED);
      expect(update.data.resultingAssignmentId).toBe("a-1");
    });
  });

  describe("reject", () => {
    it("requires non-empty reason", async () => {
      await expect(service.reject("r-1", "admin", "")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws when request already handled", async () => {
      prisma.keyRequest.findUnique.mockResolvedValueOnce(
        makeRequest({ status: KeyRequestStatus.APPROVED }),
      );
      await expect(service.reject("r-1", "admin", "no")).rejects.toThrow(
        ConflictException,
      );
    });

    it("sets REJECTED with reason and auditor", async () => {
      await service.reject("r-1", "admin@ex", "duplicate");
      const call = prisma.keyRequest.update.mock.calls[0][0];
      expect(call.data.status).toBe(KeyRequestStatus.REJECTED);
      expect(call.data.rejectionReason).toBe("duplicate");
      expect(call.data.handledBy).toBe("admin@ex");
    });
  });

  describe("cancel", () => {
    it("throws NotFound when request belongs to a different user", async () => {
      prisma.keyRequest.findUnique.mockResolvedValueOnce(
        makeRequest({ userId: "other" }),
      );
      await expect(service.cancel("r-1", "u-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
