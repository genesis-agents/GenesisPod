/**
 * Framework-skill policy types.
 *
 * F1 · Restores the data layer that decides which framework `.skill.md` to
 * inject into Leader planner prompts for a given topic type (and optional
 * event subtype). Deleted along with framework-skills.config.ts in H6 step 11.
 */

import type { ResearchTopicType } from "@prisma/client";

/**
 * EVENT topics may carry a refined subtype. Additional subtypes may be added
 * without breaking existing policies.
 */
export type EventSubtype =
  | "crisis"
  | "funding"
  | "geopolitical"
  | "leadership"
  | "ma"
  | "policy"
  | "product-launch"
  | "tech-breakthrough";

export interface FrameworkSkillPolicyEntry {
  readonly topicType: ResearchTopicType;
  /**
   * Optional for base topicType policies. When present, the entry is a
   * refinement selected only if the exact (topicType, eventSubtype) matches.
   */
  readonly eventSubtype?: EventSubtype;
  /**
   * Ordered list of `.skill.md` ids. First id is the primary framework;
   * subsequent ids are supplemental. Loader resolves these via
   * `SkillLoaderService.getSkillById()`.
   */
  readonly skillIds: readonly string[];
}

export interface LoadedFramework {
  readonly skillId: string;
  readonly content: string;
}
