/**
 * F1.4 · Consistency invariant for the 17 topic-insights agent specs.
 *
 * Every spec must carry the shared persona (tone + language), role.workStyle,
 * and a safety level not weaker than the shared default. Future specs that
 * drift from these defaults break this test in CI, forcing an intentional
 * choice instead of silent divergence.
 */

import { TOPIC_INSIGHTS_AGENT_SPECS } from "..";
import {
  TOPIC_INSIGHTS_PERSONA_DEFAULTS,
  TOPIC_INSIGHTS_SAFETY_LEVEL,
  TOPIC_INSIGHTS_WORK_STYLE,
  buildPersona,
} from "../defaults";

describe("Topic Insights · agent spec defaults", () => {
  it("exposes all registered agent specs (16 core+enhancement+advanced + 1 interactions + 1 leader)", () => {
    // F1 baseline: 17 (Core 6 + Enhancement 5 + Advanced 6)
    // F2 added: +1 LEADER_INTENT_SPEC → 18
    expect(TOPIC_INSIGHTS_AGENT_SPECS.length).toBeGreaterThanOrEqual(18);
  });

  it.each(TOPIC_INSIGHTS_AGENT_SPECS.map((s) => [s.identity.role.id, s]))(
    "%s · persona.tone matches TOPIC_INSIGHTS_PERSONA_DEFAULTS",
    (_id, spec) => {
      expect(spec.identity.persona?.tone).toBe(
        TOPIC_INSIGHTS_PERSONA_DEFAULTS.tone,
      );
    },
  );

  it.each(TOPIC_INSIGHTS_AGENT_SPECS.map((s) => [s.identity.role.id, s]))(
    "%s · persona.language matches TOPIC_INSIGHTS_PERSONA_DEFAULTS",
    (_id, spec) => {
      expect(spec.identity.persona?.language).toBe(
        TOPIC_INSIGHTS_PERSONA_DEFAULTS.language,
      );
    },
  );

  it.each(TOPIC_INSIGHTS_AGENT_SPECS.map((s) => [s.identity.role.id, s]))(
    "%s · role.workStyle is structured or adaptive (F6 relaxation)",
    (_id, spec) => {
      // Most specs are structured (single-shot LLM + schema validation).
      // AG-19-LAS (LeaderAgenticSearcher) is intentionally adaptive — it runs
      // an iterative search loop, which doesn't fit the structured contract.
      // Keep the default pinned for new specs; allow "adaptive" as an opt-in.
      expect([TOPIC_INSIGHTS_WORK_STYLE, "adaptive"]).toContain(
        spec.identity.role.workStyle,
      );
    },
  );

  it.each(TOPIC_INSIGHTS_AGENT_SPECS.map((s) => [s.identity.role.id, s]))(
    "%s · provides a per-spec persona.style",
    (_id, spec) => {
      expect(spec.identity.persona?.style).toBeDefined();
      expect(
        typeof spec.identity.persona?.style === "string" &&
          spec.identity.persona.style.trim().length > 0,
      ).toBe(true);
    },
  );

  it.each(TOPIC_INSIGHTS_AGENT_SPECS.map((s) => [s.identity.role.id, s]))(
    "%s · constraints.safetyLevel is no weaker than TOPIC_INSIGHTS_SAFETY_LEVEL",
    (_id, spec) => {
      const actual = spec.identity.constraints?.safetyLevel;
      // "strict" is stricter than "standard"; "standard" matches; "permissive" is weaker.
      const allowed = new Set<typeof actual>([
        undefined,
        TOPIC_INSIGHTS_SAFETY_LEVEL,
        "strict",
      ]);
      expect(allowed.has(actual)).toBe(true);
    },
  );

  describe("buildPersona helper", () => {
    it("spreads the defaults and sets the per-spec style", () => {
      const p = buildPersona("资深顾问");
      expect(p.tone).toBe("formal");
      expect(p.language).toBe("zh-CN");
      expect(p.style).toBe("资深顾问");
    });
  });
});
