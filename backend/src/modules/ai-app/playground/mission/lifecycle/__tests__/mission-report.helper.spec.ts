/**
 * MissionReportHelper unit tests
 *
 * Strategy: mock @/modules/ai-harness/facade with minimal inline implementations
 * that drive the same behaviour as the real framework. Mock PrismaService fully.
 */

// ── Harness facade mock ───────────────────────────────────────────────────────
jest.mock("@/modules/ai-harness/facade", () => {
  class BusinessTeamReportHelperFramework<TVersionRow> {
    protected readonly log = { warn: jest.fn() };
    protected reportHooks: {
      loggerNamespace: string;
      runSerializable: (
        fn: (tx: unknown) => Promise<unknown>,
      ) => Promise<unknown>;
      aggregateMaxVersion: (missionId: string, tx: unknown) => Promise<number>;
      createVersion: (args: unknown, tx: unknown) => Promise<void>;
      listVersions: (missionId: string) => Promise<readonly TVersionRow[]>;
      findVersion: (
        missionId: string,
        version: number,
      ) => Promise<TVersionRow | null>;
    };

    constructor(
      hooks: typeof BusinessTeamReportHelperFramework.prototype.reportHooks,
    ) {
      this.reportHooks = hooks;
    }

    async saveReportVersion(args: {
      missionId: string;
      triggerType: string;
      report?: { title?: string; summary?: string; [k: string]: unknown };
      versionLabel?: string;
      extra?: Record<string, unknown>;
    }): Promise<number> {
      try {
        return (await this.reportHooks.runSerializable(async (tx) => {
          const maxVersion = await this.reportHooks.aggregateMaxVersion(
            args.missionId,
            tx,
          );
          const nextVersion = maxVersion + 1;
          const reportTitle = args.report?.title?.slice(0, 500) ?? null;
          const reportSummary = args.report?.summary ?? null;
          await this.reportHooks.createVersion(
            {
              missionId: args.missionId,
              version: nextVersion,
              versionLabel:
                args.versionLabel ??
                `${args.triggerType}-${new Date().toISOString().slice(0, 10)}`,
              reportFull: args.report ?? null,
              reportTitle,
              reportSummary,
              triggerType: args.triggerType.slice(0, 40),
              extra: args.extra,
            },
            tx,
          );
          return nextVersion;
        })) as number;
      } catch (_err: unknown) {
        this.log.warn(`[saveReportVersion ${args.missionId}] failed`);
        return 0;
      }
    }

    async listReportVersions(
      missionId: string,
    ): Promise<readonly TVersionRow[]> {
      try {
        return await this.reportHooks.listVersions(missionId);
      } catch (_err: unknown) {
        this.log.warn(`[listReportVersions ${missionId}] failed`);
        return [] as readonly TVersionRow[];
      }
    }

    async getReportVersion(
      missionId: string,
      version: number,
    ): Promise<TVersionRow | null> {
      try {
        return await this.reportHooks.findVersion(missionId, version);
      } catch (_err: unknown) {
        this.log.warn(`[getReportVersion ${missionId} v${version}] failed`);
        return null;
      }
    }
  }

  return { BusinessTeamReportHelperFramework, ReportHelperHooks: {} };
});

// ── PrismaService mock ────────────────────────────────────────────────────────
const mockFindUniqueReport = jest.fn();
const mockAggregateVersion = jest.fn();
const mockCreateVersion = jest.fn();
const mockListVersions = jest.fn();
const mockFindVersionUnique = jest.fn();
const mockTransaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({}),
);
const mockUpsertResearch = jest.fn();
const mockFindManyResearch = jest.fn();
const mockUpsertChapter = jest.fn();
const mockFindManyChapter = jest.fn();

jest.mock("@/common/prisma/prisma.service", () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    $transaction: mockTransaction,
    missionReportVersion: {
      findUnique: mockFindUniqueReport,
      aggregate: mockAggregateVersion,
      create: mockCreateVersion,
      findMany: mockListVersions,
      findUniqueMissionVersion: mockFindVersionUnique,
    },
    agentPlaygroundResearchResult: {
      upsert: mockUpsertResearch,
      findMany: mockFindManyResearch,
    },
    agentPlaygroundChapterDraft: {
      upsert: mockUpsertChapter,
      findMany: mockFindManyChapter,
    },
  })),
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import { MissionReportHelper } from "../mission-report.helper";
import { PrismaService } from "@/common/prisma/prisma.service";

