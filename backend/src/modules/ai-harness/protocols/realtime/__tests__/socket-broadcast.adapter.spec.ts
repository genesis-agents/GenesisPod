/**
 * SocketBroadcastAdapter unit tests
 */

import { SocketBroadcastAdapter } from "../socket-broadcast.adapter";
import type { DomainEvent } from "../../../facade";

function makeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    type: "agent-playground.stage:started",
    scope: { missionId: "mission-123", userId: "user-1" },
    payload: { stage: "s1" },
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("SocketBroadcastAdapter", () => {
  let mockIo: {
    to: jest.Mock;
    emit: jest.Mock;
  };
  let toChain: { emit: jest.Mock };
  let adapter: SocketBroadcastAdapter;

  beforeEach(() => {
    toChain = { emit: jest.fn() };
    mockIo = {
      to: jest.fn().mockReturnValue(toChain),
      emit: jest.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapter = new SocketBroadcastAdapter(mockIo as any, {
      id: "agent-playground.socket",
      eventTypePrefix: "agent-playground.",
      roomPrefix: "playground",
    });
  });

  describe("id", () => {
    it("has correct adapter id", () => {
      expect(adapter.id).toBe("agent-playground.socket");
    });
  });

  describe("accepts", () => {
    it("accepts events starting with agent-playground.", () => {
      expect(adapter.accepts(makeEvent())).toBe(true);
    });

    it("accepts events with any agent-playground.* suffix", () => {
      expect(
        adapter.accepts(
          makeEvent({ type: "agent-playground.mission:completed" }),
        ),
      ).toBe(true);
    });

    it("rejects events not starting with agent-playground.", () => {
      expect(adapter.accepts(makeEvent({ type: "other.service.event" }))).toBe(
        false,
      );
    });

    it("rejects empty-type events", () => {
      expect(adapter.accepts(makeEvent({ type: "" }))).toBe(false);
    });
  });

  describe("broadcast", () => {
    it("calls io.to with playground:{missionId} room", async () => {
      await adapter.broadcast(makeEvent());
      expect(mockIo.to).toHaveBeenCalledWith("playground:mission-123");
    });

    it("emits event with correct shape", async () => {
      const event = makeEvent({ agentId: "agent-1", traceId: "trace-1" });
      await adapter.broadcast(event);
      expect(toChain.emit).toHaveBeenCalledWith(event.type, {
        type: event.type,
        payload: event.payload,
        agentId: event.agentId,
        traceId: event.traceId,
        timestamp: event.timestamp,
      });
    });

    it("falls back to userId when missionId is missing from scope", async () => {
      const event = makeEvent({
        scope: { missionId: undefined as unknown as string, userId: "user-42" },
      });
      await adapter.broadcast(event);
      expect(mockIo.to).toHaveBeenCalledWith("playground:user-42");
    });

    it("drops event when both missionId and userId are missing", async () => {
      const event = makeEvent({
        scope: {
          missionId: undefined as unknown as string,
          userId: undefined as unknown as string,
        },
      });
      await adapter.broadcast(event);
      expect(mockIo.to).not.toHaveBeenCalled();
      expect(toChain.emit).not.toHaveBeenCalled();
    });

    it("emits correct event.type on the room socket", async () => {
      const event = makeEvent({ type: "agent-playground.mission:completed" });
      await adapter.broadcast(event);
      expect(toChain.emit).toHaveBeenCalledWith(
        "agent-playground.mission:completed",
        expect.any(Object),
      );
    });

    it("includes payload from event in emit", async () => {
      const event = makeEvent({ payload: { message: "hello", score: 95 } });
      await adapter.broadcast(event);
      const emitArg = toChain.emit.mock.calls[0][1] as Record<string, unknown>;
      expect(emitArg.payload).toEqual({ message: "hello", score: 95 });
    });

    it("handles event without agentId or traceId (undefined)", async () => {
      const event = makeEvent();
      delete (event as { agentId?: string }).agentId;
      delete (event as { traceId?: string }).traceId;
      await adapter.broadcast(event);
      const emitArg = toChain.emit.mock.calls[0][1] as Record<string, unknown>;
      expect(emitArg.agentId).toBeUndefined();
      expect(emitArg.traceId).toBeUndefined();
    });
  });
});
