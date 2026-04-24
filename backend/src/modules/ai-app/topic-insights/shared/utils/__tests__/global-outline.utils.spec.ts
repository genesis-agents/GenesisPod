/**
 * global-outline.utils.ts · unit tests
 *
 * 跨维度共现主题 + 去重规则生成回归。
 */

import {
  computeGlobalOutline,
  type DimensionMetaLite,
} from "../global-outline.utils";

describe("computeGlobalOutline", () => {
  it("returns empty when < 2 dims", () => {
    const r = computeGlobalOutline([
      { dimensionId: "d1", dimensionName: "A", keyFindings: ["x"] },
    ]);
    expect(r.globalThemes).toEqual([]);
    expect(r.deduplicationRules).toEqual([]);
  });

  it("identifies themes shared across multiple dimensions", () => {
    // baseline extractKeywords 只切空格，中文必须显式用空格分隔才被视为独立 kw
    const metas: DimensionMetaLite[] = [
      {
        dimensionId: "d1",
        dimensionName: "市场分析",
        keyFindings: ["AI 技术 正在 重塑 market 格局", "头部 company 垄断"],
      },
      {
        dimensionId: "d2",
        dimensionName: "技术演进",
        keyFindings: ["AI 技术 迭代 加速", "开源 model 崛起"],
      },
      {
        dimensionId: "d3",
        dimensionName: "风险展望",
        keyFindings: ["AI 安全 risk 上升", "技术 伦理 挑战"],
      },
    ];
    const r = computeGlobalOutline(metas);
    // "ai" + "技术" 应该是全局主题（多 dim 共现）
    expect(r.globalThemes).toContain("ai");
    expect(r.globalThemes).toContain("技术");
    expect(r.globalThemes.length).toBeGreaterThan(0);
  });

  it("deduplication rules reference shared dimension names", () => {
    const metas: DimensionMetaLite[] = [
      {
        dimensionId: "d1",
        dimensionName: "市场分析",
        keyFindings: ["技术 重塑 格局"],
      },
      {
        dimensionId: "d2",
        dimensionName: "技术演进",
        keyFindings: ["技术 迭代 加速"],
      },
    ];
    const r = computeGlobalOutline(metas);
    if (r.deduplicationRules.length > 0) {
      // 规则必须引用维度名，提示 Synthesizer 只在首次深入展开
      const rule = r.deduplicationRules[0];
      expect(rule).toMatch(/市场分析|技术演进/);
      expect(rule).toContain("只做差异化视角补充");
    }
  });

  it("filters stopwords from themes", () => {
    const metas: DimensionMetaLite[] = [
      {
        dimensionId: "d1",
        dimensionName: "A",
        keyFindings: ["the the is a technology market"],
      },
      {
        dimensionId: "d2",
        dimensionName: "B",
        keyFindings: ["the is technology growth"],
      },
    ];
    const r = computeGlobalOutline(metas);
    // stopwords 被 extractKeywords 过滤
    expect(r.globalThemes).not.toContain("the");
    expect(r.globalThemes).not.toContain("is");
  });

  it("caps globalThemes at 8", () => {
    const allKws = Array.from({ length: 20 }).map((_, i) => `keyword${i}`);
    const metas: DimensionMetaLite[] = [
      { dimensionId: "d1", dimensionName: "A", keyFindings: allKws },
      { dimensionId: "d2", dimensionName: "B", keyFindings: allKws },
    ];
    const r = computeGlobalOutline(metas);
    expect(r.globalThemes.length).toBeLessThanOrEqual(8);
  });

  it("caps deduplicationRules at 6", () => {
    const allKws = Array.from({ length: 20 }).map((_, i) => `keyword${i}`);
    const metas: DimensionMetaLite[] = [
      { dimensionId: "d1", dimensionName: "A", keyFindings: allKws },
      { dimensionId: "d2", dimensionName: "B", keyFindings: allKws },
    ];
    const r = computeGlobalOutline(metas);
    expect(r.deduplicationRules.length).toBeLessThanOrEqual(6);
  });
});