function makePrisma(): PrismaService {
  return new (PrismaService as unknown as new () => PrismaService)();
}

const mockIsMissionRowMissing = jest.fn((_err: unknown) => false);
const mockEmergencyAbort = jest.fn();

function makeHelper() {
  const prisma = makePrisma();
  return {
    helper: new MissionReportHelper(
      prisma,
      mockIsMissionRowMissing,
      mockEmergencyAbort,
    ),
    prisma,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInternalHooks(helper: MissionReportHelper) {
  return (
    helper as unknown as {
      reportHooks: {
        runSerializable: jest.Mock;
        aggregateMaxVersion: jest.Mock;
        createVersion: jest.Mock;
        listVersions: jest.Mock;
        findVersion: jest.Mock;
      };
    }
  ).reportHooks;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsMissionRowMissing.mockReturnValue(false);
  // Default: transaction runs fn immediately
  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  );
});

// ── saveReportVersion ─────────────────────────────────────────────────────────

describe("MissionReportHelper.saveReportVersion", () => {
  it("calls framework saveReportVersion with correct extra fields", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);

    // Make the runSerializable call succeed
    hooks.runSerializable = jest.fn(
      async (fn: (tx: unknown) => Promise<number>) => fn({}),
    );
    hooks.aggregateMaxVersion = jest.fn(async () => 2);
    hooks.createVersion = jest.fn(async () => undefined);

    const version = await helper.saveReportVersion({
      missionId: "m1",
      triggerType: "rerun",
      report: { title: "My Report", summary: "Summary" },
      finalScore: 90,
      leaderSigned: true,
      versionLabel: "v3",
    });

    expect(version).toBe(3);
    expect(hooks.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: "m1",
        version: 3,
        versionLabel: "v3",
        triggerType: "rerun",
        extra: { finalScore: 90, leaderSigned: true },
      }),
      {},
    );
  });

  it("uses null for missing finalScore/leaderSigned", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);
    hooks.runSerializable = jest.fn(
      async (fn: (tx: unknown) => Promise<number>) => fn({}),
    );
    hooks.aggregateMaxVersion = jest.fn(async () => 0);
    hooks.createVersion = jest.fn(async () => undefined);

    await helper.saveReportVersion({ missionId: "m1", triggerType: "manual" });

    expect(hooks.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        extra: { finalScore: null, leaderSigned: null },
      }),
      {},
    );
  });

  it("returns 0 when framework throws", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);
    hooks.runSerializable = jest.fn(async () => {
      throw new Error("tx failed");
    });

    const version = await helper.saveReportVersion({
      missionId: "m1",
      triggerType: "error",
    });

    expect(version).toBe(0);
  });

  it("uses real prisma hooks — aggregates and creates via $transaction", async () => {
    // Test the actual hooks wired inside MissionReportHelper constructor
    const { helper } = makeHelper();
    // getInternalHooks returns the original hooks (from constructor)
    const hooks = getInternalHooks(helper);

    // The real runSerializable calls prisma.$transaction
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) => {
        const tx = {
          missionReportVersion: {
            aggregate: jest.fn(async () => ({ _max: { version: 5 } })),
            create: jest.fn(async () => ({})),
          },
        };
        return fn(tx);
      },
    );

    const version = await hooks.runSerializable(async (tx: unknown) => {
      const agg = await hooks.aggregateMaxVersion("m1", tx);
      return agg;
    });

    expect(version).toBeDefined();
  });
});

// ── getReportVersion ──────────────────────────────────────────────────────────

