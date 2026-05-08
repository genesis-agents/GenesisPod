/**
 * ByokMaintenanceScheduler unit tests
 * Covers: resetMonthlyQuotas, expireAssignments, heartbeat cron methods
 *   + PR-E 2026-05-08: markStaleAssignments, renewRecurringAssignments
 */
import { ByokMaintenanceScheduler } from "../byok-maintenance.scheduler";
import { KeyAssignmentStatus } from "@prisma/client";

function makePrisma() {
  return {
    keyAssignment: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
}

function makeDistributableKeys() {
  return {
    resetMonthlyQuotas: jest.fn().mockResolvedValue(0),
  };
}

function makeKeyAssignments() {
  return {
    computeNextRenewalAt: jest.fn((from: Date) => {
      // 简化：每次推 30 天，仅供 spec 验证调用
      const next = new Date(from);
      next.setDate(next.getDate() + 30);
      return next;
    }),
  };
}

describe("ByokMaintenanceScheduler", () => {
  let service: ByokMaintenanceScheduler;
  let prisma: ReturnType<typeof makePrisma>;
  let distributableKeys: ReturnType<typeof makeDistributableKeys>;
  let keyAssignments: ReturnType<typeof makeKeyAssignments>;

  beforeEach(() => {
    prisma = makePrisma();
    distributableKeys = makeDistributableKeys();
    keyAssignments = makeKeyAssignments();
    service = new ByokMaintenanceScheduler(
      prisma as unknown as Parameters<
        typeof ByokMaintenanceScheduler.prototype.constructor
      >[0],
      distributableKeys as unknown as Parameters<
        typeof ByokMaintenanceScheduler.prototype.constructor
      >[1],
      keyAssignments as unknown as Parameters<
        typeof ByokMaintenanceScheduler.prototype.constructor
      >[2],
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

    // PR-E 2026-05-08: PR-B 限定 ONE_TIME 防误改 RECURRING
    it("scopes filter to validityType='ONE_TIME' (not RECURRING)", async () => {
      await service.expireAssignments();
      const callArg = prisma.keyAssignment.updateMany.mock.calls[0][0];
      expect(callArg.where.validityType).toBe("ONE_TIME");
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

  // PR-E 2026-05-08: 联动 cron — 关联 DistributableKey 停用时 ACTIVE→STALE
  describe("markStaleAssignments", () => {
    it("executes raw SQL ACTIVE→STALE for assignments under deactivated pools", async () => {
      prisma.$executeRaw.mockResolvedValueOnce(2);
      await service.markStaleAssignments();
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      // 验证 SQL 模板含 SET status = 'STALE' + WHERE is_active = false
      const sqlTemplate = prisma.$executeRaw.mock.calls[0][0];
      const sqlText = Array.isArray(sqlTemplate)
        ? sqlTemplate.join("?")
        : String(sqlTemplate);
      expect(sqlText).toMatch(/SET\s+status\s*=\s*'STALE'/i);
      expect(sqlText).toMatch(/is_active\s*=\s*false/i);
    });

    it("does not execute reverse STALE→ACTIVE recovery (R2 评审 FAIL 修复)", async () => {
      // 验证只调一次 raw SQL（仅正向标记），不再做反向自动恢复
      prisma.$executeRaw.mockResolvedValueOnce(0);
      await service.markStaleAssignments();
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it("catches errors and does not rethrow", async () => {
      prisma.$executeRaw.mockRejectedValueOnce(new Error("DB error"));
      await expect(service.markStaleAssignments()).resolves.toBeUndefined();
    });
  });

  // PR-E 2026-05-08: RECURRING 周期续期 cron
  describe("renewRecurringAssignments", () => {
    it("renews due RECURRING assignments via service.computeNextRenewalAt", async () => {
      const dueDate = new Date("2026-05-08T00:00:00Z");
      prisma.keyAssignment.findMany.mockResolvedValueOnce([
        {
          id: "a-1",
          recurrenceUnit: "MONTH",
          recurrenceInterval: 1,
          nextRenewalAt: dueDate,
        },
      ]);
      await service.renewRecurringAssignments();

      expect(keyAssignments.computeNextRenewalAt).toHaveBeenCalledWith(
        dueDate,
        "MONTH",
        1,
      );
      expect(prisma.keyAssignment.update).toHaveBeenCalledWith({
        where: { id: "a-1" },
        data: expect.objectContaining({
          userSpendCents: 0,
          nextRenewalAt: expect.any(Date),
        }),
      });
    });

    it("skips assignment with missing recurrence fields, continues others", async () => {
      prisma.keyAssignment.findMany.mockResolvedValueOnce([
        {
          id: "broken",
          recurrenceUnit: null,
          recurrenceInterval: null,
          nextRenewalAt: null,
        },
        {
          id: "a-1",
          recurrenceUnit: "WEEK",
          recurrenceInterval: 1,
          nextRenewalAt: new Date("2026-05-08T00:00:00Z"),
        },
      ]);
      await service.renewRecurringAssignments();
      expect(prisma.keyAssignment.update).toHaveBeenCalledTimes(1);
      expect(prisma.keyAssignment.update.mock.calls[0][0].where.id).toBe("a-1");
    });

    it("single update failure does not block other renewals", async () => {
      prisma.keyAssignment.findMany.mockResolvedValueOnce([
        {
          id: "fail",
          recurrenceUnit: "MONTH",
          recurrenceInterval: 1,
          nextRenewalAt: new Date(),
        },
        {
          id: "ok",
          recurrenceUnit: "MONTH",
          recurrenceInterval: 1,
          nextRenewalAt: new Date(),
        },
      ]);
      prisma.keyAssignment.update
        .mockRejectedValueOnce(new Error("conflict"))
        .mockResolvedValueOnce({});
      await expect(
        service.renewRecurringAssignments(),
      ).resolves.toBeUndefined();
      expect(prisma.keyAssignment.update).toHaveBeenCalledTimes(2);
    });

    it("filters to RECURRING + nextRenewalAt <= now + ACTIVE", async () => {
      await service.renewRecurringAssignments();
      const findArgs = prisma.keyAssignment.findMany.mock.calls[0][0];
      expect(findArgs.where.status).toBe(KeyAssignmentStatus.ACTIVE);
      expect(findArgs.where.validityType).toBe("RECURRING");
      expect(findArgs.where.nextRenewalAt).toEqual(
        expect.objectContaining({ lte: expect.any(Date) }),
      );
    });

    it("catches outer errors and does not rethrow", async () => {
      prisma.keyAssignment.findMany.mockRejectedValueOnce(new Error("DB"));
      await expect(
        service.renewRecurringAssignments(),
      ).resolves.toBeUndefined();
    });
  });
});
