/**
 * artifact.projector.spec.ts
 *
 * Unit tests for:
 *   - projectArtifact()
 *   - normalizeV1ToV2()
 * covering every branch to reach 95%+ coverage.
 */

import { projectArtifact, normalizeV1ToV2 } from "../artifact.projector";

// ---------------------------------------------------------------------------
// Minimal MissionDetail fixture builder
// ---------------------------------------------------------------------------

function makeMissionDetail(
  overrides: {
    reportFull?: unknown;
    reportFullSize?: number | null;
  } = {},
): any {
  return {
    id: "m1",
    topic: "Test Topic",
    depth: "standard",
    language: "zh-CN",
    status: "running",
    startedAt: new Date("2025-01-01"),
    completedAt: null,
    elapsedWallTimeMs: null,
    finalScore: null,
    tokensUsed: null,
    costUsd: null,
    reportTitle: null,
    reportSummary: null,
    errorMessage: null,
    visibility: "private",
    terminalOutcome: null,
    failureCode: null,
    configSnapshot: null,
    maxCredits: 100,
    themeSummary: null,
    dimensions: null,
    reportFull: overrides.hasOwnProperty("reportFull")
      ? overrides.reportFull
      : null,
    verdicts: null,
    trajectoryStored: null,
    reportArtifactVersion: null,
    userProfile: null,
    reconciliationReport: null,
    leaderJournal: null,
    leaderOverallScore: null,
    leaderSigned: null,
    leaderVerdict: null,
    ...overrides,
  };
}

// A valid V2 artifact
const validV2: any = {
  content: { fullMarkdown: "# Hello", fullReportSize: 7 },
  sections: [],
  citations: [],
  figures: [],
  quickView: {
    executiveSummary: { markdown: "", wordCount: 0 },
    topHighlights: [],
    topTrends: [],
    keyRisks: [],
    topRecommendations: [],
    keyCitations: [],
    keyFigures: [],
    estimatedReadingTime: 1,
    whatYouWillLearn: [],
    riskMatrix: [],
    keyFindingsByDimension: [],
  },
  metadata: {
    topic: "Test",
    generatedAt: "2025-01-01T00:00:00.000Z",
    generationTimeMs: 0,
    version: 1,
    isIncremental: false,
    dimensionCount: 0,
    sourceCount: 0,
    factCount: 0,
    figureCount: 0,
    wordCount: 7,
    readingTimeMinutes: 1,
    styleProfile: "executive",
    lengthProfile: "standard",
    audienceProfile: "domain-expert",
    language: "zh-CN",
    totalTokens: { prompt: 0, completion: 0, total: 0 },
    costCents: 0,
    modelTrail: [],
  },
  quality: {
    overall: 0,
    dimensions: {
      traceability: 0,
      factualConsistency: 0,
      novelty: 0,
      coverage: 0,
      redundancy: 0,
      formatCorrectness: 0,
      citationDensity: 0,
      styleConformance: 0,
      lengthAccuracy: 0,
      chapterBalance: 0,
    },
    hardGateViolations: [],
    warnings: [],
    qualityTrace: [],
  },
  factTable: [],
};

// ---------------------------------------------------------------------------
// Tests for projectArtifact()
// ---------------------------------------------------------------------------

