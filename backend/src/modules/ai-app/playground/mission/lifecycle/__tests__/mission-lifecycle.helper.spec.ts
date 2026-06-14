/**
 * MissionLifecycleHelper — unit tests
 *
 * Covers:
 *   - buildCompletedUpdate: all fields, nulls, report title truncation,
 *     leaderJournal present/absent, report_too_large guard
 *   - buildFailedUpdate: quality-failed via leaderSigned=false, normal failed,
 *     all optional fields present/absent, report_too_large
 *   - buildCancelledUpdate: shape
 *   - conditionalUpdate: delegates to prisma.agentPlaygroundMission.updateMany
 *   - appendLeaderJournal: merge patch, decisions array merge, error swallowed
 *   - reopenTransaction: success path with event creation, count=0 fallback probe
 *   - reopenableStatuses: includes 'cancelled'
 */

import { Logger } from "@nestjs/common";
import { MissionLifecycleHelper } from "../mission-lifecycle.helper";

// silence Logger noise
beforeAll(() => {
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
});

function makePrisma() {
  return {
    agentPlaygroundMission: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    agentPlaygroundMissionEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  };
}

function makeHelper(prismaOverrides?: Partial<ReturnType<typeof makePrisma>>) {
  const prisma = { ...makePrisma(), ...prismaOverrides };
  const clearCheckpoint = jest.fn().mockResolvedValue(undefined);

  // Wire $transaction to call through the callback
  prisma.$transaction.mockImplementation(
    async (cb: (tx: typeof prisma) => Promise<unknown>, _opts?: unknown) => {
      return cb(prisma);
    },
  );

  const helper = new MissionLifecycleHelper(
    prisma as never,
    (_err: unknown) => false,
    (_missionId: string, _reason: string) => undefined,
    clearCheckpoint,
  );

  return { helper, prisma, clearCheckpoint };
}

// ── Pull out framework hooks via the protected `hooks` field for unit testing ──
// The framework stores hooks in a protected property; we use ts-ignore to access it.
function getHooks(helper: MissionLifecycleHelper) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (helper as any).hooks as {
    buildCompletedUpdate: (
      d: Record<string, unknown>,
    ) => Record<string, unknown>;
    buildFailedUpdate: (d: Record<string, unknown>) => {
      update: Record<string, unknown>;
      isLeadRefusal: boolean;
      effectiveFailureCode: string | null;
    };
    buildCancelledUpdate: () => Record<string, unknown>;
    conditionalUpdate: (
      missionId: string,
      where: { userId?: string },
      data: Record<string, unknown>,
    ) => Promise<number>;
    reopenTransaction: (
      missionId: string,
      userId: string,
      allowedFromStatuses: string[],
    ) => Promise<{ affected: number; currentStatus: string | null }>;
    reopenableStatuses: string[];
    clearCheckpoint: (missionId: string) => Promise<void>;
  };
}

