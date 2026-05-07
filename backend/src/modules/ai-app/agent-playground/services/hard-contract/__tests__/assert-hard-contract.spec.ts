// PR-6 v1.6 D4 assertHardContract — RV-7 / RV-7a / RV-7b 反向证据
//
// 核心反转：硬合约不达标 → 永远不 fail mission，只 markCompleted + qualityGap

import {
  assertHardContract,
  type ChapterContractInput,
} from "../assert-hard-contract";

const fillChapters = (
  count: number,
  partial: Partial<ChapterContractInput>,
): ChapterContractInput[] =>
  Array.from({ length: count }, (_, i) => ({
    dimension: `dim-${i}`,
    chapterIndex: 1,
    wordCount: 4000,
    figureCount: 3,
    citationCount: 2,
    subSectionCount: null,
    ...partial,
  }));

describe("PR-6 v1.6 D4 assertHardContract — RV-7", () => {
  it("RV-7: deep mission 全章节 figureCount=0 + retry 3 次 → markCompleted + qualityGap（绝不 failed）", () => {
    const r = assertHardContract({
      scale: "deep",
      withCitations: true,
      chapters: fillChapters(10, {
        figureCount: 0,
        subSectionCount: 3,
        wordCount: 13000,
      }),
      retriesAttempted: { "s3-5-figure-curator": 3 },
      budgetRemaining: 0.5,
    });
    expect(r.allPassed).toBe(false);
    const figGap = r.gaps.find((g) => g.contractKey === "figPerCh");
    expect(figGap).toBeDefined();
    expect(figGap!.retriesAttempted).toBe(3);
    expect(figGap!.expected).toContain("≥ 3");
    // 关键：返回 gaps 而非 throw — markCompleted 仍可走（不阻断 mission）
  });

  it("RV-7a: budget 不足时 userActionsAvailable 不含 retry-budget-allowed", () => {
    const r = assertHardContract({
      scale: "deep",
      withCitations: true,
      chapters: fillChapters(10, {
        figureCount: 0,
        subSectionCount: 3,
        wordCount: 13000,
      }),
      retriesAttempted: { "s3-5-figure-curator": 3 },
      budgetRemaining: 0.01, // 几乎耗尽
    });
    const figGap = r.gaps.find((g) => g.contractKey === "figPerCh")!;
    expect(figGap.userActionsAvailable).not.toContain("retry-budget-allowed");
    expect(figGap.userActionsAvailable).toContain("accept-as-is");
    expect(figGap.userActionsAvailable).toContain("contact-support");
  });

  it("budget 充足时含 retry-budget-allowed 选项", () => {
    const r = assertHardContract({
      scale: "deep",
      withCitations: true,
      chapters: fillChapters(10, {
        figureCount: 0,
        subSectionCount: 3,
        wordCount: 13000,
      }),
      retriesAttempted: { "s3-5-figure-curator": 3 },
      budgetRemaining: 5.0,
    });
    const figGap = r.gaps.find((g) => g.contractKey === "figPerCh")!;
    expect(figGap.userActionsAvailable).toContain("retry-budget-allowed");
  });

  it("全合约满足 → allPassed=true / gaps 空", () => {
    const r = assertHardContract({
      scale: "deep",
      withCitations: true,
      chapters: fillChapters(10, {
        figureCount: 3,
        subSectionCount: 3,
        wordCount: 13000,
        citationCount: 2,
      }),
      retriesAttempted: {},
      budgetRemaining: 5.0,
    });
    expect(r.allPassed).toBe(true);
    expect(r.gaps).toHaveLength(0);
  });

  it("章数偏差 > 1 → totalChapters gap", () => {
    const r = assertHardContract({
      scale: "deep",
      withCitations: false,
      chapters: fillChapters(7, {
        figureCount: 3,
        subSectionCount: 3,
        wordCount: 13000,
      }), // 期望 10
      retriesAttempted: {},
      budgetRemaining: 1.0,
    });
    expect(r.gaps.find((g) => g.contractKey === "totalChapters")).toBeDefined();
  });

  it("章数偏差 = 1 → 容差通过", () => {
    const r = assertHardContract({
      scale: "deep",
      withCitations: false,
      chapters: fillChapters(9, {
        figureCount: 3,
        subSectionCount: 3,
        wordCount: 13000,
      }), // 期望 10
      retriesAttempted: {},
      budgetRemaining: 1.0,
    });
    expect(
      r.gaps.find((g) => g.contractKey === "totalChapters"),
    ).toBeUndefined();
  });

  it("wordCount 越界（< 0.7×min）→ wordsPerCh gap", () => {
    const r = assertHardContract({
      scale: "deep",
      withCitations: false,
      chapters: fillChapters(10, {
        figureCount: 3,
        subSectionCount: 3,
        wordCount: 5000, // < 0.7 × 12000 = 8400
      }),
      retriesAttempted: {},
      budgetRemaining: 1.0,
    });
    expect(r.gaps.find((g) => g.contractKey === "wordsPerCh")).toBeDefined();
  });

  it("wordCount 在 [0.7×min, 1.5×max] 区间 → 通过", () => {
    const r = assertHardContract({
      scale: "deep",
      withCitations: false,
      chapters: fillChapters(10, {
        figureCount: 3,
        subSectionCount: 3,
        wordCount: 22000, // < 1.5 × 15000 = 22500
      }),
      retriesAttempted: {},
      budgetRemaining: 1.0,
    });
    expect(r.gaps.find((g) => g.contractKey === "wordsPerCh")).toBeUndefined();
  });

  it("PR-13 sub-section path: subSectionCount mismatch → subSectionCount gap", () => {
    const r = assertHardContract({
      scale: "deep",
      withCitations: false,
      chapters: fillChapters(10, {
        figureCount: 3,
        subSectionCount: 1, // 期望 3
        wordCount: 13000,
      }),
      retriesAttempted: {},
      budgetRemaining: 1.0,
    });
    expect(
      r.gaps.find((g) => g.contractKey === "subSectionCount"),
    ).toBeDefined();
  });

  it("withCitations=true 但章节 citation=0 → citationsPerCh gap", () => {
    const r = assertHardContract({
      scale: "deep",
      withCitations: true,
      chapters: fillChapters(10, {
        figureCount: 3,
        subSectionCount: 3,
        wordCount: 13000,
        citationCount: 0,
      }),
      retriesAttempted: {},
      budgetRemaining: 1.0,
    });
    expect(
      r.gaps.find((g) => g.contractKey === "citationsPerCh"),
    ).toBeDefined();
  });

  it("withCitations=false → citationsPerCh 不校验", () => {
    const r = assertHardContract({
      scale: "deep",
      withCitations: false,
      chapters: fillChapters(10, {
        figureCount: 3,
        subSectionCount: 3,
        wordCount: 13000,
        citationCount: 0,
      }),
      retriesAttempted: {},
      budgetRemaining: 1.0,
    });
    expect(
      r.gaps.find((g) => g.contractKey === "citationsPerCh"),
    ).toBeUndefined();
  });

  it("lock-experimental 档（publication / encyclopedia）不校验，allPassed=true", () => {
    const r = assertHardContract({
      scale: "publication",
      withCitations: true,
      chapters: [],
      retriesAttempted: {},
      budgetRemaining: 0,
    });
    expect(r.allPassed).toBe(true);
    expect(r.gaps).toHaveLength(0);
  });

  it("quick 档 figPerCh=0 → 永远不会触发 figPerCh gap", () => {
    const r = assertHardContract({
      scale: "quick",
      withCitations: false,
      chapters: fillChapters(6, { figureCount: 0, wordCount: 1000 }),
      retriesAttempted: {},
      budgetRemaining: 1.0,
    });
    expect(r.gaps.find((g) => g.contractKey === "figPerCh")).toBeUndefined();
  });
});
