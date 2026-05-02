/**
 * ReActLoop 单元测试（Phase 2）
 *
 * 验证：
 *   - 一个 tool_call 后跟一个 finalize → 正确的事件流
 *   - LLM 输出无法解析 → 回退 finalize
 *   - Tool not found → 错误事件，可恢复继续
 *   - PreToolUse hook block → 工具被跳过，action 返回 error
 *   - maxIterations 超限 → 触发 terminated with reason budget
 */

import { ReActLoop } from "../react-loop";
import { HookRegistry } from "../../../agents/core/hook-registry";
import { ContextEnvelope } from "../../../agents/core/context-envelope";
import { ToolInvoker } from "../../executor/tool-invoker";
import type {
  IAgentEvent,
  ILoopTerminationCriteria,
} from "../../../agents/abstractions";

function makeEnvelope(tools: string[] = []): ContextEnvelope {
  return new ContextEnvelope({
    system: "You are a helpful assistant.",
    messages: [{ role: "user", content: "Solve 2+2.", timestamp: 0 }],
    reminders: [],
    tools,
    memory: { sessionId: "s1", userId: "u1" },
    budget: {
      tokensUsed: 0,
      tokensRemaining: 10_000,
      iterationsUsed: 0,
      iterationsRemaining: 10,
      wallTimeStartMs: Date.now(),
    },
  });
}

function mkChat(responses: string[]) {
  let i = 0;
  return {
    chat: jest.fn(async () => {
      const content = responses[i++] ?? responses[responses.length - 1];
      return { content, model: "mock", usage: { totalTokens: 10 } };
    }),
  };
}

function mkToolRegistry(
  tools: Record<string, { success: boolean; data?: unknown; error?: string }>,
) {
  return {
    has: jest.fn((id: string) => id in tools),
    get: jest.fn((id: string) => ({
      id,
      execute: jest.fn(async () => {
        const t = tools[id];
        return {
          success: t.success,
          data: t.data,
          error: t.error ? { code: "E", message: t.error } : undefined,
          metadata: {
            executionId: "x",
            startTime: new Date(),
            endTime: new Date(),
          },
        };
      }),
    })),
  };
}

async function drain(iter: AsyncIterable<IAgentEvent>): Promise<IAgentEvent[]> {
  const out: IAgentEvent[] = [];
  for await (const ev of iter) out.push(ev);
  return out;
}

const criteria: ILoopTerminationCriteria = {
  maxIterations: 5,
  terminateOn: ["finalize"],
};

