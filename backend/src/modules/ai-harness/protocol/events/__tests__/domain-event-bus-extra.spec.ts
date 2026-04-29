/**
 * DomainEventBus — extra branch coverage (PR-K extra)
 * Covers: unregisterAdapter, adapter failure handling, gcThrottle trigger,
 *         gcIdempotency trigger, global throttle (no agentId), duplicate adapter skip
 */

import { DomainEventRegistry } from "../domain-event-registry";
import { DomainEventBus } from "../domain-event-bus";
import type { IBroadcastAdapter } from "../broadcast-adapter";
import type { DomainEvent } from "../domain-event.types";

function mkAdapter(
  id: string,
  accepts: (e: DomainEvent) => boolean = () => true,
  throwOnBroadcast = false,
) {
  const calls: DomainEvent[] = [];
  const adapter: IBroadcastAdapter = {
    id,
    accepts,
    broadcast: async (e) => {
      if (throwOnBroadcast) throw new Error("adapter exploded");
      calls.push(e);
    },
  };
  return { adapter, calls };
}

function makeReg(
  type: string,
  opts?: {
    throttle?: { windowMs: number; maxEvents: number };
    schema?: unknown;
  },
) {
  const reg = new DomainEventRegistry();
  reg.register({ type, ...(opts ?? {}) });
  return reg;
}

describe("DomainEventBus — extra branches", () => {
  it("unregisterAdapter removes it from delivery", async () => {
    const reg = makeReg("u.evt");
    const bus = new DomainEventBus(reg);
    const { adapter, calls } = mkAdapter("ua");
    bus.registerAdapter(adapter);

    // Emits once before unregister
    await bus.emit({ type: "u.evt", scope: {}, payload: {}, timestamp: 0 });
    expect(calls).toHaveLength(1);

    bus.unregisterAdapter("ua");
    await bus.emit({ type: "u.evt", scope: {}, payload: {}, timestamp: 0 });
    expect(calls).toHaveLength(1); // no new delivery
  });

  it("unregisterAdapter on unknown id is a no-op", () => {
    const bus = new DomainEventBus(new DomainEventRegistry());
    expect(() => bus.unregisterAdapter("nonexistent")).not.toThrow();
  });

  it("adapter broadcast failure is swallowed — event returns true", async () => {
    const reg = makeReg("fail.evt");
    const bus = new DomainEventBus(reg);
    const { adapter: failAdapter } = mkAdapter("fail", () => true, true);
    const { adapter: okAdapter, calls: okCalls } = mkAdapter("ok");
    bus.registerAdapter(failAdapter);
    bus.registerAdapter(okAdapter);

    const result = await bus.emit({
      type: "fail.evt",
      scope: {},
      payload: {},
      timestamp: 0,
    });
    expect(result).toBe(true);
    expect(okCalls).toHaveLength(1); // ok adapter still called
  });

  it("duplicate adapter id is not re-added", async () => {
    const reg = makeReg("dup.evt");
    const bus = new DomainEventBus(reg);
    const { adapter, calls } = mkAdapter("dup");
    bus.registerAdapter(adapter);
    bus.registerAdapter(adapter); // second register with same id
    await bus.emit({ type: "dup.evt", scope: {}, payload: {}, timestamp: 0 });
    expect(calls).toHaveLength(1); // delivered once, not twice
  });

  it("global throttle applies when no agentId on event", async () => {
    const reg = new DomainEventRegistry();
    reg.register({
      type: "global.evt",
      throttle: { windowMs: 10000, maxEvents: 1 },
    });
    const bus = new DomainEventBus(reg);
    const { adapter, calls } = mkAdapter("t");
    bus.registerAdapter(adapter);

    const makeEvent = () => ({
      type: "global.evt" as const,
      scope: {} as Record<string, unknown>,
      payload: {},
      timestamp: Date.now(),
      // no agentId — uses __global__ key
    });

    expect(await bus.emit(makeEvent())).toBe(true);
    expect(await bus.emit(makeEvent())).toBe(false); // throttled globally
    expect(calls).toHaveLength(1);
  });

  it("throttle resets after windowMs elapses", async () => {
    jest.useFakeTimers();
    const reg = new DomainEventRegistry();
    reg.register({
      type: "win.evt",
      throttle: { windowMs: 100, maxEvents: 1 },
    });
    const bus = new DomainEventBus(reg);
    const { adapter, calls } = mkAdapter("t");
    bus.registerAdapter(adapter);

    const makeEvent = () => ({
      type: "win.evt" as const,
      scope: {} as Record<string, unknown>,
      payload: {},
      agentId: "a1",
      timestamp: Date.now(),
    });

    expect(await bus.emit(makeEvent())).toBe(true);
    expect(await bus.emit(makeEvent())).toBe(false); // throttled

    // Advance past window
    jest.advanceTimersByTime(200);
    expect(await bus.emit(makeEvent())).toBe(true); // new window
    expect(calls).toHaveLength(2);
    jest.useRealTimers();
  });

  it("gcThrottle is triggered after 500 emit calls", async () => {
    const reg = new DomainEventRegistry();
    reg.register({ type: "gc.evt", throttle: { windowMs: 1, maxEvents: 999 } });
    const bus = new DomainEventBus(reg);
    // No adapter needed — just stress emit to trigger gcThrottle
    for (let i = 0; i < 501; i++) {
      await bus.emit({
        type: "gc.evt",
        scope: {},
        payload: {},
        agentId: `agent-${i}`, // unique agent each time = lots of throttle entries
        timestamp: Date.now(),
      });
    }
    // If gcThrottle throws, the test will fail — just verify no error
  });

  it("gcIdempotency triggers when idempotency map exceeds 10000 entries", async () => {
    const reg = new DomainEventRegistry();
    reg.register({ type: "idem.evt" });
    const bus = new DomainEventBus(reg);
    // Fill idempotency map with 10001 unique keys
    for (let i = 0; i < 10001; i++) {
      await bus.emit({
        type: "idem.evt",
        scope: {},
        payload: {},
        idempotencyKey: `key-${i}`,
        timestamp: Date.now(),
      });
    }
    // gcIdempotency should fire. As long as no throw, test passes.
  });

  it("schema validation allows events without schema", async () => {
    const reg = new DomainEventRegistry();
    reg.register({ type: "no.schema.evt" }); // no schema
    const bus = new DomainEventBus(reg);
    const { adapter, calls } = mkAdapter("t");
    bus.registerAdapter(adapter);

    const result = await bus.emit({
      type: "no.schema.evt",
      scope: {},
      payload: { anything: true },
      timestamp: 0,
    });
    expect(result).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("idempotency key dedup does not affect events without key", async () => {
    const reg = makeReg("nokey.evt");
    const bus = new DomainEventBus(reg);
    const { adapter, calls } = mkAdapter("t");
    bus.registerAdapter(adapter);

    const make = () => ({
      type: "nokey.evt" as const,
      scope: {} as Record<string, unknown>,
      payload: {},
      timestamp: 0,
    });
    await bus.emit(make());
    await bus.emit(make());
    expect(calls).toHaveLength(2); // both delivered, no dedup
  });

  it("defaultAdapter (LoggerBroadcastAdapter) passed via constructor is used", async () => {
    const reg = makeReg("def.evt");
    const { adapter: defaultAdapter, calls } = mkAdapter("logger");
    // Pass as optional arg (LoggerBroadcastAdapter slot)
    const bus = new DomainEventBus(reg, defaultAdapter as never);
    await bus.emit({ type: "def.evt", scope: {}, payload: {}, timestamp: 0 });
    expect(calls).toHaveLength(1);
  });
});