describe("projectArtifact", () => {
  describe("when reportFull is null", () => {
    it("returns not-yet-materialized sentinel when no reportFullSize", () => {
      const row = makeMissionDetail({ reportFull: null, reportFullSize: null });
      const result = projectArtifact(row);
      expect(result).toEqual({
        kind: "empty-artifact",
        reason: "not-yet-materialized",
      });
    });

    it("returns not-yet-materialized sentinel when reportFullSize = 0", () => {
      const row = makeMissionDetail({ reportFull: null, reportFullSize: 0 });
      const result = projectArtifact(row);
      expect(result).toEqual({
        kind: "empty-artifact",
        reason: "not-yet-materialized",
      });
    });

    it("returns v1-needs-normalization sentinel when reportFullSize > 0 (off-load)", () => {
      const row = makeMissionDetail({ reportFull: null, reportFullSize: 999 });
      const result = projectArtifact(row);
      expect(result).toEqual({
        kind: "empty-artifact",
        reason: "v1-needs-normalization",
      });
    });
  });

  describe("when reportFull is a valid V2 artifact", () => {
    it("returns the raw V2 object directly", () => {
      const row = makeMissionDetail({ reportFull: validV2 });
      const result = projectArtifact(row);
      expect(result).toBe(validV2);
    });
  });

  describe("when reportFull is a V1 shape", () => {
    it("normalizes V1 with title+summary+sections", () => {
      const v1 = {
        title: "My Report",
        summary: "Executive summary here",
        sections: [{ heading: "Chapter One", body: "Body text" }],
      };
      const row = makeMissionDetail({ reportFull: v1 });
      const result = projectArtifact(row) as any;
      expect(result.metadata.topic).toBe("My Report");
      expect(result.quickView.executiveSummary.markdown).toBe(
        "Executive summary here",
      );
      expect(result.sections.length).toBeGreaterThan(0);
    });

    it("normalizes V1 with only summary (no sections, no title)", () => {
      const v1 = { summary: "Just a summary" };
      const row = makeMissionDetail({ reportFull: v1 });
      const result = projectArtifact(row) as any;
      expect(result.metadata.topic).toBe("研究报告");
    });

    it("normalizes V1 with only title", () => {
      const v1 = { title: "Only Title" };
      const row = makeMissionDetail({ reportFull: v1 });
      const result = projectArtifact(row) as any;
      expect(result.metadata.topic).toBe("Only Title");
    });
  });

  describe("when reportFull is an unrecognized shape", () => {
    it("returns v1-needs-normalization for a plain number", () => {
      const row = makeMissionDetail({ reportFull: 42 });
      const result = projectArtifact(row);
      expect(result).toEqual({
        kind: "empty-artifact",
        reason: "v1-needs-normalization",
      });
    });

    it("returns v1-needs-normalization for an empty object", () => {
      const row = makeMissionDetail({ reportFull: {} });
      const result = projectArtifact(row);
      expect(result).toEqual({
        kind: "empty-artifact",
        reason: "v1-needs-normalization",
      });
    });

    it("returns v1-needs-normalization for object missing v2 fields and v1 fields", () => {
      const row = makeMissionDetail({ reportFull: { foo: "bar" } });
      const result = projectArtifact(row);
      expect(result).toEqual({
        kind: "empty-artifact",
        reason: "v1-needs-normalization",
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Tests for normalizeV1ToV2()
// ---------------------------------------------------------------------------

describe("normalizeV1ToV2", () => {
  it("uses default title '研究报告' when title is missing", () => {
    const result = normalizeV1ToV2({});
    expect(result.metadata.topic).toBe("研究报告");
  });

  it("uses provided title", () => {
    const result = normalizeV1ToV2({ title: "My Study" });
    expect(result.metadata.topic).toBe("My Study");
  });

  it("handles empty summary (falsy path)", () => {
    const result = normalizeV1ToV2({ title: "T", summary: "" });
    expect(result.quickView.executiveSummary.markdown).toBe("");
    // no sec-summary section since summary is falsy
    expect(result.sections.find((s) => s.id === "sec-summary")).toBeUndefined();
  });

  it("adds sec-summary section when summary is present", () => {
    const result = normalizeV1ToV2({ title: "T", summary: "Hello" });
    const sec = result.sections.find((s) => s.id === "sec-summary");
    expect(sec).toBeDefined();
    expect(sec!.type).toBe("executive_summary");
  });

  it("includes fullMarkdown with title when no summary", () => {
    const result = normalizeV1ToV2({ title: "Report" });
    expect(result.content.fullMarkdown).toContain("# Report");
  });

  it("includes fullMarkdown with title and summary", () => {
    const result = normalizeV1ToV2({ title: "Report", summary: "Sum" });
    expect(result.content.fullMarkdown).toContain("# Report");
    expect(result.content.fullMarkdown).toContain("Sum");
  });

  it("processes sections array", () => {
    const result = normalizeV1ToV2({
      sections: [
        { heading: "Chapter A", body: "Body A" },
        { heading: "Chapter B", body: "Body B" },
      ],
    });
    expect(result.sections.filter((s) => s.type === "dimension")).toHaveLength(
      2,
    );
    expect(result.content.fullMarkdown).toContain("Chapter A");
    expect(result.content.fullMarkdown).toContain("Chapter B");
  });

  it("uses fallback heading '章节 N' when heading is missing (empty string)", () => {
    // Note: "" is NOT null/undefined so ?? won't fire. Use null to trigger ?? branch.
    const result = normalizeV1ToV2({
      sections: [{ heading: null, body: "body" } as any],
    });
    const dimSec = result.sections.find((s) => s.type === "dimension");
    expect(dimSec).toBeDefined();
    expect(dimSec!.title).toBe("章节 1");
  });

  it("uses fallback body '' when body is undefined (?? branch)", () => {
    const result = normalizeV1ToV2({
      sections: [{ heading: "H", body: undefined } as any],
    });
    const dimSec = result.sections.find((s) => s.type === "dimension");
    expect(dimSec).toBeDefined();
    expect(dimSec!.wordCount).toBe(0);
  });

  it("trims empty body in sections", () => {
    const result = normalizeV1ToV2({
      sections: [{ heading: "H", body: "  " }],
    });
    const dimSec = result.sections.find((s) => s.type === "dimension");
    expect(dimSec).toBeDefined();
    expect(dimSec!.wordCount).toBe(0);
  });

  it("adds conclusion section when v1.conclusion is present", () => {
    const result = normalizeV1ToV2({ conclusion: "The end." });
    const conclusionSec = result.sections.find((s) => s.type === "conclusion");
    expect(conclusionSec).toBeDefined();
    expect(conclusionSec!.title).toBe("结论");
    expect(result.content.fullMarkdown).toContain("The end.");
  });

  it("processes citations array", () => {
    const result = normalizeV1ToV2({
      citations: ["https://example.com/page", "not-a-url"],
    });
    expect(result.citations).toHaveLength(2);
    expect(result.citations[0].domain).toBe("example.com");
    expect(result.citations[0].title).toBe("example.com");
    expect(result.citations[1].domain).toBe("");
    // fallback to url when domain is empty
    expect(result.citations[1].title).toBe("not-a-url");
  });

  it("handles missing citations (undefined)", () => {
    const result = normalizeV1ToV2({ title: "T" });
    expect(result.citations).toEqual([]);
    expect(result.metadata.sourceCount).toBe(0);
  });

  it("computes readingTimeMinutes for fullMarkdown", () => {
    // A large block of text to see estimateReadingTime > 1
    const longSummary = "x".repeat(800);
    const result = normalizeV1ToV2({ summary: longSummary });
    expect(result.metadata.readingTimeMinutes).toBeGreaterThanOrEqual(2);
  });

  it("readingTimeMinutes minimum is 1 for short text", () => {
    const result = normalizeV1ToV2({ summary: "short" });
    expect(result.quickView.estimatedReadingTime).toBe(1);
  });

  it("fills all required quality.dimensions with zeros", () => {
    const result = normalizeV1ToV2({});
    expect(result.quality.overall).toBe(0);
    expect(result.quality.dimensions.traceability).toBe(0);
    expect(result.quality.dimensions.chapterBalance).toBe(0);
  });

  it("fills schema-complete empty collections", () => {
    const result = normalizeV1ToV2({});
    expect(result.figures).toEqual([]);
    expect(result.factTable).toEqual([]);
    expect(result.quality.hardGateViolations).toEqual([]);
    expect(result.quality.warnings).toEqual([]);
    expect(result.quality.qualityTrace).toEqual([]);
  });

  it("sets metadata.isIncremental to false", () => {
    const result = normalizeV1ToV2({ title: "T" });
    expect(result.metadata.isIncremental).toBe(false);
  });

  it("sets metadata.language to zh-CN", () => {
    const result = normalizeV1ToV2({});
    expect(result.metadata.language).toBe("zh-CN");
  });

  it("sets totalTokens to zeros", () => {
    const result = normalizeV1ToV2({});
    expect(result.metadata.totalTokens).toEqual({
      prompt: 0,
      completion: 0,
      total: 0,
    });
  });

  it("correctly computes section startOffset and endOffset", () => {
    const result = normalizeV1ToV2({
      summary: "Sum",
      sections: [{ heading: "Sec1", body: "Body1" }],
    });
    const dim = result.sections.find((s) => s.type === "dimension")!;
    expect(dim.startOffset).toBeGreaterThan(0);
    expect(dim.endOffset).toBeGreaterThan(dim.startOffset);
  });

  it("non-array sections field is handled gracefully", () => {
    const result = normalizeV1ToV2({ sections: "not-an-array" as any });
    // should produce no dimension sections
    expect(result.sections.filter((s) => s.type === "dimension")).toHaveLength(
      0,
    );
  });

  it("citation with www prefix strips it from domain", () => {
    const result = normalizeV1ToV2({
      citations: ["https://www.example.org/path"],
    });
    expect(result.citations[0].domain).toBe("example.org");
  });
});
