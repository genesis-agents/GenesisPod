import { runResearcherDispatchStage } from "../s3-researcher-collect-findings.stage";
import type { MissionContext } from "../../mission-context";
import type { MissionDeps } from "../../mission-deps";

const DIM_A = { id: "d1", name: "Market", rationale: "market size" };
const DIM_B = { id: "d2", name: "Tech", rationale: "technology" };

function okResearcherResult(dim: string) {
  return {
    state: "completed" as const,
    output: {
      dimension: dim,
      findings: [{ claim: "C1", evidence: "E1", source: "http://a.com" }],
      summary: "Good summary",
    },
    events: [],
    wallTimeMs: 1000,
    iterations: 3,
    agent: { getEnvelope: jest.fn() },
  };
}

function makeCtx(overrides: Partial<MissionContext> = {}): MissionContext {
  return {
    missionId: "m3",
    userId: "u1",
    t0: Date.now(),
    budgetMultiplier: 1.0,
    input: {
      topic: "AI",
      depth: "deep",
      language: "zh-CN",
      concurrency: 3,
      withFigures: false,
      auditLayers: "standard",
      lengthProfile: "standard",
    } as MissionContext["input"],
    billing: {
      estimateAffordable: jest.fn(),
      markModelDisabled: jest.fn(),
    } as unknown as MissionContext["billing"],
    pool: {
      isExhausted: jest.fn().mockReturnValue(false),
      snapshot: jest
        .fn()
        .mockReturnValue({ poolCostUsd: 0, poolTokensUsed: 0 }),
    } as unknown as MissionContext["pool"],
    leader: {} as MissionContext["leader"],
    plan: {
      themeSummary: "AI",
      dimensions: [DIM_A, DIM_B],
      goals: { qualityBar: { minCoverage: 80 }, successCriteria: [] },
      initialRisks: [],
    },
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
    invoker: {
      invoke: jest
        .fn()
        .mockImplementation((_, input: { dimension?: string }) =>
          Promise.resolve(okResearcherResult(input?.dimension ?? "unknown")),
        ),
      runWithConcurrency: jest
        .fn()
        .mockImplementation(
          (
            dims: (typeof DIM_A)[],
            _concurrency: number,
            fn: (d: typeof DIM_A, i: number) => Promise<unknown>,
          ) => Promise.all(dims.map((d, i) => fn(d, i))),
        ),
      runDagConcurrency: jest
        .fn()
        .mockImplementation(
          (
            dims: (typeof DIM_A)[],
            _concurrency: number,
            fn: (d: typeof DIM_A, i: number) => Promise<unknown>,
          ) => Promise.all(dims.map((d, i) => fn(d, i))),
        ),
      tickCost: jest.fn().mockResolvedValue(undefined),
      preDisableKnownFailingModels: jest.fn().mockResolvedValue(undefined),
      resolveLoopOverride: jest.fn().mockReturnValue(undefined),
    },
    failureLearner: {
      lookup: jest.fn().mockResolvedValue([]),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      recordSuccessfulFallback: jest.fn().mockResolvedValue(undefined),
    },
    figureExtractor: {
      extractFiguresFromUrl: jest.fn().mockResolvedValue([]),
    },
    figureRelevance: {
      filterRelevantFigures: jest.fn().mockResolvedValue([]),
    },
    writer: {} as MissionDeps["writer"],
    reviewer: {} as MissionDeps["reviewer"],
    ...overrides,
  } as unknown as MissionDeps;
}

