import { MissionStore } from "../mission-store.service";

function makePrisma() {
  return {
    agentPlaygroundMission: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // recoverOrphanedRunning groupBy 用来过滤"最近 5min 有事件"
    agentPlaygroundMissionEvent: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    harnessVectorMemory: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // ★ P0-R5-1: terminal-state methods 调 $executeRaw 清 checkpoint JSONB key
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
}

describe("MissionStore", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let store: MissionStore;

  beforeEach(() => {
    prisma = makePrisma();
    store = new MissionStore(prisma as never);
  });

  // create
  it("create: calls prisma.agentPlaygroundMission.create with status=running", async () => {
    await store.create({
      id: "m1",
      userId: "u1",
      topic: "AI",
      depth: "deep",
      language: "zh-CN",
      maxCredits: 1000,
    });
    expect(prisma.agentPlaygroundMission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "running" }),
      }),
    );
  });

  it("create: truncates topic to 500 chars", async () => {
    const longTopic = "x".repeat(600);
    await store.create({
      id: "m1",
      userId: "u1",
      topic: longTopic,
      depth: "deep",
      language: "zh-CN",
      maxCredits: 100,
    });
    const createArg =
      prisma.agentPlaygroundMission.create.mock.calls[0][0].data;
    expect(createArg.topic.length).toBeLessThanOrEqual(500);
  });

  it("create: propagates prisma error so mission does not run without a DB row", async () => {
    prisma.agentPlaygroundMission.create.mockRejectedValue(
      new Error("DB down"),
    );
    await expect(
      store.create({
        id: "m1",
        userId: "u1",
        topic: "t",
        depth: "d",
        language: "zh-CN",
        maxCredits: 100,
      }),
    ).rejects.toThrow("DB down");
  });

  // recoverOrphanedRunning（2026-04-30 重构后：先 findMany 拉 super-aged candidates
  // → groupBy 过滤"最近 5min 有事件"的活跃 mission → updateMany 真正 orphan 的）
  it("recoverOrphanedRunning: updates super-aged missions with no recent activity", async () => {
    prisma.agentPlaygroundMission.findMany.mockResolvedValue([
      { id: "m1" },
      { id: "m2" },
      { id: "m3" },
    ]);
    // 三个候选都没有最近活动事件 → 都被 markFailed
    prisma.agentPlaygroundMissionEvent.groupBy.mockResolvedValue([]);
    prisma.agentPlaygroundMission.updateMany.mockResolvedValue({ count: 3 });
    const count = await store.recoverOrphanedRunning(30);
    expect(count).toBe(3);
    expect(prisma.agentPlaygroundMission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });

  it("recoverOrphanedRunning: spares missions with recent activity (< 5min)", async () => {
    prisma.agentPlaygroundMission.findMany.mockResolvedValue([
      { id: "m1" },
      { id: "m2" },
    ]);
    // m1 / m2 都有最近 30s 内活动 → 跳过本轮，不 markFailed
    const recentTs = BigInt(Date.now() - 30_000);
    prisma.agentPlaygroundMissionEvent.groupBy.mockResolvedValue([
      { missionId: "m1", _max: { ts: recentTs } },
      { missionId: "m2", _max: { ts: recentTs } },
    ]);
    const count = await store.recoverOrphanedRunning(30);
    expect(count).toBe(0);
    // updateMany 不应被调（无真 orphan）
    expect(prisma.agentPlaygroundMission.updateMany).not.toHaveBeenCalled();
  });

  it("recoverOrphanedRunning: returns 0 on prisma error", async () => {
    prisma.agentPlaygroundMission.findMany.mockResolvedValue([{ id: "m1" }]);
    prisma.agentPlaygroundMission.updateMany.mockRejectedValue(
      new Error("err"),
    );
    const count = await store.recoverOrphanedRunning(30);
    expect(count).toBe(0);
  });

  // markCompleted
  it("markCompleted: calls updateMany with status=completed guard", async () => {
    await store.markCompleted("m1", { finalScore: 85 });
    expect(prisma.agentPlaygroundMission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m1", status: "running" },
        data: expect.objectContaining({ status: "completed" }),
      }),
    );
  });

  it("markCompleted: truncates fullMarkdown if report > 5MB", async () => {
    // 5MB threshold = 5 * 1024 * 1024 = 5242880 bytes
    // Need JSON of the whole report object to be > 5MB AND fullMarkdown > 100_000 chars
    const bigMd = "x".repeat(6_000_000); // 6M chars → JSON will be >5MB
    const report = {
      title: "Big",
      summary: "s",
      content: { fullMarkdown: bigMd, fullReportSize: bigMd.length },
    };
    await store.markCompleted("m1", { report });
    const updateArg =
      prisma.agentPlaygroundMission.updateMany.mock.calls[0][0].data;
    const reportFull = updateArg.reportFull as {
      content: { fullMarkdown: string };
    };
    // After truncation, should be 100_000 chars + truncation suffix
    expect(reportFull.content.fullMarkdown.length).toBeLessThanOrEqual(100_100);
  });

  it("markCompleted: swallows prisma error", async () => {
    prisma.agentPlaygroundMission.updateMany.mockRejectedValue(
      new Error("DB error"),
    );
    await expect(store.markCompleted("m1", {})).resolves.toBeUndefined();
  });

  // markFailed
  it("markFailed: calls prisma.updateMany with status=failed", async () => {
    await store.markFailed("m1", { errorMessage: "Network error" });
    expect(prisma.agentPlaygroundMission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });

  it("markFailed: uses quality-failed status when leaderSigned=false", async () => {
    await store.markFailed("m1", {
      leaderSigned: false,
      leaderOverallScore: 35,
    });
    const updateArg =
      prisma.agentPlaygroundMission.updateMany.mock.calls[0][0].data;
    expect(updateArg.status).toBe("quality-failed");
  });

  it("markFailed: swallows prisma error", async () => {
    prisma.agentPlaygroundMission.updateMany.mockRejectedValue(new Error("DB"));
    await expect(store.markFailed("m1", {})).resolves.toBeUndefined();
  });

  // appendLeaderJournal
  it("appendLeaderJournal: merges patch into existing journal", async () => {
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: { plan: "initial plan" },
    });
    await store.appendLeaderJournal("m1", { m0: "done" });
    const updateArg =
      prisma.agentPlaygroundMission.update.mock.calls[0][0].data;
    expect(updateArg.leaderJournal).toEqual({
      plan: "initial plan",
      m0: "done",
    });
  });

  it("appendLeaderJournal: handles null journal (starts from empty obj)", async () => {
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: null,
    });
    await store.appendLeaderJournal("m1", { decisions: [{ step: "plan" }] });
    const updateArg =
      prisma.agentPlaygroundMission.update.mock.calls[0][0].data;
    expect(updateArg.leaderJournal.decisions).toHaveLength(1);
  });

  it("appendLeaderJournal: concatenates decisions array", async () => {
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: { decisions: [{ step: "plan" }] },
    });
    await store.appendLeaderJournal("m1", { decisions: [{ step: "assess" }] });
    const updateArg =
      prisma.agentPlaygroundMission.update.mock.calls[0][0].data;
    expect(updateArg.leaderJournal.decisions).toHaveLength(2);
  });

  // recordMissionPostmortem
  it("recordMissionPostmortem: creates harnessVectorMemory entry", async () => {
    await store.recordMissionPostmortem({
      missionId: "m1",
      userId: "u1",
      topic: "AI",
      summary: "Summary text",
      recommendations: ["rec1"],
      leaderSigned: true,
      qualityScore: 85,
      tokensUsed: 10000,
      costUsd: 0.5,
    });
    expect(prisma.harnessVectorMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          namespace: "u1",
          source: "agent-playground:mission",
        }),
      }),
    );
  });

  it("recordMissionPostmortem: tags include 'signed' when leaderSigned=true", async () => {
    await store.recordMissionPostmortem({
      missionId: "m1",
      userId: "u1",
      topic: "AI",
      summary: "s",
      recommendations: [],
      leaderSigned: true,
      qualityScore: 80,
      tokensUsed: 0,
      costUsd: 0,
    });
    const tags = prisma.harnessVectorMemory.create.mock.calls[0][0].data.tags;
    expect(tags).toContain("signed");
  });

  it("recordMissionPostmortem: tags include 'unsigned' when leaderSigned=false", async () => {
    await store.recordMissionPostmortem({
      missionId: "m1",
      userId: "u1",
      topic: "AI",
      summary: "s",
      recommendations: [],
      leaderSigned: false,
      qualityScore: 40,
      tokensUsed: 0,
      costUsd: 0,
    });
    const tags = prisma.harnessVectorMemory.create.mock.calls[0][0].data.tags;
    expect(tags).toContain("unsigned");
  });

  // listRecentPostmortems
  it("listRecentPostmortems: returns mapped rows", async () => {
    prisma.harnessVectorMemory.findMany.mockResolvedValue([
      {
        content: "Postmortem summary",
        tags: ["mission-postmortem", "signed"],
        createdAt: new Date(),
        metadata: {
          missionId: "m1",
          topic: "AI",
          recommendations: ["rec"],
          qualityScore: 85,
        },
      },
    ]);
    const result = await store.listRecentPostmortems("u1", 3);
    expect(result).toHaveLength(1);
    expect(result[0].leaderSigned).toBe(true);
    expect(result[0].qualityScore).toBe(85);
  });

  it("listRecentPostmortems: returns [] on prisma error", async () => {
    prisma.harnessVectorMemory.findMany.mockRejectedValue(new Error("DB"));
    const result = await store.listRecentPostmortems("u1", 3);
    expect(result).toEqual([]);
  });

  // appendDimensions
  it("appendDimensions: returns [] if items empty", async () => {
    const ids = await store.appendDimensions("m1", []);
    expect(ids).toEqual([]);
  });

  it("appendDimensions: returns [] if mission not running", async () => {
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      status: "completed",
      dimensions: [],
    });
    const ids = await store.appendDimensions("m1", [
      { name: "New Dim", rationale: "r" },
    ]);
    expect(ids).toEqual([]);
  });

  it("appendDimensions: appends dims and returns new ids", async () => {
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      status: "running",
      dimensions: [{ id: "d1", name: "Old", rationale: "r" }],
    });
    prisma.agentPlaygroundMission.update.mockResolvedValue({});
    const ids = await store.appendDimensions("m1", [
      { name: "New", rationale: "new reason" },
    ]);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toContain("dim-user-");
  });

  // deleteByUser
  it("deleteByUser: calls deleteMany with id+userId guard", async () => {
    await store.deleteByUser("m1", "u1");
    expect(prisma.agentPlaygroundMission.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "m1", userId: "u1" } }),
    );
  });

  it("deleteByUser: swallows prisma error", async () => {
    prisma.agentPlaygroundMission.deleteMany.mockRejectedValue(new Error("DB"));
    await expect(store.deleteByUser("m1", "u1")).resolves.toBeUndefined();
  });

  // updateTopicByUser
  it("updateTopicByUser: calls updateMany with truncated topic", async () => {
    const longTopic = "x".repeat(600);
    await store.updateTopicByUser("m1", "u1", longTopic);
    const callArg = prisma.agentPlaygroundMission.updateMany.mock.calls[0][0];
    expect(callArg.data.topic.length).toBeLessThanOrEqual(500);
  });

  it("updateTopicByUser: swallows prisma error", async () => {
    prisma.agentPlaygroundMission.updateMany.mockRejectedValue(new Error("DB"));
    await expect(
      store.updateTopicByUser("m1", "u1", "new topic"),
    ).resolves.toBeUndefined();
  });

  // markCancelled —— ★ P0-1: 改为 updateMany 带 status='running' guard
  it("markCancelled: sets status=cancelled with running guard", async () => {
    await store.markCancelled("m1");
    expect(prisma.agentPlaygroundMission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m1", status: "running" },
        data: expect.objectContaining({ status: "cancelled" }),
      }),
    );
  });

  it("markCancelled: swallows prisma error", async () => {
    prisma.agentPlaygroundMission.updateMany.mockRejectedValue(new Error("DB"));
    await expect(store.markCancelled("m1")).resolves.toBeUndefined();
  });

  // appendLeaderJournal error
  it("appendLeaderJournal: swallows prisma error on findUnique", async () => {
    prisma.agentPlaygroundMission.findUnique.mockRejectedValue(
      new Error("DB find error"),
    );
    await expect(
      store.appendLeaderJournal("m1", { step: "test" }),
    ).resolves.toBeUndefined();
  });

  // listByUser
  it("listByUser: returns mapped list from prisma", async () => {
    const mockRow = {
      id: "m1",
      topic: "AI",
      depth: "deep",
      language: "zh-CN",
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
      wallTimeMs: 60000,
      finalScore: 85,
      tokensUsed: 5000,
      costUsd: 0.5,
      reportTitle: "Report",
      reportSummary: "Summary",
      errorMessage: null,
    };
    prisma.agentPlaygroundMission.findMany.mockResolvedValue([mockRow]);
    const result = await store.listByUser("u1", 10);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("m1");
  });

  // recordMissionPostmortem error path
  it("recordMissionPostmortem: swallows prisma error", async () => {
    prisma.harnessVectorMemory.create.mockRejectedValue(new Error("DB error"));
    await expect(
      store.recordMissionPostmortem({
        missionId: "m1",
        userId: "u1",
        topic: "AI",
        summary: "s",
        recommendations: [],
        leaderSigned: null,
        qualityScore: null,
        tokensUsed: 0,
        costUsd: 0,
      }),
    ).resolves.toBeUndefined();
  });

  // getById
  it("getById: returns null when mission not found", async () => {
    const result = await store.getById("m1", "u1");
    expect(result).toBeNull();
  });

  it("getById: returns MissionDetail when found", async () => {
    prisma.agentPlaygroundMission.findFirst.mockResolvedValue({
      id: "m1",
      topic: "AI",
      depth: "deep",
      language: "zh-CN",
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
      wallTimeMs: 60000,
      finalScore: 85,
      tokensUsed: 5000,
      costUsd: 0.5,
      reportTitle: "Report",
      reportSummary: "Summary",
      errorMessage: null,
      themeSummary: "t",
      dimensions: [],
      reportFull: {},
      verdicts: {},
      trajectoryStored: 3,
      reportArtifactVersion: 2,
      userProfile: {},
      reconciliationReport: {},
      leaderJournal: {},
      leaderOverallScore: 85,
      leaderSigned: true,
      leaderVerdict: "signed",
    });
    const result = await store.getById("m1", "u1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("m1");
    expect(result!.leaderSigned).toBe(true);
  });

  // markFailed: lead-refusal conditional fields —— ★ P0-1: 改为 updateMany 带 running guard
  it("markFailed: when leaderSigned=false, persists report and dimensions with running guard", async () => {
    const report = { title: "Report", summary: "Sum" };
    await store.markFailed("m1", {
      leaderSigned: false,
      leaderOverallScore: 35,
      leaderVerdict: "quality-failed",
      report,
      dimensions: [{ id: "d1", name: "Market" }],
      themeSummary: "AI",
      trajectoryStored: 2,
    });
    const call = prisma.agentPlaygroundMission.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "m1", status: "running" });
    expect(call.data.status).toBe("quality-failed");
    expect(call.data.reportFull).toBeDefined();
  });

  // ─────────────────────────────────────────────
  // PR-H v1: heartbeat + stage progress + pod recovery
  // ─────────────────────────────────────────────

  describe("PR-H v1 heartbeat lifecycle", () => {
    it("refreshHeartbeat: updates heartbeatAt and podId", async () => {
      await store.refreshHeartbeat("m1", "pod-abc");
      expect(prisma.agentPlaygroundMission.update).toHaveBeenCalledWith({
        where: { id: "m1" },
        data: expect.objectContaining({
          heartbeatAt: expect.any(Date),
          podId: "pod-abc",
        }),
      });
    });

    it("refreshHeartbeat: silently swallows DB errors (debug log only)", async () => {
      prisma.agentPlaygroundMission.update.mockRejectedValueOnce(
        new Error("DB down"),
      );
      await expect(
        store.refreshHeartbeat("m1", "pod-abc"),
      ).resolves.toBeUndefined();
    });

    it("markStageComplete: writes lastCompletedStage + heartbeat refresh", async () => {
      await store.markStageComplete("m1", 7);
      const call = prisma.agentPlaygroundMission.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: "m1" });
      expect(call.data.lastCompletedStage).toBe(7);
      expect(call.data.heartbeatAt).toBeInstanceOf(Date);
    });

    it("markStageComplete: silently swallows DB errors", async () => {
      prisma.agentPlaygroundMission.update.mockRejectedValueOnce(
        new Error("conflict"),
      );
      await expect(store.markStageComplete("m1", 3)).resolves.toBeUndefined();
    });

    it("recoverPodCrashedRunning: returns 0 when no orphans", async () => {
      prisma.agentPlaygroundMission.findMany.mockResolvedValueOnce([]);
      const n = await store.recoverPodCrashedRunning(90);
      expect(n).toBe(0);
      expect(prisma.agentPlaygroundMission.updateMany).not.toHaveBeenCalled();
    });

    it("recoverPodCrashedRunning: marks orphans failed with PR-H error message", async () => {
      prisma.agentPlaygroundMission.findMany.mockResolvedValueOnce([
        {
          id: "m1",
          heartbeatAt: new Date(Date.now() - 200_000),
          startedAt: new Date(Date.now() - 600_000),
          podId: "old-pod",
        },
      ]);
      prisma.agentPlaygroundMission.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      const n = await store.recoverPodCrashedRunning(90);
      expect(n).toBe(1);
      const call = prisma.agentPlaygroundMission.updateMany.mock.calls[0][0];
      expect(call.where.id).toEqual({ in: ["m1"] });
      expect(call.where.status).toBe("running");
      expect(call.data.status).toBe("failed");
      expect(call.data.errorMessage).toContain("pod 重启");
    });

    it("recoverPodCrashedRunning: filters by stale threshold (heartbeatAt < cutoff)", async () => {
      prisma.agentPlaygroundMission.findMany.mockResolvedValueOnce([]);
      await store.recoverPodCrashedRunning(60);
      const findCall = prisma.agentPlaygroundMission.findMany.mock.calls[0][0];
      expect(findCall.where.status).toBe("running");
      expect(findCall.where.heartbeatAt.lt).toBeInstanceOf(Date);
      // cutoff should be ~60s ago
      const cutoffMs = (findCall.where.heartbeatAt.lt as Date).getTime();
      const expected = Date.now() - 60_000;
      expect(Math.abs(cutoffMs - expected)).toBeLessThan(2000);
    });

    it("recoverPodCrashedRunning: clears checkpoint JSONB key for each orphan", async () => {
      prisma.agentPlaygroundMission.findMany.mockResolvedValueOnce([
        {
          id: "m1",
          heartbeatAt: new Date(Date.now() - 200_000),
          startedAt: new Date(),
          podId: null,
        },
        {
          id: "m2",
          heartbeatAt: new Date(Date.now() - 200_000),
          startedAt: new Date(),
          podId: null,
        },
      ]);
      prisma.agentPlaygroundMission.updateMany.mockResolvedValueOnce({
        count: 2,
      });
      await store.recoverPodCrashedRunning(90);
      // 2 orphans → 2 $executeRaw calls (one per checkpoint clear)
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it("recoverPodCrashedRunning: swallows updateMany errors and returns 0", async () => {
      prisma.agentPlaygroundMission.findMany.mockResolvedValueOnce([
        {
          id: "m1",
          heartbeatAt: new Date(Date.now() - 200_000),
          startedAt: new Date(),
          podId: null,
        },
      ]);
      prisma.agentPlaygroundMission.updateMany.mockRejectedValueOnce(
        new Error("DB conflict"),
      );
      const n = await store.recoverPodCrashedRunning(90);
      expect(n).toBe(0);
    });
  });
});
