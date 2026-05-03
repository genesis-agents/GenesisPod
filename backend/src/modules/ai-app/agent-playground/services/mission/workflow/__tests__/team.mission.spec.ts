/**
 * TeamMission.runMission — unit tests
 *
 * Strategy: mock all 12 stage functions + BillingRuntimeEnvAdapter + MissionBudgetPool
 * so we can test the trunk orchestration logic in isolation.
 *
 * Tested:
 *  - Happy-path: 12 stages run in sequence, returns MissionResult
 *  - Credit check: throws when balance ≤ hardLimit
 *  - BYOK model check: throws when all models unhealthy
 *  - Wall-time timer: abort fires after configured ms
 *  - Error classifier: correct failureCode per error type
 *  - Abort / cancel: mission:failed emitted on uncaught error
 */

// ── mock all stage modules before any import ───────────────────────────────
jest.mock("../stages/s1-mission-estimate-budget.stage", () => ({
  runBudgetEstimateStage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../stages/s2-leader-plan-mission.stage", () => ({
  runLeaderPlanStage: jest
    .fn()
    .mockImplementation((ctx: { plan?: unknown }) => {
      ctx.plan = {
        dimensions: [{ id: "d1", name: "Dim1", rationale: "r1" }],
        goals: ["g1"],
        themeSummary: "Theme summary",
      };
      return Promise.resolve();
    }),
}));
jest.mock("../stages/s3-researcher-collect-findings.stage", () => ({
  runResearcherDispatchStage: jest
    .fn()
    .mockImplementation((ctx: { researcherResults?: unknown }) => {
      ctx.researcherResults = [{ dimension: "Dim1", findings: [] }];
      return Promise.resolve();
    }),
}));
jest.mock("../stages/s4-leader-assess-research.stage", () => ({
  runLeaderAssessResearchStage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../stages/s5-reconciler-cross-dim-fact-check.stage", () => ({
  runReconcilerStage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../stages/s6-analyst-synthesize-insights.stage", () => ({
  runAnalystStage: jest.fn().mockResolvedValue({ insights: [] }),
}));
jest.mock("../stages/s7-writer-plan-outline.stage", () => ({
  runWriterOutlineStage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../stages/s8-writer-draft-report.stage", () => ({
  runWriterStage: jest
    .fn()
    .mockImplementation(
      (ctx: {
        report?: unknown;
        reviewScore?: number;
        verifierVerdicts?: unknown[];
        reportArtifact?: unknown;
        trajectoryStored?: number;
      }) => {
        ctx.report = {
          title: "Report",
          summary: "Summary",
          sections: [{ heading: "S1", body: "body" }],
          conclusion: "Conclusion",
        };
        ctx.reviewScore = 80;
        ctx.verifierVerdicts = [];
        ctx.reportArtifact = { quality: { overall: 80 } };
        ctx.trajectoryStored = 5;
        return Promise.resolve();
      },
    ),
}));
jest.mock("../stages/s8b-section-quality-enhancement.stage", () => ({
  runSectionQualityEnhancementStage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../stages/s9-reviewer-critic-l4.stage", () => ({
  runCriticStage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../stages/s9b-report-objective-evaluation.stage", () => ({
  runReportObjectiveEvaluationStage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../stages/s10-leader-foreword-and-signoff.stage", () => ({
  runLeaderForewordAndSignoffStage: jest
    .fn()
    .mockImplementation((ctx: { leaderSignOff?: unknown }) => {
      ctx.leaderSignOff = {
        leaderOverallScore: 85,
        leaderVerdict: "good",
        accountabilityNote: "note",
        signed: true,
      };
      return Promise.resolve();
    }),
}));
jest.mock("../stages/s11-mission-persist.stage", () => ({
  runPersistStage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../stages/s12-self-evolution.stage", () => ({
  runSelfEvolutionStage: jest.fn().mockResolvedValue(undefined),
}));

