import { MissionHealthScheduler } from "./mission-health.scheduler";

describe("MissionHealthScheduler", () => {
  function makeScheduler() {
    const prismaMock = {
      agentPlaygroundMission: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      agentPlaygroundMissionEvent: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    const storeMock = {
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    const scheduler = new MissionHealthScheduler(
      prismaMock as never,
      storeMock as never,
    );
    return { scheduler, prisma: prismaMock, store: storeMock };
  }

  it("forceRun with no running missions completes cleanly", async () => {
    const { scheduler, store } = makeScheduler();
    await scheduler.forceRun();
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("flags + markFailed on stale mission (no events for >30 min)", async () => {
    const { scheduler, prisma, store } = makeScheduler();
    const oldStart = new Date(Date.now() - 100 * 60 * 1000);
    prisma.agentPlaygroundMission.findMany.mockResolvedValue([
      {
        id: "m1",
        userId: "u1",
        status: "running",
        startedAt: oldStart,
      },
    ]);
    prisma.agentPlaygroundMissionEvent.groupBy.mockResolvedValue([]);
    await scheduler.forceRun();
    expect(store.markFailed).toHaveBeenCalledWith(
      "m1",
      expect.objectContaining({
        errorMessage: expect.stringContaining("stale"),
      }),
    );
  });

  it("flags wall-time-exceeded for mission > 4h even with recent activity", async () => {
    const { scheduler, prisma, store } = makeScheduler();
    const veryOldStart = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5h ago
    prisma.agentPlaygroundMission.findMany.mockResolvedValue([
      {
        id: "m-long",
        userId: "u1",
        status: "running",
        startedAt: veryOldStart,
      },
    ]);
    prisma.agentPlaygroundMissionEvent.groupBy.mockResolvedValue([
      {
        missionId: "m-long",
        _max: { ts: BigInt(Date.now() - 60 * 1000) }, // 1 min ago
      },
    ]);
    await scheduler.forceRun();
    expect(store.markFailed).toHaveBeenCalledWith(
      "m-long",
      expect.objectContaining({
        errorMessage: expect.stringContaining("wall time"),
      }),
    );
  });

  it("does NOT flag mission with recent activity", async () => {
    const { scheduler, prisma, store } = makeScheduler();
    const start = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    prisma.agentPlaygroundMission.findMany.mockResolvedValue([
      {
        id: "m-active",
        userId: "u1",
        status: "running",
        startedAt: start,
      },
    ]);
    prisma.agentPlaygroundMissionEvent.groupBy.mockResolvedValue([
      {
        missionId: "m-active",
        _max: { ts: BigInt(Date.now() - 30 * 1000) }, // 30s ago
      },
    ]);
    await scheduler.forceRun();
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("uses lastActivityAt fallback to startedAt when no events", async () => {
    const { scheduler, prisma, store } = makeScheduler();
    prisma.agentPlaygroundMission.findMany.mockResolvedValue([
      {
        id: "m-fresh",
        userId: "u1",
        status: "running",
        startedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
      },
    ]);
    prisma.agentPlaygroundMissionEvent.groupBy.mockResolvedValue([]);
    await scheduler.forceRun();
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("graceful when prisma fails", async () => {
    const { scheduler, prisma, store } = makeScheduler();
    prisma.agentPlaygroundMission.findMany.mockRejectedValue(
      new Error("DB down"),
    );
    await expect(scheduler.forceRun()).resolves.toBeUndefined();
    expect(store.markFailed).not.toHaveBeenCalled();
  });
});
