import { runCriticStage } from "../s9-reviewer-critic-l4.stage";
import type { MissionContext } from "../../../context/mission-context";
import type { MissionDeps } from "../../../context/mission-deps";

function makeReportArtifact(overrides = {}) {
  return {
    metadata: { topic: "AI", modelTrail: ["gpt-4"], wordCount: 5000 },
    quickView: {
      executiveSummary: { markdown: "AI is transforming industry" },
    },
    sections: [{ id: "s1", title: "Market", citations: [], figureIds: [] }],
    citations: [{ index: 1 }],
    figures: [],
    factTable: [],
    quality: {
      overall: 80,
      dimensions: {
        novelty: 70,
        styleConformance: 75,
        traceability: 80,
        factualConsistency: 80,
        coverage: 90,
        redundancy: 80,
        formatCorrectness: 80,
        citationDensity: 80,
        lengthAccuracy: 75,
        chapterBalance: 80,
      },
      hardGateViolations: [],
      warnings: [],
      qualityTrace: [],
      finalVerdict: "good",
    },
    ...overrides,
  };
}

function makeCtx(overrides: Partial<MissionContext> = {}): MissionContext {
  return {
    missionId: "m9",
    userId: "u1",
    t0: Date.now(),
    budgetMultiplier: 1.0,
    input: {
      topic: "AI",
      depth: "deep",
      language: "zh-CN",
      auditLayers: "thorough",
      audienceProfile: "professional",
      styleProfile: "analytical",
      lengthProfile: "standard",
    } as MissionContext["input"],
    billing: {} as MissionContext["billing"],
    pool: {
      snapshot: jest
        .fn()
        .mockReturnValue({ poolCostUsd: 0, poolTokensUsed: 0 }),
    } as unknown as MissionContext["pool"],
    leader: {} as MissionContext["leader"],
    reportArtifact:
      makeReportArtifact() as unknown as MissionContext["reportArtifact"],
    verifierVerdicts: [{ score: 80, critique: "ok" }],
    reviewScore: 80,
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
    reviewer: {
      criticL4: jest.fn().mockResolvedValue({
        state: "completed",
        output: {
          overallVerdict: "pass",
          blindspots: [],
          biasFlags: [],
          suggestions: ["Add more examples"],
          rationale: "Report is solid",
        },
        events: [],
        wallTimeMs: 1000,
        iterations: 2,
      }),
    },
    invoker: {
      tickCost: jest.fn().mockResolvedValue(undefined),
      preDisableKnownFailingModels: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  } as unknown as MissionDeps;
}

describe("runCriticStage (S9)", () => {
  it("skips if reportArtifact is undefined", async () => {
    const ctx = makeCtx({ reportArtifact: undefined });
    const deps = makeDeps();
    await runCriticStage(ctx, deps);
    expect(deps.reviewer.criticL4).not.toHaveBeenCalled();
  });

  it("skips when auditLayers is 'standard' and audience not executive", async () => {
    const ctx = makeCtx({
      input: {
        ...makeCtx().input,
        auditLayers: "standard",
        audienceProfile: "professional",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    await runCriticStage(ctx, deps);
    expect(deps.reviewer.criticL4).not.toHaveBeenCalled();
  });

  it("runs when auditLayers is thorough", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runCriticStage(ctx, deps);
    expect(deps.reviewer.criticL4).toHaveBeenCalled();
  });

  it("runs when auditLayers is paranoid", async () => {
    const ctx = makeCtx({
      input: {
        ...makeCtx().input,
        auditLayers: "thorough+",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    await runCriticStage(ctx, deps);
    expect(deps.reviewer.criticL4).toHaveBeenCalled();
  });

  it("runs when audience=executive regardless of auditLayers (non-minimal)", async () => {
    const ctx = makeCtx({
      input: {
        ...makeCtx().input,
        auditLayers: "standard",
        audienceProfile: "executive",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    await runCriticStage(ctx, deps);
    expect(deps.reviewer.criticL4).toHaveBeenCalled();
  });

  it("does not run when auditLayers=minimal even for executive", async () => {
    const ctx = makeCtx({
      input: {
        ...makeCtx().input,
        auditLayers: "minimal",
        audienceProfile: "executive",
      } as MissionContext["input"],
    });
    const deps = makeDeps();
    await runCriticStage(ctx, deps);
    expect(deps.reviewer.criticL4).not.toHaveBeenCalled();
  });

  it("pass verdict → pushes warnings + qualityTrace but no hardGateViolations", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runCriticStage(ctx, deps);
    const { quality } = ctx.reportArtifact!;
    expect(quality.qualityTrace.some((t) => t.stage === "critic")).toBe(true);
    expect(quality.hardGateViolations).toHaveLength(0);
  });

  it("fail verdict → lowers overall + adds hardGateViolation", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    (deps.reviewer.criticL4 as jest.Mock).mockResolvedValue({
      state: "completed",
      output: {
        overallVerdict: "fail",
        blindspots: ["missed climate"],
        biasFlags: ["optimism bias"],
        suggestions: [],
        rationale: "Report is weak",
      },
      events: [],
      wallTimeMs: 1000,
      iterations: 2,
    });
    const originalOverall = ctx.reportArtifact!.quality.overall;
    await runCriticStage(ctx, deps);
    expect(ctx.reportArtifact!.quality.overall).toBeLessThan(originalOverall);
    expect(
      ctx.reportArtifact!.quality.hardGateViolations.length,
    ).toBeGreaterThan(0);
  });

  it("concerns verdict → lowers overall moderately (0.9 factor)", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    (deps.reviewer.criticL4 as jest.Mock).mockResolvedValue({
      state: "completed",
      output: {
        overallVerdict: "concerns",
        blindspots: ["limited scope"],
        biasFlags: [],
        suggestions: ["expand"],
        rationale: "Some concerns",
      },
      events: [],
      wallTimeMs: 1000,
      iterations: 2,
    });
    const originalOverall = ctx.reportArtifact!.quality.overall;
    await runCriticStage(ctx, deps);
    expect(ctx.reportArtifact!.quality.overall).toBeLessThan(originalOverall);
    expect(ctx.reportArtifact!.quality.hardGateViolations).toHaveLength(0);
  });

  it("criticL4 throws → logs warn and continues (non-fatal)", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    (deps.reviewer.criticL4 as jest.Mock).mockRejectedValue(
      new Error("critic failed"),
    );
    await expect(runCriticStage(ctx, deps)).resolves.toBeUndefined();
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("L4 critic failed"),
    );
  });

  it("emits critic:verdict event on success", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runCriticStage(ctx, deps);
    const verdictCall = (deps.emit as jest.Mock).mock.calls.find(
      (c) => c[0].type === "playground.critic:verdict",
    );
    expect(verdictCall).toBeDefined();
    expect(verdictCall[0].payload.verdict).toBe("pass");
  });

  it("fail verdict with biasFlags → reduces styleConformance", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    (deps.reviewer.criticL4 as jest.Mock).mockResolvedValue({
      state: "completed",
      output: {
        overallVerdict: "fail",
        blindspots: [],
        biasFlags: ["optimism bias", "selection bias"],
        suggestions: [],
        rationale: "Biased report",
      },
      events: [],
      wallTimeMs: 1000,
      iterations: 2,
    });
    const originalStyle =
      ctx.reportArtifact!.quality.dimensions.styleConformance;
    await runCriticStage(ctx, deps);
    expect(
      ctx.reportArtifact!.quality.dimensions.styleConformance,
    ).toBeLessThan(originalStyle);
  });

  it("tickCost called after critic run", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    await runCriticStage(ctx, deps);
    expect(deps.invoker.tickCost).toHaveBeenCalled();
  });

  it("verifierVerdicts undefined → defaults to [] (upstreamReviewerVerdict falsy branch)", async () => {
    const ctx = makeCtx({ verifierVerdicts: undefined });
    const deps = makeDeps();
    await runCriticStage(ctx, deps);
    expect(deps.reviewer.criticL4).toHaveBeenCalled();
    const callArg = (deps.reviewer.criticL4 as jest.Mock).mock.calls[0][0];
    expect(callArg.upstreamReviewerVerdict).toBeUndefined();
  });

  it("reviewScore undefined → defaults to 0", async () => {
    const ctx = makeCtx({ reviewScore: undefined });
    const deps = makeDeps();
    await runCriticStage(ctx, deps);
    expect(deps.reviewer.criticL4).toHaveBeenCalled();
  });

  it("LLM output with invalid/non-array fields → uses fallback empty arrays", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    (deps.reviewer.criticL4 as jest.Mock).mockResolvedValue({
      state: "completed",
      output: {
        overallVerdict: "unknown-verdict",
        blindspots: "not an array",
        biasFlags: null,
        suggestions: 42,
        rationale: 99,
      },
      events: [],
      wallTimeMs: 500,
      iterations: 1,
    });
    await runCriticStage(ctx, deps);
    const verdictCall = (deps.emit as jest.Mock).mock.calls.find(
      (c) => c[0].type === "playground.critic:verdict",
    );
    expect(verdictCall).toBeDefined();
    expect(verdictCall[0].payload.verdict).toBe("concerns");
    expect(verdictCall[0].payload.blindspotCount).toBe(0);
    expect(verdictCall[0].payload.biasCount).toBe(0);
  });

  it("criticL4 throws non-Error → String(err) branch covered", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    (deps.reviewer.criticL4 as jest.Mock).mockRejectedValue("string error");
    await expect(runCriticStage(ctx, deps)).resolves.toBeUndefined();
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("L4 critic failed"),
    );
  });

  it("emit critic:verdict rejects → logs warn and continues (line 181 catch)", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    // Make emit throw on the first call after critic runs
    let emitCallCount = 0;
    (deps.emit as jest.Mock).mockImplementation(async (e: { type: string }) => {
      emitCallCount++;
      if (e.type === "playground.critic:verdict") {
        throw new Error("emit failed");
      }
    });
    // Should not throw - catch block swallows
    await expect(runCriticStage(ctx, deps)).resolves.toBeUndefined();
    expect(emitCallCount).toBeGreaterThan(0);
  });
});

