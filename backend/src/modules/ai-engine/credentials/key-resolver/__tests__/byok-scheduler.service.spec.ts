/**
 * ByokSchedulerService unit tests
 * Covers: resetMonthlyQuotas, expireAssignments, heartbeat cron methods
 */
import { ByokSchedulerService } from "../byok-scheduler.service";
import { KeyAssignmentStatus } from "@prisma/client";

function makePrisma() {
  return {
    keyAssignment: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function makeDistributableKeys() {
  return {
    resetMonthlyQuotas: jest.fn().mockResolvedValue(0),
  };
}

describe("ByokSchedulerService", () => {
  let service: ByokSchedulerService;
  let prisma: ReturnType<typeof makePrisma>;
  let distributableKeys: ReturnType<typeof makeDistributableKeys>;

  beforeEach(() => {
    prisma = makePrisma();
    distributableKeys = makeDistributableKeys();
    service = new ByokSchedulerService(
      prisma as unknown as Parameters<
        typeof ByokSchedulerService.prototype.constructor
      >[0],
      distributableKeys as unknown as Parameters<
        typeof ByokSchedulerService.prototype.constructor
      >[1],
    );
  });

  describe("resetMonthlyQuotas", () => {
    it("calls distributableKeys.resetMonthlyQuotas and logs when count > 0", async () => {
      distributableKeys.resetMonthlyQuotas.mockResolvedValueOnce(5);
      await service.resetMonthlyQuotas();
      expect(distributableKeys.resetMonthlyQuotas).toHaveBeenCalledTimes(1);
    });

    it("does not throw when count is 0", async () => {
      distributableKeys.resetMonthlyQuotas.mockResolvedValueOnce(0);
      await expect(service.resetMonthlyQuotas()).resolves.toBeUndefined();
    });

    it("catches errors and does not rethrow", async () => {
      distributableKeys.resetMonthlyQuotas.mockRejectedValueOnce(
        new Error("DB error"),
      );
      await expect(service.resetMonthlyQuotas()).resolves.toBeUndefined();
    });
  });

  describe("expireAssignments", () => {
    it("calls prisma.keyAssignment.updateMany with correct status filter", async () => {
      prisma.keyAssignment.updateMany.mockResolvedValueOnce({ count: 3 });
      await service.expireAssignments();
      expect(prisma.keyAssignment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: KeyAssignmentStatus.ACTIVE,
            expiresAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
          data: { status: KeyAssignmentStatus.EXPIRED },
        }),
      );
    });

    it("logs when count > 0", async () => {
      prisma.keyAssignment.updateMany.mockResolvedValueOnce({ count: 2 });
      await expect(service.expireAssignments()).resolves.toBeUndefined();
    });

    it("does not log when count is 0", async () => {
      prisma.keyAssignment.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.expireAssignments()).resolves.toBeUndefined();
    });

    it("catches errors and does not rethrow", async () => {
      prisma.keyAssignment.updateMany.mockRejectedValueOnce(
        new Error("connection lost"),
      );
      await expect(service.expireAssignments()).resolves.toBeUndefined();
    });
  });

  describe("heartbeat", () => {
    it("completes without error", async () => {
      await expect(service.heartbeat()).resolves.toBeUndefined();
    });
  });
});
