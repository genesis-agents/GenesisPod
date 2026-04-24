/**
 * Framework-skill policy · per-topicType defaults.
 *
 * F1 · Maps (topicType, eventSubtype?) → ordered `.skill.md` ids to inject
 * into Leader planner prompts. Replaces framework-skills.config.ts deleted
 * by H6 step 11.
 *
 * Resolution: an entry matching (topicType, eventSubtype) wins; otherwise
 * fall back to the base entry for the topicType with no eventSubtype. All
 * skill ids must resolve to a file in `skills/frameworks/*.skill.md`.
 */

import { ResearchTopicType } from "@prisma/client";

import type { FrameworkSkillPolicyEntry } from "./policy.types";

export const FRAMEWORK_SKILL_POLICIES: readonly FrameworkSkillPolicyEntry[] = [
  // Base entries (one per topicType, no eventSubtype)
  { topicType: ResearchTopicType.MACRO, skillIds: ["macro-analysis"] },
  {
    topicType: ResearchTopicType.TECHNOLOGY,
    skillIds: ["technology-analysis"],
  },
  { topicType: ResearchTopicType.COMPANY, skillIds: ["company-analysis"] },
  { topicType: ResearchTopicType.EVENT, skillIds: ["event-analysis"] },

  // EVENT refinements — primary framework first, subtype skill second.
  {
    topicType: ResearchTopicType.EVENT,
    eventSubtype: "crisis",
    skillIds: ["event-analysis", "event-crisis"],
  },
  {
    topicType: ResearchTopicType.EVENT,
    eventSubtype: "funding",
    skillIds: ["event-analysis", "event-funding"],
  },
  {
    topicType: ResearchTopicType.EVENT,
    eventSubtype: "geopolitical",
    skillIds: ["event-analysis", "event-geopolitical"],
  },
  {
    topicType: ResearchTopicType.EVENT,
    eventSubtype: "leadership",
    skillIds: ["event-analysis", "event-leadership"],
  },
  {
    topicType: ResearchTopicType.EVENT,
    eventSubtype: "ma",
    skillIds: ["event-analysis", "event-ma"],
  },
  {
    topicType: ResearchTopicType.EVENT,
    eventSubtype: "policy",
    skillIds: ["event-analysis", "event-policy"],
  },
  {
    topicType: ResearchTopicType.EVENT,
    eventSubtype: "product-launch",
    skillIds: ["event-analysis", "event-product-launch"],
  },
  {
    topicType: ResearchTopicType.EVENT,
    eventSubtype: "tech-breakthrough",
    skillIds: ["event-analysis", "event-tech-breakthrough"],
  },
];
