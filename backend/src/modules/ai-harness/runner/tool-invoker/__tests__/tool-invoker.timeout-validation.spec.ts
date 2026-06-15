/**
 * ToolInvoker — 乙(2026-06-14) 真超时 + input 校验 spec
 *
 * 覆盖:
 *   - 工具不自检 signal 时,超时仍能让 invoke 返回 TOOL_TIMEOUT(不无限挂起)
 *   - 派生 signal 在超时时被 abort(well-behaved 工具可据此取消)
 *   - validateInput 返回 false → TOOL_INPUT_VALIDATION_FAILED,且不调用 execute
 *   - validateInput 通过 → 正常执行(向后兼容)
 *   - 无 timeout 配置 → 退化为普通 await(向后兼容)
 */

import { ToolInvoker } from "../tool-invoker";
import type { IContextEnvelope } from "../../../agents/abstractions";
import { Logger } from "@nestjs/common";

jest.spyOn(Logger.prototype, "warn").mockImplementation();
jest.spyOn(Logger.prototype, "error").mockImplementation();

function makeEnvelope(): IContextEnvelope {
  return {
    system: "",
    messages: [],
    reminders: [],
    tools: [],
    memory: { sessionId: "s1", userId: "u1" },
    budget: {
      tokensUsed: 0,
      tokensRemaining: 100000,
      iterationsUsed: 0,
      iterationsRemaining: 10,
      wallTimeStartMs: Date.now(),
    },
  } as unknown as IContextEnvelope;
}

interface FakeTool {
  id: string;
  defaultTimeout?: number;
  validateInput?: (input: unknown) => boolean | { valid: boolean };
  execute: (input: unknown, ctx: { signal?: AbortSignal }) => Promise<unknown>;
}

function makeRegistry(tools: Record<string, FakeTool>) {
  return {
    has: (id: string) => id in tools,
    get: (id: string) => tools[id],
  };
}

const baseOpts = { agentId: "agent-1" };
const action = (toolId: string, input: unknown = {}) => ({
  kind: "tool_call" as const,
  toolId,
  input,
});

describe("ToolInvoker 乙 — 真超时", () => {
  it("工具不自检 signal 也能超时返回 TOOL_TIMEOUT,不无限挂起", async () => {
    const slow: FakeTool = {
      id: "slow",
      // 永不 resolve —— 模拟卡死的工具
      execute: () => new Promise(() => {}),
    };
    const invoker = new ToolInvoker(makeRegistry({ slow }) as never);
    const result = await invoker.invoke(action("slow"), makeEnvelope(), {
      ...baseOpts,
      timeoutMs: 30,
    });
    expect(result.failureCode).toBe("TOOL_TIMEOUT");
    expect(result.error).toBeDefined();
  });

  it("超时时派生 signal 被 abort(工具可据此取消)", async () => {
    let observedSignal: AbortSignal | undefined;
    const cancellable: FakeTool = {
      id: "cancellable",
      execute: (_input, ctx) =>
        new Promise((resolve) => {
          observedSignal = ctx.signal;
          const t = setTimeout(() => resolve({ success: true }), 5000);
          // 仅清定时器、不 resolve —— 让超时 reject 赢得 race,验证 TOOL_TIMEOUT
          ctx.signal?.addEventListener("abort", () => clearTimeout(t));
        }),
    };
    const invoker = new ToolInvoker(makeRegistry({ cancellable }) as never);
    const result = await invoker.invoke(action("cancellable"), makeEnvelope(), {
      ...baseOpts,
      timeoutMs: 30,
    });
    expect(result.failureCode).toBe("TOOL_TIMEOUT");
    expect(observedSignal?.aborted).toBe(true);
  });

  it("使用工具自带 defaultTimeout 作回落", async () => {
    const slow: FakeTool = {
      id: "slow",
      defaultTimeout: 30,
      execute: () => new Promise(() => {}),
    };
    const invoker = new ToolInvoker(makeRegistry({ slow }) as never);
    const result = await invoker.invoke(
      action("slow"),
      makeEnvelope(),
      baseOpts,
    );
    expect(result.failureCode).toBe("TOOL_TIMEOUT");
  });

  it("无 timeout 配置时正常执行(向后兼容)", async () => {
    const fast: FakeTool = {
      id: "fast",
      execute: async () => ({ success: true, data: "ok" }),
    };
    const invoker = new ToolInvoker(makeRegistry({ fast }) as never);
    const result = await invoker.invoke(
      action("fast"),
      makeEnvelope(),
      baseOpts,
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toBe("ok");
  });
});

describe("ToolInvoker 乙 — input 校验", () => {
  it("validateInput=false → TOOL_INPUT_VALIDATION_FAILED 且不调用 execute", async () => {
    const execute = jest.fn(async () => ({ success: true, data: "ok" }));
    const guarded: FakeTool = {
      id: "guarded",
      validateInput: () => false,
      execute,
    };
    const invoker = new ToolInvoker(makeRegistry({ guarded }) as never);
    const result = await invoker.invoke(
      action("guarded"),
      makeEnvelope(),
      baseOpts,
    );
    expect(result.failureCode).toBe("TOOL_INPUT_VALIDATION_FAILED");
    expect(execute).not.toHaveBeenCalled();
  });

  it("validateInput 返回 {valid:false} 同样拦截", async () => {
    const guarded: FakeTool = {
      id: "guarded",
      validateInput: () => ({ valid: false }),
      execute: async () => ({ success: true, data: "ok" }),
    };
    const invoker = new ToolInvoker(makeRegistry({ guarded }) as never);
    const result = await invoker.invoke(
      action("guarded"),
      makeEnvelope(),
      baseOpts,
    );
    expect(result.failureCode).toBe("TOOL_INPUT_VALIDATION_FAILED");
  });

  it("validateInput 通过 → 正常执行", async () => {
    const ok: FakeTool = {
      id: "ok",
      validateInput: () => true,
      execute: async () => ({ success: true, data: "done" }),
    };
    const invoker = new ToolInvoker(makeRegistry({ ok }) as never);
    const result = await invoker.invoke(action("ok"), makeEnvelope(), baseOpts);
    expect(result.error).toBeUndefined();
    expect(result.output).toBe("done");
  });
});
