/**
 * HarnessRolloutService 单元测试（目标架构 v2 · harness 是唯一路径）
 *
 * 原 shouldUseHarness / env-flag / rollout-pct 分流能力已删除，仅保留：
 *  - recordRun + 滚动窗口 + auto-rollback 告警
 *  - DB 持久化
 *  - getHealthSnapshot / getHistorySnapshot
 *  - resetAutoRollback / resetMetrics
 */

import { HarnessRolloutService } from "../harness-rollout.service";

describe("HarnessRolloutService", () => {
  let svc: HarnessRolloutService;

  beforeEach(() => {
    svc = new HarnessRolloutService();
  });

  describe("recordRun + auto-rollback", () => {
    function mk(success: boolean, quality?: number) {
      return {
        missionId: "m",
        userId: "u",
        success,
        durationMs: 1000,
        qualityScore: quality,
        tokensUsed: 100,
        costUsd: 0.01,
        recordedAt: new Date(),
      };
    }

    it("< MIN_SAMPLES 不触发 rollback", () => {
      for (let i = 0; i < 5; i++) svc.recordRun(mk(false));
      expect(svc.getHealthSnapshot().autoRolledBack).toBe(false);
    });

    it("failure rate ≥ 30% over 10+ samples → auto-rollback 告警", () => {
      for (let i = 0; i < 4; i++) svc.recordRun(mk(false));
      for (let i = 0; i < 6; i++) svc.recordRun(mk(true));
      expect(svc.getHealthSnapshot().autoRolledBack).toBe(true);
    });

    it("低 quality score 也触发 rollback", () => {
      for (let i = 0; i < 10; i++) svc.recordRun(mk(true, 40));
      expect(svc.getHealthSnapshot().autoRolledBack).toBe(true);
    });

    it("resetAutoRollback 恢复", () => {
      for (let i = 0; i < 4; i++) svc.recordRun(mk(false));
      for (let i = 0; i < 6; i++) svc.recordRun(mk(true));
      expect(svc.getHealthSnapshot().autoRolledBack).toBe(true);
      svc.resetAutoRollback();
      expect(svc.getHealthSnapshot().autoRolledBack).toBe(false);
    });

    it("window 滚动：最多保留 WINDOW_SIZE=50 条", () => {
      for (let i = 0; i < 60; i++) svc.recordRun(mk(true, 80));
      const snap = svc.getHealthSnapshot();
      expect(snap.totalRuns).toBe(50);
    });
  });

  describe("DB persistence (Optional PrismaService)", () => {
    it("recordRun 调用 prisma.harnessRunMetric.create (fire-and-forget)", async () => {
      const create = jest.fn().mockResolvedValue({});
      const prisma = { harnessRunMetric: { create } } as any;
      const svcDb = new HarnessRolloutService(prisma);

      svcDb.recordRun({
        missionId: "m-1",
        userId: "u-1",
        success: true,
        durationMs: 2000,
        qualityScore: 80,
        tokensUsed: 500,
        costUsd: 0.1234,
        recordedAt: new Date("2026-04-23T00:00:00Z"),
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(create).toHaveBeenCalledTimes(1);
      const payload = create.mock.calls[0][0].data;
      expect(payload.missionId).toBe("m-1");
      expect(payload.userId).toBe("u-1");
      expect(payload.success).toBe(true);
      expect(payload.qualityScore).toBe(80);
      expect(payload.costUsd.toString()).toBe("0.1234");
    });

    it("DB 写失败时不影响主流程", async () => {
      const create = jest.fn().mockRejectedValue(new Error("boom"));
      const prisma = { harnessRunMetric: { create } } as any;
      const svcDb = new HarnessRolloutService(prisma);

      expect(() =>
        svcDb.recordRun({
          missionId: "m",
          userId: "u",
          success: true,
          durationMs: 1000,
          tokensUsed: 100,
          costUsd: 0,
          recordedAt: new Date(),
        }),
      ).not.toThrow();

      await Promise.resolve();
      await Promise.resolve();
      expect(svcDb.getHealthSnapshot().totalRuns).toBe(1);
    });

    it("getHistorySnapshot 从 DB 聚合", async () => {
      const rows = [
        {
          success: true,
          durationMs: 1000,
          qualityScore: 80,
          tokensUsed: 500,
          costUsd: { toString: () => "0.5" },
        },
        {
          success: false,
          durationMs: 2000,
          qualityScore: 60,
          tokensUsed: 1000,
          costUsd: { toString: () => "1.0" },
        },
      ];
      const findMany = jest.fn().mockResolvedValue(rows);
      const prisma = { harnessRunMetric: { findMany } } as any;
      const svcDb = new HarnessRolloutService(prisma);

      const snap = await svcDb.getHistorySnapshot(24);
      expect(findMany).toHaveBeenCalledTimes(1);
      expect(snap.totalRuns).toBe(2);
      expect(snap.successRate).toBe(0.5);
      expect(snap.avgQualityScore).toBe(70);
      expect(snap.avgDurationMs).toBe(1500);
      expect(snap.totalCostUsd).toBeCloseTo(1.5, 4);
    });

    it("getHistorySnapshot DB 0 行 → 回落到内存窗口", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = { harnessRunMetric: { findMany } } as any;
      const svcDb = new HarnessRolloutService(prisma);
      const snap = await svcDb.getHistorySnapshot(24);
      expect(snap.totalRuns).toBe(0);
    });

    it("getHistorySnapshot DB 失败 → 回落到内存窗口", async () => {
      const findMany = jest.fn().mockRejectedValue(new Error("db down"));
      const prisma = { harnessRunMetric: { findMany } } as any;
      const svcDb = new HarnessRolloutService(prisma);
      const snap = await svcDb.getHistorySnapshot(24);
      expect(snap.totalRuns).toBe(0);
    });

    it("没有 prisma 时 getHistorySnapshot 直接返回内存 snapshot", async () => {
      const snap = await svc.getHistorySnapshot(24);
      expect(snap.totalRuns).toBe(0);
    });

    it("持久化前 sanitize NaN/Infinity/负数数值字段", async () => {
      const create = jest.fn().mockResolvedValue({});
      const prisma = { harnessRunMetric: { create } } as any;
      const svcDb = new HarnessRolloutService(prisma);

      svcDb.recordRun({
        missionId: "m",
        userId: "u",
        success: true,
        durationMs: Number.NaN,
        qualityScore: Infinity,
        tokensUsed: -50,
        costUsd: Number.NaN,
        recordedAt: new Date(),
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(create).toHaveBeenCalledTimes(1);
      const d = create.mock.calls[0][0].data;
      expect(d.durationMs).toBe(0);
      expect(d.qualityScore).toBeNull();
      expect(d.tokensUsed).toBe(0);
      expect(d.costUsd.toString()).toBe("0");
    });
  });

  describe("getHealthSnapshot", () => {
    it("空窗口返回默认值 (rolloutPct=100 rolloutActive=true)", () => {
      const snap = svc.getHealthSnapshot();
      expect(snap.totalRuns).toBe(0);
      expect(snap.successRate).toBe(1);
      expect(snap.rolloutPct).toBe(100);
      expect(snap.rolloutActive).toBe(true);
    });

    it("数据聚合正确", () => {
      svc.recordRun({
        missionId: "m1",
        userId: "u1",
        success: true,
        durationMs: 5000,
        qualityScore: 80,
        tokensUsed: 1000,
        costUsd: 0.5,
        recordedAt: new Date(),
      });
      svc.recordRun({
        missionId: "m2",
        userId: "u2",
        success: true,
        durationMs: 7000,
        qualityScore: 70,
        tokensUsed: 1500,
        costUsd: 0.8,
        recordedAt: new Date(),
      });
      const snap = svc.getHealthSnapshot();
      expect(snap.totalRuns).toBe(2);
      expect(snap.successRate).toBe(1);
      expect(snap.avgQualityScore).toBe(75);
      expect(snap.avgDurationMs).toBe(6000);
      expect(snap.totalCostUsd).toBeCloseTo(1.3, 4);
    });
  });
});
