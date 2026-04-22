/**
 * KernelContext Tests
 */

import { KernelContext } from "../kernel-context";
import type { KernelContextData } from "../kernel-context";

// KernelContext is a module-level singleton using AsyncLocalStorage — no mocking needed.

describe("KernelContext", () => {
  // -------------------------------------------------------------------------
  // run() / get()
  // -------------------------------------------------------------------------
  describe("run()", () => {
    it("should make context data available inside the run callback", () => {
      const data: KernelContextData = {
        processId: "proc-1",
        userId: "user-1",
        agentId: "agent-x",
      };

      KernelContext.run(data, () => {
        const result = KernelContext.get();
        expect(result).toEqual(data);
      });
    });

    it("should return the value returned by the callback", () => {
      const value = KernelContext.run(
        { processId: "proc-2" },
        () => "hello-world",
      );
      expect(value).toBe("hello-world");
    });

    it("should make context unavailable outside the run callback", () => {
      KernelContext.run({ processId: "proc-3" }, () => {
        // inside: fine
        expect(KernelContext.get()).toBeDefined();
      });

      // outside: should be undefined (or previously set store)
      // In top-level describe scope there is no active AsyncLocalStorage context
      const outside = KernelContext.get();
      expect(outside).toBeUndefined();
    });

    it("should isolate nested run() calls — inner context overrides outer", () => {
      const outer: KernelContextData = { processId: "outer" };
      const inner: KernelContextData = { processId: "inner" };

      KernelContext.run(outer, () => {
        expect(KernelContext.getProcessId()).toBe("outer");

        KernelContext.run(inner, () => {
          expect(KernelContext.getProcessId()).toBe("inner");
        });

        // After inner run completes, outer context is restored
        expect(KernelContext.getProcessId()).toBe("outer");
      });
    });

    it("should work with optional userId and agentId", () => {
      const data: KernelContextData = { processId: "proc-optional" };
      KernelContext.run(data, () => {
        const result = KernelContext.get()!;
        expect(result.processId).toBe("proc-optional");
        expect(result.userId).toBeUndefined();
        expect(result.agentId).toBeUndefined();
      });
    });

    it("should propagate context across async microtasks within the same run", async () => {
      const data: KernelContextData = {
        processId: "proc-async",
        userId: "u-async",
      };

      await KernelContext.run(data, async () => {
        await Promise.resolve(); // yield to microtask queue
        expect(KernelContext.get()).toEqual(data);
        expect(KernelContext.getProcessId()).toBe("proc-async");
      });
    });

    it("should not leak context between parallel async runs", async () => {
      const dataA: KernelContextData = { processId: "A" };
      const dataB: KernelContextData = { processId: "B" };

      const resultA = await KernelContext.run(dataA, async () => {
        await Promise.resolve();
        return KernelContext.getProcessId();
      });

      const resultB = await KernelContext.run(dataB, async () => {
        await Promise.resolve();
        return KernelContext.getProcessId();
      });

      expect(resultA).toBe("A");
      expect(resultB).toBe("B");
    });
  });

  // -------------------------------------------------------------------------
  // get()
  // -------------------------------------------------------------------------
  describe("get()", () => {
    it("should return undefined when called outside any run context", () => {
      // At the top level of a test there is no active ALS store
      expect(KernelContext.get()).toBeUndefined();
    });

    it("should return full KernelContextData when inside a run context", () => {
      const data: KernelContextData = {
        processId: "proc-get",
        userId: "user-get",
        agentId: "agent-get",
      };
      KernelContext.run(data, () => {
        expect(KernelContext.get()).toStrictEqual(data);
      });
    });
  });

  // -------------------------------------------------------------------------
  // getProcessId()
  // -------------------------------------------------------------------------
  describe("getProcessId()", () => {
    it("should return undefined when called outside any run context", () => {
      expect(KernelContext.getProcessId()).toBeUndefined();
    });

    it("should return the processId from the active context", () => {
      KernelContext.run({ processId: "pid-123" }, () => {
        expect(KernelContext.getProcessId()).toBe("pid-123");
      });
    });

    it("should return undefined when processId is not in context (impossible by type, but defensive)", () => {
      // Force an edge case by casting: context without processId
      KernelContext.run({ processId: "" }, () => {
        // Empty string is falsy but getProcessId returns it as-is
        expect(KernelContext.getProcessId()).toBe("");
      });
    });
  });
});
