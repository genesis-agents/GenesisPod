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
});
