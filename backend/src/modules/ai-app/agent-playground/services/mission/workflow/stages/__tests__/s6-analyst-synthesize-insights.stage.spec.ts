import { runAnalystStage } from "../s6-analyst-synthesize-insights.stage";
import type { MissionContext } from "../../mission-context";
import type { MissionDeps } from "../../mission-deps";

const ANALYST_OUTPUT = {
  insights: [
    {
      headline: "AI grows",
      narrative: "AI is growing",
      supportingDimensions: ["Market", "Tech"],
      confidence: 0.9,
    },
    {
      headline: "Risks abound",
      narrative: "There are risks",
      supportingDimensions: ["Policy"],
      confidence: 0.8,
    },
  ],
  themeSummary: "AI is transforming everything",
  contradictions: [],
};

function makeCtx(overrides: Partial<MissionContext> = {}): MissionContext {
  return {
    missionId: "m6",
    userId: "u1",
    t0: Date.now(),
    budgetMultiplier: 1.0,
    input: {
      topic: "AI",
      depth: "deep",
      language: "zh-CN",
      auditLayers: "standard",
    } as MissionContext["input"],
    billing: {} as MissionContext["billing"],
    pool: {
      snapshot: jest
        .fn()
        .mockReturnValue({ poolCostUsd: 0, poolTokensUsed: 0 }),
    } as unknown as MissionContext["pool"],
    leader: {} as MissionContext["leader"],
    researcherResults: [
      {
        dimension: "Market",
        findings: [{ claim: "c", evidence: "e", source: "http://a.com" }],
        summary: "ok",
      },
    ],
    reconciliationReport: null,
    ...overrides,
  } as unknown as MissionContext;
}

function makeDeps(overrides: Partial<MissionDeps> = {}): MissionDeps {
  return {
    emit: jest.fn().mockResolvedValue(undefined),
    log: {
      warn: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    },
    lifecycle: jest.fn().mockResolvedValue(undefined),
    analyst: {
      analyze: jest.fn().mockResolvedValue({
        state: "completed",
        output: ANALYST_OUTPUT,
        events: [],
        wallTimeMs: 1000,
        iterations: 4,
      }),
    },
    missionState: {
      compressIfNeeded: jest.fn().mockImplementation((x: unknown) => x),
    },
    invoker: {
      tickCost: jest.fn().mockResolvedValue(undefined),
      preDisableKnownFailingModels: jest.fn().mockResolvedValue(undefined),
      resolveLoopOverride: jest.fn().mockReturnValue(undefined),
    },
    ...overrides,
  } as unknown as MissionDeps;
}

describe("runAnalystStage (S6)", () => {
  it("throws if researcherResults missing", async () => {
    const ctx = makeCtx({ researcherResults: undefined });
    const deps = makeDeps();
    await expect(runAnalystStage(ctx, deps)).rejects.toThrow(
      /researcherResults/,
    );
  });

  it("happy path: writes ctx.analystOutput and returns analyst", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    const result = await runAnalystStage(ctx, deps);
    expect(ctx.analystOutput).toBeDefined();
    expect(result.insights).toHaveLength(2);
  });

  // ★ 2026-05-06 单轨化: stage 不再 emit stage:started/completed，由 orchestrator
  //   stage:lifecycle 必发（spec 不通过 dispatcher，验证 lifecycle 调用即可）。
  it("calls lifecycle started for analyst", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runAnalystStage(ctx, deps);
    expect(deps.lifecycle).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "analyst",
      "analyst",
      "started",
    );
  });

  it("first attempt null → retries once with simplified prompt", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    let callCount = 0;
    (deps.analyst.analyze as jest.Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          state: "failed",
          output: null,
          events: [],
          wallTimeMs: 0,
          iterations: 1,
        });
      }
      return Promise.resolve({
        state: "completed",
        output: ANALYST_OUTPUT,
        events: [],
        wallTimeMs: 0,
        iterations: 1,
      });
    });
    const result = await runAnalystStage(ctx, deps);
    expect(callCount).toBe(2);
    expect(result.insights).toHaveLength(2);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("first attempt returned no output"),
    );
  });

  it("two consecutive null → falls back to empty analystOutput (mission stays alive)", async () => {
    // ★ P0-LIVE-NULL-OUTPUT (2026-04-30): 之前两次 null 直接 throw 让 mission
    //   全死，浪费已采集的 6 维 researcher results。改成发空 analystOutput
    //   让下游 writer/reviewer 至少能渲出报告（即便质量低）。
    const ctx = makeCtx();
    const deps = makeDeps();
    (deps.analyst.analyze as jest.Mock).mockResolvedValue({
      state: "failed",
      output: null,
      events: [],
      wallTimeMs: 0,
      iterations: 1,
    });
    const result = await runAnalystStage(ctx, deps);
    expect(result.insights).toHaveLength(0);
    expect(result.themeSummary).toMatch(/未产出有效综合分析/);
    expect(ctx.analystOutput).toBe(result);
  });

  it("lifecycle called started/completed on success", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runAnalystStage(ctx, deps);
    const calls = (deps.lifecycle as jest.Mock).mock.calls;
    expect(calls[0][4]).toBe("started");
    expect(calls[1][4]).toBe("completed");
  });

  it("lifecycle called failed when analyst fails", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    (deps.analyst.analyze as jest.Mock).mockResolvedValue({
      state: "failed",
      output: null,
      events: [],
      wallTimeMs: 0,
      iterations: 1,
    });
    await runAnalystStage(ctx, deps).catch(() => {});
    const failedCall = (deps.lifecycle as jest.Mock).mock.calls.find(
      (c) => c[4] === "failed",
    );
    expect(failedCall).toBeDefined();
  });

  it("compressIfNeeded called for researcherResults handoff", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runAnalystStage(ctx, deps);
    expect(deps.missionState.compressIfNeeded).toHaveBeenCalledWith(
      expect.anything(),
      "analyst.researcherResults",
    );
  });

  // ★ 2026-05-06 单轨化: insightsCount 之前由 stage:completed payload 传，
  //   现在由 hook return 值（output）经 orchestrator stage:completed 传，dispatcher
  //   拍平到 stage:lifecycle.payload.output。spec 改为验证 ctx.analystOutput.insights。
  it("produces 2 insights on success", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runAnalystStage(ctx, deps);
    expect(ctx.analystOutput?.insights).toHaveLength(2);
  });

  it("passes reconciliationReport to analyst.analyze when available", async () => {
    const recon = { factTable: [], conflicts: [], gaps: [] };
    const ctx = makeCtx({
      reconciliationReport: recon as MissionContext["reconciliationReport"],
    });
    const deps = makeDeps();
    await runAnalystStage(ctx, deps);
    const analyzeCall = (deps.analyst.analyze as jest.Mock).mock.calls[0][0];
    expect(analyzeCall.reconciliationReport).toBe(recon);
  });

  it("second attempt uses analyst.retry agentId", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    let firstCall = true;
    (deps.analyst.analyze as jest.Mock).mockImplementation(() => {
      if (firstCall) {
        firstCall = false;
        return Promise.resolve({
          state: "failed",
          output: null,
          events: [],
          wallTimeMs: 0,
          iterations: 1,
        });
      }
      return Promise.resolve({
        state: "completed",
        output: ANALYST_OUTPUT,
        events: [],
        wallTimeMs: 0,
        iterations: 1,
      });
    });
    await runAnalystStage(ctx, deps);
    const secondCall = (deps.analyst.analyze as jest.Mock).mock.calls[1][1];
    expect(secondCall.agentId).toBe("analyst.retry");
  });
});