describe("ReActLoop (Phase 2)", () => {
  it("executes tool_call then finalize", async () => {
    const chat = mkChat([
      JSON.stringify({
        thinking: "I should use calculator",
        action: { kind: "tool_call", toolId: "calc", input: { expr: "2+2" } },
      }),
      JSON.stringify({
        thinking: "The answer is 4",
        action: { kind: "finalize", output: "4" },
      }),
    ]);
    const reg = mkToolRegistry({ calc: { success: true, data: 4 } });
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loop = new ReActLoop(chat as any, invoker, hooks);

    const events = await drain(
      loop.run(makeEnvelope(["calc"]), criteria, { agentId: "a1" }),
    );

    const types = events.map((e) => e.type);
    // ★ Phase P1 fix (2026-04-29 mission 8c7b4358)：每轮 ReAct 入口都 emit
    // iteration_progress 事件，让上层 UI / 监控看到进度，避免 silent 长循环看起来像死掉。
    expect(types).toEqual([
      "iteration_progress",
      "thinking",
      "action_planned",
      "action_executed",
      "iteration_progress",
      "thinking",
      "action_planned",
      "action_executed",
      "output",
      "terminated",
    ]);
    const progressEvents = events.filter(
      (e) => e.type === "iteration_progress",
    );
    expect(progressEvents).toHaveLength(2);
    expect(progressEvents[0].payload).toMatchObject({
      iteration: 1,
      maxIterations: 5,
      approachingLimit: false,
    });
    expect(progressEvents[1].payload).toMatchObject({
      iteration: 2,
      maxIterations: 5,
      approachingLimit: false,
      lastActionKind: "tool_call",
    });
    const output = events.find((e) => e.type === "output");
    expect(output?.payload).toEqual({ output: "4" });
  });

  it("falls back to finalize when LLM output is not JSON", async () => {
    const chat = mkChat(["definitely not json"]);
    const reg = mkToolRegistry({});
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loop = new ReActLoop(chat as any, invoker, hooks);

    const events = await drain(
      loop.run(makeEnvelope(), criteria, { agentId: "a1" }),
    );
    const terminated = events.find((e) => e.type === "terminated");
    expect(terminated?.payload).toEqual({ reason: "completed" });
    const output = events.find((e) => e.type === "output");
    expect(output).toBeDefined();
  });

  it("returns tool error as recoverable; loop continues to next iteration", async () => {
    const chat = mkChat([
      JSON.stringify({
        thinking: "try unknown tool",
        action: { kind: "tool_call", toolId: "missing", input: {} },
      }),
      JSON.stringify({
        thinking: "give up",
        action: { kind: "finalize", output: "gave up" },
      }),
    ]);
    const reg = mkToolRegistry({});
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loop = new ReActLoop(chat as any, invoker, hooks);

    const events = await drain(
      loop.run(makeEnvelope(["missing"]), criteria, { agentId: "a1" }),
    );

    const actionExecuted = events.filter((e) => e.type === "action_executed");
    expect(actionExecuted[0].payload).toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining("Tool not found"),
      }),
    });
    const terminated = events.find((e) => e.type === "terminated");
    expect(terminated?.payload).toEqual({ reason: "completed" });
  });

  it("PreToolUse hook can block tool execution", async () => {
    const chat = mkChat([
      JSON.stringify({
        thinking: "use calc",
        action: { kind: "tool_call", toolId: "calc", input: { expr: "2+2" } },
      }),
      JSON.stringify({
        thinking: "abandon",
        action: { kind: "finalize", output: "blocked" },
      }),
    ]);
    const reg = mkToolRegistry({ calc: { success: true, data: 4 } });
    const hooks = new HookRegistry();
    hooks.register({
      event: "PreToolUse",
      scope: "global",
      handler: () => ({ block: true, reason: "test-policy" }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loop = new ReActLoop(chat as any, invoker, hooks);

    const events = await drain(
      loop.run(makeEnvelope(["calc"]), criteria, { agentId: "a1" }),
    );
    const firstAction = events.find((e) => e.type === "action_executed");
    expect(firstAction?.payload).toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining("blocked: test-policy"),
      }),
    });
    // Registry get should NOT be called (tool skipped)
    expect(reg.get).not.toHaveBeenCalled();
  });

  it("terminates with reason budget after maxIterations", async () => {
    // Always respond with a tool_call (never finalize)
    const chat = mkChat([
      JSON.stringify({
        thinking: "call again",
        action: { kind: "tool_call", toolId: "noop", input: {} },
      }),
    ]);
    const reg = mkToolRegistry({ noop: { success: true, data: "ok" } });
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loop = new ReActLoop(chat as any, invoker, hooks);

    const events = await drain(
      loop.run(
        makeEnvelope(["noop"]),
        { maxIterations: 2, terminateOn: ["finalize"] },
        {
          agentId: "a1",
        },
      ),
    );
    const terminated = events.find((e) => e.type === "terminated");
    // ★ P0-LIVE-MAX-ITER (2026-04-30): maxIterations 命中改 reason="error"
    //   让 runner 落到 legacyState="failed"，stage 才能走 dimension:degraded
    //   兜底（旧的 reason="budget" 会被推断成 completed + 垃圾 output）。
    expect(terminated?.payload).toEqual({ reason: "error" });
    const actionExecs = events.filter((e) => e.type === "action_executed");
    expect(actionExecs).toHaveLength(2);
  });

  // ── v2: Parallel tool calls ──
  it("executes multiple tools in parallel via parallel_tool_call", async () => {
    const chat = mkChat([
      JSON.stringify({
        thinking: "fan out",
        action: {
          kind: "parallel_tool_call",
          calls: [
            { kind: "tool_call", toolId: "a", input: {} },
            { kind: "tool_call", toolId: "b", input: {} },
            { kind: "tool_call", toolId: "c", input: {} },
          ],
        },
      }),
      JSON.stringify({
        thinking: "merge",
        action: { kind: "finalize", output: "merged" },
      }),
    ]);
    const reg = mkToolRegistry({
      a: { success: true, data: "A" },
      b: { success: true, data: "B" },
      c: { success: true, data: "C" },
    });
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loop = new ReActLoop(chat as any, invoker, hooks);

    const events = await drain(
      loop.run(makeEnvelope(["a", "b", "c"]), criteria, { agentId: "p1" }),
    );
    const exec = events.find((e) => e.type === "action_executed");
    expect(exec?.payload).toMatchObject({
      action: { kind: "parallel_tool_call" },
      subResults: expect.arrayContaining([
        expect.objectContaining({ output: "A" }),
        expect.objectContaining({ output: "B" }),
        expect.objectContaining({ output: "C" }),
      ]),
    });
    expect(reg.get).toHaveBeenCalledTimes(3);
  });

  it("treats top-level 'actions' shorthand as parallel_tool_call", async () => {
    const chat = mkChat([
      JSON.stringify({
        thinking: "fan out shorthand",
        actions: [
          { toolId: "a", input: {} },
          { toolId: "b", input: {} },
        ],
      }),
      JSON.stringify({
        thinking: "done",
        action: { kind: "finalize", output: "done" },
      }),
    ]);
    const reg = mkToolRegistry({
      a: { success: true, data: 1 },
      b: { success: true, data: 2 },
    });
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loop = new ReActLoop(chat as any, invoker, hooks);

    const events = await drain(
      loop.run(makeEnvelope(["a", "b"]), criteria, { agentId: "s1" }),
    );
    const exec = events.find((e) => e.type === "action_executed");
    expect(exec?.payload).toMatchObject({
      action: { kind: "parallel_tool_call" },
    });
    expect(reg.get).toHaveBeenCalledTimes(2);
  });

  // ── v2: BudgetAccountant integration ──
  it("aborts loop when BudgetAccountant.exhausted() returns true", async () => {
    const { BudgetAccountant } =
      await import("../../../guardrails/budget/budget-accountant");
    const budget = new BudgetAccountant({ maxTokens: 100, maxCostUsd: 0.01 });
    // Pre-exhaust
    budget.accountLLM(150, 0, 0);

    const chat = mkChat([
      JSON.stringify({
        thinking: "shouldn't be called",
        action: { kind: "finalize", output: "x" },
      }),
    ]);
    const reg = mkToolRegistry({});
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loop = new ReActLoop(chat as any, invoker, hooks);

    const events = await drain(
      loop.run(makeEnvelope(), criteria, { agentId: "b1", budget }),
    );
    const types = events.map((e) => e.type);
    expect(types).toContain("budget_warning");
    const terminated = events.find((e) => e.type === "terminated");
    expect(terminated?.payload).toEqual({ reason: "budget" });
    // chat must NOT have been called — exhausted before reasoning
    expect(chat.chat).not.toHaveBeenCalled();
  });
});
