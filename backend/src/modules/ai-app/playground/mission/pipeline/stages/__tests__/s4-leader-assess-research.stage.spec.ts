import { runLeaderAssessResearchStage } from "../s4-leader-assess-research.stage";
import type { MissionContext } from "../../../context/mission-context";
import type { MissionDeps } from "../../../context/mission-deps";

jest.mock("../../helpers/per-dim-pipeline.util", () => ({
  runPerDimPipeline: jest.fn().mockResolvedValue({
    dimension: "Market",
    findings: [
      { claim: "c-retry", evidence: "e-retry", source: "http://retry.com" },
    ],
    summary: "retried ok",
  }),
}));

const DIMS = [
  { id: "d1", name: "Market", rationale: "market" },
  { id: "d2", name: "Tech", rationale: "tech" },
];

const RESULTS = [
  {
    dimension: "Market",
    findings: [{ claim: "c", evidence: "e", source: "http://a.com" }],
    summary: "ok",
  },
  {
    dimension: "Tech",
    findings: [{ claim: "c2", evidence: "e2", source: "http://b.com" }],
    summary: "ok",
  },
];

function baseAssessResult(decision: string) {
  return {
    decision,
    rationale: "Looks fine",
    perDimension: [
      { dimensionId: "d1", action: "accept" },
      { dimensionId: "d2", action: "accept" },
    ],
    newDimensions: [],
  };
}

