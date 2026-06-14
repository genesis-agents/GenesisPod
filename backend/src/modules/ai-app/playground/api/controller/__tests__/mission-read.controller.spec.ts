/**
 * MissionReadController — unit tests
 *
 * Covers:
 *   - getMissionView: calls assertReadAccess + missionQuery.loadInputs + projectMissionView
 *   - listMissions: no userId → ForbiddenException; returns items
 *   - listResumable: no userId → ForbiddenException; returns snapshots mapped to DTO
 *   - getMission: calls assertReadAccess, returns mission, throws NotFoundException if null
 *   - getMissionCost: calls assertReadAccess, returns summary+entries with ISO createdAt
 *   - updateVisibility: no userId → ForbiddenException; calls store.updateVisibility
 *   - exportMission: invalid format → BadRequestException; calls exportService
 *   - exportMission: allowed formats pass whitelist
 *   - listMissionReportVersions: calls assertReadAccess; maps rows to DTO with ISO dates
 *   - getMissionReportVersion: invalid version → BadRequestException; not found → BadRequestException
 *   - getMissionReportVersion: valid version → returns row
 *   - replay: in-memory events → returned; empty → calls readPersisted
 *   - listLeaderChat: calls leaderChat.list, returns messages
 *   - reportClientError: @Public, returns {ok:true}, logs error
 */

import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { MissionReadController } from "../mission-read.controller";

// Silence logger
beforeAll(() => {
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
});

// ── Mock projectMissionView ───────────────────────────────────────────────────

jest.mock("../../../mission/projectors/mission-view.projector", () => ({
  projectMissionView: jest.fn((inputs) => ({ projected: true, inputs })),
}));

// ── Mock assertResourceAccess ─────────────────────────────────────────────────

jest.mock("@/common/access/assert-resource-access", () => ({
  assertResourceAccess: jest.fn(),
}));

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeOwnership(ownedMissions: Record<string, string> = {}) {
  return {
    getOwner: jest.fn((missionId: string) => ownedMissions[missionId] ?? null),
    assign: jest.fn(),
  } as any;
}

function makeStore(
  mission: unknown = null,
  opts: {
    accessMeta?: { userId: string; visibility: string } | null;
  } = {},
) {
  return {
    getById: jest.fn().mockResolvedValue(mission),
    listByUser: jest.fn().mockResolvedValue([]),
    getAccessMetaById: jest.fn().mockResolvedValue(opts.accessMeta ?? null),
    updateVisibility: jest.fn().mockResolvedValue({ id: "m-1" }),
    listReportVersions: jest.fn().mockResolvedValue([]),
    getReportVersion: jest.fn().mockResolvedValue(null),
    sumCostByMission: jest.fn().mockResolvedValue({
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      costUsd: 0.03,
      entryCount: 5,
    }),
    listCostByMission: jest.fn().mockResolvedValue([]),
  } as any;
}

function makeCheckpoint() {
  return {
    listResumable: jest.fn().mockResolvedValue([]),
  } as any;
}

function makeExportService() {
  return {
    export: jest.fn().mockResolvedValue({
      filename: "report.md",
      mimeType: "text/markdown",
      content: "# Report",
    }),
  } as any;
}

function makeBuffer() {
  return {
    read: jest.fn().mockReturnValue([]),
    readPersisted: jest.fn().mockResolvedValue([]),
  } as any;
}

function makeLeaderChat() {
  return {
    list: jest.fn().mockResolvedValue([]),
  } as any;
}

function makeMissionQuery() {
  return {
    loadInputs: jest.fn().mockResolvedValue({ inputs: "mock" }),
  } as any;
}

function makeReq(userId?: string) {
  return { user: userId ? { id: userId } : undefined } as any;
}

function makeController(
  overrides: {
    ownership?: ReturnType<typeof makeOwnership>;
    store?: ReturnType<typeof makeStore>;
    checkpoint?: ReturnType<typeof makeCheckpoint>;
    exportService?: ReturnType<typeof makeExportService>;
    buffer?: ReturnType<typeof makeBuffer>;
    leaderChat?: ReturnType<typeof makeLeaderChat>;
    missionQuery?: ReturnType<typeof makeMissionQuery>;
  } = {},
) {
  const ownership = overrides.ownership ?? makeOwnership();
  const store = overrides.store ?? makeStore();
  const checkpoint = overrides.checkpoint ?? makeCheckpoint();
  const exportService = overrides.exportService ?? makeExportService();
  const buffer = overrides.buffer ?? makeBuffer();
  const leaderChat = overrides.leaderChat ?? makeLeaderChat();
  const missionQuery = overrides.missionQuery ?? makeMissionQuery();

  const ctrl = new MissionReadController(
    ownership,
    store,
    checkpoint,
    exportService,
    buffer,
    leaderChat,
    missionQuery,
  );
  return {
    ctrl,
    ownership,
    store,
    checkpoint,
    exportService,
    buffer,
    leaderChat,
    missionQuery,
  };
}

