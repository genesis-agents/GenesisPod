/**
 * ReActLoop — PR-1 native function-calling 路径单测
 *
 * 验证：
 *   1. flag ON + LLM 返回 toolCalls → 跳过 JSON parse，直接 dispatch tool。
 *   2. flag ON + LLM 返回多个 toolCalls → 合并成 parallel_tool_call 一并并发。
 *   3. flag ON + LLM 返回空 toolCalls + content 是 toolId-as-kind dialect
 *      → 回退 parseDecision 路径，方言容错把 kind="web-search" 当 toolId 用。
 *   4. flag OFF（默认）+ LLM 返回 toolCalls → 走旧 prompt-driven 路径，
 *      toolCalls 被忽略，parseDecision 处理 content。验证默认行为不变。
 *   A. flag ON + envelope.tools=[] → 不走 native FC（fcDefs 空），chat 收 tools=undefined。
 *   B. flag ON + 没注 AgentToolRegistry → 不走 native FC，照常 prompt-driven。
 *   C. flag ON + response.toolCalls=[]（空数组而非 undefined）→ 回退 parseDecision。
 */

import { ReActLoop } from "../react-loop";
import { HookRegistry } from "../../../agents/core/hook-registry";
import { ContextEnvelope } from "../../../agents/core/context-envelope";
import { ToolInvoker } from "../../tool-invoker/tool-invoker";
import type {
  IAgentEvent,
  ILoopTerminationCriteria,
} from "../../../agents/abstractions";

type ChatStubResponse = {
  content?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
};