function makeCtx(overrides: Partial<MissionContext> = {}): MissionContext {
  return {
    missionId: "m4",
    userId: "u1",
    t0: Date.now(),
    budgetMultiplier: 1.0,
    input: {
      topic: "AI",
      depth: "deep",
      language: "zh-CN",
    } as MissionContext["input"],
    billing: {} as MissionContext["billing"],
    pool: {
      snapshot: jest
        .fn()
        .mockReturnValue({ poolCostUsd: 0, poolTokensUsed: 0 }),
    } as unknown as MissionContext["pool"],
    leader: {
      assessResearchers: jest
        .fn()
        .mockResolvedValue(baseAssessResult("accept-all")),
    } as unknown as MissionContext["leader"],
    plan: {
      themeSummary: "t",
      dimensions: DIMS,
      goals: {} as never,
      initialRisks: [],
    },
    researcherResults: [...RESULTS],
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
    markStageDegraded: jest.fn().mockResolvedValue(undefined),
    invoker: {
      invoke: jest.fn().mockResolvedValue({
        state: "completed",
        output: {
          dimension: "Market",
          findings: [{ claim: "c", evidence: "e", source: "http://a.com" }],
          summary: "ok",
        },
        events: [],
        wallTimeMs: 1000,
        iterations: 3,
      }),
      tickCost: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  } as unknown as MissionDeps;
}

describe("runLeaderAssessResearchStage (S4)", () => {
  it("throws if plan or researcherResults missing", async () => {
    const ctx = makeCtx({ plan: undefined });
    const deps = makeDeps();
    await expect(runLeaderAssessResearchStage(ctx, deps)).rejects.toThrow(
      /requires plan/,
    );
  });

  it("accept-all: no retries dispatched, mission continues", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runLeaderAssessResearchStage(ctx, deps);
    expect(deps.invoker.invoke).not.toHaveBeenCalled();
  });

  it("abort decision → throws with message", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue(
      baseAssessResult("abort"),
    );
    const deps = makeDeps();
    await expect(runLeaderAssessResearchStage(ctx, deps)).rejects.toThrow(
      // 文案已本地化（zh-CN）：用 instanceof LeaderAbortError 识别 abort，不靠 message 前缀。
      /中止任务/,
    );
  });

  it("patch decision: retry-with-critique → dispatches researcher retry", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "redo dim1",
      perDimension: [
        {
          dimensionId: "d1",
          action: "retry-with-critique",
          critique: "Not enough data",
        },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps();
    await runLeaderAssessResearchStage(ctx, deps);
    expect(deps.invoker.invoke).toHaveBeenCalled();
  });

  it("abort action per dim → sets findings=[] and summary='aborted by Leader'", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "kill d1",
      perDimension: [
        { dimensionId: "d1", action: "abort", critique: "useless" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps();
    await runLeaderAssessResearchStage(ctx, deps);
    expect(ctx.researcherResults![0].findings).toEqual([]);
    expect(ctx.researcherResults![0].summary).toContain("aborted by Leader");
  });

  it("redirect: adds new dimension and dispatches researcher", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "redirect",
      rationale: "extend",
      perDimension: [
        { dimensionId: "d1", action: "accept" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [{ id: "d3", name: "Policy", rationale: "regulation" }],
    });
    const deps = makeDeps();
    await runLeaderAssessResearchStage(ctx, deps);
    expect(ctx.plan!.dimensions).toHaveLength(3);
  });

  it("assessResearchers throws (non-fatal) → logs warn and continues", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockRejectedValue(
      new Error("LLM error"),
    );
    const deps = makeDeps();
    await expect(
      runLeaderAssessResearchStage(ctx, deps),
    ).resolves.toBeUndefined();
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("M1 assess-research failed"),
    );
  });

  it("patch cap: >2 retry-with-critique → capped to 2, rest become accept-degraded", async () => {
    const ctxDims = [
      { id: "d1", name: "M1", rationale: "r" },
      { id: "d2", name: "M2", rationale: "r" },
      { id: "d3", name: "M3", rationale: "r" },
      { id: "d4", name: "M4", rationale: "r" },
    ];
    const ctxResults = ctxDims.map((d) => ({
      dimension: d.name,
      findings: [],
      summary: "fail",
    }));
    const ctx = makeCtx({
      plan: {
        themeSummary: "t",
        dimensions: ctxDims,
        goals: {} as never,
        initialRisks: [],
      },
      researcherResults: ctxResults,
    });
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "redo all",
      perDimension: ctxDims.map((d) => ({
        dimensionId: d.id,
        action: "retry-with-critique",
        critique: "bad",
      })),
      newDimensions: [],
    });
    const deps = makeDeps();
    await runLeaderAssessResearchStage(ctx, deps);
    // Only 2 retries should be dispatched
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("patch 上限"),
    );
  });

  it("emits leader:decision event", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runLeaderAssessResearchStage(ctx, deps);
    const decisionCall = (deps.emit as jest.Mock).mock.calls.find(
      (c) => c[0].type === "playground.leader:decision",
    );
    expect(decisionCall).toBeDefined();
  });

  it("unknown dimensionId in perDimension → skipped count increases", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "patch unknown",
      perDimension: [
        {
          dimensionId: "non-existent",
          action: "retry-with-critique",
          critique: "bad",
        },
        { dimensionId: "d1", action: "accept" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps();
    await runLeaderAssessResearchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("not in plan"),
    );
  });

  it("duplicate newDimension id → logged warn and skipped", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "redirect",
      rationale: "extend",
      perDimension: [
        { dimensionId: "d1", action: "accept" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [{ id: "d1", name: "Market-dup", rationale: "dup" }],
    });
    const deps = makeDeps();
    await runLeaderAssessResearchStage(ctx, deps);
    // d1 already exists, so warn should be logged
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("conflicts with existing"),
    );
  });

  it("s4PatchRound > MAX_S4_ROUNDS → retry actions force-downgraded to accept-degraded", async () => {
    const ctx = makeCtx();
    // Simulate second round (already ran once)
    (ctx as unknown as Record<string, unknown>).s4PatchRound = 1;
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "retry again",
      perDimension: [
        {
          dimensionId: "d1",
          action: "retry-with-critique",
          critique: "Still bad",
        },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps();
    await runLeaderAssessResearchStage(ctx, deps);
    // Round 2 exceeds MAX_S4_ROUNDS=1, so retry actions should be downgraded
    // No invoke should be called since retry is downgraded to accept-degraded
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("forced"),
    );
  });

  it("assessResearchers throws non-fatal → warn includes M1 assess-research failed", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockRejectedValue(
      new Error("LLM timeout"),
    );
    const deps = makeDeps();
    await runLeaderAssessResearchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("M1 assess-research failed"),
    );
  });

  // ── English abort (lines 227-228, 232, 239): language=en-US ──
  it("abort decision with en-US language → English error message in throw", async () => {
    const ctx = makeCtx({
      input: {
        topic: "AI",
        depth: "deep",
        language: "en-US",
      } as MissionContext["input"],
      researcherResults: [
        { dimension: "Market", findings: [], summary: "fail" },
        {
          dimension: "Tech",
          findings: [{ claim: "c", evidence: "e", source: "http://b.com" }],
          summary: "ok",
        },
      ],
    });
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "abort",
      rationale: "quality too low",
      perDimension: [
        { dimensionId: "d1", action: "accept" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps();
    await expect(runLeaderAssessResearchStage(ctx, deps)).rejects.toThrow(
      /Research quality insufficient/,
    );
  });

  it("abort with belowMinDims (en-US) → includes 'did not meet the minimum-sources' in throw", async () => {
    const ctx = makeCtx({
      input: {
        topic: "AI",
        depth: "deep",
        language: "en-US",
      } as MissionContext["input"],
      plan: {
        themeSummary: "t",
        dimensions: [
          { id: "d1", name: "Market", rationale: "market" },
          { id: "d2", name: "Tech", rationale: "tech" },
        ],
        // minSources=10 so findings (1) < 10 → meetsMinSources=false, belowMinDims filled
        goals: {
          qualityBar: { minSources: 10, minCoverage: 0, hardConstraints: [] },
          successCriteria: [],
          deliverables: [],
        } as never,
        initialRisks: [],
      },
      researcherResults: [
        // findings.length=1 < minSources=10 → meetsMinSources=false (state=completed, 1 finding)
        {
          dimension: "Market",
          findings: [{ claim: "c", evidence: "e", source: "http://a.com" }],
          summary: "ok",
        },
        {
          dimension: "Tech",
          findings: [{ claim: "c2", evidence: "e2", source: "http://b.com" }],
          summary: "ok",
        },
      ],
    });
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "abort",
      rationale: "sources below minimum",
      perDimension: [
        { dimensionId: "d1", action: "accept" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps();
    await expect(runLeaderAssessResearchStage(ctx, deps)).rejects.toThrow(
      /did not meet the minimum-sources/,
    );
  });

  // ── emit leader:decision failure (line 209) ──
  it("emit leader:decision failure → swallowed, warns", async () => {
    const ctx = makeCtx();
    const deps = makeDeps({
      emit: jest
        .fn()
        .mockImplementation(
          (event: { type: string; payload?: { phase?: string } }) => {
            if (
              event.type === "playground.leader:decision" &&
              event.payload?.phase === "assess-research"
            ) {
              return Promise.reject(new Error("decision emit fail"));
            }
            return Promise.resolve();
          },
        ),
    });
    await runLeaderAssessResearchStage(ctx, deps);
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      warnCalls.some((m) =>
        m.includes("emit leader:decision (assess-research) failed"),
      ),
    ).toBe(true);
  });

  // ── emit leader:decision (dispatched) failure (line 278) ──
  it("emit leader:decision (assess-research-dispatched) failure → swallowed, warns", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "retry d1",
      perDimension: [
        { dimensionId: "d1", action: "retry-with-critique", critique: "bad" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps({
      emit: jest
        .fn()
        .mockImplementation(
          (event: { type: string; payload?: { phase?: string } }) => {
            if (
              event.type === "playground.leader:decision" &&
              event.payload?.phase === "assess-research-dispatched"
            ) {
              return Promise.reject(new Error("dispatched emit fail"));
            }
            return Promise.resolve();
          },
        ),
    });
    await runLeaderAssessResearchStage(ctx, deps);
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      warnCalls.some((m) =>
        m.includes("emit leader:decision (assess-research-dispatched) failed"),
      ),
    ).toBe(true);
  });

  // ── emit dimension:retrying (leader-assess-abort) failure (line 388) ──
  it("dim abort action + emit dimension:retrying failure → swallowed", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "abort d1",
      perDimension: [
        { dimensionId: "d1", action: "abort", critique: "no good" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps({
      emit: jest
        .fn()
        .mockImplementation(
          (event: { type: string; payload?: { reason?: string } }) => {
            if (
              event.type === "playground.dimension:retrying" &&
              event.payload?.reason === "leader-assess-abort"
            ) {
              return Promise.reject(new Error("abort emit fail"));
            }
            return Promise.resolve();
          },
        ),
    });
    await runLeaderAssessResearchStage(ctx, deps);
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      warnCalls.some((m) =>
        m.includes("emit dimension:retrying (leader-assess-abort)"),
      ),
    ).toBe(true);
  });

  // ── emit dimension:retrying (pre-batch) failure (line 439) ──
  it("retry batch emit failure → swallowed, warns", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "retry d1",
      perDimension: [
        { dimensionId: "d1", action: "retry-with-critique", critique: "bad" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    let preRetryEmitCount = 0;
    const deps = makeDeps({
      emit: jest
        .fn()
        .mockImplementation(
          (event: { type: string; payload?: { reason?: string } }) => {
            if (
              event.type === "playground.dimension:retrying" &&
              event.payload?.reason === "leader-assess-retry"
            ) {
              preRetryEmitCount++;
              return Promise.reject(new Error("pre-batch emit fail"));
            }
            return Promise.resolve();
          },
        ),
    });
    await runLeaderAssessResearchStage(ctx, deps);
    expect(preRetryEmitCount).toBeGreaterThan(0);
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      warnCalls.some((m) => m.includes("emit dimension:retrying (pre-batch)")),
    ).toBe(true);
  });

  // ── emit dimension:retry-phase:started failure (line 465) ──
  it("emit retry-phase:started failure → swallowed, warns", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "retry d1",
      perDimension: [
        { dimensionId: "d1", action: "retry-with-critique", critique: "bad" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps({
      emit: jest.fn().mockImplementation((event: { type: string }) => {
        if (event.type === "playground.dimension:retry-phase:started") {
          return Promise.reject(new Error("retry-phase:started emit fail"));
        }
        return Promise.resolve();
      }),
    });
    await runLeaderAssessResearchStage(ctx, deps);
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      warnCalls.some((m) =>
        m.includes("emit dimension:retry-phase:started failed"),
      ),
    ).toBe(true);
  });

  // ── reuse-recompute strategy (lines 505-513) ──
  it("reuse-recompute strategy: reuses existing researcherResults without re-running researcher", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "recompute only",
      perDimension: [
        {
          dimensionId: "d1",
          action: "retry-with-critique",
          critique: "reuse findings",
          strategy: "reuse-recompute",
        },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps();
    await runLeaderAssessResearchStage(ctx, deps);
    // researcher NOT reinvoked (reuse-recompute skips researcher invoke)
    expect(deps.invoker.invoke).not.toHaveBeenCalled();
  });

  // ── skipChapterPipeline=true (line 564): auditLayers=minimal ──
  it("auditLayers=minimal + patch retry → skipChapterPipeline=true, researcherResults updated directly", async () => {
    const ctx = makeCtx({
      input: {
        topic: "AI",
        depth: "deep",
        language: "zh-CN",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "skip chapter pipeline",
      perDimension: [
        { dimensionId: "d1", action: "retry-with-critique", critique: "bad" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps();
    await runLeaderAssessResearchStage(ctx, deps);
    // invoker.invoke called for researcher retry
    expect(deps.invoker.invoke).toHaveBeenCalled();
    // researcherResults[0] updated with retry output
    expect(ctx.researcherResults![0].summary).toBe("ok"); // default mock returns "ok"
  });

  // ── DAG task throws (lines 526-531) ──
  it("DAG retry task throws → error captured, retry-failed emitted", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "retry d1",
      perDimension: [
        { dimensionId: "d1", action: "retry-with-critique", critique: "bad" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps({
      invoker: {
        invoke: jest
          .fn()
          .mockRejectedValue(new Error("researcher invoke boom")),
        tickCost: jest.fn().mockResolvedValue(undefined),
      },
    });
    await runLeaderAssessResearchStage(ctx, deps);
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      warnCalls.some(
        (m) => m.includes("retry DAG task") && m.includes("threw"),
      ),
    ).toBe(true);
  });

  // ── retry fail: retry produced no output (lines 602-638) ──
  it("retry dim fails (null output) → s4PatchFailures set, mission:degraded emitted", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "retry d1",
      perDimension: [
        { dimensionId: "d1", action: "retry-with-critique", critique: "bad" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps({
      invoker: {
        // return failed state → runResearcherWithCritique returns null
        invoke: jest.fn().mockResolvedValue({
          state: "failed",
          output: null,
          events: [],
          wallTimeMs: 500,
          iterations: 2,
        }),
        tickCost: jest.fn().mockResolvedValue(undefined),
      },
    });
    await runLeaderAssessResearchStage(ctx, deps);
    expect(ctx.s4PatchFailures).toBeDefined();
    expect(ctx.s4PatchFailures).toHaveLength(1);
    const degradedCall = (deps.emit as jest.Mock).mock.calls.find(
      (c) => c[0].type === "playground.mission:degraded",
    );
    expect(degradedCall).toBeDefined();
    expect(degradedCall[0].payload.reason).toBe("s4-patch-failed");
  });

  // ── emit dimension:retry-failed failure (line 623) ──
  it("emit dimension:retry-failed failure → swallowed, warns", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "retry d1",
      perDimension: [
        { dimensionId: "d1", action: "retry-with-critique", critique: "bad" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps({
      invoker: {
        invoke: jest.fn().mockResolvedValue({
          state: "failed",
          output: null,
          events: [],
          wallTimeMs: 500,
          iterations: 2,
        }),
        tickCost: jest.fn().mockResolvedValue(undefined),
      },
      emit: jest.fn().mockImplementation((event: { type: string }) => {
        if (event.type === "playground.dimension:retry-failed") {
          return Promise.reject(new Error("retry-failed emit fail"));
        }
        return Promise.resolve();
      }),
    });
    await runLeaderAssessResearchStage(ctx, deps);
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      warnCalls.some((m) => m.includes("emit dimension:retry-failed")),
    ).toBe(true);
  });

  // ── runPerDimPipeline throws (lines 593-597): catch fallback to researcher output ──
  it("runPerDimPipeline throws → falls back to researcher output only", async () => {
    const { runPerDimPipeline: mockFn } = jest.requireMock(
      "../../helpers/per-dim-pipeline.util",
    );
    mockFn.mockRejectedValueOnce(new Error("pipeline boom"));

    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "retry d1",
      perDimension: [
        { dimensionId: "d1", action: "retry-with-critique", critique: "bad" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps();
    await runLeaderAssessResearchStage(ctx, deps);
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      warnCalls.some((m) => m.includes("re-run chapter pipeline failed")),
    ).toBe(true);
  });

  // ── saveResearchResult failure (line 661) ──
  it("saveResearchResult fails → swallowed, warns", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "retry d1",
      perDimension: [
        { dimensionId: "d1", action: "retry-with-critique", critique: "bad" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps({
      store: {
        saveResearchResult: jest
          .fn()
          .mockRejectedValue(new Error("store fail")),
      },
    });
    await runLeaderAssessResearchStage(ctx, deps);
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      warnCalls.some((m) => m.includes("saveResearchResult for dim=")),
    ).toBe(true);
  });

  // ── emit mission:degraded failure (line 681) ──
  it("emit mission:degraded failure → swallowed, warns", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "retry d1",
      perDimension: [
        { dimensionId: "d1", action: "retry-with-critique", critique: "bad" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps({
      invoker: {
        invoke: jest.fn().mockResolvedValue({
          state: "failed",
          output: null,
          events: [],
          wallTimeMs: 500,
          iterations: 2,
        }),
        tickCost: jest.fn().mockResolvedValue(undefined),
      },
      emit: jest.fn().mockImplementation((event: { type: string }) => {
        if (event.type === "playground.mission:degraded") {
          return Promise.reject(new Error("degraded emit fail"));
        }
        return Promise.resolve();
      }),
    });
    await runLeaderAssessResearchStage(ctx, deps);
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      warnCalls.some((m) =>
        m.includes("emit mission:degraded (s4-patch-failed) failed"),
      ),
    ).toBe(true);
  });

  // ── emit retry-phase:completed failure (line 709) ──
  it("emit retry-phase:completed failure → swallowed, warns", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "retry d1",
      perDimension: [
        { dimensionId: "d1", action: "retry-with-critique", critique: "bad" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps({
      emit: jest.fn().mockImplementation((event: { type: string }) => {
        if (event.type === "playground.dimension:retry-phase:completed") {
          return Promise.reject(new Error("phase completed emit fail"));
        }
        return Promise.resolve();
      }),
    });
    await runLeaderAssessResearchStage(ctx, deps);
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      warnCalls.some((m) =>
        m.includes("emit dimension:retry-phase:completed failed"),
      ),
    ).toBe(true);
  });

  // ── extend (redirect) emit failure (line 739) ──
  it("redirect emit dimension:retrying (extend) failure → swallowed", async () => {
    const ctx = makeCtx({
      plan: {
        themeSummary: "t",
        dimensions: [
          { id: "e1", name: "EMarket", rationale: "em" },
          { id: "e2", name: "ETech", rationale: "et" },
        ],
        goals: {} as never,
        initialRisks: [],
      },
      researcherResults: [
        {
          dimension: "EMarket",
          findings: [{ claim: "c", evidence: "e", source: "http://a.com" }],
          summary: "ok",
        },
        {
          dimension: "ETech",
          findings: [{ claim: "c2", evidence: "e2", source: "http://b.com" }],
          summary: "ok",
        },
      ],
    });
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "redirect",
      rationale: "extend",
      perDimension: [
        { dimensionId: "e1", action: "accept" },
        { dimensionId: "e2", action: "accept" },
      ],
      newDimensions: [{ id: "e3", name: "EPolicy", rationale: "regulation" }],
    });
    let extendEmitRejected = false;
    const deps = makeDeps({
      emit: jest.fn().mockImplementation((event: Record<string, unknown>) => {
        const payload = event.payload as Record<string, unknown> | undefined;
        if (
          event.type === "playground.dimension:retrying" &&
          payload?.reason === "leader-assess-extend"
        ) {
          extendEmitRejected = true;
          return Promise.reject(new Error("extend emit fail"));
        }
        return Promise.resolve();
      }),
    });
    await runLeaderAssessResearchStage(ctx, deps);
    expect(extendEmitRejected).toBe(true);
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      warnCalls.some((m) =>
        m.includes("emit dimension:retrying (leader-assess-extend)"),
      ),
    ).toBe(true);
  });

  // ── extend (redirect) runResearcherWithCritique returns null (line 758) ──
  it("redirect new dim researcher fails → null out, skipped++", async () => {
    const ctx = makeCtx({
      plan: {
        themeSummary: "t",
        dimensions: [
          { id: "n1", name: "NMarket", rationale: "nm" },
          { id: "n2", name: "NTech", rationale: "nt" },
        ],
        goals: {} as never,
        initialRisks: [],
      },
      researcherResults: [
        {
          dimension: "NMarket",
          findings: [{ claim: "c", evidence: "e", source: "http://a.com" }],
          summary: "ok",
        },
        {
          dimension: "NTech",
          findings: [{ claim: "c2", evidence: "e2", source: "http://b.com" }],
          summary: "ok",
        },
      ],
    });
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "redirect",
      rationale: "extend",
      perDimension: [
        { dimensionId: "n1", action: "accept" },
        { dimensionId: "n2", action: "accept" },
      ],
      newDimensions: [{ id: "n3", name: "NPolicy", rationale: "regulation" }],
    });
    const deps = makeDeps({
      invoker: {
        invoke: jest.fn().mockResolvedValue({
          state: "failed",
          output: null,
          events: [],
          wallTimeMs: 500,
          iterations: 2,
        }),
        tickCost: jest.fn().mockResolvedValue(undefined),
      },
    });
    await runLeaderAssessResearchStage(ctx, deps);
    // Plan gains the new dimension
    expect(ctx.plan!.dimensions).toHaveLength(3);
    // researcherResults gets a fallback entry with "(failed:" in summary
    const newDimResult = ctx.researcherResults!.find(
      (r) => r.dimension === "NPolicy",
    );
    expect(newDimResult).toBeDefined();
    expect(newDimResult?.summary).toContain("failed");
  });

  // ── emit researcher:completed (retry) failure (line 862) ──
  it("emit researcher:completed (retry) failure → swallowed, warns", async () => {
    const ctx = makeCtx();
    (ctx.leader.assessResearchers as jest.Mock).mockResolvedValue({
      decision: "patch",
      rationale: "retry d1",
      perDimension: [
        { dimensionId: "d1", action: "retry-with-critique", critique: "bad" },
        { dimensionId: "d2", action: "accept" },
      ],
      newDimensions: [],
    });
    const deps = makeDeps({
      emit: jest.fn().mockImplementation((event: { type: string }) => {
        if (event.type === "playground.researcher:completed") {
          return Promise.reject(new Error("researcher:completed emit fail"));
        }
        return Promise.resolve();
      }),
    });
    await runLeaderAssessResearchStage(ctx, deps);
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      warnCalls.some((m) => m.includes("emit researcher:completed (retry)")),
    ).toBe(true);
  });
});
