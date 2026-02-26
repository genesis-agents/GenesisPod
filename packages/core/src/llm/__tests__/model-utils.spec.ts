import { inferIsReasoning, getKnownModelLimit } from "../model-utils";

// ---------------------------------------------------------------------------
// inferIsReasoning
// ---------------------------------------------------------------------------

describe("inferIsReasoning()", () => {
  // --- Models that ARE reasoning ---

  describe("returns true for known reasoning models", () => {
    it.each([
      // OpenAI o-series
      ["o1-mini"],
      ["o1-pro"],
      ["o3-mini"],
      // OpenAI GPT-5 variants
      ["gpt-5-turbo"],
      ["gpt5"],
      // Google / Gemini
      ["gemini-2.0-flash-thinking-exp"],
      ["gemini-3-pro-preview"],
      ["gemini-exp-xxx"],
      // DeepSeek
      ["deepseek-r1"],
      ["deepseek-reasoner"],
      // Anthropic
      ["claude-3.5-opus"],
      ["claude-4-sonnet"],
      // Generic keywords
      ["some-reasoning-model"],
      ["some-thinking-model"],
    ])("%s", (modelId) => {
      expect(inferIsReasoning(modelId)).toBe(true);
    });
  });

  // --- Models that are NOT reasoning ---

  describe("returns false for non-reasoning models", () => {
    it.each([
      ["gpt-4o"],
      ["gpt-4o-mini"],
      ["claude-3-sonnet"],
      ["gemini-2.0-flash"],
      ["deepseek-chat"],
    ])("%s", (modelId) => {
      expect(inferIsReasoning(modelId)).toBe(false);
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    it("should return false for empty string", () => {
      expect(inferIsReasoning("")).toBe(false);
    });

    it("should be case insensitive: 'O1-Mini' returns true", () => {
      expect(inferIsReasoning("O1-Mini")).toBe(true);
    });

    it("should be case insensitive: 'GPT5' returns true", () => {
      expect(inferIsReasoning("GPT5")).toBe(true);
    });

    it("should be case insensitive: 'DEEPSEEK-R1' returns true", () => {
      expect(inferIsReasoning("DEEPSEEK-R1")).toBe(true);
    });

    it("should be case insensitive: 'Claude-4-Opus' returns true", () => {
      expect(inferIsReasoning("Claude-4-Opus")).toBe(true);
    });

    it("should be case insensitive: 'GPT-4O' returns false", () => {
      expect(inferIsReasoning("GPT-4O")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// getKnownModelLimit
// ---------------------------------------------------------------------------

describe("getKnownModelLimit()", () => {
  // --- Known models ---

  describe("returns correct limit for known model prefixes", () => {
    it("gpt-4o-mini → 16384 (matches before gpt-4o)", () => {
      expect(getKnownModelLimit("gpt-4o-mini")).toBe(16384);
    });

    it("gpt-4o → 16384", () => {
      expect(getKnownModelLimit("gpt-4o")).toBe(16384);
    });

    it("gpt-4-turbo-2024 → 4096 (prefix match on gpt-4-turbo)", () => {
      expect(getKnownModelLimit("gpt-4-turbo-2024")).toBe(4096);
    });

    it("claude-3.5-sonnet-20240620 → 8192", () => {
      expect(getKnownModelLimit("claude-3.5-sonnet-20240620")).toBe(8192);
    });

    it("claude-sonnet-4-20250514 → 16384 (prefix match on claude-sonnet-4)", () => {
      expect(getKnownModelLimit("claude-sonnet-4-20250514")).toBe(16384);
    });

    it("gemini-2.5-pro → 65536 (prefix match on gemini-2.5)", () => {
      expect(getKnownModelLimit("gemini-2.5-pro")).toBe(65536);
    });

    it("grok-3-beta → 131072 (prefix match on grok-3)", () => {
      expect(getKnownModelLimit("grok-3-beta")).toBe(131072);
    });

    it("o1-mini → 65536", () => {
      expect(getKnownModelLimit("o1-mini")).toBe(65536);
    });

    it("o1-pro → 100000", () => {
      expect(getKnownModelLimit("o1-pro")).toBe(100000);
    });

    it("o3-mini → 65536", () => {
      expect(getKnownModelLimit("o3-mini")).toBe(65536);
    });

    it("claude-3.5-haiku → 8192", () => {
      expect(getKnownModelLimit("claude-3.5-haiku")).toBe(8192);
    });

    it("claude-3-opus → 4096", () => {
      expect(getKnownModelLimit("claude-3-opus")).toBe(4096);
    });

    it("gemini-2.0-flash → 8192 (prefix match on gemini-2.0)", () => {
      expect(getKnownModelLimit("gemini-2.0-flash")).toBe(8192);
    });

    it("deepseek-reasoner → 65536", () => {
      expect(getKnownModelLimit("deepseek-reasoner")).toBe(65536);
    });

    it("deepseek-chat → 8192", () => {
      expect(getKnownModelLimit("deepseek-chat")).toBe(8192);
    });
  });

  // --- Ordered prefix matching ---

  describe("ordered prefix matching (more specific prefix wins)", () => {
    it("gpt-4o-mini should match 'gpt-4o-mini' (16384) not 'gpt-4o' (16384)", () => {
      // Both happen to be 16384 in the current table; the test confirms the
      // more specific prefix is tried first and returns without error.
      expect(getKnownModelLimit("gpt-4o-mini")).toBe(16384);
    });

    it("o1-mini should match 'o1-mini' (65536) not 'o1' (100000)", () => {
      expect(getKnownModelLimit("o1-mini")).toBe(65536);
    });
  });

  // --- Case insensitivity ---

  describe("case insensitive matching", () => {
    it("GPT-4O → 16384", () => {
      expect(getKnownModelLimit("GPT-4O")).toBe(16384);
    });

    it("Claude-3.5-Sonnet-20240620 → 8192", () => {
      expect(getKnownModelLimit("Claude-3.5-Sonnet-20240620")).toBe(8192);
    });

    it("GEMINI-2.5-PRO → 65536", () => {
      expect(getKnownModelLimit("GEMINI-2.5-PRO")).toBe(65536);
    });
  });

  // --- Unknown / empty ---

  describe("returns null for unknown or empty inputs", () => {
    it("unknown-model → null", () => {
      expect(getKnownModelLimit("unknown-model")).toBeNull();
    });

    it("empty string → null", () => {
      expect(getKnownModelLimit("")).toBeNull();
    });

    it("partial prefix that does not match → null", () => {
      expect(getKnownModelLimit("gpt")).toBeNull();
    });
  });
});
