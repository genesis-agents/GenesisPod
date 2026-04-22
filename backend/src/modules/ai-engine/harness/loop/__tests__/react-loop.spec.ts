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
import { HookRegistry } from "../../core/hook-registry";
import { ContextEnvelope } from "../../core/context-envelope";
import { ToolInvoker } from "../../executor/tool-invoker";
import type { IAgentEvent, ILoopTerminationCriteria } from "../../abstractions";

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
    expect(types).toEqual([
      "thinking",
      "action_planned",
      "action_executed",
      "thinking",
      "action_planned",
      "action_executed",
      "output",
      "terminated",
    ]);
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
    expect(terminated?.payload).toEqual({ reason: "budget" });
    const actionExecs = events.filter((e) => e.type === "action_executed");
    expect(actionExecs).toHaveLength(2);
  });
});
