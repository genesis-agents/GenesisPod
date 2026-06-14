/**
 * MissionRuntimeShellService unit tests
 * Targets: src/modules/ai-app/playground/mission/pipeline/mission-runtime-shell.service.ts
 */

// Mock entire modules to avoid NestJS DI chain resolution
jest.mock("@/modules/ai-harness/facade", () => {
  class MissionRuntimeShellFramework {
    async openSession(opts: unknown) {
      return opts;
    }
    async runWithinContext(
      _s: unknown,
      _ns: string,
      _t: string,
      fn: () => Promise<unknown>,
    ) {
      return fn();
    }
  }
  return {
    MissionRuntimeShellFramework,
    BusinessTeamMissionStoreFramework: class {},
    BusinessTeamLifecycleTransitionsFramework: class {},
    BusinessTeamUpdateHelperFramework: class {},
    BusinessTeamReportHelperFramework: class {},
    BusinessTeamStageBindingsFramework: class {},
    MissionOwnershipRegistry: class {},
    applyInputPatch: jest.fn((snap: unknown, _patch: unknown) => snap),
    CREDITS_TO_USD: 0.002,
  };
});

jest.mock("@/common/prisma/prisma.service", () => ({
  PrismaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@/modules/platform/facade", () => ({
  ObjectStorageService: jest.fn(),
}));

jest.mock(
  "@/modules/ai-app/playground/mission/lifecycle/mission-store.service",
  () => ({
    MissionStore: jest.fn().mockImplementation(() => ({
      getStatusById: jest.fn().mockResolvedValue(null),
      markReopened: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
      refreshHeartbeat: jest.fn().mockResolvedValue(undefined),
      hasRecentEvent: jest.fn().mockResolvedValue(true),
    })),
    MissionConcurrencyLimitError: class extends Error {},
  }),
);

