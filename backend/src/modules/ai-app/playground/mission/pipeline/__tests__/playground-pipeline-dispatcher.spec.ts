/**
 * PlaygroundPipelineDispatcher spec（#16b 硬切后：能力轨唯一执行轨）
 *
 * 硬切后 dispatcher 是薄运行时壳：openSession → runViaCapabilityRunner（消费
 * deep-insight 能力核）→ 终态收口（postlude / cleanup / 失败分类）。14 阶段执行
 * 正确性由能力层 pipeline-14-stage.spec 覆盖；本 spec 只锁 dispatcher 独有的
 * runtime-glue：
 *   1. completed → 返回 completed + session 清理 + electionTracker.clear + 调能力 runner
 *   2. 能力 runner 不可用（registry 缺/未注册）→ 返回 failed（不 throw）
 *   3. 失败分类（handleMissionFailure 按 abort signal.reason）：user_cancelled /
 *      budget_exhausted / mission_wall_time_exceeded
 *   4. 增量复用透传：inheritFromMissionId 场景 inheritedBaseline 下沉给能力 runner（#16a）
 */
// ★ #16b env2（2026-06-09）：runSelfEvolutionStage import 已从 playground.pipeline.ts 删除。
// S12 postlude 现由能力核 deep-insight.runner.ts（assembleCompleted → fireSelfEvolutionPostlude）
// 负责，dispatcher 不再双写，mock 随之移除。

import { PlaygroundPipelineDispatcher } from "../playground.pipeline";
import { PlaygroundBusinessOrchestrator } from "../playground-business-orchestrator.service";
import type { MissionRuntimeShellService } from "../mission-runtime-shell.service";
import type { MissionRuntimeSession } from "../mission-runtime-shell.service";
import type { AgentInvoker, LeaderService } from "../../roles";
import type {
  CapabilityRunContext,
  CapabilityRunInput,
} from "@/modules/ai-app/marketplace/capability";

// ─── fake capability runner + registry ─────────────────────────────────────────

interface RunnerBehavior {
  status: "completed" | "failed";
  stageOutputs?: Readonly<Record<string, unknown>>;
  error?: string;
}

function makeFakeCapabilityRunner(behavior: RunnerBehavior) {
  const calls: Array<{ input: CapabilityRunInput; ctx: CapabilityRunContext }> =
    [];
  const run = jest.fn(
    async (input: CapabilityRunInput, ctx: CapabilityRunContext) => {
      calls.push({ input, ctx });
      void ctx.onEvent?.({ type: "started", timestamp: 1 });
      // 终态经 persistence 端口仲裁（与真 runner 一致）。
      await ctx.persistence?.applyTerminalIfRunning(
        ctx.missionId,
        behavior.status === "completed" ? "completed" : "failed",
        {},
      );
      if (behavior.status === "completed") {
        void ctx.onEvent?.({ type: "completed", timestamp: 2 });
      }
      return {
        status: behavior.status,
        stageOutputs: behavior.stageOutputs ?? {},
        ...(behavior.error ? { error: behavior.error } : {}),
      };
    },
  );
  return { run, calls, manifest: { id: "deep-insight", kind: "workflow" } };
}

function makeFakeCapabilityRegistry(
  runner: ReturnType<typeof makeFakeCapabilityRunner> | undefined,
) {
  return {
    resolve: jest.fn((id: string) =>
      id === "deep-insight" ? runner : undefined,
    ),
  };
}

// ─── shared deps ────────────────────────────────────────────────────────────────

function makeFakeSession(
  missionId: string,
  userId: string,
  abortController = new AbortController(),
  snapshot = { poolTokensUsed: 0, poolCostUsd: 0 },
) {
  return {
    missionId,
    userId,
    workspaceId: undefined,
    billing: {
      estimateAffordable: jest.fn().mockResolvedValue({
        affordable: true,
        estimatedCredits: 100,
        currentBalance: 1000,
      }),
    },
    pool: { snapshot: () => snapshot } as never,
    budgetMultiplier: 1,
    missionAbort: abortController,
    wallTimeMs: 60_000,
    cleanup: jest.fn(),
  } as unknown as MissionRuntimeSession;
}

interface MakeBundleOpts {
  runnerBehavior?: RunnerBehavior;
  withRunner?: boolean;
  session?: MissionRuntimeSession;
  storeOverrides?: Record<string, jest.Mock>;
}

