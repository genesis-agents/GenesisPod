/**
 * PlaygroundBusinessOrchestrator unit spec
 *
 * Tests the orchestrator directly (not via dispatcher) to cover hook paths
 * that the dispatcher spec doesn't exercise:
 *   - resolveStageRunner returns null (line 157)
 *   - S2 emit leader:goals-set failure (line 268)
 *   - S2 no plan after runLeaderPlanStage (line 296)
 *   - S3 no plan (line 338), cache hit with/without reuse (lines 360-414)
 *   - S3 cache-hit emit failure (line 384), all-cached path (line 414)
 *   - S3 s3PartialResults dim-resume (lines 430, 434, 464-488, 505-512)
 *   - S3 saveResearchResult failure + markStageDegraded (lines 517, 532-545)
 *   - S3 all-dims failed throw (line 560)
 *   - S3 half-fail + markStageDegraded failure (lines 565-574)
 *   - S4 missing plan/researcherResults (lines 593, 596)
 *   - S4 s4PatchFailures update (line 618)
 *   - S8 missing plan/researcherResults (line 748)
 *   - S8 lastOutlinePlan injected into stageCtx (line 764)
 *   - S11 missionCheckpoint.clear error (line 930)
 *   - S11 no reportPayload → skip saveReportVersion (line 952)
 *   - recordForesightPredictions: signed + baseCase → calls predictionCalibration (lines 993-1003)
 */

// Stub out all stage runner imports so we can control them
jest.mock("../stages/s1-mission-estimate-budget.stage", () => ({
  runBudgetEstimateStage: jest.fn(async () => {}),
}));
jest.mock("../stages/s2-leader-plan-mission.stage", () => ({
  runLeaderPlanStage: jest.fn(async () => {}),
}));
jest.mock("../stages/s3-researcher-collect-findings.stage", () => ({
  runResearcherDispatchStage: jest.fn(async (ctx: Record<string, unknown>) => {
    ctx["researcherResults"] = [
      {
        dimension: "dim-1",
        findings: [{ claim: "c", evidence: "e", source: "s" }],
        summary: "s",
      },
    ];
  }),
}));
jest.mock("../stages/s4-leader-assess-research.stage", () => ({
  runLeaderAssessResearchStage: jest.fn(async () => {}),
}));
jest.mock("../stages/s5-reconciler-cross-dim-fact-check.stage", () => ({
  runReconcilerStage: jest.fn(async (ctx: Record<string, unknown>) => {
    ctx["reconciliationReport"] = {
      factTable: [],
      conflicts: [],
      overlaps: [],
      gaps: [],
      figureCandidates: [],
    };
  }),
}));
jest.mock("../stages/s6-analyst-synthesize-insights.stage", () => ({
  runAnalystStage: jest.fn(async (ctx: Record<string, unknown>) => {
    ctx["analystOutput"] = { themeSummary: "t", insights: [] };
  }),
}));
jest.mock("../stages/s7-writer-plan-outline.stage", () => ({
  runWriterOutlineStage: jest.fn(async () => {}),
}));
jest.mock("../stages/s8-writer-draft-report.stage", () => ({
  runWriterStage: jest.fn(async (ctx: Record<string, unknown>) => {
    ctx["report"] = { title: "r", sections: [] };
    ctx["reportArtifact"] = {
      sections: [],
      content: { fullMarkdown: "# R" },
      metadata: { topic: "t" },
      quality: {},
    };
    ctx["reviewScore"] = 80;
    ctx["verifierVerdicts"] = [];
  }),
}));
jest.mock("../stages/s8b-section-quality-enhancement.stage", () => ({
  runSectionQualityEnhancementStage: jest.fn(async () => {}),
}));
jest.mock("../stages/s9-reviewer-critic-l4.stage", () => ({
  runCriticStage: jest.fn(async () => {}),
}));
jest.mock("../stages/s9b-report-objective-evaluation.stage", () => ({
  runReportObjectiveEvaluationStage: jest.fn(async () => {}),
}));
jest.mock("../stages/s10-leader-foreword-and-signoff.stage", () => ({
  runLeaderForewordAndSignoffStage: jest.fn(
    async (ctx: Record<string, unknown>) => {
      ctx["leaderForeword"] = {
        whatWeAnswered: [],
        whatRemainsUnclear: [],
        howToRead: "",
        recommendedFollowUp: [],
        generatedAt: "",
      };
      ctx["leaderSignOff"] = {
        leaderOverallScore: 85,
        leaderVerdict: "good",
        accountabilityNote: "",
        signed: true,
      };
    },
  ),
}));
jest.mock("../stages/s11-mission-persist.stage", () => ({
  runPersistStage: jest.fn(async () => {}),
}));

import { PlaygroundBusinessOrchestrator } from "../playground-business-orchestrator.service";
import type { MissionStageBindingsService } from "../mission-stage-bindings.service";
import type { MissionCheckpointService } from "@/modules/ai-harness/facade";
import type { MissionStore } from "../../lifecycle/mission-store.service";
import type { PredictionCalibrationService } from "../../calibration/prediction-calibration.service";
import type { SessionEntry } from "../playground.pipeline";
import { PlaygroundCrossStageState } from "../playground-cross-stage-state";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeStageBindings(
  depsOverrides: Partial<{
    emit: jest.Mock;
    markStageDegraded: jest.Mock;
    store: Record<string, jest.Mock>;
  }> = {},
) {
  const emitMock = depsOverrides.emit ?? jest.fn().mockResolvedValue(undefined);
  const markStageDegradedMock =
    depsOverrides.markStageDegraded ?? jest.fn().mockResolvedValue(undefined);
  const storeMock: Record<string, jest.Mock> = depsOverrides.store ?? {
    markIntermediateState: jest.fn().mockResolvedValue(undefined),
    listRecentPostmortems: jest.fn().mockResolvedValue([]),
    saveResearchResult: jest.fn().mockResolvedValue(undefined),
    saveChapterDraft: jest.fn().mockResolvedValue(undefined),
    saveReportVersion: jest.fn().mockResolvedValue(1),
    markStageComplete: jest.fn().mockResolvedValue(undefined),
    applyTerminalIfRunning: jest.fn().mockResolvedValue(true),
  };
  const deps = {
    emit: emitMock,
    markStageDegraded: markStageDegradedMock,
    store: storeMock,
    log: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    leader: {
      plan: jest.fn().mockResolvedValue({
        themeSummary: "test",
        dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
        goals: {},
        initialRisks: [],
      }),
    },
    lifecycle: jest.fn().mockResolvedValue(undefined),
    reconciler: {},
    analyst: {},
    writer: {},
    reviewer: {},
    verifier: {},
    steward: {},
    judge: {},
    invoker: {},
  };
  return {
    buildDeps: jest.fn().mockReturnValue(deps),
    buildCtx: jest.fn((args: Record<string, unknown>) => ({
      ...args,
      s4PatchFailures: undefined,
    })),
    _emitMock: emitMock,
    _markStageDegradedMock: markStageDegradedMock,
    _storeMock: storeMock,
    _deps: deps,
  };
}

