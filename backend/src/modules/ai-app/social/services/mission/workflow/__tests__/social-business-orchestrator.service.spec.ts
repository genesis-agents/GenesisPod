/**
 * Unit tests for SocialBusinessOrchestrator
 * Covers: bindSessionLookup, buildHooksForStep (all 12 stages),
 *          abort-signal check, error on unknown stepId, getEntry guard.
 */

import { SocialBusinessOrchestrator } from "../social-business-orchestrator.service";

// ---------------------------------------------------------------------------
// Mock all stage runner imports so we don't pull in real implementations
// ---------------------------------------------------------------------------
jest.mock("../stages", () => ({
  runMissionBudgetEvalStage: jest.fn().mockResolvedValue(undefined),
  runPlatformProbeStage: jest.fn().mockResolvedValue(undefined),
  runContentTransformStage: jest.fn().mockResolvedValue(undefined),
  runLeaderAssessTransformStage: jest.fn().mockResolvedValue(undefined),
  runCoverCraftStage: jest.fn().mockResolvedValue(undefined),
  runBodyComposeStage: jest.fn().mockResolvedValue(undefined),
  runPolishReviewStage: jest.fn().mockResolvedValue(undefined),
  runPublishExecuteStage: jest.fn().mockResolvedValue(undefined),
  runPublishRetryStage: jest.fn().mockResolvedValue(undefined),
  runPublishVerifyStage: jest.fn().mockResolvedValue(undefined),
  runLeaderSignoffStage: jest.fn().mockResolvedValue(undefined),
  runMissionPersistStage: jest.fn().mockResolvedValue(undefined),
}));

import {
  runMissionBudgetEvalStage,
  runPlatformProbeStage,
  runContentTransformStage,
  runLeaderAssessTransformStage,
  runCoverCraftStage,
  runBodyComposeStage,
  runPolishReviewStage,
  runPublishExecuteStage,
  runPublishRetryStage,
  runPublishVerifyStage,
  runLeaderSignoffStage,
  runMissionPersistStage,
} from "../stages";

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

const MOCK_MISSION_ID = "mission-biz-orch";

function makeSessionEntry(missionId = MOCK_MISSION_ID) {
  return {
    ctx: { missionId, userId: "user-99" },
    deps: { invoker: {}, eventBus: {} },
    session: {},
    t0: Date.now(),
    input: {},
    workspaceId: undefined,
  };
}

