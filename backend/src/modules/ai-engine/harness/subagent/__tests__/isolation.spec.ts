/**
 * Isolation policy 单元测试
 */

import { ContextEnvelope } from "../../core/context-envelope";
import {
  NoneIsolation,
  ContextIsolation,
  WorktreeIsolation,
  resolveIsolation,
} from "../isolation";

function makeParent(): ContextEnvelope {
  return new ContextEnvelope({
    system: "parent-sys",
    messages: [{ role: "user", content: "parent msg", timestamp: 0 }],
    reminders: [
      { source: "parent", priority: "high", content: "parent reminder" },
    ],
    tools: ["t1", "t2"],
    memory: { sessionId: "parent-s", userId: "u1" },
    budget: {
      tokensUsed: 1000,
      tokensRemaining: 40_000,
      iterationsUsed: 3,
      iterationsRemaining: 15,
      wallTimeStartMs: Date.now() - 5_000,
    },
  });
}

describe("NoneIsolation", () => {
  it("shares memory and budget pointers with parent", () => {
    const policy = new NoneIsolation();
    const parent = makeParent();
    const child = policy.derive(parent, {
      subagentSystemPrompt: "child-sys",
      subagentSessionId: "ignored",
    });

    expect(child.system).toBe("child-sys");
    expect(child.memory).toBe(parent.memory);
    expect(child.budget).toBe(parent.budget);
    // But messages/reminders/tools are cloned copies
    expect(child.messages).not.toBe(parent.messages);
    expect(child.messages).toEqual(parent.messages);
    expect(child.reminders).toEqual(parent.reminders);
    expect(child.tools).toEqual(parent.tools);
  });
});

describe("ContextIsolation", () => {
  it("uses new sessionId but inherits userId", () => {
    const policy = new ContextIsolation();
    const parent = makeParent();
    const child = policy.derive(parent, {
      subagentSessionId: "child-s",
      subagentSystemPrompt: "child-sys",
    });

    expect(child.memory.sessionId).toBe("child-s");
    expect(child.memory.userId).toBe("u1");
  });

  it("resets messages and reminders to empty", () => {
    const policy = new ContextIsolation();
    const parent = makeParent();
    const child = policy.derive(parent, {
      subagentSessionId: "child-s",
      subagentSystemPrompt: "child-sys",
    });

    expect(child.messages).toEqual([]);
    expect(child.reminders).toEqual([]);
    expect(child.tools).toEqual(parent.tools); // tools are shared
  });

  it("caps child budget at parent remaining", () => {
    const policy = new ContextIsolation();
    const parent = makeParent();
    const child = policy.derive(parent, {
      subagentSessionId: "child-s",
      subagentSystemPrompt: "sys",
      budgetOverride: { maxTokens: 100_000, maxIterations: 100 },
    });

    expect(child.budget.tokensRemaining).toBe(40_000); // capped at parent's 40k
    expect(child.budget.iterationsRemaining).toBe(15); // capped at parent's 15
  });

  it("stores parent sessionId in metadata", () => {
    const policy = new ContextIsolation();
    const parent = makeParent();
    const child = policy.derive(parent, {
      subagentSessionId: "child-s",
      subagentSystemPrompt: "sys",
    });
    expect(child.metadata?.parentSessionId).toBe("parent-s");
    expect(child.metadata?.isolation).toBe("context");
  });
});

describe("WorktreeIsolation", () => {
  it("does NOT inherit userId (strongest isolation)", () => {
    const policy = new WorktreeIsolation();
    const parent = makeParent();
    const child = policy.derive(parent, {
      subagentSessionId: "child-s",
      subagentSystemPrompt: "sys",
    });

    expect(child.memory.sessionId).toBe("child-s");
    expect(child.memory.userId).toBeUndefined();
    expect(child.metadata?.parentUserId).toBe("u1"); // remembered for audit
    expect(child.metadata?.isolation).toBe("worktree");
  });

  it("uses smaller default budget than context isolation", () => {
    const policy = new WorktreeIsolation();
    const parent = makeParent();
    const child = policy.derive(parent, {
      subagentSessionId: "child-s",
      subagentSystemPrompt: "sys",
    });
    expect(child.budget.tokensRemaining).toBeLessThanOrEqual(10_000);
    expect(child.budget.iterationsRemaining).toBeLessThanOrEqual(5);
  });
});

describe("resolveIsolation()", () => {
  it("returns the matching policy", () => {
    expect(resolveIsolation("none").kind).toBe("none");
    expect(resolveIsolation("context").kind).toBe("context");
    expect(resolveIsolation("worktree").kind).toBe("worktree");
  });
});
