/**
 * Task Keyword → Skills/Tools Routing
 *
 * 来源：baseline `38347e2a7:services/core/leader/leader-agent-selection.service.ts:L178-L389`
 * 原 `private selectSkillsAndToolsForTask`。
 *
 * 用途：用户新增 TODO 时（无 LLM 规则驱动），根据任务标题/描述的关键词
 * 分类为 6 类，每类映射到 skills[] + tools[]，最终 skills ≤ 5, tools ≤ 3。
 *
 * 业务不变量（baseline）：
 *   - 6 类：政策法规 / 市场分析 / 技术研究 / 数据分析 / 战略综合 / 评估审核
 *   - 无匹配 → 默认 skills=["deep-dive","synthesis","data-interpretation"], tools=["web-search"]
 *   - 硬上限：skills ≤ 5, tools ≤ 3
 */

const POLICY_KW = [
  "政策",
  "法规",
  "监管",
  "立法",
  "法案",
  "法律",
  "policy",
  "regulation",
  "regulatory",
  "legislation",
  "law",
  "compliance",
  "执法",
  "合规",
  "框架",
  "framework",
  "白宫",
  "国会",
  "联邦",
  "行政命令",
] as const;

const MARKET_KW = [
  "市场",
  "竞争",
  "格局",
  "份额",
  "趋势",
  "投资",
  "融资",
  "资本",
  "商业",
  "market",
  "competition",
  "trend",
  "investment",
  "business",
  "产业",
  "行业",
  "企业",
  "公司",
] as const;

const TECH_KW = [
  "技术",
  "研发",
  "创新",
  "算法",
  "架构",
  "系统",
  "technology",
  "research",
  "innovation",
  "algorithm",
  "infrastructure",
  "基础设施",
  "底层",
  "核心",
] as const;

const DATA_KW = [
  "数据",
  "统计",
  "分析",
  "指标",
  "报告",
  "data",
  "statistics",
  "metrics",
  "analysis",
  "report",
  "增长",
  "下降",
  "百分比",
] as const;

const STRATEGY_KW = [
  "战略",
  "布局",
  "发展",
  "规划",
  "展望",
  "预测",
  "未来",
  "strategy",
  "development",
  "outlook",
  "forecast",
  "思想",
  "哲学",
  "根源",
  "动向",
] as const;

const EVAL_KW = [
  "评估",
  "审查",
  "评价",
  "利弊",
  "优劣",
  "风险",
  "挑战",
  "问题",
  "evaluate",
  "assess",
  "review",
  "risk",
  "challenge",
  "opportunity",
  "swot",
  "优势",
  "劣势",
  "机遇",
  "威胁",
] as const;

const MAX_SKILLS = 5;
const MAX_TOOLS = 3;

/**
 * 根据任务内容路由到 skills/tools 列表。
 *
 * baseline L178-L389 完整语义对齐。
 */
export function selectSkillsAndToolsForTask(
  taskTitle: string,
  taskDescription?: string | null,
): { skills: string[]; tools: string[] } {
  const content = `${taskTitle || ""} ${taskDescription || ""}`.toLowerCase();

  const skills: string[] = [];
  const tools: string[] = [];

  const hasAny = (kws: readonly string[]) =>
    kws.some((k) => content.includes(k));

  if (hasAny(POLICY_KW)) {
    skills.push("fact-verification", "critical-thinking", "dimension-research");
    tools.push("federal-register", "congress-gov", "whitehouse-news");
  }
  if (hasAny(MARKET_KW)) {
    skills.push(
      "trend-analysis",
      "competitive-analysis",
      "data-interpretation",
    );
    tools.push("web-search", "data-analysis");
  }
  if (hasAny(TECH_KW)) {
    skills.push("deep-dive", "comparison", "synthesis");
    tools.push("academic-search", "web-search");
  }
  if (hasAny(DATA_KW)) {
    skills.push("data-interpretation", "trend-analysis");
    tools.push("data-analysis", "web-search");
  }
  if (hasAny(STRATEGY_KW)) {
    skills.push(
      "future-projection",
      "cause-effect",
      "synthesis",
      "swot-analysis",
    );
    tools.push("web-search", "news");
  }
  if (hasAny(EVAL_KW)) {
    skills.push("critical-thinking", "swot-analysis");
  }

  // dedupe
  let dedupedSkills = [...new Set(skills)];
  let dedupedTools = [...new Set(tools)];

  // baseline 默认值
  if (dedupedSkills.length === 0) {
    dedupedSkills = ["deep-dive", "synthesis", "data-interpretation"];
  }
  if (dedupedTools.length === 0) {
    dedupedTools = ["web-search"];
  }

  // 硬上限
  if (dedupedSkills.length > MAX_SKILLS) {
    dedupedSkills = dedupedSkills.slice(0, MAX_SKILLS);
  }
  if (dedupedTools.length > MAX_TOOLS) {
    dedupedTools = dedupedTools.slice(0, MAX_TOOLS);
  }

  return { skills: dedupedSkills, tools: dedupedTools };
}
