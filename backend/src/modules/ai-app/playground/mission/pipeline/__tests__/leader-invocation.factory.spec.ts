/**
 * leader-invocation.factory.spec.ts
 *
 * Unit tests for LeaderInvocationFactory.
 */

import { LeaderInvocationFactory } from "../leader-invocation.factory";
import { AgentInvoker } from "../../roles";

describe("LeaderInvocationFactory", () => {
  let invoker: jest.Mocked<AgentInvoker>;
  let factory: LeaderInvocationFactory;

  beforeEach(() => {
    invoker = {
      invoke: jest.fn(),
    } as unknown as jest.Mocked<AgentInvoker>;
    factory = new LeaderInvocationFactory(invoker);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("build", () => {
    it("returns a function (LeaderRunFn)", () => {
      const fn = factory.build("m1", "u1", {});
      expect(typeof fn).toBe("function");
    });

    describe("the returned LeaderRunFn", () => {
      const mockSpec = class MockLeaderAgent {};

      it("calls invoker.invoke with correct missionId, userId, agentId, role", async () => {
        invoker.invoke.mockResolvedValue({
          state: "completed",
          output: { result: "ok" },
          events: [],
        });

        const fn = factory.build("mission-123", "user-456", {});
        await fn({
          spec: mockSpec as never,
          input: { topic: "AI" },
          agentId: "leader#1",
        });

        expect(invoker.invoke).toHaveBeenCalledWith(
          mockSpec,
          { topic: "AI" },
          expect.objectContaining({
            missionId: "mission-123",
            userId: "user-456",
            agentId: "leader#1",
            role: "leader",
          }),
        );
      });

      it("passes billing as envAdapter to invoker.invoke", async () => {
        const billing = { tier: "pro", credits: 100 };
        invoker.invoke.mockResolvedValue({
          state: "completed",
          output: {},
          events: [],
        });

        const fn = factory.build("m1", "u1", billing);
        await fn({ spec: mockSpec as never, input: {}, agentId: "leader#1" });

        expect(invoker.invoke).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ envAdapter: billing }),
        );
      });

      it("maps invoker state=completed → returns state=completed", async () => {
        invoker.invoke.mockResolvedValue({
          state: "completed",
          output: { signedOff: true },
          events: [{ type: "test" }],
        });

        const fn = factory.build("m1", "u1", {});
        const result = await fn({
          spec: mockSpec as never,
          input: {},
          agentId: "leader#1",
        });

        expect(result.state).toBe("completed");
        expect(result.output).toEqual({ signedOff: true });
        expect(result.events).toEqual([{ type: "test" }]);
      });

      it("maps invoker state=cancelled → returns state=cancelled", async () => {
        invoker.invoke.mockResolvedValue({
          state: "cancelled",
          output: undefined,
          events: [],
        });

        const fn = factory.build("m1", "u1", {});
        const result = await fn({
          spec: mockSpec as never,
          input: {},
          agentId: "leader#2",
        });

        expect(result.state).toBe("cancelled");
        expect(result.output).toBeUndefined();
      });

      it("maps invoker state=failed → returns state=failed", async () => {
        invoker.invoke.mockResolvedValue({
          state: "failed",
          output: undefined,
          events: [],
        });

        const fn = factory.build("m1", "u1", {});
        const result = await fn({
          spec: mockSpec as never,
          input: {},
          agentId: "leader#3",
        });

        expect(result.state).toBe("failed");
      });

      it("maps invoker state=degraded (non-completed/cancelled) → returns state=failed", async () => {
        invoker.invoke.mockResolvedValue({
          state: "degraded",
          output: undefined,
          events: [],
        });

        const fn = factory.build("m1", "u1", {});
        const result = await fn({
          spec: mockSpec as never,
          input: {},
          agentId: "leader#4",
        });

        expect(result.state).toBe("failed");
      });

      it("propagates invoker error (does not swallow)", async () => {
        invoker.invoke.mockRejectedValue(new Error("Agent invoke failed"));

        const fn = factory.build("m1", "u1", {});
        await expect(
          fn({ spec: mockSpec as never, input: {}, agentId: "leader#5" }),
        ).rejects.toThrow("Agent invoke failed");
      });

      it("output is typed as TOut | undefined", async () => {
        const typedOutput = { leaderVerdict: "good", signed: true };
        invoker.invoke.mockResolvedValue({
          state: "completed",
          output: typedOutput,
          events: [],
        });

        const fn = factory.build("m1", "u1", {});
        const result = await fn<unknown, typeof typedOutput>({
          spec: mockSpec as never,
          input: {},
          agentId: "leader#6",
        });

        expect(result.output).toEqual(typedOutput);
      });

      it("events array is forwarded from invoker result", async () => {
        const events = [{ type: "a" }, { type: "b" }, { type: "c" }];
        invoker.invoke.mockResolvedValue({
          state: "completed",
          output: {},
          events,
        });

        const fn = factory.build("m1", "u1", {});
        const result = await fn({
          spec: mockSpec as never,
          input: {},
          agentId: "leader#7",
        });

        expect(result.events).toBe(events);
      });

      it("multiple calls each use the same missionId/userId from closure", async () => {
        invoker.invoke.mockResolvedValue({
          state: "completed",
          output: {},
          events: [],
        });

        const fn = factory.build("mission-multi", "user-multi", {});

        await fn({
          spec: mockSpec as never,
          input: { call: 1 },
          agentId: "leader#1",
        });
        await fn({
          spec: mockSpec as never,
          input: { call: 2 },
          agentId: "leader#2",
        });

        expect(invoker.invoke).toHaveBeenCalledTimes(2);
        expect(invoker.invoke.mock.calls[0][2]).toMatchObject({
          missionId: "mission-multi",
          userId: "user-multi",
        });
        expect(invoker.invoke.mock.calls[1][2]).toMatchObject({
          missionId: "mission-multi",
          userId: "user-multi",
        });
      });

      it("null billing passed through as envAdapter", async () => {
        invoker.invoke.mockResolvedValue({
          state: "completed",
          output: {},
          events: [],
        });

        const fn = factory.build("m1", "u1", null);
        await fn({ spec: mockSpec as never, input: {}, agentId: "l#1" });

        expect(invoker.invoke).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ envAdapter: null }),
        );
      });
    });
  });
});