// ────────────────────────────────────────────────────────
// buildCompletedUpdate
// ────────────────────────────────────────────────────────
describe("buildCompletedUpdate", () => {
  it("status is always 'completed'", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const u = hooks.buildCompletedUpdate({ finalScore: 85 });
    expect(u.status).toBe("completed");
  });

  it("completedAt is a Date", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const u = hooks.buildCompletedUpdate({});
    expect(u.completedAt).toBeInstanceOf(Date);
  });

  it("scalar fields map with nullish coalesce", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const u = hooks.buildCompletedUpdate({
      finalScore: 88,
      tokensUsed: 1234,
      costUsd: 0.42,
      trajectoryStored: 7,
      elapsedWallTimeMs: 90000,
    });
    expect(u.finalScore).toBe(88);
    expect(u.tokensUsed).toBe(1234);
    expect(u.costUsd).toBe(0.42);
    expect(u.trajectoryStored).toBe(7);
    expect(u.elapsedWallTimeMs).toBe(90000);
  });

  it("undefined scalar fields become null", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const u = hooks.buildCompletedUpdate({});
    expect(u.finalScore).toBeNull();
    expect(u.tokensUsed).toBeNull();
    expect(u.costUsd).toBeNull();
  });

  it("report.title truncated to 500 chars", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const longTitle = "T".repeat(600);
    const u = hooks.buildCompletedUpdate({
      report: { title: longTitle, summary: "sum" },
    });
    expect((u.reportTitle as string).length).toBe(500);
    expect(u.reportSummary).toBe("sum");
  });

  it("leaderJournal present → included in update", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const journal = { decisions: ["d1"] };
    const u = hooks.buildCompletedUpdate({ leaderJournal: journal });
    expect(u.leaderJournal).toEqual(journal);
  });

  it("leaderJournal absent (undefined) → key not set", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const u = hooks.buildCompletedUpdate({});
    // When leaderJournal is undefined, the key should not be set (not undefined, just omitted)
    expect(u.leaderJournal).toBeUndefined();
  });

  it("reportArtifactVersion preserved", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const u = hooks.buildCompletedUpdate({ reportArtifactVersion: 2 });
    expect(u.reportArtifactVersion).toBe(2);
  });

  it("leaderOverallScore, leaderSigned, leaderVerdict preserved", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const u = hooks.buildCompletedUpdate({
      leaderOverallScore: 92,
      leaderSigned: true,
      leaderVerdict: "excellent",
    });
    expect(u.leaderOverallScore).toBe(92);
    expect(u.leaderSigned).toBe(true);
    expect(u.leaderVerdict).toBe("excellent");
  });

  it("dimensions, verdicts, reconciliationReport cast to JsonValue", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const dims = [{ id: "d1" }];
    const u = hooks.buildCompletedUpdate({
      dimensions: dims,
      verdicts: ["v1"],
      reconciliationReport: { summary: "ok" },
    });
    expect(u.dimensions).toEqual(dims);
    expect(u.verdicts).toEqual(["v1"]);
    expect((u.reconciliationReport as Record<string, unknown>).summary).toBe(
      "ok",
    );
  });
});

// ────────────────────────────────────────────────────────
// buildFailedUpdate
// ────────────────────────────────────────────────────────
describe("buildFailedUpdate", () => {
  it("normal failure: status='failed', isLeadRefusal=false", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const r = hooks.buildFailedUpdate({ errorMessage: "oops" });
    expect(r.update.status).toBe("failed");
    expect(r.isLeadRefusal).toBe(false);
    expect(r.update.errorMessage).toBe("oops");
  });

  it("leaderSigned=false → status='quality-failed', isLeadRefusal=true", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const r = hooks.buildFailedUpdate({ leaderSigned: false });
    expect(r.update.status).toBe("quality-failed");
    expect(r.isLeadRefusal).toBe(true);
    expect(r.effectiveFailureCode).toBe("leader_signoff_rejected");
  });

  it("leaderSigned=false with explicit failureCode → effectiveFailureCode uses provided code", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const r = hooks.buildFailedUpdate({
      leaderSigned: false,
      failureCode: "CUSTOM_CODE" as never,
    });
    expect(r.effectiveFailureCode).toBe("CUSTOM_CODE");
  });

  it("errorMessage truncated to 2000 chars", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const longMsg = "E".repeat(2500);
    const r = hooks.buildFailedUpdate({ errorMessage: longMsg });
    expect((r.update.errorMessage as string).length).toBe(2000);
  });

  it("report > 10MB → errorMessage set to 'report_too_large', report cleared", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    // 10MB + 1 byte
    const hugeString = "X".repeat(10 * 1024 * 1024 + 1);
    const detail = { report: { title: "T", summary: hugeString } };
    const r = hooks.buildFailedUpdate(detail);
    // After mutation, errorMessage should be set to 'report_too_large'
    expect(r.update.errorMessage).toBe("report_too_large");
    // report should not be in update (was cleared)
    expect(r.update.reportFull).toBeUndefined();
  });

  it("report within 10MB → report preserved", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const d = { report: { title: "T", summary: "short" } };
    const r = hooks.buildFailedUpdate(d);
    expect(r.update.reportFull).toEqual({ title: "T", summary: "short" });
    expect(r.update.reportTitle).toBe("T");
  });

  it("optional trajectoryStored only set when non-null", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const r1 = hooks.buildFailedUpdate({ trajectoryStored: 5 });
    expect(r1.update.trajectoryStored).toBe(5);
    const r2 = hooks.buildFailedUpdate({});
    expect(r2.update.trajectoryStored).toBeUndefined();
  });

  it("optional verdicts only set when defined", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const r1 = hooks.buildFailedUpdate({ verdicts: ["v1"] });
    expect(r1.update.verdicts).toEqual(["v1"]);
    const r2 = hooks.buildFailedUpdate({});
    expect(r2.update.verdicts).toBeUndefined();
  });

  it("leaderJournal present → included", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const r = hooks.buildFailedUpdate({ leaderJournal: { key: "val" } });
    expect(r.update.leaderJournal).toEqual({ key: "val" });
  });

  it("dimensions present → included", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const r = hooks.buildFailedUpdate({ dimensions: [{ id: "d1" }] });
    expect(r.update.dimensions).toEqual([{ id: "d1" }]);
  });

  it("themeSummary present → included", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const r = hooks.buildFailedUpdate({ themeSummary: "theme-x" });
    expect(r.update.themeSummary).toBe("theme-x");
  });

  it("completedAt is always a Date", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const r = hooks.buildFailedUpdate({});
    expect(r.update.completedAt).toBeInstanceOf(Date);
  });
});