// ─── runForecastRedTeam (lines 306-428) ──────────────────────────────────────

function makeCtxWithForesight(
  overrides: Partial<MissionContext> = {},
): MissionContext {
  return makeCtx({
    reportArtifact: {
      ...makeReportArtifact(),
      quickView: {
        executiveSummary: { markdown: "..." },
        foresight: {
          baseCase: [
            {
              judgment: "AI will grow 30%",
              probability: 0.7,
              confidence: "high",
              horizon: "3y",
            },
          ],
          scenarios: [
            { kind: "bull", narrative: "massive adoption", probability: 0.6 },
          ],
          criticalUncertainties: ["regulation", "compute cost"],
          couldBeWrongIf: [],
          robustness: 75,
        },
      },
    } as unknown as MissionContext["reportArtifact"],
    ...overrides,
  });
}

function makeDepsFull(
  reviewerOverrides: Record<string, jest.Mock> = {},
): MissionDeps {
  return {
    ...makeDeps(),
    reviewer: {
      criticL4: jest.fn().mockResolvedValue({
        state: "completed",
        output: {
          overallVerdict: "pass",
          blindspots: [],
          biasFlags: [],
          suggestions: [],
          rationale: "OK",
        },
        events: [],
        wallTimeMs: 500,
        iterations: 1,
      }),
      forecastRedTeam: jest.fn().mockResolvedValue({
        state: "completed",
        output: {
          overallRobustness: 70,
          couldBeWrongIf: ["regulation changes", "market shift"],
          vulnerabilities: [
            {
              statement: "AI adoption slows",
              failureScenario: "regulation blocks",
              impactIfFails: "high",
              timeHorizon: "2y",
            },
          ],
          rationale: "Solid foresight",
        },
        events: [
          {
            type: "thinking",
            payload: {
              promptTokens: 100,
              completionTokens: 50,
              costUsd: 0.001,
            },
            timestamp: 1,
          },
        ],
        wallTimeMs: 800,
        iterations: 1,
      }),
      ...reviewerOverrides,
    },
    invoker: {
      tickCost: jest.fn().mockResolvedValue(undefined),
      preDisableKnownFailingModels: jest.fn().mockResolvedValue([]),
    },
  } as unknown as MissionDeps;
}

