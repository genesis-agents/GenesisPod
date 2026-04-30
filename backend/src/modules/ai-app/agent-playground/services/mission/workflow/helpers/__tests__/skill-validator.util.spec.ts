import { validateSkills, VALID_SKILLS } from "../skill-validator.util";

describe("validateSkills (Phase 1, TI port)", () => {
  it("returns empty result for undefined / empty input", () => {
    expect(validateSkills(undefined)).toEqual({
      valid: [],
      invalid: [],
      changed: false,
    });
    expect(validateSkills([])).toEqual({
      valid: [],
      invalid: [],
      changed: false,
    });
  });

  it("accepts canonical valid skill IDs unchanged", () => {
    const r = validateSkills(["fact-check", "deep-dive", "swot-analysis"]);
    expect(r.valid).toEqual(["fact-check", "deep-dive", "swot-analysis"]);
    expect(r.invalid).toEqual([]);
  });

  it("normalizes underscore → hyphen", () => {
    const r = validateSkills(["fact_check", "deep_dive"]);
    expect(r.valid).toEqual(["fact-check", "deep-dive"]);
    expect(r.changed).toBe(true);
  });

  it("normalizes uppercase → lowercase", () => {
    const r = validateSkills(["FACT-CHECK", "Deep-Dive"]);
    expect(r.valid).toEqual(["fact-check", "deep-dive"]);
    expect(r.changed).toBe(true);
  });

  it("filters hallucinated skill names", () => {
    const r = validateSkills([
      "fact-check",
      "industry-decode", // 幻觉
      "advanced-analysis", // 幻觉
      "swot-analysis",
    ]);
    expect(r.valid).toEqual(["fact-check", "swot-analysis"]);
    expect(r.invalid).toEqual(["industry-decode", "advanced-analysis"]);
    expect(r.changed).toBe(true);
  });

  it("dedupes valid skills (preserves first occurrence)", () => {
    const r = validateSkills(["fact-check", "FACT-CHECK", "fact_check"]);
    expect(r.valid).toEqual(["fact-check"]);
  });

  it("trims whitespace", () => {
    const r = validateSkills(["  fact-check  ", " deep-dive"]);
    expect(r.valid).toEqual(["fact-check", "deep-dive"]);
  });

  it("ignores non-string entries", () => {
    const r = validateSkills([
      "fact-check",
      null as unknown as string,
      123 as unknown as string,
      "deep-dive",
    ]);
    expect(r.valid).toEqual(["fact-check", "deep-dive"]);
  });

  it("VALID_SKILLS contains expected core entries", () => {
    expect(VALID_SKILLS.has("fact-check")).toBe(true);
    expect(VALID_SKILLS.has("dimension-research")).toBe(true);
    expect(VALID_SKILLS.has("competitive-analysis")).toBe(true);
    expect(VALID_SKILLS.has("nonexistent-skill")).toBe(false);
  });
});
