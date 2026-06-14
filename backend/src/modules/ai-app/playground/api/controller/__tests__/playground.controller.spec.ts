/**
 * AgentPlaygroundController — unit tests
 *
 * Covers every route handler (happy path + guard/error branches):
 *   - getBudgetTiers
 *   - devTriggerMission (production guard, token auth, missing body fields, DB miss, Zod parse, success)
 *   - runTeam (no userId, auto-supersede loop, concurrency cap throw, Zod parse failure, success + E32 error path)
 *   - cancelMission (no userId, already-cancelled idempotent, non-running status, success)
 *   - deleteMission (no userId, not found, running status, success)
 *   - cleanupMissions (no userId, success)
 *   - updateMission (no userId, blank topic, long topic, not found, budget validation branches, non-terminal budget block, success)
 */

import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { AgentPlaygroundController } from "../playground.controller";
import { MissionAbortReason } from "@/modules/ai-harness/facade";

// Silence Logger
beforeAll(() => {
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "debug").mockImplementation(() => {});
});

// ── helpers ──────────────────────────────────────────────────────────────────

function makeOwnership(ownerId: string | null = null) {
  return {
    getOwner: jest.fn().mockReturnValue(ownerId),
    assign: jest.fn(),
    release: jest.fn(),
  };
}

function makeStore(mission: Record<string, unknown> | null = null) {
  return {
    getById: jest.fn().mockResolvedValue(mission),
    countRunningByUser: jest.fn().mockResolvedValue(0),
    findOldestRunningMissionId: jest.fn().mockResolvedValue(null),
    deleteByUser: jest.fn().mockResolvedValue(undefined),
    deleteTerminalByUser: jest.fn().mockResolvedValue(5),
    updateTopicByUser: jest.fn().mockResolvedValue(undefined),
    updateBudgetByUser: jest.fn().mockResolvedValue({ ok: true }),
    // needed by supersedeRunningMission / cancelMission finalize path
    applyTerminalIfRunning: jest.fn().mockResolvedValue(true),
    getAccessMetaById: jest.fn().mockResolvedValue(null),
    markReopened: jest.fn().mockResolvedValue(undefined),
  };
}

function makeBuffer() {
  return { broadcast: jest.fn().mockResolvedValue(undefined) };
}

function makeAbortRegistry() {
  return { abort: jest.fn() };
}

function makePrisma(apiKey: { userId: string } | null = null) {
  return {
    userApiKey: { findUnique: jest.fn().mockResolvedValue(apiKey) },
  };
}

function makeElectionTracker() {
  return { clear: jest.fn() };
}

function makePipelineDispatcher() {
  return { runMission: jest.fn().mockResolvedValue(undefined) };
}

function makeLifecycleManager() {
  return {
    finalize: jest
      .fn()
      .mockImplementation(
        async (args: {
          arbiter: { applyTerminalIfRunning: jest.Mock };
          missionId: string;
          intent: unknown;
          onWon?: () => Promise<void>;
        }) => {
          const won = await args.arbiter.applyTerminalIfRunning(
            args.missionId,
            args.intent,
          );
          if (won && args.onWon) {
            try {
              await args.onWon();
            } catch {
              // swallow
            }
          }
          return { won };
        },
      ),
  };
}

function makeEventBus() {
  return { emit: jest.fn().mockResolvedValue(undefined) };
}

function makeAuditLog() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

