import { SkillError } from "../skill-error";
import { EngineError } from "../base-error";
import { SkillErrorCode } from "../error-codes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Assert that a SkillError instance carries the expected base properties.
 */
function expectSkillError(
  error: SkillError,
  opts: {
    message: string;
    code: string;
    skillId?: string;
    retryable: boolean;
  },
): void {
  expect(error).toBeInstanceOf(SkillError);
  expect(error).toBeInstanceOf(EngineError);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toBe(opts.message);
  expect(error.code).toBe(opts.code);
  expect(error.skillId).toBe(opts.skillId);
  expect(error.retryable).toBe(opts.retryable);
  expect(error.name).toBe("SkillError");
  expect(error.timestamp).toBeInstanceOf(Date);
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("SkillError – constructor", () => {
  it("creates with message only, using UNKNOWN default code", () => {
    const error = new SkillError("something went wrong");

    expect(error.message).toBe("something went wrong");
    expect(error.code).toBe(SkillErrorCode.UNKNOWN);
    expect(error.skillId).toBeUndefined();
    expect(error.skillName).toBeUndefined();
    expect(error.layer).toBeUndefined();
    expect(error.retryable).toBe(false);
    expect(error.details).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it("creates with explicit code", () => {
    const error = new SkillError("test", SkillErrorCode.EXECUTION_FAILED);

    expect(error.code).toBe(SkillErrorCode.EXECUTION_FAILED);
  });

  it("stores skillId, skillName, and layer on the instance", () => {
    const error = new SkillError("test", SkillErrorCode.UNKNOWN, {
      skillId: "skill-abc",
      skillName: "My Skill",
      layer: "application",
    });

    expect(error.skillId).toBe("skill-abc");
    expect(error.skillName).toBe("My Skill");
    expect(error.layer).toBe("application");
  });

  it("merges skillId, skillName and layer into details", () => {
    const error = new SkillError("test", SkillErrorCode.UNKNOWN, {
      skillId: "s1",
      skillName: "S1",
      layer: "core",
      details: { extra: "value" },
    });

    expect(error.details).toEqual({
      extra: "value",
      skillId: "s1",
      skillName: "S1",
      layer: "core",
    });
  });

  it("does not set details when no details/skillId/skillName/layer provided", () => {
    const error = new SkillError("no details");

    expect(error.details).toBeUndefined();
  });

  it("stores cause", () => {
    const cause = new Error("root");
    const error = new SkillError("wrapped", SkillErrorCode.UNKNOWN, { cause });

    expect(error.cause).toBe(cause);
  });

  it("respects explicit retryable flag", () => {
    const retryable = new SkillError("r", SkillErrorCode.UNKNOWN, {
      retryable: true,
    });
    const notRetryable = new SkillError("n", SkillErrorCode.UNKNOWN, {
      retryable: false,
    });

    expect(retryable.retryable).toBe(true);
    expect(notRetryable.retryable).toBe(false);
  });

  it("is an instance of EngineError and Error", () => {
    const error = new SkillError("test");

    expect(error).toBeInstanceOf(EngineError);
    expect(error).toBeInstanceOf(Error);
  });

  it("sets name to SkillError", () => {
    const error = new SkillError("test");

    expect(error.name).toBe("SkillError");
  });

  it("sets timestamp to a Date", () => {
    const before = new Date();
    const error = new SkillError("test");
    const after = new Date();

    expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("only includes skillId in details when skillName and layer are absent", () => {
    const error = new SkillError("test", SkillErrorCode.UNKNOWN, {
      skillId: "only-id",
    });

    expect(error.details).toEqual({ skillId: "only-id" });
  });

  it("only includes skillName in details when skillId and layer are absent", () => {
    const error = new SkillError("test", SkillErrorCode.UNKNOWN, {
      skillName: "Only Name",
    });

    expect(error.details).toEqual({ skillName: "Only Name" });
  });
});

// ---------------------------------------------------------------------------
// Static factory: notFound
// ---------------------------------------------------------------------------

describe("SkillError.notFound", () => {
  it("produces SKILL_1001 with correct message", () => {
    const error = SkillError.notFound("skill-xyz");

    expectSkillError(error, {
      message: "Skill 'skill-xyz' not found",
      code: SkillErrorCode.NOT_FOUND,
      skillId: "skill-xyz",
      retryable: false,
    });
  });

  it("embeds skillId in details", () => {
    const error = SkillError.notFound("skill-xyz");

    expect(error.details).toEqual({ skillId: "skill-xyz" });
  });

  it("has no cause", () => {
    expect(SkillError.notFound("s").cause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static factory: notRegistered
// ---------------------------------------------------------------------------

describe("SkillError.notRegistered", () => {
  it("produces SKILL_1002 with correct message", () => {
    const error = SkillError.notRegistered("skill-reg");

    expectSkillError(error, {
      message: "Skill 'skill-reg' is not registered",
      code: SkillErrorCode.NOT_REGISTERED,
      skillId: "skill-reg",
      retryable: false,
    });
  });

  it("embeds skillId in details", () => {
    const error = SkillError.notRegistered("skill-reg");

    expect(error.details).toEqual({ skillId: "skill-reg" });
  });

  it("has no cause", () => {
    expect(SkillError.notRegistered("s").cause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static factory: preconditionFailed
// ---------------------------------------------------------------------------

describe("SkillError.preconditionFailed", () => {
  it("produces SKILL_2000 with correct message", () => {
    const error = SkillError.preconditionFailed("skill-pre", "data not ready");

    expectSkillError(error, {
      message: "Precondition failed for skill 'skill-pre': data not ready",
      code: SkillErrorCode.PRECONDITION_FAILED,
      skillId: "skill-pre",
      retryable: false,
    });
  });

  it("includes reason and skillId in details", () => {
    const error = SkillError.preconditionFailed("skill-pre", "data not ready");

    expect(error.details).toEqual({
      skillId: "skill-pre",
      reason: "data not ready",
    });
  });

  it("has no cause", () => {
    expect(
      SkillError.preconditionFailed("s", "r").cause,
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static factory: missingTool
// ---------------------------------------------------------------------------

describe("SkillError.missingTool", () => {
  it("produces SKILL_2001 with correct message", () => {
    const error = SkillError.missingTool("skill-mt", "tool-search");

    expectSkillError(error, {
      message:
        "Skill 'skill-mt' requires tool 'tool-search' which is not available",
      code: SkillErrorCode.MISSING_TOOL,
      skillId: "skill-mt",
      retryable: false,
    });
  });

  it("includes toolId and skillId in details", () => {
    const error = SkillError.missingTool("skill-mt", "tool-search");

    expect(error.details).toEqual({
      skillId: "skill-mt",
      toolId: "tool-search",
    });
  });

  it("has no cause", () => {
    expect(SkillError.missingTool("s", "t").cause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static factory: missingSkill
// ---------------------------------------------------------------------------

describe("SkillError.missingSkill", () => {
  it("produces SKILL_2002 with correct message", () => {
    const error = SkillError.missingSkill("skill-ms", "dep-skill");

    expectSkillError(error, {
      message:
        "Skill 'skill-ms' requires skill 'dep-skill' which is not available",
      code: SkillErrorCode.MISSING_SKILL,
      skillId: "skill-ms",
      retryable: false,
    });
  });

  it("includes requiredSkillId and skillId in details", () => {
    const error = SkillError.missingSkill("skill-ms", "dep-skill");

    expect(error.details).toEqual({
      skillId: "skill-ms",
      requiredSkillId: "dep-skill",
    });
  });

  it("has no cause", () => {
    expect(SkillError.missingSkill("s", "d").cause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static factory: executionFailed
// ---------------------------------------------------------------------------

describe("SkillError.executionFailed", () => {
  it("produces SKILL_3000 with correct message (no cause)", () => {
    const error = SkillError.executionFailed("skill-ef", "out of memory");

    expectSkillError(error, {
      message: "Skill 'skill-ef' execution failed: out of memory",
      code: SkillErrorCode.EXECUTION_FAILED,
      skillId: "skill-ef",
      retryable: false,
    });
    expect(error.cause).toBeUndefined();
  });

  it("attaches cause when provided", () => {
    const cause = new Error("disk full");
    const error = SkillError.executionFailed("skill-ef", "write error", cause);

    expect(error.cause).toBe(cause);
  });

  it("embeds skillId in details", () => {
    const error = SkillError.executionFailed("skill-ef", "reason");

    expect(error.details).toEqual({ skillId: "skill-ef" });
  });

  it("does NOT store reason in details (only skillId)", () => {
    const error = SkillError.executionFailed("skill-ef", "some reason");

    expect(error.details).not.toHaveProperty("reason");
  });
});

// ---------------------------------------------------------------------------
// Static factory: timeout
// ---------------------------------------------------------------------------

describe("SkillError.timeout", () => {
  it("produces SKILL_3001 with correct message", () => {
    const error = SkillError.timeout("skill-to", 5000);

    expectSkillError(error, {
      message: "Skill 'skill-to' timed out after 5000ms",
      code: SkillErrorCode.TIMEOUT,
      skillId: "skill-to",
      retryable: true,
    });
  });

  it("is retryable", () => {
    expect(SkillError.timeout("s", 1000).retryable).toBe(true);
  });

  it("includes timeout and skillId in details", () => {
    const error = SkillError.timeout("skill-to", 3000);

    expect(error.details).toEqual({
      skillId: "skill-to",
      timeout: 3000,
    });
  });

  it("has no cause", () => {
    expect(SkillError.timeout("s", 100).cause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static factory: cancelled
// ---------------------------------------------------------------------------

describe("SkillError.cancelled", () => {
  it("produces SKILL_3002 with correct message", () => {
    const error = SkillError.cancelled("skill-can");

    expectSkillError(error, {
      message: "Skill 'skill-can' execution was cancelled",
      code: SkillErrorCode.CANCELLED,
      skillId: "skill-can",
      retryable: false,
    });
  });

  it("embeds skillId in details", () => {
    const error = SkillError.cancelled("skill-can");

    expect(error.details).toEqual({ skillId: "skill-can" });
  });

  it("has no cause", () => {
    expect(SkillError.cancelled("s").cause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static factory: fallbackFailed
// ---------------------------------------------------------------------------

describe("SkillError.fallbackFailed", () => {
  it("produces SKILL_3003 with correct message (no cause)", () => {
    const error = SkillError.fallbackFailed("skill-fb", "fallback-skill");

    expectSkillError(error, {
      message:
        "Fallback skill 'fallback-skill' for 'skill-fb' also failed",
      code: SkillErrorCode.FALLBACK_FAILED,
      skillId: "skill-fb",
      retryable: false,
    });
    expect(error.cause).toBeUndefined();
  });

  it("attaches cause when provided", () => {
    const cause = new Error("fallback crash");
    const error = SkillError.fallbackFailed(
      "skill-fb",
      "fallback-skill",
      cause,
    );

    expect(error.cause).toBe(cause);
  });

  it("includes fallbackId and skillId in details", () => {
    const error = SkillError.fallbackFailed("skill-fb", "fallback-skill");

    expect(error.details).toEqual({
      skillId: "skill-fb",
      fallbackId: "fallback-skill",
    });
  });
});

// ---------------------------------------------------------------------------
// Static factory: compositionFailed
// ---------------------------------------------------------------------------

describe("SkillError.compositionFailed", () => {
  it("produces SKILL_4000 with correct message", () => {
    const error = SkillError.compositionFailed("skill-cf", "circular dep");

    expectSkillError(error, {
      message: "Skill composition failed for 'skill-cf': circular dep",
      code: SkillErrorCode.COMPOSITION_FAILED,
      skillId: "skill-cf",
      retryable: false,
    });
  });

  it("includes reason and skillId in details", () => {
    const error = SkillError.compositionFailed("skill-cf", "circular dep");

    expect(error.details).toEqual({
      skillId: "skill-cf",
      reason: "circular dep",
    });
  });

  it("has no cause", () => {
    expect(
      SkillError.compositionFailed("s", "r").cause,
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static factory: toolCallFailed
// ---------------------------------------------------------------------------

describe("SkillError.toolCallFailed", () => {
  it("produces SKILL_4001 with correct message (no cause)", () => {
    const error = SkillError.toolCallFailed("skill-tcf", "tool-web");

    expectSkillError(error, {
      message: "Tool 'tool-web' call failed in skill 'skill-tcf'",
      code: SkillErrorCode.TOOL_CALL_FAILED,
      skillId: "skill-tcf",
      retryable: false,
    });
    expect(error.cause).toBeUndefined();
  });

  it("attaches cause when provided", () => {
    const cause = new Error("HTTP 500");
    const error = SkillError.toolCallFailed("skill-tcf", "tool-web", cause);

    expect(error.cause).toBe(cause);
  });

  it("includes toolId and skillId in details", () => {
    const error = SkillError.toolCallFailed("skill-tcf", "tool-web");

    expect(error.details).toEqual({
      skillId: "skill-tcf",
      toolId: "tool-web",
    });
  });
});

// ---------------------------------------------------------------------------
// Static factory: llmCallFailed
// ---------------------------------------------------------------------------

describe("SkillError.llmCallFailed", () => {
  it("produces SKILL_4002 with correct message (no cause)", () => {
    const error = SkillError.llmCallFailed("skill-llm");

    expectSkillError(error, {
      message: "LLM call failed in skill 'skill-llm'",
      code: SkillErrorCode.LLM_CALL_FAILED,
      skillId: "skill-llm",
      retryable: true,
    });
    expect(error.cause).toBeUndefined();
  });

  it("is retryable", () => {
    expect(SkillError.llmCallFailed("s").retryable).toBe(true);
  });

  it("attaches cause when provided", () => {
    const cause = new Error("context too long");
    const error = SkillError.llmCallFailed("skill-llm", cause);

    expect(error.cause).toBe(cause);
  });

  it("embeds skillId in details", () => {
    const error = SkillError.llmCallFailed("skill-llm");

    expect(error.details).toEqual({ skillId: "skill-llm" });
  });
});

// ---------------------------------------------------------------------------
// Static factory: fromError
// ---------------------------------------------------------------------------

describe("SkillError.fromError", () => {
  describe("passthrough: SkillError instance", () => {
    it("returns the same SkillError instance unchanged", () => {
      const original = SkillError.notFound("skill-orig");
      const result = SkillError.fromError(original);

      expect(result).toBe(original);
    });

    it("returns the same instance even when code and details are provided", () => {
      const original = SkillError.cancelled("skill-orig");
      const result = SkillError.fromError(
        original,
        SkillErrorCode.EXECUTION_FAILED,
        { extra: "info" },
      );

      expect(result).toBe(original);
    });
  });

  describe("wrapping: standard Error", () => {
    it("wraps a plain Error, using its message", () => {
      const raw = new Error("network failure");
      const result = SkillError.fromError(raw, SkillErrorCode.EXECUTION_FAILED);

      expect(result).toBeInstanceOf(SkillError);
      expect(result.message).toBe("network failure");
      expect(result.code).toBe(SkillErrorCode.EXECUTION_FAILED);
      expect(result.cause).toBe(raw);
    });

    it("uses UNKNOWN code when none provided", () => {
      const raw = new Error("oops");
      const result = SkillError.fromError(raw);

      expect(result.code).toBe(SkillErrorCode.UNKNOWN);
    });

    it("extracts skillId from details", () => {
      const raw = new Error("oops");
      const result = SkillError.fromError(raw, SkillErrorCode.UNKNOWN, {
        skillId: "skill-from-details",
      });

      expect(result.skillId).toBe("skill-from-details");
    });

    it("stores provided details on the resulting error", () => {
      const raw = new Error("oops");
      const result = SkillError.fromError(raw, SkillErrorCode.UNKNOWN, {
        extra: "meta",
        skillId: "skill-det",
      });

      expect(result.details).toMatchObject({ extra: "meta" });
    });
  });

  describe("string error", () => {
    it("uses string as message", () => {
      const result = SkillError.fromError("string error message");

      expect(result).toBeInstanceOf(SkillError);
      expect(result.message).toBe("string error message");
      expect(result.cause).toBeUndefined();
    });

    it("uses provided code for string error", () => {
      const result = SkillError.fromError(
        "bad state",
        SkillErrorCode.PRECONDITION_FAILED,
      );

      expect(result.code).toBe(SkillErrorCode.PRECONDITION_FAILED);
    });
  });

  describe("unknown error", () => {
    it("falls back to 'Unknown skill error' for non-string, non-Error input", () => {
      const result = SkillError.fromError(42);

      expect(result).toBeInstanceOf(SkillError);
      expect(result.message).toBe("Unknown skill error");
    });

    it("handles null", () => {
      const result = SkillError.fromError(null);

      expect(result.message).toBe("Unknown skill error");
    });

    it("handles object", () => {
      const result = SkillError.fromError({ code: 500 });

      expect(result.message).toBe("Unknown skill error");
    });

    it("uses provided code for unknown input", () => {
      const result = SkillError.fromError(
        undefined,
        SkillErrorCode.EXECUTION_FAILED,
      );

      expect(result.code).toBe(SkillErrorCode.EXECUTION_FAILED);
    });
  });
});

// ---------------------------------------------------------------------------
// Static factory: fromSkillError
// ---------------------------------------------------------------------------

describe("SkillError.fromSkillError", () => {
  it("passes through an existing SkillError unchanged", () => {
    const original = SkillError.notFound("skill-pass");
    const result = SkillError.fromSkillError(original);

    expect(result).toBe(original);
  });

  it("wraps a plain Error and injects skillId from the argument", () => {
    const raw = new Error("timeout at network level");
    const result = SkillError.fromSkillError(
      raw,
      "skill-injected",
      SkillErrorCode.TIMEOUT,
    );

    expect(result).toBeInstanceOf(SkillError);
    expect(result.message).toBe("timeout at network level");
    expect(result.code).toBe(SkillErrorCode.TIMEOUT);
    expect(result.skillId).toBe("skill-injected");
    expect(result.cause).toBe(raw);
  });

  it("wraps a string and injects skillId", () => {
    const result = SkillError.fromSkillError(
      "something broke",
      "skill-str",
    );

    expect(result.message).toBe("something broke");
    expect(result.skillId).toBe("skill-str");
    expect(result.code).toBe(SkillErrorCode.UNKNOWN);
  });

  it("uses UNKNOWN code when no code argument provided", () => {
    const result = SkillError.fromSkillError(new Error("x"), "skill-y");

    expect(result.code).toBe(SkillErrorCode.UNKNOWN);
  });

  it("works without a skillId argument", () => {
    const raw = new Error("no skill id");
    const result = SkillError.fromSkillError(raw);

    expect(result.skillId).toBeUndefined();
    expect(result.cause).toBe(raw);
  });

  it("handles unknown input without skillId", () => {
    const result = SkillError.fromSkillError(99);

    expect(result.message).toBe("Unknown skill error");
    expect(result.skillId).toBeUndefined();
  });

  it("handles unknown input with skillId", () => {
    const result = SkillError.fromSkillError(
      { weird: true },
      "skill-weird",
      SkillErrorCode.EXECUTION_FAILED,
    );

    expect(result.message).toBe("Unknown skill error");
    expect(result.skillId).toBe("skill-weird");
    expect(result.code).toBe(SkillErrorCode.EXECUTION_FAILED);
  });
});

// ---------------------------------------------------------------------------
// EngineError integration: inherited behaviour
// ---------------------------------------------------------------------------

describe("SkillError – inherited EngineError behaviour", () => {
  describe("toJSON", () => {
    it("serialises all base fields", () => {
      const error = SkillError.notFound("skill-json");
      const json = error.toJSON();

      expect(json.name).toBe("SkillError");
      expect(json.code).toBe(SkillErrorCode.NOT_FOUND);
      expect(json.message).toBe("Skill 'skill-json' not found");
      expect(json.retryable).toBe(false);
      expect(typeof json.timestamp).toBe("string");
    });

    it("includes details when present", () => {
      const error = SkillError.missingTool("skill-t", "tool-t");
      const json = error.toJSON();

      expect(json.details).toEqual({ skillId: "skill-t", toolId: "tool-t" });
    });

    it("includes cause summary when cause is present", () => {
      const cause = new Error("root cause message");
      const error = SkillError.executionFailed("skill-c", "reason", cause);
      const json = error.toJSON();

      expect(json.cause).toEqual({
        name: "Error",
        message: "root cause message",
      });
    });

    it("omits cause when no cause is set", () => {
      const error = SkillError.notFound("skill-nc");
      const json = error.toJSON();

      expect(json).not.toHaveProperty("cause");
    });

    it("omits details when not set", () => {
      // executionFailed with no extra details beyond skillId
      const error = new SkillError("bare error");
      const json = error.toJSON();

      expect(json).not.toHaveProperty("details");
    });
  });

  describe("toResponse", () => {
    it("returns a user-friendly response object", () => {
      const error = SkillError.timeout("skill-resp", 2000);
      const response = error.toResponse();

      expect(response.error.code).toBe(SkillErrorCode.TIMEOUT);
      expect(typeof response.error.message).toBe("string");
    });

    it("includes details in response when present", () => {
      const error = SkillError.missingSkill("skill-r", "dep-r");
      const response = error.toResponse();

      expect(response.error.details).toEqual({
        skillId: "skill-r",
        requiredSkillId: "dep-r",
      });
    });
  });

  describe("getFullMessage", () => {
    it("formats code, message, and cause", () => {
      const cause = new Error("network down");
      const error = SkillError.executionFailed("skill-gfm", "io error", cause);
      const full = error.getFullMessage();

      expect(full).toContain(SkillErrorCode.EXECUTION_FAILED);
      expect(full).toContain("io error");
      expect(full).toContain("network down");
    });

    it("formats code, message and details when no cause", () => {
      const error = SkillError.preconditionFailed("skill-gfm2", "no token");
      const full = error.getFullMessage();

      expect(full).toContain(SkillErrorCode.PRECONDITION_FAILED);
      expect(full).toContain("no token");
      expect(full).toContain("skillId");
    });
  });
});

// ---------------------------------------------------------------------------
// Error code constants sanity-check
// ---------------------------------------------------------------------------

describe("SkillErrorCode constants", () => {
  it("NOT_FOUND is SKILL_1001", () => {
    expect(SkillErrorCode.NOT_FOUND).toBe("SKILL_1001");
  });

  it("NOT_REGISTERED is SKILL_1002", () => {
    expect(SkillErrorCode.NOT_REGISTERED).toBe("SKILL_1002");
  });

  it("PRECONDITION_FAILED is SKILL_2000", () => {
    expect(SkillErrorCode.PRECONDITION_FAILED).toBe("SKILL_2000");
  });

  it("MISSING_TOOL is SKILL_2001", () => {
    expect(SkillErrorCode.MISSING_TOOL).toBe("SKILL_2001");
  });

  it("MISSING_SKILL is SKILL_2002", () => {
    expect(SkillErrorCode.MISSING_SKILL).toBe("SKILL_2002");
  });

  it("EXECUTION_FAILED is SKILL_3000", () => {
    expect(SkillErrorCode.EXECUTION_FAILED).toBe("SKILL_3000");
  });

  it("TIMEOUT is SKILL_3001", () => {
    expect(SkillErrorCode.TIMEOUT).toBe("SKILL_3001");
  });

  it("CANCELLED is SKILL_3002", () => {
    expect(SkillErrorCode.CANCELLED).toBe("SKILL_3002");
  });

  it("FALLBACK_FAILED is SKILL_3003", () => {
    expect(SkillErrorCode.FALLBACK_FAILED).toBe("SKILL_3003");
  });

  it("COMPOSITION_FAILED is SKILL_4000", () => {
    expect(SkillErrorCode.COMPOSITION_FAILED).toBe("SKILL_4000");
  });

  it("TOOL_CALL_FAILED is SKILL_4001", () => {
    expect(SkillErrorCode.TOOL_CALL_FAILED).toBe("SKILL_4001");
  });

  it("LLM_CALL_FAILED is SKILL_4002", () => {
    expect(SkillErrorCode.LLM_CALL_FAILED).toBe("SKILL_4002");
  });
});