describe("runForecastRedTeam (via runCriticStage, lines 306-428)", () => {
  it("skips when reportArtifact has no foresight (quickView.foresight absent)", async () => {
    const ctx = makeCtx(); // default makeReportArtifact has no foresight
    const deps = makeDepsFull();
    await runCriticStage(ctx, deps);
    expect(deps.reviewer.forecastRedTeam as jest.Mock).not.toHaveBeenCalled();
  });

  it("skips when foresight.baseCase is empty", async () => {
    const ctx = makeCtxWithForesight({
      reportArtifact: {
        ...makeReportArtifact(),
        quickView: {
          executiveSummary: { markdown: "..." },
          foresight: {
            baseCase: [], // empty
            scenarios: [],
            criticalUncertainties: [],
            couldBeWrongIf: [],
            robustness: 75,
          },
        },
      } as unknown as MissionContext["reportArtifact"],
    });
    const deps = makeDepsFull();
    await runCriticStage(ctx, deps);
    expect(deps.reviewer.forecastRedTeam as jest.Mock).not.toHaveBeenCalled();
  });

  it("runs forecast red-team when foresight.baseCase has entries → couldBeWrongIf + robustness set", async () => {
    const ctx = makeCtxWithForesight();
    const deps = makeDepsFull();
    await runCriticStage(ctx, deps);
    expect(deps.reviewer.forecastRedTeam as jest.Mock).toHaveBeenCalledTimes(1);
    // ctx.reportRedTeamVerdict should be set
    expect(ctx.reportRedTeamVerdict).toBeDefined();
    expect(ctx.reportRedTeamVerdict?.overallRobustness).toBe(70);
    // foresight enriched
    const foresight = ctx.reportArtifact?.quickView.foresight as {
      couldBeWrongIf?: string[];
      robustness?: number;
    };
    expect(foresight?.robustness).toBe(70);
    expect(foresight?.couldBeWrongIf).toEqual([
      "regulation changes",
      "market shift",
    ]);
  });

  it("robustness < 50 → hardGateViolation added", async () => {
    const ctx = makeCtxWithForesight();
    const deps = makeDepsFull({
      forecastRedTeam: jest.fn().mockResolvedValue({
        state: "completed",
        output: {
          overallRobustness: 30, // < 50
          couldBeWrongIf: [],
          vulnerabilities: [],
          rationale: "Weak foresight",
        },
        events: [],
        wallTimeMs: 500,
        iterations: 1,
      }),
    });
    await runCriticStage(ctx, deps);
    const violations = ctx.reportArtifact?.quality.hardGateViolations ?? [];
    const rtViolation = violations.find(
      (v) => v.dimension === "forecast-redteam",
    );
    expect(rtViolation).toBeDefined();
  });

  it("robustness >= 50 → no hardGateViolation for forecast-redteam", async () => {
    const ctx = makeCtxWithForesight();
    const deps = makeDepsFull();
    await runCriticStage(ctx, deps);
    const violations = ctx.reportArtifact?.quality.hardGateViolations ?? [];
    const rtViolation = violations.find(
      (v) => v.dimension === "forecast-redteam",
    );
    expect(rtViolation).toBeUndefined();
  });

  it("rtRes.state !== 'completed' → returns early without setting verdict", async () => {
    const ctx = makeCtxWithForesight();
    const deps = makeDepsFull({
      forecastRedTeam: jest.fn().mockResolvedValue({
        state: "failed",
        output: null,
        events: [],
        wallTimeMs: 100,
        iterations: 1,
      }),
    });
    await runCriticStage(ctx, deps);
    expect(ctx.reportRedTeamVerdict).toBeUndefined();
  });

  it("rtRes.output absent → returns early", async () => {
    const ctx = makeCtxWithForesight();
    const deps = makeDepsFull({
      forecastRedTeam: jest.fn().mockResolvedValue({
        state: "completed",
        output: undefined,
        events: [],
        wallTimeMs: 100,
        iterations: 1,
      }),
    });
    await runCriticStage(ctx, deps);
    expect(ctx.reportRedTeamVerdict).toBeUndefined();
  });

  it("output missing overallRobustness → defaults to 50", async () => {
    const ctx = makeCtxWithForesight();
    const deps = makeDepsFull({
      forecastRedTeam: jest.fn().mockResolvedValue({
        state: "completed",
        output: {
          // no overallRobustness
          couldBeWrongIf: [],
          vulnerabilities: [],
          rationale: "ok",
        },
        events: [],
        wallTimeMs: 100,
        iterations: 1,
      }),
    });
    await runCriticStage(ctx, deps);
    expect(ctx.reportRedTeamVerdict?.overallRobustness).toBe(50);
  });

  it("output has non-array couldBeWrongIf → defaults to []", async () => {
    const ctx = makeCtxWithForesight();
    const deps = makeDepsFull({
      forecastRedTeam: jest.fn().mockResolvedValue({
        state: "completed",
        output: {
          overallRobustness: 60,
          couldBeWrongIf: "not an array", // bad type
          vulnerabilities: null,
          rationale: "ok",
        },
        events: [],
        wallTimeMs: 100,
        iterations: 1,
      }),
    });
    await runCriticStage(ctx, deps);
    expect(ctx.reportRedTeamVerdict?.couldBeWrongIf).toEqual([]);
    expect(ctx.reportRedTeamVerdict?.vulnerabilities).toEqual([]);
  });

  it("vulnerabilities with 5+ entries → only first 5 pushed to warnings", async () => {
    const ctx = makeCtxWithForesight();
    const makeVuln = (i: number) => ({
      statement: `vuln ${i}`,
      failureScenario: `fail ${i}`,
      impactIfFails: "medium",
      timeHorizon: "1y",
    });
    const deps = makeDepsFull({
      forecastRedTeam: jest.fn().mockResolvedValue({
        state: "completed",
        output: {
          overallRobustness: 70,
          couldBeWrongIf: [],
          vulnerabilities: [1, 2, 3, 4, 5, 6, 7].map(makeVuln),
          rationale: "many vulns",
        },
        events: [],
        wallTimeMs: 100,
        iterations: 1,
      }),
    });
    await runCriticStage(ctx, deps);
    const warnings = ctx.reportArtifact?.quality.warnings ?? [];
    const vulnWarnings = warnings.filter(
      (w) => w.dimension === "forecast-vulnerability",
    );
    expect(vulnWarnings).toHaveLength(5); // only first 5
  });

  it("forecastRedTeam throws → logs warn (non-fatal), no rethrow", async () => {
    const ctx = makeCtxWithForesight();
    const deps = makeDepsFull({
      forecastRedTeam: jest
        .fn()
        .mockRejectedValue(new Error("redteam API failed")),
    });
    await expect(runCriticStage(ctx, deps)).resolves.toBeUndefined();
    expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("forecast red-team failed"),
    );
  });

  it("emit red-team:verdict fails → logs warn (catch in emit.catch)", async () => {
    const ctx = makeCtxWithForesight();
    const deps = makeDepsFull();
    // Make emit reject for red-team:verdict
    (deps.emit as jest.Mock).mockImplementation(async (e: { type: string }) => {
      if (e.type === "playground.red-team:verdict") {
        throw new Error("emit red-team failed");
      }
    });
    await expect(runCriticStage(ctx, deps)).resolves.toBeUndefined();
  });

  it("emits playground.red-team:verdict event on successful red-team", async () => {
    const ctx = makeCtxWithForesight();
    const deps = makeDepsFull();
    await runCriticStage(ctx, deps);
    const rtEmit = (deps.emit as jest.Mock).mock.calls.find(
      (c) => c[0].type === "playground.red-team:verdict",
    );
    expect(rtEmit).toBeDefined();
    expect(rtEmit![0].payload.robustness).toBe(70);
  });

  it("tickCost called with red-team events", async () => {
    const ctx = makeCtxWithForesight();
    const deps = makeDepsFull();
    await runCriticStage(ctx, deps);
    expect(deps.invoker.tickCost as jest.Mock).toHaveBeenCalledTimes(2); // once for critic, once for red-team
  });
});
