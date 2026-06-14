/**
 * RerunMissionRuntimeBuilder — unit tests
 *
 * Covers:
 *   - buildSession: protectStaleAbortController called
 *   - buildSession: abortRegistry.register called with missionId
 *   - buildSession: BillingRuntimeEnvAdapter instantiated
 *   - buildSession: MissionBudgetPool created via ResolvedBudgetCaps.resolve
 *   - buildSession: leaderService.create called with correct args
 *   - buildSession: leader.hydratePlan called when ctx.plan.goals exists
 *   - buildSession: leader.hydratePlan NOT called when ctx.plan has no goals
 *   - buildSession: leader.hydratePlan NOT called when ctx.plan is undefined
 *   - buildSession: returns session with expected shape
 *   - composeMissionContext: __hydrated stripped, billing/pool/leader/budgetMultiplier injected
 *   - composeMissionContext: t0 preserved from ctx
 *   - writeBackToHydrated: billing/pool/leader/budgetMultiplier stripped, __hydrated=true set
 *   - writeBackToHydrated: hydrated base merged with phaseAndInvariants
 */

import { Logger } from "@nestjs/common";

// Mock the roles module (has complex deps via agent-invoker.service → event-relay)
jest.mock("../../roles", () => ({
  LeaderService: jest.fn(),
}));

// Mock playground-pipeline
jest.mock("../../pipeline/leader-invocation.factory", () => ({
  LeaderInvocationFactory: jest.fn(),
}));

import { RerunMissionRuntimeBuilder } from "../rerun-runtime-builder.service";

// Silence logger
beforeAll(() => {
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
});

// ── Minimal stub factories ────────────────────────────────────────────────────

function makeLeader() {
  return { hydratePlan: jest.fn() };
}

function makeLeaderService(leader = makeLeader()) {
  return { create: jest.fn().mockReturnValue(leader) };
}

function makeLeaderInvocationFactory() {
  return { build: jest.fn().mockReturnValue({}) };
}

function makeCredits() {
  return {};
}

function makeRuntimeEnv() {
  return {};
}

function makeAbortController() {
  return { signal: {}, abort: jest.fn() };
}

function makeAbortRegistry(abortCtrl = makeAbortController()) {
  return { register: jest.fn().mockReturnValue(abortCtrl) };
}

// Mock BillingRuntimeEnvAdapter, MissionBudgetPool, ResolvedBudgetCaps at module level
jest.mock("@/modules/ai-harness/facade", () => {
  // Store what was instantiated so we can assert
  const BillingRuntimeEnvAdapter = jest.fn().mockImplementation(() => ({
    _type: "billing",
  }));
  const MissionBudgetPool = jest.fn().mockImplementation(() => ({
    _type: "pool",
  }));
  const ResolvedBudgetCaps = {
    resolve: jest.fn().mockReturnValue({
      toTokenBudget: jest.fn().mockReturnValue({ maxTokens: 100000 }),
    }),
  };

  // A minimal framework base that stores hooks and exposes them
  class BusinessTeamRerunRuntimeBuilderFramework {
    protected hooks: Record<string, unknown>;
    protected log = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    constructor(abortRegistry: unknown, hooks: Record<string, unknown>) {
      this.hooks = hooks;
    }

    protected protectStaleAbortController = jest.fn();
    protected makeCleanup = jest.fn().mockReturnValue(jest.fn());
  }

  const MissionAbortRegistry = jest.fn();
  const RuntimeEnvironmentService = jest.fn();
  const BillingRuntimeEnvAdapterExport = BillingRuntimeEnvAdapter;

  return {
    BillingRuntimeEnvAdapter: BillingRuntimeEnvAdapterExport,
    MissionBudgetPool,
    ResolvedBudgetCaps,
    MissionAbortRegistry,
    RuntimeEnvironmentService,
    BusinessTeamRerunRuntimeBuilderFramework,
  };
});

jest.mock("../../../api/dto/run-mission.dto", () => ({
  resolveBudgetMultiplier: jest.fn().mockReturnValue(1.0),
  resolveMissionCredits: jest.fn().mockReturnValue(500),
}));

// ── Builder factory ───────────────────────────────────────────────────────────

function makeBuilder(
  overrides: {
    leaderService?: ReturnType<typeof makeLeaderService>;
    abortRegistry?: ReturnType<typeof makeAbortRegistry>;
    leader?: ReturnType<typeof makeLeader>;
  } = {},
) {
  const leader = overrides.leader ?? makeLeader();
  const leaderService = overrides.leaderService ?? makeLeaderService(leader);
  const abortRegistry = overrides.abortRegistry ?? makeAbortRegistry();
  const leaderInvocationFactory = makeLeaderInvocationFactory();
  const credits = makeCredits();
  const runtimeEnv = makeRuntimeEnv();

  const builder = new RerunMissionRuntimeBuilder(
    leaderInvocationFactory as any,
    credits as any,
    runtimeEnv as any,
    abortRegistry as any,
    leaderService as any,
  );

  return {
    builder,
    leader,
    leaderService,
    abortRegistry,
    leaderInvocationFactory,
  };
}

