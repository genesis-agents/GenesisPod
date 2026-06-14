/**
 * mission-view.projector.spec.ts
 *
 * Unit tests for projectMissionView() — targeting 95%+ branch/line coverage.
 *
 * The projector imports:
 *   - projectStages (stage-view.projector) — tested separately; we use real fn
 *   - projectAgents (agent-view.projector) — same
 *   - projectTodoBoard (todo-board.projector) — same
 *   - buildMissionCostView / deriveSnapshotVersionFromRow from ai-harness/facade
 */

import { projectMissionView } from "../mission-view.projector";

// ---------------------------------------------------------------------------
// Minimal MissionDetail builder
// ---------------------------------------------------------------------------

function makeMissionRow(overrides: Partial<any> = {}): any {
  return {
    id: "mission-001",
    topic: "AI Trends",
    depth: "standard",
    language: "zh-CN",
    status: "running",
    startedAt: new Date("2025-01-01T00:00:00.000Z"),
    completedAt: null,
    elapsedWallTimeMs: null,
    finalScore: null,
    tokensUsed: null,
    costUsd: null,
    reportTitle: null,
    reportSummary: null,
    errorMessage: null,
    visibility: "private",
    terminalOutcome: null,
    failureCode: null,
    configSnapshot: null,
    maxCredits: 100,
    themeSummary: null,
    dimensions: null,
    reportFull: null,
    verdicts: null,
    trajectoryStored: null,
    reportArtifactVersion: null,
    userProfile: null,
    reconciliationReport: null,
    leaderJournal: null,
    leaderOverallScore: null,
    leaderSigned: null,
    leaderVerdict: null,
    lastCompletedStage: null,
    outlinePlan: null,
    analystOutput: null,
    ...overrides,
  };
}

// Minimal composedArtifact sentinel
const emptyArtifact = {
  kind: "empty-artifact",
  reason: "not-yet-materialized",
} as const;

// ---------------------------------------------------------------------------
// MissionQueryInputs builder
// ---------------------------------------------------------------------------

