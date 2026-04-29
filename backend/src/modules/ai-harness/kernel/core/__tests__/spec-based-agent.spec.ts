/**
 * SpecBasedAgent — unit tests
 *
 * Covers:
 * - executeSpec: success path (LlmExecutor resolves)
 * - executeSpec: failure path (LlmExecutor throws)
 * - executeSpec: with buildSystemPrompt and buildUserPrompt overrides
 * - executeSpec: with stubFn (skips LLM)
 * - execute (IAgent interface): completed path
 * - execute (IAgent interface): failed path
 * - cancel
 * - getEnvelope
 * - spawnSubagent (throws)
 * - electModelOrNull: no electionProvider → returns undefined
 * - electModelOrNull: electionProvider returns undefined
 * - resolveRoleHint: leader/writer/reviewer/extractor/classifier/default
 * - buildCandidatesFromSnapshot: no env → empty candidates
 */

import { SpecBasedAgent } from "../spec-based-agent";
import { AgentIdentity } from "../agent-identity";
import type {
  LlmExecutor,
  LlmExecutorResult,
} from "../../execution/executor/llm-executor";
import type { IAgentSpec, IAgentTask, IAgentEvent } from "../../abstractions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeIdentity(roleId = "test-agent") {
  return AgentIdentity.of(
    { id: roleId, name: "Test Agent", description: "unit test" },
    { goal: { summary: "do stuff" }, skills: [], tools: [] },
  );
}

function makeSpec(overrides?: Partial<IAgentSpec>): IAgentSpec {
  return {
    identity: makeIdentity(),
    sessionId: "session-1",
    userId: "user-1",
    ...overrides,
  };
}

function makeExecutorResult(
  overrides?: Partial<LlmExecutorResult<string>>,
): LlmExecutorResult<string> {
  return {
    output: "result text",
    tokensUsed: 100,
    inputTokens: 50,
    outputTokens: 50,
    model: "gpt-4o",
    costUsd: 0.01,
    retries: 0,
    ...overrides,
  };
}

function makeLlmExecutor(
  impl?: Partial<LlmExecutor>,
): jest.Mocked<LlmExecutor> {
  return {
    execute: jest.fn().mockResolvedValue(makeExecutorResult()),
    ...impl,
  } as unknown as jest.Mocked<LlmExecutor>;
}

function makeAgent(
  spec: IAgentSpec = makeSpec(),
  executor: jest.Mocked<LlmExecutor> = makeLlmExecutor(),
  electionProvider?: () => undefined,
): SpecBasedAgent {
  return new SpecBasedAgent("test-agent-id", spec, executor, electionProvider);
}

// ─── executeSpec: success ─────────────────────────────────────────────────────

describe("SpecBasedAgent.executeSpec — success path", () => {
  it("returns completed state and output from LlmExecutor", async () => {
    const executor = makeLlmExecutor();
    const agent = makeAgent(makeSpec(), executor);

    const result = await agent.executeSpec("hello");

    expect(result.state).toBe("completed");
    expect(result.output).toBe("result text");
    expect(result.tokensUsed).toBe(100);
    expect(result.model).toBe("gpt-4o");
    expect(result.wallTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("passes agentId, systemPrompt, userPrompt to LlmExecutor", async () => {
    const executor = makeLlmExecutor();
    const agent = makeAgent(makeSpec(), executor);

    await agent.executeSpec("test input");

    expect(executor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "test-agent-id",
        systemPrompt: expect.any(String),
        userPrompt: expect.any(String),
      }),
    );
  });

  it("uses buildSystemPrompt when provided in spec", async () => {
    const executor = makeLlmExecutor();
    const spec = makeSpec({
      buildSystemPrompt: () => "custom system prompt",
      buildUserPrompt: () => "custom user prompt",
    });
    const agent = makeAgent(spec, executor);

    await agent.executeSpec("input");

    expect(executor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: "custom system prompt",
        userPrompt: "custom user prompt",
      }),
    );
  });

  it("JSON-stringifies non-string input when no buildUserPrompt", async () => {
    const executor = makeLlmExecutor();
    const agent = makeAgent(makeSpec(), executor);

    await agent.executeSpec({ key: "value" });

    const call = executor.execute.mock.calls[0][0];
    expect(call.userPrompt).toContain("key");
    expect(call.userPrompt).toContain("value");
  });

  it("sets agent state to completed after success", async () => {
    const agent = makeAgent();
    expect(agent.state).toBe("idle");
    await agent.executeSpec("input");
    expect(agent.state).toBe("completed");
  });
});