// ────────────────────────────────────────────────────────
// buildCancelledUpdate
// ────────────────────────────────────────────────────────
describe("buildCancelledUpdate", () => {
  it("returns status=cancelled with completedAt and message", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    const u = hooks.buildCancelledUpdate();
    expect(u.status).toBe("cancelled");
    expect(u.completedAt).toBeInstanceOf(Date);
    expect(u.errorMessage).toContain("cancelled");
  });
});

// ────────────────────────────────────────────────────────
// conditionalUpdate
// ────────────────────────────────────────────────────────
describe("conditionalUpdate", () => {
  it("delegates to prisma.agentPlaygroundMission.updateMany with status=running filter", async () => {
    const { helper, prisma } = makeHelper();
    const hooks = getHooks(helper);
    prisma.agentPlaygroundMission.updateMany.mockResolvedValue({ count: 1 });
    const count = await hooks.conditionalUpdate(
      "m-1",
      { userId: "u-1" },
      { status: "completed" },
    );
    expect(count).toBe(1);
    expect(prisma.agentPlaygroundMission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "m-1",
          status: "running",
          userId: "u-1",
        }),
      }),
    );
  });

  it("without userId: no userId filter in where", async () => {
    const { helper, prisma } = makeHelper();
    const hooks = getHooks(helper);
    prisma.agentPlaygroundMission.updateMany.mockResolvedValue({ count: 0 });
    await hooks.conditionalUpdate("m-2", {}, { status: "failed" });
    const whereArg =
      prisma.agentPlaygroundMission.updateMany.mock.calls[0][0].where;
    expect(whereArg.userId).toBeUndefined();
    expect(whereArg.id).toBe("m-2");
  });

  it("returns count from updateMany result", async () => {
    const { helper, prisma } = makeHelper();
    const hooks = getHooks(helper);
    prisma.agentPlaygroundMission.updateMany.mockResolvedValue({ count: 0 });
    const count = await hooks.conditionalUpdate("m-3", {}, {});
    expect(count).toBe(0);
  });
});

// ────────────────────────────────────────────────────────
// reopenTransaction
// ────────────────────────────────────────────────────────
describe("reopenTransaction", () => {
  it("success path: affected=1, event created", async () => {
    const { helper, prisma } = makeHelper();
    const hooks = getHooks(helper);
    prisma.agentPlaygroundMission.updateMany.mockResolvedValue({ count: 1 });
    const result = await hooks.reopenTransaction("m-1", "u-1", [
      "failed",
      "cancelled",
    ]);
    expect(result.affected).toBe(1);
    expect(result.currentStatus).toBe("running");
    expect(prisma.agentPlaygroundMissionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          missionId: "m-1",
          type: "playground.mission:reopened",
        }),
      }),
    );
  });

  it("count=0: returns affected=0 and currentStatus from probe", async () => {
    const { helper, prisma } = makeHelper();
    const hooks = getHooks(helper);
    prisma.agentPlaygroundMission.updateMany.mockResolvedValue({ count: 0 });
    prisma.agentPlaygroundMission.findFirst.mockResolvedValue({
      status: "completed",
    });
    const result = await hooks.reopenTransaction("m-1", "u-1", ["failed"]);
    expect(result.affected).toBe(0);
    expect(result.currentStatus).toBe("completed");
    expect(prisma.agentPlaygroundMissionEvent.create).not.toHaveBeenCalled();
  });

  it("count=0 and probe returns null: currentStatus=null", async () => {
    const { helper, prisma } = makeHelper();
    const hooks = getHooks(helper);
    prisma.agentPlaygroundMission.updateMany.mockResolvedValue({ count: 0 });
    prisma.agentPlaygroundMission.findFirst.mockResolvedValue(null);
    const result = await hooks.reopenTransaction("m-1", "u-1", ["failed"]);
    expect(result.affected).toBe(0);
    expect(result.currentStatus).toBeNull();
  });
});

