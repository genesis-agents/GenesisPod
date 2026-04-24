/**
 * task-keyword-routing.ts · unit tests
 *
 * 保证 baseline L178-L389 的关键词分类 → skills/tools 映射正确，
 * 以及 skills ≤ 5, tools ≤ 3 硬上限。
 */

import { selectSkillsAndToolsForTask } from "../task-keyword-routing";

describe("selectSkillsAndToolsForTask", () => {
  it("defaults when no keyword matches", () => {
    const { skills, tools } = selectSkillsAndToolsForTask(
      "未知任务",
      "无关键词",
    );
    expect(skills).toEqual(["deep-dive", "synthesis", "data-interpretation"]);
    expect(tools).toEqual(["web-search"]);
  });

  it("routes policy keywords to fact-verification + federal-register", () => {
    const { skills, tools } = selectSkillsAndToolsForTask("AI 政策法规分析");
    expect(skills).toContain("fact-verification");
    expect(skills).toContain("critical-thinking");
    expect(tools).toContain("federal-register");
  });

  it("routes market keywords to trend + competitive analysis", () => {
    const { skills, tools } = selectSkillsAndToolsForTask("市场竞争格局研究");
    expect(skills).toContain("trend-analysis");
    expect(skills).toContain("competitive-analysis");
    expect(tools).toContain("web-search");
  });

  it("routes technology keywords to deep-dive + academic-search", () => {
    const { skills, tools } = selectSkillsAndToolsForTask("技术创新研发");
    expect(skills).toContain("deep-dive");
    expect(tools).toContain("academic-search");
  });

  it("routes strategy keywords to future-projection + swot", () => {
    const { skills } = selectSkillsAndToolsForTask("战略布局展望");
    expect(skills).toContain("future-projection");
    expect(skills).toContain("swot-analysis");
  });

  it("routes evaluation keywords to critical-thinking + swot", () => {
    const { skills } = selectSkillsAndToolsForTask("评估利弊风险");
    expect(skills).toContain("critical-thinking");
    expect(skills).toContain("swot-analysis");
  });

  it("enforces skills ≤ 5 hard cap", () => {
    // 多类组合（政策 + 市场 + 技术 + 战略 + 评估）会产出 > 5 个 skill
    const { skills } = selectSkillsAndToolsForTask(
      "政策 + 市场 + 技术 + 战略 + 评估 全维度",
    );
    expect(skills.length).toBeLessThanOrEqual(5);
  });

  it("enforces tools ≤ 3 hard cap", () => {
    const { tools } = selectSkillsAndToolsForTask(
      "政策 + 市场 + 技术 + 数据 + 战略",
    );
    expect(tools.length).toBeLessThanOrEqual(3);
  });

  it("dedupes overlapping skills across categories", () => {
    const { skills } = selectSkillsAndToolsForTask("市场数据分析"); // data + market
    // data-interpretation 和 trend-analysis 在 market/data 两类都出现 — 必须去重
    const uniq = new Set(skills);
    expect(skills.length).toBe(uniq.size);
  });

  it("case-insensitive keyword matching (English)", () => {
    const { skills, tools } = selectSkillsAndToolsForTask(
      "Market Competition Analysis",
    );
    expect(skills).toContain("trend-analysis");
    expect(tools).toContain("web-search");
  });
});