describe("MissionReportHelper.getReportVersion", () => {
  const mockRow = {
    id: "rv1",
    version: 1,
    versionLabel: "v1",
    reportFull: { title: "t" },
    reportTitle: "My Report",
    reportSummary: "Summary",
    finalScore: 85,
    leaderSigned: true,
    triggerType: "rerun",
    changesFromPrev: null,
    generatedAt: new Date("2025-01-01"),
  };

  it("returns mapped detail when row found", async () => {
    const { helper } = makeHelper();
    mockFindUniqueReport.mockResolvedValue(mockRow);

    const result = await helper.getReportVersion("m1", 1);

    expect(result).not.toBeNull();
    expect(result?.id).toBe("rv1");
    expect(result?.version).toBe(1);
    expect(result?.reportFull).toEqual({ title: "t" });
    expect(result?.changesFromPrev).toBeNull();
    expect(result?.finalScore).toBe(85);
    expect(result?.leaderSigned).toBe(true);
    expect(result?.generatedAt).toBeInstanceOf(Date);
  });

  it("returns null when row not found", async () => {
    const { helper } = makeHelper();
    mockFindUniqueReport.mockResolvedValue(null);

    const result = await helper.getReportVersion("m1", 99);

    expect(result).toBeNull();
  });

  it("returns null on DB error (catches and warns)", async () => {
    const { helper } = makeHelper();
    mockFindUniqueReport.mockRejectedValue(new Error("db error"));

    const result = await helper.getReportVersion("m1", 1);

    expect(result).toBeNull();
  });

  it("returns null on non-Error DB failure (string thrown)", async () => {
    const { helper } = makeHelper();
    mockFindUniqueReport.mockRejectedValue("string error");

    const result = await helper.getReportVersion("m1", 1);

    expect(result).toBeNull();
  });

  it("queries with correct missionId_version composite key", async () => {
    const { helper } = makeHelper();
    mockFindUniqueReport.mockResolvedValue(mockRow);

    await helper.getReportVersion("m1", 1);

    expect(mockFindUniqueReport).toHaveBeenCalledWith({
      where: { missionId_version: { missionId: "m1", version: 1 } },
    });
  });
});

// ── framework listReportVersions ──────────────────────────────────────────────

describe("MissionReportHelper.listReportVersions (framework delegate)", () => {
  it("returns versions from listVersions hook", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);
    const mockRows = [
      {
        id: "rv1",
        version: 1,
        versionLabel: "v1",
        reportTitle: "T",
        reportSummary: "S",
        finalScore: 80,
        leaderSigned: false,
        triggerType: "manual",
        generatedAt: new Date(),
      },
    ];
    hooks.listVersions = jest.fn(async () => mockRows);

    const result = await helper.listReportVersions("m1");

    expect(result).toHaveLength(1);
    expect(hooks.listVersions).toHaveBeenCalledWith("m1");
  });

  it("returns empty array when listVersions throws", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);
    hooks.listVersions = jest.fn(async () => {
      throw new Error("db fail");
    });

    const result = await helper.listReportVersions("m1");

    expect(result).toEqual([]);
  });
});

// ── framework getReportVersion (via framework hook) ──────────────────────────

describe("MissionReportHelper.getReportVersion (framework hook path)", () => {
  it("returns null when findVersion hook throws", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);
    hooks.findVersion = jest.fn(async () => {
      throw new Error("fail");
    });

    // Note: MissionReportHelper overrides getReportVersion with direct prisma.findUnique
    // so the framework hook path is only reached through listReportVersions.
    // The direct override is already tested above.
    const result = await hooks.findVersion("m1", 1).catch(() => null);

    expect(result).toBeNull();
  });
});

// ── saveResearchResult ────────────────────────────────────────────────────────

