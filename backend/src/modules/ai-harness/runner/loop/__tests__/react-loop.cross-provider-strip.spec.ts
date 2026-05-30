/**
 * ReActLoop — 反向洞察 #6 跨 provider failover thinking/signature 剥离接入
 *
 * Verifies the wiring (not the util internals — those have their own spec):
 *   1. On a CROSS-provider failover (e.g. anthropic → openai), the loop runs the
 *      rebuilt outgoing messages through stripThinkingSignature with the correct
 *      (fromProvider, toProvider) BEFORE re-sending to the new model.
 *   2. The strip is consumed once (only the post-failover round), not every round.
 *
 * stripThinkingSignature is mocked so we can assert on the (from, to) it receives.
 * Note: buildMessages currently only forwards role/content/name/toolCallId and
 * IContextMessage carries no thinking/signature, so this接入 is defensive (no real
 * stripping target today). This spec locks the wiring contract + provider derivation.
 */

import { stripThinkingSignature } from "../../executor/strip-thinking-signature.util";

jest.mock("../../executor/strip-thinking-signature.util", () => ({
  // passthrough impl so the loop continues normally; spy lives on the mock.
  stripThinkingSignature: jest.fn((messages: unknown[]) => messages.slice()),
}));

import { ReActLoop } from "../react-loop";
import { HookRegistry } from "../../../agents/core/hook-registry";
import { ContextEnvelope } from "../../../agents/core/context-envelope";
import { ToolInvoker } from "../../tool-invoker/tool-invoker";
import type {
  IAgentEvent,
  ILoopTerminationCriteria,
} from "../../../agents/abstractions";

const stripMock = stripThinkingSignature as jest.MockedFunction<
  typeof stripThinkingSignature
>;

function makeEnvelope(userId?: string): ContextEnvelope {
  return new ContextEnvelope({
    system: "You are a helpful assistant.",
    messages: [{ role: "user", content: "Hello", timestamp: 0 }],
    reminders: [],
    tools: [],
    memory: { sessionId: "s1", userId },
    budget: {
      tokensUsed: 0,
      tokensRemaining: 10_000,
      iterationsUsed: 0,
      iterationsRemaining: 10,
      wallTimeStartMs: Date.now(),
    },
  });
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

const finalizeResponse = JSON.stringify({
  thinking: "done",
  action: { kind: "finalize", output: "ok" },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeLoopWithChat(chatFn: (args: any) => Promise<any>): ReActLoop {
  const chatService = { chat: jest.fn(chatFn) };
  const toolRegistry = {
    has: jest.fn(() => false),
    get: jest.fn(() => undefined),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoker = new ToolInvoker(toolRegistry as any);
  const hooks = new HookRegistry();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ReActLoop(chatService as any, invoker, hooks);
}

describe("ReActLoop — cross-provider failover thinking/signature strip (反向洞察 #6)", () => {
  beforeEach(() => {
    stripMock.mockClear();
  });

  it("runs strip with (fromProvider, toProvider) on cross-provider failover", async () => {
    // anthropic/claude-* fails with an explicit provider hint → failover to
    // openai/gpt-* (structured provider-prefix ids; toProvider is taken from the
    // slash prefix, fromProvider from the error message's provider hint).
    const failedId = "anthropic/claude-3-5-sonnet";
    const nextId = "openai/gpt-4o";
    const loop = makeLoopWithChat(async (args) => {
      const model = args.model as string | undefined;
      if (!model || model === failedId) {
        throw new Error('No API Key available for provider "anthropic"');
      }
      return {
        content: finalizeResponse,
        model,
        usage: { totalTokens: 10, inputTokens: 5, outputTokens: 5 },
      };
    });

    const failoverProvider = jest.fn(
      async (excludeModelIds: ReadonlyArray<string>): Promise<string | null> =>
        excludeModelIds.includes(nextId) ? null : nextId,
    );

    const events = await drain(
      loop.run(makeEnvelope("user-1"), criteria, {
        agentId: "test-agent",
        preferredModelId: failedId,
        modelFailoverProvider: failoverProvider,
      }),
    );

    expect(failoverProvider).toHaveBeenCalledTimes(1);
    const terminated = events.find((e) => e.type === "terminated");
    expect(terminated?.payload).toMatchObject({ reason: "completed" });

    // strip invoked exactly once (only the post-failover round).
    expect(stripMock).toHaveBeenCalledTimes(1);
    // fromProvider from the error message ("anthropic"); toProvider from the
    // "openai/" slash prefix of the next model id.
    const [, fromProvider, toProvider] = stripMock.mock.calls[0];
    expect(fromProvider).toBe("anthropic");
    expect(toProvider).toBe("openai");
  });

  it("does NOT run strip when no failover occurs (single successful round)", async () => {
    const loop = makeLoopWithChat(async (args) => ({
      content: finalizeResponse,
      model: (args.model as string | undefined) ?? "claude-3-5-sonnet",
      usage: { totalTokens: 10, inputTokens: 5, outputTokens: 5 },
    }));

    const events = await drain(
      loop.run(makeEnvelope("user-1"), criteria, {
        agentId: "test-agent",
        preferredModelId: "claude-3-5-sonnet",
      }),
    );

    const terminated = events.find((e) => e.type === "terminated");
    expect(terminated?.payload).toMatchObject({ reason: "completed" });
    // No failover → strip never wired in.
    expect(stripMock).not.toHaveBeenCalled();
  });
});
