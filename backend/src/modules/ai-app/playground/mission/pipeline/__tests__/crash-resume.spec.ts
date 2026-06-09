/**
 * crash-resume.spec.ts
 *
 * R2-#37（#16b 硬切后更新）：verify PlaygroundPipelineDispatcher.runMission 仍正确
 * 用 missionCheckpoint.canResume() 探测 prior checkpoint 并把恢复的 crossState 落到
 * session entry。
 *
 * 注：硬切后 ON 路（能力轨）的"跳过已完成 stage"由能力核经 ctx.persistence.loadCheckpoint
 * 驱动（lastStepId 格式），dispatcher 不再把 resumeFromStepId 透传给执行器；故本 spec
 * 只断言 dispatcher 侧仍消费 canResume + 恢复 crossState（能力核内部 resume 由
 * pipeline-14-stage / 能力 spec 覆盖）。
 *
 * 末尾 #44 S4‖S5 是纯 MissionPipelineOrchestrator 测试（自建 orch/reg，不经 dispatcher），
 * 与硬切无关，原样保留。
 */
import {
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
} from "@/modules/ai-harness/facade";
import { PlaygroundPipelineDispatcher } from "../playground.pipeline";
import { PlaygroundBusinessOrchestrator } from "../playground-business-orchestrator.service";
import { PlaygroundCrossStageState } from "../playground-cross-stage-state";
import type { MissionRuntimeShellService } from "../mission-runtime-shell.service";
import type { MissionRuntimeSession } from "../mission-runtime-shell.service";
import type { MissionStageBindingsService } from "../mission-stage-bindings.service";
import type { AgentInvoker, LeaderService } from "../../roles";
import type {
  CapabilityRunContext,
  CapabilityRunInput,
} from "@/modules/ai-app/marketplace/capability";

// fireSelfEvolutionPostlude（S12 fire-and-forget）调 runSelfEvolutionStage —— stub。
jest.mock("../stages/s12-self-evolution.stage", () => ({
  runSelfEvolutionStage: jest.fn(async () => {}),
}));

// ─── shared test helpers ──────────────────────────────────────────────────────

function makeFakeSession(missionId: string, userId: string) {
  return {
    missionId,
    userId,
    billing: {
      estimateAffordable: jest.fn().mockResolvedValue({
        affordable: true,
        estimatedCredits: 10,
        currentBalance: 1000,
      }),
    },
    pool: { snapshot: () => ({ poolTokensUsed: 0, poolCostUsd: 0 }) } as never,
    budgetMultiplier: 1,
    missionAbort: new AbortController(),
    wallTimeMs: 60_000,
    cleanup: jest.fn(),
  } as unknown as MissionRuntimeSession;
}

/** fake capability runner —— 完成态；可选 onRun 回调（用于探测 dispatcher 内部状态）。 */
function makeFakeRunner(onRun?: (ctx: CapabilityRunContext) => void) {
  return {
    manifest: { id: "deep-insight", kind: "workflow" },
    run: jest.fn(
      async (_input: CapabilityRunInput, ctx: CapabilityRunContext) => {
        onRun?.(ctx);
        await ctx.persistence?.applyTerminalIfRunning(
          ctx.missionId,
          "completed",
          {},
        );
        return { status: "completed" as const, stageOutputs: {} };
      },
    ),
  };
}