// ── Helper: make controller with a specific mission owner ─────────────────────

function makeCtrlWithOwner(
  userId = "u-1",
  missionId = "m-1",
  mission?: unknown,
) {
  const ownership = makeOwnership({ [missionId]: userId });
  const store = makeStore(mission ?? { id: missionId, status: "running" }, {
    accessMeta: { userId, visibility: "PRIVATE" },
  });
  const { ctrl, ...rest } = makeController({ ownership, store });
  return { ctrl, ownership, store, ...rest };
}

// ── getMissionView ─────────────────────────────────────────────────────────────

describe("MissionReadController.getMissionView", () => {
  it("calls missionQuery.loadInputs with missionId and ownerId", async () => {
    const { ctrl, missionQuery } = makeCtrlWithOwner("u-1", "m-1");
    await ctrl.getMissionView("m-1", makeReq("u-1"));
    expect(missionQuery.loadInputs).toHaveBeenCalledWith("m-1", "u-1");
  });

  it("returns {view: projectMissionView(inputs)}", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    const result = await ctrl.getMissionView("m-1", makeReq("u-1"));
    expect(result).toHaveProperty("view");
    expect((result.view as any).projected).toBe(true);
  });

  it("no userId → ForbiddenException", async () => {
    const { ctrl } = makeController();
    await expect(ctrl.getMissionView("m-1", makeReq())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("mission not found → NotFoundException", async () => {
    const store = makeStore(null, { accessMeta: null });
    const { ctrl } = makeController({ store });
    await expect(ctrl.getMissionView("m-1", makeReq("u-1"))).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ── listMissions ──────────────────────────────────────────────────────────────

describe("MissionReadController.listMissions", () => {
  it("no userId → ForbiddenException", async () => {
    const { ctrl } = makeController();
    await expect(ctrl.listMissions(makeReq())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("calls store.listByUser(userId, 100)", async () => {
    const { ctrl, store } = makeCtrlWithOwner();
    await ctrl.listMissions(makeReq("u-1"));
    expect(store.listByUser).toHaveBeenCalledWith("u-1", 100);
  });

  it("returns {items: [...]}", async () => {
    const store = makeStore(null);
    store.listByUser.mockResolvedValue([{ id: "m-1" }, { id: "m-2" }]);
    const { ctrl } = makeController({ store });
    const result = await ctrl.listMissions(makeReq("u-1"));
    expect(result.items).toHaveLength(2);
  });
});

// ── listResumable ─────────────────────────────────────────────────────────────

describe("MissionReadController.listResumable", () => {
  it("no userId → ForbiddenException", async () => {
    const { ctrl } = makeController();
    await expect(ctrl.listResumable(makeReq())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("calls checkpoint.listResumable(userId)", async () => {
    const checkpoint = makeCheckpoint();
    const { ctrl } = makeController({ checkpoint });
    await ctrl.listResumable(makeReq("u-1"));
    expect(checkpoint.listResumable).toHaveBeenCalledWith("u-1");
  });

  it("maps snapshots to {missionId, savedAt(ISO), completedKeys}", async () => {
    const savedAt = new Date("2025-01-01T00:00:00Z");
    const checkpoint = makeCheckpoint();
    checkpoint.listResumable.mockResolvedValue([
      { missionId: "m-1", savedAt, completedKeys: ["k1", "k2"] },
    ]);
    const { ctrl } = makeController({ checkpoint });
    const result = await ctrl.listResumable(makeReq("u-1"));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].missionId).toBe("m-1");
    expect(result.items[0].savedAt).toBe(savedAt.toISOString());
    expect(result.items[0].completedKeys).toEqual(["k1", "k2"]);
  });
});

// ── getMission ────────────────────────────────────────────────────────────────

describe("MissionReadController.getMission", () => {
  it("no userId → ForbiddenException", async () => {
    const { ctrl } = makeController();
    await expect(ctrl.getMission("m-1", makeReq())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("mission not found → NotFoundException", async () => {
    const store = makeStore(null, { accessMeta: null });
    const { ctrl } = makeController({ store });
    await expect(ctrl.getMission("m-1", makeReq("u-1"))).rejects.toThrow(
      NotFoundException,
    );
  });

  it("owner + mission exists → returns {mission}", async () => {
    const missionData = { id: "m-1", status: "running" };
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1", missionData);
    const result = await ctrl.getMission("m-1", makeReq("u-1"));
    expect(result).toHaveProperty("mission");
    expect((result.mission as any).id).toBe("m-1");
  });

  it("assertReadAccess miss then store returns null → NotFoundException", async () => {
    const ownership = makeOwnership({ "m-1": "u-1" });
    const store = makeStore(null); // getById returns null even for owner
    const { ctrl } = makeController({ ownership, store });
    await expect(ctrl.getMission("m-1", makeReq("u-1"))).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ── getMissionCost ────────────────────────────────────────────────────────────

describe("MissionReadController.getMissionCost", () => {
  it("no userId → ForbiddenException", async () => {
    const { ctrl } = makeController();
    await expect(ctrl.getMissionCost("m-1", makeReq())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("returns summary from store.sumCostByMission", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    const result = await ctrl.getMissionCost("m-1", makeReq("u-1"));
    expect(result.summary).toMatchObject({
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      costUsd: 0.03,
      entryCount: 5,
    });
  });

  it("maps cost entries with ISO createdAt", async () => {
    const createdAt = new Date("2025-06-01T00:00:00Z");
    const ownership = makeOwnership({ "m-1": "u-1" });
    const store = makeStore(null, {
      accessMeta: { userId: "u-1", visibility: "PRIVATE" },
    });
    store.sumCostByMission.mockResolvedValue({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      entryCount: 1,
    });
    store.listCostByMission.mockResolvedValue([
      {
        id: "e-1",
        stepId: "s1",
        role: "user",
        model: "gpt-4",
        promptTokens: 100,
        completionTokens: 50,
        costUsd: 0.01,
        createdAt,
      },
    ]);
    const { ctrl } = makeController({ ownership, store });
    const result = await ctrl.getMissionCost("m-1", makeReq("u-1"));
    expect(result.entries[0].createdAt).toBe(createdAt.toISOString());
  });

  it("empty cost entries → entries=[]", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    const result = await ctrl.getMissionCost("m-1", makeReq("u-1"));
    expect(result.entries).toEqual([]);
  });
});

// ── updateVisibility ──────────────────────────────────────────────────────────

describe("MissionReadController.updateVisibility", () => {
  it("no userId → ForbiddenException", async () => {
    const { ctrl } = makeController();
    await expect(
      ctrl.updateVisibility(makeReq(), "m-1", { visibility: "PUBLIC" } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it("calls store.updateVisibility(userId, id, dto.visibility)", async () => {
    const { ctrl, store } = makeCtrlWithOwner("u-1", "m-1");
    await ctrl.updateVisibility(makeReq("u-1"), "m-1", {
      visibility: "PUBLIC",
    } as any);
    expect(store.updateVisibility).toHaveBeenCalledWith("u-1", "m-1", "PUBLIC");
  });
});

// ── exportMission ─────────────────────────────────────────────────────────────

describe("MissionReadController.exportMission", () => {
  it("no format → BadRequestException", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    await expect(
      ctrl.exportMission("m-1", "" as any, makeReq("u-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("invalid format → BadRequestException with 'Invalid export format'", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    await expect(
      ctrl.exportMission("m-1", "xlsx", makeReq("u-1")),
    ).rejects.toThrow(/Invalid export format/);
  });

  it("format=markdown → allowed (no BadRequestException)", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    await expect(
      ctrl.exportMission("m-1", "markdown", makeReq("u-1")),
    ).resolves.toBeDefined();
  });

  it("format=md → allowed", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    await expect(
      ctrl.exportMission("m-1", "md", makeReq("u-1")),
    ).resolves.toBeDefined();
  });

  it("format=json → allowed", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    await expect(
      ctrl.exportMission("m-1", "json", makeReq("u-1")),
    ).resolves.toBeDefined();
  });

  it("format=csv-facts → allowed", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    await expect(
      ctrl.exportMission("m-1", "csv-facts", makeReq("u-1")),
    ).resolves.toBeDefined();
  });

  it("format=csv-citations → allowed", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    await expect(
      ctrl.exportMission("m-1", "csv-citations", makeReq("u-1")),
    ).resolves.toBeDefined();
  });

  it("calls exportService.export(missionId, ownerId, format)", async () => {
    const { ctrl, exportService } = makeCtrlWithOwner("u-1", "m-1");
    await ctrl.exportMission("m-1", "markdown", makeReq("u-1"));
    expect(exportService.export).toHaveBeenCalledWith("m-1", "u-1", "markdown");
  });

  it("returns filename, mimeType, content from exportService", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    const result = await ctrl.exportMission("m-1", "markdown", makeReq("u-1"));
    expect(result.filename).toBe("report.md");
    expect(result.mimeType).toBe("text/markdown");
    expect(result.content).toBe("# Report");
  });
});

// ── listMissionReportVersions ─────────────────────────────────────────────────

describe("MissionReadController.listMissionReportVersions", () => {
  it("no userId → ForbiddenException", async () => {
    const { ctrl } = makeController();
    await expect(
      ctrl.listMissionReportVersions("m-1", makeReq()),
    ).rejects.toThrow(ForbiddenException);
  });

  it("returns empty items when no versions", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    const result = await ctrl.listMissionReportVersions("m-1", makeReq("u-1"));
    expect(result.items).toEqual([]);
  });

  it("maps version rows to DTO with ISO generatedAt", async () => {
    const generatedAt = new Date("2025-03-15T10:00:00Z");
    const ownership = makeOwnership({ "m-1": "u-1" });
    const store = makeStore(
      { id: "m-1" },
      { accessMeta: { userId: "u-1", visibility: "PRIVATE" } },
    );
    store.listReportVersions.mockResolvedValue([
      {
        version: 1,
        versionLabel: "v1",
        reportTitle: "Report Title",
        reportSummary: "Summary",
        finalScore: 85,
        leaderSigned: true,
        triggerType: "manual",
        generatedAt,
      },
    ]);
    const { ctrl } = makeController({ ownership, store });
    const result = await ctrl.listMissionReportVersions("m-1", makeReq("u-1"));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].version).toBe(1);
    expect(result.items[0].generatedAt).toBe(generatedAt.toISOString());
    expect(result.items[0].leaderSigned).toBe(true);
  });
});

// ── getMissionReportVersion ───────────────────────────────────────────────────

describe("MissionReadController.getMissionReportVersion", () => {
  it("version='abc' → BadRequestException (not a number)", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    await expect(
      ctrl.getMissionReportVersion("m-1", "abc", makeReq("u-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("version='0' → BadRequestException (not positive)", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    await expect(
      ctrl.getMissionReportVersion("m-1", "0", makeReq("u-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("version='-1' → BadRequestException (negative)", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    await expect(
      ctrl.getMissionReportVersion("m-1", "-1", makeReq("u-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("valid version but not found → BadRequestException", async () => {
    const { ctrl } = makeCtrlWithOwner("u-1", "m-1");
    await expect(
      ctrl.getMissionReportVersion("m-1", "1", makeReq("u-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("valid version found → returns row with ISO generatedAt", async () => {
    const generatedAt = new Date("2025-06-01T00:00:00Z");
    const ownership = makeOwnership({ "m-1": "u-1" });
    const store = makeStore(null, {
      accessMeta: { userId: "u-1", visibility: "PRIVATE" },
    });
    store.getReportVersion.mockResolvedValue({
      version: 2,
      versionLabel: "v2",
      triggerType: "auto",
      generatedAt,
      reportFull: { content: "full" },
      changesFromPrev: null,
    });
    const { ctrl } = makeController({ ownership, store });
    const result = await ctrl.getMissionReportVersion(
      "m-1",
      "2",
      makeReq("u-1"),
    );
    expect(result.version).toBe(2);
    expect(result.generatedAt).toBe(generatedAt.toISOString());
    expect(result.reportFull).toEqual({ content: "full" });
    expect(store.getReportVersion).toHaveBeenCalledWith("m-1", 2);
  });
});

// ── replay ────────────────────────────────────────────────────────────────────

describe("MissionReadController.replay", () => {
  it("no userId → ForbiddenException", async () => {
    const { ctrl } = makeController();
    await expect(ctrl.replay("m-1", undefined, makeReq())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("returns in-memory events when non-empty", async () => {
    const buffer = makeBuffer();
    buffer.read.mockReturnValue([{ type: "ping" }]);
    const { ctrl } = makeController({
      buffer,
      ownership: makeOwnership({ "m-1": "u-1" }),
    });
    const result = await ctrl.replay("m-1", undefined, makeReq("u-1"));
    expect(result.events).toHaveLength(1);
    expect(buffer.readPersisted).not.toHaveBeenCalled();
  });

  it("empty in-memory → calls readPersisted as fallback", async () => {
    const buffer = makeBuffer();
    buffer.read.mockReturnValue([]);
    buffer.readPersisted.mockResolvedValue([{ type: "hydrated" }]);
    const { ctrl } = makeController({
      buffer,
      ownership: makeOwnership({ "m-1": "u-1" }),
    });
    const result = await ctrl.replay("m-1", undefined, makeReq("u-1"));
    expect(buffer.readPersisted).toHaveBeenCalled();
    expect(result.events).toHaveLength(1);
  });

  it("since param (numeric string) passed to buffer.read", async () => {
    const buffer = makeBuffer();
    buffer.read.mockReturnValue([{ type: "event" }]);
    const { ctrl } = makeController({
      buffer,
      ownership: makeOwnership({ "m-1": "u-1" }),
    });
    await ctrl.replay("m-1", "1700000000000", makeReq("u-1"));
    expect(buffer.read).toHaveBeenCalledWith("m-1", 1700000000000);
  });

  it("since='invalid' → ts=undefined passed", async () => {
    const buffer = makeBuffer();
    buffer.read.mockReturnValue([]);
    const { ctrl } = makeController({
      buffer,
      ownership: makeOwnership({ "m-1": "u-1" }),
    });
    await ctrl.replay("m-1", "notanumber", makeReq("u-1"));
    expect(buffer.read).toHaveBeenCalledWith("m-1", undefined);
  });

  it("returns serverNow (number)", async () => {
    const { ctrl } = makeController({
      ownership: makeOwnership({ "m-1": "u-1" }),
    });
    const result = await ctrl.replay("m-1", undefined, makeReq("u-1"));
    expect(typeof result.serverNow).toBe("number");
  });
});

// ── listLeaderChat ────────────────────────────────────────────────────────────

describe("MissionReadController.listLeaderChat", () => {
  it("no userId → ForbiddenException", async () => {
    const { ctrl } = makeController();
    await expect(ctrl.listLeaderChat("m-1", makeReq())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("calls leaderChat.list(missionId)", async () => {
    const leaderChat = makeLeaderChat();
    leaderChat.list.mockResolvedValue([{ role: "user", content: "hi" }]);
    const { ctrl } = makeController({
      leaderChat,
      ownership: makeOwnership({ "m-1": "u-1" }),
    });
    const result = await ctrl.listLeaderChat("m-1", makeReq("u-1"));
    expect(leaderChat.list).toHaveBeenCalledWith("m-1");
    expect(result.messages).toHaveLength(1);
  });
});

// ── reportClientError ─────────────────────────────────────────────────────────

describe("MissionReadController.reportClientError", () => {
  it("returns {ok: true}", async () => {
    const { ctrl } = makeController();
    const result = await ctrl.reportClientError(
      {
        missionId: "m-1",
        message: "Error occurred",
        stack: "Error: ...",
        digest: "abc",
      },
      makeReq("u-1"),
    );
    expect(result).toEqual({ ok: true });
  });

  it("no user → still returns {ok:true} (uses 'anon')", async () => {
    const { ctrl } = makeController();
    const result = await ctrl.reportClientError(
      { message: "crash" },
      makeReq(),
    );
    expect(result).toEqual({ ok: true });
  });

  it("logs error with missionId and userId", async () => {
    const logSpy = jest.spyOn(Logger.prototype, "error");
    const { ctrl } = makeController();
    await ctrl.reportClientError(
      { missionId: "m-xyz", message: "Something broke" },
      makeReq("u-1"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("m-xyz"));
  });

  it("truncates message to 500 chars", async () => {
    const logSpy = jest.spyOn(Logger.prototype, "error");
    const longMsg = "x".repeat(600);
    const { ctrl } = makeController();
    await ctrl.reportClientError(
      { missionId: "m-1", message: longMsg },
      makeReq("u-1"),
    );
    // The logged message should not contain the full 600-char msg
    const loggedMsg = logSpy.mock.calls.find(
      (args) => typeof args[0] === "string" && args[0].includes("m-1"),
    )?.[0] as string;
    expect(loggedMsg?.includes(longMsg)).toBe(false);
    expect(loggedMsg?.length).toBeLessThan(700); // reasonable bound
  });

  it("logs stack when present", async () => {
    const logSpy = jest.spyOn(Logger.prototype, "error");
    const { ctrl } = makeController();
    await ctrl.reportClientError(
      { stack: "Error: message\n  at test.ts:1" },
      makeReq("u-1"),
    );
    expect(
      logSpy.mock.calls.some(
        (args) =>
          typeof args[0] === "string" && args[0].includes("Error: message"),
      ),
    ).toBe(true);
  });

  it("no stack → no second log call", async () => {
    const logSpy = jest.spyOn(Logger.prototype, "error").mockClear();
    const { ctrl } = makeController();
    await ctrl.reportClientError({ message: "no stack" }, makeReq("u-1"));
    // Only the first log call (no stack log)
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
