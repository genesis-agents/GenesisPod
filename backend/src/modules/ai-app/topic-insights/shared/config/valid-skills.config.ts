/**
 * Valid skill name whitelist
 *
 * 来源：baseline `38347e2a7:services/core/leader/leader-planning.service.ts:L50-L99`
 * 原 const VALID_SKILLS。
 *
 * 用途：Leader 规划后处理 —— LLM 可能产出白名单外的"幻觉" skill，必须
 * 通过 `VALID_SKILLS.has(normalizedSkill)` 过滤后才存到 `AgentAssignment.skills`。
 *
 * kebab-case，对应 `topic-insights/skills/` 下的 `.skill.md` 文件名。
 */

export const VALID_SKILLS: ReadonlySet<string> = new Set([
  "cause-effect",
  "claim-extraction",
  "comparison",
  "competitive-analysis",
  "consistency-check",
  "content-critique",
  "content-refine",
  "critical-thinking",
  "data-interpretation",
  "debate-argument-generator",
  "debate-judge-assessor",
  "debate-verdict-synthesizer",
  "dedup-checker",
  "deep-dive",
  "dimension-research",
  "dimension-review",
  "dimension-synthesizer",
  "entity-extraction",
  "fact-check",
  "fact-verification",
  "future-projection",
  "hypothesis-verification",
  "multi-path-reasoning",
  "multi-view-synthesizer",
  "plan-adjuster",
  "rag-fusion-query",
  "report-editing",
  "report-synthesis",
  "research-planning",
  "section-review",
  "specialized-role-analysis",
  "swot-analysis",
  "synthesis",
  "task-quality-evaluator",
  "trend-analysis",
  // Framework skills (type-specific analysis frameworks)
  "macro-analysis",
  "technology-analysis",
  "company-analysis",
  "event-analysis",
  "event-ma",
  "event-policy",
  "event-product-launch",
  "event-crisis",
  "event-funding",
  "event-geopolitical",
  "event-leadership",
  "event-tech-breakthrough",
]);

/**
 * 把 LLM 返回的 skill 名 normalize 为 kebab-case 并过滤白名单外条目。
 * @returns `{ valid, invalid }` —— invalid 用于日志
 */
export function filterValidSkills(skills: ReadonlyArray<string>): {
  valid: string[];
  invalid: string[];
} {
  const normalized = skills.map((s) => s.replace(/_/g, "-").toLowerCase());
  const valid = normalized.filter((s) => VALID_SKILLS.has(s));
  const invalid = normalized.filter((s) => !VALID_SKILLS.has(s));
  return { valid, invalid };
}