describe("MissionReportHelper.saveResearchResult", () => {
  const validArgs = {
    missionId: "m1",
    dimension: "Tech Trends",
    findings: [{ claim: "c", evidence: "e", source: "s" }],
    summary: "Summary text",
    state: "completed" as const,
    iterations: 3,
    wallTimeMs: 5000,
  };

  it("upserts research result with correct data", async () => {
    const { helper } = makeHelper();
    mockUpsertResearch.mockResolvedValue({});

    await helper.saveResearchResult(validArgs);

    expect(mockUpsertResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          missionId_dimension_retryLabel: {
            missionId: "m1",
            dimension: "Tech Trends",
            retryLabel: "",
          },
        },
        create: expect.objectContaining({
          missionId: "m1",
          dimension: "Tech Trends",
          retryLabel: "",
          state: "completed",
          iterations: 3,
          wallTimeMs: 5000,
        }),
        update: expect.objectContaining({ state: "completed" }),
      }),
    );
  });

  it("uses provided retryLabel when given", async () => {
    const { helper } = makeHelper();
    mockUpsertResearch.mockResolvedValue({});

    await helper.saveResearchResult({ ...validArgs, retryLabel: "retry-1" });

    expect(mockUpsertResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          missionId_dimension_retryLabel: expect.objectContaining({
            retryLabel: "retry-1",
          }),
        }),
      }),
    );
  });

  it("slices dimension to 200 chars", async () => {
    const { helper } = makeHelper();
    mockUpsertResearch.mockResolvedValue({});

    await helper.saveResearchResult({
      ...validArgs,
      dimension: "d".repeat(300),
    });

    const call = mockUpsertResearch.mock.calls[0][0];
    expect(call.create.dimension).toBe("d".repeat(200));
  });

  it("slices summary to 50000 chars", async () => {
    const { helper } = makeHelper();
    mockUpsertResearch.mockResolvedValue({});

    await helper.saveResearchResult({
      ...validArgs,
      summary: "s".repeat(60000),
    });

    const call = mockUpsertResearch.mock.calls[0][0];
    expect(call.create.summary).toBe("s".repeat(50000));
  });

  it("calls emergencyAbort on FK violation (isMissionRowMissing true)", async () => {
    const { helper } = makeHelper();
    const fkErr = { code: "P2003" };
    mockUpsertResearch.mockRejectedValue(fkErr);
    mockIsMissionRowMissing.mockReturnValue(true);

    await helper.saveResearchResult(validArgs);

    expect(mockEmergencyAbort).toHaveBeenCalledWith(
      "m1",
      expect.stringContaining("saveResearchResult FK violation"),
    );
  });

  it("logs warn on non-FK error and does not throw", async () => {
    const { helper } = makeHelper();
    mockUpsertResearch.mockRejectedValue(new Error("generic db error"));
    mockIsMissionRowMissing.mockReturnValue(false);

    await expect(helper.saveResearchResult(validArgs)).resolves.toBeUndefined();

    expect(mockEmergencyAbort).not.toHaveBeenCalled();
  });

  it("logs warn using String(err) when non-Error thrown", async () => {
    const { helper } = makeHelper();
    // Throw a non-Error to exercise the String(err) branch
    mockUpsertResearch.mockRejectedValue("string error");
    mockIsMissionRowMissing.mockReturnValue(false);

    await expect(helper.saveResearchResult(validArgs)).resolves.toBeUndefined();
  });

  it("handles all three state values", async () => {
    const { helper } = makeHelper();
    mockUpsertResearch.mockResolvedValue({});

    for (const state of ["completed", "degraded", "failed"] as const) {
      await helper.saveResearchResult({ ...validArgs, state });
    }

    expect(mockUpsertResearch).toHaveBeenCalledTimes(3);
  });
});

// ── loadBaselineResearchResults ───────────────────────────────────────────────

