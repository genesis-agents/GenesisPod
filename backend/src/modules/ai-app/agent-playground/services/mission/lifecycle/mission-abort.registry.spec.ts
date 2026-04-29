import { MissionAbortRegistry } from "./mission-abort.registry";

describe("MissionAbortRegistry", () => {
  let registry: MissionAbortRegistry;

  beforeEach(() => {
    registry = new MissionAbortRegistry();
  });

  it("register: returns an AbortController", () => {
    const ctrl = registry.register("m1");
    expect(ctrl).toBeInstanceOf(AbortController);
  });

  it("register: creates independent controllers for different missions", () => {
    const c1 = registry.register("m1");
    const c2 = registry.register("m2");
    expect(c1).not.toBe(c2);
  });

  it("getSignal: returns signal for registered mission", () => {
    registry.register("m1");
    const signal = registry.getSignal("m1");
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("getSignal: returns undefined for unregistered mission", () => {
    expect(registry.getSignal("nonexistent")).toBeUndefined();
  });

  it("abort: returns true and aborts signal for registered mission", () => {
    registry.register("m1");
    const result = registry.abort("m1");
    expect(result).toBe(true);
    expect(registry.getSignal("m1")!.aborted).toBe(true);
  });

  it("abort: returns false for unregistered mission", () => {
    const result = registry.abort("nonexistent");
    expect(result).toBe(false);
  });

  it("abort: custom reason is passed to abort", () => {
    registry.register("m1");
    registry.abort("m1", "test_reason");
    expect(registry.isAborted("m1")).toBe(true);
  });

  it("isAborted: returns false before abort", () => {
    registry.register("m1");
    expect(registry.isAborted("m1")).toBe(false);
  });

  it("isAborted: returns true after abort", () => {
    registry.register("m1");
    registry.abort("m1");
    expect(registry.isAborted("m1")).toBe(true);
  });

  it("isAborted: returns false for nonexistent mission", () => {
    expect(registry.isAborted("ghost")).toBe(false);
  });

  it("unregister: removes mission from registry", () => {
    registry.register("m1");
    registry.unregister("m1");
    expect(registry.getSignal("m1")).toBeUndefined();
    expect(registry.size()).toBe(0);
  });

  it("size: returns current count", () => {
    expect(registry.size()).toBe(0);
    registry.register("m1");
    registry.register("m2");
    expect(registry.size()).toBe(2);
  });

  it("listActive: returns all active mission ids", () => {
    registry.register("m1");
    registry.register("m2");
    const active = registry.listActive();
    expect(active).toContain("m1");
    expect(active).toContain("m2");
    expect(active).toHaveLength(2);
  });

  it("listActive: does not include unregistered missions", () => {
    registry.register("m1");
    registry.unregister("m1");
    expect(registry.listActive()).not.toContain("m1");
  });

  it("aborted signal propagates correctly", () => {
    const ctrl = registry.register("m1");
    const signal = ctrl.signal;
    expect(signal.aborted).toBe(false);
    registry.abort("m1");
    expect(signal.aborted).toBe(true);
  });
});
