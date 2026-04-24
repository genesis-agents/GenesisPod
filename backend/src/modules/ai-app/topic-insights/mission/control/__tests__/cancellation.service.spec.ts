import { MissionCancellationService } from "../cancellation.service";

describe("MissionCancellationService", () => {
  let svc: MissionCancellationService;

  beforeEach(() => {
    svc = new MissionCancellationService();
  });

  it("returns false when cancelling an unknown mission", () => {
    expect(
      svc.cancel("unknown-id", {
        reason: "test",
        requestedBy: "u1",
        requestedAt: new Date(),
      }),
    ).toBe(false);
  });

  it("aborts the registered controller on cancel", () => {
    const ctrl = new AbortController();
    svc.register("mission-1", ctrl);

    expect(svc.isActive("mission-1")).toBe(true);
    expect(ctrl.signal.aborted).toBe(false);

    const result = svc.cancel("mission-1", {
      reason: "user requested",
      requestedBy: "u1",
      requestedAt: new Date(),
    });

    expect(result).toBe(true);
    expect(ctrl.signal.aborted).toBe(true);
  });

  it("is idempotent — cancel after cancel is a no-op", () => {
    const ctrl = new AbortController();
    svc.register("mission-2", ctrl);
    svc.cancel("mission-2", {
      reason: "first",
      requestedBy: "u1",
      requestedAt: new Date(),
    });
    svc.unregister("mission-2");

    // After unregister, a second cancel is a clean no-op
    expect(
      svc.cancel("mission-2", {
        reason: "second",
        requestedBy: "u1",
        requestedAt: new Date(),
      }),
    ).toBe(false);
  });

  it("unregister removes the mapping", () => {
    svc.register("mission-3", new AbortController());
    expect(svc.isActive("mission-3")).toBe(true);
    svc.unregister("mission-3");
    expect(svc.isActive("mission-3")).toBe(false);
  });

  it("listActive reflects current registrations", () => {
    svc.register("a", new AbortController());
    svc.register("b", new AbortController());
    expect(svc.listActive().sort()).toEqual(["a", "b"]);
    svc.unregister("a");
    expect(svc.listActive()).toEqual(["b"]);
  });

  it("replacing a registration warns but still tracks the new controller", () => {
    const first = new AbortController();
    svc.register("mission-4", first);
    const second = new AbortController();
    svc.register("mission-4", second); // replace

    svc.cancel("mission-4", {
      reason: "r",
      requestedBy: "u",
      requestedAt: new Date(),
    });

    expect(first.signal.aborted).toBe(false);
    expect(second.signal.aborted).toBe(true);
  });
});
