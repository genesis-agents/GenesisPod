/**
 * PlaygroundPipelineDispatcher spec（v5.1 R2-A.1 smoke）
 *
 * 验证 dispatcher skeleton 装得起来：
 *   1. onModuleInit 注册 PLAYGROUND_PIPELINE 到 registry
 *   2. runMission 在 R2-A.1 阶段会快速 fail（hook 抛 NotYetWiredError）—— 但
 *      orchestrator 路径走通（s1 触发 stage:failed event 而不是 framework
 *      level error）
 *   3. session 在失败后被 cleanup（abort registry / sessions Map 清空）
 *
 * R2-A.2~A.13 实装 14 个 stage hook 后再扩 e2e success-path spec。
 */
import {
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
} from "@/modules/ai-harness/facade";
import { PlaygroundPipelineDispatcher } from "../playground-pipeline-dispatcher.service";
import {
  PLAYGROUND_PIPELINE,
  PlaygroundHookNotYetWiredError,
} from "../../../../playground.config";
import type { MissionRuntimeShellService } from "../mission-runtime-shell.service";
import type { MissionRuntimeSession } from "../mission-runtime-shell.service";
import type { MissionStageBindingsService } from "../mission-stage-bindings.service";
import type { AgentInvoker, LeaderService } from "../../../roles";

function makeFakeSession(missionId: string, userId: string) {
  const abortController = new AbortController();
  const cleanup = jest.fn();
  // billing.estimateAffordable: 默认通过（affordable=true），避免 s1 抛错；
  //   单测可 mock 出 affordable=false / suggestion=abort 来覆盖失败路径
  const billing = {
    estimateAffordable: jest.fn().mockResolvedValue({
      affordable: true,
      estimatedCredits: 100,
      currentBalance: 1000,
    }),
  };
  return {
    missionId,
    userId,
    workspaceId: undefined,
    billing,
    pool: { snapshot: () => ({ poolTokensUsed: 0, poolCostUsd: 0 }) } as never,
    budgetMultiplier: 1,
    missionAbort: abortController,
    wallTimeMs: 60_000,
    cleanup,
  } as unknown as MissionRuntimeSession;
}

function makeFakeShell() {
  const sessions = new Map<string, MissionRuntimeSession>();
  return {
    sessions,
    async openSession(args: {
      missionId: string;
      userId: string;
      input: unknown;
      workspaceId?: string;
    }) {
      const s = makeFakeSession(args.missionId, args.userId);
      sessions.set(args.missionId, s);
      return s;
    },
    async runWithinContext<T>(
      _session: MissionRuntimeSession,
      fn: () => Promise<T>,
    ) {
      return fn();
    },
  } as unknown as MissionRuntimeShellService & {
    sessions: Map<string, MissionRuntimeSession>;
  };
}

/**
 * StageBindings stub —— buildDeps 返回最小 deps（s1 只用 emit + log）。
 */
function makeFakeStageBindings() {
  const emittedEvents: Array<{ type: string; missionId: string }> = [];
  const buildDeps = jest.fn().mockReturnValue({
    invoker: {} as never,
    store: {} as never,
    missionState: {} as never,
    abortRegistry: {} as never,
    runner: {} as never,
    eventBus: {} as never,
    credits: {} as never,
    runtimeEnv: {} as never,
    log: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    emit: jest.fn(async (e: { type: string; missionId: string }) => {
      emittedEvents.push({ type: e.type, missionId: e.missionId });
    }),
    lifecycle: jest.fn(),
    leader: {} as never,
    reconciler: {} as never,
    analyst: {} as never,
    writer: {} as never,
    reviewer: {} as never,
    verifier: {} as never,
    steward: {} as never,
    judge: {} as never,
    indexer: {} as never,
    failureLearner: {} as never,
    reportAssembler: {} as never,
    figureExtractor: {} as never,
    figureRelevance: {} as never,
    sectionSelfEval: {} as never,
    sectionRemediation: {} as never,
    reportEvaluation: {} as never,
    qualityTraceCompute: {} as never,
    postmortemClassifier: {} as never,
  });
  /**
   * buildCtx：把入参原样组装成 MissionContext（与真实 stageBindings 行为一致）
   */
  const buildCtx = jest.fn((args: Record<string, unknown>) => ({
    ...args,
    s4PatchFailures: undefined,
  }));
  return {
    buildDeps,
    buildCtx,
    emittedEvents,
  } as unknown as MissionStageBindingsService & {
    buildDeps: jest.Mock;
    buildCtx: jest.Mock;
    emittedEvents: typeof emittedEvents;
  };
}

