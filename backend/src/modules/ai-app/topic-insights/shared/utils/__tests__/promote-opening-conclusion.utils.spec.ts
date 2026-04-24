/**
 * promote-opening-conclusion.utils.ts · unit tests
 *
 * baseline `research-leader.integrateDimensionResults` 的 Direction B 规则：
 * 维度第一节若以 > **核心判断**： 开头，blockquote 必须出现在 ### 标题之前。
 */

import {
  assembleSectionsWithPromotedConclusion,
  extractOpeningConclusion,
} from "../promote-opening-conclusion.utils";

describe("extractOpeningConclusion", () => {
  it("returns empty when no conclusion marker", () => {
    const res = extractOpeningConclusion("第一段正文...");
    expect(res.conclusionLine).toBe("");
    expect(res.remaining).toBe("第一段正文...");
  });

  it("extracts 核心判断 blockquote", () => {
    const content = "> **核心判断**：AI 将重塑行业。\n\n正文...";
    const res = extractOpeningConclusion(content);
    expect(res.conclusionLine).toBe("> **核心判断**：AI 将重塑行业。");
    expect(res.remaining).toBe("正文...");
  });

  it("extracts Key Finding blockquote (English)", () => {
    const content = "> **Key Finding**：XYZ is rising.\n\nBody...";
    const res = extractOpeningConclusion(content);
    expect(res.conclusionLine).toContain("Key Finding");
    expect(res.remaining).toBe("Body...");
  });

  it("handles varying asterisk count (*/**/***/****)", () => {
    const content = "> ****核心判断****：极度强调。\n内容";
    const res = extractOpeningConclusion(content);
    expect(res.conclusionLine).toContain("核心判断");
  });
});

describe("assembleSectionsWithPromotedConclusion", () => {
  it("promotes first-section conclusion above ### heading", () => {
    const sections = [
      {
        title: "背景概述",
        content: "> **核心判断**：重要结论。\n\n以下是详细分析...",
      },
      { title: "详细分析", content: "第二节内容" },
    ];
    const result = assembleSectionsWithPromotedConclusion(sections);
    // 核心判断必须在第一个 ### 之前
    const conclusionIdx = result.indexOf("核心判断");
    const firstHeadingIdx = result.indexOf("### 背景概述");
    expect(conclusionIdx).toBeGreaterThanOrEqual(0);
    expect(firstHeadingIdx).toBeGreaterThan(conclusionIdx);
  });

  it("does not promote when first section has no conclusion", () => {
    const sections = [
      { title: "引言", content: "常规引言内容" },
      { title: "第二节", content: "第二节内容" },
    ];
    const result = assembleSectionsWithPromotedConclusion(sections);
    expect(result.indexOf("### 引言")).toBe(0);
  });

  it("only first section is checked for promotion (2nd section conclusion stays inline)", () => {
    const sections = [
      { title: "背景", content: "背景内容" },
      {
        title: "核心发现",
        content: "> **核心判断**：不应被提升。\n\n正文",
      },
    ];
    const result = assembleSectionsWithPromotedConclusion(sections);
    // 第 2 节的 conclusion 必须留在原位
    const heading2Idx = result.indexOf("### 核心发现");
    const conclusionIdx = result.indexOf("核心判断");
    expect(conclusionIdx).toBeGreaterThan(heading2Idx);
  });

  it("handles empty sections", () => {
    expect(assembleSectionsWithPromotedConclusion([])).toBe("");
  });
});