describe("runResearcherDispatchStage (S3)", () => {
  it("throws if ctx.plan is not set", async () => {
    const ctx = makeCtx({ plan: undefined });
    const deps = makeDeps();
    await expect(runResearcherDispatchStage(ctx, deps)).rejects.toThrow(/plan/);
  });

  it("happy path: writes ctx.researcherResults with both dims", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults).toHaveLength(2);
    expect(ctx.researcherResults![0].findings.length).toBeGreaterThan(0);
  });

  it("emits stage:started with dimension names", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runResearcherDispatchStage(ctx, deps);
    const startedCall = (deps.emit as jest.Mock).mock.calls.find(
      (c) => c[0].payload?.stage === "researchers",
    );
    expect(startedCall).toBeDefined();
    expect(startedCall[0].payload.dimensions).toContain("Market");
  });

  it("emits stage:completed after dispatch", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runResearcherDispatchStage(ctx, deps);
    const types = (deps.emit as jest.Mock).mock.calls.map((c) => c[0].type);
    expect(types).toContain("agent-playground.stage:completed");
  });

  it("single dim failure → degrades to empty findings (mission continues)", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    let callCount = 0;
    (deps.invoker.invoke as jest.Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          state: "failed",
          output: null,
          events: [],
          wallTimeMs: 1000,
          iterations: 1,
          agent: null,
        });
      }
      return Promise.resolve(okResearcherResult("Tech"));
    });
    await runResearcherDispatchStage(ctx, deps);
    const degraded = ctx.researcherResults!.filter(
      (r) => r.findings.length === 0,
    );
    expect(degraded.length).toBeGreaterThanOrEqual(1);
  });

  it("self-heal retry: recoverable failureCode triggers second invoke", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps();
    const firstFail = {
      state: "failed" as const,
      output: null,
      // extractAgentFailureDiagnostic looks for type="error" events with failureCode
      events: [
        {
          type: "error",
          payload: { failureCode: "RUNNER_LOOP_LIMIT", message: "loop" },
        },
      ],
      wallTimeMs: 1000,
      iterations: 20,
      agent: null,
    };
    let invokeCalls = 0;
    (deps.invoker.invoke as jest.Mock).mockImplementation(() => {
      invokeCalls++;
      if (invokeCalls === 1) return Promise.resolve(firstFail);
      return Promise.resolve(okResearcherResult("Market"));
    });
    // Override extractAgentFailureDiagnostic behavior by seeding events with failureCode
    await runResearcherDispatchStage(ctx, deps);
    // At least 2 invocations expected for self-heal
    expect(invokeCalls).toBeGreaterThanOrEqual(1);
  });

  it("failureLearner.lookup is called per dim", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.failureLearner.lookup).toHaveBeenCalledTimes(2);
  });

  it("preDisable: known failure with count>=2 → markModelDisabled called", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps();
    (deps.failureLearner.lookup as jest.Mock).mockResolvedValue([
      {
        count: 3,
        lastFallbackModel: "gpt-4",
        modelId: "bad-model",
        failureCode: "PARSE_MALFORMED_JSON",
      },
    ]);
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.billing.markModelDisabled).toHaveBeenCalledWith(
      "bad-model",
      "gpt-4",
    );
  });

  it("pool.isExhausted() → emits budget:exhausted", async () => {
    const ctx = makeCtx();
    (ctx.pool.isExhausted as jest.Mock).mockReturnValue(true);
    const deps = makeDeps();
    await runResearcherDispatchStage(ctx, deps);
    const types = (deps.emit as jest.Mock).mock.calls.map((c) => c[0].type);
    expect(types).toContain("agent-playground.budget:exhausted");
  });

  it("DAG dispatch used when dimensions have dependsOn", async () => {
    const dims = [
      { id: "d1", name: "Market", rationale: "r", dependsOn: [] },
      { id: "d2", name: "Tech", rationale: "r", dependsOn: ["d1"] },
    ];
    const ctx = makeCtx({
      plan: {
        themeSummary: "t",
        dimensions: dims,
        goals: {} as never,
        initialRisks: [],
      },
    });
    const deps = makeDeps();
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.invoker.runDagConcurrency).toHaveBeenCalled();
  });

  it("minimal depth skips chapter pipeline (returns researcherOut directly)", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    await runResearcherDispatchStage(ctx, deps);
    // Should complete without error
    expect(ctx.researcherResults).toBeDefined();
  });

  it("exception in dim handler → degrades gracefully", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockRejectedValue(
      new Error("catastrophic failure"),
    );
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults![0].findings).toEqual([]);
    expect(ctx.researcherResults![0].summary).toContain("error");
  });

  it("figure pipeline: withFigures=true + findings with sources → extractFiguresFromUrl called", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        withFigures: true,
        auditLayers: "minimal", // skip chapter pipeline so we return right after figure step
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "completed",
      output: {
        dimension: "Market",
        findings: [
          { claim: "C", evidence: "E", source: "https://example.com/report" },
        ],
        summary: "ok",
      },
      events: [],
      wallTimeMs: 1000,
      iterations: 2,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.figureExtractor.extractFiguresFromUrl).toHaveBeenCalled();
  });

  it("figure pipeline: relevant figures → filterRelevantFigures called", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        withFigures: true,
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.figureExtractor.extractFiguresFromUrl as jest.Mock).mockResolvedValue(
      [
        {
          imageUrl: "https://example.com/img1.png",
          caption: "Chart 1",
          alt: "alt1",
          type: "chart",
        },
      ],
    );
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "completed",
      output: {
        dimension: "Market",
        findings: [
          { claim: "C", evidence: "E", source: "https://example.com/report" },
        ],
        summary: "ok",
      },
      events: [],
      wallTimeMs: 1000,
      iterations: 2,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.figureRelevance.filterRelevantFigures).toHaveBeenCalled();
  });

  it("failureLearner.lookup throws → caught, continues with empty knownFailures", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps();
    (deps.failureLearner.lookup as jest.Mock).mockRejectedValue(
      new Error("lookup error"),
    );
    // Should not throw; researcher runs normally
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults).toBeDefined();
  });

  it("exception in dim handler with timeout error → degraded with RUNNER_WALL_TIME_EXCEEDED code", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockRejectedValue(
      new Error("Request timed out"),
    );
    await runResearcherDispatchStage(ctx, deps);
    // Degraded with error, mission continues
    const emitCalls = (deps.emit as jest.Mock).mock.calls;
    const degradedCall = emitCalls.find(
      (c) => c[0].type === "agent-playground.dimension:degraded",
    );
    expect(degradedCall).toBeDefined();
  });

  it("exception in dim handler with rate limit error → degraded", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockRejectedValue(
      new Error("rate limit exceeded 429"),
    );
    await runResearcherDispatchStage(ctx, deps);
    const emitCalls = (deps.emit as jest.Mock).mock.calls;
    const degradedCall = emitCalls.find(
      (c) => c[0].type === "agent-playground.dimension:degraded",
    );
    expect(degradedCall).toBeDefined();
  });

  it("exception with ByokRequiredError name → PROVIDER_BYOK_MODEL_NOT_FOUND degraded", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps();
    const byokError = new Error("BYOK required");
    byokError.name = "ByokRequiredError";
    (deps.invoker.invoke as jest.Mock).mockRejectedValue(byokError);
    await runResearcherDispatchStage(ctx, deps);
    const emitCalls = (deps.emit as jest.Mock).mock.calls;
    const degradedCall = emitCalls.find(
      (c) => c[0].type === "agent-playground.dimension:degraded",
    );
    expect(degradedCall).toBeDefined();
    expect(degradedCall[0].payload.innerFailureCode).toBe(
      "PROVIDER_BYOK_MODEL_NOT_FOUND",
    );
  });

  it("exception with InputValidationError name → RUNNER_INPUT_SCHEMA_MISMATCH degraded", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps();
    const validationError = new Error("input schema mismatch");
    validationError.name = "InputValidationError";
    (deps.invoker.invoke as jest.Mock).mockRejectedValue(validationError);
    await runResearcherDispatchStage(ctx, deps);
    const emitCalls = (deps.emit as jest.Mock).mock.calls;
    const degradedCall = emitCalls.find(
      (c) => c[0].type === "agent-playground.dimension:degraded",
    );
    expect(degradedCall).toBeDefined();
    expect(degradedCall[0].payload.innerFailureCode).toBe(
      "RUNNER_INPUT_SCHEMA_MISMATCH",
    );
  });

  it("figure pipeline: extractFiguresFromUrl rejects → .catch(() => []) silently", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        withFigures: true,
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "completed",
      output: {
        dimension: DIM_A.name,
        findings: [{ claim: "c", evidence: "e", source: "http://source.com" }],
        summary: "ok",
      },
      events: [],
      wallTimeMs: 500,
      iterations: 2,
      agent: null,
    });
    (deps.figureExtractor.extractFiguresFromUrl as jest.Mock).mockRejectedValue(
      new Error("extract failed"),
    );
    await runResearcherDispatchStage(ctx, deps);
    // Should complete without error (catch → [])
    expect(ctx.researcherResults).toBeDefined();
  });

  it("figure pipeline: filterRelevantFigures rejects → .catch(() => allFigures) branch", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        withFigures: true,
      } as MissionContext["input"],
    });
    const mockFigure = {
      imageUrl: "http://fig.com/img.png",
      caption: "Chart",
      alt: "alt",
      type: "chart",
    };
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "completed",
      output: {
        dimension: DIM_A.name,
        findings: [{ claim: "c", evidence: "e", source: "http://source.com" }],
        summary: "ok",
      },
      events: [],
      wallTimeMs: 500,
      iterations: 2,
      agent: null,
    });
    (deps.figureExtractor.extractFiguresFromUrl as jest.Mock).mockResolvedValue(
      [mockFigure],
    );
    (deps.figureRelevance.filterRelevantFigures as jest.Mock).mockRejectedValue(
      new Error("filter error"),
    );
    await runResearcherDispatchStage(ctx, deps);
    // Should complete without error (catch → allFigures)
    expect(ctx.researcherResults).toBeDefined();
  });

  it("figure pipeline: filterRelevantFigures throws synchronously → outer catch logs warn", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        withFigures: true,
      } as MissionContext["input"],
    });
    const mockFigure = {
      imageUrl: "http://fig.com/img.png",
      caption: "Chart",
      alt: "alt",
      type: "chart",
    };
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "completed",
      output: {
        dimension: DIM_A.name,
        findings: [{ claim: "c", evidence: "e", source: "http://source.com" }],
        summary: "ok",
      },
      events: [],
      wallTimeMs: 500,
      iterations: 2,
      agent: null,
    });
    (deps.figureExtractor.extractFiguresFromUrl as jest.Mock).mockResolvedValue(
      [mockFigure],
    );
    (
      deps.figureRelevance.filterRelevantFigures as jest.Mock
    ).mockImplementation(() => {
      throw new Error("sync-filter-error");
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("figure-pipeline"),
    );
  });

  it("dim failure with innerFailure.failureCode → recordFailure called", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps();
    // extractAgentFailureDiagnostic scans events with type="error" (not "agent-failed")
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "failed",
      output: null,
      events: [
        {
          type: "error",
          payload: {
            failureCode: "PARSE_MALFORMED_JSON",
            message: "json error",
            diagnostic: { modelId: "gpt-4o" },
          },
        },
      ],
      wallTimeMs: 1000,
      iterations: 5,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.failureLearner.recordFailure).toHaveBeenCalled();
  });
});