function makeCheckpoint(
  overrides: Partial<{ clear: jest.Mock; save: jest.Mock }> = {},
) {
  return {
    clear: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeStore(overrides: Record<string, jest.Mock> = {}) {
  return {
    saveResearchResult: jest.fn().mockResolvedValue(undefined),
    saveChapterDraft: jest.fn().mockResolvedValue(undefined),
    saveReportVersion: jest.fn().mockResolvedValue(1),
    ...overrides,
  };
}

function makePredictionCalibration(
  overrides: Partial<{ recordPredictions: jest.Mock }> = {},
) {
  return {
    recordPredictions: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeOrchestrator(
  opts: {
    stageBindings?: ReturnType<typeof makeStageBindings>;
    checkpoint?: ReturnType<typeof makeCheckpoint>;
    store?: ReturnType<typeof makeStore>;
    predictionCalibration?: ReturnType<typeof makePredictionCalibration>;
  } = {},
) {
  const stageBindings = opts.stageBindings ?? makeStageBindings();
  const checkpoint = opts.checkpoint ?? makeCheckpoint();
  const store = opts.store ?? makeStore();
  const predictionCalibration =
    opts.predictionCalibration ?? makePredictionCalibration();

  const orch = new PlaygroundBusinessOrchestrator(
    stageBindings as unknown as MissionStageBindingsService,
    checkpoint as unknown as MissionCheckpointService,
    store as unknown as MissionStore,
    predictionCalibration as unknown as PredictionCalibrationService,
  );
  return { orch, stageBindings, checkpoint, store, predictionCalibration };
}

function makeEntry(
  overrides: Partial<{
    missionId: string;
    userId: string;
    crossState: Partial<InstanceType<typeof PlaygroundCrossStageState>>;
    input: Record<string, unknown>;
  }> = {},
): SessionEntry {
  const missionId = overrides.missionId ?? "m-test";
  const userId = overrides.userId ?? "u-test";
  const crossState = Object.assign(
    new PlaygroundCrossStageState(),
    overrides.crossState ?? {},
  );
  return {
    session: {
      missionId,
      userId,
      billing: {
        estimateAffordable: jest.fn().mockResolvedValue({
          affordable: true,
          estimatedCredits: 0,
          currentBalance: 100,
        }),
      },
      pool: { snapshot: () => ({ poolTokensUsed: 0, poolCostUsd: 0 }) },
      budgetMultiplier: 1,
      missionAbort: new AbortController(),
      wallTimeMs: 60_000,
      cleanup: jest.fn(),
    } as never,
    input: {
      topic: "test",
      inheritFromMissionId: undefined,
      ...(overrides.input ?? {}),
    } as never,
    crossState,
    t0: Date.now(),
    leader: {} as never,
    workspaceId: undefined,
  } as never as SessionEntry;
}

// ── resolveStageRunner ────────────────────────────────────────────────────────
describe("PlaygroundBusinessOrchestrator — resolveStageRunner (line 157)", () => {
  it("returns null for any stepId (playground uses multi-hook mode)", () => {
    const { orch } = makeOrchestrator();
    // resolveStageRunner is protected; access via cast
    const result = (
      orch as unknown as { resolveStageRunner(id: string): null }
    ).resolveStageRunner("s2-leader-plan");
    expect(result).toBeNull();
  });
});

// ── resolveTriggerType ────────────────────────────────────────────────────────
describe("PlaygroundBusinessOrchestrator — resolveTriggerType", () => {
  it("returns rerun-fresh when inheritFromMissionId set", () => {
    const { orch } = makeOrchestrator();
    const entry = makeEntry({ input: { inheritFromMissionId: "src-1" } });
    expect(orch.resolveTriggerType(entry)).toBe("rerun-fresh");
  });

  it("returns initial when inheritFromMissionId absent", () => {
    const { orch } = makeOrchestrator();
    const entry = makeEntry();
    expect(orch.resolveTriggerType(entry)).toBe("initial");
  });
});

// ── bindSessionLookup / getEntry ─────────────────────────────────────────────
describe("PlaygroundBusinessOrchestrator — getEntry / bindSessionLookup", () => {
  it("throws when entry not found", () => {
    const { orch } = makeOrchestrator();
    // Framework method getEntry — should throw if sessions map not populated
    expect(() => {
      (orch as unknown as { getEntry(id: string): unknown }).getEntry(
        "nonexistent",
      );
    }).toThrow();
  });

  it("returns entry after bindSessionLookup", () => {
    const { orch } = makeOrchestrator();
    const entry = makeEntry();
    const sessionsMap = new Map<string, SessionEntry>([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));
    const found = (
      orch as unknown as { getEntry(id: string): SessionEntry }
    ).getEntry("m-test");
    expect(found).toBe(entry);
  });
});

// ── S2 leader plan inherit path coverage ─────────────────────────────────────
describe("PlaygroundBusinessOrchestrator — S2 hooks", () => {
  function _makeOrchWithSession(
    entryOverrides: Parameters<typeof makeEntry>[0] = {},
  ) {
    const { orch, stageBindings, ...rest } = makeOrchestrator();
    const entry = makeEntry(entryOverrides);
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));
    return { orch, entry, stageBindings, ...rest };
  }

  it("S2 inherit path: emit leader:goals-set fails → non-fatal (line 268)", async () => {
    const stageBindings = makeStageBindings();
    // Only reject the leader:goals-set emit; allow other narrative emits to succeed
    stageBindings._deps.emit = jest
      .fn()
      .mockImplementation(async (event: { type: string }) => {
        if (event.type === "playground.leader:goals-set") {
          throw new Error("emit fail");
        }
        return undefined;
      });
    stageBindings.buildDeps.mockReturnValue(stageBindings._deps);

    const { orch } = makeOrchestrator({ stageBindings });

    const entry = makeEntry({
      input: { inheritFromMissionId: "src-1" },
      crossState: {
        lastPlan: {
          themeSummary: "inherited",
          dimensions: [{ id: "d1", name: "D1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
      },
    });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    // Call S2 hook directly
    const hooks = orch.buildHooksForStep("s2-leader-plan", "plan");
    // runRole is the primary hook
    const runRole = (
      hooks as unknown as {
        runRole?: (args: { ctx: { missionId: string } }) => Promise<unknown>;
      }
    ).runRole;
    expect(runRole).toBeDefined();

    // Should not throw even though emit rejects (line 268 catch handles it)
    await expect(
      runRole!({ ctx: { missionId: "m-test" } }),
    ).resolves.toBeDefined();
  });

  it("S2 fresh path: plan is undefined after runLeaderPlanStage → throws (line 296)", async () => {
    // Mock runLeaderPlanStage to NOT set ctx.plan
    const { runLeaderPlanStage } = jest.requireMock(
      "../stages/s2-leader-plan-mission.stage",
    );
    runLeaderPlanStage.mockImplementationOnce(async () => {
      // Does not set ctx.plan
    });

    const { orch } = makeOrchestrator();
    const entry = makeEntry(); // no inheritFromMissionId
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    const hooks = orch.buildHooksForStep("s2-leader-plan", "plan");
    const runRole = (
      hooks as unknown as {
        runRole?: (args: { ctx: { missionId: string } }) => Promise<unknown>;
      }
    ).runRole;

    await expect(runRole!({ ctx: { missionId: "m-test" } })).rejects.toThrow(
      /stage returned without populating ctx\.plan/,
    );
  });
});

// ── S3 hook coverage ──────────────────────────────────────────────────────────
describe("PlaygroundBusinessOrchestrator — S3 hooks", () => {
  function makeOrchWithEntry(
    entryOverrides: Parameters<typeof makeEntry>[0] = {},
  ) {
    const stageBindings = makeStageBindings();
    const { orch, ...rest } = makeOrchestrator({ stageBindings });
    const entry = makeEntry({ missionId: "m-test", ...entryOverrides });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));
    return { orch, entry, stageBindings, ...rest };
  }

  async function callS3PerItemPipeline(
    orch: PlaygroundBusinessOrchestrator,
    missionId = "m-test",
  ) {
    const hooks = orch.buildHooksForStep("s3-researcher-collect", "research");
    const perItemPipeline = (
      hooks as unknown as {
        perItemPipeline?: (args: {
          item: unknown;
          role: string;
          ctx: { missionId: string };
        }) => Promise<unknown>;
      }
    ).perItemPipeline;
    expect(perItemPipeline).toBeDefined();
    return perItemPipeline!({
      item: { kind: "all-dimensions" },
      role: "researcher",
      ctx: { missionId },
    });
  }

  it("S3 no plan → throws (line 338)", async () => {
    const { orch } = makeOrchWithEntry({
      crossState: {}, // no lastPlan
    });
    await expect(callS3PerItemPipeline(orch)).rejects.toThrow(
      /no plan from s2/,
    );
  });

  it("S3 cache hit: all dims cached → returns cached results (line 360, 414)", async () => {
    const { orch, entry, stageBindings } = makeOrchWithEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
        inheritedResearchResults: [
          {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "s",
          },
        ] as never,
      },
    });

    const result = await callS3PerItemPipeline(orch);
    expect(result).toBeDefined();
    // All dims matched from cache → reusedResults has 1, remainingDims empty (line 414 path)
    expect(entry.crossState.lastResearcherResults).toHaveLength(1);
    expect(stageBindings._deps.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "playground.dimension:research:completed",
      }),
    );
  });

  it("S3 cache hit: emit fails → non-fatal (line 383-387)", async () => {
    const stageBindings = makeStageBindings();
    stageBindings._deps.emit = jest
      .fn()
      .mockRejectedValue(new Error("emit fail"));
    stageBindings.buildDeps.mockReturnValue(stageBindings._deps);

    const { orch } = makeOrchestrator({ stageBindings });
    const entry = makeEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
        inheritedResearchResults: [
          {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "s",
          },
        ] as never,
      },
    });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    // Should not throw despite emit failing
    await expect(callS3PerItemPipeline(orch)).resolves.toBeDefined();
  });

  it("S3 cache hit: some dims not cached → runs fresh + merges (lines 360-412)", async () => {
    const { orch, entry } = makeOrchWithEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [
            { id: "d1", name: "Dim1", rationale: "r" },
            { id: "d2", name: "Dim2", rationale: "r2" },
          ],
          goals: {},
          initialRisks: [],
        } as never,
        // Only Dim1 is cached, Dim2 needs fresh research
        inheritedResearchResults: [
          {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "s1",
          },
        ] as never,
      },
    });

    const { runResearcherDispatchStage } = jest.requireMock(
      "../stages/s3-researcher-collect-findings.stage",
    );
    runResearcherDispatchStage.mockImplementationOnce(
      async (ctx: Record<string, unknown>) => {
        ctx["researcherResults"] = [
          {
            dimension: "Dim2",
            findings: [{ claim: "c2", evidence: "e2", source: "s2" }],
            summary: "s2",
          },
        ];
      },
    );

    const result = await callS3PerItemPipeline(orch);
    expect(result).toBeDefined();
    // Merged: 1 cached + 1 fresh
    expect(entry.crossState.lastResearcherResults).toHaveLength(2);
  });

  it("S3 cache hit: s4PatchFailures set when stageCtx has them (line 411)", async () => {
    const { orch, entry } = makeOrchWithEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [
            { id: "d1", name: "Dim1", rationale: "r" },
            { id: "d2", name: "Dim2", rationale: "r2" },
          ],
          goals: {},
          initialRisks: [],
        } as never,
        inheritedResearchResults: [
          {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "s1",
          },
        ] as never,
      },
    });

    const { runResearcherDispatchStage } = jest.requireMock(
      "../stages/s3-researcher-collect-findings.stage",
    );
    runResearcherDispatchStage.mockImplementationOnce(
      async (ctx: Record<string, unknown>) => {
        ctx["researcherResults"] = [
          {
            dimension: "Dim2",
            findings: [{ claim: "c2", evidence: "e2", source: "s2" }],
            summary: "s2",
          },
        ];
        ctx["s4PatchFailures"] = [{ dim: "Dim2", reason: "patch fail" }];
      },
    );

    await callS3PerItemPipeline(orch);
    // s4PatchFailures should be propagated
    expect(entry.crossState.s4PatchFailures).toEqual([
      { dim: "Dim2", reason: "patch fail" },
    ]);
  });

  it("S3 fresh path: dim-resume with s3PartialResults filters already-done dims (lines 430, 434, 464-488)", async () => {
    const { orch, entry } = makeOrchWithEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [
            { id: "d1", name: "Dim1", rationale: "r" },
            { id: "d2", name: "Dim2", rationale: "r2" },
          ],
          goals: {},
          initialRisks: [],
        } as never,
        s3PartialResults: {
          d1: {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "p1",
          },
        },
      },
    });

    const { runResearcherDispatchStage } = jest.requireMock(
      "../stages/s3-researcher-collect-findings.stage",
    );
    runResearcherDispatchStage.mockImplementationOnce(
      async (ctx: Record<string, unknown>) => {
        // Only dim2 should be dispatched
        ctx["researcherResults"] = [
          {
            dimension: "Dim2",
            findings: [{ claim: "c2", evidence: "e2", source: "s2" }],
            summary: "s2",
          },
        ];
      },
    );

    await callS3PerItemPipeline(orch);

    // Verify the plan passed to runResearcherDispatchStage only had dim2
    expect(runResearcherDispatchStage).toHaveBeenCalled();
    // merged results: partial d1 + fresh d2 (in dim order)
    expect(entry.crossState.lastResearcherResults).toHaveLength(2);
  });

  it("S3 fresh path: dim-resume s4PatchFailures from fresh (line 505-512)", async () => {
    const { orch, entry } = makeOrchWithEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [
            { id: "d1", name: "Dim1", rationale: "r" },
            { id: "d2", name: "Dim2", rationale: "r2" },
          ],
          goals: {},
          initialRisks: [],
        } as never,
        s3PartialResults: {
          d1: {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "p1",
          },
        },
      },
    });

    const { runResearcherDispatchStage } = jest.requireMock(
      "../stages/s3-researcher-collect-findings.stage",
    );
    runResearcherDispatchStage.mockImplementationOnce(
      async (ctx: Record<string, unknown>) => {
        ctx["researcherResults"] = [
          {
            dimension: "Dim2",
            findings: [{ claim: "c2", evidence: "e2", source: "s2" }],
            summary: "s2",
          },
        ];
        ctx["s4PatchFailures"] = [{ dim: "Dim2", reason: "patch" }];
      },
    );

    await callS3PerItemPipeline(orch);
    expect(entry.crossState.s4PatchFailures).toEqual([
      { dim: "Dim2", reason: "patch" },
    ]);
  });

  it("S3 saveResearchResult failure → markStageDegraded called (lines 517, 532-545)", async () => {
    const stageBindings = makeStageBindings();
    stageBindings._storeMock.saveResearchResult = jest
      .fn()
      .mockRejectedValue(new Error("DB save fail"));
    stageBindings.buildDeps.mockReturnValue({
      ...stageBindings._deps,
      store: stageBindings._storeMock,
      markStageDegraded: stageBindings._markStageDegradedMock,
    });

    const store = makeStore({
      saveResearchResult: jest
        .fn()
        .mockRejectedValue(new Error("DB save fail")),
    });
    const { orch } = makeOrchestrator({ stageBindings, store });
    const entry = makeEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
      },
    });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    await callS3PerItemPipeline(orch);

    // markStageDegraded should have been called
    expect(stageBindings._markStageDegradedMock).toHaveBeenCalledWith(
      "m-test",
      "u-test",
      "s3-researcher-collect",
      expect.stringContaining("trajectory"),
    );
  });

  it("S3 saveResearchResult failure + markStageDegraded failure → warn logged (lines 544-548)", async () => {
    const stageBindings = makeStageBindings();
    stageBindings._storeMock.saveResearchResult = jest
      .fn()
      .mockRejectedValue(new Error("DB save fail"));
    const markStageDegradedFail = jest
      .fn()
      .mockRejectedValue(new Error("mark fail"));
    stageBindings.buildDeps.mockReturnValue({
      ...stageBindings._deps,
      store: stageBindings._storeMock,
      markStageDegraded: markStageDegradedFail,
    });

    const { orch } = makeOrchestrator({ stageBindings });
    const entry = makeEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
      },
    });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    // should not throw
    await expect(callS3PerItemPipeline(orch)).resolves.toBeDefined();
  });

  it("S3 all dims failed → throws S3-AllDimensionsFailed (line 560)", async () => {
    const { runResearcherDispatchStage } = jest.requireMock(
      "../stages/s3-researcher-collect-findings.stage",
    );
    runResearcherDispatchStage.mockImplementationOnce(
      async (ctx: Record<string, unknown>) => {
        ctx["researcherResults"] = [
          { dimension: "Dim1", findings: [], summary: "" }, // 0 findings = failed
        ];
      },
    );

    const { orch } = makeOrchWithEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
      },
    });

    await expect(callS3PerItemPipeline(orch)).rejects.toThrow(
      /S3-AllDimensionsFailed/,
    );
  });

  it("S3 half-fail path → markStageDegraded called (lines 564-574)", async () => {
    // Need >50% failure: use 3 dims with 2 failing (2*2=4 > 3)
    const { runResearcherDispatchStage } = jest.requireMock(
      "../stages/s3-researcher-collect-findings.stage",
    );
    runResearcherDispatchStage.mockImplementationOnce(
      async (ctx: Record<string, unknown>) => {
        ctx["researcherResults"] = [
          {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "s",
          }, // ok
          { dimension: "Dim2", findings: [], summary: "" }, // fail
          { dimension: "Dim3", findings: [], summary: "" }, // fail: 2/3 > 50%
        ];
      },
    );

    const stageBindings = makeStageBindings();
    const { orch } = makeOrchestrator({ stageBindings });
    const entry = makeEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [
            { id: "d1", name: "Dim1", rationale: "r" },
            { id: "d2", name: "Dim2", rationale: "r2" },
            { id: "d3", name: "Dim3", rationale: "r3" },
          ],
          goals: {},
          initialRisks: [],
        } as never,
      },
    });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    await callS3PerItemPipeline(orch);

    expect(stageBindings._markStageDegradedMock).toHaveBeenCalledWith(
      "m-test",
      "u-test",
      "s3-researcher-collect",
      expect.stringContaining("半数以上"),
    );
  });

  it("S3 half-fail markStageDegraded failure → non-fatal (lines 573-577)", async () => {
    // Need >50% failure: 2 out of 3 dims fail
    const { runResearcherDispatchStage } = jest.requireMock(
      "../stages/s3-researcher-collect-findings.stage",
    );
    runResearcherDispatchStage.mockImplementationOnce(
      async (ctx: Record<string, unknown>) => {
        ctx["researcherResults"] = [
          {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "s",
          },
          { dimension: "Dim2", findings: [], summary: "" },
          { dimension: "Dim3", findings: [], summary: "" },
        ];
      },
    );

    const markStageDegradedFail = jest
      .fn()
      .mockRejectedValue(new Error("markStageDegraded fail"));
    const stageBindings = makeStageBindings({
      markStageDegraded: markStageDegradedFail,
    });

    const { orch } = makeOrchestrator({ stageBindings });
    const entry = makeEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [
            { id: "d1", name: "Dim1", rationale: "r" },
            { id: "d2", name: "Dim2", rationale: "r2" },
            { id: "d3", name: "Dim3", rationale: "r3" },
          ],
          goals: {},
          initialRisks: [],
        } as never,
      },
    });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    // should not throw
    await expect(callS3PerItemPipeline(orch)).resolves.toBeDefined();
  });

  it("S3 checkpointDimension called by runResearcherDispatchStage → saves per-dim checkpoint (lines 464-488)", async () => {
    const { runResearcherDispatchStage } = jest.requireMock(
      "../stages/s3-researcher-collect-findings.stage",
    );
    // Have the stage mock invoke checkpointDimension
    runResearcherDispatchStage.mockImplementationOnce(
      async (ctx: Record<string, unknown>, deps: Record<string, unknown>) => {
        ctx["researcherResults"] = [
          {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "s",
          },
        ];
        // freshDeps is passed as deps – it has checkpointDimension
        const checkpointDimension = deps["checkpointDimension"] as
          | ((
              missionId: string,
              dimId: string,
              dimResult: unknown,
            ) => Promise<void>)
          | undefined;
        if (checkpointDimension) {
          await checkpointDimension("m-test", "d1", {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "s",
          });
        }
      },
    );

    const checkpoint = makeCheckpoint();
    const { orch } = makeOrchestrator({ checkpoint });
    const entry = makeEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
      },
    });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    await callS3PerItemPipeline(orch);

    // checkpointDimension should have called checkpoint.save
    expect(checkpoint.save).toHaveBeenCalled();
    // s3PartialResults should have been updated
    expect(entry.crossState.s3PartialResults).toBeDefined();
  });

  it("S3 checkpointDimension: checkpoint.save fails → non-fatal warn (lines 484-492)", async () => {
    const { runResearcherDispatchStage } = jest.requireMock(
      "../stages/s3-researcher-collect-findings.stage",
    );
    runResearcherDispatchStage.mockImplementationOnce(
      async (ctx: Record<string, unknown>, deps: Record<string, unknown>) => {
        ctx["researcherResults"] = [
          {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "s",
          },
        ];
        const checkpointDimension = deps["checkpointDimension"] as
          | ((
              missionId: string,
              dimId: string,
              dimResult: unknown,
            ) => Promise<void>)
          | undefined;
        if (checkpointDimension) {
          await checkpointDimension("m-test", "d1", {
            dimension: "Dim1",
            findings: [],
          });
        }
      },
    );

    const checkpoint = makeCheckpoint({
      save: jest.fn().mockRejectedValue(new Error("checkpoint save fail")),
    });
    const { orch } = makeOrchestrator({ checkpoint });
    const entry = makeEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
      },
    });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    // Should not throw despite checkpoint.save rejecting
    await expect(callS3PerItemPipeline(orch)).resolves.toBeDefined();
  });

  it("S3 checkpointDimension: entry not found (tryGetEntry returns undefined) → returns early (line 465)", async () => {
    const { runResearcherDispatchStage } = jest.requireMock(
      "../stages/s3-researcher-collect-findings.stage",
    );
    runResearcherDispatchStage.mockImplementationOnce(
      async (ctx: Record<string, unknown>, deps: Record<string, unknown>) => {
        ctx["researcherResults"] = [
          {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "s",
          },
        ];
        const checkpointDimension = deps["checkpointDimension"] as
          | ((
              missionId: string,
              dimId: string,
              dimResult: unknown,
            ) => Promise<void>)
          | undefined;
        if (checkpointDimension) {
          // Pass a non-existent missionId → tryGetEntry returns undefined
          await checkpointDimension("nonexistent-mission", "d1", {});
        }
      },
    );

    const checkpoint = makeCheckpoint();
    const { orch } = makeOrchestrator({ checkpoint });
    const entry = makeEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
      },
    });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    // Should not throw - the early return handles the nonexistent mission
    await expect(callS3PerItemPipeline(orch)).resolves.toBeDefined();
    // checkpoint.save should NOT be called since tryGetEntry returned undefined
    expect(checkpoint.save).not.toHaveBeenCalled();
  });

  it("S3 saveResearchResult failure + markStageDegraded failure → non-fatal line 545 covered", async () => {
    // this.store.saveResearchResult (not deps.store.saveResearchResult) rejects
    // AND this.stageBindings.buildDeps().markStageDegraded also rejects → line 545 catch
    const markStageDegradedFail = jest
      .fn()
      .mockRejectedValue(new Error("mark fail"));
    const stageBindings = makeStageBindings({
      markStageDegraded: markStageDegradedFail,
    });
    // this.store is the MissionStore arg passed to constructor
    const store = makeStore({
      saveResearchResult: jest.fn().mockRejectedValue(new Error("save fail")),
    });

    const { orch } = makeOrchestrator({ stageBindings, store });
    const entry = makeEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
      },
    });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    // Should not throw; markStageDegraded is called but also fails (line 545)
    await expect(callS3PerItemPipeline(orch)).resolves.toBeDefined();
    expect(markStageDegradedFail).toHaveBeenCalled();
  });
});

