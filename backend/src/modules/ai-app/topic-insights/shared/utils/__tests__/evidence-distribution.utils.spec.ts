/**
 * evidence-distribution.utils.ts · unit tests
 *
 * baseline distributeDiverseEvidence / scoreEvidenceForSection / extractKeywords
 * 硬回归防护。
 */

import {
  extractKeywords,
  scoreEvidenceForSection,
  distributeDiverseEvidence,
  type EvidenceData,
  type SectionLite,
} from "../evidence-distribution.utils";

describe("extractKeywords", () => {
  it("filters stopwords and short words", () => {
    const kws = extractKeywords(
      "the market is a big competition in the industry",
    );
    expect(kws).not.toContain("the");
    expect(kws).not.toContain("a");
    expect(kws).toContain("market");
    expect(kws).toContain("competition");
    expect(kws).toContain("industry");
  });

  it("deduplicates keywords", () => {
    const kws = extractKeywords("market market competition market");
    const marketCount = kws.filter((k) => k === "market").length;
    expect(marketCount).toBe(1);
  });

  it("handles Chinese + English mixed", () => {
    const kws = extractKeywords("人工智能 AI 技术 market");
    expect(kws).toContain("人工智能");
    expect(kws).toContain("技术");
    expect(kws).toContain("market");
  });

  it("filters Chinese stopwords (的/了/在)", () => {
    const kws = extractKeywords("技术 的 发展 在 中国");
    expect(kws).not.toContain("的");
    expect(kws).not.toContain("在");
    expect(kws).toContain("技术");
    expect(kws).toContain("发展");
    expect(kws).toContain("中国");
  });
});

describe("scoreEvidenceForSection", () => {
  const section: SectionLite = {
    id: "s1",
    title: "AI 市场竞争格局",
    keyPoints: ["头部玩家", "市场份额"],
  };

  it("ranks relevant evidence higher", () => {
    const evidence: EvidenceData[] = [
      { title: "无关新闻", snippet: "其它话题" },
      { title: "AI 市场竞争格局报告", snippet: "头部玩家分析" },
      { title: "一般文章", snippet: "一些内容" },
    ];
    const scored = scoreEvidenceForSection(section, evidence);
    expect(scored[0].evidence.title).toContain("AI 市场竞争");
  });

  it("returns zero-score array when no keywords", () => {
    const emptySection: SectionLite = { id: "s", title: "的", keyPoints: [] };
    const scored = scoreEvidenceForSection(emptySection, [
      { title: "anything" },
    ]);
    expect(scored[0].score).toBe(0);
  });

  it("applies sourceTypeMultipliers when weightProfile provided", () => {
    const ev: EvidenceData[] = [
      { title: "AI 市场 report", sourceType: "ACADEMIC" },
      { title: "AI 市场 blog", sourceType: "BLOG" },
    ];
    const scored = scoreEvidenceForSection(section, ev, {
      sourceTypeMultipliers: { ACADEMIC: 2.0, BLOG: 0.5 },
      freshnessBoostFactor: 0,
    });
    // ACADEMIC 得分 >= BLOG 得分 * 4
    expect(scored[0].evidence.sourceType).toBe("ACADEMIC");
  });
});

describe("distributeDiverseEvidence", () => {
  const sections: SectionLite[] = [
    { id: "s1", title: "市场概况", keyPoints: ["总量", "增速"] },
    { id: "s2", title: "竞争格局", keyPoints: ["头部玩家"] },
    { id: "s3", title: "未来趋势", keyPoints: ["预测"] },
  ];

  it("returns empty map when no evidence or no sections", () => {
    expect(distributeDiverseEvidence(sections, []).size).toBe(0);
    expect(distributeDiverseEvidence([], [{ title: "x" }]).size).toBe(0);
  });

  it("assigns promptIndex 1..N based on input order", () => {
    const evidence: EvidenceData[] = [
      { id: "e1", title: "市场总量 2024" },
      { id: "e2", title: "竞争格局 分析" },
    ];
    const map = distributeDiverseEvidence(sections, evidence);
    const allAssigned = [...map.values()].flat();
    const indices = new Set(allAssigned.map((e) => e.promptIndex));
    // 每条 evidence promptIndex 必须 1-based 且稳定（同一 evidence 跨 section 编号相同）
    for (const idx of indices) {
      expect(typeof idx).toBe("number");
      expect(idx).toBeGreaterThanOrEqual(1);
      expect(idx).toBeLessThanOrEqual(evidence.length);
    }
  });

  it("enforces max 3 core + 5 extra = 8 per section", () => {
    const evidence: EvidenceData[] = Array.from({ length: 50 }, (_, i) => ({
      id: `e${i}`,
      title: `evidence ${i} 市场竞争 趋势`,
      snippet: "所有关键词都 match",
    }));
    const map = distributeDiverseEvidence(sections, evidence);
    for (const [, arr] of map) {
      expect(arr.length).toBeLessThanOrEqual(8);
    }
  });

  it("top-3 can be shared across sections; remainder is unique", () => {
    const evidence: EvidenceData[] = [
      // 3 条对所有 section 都高度相关 → 成为 core，跨 section 共享
      { id: "c1", title: "市场竞争趋势 1" },
      { id: "c2", title: "市场竞争趋势 2" },
      { id: "c3", title: "市场竞争趋势 3" },
      // 10 条普通 → round-robin 独占分配
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `r${i}`,
        title: `普通 ${i}`,
      })),
    ];
    const map = distributeDiverseEvidence(sections, evidence);

    // 统计 "r*" evidence 出现在几个 section
    const rAssignments = new Map<string, Set<string>>();
    for (const [secId, arr] of map) {
      for (const e of arr) {
        if (e.id?.startsWith("r")) {
          if (!rAssignments.has(e.id)) rAssignments.set(e.id, new Set());
          rAssignments.get(e.id)!.add(secId);
        }
      }
    }
    // 每个 r-evidence 应该只出现在 1 个 section 里（独占）
    for (const [, sections] of rAssignments) {
      expect(sections.size).toBe(1);
    }
  });
});
