/**
 * MissionStageBindingsService unit tests
 * Targets: src/modules/ai-app/playground/mission/pipeline/mission-stage-bindings.service.ts
 */

// Mock all heavy dependencies at module level
jest.mock("@/modules/ai-harness/facade", () => {
  class BusinessTeamStageBindingsFramework {
    protected log = { warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    constructor(_name: string) {}
  }
  return {
    BusinessTeamStageBindingsFramework,
    LeaderService: jest.fn(),
    ReconcilerService: jest.fn(),
    AnalystService: jest.fn(),
    WriterService: jest.fn(),
    ReviewerService: jest.fn(),
    VerifierService: jest.fn(),
    StewardService: jest.fn(),
    AgentInvoker: jest.fn(),
    HandoffCompactorService: jest.fn(),
    MissionAbortRegistry: jest.fn(),
    AgentRunner: jest.fn(),
    JudgeService: jest.fn(),
    MemoryAutoIndexer: jest.fn(),
    EventBus: jest.fn(),
    FailureLearnerService: jest.fn(),
    ReportArtifactAssembler: jest.fn(),
    FigureRelevanceService: jest.fn(),
    SectionSelfEvalService: jest.fn(),
    SectionRemediationService: jest.fn(),
    ReportEvaluationService: jest.fn(),
    QualityTraceComputeService: jest.fn(),
    PostmortemClassifierService: jest.fn(),
    MissionLifecycleManager: jest.fn(),
    RuntimeEnvironmentService: jest.fn(),
  };
});

jest.mock("@/modules/ai-engine/facade", () => ({
  FigureExtractorService: jest.fn(),
}));

jest.mock(
  "@/modules/ai-app/playground/mission/lifecycle/mission-store.service",
  () => ({
    MissionStore: jest.fn(),
    MissionConcurrencyLimitError: class extends Error {},
  }),
);

jest.mock(
  "@/modules/ai-app/playground/api/contracts/step-id-mapping.contract",
  () => ({
    mapStepIdToFrontendStageId: jest.fn(
      (stepId: string) => `frontend_${stepId}`,
    ),
  }),
);

jest.mock("@/modules/platform/credits/credits.service", () => ({
  CreditsService: jest.fn(),
}));

jest.mock("@/modules/ai-app/playground/mission/roles", () => ({
  LeaderService: jest.fn(),
  ReconcilerService: jest.fn(),
  AnalystService: jest.fn(),
  WriterService: jest.fn(),
  ReviewerService: jest.fn(),
  VerifierService: jest.fn(),
  StewardService: jest.fn(),
  AgentInvoker: jest.fn(),
  SupervisedMission: jest.fn(),
}));

jest.mock(
  "@/modules/ai-app/playground/mission/context/mission-context",
  () => ({}),
);
jest.mock(
  "@/modules/ai-app/playground/mission/context/mission-deps",
  () => ({}),
);
jest.mock("@/modules/ai-app/playground/api/dto/run-mission.dto", () => ({}));

import { MissionStageBindingsService } from "../mission-stage-bindings.service";
import { mapStepIdToFrontendStageId } from "@/modules/ai-app/playground/api/contracts/step-id-mapping.contract";

// ---------------------------------------------------------------------------
// Helpers to build all 26 mock deps
// ---------------------------------------------------------------------------

function makeMockInvoker() {
  return {
    emitEvent: jest.fn().mockResolvedValue(undefined),
    emitLifecycle: jest.fn().mockResolvedValue(undefined),
  };
}

function makeAllDeps() {
  const invoker = makeMockInvoker();
  return {
    leaderService: {},
    reconcilerService: {},
    analystService: {},
    writerService: {},
    reviewerService: {},
    verifierService: {},
    stewardService: {},
    invoker,
    store: {},
    missionState: {},
    abortRegistry: {},
    runner: {},
    judge: {},
    indexer: {},
    eventBus: {},
    credits: {},
    runtimeEnv: {},
    failureLearner: {},
    reportAssembler: {},
    figureExtractor: {},
    figureRelevance: {},
    sectionSelfEval: {},
    sectionRemediation: {},
    reportEvaluation: {},
    qualityTraceCompute: {},
    postmortemClassifier: {},
    lifecycleManager: {},
  };
}

function makeService(deps = makeAllDeps()) {
  return new MissionStageBindingsService(
    deps.leaderService as never,
    deps.reconcilerService as never,
    deps.analystService as never,
    deps.writerService as never,
    deps.reviewerService as never,
    deps.verifierService as never,
    deps.stewardService as never,
    deps.invoker as never,
    deps.store as never,
    deps.missionState as never,
    deps.abortRegistry as never,
    deps.runner as never,
    deps.judge as never,
    deps.indexer as never,
    deps.eventBus as never,
    deps.credits as never,
    deps.runtimeEnv as never,
    deps.failureLearner as never,
    deps.reportAssembler as never,
    deps.figureExtractor as never,
    deps.figureRelevance as never,
    deps.sectionSelfEval as never,
    deps.sectionRemediation as never,
    deps.reportEvaluation as never,
    deps.qualityTraceCompute as never,
    deps.postmortemClassifier as never,
    deps.lifecycleManager as never,
  );
}

function makeCtxArgs(overrides = {}) {
  return {
    missionId: "m1",
    userId: "u1",
    input: { topic: "AI", depth: "deep" } as never,
    t0: Date.now(),
    billing: {} as never,
    pool: {} as never,
    leader: {} as never,
    budgetMultiplier: 1.0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MissionStageBindingsService", () => {
  let deps: ReturnType<typeof makeAllDeps>;
  let service: MissionStageBindingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    deps = makeAllDeps();
    service = makeService(deps);
  });

  // ── buildCtx ─────────────────────────────────────────────────────────────

  describe("buildCtx", () => {
    it("maps required fields from args to MissionContext", () => {
      const args = makeCtxArgs();
      const ctx = service.buildCtx(args);

      expect(ctx.missionId).toBe("m1");
      expect(ctx.userId).toBe("u1");
      expect(ctx.input).toBe(args.input);
      expect(ctx.t0).toBe(args.t0);
      expect(ctx.billing).toBe(args.billing);
      expect(ctx.pool).toBe(args.pool);
      expect(ctx.leader).toBe(args.leader);
      expect(ctx.budgetMultiplier).toBe(1.0);
    });

    it("maps optional fields when provided", () => {
      const plan = { dimensions: ["tech", "market"] };
      const researcherResults = [{ dimension: "tech", findings: [] }];
      const reconciliationReport = { summary: "done" };
      const reportArtifact = { kind: "report-v2" };
      const report = { fullMarkdown: "# Report" };
      const reviewScore = 85;
      const verifierVerdicts = [{ passed: true }];

      const args = makeCtxArgs({
        plan,
        researcherResults,
        reconciliationReport,
        reportArtifact,
        report,
        reviewScore,
        verifierVerdicts,
      });
      const ctx = service.buildCtx(args);

      expect(ctx.plan).toBe(plan);
      expect(ctx.researcherResults).toBe(researcherResults);
      expect(ctx.reconciliationReport).toBe(reconciliationReport);
      expect(ctx.reportArtifact).toBe(reportArtifact);
      expect(ctx.report).toBe(report);
      expect(ctx.reviewScore).toBe(85);
      expect(ctx.verifierVerdicts).toBe(verifierVerdicts);
    });

    it("maps sharedState.s4PatchFailures from sharedState", () => {
      const failures = [{ stage: 1, error: "fail" }];
      const args = makeCtxArgs({
        sharedState: { s4PatchFailures: failures },
      });
      const ctx = service.buildCtx(args);

      expect(ctx.s4PatchFailures).toBe(failures);
    });

    it("sets undefined optional fields to undefined when not provided", () => {
      const args = makeCtxArgs(); // no optional fields
      const ctx = service.buildCtx(args);

      expect(ctx.plan).toBeUndefined();
      expect(ctx.researcherResults).toBeUndefined();
      expect(ctx.reconciliationReport).toBeUndefined();
      expect(ctx.reportArtifact).toBeUndefined();
      expect(ctx.report).toBeUndefined();
      expect(ctx.reviewScore).toBeUndefined();
      expect(ctx.verifierVerdicts).toBeUndefined();
    });

    it("sets s4PatchFailures to undefined when sharedState is not provided", () => {
      const args = makeCtxArgs({ sharedState: undefined });
      const ctx = service.buildCtx(args);

      expect(ctx.s4PatchFailures).toBeUndefined();
    });
  });

  // ── buildDeps ─────────────────────────────────────────────────────────────

  describe("buildDeps", () => {
    it("returns all injected services as MissionDeps", () => {
      const mDeps = service.buildDeps();

      expect(mDeps.leader).toBe(deps.leaderService);
      expect(mDeps.reconciler).toBe(deps.reconcilerService);
      expect(mDeps.analyst).toBe(deps.analystService);
      expect(mDeps.writer).toBe(deps.writerService);
      expect(mDeps.reviewer).toBe(deps.reviewerService);
      expect(mDeps.verifier).toBe(deps.verifierService);
      expect(mDeps.steward).toBe(deps.stewardService);
      expect(mDeps.invoker).toBe(deps.invoker);
      expect(mDeps.store).toBe(deps.store);
      expect(mDeps.lifecycleManager).toBe(deps.lifecycleManager);
      expect(mDeps.missionState).toBe(deps.missionState);
      expect(mDeps.abortRegistry).toBe(deps.abortRegistry);
      expect(mDeps.runner).toBe(deps.runner);
      expect(mDeps.judge).toBe(deps.judge);
      expect(mDeps.indexer).toBe(deps.indexer);
      expect(mDeps.eventBus).toBe(deps.eventBus);
      expect(mDeps.credits).toBe(deps.credits);
      expect(mDeps.runtimeEnv).toBe(deps.runtimeEnv);
      expect(mDeps.failureLearner).toBe(deps.failureLearner);
      expect(mDeps.reportAssembler).toBe(deps.reportAssembler);
      expect(mDeps.figureExtractor).toBe(deps.figureExtractor);
      expect(mDeps.figureRelevance).toBe(deps.figureRelevance);
      expect(mDeps.sectionSelfEval).toBe(deps.sectionSelfEval);
      expect(mDeps.sectionRemediation).toBe(deps.sectionRemediation);
      expect(mDeps.reportEvaluation).toBe(deps.reportEvaluation);
      expect(mDeps.qualityTraceCompute).toBe(deps.qualityTraceCompute);
      expect(mDeps.postmortemClassifier).toBe(deps.postmortemClassifier);
    });

    it("provides emit function bound to invoker.emitEvent", async () => {
      const mDeps = service.buildDeps();

      await mDeps.emit({
        type: "test",
        missionId: "m1",
        userId: "u1",
        payload: {},
      });

      expect(deps.invoker.emitEvent).toHaveBeenCalledWith({
        type: "test",
        missionId: "m1",
        userId: "u1",
        payload: {},
      });
    });

    it("provides lifecycle function bound to invoker.emitLifecycle", async () => {
      const mDeps = service.buildDeps();

      await mDeps.lifecycle({ type: "started", missionId: "m1" });

      expect(deps.invoker.emitLifecycle).toHaveBeenCalledWith({
        type: "started",
        missionId: "m1",
      });
    });

    it("provides log from framework base class", () => {
      const mDeps = service.buildDeps();
      expect(mDeps.log).toBeDefined();
    });
  });

  // ── buildDeps.markStageDegraded ───────────────────────────────────────────

  describe("buildDeps.markStageDegraded", () => {
    it("emits playground.stage:degraded event with correct payload", async () => {
      (mapStepIdToFrontendStageId as jest.Mock).mockReturnValueOnce("research");
      const mDeps = service.buildDeps();

      await mDeps.markStageDegraded("m1", "u1", "step_3", "Search failed");

      expect(deps.invoker.emitEvent).toHaveBeenCalledWith({
        type: "playground.stage:degraded",
        missionId: "m1",
        userId: "u1",
        payload: {
          stage: "research",
          stepId: "step_3",
          reason: "Search failed",
        },
      });
    });

    it("maps stepId to frontend stage id via mapStepIdToFrontendStageId", async () => {
      (mapStepIdToFrontendStageId as jest.Mock).mockReturnValueOnce("writing");
      const mDeps = service.buildDeps();

      await mDeps.markStageDegraded("m1", "u1", "step_writer", "Writer failed");

      expect(mapStepIdToFrontendStageId).toHaveBeenCalledWith("step_writer");
      expect(deps.invoker.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ stage: "writing" }),
        }),
      );
    });

    it("truncates reason to 500 characters", async () => {
      const mDeps = service.buildDeps();
      const longReason = "x".repeat(600);

      await mDeps.markStageDegraded("m1", "u1", "step_1", longReason);

      const payload = deps.invoker.emitEvent.mock.calls[0][0].payload;
      expect(payload.reason.length).toBe(500);
    });

    it("passes reason unchanged when shorter than 500 chars", async () => {
      const mDeps = service.buildDeps();
      const shortReason = "Brief failure";

      await mDeps.markStageDegraded("m1", "u1", "step_1", shortReason);

      const payload = deps.invoker.emitEvent.mock.calls[0][0].payload;
      expect(payload.reason).toBe("Brief failure");
    });

    it("includes correct missionId and userId in degraded event", async () => {
      const mDeps = service.buildDeps();

      await mDeps.markStageDegraded(
        "mission-xyz",
        "user-abc",
        "step_1",
        "Error",
      );

      expect(deps.invoker.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          missionId: "mission-xyz",
          userId: "user-abc",
        }),
      );
    });
  });
});