// ── S5 hook coverage ──────────────────────────────────────────────────────────
describe("PlaygroundBusinessOrchestrator — S5 hooks", () => {
  it("S5 reconciler: missing plan/researcherResults → throws (line 642)", async () => {
    const { orch } = makeOrchestrator();
    const entry = makeEntry({
      crossState: {
        // neither lastPlan nor lastResearcherResults
      },
    });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    const hooks = orch.buildHooksForStep("s5-reconciler", "synthesize");
    const synthesize = (
      hooks as unknown as {
        synthesize?: (args: { ctx: { missionId: string } }) => Promise<unknown>;
      }
    ).synthesize;
    await expect(synthesize!({ ctx: { missionId: "m-test" } })).rejects.toThrow(
      /missing plan\/researcherResults/,
    );
  });
});

// ── S6 hook coverage ──────────────────────────────────────────────────────────
describe("PlaygroundBusinessOrchestrator — S6 hooks", () => {
  it("S6 analyst: missing plan/researcherResults → throws (line 680)", async () => {
    const { orch } = makeOrchestrator();
    const entry = makeEntry({
      crossState: {
        // neither lastPlan nor lastResearcherResults
      },
    });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    const hooks = orch.buildHooksForStep("s6-analyst", "synthesize");
    const synthesize = (
      hooks as unknown as {
        synthesize?: (args: { ctx: { missionId: string } }) => Promise<unknown>;
      }
    ).synthesize;
    await expect(synthesize!({ ctx: { missionId: "m-test" } })).rejects.toThrow(
      /missing plan\/researcherResults/,
    );
  });
});