// ─── executeSpec: failure path ────────────────────────────────────────────────

describe("SpecBasedAgent.executeSpec — failure path", () => {
  it("returns failed state when LlmExecutor throws", async () => {
    const executor = makeLlmExecutor({
      execute: jest.fn().mockRejectedValue(new Error("LLM unavailable")),
    });
    const agent = makeAgent(makeSpec(), executor);

    const result = await agent.executeSpec("input");

    expect(result.state).toBe("failed");
    expect(result.errors).toContain("LLM unavailable");
    expect(result.output).toBeUndefined();
  });

  it("sets agent state to failed after LlmExecutor throws", async () => {
    const executor = makeLlmExecutor({
      execute: jest.fn().mockRejectedValue(new Error("crash")),
    });
    const agent = makeAgent(makeSpec(), executor);
    await agent.executeSpec("input");
    expect(agent.state).toBe("failed");
  });

  it("handles non-Error throws by converting to string", async () => {
    const executor = makeLlmExecutor({
      execute: jest.fn().mockRejectedValue("string error"),
    });
    const agent = makeAgent(makeSpec(), executor);

    const result = await agent.executeSpec("input");
    expect(result.state).toBe("failed");
    expect(result.errors?.[0]).toBe("string error");
  });
});

// ─── executeSpec: with stubFn ─────────────────────────────────────────────────

describe("SpecBasedAgent.executeSpec — with stubFn in spec", () => {
  it("passes stubFn to LlmExecutor", async () => {
    const stubFn = jest.fn().mockResolvedValue("stub result");
    const spec = makeSpec({ stubFn });
    const executor = makeLlmExecutor();
    const agent = makeAgent(spec, executor);

    await agent.executeSpec("input");

    const call = executor.execute.mock.calls[0][0];
    expect(typeof call.stubFn).toBe("function");
  });
});

// ─── execute (IAgent interface) ───────────────────────────────────────────────

describe("SpecBasedAgent.execute — IAgent interface (stream)", () => {
  it("yields thinking then output events on success", async () => {
    const agent = makeAgent();
    const events: IAgentEvent[] = [];

    const task: IAgentTask = { goal: "do something", input: "hello" };
    for await (const ev of agent.execute(task)) {
      events.push(ev);
    }

    expect(events[0].type).toBe("thinking");
    const outputEvent = events.find((e) => e.type === "output");
    expect(outputEvent).toBeDefined();
  });

  it("yields thinking then error event on failure", async () => {
    const executor = makeLlmExecutor({
      execute: jest.fn().mockRejectedValue(new Error("LLM fail")),
    });
    const agent = makeAgent(makeSpec(), executor);
    const events: IAgentEvent[] = [];

    const task: IAgentTask = { goal: "fail", input: {} };
    for await (const ev of agent.execute(task)) {
      events.push(ev);
    }

    expect(events[0].type).toBe("thinking");
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
  });
});

// ─── cancel ──────────────────────────────────────────────────────────────────

describe("SpecBasedAgent.cancel", () => {
  it("sets state to cancelled and resolves", async () => {
    const agent = makeAgent();
    await agent.cancel("test reason");
    expect(agent.state).toBe("cancelled");
  });
});

// ─── getEnvelope ─────────────────────────────────────────────────────────────

describe("SpecBasedAgent.getEnvelope", () => {
  it("returns a ContextEnvelope with system prompt and budget", () => {
    const agent = makeAgent();
    const env = agent.getEnvelope();
    expect(env.system).toBeDefined();
    expect(typeof env.system).toBe("string");
    expect(env.budget.tokensRemaining).toBeGreaterThan(0);
  });
});

// ─── spawnSubagent ────────────────────────────────────────────────────────────

describe("SpecBasedAgent.spawnSubagent", () => {
  it("rejects with error message about not supporting subagent spawning", async () => {
    const agent = makeAgent();
    await expect(agent.spawnSubagent({} as never)).rejects.toThrow(
      /SpecBasedAgent does not support subagent spawning/,
    );
  });
});

// ─── electModelOrNull: no electionProvider ────────────────────────────────────

