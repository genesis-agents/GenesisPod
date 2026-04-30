import { MissionCheckpointService } from "./checkpoint.service";
import { InMemoryMissionCheckpointStore } from "./in-memory-checkpoint.store";

interface PayloadShape {
  stage: string;
  artifacts: string[];
}

describe("MissionCheckpointService", () => {
  let store: InMemoryMissionCheckpointStore<PayloadShape>;
  let svc: MissionCheckpointService<PayloadShape>;

  beforeEach(() => {
    store = new InMemoryMissionCheckpointStore();
    svc = new MissionCheckpointService(store);
  });

  it("save then load round-trips snapshot", async () => {
    await svc.save("m1", { stage: "s5", artifacts: ["a", "b"] }, ["s1", "s2"]);
    const snap = await svc.load("m1");
    expect(snap).not.toBeNull();
    expect(snap!.payload.stage).toBe("s5");
    expect(snap!.completedKeys).toEqual(["s1", "s2"]);
    expect(snap!.status).toBe("running");
  });

  it("canResume returns no-checkpoint when missing", async () => {
    const r = await svc.canResume("missing");
    expect(r.canResume).toBe(false);
    expect(r.reason).toBe("no-checkpoint");
  });

  it("canResume rejects completed status", async () => {
    await svc.save("m1", { stage: "x", artifacts: [] }, [], "completed");
    const r = await svc.canResume("m1");
    expect(r.canResume).toBe(false);
    expect(r.reason).toBe("wrong-status");
  });

  it("canResume rejects expired snapshot", async () => {
    const stale = new MissionCheckpointService(store, 1000); // 1s window
    await store.save({
      missionId: "m1",
      savedAt: new Date(Date.now() - 5000),
      payload: { stage: "s3", artifacts: [] },
      completedKeys: [],
      status: "running",
    });
    const r = await stale.canResume("m1");
    expect(r.canResume).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("canResume returns ok for fresh running snapshot", async () => {
    await svc.save("m1", { stage: "s2", artifacts: [] }, ["s1"]);
    const r = await svc.canResume("m1");
    expect(r.canResume).toBe(true);
    expect(r.completedKeys.has("s1")).toBe(true);
    expect(svc.isCompleted(r, "s1")).toBe(true);
    expect(svc.isCompleted(r, "s99")).toBe(false);
  });

  it("clear removes snapshot", async () => {
    await svc.save("m1", { stage: "s1", artifacts: [] }, []);
    await svc.clear("m1");
    expect(await svc.load("m1")).toBeNull();
  });

  it("listResumable filters by userId + status + age", async () => {
    store.setUserBinding("m-u1-running", "u1");
    store.setUserBinding("m-u1-completed", "u1");
    store.setUserBinding("m-u2", "u2");
    await svc.save("m-u1-running", { stage: "x", artifacts: [] }, []);
    await svc.save(
      "m-u1-completed",
      { stage: "x", artifacts: [] },
      [],
      "completed",
    );
    await svc.save("m-u2", { stage: "x", artifacts: [] }, []);

    const u1 = await svc.listResumable("u1");
    expect(u1.map((s) => s.missionId)).toEqual(["m-u1-running"]);
  });

  it("save errors are swallowed (does not throw)", async () => {
    const crashStore: typeof store = {
      ...store,
      save: jest.fn().mockRejectedValue(new Error("DB down")),
      load: jest.fn().mockResolvedValue(null),
      clear: jest.fn().mockResolvedValue(undefined),
      listResumable: jest.fn().mockResolvedValue([]),
    } as unknown as typeof store;
    const crashSvc = new MissionCheckpointService(crashStore);
    await expect(
      crashSvc.save("m1", { stage: "x", artifacts: [] }, []),
    ).resolves.toBeUndefined();
  });
});