// ── S4 hook coverage ──────────────────────────────────────────────────────────
describe("PlaygroundBusinessOrchestrator — S4 hooks", () => {
  function makeOrchWithEntry(
    entryOverrides: Parameters<typeof makeEntry>[0] = {},
  ) {
    const { orch, ...rest } = makeOrchestrator();
    const entry = makeEntry({ missionId: "m-test", ...entryOverrides });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));
    return { orch, entry, ...rest };
  }

  async function callS4RunRole(orch: PlaygroundBusinessOrchestrator) {
    const hooks = orch.buildHooksForStep("s4-leader-assess", "assess");
    const runRole = (
      hooks as unknown as {
        runRole?: (args: { ctx: { missionId: string } }) => Promise<unknown>;
      }
    ).runRole;
    return runRole!({ ctx: { missionId: "m-test" } });
  }

  it("S4: missing plan → throws (line 593)", async () => {
    const { orch } = makeOrchWithEntry({
      crossState: {
        lastResearcherResults: [
          { dimension: "d1", findings: [], summary: "" },
        ] as never,
        // no lastPlan
      },
    });
    await expect(callS4RunRole(orch)).rejects.toThrow(/no plan from s2/);
  });

  it("S4: missing researcherResults → throws (line 596)", async () => {
    const { orch } = makeOrchWithEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
        // no lastResearcherResults
      },
    });
    await expect(callS4RunRole(orch)).rejects.toThrow(
      /no researcherResults from s3/,
    );
  });

  it("S4: s4PatchFailures updated when stageCtx has them (line 618)", async () => {
    const { runLeaderAssessResearchStage } = jest.requireMock(
      "../stages/s4-leader-assess-research.stage",
    );
    runLeaderAssessResearchStage.mockImplementationOnce(
      async (ctx: Record<string, unknown>) => {
        ctx["s4PatchFailures"] = [{ dim: "Dim1", reason: "s4 patch" }];
      },
    );

    const { orch, entry } = makeOrchWithEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
        lastResearcherResults: [
          {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "s",
          },
        ] as never,
      },
    });

    await callS4RunRole(orch);
    expect(entry.crossState.s4PatchFailures).toEqual([
      { dim: "Dim1", reason: "s4 patch" },
    ]);
  });
});