describe("SpecBasedAgent electModelOrNull — no electionProvider", () => {
  it("returns undefined model when no electionProvider given", async () => {
    const executor = makeLlmExecutor();
    const agent = new SpecBasedAgent("agent-id", makeSpec(), executor);

    await agent.executeSpec("input");

    // Without election, model param should be undefined
    const call = executor.execute.mock.calls[0][0];
    expect(call.model).toBeUndefined();
  });

  it("returns undefined model when electionProvider returns undefined", async () => {
    const executor = makeLlmExecutor();
    const agent = new SpecBasedAgent(
      "agent-id",
      makeSpec(),
      executor,
      () => undefined, // provider that returns undefined
    );

    await agent.executeSpec("input");

    const call = executor.execute.mock.calls[0][0];
    expect(call.model).toBeUndefined();
  });
});

// ─── resolveRoleHint coverage via roleId ──────────────────────────────────────

describe("SpecBasedAgent resolveRoleHint — role ID patterns", () => {
  const testRoles = [
    ["leader-agent", "leader"],
    ["planner-v2", "leader"],
    ["writer-section", "writer"],
    ["section-editor", "writer"],
    ["reviewer-quality", "reviewer"],
    ["evaluator-1", "reviewer"],
    ["extractor-data", "extractor"],
    ["classifier-intent", "classifier"],
    ["generic-agent", "default"],
  ] as const;

  for (const [roleId, expectedHint] of testRoles) {
    it(`resolves roleId="${roleId}" → hint="${expectedHint}"`, async () => {
      const executor = makeLlmExecutor();
      let capturedRole: string | undefined;

      const electionService = {
        elect: jest.fn().mockImplementation(({ role }: { role: string }) => {
          capturedRole = role;
          return Promise.resolve({
            elected: { modelId: "test-model" },
            reason: "test",
          });
        }),
      };

      const agent = new SpecBasedAgent(
        roleId,
        makeSpec({
          identity: makeIdentity(roleId),
        }),
        executor,
        () => electionService as never,
      );

      await agent.executeSpec("input");

      expect(capturedRole).toBe(expectedHint);
    });
  }
});

// ─── validateBusinessRules closure in executeSpec ────────────────────────────

describe("SpecBasedAgent.executeSpec — validateBusinessRules closure", () => {
  it("passes validateBusinessRules closure to llmExecutor when spec provides it", async () => {
    const validateBusinessRules = jest.fn().mockImplementation(() => {
      /* no-op — validation passes */
    });
    const spec = makeSpec({ validateBusinessRules } as never);
    const executor = makeLlmExecutor();
    const agent = makeAgent(spec, executor);

    await agent.executeSpec("input");

    const call = executor.execute.mock.calls[0][0];
    // The closure is wrapped — it should be a function
    expect(typeof call.validateBusinessRules).toBe("function");
  });

  it("closure invokes spec.validateBusinessRules with output and ctx when executor calls it", async () => {
    const validateBusinessRules = jest.fn();
    const spec = makeSpec({ validateBusinessRules } as never);

    // Make the executor actually invoke the validateBusinessRules closure
    const executor: jest.Mocked<LlmExecutor> = {
      execute: jest
        .fn()
        .mockImplementation(
          async (params: { validateBusinessRules?: (o: unknown) => void }) => {
            // Simulate the LlmExecutor calling the validator callback
            if (params.validateBusinessRules) {
              params.validateBusinessRules({ result: "validated-output" });
            }
            return makeExecutorResult({ output: "ok" });
          },
        ),
    } as unknown as jest.Mocked<LlmExecutor>;

    const agent = makeAgent(spec, executor);
    const result = await agent.executeSpec("input");

    expect(result.state).toBe("completed");
    // The wrapped closure should have forwarded the call to spec.validateBusinessRules
    expect(validateBusinessRules).toHaveBeenCalledWith(
      { result: "validated-output" },
      expect.objectContaining({ input: "input" }),
    );
  });
});

// ─── electModelOrNull: non-NoEligibleModelError → returns undefined ───────────

describe("SpecBasedAgent electModelOrNull — generic election error returns undefined", () => {
  it("returns undefined model when election service throws generic error", async () => {
    const executor = makeLlmExecutor();
    const electionService = {
      elect: jest.fn().mockRejectedValue(new Error("network timeout")),
    };
    const agent = new SpecBasedAgent(
      "agent-id",
      makeSpec(),
      executor,
      () => electionService as never,
    );

    // Should not throw — generic errors are swallowed, falls back to undefined model
    const result = await agent.executeSpec("input");
    expect(result.state).toBe("completed");

    const call = executor.execute.mock.calls[0][0];
    expect(call.model).toBeUndefined();
  });
});