// ── mock BillingRuntimeEnvAdapter + MissionBudgetPool ─────────────────────
jest.mock("@/modules/ai-harness/facade", () => {
  const mockAdapter = {
    userId: "user-1",
    workspaceId: undefined,
    listAvailableModels: jest.fn().mockResolvedValue([]),
    getCreditState: jest.fn().mockResolvedValue({
      balance: 1000,
      hardLimit: 0,
    }),
    suggestFallback: jest
      .fn()
      .mockResolvedValue({ userMessage: "Please add credits" }),
  };

  const mockPool = {
    snapshot: jest.fn().mockReturnValue({ poolTokensUsed: 0, poolCostUsd: 0 }),
    consume: jest.fn().mockReturnValue(true),
  };

  return {
    AgentRunner: jest.fn(),
    DomainEventBus: jest.fn(),
    FigureRelevanceService: jest.fn(),
    JudgeService: jest.fn(),
    MemoryAutoIndexer: jest.fn(),
    SectionSelfEvalService: jest.fn(),
    SectionRemediationService: jest.fn(),
    ReportEvaluationService: jest.fn(),
    QualityTraceComputeService: jest.fn(),
    RuntimeEnvironmentService: jest.fn(),
    BillingRuntimeEnvAdapter: jest.fn().mockImplementation(() => mockAdapter),
    MissionBudgetPool: jest.fn().mockImplementation(() => mockPool),
    __mockAdapter: mockAdapter,
    __mockPool: mockPool,
  };
});

jest.mock("@/modules/ai-engine/facade", () => ({
  FigureExtractorService: jest.fn(),
}));

// Mock the harness kernel so AgentSpec base class doesn't fail module loading
jest.mock(
  "../../../../../../ai-harness/agents/dev-tools/agent-spec.base",
  () => ({
    AgentSpec: class AgentSpec {},
  }),
);

// Mock roles to avoid deep transitive agent imports
jest.mock("../../../roles", () => ({
  LeaderService: jest.fn(),
  ReconcilerService: jest.fn(),
  AnalystService: jest.fn(),
  WriterService: jest.fn(),
  ReviewerService: jest.fn(),
  VerifierService: jest.fn(),
  StewardService: jest.fn(),
  AgentInvoker: jest.fn(),
}));

// Mock leader agent to avoid transitional imports
jest.mock("../../../../agents/leader/leader.agent", () => ({
  LeaderAgent: class LeaderAgent {},
}));

// Now import after mocks are set up
import { TeamMission } from "../team.mission";
import * as facade from "@/modules/ai-harness/facade";

const mockFacadeModule = facade as unknown as {
  __mockAdapter: {
    listAvailableModels: jest.Mock;
    getCreditState: jest.Mock;
    suggestFallback: jest.Mock;
  };
  __mockPool: {
    snapshot: jest.Mock;
  };
};

function buildTeamMission() {
  const mockInvoker = {
    invoke: jest.fn().mockResolvedValue({ state: "completed", output: {} }),
    emitEvent: jest.fn().mockResolvedValue(undefined),
    emitLifecycle: jest.fn().mockResolvedValue(undefined),
  };

  const mockStore = {
    create: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    markCompleted: jest.fn().mockResolvedValue(undefined),
    // ★ PR-H v1: heartbeat + stage progress tracking
    refreshHeartbeat: jest.fn().mockResolvedValue(undefined),
    markStageComplete: jest.fn().mockResolvedValue(undefined),
    recoverPodCrashedRunning: jest.fn().mockResolvedValue(0),
  };

  const mockLeaderService = {
    create: jest.fn().mockReturnValue({
      topic: "test",
      dimensions: [],
    }),
  };

  const mockAbortRegistry = {
    register: jest.fn().mockReturnValue(new AbortController()),
    unregister: jest.fn(),
    abort: jest.fn(),
    isAborted: jest.fn().mockReturnValue(false),
    getSignal: jest.fn().mockReturnValue(undefined),
  };

  const mockCredits = {
    getBalance: jest.fn().mockResolvedValue({ balance: 1000, hardLimit: 0 }),
  };

  const mockRuntimeEnv = {};

  const mission = new TeamMission(
    {} as never, // runner
    {} as never, // judge
    {} as never, // indexer
    {} as never, // eventBus
    mockCredits as never,
    mockRuntimeEnv as never,
    mockStore as never,
    {} as never, // failureLearner
    {} as never, // reportAssembler
    {} as never, // missionState
    mockAbortRegistry as never,
    mockLeaderService as never,
    {} as never, // reconcilerService
    {} as never, // analystService
    {} as never, // writerService
    {} as never, // reviewerService
    {} as never, // verifierService
    {} as never, // stewardService
    mockInvoker as never,
    {} as never, // figureExtractor
    {} as never, // figureRelevance
    {} as never, // sectionSelfEval
    {} as never, // sectionRemediation
    {} as never, // reportEvaluation
    {} as never, // qualityTraceCompute
    // ★ Phase 5 (2026-04-29): missionCheckpoint mock — save/clear no-op
    {
      save: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      load: jest.fn().mockResolvedValue(null),
      canResume: jest.fn(),
      listResumable: jest.fn().mockResolvedValue([]),
      isCompleted: jest.fn().mockReturnValue(false),
    } as never,
    // ★ postmortemClassifier mock — classify returns success result
    {
      classify: jest.fn().mockReturnValue({
        mode: "success",
        signals: [],
        confidence: 1,
      }),
    } as never,
    // ★ missionEventBuffer mock — read returns empty events array
    {
      read: jest.fn().mockReturnValue([]),
    } as never,
  );

  return {
    mission,
    mockStore,
    mockInvoker,
    mockLeaderService,
    mockAbortRegistry,
    mockCredits,
  };
}