function makeEnvelope(tools: string[] = []): ContextEnvelope {
  return new ContextEnvelope({
    system: "You are a helpful assistant.",
    messages: [{ role: "user", content: "Find docs.", timestamp: 0 }],
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

function mkChat(responses: ChatStubResponse[]) {
  let i = 0;
  return {
    chat: jest.fn(async () => {
      const r = responses[i++] ?? responses[responses.length - 1];
      return {
        content: r.content ?? "",
        toolCalls: r.toolCalls,
        model: "mock",
        usage: { totalTokens: 10 },
      };
    }),
  };
}

function mkToolRegistry(
  tools: Record<string, { success: boolean; data?: unknown }>,
) {
  return {
    has: jest.fn((id: string) => id in tools),
    get: jest.fn((id: string) => ({
      id,
      execute: jest.fn(async () => ({
        success: tools[id].success,
        data: tools[id].data,
        metadata: {
          executionId: "x",
          startTime: new Date(),
          endTime: new Date(),
        },
      })),
    })),
  };
}

// 最小 AgentToolRegistry stub —— 只用 getSchemas()。
function mkAgentToolRegistry(tools: string[]) {
  return {
    getSchemas: jest.fn((ids: readonly string[]) =>
      ids
        .filter((id) => tools.includes(id))
        .map((id) => ({
          type: "function" as const,
          function: {
            name: id,
            description: `Tool ${id}`,
            parameters: { type: "object", properties: {} },
          },
        })),
    ),
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

describe("ReActLoop · PR-1 native function-calling", () => {
  const ORIGINAL_FLAG = process.env.HARNESS_REACT_NATIVE_FC;
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.HARNESS_REACT_NATIVE_FC;
    else process.env.HARNESS_REACT_NATIVE_FC = ORIGINAL_FLAG;
  });

  it("1. flag ON: consumes response.toolCalls and dispatches tool", async () => {
    process.env.HARNESS_REACT_NATIVE_FC = "true";
    const chat = mkChat([
      {
        toolCalls: [
          { id: "c1", name: "web-search", arguments: { query: "react" } },
        ],
      },
      {
        content: JSON.stringify({
          thinking: "done",
          action: { kind: "finalize", output: { ok: true } },
        }),
      },
    ]);
    const reg = mkToolRegistry({ "web-search": { success: true, data: "ok" } });
    const atr = mkAgentToolRegistry(["web-search"]);
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    const loop = new ReActLoop(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chat as any,
      invoker,
      hooks,
      undefined,
      undefined,
      undefined,
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      atr as any,
    );
    const events = await drain(
      loop.run(makeEnvelope(["web-search"]), criteria, { agentId: "a1" }),
    );
    // action_executed = 1 (tool) + 1 (finalize) = 2
    const executed = events.filter((e) => e.type === "action_executed");
    expect(executed.length).toBe(2);
    // tool invocation 真实发生（reg.get 至少一次命中 web-search）
    expect(reg.get).toHaveBeenCalledWith("web-search");
    // FC wiring: getSchemas 被以 envelope.tools 调用，chat 收到 tools 字段
    expect(atr.getSchemas).toHaveBeenCalledWith(["web-search"]);
    const firstChatArg = (chat.chat as jest.Mock).mock.calls[0][0];
    expect(firstChatArg.tools).toBeDefined();
    expect(firstChatArg.tools.length).toBe(1);
    expect(firstChatArg.tools[0].name).toBe("web-search");
    // 与 prompt-driven 路径关键差异：responseFormat 没设
    expect(firstChatArg.responseFormat).toBeUndefined();
    // 结构 suffix 不应再追加（DO NOT put the action content 是 structural 段标志）
    expect(firstChatArg.systemPrompt).not.toMatch(
      /DO NOT put the action content/,
    );
    // 但运营 suffix 还要保留（reserved internals 警告 / "if a tool failed"）
    expect(firstChatArg.systemPrompt).toMatch(/Reserved internal action names/);
  });

  it("2. flag ON: multiple toolCalls become parallel_tool_call", async () => {
    process.env.HARNESS_REACT_NATIVE_FC = "true";
    const chat = mkChat([
      {
        toolCalls: [
          { id: "c1", name: "web-search", arguments: { q: "a" } },
          { id: "c2", name: "rag-search", arguments: { q: "b" } },
        ],
      },
      {
        content: JSON.stringify({
          thinking: "done",
          action: { kind: "finalize", output: { ok: true } },
        }),
      },
    ]);
    const reg = mkToolRegistry({
      "web-search": { success: true, data: "x" },
      "rag-search": { success: true, data: "y" },
    });
    const atr = mkAgentToolRegistry(["web-search", "rag-search"]);
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    const loop = new ReActLoop(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chat as any,
      invoker,
      hooks,
      undefined,
      undefined,
      undefined,
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      atr as any,
    );
    const events = await drain(
      loop.run(makeEnvelope(["web-search", "rag-search"]), criteria, {
        agentId: "a1",
      }),
    );
    // parallel_tool_call → 1 个 action_executed（聚合）+ 1 finalize = 2
    expect(events.filter((e) => e.type === "action_executed").length).toBe(2);
    // 但两个 tool 都被实际调用（registry get 命中两次）
    expect(reg.get).toHaveBeenCalledWith("web-search");
    expect(reg.get).toHaveBeenCalledWith("rag-search");
    const planned = events.find(
      (e) =>
        e.type === "action_planned" &&
        (e.payload as { kind?: string }).kind === "parallel_tool_call",
    );
    expect(planned).toBeDefined();
    expect((planned!.payload as { calls?: unknown[] }).calls!.length).toBe(2);
  });

  it("3. flag ON + empty toolCalls + toolId-as-kind content: falls back to parseDecision dialect tolerance", async () => {
    process.env.HARNESS_REACT_NATIVE_FC = "true";
    const chat = mkChat([
      {
        content: JSON.stringify({
          thinking: "search",
          action: { kind: "web-search", input: { query: "react" } },
        }),
      },
      {
        content: JSON.stringify({
          thinking: "done",
          action: { kind: "finalize", output: { ok: true } },
        }),
      },
    ]);
    const reg = mkToolRegistry({ "web-search": { success: true, data: "ok" } });
    const atr = mkAgentToolRegistry(["web-search"]);
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    const loop = new ReActLoop(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chat as any,
      invoker,
      hooks,
      undefined,
      undefined,
      undefined,
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      atr as any,
    );
    const events = await drain(
      loop.run(makeEnvelope(["web-search"]), criteria, { agentId: "a1" }),
    );
    expect(events.filter((e) => e.type === "action_executed").length).toBe(2);
    expect(reg.get).toHaveBeenCalledWith("web-search");
  });

  it("4. flag OFF (default): toolCalls ignored, parseDecision drives dispatch", async () => {
    delete process.env.HARNESS_REACT_NATIVE_FC;
    const chat = mkChat([
      {
        toolCalls: [
          { id: "c1", name: "web-search", arguments: { q: "ignored" } },
        ],
        content: JSON.stringify({
          thinking: "use canonical envelope",
          action: {
            kind: "tool_call",
            toolId: "web-search",
            input: { q: "from-content" },
          },
        }),
      },
      {
        content: JSON.stringify({
          thinking: "done",
          action: { kind: "finalize", output: { ok: true } },
        }),
      },
    ]);
    const reg = mkToolRegistry({ "web-search": { success: true, data: "ok" } });
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    // 不传 AgentToolRegistry —— 模拟旧 wiring
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loop = new ReActLoop(chat as any, invoker, hooks);
    const events = await drain(
      loop.run(makeEnvelope(["web-search"]), criteria, { agentId: "a1" }),
    );
    expect(events.filter((e) => e.type === "action_executed").length).toBe(2);
    expect(reg.get).toHaveBeenCalledWith("web-search");
    const firstChatArg = (chat.chat as jest.Mock).mock.calls[0][0];
    // flag OFF：tools 不应该被透给 chat()
    expect(firstChatArg.tools).toBeUndefined();
    // 旧路径 responseFormat 仍然 "json"
    expect(firstChatArg.responseFormat).toBe("json");
  });

  // ───── 补充覆盖（review 反馈：A/B/C MUST-ADD） ─────

  it("A. flag ON + envelope.tools=[]: native FC short-circuits, no tools field on chat()", async () => {
    process.env.HARNESS_REACT_NATIVE_FC = "true";
    const chat = mkChat([
      {
        content: JSON.stringify({
          thinking: "no tools available",
          action: { kind: "finalize", output: { ok: true } },
        }),
      },
    ]);
    const reg = mkToolRegistry({});
    const atr = mkAgentToolRegistry([]);
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    const loop = new ReActLoop(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chat as any,
      invoker,
      hooks,
      undefined,
      undefined,
      undefined,
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      atr as any,
    );
    const events = await drain(
      loop.run(makeEnvelope([]), criteria, { agentId: "a1" }),
    );
    // 至少有 finalize 的 action_executed，loop 不挂
    expect(
      events.filter((e) => e.type === "action_executed").length,
    ).toBeGreaterThanOrEqual(1);
    const firstChatArg = (chat.chat as jest.Mock).mock.calls[0][0];
    expect(firstChatArg.tools).toBeUndefined();
    expect(firstChatArg.responseFormat).toBe("json");
  });

  it("B. flag ON without AgentToolRegistry injection: falls back to prompt-driven cleanly", async () => {
    process.env.HARNESS_REACT_NATIVE_FC = "true";
    const chat = mkChat([
      {
        content: JSON.stringify({
          thinking: "ok",
          action: {
            kind: "tool_call",
            toolId: "web-search",
            input: { q: "x" },
          },
        }),
      },
      {
        content: JSON.stringify({
          thinking: "done",
          action: { kind: "finalize", output: { ok: true } },
        }),
      },
    ]);
    const reg = mkToolRegistry({ "web-search": { success: true, data: "ok" } });
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    // 故意不传 AgentToolRegistry（旧 wiring / 测试环境少注 provider）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loop = new ReActLoop(chat as any, invoker, hooks);
    const events = await drain(
      loop.run(makeEnvelope(["web-search"]), criteria, { agentId: "a1" }),
    );
    expect(events.filter((e) => e.type === "action_executed").length).toBe(2);
    expect(reg.get).toHaveBeenCalledWith("web-search");
    const firstChatArg = (chat.chat as jest.Mock).mock.calls[0][0];
    // ATR 没注 → buildFunctionDefinitions 返 [] → 走老路径
    expect(firstChatArg.tools).toBeUndefined();
    expect(firstChatArg.responseFormat).toBe("json");
  });

  it("C. flag ON + response.toolCalls=[] (empty array, not undefined): falls back to parseDecision", async () => {
    process.env.HARNESS_REACT_NATIVE_FC = "true";
    const chat = mkChat([
      {
        // 显式空数组 —— 验证 .length > 0 守卫真生效（vs 偷懒 truthy check）
        toolCalls: [],
        content: JSON.stringify({
          thinking: "fallback",
          action: {
            kind: "tool_call",
            toolId: "web-search",
            input: { q: "x" },
          },
        }),
      },
      {
        content: JSON.stringify({
          thinking: "done",
          action: { kind: "finalize", output: { ok: true } },
        }),
      },
    ]);
    const reg = mkToolRegistry({ "web-search": { success: true, data: "ok" } });
    const atr = mkAgentToolRegistry(["web-search"]);
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    const loop = new ReActLoop(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chat as any,
      invoker,
      hooks,
      undefined,
      undefined,
      undefined,
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      atr as any,
    );
    const events = await drain(
      loop.run(makeEnvelope(["web-search"]), criteria, { agentId: "a1" }),
    );
    expect(events.filter((e) => e.type === "action_executed").length).toBe(2);
    expect(reg.get).toHaveBeenCalledWith("web-search");
  });

  // P1#2 (2026-05-07 review fix): callId 端到端透传 — LLM tool_use_id 必须传到
  // ToolInvoker.invoke action.callId + envelope role:"tool" message toolCallId
  // + buildMessages 把 callId 嵌入 content prefix 让下轮 LLM 看到配对线索。
  it("D. callId E2E: native FC tool_use_id 透传到 invoker + envelope + 下轮 prompt", async () => {
    process.env.HARNESS_REACT_NATIVE_FC = "true";
    const chat = mkChat([
      {
        toolCalls: [
          { id: "call_abc123", name: "web-search", arguments: { q: "x" } },
        ],
      },
      {
        content: JSON.stringify({
          thinking: "done",
          action: { kind: "finalize", output: { ok: true } },
        }),
      },
    ]);
    const reg = mkToolRegistry({ "web-search": { success: true, data: "ok" } });
    const atr = mkAgentToolRegistry(["web-search"]);
    const hooks = new HookRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    const invokeSpy = jest.spyOn(invoker, "invoke");
    const loop = new ReActLoop(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chat as any,
      invoker,
      hooks,
      undefined,
      undefined,
      undefined,
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      atr as any,
    );
    await drain(
      loop.run(makeEnvelope(["web-search"]), criteria, { agentId: "a1" }),
    );
    // 1. ToolInvoker 收到的 action 必须带 callId（来自 LLM tc.id）
    const invokedAction = invokeSpy.mock.calls[0][0];
    expect((invokedAction as { callId?: string }).callId).toBe("call_abc123");
    // 2. 第二轮 chat 收到的 messages 里 tool result 必须带 call_id 标记 ——
    //    buildMessages role:"tool" → "user" 降级 + content prefix（P1#2 当前形态；
    //    后续 PR 扩 ChatMessage 改 native role:"tool" + tool_call_id 字段）
    const secondChatArg = (chat.chat as jest.Mock).mock.calls[1][0];
    const userMsgs = (
      secondChatArg.messages as Array<{ role: string; content: string }>
    ).filter((m) => m.role === "user");
    const hasMarker = userMsgs.some((m) =>
      m.content.includes("call_id=call_abc123"),
    );
    expect(hasMarker).toBe(true);
  });
});
