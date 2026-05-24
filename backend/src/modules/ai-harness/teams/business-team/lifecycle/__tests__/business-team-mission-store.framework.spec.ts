/**
 * P6 spec: BusinessTeamMissionStoreFramework via FakeMarsMissionStore.
 */
import {
  FakeMarsMissionStore,
  makeFakeMarsMissionStoreHooks,
} from "./__fixtures__/p6-fake-team-mocks";

describe("BusinessTeamMissionStoreFramework (FakeMars)", () => {
  it("create delegates to createMission hook", async () => {
    const hooks = makeFakeMarsMissionStoreHooks();
    const store = new FakeMarsMissionStore(hooks);
    await store.create({
      id: "m1",
      userId: "u1",
      mission: "mars",
    });
    expect(hooks.createMission).toHaveBeenCalledTimes(1);
  });

  it("refreshHeartbeat: row missing → emergencyAbort (once per mission)", async () => {
    const hooks = makeFakeMarsMissionStoreHooks();
    (hooks.writeHeartbeat as jest.Mock).mockRejectedValue({ code: "P2025" });
    const store = new FakeMarsMissionStore(hooks);
    await store.refreshHeartbeat("m1", "pod-1");
    await store.refreshHeartbeat("m1", "pod-1");
    expect(hooks.emergencyAbort).toHaveBeenCalledTimes(1);
    expect(hooks.emergencyAbort).toHaveBeenCalledWith(
      "m1",
      "heartbeat row missing",
    );
  });

  it("refreshHeartbeat: non-missing error → log, no abort", async () => {
    const hooks = makeFakeMarsMissionStoreHooks();
    (hooks.writeHeartbeat as jest.Mock).mockRejectedValue(new Error("timeout"));
    const store = new FakeMarsMissionStore(hooks);
    await store.refreshHeartbeat("m1", "pod-1");
    expect(hooks.emergencyAbort).not.toHaveBeenCalled();
  });

  it("clearHeartbeat: swallows error", async () => {
    const hooks = makeFakeMarsMissionStoreHooks();
    (hooks.resetHeartbeat as jest.Mock).mockRejectedValue(new Error("x"));
    const store = new FakeMarsMissionStore(hooks);
    await expect(store.clearHeartbeat("m1", "u1")).resolves.toBeUndefined();
  });

  it("markStageComplete: row missing → emergencyAbort", async () => {
    const hooks = makeFakeMarsMissionStoreHooks();
    (hooks.writeStageProgress as jest.Mock).mockRejectedValue({
      code: "P2003",
    });
    const store = new FakeMarsMissionStore(hooks);
    await store.markStageComplete("m1", 5);
    expect(hooks.emergencyAbort).toHaveBeenCalledWith(
      "m1",
      "markStageComplete s5",
    );
  });

  it("cleanupOrphanRunningMissions returns orphan rows", async () => {
    const hooks = makeFakeMarsMissionStoreHooks();
    (hooks.findOrphanRunning as jest.Mock).mockResolvedValue([
      { id: "m1", userId: "u1" },
      { id: "m2", userId: "u2" },
    ]);
    const store = new FakeMarsMissionStore(hooks);
    const got = await store.cleanupOrphanRunningMissions(60_000);
    expect(got).toHaveLength(2);
    expect(hooks.markOrphanFailed).toHaveBeenCalledWith(["m1", "m2"]);
  });

  it("cleanupOrphanRunningMissions: empty findOrphanRunning → no markOrphanFailed", async () => {
    const hooks = makeFakeMarsMissionStoreHooks();
    (hooks.findOrphanRunning as jest.Mock).mockResolvedValue([]);
    const store = new FakeMarsMissionStore(hooks);
    const got = await store.cleanupOrphanRunningMissions(60_000);
    expect(got).toEqual([]);
    expect(hooks.markOrphanFailed).not.toHaveBeenCalled();
  });

  it("cleanupOrphanRunningMissions: DB error → returns []", async () => {
    const hooks = makeFakeMarsMissionStoreHooks();
    (hooks.findOrphanRunning as jest.Mock).mockRejectedValue(new Error("db"));
    const store = new FakeMarsMissionStore(hooks);
    expect(await store.cleanupOrphanRunningMissions(60_000)).toEqual([]);
  });

  it("countRunningByUser delegates", async () => {
    const hooks = makeFakeMarsMissionStoreHooks();
    (hooks.countRunning as jest.Mock).mockResolvedValue(7);
    const store = new FakeMarsMissionStore(hooks);
    expect(await store.countRunningByUser("u1")).toBe(7);
  });
});
