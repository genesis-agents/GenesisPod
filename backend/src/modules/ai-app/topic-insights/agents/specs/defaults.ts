/**
 * Topic Insights · Shared agent-spec defaults.
 *
 * F1 · Defines the canonical persona / role-workStyle / safety fragments that
 * every topic-insights IAgentSpec should carry. The consistency test in
 * `__tests__/defaults.spec.ts` enforces that all 17 specs match these values.
 *
 * Usage from a spec:
 *   import { buildPersona, TOPIC_INSIGHTS_WORK_STYLE } from "./defaults";
 *   ...
 *   role:    { id: "AG-XX-YY", name: "...", description: "...", workStyle: TOPIC_INSIGHTS_WORK_STYLE },
 *   persona: buildPersona("角色风格文案"),
 */

import type {
  IAgentConstraints,
  IAgentPersona,
  WorkStyle,
} from "@/modules/ai-engine/harness/abstractions/identity.interface";

/** Shared persona defaults (tone + language). `style` is always per-spec. */
export const TOPIC_INSIGHTS_PERSONA_DEFAULTS = {
  tone: "formal",
  language: "zh-CN",
} as const satisfies Pick<IAgentPersona, "tone" | "language">;

/** Shared role.workStyle. All topic-insights agents run structured loops. */
export const TOPIC_INSIGHTS_WORK_STYLE: WorkStyle = "structured";

/** Shared constraint default. Per-spec constraints (tokens/iter) always added on top. */
export const TOPIC_INSIGHTS_SAFETY_LEVEL: NonNullable<
  IAgentConstraints["safetyLevel"]
> = "standard";

/** Build a persona by merging shared defaults with a role-specific `style`. */
export function buildPersona(style: string): IAgentPersona {
  return {
    ...TOPIC_INSIGHTS_PERSONA_DEFAULTS,
    style,
  };
}