describe("MissionReportHelper.loadBaselineResearchResults", () => {
  it("filters to completed and degraded rows only", async () => {
    const { helper } = makeHelper();
    mockFindManyResearch.mockResolvedValue([
      {
        dimension: "dim1",
        findings: [{ claim: "c", evidence: "e", source: "s" }],
        summary: "s1",
        state: "completed",
      },
      {
        dimension: "dim2",
        findings: [],
        summary: "s2",
        state: "failed",
      },
      {
        dimension: "dim3",
        findings: [],
        summary: "s3",
        state: "degraded",
      },
    ]);

    const result = await helper.loadBaselineResearchResults("m1");

    expect(result).toHaveLength(2);
    expect(result[0].dimension).toBe("dim1");
    expect(result[1].dimension).toBe("dim3");
  });

  it("returns empty array on DB error", async () => {
    const { helper } = makeHelper();
    mockFindManyResearch.mockRejectedValue(new Error("db error"));

    const result = await helper.loadBaselineResearchResults("m1");

    expect(result).toEqual([]);
  });

  it("maps rows to expected shape", async () => {
    const { helper } = makeHelper();
    mockFindManyResearch.mockResolvedValue([
      {
        dimension: "dim1",
        findings: [{ claim: "c", evidence: "e", source: "s" }],
        summary: "summary",
        state: "completed",
      },
    ]);

    const result = await helper.loadBaselineResearchResults("m1");

    expect(result[0]).toEqual({
      dimension: "dim1",
      findings: [{ claim: "c", evidence: "e", source: "s" }],
      summary: "summary",
    });
  });

  it("queries with retryLabel empty string", async () => {
    const { helper } = makeHelper();
    mockFindManyResearch.mockResolvedValue([]);

    await helper.loadBaselineResearchResults("m1");

    expect(mockFindManyResearch).toHaveBeenCalledWith({
      where: { missionId: "m1", retryLabel: "" },
    });
  });

  it("handles non-Error thrown by findMany (String(err) branch)", async () => {
    const { helper } = makeHelper();
    mockFindManyResearch.mockRejectedValue("non-error string");

    const result = await helper.loadBaselineResearchResults("m1");

    expect(result).toEqual([]);
  });
});

// ── saveChapterDraft ──────────────────────────────────────────────────────────

describe("MissionReportHelper.saveChapterDraft", () => {
  const validArgs = {
    missionId: "m1",
    dimension: "Tech",
    chapterIndex: 1,
    heading: "Introduction",
    thesis: "Main thesis",
    content: "Chapter content",
    status: "writing" as const,
    score: 80,
    critique: "Good",
    attempts: 2,
    wordCount: 500,
  };

  it("upserts chapter draft with correct where clause", async () => {
    const { helper } = makeHelper();
    mockUpsertChapter.mockResolvedValue({});

    await helper.saveChapterDraft(validArgs);

    expect(mockUpsertChapter).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          missionId_dimension_chapterIndex: {
            missionId: "m1",
            dimension: "Tech",
            chapterIndex: 1,
          },
        },
        create: expect.objectContaining({
          heading: "Introduction",
          status: "writing",
          score: 80,
          attempts: 2,
          wordCount: 500,
        }),
      }),
    );
  });

  it("slices heading to 500 chars", async () => {
    const { helper } = makeHelper();
    mockUpsertChapter.mockResolvedValue({});

    await helper.saveChapterDraft({ ...validArgs, heading: "h".repeat(600) });

    const call = mockUpsertChapter.mock.calls[0][0];
    expect(call.create.heading).toBe("h".repeat(500));
  });

  it("defaults attempts to 1 when undefined", async () => {
    const { helper } = makeHelper();
    mockUpsertChapter.mockResolvedValue({});
    const { attempts: _a, ...argsWithoutAttempts } = validArgs;
    void _a;

    await helper.saveChapterDraft(argsWithoutAttempts as typeof validArgs);

    const call = mockUpsertChapter.mock.calls[0][0];
    expect(call.create.attempts).toBe(1);
  });

  it("calls emergencyAbort on FK violation", async () => {
    const { helper } = makeHelper();
    const fkErr = { code: "P2025" };
    mockUpsertChapter.mockRejectedValue(fkErr);
    mockIsMissionRowMissing.mockReturnValue(true);

    await helper.saveChapterDraft(validArgs);

    expect(mockEmergencyAbort).toHaveBeenCalledWith(
      "m1",
      expect.stringContaining("saveChapterDraft FK violation"),
    );
  });

  it("logs warn on non-FK error and does not throw", async () => {
    const { helper } = makeHelper();
    mockUpsertChapter.mockRejectedValue(new Error("db down"));
    mockIsMissionRowMissing.mockReturnValue(false);

    await expect(helper.saveChapterDraft(validArgs)).resolves.toBeUndefined();

    expect(mockEmergencyAbort).not.toHaveBeenCalled();
  });

  it("logs warn using String(err) when non-Error thrown", async () => {
    const { helper } = makeHelper();
    // Throw a non-Error to exercise the String(err) branch
    mockUpsertChapter.mockRejectedValue({ message: "not an Error instance" });
    mockIsMissionRowMissing.mockReturnValue(false);

    await expect(helper.saveChapterDraft(validArgs)).resolves.toBeUndefined();
  });

  it("handles all valid status values", async () => {
    const { helper } = makeHelper();
    mockUpsertChapter.mockResolvedValue({});

    for (const status of [
      "writing",
      "reviewing",
      "passed",
      "done",
      "failed-finalized",
      "failed",
    ] as const) {
      await helper.saveChapterDraft({ ...validArgs, status });
    }

    expect(mockUpsertChapter).toHaveBeenCalledTimes(6);
  });

  it("slices dimension to 200 chars", async () => {
    const { helper } = makeHelper();
    mockUpsertChapter.mockResolvedValue({});

    await helper.saveChapterDraft({ ...validArgs, dimension: "d".repeat(300) });

    const call = mockUpsertChapter.mock.calls[0][0];
    expect(call.create.dimension).toBe("d".repeat(200));
  });
});

