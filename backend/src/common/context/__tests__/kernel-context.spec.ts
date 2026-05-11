/**
 * KernelContext contract spec — locks the 2026-05-11 rename + the
 * "agentProcessId is optional, missionId is the catch-all" semantics.
 *
 * Why this spec exists: the prod log flood incident was caused by 4+
 * callers stuffing missionId into the `processId` slot. After renaming
 * the field to `agentProcessId` and adding JSDoc, this spec asserts:
 *   1. omitting agentProcessId is legal (TS + runtime)
 *   2. getAgentProcessId() returns undefined when not set
 *   3. setting only missionId / userId works (no FK trap)
 *   4. setting agentProcessId surfaces it via the getter
 *   5. nested run() inherits + overrides cleanly
 */

import { KernelContext } from "../kernel-context";

describe("KernelContext (post 2026-05-11 rename)", () => {
  it("returns undefined for agentProcessId when not set", () => {
    KernelContext.run({ userId: "u1" }, () => {
      expect(KernelContext.getAgentProcessId()).toBeUndefined();
      expect(KernelContext.get()?.userId).toBe("u1");
    });
  });

  it("accepts missionId-only context (no agentProcessId) — the business-team / playground path", () => {
    KernelContext.run({ missionId: "mission-abc", userId: "u1" }, () => {
      expect(KernelContext.getMissionId()).toBe("mission-abc");
      expect(KernelContext.getAgentProcessId()).toBeUndefined();
    });
  });

  it("surfaces agentProcessId via the dedicated getter when set", () => {
    KernelContext.run(
      { agentProcessId: "agent-process-xyz", userId: "u1" },
      () => {
        expect(KernelContext.getAgentProcessId()).toBe("agent-process-xyz");
      },
    );
  });

  it("propagates context through nested async scopes", async () => {
    await KernelContext.run(
      { agentProcessId: "outer", missionId: "mission-1", userId: "u1" },
      async () => {
        await Promise.resolve();
        expect(KernelContext.getAgentProcessId()).toBe("outer");
        expect(KernelContext.getMissionId()).toBe("mission-1");
      },
    );
  });

  it("nested run() can override agentProcessId without affecting outer scope", () => {
    KernelContext.run({ agentProcessId: "outer", userId: "u1" }, () => {
      KernelContext.run(
        { ...KernelContext.get()!, agentProcessId: "inner" },
        () => {
          expect(KernelContext.getAgentProcessId()).toBe("inner");
        },
      );
      expect(KernelContext.getAgentProcessId()).toBe("outer");
    });
  });
});