// ── S8 hook coverage ──────────────────────────────────────────────────────────
describe("PlaygroundBusinessOrchestrator — S8 hooks", () => {
  function makeOrchWithEntry(
    entryOverrides: Parameters<typeof makeEntry>[0] = {},
  ) {
    const { orch, ...rest } = makeOrchestrator();
    const entry = makeEntry({ missionId: "m-test", ...entryOverrides });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));
    return { orch, entry, ...rest };
  }

  async function callS8DraftOnce(orch: PlaygroundBusinessOrchestrator) {
    const hooks = orch.buildHooksForStep("s8-writer", "draft");
    const draftOnce = (
      hooks as unknown as {
        draftOnce?: (args: { ctx: { missionId: string } }) => Promise<unknown>;
      }
    ).draftOnce;
    return draftOnce!({ ctx: { missionId: "m-test" } });
  }

  it("S8: missing plan → throws (line 748)", async () => {
    const { orch } = makeOrchWithEntry({
      crossState: {
        lastResearcherResults: [
          { dimension: "d1", findings: [], summary: "" },
        ] as never,
      },
    });
    await expect(callS8DraftOnce(orch)).rejects.toThrow(
      /missing plan\/researcherResults/,
    );
  });

  it("S8: missing researcherResults → throws (line 748)", async () => {
    const { orch } = makeOrchWithEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
      },
    });
    await expect(callS8DraftOnce(orch)).rejects.toThrow(
      /missing plan\/researcherResults/,
    );
  });

  it("S8: lastOutlinePlan injected into stageCtx (line 764)", async () => {
    const { runWriterStage } = jest.requireMock(
      "../stages/s8-writer-draft-report.stage",
    );

    const outlinePlanInjected: Record<string, unknown>[] = [];
    runWriterStage.mockImplementationOnce(
      async (ctx: Record<string, unknown>) => {
        outlinePlanInjected.push({ outlinePlan: ctx["outlinePlan"] });
        ctx["report"] = { title: "r", sections: [] };
        ctx["reportArtifact"] = {
          sections: [],
          content: { fullMarkdown: "# R" },
          metadata: { topic: "t" },
          quality: {},
        };
        ctx["reviewScore"] = 80;
        ctx["verifierVerdicts"] = [];
      },
    );

    const { orch } = makeOrchWithEntry({
      crossState: {
        lastPlan: {
          themeSummary: "t",
          dimensions: [{ id: "d1", name: "Dim1", rationale: "r" }],
          goals: {},
          initialRisks: [],
        } as never,
        lastResearcherResults: [
          {
            dimension: "Dim1",
            findings: [{ claim: "c", evidence: "e", source: "s" }],
            summary: "s",
          },
        ] as never,
        lastOutlinePlan: { sections: [{ id: "s1" }] } as never,
      },
    });

    await callS8DraftOnce(orch);
    // outlinePlan should be set on stageCtx
    expect(outlinePlanInjected[0].outlinePlan).toEqual({
      sections: [{ id: "s1" }],
    });
  });
});