function makeHookArgs(missionId = MOCK_MISSION_ID, aborted = false) {
  const controller = new AbortController();
  if (aborted) controller.abort();
  return {
    ctx: { missionId, signal: controller.signal },
    previousOutputs: [],
    crossStageState: {},
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StageStub =
  | typeof runMissionBudgetEvalStage
  | typeof runPlatformProbeStage
  | typeof runContentTransformStage;

function clearAllStageMocks() {
  [
    runMissionBudgetEvalStage,
    runPlatformProbeStage,
    runContentTransformStage,
    runLeaderAssessTransformStage,
    runCoverCraftStage,
    runBodyComposeStage,
    runPolishReviewStage,
    runPublishExecuteStage,
    runPublishRetryStage,
    runPublishVerifyStage,
    runLeaderSignoffStage,
    runMissionPersistStage,
  ].forEach((fn) => (fn as jest.Mock).mockClear());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SocialBusinessOrchestrator", () => {
  let orch: SocialBusinessOrchestrator;

  beforeEach(() => {
    orch = new SocialBusinessOrchestrator();
    clearAllStageMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // STAGE_NUMBER
  // =========================================================================

  describe("STAGE_NUMBER", () => {
    it("should expose correct stage number map", () => {
      expect(orch.STAGE_NUMBER["s1-mission-budget-eval"]).toBe(1);
      expect(orch.STAGE_NUMBER["s8-publish-execute"]).toBe(8);
      expect(orch.STAGE_NUMBER["s8b-publish-retry"]).toBe(8);
      expect(orch.STAGE_NUMBER["s11-mission-persist"]).toBe(11);
    });
  });

  // =========================================================================
  // bindSessionLookup
  // =========================================================================

  describe("bindSessionLookup", () => {
    it("should bind the lookup function successfully", () => {
      const lookup = jest.fn().mockReturnValue(makeSessionEntry());
      orch.bindSessionLookup(lookup);

      // After binding, getEntry should work (via buildHooksForStep + hook execute)
      expect(() => orch.bindSessionLookup(lookup)).not.toThrow();
    });
  });

  // =========================================================================
  // buildHooksForStep — unknown stepId
  // =========================================================================

  describe("buildHooksForStep — unknown stepId", () => {
    it("should throw for an unrecognised stepId", () => {
      expect(() =>
        orch.buildHooksForStep("s99-nonexistent", "persist"),
      ).toThrow(/no stage runner/i);
    });
  });

  // =========================================================================
  // buildHooksForStep — all 12 steps dispatch to correct stage runner
  // =========================================================================

  const STAGE_MAP: [string, StageStub][] = [
    ["s1-mission-budget-eval", runMissionBudgetEvalStage as StageStub],
    ["s2-platform-probe", runPlatformProbeStage as StageStub],
    ["s3-content-transform", runContentTransformStage as StageStub],
    ["s4-leader-assess-transform", runLeaderAssessTransformStage as StageStub],
    ["s5-cover-craft", runCoverCraftStage as StageStub],
    ["s6-body-compose", runBodyComposeStage as StageStub],
    ["s7-polish-review", runPolishReviewStage as StageStub],
    ["s8-publish-execute", runPublishExecuteStage as StageStub],
    ["s8b-publish-retry", runPublishRetryStage as StageStub],
    ["s9-publish-verify", runPublishVerifyStage as StageStub],
    ["s10-leader-signoff", runLeaderSignoffStage as StageStub],
    ["s11-mission-persist", runMissionPersistStage as StageStub],
  ];

  describe("buildHooksForStep — correct stage runner per stepId", () => {
    it.each(STAGE_MAP)(
      "stepId=%s should call the correct stage runner",
      async (stepId, expectedStage) => {
        const entry = makeSessionEntry();
        const lookup = jest.fn().mockReturnValue(entry);
        orch.bindSessionLookup(lookup);

        const hooks = orch.buildHooksForStep(stepId, "persist");
        expect(hooks).toHaveProperty("persist");
        expect(typeof hooks.persist).toBe("function");

        const hookArgs = makeHookArgs();
        await hooks.persist!(hookArgs);

        expect(expectedStage).toHaveBeenCalledWith(entry.ctx, entry.deps);
        expect(lookup).toHaveBeenCalledWith(MOCK_MISSION_ID);
      },
    );
  });

  // =========================================================================
  // buildHooksForStep — abort signal check
  // =========================================================================

  describe("buildHooksForStep — abort signal check", () => {
    it("should throw StageAbortError when signal is already aborted", async () => {
      const entry = makeSessionEntry();
      const lookup = jest.fn().mockReturnValue(entry);
      orch.bindSessionLookup(lookup);

      const hooks = orch.buildHooksForStep("s1-mission-budget-eval", "persist");
      const abortedArgs = makeHookArgs(MOCK_MISSION_ID, true);

      await expect(hooks.persist!(abortedArgs)).rejects.toThrow(
        /aborted|cancelled|abort/i,
      );
      // stage runner should NOT have been called
      expect(runMissionBudgetEvalStage).not.toHaveBeenCalled();
    });

    it("should proceed normally when signal is NOT aborted", async () => {
      const entry = makeSessionEntry();
      const lookup = jest.fn().mockReturnValue(entry);
      orch.bindSessionLookup(lookup);

      const hooks = orch.buildHooksForStep("s3-content-transform", "persist");
      const normalArgs = makeHookArgs(MOCK_MISSION_ID, false);

      await hooks.persist!(normalArgs);

      expect(runContentTransformStage).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // buildHooksForStep — sessionLookup not bound guard
  // =========================================================================

  describe("buildHooksForStep — sessionLookup not bound", () => {
    it("should throw when sessionLookup has not been bound", async () => {
      // orch created without bindSessionLookup
      const hooks = orch.buildHooksForStep("s2-platform-probe", "persist");
      const hookArgs = makeHookArgs();

      await expect(hooks.persist!(hookArgs)).rejects.toThrow(
        /sessionLookup not bound/i,
      );
    });
  });

  // =========================================================================
  // buildHooksForStep — sessionLookup throws (no active session)
  // =========================================================================

  describe("buildHooksForStep — sessionLookup returns missing session", () => {
    it("should propagate error from sessionLookup when mission not found", async () => {
      const lookup = jest.fn().mockImplementation(() => {
        throw new Error("no active session for mission missing-id");
      });
      orch.bindSessionLookup(lookup);

      const hooks = orch.buildHooksForStep(
        "s4-leader-assess-transform",
        "persist",
      );
      const hookArgs = makeHookArgs("missing-id", false);

      await expect(hooks.persist!(hookArgs)).rejects.toThrow(
        /no active session/i,
      );
    });
  });

  // =========================================================================
  // hooks return type — hooks object has persist property
  // =========================================================================

  describe("buildHooksForStep — returned hooks shape", () => {
    it("should return an object with a persist function", () => {
      const entry = makeSessionEntry();
      orch.bindSessionLookup(() => entry);

      const hooks = orch.buildHooksForStep("s5-cover-craft", "persist");

      expect(Object.keys(hooks)).toContain("persist");
      expect(hooks.persist).toBeInstanceOf(Function);
    });

    it("should create independent hooks for different stepIds", () => {
      const entry = makeSessionEntry();
      orch.bindSessionLookup(() => entry);

      const hooks1 = orch.buildHooksForStep("s6-body-compose", "persist");
      const hooks2 = orch.buildHooksForStep("s7-polish-review", "persist");

      expect(hooks1.persist).not.toBe(hooks2.persist);
    });
  });

  // =========================================================================
  // stage runner receives correct ctx + deps
  // =========================================================================

  describe("stage runner receives correct ctx and deps from session entry", () => {
    it("should pass entry.ctx and entry.deps to stage runner", async () => {
      const customCtx = {
        missionId: MOCK_MISSION_ID,
        userId: "custom-user",
        platforms: ["wechat"],
      };
      const customDeps = { invoker: { id: "custom-invoker" } };
      const entry = {
        ...makeSessionEntry(),
        ctx: customCtx,
        deps: customDeps,
      };
      orch.bindSessionLookup(
        () => entry as unknown as ReturnType<typeof makeSessionEntry>,
      );

      const hooks = orch.buildHooksForStep("s9-publish-verify", "persist");
      await hooks.persist!(makeHookArgs());

      expect(runPublishVerifyStage).toHaveBeenCalledWith(customCtx, customDeps);
    });
  });
});
