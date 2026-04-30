/**
 * Skill 白名单守护 —— 移植自 TI leader-planning.service.ts:50-99 + :391-408
 *
 * 背景：LLM 在 plan / assignment 阶段偶发返回不存在的 skill 名（幻觉），如：
 *   - "deep-research" / "深入研究" / "deep_research" 各种形式
 *   - 完全编造的 "industry-decode" / "advanced-analysis"
 * 没有白名单守护时，下游按 skill ID 查找 skill registry 必然 miss → 静默丢弃，
 * worker agent 失去预期能力。
 *
 * TI 在 200+ 报告生产环境验证：白名单 + 大小写归一化能滤掉 ~5% 的幻觉 skill。
 *
 * 复用此白名单时请保持与 ai-engine/skills/skill-registry 的注册集合同步。
 */

export const VALID_SKILLS: ReadonlySet<string> = new Set([
  // 通用研究 / 评审 / 总结
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
  // Framework skills (type-specific)
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

export interface SkillValidationResult {
  valid: string[];
  invalid: string[];
  /** 是否做过任何修正（normalize 或 filter） */
  changed: boolean;
}

/**
 * 校验 + 归一化 skill 列表。
 *  1. 下划线 → 连字符（"deep_dive" → "deep-dive"）
 *  2. 全部转小写
 *  3. 过滤白名单外的 skill
 *
 * @param skills LLM 返回的 skill 列表（可能包含大小写 / 下划线 / 幻觉名）
 * @returns 拆分后的合法 / 非法集合
 */
export function validateSkills(
  skills: readonly string[] | undefined,
): SkillValidationResult {
  if (!skills || skills.length === 0) {
    return { valid: [], invalid: [], changed: false };
  }
  const normalized = skills
    .map((s) =>
      typeof s === "string" ? s.replace(/_/g, "-").toLowerCase().trim() : "",
    )
    .filter((s) => s.length > 0);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const s of normalized) {
    if (VALID_SKILLS.has(s)) valid.push(s);
    else invalid.push(s);
  }
  // 去重（保留首次出现顺序）
  const dedupValid = [...new Set(valid)];
  const changed =
    dedupValid.length !== skills.length ||
    invalid.length > 0 ||
    skills.some(
      (raw) =>
        typeof raw !== "string" ||
        raw.toLowerCase().replace(/_/g, "-").trim() !== raw,
    );
  return { valid: dedupValid, invalid, changed };
}