// ─── buildCandidatesFromSnapshot: with envSnapshot ────────────────────────────

describe("SpecBasedAgent buildCandidatesFromSnapshot — with envSnapshot", () => {
  it("uses envSnapshot models when provided as constructor arg", async () => {
    const executor = makeLlmExecutor();
    let capturedCandidates: unknown[] = [];

    const electionService = {
      elect: jest
        .fn()
        .mockImplementation(({ candidates }: { candidates: unknown[] }) => {
          capturedCandidates = candidates;
          return Promise.resolve({
            elected: { modelId: "gpt-4o" },
            reason: "test",
          });
        }),
    };

    const envSnapshot = {
      generatedAt: new Date().toISOString(),
      userId: "u1",
      models: {
        CHAT: [
          {
            modelId: "gpt-4o",
            provider: "openai",
            modelType: "CHAT" as const,
            contextWindow: 128000,
            costTier: "standard" as const,
            healthy: "healthy" as const,
            recentErrorRate: 0,
          },
        ],
        REASONING: [],
        EMBEDDING: [
          {
            modelId: "text-embedding-3-small",
            provider: "openai",
            modelType: "EMBEDDING" as const,
            contextWindow: 8191,
            costTier: "basic" as const,
            healthy: "healthy" as const,
          },
        ],
        VISION: [],
      },
      agents: [],
      tools: [],
      skills: [],
      userKeys: { hasByok: false, byokProviders: [], sharedKeyAvailable: true },
      externalDeps: {},
    } as never;

    const agent = new SpecBasedAgent(
      "agent-id",
      makeSpec(),
      executor,
      () => electionService as never,
      envSnapshot,
    );

    await agent.executeSpec("input");

    // Candidates should include only CHAT (+ REASONING=empty), not EMBEDDING
    expect(capturedCandidates.length).toBeGreaterThan(0);
    const candidate = capturedCandidates[0] as { modelId: string };
    expect(candidate.modelId).toBe("gpt-4o");
  });

  it("uses envOverride argument over constructor envSnapshot", async () => {
    const executor = makeLlmExecutor();
    let capturedCandidates: unknown[] = [];

    const electionService = {
      elect: jest
        .fn()
        .mockImplementation(({ candidates }: { candidates: unknown[] }) => {
          capturedCandidates = candidates;
          return Promise.resolve({
            elected: { modelId: "claude-3-haiku" },
            reason: "test",
          });
        }),
    };

    const constructorEnv = {
      generatedAt: new Date().toISOString(),
      userId: "u1",
      models: { CHAT: [], REASONING: [], EMBEDDING: [], VISION: [] },
      agents: [],
      tools: [],
      skills: [],
      userKeys: { hasByok: false, byokProviders: [], sharedKeyAvailable: true },
      externalDeps: {},
    } as never;

    const overrideEnv = {
      generatedAt: new Date().toISOString(),
      userId: "u1",
      models: {
        CHAT: [
          {
            modelId: "claude-3-haiku",
            provider: "anthropic",
            modelType: "CHAT" as const,
            contextWindow: 200000,
            costTier: "basic" as const,
            healthy: "healthy" as const,
          },
        ],
        REASONING: [],
        EMBEDDING: [],
        VISION: [],
      },
      agents: [],
      tools: [],
      skills: [],
      userKeys: { hasByok: false, byokProviders: [], sharedKeyAvailable: true },
      externalDeps: {},
    } as never;

    const agent = new SpecBasedAgent(
      "agent-id",
      makeSpec(),
      executor,
      () => electionService as never,
      constructorEnv,
    );

    // Pass override env — should use this, not the constructor env (which has empty CHAT)
    await agent.executeSpec("input", overrideEnv);

    expect(capturedCandidates.length).toBe(1);
  });
});

// ─── identity getter ──────────────────────────────────────────────────────────

describe("SpecBasedAgent.identity", () => {
  it("returns the agent identity from spec", () => {
    const agent = makeAgent();
    const identity = agent.identity;
    expect(identity.role.id).toBe("test-agent");
  });
});

// ─── state getter ─────────────────────────────────────────────────────────────

describe("SpecBasedAgent.state", () => {
  it("starts as idle", () => {
    const agent = makeAgent();
    expect(agent.state).toBe("idle");
  });
});