function makeDispatcherBundle(opts: MakeBundleOpts = {}) {
  const runner =
    opts.withRunner === false
      ? undefined
      : makeFakeCapabilityRunner(
          opts.runnerBehavior ?? { status: "completed" },
        );
  const capabilityRegistry = makeFakeCapabilityRegistry(runner);

  const fakeLeaderService = {
    create: jest.fn().mockReturnValue({ plan: jest.fn() } as never),
  } as unknown as LeaderService;
  const fakeInvoker = {
    invoke: jest
      .fn()
      .mockResolvedValue({ state: "completed", output: {}, events: [] }),
    emitEvent: jest.fn().mockResolvedValue(undefined),
    emitLifecycle: jest.fn().mockResolvedValue(undefined),
    clearMissionRelayState: jest.fn(),
  } as unknown as AgentInvoker;
  const fakeLeaderInvocationFactory = {
    build: jest.fn().mockReturnValue(jest.fn()),
  };
  const fakeCheckpoint = {
    clear: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    canResume: jest.fn().mockResolvedValue({
      canResume: false,
      reason: "no-checkpoint",
      snapshot: null,
      completedKeys: new Set(),
    }),
  };
  const fakeStore = {
    markStageComplete: jest.fn().mockResolvedValue(undefined),
    applyTerminalIfRunning: jest.fn().mockResolvedValue(true),
    asPersistencePort: jest.fn(),
    getById: jest.fn().mockResolvedValue(null),
    loadBaselineResearchResults: jest.fn().mockResolvedValue([]),
    loadQualifiedChapterDrafts: jest.fn().mockResolvedValue([]),
    saveResearchResult: jest.fn().mockResolvedValue(undefined),
    saveChapterDraft: jest.fn().mockResolvedValue(undefined),
    saveReportVersion: jest.fn().mockResolvedValue(1),
    markIntermediateState: jest.fn().mockResolvedValue(undefined),
    ...opts.storeOverrides,
  };
  // asPersistencePort 返回一个最小端口（能力 runner 经 ctx.persistence 调 applyTerminalIfRunning）。
  const persistencePort = {
    markStageProgress: jest.fn().mockResolvedValue(undefined),
    saveCheckpoint: jest.fn().mockResolvedValue(true),
    loadCheckpoint: jest.fn().mockResolvedValue(null),
    clearCheckpoint: jest.fn().mockResolvedValue(undefined),
    applyTerminalIfRunning: jest.fn().mockResolvedValue(true),
  };
  fakeStore.asPersistencePort.mockReturnValue(persistencePort);

  const fakeElectionTracker = { clear: jest.fn() };
  const fakeEventBus = {
    emit: jest.fn().mockResolvedValue(true),
    registerAdapter: jest.fn(),
    unregisterAdapter: jest.fn(),
  };
  const session = opts.session;
  const shell = {
    sessions: new Map<string, MissionRuntimeSession>(),
    async openSession(args: { missionId: string; userId: string }) {
      const s = session ?? makeFakeSession(args.missionId, args.userId);
      return s;
    },
    async runWithinContext<T>(_s: unknown, fn: () => Promise<T>) {
      return fn();
    },
  } as unknown as MissionRuntimeShellService;

  const businessOrch = new PlaygroundBusinessOrchestrator();
  const fakeLifecycleManager = {
    finalize: jest.fn(
      async (args: {
        missionId: string;
        intent: unknown;
        arbiter: {
          applyTerminalIfRunning: (id: string, i: unknown) => Promise<boolean>;
        };
        onWon?: () => Promise<void>;
      }) => {
        const won = await args.arbiter.applyTerminalIfRunning(
          args.missionId,
          args.intent,
        );
        if (won && args.onWon) await args.onWon().catch(() => {});
        return { won };
      },
    ),
  };
  const fakeMissionSpan = {
    startMissionSpan: jest.fn(),
    endMissionSpan: jest.fn(),
    startStageSpan: jest.fn(),
    endStageSpan: jest.fn(),
  };
  const fakeFailedPreset = { notify: jest.fn().mockResolvedValue(undefined) };

  const dispatcher = new PlaygroundPipelineDispatcher(
    shell,
    fakeLeaderService,
    fakeInvoker,
    fakeLeaderInvocationFactory as never,
    fakeCheckpoint as never,
    fakeStore as never,
    fakeElectionTracker as never,
    fakeEventBus as never,
    businessOrch,
    fakeLifecycleManager as never,
    fakeMissionSpan as never,
    fakeFailedPreset as never,
    undefined,
    capabilityRegistry as never,
  );
  dispatcher.onModuleInit();

  return {
    dispatcher,
    runner,
    capabilityRegistry,
    invoker: fakeInvoker,
    failedPreset: fakeFailedPreset,
    electionTracker: fakeElectionTracker,
    store: fakeStore,
  };
}

const RUN_INPUT = {
  topic: "test",
  depth: "quick",
  language: "zh-CN",
  budgetProfile: "low",
  styleProfile: "executive",
  lengthProfile: "brief",
  audienceProfile: "domain-expert",
  withFigures: false,
  auditLayers: "default",
  concurrency: 1,
  viewMode: "continuous",
  maxCredits: 50,
} as never;

