/**
 * run-mission.dto 预算上限校验 —— BYOK 放宽（2026-06-10）。
 *
 * maxCredits 硬上限从 100k 提到 500k：BYOK 用户花自己 provider 的钱，不该被平台
 * 100k 档位卡死；500k（≈ cost cap $1000）仍是"防 mission bug 失控烧爆"的 backstop。
 */

import {
  RunMissionInputSchema,
  BUDGET_FIELD_LIMITS,
  DEPTH_BUDGET_TIERS,
  resolveMissionCredits,
  listBudgetTiers,
} from "../run-mission.dto";

const BASE = {
  topic: "量子计算前沿进展",
  depth: "deep" as const,
};

describe("run-mission.dto maxCredits limit (BYOK 放宽)", () => {
  it("accepts maxCredits up to the new 500k ceiling", () => {
    const parsed = RunMissionInputSchema.parse({
      ...BASE,
      maxCredits: 500_000,
    });
    expect(parsed.maxCredits).toBe(500_000);
  });

  it("accepts a value that the old 100k ceiling would have rejected", () => {
    const parsed = RunMissionInputSchema.parse({
      ...BASE,
      maxCredits: 250_000,
    });
    expect(parsed.maxCredits).toBe(250_000);
  });

  it("rejects maxCredits above the 500k ceiling", () => {
    expect(() =>
      RunMissionInputSchema.parse({ ...BASE, maxCredits: 500_001 }),
    ).toThrow();
  });

  it("rejects maxCredits below the 10 floor", () => {
    expect(() =>
      RunMissionInputSchema.parse({ ...BASE, maxCredits: 9 }),
    ).toThrow();
  });

  it("BUDGET_FIELD_LIMITS.maxCredits.max matches the schema ceiling (single source)", () => {
    expect(BUDGET_FIELD_LIMITS.maxCredits.max).toBe(500_000);
    expect(BUDGET_FIELD_LIMITS.maxCredits.min).toBe(10);
  });

  it("per-depth defaults stay conservative (protection preserved, not removed)", () => {
    // ★ 2026-06-21 runaway 止血：deep cap 20000 → 12000（~$24），输入上限仍 500k。
    expect(DEPTH_BUDGET_TIERS.deep.maxCredits).toBe(12_000);
    expect(resolveMissionCredits({ ...BASE } as never)).toBe(12_000);
  });
});

describe("run-mission.dto wall-time tier tightening (2026-06-21 runaway 止血)", () => {
  it("deep wall-time cap is 6h (down from 24h)", () => {
    expect(DEPTH_BUDGET_TIERS.deep.wallTimeCapMs).toBe(6 * 60 * 60 * 1000);
  });

  it("standard wall-time cap is 4h, quick is 90min", () => {
    expect(DEPTH_BUDGET_TIERS.standard.wallTimeCapMs).toBe(4 * 60 * 60 * 1000);
    expect(DEPTH_BUDGET_TIERS.quick.wallTimeCapMs).toBe(90 * 60_000);
  });

  it("DTO wallTimeCapMs override cannot exceed 6h", () => {
    expect(() =>
      RunMissionInputSchema.parse({
        ...BASE,
        wallTimeCapMs: 6 * 60 * 60 * 1000 + 1,
      }),
    ).toThrow();
    const ok = RunMissionInputSchema.parse({
      ...BASE,
      wallTimeCapMs: 6 * 60 * 60 * 1000,
    });
    expect(ok.wallTimeCapMs).toBe(6 * 60 * 60 * 1000);
  });

  it("BUDGET_FIELD_LIMITS.wallTimeMinutes.max is 360 (6h)", () => {
    expect(BUDGET_FIELD_LIMITS.wallTimeMinutes.max).toBe(360);
  });

  it("listBudgetTiers() deep capUsd reflects 12000 credits", () => {
    const deep = listBudgetTiers().find((t) => t.depth === "deep");
    expect(deep?.maxCredits).toBe(12_000);
    expect(deep?.wallTimeMinutes).toBe(360);
  });
});
