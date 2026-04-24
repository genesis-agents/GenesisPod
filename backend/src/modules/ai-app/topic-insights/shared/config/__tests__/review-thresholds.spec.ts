/**
 * review-thresholds.ts · unit tests
 *
 * baseline review-dimension.executor.ts parseRevisionRound/determineRevisionTargets
 * 阈值逻辑硬回归防护。
 */

import {
  parseRevisionRound,
  determineRevisionTargets,
  MAX_REVISION_ROUNDS,
  REVIEW_FAILURE_THRESHOLDS as T,
} from "../review-thresholds";

describe("parseRevisionRound", () => {
  it("defaults to 1 when no marker", () => {
    expect(parseRevisionRound("普通任务描述")).toBe(1);
    expect(parseRevisionRound("")).toBe(1);
    expect(parseRevisionRound(null)).toBe(1);
    expect(parseRevisionRound(undefined)).toBe(1);
  });

  it("extracts round from [revision:N] marker", () => {
    expect(parseRevisionRound("研究: XX [revision:2]")).toBe(2);
    expect(parseRevisionRound("研究: YY [revision:5]")).toBe(5);
  });

  it("returns 1 on malformed marker", () => {
    expect(parseRevisionRound("[revision:abc]")).toBe(1);
    expect(parseRevisionRound("[revision:]")).toBe(1);
  });
});

describe("determineRevisionTargets", () => {
  const passingReview = {
    dimensionId: "d1",
    dimensionName: "Dim 1",
    overallScore: 80,
    scores: { evidence: 70, depth: 70, breadth: 70, coherence: 70 },
    suggestions: ["improve X"],
  };

  it("returns empty when all reviews pass thresholds", () => {
    const res = determineRevisionTargets(
      [passingReview],
      [{ id: "t1", dimensionId: "d1" }],
      1,
    );
    expect(res.needsRevision).toBe(false);
    expect(res.targets).toEqual([]);
  });

  it("enforces hard cap MAX_REVISION_ROUNDS (round >= 2 → no revision)", () => {
    const failingReview = {
      dimensionId: "d1",
      overallScore: 40,
      scores: { evidence: 20, depth: 20, breadth: 20, coherence: 20 },
    };
    const res = determineRevisionTargets(
      [failingReview],
      [{ id: "t1", dimensionId: "d1" }],
      MAX_REVISION_ROUNDS,
    );
    expect(res.needsRevision).toBe(false);
  });

  it("triggers revision on overallScore below threshold", () => {
    const review = {
      dimensionId: "d1",
      overallScore: T.overall - 1,
      scores: { evidence: 100, depth: 100, breadth: 100, coherence: 100 },
    };
    const res = determineRevisionTargets(
      [review],
      [{ id: "t1", dimensionId: "d1" }],
      1,
    );
    expect(res.needsRevision).toBe(true);
    expect(res.targets[0].taskId).toBe("t1");
    expect(res.targets[0].feedback).toContain(`< ${T.overall}`);
  });

  it("triggers revision on evidence below threshold", () => {
    const review = {
      dimensionId: "d1",
      overallScore: 90,
      scores: {
        evidence: T.evidence - 1,
        depth: 100,
        breadth: 100,
        coherence: 100,
      },
    };
    const res = determineRevisionTargets(
      [review],
      [{ id: "t1", dimensionId: "d1" }],
      1,
    );
    expect(res.needsRevision).toBe(true);
  });

  it("skips review when no matching task found", () => {
    const review = {
      dimensionId: "d-unknown",
      overallScore: 10,
      scores: { evidence: 10, depth: 10, breadth: 10, coherence: 10 },
    };
    const res = determineRevisionTargets(
      [review],
      [{ id: "t1", dimensionId: "d1" }],
      1,
    );
    expect(res.targets).toEqual([]);
  });

  it("feedback includes top-3 suggestions", () => {
    const review = {
      dimensionId: "d1",
      overallScore: 30,
      scores: { evidence: 10, depth: 10, breadth: 10, coherence: 10 },
      suggestions: ["s1", "s2", "s3", "s4"],
    };
    const res = determineRevisionTargets(
      [review],
      [{ id: "t1", dimensionId: "d1" }],
      1,
    );
    expect(res.targets[0].feedback).toContain("s1");
    expect(res.targets[0].feedback).toContain("s3");
    expect(res.targets[0].feedback).not.toContain("s4");
  });
});