describe("PlaygroundPipelineDispatcher（#16b 能力轨唯一执行轨）", () => {
  it("completed：经能力 runner 跑通 → 返回 completed + session 清理 + electionTracker.clear", async () => {
    const { dispatcher, runner, electionTracker } = makeDispatcherBundle({
      runnerBehavior: { status: "completed" },
    });
    const result = await dispatcher.runMission("m1", RUN_INPUT, "u1");
    expect(result.status).toBe("completed");
    expect(result.missionId).toBe("m1");
    // 能力 runner 被调一次（deep-insight）。
    expect(runner!.run).toHaveBeenCalledTimes(1);
    // session 在 finally 被清（getSession 抛错）。
    expect(() => dispatcher.getSession("m1")).toThrow(/no active session/);
    // election state 清理（finally）。
    expect(electionTracker.clear).toHaveBeenCalledWith("m1");
  });

  it("能力 runner 不可用（registry resolve 返回 undefined）→ 返回 failed，不 throw", async () => {
    const { dispatcher } = makeDispatcherBundle({ withRunner: false });
    const result = await dispatcher.runMission("m-no-runner", RUN_INPUT, "u1");
    expect(result.status).toBe("failed");
  });

  it("getSession 不存在 missionId 抛错", () => {
    const { dispatcher } = makeDispatcherBundle();
    expect(() => dispatcher.getSession("never-existed")).toThrow(
      /no active session/,
    );
  });

  it("增量复用透传（#16a）：inheritFromMissionId → inheritedBaseline 下沉给能力 runner", async () => {
    const baselineResearch = [
      {
        dimension: "维度一",
        findings: [{ claim: "c", evidence: "e", source: "https://x" }],
        summary: "s",
      },
    ];
    const { dispatcher, runner } = makeDispatcherBundle({
      runnerBehavior: { status: "completed" },
      storeOverrides: {
        // hydrateInheritedPlan：source mission 有 dimensions。
        getById: jest.fn().mockResolvedValue({
          dimensions: [{ id: "d1", name: "维度一", rationale: "r" }],
          themeSummary: "继承主题",
        }),
        // hydrateInheritedResearchResults：上次各维 researcher 产物。
        loadBaselineResearchResults: jest
          .fn()
          .mockResolvedValue(baselineResearch),
        loadQualifiedChapterDrafts: jest.fn().mockResolvedValue([]),
        saveResearchResult: jest.fn().mockResolvedValue(undefined),
      },
    });
    await dispatcher.runMission(
      "m-inherit",
      { ...(RUN_INPUT as object), inheritFromMissionId: "src-1" } as never,
      "u1",
    );
    const capInput = runner!.calls[0]?.input;
    expect(capInput?.inheritedBaseline).toBeDefined();
    expect(capInput?.inheritedBaseline?.plan).toBeDefined();
    expect(capInput?.inheritedBaseline?.researcherResults).toEqual(
      baselineResearch,
    );
  });

  // ─── 失败分类（handleMissionFailure 按 abort signal.reason）────────────────────
  describe("handleMissionFailure abort signal.reason 分类", () => {
    function bundleWithAbortedSession(reason: string) {
      const ac = new AbortController();
      ac.abort(reason);
      const session = makeFakeSession("m-abort", "u1", ac, {
        poolTokensUsed: 500,
        poolCostUsd: 0.05,
      });
      return makeDispatcherBundle({
        runnerBehavior: { status: "failed", error: "capability failed" },
        session,
      });
    }

    it("user_cancelled → 不 emit mission:failed + 不发失败通知", async () => {
      const { dispatcher, invoker, failedPreset } =
        bundleWithAbortedSession("user_cancelled");
      const result = await dispatcher.runMission("m-abort", RUN_INPUT, "u1");
      expect(["failed", "aborted"]).toContain(result.status);
      const failedEmit = (invoker.emitEvent as jest.Mock).mock.calls.find(
        (c) => (c[0] as { type: string }).type === "playground.mission:failed",
      );
      expect(failedEmit).toBeUndefined();
      expect(failedPreset.notify).not.toHaveBeenCalled();
    });

    it("budget_exhausted → failureCode=BUDGET_EXHAUSTED + 发失败通知一次", async () => {
      const { dispatcher, invoker, failedPreset } =
        bundleWithAbortedSession("budget_exhausted");
      await dispatcher.runMission("m-abort", RUN_INPUT, "u1");
      const failedEmit = (invoker.emitEvent as jest.Mock).mock.calls.find(
        (c) => (c[0] as { type: string }).type === "playground.mission:failed",
      );
      expect(failedEmit).toBeDefined();
      expect(
        (failedEmit![0] as { payload: { failureCode: string } }).payload
          .failureCode,
      ).toBe("BUDGET_EXHAUSTED");
      expect(failedPreset.notify).toHaveBeenCalledTimes(1);
      expect(failedPreset.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u1",
          missionId: "m-abort",
          failureCode: "BUDGET_EXHAUSTED",
        }),
      );
    });

    it("mission_wall_time_exceeded → failureCode=RUNNER_WALL_TIME_EXCEEDED", async () => {
      const { dispatcher, invoker } = bundleWithAbortedSession(
        "mission_wall_time_exceeded",
      );
      await dispatcher.runMission("m-abort", RUN_INPUT, "u1");
      const failedEmit = (invoker.emitEvent as jest.Mock).mock.calls.find(
        (c) => (c[0] as { type: string }).type === "playground.mission:failed",
      );
      expect(failedEmit).toBeDefined();
      expect(
        (failedEmit![0] as { payload: { failureCode: string } }).payload
          .failureCode,
      ).toBe("RUNNER_WALL_TIME_EXCEEDED");
    });
  });
});
