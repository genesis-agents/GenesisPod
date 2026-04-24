/**
 * Default skills selection utility
 *
 * 来源：baseline `38347e2a7:services/core/leader/leader-planning.service.ts:L1270-L1388`
 * 原 `private selectDefaultSkillsForDimension`。
 *
 * 用途：当 Leader LLM 未给 dimension_researcher 返回 skills 时，基于维度
 * 名称+描述的关键词做智能选择（9 组关键词 → skill 映射），保底返回。
 *
 * 业务不变量（baseline）：
 * - 3 个基础技能始终包含：`deep-dive` / `synthesis` / `data-interpretation`
 * - 9 组关键词 → 技能（见 KEYWORD_SKILL_MAP）
 * - 最终限 **5 个技能上限**，避免 prompt 膨胀
 */

/**
 * 基础技能（始终包含）
 * baseline L1275: `new Set(["deep-dive", "synthesis", "data-interpretation"])`
 */
const BASE_SKILLS = ["deep-dive", "synthesis", "data-interpretation"] as const;

/** 单个 dimension 最多附加的 skill 数 */
const MAX_SKILLS = 5;

/**
 * 关键词 → 技能映射表（9 组）
 * baseline L1286-L1377，完整对齐
 */
const KEYWORD_SKILL_MAP: ReadonlyArray<{
  keywords: ReadonlyArray<string>;
  skill: string;
}> = [
  {
    keywords: ["趋势", "走势", "变化", "增长", "下降", "trend", "growth"],
    skill: "trend-analysis",
  },
  {
    keywords: [
      "竞争",
      "竞品",
      "对手",
      "格局",
      "market share",
      "competitor",
      "competition",
    ],
    skill: "competitive-analysis",
  },
  {
    keywords: ["对比", "比较", "差异", "versus", "vs", "compare", "comparison"],
    skill: "comparison",
  },
  {
    keywords: ["数据", "指标", "统计", "data", "metric", "statistics", "分析"],
    skill: "data-interpretation",
  },
  {
    keywords: ["未来", "预测", "展望", "forecast", "outlook", "projection"],
    skill: "future-projection",
  },
  {
    keywords: [
      "原因",
      "影响",
      "因果",
      "驱动",
      "cause",
      "effect",
      "impact",
      "driver",
    ],
    skill: "cause-effect",
  },
  {
    keywords: [
      "评估",
      "优劣",
      "利弊",
      "风险",
      "swot",
      "strength",
      "weakness",
      "优势",
      "劣势",
      "机遇",
      "威胁",
    ],
    skill: "swot-analysis",
  },
  {
    keywords: [
      "审视",
      "批判",
      "反思",
      "质疑",
      "critical",
      "evaluate",
      "问题",
      "挑战",
    ],
    skill: "critical-thinking",
  },
];

/**
 * 根据 assignment 负责的 dimension 列表选择默认 skills。
 *
 * baseline L1270-L1388 的完整语义：
 *   1. 基础 3 skill 始终含
 *   2. 按 dimension 的 name+description 文本做关键词匹配
 *   3. 匹配中任一关键词 → 加对应 skill
 *   4. 去重（Set）
 *   5. 上限 5 —— 超过切前 5
 *
 * @param assignedDimensionIds Agent 负责的 dimension id 列表
 * @param dimensions 完整 LeaderPlan.dimensions
 */
export function selectDefaultSkillsForDimension(
  assignedDimensionIds: ReadonlyArray<string>,
  dimensions: ReadonlyArray<{
    id: string;
    name: string;
    description?: string | null;
  }>,
): string[] {
  const skills = new Set<string>(BASE_SKILLS);

  const dimTexts = assignedDimensionIds
    .map((dimId) => {
      const dim = dimensions.find((d) => d.id === dimId);
      return dim ? `${dim.name} ${dim.description || ""}` : "";
    })
    .join(" ")
    .toLowerCase();

  for (const { keywords, skill } of KEYWORD_SKILL_MAP) {
    if (keywords.some((kw) => dimTexts.includes(kw))) {
      skills.add(skill);
    }
  }

  const result = [...skills];
  return result.length > MAX_SKILLS ? result.slice(0, MAX_SKILLS) : result;
}