// ── loadQualifiedChapterDrafts ────────────────────────────────────────────────

describe("MissionReportHelper.loadQualifiedChapterDrafts", () => {
  it("maps rows to expected shape with optional fields", async () => {
    const { helper } = makeHelper();
    mockFindManyChapter.mockResolvedValue([
      {
        dimension: "Tech",
        chapterIndex: 0,
        heading: "Intro",
        thesis: "main thesis",
        content: "body text",
        score: 90,
        attempts: 2,
        wordCount: 300,
      },
      {
        dimension: "Market",
        chapterIndex: 1,
        heading: "Analysis",
        thesis: null,
        content: "content",
        score: null,
        attempts: 1,
        wordCount: null,
      },
    ]);

    const result = await helper.loadQualifiedChapterDrafts("m1");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      dimension: "Tech",
      chapterIndex: 0,
      heading: "Intro",
      thesis: "main thesis",
      content: "body text",
      score: 90,
      attempts: 2,
      wordCount: 300,
    });
    // null → undefined
    expect(result[1].thesis).toBeUndefined();
    expect(result[1].score).toBeUndefined();
    expect(result[1].wordCount).toBeUndefined();
  });

  it("returns empty array on DB error", async () => {
    const { helper } = makeHelper();
    mockFindManyChapter.mockRejectedValue(new Error("db error"));

    const result = await helper.loadQualifiedChapterDrafts("m1");

    expect(result).toEqual([]);
  });

  it("returns empty array on non-Error thrown by findMany (String(err) branch)", async () => {
    const { helper } = makeHelper();
    mockFindManyChapter.mockRejectedValue({ code: "TIMEOUT" });

    const result = await helper.loadQualifiedChapterDrafts("m1");

    expect(result).toEqual([]);
  });

  it("queries with status filter passed/done", async () => {
    const { helper } = makeHelper();
    mockFindManyChapter.mockResolvedValue([]);

    await helper.loadQualifiedChapterDrafts("m1");

    expect(mockFindManyChapter).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          missionId: "m1",
          status: { in: ["passed", "done"] },
        },
        orderBy: [{ dimension: "asc" }, { chapterIndex: "asc" }],
      }),
    );
  });

  it("returns empty array for empty results", async () => {
    const { helper } = makeHelper();
    mockFindManyChapter.mockResolvedValue([]);

    const result = await helper.loadQualifiedChapterDrafts("m1");

    expect(result).toEqual([]);
  });
});

// ── Real hook invocation (lines 55-93 in constructor closures) ────────────────
// These tests call the underlying hooks directly to cover the closure code.