function makeController(
  overrides: {
    ownership?: ReturnType<typeof makeOwnership>;
    store?: ReturnType<typeof makeStore>;
    buffer?: ReturnType<typeof makeBuffer>;
    abortRegistry?: ReturnType<typeof makeAbortRegistry>;
    prisma?: ReturnType<typeof makePrisma>;
    electionTracker?: ReturnType<typeof makeElectionTracker>;
    pipelineDispatcher?: ReturnType<typeof makePipelineDispatcher>;
    lifecycleManager?: ReturnType<typeof makeLifecycleManager>;
    eventBus?: ReturnType<typeof makeEventBus>;
    auditLog?: ReturnType<typeof makeAuditLog>;
  } = {},
) {
  const ownership = overrides.ownership ?? makeOwnership("u1");
  const store = overrides.store ?? makeStore();
  const buffer = overrides.buffer ?? makeBuffer();
  const abortRegistry = overrides.abortRegistry ?? makeAbortRegistry();
  const prisma = overrides.prisma ?? makePrisma();
  const electionTracker = overrides.electionTracker ?? makeElectionTracker();
  const pipelineDispatcher =
    overrides.pipelineDispatcher ?? makePipelineDispatcher();
  const lifecycleManager = overrides.lifecycleManager ?? makeLifecycleManager();
  const eventBus = overrides.eventBus ?? makeEventBus();
  const auditLog = overrides.auditLog ?? makeAuditLog();

  return new AgentPlaygroundController(
    ownership as never,
    store as never,
    buffer as never,
    abortRegistry as never,
    prisma as never,
    electionTracker as never,
    pipelineDispatcher as never,
    lifecycleManager as never,
    eventBus as never,
    auditLog as never,
  );
}

function makeReq(userId?: string) {
  return { user: userId ? { id: userId } : undefined } as never;
}

// ── valid minimal RunMissionInput for Zod parsing ─────────────────────────────

const VALID_INPUT = {
  topic: "Test topic for mission research",
  depth: "standard" as const,
};

// ── getBudgetTiers ─────────────────────────────────────────────────────────────

describe("getBudgetTiers", () => {
  it("returns tiers array and limits object", () => {
    const ctrl = makeController();
    const result = ctrl.getBudgetTiers();
    expect(result).toHaveProperty("tiers");
    expect(result).toHaveProperty("limits");
    expect(Array.isArray(result.tiers)).toBe(true);
    expect(result.tiers.length).toBeGreaterThan(0);
    expect(result.limits).toHaveProperty("maxCredits");
  });
});

// ── devTriggerMission ──────────────────────────────────────────────────────────

