/**
 * DomainEventBus 单测 (PR-K)
 */

import { z } from "zod";
import { DomainEventRegistry } from "../domain-event-registry";
import { DomainEventBus } from "../domain-event-bus";
import type { IBroadcastAdapter } from "../broadcast-adapter";
import type { DomainEvent } from "../domain-event.types";

function mkAdapter(
  id: string,
  accepts: (e: DomainEvent) => boolean = () => true,
) {
  const calls: DomainEvent[] = [];
  const adapter: IBroadcastAdapter = {
    id,
    accepts,
    broadcast: async (e) => {
      calls.push(e);
    },
  };
  return { adapter, calls };
}

describe("DomainEventBus (PR-K)", () => {
  it("rejects unregistered event types", async () => {
    const bus = new DomainEventBus(new DomainEventRegistry());
    const ok = await bus.emit({
      type: "unknown.event",
      scope: {},
      payload: {},
      timestamp: 0,
    });
    expect(ok).toBe(false);
  });

  it("validates payload against registered schema", async () => {
    const reg = new DomainEventRegistry();
    reg.register({
      type: "test.event",
      schema: z.object({ count: z.number() }),
    });
    const bus = new DomainEventBus(reg);
    const a = mkAdapter("t");
    bus.registerAdapter(a.adapter);

    expect(
      await bus.emit({
        type: "test.event",
        scope: {},
        payload: { count: "not a number" } as never,
        timestamp: 0,
      }),
    ).toBe(false);
    expect(a.calls).toHaveLength(0);

    expect(
      await bus.emit({
        type: "test.event",
        scope: {},
        payload: { count: 42 },
        timestamp: 0,
      }),
    ).toBe(true);
    expect(a.calls).toHaveLength(1);
  });

  it("dedupes by idempotencyKey within TTL", async () => {
    const reg = new DomainEventRegistry();
    reg.register({ type: "x.evt" });
    const bus = new DomainEventBus(reg);
    const a = mkAdapter("t");
    bus.registerAdapter(a.adapter);

    const e: DomainEvent = {
      type: "x.evt",
      scope: {},
      payload: {},
      timestamp: 0,
      idempotencyKey: "same",
    };
    expect(await bus.emit(e)).toBe(true);
    expect(await bus.emit(e)).toBe(false);
    expect(a.calls).toHaveLength(1);
  });

  it("throttles per agentId per window", async () => {
    const reg = new DomainEventRegistry();
    reg.register({
      type: "fast.evt",
      throttle: { windowMs: 1000, maxEvents: 2 },
    });
    const bus = new DomainEventBus(reg);
    const a = mkAdapter("t");
    bus.registerAdapter(a.adapter);

    const make = () => ({
      type: "fast.evt",
      scope: {},
      payload: {},
      agentId: "a1",
      timestamp: Date.now(),
    });
    expect(await bus.emit(make())).toBe(true);
    expect(await bus.emit(make())).toBe(true);
    expect(await bus.emit(make())).toBe(false);
    expect(a.calls).toHaveLength(2);
  });

  it("only delivers to adapters that accept the event", async () => {
    const reg = new DomainEventRegistry();
    reg.register({ type: "ws.evt" });
    const bus = new DomainEventBus(reg);
    const wsAdapter = mkAdapter("ws", (e) => e.type.startsWith("ws."));
    const otherAdapter = mkAdapter("other", (e) => e.type.startsWith("rest."));
    bus.registerAdapter(wsAdapter.adapter);
    bus.registerAdapter(otherAdapter.adapter);

    await bus.emit({
      type: "ws.evt",
      scope: {},
      payload: {},
      timestamp: 0,
    });
    expect(wsAdapter.calls).toHaveLength(1);
    expect(otherAdapter.calls).toHaveLength(0);
  });
});