// ── S11 hook coverage ─────────────────────────────────────────────────────────
describe("PlaygroundBusinessOrchestrator — S11 hooks", () => {
  function makeOrchWithEntry(
    entryOverrides: Parameters<typeof makeEntry>[0] = {},
    orchOpts: Parameters<typeof makeOrchestrator>[0] = {},
  ) {
    const { orch, ...rest } = makeOrchestrator(orchOpts);
    const entry = makeEntry({ missionId: "m-test", ...entryOverrides });
    const sessionsMap = new Map([["m-test", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));
    return { orch, entry, ...rest };
  }

  async function callS11Persist(orch: PlaygroundBusinessOrchestrator) {
    const hooks = orch.buildHooksForStep("s11-persist", "persist");
    const persist = (
      hooks as unknown as {
        persist?: (args: { ctx: { missionId: string } }) => Promise<void>;
      }
    ).persist;
    return persist!({ ctx: { missionId: "m-test" } });
  }

  it("S11: checkpoint.clear error → non-fatal warn (line 930)", async () => {
    const checkpoint = makeCheckpoint({
      clear: jest.fn().mockRejectedValue(new Error("checkpoint clear fail")),
    });

    const { orch } = makeOrchWithEntry(
      {
        crossState: {
          lastReport: { title: "R", sections: [] } as never,
          lastReportArtifact: {
            sections: [],
            content: { fullMarkdown: "#" },
            metadata: { topic: "t" },
            quality: {},
          } as never,
          lastLeaderSignOff: {
            signed: false,
            leaderOverallScore: 80,
            leaderVerdict: "ok",
            accountabilityNote: "",
          } as never,
        },
      },
      { checkpoint },
    );

    // Should not throw
    await expect(callS11Persist(orch)).resolves.toBeUndefined();
    expect(checkpoint.clear).toHaveBeenCalledWith("m-test");
  });

  it("S11: no reportPayload → skips saveReportVersion (line 952)", async () => {
    const store = makeStore({
      saveReportVersion: jest.fn().mockResolvedValue(1),
    });
    const { orch } = makeOrchWithEntry(
      {
        crossState: {
          // No report or reportArtifact
          lastLeaderSignOff: {
            signed: false,
            leaderOverallScore: 80,
            leaderVerdict: "ok",
            accountabilityNote: "",
          } as never,
        },
      },
      { store },
    );

    await callS11Persist(orch);
    expect(store.saveReportVersion).not.toHaveBeenCalled();
  });

  it("S11: saveReportVersion failure → non-fatal warn", async () => {
    const store = makeStore({
      saveReportVersion: jest
        .fn()
        .mockRejectedValue(new Error("save version fail")),
    });
    const { orch } = makeOrchWithEntry(
      {
        crossState: {
          lastReport: { title: "R", sections: [] } as never,
          lastLeaderSignOff: {
            signed: false,
            leaderOverallScore: 80,
            leaderVerdict: "ok",
            accountabilityNote: "",
          } as never,
        },
      },
      { store },
    );

    // Should not throw
    await expect(callS11Persist(orch)).resolves.toBeUndefined();
  });
});

// ── recordForesightPredictions ────────────────────────────────────────────────
describe("PlaygroundBusinessOrchestrator — recordForesightPredictions (lines 993-1003)", () => {
  async function callS11PersistForForesight(
    entryOverrides: Parameters<typeof makeEntry>[0] = {},
    orchOpts: Parameters<typeof makeOrchestrator>[0] = {},
  ) {
    const { orch, ...rest } = makeOrchestrator(orchOpts);
    const entry = makeEntry({ missionId: "m-foresight", ...entryOverrides });
    const sessionsMap = new Map([["m-foresight", entry]]);
    (
      orch as unknown as {
        bindSessionLookup(fn: (id: string) => SessionEntry | undefined): void;
      }
    ).bindSessionLookup((id) => sessionsMap.get(id));

    const hooks = orch.buildHooksForStep("s11-persist", "persist");
    const persist = (
      hooks as unknown as {
        persist?: (args: { ctx: { missionId: string } }) => Promise<void>;
      }
    ).persist;
    await persist!({ ctx: { missionId: "m-foresight" } });
    return rest;
  }

  it("signed=false → recordForesightPredictions skips (does not call predictionCalibration)", async () => {
    const predictionCalibration = makePredictionCalibration();
    await callS11PersistForForesight(
      {
        crossState: {
          lastLeaderSignOff: {
            signed: false,
            leaderOverallScore: 80,
            leaderVerdict: "ok",
            accountabilityNote: "",
          } as never,
          lastReportArtifact: {
            sections: [],
            metadata: { topic: "t" },
            quickView: {
              foresight: {
                baseCase: [
                  {
                    judgment: "j1",
                    probability: 0.8,
                    confidence: "high",
                    horizon: "6-18m",
                    resolutionCriteria: "rc",
                  },
                ],
              },
            },
          } as never,
        },
      },
      { predictionCalibration },
    );

    // Fire-and-forget; wait a tick
    await new Promise((r) => setImmediate(r));
    expect(predictionCalibration.recordPredictions).not.toHaveBeenCalled();
  });

  it("signed=true, no baseCase → skips recordPredictions", async () => {
    const predictionCalibration = makePredictionCalibration();
    await callS11PersistForForesight(
      {
        crossState: {
          lastLeaderSignOff: {
            signed: true,
            leaderOverallScore: 90,
            leaderVerdict: "good",
            accountabilityNote: "",
          } as never,
          lastReportArtifact: {
            sections: [],
            metadata: { topic: "t" },
            quickView: { foresight: { baseCase: [] } }, // empty baseCase
          } as never,
        },
      },
      { predictionCalibration },
    );

    await new Promise((r) => setImmediate(r));
    expect(predictionCalibration.recordPredictions).not.toHaveBeenCalled();
  });

  it("signed=true + baseCase populated → calls predictionCalibration.recordPredictions (line 993)", async () => {
    const predictionCalibration = makePredictionCalibration();
    await callS11PersistForForesight(
      {
        crossState: {
          lastLeaderSignOff: {
            signed: true,
            leaderOverallScore: 95,
            leaderVerdict: "excellent",
            accountabilityNote: "",
          } as never,
          lastPlan: {
            themeSummary: "test theme",
            dimensions: [],
            goals: {},
            initialRisks: [],
          } as never,
          lastReportArtifact: {
            sections: [],
            metadata: { topic: "AI Trends" },
            quickView: {
              foresight: {
                baseCase: [
                  {
                    judgment: "AI will dominate",
                    probability: 0.8,
                    confidence: "high",
                    horizon: "6-18m",
                    resolutionCriteria: "Market share > 50%",
                  },
                ],
              },
            },
          } as never,
        },
      },
      { predictionCalibration },
    );

    // Wait for fire-and-forget
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(predictionCalibration.recordPredictions).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: "m-foresight",
        userId: "u-test",
        topic: "AI Trends",
        baseCase: expect.arrayContaining([
          expect.objectContaining({ judgment: "AI will dominate" }),
        ]),
      }),
    );
  });

  it("recordForesightPredictions throws → non-fatal warn (line 1002-1006)", async () => {
    const predictionCalibration = makePredictionCalibration({
      recordPredictions: jest
        .fn()
        .mockRejectedValue(new Error("calibration fail")),
    });

    // Should not throw
    await expect(
      callS11PersistForForesight(
        {
          crossState: {
            lastLeaderSignOff: {
              signed: true,
              leaderOverallScore: 95,
              leaderVerdict: "good",
              accountabilityNote: "",
            } as never,
            lastReportArtifact: {
              sections: [],
              metadata: { topic: "t" },
              quickView: {
                foresight: {
                  baseCase: [
                    {
                      judgment: "j",
                      probability: 0.5,
                      confidence: "low",
                      horizon: "0-6m",
                      resolutionCriteria: "rc",
                    },
                  ],
                },
              },
            } as never,
          },
        },
        { predictionCalibration },
      ),
    ).resolves.toBeDefined();

    // Wait for fire-and-forget
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  });
});

