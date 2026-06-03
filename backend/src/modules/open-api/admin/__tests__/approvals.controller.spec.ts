import { Test, TestingModule } from "@nestjs/testing";
import { ServiceUnavailableException } from "@nestjs/common";
import { ApprovalsController } from "../approvals/approvals.controller";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";

jest.mock("../../../../common/prisma/prisma.service");

describe("ApprovalsController", () => {
  let controller: ApprovalsController;
  let _prisma: jest.Mocked<PrismaService>;

  const mockPrisma = {
    $queryRaw: jest.fn(),
    longTermMemory: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApprovalsController],
      providers: [{ provide: PrismaService, useValue: mockPrisma }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ApprovalsController);
    _prisma = module.get(PrismaService);

    // Simulate onModuleInit with table ready
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);
    await controller.onModuleInit();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to table-ready state by default
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);
  });

  describe("onModuleInit", () => {
    it("should set memoryTableReady=true when table exists", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);
      await controller.onModuleInit();
      // Controller should now serve requests normally
      mockPrisma.longTermMemory.findMany.mockResolvedValue([]);
      const result = await controller.listPending();
      expect(result).toEqual([]);
    });

    it("should set memoryTableReady=false when table does not exist", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ exists: false }]);
      await controller.onModuleInit();
      const result = await controller.listPending();
      expect(result).toEqual([]);
      // Verify findMany was NOT called when table not ready
      expect(mockPrisma.longTermMemory.findMany).not.toHaveBeenCalled();
    });

    it("should handle $queryRaw throwing and set memoryTableReady=false", async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error("DB error"));
      await controller.onModuleInit();
      const result = await controller.listPending();
      expect(result).toEqual([]);
    });
  });

  describe("listPending", () => {
    beforeEach(async () => {
      // Ensure table is ready for these tests
      mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);
      await controller.onModuleInit();
    });

    it("should return empty array when memoryTableReady is false", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ exists: false }]);
      await controller.onModuleInit();
      const result = await controller.listPending();
      expect(result).toEqual([]);
    });

    it("should query longTermMemory with correct filter when table is ready", async () => {
      mockPrisma.longTermMemory.findMany.mockResolvedValue([]);
      await controller.listPending();
      expect(mockPrisma.longTermMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "system",
            key: expect.objectContaining({ startsWith: "approval:request:" }),
          }),
        }),
      );
    });

    it("should return only pending approvals", async () => {
      const records = [
        {
          value: {
            requestId: "req-1",
            approvalType: "confirm",
            prompt: "Approve?",
            status: "pending",
            createdAt: new Date().toISOString(),
          },
        },
        {
          value: {
            requestId: "req-2",
            approvalType: "confirm",
            prompt: "Already responded",
            status: "responded",
            createdAt: new Date().toISOString(),
          },
        },
      ];
      mockPrisma.longTermMemory.findMany.mockResolvedValue(records);

      const result = await controller.listPending();

      expect(result).toHaveLength(1);
      expect(result[0].requestId).toBe("req-1");
      expect(result[0].status).toBe("pending");
    });

    it("should return empty array when all records have non-pending status", async () => {
      const records = [
        {
          value: {
            requestId: "req-1",
            status: "responded",
            prompt: "p",
            approvalType: "confirm",
            createdAt: "",
          },
        },
      ];
      mockPrisma.longTermMemory.findMany.mockResolvedValue(records);

      const result = await controller.listPending();
      expect(result).toEqual([]);
    });

    it("should order results by createdAt ascending", async () => {
      mockPrisma.longTermMemory.findMany.mockResolvedValue([]);
      await controller.listPending();
      expect(mockPrisma.longTermMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "asc" },
        }),
      );
    });
  });

  describe("respond", () => {
    beforeEach(async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);
      await controller.onModuleInit();
    });

    it("should throw ServiceUnavailableException when memoryTableReady is false", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ exists: false }]);
      await controller.onModuleInit();

      await expect(
        controller.respond("req-1", { approved: true }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it("should upsert response into longTermMemory and return success", async () => {
      mockPrisma.longTermMemory.upsert.mockResolvedValue({} as never);

      const result = await controller.respond("req-123", {
        approved: true,
        choice: "yes",
        feedback: "looks good",
      });

      expect(mockPrisma.longTermMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_key: { userId: "system", key: "approval:response:req-123" },
          },
          create: expect.objectContaining({
            userId: "system",
            key: "approval:response:req-123",
            type: "human_approval_response",
          }),
        }),
      );
      expect(result).toEqual({
        success: true,
        requestId: "req-123",
        approved: true,
      });
    });

    it("should return approved=false when approved is false", async () => {
      mockPrisma.longTermMemory.upsert.mockResolvedValue({} as never);

      const result = await controller.respond("req-456", { approved: false });

      expect(result.approved).toBe(false);
      expect(result.success).toBe(true);
      expect(result.requestId).toBe("req-456");
    });

    it("should set null for missing optional fields", async () => {
      mockPrisma.longTermMemory.upsert.mockResolvedValue({} as never);

      await controller.respond("req-789", { approved: true });

      const upsertCall = mockPrisma.longTermMemory.upsert.mock.calls[0][0];
      expect(upsertCall.create.value.choice).toBeNull();
      expect(upsertCall.create.value.input).toBeNull();
      expect(upsertCall.create.value.feedback).toBeNull();
    });

    it("should set a 10-minute TTL via expiresAt", async () => {
      mockPrisma.longTermMemory.upsert.mockResolvedValue({} as never);
      const before = Date.now();

      await controller.respond("req-ttl", { approved: true });

      const upsertCall = mockPrisma.longTermMemory.upsert.mock.calls[0][0];
      const expiresAt: Date = upsertCall.create.expiresAt;
      const diff = expiresAt.getTime() - before;
      expect(diff).toBeGreaterThanOrEqual(9 * 60 * 1000);
      expect(diff).toBeLessThanOrEqual(11 * 60 * 1000);
    });
  });
});