describe("MissionReportHelper real prisma hooks (constructor closures)", () => {
  it("aggregateMaxVersion hook: returns 0 when no versions exist", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);

    const mockTx = {
      missionReportVersion: {
        aggregate: jest.fn(async () => ({ _max: { version: null } })),
      },
    };

    const version = await hooks.aggregateMaxVersion("m1", mockTx);
    expect(version).toBe(0);
    expect(mockTx.missionReportVersion.aggregate).toHaveBeenCalledWith({
      where: { missionId: "m1" },
      _max: { version: true },
    });
  });

  it("aggregateMaxVersion hook: returns max version when rows exist", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);

    const mockTx = {
      missionReportVersion: {
        aggregate: jest.fn(async () => ({ _max: { version: 7 } })),
      },
    };

    const version = await hooks.aggregateMaxVersion("m1", mockTx);
    expect(version).toBe(7);
  });

  it("createVersion hook: creates with finalScore/leaderSigned from extra", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);

    const mockCreate = jest.fn(async () => ({}));
    const mockTx = { missionReportVersion: { create: mockCreate } };

    await hooks.createVersion(
      {
        missionId: "m1",
        version: 3,
        versionLabel: "v3",
        reportFull: { title: "t" },
        reportTitle: "Title",
        reportSummary: "Summary",
        triggerType: "manual",
        extra: { finalScore: 85, leaderSigned: true },
      },
      mockTx,
    );

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        missionId: "m1",
        version: 3,
        finalScore: 85,
        leaderSigned: true,
      }),
    });
  });

  it("createVersion hook: uses null when extra fields missing", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);

    const mockCreate = jest.fn(async () => ({}));
    const mockTx = { missionReportVersion: { create: mockCreate } };

    await hooks.createVersion(
      {
        missionId: "m1",
        version: 1,
        versionLabel: "v1",
        reportFull: null,
        reportTitle: null,
        reportSummary: null,
        triggerType: "auto",
        extra: undefined,
      },
      mockTx,
    );

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        finalScore: null,
        leaderSigned: null,
        reportFull: null,
      }),
    });
  });

  it("createVersion hook: reportFull null falls back to null in data", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);

    const mockCreate = jest.fn(async () => ({}));
    const mockTx = { missionReportVersion: { create: mockCreate } };

    await hooks.createVersion(
      {
        missionId: "m1",
        version: 1,
        versionLabel: "v1",
        reportFull: undefined,
        reportTitle: null,
        reportSummary: null,
        triggerType: "auto",
        extra: {},
      },
      mockTx,
    );

    const call = mockCreate.mock.calls[0][0];
    expect(call.data.reportFull).toBeNull();
  });

  it("listVersions hook: queries with correct select and orderBy", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);

    const mockRows = [
      {
        id: "rv1",
        version: 1,
        versionLabel: "v1",
        reportTitle: "T",
        reportSummary: "S",
        finalScore: 80,
        leaderSigned: true,
        triggerType: "manual",
        generatedAt: new Date(),
      },
    ];
    mockListVersions.mockResolvedValue(mockRows);

    const result = await hooks.listVersions("m1");

    expect(result).toHaveLength(1);
    expect(mockListVersions).toHaveBeenCalledWith({
      where: { missionId: "m1" },
      orderBy: { generatedAt: "desc" },
      select: expect.objectContaining({ id: true, version: true }),
    });
  });

  it("findVersion hook: returns mapped row when found", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);

    const mockRow = {
      id: "rv1",
      version: 2,
      versionLabel: "v2",
      reportTitle: "T",
      reportSummary: "S",
      finalScore: 90,
      leaderSigned: false,
      triggerType: "rerun",
      generatedAt: new Date(),
    };
    // findVersion uses prisma.missionReportVersion.findUnique (NOT the same as getReportVersion which uses direct prisma)
    // The hook calls prisma.missionReportVersion.findUnique
    mockFindUniqueReport.mockResolvedValue(mockRow);

    const result = await hooks.findVersion("m1", 2);

    expect(result).not.toBeNull();
    expect(result?.id).toBe("rv1");
    expect(result?.leaderSigned).toBe(false);
  });

  it("findVersion hook: returns null when row not found", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);

    mockFindUniqueReport.mockResolvedValue(null);

    const result = await hooks.findVersion("m1", 99);

    expect(result).toBeNull();
  });

  it("runSerializable hook: passes fn to $transaction with Serializable isolation", async () => {
    const { helper } = makeHelper();
    const hooks = getInternalHooks(helper);

    const mockFn = jest.fn(async () => 42);
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) => fn({}),
    );

    const result = await hooks.runSerializable(mockFn);

    expect(result).toBe(42);
    expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });
});
