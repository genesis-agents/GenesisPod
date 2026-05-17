/**
 * Unit tests for SocialPipelineDispatcher
 * Covers: onModuleInit, computeDedupKey, tryReserveInFlight,
 *         runMission (completed / failed / thrown / cleanup),
 *         getEntry, bridgeOrchestratorEvent, handleMissionFailure,
 *         fireSelfEvolutionPostlude, dedup window.
 */

// ---------------------------------------------------------------------------
// Mock s12-self-evolution stage (fire-and-forget)
// ---------------------------------------------------------------------------
jest.mock("../stages/s12-self-evolution.stage", () => ({
  runSelfEvolutionStage: jest.fn().mockResolvedValue(undefined),
}));

import { runSelfEvolutionStage } from "../stages/s12-self-evolution.stage";

import { Logger } from "@nestjs/common";
import { SocialPipelineDispatcher } from "../social-pipeline-dispatcher.service";
import { SOCIAL_PIPELINE } from "../../../../social.config";
import type {
  MissionPipelineRegistry,
  MissionPipelineOrchestrator,
  DomainEventBus,
  AgentRunner,
  MissionAbortRegistry,
  FailureLearnerService,
  PostmortemClassifierService,
} from "@/modules/ai-harness/facade";
import type { SocialRuntimeShellService } from "../social-runtime-shell.service";
import type { SocialBusinessOrchestrator } from "../social-business-orchestrator.service";
import type { SocialMissionStore } from "../../lifecycle/social-mission-store.service";
import type { SocialAgentInvoker } from "../../../roles/social-agent-invoker.service";
import type { PrismaService } from "@/common/prisma/prisma.service";
import type { LeaderService } from "../../../roles/leader.service";
import type { StewardService } from "../../../roles/steward.service";
import type { PlatformProbeService } from "../../../roles/platform-probe.service";
import type { ContentTransformerService } from "../../../roles/content-transformer.service";
import type { CoverArtistService } from "../../../roles/cover-artist.service";
import type { ComposerService } from "../../../roles/composer.service";
import type { PolishReviewerService } from "../../../roles/polish-reviewer.service";
import type { PublishExecutorAgentService } from "../../../roles/publish-executor-agent.service";
import type { PublishVerifierService } from "../../../roles/publish-verifier.service";
import type { RunSocialMissionInput } from "../mission-context";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockRegistry() {
  return {
    has: jest.fn().mockReturnValue(false),
    register: jest.fn(),
  } as unknown as jest.Mocked<MissionPipelineRegistry>;
}

function createMockOrchestrator() {
  return {
    run: jest.fn(),
  } as unknown as jest.Mocked<MissionPipelineOrchestrator>;
}

function createMockSession() {
  return {
    missionId: "session-mission",
    billing: { type: "billing-adapter" },
    pool: {
      snapshot: jest.fn().mockReturnValue({
        remainingCostUsd: 10,
        maxCostUsd: 20,
        poolCostUsd: 0,
      }),
    },
    budgetMultiplier: 1.0,
    missionAbort: new AbortController(),
    cleanup: jest.fn(),
  };
}

function createMockRuntimeShell() {
  const mockSession = createMockSession();
  return {
    openSession: jest.fn().mockResolvedValue(mockSession),
    runWithinContext: jest
      .fn()
      .mockImplementation((_session: unknown, fn: () => Promise<unknown>) =>
        fn(),
      ),
    _mockSession: mockSession,
  } as unknown as jest.Mocked<SocialRuntimeShellService> & {
    _mockSession: ReturnType<typeof createMockSession>;
  };
}

function createMockBusinessOrch() {
  return {
    bindSessionLookup: jest.fn(),
    buildHooksForStep: jest.fn().mockReturnValue({ persist: jest.fn() }),
  } as unknown as jest.Mocked<SocialBusinessOrchestrator>;
}