// ── buildHooksForStep fallback throw ─────────────────────────────────────────
describe("PlaygroundBusinessOrchestrator — buildHooksForStep fallback", () => {
  it("unknown stepId throws with useful message", () => {
    const { orch } = makeOrchestrator();
    expect(() => orch.buildHooksForStep("s99-unknown", "plan")).toThrow(
      /no hook builder for step/,
    );
  });

  it("s8b-quality-enhancement routes to buildReviewHooks", () => {
    const { orch } = makeOrchestrator();
    const hooks = orch.buildHooksForStep("s8b-quality-enhancement", "review");
    expect(hooks).toBeDefined();
  });

  it("s9-critic routes to buildReviewHooks", () => {
    const { orch } = makeOrchestrator();
    const hooks = orch.buildHooksForStep("s9-critic", "review");
    expect(hooks).toBeDefined();
  });

  it("s9b-objective-eval routes to buildReviewHooks", () => {
    const { orch } = makeOrchestrator();
    const hooks = orch.buildHooksForStep("s9b-objective-eval", "review");
    expect(hooks).toBeDefined();
  });

  it("all 11 stage builders return defined hooks", () => {
    const { orch } = makeOrchestrator();
    const pairs: [string, string][] = [
      ["s1-budget", "persist"],
      ["s2-leader-plan", "plan"],
      ["s3-researcher-collect", "research"],
      ["s4-leader-assess", "assess"],
      ["s5-reconciler", "synthesize"],
      ["s6-analyst", "synthesize"],
      ["s7-writer-outline", "draft"],
      ["s8-writer", "draft"],
      ["s8b-quality-enhancement", "review"],
      ["s9-critic", "review"],
      ["s9b-objective-eval", "review"],
      ["s10-leader-foreword-signoff", "signoff"],
      ["s11-persist", "persist"],
    ];
    for (const [stepId, primitive] of pairs) {
      expect(() => orch.buildHooksForStep(stepId, primitive)).not.toThrow();
    }
  });
});

// ── STAGE_NUMBER and constants ────────────────────────────────────────────────
describe("PlaygroundBusinessOrchestrator — constants", () => {
  it("STAGE_NUMBER has expected stage mappings", () => {
    const { orch } = makeOrchestrator();
    expect(orch.STAGE_NUMBER["s1-budget"]).toBe(1);
    expect(orch.STAGE_NUMBER["s11-persist"]).toBe(11);
  });

  it("CHECKPOINT_AT has expected milestones", () => {
    const { orch } = makeOrchestrator();
    expect(orch.CHECKPOINT_AT["s2-leader-plan"]).toBeDefined();
    expect(orch.CHECKPOINT_AT["s3-researcher-collect"]).toBeDefined();
    expect(orch.CHECKPOINT_AT["s8-writer"]).toBeDefined();
  });

  it("PRIMARY_HOOK_BY_PRIMITIVE has expected mappings", () => {
    const { orch } = makeOrchestrator();
    expect(orch.PRIMARY_HOOK_BY_PRIMITIVE["plan"]).toBe("runRole");
    expect(orch.PRIMARY_HOOK_BY_PRIMITIVE["persist"]).toBe("persist");
  });
});
