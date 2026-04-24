/**
 * deterministic-review.ts · unit tests
 *
 * baseline review-dimension.executor.ts L442-L580 确定性评分逻辑回归。
 */

import { scoreDeterministically } from "../deterministic-review";

describe("scoreDeterministically", () => {
  it("returns all 0/low scores for empty analysis", () => {
    const r = scoreDeterministically({
      contentLength: 0,
      keyFindingsCount: 0,
      evidenceCount: 0,
    });
    expect(r.overallScore).toBeLessThan(40);
    expect(r.qualityLevel).toBe("rejected");
  });

  it("rates rich analysis as excellent/good", () => {
    const r = scoreDeterministically({
      contentLength: 5000,
      keyFindingsCount: 8,
      trendsCount: 4,
      challengesCount: 3,
      opportunitiesCount: 3,
      evidenceCount: 12,
      hasSummary: true,
      hasConfidenceLevel: true,
    });
    expect(r.overallScore).toBeGreaterThanOrEqual(75);
    expect(["excellent", "good"]).toContain(r.qualityLevel);
  });

  it("overallScore uses baseline weights (breadth/depth/evidence 0.25 each, coherence 0.15, currency 0.1)", () => {
    const r = scoreDeterministically({
      contentLength: 3000,
      keyFindingsCount: 5,
      trendsCount: 3,
      challengesCount: 2,
      opportunitiesCount: 2,
      evidenceCount: 10,
      hasSummary: true,
      hasConfidenceLevel: true,
    });
    // breadth = 40+20+20+20 = 100
    // depth = 50+30+20 = 100
    // evidence = 90 (>=10)
    // coherence = 30+30+20+20 = 100
    // currency = 75
    // overall = 100*0.25 + 100*0.25 + 90*0.25 + 100*0.15 + 75*0.1 = 25+25+22.5+15+7.5 = 95
    expect(r.overallScore).toBe(95);
    expect(r.qualityLevel).toBe("excellent");
  });

  it("currency defaults to 75 (no LLM context)", () => {
    const r = scoreDeterministically({
      contentLength: 100,
      keyFindingsCount: 1,
      evidenceCount: 1,
    });
    expect(r.scores.currency).toBe(75);
  });

  it("flags shallow_analysis when content < 500 chars", () => {
    const r = scoreDeterministically({
      contentLength: 300,
      keyFindingsCount: 5,
      evidenceCount: 5,
    });
    expect(r.issues.some((i) => i.type === "shallow_analysis")).toBe(true);
  });

  it("flags missing_coverage when keyFindings < 3", () => {
    const r = scoreDeterministically({
      contentLength: 2000,
      keyFindingsCount: 2,
      evidenceCount: 5,
    });
    expect(r.issues.some((i) => i.type === "missing_coverage")).toBe(true);
  });

  it("flags weak_evidence when evidenceCount < 3", () => {
    const r = scoreDeterministically({
      contentLength: 2000,
      keyFindingsCount: 5,
      evidenceCount: 1,
    });
    expect(r.issues.some((i) => i.type === "weak_evidence")).toBe(true);
  });

  it("quality level thresholds: 90/75/60/40", () => {
    const checkThreshold = (overall: number) =>
      overall >= 90
        ? "excellent"
        : overall >= 75
          ? "good"
          : overall >= 60
            ? "acceptable"
            : overall >= 40
              ? "needs_revision"
              : "rejected";

    // spot check mid-range case
    const mid = scoreDeterministically({
      contentLength: 1500,
      keyFindingsCount: 4,
      trendsCount: 2,
      challengesCount: 1,
      opportunitiesCount: 1,
      evidenceCount: 5,
      hasSummary: true,
    });
    expect(mid.qualityLevel).toBe(checkThreshold(mid.overallScore));
  });
});
