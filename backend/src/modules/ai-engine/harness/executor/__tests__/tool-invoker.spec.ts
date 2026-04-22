/**
 * ToolInvoker 单元测试（Phase 2）
 */

import { ToolInvoker, ToolNotFoundError } from "../tool-invoker";
import { ContextEnvelope } from "../../core/context-envelope";

function makeEnvelope(): ContextEnvelope {
  return new ContextEnvelope({
    system: "",
    messages: [],
    reminders: [],
    tools: [],
    memory: { sessionId: "s1", userId: "u1" },
    budget: {
      tokensUsed: 0,
      tokensRemaining: 1000,
      iterationsUsed: 0,
      iterationsRemaining: 10,
      wallTimeStartMs: Date.now(),
    },
  });
}

describe("ToolInvoker", () => {
  it("returns ToolNotFoundError when tool is not registered", async () => {
    const registry = {
      has: jest.fn(() => false),
      get: jest.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(registry as any);
    const result = await invoker.invoke(
      { kind: "tool_call", toolId: "ghost", input: {} },
      makeEnvelope(),
      { agentId: "a1" },
    );
    expect(result.error).toBeInstanceOf(ToolNotFoundError);
    expect(result.output).toBeUndefined();
  });

  it("returns success result and preserves output", async () => {
    const registry = {
      has: jest.fn(() => true),
      get: jest.fn(() => ({
        id: "calc",
        execute: jest.fn(async () => ({
          success: true,
          data: { answer: 42 },
          metadata: {
            executionId: "x",
            startTime: new Date(),
            endTime: new Date(),
          },
        })),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(registry as any);
    const result = await invoker.invoke(
      { kind: "tool_call", toolId: "calc", input: { expr: "40+2" } },
      makeEnvelope(),
      { agentId: "a1" },
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ answer: 42 });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("maps tool-level failure to an Error (not throw)", async () => {
    const registry = {
      has: jest.fn(() => true),
      get: jest.fn(() => ({
        id: "search",
        execute: jest.fn(async () => ({
          success: false,
          error: { code: "TIMEOUT", message: "search timed out" },
          metadata: {
            executionId: "x",
            startTime: new Date(),
            endTime: new Date(),
          },
        })),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(registry as any);
    const result = await invoker.invoke(
      { kind: "tool_call", toolId: "search", input: {} },
      makeEnvelope(),
      { agentId: "a1" },
    );
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toContain("search timed out");
  });

  it("catches thrown errors from tool execution", async () => {
    const registry = {
      has: jest.fn(() => true),
      get: jest.fn(() => ({
        id: "boom",
        execute: jest.fn(async () => {
          throw new Error("kaboom");
        }),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(registry as any);
    const result = await invoker.invoke(
      { kind: "tool_call", toolId: "boom", input: {} },
      makeEnvelope(),
      { agentId: "a1" },
    );
    expect(result.error?.message).toBe("kaboom");
  });
});
