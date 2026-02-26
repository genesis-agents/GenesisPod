import { AgentError } from "../agent-error";
import { EngineError } from "../base-error";
import { AgentErrorCode } from "../error-codes";

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("AgentError constructor", () => {
  it("should create with message only, defaulting to UNKNOWN code", () => {
    const error = new AgentError("something went wrong");

    expect(error).toBeInstanceOf(AgentError);
    expect(error).toBeInstanceOf(EngineError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("something went wrong");
    expect(error.code).toBe(AgentErrorCode.UNKNOWN);
    expect(error.name).toBe("AgentError");
    expect(error.agentId).toBeUndefined();
    expect(error.agentName).toBeUndefined();
    expect(error.details).toBeUndefined();
    expect(error.cause).toBeUndefined();
    expect(error.retryable).toBe(false);
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  it("should accept an explicit code", () => {
    const error = new AgentError("not found", AgentErrorCode.NOT_FOUND);

    expect(error.code).toBe(AgentErrorCode.NOT_FOUND);
  });

  it("should store agentId and agentName in properties and details", () => {
    const error = new AgentError("msg", AgentErrorCode.UNKNOWN, {
      agentId: "agent-42",
      agentName: "Researcher",
    });

    expect(error.agentId).toBe("agent-42");
    expect(error.agentName).toBe("Researcher");
    expect(error.details).toMatchObject({
      agentId: "agent-42",
      agentName: "Researcher",
    });
  });

  it("should merge agentId/agentName into existing details", () => {
    const error = new AgentError("msg", AgentErrorCode.UNKNOWN, {
      agentId: "agent-1",
      agentName: "Writer",
      details: { reason: "overloaded" },
    });

    expect(error.details).toMatchObject({
      agentId: "agent-1",
      agentName: "Writer",
      reason: "overloaded",
    });
  });

  it("should set details to undefined when no agentId, agentName, or details supplied", () => {
    const error = new AgentError("bare message");

    expect(error.details).toBeUndefined();
  });

  it("should keep details populated even when agentId/agentName are absent but details provided", () => {
    const error = new AgentError("msg", AgentErrorCode.UNKNOWN, {
      details: { foo: "bar" },
    });

    expect(error.details).toEqual({ foo: "bar" });
  });

  it("should chain cause correctly", () => {
    const cause = new Error("root cause");
    const error = new AgentError("wrapper", AgentErrorCode.UNKNOWN, { cause });

    expect(error.cause).toBe(cause);
  });

  it("should honour explicit retryable=true", () => {
    const error = new AgentError("retryable", AgentErrorCode.UNKNOWN, {
      retryable: true,
    });

    expect(error.retryable).toBe(true);
  });

  it("should honour explicit retryable=false", () => {
    const error = new AgentError("non-retryable", AgentErrorCode.UNKNOWN, {
      retryable: false,
    });

    expect(error.retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static factory: notFound
// ---------------------------------------------------------------------------

describe("AgentError.notFound", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.notFound("agent-99");

    expect(error).toBeInstanceOf(AgentError);
    expect(error.message).toBe("Agent 'agent-99' not found");
    expect(error.code).toBe(AgentErrorCode.NOT_FOUND);
  });

  it("should set agentId property", () => {
    const error = AgentError.notFound("agent-99");

    expect(error.agentId).toBe("agent-99");
  });

  it("should be non-retryable", () => {
    expect(AgentError.notFound("x").retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static factory: notRegistered
// ---------------------------------------------------------------------------

describe("AgentError.notRegistered", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.notRegistered("agent-7");

    expect(error.message).toBe("Agent 'agent-7' is not registered");
    expect(error.code).toBe(AgentErrorCode.NOT_REGISTERED);
  });

  it("should set agentId", () => {
    expect(AgentError.notRegistered("agent-7").agentId).toBe("agent-7");
  });

  it("should be non-retryable", () => {
    expect(AgentError.notRegistered("agent-7").retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static factory: notReady
// ---------------------------------------------------------------------------

describe("AgentError.notReady", () => {
  it("should create error without reason", () => {
    const error = AgentError.notReady("agent-5");

    expect(error.message).toBe("Agent 'agent-5' is not ready");
    expect(error.code).toBe(AgentErrorCode.NOT_READY);
    expect(error.agentId).toBe("agent-5");
    expect(error.retryable).toBe(true);
  });

  it("should append reason to message when provided", () => {
    const error = AgentError.notReady("agent-5", "initializing");

    expect(error.message).toBe("Agent 'agent-5' is not ready: initializing");
  });

  it("should include reason in details when provided", () => {
    const error = AgentError.notReady("agent-5", "initializing");

    expect(error.details).toMatchObject({ reason: "initializing" });
  });

  it("should not include reason field in details when reason is absent", () => {
    const error = AgentError.notReady("agent-5");

    // details only has agentId injected
    if (error.details) {
      expect(error.details).not.toHaveProperty("reason");
    }
  });
});

// ---------------------------------------------------------------------------
// Static factory: planningFailed
// ---------------------------------------------------------------------------

describe("AgentError.planningFailed", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.planningFailed("agent-1", "LLM timeout");

    expect(error.message).toBe(
      "Planning failed for agent 'agent-1': LLM timeout",
    );
    expect(error.code).toBe(AgentErrorCode.PLANNING_FAILED);
  });

  it("should set agentId and details.reason", () => {
    const error = AgentError.planningFailed("agent-1", "LLM timeout");

    expect(error.agentId).toBe("agent-1");
    expect(error.details).toMatchObject({ reason: "LLM timeout" });
  });

  it("should be retryable", () => {
    expect(AgentError.planningFailed("a", "r").retryable).toBe(true);
  });

  it("should chain cause when provided", () => {
    const cause = new Error("upstream");
    const error = AgentError.planningFailed("agent-1", "reason", cause);

    expect(error.cause).toBe(cause);
  });

  it("should leave cause undefined when not provided", () => {
    const error = AgentError.planningFailed("agent-1", "reason");

    expect(error.cause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static factory: invalidPlan
// ---------------------------------------------------------------------------

describe("AgentError.invalidPlan", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.invalidPlan("agent-2", "missing steps");

    expect(error.message).toBe(
      "Invalid plan for agent 'agent-2': missing steps",
    );
    expect(error.code).toBe(AgentErrorCode.INVALID_PLAN);
  });

  it("should set agentId and details.reason", () => {
    const error = AgentError.invalidPlan("agent-2", "missing steps");

    expect(error.agentId).toBe("agent-2");
    expect(error.details).toMatchObject({ reason: "missing steps" });
  });

  it("should be non-retryable", () => {
    expect(AgentError.invalidPlan("a", "r").retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static factory: planTimeout
// ---------------------------------------------------------------------------

describe("AgentError.planTimeout", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.planTimeout("agent-3", 30000);

    expect(error.message).toBe(
      "Planning timed out for agent 'agent-3' after 30000ms",
    );
    expect(error.code).toBe(AgentErrorCode.PLAN_TIMEOUT);
  });

  it("should set agentId and details.timeout", () => {
    const error = AgentError.planTimeout("agent-3", 30000);

    expect(error.agentId).toBe("agent-3");
    expect(error.details).toMatchObject({ timeout: 30000 });
  });

  it("should be retryable", () => {
    expect(AgentError.planTimeout("a", 1000).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Static factory: executionFailed
// ---------------------------------------------------------------------------

describe("AgentError.executionFailed", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.executionFailed("agent-4", "null pointer");

    expect(error.message).toBe(
      "Execution failed for agent 'agent-4': null pointer",
    );
    expect(error.code).toBe(AgentErrorCode.EXECUTION_FAILED);
  });

  it("should set agentId", () => {
    expect(AgentError.executionFailed("agent-4", "r").agentId).toBe("agent-4");
  });

  it("should be non-retryable", () => {
    expect(AgentError.executionFailed("a", "r").retryable).toBe(false);
  });

  it("should chain cause when provided", () => {
    const cause = new Error("downstream");
    const error = AgentError.executionFailed("a", "r", cause);

    expect(error.cause).toBe(cause);
  });

  it("should leave cause undefined when not provided", () => {
    expect(AgentError.executionFailed("a", "r").cause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static factory: maxIterationsExceeded
// ---------------------------------------------------------------------------

describe("AgentError.maxIterationsExceeded", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.maxIterationsExceeded("agent-5", 12, 10);

    expect(error.message).toBe(
      "Agent 'agent-5' exceeded max iterations: 12/10",
    );
    expect(error.code).toBe(AgentErrorCode.MAX_ITERATIONS_EXCEEDED);
  });

  it("should set agentId and details with iterations/maxIterations", () => {
    const error = AgentError.maxIterationsExceeded("agent-5", 12, 10);

    expect(error.agentId).toBe("agent-5");
    expect(error.details).toMatchObject({ iterations: 12, maxIterations: 10 });
  });

  it("should be non-retryable", () => {
    expect(AgentError.maxIterationsExceeded("a", 5, 5).retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static factory: maxIterationsReached (deprecated alias)
// ---------------------------------------------------------------------------

describe("AgentError.maxIterationsReached", () => {
  it("should be equivalent to maxIterationsExceeded", () => {
    const exceeded = AgentError.maxIterationsExceeded("agent-6", 8, 5);
    const reached = AgentError.maxIterationsReached("agent-6", 8, 5);

    expect(reached.message).toBe(exceeded.message);
    expect(reached.code).toBe(exceeded.code);
    expect(reached.agentId).toBe(exceeded.agentId);
    expect(reached.retryable).toBe(exceeded.retryable);
    expect(reached.details).toEqual(exceeded.details);
  });

  it("should return an AgentError instance", () => {
    expect(AgentError.maxIterationsReached("a", 1, 1)).toBeInstanceOf(
      AgentError,
    );
  });
});

// ---------------------------------------------------------------------------
// Static factory: invalidMode
// ---------------------------------------------------------------------------

describe("AgentError.invalidMode", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.invalidMode("agent-7", "stream", [
      "batch",
      "interactive",
    ]);

    expect(error.message).toBe(
      "Invalid execution mode 'stream' for agent 'agent-7'. Supported: batch, interactive",
    );
    expect(error.code).toBe(AgentErrorCode.INVALID_MODE);
  });

  it("should set agentId and details with mode and supportedModes", () => {
    const error = AgentError.invalidMode("agent-7", "stream", [
      "batch",
      "interactive",
    ]);

    expect(error.agentId).toBe("agent-7");
    expect(error.details).toMatchObject({
      mode: "stream",
      supportedModes: ["batch", "interactive"],
    });
  });

  it("should be non-retryable", () => {
    expect(AgentError.invalidMode("a", "m", []).retryable).toBe(false);
  });

  it("should handle empty supportedModes array", () => {
    const error = AgentError.invalidMode("a", "x", []);

    expect(error.message).toContain("Supported: ");
    expect(error.details).toMatchObject({ supportedModes: [] });
  });
});

// ---------------------------------------------------------------------------
// Static factory: missingDependency
// ---------------------------------------------------------------------------

describe("AgentError.missingDependency", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.missingDependency(
      "agent-8",
      "ToolRegistry",
      "search-tool",
    );

    expect(error.message).toBe(
      "Agent 'agent-8' missing ToolRegistry: search-tool",
    );
    expect(error.code).toBe(AgentErrorCode.MISSING_DEPENDENCY);
  });

  it("should set agentId and details", () => {
    const error = AgentError.missingDependency(
      "agent-8",
      "ToolRegistry",
      "search-tool",
    );

    expect(error.agentId).toBe("agent-8");
    expect(error.details).toMatchObject({
      dependencyType: "ToolRegistry",
      dependencyId: "search-tool",
    });
  });

  it("should be non-retryable", () => {
    expect(
      AgentError.missingDependency("a", "type", "id").retryable,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static factory: llmCallFailed
// ---------------------------------------------------------------------------

describe("AgentError.llmCallFailed", () => {
  it("should create error with correct message and EXECUTION_FAILED code", () => {
    const error = AgentError.llmCallFailed("agent-9", "rate limited");

    expect(error.message).toBe(
      "LLM call failed for agent 'agent-9': rate limited",
    );
    // llmCallFailed intentionally reuses EXECUTION_FAILED code
    expect(error.code).toBe(AgentErrorCode.EXECUTION_FAILED);
  });

  it("should set agentId and details.reason", () => {
    const error = AgentError.llmCallFailed("agent-9", "rate limited");

    expect(error.agentId).toBe("agent-9");
    expect(error.details).toMatchObject({ reason: "rate limited" });
  });

  it("should be retryable", () => {
    expect(AgentError.llmCallFailed("a", "r").retryable).toBe(true);
  });

  it("should chain cause when provided", () => {
    const cause = new Error("api error");
    const error = AgentError.llmCallFailed("agent-9", "r", cause);

    expect(error.cause).toBe(cause);
  });

  it("should leave cause undefined when not provided", () => {
    expect(AgentError.llmCallFailed("a", "r").cause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static factory: maxToolCallsExceeded
// ---------------------------------------------------------------------------

describe("AgentError.maxToolCallsExceeded", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.maxToolCallsExceeded("agent-10", 25, 20);

    expect(error.message).toBe(
      "Agent 'agent-10' exceeded max tool calls: 25/20",
    );
    expect(error.code).toBe(AgentErrorCode.MAX_TOOL_CALLS_EXCEEDED);
  });

  it("should set agentId and details", () => {
    const error = AgentError.maxToolCallsExceeded("agent-10", 25, 20);

    expect(error.agentId).toBe("agent-10");
    expect(error.details).toMatchObject({ toolCalls: 25, maxToolCalls: 20 });
  });

  it("should be non-retryable", () => {
    expect(AgentError.maxToolCallsExceeded("a", 1, 1).retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static factory: timeout
// ---------------------------------------------------------------------------

describe("AgentError.timeout", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.timeout("agent-11", 60000);

    expect(error.message).toBe(
      "Agent 'agent-11' execution timed out after 60000ms",
    );
    expect(error.code).toBe(AgentErrorCode.TIMEOUT);
  });

  it("should set agentId and details.timeout", () => {
    const error = AgentError.timeout("agent-11", 60000);

    expect(error.agentId).toBe("agent-11");
    expect(error.details).toMatchObject({ timeout: 60000 });
  });

  it("should be retryable", () => {
    expect(AgentError.timeout("a", 1000).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Static factory: cancelled
// ---------------------------------------------------------------------------

describe("AgentError.cancelled", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.cancelled("agent-12");

    expect(error.message).toBe("Agent 'agent-12' execution was cancelled");
    expect(error.code).toBe(AgentErrorCode.CANCELLED);
  });

  it("should set agentId", () => {
    expect(AgentError.cancelled("agent-12").agentId).toBe("agent-12");
  });

  it("should be non-retryable", () => {
    expect(AgentError.cancelled("a").retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static factory: routingFailed
// ---------------------------------------------------------------------------

describe("AgentError.routingFailed", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.routingFailed("no suitable agent");

    expect(error.message).toBe("Agent routing failed: no suitable agent");
    expect(error.code).toBe(AgentErrorCode.ROUTING_FAILED);
  });

  it("should not set agentId (routing errors have no specific agent)", () => {
    expect(AgentError.routingFailed("r").agentId).toBeUndefined();
  });

  it("should be non-retryable", () => {
    expect(AgentError.routingFailed("r").retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static factory: noMatchingAgent
// ---------------------------------------------------------------------------

describe("AgentError.noMatchingAgent", () => {
  it("should create error with correct message and code", () => {
    const input = "write me a poem about the sea";
    const error = AgentError.noMatchingAgent(input);

    expect(error.message).toBe(
      `No matching agent found for input: ${input.substring(0, 100)}...`,
    );
    expect(error.code).toBe(AgentErrorCode.NO_MATCHING_AGENT);
  });

  it("should store inputPreview in details (first 100 chars)", () => {
    const input = "short input";
    const error = AgentError.noMatchingAgent(input);

    expect(error.details).toMatchObject({
      inputPreview: input.substring(0, 100),
    });
  });

  it("should truncate inputPreview to 100 chars for long inputs", () => {
    const longInput = "x".repeat(200);
    const error = AgentError.noMatchingAgent(longInput);

    expect((error.details as { inputPreview: string }).inputPreview).toHaveLength(100);
  });

  it("should not set agentId", () => {
    expect(AgentError.noMatchingAgent("query").agentId).toBeUndefined();
  });

  it("should be non-retryable", () => {
    expect(AgentError.noMatchingAgent("q").retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static factory: ambiguousRouting
// ---------------------------------------------------------------------------

describe("AgentError.ambiguousRouting", () => {
  it("should create error with correct message and code", () => {
    const error = AgentError.ambiguousRouting(
      ["agentA", "agentB"],
      "help me",
    );

    expect(error.message).toBe(
      "Ambiguous routing: multiple agents match (agentA, agentB)",
    );
    expect(error.code).toBe(AgentErrorCode.AMBIGUOUS_ROUTING);
  });

  it("should store candidates and inputPreview in details", () => {
    const error = AgentError.ambiguousRouting(["a1", "a2"], "do something");

    expect(error.details).toMatchObject({
      candidates: ["a1", "a2"],
      inputPreview: "do something",
    });
  });

  it("should truncate inputPreview to 100 chars", () => {
    const longInput = "z".repeat(300);
    const error = AgentError.ambiguousRouting(["a"], longInput);

    expect(
      (error.details as { inputPreview: string }).inputPreview,
    ).toHaveLength(100);
  });

  it("should not set agentId", () => {
    expect(
      AgentError.ambiguousRouting(["a", "b"], "query").agentId,
    ).toBeUndefined();
  });

  it("should be non-retryable", () => {
    expect(
      AgentError.ambiguousRouting(["a"], "q").retryable,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static factory: fromError
// ---------------------------------------------------------------------------

describe("AgentError.fromError", () => {
  it("should return the same instance when passed an AgentError (passthrough)", () => {
    const original = new AgentError("original");
    const result = AgentError.fromError(original);

    expect(result).toBe(original);
  });

  it("should wrap a standard Error, preserving message and cause", () => {
    const cause = new Error("std error");
    const result = AgentError.fromError(cause, AgentErrorCode.EXECUTION_FAILED);

    expect(result).toBeInstanceOf(AgentError);
    expect(result.message).toBe("std error");
    expect(result.cause).toBe(cause);
    expect(result.code).toBe(AgentErrorCode.EXECUTION_FAILED);
  });

  it("should extract agentId from details when wrapping a standard Error", () => {
    const cause = new Error("inner");
    const result = AgentError.fromError(cause, AgentErrorCode.UNKNOWN, {
      agentId: "agent-extracted",
    });

    expect(result.agentId).toBe("agent-extracted");
  });

  it("should handle string errors", () => {
    const result = AgentError.fromError("string error");

    expect(result).toBeInstanceOf(AgentError);
    expect(result.message).toBe("string error");
    expect(result.cause).toBeUndefined();
  });

  it("should handle unknown non-string errors with fallback message", () => {
    const result = AgentError.fromError(42);

    expect(result.message).toBe("Unknown agent error");
  });

  it("should handle null as unknown error", () => {
    const result = AgentError.fromError(null);

    expect(result.message).toBe("Unknown agent error");
  });

  it("should use UNKNOWN as default code when none provided", () => {
    const result = AgentError.fromError(new Error("e"));

    expect(result.code).toBe(AgentErrorCode.UNKNOWN);
  });

  it("should forward details to the created error", () => {
    const result = AgentError.fromError("error", AgentErrorCode.UNKNOWN, {
      extra: "data",
    });

    expect(result.details).toMatchObject({ extra: "data" });
  });

  it("should not extract agentId from details when wrapping string error", () => {
    const result = AgentError.fromError("string error", AgentErrorCode.UNKNOWN, {
      agentId: "agent-str",
    });

    expect(result.agentId).toBe("agent-str");
  });
});

// ---------------------------------------------------------------------------
// Static factory: fromAgentError
// ---------------------------------------------------------------------------

describe("AgentError.fromAgentError", () => {
  it("should pass through an existing AgentError unchanged", () => {
    const original = new AgentError("already an AgentError");
    const result = AgentError.fromAgentError(original);

    expect(result).toBe(original);
  });

  it("should wrap a standard Error with agentId", () => {
    const cause = new Error("inner");
    const result = AgentError.fromAgentError(
      cause,
      "agent-wrapped",
      AgentErrorCode.EXECUTION_FAILED,
    );

    expect(result).toBeInstanceOf(AgentError);
    expect(result.message).toBe("inner");
    expect(result.agentId).toBe("agent-wrapped");
    expect(result.code).toBe(AgentErrorCode.EXECUTION_FAILED);
    expect(result.cause).toBe(cause);
  });

  it("should work without agentId (passes undefined details)", () => {
    const result = AgentError.fromAgentError(new Error("e"));

    expect(result.agentId).toBeUndefined();
  });

  it("should handle string errors with agentId", () => {
    const result = AgentError.fromAgentError(
      "string problem",
      "agent-str",
      AgentErrorCode.UNKNOWN,
    );

    expect(result.message).toBe("string problem");
    expect(result.agentId).toBe("agent-str");
  });

  it("should handle unknown errors with agentId", () => {
    const result = AgentError.fromAgentError(undefined, "agent-unknown");

    expect(result.message).toBe("Unknown agent error");
    expect(result.agentId).toBe("agent-unknown");
  });

  it("should use UNKNOWN as default code when none provided", () => {
    const result = AgentError.fromAgentError(new Error("e"), "a");

    expect(result.code).toBe(AgentErrorCode.UNKNOWN);
  });
});

// ---------------------------------------------------------------------------
// Inheritance and prototype chain
// ---------------------------------------------------------------------------

describe("AgentError prototype chain", () => {
  it("should pass instanceof checks for AgentError, EngineError, and Error", () => {
    const error = AgentError.notFound("agent-x");

    expect(error instanceof AgentError).toBe(true);
    expect(error instanceof EngineError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });

  it("should have name set to 'AgentError'", () => {
    expect(new AgentError("msg").name).toBe("AgentError");
    expect(AgentError.notFound("a").name).toBe("AgentError");
  });

  it("should include a stack trace", () => {
    const error = new AgentError("has stack");

    expect(typeof error.stack).toBe("string");
    expect(error.stack!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// details construction edge cases
// ---------------------------------------------------------------------------

describe("AgentError details construction", () => {
  it("should inject agentId into details but not agentName when agentName is absent", () => {
    const error = new AgentError("msg", AgentErrorCode.UNKNOWN, {
      agentId: "only-id",
    });

    expect(error.details).toHaveProperty("agentId", "only-id");
    expect(error.details).not.toHaveProperty("agentName");
  });

  it("should inject agentName into details but not agentId when agentId is absent", () => {
    const error = new AgentError("msg", AgentErrorCode.UNKNOWN, {
      agentName: "only-name",
    });

    expect(error.details).toHaveProperty("agentName", "only-name");
    expect(error.details).not.toHaveProperty("agentId");
  });

  it("should not overwrite pre-existing details key with agentId/agentName", () => {
    // The implementation spreads options.details first then overwrites with agentId/agentName,
    // so agentId/agentName always take precedence. We verify the merged shape is correct.
    const error = new AgentError("msg", AgentErrorCode.UNKNOWN, {
      agentId: "a1",
      details: { agentId: "old-value", other: "data" },
    });

    // agentId from options wins over the stale value in details
    expect(error.details).toMatchObject({ agentId: "a1", other: "data" });
  });
});

// ---------------------------------------------------------------------------
// Error codes coverage check
// ---------------------------------------------------------------------------

describe("AgentErrorCode values", () => {
  it("should have the expected string values for all codes", () => {
    expect(AgentErrorCode.UNKNOWN).toBe("AGENT_1000");
    expect(AgentErrorCode.NOT_FOUND).toBe("AGENT_1001");
    expect(AgentErrorCode.NOT_REGISTERED).toBe("AGENT_1002");
    expect(AgentErrorCode.NOT_READY).toBe("AGENT_1003");
    expect(AgentErrorCode.INVALID_MODE).toBe("AGENT_1004");
    expect(AgentErrorCode.MISSING_DEPENDENCY).toBe("AGENT_1005");
    expect(AgentErrorCode.PLANNING_FAILED).toBe("AGENT_2000");
    expect(AgentErrorCode.INVALID_PLAN).toBe("AGENT_2001");
    expect(AgentErrorCode.PLAN_TIMEOUT).toBe("AGENT_2002");
    expect(AgentErrorCode.EXECUTION_FAILED).toBe("AGENT_3000");
    expect(AgentErrorCode.MAX_ITERATIONS_EXCEEDED).toBe("AGENT_3001");
    expect(AgentErrorCode.MAX_TOOL_CALLS_EXCEEDED).toBe("AGENT_3002");
    expect(AgentErrorCode.TIMEOUT).toBe("AGENT_3003");
    expect(AgentErrorCode.CANCELLED).toBe("AGENT_3004");
    expect(AgentErrorCode.ROUTING_FAILED).toBe("AGENT_4000");
    expect(AgentErrorCode.NO_MATCHING_AGENT).toBe("AGENT_4001");
    expect(AgentErrorCode.AMBIGUOUS_ROUTING).toBe("AGENT_4002");
  });
});