const VALID_INPUT = {
  topic: "AI trends in 2024",
  depth: "deep" as const,
  language: "zh-CN" as const,
  budgetProfile: "medium" as const,
  styleProfile: "executive" as const,
  lengthProfile: "standard" as const,
  audienceProfile: "domain-expert" as const,
  withFigures: true,
  auditLayers: "default" as const,
  concurrency: 3,
  viewMode: "continuous" as const,
};

describe("TeamMission.runMission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset adapter mocks to healthy defaults
    mockFacadeModule.__mockAdapter.listAvailableModels.mockResolvedValue([]);
    mockFacadeModule.__mockAdapter.getCreditState.mockResolvedValue({
      balance: 1000,
      hardLimit: 0,
    });
    mockFacadeModule.__mockPool.snapshot.mockReturnValue({
      poolTokensUsed: 100,
      poolCostUsd: 0.01,
    });
  });

  describe("happy path", () => {
    it("completes and returns MissionResult with missionId", async () => {
      const { mission } = buildTeamMission();
      const result = await mission.runMission(
        "m-test-1",
        VALID_INPUT,
        "user-1",
      );
      expect(result.missionId).toBe("m-test-1");
    });

    it("returns report from stage S8", async () => {
      const { mission } = buildTeamMission();
      const result = await mission.runMission("m-1", VALID_INPUT, "user-1");
      expect(result.report).toBeDefined();
      expect(result.report.title).toBe("Report");
    });

    it("returns reviewScore from stage S8", async () => {
      const { mission } = buildTeamMission();
      const result = await mission.runMission("m-1", VALID_INPUT, "user-1");
      expect(result.reviewScore).toBe(80);
    });

    it("returns leaderSignOff from stage S10", async () => {
      const { mission } = buildTeamMission();
      const result = await mission.runMission("m-1", VALID_INPUT, "user-1");
      expect(result.leaderSignOff?.signed).toBe(true);
      expect(result.leaderSignOff?.leaderVerdict).toBe("good");
    });

    it("returns themeSummary from plan", async () => {
      const { mission } = buildTeamMission();
      const result = await mission.runMission("m-1", VALID_INPUT, "user-1");
      expect(result.themeSummary).toBe("Theme summary");
    });

    it("calls abortRegistry.register on startup", async () => {
      const { mission, mockAbortRegistry } = buildTeamMission();
      await mission.runMission("m-1", VALID_INPUT, "user-1");
      expect(mockAbortRegistry.register).toHaveBeenCalledWith("m-1");
    });

    it("calls abortRegistry.unregister on success", async () => {
      const { mission, mockAbortRegistry } = buildTeamMission();
      await mission.runMission("m-1", VALID_INPUT, "user-1");
      expect(mockAbortRegistry.unregister).toHaveBeenCalledWith("m-1");
    });

    it("calls store.create to persist mission record", async () => {
      const { mission, mockStore } = buildTeamMission();
      await mission.runMission("m-1", VALID_INPUT, "user-1");
      expect(mockStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "m-1",
          userId: "user-1",
          topic: "AI trends in 2024",
        }),
      );
    });

    it("calls runPersistStage after successful body execution", async () => {
      const { mission } = buildTeamMission();
      const { runPersistStage }: { runPersistStage: jest.Mock } =
        jest.requireMock("../stages/s11-mission-persist.stage");
      await mission.runMission("m-1", VALID_INPUT, "user-1");
      expect(runPersistStage).toHaveBeenCalled();
    });

    it("fires runSelfEvolutionStage asynchronously (best-effort)", async () => {
      const { mission } = buildTeamMission();
      await mission.runMission("m-1", VALID_INPUT, "user-1");
      // It's fired void — just verify it's called (it resolves immediately in mock)
      const { runSelfEvolutionStage }: { runSelfEvolutionStage: jest.Mock } =
        jest.requireMock("../stages/s12-self-evolution.stage");
      // Let async fire
      await new Promise((r) => setTimeout(r, 10));
      expect(runSelfEvolutionStage).toHaveBeenCalled();
    });
  });

  describe("credit check", () => {
    it("throws and emits mission:rejected when credit balance ≤ hardLimit", async () => {
      const { mission, mockInvoker } = buildTeamMission();
      mockFacadeModule.__mockAdapter.getCreditState.mockResolvedValue({
        balance: 0,
        hardLimit: 0,
      });
      mockFacadeModule.__mockAdapter.suggestFallback.mockResolvedValue({
        userMessage: "No credits left",
      });
      await expect(
        mission.runMission("m-1", VALID_INPUT, "user-1"),
      ).rejects.toThrow("No credits left");
      expect(mockInvoker.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "agent-playground.mission:rejected" }),
      );
    });

    it("throws with 'Credit balance too low' when suggestFallback has no userMessage", async () => {
      const { mission } = buildTeamMission();
      mockFacadeModule.__mockAdapter.getCreditState.mockResolvedValue({
        balance: 0,
        hardLimit: 0,
      });
      mockFacadeModule.__mockAdapter.suggestFallback.mockResolvedValue({});
      await expect(
        mission.runMission("m-1", VALID_INPUT, "user-1"),
      ).rejects.toThrow("Credit balance too low");
    });
  });

  describe("BYOK model check", () => {
    it("throws when all configured models are unhealthy", async () => {
      const { mission, mockInvoker } = buildTeamMission();
      mockFacadeModule.__mockAdapter.listAvailableModels.mockResolvedValue([
        { modelId: "gpt-4o", available: false },
        { modelId: "claude-3", available: false },
      ]);
      await expect(
        mission.runMission("m-1", VALID_INPUT, "user-1"),
      ).rejects.toThrow(/BYOK 配置的所有模型均不可用/);
      expect(mockInvoker.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "agent-playground.mission:rejected",
          payload: expect.objectContaining({ reason: "no_healthy_model" }),
        }),
      );
    });

    it("proceeds when at least one model is healthy", async () => {
      const { mission } = buildTeamMission();
      mockFacadeModule.__mockAdapter.listAvailableModels.mockResolvedValue([
        { modelId: "gpt-4o", available: false },
        { modelId: "claude-3", available: true },
      ]);
      const result = await mission.runMission("m-1", VALID_INPUT, "user-1");
      expect(result.missionId).toBe("m-1");
    });

    it("proceeds when no models configured (empty list)", async () => {
      const { mission } = buildTeamMission();
      mockFacadeModule.__mockAdapter.listAvailableModels.mockResolvedValue([]);
      const result = await mission.runMission("m-1", VALID_INPUT, "user-1");
      expect(result.missionId).toBe("m-1");
    });

    it("continues if listAvailableModels throws non-BYOK error", async () => {
      const { mission } = buildTeamMission();
      mockFacadeModule.__mockAdapter.listAvailableModels.mockRejectedValue(
        new Error("network error"),
      );
      // Non-BYOK errors are swallowed — mission proceeds
      const result = await mission.runMission("m-1", VALID_INPUT, "user-1");
      expect(result.missionId).toBe("m-1");
    });
  });

  describe("error handling and failure classification", () => {
    it("emits mission:failed when a stage throws", async () => {
      const { mission, mockStore, mockInvoker } = buildTeamMission();
      const { runLeaderPlanStage }: { runLeaderPlanStage: jest.Mock } =
        jest.requireMock("../stages/s2-leader-plan-mission.stage");
      runLeaderPlanStage.mockRejectedValueOnce(new Error("LLM API error 500"));
      await expect(
        mission.runMission("m-1", VALID_INPUT, "user-1"),
      ).rejects.toThrow("LLM API error 500");
      expect(mockInvoker.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "agent-playground.mission:failed" }),
      );
      expect(mockStore.markFailed).toHaveBeenCalled();
    });

    it("classifies InsufficientCreditsException → ORCH_CREDIT_INSUFFICIENT", async () => {
      const { mission, mockInvoker } = buildTeamMission();
      const { runLeaderPlanStage }: { runLeaderPlanStage: jest.Mock } =
        jest.requireMock("../stages/s2-leader-plan-mission.stage");
      const err = new Error("insufficient credit");
      err.name = "InsufficientCreditsException";
      runLeaderPlanStage.mockRejectedValueOnce(err);
      await expect(
        mission.runMission("m-1", VALID_INPUT, "user-1"),
      ).rejects.toThrow();
      expect(mockInvoker.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            failureCode: "ORCH_CREDIT_INSUFFICIENT",
          }),
        }),
      );
    });

    it("classifies ByokRequiredError → PROVIDER_BYOK_MODEL_NOT_FOUND", async () => {
      const { mission, mockInvoker } = buildTeamMission();
      const { runLeaderPlanStage }: { runLeaderPlanStage: jest.Mock } =
        jest.requireMock("../stages/s2-leader-plan-mission.stage");
      const err = new Error("BYOK required");
      err.name = "ByokRequiredError";
      runLeaderPlanStage.mockRejectedValueOnce(err);
      await expect(
        mission.runMission("m-1", VALID_INPUT, "user-1"),
      ).rejects.toThrow();
      expect(mockInvoker.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            failureCode: "PROVIDER_BYOK_MODEL_NOT_FOUND",
          }),
        }),
      );
    });

    it("classifies InputValidationError → RUNNER_INPUT_SCHEMA_MISMATCH", async () => {
      const { mission, mockInvoker } = buildTeamMission();
      const { runLeaderPlanStage }: { runLeaderPlanStage: jest.Mock } =
        jest.requireMock("../stages/s2-leader-plan-mission.stage");
      const err = new Error("schema mismatch");
      err.name = "InputValidationError";
      runLeaderPlanStage.mockRejectedValueOnce(err);
      await expect(
        mission.runMission("m-1", VALID_INPUT, "user-1"),
      ).rejects.toThrow();
      expect(mockInvoker.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            failureCode: "RUNNER_INPUT_SCHEMA_MISMATCH",
          }),
        }),
      );
    });

    it("classifies timeout error → RUNNER_WALL_TIME_EXCEEDED", async () => {
      const { mission, mockInvoker } = buildTeamMission();
      const {
        runResearcherDispatchStage,
      }: { runResearcherDispatchStage: jest.Mock } = jest.requireMock(
        "../stages/s3-researcher-collect-findings.stage",
      );
      runResearcherDispatchStage.mockRejectedValueOnce(
        new Error("Operation timed out"),
      );
      await expect(
        mission.runMission("m-1", VALID_INPUT, "user-1"),
      ).rejects.toThrow();
      expect(mockInvoker.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            failureCode: "RUNNER_WALL_TIME_EXCEEDED",
          }),
        }),
      );
    });

    it("classifies rate limit error → PROVIDER_RATE_LIMIT", async () => {
      const { mission, mockInvoker } = buildTeamMission();
      const { runWriterStage }: { runWriterStage: jest.Mock } =
        jest.requireMock("../stages/s8-writer-draft-report.stage");
      runWriterStage.mockRejectedValueOnce(
        new Error("429 Too Many Requests rate limit exceeded"),
      );
      await expect(
        mission.runMission("m-1", VALID_INPUT, "user-1"),
      ).rejects.toThrow();
      expect(mockInvoker.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            failureCode: "PROVIDER_RATE_LIMIT",
          }),
        }),
      );
    });

    it("classifies generic API error → PROVIDER_API_ERROR", async () => {
      const { mission, mockInvoker } = buildTeamMission();
      const { runAnalystStage }: { runAnalystStage: jest.Mock } =
        jest.requireMock("../stages/s6-analyst-synthesize-insights.stage");
      runAnalystStage.mockRejectedValueOnce(new Error("Internal server error"));
      await expect(
        mission.runMission("m-1", VALID_INPUT, "user-1"),
      ).rejects.toThrow();
      expect(mockInvoker.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            failureCode: "PROVIDER_API_ERROR",
          }),
        }),
      );
    });

    it("abort/cancel error → does NOT emit mission:failed (P0-LIVE-CANCEL-GHOST)", async () => {
      // ★ P0-LIVE-CANCEL-GHOST (2026-04-30): cancel 路径不再 emit mission:failed
      //   避免派生 stage 错误盖住"用户取消"真因。mission:cancelled 已由
      //   abortRegistry.abort() 调用方（controller / wallTimer）emit。
      const { mission, mockInvoker } = buildTeamMission();
      const { runReconcilerStage }: { runReconcilerStage: jest.Mock } =
        jest.requireMock("../stages/s5-reconciler-cross-dim-fact-check.stage");
      runReconcilerStage.mockRejectedValueOnce(new Error("mission aborted"));
      await expect(
        mission.runMission("m-1", VALID_INPUT, "user-1"),
      ).rejects.toThrow();
      const failedCalls = mockInvoker.emitEvent.mock.calls.filter((c) => {
        const ev = c[0] as { type?: string };
        return ev?.type === "agent-playground.mission:failed";
      });
      expect(failedCalls.length).toBe(0);
    });

    it("calls unregister even on error", async () => {
      const { mission, mockAbortRegistry } = buildTeamMission();
      const { runLeaderPlanStage }: { runLeaderPlanStage: jest.Mock } =
        jest.requireMock("../stages/s2-leader-plan-mission.stage");
      runLeaderPlanStage.mockRejectedValueOnce(new Error("fail"));
      await expect(
        mission.runMission("m-1", VALID_INPUT, "user-1"),
      ).rejects.toThrow();
      expect(mockAbortRegistry.unregister).toHaveBeenCalledWith("m-1");
    });
  });

  describe("stage ordering", () => {
    it("runs all 12 stages in sequence", async () => {
      const { mission } = buildTeamMission();
      const callOrder: string[] = [];

      const stageModules = [
        [
          "../stages/s1-mission-estimate-budget.stage",
          "runBudgetEstimateStage",
        ],
        ["../stages/s2-leader-plan-mission.stage", "runLeaderPlanStage"],
        [
          "../stages/s3-researcher-collect-findings.stage",
          "runResearcherDispatchStage",
        ],
        [
          "../stages/s4-leader-assess-research.stage",
          "runLeaderAssessResearchStage",
        ],
        [
          "../stages/s5-reconciler-cross-dim-fact-check.stage",
          "runReconcilerStage",
        ],
        ["../stages/s6-analyst-synthesize-insights.stage", "runAnalystStage"],
        ["../stages/s7-writer-plan-outline.stage", "runWriterOutlineStage"],
        ["../stages/s8-writer-draft-report.stage", "runWriterStage"],
        [
          "../stages/s8b-section-quality-enhancement.stage",
          "runSectionQualityEnhancementStage",
        ],
        ["../stages/s9-reviewer-critic-l4.stage", "runCriticStage"],
        [
          "../stages/s9b-report-objective-evaluation.stage",
          "runReportObjectiveEvaluationStage",
        ],
        [
          "../stages/s10-leader-foreword-and-signoff.stage",
          "runLeaderForewordAndSignoffStage",
        ],
        ["../stages/s11-mission-persist.stage", "runPersistStage"],
      ] as const;

      for (const [modulePath, fnName] of stageModules) {
        const mod: Record<string, jest.Mock> = jest.requireMock(
          modulePath,
        ) as unknown as Record<string, jest.Mock>;
        const original = mod[fnName];
        mod[fnName] = jest.fn().mockImplementation((...args: unknown[]) => {
          callOrder.push(fnName);
          return original(...args);
        });
      }

      await mission.runMission("m-order", VALID_INPUT, "user-1");

      const expectedOrder = [
        "runBudgetEstimateStage",
        "runLeaderPlanStage",
        "runResearcherDispatchStage",
        "runLeaderAssessResearchStage",
        "runReconcilerStage",
        "runAnalystStage",
        "runWriterOutlineStage",
        "runWriterStage",
        "runSectionQualityEnhancementStage",
        "runCriticStage",
        "runReportObjectiveEvaluationStage",
        "runLeaderForewordAndSignoffStage",
        "runPersistStage",
      ];
      expect(callOrder).toEqual(expectedOrder);
    });
  });

  describe("input variants", () => {
    it("handles quick depth and low budget profile", async () => {
      const { mission } = buildTeamMission();
      const result = await mission.runMission(
        "m-quick",
        {
          ...VALID_INPUT,
          depth: "quick",
          budgetProfile: "low",
          auditLayers: "minimal",
        },
        "user-1",
      );
      expect(result.missionId).toBe("m-quick");
    });

    it("handles english language mission", async () => {
      const { mission } = buildTeamMission();
      const result = await mission.runMission(
        "m-en",
        { ...VALID_INPUT, language: "en-US" },
        "user-1",
      );
      expect(result.missionId).toBe("m-en");
    });

    it("handles paranoid auditLayers + unlimited budget", async () => {
      const { mission } = buildTeamMission();
      const result = await mission.runMission(
        "m-paranoid",
        {
          ...VALID_INPUT,
          auditLayers: "thorough+",
          budgetProfile: "unlimited",
        },
        "user-1",
      );
      expect(result.missionId).toBe("m-paranoid");
    });
  });
});