describe("devTriggerMission", () => {
  const origEnv = process.env.NODE_ENV;
  const origToken = process.env.AGENT_PLAYGROUND_DEV_TRIGGER_TOKEN;

  afterEach(() => {
    process.env.NODE_ENV = origEnv;
    process.env.AGENT_PLAYGROUND_DEV_TRIGGER_TOKEN = origToken;
  });

  it("throws NotFoundException in production", async () => {
    process.env.NODE_ENV = "production";
    const ctrl = makeController();
    await expect(
      ctrl.devTriggerMission({ userApiKeyId: "x", input: VALID_INPUT }, "tok"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws ForbiddenException when no token configured", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.AGENT_PLAYGROUND_DEV_TRIGGER_TOKEN;
    const ctrl = makeController();
    await expect(
      ctrl.devTriggerMission({ userApiKeyId: "x", input: VALID_INPUT }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws ForbiddenException when token mismatch", async () => {
    process.env.NODE_ENV = "development";
    process.env.AGENT_PLAYGROUND_DEV_TRIGGER_TOKEN = "correct-token";
    const ctrl = makeController();
    await expect(
      ctrl.devTriggerMission(
        { userApiKeyId: "x", input: VALID_INPUT },
        "wrong-token",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws BadRequestException when userApiKeyId missing", async () => {
    process.env.NODE_ENV = "development";
    process.env.AGENT_PLAYGROUND_DEV_TRIGGER_TOKEN = "secret";
    const ctrl = makeController();
    await expect(
      ctrl.devTriggerMission(
        { userApiKeyId: "", input: VALID_INPUT },
        "secret",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws ForbiddenException when userApiKeyId not in DB", async () => {
    process.env.NODE_ENV = "development";
    process.env.AGENT_PLAYGROUND_DEV_TRIGGER_TOKEN = "secret";
    const prisma = makePrisma(null); // DB returns null
    const ctrl = makeController({ prisma });
    await expect(
      ctrl.devTriggerMission(
        { userApiKeyId: "nonexistent", input: VALID_INPUT },
        "secret",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws BadRequestException when input fails Zod parse", async () => {
    process.env.NODE_ENV = "development";
    process.env.AGENT_PLAYGROUND_DEV_TRIGGER_TOKEN = "secret";
    const prisma = makePrisma({ userId: "u1" });
    const ctrl = makeController({ prisma });
    await expect(
      ctrl.devTriggerMission(
        { userApiKeyId: "valid-id", input: { topic: "x" } }, // topic too short
        "secret",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns missionId on success (fire-and-forget)", async () => {
    process.env.NODE_ENV = "development";
    process.env.AGENT_PLAYGROUND_DEV_TRIGGER_TOKEN = "secret";
    const prisma = makePrisma({ userId: "u1" });
    const pipeline = makePipelineDispatcher();
    const ctrl = makeController({ prisma, pipelineDispatcher: pipeline });
    const result = await ctrl.devTriggerMission(
      { userApiKeyId: "valid-id", input: VALID_INPUT },
      "secret",
    );
    expect(result).toHaveProperty("missionId");
    expect(typeof result.missionId).toBe("string");
  });

  it("reads token from body.internalToken if no header token", async () => {
    process.env.NODE_ENV = "development";
    process.env.AGENT_PLAYGROUND_DEV_TRIGGER_TOKEN = "bodytoken";
    const prisma = makePrisma({ userId: "u1" });
    const ctrl = makeController({ prisma });
    const result = await ctrl.devTriggerMission({
      userApiKeyId: "valid-id",
      input: VALID_INPUT,
      internalToken: "bodytoken",
    });
    expect(result).toHaveProperty("missionId");
  });
});

// ── runTeam ───────────────────────────────────────────────────────────────────

describe("runTeam", () => {
  it("throws ForbiddenException when no userId", async () => {
    const ctrl = makeController();
    await expect(ctrl.runTeam({}, makeReq())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("throws BadRequestException when Zod parse fails", async () => {
    const store = makeStore();
    store.countRunningByUser.mockResolvedValue(0);
    const ctrl = makeController({ store });
    await expect(
      ctrl.runTeam({ topic: "x" }, makeReq("u1")), // too short
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns missionId + streamNamespace on success", async () => {
    const store = makeStore();
    store.countRunningByUser.mockResolvedValue(0);
    const ctrl = makeController({ store });
    const result = await ctrl.runTeam(VALID_INPUT, makeReq("u1"));
    expect(result).toHaveProperty("missionId");
    expect(result.streamNamespace).toBe("playground");
  });

  it("auto-supersedes oldest mission when at concurrency cap, then succeeds", async () => {
    const { MAX_CONCURRENT_RUNNING_MISSIONS } =
      await import("../../../mission/lifecycle/mission-store.service");
    const store = makeStore({
      id: "oldest-mission",
      status: "running",
      heartbeatAt: null,
    });
    // First call returns at-cap, after supersede drops below
    store.countRunningByUser
      .mockResolvedValueOnce(MAX_CONCURRENT_RUNNING_MISSIONS)
      .mockResolvedValueOnce(MAX_CONCURRENT_RUNNING_MISSIONS - 1);
    store.findOldestRunningMissionId.mockResolvedValueOnce("oldest-mission");
    const abortRegistry = makeAbortRegistry();
    const lifecycleManager = makeLifecycleManager();
    const ctrl = makeController({ store, abortRegistry, lifecycleManager });
    const result = await ctrl.runTeam(VALID_INPUT, makeReq("u1"));
    expect(abortRegistry.abort).toHaveBeenCalledWith(
      "oldest-mission",
      MissionAbortReason.user_cancelled,
    );
    expect(result).toHaveProperty("missionId");
  });

  it("throws BadRequestException when still at cap after auto-supersede exhausted", async () => {
    const { MAX_CONCURRENT_RUNNING_MISSIONS } =
      await import("../../../mission/lifecycle/mission-store.service");
    const store = makeStore(null);
    // Always at cap, no oldest found
    store.countRunningByUser.mockResolvedValue(MAX_CONCURRENT_RUNNING_MISSIONS);
    store.findOldestRunningMissionId.mockResolvedValue(null);
    const ctrl = makeController({ store });
    await expect(
      ctrl.runTeam(VALID_INPUT, makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("E32: emits mission:failed event when pipelineDispatcher.runMission rejects", async () => {
    const store = makeStore();
    store.countRunningByUser.mockResolvedValue(0);
    const eventBus = makeEventBus();
    const pipeline = makePipelineDispatcher();
    pipeline.runMission.mockRejectedValue(new Error("LLM quota exhausted"));
    const ctrl = makeController({
      store,
      eventBus,
      pipelineDispatcher: pipeline,
    });
    // The fire-and-forget rejection is caught internally and eventBus.emit called async
    const result = await ctrl.runTeam(VALID_INPUT, makeReq("u1"));
    expect(result).toHaveProperty("missionId");
    // Give the microtask queue time to run the catch handler
    await Promise.resolve();
    await Promise.resolve();
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "playground.mission:failed" }),
    );
  });
});

// ── cancelMission ─────────────────────────────────────────────────────────────

describe("cancelMission", () => {
  it("throws ForbiddenException when no userId", async () => {
    const ctrl = makeController();
    await expect(ctrl.cancelMission("m1", makeReq())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("throws ForbiddenException when mission not found", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore(null);
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.cancelMission("m1", makeReq("u1")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns alreadyCancelled=true idempotently when already cancelled", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "cancelled" });
    const ctrl = makeController({ ownership, store });
    const result = await ctrl.cancelMission("m1", makeReq("u1"));
    expect(result).toEqual({
      ok: true,
      status: "cancelled",
      alreadyCancelled: true,
    });
  });

  it("throws BadRequestException when mission not running", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "completed" });
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.cancelMission("m1", makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("cancels running mission successfully", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "running" });
    const abortRegistry = makeAbortRegistry();
    const lifecycleManager = makeLifecycleManager();
    const buffer = makeBuffer();
    const auditLog = makeAuditLog();
    const ctrl = makeController({
      ownership,
      store,
      abortRegistry,
      lifecycleManager,
      buffer,
      auditLog,
    });
    const result = await ctrl.cancelMission("m1", makeReq("u1"));
    expect(abortRegistry.abort).toHaveBeenCalledWith(
      "m1",
      MissionAbortReason.user_cancelled,
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mission.cancel" }),
    );
    expect(result).toEqual({ ok: true, status: "cancelled" });
  });

  it("fallback assertOwnership: ownership miss → queries DB, throws ForbiddenException if not found", async () => {
    const ownership = makeOwnership(null); // cache miss
    const store = makeStore(null); // DB miss
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.cancelMission("m1", makeReq("u1")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ── deleteMission ─────────────────────────────────────────────────────────────

describe("deleteMission", () => {
  it("throws ForbiddenException when no userId", async () => {
    const ctrl = makeController();
    await expect(ctrl.deleteMission("m1", makeReq())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("throws ForbiddenException when mission not found", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore(null);
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.deleteMission("m1", makeReq("u1")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws BadRequestException when mission is running", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "running" });
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.deleteMission("m1", makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("deletes completed mission and audits", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "completed" });
    const electionTracker = makeElectionTracker();
    const auditLog = makeAuditLog();
    const ctrl = makeController({
      ownership,
      store,
      electionTracker,
      auditLog,
    });
    const result = await ctrl.deleteMission("m1", makeReq("u1"));
    expect(store.deleteByUser).toHaveBeenCalledWith("m1", "u1");
    expect(electionTracker.clear).toHaveBeenCalledWith("m1");
    expect(ownership.release).toHaveBeenCalledWith("m1");
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mission.delete" }),
    );
    expect(result).toEqual({ ok: true });
  });
});

// ── cleanupMissions ────────────────────────────────────────────────────────────

describe("cleanupMissions", () => {
  it("throws ForbiddenException when no userId", async () => {
    const ctrl = makeController();
    await expect(ctrl.cleanupMissions(makeReq())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("returns deleted count and audits", async () => {
    const store = makeStore();
    store.deleteTerminalByUser.mockResolvedValue(7);
    const auditLog = makeAuditLog();
    const ctrl = makeController({ store, auditLog });
    const result = await ctrl.cleanupMissions(makeReq("u1"));
    expect(result).toEqual({ ok: true, deleted: 7 });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mission.cleanup" }),
    );
  });
});

// ── updateMission ─────────────────────────────────────────────────────────────

describe("updateMission", () => {
  it("throws ForbiddenException when no userId", async () => {
    const ctrl = makeController();
    await expect(
      ctrl.updateMission("m1", { topic: "Valid topic" }, makeReq()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws BadRequestException for empty topic string", async () => {
    const ownership = makeOwnership("u1");
    const ctrl = makeController({ ownership });
    await expect(
      ctrl.updateMission("m1", { topic: "   " }, makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws BadRequestException for topic exceeding 500 chars", async () => {
    const ownership = makeOwnership("u1");
    const ctrl = makeController({ ownership });
    await expect(
      ctrl.updateMission("m1", { topic: "x".repeat(501) }, makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws ForbiddenException when mission not found", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore(null);
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.updateMission("m1", { topic: "Valid topic" }, makeReq("u1")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("updates topic only (no budget fields)", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "completed" });
    const ctrl = makeController({ ownership, store });
    const result = await ctrl.updateMission(
      "m1",
      { topic: "New topic" },
      makeReq("u1"),
    );
    expect(store.updateTopicByUser).toHaveBeenCalledWith(
      "m1",
      "u1",
      "New topic",
    );
    expect(result).toEqual({ ok: true });
  });

  it("throws BadRequestException for maxCredits out of range", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "completed" });
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.updateMission("m1", { maxCredits: 1 }, makeReq("u1")), // below min 10
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws BadRequestException for maxCredits above max", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "completed" });
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.updateMission("m1", { maxCredits: 999_999 }, makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws BadRequestException for budgetMultiplierOverride < 0.3", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "completed" });
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.updateMission(
        "m1",
        { budgetMultiplierOverride: 0.1 },
        makeReq("u1"),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws BadRequestException for budgetMultiplierOverride > 10", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "completed" });
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.updateMission("m1", { budgetMultiplierOverride: 11 }, makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws BadRequestException for wallTimeCapMs < 60000", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "completed" });
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.updateMission("m1", { wallTimeCapMs: 1000 }, makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws BadRequestException for wallTimeCapMs > 86400000", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "completed" });
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.updateMission("m1", { wallTimeCapMs: 99_999_999 }, makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws BadRequestException when store updateBudgetByUser returns non_terminal_status", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "running" });
    store.updateBudgetByUser = jest
      .fn()
      .mockResolvedValue({ ok: false, reason: "non_terminal_status" });
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.updateMission("m1", { maxCredits: 1000 }, makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws ForbiddenException when store updateBudgetByUser returns not_found", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "completed" });
    store.updateBudgetByUser = jest
      .fn()
      .mockResolvedValue({ ok: false, reason: "not_found" });
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.updateMission("m1", { maxCredits: 1000 }, makeReq("u1")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws BadRequestException when store updateBudgetByUser returns unknown reason", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "completed" });
    store.updateBudgetByUser = jest
      .fn()
      .mockResolvedValue({ ok: false, reason: "some_other_error" });
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.updateMission("m1", { maxCredits: 1000 }, makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updates budget fields successfully when all valid", async () => {
    const ownership = makeOwnership("u1");
    const store = makeStore({ id: "m1", status: "completed" });
    store.updateBudgetByUser = jest.fn().mockResolvedValue({ ok: true });
    const ctrl = makeController({ ownership, store });
    const result = await ctrl.updateMission(
      "m1",
      {
        maxCredits: 5000,
        budgetMultiplierOverride: 2.0,
        wallTimeCapMs: 300_000,
      },
      makeReq("u1"),
    );
    expect(store.updateBudgetByUser).toHaveBeenCalledWith("m1", "u1", {
      maxCredits: 5000,
      wallTimeCapMs: 300_000,
      budgetMultiplierOverride: 2.0,
    });
    expect(result).toEqual({ ok: true });
  });
});
