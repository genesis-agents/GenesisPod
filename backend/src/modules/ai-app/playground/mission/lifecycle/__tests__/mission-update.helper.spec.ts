/**
 * MissionUpdateHelper unit tests
 *
 * Mocks PrismaService and the ai-harness/facade to avoid heavy module wiring.
 */

// ── Harness facade mock ───────────────────────────────────────────────────────
// We provide a minimal inline implementation of BusinessTeamUpdateHelperFramework
// so the actual class behaviour is exercised without loading the full harness.
jest.mock("@/modules/ai-harness/facade", () => {
  class BusinessTeamUpdateHelperFramework {
    protected readonly log: { warn: jest.Mock } = { warn: jest.fn() };
    protected updateHooks: {
      loggerNamespace: string;
      updateManyByOwner: jest.Mock;
      updateAnyById: jest.Mock;
    };

    constructor(hooks: {
      loggerNamespace: string;
      updateManyByOwner: jest.Mock;
      updateAnyById: jest.Mock;
    }) {
      this.updateHooks = hooks;
    }

    protected async runUpdate(
      missionId: string,
      userId: string | undefined,
      data: Record<string, unknown>,
      label: string,
    ): Promise<void> {
      try {
        if (userId) {
          await this.updateHooks.updateManyByOwner(missionId, userId, data);
        } else {
          this.log.warn(
            `[${label} ${missionId}] missing userId — falling back to update where{id}`,
          );
          await this.updateHooks.updateAnyById(missionId, data);
        }
      } catch (err: unknown) {
        this.log.warn(
          `[${label} ${missionId}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    protected async resetFieldsFrameworkCore(
      missionId: string,
      fields: ReadonlyArray<string>,
      fieldMap: Record<string, string>,
      userId?: string,
    ): Promise<void> {
      if (fields.length === 0) return;
      const data: Record<string, null> = {};
      for (const f of fields) {
        if (f === "status") continue;
        const camel = fieldMap[f];
        if (camel) data[camel] = null;
      }
      if (Object.keys(data).length === 0) return;
      await this.runUpdate(missionId, userId, data, "resetFields");
    }
  }

  const applyInputPatch = jest.fn(
    (
      snap: Record<string, unknown>,
      patch: Record<string, unknown>,
      _meta: Record<string, unknown>,
    ) => ({ ...snap, ...patch }),
  );

  return { BusinessTeamUpdateHelperFramework, applyInputPatch };
});

// ── PrismaService mock ────────────────────────────────────────────────────────
const mockPrismaUpdateMany = jest.fn();
const mockPrismaUpdate = jest.fn();
const mockPrismaFindFirst = jest.fn();

jest.mock("@/common/prisma/prisma.service", () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    agentPlaygroundMission: {
      updateMany: mockPrismaUpdateMany,
      update: mockPrismaUpdate,
      findFirst: mockPrismaFindFirst,
    },
  })),
}));

// Mock the playground.input-rebuilder (imported as type only but may trigger runtime resolution)
jest.mock(
  "@/modules/ai-app/playground/runtime/playground.input-rebuilder",
  () => ({}),
);

// ── Imports after mocks ───────────────────────────────────────────────────────
import { MissionUpdateHelper } from "../mission-update.helper";
import { PrismaService } from "@/common/prisma/prisma.service";
import { applyInputPatch } from "@/modules/ai-harness/facade";

function makePrisma(): PrismaService {
  return new (PrismaService as unknown as new () => PrismaService)();
}

function makeHelper() {
  const prisma = makePrisma();
  return { helper: new MissionUpdateHelper(prisma), prisma };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── updateTopicByUser ─────────────────────────────────────────────────────────

describe("MissionUpdateHelper.updateTopicByUser", () => {
  it("calls updateManyByOwner with correct args", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.updateTopicByUser("m1", "u1", "Hello World");

    expect(mockPrismaUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", userId: "u1" },
      data: { topic: "Hello World" },
    });
  });

  it("slices topic to 500 chars", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });
    const longTopic = "x".repeat(600);

    await helper.updateTopicByUser("m1", "u1", longTopic);

    expect(mockPrismaUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", userId: "u1" },
      data: { topic: "x".repeat(500) },
    });
  });

  it("swallows DB error (fire-and-forget)", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockRejectedValue(new Error("db down"));

    await expect(
      helper.updateTopicByUser("m1", "u1", "topic"),
    ).resolves.toBeUndefined();
  });
});

// ── updateBudgetByUser ────────────────────────────────────────────────────────

describe("MissionUpdateHelper.updateBudgetByUser", () => {
  const baseRow = { id: "m1", status: "failed", configSnapshot: null };

  it("returns not_found when row missing", async () => {
    const { helper } = makeHelper();
    mockPrismaFindFirst.mockResolvedValue(null);

    const res = await helper.updateBudgetByUser("m1", "u1", {
      maxCredits: 100,
    });

    expect(res).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns non_terminal_status for running mission", async () => {
    const { helper } = makeHelper();
    mockPrismaFindFirst.mockResolvedValue({ ...baseRow, status: "running" });

    const res = await helper.updateBudgetByUser("m1", "u1", {
      maxCredits: 100,
    });

    expect(res).toEqual({ ok: false, reason: "non_terminal_status" });
  });

  it("returns non_terminal_status for queued mission", async () => {
    const { helper } = makeHelper();
    mockPrismaFindFirst.mockResolvedValue({ ...baseRow, status: "queued" });

    const res = await helper.updateBudgetByUser("m1", "u1", {
      maxCredits: 100,
    });

    expect(res).toEqual({ ok: false, reason: "non_terminal_status" });
  });

  it("returns non_terminal_status for pending mission", async () => {
    const { helper } = makeHelper();
    mockPrismaFindFirst.mockResolvedValue({ ...baseRow, status: "pending" });

    const res = await helper.updateBudgetByUser("m1", "u1", {
      maxCredits: 100,
    });

    expect(res).toEqual({ ok: false, reason: "non_terminal_status" });
  });

  it("returns empty_patch when no patch fields provided and no configSnapshot", async () => {
    const { helper } = makeHelper();
    mockPrismaFindFirst.mockResolvedValue({ ...baseRow, status: "failed" });

    const res = await helper.updateBudgetByUser("m1", "u1", {});

    expect(res).toEqual({ ok: false, reason: "empty_patch" });
  });

  it("updates maxCredits column when provided (no configSnapshot)", async () => {
    const { helper } = makeHelper();
    mockPrismaFindFirst.mockResolvedValue({ ...baseRow, status: "failed" });
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    const res = await helper.updateBudgetByUser("m1", "u1", {
      maxCredits: 200,
    });

    expect(res).toEqual({ ok: true });
    expect(mockPrismaUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", userId: "u1" },
      data: expect.objectContaining({ maxCredits: 200 }),
    });
  });

  it("returns no_row_updated when updateMany count is 0", async () => {
    const { helper } = makeHelper();
    mockPrismaFindFirst.mockResolvedValue({ ...baseRow, status: "failed" });
    mockPrismaUpdateMany.mockResolvedValue({ count: 0 });

    const res = await helper.updateBudgetByUser("m1", "u1", {
      maxCredits: 200,
    });

    expect(res).toEqual({ ok: false, reason: "no_row_updated" });
  });

  it("returns db_error when updateMany throws", async () => {
    const { helper } = makeHelper();
    mockPrismaFindFirst.mockResolvedValue({ ...baseRow, status: "failed" });
    mockPrismaUpdateMany.mockRejectedValue(new Error("conn error"));

    const res = await helper.updateBudgetByUser("m1", "u1", {
      maxCredits: 200,
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/^db_error/);
  });

  it("db_error with non-Error object uses String()", async () => {
    const { helper } = makeHelper();
    mockPrismaFindFirst.mockResolvedValue({ ...baseRow, status: "failed" });
    mockPrismaUpdateMany.mockRejectedValue("raw string error");

    const res = await helper.updateBudgetByUser("m1", "u1", {
      maxCredits: 200,
    });

    expect(res.reason).toMatch(/^db_error: unknown/);
  });

  it("applies applyInputPatch when configSnapshot has schemaVersion", async () => {
    const snap = {
      schemaVersion: 1,
      budget: { maxCredits: 100, budgetMultiplier: 1 },
      runtimeLimits: { wallTimeCapMs: 60000 },
      businessInput: {},
      language: "en",
    };
    const { helper } = makeHelper();
    mockPrismaFindFirst.mockResolvedValue({
      ...baseRow,
      status: "failed",
      configSnapshot: snap,
    });
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    const res = await helper.updateBudgetByUser("m1", "u1", {
      maxCredits: 500,
      budgetMultiplierOverride: 2,
      wallTimeCapMs: 120000,
    });

    expect(res).toEqual({ ok: true });
    expect(applyInputPatch).toHaveBeenCalled();
    const [passedSnap, patch] = (applyInputPatch as jest.Mock).mock.calls[0];
    expect(passedSnap).toBe(snap);
    expect(patch.budgetOverride).toBeDefined();
    expect(patch.runtimeLimitsOverride).toBeDefined();
  });

  it("sets budgetOverride with budgetMultiplierOverride only (no maxCredits)", async () => {
    const snap = {
      schemaVersion: 1,
      budget: { maxCredits: 100, budgetMultiplier: 1 },
      runtimeLimits: { wallTimeCapMs: 60000 },
      businessInput: {},
      language: "en",
    };
    const { helper } = makeHelper();
    mockPrismaFindFirst.mockResolvedValue({
      ...baseRow,
      status: "failed",
      configSnapshot: snap,
    });
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.updateBudgetByUser("m1", "u1", {
      budgetMultiplierOverride: 3,
    });

    const [, patch] = (applyInputPatch as jest.Mock).mock.calls[0];
    expect(patch.budgetOverride).toBeDefined();
    expect(patch.runtimeLimitsOverride).toBeUndefined();
  });

  it("sets runtimeLimitsOverride when only wallTimeCapMs provided", async () => {
    const snap = {
      schemaVersion: 1,
      budget: { maxCredits: 100, budgetMultiplier: 1 },
      runtimeLimits: { wallTimeCapMs: 60000 },
      businessInput: {},
      language: "en",
    };
    const { helper } = makeHelper();
    mockPrismaFindFirst.mockResolvedValue({
      ...baseRow,
      status: "failed",
      configSnapshot: snap,
    });
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.updateBudgetByUser("m1", "u1", { wallTimeCapMs: 999 });

    const [, patch] = (applyInputPatch as jest.Mock).mock.calls[0];
    expect(patch.budgetOverride).toBeUndefined();
    expect(patch.runtimeLimitsOverride).toEqual({ wallTimeCapMs: 999 });
  });

  it("returns ok:true when snap has schemaVersion and even no-op patch triggers configSnapshot update", async () => {
    // When schemaVersion is present, applyInputPatch is always called (even with undefined overrides),
    // so configSnapshot is always added to data — meaning data is never empty, and the update proceeds.
    const snap = {
      schemaVersion: 1,
      budget: { maxCredits: 100, budgetMultiplier: 1 },
      runtimeLimits: { wallTimeCapMs: 60000 },
      businessInput: {},
      language: "en",
    };
    const { helper } = makeHelper();
    mockPrismaFindFirst.mockResolvedValue({
      ...baseRow,
      status: "failed",
      configSnapshot: snap,
    });
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    const res = await helper.updateBudgetByUser("m1", "u1", {});

    // applyInputPatch is called → data.configSnapshot is set → not empty_patch
    expect(res).toEqual({ ok: true });
  });
});

// ── resetFields ───────────────────────────────────────────────────────────────

describe("MissionUpdateHelper.resetFields", () => {
  it("resets known snake_case fields to null", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.resetFields(
      "m1",
      ["report_full", "final_score", "status"],
      "u1",
    );

    expect(mockPrismaUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", userId: "u1" },
      data: { reportFull: null, finalScore: null },
    });
  });

  it("skips 'status' field and does not update", async () => {
    const { helper } = makeHelper();

    await helper.resetFields("m1", ["status"], "u1");

    expect(mockPrismaUpdateMany).not.toHaveBeenCalled();
  });

  it("skips unmapped fields and does not call update", async () => {
    const { helper } = makeHelper();

    await helper.resetFields("m1", ["unknown_field_xyz"], "u1");

    expect(mockPrismaUpdateMany).not.toHaveBeenCalled();
    expect(mockPrismaUpdate).not.toHaveBeenCalled();
  });

  it("handles empty fields array gracefully", async () => {
    const { helper } = makeHelper();

    await helper.resetFields("m1", [], "u1");

    expect(mockPrismaUpdateMany).not.toHaveBeenCalled();
  });

  it("uses updateAnyById when userId is undefined", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdate.mockResolvedValue({});

    await helper.resetFields("m1", ["report_full"], undefined);

    expect(mockPrismaUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { reportFull: null },
    });
  });

  it("resets all 18 mapped fields", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.resetFields(
      "m1",
      [
        "tokens_used",
        "cost_usd",
        "trajectory_stored",
        "last_completed_stage",
        "max_credits",
        "dimensions",
        "theme_summary",
        "reconciliation_report",
        "verdicts",
        "leader_journal",
        "leader_signed",
        "leader_overall_score",
        "leader_verdict",
        "outline_plan",
        "analyst_output",
        "completed_at",
        "error_message",
        "report_artifact_version",
      ],
      "u1",
    );

    const data = mockPrismaUpdateMany.mock.calls[0][0].data;
    expect(data.tokensUsed).toBeNull();
    expect(data.costUsd).toBeNull();
    expect(data.trajectoryStored).toBeNull();
    expect(data.lastCompletedStage).toBeNull();
    expect(data.maxCredits).toBeNull();
    expect(data.dimensions).toBeNull();
    expect(data.themeSummary).toBeNull();
    expect(data.reconciliationReport).toBeNull();
    expect(data.verdicts).toBeNull();
    expect(data.leaderJournal).toBeNull();
    expect(data.leaderSigned).toBeNull();
    expect(data.leaderOverallScore).toBeNull();
    expect(data.leaderVerdict).toBeNull();
    expect(data.outlinePlan).toBeNull();
    expect(data.analystOutput).toBeNull();
    expect(data.completedAt).toBeNull();
    expect(data.errorMessage).toBeNull();
    expect(data.reportArtifactVersion).toBeNull();
  });
});

// ── markRerunPatch ────────────────────────────────────────────────────────────

describe("MissionUpdateHelper.markRerunPatch", () => {
  it("updates all provided patch fields", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.markRerunPatch(
      "m1",
      {
        themeSummary: "summary",
        dimensions: { a: 1 },
        reportFull: { title: "t" },
        verdicts: [1, 2],
        reportArtifactVersion: 3,
        reconciliationReport: { ok: true },
        leaderOverallScore: 90,
        leaderSigned: true,
        leaderVerdict: "pass",
        finalScore: 85,
        tokensUsed: 1000,
        costUsd: 0.5,
        reportTitle: "My Report",
        reportSummary: "summary text",
      },
      "u1",
    );

    const data = mockPrismaUpdateMany.mock.calls[0][0].data;
    expect(data.themeSummary).toBe("summary");
    expect(data.reportArtifactVersion).toBe(3);
    expect(data.leaderOverallScore).toBe(90);
    expect(data.leaderSigned).toBe(true);
    expect(data.leaderVerdict).toBe("pass");
    expect(data.finalScore).toBe(85);
    expect(data.tokensUsed).toBe(1000);
    expect(data.costUsd).toBe(0.5);
    expect(data.reportTitle).toBe("My Report");
    expect(data.reportSummary).toBe("summary text");
  });

  it("slices reportTitle to 500 chars", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.markRerunPatch("m1", { reportTitle: "r".repeat(600) }, "u1");

    const data = mockPrismaUpdateMany.mock.calls[0][0].data;
    expect(data.reportTitle).toBe("r".repeat(500));
  });

  it("ignores undefined patch fields", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.markRerunPatch("m1", { finalScore: 80 }, "u1");

    const data = mockPrismaUpdateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("themeSummary");
    expect(data).not.toHaveProperty("dimensions");
    expect(data.finalScore).toBe(80);
  });

  it("uses updateAnyById when userId undefined", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdate.mockResolvedValue({});

    await helper.markRerunPatch("m1", { finalScore: 70 }, undefined);

    expect(mockPrismaUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: expect.objectContaining({ finalScore: 70 }),
    });
  });

  it("stores null for null json fields", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.markRerunPatch(
      "m1",
      {
        dimensions: null,
        reportFull: null,
        verdicts: null,
        reconciliationReport: null,
      },
      "u1",
    );

    const data = mockPrismaUpdateMany.mock.calls[0][0].data;
    expect(data.dimensions).toBeNull();
    expect(data.reportFull).toBeNull();
    expect(data.verdicts).toBeNull();
    expect(data.reconciliationReport).toBeNull();
  });
});

// ── markIntermediateState ─────────────────────────────────────────────────────

describe("MissionUpdateHelper.markIntermediateState", () => {
  it("always sets heartbeatAt to a Date", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.markIntermediateState("m1", {}, "u1");

    const data = mockPrismaUpdateMany.mock.calls[0][0].data;
    expect(data.heartbeatAt).toBeInstanceOf(Date);
  });

  it("includes all provided patch fields", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.markIntermediateState(
      "m1",
      {
        reportFull: { title: "t" },
        reportArtifactVersion: 2,
        outlinePlan: { plan: true },
        analystOutput: { output: true },
        verdicts: [1],
        reconciliationReport: { ok: true },
        dimensions: [{ id: "d1" }],
        themeSummary: "interim",
        leaderJournal: { log: [] },
        leaderSigned: false,
        leaderOverallScore: 50,
        leaderVerdict: "pending",
        lastCompletedStage: 3,
      },
      "u1",
    );

    const data = mockPrismaUpdateMany.mock.calls[0][0].data;
    expect(data.reportArtifactVersion).toBe(2);
    expect(data.themeSummary).toBe("interim");
    expect(data.leaderSigned).toBe(false);
    expect(data.leaderOverallScore).toBe(50);
    expect(data.leaderVerdict).toBe("pending");
    expect(data.lastCompletedStage).toBe(3);
  });

  it("handles null json values", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.markIntermediateState(
      "m1",
      { outlinePlan: null, analystOutput: null, leaderJournal: null },
      "u1",
    );

    const data = mockPrismaUpdateMany.mock.calls[0][0].data;
    expect(data.outlinePlan).toBeNull();
    expect(data.analystOutput).toBeNull();
    expect(data.leaderJournal).toBeNull();
  });

  it("ignores undefined patch fields", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.markIntermediateState("m1", { lastCompletedStage: 5 }, "u1");

    const data = mockPrismaUpdateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("reportFull");
    expect(data).not.toHaveProperty("themeSummary");
    expect(data.lastCompletedStage).toBe(5);
  });

  it("handles null for reportFull, verdicts, reconciliationReport, dimensions", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper.markIntermediateState(
      "m1",
      {
        reportFull: null,
        verdicts: null,
        reconciliationReport: null,
        dimensions: null,
      },
      "u1",
    );

    const data = mockPrismaUpdateMany.mock.calls[0][0].data;
    expect(data.reportFull).toBeNull();
    expect(data.verdicts).toBeNull();
    expect(data.reconciliationReport).toBeNull();
    expect(data.dimensions).toBeNull();
  });

  it("uses updateAnyById when userId missing", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdate.mockResolvedValue({});

    await helper.markIntermediateState(
      "m1",
      { lastCompletedStage: 2 },
      undefined,
    );

    expect(mockPrismaUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: expect.objectContaining({ lastCompletedStage: 2 }),
    });
  });
});

// ── _runMissionUpdate (deprecated shim) ──────────────────────────────────────

describe("MissionUpdateHelper._runMissionUpdate", () => {
  it("delegates to updateManyByOwner when userId provided", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });

    await helper._runMissionUpdate(
      "m1",
      "u1",
      { status: "running" } as never,
      "test",
    );

    expect(mockPrismaUpdateMany).toHaveBeenCalledWith({
      where: { id: "m1", userId: "u1" },
      data: { status: "running" },
    });
  });

  it("delegates to updateAnyById when userId undefined", async () => {
    const { helper } = makeHelper();
    mockPrismaUpdate.mockResolvedValue({});

    await helper._runMissionUpdate(
      "m1",
      undefined,
      { status: "running" } as never,
      "test",
    );

    expect(mockPrismaUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { status: "running" },
    });
  });
});