function createMockStore() {
  return {
    create: jest.fn().mockResolvedValue(undefined),
    markCompleted: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    refreshHeartbeat: jest.fn().mockResolvedValue(undefined),
    saveTrajectory: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SocialMissionStore>;
}

function createMockInvoker() {
  return {
    clearMissionRelayState: jest.fn(),
    emitLifecycle: jest.fn().mockResolvedValue(undefined),
    tickCost: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SocialAgentInvoker>;
}

function createMockEventBus() {
  return {
    emit: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<DomainEventBus>;
}

function createMockAbortRegistry() {
  return {
    getSignal: jest.fn().mockReturnValue(new AbortController().signal),
    abort: jest.fn(),
  } as unknown as jest.Mocked<MissionAbortRegistry>;
}

function createMockPrisma() {
  return {
    socialContent: {
      findFirst: jest.fn(),
    },
    socialPlatformConnection: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    socialMission: {
      count: jest.fn().mockResolvedValue(0),
    },
  } as unknown as jest.Mocked<PrismaService>;
}

function makeRoleStub<T>(): jest.Mocked<T> {
  return {} as jest.Mocked<T>;
}

function makeInput(
  overrides: Partial<RunSocialMissionInput> = {},
): RunSocialMissionInput {
  return {
    contentId: "content-disp-test",
    platforms: ["wechat"],
    connectionIds: { wechat: "conn-1" },
    depth: "standard",
    budgetProfile: "standard",
    language: "zh-CN",
    ...overrides,
  };
}

const MOCK_MISSION_ID = "mission-dispatcher-1";
const MOCK_USER_ID = "user-dispatcher-1";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function createDispatcher(
  overrides: {
    registry?: jest.Mocked<MissionPipelineRegistry>;
    orchestrator?: jest.Mocked<MissionPipelineOrchestrator>;
    runtimeShell?: jest.Mocked<SocialRuntimeShellService> & {
      _mockSession: ReturnType<typeof createMockSession>;
    };
    businessOrch?: jest.Mocked<SocialBusinessOrchestrator>;
    store?: jest.Mocked<SocialMissionStore>;
    invoker?: jest.Mocked<SocialAgentInvoker>;
    eventBus?: jest.Mocked<DomainEventBus>;
    prisma?: jest.Mocked<PrismaService>;
  } = {},
) {
  const registry = overrides.registry ?? createMockRegistry();
  const orchestrator = overrides.orchestrator ?? createMockOrchestrator();
  const runtimeShell = overrides.runtimeShell ?? createMockRuntimeShell();
  const businessOrch = overrides.businessOrch ?? createMockBusinessOrch();
  const store = overrides.store ?? createMockStore();
  const invoker = overrides.invoker ?? createMockInvoker();
  const eventBus = overrides.eventBus ?? createMockEventBus();
  const abortRegistry = createMockAbortRegistry();
  const runner = {} as jest.Mocked<AgentRunner>;
  const failureLearner = {} as jest.Mocked<FailureLearnerService>;
  const postmortemClassifier = {} as jest.Mocked<PostmortemClassifierService>;
  const prisma = overrides.prisma ?? createMockPrisma();

  const dispatcher = new SocialPipelineDispatcher(
    registry as unknown as MissionPipelineRegistry,
    orchestrator as unknown as MissionPipelineOrchestrator,
    runtimeShell as unknown as SocialRuntimeShellService,
    businessOrch as unknown as SocialBusinessOrchestrator,
    store as unknown as SocialMissionStore,
    invoker as unknown as SocialAgentInvoker,
    runner as unknown as AgentRunner,
    eventBus as unknown as DomainEventBus,
    abortRegistry as unknown as MissionAbortRegistry,
    failureLearner as unknown as FailureLearnerService,
    postmortemClassifier as unknown as PostmortemClassifierService,
    makeRoleStub<LeaderService>() as unknown as LeaderService,
    makeRoleStub<StewardService>() as unknown as StewardService,
    makeRoleStub<PlatformProbeService>() as unknown as PlatformProbeService,
    makeRoleStub<ContentTransformerService>() as unknown as ContentTransformerService,
    makeRoleStub<CoverArtistService>() as unknown as CoverArtistService,
    makeRoleStub<ComposerService>() as unknown as ComposerService,
    makeRoleStub<PolishReviewerService>() as unknown as PolishReviewerService,
    makeRoleStub<PublishExecutorAgentService>() as unknown as PublishExecutorAgentService,
    makeRoleStub<PublishVerifierService>() as unknown as PublishVerifierService,
    prisma as unknown as PrismaService,
  );

  return {
    dispatcher,
    registry,
    orchestrator,
    runtimeShell,
    businessOrch,
    store,
    invoker,
    eventBus,
    prisma,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SocialPipelineDispatcher", () => {
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerLogSpy = jest.spyOn(Logger.prototype, "log").mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation();
    (runSelfEvolutionStage as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    loggerLogSpy.mockRestore();
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  // =========================================================================
  // onModuleInit
  // =========================================================================

  describe("onModuleInit", () => {
    it("should bind sessionLookup on businessOrch", () => {
      const { dispatcher, businessOrch } = createDispatcher();
      dispatcher.onModuleInit();
      expect(businessOrch.bindSessionLookup).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it("should register pipeline when registry.has returns false", () => {
      const registry = createMockRegistry();
      registry.has = jest.fn().mockReturnValue(false);
      const { dispatcher } = createDispatcher({ registry });

      dispatcher.onModuleInit();

      expect(registry.register).toHaveBeenCalledWith(
        expect.objectContaining({ id: SOCIAL_PIPELINE.id }),
      );
    });

    it("should NOT re-register pipeline when registry.has returns true", () => {
      const registry = createMockRegistry();
      registry.has = jest.fn().mockReturnValue(true);
      const { dispatcher } = createDispatcher({ registry });

      dispatcher.onModuleInit();

      expect(registry.register).not.toHaveBeenCalled();
    });

    it("should build pipeline with hooks from businessOrch for each step", () => {
      const businessOrch = createMockBusinessOrch();
      const { dispatcher } = createDispatcher({ businessOrch });

      dispatcher.onModuleInit();

      expect(businessOrch.buildHooksForStep).toHaveBeenCalledTimes(
        SOCIAL_PIPELINE.steps.length,
      );
    });

    it("should build pipeline steps in correct order (s1 first, s11 last)", () => {
      const businessOrch = createMockBusinessOrch();
      const { dispatcher } = createDispatcher({ businessOrch });

      dispatcher.onModuleInit();

      const firstCall = (businessOrch.buildHooksForStep as jest.Mock).mock
        .calls[0];
      const lastCall = (businessOrch.buildHooksForStep as jest.Mock).mock.calls[
        SOCIAL_PIPELINE.steps.length - 1
      ];
      expect(firstCall[0]).toBe("s1-mission-budget-eval");
      expect(lastCall[0]).toBe("s11-mission-persist");
    });
  });

  // =========================================================================
  // computeDedupKey
  // =========================================================================

  describe("computeDedupKey", () => {
    it("should produce a consistent hash for the same inputs", () => {
      const { dispatcher } = createDispatcher();
      const key1 = dispatcher.computeDedupKey("user-1", "content-1", [
        "wechat",
      ]);
      const key2 = dispatcher.computeDedupKey("user-1", "content-1", [
        "wechat",
      ]);
      expect(key1).toBe(key2);
    });

    it("should sort platforms before hashing", () => {
      const { dispatcher } = createDispatcher();
      const key1 = dispatcher.computeDedupKey("u", "c", ["twitter", "wechat"]);
      const key2 = dispatcher.computeDedupKey("u", "c", ["wechat", "twitter"]);
      expect(key1).toBe(key2);
    });

    it("should produce different keys for different userIds", () => {
      const { dispatcher } = createDispatcher();
      const k1 = dispatcher.computeDedupKey("user-A", "c", ["wechat"]);
      const k2 = dispatcher.computeDedupKey("user-B", "c", ["wechat"]);
      expect(k1).not.toBe(k2);
    });

    it("should produce different keys for different contentIds", () => {
      const { dispatcher } = createDispatcher();
      const k1 = dispatcher.computeDedupKey("u", "content-A", ["wechat"]);
      const k2 = dispatcher.computeDedupKey("u", "content-B", ["wechat"]);
      expect(k1).not.toBe(k2);
    });

    it("should produce different keys for different platform sets", () => {
      const { dispatcher } = createDispatcher();
      const k1 = dispatcher.computeDedupKey("u", "c", ["wechat"]);
      const k2 = dispatcher.computeDedupKey("u", "c", [
        "wechat",
        "xiaohongshu",
      ]);
      expect(k1).not.toBe(k2);
    });

    it("should return a 40-char hex string (SHA1)", () => {
      const { dispatcher } = createDispatcher();
      const key = dispatcher.computeDedupKey("u", "c", ["p"]);
      expect(key).toMatch(/^[0-9a-f]{40}$/);
    });
  });

  // =========================================================================
  // tryReserveInFlight
  // =========================================================================

  describe("tryReserveInFlight", () => {
    it("should return reused=false and a new missionId on first call", () => {
      const { dispatcher } = createDispatcher();
      const result = dispatcher.tryReserveInFlight("u", "c", ["wechat"]);
      expect(result.reused).toBe(false);
      expect(result.missionId).toMatch(/^social-/);
    });

    it("should return reused=true and the same missionId on duplicate call within 5s", () => {
      const { dispatcher } = createDispatcher();
      const first = dispatcher.tryReserveInFlight("u", "c", ["wechat"]);
      const second = dispatcher.tryReserveInFlight("u", "c", ["wechat"]);
      expect(second.reused).toBe(true);
      expect(second.missionId).toBe(first.missionId);
    });

    it("should return reused=false when dedup window has expired", () => {
      jest.useFakeTimers();
      const { dispatcher } = createDispatcher();
      dispatcher.tryReserveInFlight("u", "c", ["wechat"]);
      jest.advanceTimersByTime(6_000);
      const second = dispatcher.tryReserveInFlight("u", "c", ["wechat"]);
      expect(second.reused).toBe(false);
      jest.useRealTimers();
    });

    it("should return different missionIds for different users", () => {
      const { dispatcher } = createDispatcher();
      const r1 = dispatcher.tryReserveInFlight("user-A", "c", ["p"]);
      const r2 = dispatcher.tryReserveInFlight("user-B", "c", ["p"]);
      expect(r1.missionId).not.toBe(r2.missionId);
    });
  });

  // =========================================================================
  // getEntry
  // =========================================================================

  describe("getEntry", () => {
    it("should throw when no session exists for missionId", () => {
      const { dispatcher } = createDispatcher();
      expect(() => dispatcher.getEntry("nonexistent")).toThrow(
        /no active session/i,
      );
    });
  });

  // =========================================================================
  // runMission — completed path
  // =========================================================================

  describe("runMission — completed", () => {
    it("should call openSession and orchestrator.run then markCompleted", async () => {
      const orchestrator = createMockOrchestrator();
      const store = createMockStore();
      orchestrator.run = jest.fn().mockResolvedValue({ status: "completed" });

      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue({
        title: "Test Title",
        content: "Test body",
        digest: null,
        coverImageUrl: null,
      });

      const { dispatcher, runtimeShell, eventBus } = createDispatcher({
        orchestrator,
        store,
        prisma,
      });

      const result = await dispatcher.runMission(
        MOCK_MISSION_ID,
        makeInput(),
        MOCK_USER_ID,
      );

      expect(runtimeShell.openSession).toHaveBeenCalledWith(
        expect.objectContaining({ missionId: MOCK_MISSION_ID }),
      );
      expect(orchestrator.run).toHaveBeenCalled();
      expect(store.markCompleted).toHaveBeenCalledWith(
        MOCK_MISSION_ID,
        expect.objectContaining({ wallTimeMs: expect.any(Number) }),
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "social.mission:completed" }),
      );
      expect(result).toMatchObject({
        missionId: MOCK_MISSION_ID,
        status: "completed",
      });
    });

    it("should cleanup session after completion", async () => {
      const orchestrator = createMockOrchestrator();
      orchestrator.run = jest.fn().mockResolvedValue({ status: "completed" });

      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue({
        title: "T",
        content: "B",
        digest: null,
        coverImageUrl: null,
      });

      const runtimeShell = createMockRuntimeShell();
      const { dispatcher } = createDispatcher({
        orchestrator,
        runtimeShell,
        prisma,
      });

      await dispatcher.runMission(MOCK_MISSION_ID, makeInput(), MOCK_USER_ID);

      expect(runtimeShell._mockSession.cleanup).toHaveBeenCalled();
    });

    it("should fire self-evolution postlude after completion", async () => {
      const orchestrator = createMockOrchestrator();
      orchestrator.run = jest.fn().mockResolvedValue({ status: "completed" });

      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue({
        title: "T",
        content: "B",
        digest: null,
        coverImageUrl: null,
      });

      const { dispatcher } = createDispatcher({ orchestrator, prisma });

      await dispatcher.runMission(MOCK_MISSION_ID, makeInput(), MOCK_USER_ID);

      // Allow fire-and-forget microtasks to settle
      await Promise.resolve();
      await Promise.resolve();

      expect(runSelfEvolutionStage).toHaveBeenCalled();
    });

    it("should call invoker.clearMissionRelayState in finally", async () => {
      const orchestrator = createMockOrchestrator();
      orchestrator.run = jest.fn().mockResolvedValue({ status: "completed" });

      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue({
        title: "T",
        content: "B",
        digest: null,
        coverImageUrl: null,
      });

      const invoker = createMockInvoker();
      const { dispatcher } = createDispatcher({
        orchestrator,
        invoker,
        prisma,
      });

      await dispatcher.runMission(MOCK_MISSION_ID, makeInput(), MOCK_USER_ID);

      expect(invoker.clearMissionRelayState).toHaveBeenCalledWith(
        MOCK_MISSION_ID,
      );
    });
  });

  // =========================================================================
  // runMission — failed path (orchestrator returns failed)
  // =========================================================================

  describe("runMission — failed (orchestrator result)", () => {
    it("should call markFailed and emit social.mission:failed event", async () => {
      const orchestrator = createMockOrchestrator();
      orchestrator.run = jest.fn().mockResolvedValue({
        status: "failed",
        error: new Error("stage timeout"),
      });
      const store = createMockStore();
      const eventBus = createMockEventBus();

      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue({
        title: "T",
        content: "B",
        digest: null,
        coverImageUrl: null,
      });

      const { dispatcher } = createDispatcher({
        orchestrator,
        store,
        eventBus,
        prisma,
      });

      const result = await dispatcher.runMission(
        MOCK_MISSION_ID,
        makeInput(),
        MOCK_USER_ID,
      );

      expect(store.markFailed).toHaveBeenCalledWith(
        MOCK_MISSION_ID,
        expect.objectContaining({ errorMessage: "stage timeout" }),
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "social.mission:failed" }),
      );
      expect(result.status).toBe("failed");
    });

    it("should classify rate-limit error correctly", async () => {
      const orchestrator = createMockOrchestrator();
      orchestrator.run = jest.fn().mockResolvedValue({
        status: "failed",
        error: new Error("rate limit hit: 429"),
      });
      const store = createMockStore();
      const eventBus = createMockEventBus();

      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue({
        title: "T",
        content: "B",
        digest: null,
        coverImageUrl: null,
      });

      const { dispatcher } = createDispatcher({
        orchestrator,
        store,
        eventBus,
        prisma,
      });

      await dispatcher.runMission(MOCK_MISSION_ID, makeInput(), MOCK_USER_ID);

      const failedEmit = (eventBus.emit as jest.Mock).mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "social.mission:failed",
      );
      expect(failedEmit![0].payload.failureCode).toBe("PROVIDER_RATE_LIMIT");
    });

    it("should classify timeout error correctly", async () => {
      const orchestrator = createMockOrchestrator();
      orchestrator.run = jest.fn().mockResolvedValue({
        status: "failed",
        error: new Error("execution timed out"),
      });
      const eventBus = createMockEventBus();

      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue({
        title: "T",
        content: "B",
        digest: null,
        coverImageUrl: null,
      });

      const { dispatcher } = createDispatcher({
        orchestrator,
        eventBus,
        prisma,
      });
      await dispatcher.runMission(MOCK_MISSION_ID, makeInput(), MOCK_USER_ID);

      const failedEmit = (eventBus.emit as jest.Mock).mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "social.mission:failed",
      );
      expect(failedEmit![0].payload.failureCode).toBe(
        "RUNNER_WALL_TIME_EXCEEDED",
      );
    });

    it("should classify abort error correctly", async () => {
      const orchestrator = createMockOrchestrator();
      const abortErr = new Error("mission aborted");
      abortErr.name = "StageAbortError";
      orchestrator.run = jest.fn().mockResolvedValue({
        status: "failed",
        error: abortErr,
      });
      const eventBus = createMockEventBus();

      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue({
        title: "T",
        content: "B",
        digest: null,
        coverImageUrl: null,
      });

      const { dispatcher } = createDispatcher({
        orchestrator,
        eventBus,
        prisma,
      });
      await dispatcher.runMission(MOCK_MISSION_ID, makeInput(), MOCK_USER_ID);

      const failedEmit = (eventBus.emit as jest.Mock).mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "social.mission:failed",
      );
      expect(failedEmit![0].payload.failureCode).toBe("MISSION_ABORTED");
    });
  });

  // =========================================================================
  // runMission — thrown error (catch branch)
  // =========================================================================

  describe("runMission — thrown error (dispatcher catch)", () => {
    it("should return failed status when hydrateContentRaw throws", async () => {
      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue(null);

      const eventBus = createMockEventBus();
      const { dispatcher } = createDispatcher({ eventBus, prisma });

      const result = await dispatcher.runMission(
        MOCK_MISSION_ID,
        makeInput(),
        MOCK_USER_ID,
      );

      expect(result.status).toBe("failed");
      expect(result.error).toBeDefined();
    });

    it("should emit social.mission:failed with DISPATCHER_THREW code", async () => {
      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue(null);

      const eventBus = createMockEventBus();
      const { dispatcher } = createDispatcher({ eventBus, prisma });

      await dispatcher.runMission(MOCK_MISSION_ID, makeInput(), MOCK_USER_ID);

      const failedEmit = (eventBus.emit as jest.Mock).mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "social.mission:failed",
      );
      expect(failedEmit![0].payload.failureCode).toBe("DISPATCHER_THREW");
    });

    it("should call session.cleanup even when orchestrator throws", async () => {
      const runtimeShell = createMockRuntimeShell();
      const orchestrator = createMockOrchestrator();
      orchestrator.run = jest
        .fn()
        .mockRejectedValue(new Error("orchestrator blew up"));

      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue({
        title: "T",
        content: "B",
        digest: null,
        coverImageUrl: null,
      });

      const { dispatcher } = createDispatcher({
        runtimeShell,
        orchestrator,
        prisma,
      });

      await dispatcher.runMission(MOCK_MISSION_ID, makeInput(), MOCK_USER_ID);

      expect(runtimeShell._mockSession.cleanup).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // runMission — hydrateContentRaw
  // =========================================================================

  describe("runMission — hydrateContentRaw", () => {
    it("should query socialContent with contentId and userId", async () => {
      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue({
        title: "My Title",
        content: "My Body",
        digest: "Short",
        coverImageUrl: "https://cover.jpg",
      });

      const orchestrator = createMockOrchestrator();
      orchestrator.run = jest.fn().mockResolvedValue({ status: "completed" });

      const { dispatcher } = createDispatcher({ orchestrator, prisma });
      await dispatcher.runMission(MOCK_MISSION_ID, makeInput(), MOCK_USER_ID);

      expect(prisma.socialContent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "content-disp-test",
            userId: MOCK_USER_ID,
          },
        }),
      );
    });
  });

  // =========================================================================
  // runMission — dedup window cleanup in finally
  // =========================================================================

  describe("runMission — dedup window cleanup", () => {
    it("should remove inFlight entry for the mission after completion", async () => {
      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue({
        title: "T",
        content: "B",
        digest: null,
        coverImageUrl: null,
      });

      const orchestrator = createMockOrchestrator();
      orchestrator.run = jest.fn().mockResolvedValue({ status: "completed" });

      const { dispatcher } = createDispatcher({ orchestrator, prisma });

      // Reserve a slot — this generates the missionId internally
      const { missionId: reservedId } = dispatcher.tryReserveInFlight(
        MOCK_USER_ID,
        "content-disp-test",
        ["wechat"],
      );

      // Run mission with the reserved missionId so inFlight cleanup matches
      await dispatcher.runMission(reservedId, makeInput(), MOCK_USER_ID);

      // A new reservation should NOT be reused now (inFlight cleared in finally)
      const after = dispatcher.tryReserveInFlight(
        MOCK_USER_ID,
        "content-disp-test",
        ["wechat"],
      );
      expect(after.reused).toBe(false);
    });
  });

  // =========================================================================
  // bridgeOrchestratorEvent — stage lifecycle events
  // =========================================================================

  describe("bridgeOrchestratorEvent via orchestrator.run onEvent", () => {
    async function runWithEvent(
      eventArg: Record<string, unknown>,
    ): Promise<jest.Mocked<DomainEventBus>> {
      const prisma = createMockPrisma();
      (prisma.socialContent.findFirst as jest.Mock).mockResolvedValue({
        title: "T",
        content: "B",
        digest: null,
        coverImageUrl: null,
      });

      const orchestrator = createMockOrchestrator();
      const eventBus = createMockEventBus();

      orchestrator.run = jest
        .fn()
        .mockImplementation(
          async (opts: { onEvent: (e: unknown) => Promise<void> }) => {
            await opts.onEvent(eventArg);
            return { status: "completed" };
          },
        );

      const { dispatcher } = createDispatcher({
        orchestrator,
        eventBus,
        prisma,
      });
      await dispatcher.runMission(MOCK_MISSION_ID, makeInput(), MOCK_USER_ID);
      return eventBus;
    }

    it("should emit social.stage:lifecycle for stage:started", async () => {
      const eventBus = await runWithEvent({
        type: "stage:started",
        stepId: "s2-platform-probe",
        primitive: "persist",
        timestamp: Date.now(),
      });

      const lifecycleEmit = (eventBus.emit as jest.Mock).mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "social.stage:lifecycle",
      );
      expect(lifecycleEmit).toBeDefined();
      expect(lifecycleEmit![0].payload.status).toBe("started");
    });

    it("should emit social.stage:lifecycle for stage:completed", async () => {
      const eventBus = await runWithEvent({
        type: "stage:completed",
        stepId: "s3-content-transform",
        timestamp: Date.now(),
        output: { platformVersions: {} },
      });

      const lifecycleEmit = (eventBus.emit as jest.Mock).mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "social.stage:lifecycle",
      );
      expect(lifecycleEmit![0].payload.status).toBe("completed");
    });

    it("should emit social.stage:lifecycle for stage:failed with error", async () => {
      const eventBus = await runWithEvent({
        type: "stage:failed",
        stepId: "s4-leader-assess-transform",
        error: new Error("LLM error"),
        timestamp: Date.now(),
      });

      const lifecycleEmit = (eventBus.emit as jest.Mock).mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "social.stage:lifecycle",
      );
      expect(lifecycleEmit![0].payload.status).toBe("failed");
      expect(lifecycleEmit![0].payload.error).toContain("LLM error");
    });

    it("should emit social.stage:stalled for stage:stalled", async () => {
      const eventBus = await runWithEvent({
        type: "stage:stalled",
        stepId: "s5-cover-craft",
        elapsedMs: 30000,
        reason: "tool slow",
        timestamp: Date.now(),
      });

      const stalledEmit = (eventBus.emit as jest.Mock).mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "social.stage:stalled",
      );
      expect(stalledEmit).toBeDefined();
      expect(stalledEmit![0].payload.stepId).toBe("s5-cover-craft");
    });

    it("should emit social.stage:degraded for stage:degraded", async () => {
      const eventBus = await runWithEvent({
        type: "stage:degraded",
        stepId: "s6-body-compose",
        reason: "fallback used",
        timestamp: Date.now(),
      });

      const degradedEmit = (eventBus.emit as jest.Mock).mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "social.stage:degraded",
      );
      expect(degradedEmit).toBeDefined();
    });

    it("should emit social.mission:aborted for mission:aborted", async () => {
      const eventBus = await runWithEvent({
        type: "mission:aborted",
        reason: "user cancelled",
        timestamp: Date.now(),
      });

      const abortedEmit = (eventBus.emit as jest.Mock).mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "social.mission:aborted",
      );
      expect(abortedEmit).toBeDefined();
      expect(abortedEmit![0].payload.reason).toBe("user cancelled");
    });

    it("should ignore events without stepId that are not mission:aborted", async () => {
      const eventBus = await runWithEvent({
        type: "mission:started",
        timestamp: Date.now(),
        // no stepId
      });

      const unknownEmit = (eventBus.emit as jest.Mock).mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "social.mission:started",
      );
      expect(unknownEmit).toBeUndefined();
    });
  });
});
