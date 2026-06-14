import { runResearcherDispatchStage } from "../s3-researcher-collect-findings.stage";
import type { MissionContext } from "../../../context/mission-context";
import type { MissionDeps } from "../../../context/mission-deps";

// ★ 2026-05-13: stage's min-findings retry threshold now comes from
// PlaygroundRuntimeConfig; isolate test env so the documented production
// default (5) holds regardless of host .env profile overrides.
const PLAYGROUND_ENV_KEYS = [
  "PLAYGROUND_TUNING_PROFILE",
  "MIN_FINDINGS_THRESHOLD",
] as const;
const savedEnv: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of PLAYGROUND_ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  // Force documented production threshold for assertions hardcoded to "5".
  process.env.MIN_FINDINGS_THRESHOLD = "5";
});
afterAll(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

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

function makeOutlineOutput(chapterCount = 2) {
  return {
    chapters: Array.from({ length: chapterCount }, (_, i) => ({
      index: i + 1,
      heading: `Chapter ${i + 1}`,
      thesis: `Thesis ${i + 1}`,
      keyPoints: [`Point ${i + 1}`],
      sourceIndices: [0],
    })),
  };
}

function makeWriterOutput(wordCount = 1000) {
  return {
    body: `This is a chapter body with ${wordCount} words `.repeat(10),
    wordCount,
    citationsUsed: ["[1]"],
  };
}

function makeReviewerOutput() {
  return {
    decision: "pass" as const,
    score: 85,
    summary: "Looks good",
    issues: [],
    critique: "Well done",
  };
}

function makeGradeOutput() {
  return {
    overall: 82,
    grade: "B",
    axes: {},
    summary: "Strong dimension",
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
    abortRegistry: {
      abort: jest.fn(),
      isAborted: jest.fn().mockReturnValue(false),
    },
    invoker: {
      invoke: jest.fn().mockImplementation(
        (
          _: unknown,
          input: {
            dimension?: string;
            chapter?: { body?: string; thesis?: string };
            chapters?: unknown[];
            sources?: unknown[];
          },
        ) => {
          if (input?.chapters) {
            return Promise.resolve({
              state: "completed",
              output: {
                abstract: "This dimension explores AI trends",
                keyFindings: ["AI is transformative"],
                fullMarkdown: "# Technology\n\nContent here",
                totalWordCount: 2000,
              },
              events: [],
              wallTimeMs: 100,
              iterations: 1,
              agent: null,
            });
          }
          if (input?.chapter?.body) {
            return Promise.resolve({
              state: "completed",
              output: makeReviewerOutput(),
              events: [],
              wallTimeMs: 100,
              iterations: 1,
              agent: null,
            });
          }
          if (input?.chapter?.thesis || input?.sources) {
            return Promise.resolve({
              state: "completed",
              output: makeWriterOutput(),
              events: [],
              wallTimeMs: 100,
              iterations: 1,
              agent: null,
            });
          }
          return Promise.resolve(
            okResearcherResult(input?.dimension ?? "unknown"),
          );
        },
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
    writer: {
      planDimensionOutline: jest.fn().mockResolvedValue({
        state: "completed",
        output: makeOutlineOutput(2),
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
    } as unknown as MissionDeps["writer"],
    reviewer: {
      judgeDimension: jest.fn().mockResolvedValue({
        state: "completed",
        output: makeGradeOutput(),
        events: [],
        iterations: 1,
        wallTimeMs: 100,
      }),
    } as unknown as MissionDeps["reviewer"],
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

  // ★ 2026-05-06 单轨化: stage:started/completed 由 orchestrator stage:lifecycle 必发；
  //   stage 文件不再 emit。spec 改为验证 dimension:research:started/completed 业务事件。
  it("emits dimension:research:started for each dim", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runResearcherDispatchStage(ctx, deps);
    const dimStarts = (deps.emit as jest.Mock).mock.calls.filter(
      (c) => c[0].type === "playground.dimension:research:started",
    );
    expect(dimStarts.length).toBeGreaterThan(0);
  });

  it("populates ctx.researcherResults after dispatch", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults).toBeDefined();
    expect(ctx.researcherResults!.length).toBeGreaterThan(0);
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
          payload: { failureCode: "LOOP_MAX_ITERATIONS", message: "loop" },
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
    // P0-2: LOOP_MAX_ITERATIONS 现已在 RECOVERABLE_FAILURES 中 → 自愈重试真正触发
    expect(invokeCalls).toBeGreaterThanOrEqual(2);
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
    expect(types).toContain("playground.budget:exhausted");
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

  it("P0-1 salvage: degraded run with valid findings is NOT discarded", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "degraded",
      output: {
        dimension: "Tech",
        findings: [
          { claim: "C1", evidence: "E1", source: "http://a.com" },
          { claim: "C2", evidence: "E2", source: "http://b.com" },
        ],
        summary: "S",
      },
      events: [],
      wallTimeMs: 1000,
      iterations: 3,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults![0].findings).toHaveLength(2);
  });

  it("P0-1 salvage: valid findings recovered from partialOutput when output is null (max-iter)", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "failed",
      output: null,
      partialOutput: {
        dimension: "Tech",
        findings: [{ claim: "C1", evidence: "E1", source: "http://a.com" }],
        summary: "partial",
      },
      events: [],
      wallTimeMs: 1000,
      iterations: 5,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults![0].findings).toHaveLength(1);
  });

  it("P0-1 salvage: garbage partialOutput (no well-formed findings) still degrades to empty (no 2026-04-30 regression)", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "failed",
      output: null,
      partialOutput: { action: "parallel_tool_call", args: { q: "x" } },
      events: [],
      wallTimeMs: 1000,
      iterations: 5,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults![0].findings).toEqual([]);
  });

  it("#1a salvage: findings with empty/blank evidence are rejected → degrade", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "degraded",
      output: {
        dimension: "Tech",
        // claim+source non-empty but evidence is blank → must NOT be salvaged
        findings: [{ claim: "C1", evidence: "   ", source: "http://a.com" }],
        summary: "S",
      },
      events: [],
      wallTimeMs: 1000,
      iterations: 3,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults![0].findings).toEqual([]);
  });

  // ─── #1b figureCandidates zod gate ────────────────────────────────────────
  //
  // review-fix #1b (2026-05-23): salvaged figureCandidates must pass the same
  // filter as zod-validated ones:
  //   - sourceUrl must match /^https?:\/\//i
  //   - caption must be a non-blank string
  // Invalid entries are silently dropped; valid entries survive.

  it("#1b figureCandidates gate: non-http sourceUrl is filtered out, valid entry survives", async () => {
    // Arrange: depth=quick + auditLayers=minimal → skip chapter pipeline,
    // return researcher output directly so we can inspect figureCandidates on ctx.
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "degraded",
      output: {
        dimension: DIM_A.name,
        findings: [{ claim: "C1", evidence: "E1", source: "http://a.com" }],
        summary: "S",
        figureCandidates: [
          // invalid: sourceUrl does not start with http(s)
          {
            sourceUrl: "ftp://bad-protocol.com/img.png",
            caption: "valid caption",
          },
          // valid: https + non-blank caption
          {
            sourceUrl: "https://example.com/figure.png",
            caption: "Real caption",
          },
        ],
      },
      events: [],
      wallTimeMs: 1000,
      iterations: 3,
      agent: null,
    });

    // Act
    await runResearcherDispatchStage(ctx, deps);

    // Assert
    const result = ctx.researcherResults![0];
    expect(result).toBeDefined();
    // Only the https:// entry should survive
    expect(result.figureCandidates).toHaveLength(1);
    expect(result.figureCandidates![0].sourceUrl).toBe(
      "https://example.com/figure.png",
    );
  });

  it("#1b figureCandidates gate: blank caption is filtered out, non-blank caption survives", async () => {
    // Arrange
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "degraded",
      output: {
        dimension: DIM_A.name,
        findings: [{ claim: "C1", evidence: "E1", source: "http://a.com" }],
        summary: "S",
        figureCandidates: [
          // invalid: caption is blank (whitespace only)
          { sourceUrl: "https://example.com/img1.png", caption: "   " },
          // valid
          {
            sourceUrl: "https://example.com/img2.png",
            caption: "Non-blank caption",
          },
        ],
      },
      events: [],
      wallTimeMs: 1000,
      iterations: 3,
      agent: null,
    });

    // Act
    await runResearcherDispatchStage(ctx, deps);

    // Assert
    const result = ctx.researcherResults![0];
    expect(result.figureCandidates).toHaveLength(1);
    expect(result.figureCandidates![0].sourceUrl).toBe(
      "https://example.com/img2.png",
    );
    expect(result.figureCandidates![0].caption).toBe("Non-blank caption");
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
      (c) => c[0].type === "playground.dimension:degraded",
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
      (c) => c[0].type === "playground.dimension:degraded",
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
      (c) => c[0].type === "playground.dimension:degraded",
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
      (c) => c[0].type === "playground.dimension:degraded",
    );
    expect(degradedCall).toBeDefined();
    expect(degradedCall[0].payload.innerFailureCode).toBe(
      "RUNNER_INPUT_SCHEMA_MISMATCH",
    );
  });

  it("figure pipeline: extractFiguresFromUrl rejects → debug-log + return [] (non-fatal)", async () => {
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

  // ─── per-dim lifecycle events（dimension:research:started / completed）─────

  it("single dim → emit chain contains dimension:research:started before researcher:completed", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps();
    await runResearcherDispatchStage(ctx, deps);
    const emitCalls = (deps.emit as jest.Mock).mock.calls.map(
      (c: [{ type: string; payload?: Record<string, unknown> }]) => c[0],
    );
    const startedIdx = emitCalls.findIndex(
      (e) =>
        e.type === "playground.dimension:research:started" &&
        e.payload?.dimension === DIM_A.name,
    );
    const completedIdx = emitCalls.findIndex(
      (e) =>
        e.type === "playground.dimension:research:completed" &&
        e.payload?.dimension === DIM_A.name,
    );
    const researcherIdx = emitCalls.findIndex(
      (e) =>
        e.type === "playground.researcher:completed" &&
        e.payload?.dimension === DIM_A.name,
    );
    expect(startedIdx).toBeGreaterThanOrEqual(0);
    expect(completedIdx).toBeGreaterThanOrEqual(0);
    // started must come before completed
    expect(startedIdx).toBeLessThan(completedIdx);
    // dimension:research:completed must come before researcher:completed
    expect(completedIdx).toBeLessThanOrEqual(researcherIdx);
  });

  it("single dim → dimension:research:started payload contains dimension, dimensionId, dimensionIdx", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps();
    await runResearcherDispatchStage(ctx, deps);
    const startedCall = (deps.emit as jest.Mock).mock.calls.find(
      (c: [{ type: string; payload?: Record<string, unknown> }]) =>
        c[0].type === "playground.dimension:research:started",
    );
    expect(startedCall).toBeDefined();
    expect(startedCall[0].payload.dimension).toBe(DIM_A.name);
    expect(startedCall[0].payload.dimensionId).toBe(DIM_A.id);
    expect(startedCall[0].payload.dimensionIdx).toBe(0);
  });

  it("single dim → dimension:research:completed payload.dimension matches dim.name", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps();
    await runResearcherDispatchStage(ctx, deps);
    const completedCall = (deps.emit as jest.Mock).mock.calls.find(
      (c: [{ type: string; payload?: Record<string, unknown> }]) =>
        c[0].type === "playground.dimension:research:completed",
    );
    expect(completedCall).toBeDefined();
    expect(completedCall[0].payload.dimension).toBe(DIM_A.name);
    expect(completedCall[0].payload.state).toBe("completed");
    expect(typeof completedCall[0].payload.findingsCount).toBe("number");
  });

  it("3 dims concurrent → emits 3 dimension:research:started + 3 dimension:research:completed with correct dimension names", async () => {
    const dims = [
      { id: "d1", name: "Alpha", rationale: "r1" },
      { id: "d2", name: "Beta", rationale: "r2" },
      { id: "d3", name: "Gamma", rationale: "r3" },
    ];
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: dims },
      input: { ...makeCtx().input, concurrency: 3 } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockImplementation(
      (_: unknown, input: { dimension?: string }) =>
        Promise.resolve(okResearcherResult(input?.dimension ?? "x")),
    );
    await runResearcherDispatchStage(ctx, deps);
    const emitCalls = (deps.emit as jest.Mock).mock.calls.map(
      (c: [{ type: string; payload?: Record<string, unknown> }]) => c[0],
    );
    const startedEvents = emitCalls.filter(
      (e) => e.type === "playground.dimension:research:started",
    );
    const completedEvents = emitCalls.filter(
      (e) => e.type === "playground.dimension:research:completed",
    );
    expect(startedEvents).toHaveLength(3);
    expect(completedEvents).toHaveLength(3);
    const startedDims = startedEvents.map(
      (e) => e.payload?.dimension as string,
    );
    const completedDims = completedEvents.map(
      (e) => e.payload?.dimension as string,
    );
    expect(startedDims).toContain("Alpha");
    expect(startedDims).toContain("Beta");
    expect(startedDims).toContain("Gamma");
    expect(completedDims).toContain("Alpha");
    expect(completedDims).toContain("Beta");
    expect(completedDims).toContain("Gamma");
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

  // ─── 杠杆 1: 并发行为测试 ─────────────────────────────────────────────────

  it("concurrency=1 (serial compat): all dims complete in order", async () => {
    const dims = [
      { id: "d1", name: "Market", rationale: "r1" },
      { id: "d2", name: "Tech", rationale: "r2" },
      { id: "d3", name: "Policy", rationale: "r3" },
    ];
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: dims },
      input: { ...makeCtx().input, concurrency: 1 } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockImplementation(
      (
        _: unknown,
        input: {
          dimension?: string;
          chapter?: { body?: string; thesis?: string };
          chapters?: unknown[];
          sources?: unknown[];
        },
      ) => {
        if (input?.chapters) {
          return Promise.resolve({
            state: "completed",
            output: {
              abstract: "This dimension explores AI trends",
              keyFindings: ["AI is transformative"],
              fullMarkdown: "# Technology\n\nContent here",
              totalWordCount: 2000,
            },
            events: [],
            wallTimeMs: 100,
            iterations: 1,
            agent: null,
          });
        }
        if (input?.chapter?.body) {
          return Promise.resolve({
            state: "completed",
            output: makeReviewerOutput(),
            events: [],
            wallTimeMs: 100,
            iterations: 1,
            agent: null,
          });
        }
        if (input?.chapter?.thesis || input?.sources) {
          return Promise.resolve({
            state: "completed",
            output: makeWriterOutput(),
            events: [],
            wallTimeMs: 100,
            iterations: 1,
            agent: null,
          });
        }
        return Promise.resolve(okResearcherResult(input?.dimension ?? "x"));
      },
    );
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults).toHaveLength(3);
    expect(ctx.researcherResults!.every((r) => r.findings.length > 0)).toBe(
      true,
    );
  });

  it("concurrency=3 (parallel): all 3 dims complete regardless of dispatch order", async () => {
    const dims = [
      { id: "d1", name: "A", rationale: "r" },
      { id: "d2", name: "B", rationale: "r" },
      { id: "d3", name: "C", rationale: "r" },
    ];
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: dims },
      input: { ...makeCtx().input, concurrency: 3 } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockImplementation(
      (
        _: unknown,
        input: {
          dimension?: string;
          chapter?: { body?: string; thesis?: string };
          chapters?: unknown[];
          sources?: unknown[];
        },
      ) => {
        if (input?.chapters) {
          return Promise.resolve({
            state: "completed",
            output: {
              abstract: "This dimension explores AI trends",
              keyFindings: ["AI is transformative"],
              fullMarkdown: "# Technology\n\nContent here",
              totalWordCount: 2000,
            },
            events: [],
            wallTimeMs: 100,
            iterations: 1,
            agent: null,
          });
        }
        if (input?.chapter?.body) {
          return Promise.resolve({
            state: "completed",
            output: makeReviewerOutput(),
            events: [],
            wallTimeMs: 100,
            iterations: 1,
            agent: null,
          });
        }
        if (input?.chapter?.thesis || input?.sources) {
          return Promise.resolve({
            state: "completed",
            output: makeWriterOutput(),
            events: [],
            wallTimeMs: 100,
            iterations: 1,
            agent: null,
          });
        }
        return Promise.resolve(okResearcherResult(input?.dimension ?? "x"));
      },
    );
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults).toHaveLength(3);
    const names = ctx.researcherResults!.map((r) => r.dimension);
    expect(names).toContain("A");
    expect(names).toContain("B");
    expect(names).toContain("C");
  });

  it("single dim failure (concurrency=3): remaining dims complete, partial results returned", async () => {
    const dims = [
      { id: "d1", name: "Pass1", rationale: "r" },
      { id: "d2", name: "Fail", rationale: "r" },
      { id: "d3", name: "Pass2", rationale: "r" },
    ];
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: dims },
      input: { ...makeCtx().input, concurrency: 3 } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.invoker.invoke as jest.Mock).mockImplementation(
      (
        _: unknown,
        input: {
          dimension?: string;
          chapter?: { body?: string; thesis?: string };
          chapters?: unknown[];
          sources?: unknown[];
        },
      ) => {
        if (input?.chapters) {
          return Promise.resolve({
            state: "completed",
            output: {
              abstract: "This dimension explores AI trends",
              keyFindings: ["AI is transformative"],
              fullMarkdown: "# Technology\n\nContent here",
              totalWordCount: 2000,
            },
            events: [],
            wallTimeMs: 100,
            iterations: 1,
            agent: null,
          });
        }
        if (input?.chapter?.body) {
          return Promise.resolve({
            state: "completed",
            output: makeReviewerOutput(),
            events: [],
            wallTimeMs: 100,
            iterations: 1,
            agent: null,
          });
        }
        if (input?.chapter?.thesis || input?.sources) {
          return Promise.resolve({
            state: "completed",
            output: makeWriterOutput(),
            events: [],
            wallTimeMs: 100,
            iterations: 1,
            agent: null,
          });
        }
        if (input?.dimension === "Fail") {
          return Promise.resolve({
            state: "failed" as const,
            output: null,
            events: [],
            wallTimeMs: 100,
            iterations: 1,
            agent: null,
          });
        }
        return Promise.resolve(okResearcherResult(input?.dimension ?? "x"));
      },
    );
    await runResearcherDispatchStage(ctx, deps);
    // All 3 dims present: 2 with findings, 1 degraded to empty
    expect(ctx.researcherResults).toHaveLength(3);
    const passed = ctx.researcherResults!.filter(
      (r) => r.findings.length > 0,
    ).length;
    const degraded = ctx.researcherResults!.filter(
      (r) => r.findings.length === 0,
    ).length;
    expect(passed).toBe(2);
    expect(degraded).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 两阶段调度 (Phase A research-only + Phase B chapter-pipeline)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Two-phase scheduling — Phase A research-only + Phase B chapter-pipeline", () => {
    it("non-DAG path: all dim:research:started emit BEFORE any chapter:writing:started (proves Phase A 全并行 / chapter pipeline 不占 research 槽位)", async () => {
      const ctx = makeCtx({
        plan: {
          ...makeCtx().plan!,
          dimensions: [
            { ...DIM_A, name: "DimA" },
            { ...DIM_A, id: "dim-b", name: "DimB" },
            { ...DIM_A, id: "dim-c", name: "DimC" },
          ],
        },
      });
      const deps = makeDeps();
      await runResearcherDispatchStage(ctx, deps);
      const events = (deps.emit as jest.Mock).mock.calls.map((c) => c[0]);
      const researchStartedIdxs = events
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.type === "playground.dimension:research:started");
      const chapterWritingStartedIdxs = events
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.type === "playground.chapter:writing:started");
      // 至少 3 个 research:started
      expect(researchStartedIdxs.length).toBe(3);
      // 如果有 chapter:writing:started（per-dim-pipeline 跑了），所有 research:started
      // 必须早于第一个 chapter:writing:started — 这是两阶段调度的关键不变量
      if (chapterWritingStartedIdxs.length > 0) {
        const lastResearchStartIdx =
          researchStartedIdxs[researchStartedIdxs.length - 1].i;
        const firstChapterIdx = chapterWritingStartedIdxs[0].i;
        expect(lastResearchStartIdx).toBeLessThan(firstChapterIdx);
      }
    });

    it("Phase A 高并发 (researchConcurrency=6) + Phase B 中并发 (chapterPipelineConcurrency=3)", async () => {
      // 6 dims, concurrency=3 → researchConcurrency caps at min(6,6)=6, chapterPipelineConcurrency=3
      const ctx = makeCtx({
        input: { ...makeCtx().input, concurrency: 3, depth: "deep" } as never,
        plan: {
          ...makeCtx().plan!,
          dimensions: Array.from({ length: 6 }, (_, i) => ({
            ...DIM_A,
            id: `dim-${i}`,
            name: `Dim${i}`,
          })),
        },
      });
      const deps = makeDeps();
      await runResearcherDispatchStage(ctx, deps);
      // 6 dims 全 dispatch（不会因为 concurrency=3 漏 dispatch）
      expect(ctx.researcherResults).toHaveLength(6);
      const startedEvents = (deps.emit as jest.Mock).mock.calls
        .map((c) => c[0])
        .filter((e) => e.type === "playground.dimension:research:started");
      expect(startedEvents).toHaveLength(6);
    });

    it("skipChapterPipeline (minimal/quick) → Phase B 跳过，只跑 Phase A", async () => {
      const ctx = makeCtx({
        input: {
          ...makeCtx().input,
          depth: "quick",
        } as never,
        plan: {
          ...makeCtx().plan!,
          dimensions: [DIM_A, { ...DIM_A, id: "dim-b", name: "DimB" }],
        },
      });
      const deps = makeDeps();
      await runResearcherDispatchStage(ctx, deps);
      const types = (deps.emit as jest.Mock).mock.calls.map((c) => c[0].type);
      expect(types).toContain("playground.dimension:research:started");
      // skip 模式下 chapter:writing:started 不应出现
      expect(types).not.toContain("playground.chapter:writing:started");
      // 但所有 dim 仍有 results
      expect(ctx.researcherResults).toHaveLength(2);
    });

    it("Phase A research 失败 → Phase B 透传时手动 emit graded(failed,research-failed) 保持 INVARIANT", async () => {
      const ctx = makeCtx({
        plan: {
          ...makeCtx().plan!,
          dimensions: [DIM_A, { ...DIM_A, id: "dim-b", name: "DimB" }],
        },
      });
      const deps = makeDeps();
      let cnt = 0;
      (deps.invoker.invoke as jest.Mock).mockImplementation(() => {
        cnt++;
        if (cnt === 1) {
          return Promise.resolve({
            state: "failed",
            output: null,
            events: [],
            wallTimeMs: 1000,
            iterations: 1,
            agent: null,
          });
        }
        return Promise.resolve(okResearcherResult("DimB"));
      });
      await runResearcherDispatchStage(ctx, deps);
      // 关键不变量：research 失败的 dim 也必须 emit dimension:graded（即使 skipped）
      const gradedEvents = (deps.emit as jest.Mock).mock.calls
        .map((c) => c[0])
        .filter((e) => e.type === "playground.dimension:graded");
      const failedGraded = gradedEvents.find(
        (e) =>
          e.payload?.failed === true && e.payload?.phase === "research-failed",
      );
      expect(failedGraded).toBeDefined();
      expect(failedGraded.payload.summary).toMatch(/research 阶段降级/);
    });

    it("Phase A research 失败的 dim 跳过 Phase B (findings.length===0 → 透传)", async () => {
      const ctx = makeCtx({
        plan: {
          ...makeCtx().plan!,
          dimensions: [DIM_A, { ...DIM_A, id: "dim-b", name: "DimB" }],
        },
      });
      const deps = makeDeps();
      let cnt = 0;
      (deps.invoker.invoke as jest.Mock).mockImplementation(() => {
        cnt++;
        if (cnt === 1) {
          // 第一个 dim research 失败 → findings=[]
          return Promise.resolve({
            state: "failed",
            output: null,
            events: [],
            wallTimeMs: 1000,
            iterations: 1,
            agent: null,
          });
        }
        return Promise.resolve(okResearcherResult("DimB"));
      });
      await runResearcherDispatchStage(ctx, deps);
      // 失败 dim 进入 Phase B 时直接透传，不会调 per-dim-pipeline
      const degraded = ctx.researcherResults!.filter(
        (r) => r.findings.length === 0,
      );
      expect(degraded.length).toBeGreaterThanOrEqual(1);
    });

    it("DAG 路径（hasDependencies）保持单段 runOneDim（不切两阶段）", async () => {
      const ctx = makeCtx({
        plan: {
          ...makeCtx().plan!,
          dimensions: [
            { ...DIM_A, name: "DimA", dependsOn: [] } as never,
            {
              ...DIM_A,
              id: "dim-b",
              name: "DimB",
              dependsOn: ["dim-a"],
            } as never,
          ],
        },
      });
      const deps = makeDeps();
      await runResearcherDispatchStage(ctx, deps);
      // DAG 路径下 runDagConcurrency 应被调用
      expect(
        (deps.invoker.runDagConcurrency as jest.Mock).mock.calls.length,
      ).toBe(1);
    });
  });

  // ── C-alignment regression specs (2026-05-06) ────────────────────────────

  // ── fireDimCheckpoint: lines 172-175 ──────────────────────────────────────

  it("checkpointDimension provided + rejects → swallowed (line 174-175)", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps({
      checkpointDimension: jest
        .fn()
        .mockRejectedValue(new Error("checkpoint fail")),
    } as unknown as Partial<MissionDeps>);
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults).toBeDefined();
  });

  it("checkpointDimension provided + succeeds → called", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps({
      checkpointDimension: jest.fn().mockResolvedValue(undefined),
    } as unknown as Partial<MissionDeps>);
    await runResearcherDispatchStage(ctx, deps);
    expect(
      (deps as unknown as Record<string, jest.Mock>).checkpointDimension,
    ).toHaveBeenCalled();
  });

  // ── focusDimension path: lines 185-236 ────────────────────────────────────

  it("focusDimension + matches dim by name → only re-runs that dim, merges with prior results", async () => {
    const prior = [
      {
        dimension: "Market",
        findings: [{ claim: "old", evidence: "e", source: "http://old.com" }],
        summary: "old",
      },
      {
        dimension: "Tech",
        findings: [
          { claim: "tech", evidence: "et", source: "http://tech.com" },
        ],
        summary: "tech",
      },
    ];
    const ctx = makeCtx({
      focusDimension: "Market",
      researcherResults: prior,
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const mockStore = {
      saveResearchResult: jest.fn().mockResolvedValue(undefined),
      markIntermediateState: jest.fn().mockResolvedValue(undefined),
    };
    const deps = makeDeps({
      store: mockStore,
    } as unknown as Partial<MissionDeps>);
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "completed",
      output: {
        dimension: "Market",
        findings: [
          { claim: "fresh", evidence: "ef", source: "http://fresh.com" },
        ],
        summary: "fresh",
      },
      events: [],
      wallTimeMs: 500,
      iterations: 2,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults).toHaveLength(2);
    const market = ctx.researcherResults!.find((r) => r.dimension === "Market");
    expect(market?.summary).toBe("fresh");
    expect(mockStore.saveResearchResult).toHaveBeenCalled();
  });

  it("focusDimension + matches by id → re-runs that dim", async () => {
    const prior = [
      {
        dimension: "Market",
        findings: [{ claim: "c", evidence: "e", source: "http://a.com" }],
        summary: "old",
      },
    ];
    const ctx = makeCtx({
      focusDimension: "d1",
      researcherResults: prior,
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const mockStore = {
      saveResearchResult: jest.fn().mockResolvedValue(undefined),
      markIntermediateState: jest.fn().mockResolvedValue(undefined),
    };
    const deps = makeDeps({
      store: mockStore,
    } as unknown as Partial<MissionDeps>);
    await runResearcherDispatchStage(ctx, deps);
    expect(mockStore.saveResearchResult).toHaveBeenCalled();
  });

  it("focusDimension + dim NOT in plan → full dispatch", async () => {
    const ctx = makeCtx({
      focusDimension: "NonExistent",
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults).toHaveLength(2);
  });

  it("focusDimension + saveResearchResult rejects → swallowed, warns", async () => {
    const prior = [
      {
        dimension: "Market",
        findings: [{ claim: "c", evidence: "e", source: "http://a.com" }],
        summary: "old",
      },
    ];
    const ctx = makeCtx({
      focusDimension: "Market",
      researcherResults: prior,
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const mockStore = {
      saveResearchResult: jest.fn().mockRejectedValue(new Error("db error")),
      markIntermediateState: jest.fn().mockResolvedValue(undefined),
    };
    const deps = makeDeps({
      store: mockStore,
    } as unknown as Partial<MissionDeps>);
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("single-dim rerun saveResearchResult"),
    );
  });

  it("focusDimension + fresh dim NOT in prior → appended to results", async () => {
    const prior = [
      {
        dimension: "Tech",
        findings: [{ claim: "c", evidence: "e", source: "http://a.com" }],
        summary: "tech",
      },
    ];
    const ctx = makeCtx({
      focusDimension: "Market",
      researcherResults: prior,
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const mockStore = {
      saveResearchResult: jest.fn().mockResolvedValue(undefined),
      markIntermediateState: jest.fn().mockResolvedValue(undefined),
    };
    const deps = makeDeps({
      store: mockStore,
    } as unknown as Partial<MissionDeps>);
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "completed",
      output: {
        dimension: "Market",
        findings: [
          { claim: "fresh", evidence: "ef", source: "http://fresh.com" },
        ],
        summary: "fresh",
      },
      events: [],
      wallTimeMs: 500,
      iterations: 2,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults).toHaveLength(2);
    expect(ctx.researcherResults!.some((r) => r.dimension === "Market")).toBe(
      true,
    );
    expect(ctx.researcherResults!.some((r) => r.dimension === "Tech")).toBe(
      true,
    );
  });

  // ── Phase B rejection path: lines 289-295 ─────────────────────────────────
  // runChapterPhase can reject if deps.emit throws synchronously before .catch is applied.

  it("Phase B: runChapterPhase propagates error (emit sync-throw on graded) → allSettled catches, fallback to Phase A result + warn (lines 289-295)", async () => {
    // runChapterPhase is called by Phase B when researchResult.findings.length === 0
    // (for a degraded research dim). The graded emit at the top of runChapterPhase
    // is NOT inside a try-catch (only the runPerDimPipeline call is). If deps.emit
    // throws synchronously (not returning a Promise), TypeError propagates up through
    // runChapterPhase and is caught by Promise.allSettled.
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A, DIM_B] },
      input: {
        ...makeCtx().input,
        depth: "deep",
        auditLayers: "standard",
      } as MissionContext["input"],
    });
    let researchCallCount = 0;
    const deps = makeDeps({
      // Make emit throw synchronously (not return a promise) for graded events,
      // causing runChapterPhase to throw when the research-failed dim reaches it.
      emit: jest
        .fn()
        .mockImplementation(
          (event: { type: string; payload?: { phase?: string } }) => {
            if (
              event.type === "playground.dimension:graded" &&
              event.payload?.phase === "research-failed"
            ) {
              // Synchronous throw — NOT a rejected promise; .catch won't catch this
              throw new Error("sync graded throw");
            }
            return Promise.resolve();
          },
        ),
      invoker: {
        ...makeDeps().invoker,
        invoke: jest
          .fn()
          .mockImplementation((_: unknown, input: { dimension?: string }) => {
            researchCallCount++;
            // First dim fails so Phase B gets findings=[] → graded emit → sync throw
            if (researchCallCount === 1) {
              return Promise.resolve({
                state: "failed",
                output: null,
                events: [],
                wallTimeMs: 500,
                iterations: 1,
                agent: null,
              });
            }
            return Promise.resolve(okResearcherResult(input?.dimension ?? "x"));
          }),
      } as unknown as MissionDeps["invoker"],
    });
    await runResearcherDispatchStage(ctx, deps);
    // allSettled catches the rejection; both dims should have results (fallback to Phase A)
    expect(ctx.researcherResults).toHaveLength(2);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("rejected"),
    );
  });

  // ── pool exhaustion emit failure: line 322 ─────────────────────────────────

  it("pool exhausted + emit budget:exhausted rejects → error logged (line 322)", async () => {
    const ctx = makeCtx();
    (ctx.pool.isExhausted as jest.Mock).mockReturnValue(true);
    const deps = makeDeps({
      emit: jest.fn().mockImplementation((event: { type: string }) => {
        if (event.type === "playground.budget:exhausted") {
          return Promise.reject(new Error("emit exhaust fail"));
        }
        return Promise.resolve();
      }),
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.error as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("budget:exhausted emit failed"),
    );
  });

  // ── Phase B emit dimension:graded(research-failed) failure: line 387 ──────

  it("Phase B: research-failed dim → emit dimension:graded(research-failed) rejects → warns (line 387)", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "deep",
        auditLayers: "standard",
      } as MissionContext["input"],
    });
    const deps = makeDeps({
      emit: jest
        .fn()
        .mockImplementation(
          (event: { type: string; payload?: { phase?: string } }) => {
            if (
              event.type === "playground.dimension:graded" &&
              event.payload?.phase === "research-failed"
            ) {
              return Promise.reject(new Error("graded emit fail"));
            }
            return Promise.resolve();
          },
        ),
    });
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "failed",
      output: null,
      events: [],
      wallTimeMs: 500,
      iterations: 1,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("emit dimension:graded (research-failed)"),
    );
  });

  // ── Phase B runChapterPhase: emit dimension:degraded (chapter-pipeline-failed) failure: line 436 ──

  it("Phase B: runPerDimPipeline throws → emit dimension:degraded(chapter-pipeline-failed) rejects → warns (line 436)", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "deep",
        auditLayers: "standard",
      } as MissionContext["input"],
    });
    const deps = makeDeps({
      emit: jest
        .fn()
        .mockImplementation(
          (event: {
            type: string;
            payload?: { state?: string; failureCode?: string };
          }) => {
            if (
              event.type === "playground.dimension:degraded" &&
              event.payload?.state === "chapter-pipeline-failed"
            ) {
              return Promise.reject(new Error("degraded emit fail"));
            }
            return Promise.resolve();
          },
        ),
    });
    (deps.invoker.invoke as jest.Mock).mockImplementation(
      (
        _: unknown,
        input: {
          dimension?: string;
          chapters?: unknown[];
          chapter?: unknown;
          sources?: unknown;
        },
      ) => {
        if (!input?.chapters && !input?.chapter && !input?.sources) {
          return Promise.resolve(okResearcherResult(input?.dimension ?? "x"));
        }
        throw new Error("pipeline crash");
      },
    );
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("per-dim pipeline"),
    );
  });

  // ── emit failure-pattern:pre-applied failure: line 505 ───────────────────

  it("preDisabled > 0 + emit failure-pattern:pre-applied rejects → warns (line 505)", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps({
      emit: jest.fn().mockImplementation((event: { type: string }) => {
        if (event.type === "playground.failure-pattern:pre-applied") {
          return Promise.reject(new Error("pre-applied emit fail"));
        }
        return Promise.resolve();
      }),
    });
    (deps.failureLearner.lookup as jest.Mock).mockResolvedValue([
      {
        count: 3,
        lastFallbackModel: "gpt-4",
        modelId: "bad-model",
        failureCode: "PARSE_MALFORMED_JSON",
      },
    ]);
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("emit failure-pattern:pre-applied"),
    );
  });

  // ── emit dimension:research:started failure: line 529 ────────────────────

  it("emit dimension:research:started rejects → warns (line 529)", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps({
      emit: jest.fn().mockImplementation((event: { type: string }) => {
        if (event.type === "playground.dimension:research:started") {
          return Promise.reject(new Error("started emit fail"));
        }
        return Promise.resolve();
      }),
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("emit dimension:research:started"),
    );
  });

  // ── emit dimension:retrying (self-heal) failure: line 589 ────────────────

  it("L1 self-heal + emit dimension:retrying(self-heal) rejects → warns, retry still happens (line 589)", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    let invokeCalls = 0;
    const deps = makeDeps({
      emit: jest.fn().mockImplementation((event: { type: string }) => {
        if (event.type === "playground.dimension:retrying") {
          return Promise.reject(new Error("retrying emit fail"));
        }
        return Promise.resolve();
      }),
      invoker: {
        ...makeDeps().invoker,
        invoke: jest
          .fn()
          .mockImplementation((_: unknown, input: { dimension?: string }) => {
            invokeCalls++;
            if (invokeCalls === 1) {
              return Promise.resolve({
                state: "failed",
                output: null,
                events: [
                  {
                    type: "error",
                    payload: {
                      failureCode: "LOOP_MAX_ITERATIONS",
                      message: "loop",
                    },
                  },
                ],
                wallTimeMs: 1000,
                iterations: 20,
                agent: null,
              });
            }
            return Promise.resolve(
              okResearcherResult(input?.dimension ?? "Market"),
            );
          }),
      } as unknown as MissionDeps["invoker"],
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("emit dimension:retrying (self-heal)"),
    );
    expect(invokeCalls).toBeGreaterThanOrEqual(2);
  });

  // ── emit dimension:retrying (min-findings) failure: line 639 ─────────────

  it("min-findings retry + emit dimension:retrying(min-findings) rejects → warns, retry still happens (line 639)", async () => {
    let callCount = 0;
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps({
      emit: jest.fn().mockImplementation((event: { type: string }) => {
        if (event.type === "playground.dimension:retrying") {
          return Promise.reject(new Error("min-findings emit fail"));
        }
        return Promise.resolve();
      }),
      invoker: {
        ...makeDeps().invoker,
        invoke: jest
          .fn()
          .mockImplementation((_: unknown, input: { dimension?: string }) => {
            callCount++;
            return Promise.resolve({
              state: "completed",
              output: {
                dimension: input?.dimension ?? "Market",
                findings:
                  callCount === 1
                    ? [{ claim: "c1", evidence: "e1", source: "http://a.com" }]
                    : Array.from({ length: 6 }, (_, i) => ({
                        claim: `c${i}`,
                        evidence: `e${i}`,
                        source: `http://s${i}.com`,
                      })),
                summary: "ok",
                figureCandidates: [],
              },
              events: [],
              wallTimeMs: 500,
              iterations: 2,
              agent: null,
            });
          }),
      } as unknown as MissionDeps["invoker"],
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("emit dimension:retrying (min-findings)"),
    );
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  // ── recordSuccessfulFallback path: lines 654-680 ──────────────────────────

  it("completed + preDisabled + actualModelId matches fallback → recordSuccessfulFallback called (lines 654-680)", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.failureLearner.lookup as jest.Mock).mockResolvedValue([
      {
        count: 3,
        lastFallbackModel: "gpt-4",
        modelId: "bad-model",
        failureCode: "PARSE_MALFORMED_JSON",
      },
    ]);
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "completed",
      output: {
        dimension: "Market",
        findings: Array.from({ length: 5 }, (_, i) => ({
          claim: `c${i}`,
          evidence: `e${i}`,
          source: `http://s${i}.com`,
        })),
        summary: "ok",
        figureCandidates: [],
      },
      events: [{ type: "thinking", payload: { modelId: "gpt-4" } }],
      wallTimeMs: 500,
      iterations: 2,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.failureLearner.recordSuccessfulFallback).toHaveBeenCalled();
  });

  it("recordSuccessfulFallback rejects → swallowed, warns (line 679-680)", async () => {
    const ctx = makeCtx({
      plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
      input: {
        ...makeCtx().input,
        depth: "quick",
        auditLayers: "minimal",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    (deps.failureLearner.lookup as jest.Mock).mockResolvedValue([
      {
        count: 3,
        lastFallbackModel: "gpt-4",
        modelId: "bad-model",
        failureCode: "PARSE_MALFORMED_JSON",
      },
    ]);
    (
      deps.failureLearner.recordSuccessfulFallback as jest.Mock
    ).mockRejectedValue(new Error("fallback record fail"));
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "completed",
      output: {
        dimension: "Market",
        findings: Array.from({ length: 5 }, (_, i) => ({
          claim: `c${i}`,
          evidence: `e${i}`,
          source: `http://s${i}.com`,
        })),
        summary: "ok",
        figureCandidates: [],
      },
      events: [{ type: "thinking", payload: { modelId: "gpt-4" } }],
      wallTimeMs: 500,
      iterations: 2,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("recordSuccessfulFallback failed"),
    );
  });

  // ── emit dimension:research:completed failure: line 774 ──────────────────

  it("emit dimension:research:completed rejects → warns (line 774)", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps({
      emit: jest.fn().mockImplementation((event: { type: string }) => {
        if (event.type === "playground.dimension:research:completed") {
          return Promise.reject(new Error("research:completed emit fail"));
        }
        return Promise.resolve();
      }),
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("emit dimension:research:completed"),
    );
  });

  // ── emit researcher:completed failure: line 794 ───────────────────────────

  it("emit researcher:completed rejects → warns (line 794)", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps({
      emit: jest.fn().mockImplementation((event: { type: string }) => {
        if (event.type === "playground.researcher:completed") {
          return Promise.reject(new Error("researcher:completed emit fail"));
        }
        return Promise.resolve();
      }),
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("emit researcher:completed"),
    );
  });

  // ── emit dimension:degraded (ORCH_DIMENSION_DEGRADED) failure: line 834 ──

  it("dim degraded (cancelled state) + emit dimension:degraded(ORCH_DIMENSION_DEGRADED) rejects → warns (line 834)", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps({
      emit: jest
        .fn()
        .mockImplementation(
          (event: { type: string; payload?: { failureCode?: string } }) => {
            if (
              event.type === "playground.dimension:degraded" &&
              event.payload?.failureCode === "ORCH_DIMENSION_DEGRADED"
            ) {
              return Promise.reject(new Error("degraded ORCH emit fail"));
            }
            return Promise.resolve();
          },
        ),
    });
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "cancelled",
      output: null,
      events: [],
      wallTimeMs: 500,
      iterations: 1,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining(
        "emit dimension:degraded (ORCH_DIMENSION_DEGRADED)",
      ),
    );
  });

  // ── recordFailure failure: line 854 ──────────────────────────────────────

  it("dim degraded with innerFailureCode + recordFailure rejects → warns (line 854)", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps();
    (deps.failureLearner.recordFailure as jest.Mock).mockRejectedValue(
      new Error("record fail"),
    );
    (deps.invoker.invoke as jest.Mock).mockResolvedValue({
      state: "cancelled",
      output: null,
      events: [
        {
          type: "error",
          payload: {
            failureCode: "PARSE_MALFORMED_JSON",
            message: "bad",
            diagnostic: { modelId: "model-x" },
          },
        },
      ],
      wallTimeMs: 500,
      iterations: 1,
      agent: null,
    });
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("recordFailure for dim"),
    );
  });

  // ── runOneDim per-dim chapter pipeline failure: lines 993-1020 ───────────
  // These lines are in runOneDim's own chapter pipeline try-catch.
  // runOneDim is called directly (not via Phase A/B) in the DAG path (hasDependencies).
  // We use dependsOn to trigger hasDependencies → runDagConcurrency → runOneDim(skipChapterPipeline=false).

  it("runOneDim (DAG path): chapter pipeline throws → emit dimension:degraded(ORCH_CHAPTER_PIPELINE_FAILED) + summary (lines 993-1020)", async () => {
    // Use DAG path via hasDependencies=true; runDagConcurrency calls runOneDim directly
    const deps = makeDeps();
    // Real runDagConcurrency calls runOneDim directly, so override to call fn directly
    (deps.invoker.runDagConcurrency as jest.Mock).mockImplementation(
      (
        dims: (typeof DIM_A)[],
        _conc: number,
        fn: (d: typeof DIM_A, i: number) => Promise<unknown>,
      ) => Promise.all(dims.map((d, i) => fn(d, i))),
    );
    const ctx = makeCtx({
      plan: {
        ...makeCtx().plan!,
        dimensions: [
          { ...DIM_A, dependsOn: [] } as never,
          { ...DIM_B, dependsOn: [DIM_A.id] } as never,
        ],
      },
      input: {
        ...makeCtx().input,
        depth: "deep",
        auditLayers: "standard",
      } as MissionContext["input"],
    });
    (deps.invoker.invoke as jest.Mock).mockImplementation(
      (
        _: unknown,
        input: {
          dimension?: string;
          chapters?: unknown[];
          chapter?: unknown;
          sources?: unknown;
        },
      ) => {
        if (!input?.chapters && !input?.chapter && !input?.sources) {
          return Promise.resolve(okResearcherResult(input?.dimension ?? "x"));
        }
        throw new Error("chapter-pipeline-boom-dag");
      },
    );
    await runResearcherDispatchStage(ctx, deps);
    const emitCalls = (deps.emit as jest.Mock).mock.calls;
    const degraded = emitCalls.find(
      (c) =>
        c[0].type === "playground.dimension:degraded" &&
        c[0].payload?.failureCode === "ORCH_CHAPTER_PIPELINE_FAILED",
    );
    expect(degraded).toBeDefined();
    const result = ctx.researcherResults!.find(
      (r) => r.dimension === DIM_A.name,
    );
    expect(result?.summary).toContain("chapter-pipeline-failed");
  });

  it("runOneDim (focusDimension path): emit dimension:degraded(ORCH_CHAPTER_PIPELINE_FAILED) rejects → swallowed, warns (line 1015-1018)", async () => {
    // Use focusDimension path which calls runOneDim directly (not via Phase A/B split)
    const prior = [
      {
        dimension: "Market",
        findings: [{ claim: "c", evidence: "e", source: "http://a.com" }],
        summary: "old",
      },
    ];
    let _emitCallCount = 0;
    const deps = makeDeps({
      emit: jest
        .fn()
        .mockImplementation(
          (event: { type: string; payload?: { failureCode?: string } }) => {
            _emitCallCount++;
            if (
              event.type === "playground.dimension:degraded" &&
              event.payload?.failureCode === "ORCH_CHAPTER_PIPELINE_FAILED"
            ) {
              return Promise.reject(
                new Error("ORCH emit fail for runOneDim path"),
              );
            }
            return Promise.resolve();
          },
        ),
      store: {
        saveResearchResult: jest.fn().mockResolvedValue(undefined),
        markIntermediateState: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as Partial<MissionDeps>);
    const ctx = makeCtx({
      focusDimension: "Market",
      researcherResults: prior,
      // deep depth ensures skipChapterPipeline=false in runOneDim
      input: {
        ...makeCtx().input,
        depth: "deep",
        auditLayers: "standard",
      } as MissionContext["input"],
    });
    // researcher succeeds with findings, then chapter pipeline throws
    (deps.invoker.invoke as jest.Mock).mockImplementation(
      (
        _: unknown,
        input: {
          dimension?: string;
          chapters?: unknown[];
          chapter?: unknown;
          sources?: unknown;
        },
      ) => {
        if (!input?.chapters && !input?.chapter && !input?.sources) {
          return Promise.resolve(okResearcherResult(input?.dimension ?? "x"));
        }
        throw new Error("chapter-pipeline-crash-focus");
      },
    );
    await runResearcherDispatchStage(ctx, deps);
    // The warn from line 1016 should have been called
    const warnCalls = (deps.log.warn as jest.Mock).mock.calls.map(
      (c) => c[0] as string,
    );
    expect(
      warnCalls.some((m) => m.includes("ORCH_CHAPTER_PIPELINE_FAILED")),
    ).toBe(true);
  });

  // ── lifecycle(failed).catch warn: line 1038 ──────────────────────────────

  it("runOneDim outer catch: lifecycle(failed) rejects → warns (line 1038)", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps({
      lifecycle: jest
        .fn()
        .mockImplementation(
          (
            _mId: string,
            _uId: string,
            _agId: string,
            _role: string,
            status: string,
          ) => {
            if (status === "failed") {
              return Promise.reject(new Error("lifecycle-failed-emit-fail"));
            }
            return Promise.resolve();
          },
        ),
    });
    (deps.invoker.invoke as jest.Mock).mockRejectedValue(
      new Error("hard crash"),
    );
    await runResearcherDispatchStage(ctx, deps);
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("lifecycle emit (failed)"),
    );
  });

  // ── emit dimension:degraded (exception) failure: line 1078 ───────────────

  it("runOneDim outer catch: emit dimension:degraded(exception) rejects → swallowed (line 1078)", async () => {
    const ctx = makeCtx({ plan: { ...makeCtx().plan!, dimensions: [DIM_A] } });
    const deps = makeDeps({
      emit: jest
        .fn()
        .mockImplementation(
          (event: { type: string; payload?: { state?: string } }) => {
            if (
              event.type === "playground.dimension:degraded" &&
              event.payload?.state === "exception"
            ) {
              return Promise.reject(new Error("exception degraded emit fail"));
            }
            return Promise.resolve();
          },
        ),
    });
    (deps.invoker.invoke as jest.Mock).mockRejectedValue(new Error("boom"));
    await runResearcherDispatchStage(ctx, deps);
    expect(ctx.researcherResults![0].findings).toEqual([]);
    expect(ctx.researcherResults![0].summary).toContain("error");
  });

  describe("C-alignment: min-findings threshold retry", () => {
    it("[C-regression] findings.length < 5 triggers min-findings retry even if state=completed", async () => {
      // First call returns only 3 findings (< 5 threshold), second call returns 6
      let callCount = 0;
      const ctx = makeCtx({
        plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
        input: {
          topic: "AI",
          depth: "deep",
          language: "zh-CN",
          concurrency: 1,
          withFigures: false,
          auditLayers: "minimal", // skip chapter pipeline for simplicity
          lengthProfile: "standard",
        } as MissionContext["input"],
      });
      const deps = makeDeps({
        invoker: {
          ...makeDeps().invoker,
          invoke: jest
            .fn()
            .mockImplementation((_: unknown, input: { dimension?: string }) => {
              callCount++;
              const findingsCount = callCount === 1 ? 3 : 6; // first call: too few; second: enough
              return Promise.resolve({
                state: "completed",
                output: {
                  dimension: input?.dimension ?? "Market",
                  findings: Array.from({ length: findingsCount }, (_, i) => ({
                    claim: `Claim ${i + 1} with specific data point`,
                    evidence: `Evidence ${i + 1}`,
                    source: `http://source${i + 1}.com`,
                  })),
                  summary: `Summary after attempt ${callCount}`,
                  figureCandidates: [],
                },
                events: [],
                wallTimeMs: 500,
                iterations: 2,
                agent: { getEnvelope: jest.fn() },
              });
            }),
        } as unknown as MissionDeps["invoker"],
      });

      await runResearcherDispatchStage(ctx, deps);

      // Should have called invoke twice: initial + min-findings retry
      expect(callCount).toBe(2);

      // Should emit dimension:retrying with the min-findings reason
      const emitCalls = (deps.emit as jest.Mock).mock.calls;
      const retryEmit = emitCalls.find(
        (args: [unknown]) =>
          typeof args[0] === "object" &&
          args[0] !== null &&
          (args[0] as { type?: string }).type ===
            "playground.dimension:retrying",
      );
      expect(retryEmit).toBeDefined();
      const retryPayload = (retryEmit[0] as { payload?: { reason?: string } })
        .payload;
      expect(retryPayload?.reason).toMatch(/min-findings-not-met/);

      // Final result should have the 6 findings from retry
      expect(ctx.researcherResults?.[0]?.findings.length).toBe(6);
    });

    it("[C-regression] findings.length >= 5 does NOT trigger min-findings retry", async () => {
      let callCount = 0;
      const ctx = makeCtx({
        plan: { ...makeCtx().plan!, dimensions: [DIM_A] },
        input: {
          topic: "AI",
          depth: "deep",
          language: "zh-CN",
          concurrency: 1,
          withFigures: false,
          auditLayers: "minimal",
          lengthProfile: "standard",
        } as MissionContext["input"],
      });
      const deps = makeDeps({
        invoker: {
          ...makeDeps().invoker,
          invoke: jest
            .fn()
            .mockImplementation((_: unknown, input: { dimension?: string }) => {
              callCount++;
              return Promise.resolve({
                state: "completed",
                output: {
                  dimension: input?.dimension ?? "Market",
                  findings: Array.from({ length: 5 }, (_, i) => ({
                    claim: `Claim ${i + 1} with specific data`,
                    evidence: `Evidence ${i + 1}`,
                    source: `http://source${i + 1}.com`,
                  })),
                  summary: "Good summary",
                  figureCandidates: [],
                },
                events: [],
                wallTimeMs: 500,
                iterations: 2,
                agent: { getEnvelope: jest.fn() },
              });
            }),
        } as unknown as MissionDeps["invoker"],
      });

      await runResearcherDispatchStage(ctx, deps);

      // Exactly 1 invoke call: no retry needed
      expect(callCount).toBe(1);

      // No min-findings retry emit
      const emitCalls = (deps.emit as jest.Mock).mock.calls;
      const retryEmit = emitCalls.find(
        (args: [unknown]) =>
          typeof args[0] === "object" &&
          args[0] !== null &&
          (args[0] as { type?: string }).type ===
            "playground.dimension:retrying",
      );
      expect(retryEmit).toBeUndefined();
    });
  });
});