describe("PlaygroundPipelineDispatcher (v5.1 R2-A.1 smoke)", () => {
  let registry: MissionPipelineRegistry;
  let orchestrator: MissionPipelineOrchestrator;
  let shell: ReturnType<typeof makeFakeShell>;
  let dispatcher: PlaygroundPipelineDispatcher;

  let stageBindings: ReturnType<typeof makeFakeStageBindings>;

  /**
   * fake leader.plan() —— 默认成功，stub 1 个 dim；spec 可覆盖 mockResolvedValueOnce
   */
  let fakeLeaderPlan: jest.Mock;
  let fakeSupervisedMission: { plan: jest.Mock };

  beforeEach(() => {
    registry = new MissionPipelineRegistry();
    orchestrator = new MissionPipelineOrchestrator(registry);
    shell = makeFakeShell();
    stageBindings = makeFakeStageBindings();
    fakeLeaderPlan = jest.fn().mockResolvedValue({
      themeSummary: "test theme",
      dimensions: [{ id: "dim-1", name: "Dim 1", rationale: "..." }],
      goals: { successCriteria: ["..."] },
      initialRisks: [],
    });
    fakeSupervisedMission = { plan: fakeLeaderPlan };
    const fakeLeaderService = {
      create: jest.fn().mockReturnValue(fakeSupervisedMission as never),
    } as unknown as LeaderService;
    const fakeInvoker = {
      invoke: jest.fn().mockResolvedValue({
        state: "completed",
        output: {},
        events: [],
      }),
    } as unknown as AgentInvoker;
    // store.listRecentPostmortems 是 s2 hook 内部调用 —— 默认空数组（无历史）
    const buildDepsMock = (stageBindings as unknown as { buildDeps: jest.Mock })
      .buildDeps;
    const previousImpl = buildDepsMock.getMockImplementation();
    const baseDeps = previousImpl ? previousImpl() : {};
    buildDepsMock.mockReturnValue({
      ...baseDeps,
      store: {
        listRecentPostmortems: jest.fn().mockResolvedValue([]),
      },
    });
    dispatcher = new PlaygroundPipelineDispatcher(
      registry,
      orchestrator,
      shell as unknown as MissionRuntimeShellService,
      stageBindings as unknown as MissionStageBindingsService,
      fakeLeaderService,
      fakeInvoker,
    );
    dispatcher.onModuleInit();
  });

  it("onModuleInit 注册 PLAYGROUND_PIPELINE 到 registry", () => {
    expect(registry.has(PLAYGROUND_PIPELINE.id)).toBe(true);
    const cfg = registry.get(PLAYGROUND_PIPELINE.id);
    expect(cfg.steps).toHaveLength(14);
  });

  it("注册的 config 14 个 step 都已注入 hooks（NotYetWired 占位）", () => {
    const cfg = registry.get(PLAYGROUND_PIPELINE.id);
    for (const step of cfg.steps) {
      // 必填 hook 都被注入；learn 没有必填 hook 是合法情况
      expect(step.hooks).toBeDefined();
      if (step.primitive !== "learn") {
        expect(Object.keys(step.hooks ?? {}).length).toBeGreaterThan(0);
      }
    }
  });

  it("runMission：s1+s2 已实装 → 跑过 s1+s2，在 s3 NotYetWired 处 fail", async () => {
    const result = await dispatcher.runMission(
      "m1",
      {
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
      } as never,
      "u1",
    );
    expect(result.missionId).toBe("m1");
    expect(result.status).toBe("failed");
    const errorStr = String(result.error);
    // s1+s2 已 wired，fail 出现在 s3-researcher-collect
    expect(errorStr).toMatch(/NotYetWired|s3-researcher-collect/i);
    // s1 + s2 都跑过：stageOutputs 同时含 s1-budget + s2-leader-plan
    expect(result.stageOutputs["s1-budget"]).toEqual({ persisted: true });
    expect(result.stageOutputs["s2-leader-plan"]).toMatchObject({
      dimensions: [{ id: "dim-1" }],
    });
  });

  it("s2-leader-plan hook：调 leader.plan + emit leader:goals-set 事件", async () => {
    await dispatcher.runMission(
      "m-s2-trace",
      {
        topic: "leader plan test",
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
      } as never,
      "u1",
    );
    // leader.plan 被调一次
    expect(fakeLeaderPlan).toHaveBeenCalledTimes(1);
    // emit 出现 leader:goals-set 事件
    const eventTypes = stageBindings.emittedEvents.map((e) => e.type);
    expect(eventTypes).toContain("agent-playground.leader:goals-set");
  });

  it("s2 leader.plan 抛错 → mission stage:failed + 不影响 dispatcher 主流程", async () => {
    fakeLeaderPlan.mockRejectedValueOnce(new Error("LLM API failed"));
    const result = await dispatcher.runMission(
      "m-s2-fail",
      {
        topic: "fail test",
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
      } as never,
      "u1",
    );
    expect(result.status).toBe("failed");
    expect(String(result.error)).toMatch(/LLM API failed/i);
    // s1 跑过，s2 抛错：stageOutputs[s1] 有，stageOutputs[s2] 无
    expect(result.stageOutputs["s1-budget"]).toEqual({ persisted: true });
    expect(result.stageOutputs["s2-leader-plan"]).toBeUndefined();
  });

  it("s2 leader.plan 返空 dimensions → fail-fast", async () => {
    fakeLeaderPlan.mockResolvedValueOnce({
      themeSummary: "x",
      dimensions: [], // 空数组应触发 fail-fast
      goals: { successCriteria: [] },
      initialRisks: [],
    });
    const result = await dispatcher.runMission(
      "m-s2-empty",
      {
        topic: "empty dims",
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
      } as never,
      "u1",
    );
    expect(result.status).toBe("failed");
    expect(String(result.error)).toMatch(/dimensions.*empty/i);
  });

  it("runMission s1-budget hook：billing.estimateAffordable 被调 + emit mission:started 事件", async () => {
    const result = await dispatcher.runMission(
      "m-s1-emit",
      {
        topic: "budget test",
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
      } as never,
      "u1",
    );
    // s1 跑成功（mission 仍 fail 在 s2，但 s1 阶段无错）
    expect(result.stageOutputs["s1-budget"]).toEqual({ persisted: true });
    // emitted events 含 mission:started + agent:narrative（s1 内部 narrate）
    const eventTypes = stageBindings.emittedEvents.map((e) => e.type);
    expect(eventTypes).toContain("agent-playground.mission:started");
  });

  it("runMission 失败后 session cleanup 被调用 + sessions map 清空", async () => {
    await dispatcher.runMission(
      "m2",
      {
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
      } as never,
      "u1",
    );
    expect(() => dispatcher.getSession("m2")).toThrow(/no active session/);
  });

  it("getSession 不存在 missionId 抛错", () => {
    expect(() => dispatcher.getSession("never-existed")).toThrow(
      /no active session/,
    );
  });

  it("PlaygroundHookNotYetWiredError 含 stage + hook 名信息", () => {
    const err = new PlaygroundHookNotYetWiredError("s1-budget", "onPersist");
    expect(err.message).toContain("s1-budget");
    expect(err.message).toContain("onPersist");
    expect(err.name).toBe("PlaygroundHookNotYetWiredError");
  });

  it("registry 可重复 onModuleInit（has() 短路返回 + 不抛 duplicate）", () => {
    expect(() => dispatcher.onModuleInit()).not.toThrow();
  });
});
