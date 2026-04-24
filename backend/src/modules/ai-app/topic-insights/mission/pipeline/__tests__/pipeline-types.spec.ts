/**
 * Pipeline 类型单元测试 — Budget / StageResults / DepthConfig
 */

import {
  DEPTH_BUDGET_DEFAULTS,
  DEPTH_CONFIG_DEFAULTS,
  PipelineBudget,
  StageDependencyError,
  StageResults,
  resolveDepthConfig,
} from "../types";

describe("PipelineBudget", () => {
  it("forDepth(standard) 使用默认配置", () => {
    const b = PipelineBudget.forDepth("standard");
    expect(b.config).toEqual(DEPTH_BUDGET_DEFAULTS.standard);
    expect(b.snapshot()).toEqual({
      tokensUsed: 0,
      costUsd: 0,
      toolCallsCount: 0,
      wallTimeMs: 0,
    });
  });

  it("canAfford 按 tokens 判断", () => {
    const b = PipelineBudget.forDepth("standard"); // max 200k tokens
    expect(b.canAfford(100_000)).toBe(true);
    b.charge({ tokens: 150_000 });
    expect(b.canAfford(40_000)).toBe(true);
    expect(b.canAfford(60_000)).toBe(false);
  });

  it("shouldDegrade 在 80% 触发", () => {
    const b = PipelineBudget.forDepth("quick"); // max 100k tokens
    expect(b.shouldDegrade()).toBe(false);
    b.charge({ tokens: 70_000 });
    expect(b.shouldDegrade()).toBe(false);
    b.charge({ tokens: 15_000 });
    expect(b.shouldDegrade()).toBe(true);
    expect(b.isExhausted()).toBe(false);
  });

  it("isExhausted 在 100% 触发（任一维度）", () => {
    const b = PipelineBudget.forDepth("standard"); // $2 cost
    b.charge({ costUsd: 2 });
    expect(b.isExhausted()).toBe(true);
  });

  it("cost / toolCalls / wallTime 任一到 100% 都算耗尽", () => {
    const b = PipelineBudget.forDepth("quick"); // 30 tool calls
    b.charge({ toolCalls: 30 });
    expect(b.isExhausted()).toBe(true);
  });
});

describe("StageResults", () => {
  it("set/get 类型安全", () => {
    const sr = new StageResults();
    sr.set<{ plan: string[] }>("ST-01-PLAN", { plan: ["dim1", "dim2"] });
    const out = sr.get<{ plan: string[] }>("ST-01-PLAN");
    expect(out.plan).toEqual(["dim1", "dim2"]);
  });

  it("get 未完成的 stage 抛 StageDependencyError", () => {
    const sr = new StageResults();
    expect(() => sr.get("ST-01-PLAN")).toThrow(StageDependencyError);
  });

  it("has 正确判断存在性", () => {
    const sr = new StageResults();
    expect(sr.has("ST-01-PLAN")).toBe(false);
    sr.set("ST-01-PLAN", 1);
    expect(sr.has("ST-01-PLAN")).toBe(true);
  });

  it("rebuild 目前是 stub 不抛错", async () => {
    const sr = new StageResults();
    await expect(sr.rebuild("mission-1")).resolves.toBeUndefined();
  });
});

describe("DepthConfig", () => {
  it("resolveDepthConfig 覆盖 4 种 depth", () => {
    expect(resolveDepthConfig("quick").maxDimensions).toBe(3);
    expect(resolveDepthConfig("standard").maxDimensions).toBe(4);
    expect(resolveDepthConfig("thorough").maxDimensions).toBe(6);
    expect(resolveDepthConfig("deep").maxDimensions).toBe(8);
  });

  it("thorough / deep 启用 literature + fact-check + evaluation", () => {
    const thorough = DEPTH_CONFIG_DEFAULTS.thorough;
    expect(thorough.literatureBaselineEnabled).toBe(true);
    expect(thorough.factCheckEnabled).toBe(true);
    expect(thorough.evaluationEnabled).toBe(true);
  });

  it("quick / standard 关闭增强功能", () => {
    expect(DEPTH_CONFIG_DEFAULTS.quick.literatureBaselineEnabled).toBe(false);
    expect(DEPTH_CONFIG_DEFAULTS.standard.factCheckEnabled).toBe(false);
  });
});
