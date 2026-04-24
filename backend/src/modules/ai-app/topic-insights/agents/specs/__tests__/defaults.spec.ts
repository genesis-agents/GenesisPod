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
  it("exposes exactly 17 specs", () => {
    expect(TOPIC_INSIGHTS_AGENT_SPECS).toHaveLength(17);
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
    "%s · role.workStyle matches TOPIC_INSIGHTS_WORK_STYLE",
    (_id, spec) => {
      expect(spec.identity.role.workStyle).toBe(TOPIC_INSIGHTS_WORK_STYLE);
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