function makeDispatcherBundle(
  checkpointMock: {
    canResume: boolean;
    snapshot: unknown;
    completedKeys?: Set<string>;
  } = { canResume: false, snapshot: null },
  onRun?: (ctx: CapabilityRunContext) => void,
) {
  const storeProxy = new Proxy({} as Record<string, jest.Mock>, {
    get(target, prop: string) {
      if (!(prop in target))
        target[prop] = jest.fn().mockResolvedValue(undefined);
      return target[prop];
    },
  });
  storeProxy.applyTerminalIfRunning = jest.fn().mockResolvedValue(true);
  storeProxy.asPersistencePort = jest.fn().mockReturnValue({
    markStageProgress: jest.fn().mockResolvedValue(undefined),
    saveCheckpoint: jest.fn().mockResolvedValue(true),
    loadCheckpoint: jest.fn().mockResolvedValue(null),
    clearCheckpoint: jest.fn().mockResolvedValue(undefined),
    applyTerminalIfRunning: jest.fn().mockResolvedValue(true),
  });
  storeProxy.getById = jest.fn().mockResolvedValue(null);
  storeProxy.loadBaselineResearchResults = jest.fn().mockResolvedValue([]);
  storeProxy.loadQualifiedChapterDrafts = jest.fn().mockResolvedValue([]);

  const fakeCheckpoint = {
    clear: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    canResume: jest.fn().mockResolvedValue({
      canResume: checkpointMock.canResume,
      snapshot: checkpointMock.snapshot,
      completedKeys: checkpointMock.completedKeys ?? new Set(),
      reason: checkpointMock.canResume ? "ok" : "no-checkpoint",
    }),
  };
  const fakeStageBindings = {
    buildDeps: jest.fn().mockReturnValue({
      store: storeProxy,
      log: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
      emit: jest.fn().mockResolvedValue(undefined),
      lifecycle: jest.fn(),
    }),
    buildCtx: jest.fn((args: Record<string, unknown>) => ({ ...args })),
  } as unknown as MissionStageBindingsService;

  const fakeLeaderService = {
    create: jest.fn().mockReturnValue({ plan: jest.fn() }),
  } as unknown as LeaderService;
  const fakeInvoker = {
    invoke: jest
      .fn()
      .mockResolvedValue({ state: "completed", output: {}, events: [] }),
    emitEvent: jest.fn().mockResolvedValue(undefined),
    emitLifecycle: jest.fn().mockResolvedValue(undefined),
    clearMissionRelayState: jest.fn(),
  } as unknown as AgentInvoker;
  const fakeEventBus = {
    emit: jest.fn().mockResolvedValue(true),
    registerAdapter: jest.fn(),
    unregisterAdapter: jest.fn(),
  };
  const fakeElectionTracker = { clear: jest.fn() };
  const fakeEventBuffer = {
    read: jest.fn().mockReturnValue([]),
    broadcast: jest.fn().mockResolvedValue(undefined),
  };
  const fakeLeaderInvocationFactory = {
    build: jest.fn().mockReturnValue(jest.fn()),
  };
  const shell: MissionRuntimeShellService = {
    openSession: jest
      .fn()
      .mockImplementation(async (args: { missionId: string; userId: string }) =>
        makeFakeSession(args.missionId, args.userId),
      ),
    runWithinContext: jest
      .fn()
      .mockImplementation(
        async (_session: unknown, fn: () => Promise<unknown>) => fn(),
      ),
  } as unknown as MissionRuntimeShellService;

  const businessOrch = new PlaygroundBusinessOrchestrator(
    fakeStageBindings,
    fakeCheckpoint as never,
    storeProxy as never,
  );
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
  const runner = makeFakeRunner(onRun);
  const capabilityRegistry = {
    resolve: jest.fn((id: string) =>
      id === "deep-insight" ? runner : undefined,
    ),
  };

  const dispatcher = new PlaygroundPipelineDispatcher(
    shell,
    fakeStageBindings,
    fakeLeaderService,
    fakeInvoker,
    fakeLeaderInvocationFactory as never,
    fakeCheckpoint as never,
    fakeEventBuffer as never,
    storeProxy as never,
    fakeElectionTracker as never,
    fakeEventBus as never,
    businessOrch,
    fakeLifecycleManager as never,
    fakeMissionSpan as never,
    undefined,
    undefined,
    capabilityRegistry as never,
  );
  dispatcher.onModuleInit();

  return { dispatcher, fakeCheckpoint, runner };
}