// ── Hydrated context fixture ──────────────────────────────────────────────────

function makeCtx(planOverride?: unknown) {
  const ctx: any = {
    missionId: "m-111",
    userId: "u-222",
    workspaceId: "ws-333",
    t0: 1700000000000,
    __hydrated: true as const,
    input: {
      topic: "AI Trends",
      depth: "deep",
      language: "zh-CN",
    },
  };
  if (planOverride !== undefined) ctx.plan = planOverride;
  return ctx;
}

// ── buildSession ──────────────────────────────────────────────────────────────

describe("RerunMissionRuntimeBuilder buildSession", () => {
  it("calls protectStaleAbortController with missionId", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const ctx = makeCtx();
    hooks.buildSession({ ctx, workspaceId: "ws-1" });
    expect((builder as any).protectStaleAbortController).toHaveBeenCalledWith(
      "m-111",
    );
  });

  it("registers abortController with missionId", () => {
    const { builder, abortRegistry } = makeBuilder();
    const hooks = (builder as any).hooks;
    const ctx = makeCtx();
    hooks.buildSession({ ctx, workspaceId: "ws-1" });
    expect(abortRegistry.register).toHaveBeenCalledWith("m-111");
  });

  it("creates BillingRuntimeEnvAdapter with userId and workspaceId", async () => {
    const { BillingRuntimeEnvAdapter } =
      await import("@/modules/ai-harness/facade");
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const ctx = makeCtx();
    hooks.buildSession({ ctx, workspaceId: "ws-999" });
    expect(BillingRuntimeEnvAdapter).toHaveBeenCalledWith(
      "u-222",
      "ws-999",
      expect.anything(),
      expect.anything(),
    );
  });

  it("creates MissionBudgetPool via ResolvedBudgetCaps.resolve", async () => {
    const { ResolvedBudgetCaps } = await import("@/modules/ai-harness/facade");
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    hooks.buildSession({ ctx: makeCtx(), workspaceId: "ws-1" });
    expect(ResolvedBudgetCaps.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ maxCredits: 500, budgetMultiplier: 1.0 }),
    );
  });

  it("calls leaderService.create with missionId, userId, and context", () => {
    const { builder, leaderService } = makeBuilder();
    const hooks = (builder as any).hooks;
    hooks.buildSession({ ctx: makeCtx(), workspaceId: "ws-1" });
    expect(leaderService.create).toHaveBeenCalledWith(
      "m-111",
      "u-222",
      expect.objectContaining({
        topic: "AI Trends",
        depth: "deep",
        language: "zh-CN",
      }),
      expect.anything(),
    );
  });

  it("leaderInvocationFactory.build called with missionId and userId", () => {
    const { builder, leaderInvocationFactory } = makeBuilder();
    const hooks = (builder as any).hooks;
    hooks.buildSession({ ctx: makeCtx(), workspaceId: "ws-1" });
    expect(leaderInvocationFactory.build).toHaveBeenCalledWith(
      "m-111",
      "u-222",
      expect.anything(),
    );
  });

  it("leader.hydratePlan called when ctx.plan.goals exists", () => {
    const leader = makeLeader();
    const { builder } = makeBuilder({ leader });
    const hooks = (builder as any).hooks;
    const ctx = makeCtx({ goals: ["Goal A", "Goal B"], dimensions: [] });
    hooks.buildSession({ ctx, workspaceId: "ws-1" });
    expect(leader.hydratePlan).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "plan", goals: ["Goal A", "Goal B"] }),
    );
  });

  it("leader.hydratePlan NOT called when ctx.plan has no goals", () => {
    const leader = makeLeader();
    const { builder } = makeBuilder({ leader });
    const hooks = (builder as any).hooks;
    const ctx = makeCtx({ dimensions: [] }); // plan exists but no goals
    hooks.buildSession({ ctx, workspaceId: "ws-1" });
    expect(leader.hydratePlan).not.toHaveBeenCalled();
  });

  it("leader.hydratePlan NOT called when ctx.plan is undefined", () => {
    const leader = makeLeader();
    const { builder } = makeBuilder({ leader });
    const hooks = (builder as any).hooks;
    const ctx = makeCtx(); // no plan
    hooks.buildSession({ ctx, workspaceId: "ws-1" });
    expect(leader.hydratePlan).not.toHaveBeenCalled();
  });

  it("returns session with missionId, userId, billing, pool, leader, budgetMultiplier, missionAbort, cleanup", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const session = hooks.buildSession({ ctx: makeCtx(), workspaceId: "ws-1" });
    expect(session).toMatchObject({
      missionId: "m-111",
      userId: "u-222",
      billing: expect.objectContaining({ _type: "billing" }),
      pool: expect.objectContaining({ _type: "pool" }),
      budgetMultiplier: 1.0,
    });
    expect(session.missionAbort).toBeDefined();
    expect(session.cleanup).toBeDefined();
  });

  it("makeCleanup called with missionId", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    hooks.buildSession({ ctx: makeCtx(), workspaceId: "ws-1" });
    expect((builder as any).makeCleanup).toHaveBeenCalledWith("m-111");
  });
});

