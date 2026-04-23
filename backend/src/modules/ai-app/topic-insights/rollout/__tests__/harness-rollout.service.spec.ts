/**
 * HarnessRolloutService 单元测试
 */

import { HarnessRolloutService } from "../harness-rollout.service";

describe("HarnessRolloutService", () => {
  let origFlag: string | undefined;
  let origPct: string | undefined;
  let svc: HarnessRolloutService;

  beforeEach(() => {
    origFlag = process.env.TOPIC_INSIGHTS_USE_HARNESS;
    origPct = process.env.TOPIC_INSIGHTS_HARNESS_ROLLOUT_PCT;
    svc = new HarnessRolloutService();
  });

  afterEach(() => {
    if (origFlag === undefined) delete process.env.TOPIC_INSIGHTS_USE_HARNESS;
    else process.env.TOPIC_INSIGHTS_USE_HARNESS = origFlag;
    if (origPct === undefined)
      delete process.env.TOPIC_INSIGHTS_HARNESS_ROLLOUT_PCT;
    else process.env.TOPIC_INSIGHTS_HARNESS_ROLLOUT_PCT = origPct;
  });

  describe("shouldUseHarness", () => {
    it("env flag 关闭 → false", () => {
      process.env.TOPIC_INSIGHTS_USE_HARNESS = "0";
      expect(svc.shouldUseHarness("u1")).toBe(false);
    });

    it("env flag 开 + pct=100 → 所有用户 true", () => {
      process.env.TOPIC_INSIGHTS_USE_HARNESS = "1";
      process.env.TOPIC_INSIGHTS_HARNESS_ROLLOUT_PCT = "100";
      expect(svc.shouldUseHarness("u1")).toBe(true);
      expect(svc.shouldUseHarness("u2")).toBe(true);
    });

    it("env flag 开 + pct=0 → 所有用户 false", () => {
      process.env.TOPIC_INSIGHTS_USE_HARNESS = "1";
      process.env.TOPIC_INSIGHTS_HARNESS_ROLLOUT_PCT = "0";
      expect(svc.shouldUseHarness("u1")).toBe(false);
    });

    it("默认 pct=100 当未设置", () => {
      process.env.TOPIC_INSIGHTS_USE_HARNESS = "1";
      delete process.env.TOPIC_INSIGHTS_HARNESS_ROLLOUT_PCT;
      expect(svc.shouldUseHarness("u1")).toBe(true);
    });

    it("pct=50 时结果是 deterministic（相同 userId 永远相同）", () => {
      process.env.TOPIC_INSIGHTS_USE_HARNESS = "1";
      process.env.TOPIC_INSIGHTS_HARNESS_ROLLOUT_PCT = "50";
      const a = svc.shouldUseHarness("stable-user-123");
      const b = svc.shouldUseHarness("stable-user-123");
      expect(a).toBe(b);
    });

    it("pct=50 时 100 个用户约 40-60% 命中", () => {
      process.env.TOPIC_INSIGHTS_USE_HARNESS = "1";
      process.env.TOPIC_INSIGHTS_HARNESS_ROLLOUT_PCT = "50";
      let hits = 0;
      for (let i = 0; i < 200; i++) {
        if (svc.shouldUseHarness(`user-${i}`)) hits += 1;
      }
      const rate = hits / 200;
      expect(rate).toBeGreaterThan(0.35);
      expect(rate).toBeLessThan(0.65);
    });
  });

  describe("recordRun + auto-rollback", () => {
    beforeEach(() => {
      process.env.TOPIC_INSIGHTS_USE_HARNESS = "1";
      process.env.TOPIC_INSIGHTS_HARNESS_ROLLOUT_PCT = "100";
    });

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
      expect(svc.shouldUseHarness("u1")).toBe(true);
      expect(svc.getHealthSnapshot().autoRolledBack).toBe(false);
    });

    it("failure rate ≥ 30% over 10+ samples → auto-rollback", () => {
      for (let i = 0; i < 4; i++) svc.recordRun(mk(false));
      for (let i = 0; i < 6; i++) svc.recordRun(mk(true));
      // 4/10 = 40% fail → rollback
      expect(svc.getHealthSnapshot().autoRolledBack).toBe(true);
      expect(svc.shouldUseHarness("any")).toBe(false);
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
      expect(svc.shouldUseHarness("any")).toBe(true);
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

      // fire-and-forget: 等 microtask
      await Promise.resolve();
      await Promise.resolve();
      expect(create).toHaveBeenCalledTimes(1);
      const payload = create.mock.calls[0][0].data;
      expect(payload.missionId).toBe("m-1");
      expect(payload.userId).toBe("u-1");
      expect(payload.success).toBe(true);
      expect(payload.qualityScore).toBe(80);
      // Decimal 对象 — toFixed(4) 保留 4 位
      expect(payload.costUsd.toString()).toBe("0.1234");
    });

    it("DB 写失败时不影响主流程（swallow + warn）", async () => {
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
      // 内存窗口仍然更新
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
      expect(d.qualityScore).toBeNull(); // Infinity → 越界 → null
      expect(d.tokensUsed).toBe(0);
      expect(d.costUsd.toString()).toBe("0");
    });
  });

  describe("getHealthSnapshot", () => {
    beforeEach(() => {
      process.env.TOPIC_INSIGHTS_USE_HARNESS = "1";
      process.env.TOPIC_INSIGHTS_HARNESS_ROLLOUT_PCT = "80";
    });

    it("空窗口返回默认值", () => {
      const snap = svc.getHealthSnapshot();
      expect(snap.totalRuns).toBe(0);
      expect(snap.successRate).toBe(1);
      expect(snap.rolloutPct).toBe(80);
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
