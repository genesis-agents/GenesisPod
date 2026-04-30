import { PrismaMissionCheckpointStore } from "../prisma-mission-checkpoint.store";

describe("PrismaMissionCheckpointStore", () => {
  function makeStore() {
    const prismaMock = {
      agentPlaygroundMission: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
      },
    };
    const store = new PrismaMissionCheckpointStore(prismaMock as never);
    return { store, prisma: prismaMock };
  }

  it("save merges checkpoint into leaderJournal __checkpoint key", async () => {
    const { store, prisma } = makeStore();
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: { decisions: [{ phase: "plan" }] },
    });
    await store.save({
      missionId: "m1",
      savedAt: new Date("2026-04-29T10:00:00Z"),
      payload: { stage: "s5" },
      completedKeys: ["s1", "s2"],
      status: "running",
    });
    const call = prisma.agentPlaygroundMission.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "m1" });
    const journal = call.data.leaderJournal as Record<string, unknown>;
    expect(journal.decisions).toEqual([{ phase: "plan" }]); // 保留原内容
    expect(journal.__checkpoint).toMatchObject({
      payload: { stage: "s5" },
      completedKeys: ["s1", "s2"],
      status: "running",
    });
  });

  it("save warns + skips when mission not found", async () => {
    const { store, prisma } = makeStore();
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue(null);
    await expect(
      store.save({
        missionId: "missing",
        savedAt: new Date(),
        payload: {},
        completedKeys: [],
        status: "running",
      }),
    ).resolves.toBeUndefined();
    expect(prisma.agentPlaygroundMission.update).not.toHaveBeenCalled();
  });

  it("load returns null when mission missing or no checkpoint", async () => {
    const { store, prisma } = makeStore();
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue(null);
    expect(await store.load("m1")).toBeNull();

    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: { decisions: [] },
    });
    expect(await store.load("m1")).toBeNull();
  });

  it("load deserializes savedAt back to Date", async () => {
    const { store, prisma } = makeStore();
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: {
        __checkpoint: {
          savedAt: "2026-04-29T10:00:00Z",
          payload: { stage: "s5" },
          completedKeys: ["s1"],
          status: "running",
        },
      },
    });
    const snap = await store.load("m1");
    expect(snap).not.toBeNull();
    expect(snap!.savedAt).toBeInstanceOf(Date);
    expect(snap!.savedAt.toISOString()).toBe("2026-04-29T10:00:00.000Z");
    expect(snap!.completedKeys).toEqual(["s1"]);
  });

  it("clear removes only __checkpoint key, keeps other journal data", async () => {
    const { store, prisma } = makeStore();
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: {
        decisions: [{ phase: "plan" }],
        __checkpoint: {
          savedAt: "x",
          payload: {},
          completedKeys: [],
          status: "running",
        },
      },
    });
    await store.clear("m1");
    const call = prisma.agentPlaygroundMission.update.mock.calls[0][0];
    const journal = call.data.leaderJournal as Record<string, unknown>;
    expect(journal.decisions).toEqual([{ phase: "plan" }]);
    expect(journal.__checkpoint).toBeUndefined();
  });

  it("clear is no-op when no checkpoint present", async () => {
    const { store, prisma } = makeStore();
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: { decisions: [] },
    });
    await store.clear("m1");
    expect(prisma.agentPlaygroundMission.update).not.toHaveBeenCalled();
  });

  it("listResumable filters userId + status=running + cutoff", async () => {
    const { store, prisma } = makeStore();
    prisma.agentPlaygroundMission.findMany.mockResolvedValue([
      {
        id: "m1",
        leaderJournal: {
          __checkpoint: {
            savedAt: "2026-04-29T10:00:00Z",
            payload: { x: 1 },
            completedKeys: ["s1"],
            status: "running",
          },
        },
      },
      // 没 checkpoint 的 mission 应被过滤
      { id: "m2", leaderJournal: {} },
    ]);
    const out = await store.listResumable("user-1");
    expect(out).toHaveLength(1);
    expect(out[0].missionId).toBe("m1");

    const findCall = prisma.agentPlaygroundMission.findMany.mock.calls[0][0];
    expect(findCall.where).toMatchObject({
      userId: "user-1",
      status: "running",
    });
  });

  it("listResumable returns [] on prisma error (graceful)", async () => {
    const { store, prisma } = makeStore();
    prisma.agentPlaygroundMission.findMany.mockRejectedValue(
      new Error("DB down"),
    );
    const out = await store.listResumable("user-1");
    expect(out).toEqual([]);
  });
});
