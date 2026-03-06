import {
  simplifyLatexNotation,
  stripRawMarkdownInContent,
  numberSubHeadings,
  hierarchicalNumberBoldListItems,
  deduplicateHeadings,
  sanitizeHeadingLevels,
} from "../report-formatting.utils";

describe("simplifyLatexNotation", () => {
  it("should convert \\frac to slash notation", () => {
    const input = "公式：\\frac{Q K^\\top}{\\sqrt{d_k}}";
    const result = simplifyLatexNotation(input);
    expect(result).not.toContain("\\frac");
    expect(result).toContain("/");
  });

  it("should convert \\text{} to plain text", () => {
    const input = "维度 \\text{model} 的值";
    const result = simplifyLatexNotation(input);
    expect(result).not.toContain("\\text");
    expect(result).toContain("model");
  });

  it("should convert common Greek letters", () => {
    const input = "参数 (\\theta) 和学习率 (\\eta)";
    const result = simplifyLatexNotation(input);
    expect(result).toContain("θ");
    expect(result).toContain("η");
  });

  it("should convert \\sqrt to √", () => {
    const input = "除以 (\\sqrt{d_k})";
    const result = simplifyLatexNotation(input);
    expect(result).toContain("√");
  });

  it("should not modify citation markers like [1]", () => {
    const input = "证据 [1] 和 [236]";
    const result = simplifyLatexNotation(input);
    expect(result).toBe(input);
  });

  it("should handle display math blocks", () => {
    const input = "公式：\n[\nQ = X W_Q\n]\n下文";
    const result = simplifyLatexNotation(input);
    expect(result).not.toContain("[");
    expect(result).toContain("Q = X W_Q");
  });

  it("should convert \\sum to Σ", () => {
    const input = "(\\sum_{i=1}^N x_i)";
    const result = simplifyLatexNotation(input);
    expect(result).toContain("Σ");
  });

  it("should handle \\approx", () => {
    const input = "(a \\approx b)";
    const result = simplifyLatexNotation(input);
    expect(result).toContain("≈");
  });
});

describe("stripRawMarkdownInContent", () => {
  it("should strip ** markers but keep text", () => {
    const input = "这是 **重要** 内容";
    const result = stripRawMarkdownInContent(input);
    expect(result).toBe("这是 重要 内容");
  });

  it("should handle multiple bold markers", () => {
    const input = "**标题** 和 **要点** 都重要";
    const result = stripRawMarkdownInContent(input);
    expect(result).toBe("标题 和 要点 都重要");
  });
});

describe("numberSubHeadings", () => {
  it("should number ### headings correctly", () => {
    const input = "### 背景概述\n内容\n### 现状分析\n内容";
    const result = numberSubHeadings(input, 1);
    expect(result).toContain("### 1.1. 背景概述");
    expect(result).toContain("### 1.2. 现状分析");
  });

  it("should number #### headings under their parent ###", () => {
    const input = "### 背景\n内容\n#### 子章节\n内容\n#### 子章节2\n内容";
    const result = numberSubHeadings(input, 2);
    expect(result).toContain("### 2.1. 背景");
    expect(result).toContain("#### 2.1.1. 子章节");
    expect(result).toContain("#### 2.1.2. 子章节2");
  });

  it("should strip existing numbering prefixes", () => {
    const input = "### 1. 背景概述\n内容\n### 2. 现状分析";
    const result = numberSubHeadings(input, 3);
    expect(result).toContain("### 3.1. 背景概述");
    expect(result).toContain("### 3.2. 现状分析");
  });

  it("should preserve 4-digit years", () => {
    const input = "### 2026年技术展望\n内容";
    const result = numberSubHeadings(input, 1);
    expect(result).toContain("### 1.1. 2026年技术展望");
  });
});

