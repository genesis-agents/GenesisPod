/**
 * HookRegistry 单元测试（Phase 1 — 完整实现）
 */

import { HookRegistry } from "../hook-registry";
import type {
  IContextEnvelope,
  IBudgetSnapshot,
  IMemoryBinding,
} from "../../abstractions";

function makeEnv(): IContextEnvelope {
  const budget: IBudgetSnapshot = {
    tokensUsed: 0,
    tokensRemaining: 1000,
    iterationsUsed: 0,
    iterationsRemaining: 10,
    wallTimeStartMs: Date.now(),
  };
  const memory: IMemoryBinding = { sessionId: "s1" };
  return {
    id: "env-1",
    system: "sys",
    messages: [],
    reminders: [],
    tools: [],
    memory,
    budget,
  };
}

describe("HookRegistry", () => {
  it("registers and dispatches a hook", async () => {
    const reg = new HookRegistry();
    const calls: string[] = [];

    reg.register({
      event: "SessionStart",
      scope: "global",
      handler: () => {
        calls.push("first");
      },
    });

    const result = await reg.dispatch(
      "SessionStart",
      { sessionId: "s1" },
      { agentId: "a1", envelope: makeEnv() },
    );

    expect(calls).toEqual(["first"]);
    expect(result).toEqual({});
  });

  it("orders handlers by priority desc, then registration order", async () => {
    const reg = new HookRegistry();
    const calls: string[] = [];

    reg.register({
      event: "Stop",
      scope: "global",
      priority: 1,
      handler: () => {
        calls.push("low-priority");
      },
    });
    reg.register({
      event: "Stop",
      scope: "global",
      priority: 10,
      handler: () => {
        calls.push("high-priority");
      },
    });
    reg.register({
      event: "Stop",
      scope: "global",
      priority: 10,
      handler: () => {
        calls.push("high-priority-later");
      },
    });

    await reg.dispatch(
      "Stop",
      { reason: "completed" },
      { agentId: "a1", envelope: makeEnv() },
    );

    expect(calls).toEqual([
      "high-priority",
      "high-priority-later",
      "low-priority",
    ]);
  });

  it("blocks subsequent handlers when a hook returns block: true", async () => {
    const reg = new HookRegistry();
    const calls: string[] = [];

    reg.register({
      event: "PreToolUse",
      scope: "global",
      priority: 10,
      handler: () => {
        calls.push("blocker");
        return { block: true, reason: "policy" };
      },
    });
    reg.register({
      event: "PreToolUse",
      scope: "global",
      handler: () => {
        calls.push("should-not-run");
      },
    });

    const result = await reg.dispatch(
      "PreToolUse",
      {
        action: { kind: "tool_call", toolId: "t1", input: {} },
      },
      { agentId: "a1", envelope: makeEnv() },
    );

    expect(calls).toEqual(["blocker"]);
    expect(result.block).toBe(true);
    expect(result.reason).toBe("policy");
  });

  it("unregister() removes the handler", async () => {
    const reg = new HookRegistry();
    const calls: string[] = [];

    const unreg = reg.register({
      event: "UserPromptSubmit",
      scope: "global",
      handler: () => {
        calls.push("ran");
      },
    });

    unreg();
    await reg.dispatch(
      "UserPromptSubmit",
      { prompt: "p", envelope: makeEnv() },
      { agentId: "a1", envelope: makeEnv() },
    );

    expect(calls).toEqual([]);
  });
});