// ── composeMissionContext ─────────────────────────────────────────────────────

describe("RerunMissionRuntimeBuilder composeMissionContext", () => {
  function makeSession() {
    return {
      billing: { _type: "billing" },
      pool: { _type: "pool" },
      leader: { hydratePlan: jest.fn() },
      budgetMultiplier: 1.5,
      missionAbort: {},
      cleanup: jest.fn(),
      missionId: "m-111",
      userId: "u-222",
    };
  }

  it("strips __hydrated from composed context", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const ctx = makeCtx();
    const session = makeSession();
    const composed = hooks.composeMissionContext(ctx, session);
    expect(composed).not.toHaveProperty("__hydrated");
  });

  it("injects billing, pool, leader, budgetMultiplier from session", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const ctx = makeCtx();
    const session = makeSession();
    const composed = hooks.composeMissionContext(ctx, session);
    expect(composed.billing).toBe(session.billing);
    expect(composed.pool).toBe(session.pool);
    expect(composed.leader).toBe(session.leader);
    expect(composed.budgetMultiplier).toBe(1.5);
  });

  it("preserves t0 from ctx", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const ctx = makeCtx();
    const composed = hooks.composeMissionContext(ctx, makeSession());
    expect(composed.t0).toBe(1700000000000);
  });

  it("preserves other ctx fields (missionId, userId, input)", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const ctx = makeCtx();
    const composed = hooks.composeMissionContext(ctx, makeSession());
    expect(composed.missionId).toBe("m-111");
    expect(composed.userId).toBe("u-222");
    expect(composed.input).toEqual(ctx.input);
  });
});

// ── writeBackToHydrated ───────────────────────────────────────────────────────

describe("RerunMissionRuntimeBuilder writeBackToHydrated", () => {
  function makeComposed() {
    return {
      missionId: "m-111",
      userId: "u-222",
      t0: 1700000000000,
      input: { topic: "Test" },
      billing: { _type: "billing" },
      pool: { _type: "pool" },
      leader: { hydratePlan: jest.fn() },
      budgetMultiplier: 2.0,
      somePhaseField: "phase-value",
    };
  }

  function makeHydrated() {
    return {
      __hydrated: true as const,
      missionId: "m-111",
      userId: "u-222",
      t0: 1700000000000,
      input: { topic: "Test" },
      someHydratedField: "hydrated-value",
    };
  }

  it("sets __hydrated=true in returned object", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const result = hooks.writeBackToHydrated(makeComposed(), makeHydrated());
    expect(result.__hydrated).toBe(true);
  });

  it("strips billing from result", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const result = hooks.writeBackToHydrated(makeComposed(), makeHydrated());
    expect(result).not.toHaveProperty("billing");
  });

  it("strips pool from result", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const result = hooks.writeBackToHydrated(makeComposed(), makeHydrated());
    expect(result).not.toHaveProperty("pool");
  });

  it("strips leader from result", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const result = hooks.writeBackToHydrated(makeComposed(), makeHydrated());
    expect(result).not.toHaveProperty("leader");
  });

  it("strips budgetMultiplier from result", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const result = hooks.writeBackToHydrated(makeComposed(), makeHydrated());
    expect(result).not.toHaveProperty("budgetMultiplier");
  });

  it("hydrated base fields merged (someHydratedField preserved)", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const result = hooks.writeBackToHydrated(makeComposed(), makeHydrated());
    expect(result.someHydratedField).toBe("hydrated-value");
  });

  it("phase-specific fields from composed override hydrated", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const composed = { ...makeComposed(), missionId: "m-updated" };
    const result = hooks.writeBackToHydrated(composed, makeHydrated());
    expect(result.missionId).toBe("m-updated");
  });

  it("somePhaseField from composed (not stripped) preserved in result", () => {
    const { builder } = makeBuilder();
    const hooks = (builder as any).hooks;
    const result = hooks.writeBackToHydrated(makeComposed(), makeHydrated());
    expect(result.somePhaseField).toBe("phase-value");
  });
});