jest.mock("@/modules/ai-app/playground/mission/roles", () => ({
  AgentInvoker: jest.fn().mockImplementation(() => ({
    emitEvent: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock(
  "@/modules/ai-app/playground/runtime/playground.input-rebuilder",
  () => ({
    PlaygroundMissionInputRebuilder: jest.fn().mockImplementation(() => ({
      buildForFreshRun: jest.fn().mockReturnValue({ schemaVersion: 1 }),
    })),
  }),
);

// Re-mock ai-harness facade with full spy control
const mockOpenSession = jest.fn();
const mockRunWithinContext = jest.fn();

jest.mock("@/modules/ai-harness/facade", () => {
  return {
    MissionRuntimeShellFramework: jest.fn().mockImplementation(() => ({
      openSession: mockOpenSession,
      runWithinContext: mockRunWithinContext,
    })),
    BusinessTeamMissionStoreFramework: class {
      constructor(_p: unknown) {}
    },
    BusinessTeamLifecycleTransitionsFramework: class {
      constructor() {}
    },
    BusinessTeamUpdateHelperFramework: class {
      constructor() {}
    },
    BusinessTeamReportHelperFramework: class {
      constructor() {}
    },
    BusinessTeamStageBindingsFramework: class {
      constructor() {}
    },
    MissionOwnershipRegistry: class {},
    applyInputPatch: jest.fn((snap: unknown) => snap),
    CREDITS_TO_USD: 0.002,
  };
});

import { MissionRuntimeShellService } from "@/modules/ai-app/playground/mission/pipeline/mission-runtime-shell.service";
import { MissionStore } from "@/modules/ai-app/playground/mission/lifecycle/mission-store.service";
import { AgentInvoker } from "@/modules/ai-app/playground/mission/roles";
import { PlaygroundMissionInputRebuilder } from "@/modules/ai-app/playground/runtime/playground.input-rebuilder";
import { MissionRuntimeShellFramework } from "@/modules/ai-harness/facade";

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

function makeInput() {
  return {
    topic: "AI Research",
    depth: "deep" as const,
    language: "en-US" as const,
    budgetProfile: "medium" as const,
    styleProfile: "executive" as const,
    lengthProfile: "standard" as const,
    audienceProfile: "domain-expert" as const,
    withFigures: true,
    auditLayers: "default" as const,
    concurrency: 3,
    viewMode: "continuous" as const,
    searchTimeRange: "any" as const,
  };
}

describe("MissionRuntimeShellService", () => {
  let service: MissionRuntimeShellService;
  let frameworkInstance: {
    openSession: jest.Mock;
    runWithinContext: jest.Mock;
  };
  let storeInstance: jest.Mocked<any>;
  let invokerInstance: jest.Mocked<any>;
  let rebuilderInstance: jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockOpenSession.mockResolvedValue({ sessionId: "sess-1" });
    mockRunWithinContext.mockImplementation(
      (_s: unknown, _ns: string, _t: string, fn: () => Promise<unknown>) =>
        fn(),
    );

    // Instantiate mocked classes
    service = new MissionRuntimeShellService(
      new (MissionRuntimeShellFramework as any)() as never,
      new (AgentInvoker as any)() as never,
      new (MissionStore as any)() as never,
      new (PlaygroundMissionInputRebuilder as any)() as never,
    );

    // Access internal mocked instances
    frameworkInstance = (
      MissionRuntimeShellFramework as jest.Mock
    ).mock.results.at(-1)?.value;
    storeInstance = (MissionStore as jest.Mock).mock.results.at(-1)?.value;
    invokerInstance = (AgentInvoker as jest.Mock).mock.results.at(-1)?.value;
    rebuilderInstance = (
      PlaygroundMissionInputRebuilder as jest.Mock
    ).mock.results.at(-1)?.value;
  });

  // ── openSession ─────────────────────────────────────────────────────────────

  describe("openSession", () => {
    it("delegates to framework.openSession", async () => {
      const session = { sessionId: "sess-1" };
      frameworkInstance.openSession.mockResolvedValueOnce(session);

      const result = await service.openSession({
        missionId: "m1",
        input: makeInput(),
        userId: "u1",
        workspaceId: "w1",
      });

      expect(frameworkInstance.openSession).toHaveBeenCalledWith(
        expect.objectContaining({
          missionId: "m1",
          userId: "u1",
          workspaceId: "w1",
        }),
      );
      expect(result).toBe(session);
    });

    it("passes adapter with eventNamespace=playground and billingModuleType=playground", async () => {
      await service.openSession({
        missionId: "m1",
        input: makeInput(),
        userId: "u1",
      });

      const { adapter } = frameworkInstance.openSession.mock.calls[0][0];
      expect(adapter.eventNamespace).toBe("playground");
      expect(adapter.billingModuleType).toBe("playground");
    });

    it("adapter.resolveWallTimeCapMs returns a positive number", async () => {
      await service.openSession({
        missionId: "m1",
        input: makeInput(),
        userId: "u1",
      });
      const { adapter } = frameworkInstance.openSession.mock.calls[0][0];
      const ms = adapter.resolveWallTimeCapMs(makeInput());
      expect(typeof ms).toBe("number");
      expect(ms).toBeGreaterThan(0);
    });

    it("adapter.resolveMaxCredits returns a positive number", async () => {
      await service.openSession({
        missionId: "m1",
        input: makeInput(),
        userId: "u1",
      });
      const { adapter } = frameworkInstance.openSession.mock.calls[0][0];
      const credits = adapter.resolveMaxCredits(makeInput());
      expect(typeof credits).toBe("number");
      expect(credits).toBeGreaterThan(0);
    });

    it("adapter.resolveBudgetMultiplier returns a number >= 0", async () => {
      await service.openSession({
        missionId: "m1",
        input: makeInput(),
        userId: "u1",
      });
      const { adapter } = frameworkInstance.openSession.mock.calls[0][0];
      const mult = adapter.resolveBudgetMultiplier(makeInput());
      expect(typeof mult).toBe("number");
      expect(mult).toBeGreaterThanOrEqual(0);
    });
  });

  // ── runWithinContext ─────────────────────────────────────────────────────────

  describe("runWithinContext", () => {
    it("delegates to framework.runWithinContext with playground/team scope", async () => {
      const session = { sessionId: "sess-1" };
      const fn = jest.fn().mockResolvedValue("result");

      const result = await service.runWithinContext(session as never, fn);

      expect(frameworkInstance.runWithinContext).toHaveBeenCalledWith(
        session,
        "playground",
        "team",
        fn,
      );
      expect(result).toBe("result");
    });

    it("propagates errors from the inner fn", async () => {
      frameworkInstance.runWithinContext.mockImplementationOnce(
        (_s: unknown, _ns: string, _t: string, fn: () => Promise<unknown>) =>
          fn(),
      );
      const session = { sessionId: "sess-1" };
      const fn = jest.fn().mockRejectedValue(new Error("inner error"));

      await expect(
        service.runWithinContext(session as never, fn),
      ).rejects.toThrow("inner error");
    });
  });

  // ── buildAdapter.createMissionRow ───────────────────────────────────────────

  describe("adapter.createMissionRow", () => {
    async function getAdapter() {
      await service.openSession({
        missionId: "m1",
        input: makeInput(),
        userId: "u1",
      });
      return frameworkInstance.openSession.mock.calls[0][0].adapter;
    }

    it("creates new row via store.create when no existing mission", async () => {
      storeInstance.getStatusById.mockResolvedValueOnce(null);
      const adapter = await getAdapter();

      await adapter.createMissionRow({
        missionId: "m1",
        userId: "u1",
        workspaceId: "w1",
        input: makeInput(),
        effectiveMaxCredits: 1000,
      });

      expect(storeInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "m1",
          userId: "u1",
          topic: "AI Research",
          maxCredits: 1000,
        }),
      );
      expect(storeInstance.markReopened).not.toHaveBeenCalled();
    });

    it("calls markReopened instead of create when existing mission found", async () => {
      storeInstance.getStatusById.mockResolvedValueOnce({ status: "failed" });
      const adapter = await getAdapter();

      await adapter.createMissionRow({
        missionId: "m1",
        userId: "u1",
        workspaceId: undefined,
        input: makeInput(),
        effectiveMaxCredits: 500,
      });

      expect(storeInstance.markReopened).toHaveBeenCalledWith("m1", "u1");
      expect(storeInstance.create).not.toHaveBeenCalled();
    });

    it("swallows markReopened error for running orphan continuation", async () => {
      storeInstance.getStatusById.mockResolvedValueOnce({ status: "running" });
      storeInstance.markReopened.mockRejectedValueOnce(
        new Error("cannot reopen running"),
      );
      const adapter = await getAdapter();

      await expect(
        adapter.createMissionRow({
          missionId: "m1",
          userId: "u1",
          workspaceId: undefined,
          input: makeInput(),
          effectiveMaxCredits: 1000,
        }),
      ).resolves.toBeUndefined();
    });

    it("uses rebuilder.buildForFreshRun configSnapshot in new row", async () => {
      const snap = { schemaVersion: 1, language: "en-US" };
      rebuilderInstance.buildForFreshRun.mockReturnValueOnce(snap);
      storeInstance.getStatusById.mockResolvedValueOnce(null);
      const adapter = await getAdapter();

      await adapter.createMissionRow({
        missionId: "m1",
        userId: "u1",
        workspaceId: undefined,
        input: makeInput(),
        effectiveMaxCredits: 1000,
      });

      expect(storeInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({ configSnapshot: snap }),
      );
    });

    it("treats getStatusById DB error as null (creates new row)", async () => {
      storeInstance.getStatusById.mockRejectedValueOnce(new Error("DB error"));
      const adapter = await getAdapter();

      await adapter.createMissionRow({
        missionId: "m1",
        userId: "u1",
        workspaceId: undefined,
        input: makeInput(),
        effectiveMaxCredits: 1000,
      });

      expect(storeInstance.create).toHaveBeenCalled();
    });

    it("passes userProfile with all input fields", async () => {
      storeInstance.getStatusById.mockResolvedValueOnce(null);
      const adapter = await getAdapter();
      const input = makeInput();

      await adapter.createMissionRow({
        missionId: "m1",
        userId: "u1",
        workspaceId: undefined,
        input,
        effectiveMaxCredits: 1000,
      });

      const createArg = storeInstance.create.mock.calls[0][0];
      expect(createArg.userProfile).toMatchObject({
        depth: input.depth,
        language: input.language,
        budgetProfile: input.budgetProfile,
      });
    });
  });

  // ── buildAdapter.refreshHeartbeat ───────────────────────────────────────────

  describe("adapter.refreshHeartbeat", () => {
    async function getAdapter() {
      await service.openSession({
        missionId: "m1",
        input: makeInput(),
        userId: "u1",
      });
      return frameworkInstance.openSession.mock.calls[0][0].adapter;
    }

    it("calls store.refreshHeartbeat when there are recent events", async () => {
      storeInstance.hasRecentEvent.mockResolvedValueOnce(true);
      const adapter = await getAdapter();

      await adapter.refreshHeartbeat("m1", "pod-1");

      expect(storeInstance.refreshHeartbeat).toHaveBeenCalledWith(
        "m1",
        "pod-1",
      );
    });

    it("skips refreshHeartbeat when no recent events (progress gate)", async () => {
      storeInstance.hasRecentEvent.mockResolvedValueOnce(false);
      const adapter = await getAdapter();

      await adapter.refreshHeartbeat("m1", "pod-1");

      expect(storeInstance.refreshHeartbeat).not.toHaveBeenCalled();
    });

    it("falls back to refreshing heartbeat when hasRecentEvent throws", async () => {
      storeInstance.hasRecentEvent.mockRejectedValueOnce(
        new Error("query failed"),
      );
      const adapter = await getAdapter();

      await adapter.refreshHeartbeat("m1", "pod-1");

      // Default to true on error → refreshHeartbeat still called
      expect(storeInstance.refreshHeartbeat).toHaveBeenCalledWith(
        "m1",
        "pod-1",
      );
    });

    it("checks events with HEARTBEAT_ACTIVITY_WINDOW_MS = 3*60*1000", async () => {
      storeInstance.hasRecentEvent.mockResolvedValueOnce(true);
      const adapter = await getAdapter();

      await adapter.refreshHeartbeat("m1", "pod-1");

      expect(storeInstance.hasRecentEvent).toHaveBeenCalledWith(
        "m1",
        3 * 60 * 1000,
      );
    });
  });

  // ── buildAdapter.emitMissionEvent ───────────────────────────────────────────

  describe("adapter.emitMissionEvent", () => {
    async function getAdapter() {
      await service.openSession({
        missionId: "m1",
        input: makeInput(),
        userId: "u1",
      });
      return frameworkInstance.openSession.mock.calls[0][0].adapter;
    }

    it("delegates to invoker.emitEvent with all fields", async () => {
      const adapter = await getAdapter();

      await adapter.emitMissionEvent({
        type: "playground.mission:started",
        missionId: "m1",
        userId: "u1",
        payload: { stage: 1 },
      });

      expect(invokerInstance.emitEvent).toHaveBeenCalledWith({
        type: "playground.mission:started",
        missionId: "m1",
        userId: "u1",
        payload: { stage: 1 },
      });
    });
  });
});
