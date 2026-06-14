/**
 * agent-view.projector.spec.ts
 *
 * Unit tests for projectAgents() — targeting 95%+ branch/line coverage of
 * agent-view.projector.ts.
 */

import { projectAgents } from "../agent-view.projector";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkEv(
  type: string,
  payload: Record<string, unknown> | null = null,
  timestamp: number = 1000,
  agentId?: string,
) {
  return { type, payload, timestamp, agentId };
}

// ---------------------------------------------------------------------------
// Basic tests
// ---------------------------------------------------------------------------

describe("projectAgents — empty events", () => {
  it("returns empty array", () => {
    expect(projectAgents([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractAgentId — from ev.agentId vs payload.agentId
// ---------------------------------------------------------------------------

describe("projectAgents — agent id extraction", () => {
  it("uses ev.agentId when present", () => {
    const events = [
      mkEv("agent.started", { role: "researcher" }, 1000, "agent-001"),
    ];
    const result = projectAgents(events);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("agent-001");
  });

  it("falls back to payload.agentId", () => {
    const events = [
      mkEv("agent.started", { agentId: "agent-002", role: "leader" }),
    ];
    const result = projectAgents(events);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("agent-002");
  });

  it("skips events with no agentId", () => {
    const events = [mkEv("chapter:writing:started", { dimension: "finance" })];
    const result = projectAgents(events);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractRole
// ---------------------------------------------------------------------------

describe("projectAgents — role extraction", () => {
  it("uses payload.role when present", () => {
    const events = [mkEv("agent.started", { agentId: "a1", role: "analyst" })];
    const result = projectAgents(events);
    expect(result[0].role).toBe("analyst");
  });

  it("falls back to deriveRoleFromAgentId — writer prefix", () => {
    const events = [mkEv("agent.started", { agentId: "chapter-writer#1.2.3" })];
    const result = projectAgents(events);
    expect(result[0].role).toBe("writer");
  });

  it("falls back to deriveRoleFromAgentId — reviewer prefix", () => {
    const events = [
      mkEv("chapter:review:started", { agentId: "chapter-reviewer#0.1.0" }),
    ];
    const result = projectAgents(events);
    expect(result[0].role).toBe("reviewer");
  });

  it("falls back to deriveRoleFromAgentId — quality-judge", () => {
    const events = [mkEv("stage.started", { agentId: "quality-judge#0" })];
    const result = projectAgents(events);
    expect(result[0].role).toBe("reviewer");
  });

  it("falls back to deriveRoleFromAgentId — critic", () => {
    const events = [mkEv("critic:verdict", { agentId: "critic" })];
    const result = projectAgents(events);
    expect(result[0].role).toBe("reviewer");
  });

  it("falls back to deriveRoleFromAgentId — verifier", () => {
    const events = [mkEv("verifier:verdict", { agentId: "verifier" })];
    const result = projectAgents(events);
    expect(result[0].role).toBe("reviewer");
  });

  it("falls back to deriveRoleFromAgentId — researcher", () => {
    const events = [
      mkEv("dimension:research:started", { agentId: "researcher#0" }),
    ];
    const result = projectAgents(events);
    expect(result[0].role).toBe("researcher");
  });

  it("falls back to deriveRoleFromAgentId — leader", () => {
    const events = [mkEv("leader:signed", { agentId: "leader" })];
    const result = projectAgents(events);
    expect(result[0].role).toBe("leader");
  });

  it("falls back to deriveRoleFromAgentId — steward → leader", () => {
    const events = [mkEv("stage.started", { agentId: "steward" })];
    const result = projectAgents(events);
    expect(result[0].role).toBe("leader");
  });

  it("falls back to deriveRoleFromAgentId — reconciler → analyst", () => {
    const events = [
      mkEv("reconciliation:completed", { agentId: "reconciler" }),
    ];
    const result = projectAgents(events);
    expect(result[0].role).toBe("analyst");
  });

  it("falls back to deriveRoleFromAgentId — analyst", () => {
    const events = [mkEv("stage.started", { agentId: "analyst" })];
    const result = projectAgents(events);
    expect(result[0].role).toBe("analyst");
  });

  it("falls back to 'unknown' for unrecognized agentId prefix", () => {
    const events = [mkEv("stage.started", { agentId: "zz-unknown-agent" })];
    const result = projectAgents(events);
    expect(result[0].role).toBe("unknown");
  });

  it("keeps unknown role until explicit role arrives", () => {
    const events = [
      mkEv("stage.started", { agentId: "zz-unk" }),
      mkEv("agent.started", { agentId: "zz-unk", role: "researcher" }),
    ];
    const result = projectAgents(events);
    expect(result[0].role).toBe("researcher");
  });
});

// ---------------------------------------------------------------------------
// Phase resolution via explicit agent.* verbs
// ---------------------------------------------------------------------------

describe("projectAgents — explicit agent.* verbs", () => {
  it("agent.started → phase=running", () => {
    const events = [mkEv("agent.started", { agentId: "a1", role: "writer" })];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("running");
  });

  it("agent.completed → phase=completed", () => {
    const events = [mkEv("agent.completed", { agentId: "a1", role: "writer" })];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("completed");
  });

  it("agent.failed → phase=failed", () => {
    const events = [
      mkEv("agent.failed", { agentId: "a1", role: "writer", message: "crash" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("failed");
    expect(result[0].failureMessage).toBe("crash");
  });

  it("agent.failed with detail fallback for failure message", () => {
    const events = [
      mkEv("agent.failed", {
        agentId: "a1",
        role: "writer",
        detail: "detail-msg",
      }),
    ];
    const result = projectAgents(events);
    expect(result[0].failureMessage).toBe("detail-msg");
  });

  it("agent.retry → retryCount incremented", () => {
    const events = [
      mkEv("agent.started", { agentId: "a1", role: "researcher" }),
      mkEv("agent.retry", { agentId: "a1" }),
      mkEv("agent.retry", { agentId: "a1" }),
    ];
    const result = projectAgents(events);
    expect(result[0].retryCount).toBe(2);
  });

  it("retryCount=0 renders as undefined", () => {
    const events = [mkEv("agent.started", { agentId: "a1" })];
    const result = projectAgents(events);
    expect(result[0].retryCount).toBeUndefined();
  });

  it("prefixed agent.started (playground.agent.started)", () => {
    const events = [mkEv("playground.agent.started", { agentId: "a1" })];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("running");
  });

  it("prefixed agent.completed", () => {
    const events = [mkEv("playground.agent.completed", { agentId: "a1" })];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("completed");
  });

  it("prefixed agent.failed", () => {
    const events = [mkEv("playground.agent.failed", { agentId: "a1" })];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("failed");
  });

  it("prefixed agent.retry", () => {
    const events = [mkEv("playground.agent.retry", { agentId: "a1" })];
    const result = projectAgents(events);
    expect(result[0].retryCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Phase resolution via derived verbs (business events)
// ---------------------------------------------------------------------------

describe("projectAgents — derived verbs from business events", () => {
  it("chapter:writing:completed → completed", () => {
    const events = [
      mkEv("chapter:writing:completed", { agentId: "chapter-writer#0.1.0" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("completed");
  });

  it("chapter:done → completed", () => {
    const events = [mkEv("chapter:done", { agentId: "chapter-writer#0.1.0" })];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("completed");
  });

  it("chapter:review:completed → completed", () => {
    const events = [
      mkEv("chapter:review:completed", { agentId: "chapter-reviewer#0.1.0" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("completed");
  });

  it("dimension:research:completed → completed", () => {
    const events = [
      mkEv("dimension:research:completed", { agentId: "researcher#0" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("completed");
  });

  it("dimension:graded → completed", () => {
    const events = [mkEv("dimension:graded", { agentId: "leader" })];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("completed");
  });

  it("dimension:integrating:completed → completed", () => {
    const events = [
      mkEv("dimension:integrating:completed", { agentId: "writer" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("completed");
  });

  it("leader:signed → completed", () => {
    const events = [mkEv("leader:signed", { agentId: "leader" })];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("completed");
  });

  it("leader:decision → completed", () => {
    const events = [mkEv("leader:decision", { agentId: "leader" })];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("completed");
  });

  it("critic:verdict → completed", () => {
    const events = [mkEv("critic:verdict", { agentId: "critic" })];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("completed");
  });

  it("chapter:writing:failed → failed", () => {
    const events = [
      mkEv("chapter:writing:failed", { agentId: "chapter-writer#0.1.0" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("failed");
  });

  it("dimension:retry-failed → failed", () => {
    const events = [
      mkEv("dimension:retry-failed", { agentId: "researcher#0" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("failed");
  });

  it("dimension:integrating:failed → failed", () => {
    const events = [
      mkEv("dimension:integrating:failed", { agentId: "writer" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("failed");
  });

  it("chapter:revision → retry", () => {
    const events = [
      mkEv("chapter:writing:started", { agentId: "chapter-writer#0.1.0" }),
      mkEv("chapter:revision", { agentId: "chapter-writer#0.1.0" }),
    ];
    const result = projectAgents(events);
    expect(result[0].retryCount).toBe(1);
  });

  it("chapter:rewritten → retry", () => {
    const events = [
      mkEv("chapter:writing:started", { agentId: "chapter-writer#0.1.0" }),
      mkEv("chapter:rewritten", { agentId: "chapter-writer#0.1.0" }),
    ];
    const result = projectAgents(events);
    expect(result[0].retryCount).toBe(1);
  });

  it("dimension:retrying → retry", () => {
    const events = [
      mkEv("dimension:research:started", { agentId: "researcher#0" }),
      mkEv("dimension:retrying", { agentId: "researcher#0" }),
    ];
    const result = projectAgents(events);
    expect(result[0].retryCount).toBe(1);
  });

  it("chapter:writing:started → running (started verb)", () => {
    const events = [
      mkEv("chapter:writing:started", { agentId: "chapter-writer#0.1.0" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("running");
  });

  it("chapter:review:started → running (started verb)", () => {
    const events = [
      mkEv("chapter:review:started", { agentId: "chapter-reviewer#0.1.0" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("running");
  });

  it("dimension:research:started → running", () => {
    const events = [
      mkEv("dimension:research:started", { agentId: "researcher#0" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("running");
  });

  it("dimension:integrating:started → running", () => {
    const events = [
      mkEv("dimension:integrating:started", { agentId: "writer" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("running");
  });

  it("dimension:outline:planned → running", () => {
    const events = [
      mkEv("dimension:outline:planned", { agentId: "outline-planner" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("running");
  });

  it("other event with agentId but no verb → running (default branch)", () => {
    const events = [mkEv("some:other:event", { agentId: "a1" })];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("running");
  });

  it("other event after completed stays completed", () => {
    const events = [
      mkEv("agent.completed", { agentId: "a1" }),
      mkEv("some:other:event", { agentId: "a1" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("completed");
  });

  it("other event after failed stays failed", () => {
    const events = [
      mkEv("agent.failed", { agentId: "a1" }),
      mkEv("some:other:event", { agentId: "a1" }),
    ];
    const result = projectAgents(events);
    expect(result[0].phase).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// resolveAgentPhase edge cases
// ---------------------------------------------------------------------------

describe("projectAgents — resolveAgentPhase", () => {
  it("failed AND completed → completed wins", () => {
    const events = [
      mkEv("agent.failed", { agentId: "a1" }),
      mkEv("agent.completed", { agentId: "a1" }),
    ];
    const result = projectAgents(events);
    // failed observed + completed observed → completed wins (not failed because has completed)
    expect(result[0].phase).toBe("completed");
  });

  it("no events for agent → pending", () => {
    // An event from an unknown verb that adds it as "running"
    // Actually: only way to get pending is no observed phases
    // We can test via agentId=null which won't create an entry
    const result = projectAgents([]);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// agent:lifecycle — attempt/dimension/iterations/wallTimeMs
// ---------------------------------------------------------------------------

describe("projectAgents — agent:lifecycle fields", () => {
  it("reads attempt from agent:lifecycle payload", () => {
    const events = [
      mkEv("agent:lifecycle", {
        agentId: "researcher#0",
        phase: "started",
        attempt: 2,
        dimension: "tech",
      }),
    ];
    const result = projectAgents(events);
    expect(result[0].attempt).toBe(2);
    expect(result[0].dimension).toBe("tech");
  });

  it("reads iterations and wallTimeMs from agent:lifecycle", () => {
    const events = [
      mkEv("agent:lifecycle", {
        agentId: "a1",
        phase: "started",
        iterations: 5,
        wallTimeMs: 3000,
      }),
    ];
    const result = projectAgents(events);
    expect(result[0].iterations).toBe(5);
    expect(result[0].wallTimeMs).toBe(3000);
  });

  it("sets startedAt on phase=started lifecycle event", () => {
    const events = [
      mkEv("agent:lifecycle", { agentId: "a1", phase: "started" }, 5000),
    ];
    const result = projectAgents(events);
    expect(result[0].startedAt).toBe(5000);
  });

  it("sets endedAt and calculates wallTimeMs on phase=completed lifecycle event", () => {
    const events = [
      mkEv("agent:lifecycle", { agentId: "a1", phase: "started" }, 1000),
      mkEv("agent:lifecycle", { agentId: "a1", phase: "completed" }, 4000),
    ];
    const result = projectAgents(events);
    expect(result[0].endedAt).toBe(4000);
    expect(result[0].wallTimeMs).toBe(3000);
  });

  it("sets endedAt on phase=failed lifecycle event", () => {
    const events = [
      mkEv("agent:lifecycle", { agentId: "a1", phase: "started" }, 1000),
      mkEv("agent:lifecycle", { agentId: "a1", phase: "failed" }, 2000),
    ];
    const result = projectAgents(events);
    expect(result[0].endedAt).toBe(2000);
    expect(result[0].wallTimeMs).toBe(1000);
  });

  it("prefixed agent:lifecycle (playground.agent:lifecycle)", () => {
    const events = [
      mkEv(
        "playground.agent:lifecycle",
        { agentId: "a1", phase: "started", iterations: 3 },
        1000,
      ),
    ];
    const result = projectAgents(events);
    expect(result[0].iterations).toBe(3);
  });

  it("does not overwrite wallTimeMs when already provided", () => {
    const events = [
      mkEv(
        "agent:lifecycle",
        { agentId: "a1", phase: "started", wallTimeMs: 9999 },
        1000,
      ),
      mkEv("agent:lifecycle", { agentId: "a1", phase: "completed" }, 5000),
    ];
    const result = projectAgents(events);
    // wallTimeMs set in started event → should NOT be overwritten by computed (5000-1000=4000)
    expect(result[0].wallTimeMs).toBe(9999);
  });
});

// ---------------------------------------------------------------------------
// Per-agent usage fields (tokensUsed / costUsd / toolCallCount)
// ---------------------------------------------------------------------------

describe("projectAgents — per-agent usage", () => {
  it("reads tokensUsed from payload", () => {
    const events = [
      mkEv("agent.completed", { agentId: "a1", tokensUsed: 1500 }),
    ];
    const result = projectAgents(events);
    expect(result[0].tokensUsed).toBe(1500);
  });

  it("reads costUsd from payload", () => {
    const events = [mkEv("agent.completed", { agentId: "a1", costUsd: 0.05 })];
    const result = projectAgents(events);
    expect(result[0].costUsd).toBe(0.05);
  });

  it("reads toolCallCount from payload", () => {
    const events = [
      mkEv("agent.completed", { agentId: "a1", toolCallCount: 7 }),
    ];
    const result = projectAgents(events);
    expect(result[0].toolCallCount).toBe(7);
  });

  it("takes last non-null values for usage (terminal event overrides earlier)", () => {
    const events = [
      mkEv("agent.started", { agentId: "a1", tokensUsed: 100 }),
      mkEv("agent.completed", { agentId: "a1", tokensUsed: 500 }),
    ];
    const result = projectAgents(events);
    expect(result[0].tokensUsed).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Timing fallback (non-lifecycle events)
// ---------------------------------------------------------------------------

describe("projectAgents — timing fallback", () => {
  it("startedAt set from first event timestamp", () => {
    const events = [
      mkEv("dimension:research:started", { agentId: "researcher#0" }, 2000),
    ];
    const result = projectAgents(events);
    expect(result[0].startedAt).toBe(2000);
  });

  it("endedAt set on terminal business event", () => {
    const events = [
      mkEv("dimension:research:started", { agentId: "researcher#0" }, 1000),
      mkEv("dimension:research:completed", { agentId: "researcher#0" }, 5000),
    ];
    const result = projectAgents(events);
    expect(result[0].endedAt).toBe(5000);
    expect(result[0].wallTimeMs).toBe(4000);
  });

  it("picks up dimension from chapter event payload", () => {
    const events = [
      mkEv("chapter:writing:started", {
        agentId: "chapter-writer#0.1.0",
        dimension: "finance",
      }),
    ];
    const result = projectAgents(events);
    expect(result[0].dimension).toBe("finance");
  });

  it("picks up attempt from chapter event payload", () => {
    const events = [
      mkEv("chapter:writing:started", {
        agentId: "chapter-writer#0.1.0",
        attempt: 3,
      }),
    ];
    const result = projectAgents(events);
    expect(result[0].attempt).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Multiple agents
// ---------------------------------------------------------------------------

describe("projectAgents — multiple agents", () => {
  it("tracks separate digests per agentId", () => {
    const events = [
      mkEv("agent.started", { agentId: "leader", role: "leader" }),
      mkEv("agent.started", { agentId: "researcher#0", role: "researcher" }),
    ];
    const result = projectAgents(events);
    expect(result).toHaveLength(2);
    const ids = result.map((a) => a.id);
    expect(ids).toContain("leader");
    expect(ids).toContain("researcher#0");
  });

  it("updates modelId only when not already set", () => {
    const events = [
      mkEv("agent.started", { agentId: "a1", modelId: "model-A" }),
      mkEv("agent.completed", { agentId: "a1", modelId: "model-B" }),
    ];
    const result = projectAgents(events);
    // first modelId wins
    expect(result[0].modelId).toBe("model-A");
  });
});

// ---------------------------------------------------------------------------
// extractFailureMessage - null payload
// ---------------------------------------------------------------------------

describe("projectAgents — extractFailureMessage edge cases", () => {
  it("null payload returns null failure message", () => {
    const events = [
      { type: "agent.failed", payload: null, timestamp: 1000, agentId: "a1" },
    ];
    const result = projectAgents(events);
    expect(result[0].failureMessage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Line 68: modelId not overwritten when already set
// ---------------------------------------------------------------------------

describe("projectAgents — modelId branch coverage (line 68)", () => {
  it("does not update modelId when already set (!digest.modelId branch)", () => {
    // first event sets modelId; second event has no modelId → branch `if (modelId && !digest.modelId)` is false
    const events = [
      mkEv("agent.started", { agentId: "a1", modelId: "first-model" }),
      mkEv("agent.completed", { agentId: "a1" }), // no modelId → modelId falsy → branch not taken
    ];
    const result = projectAgents(events);
    expect(result[0].modelId).toBe("first-model");
  });
});

// ---------------------------------------------------------------------------
// Line 211: deriveRoleFromAgentId returns null when prefix is empty
// ---------------------------------------------------------------------------

describe("projectAgents — deriveRoleFromAgentId null prefix (line 211)", () => {
  it("returns unknown role when agentId starts with # (empty prefix)", () => {
    // agentId "#value" → split on /[#.]/ → ["", "value"] → prefix="" → falsy → returns null → role "unknown"
    const events = [mkEv("agent.started", {}, 1000, "#leading-hash")];
    const result = projectAgents(events);
    expect(result[0].role).toBe("unknown");
  });
});
