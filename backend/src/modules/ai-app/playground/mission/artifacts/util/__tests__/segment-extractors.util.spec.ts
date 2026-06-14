import { extractReportSegments } from "../segment-extractors.util";
import type { ArtifactMetadata } from "@/modules/ai-harness/facade";

const baseMetadata: ArtifactMetadata = {
  topic: "T",
  generatedAt: new Date().toISOString(),
  generationTimeMs: 0,
  version: 1,
  isIncremental: false,
  dimensionCount: 0,
  sourceCount: 0,
  factCount: 0,
  figureCount: 0,
  wordCount: 0,
  readingTimeMinutes: 0,
  styleProfile: "academic",
  lengthProfile: "standard",
  audienceProfile: "domain-expert",
  language: "zh-CN",
  totalTokens: { prompt: 0, completion: 0, total: 0 },
  costCents: 0,
  modelTrail: [],
};

describe("extractReportSegments", () => {
  it("plan dimensions 全部映射成 perDimension", () => {
    const r = extractReportSegments({
      plan: {
        themeSummary: "TS",
        dimensions: [
          { id: "d1", name: "维度一", rationale: "" },
          { id: "d2", name: "维度二", rationale: "" },
        ],
      },
      researcherResults: [
        { dimension: "d1", fullMarkdown: "正文 1" },
        { dimension: "d2", fullMarkdown: "正文 2" },
      ],
      metadata: baseMetadata,
    });
    expect(r.bodies.perDimension).toHaveLength(2);
    expect(r.bodies.perDimension[0]).toEqual({
      dimensionId: "d1",
      body: "正文 1",
    });
  });

  it("researcher 缺失某 dim → body = null（让 assembler 占位）", () => {
    const r = extractReportSegments({
      plan: {
        themeSummary: "TS",
        dimensions: [
          { id: "d1", name: "维度一", rationale: "" },
          { id: "d2", name: "维度二", rationale: "" },
        ],
      },
      researcherResults: [{ dimension: "d1", fullMarkdown: "正文 1" }],
      metadata: baseMetadata,
    });
    expect(r.bodies.perDimension[0].body).toBe("正文 1");
    expect(r.bodies.perDimension[1].body).toBe(null);
  });

  it("researcher.dimension 用 dim.name 匹配也 OK", () => {
    const r = extractReportSegments({
      plan: {
        themeSummary: "TS",
        dimensions: [{ id: "d1", name: "维度一", rationale: "" }],
      },
      researcherResults: [{ dimension: "维度一", summary: "概要" }],
      metadata: baseMetadata,
    });
    expect(r.bodies.perDimension[0].body).toBe("概要");
  });

  it("analyst 5 字段全部抽到 bodies", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: {
        themeSummary: "exec",
        preface: "前言",
        crossDimAnalysis: "跨维",
        riskAssessment: "风险",
        strategicRecommendations: "建议",
        conclusion: "结论",
      },
      metadata: baseMetadata,
    });
    expect(r.bodies.executiveSummary).toBe("exec");
    expect(r.bodies.preface).toBe("前言");
    expect(r.bodies.crossDimAnalysis).toBe("跨维");
    expect(r.bodies.riskAssessment).toBe("风险");
    expect(r.bodies.recommendations).toBe("建议");
    expect(r.bodies.conclusion).toBe("结论");
  });

  it("crossDim fallback 到 reconciler.reconciliationReport", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: { themeSummary: "exec" },
      reconcilerOutput: { reconciliationReport: "对账总览" },
      metadata: baseMetadata,
    });
    expect(r.bodies.crossDimAnalysis).toBe("对账总览");
  });

  it("crossDim fallback 把 reconciliationReport 内部 H1/H2 降为 H3，避免被前端切成多章", () => {
    const recon = [
      "# 对账总览",
      "## 事实表概要",
      "20 facts",
      "## 冲突",
      "4 字段",
      "## 重叠",
      "## 空白",
      "## 下游消费指引",
    ].join("\n");
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: { themeSummary: "exec" },
      reconcilerOutput: { reconciliationReport: recon },
      metadata: baseMetadata,
    });
    const body = r.bodies.crossDimAnalysis ?? "";
    expect(body).not.toMatch(/^#\s/m);
    expect(body).not.toMatch(/^##\s/m);
    expect(body).toContain("### 对账总览");
    expect(body).toContain("### 事实表概要");
    expect(body).toContain("### 冲突");
    expect(body).toContain("### 重叠");
    expect(body).toContain("### 空白");
    expect(body).toContain("### 下游消费指引");
    // 段落正文保留
    expect(body).toContain("20 facts");
    expect(body).toContain("4 字段");
  });

  it("crossDim fallback 不误改代码块 / 行内 # 字符", () => {
    const recon = ["### 已经是 H3 不变", "正文里 # 不在行首应保留"].join("\n");
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      reconcilerOutput: { reconciliationReport: recon },
      metadata: baseMetadata,
    });
    expect(r.bodies.crossDimAnalysis).toContain("### 已经是 H3 不变");
    expect(r.bodies.crossDimAnalysis).toContain("正文里 # 不在行首应保留");
  });

  it("analyst.crossDimAnalysis 优先时不触发降级（保留原始内容）", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: {
        themeSummary: "exec",
        crossDimAnalysis: "## analyst 自己写的标题保留",
      },
      reconcilerOutput: { reconciliationReport: "## 对账" },
      metadata: baseMetadata,
    });
    expect(r.bodies.crossDimAnalysis).toBe("## analyst 自己写的标题保留");
  });

  it("两个 cross 来源都缺 → undefined（optional slot 跳过）", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      metadata: baseMetadata,
    });
    expect(r.bodies.crossDimAnalysis).toBeUndefined();
  });

  it("citations / figures / factTable 直通", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      citations: [],
      figures: [],
      factTable: [],
      metadata: baseMetadata,
    });
    expect(r.citations).toEqual([]);
    expect(r.figures).toEqual([]);
    expect(r.factTable).toEqual([]);
  });

  it("qualityInputs 缺失 → 空壳填充", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      metadata: baseMetadata,
    });
    expect(r.qualityInputs).toEqual({ verifierScores: {}, warnings: [] });
  });

  it("analyst 5 组结构化 quickView 字段 → segments.quickViewData 透传", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: {
        themeSummary: "exec",
        keyFindingsByDimension: [
          {
            dimensionName: "维度1",
            findings: [{ finding: "发现 X", significance: "high" }],
          },
        ],
        trendsByDimension: [
          {
            dimensionName: "维度2",
            trends: [
              { trend: "趋势 Y", direction: "stable", timeframe: "12个月" },
            ],
          },
        ],
        riskMatrix: [
          {
            riskType: "技术风险",
            probability: "中",
            impact: "高",
            timeframe: "6个月",
          },
        ],
        recommendationsByAudience: {
          forEnterprise: { shortTerm: ["s1"], midTerm: ["m1"] },
          forInvestors: { shortTerm: ["si1"], midTerm: ["mi1"] },
        },
        whatYouWillLearn: ["要点 A", "要点 B"],
        insights: [
          {
            headline: "h",
            narrative: "n",
            supportingDimensions: ["维度1"],
            confidence: 0.8,
          },
        ],
      },
      metadata: baseMetadata,
    });
    expect(r.quickViewData?.keyFindingsByDimension).toHaveLength(1);
    expect(r.quickViewData?.trendsByDimension?.[0].trends[0].direction).toBe(
      "stable",
    );
    expect(r.quickViewData?.riskMatrix?.[0].probability).toBe("中");
    expect(r.quickViewData?.recommendationsByAudience?.forInvestors).toEqual({
      shortTerm: ["si1"],
      midTerm: ["mi1"],
    });
    expect(r.quickViewData?.whatYouWillLearn).toEqual(["要点 A", "要点 B"]);
    expect(r.quickViewData?.insights).toHaveLength(1);
  });

  it("analyst 缺所有结构化字段 → quickViewData 仍存在但内部字段全 undefined", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: { themeSummary: "exec" },
      metadata: baseMetadata,
    });
    expect(r.quickViewData).toBeDefined();
    expect(r.quickViewData?.keyFindingsByDimension).toBeUndefined();
    expect(r.quickViewData?.trendsByDimension).toBeUndefined();
    expect(r.quickViewData?.riskMatrix).toBeUndefined();
    expect(r.quickViewData?.recommendationsByAudience).toBeUndefined();
    expect(r.quickViewData?.whatYouWillLearn).toBeUndefined();
  });

  // ── foresight rendering ────────────────────────────────────────────────────

  it("foresight with baseCase renders ### 基准判断 section", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: {
        themeSummary: "exec",
        foresight: {
          baseCase: [
            {
              judgment: "AI adoption accelerates",
              probability: 0.65,
              confidence: "moderate",
              horizon: "6-18m",
              resolutionCriteria: "market share > 30%",
              evidenceIds: [],
            },
          ],
          scenarios: [],
          predeterminedElements: [],
          criticalUncertainties: [],
          leadingIndicators: [],
        },
      },
      metadata: baseMetadata,
    });
    expect(r.bodies.futureOutlook).toBeDefined();
    expect(r.bodies.futureOutlook).toContain("### 基准判断");
    expect(r.bodies.futureOutlook).toContain("AI adoption accelerates");
    expect(r.bodies.futureOutlook).toContain("65%");
    expect(r.bodies.futureOutlook).toContain("中");
    expect(r.bodies.futureOutlook).toContain("6-18 个月");
  });

  it("foresight with baseRate renders 历史基准率 line", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: {
        themeSummary: "exec",
        foresight: {
          baseCase: [
            {
              judgment: "X",
              probability: 0.5,
              confidence: "high",
              horizon: "3y+",
              resolutionCriteria: "Y",
              baseRate: "  Historical base rate 40%  ",
              evidenceIds: [],
            },
          ],
          scenarios: [],
          predeterminedElements: [],
          criticalUncertainties: [],
          leadingIndicators: [],
        },
      },
      metadata: baseMetadata,
    });
    expect(r.bodies.futureOutlook).toContain(
      "历史基准率：Historical base rate 40%",
    );
    expect(r.bodies.futureOutlook).toContain("高"); // confidence=high
    expect(r.bodies.futureOutlook).toContain("3 年以上"); // horizon=3y+
  });

  it("foresight with empty baseRate string → no 历史基准率 line", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: {
        themeSummary: "exec",
        foresight: {
          baseCase: [
            {
              judgment: "X",
              probability: 0.5,
              confidence: "low",
              horizon: "0-6m",
              resolutionCriteria: "Y",
              baseRate: "   ",
              evidenceIds: [],
            },
          ],
          scenarios: [],
          predeterminedElements: [],
          criticalUncertainties: [],
          leadingIndicators: [],
        },
      },
      metadata: baseMetadata,
    });
    expect(r.bodies.futureOutlook).not.toContain("历史基准率");
    expect(r.bodies.futureOutlook).toContain("低"); // confidence=low
    expect(r.bodies.futureOutlook).toContain("0-6 个月"); // horizon=0-6m
  });

  it("foresight with scenarios renders ### 情景分析 section", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: {
        themeSummary: "exec",
        foresight: {
          baseCase: [
            {
              judgment: "J",
              probability: 0.7,
              confidence: "moderate",
              horizon: "18m-3y",
              resolutionCriteria: "R",
              evidenceIds: [],
            },
          ],
          scenarios: [
            {
              kind: "bull",
              narrative: "Best case scenario",
              probability: 0.3,
              trigger: "positive trigger",
            },
            {
              kind: "bear",
              narrative: "Worst case",
              probability: 0.2,
              trigger: "negative trigger",
            },
            {
              kind: "base",
              narrative: "Base case",
              probability: 0.5,
              trigger: "neutral trigger",
            },
          ],
          predeterminedElements: [],
          criticalUncertainties: [],
          leadingIndicators: [],
        },
      },
      metadata: baseMetadata,
    });
    expect(r.bodies.futureOutlook).toContain("### 情景分析");
    expect(r.bodies.futureOutlook).toContain("乐观情景");
    expect(r.bodies.futureOutlook).toContain("悲观情景");
    expect(r.bodies.futureOutlook).toContain("基准情景");
    expect(r.bodies.futureOutlook).toContain("30%"); // bull probability
    expect(r.bodies.futureOutlook).toContain("18 个月-3 年"); // horizon
  });

  it("foresight with predeterminedElements renders ### 几乎确定的要素", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: {
        themeSummary: "exec",
        foresight: {
          baseCase: [
            {
              judgment: "J",
              probability: 0.5,
              confidence: "moderate",
              horizon: "0-6m",
              resolutionCriteria: "R",
              evidenceIds: [],
            },
          ],
          scenarios: [],
          predeterminedElements: ["Element A", "Element B"],
          criticalUncertainties: [],
          leadingIndicators: [],
        },
      },
      metadata: baseMetadata,
    });
    expect(r.bodies.futureOutlook).toContain("### 几乎确定的要素");
    expect(r.bodies.futureOutlook).toContain("- Element A");
    expect(r.bodies.futureOutlook).toContain("- Element B");
  });

  it("foresight with criticalUncertainties renders ### 关键不确定性", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: {
        themeSummary: "exec",
        foresight: {
          baseCase: [
            {
              judgment: "J",
              probability: 0.5,
              confidence: "moderate",
              horizon: "0-6m",
              resolutionCriteria: "R",
              evidenceIds: [],
            },
          ],
          scenarios: [],
          predeterminedElements: [],
          criticalUncertainties: ["Uncertainty X", "Uncertainty Y"],
          leadingIndicators: [],
        },
      },
      metadata: baseMetadata,
    });
    expect(r.bodies.futureOutlook).toContain("### 关键不确定性");
    expect(r.bodies.futureOutlook).toContain("- Uncertainty X");
  });

  it("foresight with leadingIndicators renders ### 值得跟踪的早期信号", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: {
        themeSummary: "exec",
        foresight: {
          baseCase: [
            {
              judgment: "J",
              probability: 0.5,
              confidence: "moderate",
              horizon: "0-6m",
              resolutionCriteria: "R",
              evidenceIds: [],
            },
          ],
          scenarios: [],
          predeterminedElements: [],
          criticalUncertainties: [],
          leadingIndicators: [
            { signal: "Signal A", watchFor: "Watch for X" },
            { signal: "Signal B", watchFor: "Watch for Y" },
          ],
        },
      },
      metadata: baseMetadata,
    });
    expect(r.bodies.futureOutlook).toContain("### 值得跟踪的早期信号");
    expect(r.bodies.futureOutlook).toContain("**Signal A** —— Watch for X");
    expect(r.bodies.futureOutlook).toContain("**Signal B** —— Watch for Y");
  });

  it("foresight undefined → futureOutlook is undefined", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: { themeSummary: "exec" },
      metadata: baseMetadata,
    });
    expect(r.bodies.futureOutlook).toBeUndefined();
  });

  it("foresight with empty baseCase array → futureOutlook is undefined", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: {
        themeSummary: "exec",
        foresight: {
          baseCase: [],
          scenarios: [],
          predeterminedElements: [],
          criticalUncertainties: [],
          leadingIndicators: [],
        },
      },
      metadata: baseMetadata,
    });
    expect(r.bodies.futureOutlook).toBeUndefined();
  });

  it("foresight with unknown confidence/horizon label falls back to raw value", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: {
        themeSummary: "exec",
        foresight: {
          baseCase: [
            {
              judgment: "J",
              probability: 0.9,
              confidence: "ultra-high" as never, // unknown label
              horizon: "100y" as never, // unknown label
              resolutionCriteria: "R",
              evidenceIds: [],
            },
          ],
          scenarios: [],
          predeterminedElements: [],
          criticalUncertainties: [],
          leadingIndicators: [],
        },
      },
      metadata: baseMetadata,
    });
    expect(r.bodies.futureOutlook).toContain("ultra-high");
    expect(r.bodies.futureOutlook).toContain("100y");
    expect(r.bodies.futureOutlook).toContain("90%");
  });

  it("foresight is also passed through to quickViewData.foresight", () => {
    const foresight = {
      baseCase: [
        {
          judgment: "J",
          probability: 0.5,
          confidence: "moderate" as const,
          horizon: "0-6m" as const,
          resolutionCriteria: "R",
          evidenceIds: [],
        },
      ],
      scenarios: [],
      predeterminedElements: [],
      criticalUncertainties: [],
      leadingIndicators: [],
    };
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: { themeSummary: "exec", foresight },
      metadata: baseMetadata,
    });
    expect(r.quickViewData?.foresight).toEqual(foresight);
  });

  // ── researcher result matching edge cases ─────────────────────────────────

  it("researcher fullMarkdown whitespace-only → body=null (trim returns empty)", () => {
    const r = extractReportSegments({
      plan: {
        themeSummary: "TS",
        dimensions: [{ id: "d1", name: "维度一", rationale: "" }],
      },
      researcherResults: [{ dimension: "d1", fullMarkdown: "   \n  " }],
      metadata: baseMetadata,
    });
    expect(r.bodies.perDimension[0].body).toBeNull();
  });

  it("researcher has summary but no fullMarkdown → uses summary", () => {
    const r = extractReportSegments({
      plan: {
        themeSummary: "TS",
        dimensions: [{ id: "d1", name: "dim-x", rationale: "" }],
      },
      researcherResults: [{ dimension: "d1", summary: "summary text" }],
      metadata: baseMetadata,
    });
    expect(r.bodies.perDimension[0].body).toBe("summary text");
  });

  it("no researcherResults → all perDimension bodies are null", () => {
    const r = extractReportSegments({
      plan: {
        themeSummary: "TS",
        dimensions: [
          { id: "d1", name: "A", rationale: "" },
          { id: "d2", name: "B", rationale: "" },
        ],
      },
      metadata: baseMetadata,
    });
    expect(r.bodies.perDimension[0].body).toBeNull();
    expect(r.bodies.perDimension[1].body).toBeNull();
  });

  it("analyst with null → treated as empty (fallback to {})", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: null,
      metadata: baseMetadata,
    });
    expect(r.bodies.executiveSummary).toBe("");
    expect(r.bodies.preface).toBe("");
  });

  it("reconcilerOutput=null → crossDimAnalysis fallback skips recon", () => {
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      analystOutput: {},
      reconcilerOutput: null,
      metadata: baseMetadata,
    });
    expect(r.bodies.crossDimAnalysis).toBeUndefined();
  });

  it("plan.themeSummary propagated to segments.plan", () => {
    const r = extractReportSegments({
      plan: {
        themeSummary: "My theme",
        dimensions: [{ id: "d1", name: "D", rationale: "R" }],
      },
      metadata: baseMetadata,
    });
    expect(r.plan.themeSummary).toBe("My theme");
    expect(r.plan.dimensions).toHaveLength(1);
  });

  it("qualityInputs passed through when provided", () => {
    const qi = {
      verifierScores: { d1: 90 },
      warnings: [{ dimension: "x", message: "y" }],
    };
    const r = extractReportSegments({
      plan: { themeSummary: "TS", dimensions: [] },
      metadata: baseMetadata,
      qualityInputs: qi as never,
    });
    expect(r.qualityInputs).toEqual(qi);
  });
});