// ────────────────────────────────────────────────────────
// reopenableStatuses
// ────────────────────────────────────────────────────────
describe("reopenableStatuses", () => {
  it("includes failed, quality-failed AND cancelled (2026-05-30 regression)", () => {
    const { helper } = makeHelper();
    const hooks = getHooks(helper);
    expect(hooks.reopenableStatuses).toContain("failed");
    expect(hooks.reopenableStatuses).toContain("quality-failed");
    expect(hooks.reopenableStatuses).toContain("cancelled");
  });
});

// ────────────────────────────────────────────────────────
// clearCheckpoint
// ────────────────────────────────────────────────────────
describe("clearCheckpoint hook", () => {
  it("delegates to clearCheckpointJsonbKey", async () => {
    const { helper, clearCheckpoint } = makeHelper();
    const hooks = getHooks(helper);
    await hooks.clearCheckpoint("m-99");
    expect(clearCheckpoint).toHaveBeenCalledWith("m-99");
  });
});

// ────────────────────────────────────────────────────────
// appendLeaderJournal
// ────────────────────────────────────────────────────────
describe("appendLeaderJournal", () => {
  it("merges patch into existing journal", async () => {
    const { helper, prisma } = makeHelper();
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: { score: 80 },
      leaderJournalUri: null,
    });
    prisma.agentPlaygroundMission.update.mockResolvedValue({});

    await helper.appendLeaderJournal("m-1", { verdict: "pass" });

    expect(prisma.agentPlaygroundMission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m-1" },
        data: {
          leaderJournal: expect.objectContaining({
            score: 80,
            verdict: "pass",
          }),
        },
      }),
    );
  });

  it("decisions arrays are concatenated (not replaced)", async () => {
    const { helper, prisma } = makeHelper();
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: { decisions: ["d1", "d2"] },
      leaderJournalUri: null,
    });
    prisma.agentPlaygroundMission.update.mockResolvedValue({});

    await helper.appendLeaderJournal("m-1", { decisions: ["d3"] });

    const updateCall = prisma.agentPlaygroundMission.update.mock.calls[0][0];
    expect(updateCall.data.leaderJournal.decisions).toEqual(["d1", "d2", "d3"]);
  });

  it("null existing journal → treated as empty object", async () => {
    const { helper, prisma } = makeHelper();
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: null,
      leaderJournalUri: null,
    });
    prisma.agentPlaygroundMission.update.mockResolvedValue({});

    await helper.appendLeaderJournal("m-1", { verdict: "ok" });

    const updateCall = prisma.agentPlaygroundMission.update.mock.calls[0][0];
    expect(updateCall.data.leaderJournal).toEqual({ verdict: "ok" });
  });

  it("row not found (findUnique returns null) → merged patch is just the patch", async () => {
    const { helper, prisma } = makeHelper();
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue(null);
    prisma.agentPlaygroundMission.update.mockResolvedValue({});

    await helper.appendLeaderJournal("m-1", { score: 90 });

    const updateCall = prisma.agentPlaygroundMission.update.mock.calls[0][0];
    expect(updateCall.data.leaderJournal).toEqual({ score: 90 });
  });

  it("transaction error is swallowed (warn logged, no throw)", async () => {
    const { helper, prisma } = makeHelper();
    prisma.$transaction.mockRejectedValue(new Error("DB connection error"));

    // Should NOT throw
    await expect(
      helper.appendLeaderJournal("m-1", { key: "v" }),
    ).resolves.toBeUndefined();
  });

  it("decisions in patch with no existing decisions → just the new decisions", async () => {
    const { helper, prisma } = makeHelper();
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: { score: 75 }, // no decisions array
      leaderJournalUri: null,
    });
    prisma.agentPlaygroundMission.update.mockResolvedValue({});

    await helper.appendLeaderJournal("m-1", { decisions: ["new-d"] });

    const updateCall = prisma.agentPlaygroundMission.update.mock.calls[0][0];
    // No concat since current has no decisions array
    expect(updateCall.data.leaderJournal.decisions).toEqual(["new-d"]);
  });
});