describe("deduplicateHeadings", () => {
  it("should remove duplicate headings", () => {
    const input = "### 背景概述\n内容\n### 1. 背景概述\n更多内容";
    const result = deduplicateHeadings(input);
    expect(result).toContain("### 背景概述");
    expect(result).not.toContain("### 1. 背景概述");
  });

  it("should detect duplicates with hierarchical numbering", () => {
    const input =
      "### 5.10. AI安全与伦理\n内容\n### 5.11. AI安全与伦理\n更多内容";
    const result = deduplicateHeadings(input);
    expect(result).toContain("### 5.10. AI安全与伦理");
    expect(result).not.toContain("### 5.11. AI安全与伦理");
  });
});

describe("sanitizeHeadingLevels", () => {
  it("should downgrade # and ## to ###", () => {
    const input = "# 标题\n内容\n## 二级标题\n内容";
    const result = sanitizeHeadingLevels(input);
    expect(result).toContain("### 标题");
    expect(result).toContain("### 二级标题");
  });

  it("should leave ### and #### unchanged", () => {
    const input = "### 三级标题\n内容\n#### 四级标题";
    const result = sanitizeHeadingLevels(input);
    expect(result).toBe(input);
  });
});

describe("hierarchicalNumberBoldListItems", () => {
  it("should renumber bold list items under ### sections", () => {
    const input = numberSubHeadings(
      "### 跨领域融合场景\n\n1. **闭环智能体**\n内容\n2. **复合场景**\n内容\n3. **垂直融合**\n内容",
      5,
    );
    // After numberSubHeadings: ### 5.14. (or 5.1. depending on count)
    const result = hierarchicalNumberBoldListItems(input);
    expect(result).toContain("5.1.1. **闭环智能体**");
    expect(result).toContain("5.1.2. **复合场景**");
    expect(result).toContain("5.1.3. **垂直融合**");
    expect(result).not.toMatch(/^1\.\s+\*\*/m);
  });

  it("should not affect regular list items (no bold)", () => {
    const input = numberSubHeadings("### 标题\n\n1. 普通列表项\n2. 另一项", 1);
    const result = hierarchicalNumberBoldListItems(input);
    expect(result).toContain("1. 普通列表项");
    expect(result).toContain("2. 另一项");
  });

  it("should reset counter for each new ### section", () => {
    const input = numberSubHeadings(
      "### 节一\n\n1. **A**\n2. **B**\n### 节二\n\n1. **C**\n2. **D**",
      3,
    );
    const result = hierarchicalNumberBoldListItems(input);
    expect(result).toContain("3.1.1. **A**");
    expect(result).toContain("3.1.2. **B**");
    expect(result).toContain("3.2.1. **C**");
    expect(result).toContain("3.2.2. **D**");
  });

  it("should handle timeline-style bold items", () => {
    const input = numberSubHeadings(
      "### 时间线\n\n1. **2010s初期（Word2Vec）**：内容\n2. **2018-2020（BERT）**：内容",
      6,
    );
    const result = hierarchicalNumberBoldListItems(input);
    expect(result).toContain("6.1.1. **2010s初期（Word2Vec）**");
    expect(result).toContain("6.1.2. **2018-2020（BERT）**");
  });
});

describe("simplifyLatexNotation - link safety", () => {
  it("should not destroy Markdown links [text](url)", () => {
    const input = "参见[人工智能技术发展综述](https://example.com)的分析";
    const result = simplifyLatexNotation(input);
    expect(result).toContain("[人工智能技术发展综述](https://example.com)");
  });

  it("should handle \\infty without producing ∈fty", () => {
    const input = "(x \\to \\infty)";
    const result = simplifyLatexNotation(input);
    expect(result).toContain("∞");
    expect(result).not.toContain("∈fty");
  });

  it("should handle \\int without producing ∈t", () => {
    const input = "(\\int_0^1 f(x) dx)";
    const result = simplifyLatexNotation(input);
    expect(result).toContain("∫");
    expect(result).not.toContain("∈t");
  });

  it("should still convert standalone \\in to ∈", () => {
    const input = "(x \\in S)";
    const result = simplifyLatexNotation(input);
    expect(result).toContain("∈");
  });
});