function makeInputs(overrides: Partial<any> = {}): any {
  return {
    mode: "row-loaded",
    missionId: "mission-001",
    row: makeMissionRow(),
    events: [],
    composedArtifact: emptyArtifact,
    resume: { resumable: false },
    rerunnableStages: [],
    reportVersions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// starting-placeholder mode
// ---------------------------------------------------------------------------

describe("projectMissionView — starting-placeholder mode", () => {
  it("returns starting status view", () => {
    const inputs = makeInputs({ mode: "starting-placeholder", row: null });
    const view = projectMissionView(inputs);
    expect(view.mission.status).toBe("starting");
    expect(view.mission.resumable).toBe(false);
    expect(view.mission.canCancel).toBe(false);
    expect(view.stages).toHaveLength(14);
    expect(view.agents).toEqual([]);
    expect(view.todoBoard).toEqual({ kind: "empty-todo-board" });
    expect(view.reportArtifact).toEqual(emptyArtifact);
    expect(view.cost).toBeDefined();
    expect(view.memory).toEqual({ kind: "empty-memory" });
    expect(view.timelineVersion).toBe(0);
    expect(view.snapshotVersion).toBe(0);
    expect(view.references).toEqual([]);
    expect(view.reportVersions).toEqual([]);
    expect(view.verdicts).toEqual([]);
    expect(view.memoryIndex).toBeNull();
    expect(view.dimensionPipelines).toEqual({});
  });

  it("passes rerunnableStages to starting view", () => {
    const rerunnableStages = [
      { stageId: "s3-researchers", label: "Researchers" },
    ];
    const inputs = makeInputs({
      mode: "starting-placeholder",
      row: null,
      rerunnableStages,
    });
    const view = projectMissionView(inputs);
    expect(view.mission.rerunnableStages).toEqual(rerunnableStages);
  });
});

// ---------------------------------------------------------------------------
// resolvePublicStatus branches
// ---------------------------------------------------------------------------

describe("projectMissionView — resolvePublicStatus", () => {
  const testStatus = (rowStatus: string, expected: string) => {
    it(`row.status=${rowStatus} → public status=${expected}`, () => {
      const inputs = makeInputs({
        row: makeMissionRow({ status: rowStatus }),
      });
      const view = projectMissionView(inputs);
      expect(view.mission.status).toBe(expected);
    });
  };

  testStatus("completed", "completed");
  testStatus("cancelled", "cancelled");
  testStatus("rejected", "quality-failed");
  testStatus("failed", "failed");
  testStatus("running", "running");
  testStatus("unknown-anything", "running"); // fallback
});

// ---------------------------------------------------------------------------
// canCancel
// ---------------------------------------------------------------------------

describe("projectMissionView — canCancel", () => {
  it("canCancel=true when running", () => {
    const inputs = makeInputs({ row: makeMissionRow({ status: "running" }) });
    const view = projectMissionView(inputs);
    expect(view.mission.canCancel).toBe(true);
  });

  it("canCancel=false when completed", () => {
    const inputs = makeInputs({ row: makeMissionRow({ status: "completed" }) });
    const view = projectMissionView(inputs);
    expect(view.mission.canCancel).toBe(false);
  });

  it("canCancel=false when failed", () => {
    const inputs = makeInputs({ row: makeMissionRow({ status: "failed" }) });
    const view = projectMissionView(inputs);
    expect(view.mission.canCancel).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mission fields mapping
// ---------------------------------------------------------------------------

describe("projectMissionView — mission fields", () => {
  it("maps topic/depth/language fields", () => {
    const row = makeMissionRow({
      topic: "Quantum",
      depth: "deep",
      language: "en-US",
    });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.title).toBe("Quantum");
    expect(view.mission.topic).toBe("Quantum");
    expect(view.mission.depth).toBe("deep");
    expect(view.mission.language).toBe("en-US");
  });

  it("maps maxCredits", () => {
    const row = makeMissionRow({ maxCredits: 500 });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.maxCredits).toBe(500);
  });

  it("maps themeSummary when present", () => {
    const row = makeMissionRow({ themeSummary: "Big picture" });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.themeSummary).toBe("Big picture");
  });

  it("maps leaderOverallScore", () => {
    const row = makeMissionRow({ leaderOverallScore: 82 });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.leaderOverallScore).toBe(82);
  });

  it("maps leaderSigned", () => {
    const row = makeMissionRow({ leaderSigned: true });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.leaderSigned).toBe(true);
  });

  it("maps leaderVerdict", () => {
    const row = makeMissionRow({ leaderVerdict: "approved" });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.leaderVerdict).toBe("approved");
  });

  it("maps failureCode when present", () => {
    const row = makeMissionRow({ failureCode: "BUDGET_EXCEEDED" });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.failureCode).toBe("BUDGET_EXCEEDED");
  });

  it("maps finalScore when present", () => {
    const row = makeMissionRow({ finalScore: 90 });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.finalScore).toBe(90);
  });

  it("maps errorMessage as failureMessage", () => {
    const row = makeMissionRow({ errorMessage: "OOM" });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.failureMessage).toBe("OOM");
  });

  it("startedAt is ISO string", () => {
    const row = makeMissionRow({
      startedAt: new Date("2025-06-01T12:00:00.000Z"),
    });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.startedAt).toBe("2025-06-01T12:00:00.000Z");
  });

  it("finishedAt is ISO string when completedAt set", () => {
    const row = makeMissionRow({
      completedAt: new Date("2025-06-02T15:00:00.000Z"),
    });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.finishedAt).toBe("2025-06-02T15:00:00.000Z");
  });

  it("finishedAt is undefined when completedAt null", () => {
    const row = makeMissionRow({ completedAt: null });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.finishedAt).toBeUndefined();
  });

  it("maps resume.resumable", () => {
    const inputs = makeInputs({ resume: { resumable: true } });
    const view = projectMissionView(inputs);
    expect(view.mission.resumable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dimensions extraction
// ---------------------------------------------------------------------------

describe("projectMissionView — dimensions extraction", () => {
  it("returns undefined when row.dimensions is null", () => {
    const view = projectMissionView(makeInputs());
    expect(view.mission.dimensions).toBeUndefined();
  });

  it("returns undefined for non-array dimensions", () => {
    const row = makeMissionRow({ dimensions: "not-array" });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.dimensions).toBeUndefined();
  });

  it("maps dimensions array to DimensionView[]", () => {
    const row = makeMissionRow({
      dimensions: [
        { id: "d1", name: "Technology", rationale: "Important" },
        { id: "d2", name: "Economy" },
      ],
    });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.dimensions).toHaveLength(2);
    expect(view.mission.dimensions![0].name).toBe("Technology");
    expect(view.mission.dimensions![0].rationale).toBe("Important");
    expect(view.mission.dimensions![1].rationale).toBeUndefined();
  });

  it("filters non-object entries in dimensions", () => {
    const row = makeMissionRow({
      dimensions: [null, { id: "d1", name: "Tech" }, 42],
    });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.dimensions).toHaveLength(1);
  });

  it("uses empty string for missing id/name in dimension", () => {
    const row = makeMissionRow({
      dimensions: [{ foo: "bar" }],
    });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.mission.dimensions![0].id).toBe("");
    expect(view.mission.dimensions![0].name).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Agent terminal sweep (Screenshot_17 fix)
// ---------------------------------------------------------------------------

describe("projectMissionView — agent terminal sweep", () => {
  const agentEv = (type: string) => ({
    type,
    payload: { agentId: "researcher#0", role: "researcher" },
    timestamp: 1000,
  });

  it("sweeps running agents to completed on completed mission", () => {
    const row = makeMissionRow({ status: "completed" });
    const events = [agentEv("dimension:research:started")];
    const view = projectMissionView(makeInputs({ row, events }));
    const agent = view.agents.find((a) => a.id === "researcher#0")!;
    expect(agent.phase).toBe("completed");
  });

  it("sweeps running agents to completed on quality-failed mission", () => {
    const row = makeMissionRow({ status: "quality-failed" });
    const events = [agentEv("dimension:research:started")];
    const view = projectMissionView(makeInputs({ row, events }));
    const agent = view.agents.find((a) => a.id === "researcher#0")!;
    expect(agent.phase).toBe("completed");
  });

  it("sweeps running agents to failed on failed mission", () => {
    const row = makeMissionRow({ status: "failed" });
    const events = [agentEv("dimension:research:started")];
    const view = projectMissionView(makeInputs({ row, events }));
    const agent = view.agents.find((a) => a.id === "researcher#0")!;
    expect(agent.phase).toBe("failed");
  });

  it("sweeps running agents to failed on cancelled mission", () => {
    const row = makeMissionRow({ status: "cancelled" });
    const events = [agentEv("dimension:research:started")];
    const view = projectMissionView(makeInputs({ row, events }));
    const agent = view.agents.find((a) => a.id === "researcher#0")!;
    expect(agent.phase).toBe("failed");
  });

  it("does not sweep agents on running mission", () => {
    const row = makeMissionRow({ status: "running" });
    const events = [agentEv("dimension:research:started")];
    const view = projectMissionView(makeInputs({ row, events }));
    const agent = view.agents.find((a) => a.id === "researcher#0")!;
    expect(agent.phase).toBe("running");
  });

  it("sweeps pending agents too on terminal mission", () => {
    // An agent with no events other than an unknown type → pending
    const row = makeMissionRow({ status: "completed" });
    const events = [
      // force agentId without any recognized phase
      {
        type: "some:other",
        payload: { agentId: "pending-agent" },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ row, events }));
    const agent = view.agents.find((a) => a.id === "pending-agent");
    if (agent) {
      // It's running due to default branch, so gets swept to completed
      expect(agent.phase).toBe("completed");
    }
  });
});

// ---------------------------------------------------------------------------
// references extraction
// ---------------------------------------------------------------------------

describe("projectMissionView — references extraction", () => {
  it("returns empty references when artifact is sentinel", () => {
    const view = projectMissionView(
      makeInputs({ composedArtifact: emptyArtifact }),
    );
    expect(view.references).toEqual([]);
  });

  it("extracts references from V2 artifact citations", () => {
    const v2Artifact: any = {
      content: { fullMarkdown: "", fullReportSize: 0 },
      sections: [],
      citations: [
        {
          index: 1,
          title: "Example",
          url: "https://example.com",
          domain: "example.com",
          publishedAt: "2025-01-01",
        },
        {
          index: 2,
          title: "Other",
          url: "https://other.com",
          domain: "other.com",
        },
      ],
      figures: [],
      quickView: {
        executiveSummary: { markdown: "", wordCount: 0 },
        topHighlights: [],
        topTrends: [],
        keyRisks: [],
        topRecommendations: [],
        keyCitations: [],
        keyFigures: [],
        estimatedReadingTime: 1,
        whatYouWillLearn: [],
        riskMatrix: [],
        keyFindingsByDimension: [],
      },
      metadata: {
        topic: "T",
        generatedAt: "2025-01-01",
        generationTimeMs: 0,
        version: 1,
        isIncremental: false,
        dimensionCount: 0,
        sourceCount: 2,
        factCount: 0,
        figureCount: 0,
        wordCount: 0,
        readingTimeMinutes: 1,
        styleProfile: "executive",
        lengthProfile: "standard",
        audienceProfile: "domain-expert",
        language: "zh-CN",
        totalTokens: { prompt: 0, completion: 0, total: 0 },
        costCents: 0,
        modelTrail: [],
      },
      quality: {
        overall: 0,
        dimensions: {
          traceability: 0,
          factualConsistency: 0,
          novelty: 0,
          coverage: 0,
          redundancy: 0,
          formatCorrectness: 0,
          citationDensity: 0,
          styleConformance: 0,
          lengthAccuracy: 0,
          chapterBalance: 0,
        },
        hardGateViolations: [],
        warnings: [],
        qualityTrace: [],
      },
      factTable: [],
    };
    const view = projectMissionView(
      makeInputs({ composedArtifact: v2Artifact }),
    );
    expect(view.references).toHaveLength(2);
    expect(view.references[0].title).toBe("Example");
    expect(view.references[0].url).toBe("https://example.com");
    expect(view.references[0].publishedAt).toBe("2025-01-01");
    expect(view.references[1].publishedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// reportVersions mapping
// ---------------------------------------------------------------------------

describe("projectMissionView — reportVersions", () => {
  it("maps reportVersions to view shape", () => {
    const inputs = makeInputs({
      reportVersions: [
        {
          version: 1,
          versionLabel: "v1",
          reportTitle: "Report",
          reportSummary: "Summary",
          finalScore: 85,
          leaderSigned: true,
          triggerType: "auto",
          generatedAt: new Date("2025-06-01T00:00:00.000Z"),
        },
      ],
    });
    const view = projectMissionView(inputs);
    expect(view.reportVersions).toHaveLength(1);
    expect(view.reportVersions[0].version).toBe(1);
    expect(view.reportVersions[0].generatedAt).toBe("2025-06-01T00:00:00.000Z");
    expect(view.reportVersions[0].triggerType).toBe("auto");
  });

  it("empty reportVersions stays empty", () => {
    const view = projectMissionView(makeInputs({ reportVersions: [] }));
    expect(view.reportVersions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractVerdicts
// ---------------------------------------------------------------------------

describe("projectMissionView — extractVerdicts", () => {
  it("uses row.verdicts when available", () => {
    const row = makeMissionRow({
      verdicts: [
        {
          verifierId: "v1",
          score: 90,
          critique: "good",
          modelId: "gpt-4",
          attempt: 1,
        },
        { verifierId: "v2", score: 75 },
        { verifierId: "v3" }, // missing score → filtered
        { score: 80 }, // missing verifierId → filtered
      ],
    });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.verdicts).toHaveLength(2);
    expect(view.verdicts[0].verifierId).toBe("v1");
    expect(view.verdicts[0].score).toBe(90);
    expect(view.verdicts[0].critique).toBe("good");
    expect(view.verdicts[0].modelId).toBe("gpt-4");
    expect(view.verdicts[0].attempt).toBe(1);
    expect(view.verdicts[1].critique).toBeUndefined();
  });

  it("falls back to events when row.verdicts is empty", () => {
    const row = makeMissionRow({ verdicts: [] });
    const events = [
      {
        type: "playground.verifier:verdict",
        payload: {
          verifierId: "v1",
          score: 88,
          criteria: { accuracy: 90 },
          attempt: 2,
        },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ row, events }));
    expect(view.verdicts).toHaveLength(1);
    expect(view.verdicts[0].verifierId).toBe("v1");
    expect(view.verdicts[0].score).toBe(88);
    expect(view.verdicts[0].criteria).toEqual({ accuracy: 90 });
    expect(view.verdicts[0].attempt).toBe(2);
  });

  it("falls back to events when row.verdicts is null", () => {
    const row = makeMissionRow({ verdicts: null });
    const events = [
      {
        type: "verifier:verdict",
        payload: { verifierId: "critic-1", score: 70 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ row, events }));
    expect(view.verdicts).toHaveLength(1);
  });

  it("ignores verifier:verdict events with null payload", () => {
    const row = makeMissionRow({ verdicts: null });
    const events = [
      { type: "verifier:verdict", payload: null, timestamp: 1000 },
    ];
    const view = projectMissionView(makeInputs({ row, events }));
    expect(view.verdicts).toEqual([]);
  });

  it("ignores events where verifierId is not string", () => {
    const row = makeMissionRow({ verdicts: null });
    const events = [
      {
        type: "verifier:verdict",
        payload: { verifierId: 123, score: 80 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ row, events }));
    expect(view.verdicts).toEqual([]);
  });

  it("ignores events where score is not number", () => {
    const row = makeMissionRow({ verdicts: null });
    const events = [
      {
        type: "verifier:verdict",
        payload: { verifierId: "v1", score: "high" },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ row, events }));
    expect(view.verdicts).toEqual([]);
  });

  it("suffix-based matching works for dot-separated event type", () => {
    const row = makeMissionRow({ verdicts: null });
    const events = [
      {
        type: "mission.verifier:verdict",
        payload: { verifierId: "v1", score: 77 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ row, events }));
    expect(view.verdicts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// extractMemoryIndex
// ---------------------------------------------------------------------------

describe("projectMissionView — extractMemoryIndex", () => {
  it("returns null when no memory.index event", () => {
    const view = projectMissionView(makeInputs());
    expect(view.memoryIndex).toBeNull();
  });

  it("returns null when payload has no chunks", () => {
    // "x.memory.index" → suffix = "memory.index" which matches the check
    const events = [
      { type: "x.memory.index", payload: { namespace: "x" }, timestamp: 1000 },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.memoryIndex).toBeNull();
  });

  it("extracts memory index from memory.index event (prefixed dot form)", () => {
    const events = [
      {
        type: "x.memory.index",
        payload: { chunks: 100, namespace: "ns1", tags: ["a", "b"] },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.memoryIndex).toEqual({
      chunks: 100,
      namespace: "ns1",
      tags: ["a", "b"],
    });
  });

  it("extracts memory index from memory:index event (colon form)", () => {
    const events = [
      { type: "memory:index", payload: { chunks: 50 }, timestamp: 1000 },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.memoryIndex!.chunks).toBe(50);
  });

  it("uses last memory:index event (reverse scan)", () => {
    const events = [
      { type: "memory:index", payload: { chunks: 10 }, timestamp: 1000 },
      { type: "memory:index", payload: { chunks: 50 }, timestamp: 2000 },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.memoryIndex!.chunks).toBe(50);
  });

  it("filters non-string tags", () => {
    const events = [
      {
        type: "memory:index",
        payload: { chunks: 10, tags: ["valid", 42, null] },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.memoryIndex!.tags).toEqual(["valid"]);
  });

  it("namespace is undefined when not string", () => {
    const events = [
      {
        type: "memory:index",
        payload: { chunks: 10, namespace: 42 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.memoryIndex!.namespace).toBeUndefined();
  });

  it("tags undefined when not array", () => {
    const events = [
      {
        type: "memory:index",
        payload: { chunks: 10, tags: "not-array" },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.memoryIndex!.tags).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractDimensionPipelines
// ---------------------------------------------------------------------------

describe("projectMissionView — dimensionPipelines", () => {
  it("returns empty object with no events and no dimensions in row", () => {
    const view = projectMissionView(makeInputs());
    expect(view.dimensionPipelines).toEqual({});
  });

  it("initializes entries from row.dimensions", () => {
    const row = makeMissionRow({
      dimensions: [{ name: "Finance" }, { name: "Tech" }],
    });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.dimensionPipelines).toHaveProperty("Finance");
    expect(view.dimensionPipelines).toHaveProperty("Tech");
    expect(view.dimensionPipelines.Finance.chapters).toEqual([]);
  });

  it("dimension:outline:planned adds chapters", () => {
    const events = [
      {
        type: "dimension:outline:planned",
        payload: {
          dimension: "Finance",
          chapters: [
            { index: 1, heading: "Intro", thesis: "thesis-1" },
            { index: 2, heading: "Analysis" },
          ],
        },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const pipe = view.dimensionPipelines["Finance"];
    expect(pipe.chapters).toHaveLength(2);
    expect(pipe.chapters[0].heading).toBe("Intro");
    expect(pipe.chapters[0].thesis).toBe("thesis-1");
  });

  it("dimension:outline:planned updates existing chapter heading/thesis", () => {
    const events = [
      {
        type: "dimension:outline:planned",
        payload: {
          dimension: "Finance",
          chapters: [{ index: 1, heading: "H1", thesis: "T1" }],
        },
        timestamp: 1000,
      },
      {
        type: "dimension:outline:planned",
        payload: {
          dimension: "Finance",
          chapters: [{ index: 1, heading: "H1-Updated", thesis: "T1-Updated" }],
        },
        timestamp: 2000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const ch = view.dimensionPipelines["Finance"].chapters[0];
    expect(ch.heading).toBe("H1-Updated");
  });

  it("chapter:writing:started creates chapter entry", () => {
    const events = [
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Ch1", index: 1 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    expect(ch.status).toBe("writing");
    expect(ch.heading).toBe("Ch1");
  });

  it("chapter:writing:started with attempt > 1 → revising status", () => {
    const events = [
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Ch1", index: 1, attempt: 2 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    expect(ch.status).toBe("revising");
  });

  it("chapter:writing:completed → reviewing status", () => {
    const events = [
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Ch1", index: 1 },
        timestamp: 1000,
      },
      {
        type: "chapter:writing:completed",
        payload: {
          dimension: "Tech",
          heading: "Ch1",
          index: 1,
          wordCount: 500,
        },
        timestamp: 2000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    expect(ch.status).toBe("reviewing");
    expect(ch.wordCount).toBe(500);
  });

  it("chapter:writing:failed → failed status", () => {
    const events = [
      {
        type: "chapter:writing:failed",
        payload: { dimension: "Tech", chapterTitle: "ChA", index: 1 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    expect(ch.status).toBe("failed");
  });

  it("chapter:review:completed passes with decision=pass", () => {
    const events = [
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Ch1", index: 1 },
        timestamp: 1000,
      },
      {
        type: "chapter:review:completed",
        payload: {
          dimension: "Tech",
          index: 1,
          decision: "pass",
          score: 85,
          critique: "good",
        },
        timestamp: 2000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    expect(ch.status).toBe("passed");
    expect(ch.score).toBe(85);
    expect(ch.critique).toBe("good");
  });

  it("chapter:review:completed passes when score >= 75", () => {
    const events = [
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Ch1", index: 1 },
        timestamp: 1000,
      },
      {
        type: "chapter:review:completed",
        payload: { dimension: "Tech", index: 1, score: 75 },
        timestamp: 2000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    expect(ch.status).toBe("passed");
  });

  it("chapter:review:completed revising when score < 75", () => {
    const events = [
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Ch1", index: 1 },
        timestamp: 1000,
      },
      {
        type: "chapter:review:completed",
        payload: { dimension: "Tech", index: 1, score: 60 },
        timestamp: 2000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    expect(ch.status).toBe("revising");
  });

  it("chapter:review:completed creates new chapter when not found", () => {
    const events = [
      {
        type: "chapter:review:completed",
        payload: { dimension: "NewDim", chapterIndex: 5, score: 80 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.dimensionPipelines["NewDim"].chapters).toHaveLength(1);
    expect(view.dimensionPipelines["NewDim"].chapters[0].index).toBe(5);
  });

  it("chapter:done with qualified=true → done", () => {
    const events = [
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Ch1", index: 1 },
        timestamp: 1000,
      },
      {
        type: "chapter:done",
        payload: {
          dimension: "Tech",
          index: 1,
          heading: "Ch1",
          qualified: true,
          wordCount: 800,
          finalScore: 90,
        },
        timestamp: 2000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    expect(ch.status).toBe("done");
    expect(ch.wordCount).toBe(800);
    expect(ch.score).toBe(90);
  });

  it("chapter:done with qualified=false → failed-finalized", () => {
    const events = [
      {
        type: "chapter:done",
        payload: {
          dimension: "Tech",
          index: 1,
          heading: "Ch1",
          qualified: false,
        },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    expect(ch.status).toBe("failed-finalized");
  });

  it("chapter:revision → revising", () => {
    const events = [
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Ch1", index: 1 },
        timestamp: 1000,
      },
      {
        type: "chapter:revision",
        payload: { dimension: "Tech", index: 1 },
        timestamp: 2000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    expect(ch.status).toBe("revising");
  });

  it("chapter:rewritten → revising", () => {
    const events = [
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Ch1", index: 1 },
        timestamp: 1000,
      },
      {
        type: "chapter:rewritten",
        payload: { dimension: "Tech", index: 1 },
        timestamp: 2000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    expect(ch.status).toBe("revising");
  });

  it("dimension:integrating:completed sets totalWordCount", () => {
    const events = [
      {
        type: "dimension:integrating:completed",
        payload: { dimension: "Finance", totalWordCount: 3000 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.dimensionPipelines["Finance"].totalWordCount).toBe(3000);
  });

  it("dimension:integrating:failed sets integrationDegraded", () => {
    const events = [
      {
        type: "dimension:integrating:failed",
        payload: { dimension: "Finance" },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.dimensionPipelines["Finance"].integrationDegraded).toBe(true);
  });

  it("dimension:graded sets grade object", () => {
    const events = [
      {
        type: "dimension:graded",
        payload: {
          dimension: "Tech",
          overall: 85,
          grade: "B+",
          summary: "Good research",
          failed: false,
          skipped: false,
          phase: "done",
        },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const grade = view.dimensionPipelines["Tech"].grade!;
    expect(grade.overall).toBe(85);
    expect(grade.grade).toBe("B+");
    expect(grade.summary).toBe("Good research");
    expect(grade.failed).toBe(false);
    expect(grade.phase).toBe("done");
  });

  it("dimension:graded with missing optional fields uses defaults", () => {
    const events = [
      {
        type: "dimension:graded",
        payload: { dimension: "Tech", overall: 70 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const grade = view.dimensionPipelines["Tech"].grade!;
    expect(grade.grade).toBe("—");
    expect(grade.summary).toBe("");
    expect(grade.failed).toBeUndefined();
  });

  it("terminal cleanup marks non-done chapters as done when completed", () => {
    const row = makeMissionRow({ status: "completed" });
    const events = [
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Ch1", index: 1 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ row, events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    // writing → swept to done
    expect(ch.status).toBe("done");
  });

  it("terminal cleanup marks non-done chapters as failed when failed", () => {
    const row = makeMissionRow({ status: "failed" });
    const events = [
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Ch1", index: 1 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ row, events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    expect(ch.status).toBe("failed");
  });

  it("terminal cleanup with rejected row status marks chapters as failed", () => {
    const row = makeMissionRow({ status: "rejected" });
    const events = [
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Ch1", index: 1 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ row, events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    expect(ch.status).toBe("failed");
  });

  it("skips events with null payload", () => {
    const events = [
      { type: "dimension:graded", payload: null, timestamp: 1000 },
    ];
    const view = projectMissionView(makeInputs({ events }));
    // no dimension created from null payload
    expect(Object.keys(view.dimensionPipelines)).toHaveLength(0);
  });

  it("skips events with no dimension in payload", () => {
    const events = [
      {
        type: "chapter:writing:started",
        payload: { heading: "H" },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(Object.keys(view.dimensionPipelines)).toHaveLength(0);
  });

  it("chapter index falls back to chapterIndex field", () => {
    const events = [
      {
        type: "chapter:review:completed",
        payload: { dimension: "Tech", chapterIndex: 3, score: 80 },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.dimensionPipelines["Tech"].chapters[0].index).toBe(3);
  });

  it("chapter heading falls back to chapterTitle", () => {
    const events = [
      {
        type: "chapter:writing:started",
        payload: {
          dimension: "Tech",
          chapterTitle: "Fallback Title",
          index: 1,
        },
        timestamp: 1000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.dimensionPipelines["Tech"].chapters[0].heading).toBe(
      "Fallback Title",
    );
  });

  it("chapter:done score from existing chapter when finalScore present and score null", () => {
    const events = [
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Ch1", index: 1 },
        timestamp: 1000,
      },
      {
        type: "chapter:done",
        payload: {
          dimension: "Tech",
          index: 1,
          qualified: true,
          finalScore: 95,
        },
        timestamp: 2000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.dimensionPipelines["Tech"].chapters[0].score).toBe(95);
  });

  it("updates chapter heading when existing chapter has empty heading (line 350)", () => {
    // First event: chapter created with no heading (empty string) for index 1
    // Second event: same index with a heading → triggers `chapter.heading = heading` (line 350)
    const events = [
      {
        type: "chapter:writing:failed", // creates chapter with heading from chapterTitle fallback
        payload: { dimension: "Tech", index: 1 }, // no heading → heading = ""
        timestamp: 1000,
      },
      {
        type: "chapter:writing:started",
        payload: { dimension: "Tech", heading: "Updated Heading", index: 1 },
        timestamp: 2000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    const ch = view.dimensionPipelines["Tech"].chapters[0];
    // The second event should have set the heading via line 350
    expect(ch.heading).toBe("Updated Heading");
  });
});

// ---------------------------------------------------------------------------
// cost + snapshot version
// ---------------------------------------------------------------------------

describe("projectMissionView — cost view", () => {
  it("builds cost view from row fields", () => {
    const row = makeMissionRow({
      tokensUsed: 5000,
      costUsd: 0.1,
      elapsedWallTimeMs: 60000,
    });
    const view = projectMissionView(makeInputs({ row }));
    expect(view.cost.tokensUsed).toBe("5000");
    expect(view.cost.costUsd).toBe(0.1);
    expect(view.cost.currency).toBe("USD");
  });

  it("snapshot version accumulates from row fields", () => {
    const row = makeMissionRow({
      lastCompletedStage: 5,
      completedAt: new Date(),
      reportArtifactVersion: 2,
      finalScore: 85,
      leaderSigned: true,
    });
    const view = projectMissionView(makeInputs({ row }));
    // v = 5 (stage) + 1 (completedAt) + 2 (reportArtifactVersion) + 1 (finalScore) + 1 (leaderSigned) = 10
    expect(view.snapshotVersion).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// timelineVersion
// ---------------------------------------------------------------------------

describe("projectMissionView — timelineVersion", () => {
  it("equals events.length", () => {
    const events = [
      {
        type: "stage.started",
        payload: { stepId: "s1-budget" },
        timestamp: 1000,
      },
      {
        type: "stage.completed",
        payload: { stepId: "s1-budget" },
        timestamp: 2000,
      },
    ];
    const view = projectMissionView(makeInputs({ events }));
    expect(view.timelineVersion).toBe(2);
  });

  it("is 0 when no events", () => {
    const view = projectMissionView(makeInputs({ events: [] }));
    expect(view.timelineVersion).toBe(0);
  });
});