const MIN_INPUT = {
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

// ─── tests ────────────────────────────────────────────────────────────────────

describe("R2-#37 crash-resume: PlaygroundPipelineDispatcher（#16b 后）", () => {
  it("no checkpoint: missionCheckpoint.canResume 总被 runMission 消费", async () => {
    const { dispatcher, fakeCheckpoint } = makeDispatcherBundle();
    await dispatcher.runMission("m-no-cp", MIN_INPUT, "u1");
    expect(fakeCheckpoint.canResume).toHaveBeenCalledWith("m-no-cp");
  });

  it("with checkpoint: 恢复的 crossState 落到 session entry（能力 runner 跑前可见）", async () => {
    const crossState = new PlaygroundCrossStageState();
    crossState.lastPlan = {
      themeSummary: "persisted-theme",
      dimensions: [{ id: "d1", name: "D1", rationale: "." }],
      goals: { successCriteria: [] },
      initialRisks: [],
    } as never;
    const completedKeys = new Set(["s1-budget", "s2-leader-plan"]);
    const snapshot = {
      missionId: "m-xstate",
      savedAt: new Date(),
      status: "running" as const,
      completedKeys: [...completedKeys],
      payload: {
        lastStage: "s2-leader-plan",
        topic: "t",
        crossState: crossState.toJSON(),
      },
    };

    let capturedTheme: string | undefined;
    const { dispatcher } = makeDispatcherBundle(
      { canResume: true, snapshot, completedKeys },
      (ctx) => {
        // 能力 runner 跑时，dispatcher 已把恢复的 crossState 落到 entry。
        const sessions = (
          dispatcher as unknown as {
            sessions: Map<string, { crossState: PlaygroundCrossStageState }>;
          }
        ).sessions;
        capturedTheme = sessions.get(ctx.missionId)?.crossState.lastPlan
          ?.themeSummary;
      },
    );

    await dispatcher.runMission("m-xstate", MIN_INPUT, "u1");
    expect(capturedTheme).toBe("persisted-theme");
  });

  it("canResume 抛错：降级为 fresh start（不 throw，仍 completed）", async () => {
    const { dispatcher, fakeCheckpoint } = makeDispatcherBundle();
    fakeCheckpoint.canResume.mockRejectedValue(new Error("DB connection lost"));
    const result = await dispatcher.runMission("m-cp-err", MIN_INPUT, "u1");
    expect(result.status).toBe("completed");
  });
});

// ─── #44 S4‖S5 parallel execution（纯 orchestrator，硬切无关，原样保留）──────────

describe("#44 S4‖S5 parallel: MissionPipelineOrchestrator", () => {
  it("S4 and S5 start before either completes (concurrent execution)", async () => {
    const reg = new MissionPipelineRegistry();
    const orch = new MissionPipelineOrchestrator(reg);

    const startOrder: string[] = [];
    const completeOrder: string[] = [];

    const s4Delay = 50;
    const s5Delay = 20;

    reg.register({
      id: "parallel-test",
      roles: [],
      steps: [
        {
          id: "s4-leader-assess",
          primitive: "assess",
          hooks: {
            runRole: async () => {
              startOrder.push("s4");
              await new Promise<void>((res) => setTimeout(res, s4Delay));
              completeOrder.push("s4");
              return {};
            },
            parseDecision: () => "continue" as never,
          },
        },
        {
          id: "s5-reconciler",
          primitive: "synthesize",
          hooks: {
            synthesize: async () => {
              startOrder.push("s5");
              await new Promise<void>((res) => setTimeout(res, s5Delay));
              completeOrder.push("s5");
              return {};
            },
          },
        },
        {
          id: "s6-analyst",
          primitive: "synthesize",
          hooks: {
            synthesize: async () => {
              startOrder.push("s6");
              completeOrder.push("s6");
              return {};
            },
          },
        },
      ],
    } as never);

    const events: string[] = [];
    const result = await orch.run({
      missionId: "m-parallel",
      pipelineId: "parallel-test",
      input: {},
      onEvent: (e) => {
        if (
          e.stepId &&
          (e.type === "stage:started" || e.type === "stage:completed")
        ) {
          events.push(`${e.type}:${e.stepId}`);
        }
      },
    });

    expect(result.status).toBe("completed");

    const s4StartIdx = startOrder.indexOf("s4");
    const s5StartIdx = startOrder.indexOf("s5");
    const s4CompleteIdx = completeOrder.indexOf("s4");
    const s5CompleteIdx = completeOrder.indexOf("s5");

    expect(s4StartIdx).toBeGreaterThanOrEqual(0);
    expect(s5StartIdx).toBeGreaterThanOrEqual(0);
    expect(s4StartIdx).toBeLessThan(2);
    expect(s5StartIdx).toBeLessThan(2);

    expect(s5CompleteIdx).toBeLessThan(s4CompleteIdx);

    expect(startOrder.indexOf("s6")).toBeGreaterThan(
      Math.max(s4CompleteIdx, s5CompleteIdx) - 1,
    );
  });

  it("dependent chain S6→... stays sequential after S4‖S5", async () => {
    const reg = new MissionPipelineRegistry();
    const orch = new MissionPipelineOrchestrator(reg);

    const order: string[] = [];

    reg.register({
      id: "seq-after-parallel",
      roles: [],
      steps: [
        {
          id: "s4-leader-assess",
          primitive: "assess",
          hooks: {
            runRole: async () => {
              order.push("s4-start");
              return {};
            },
            parseDecision: () => "continue" as never,
          },
        },
        {
          id: "s5-reconciler",
          primitive: "synthesize",
          hooks: {
            synthesize: async () => {
              order.push("s5-start");
              return {};
            },
          },
        },
        {
          id: "s6-analyst",
          primitive: "synthesize",
          hooks: {
            synthesize: async () => {
              order.push("s6-start");
              return {};
            },
          },
        },
        {
          id: "s7-next",
          primitive: "synthesize",
          hooks: {
            synthesize: async () => {
              order.push("s7-start");
              return {};
            },
          },
        },
      ],
    } as never);

    const result = await orch.run({
      missionId: "m-seq",
      pipelineId: "seq-after-parallel",
      input: {},
    });

    expect(result.status).toBe("completed");
    const s6idx = order.indexOf("s6-start");
    const s4idx = order.indexOf("s4-start");
    const s5idx = order.indexOf("s5-start");
    expect(s6idx).toBeGreaterThan(s4idx);
    expect(s6idx).toBeGreaterThan(s5idx);
    expect(order.indexOf("s7-start")).toBeGreaterThan(s6idx);
  });
});
