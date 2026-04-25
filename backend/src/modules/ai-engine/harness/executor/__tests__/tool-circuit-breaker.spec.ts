/**
 * ToolCircuitBreaker 单元测试 (PR-I)
 */

import { ToolCircuitBreaker } from "../tool-circuit-breaker";

describe("ToolCircuitBreaker (PR-I)", () => {
  it("allows by default", () => {
    const cb = new ToolCircuitBreaker();
    expect(cb.allow("t1")).toBe(true);
  });

  it("opens after N consecutive failures", () => {
    const cb = new ToolCircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure("t1");
    cb.recordFailure("t1");
    expect(cb.allow("t1")).toBe(true); // 2 failures, still closed
    cb.recordFailure("t1");
    expect(cb.allow("t1")).toBe(false); // 3 failures, open
    expect(cb.getState("t1")).toBe("open");
  });

  it("recordSuccess resets failure count", () => {
    const cb = new ToolCircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure("t1");
    cb.recordFailure("t1");
    cb.recordSuccess("t1");
    cb.recordFailure("t1");
    cb.recordFailure("t1");
    expect(cb.allow("t1")).toBe(true); // back to 2 failures
  });

  it("transitions to half-open after recovery window", async () => {
    const cb = new ToolCircuitBreaker({
      failureThreshold: 1,
      recoveryWindowMs: 50,
    });
    cb.recordFailure("t1");
    expect(cb.allow("t1")).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(cb.allow("t1")).toBe(true); // half-open
    expect(cb.getState("t1")).toBe("half-open");
    cb.recordSuccess("t1");
    expect(cb.getState("t1")).toBe("closed");
  });

  it("isolates state per tool", () => {
    const cb = new ToolCircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure("t1");
    expect(cb.allow("t1")).toBe(false);
    expect(cb.allow("t2")).toBe(true); // unaffected
  });
});
