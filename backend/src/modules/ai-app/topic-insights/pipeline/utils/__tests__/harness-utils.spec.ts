/**
 * Tier Core Group B · Utility 单元测试
 *
 * 覆盖 5 个 batch-1 utilities 的核心行为 + 边界 case。
 */

import {
  citationDensityCheck,
  countDimensionEvidence,
  isValidFigureUrl,
  numberSubHeadings,
  stripHtmlTags,
} from "..";

describe("numberSubHeadings", () => {
  it("给 ### 标题加编号", () => {
    const input = "### A\n内容\n### B";
    expect(numberSubHeadings(input, 3)).toBe("### 3.1 A\n内容\n### 3.2 B");
  });

  it("给 #### 标题加三级编号", () => {
    const input = "### A\n#### A1\n#### A2";
    expect(numberSubHeadings(input, 2)).toBe(
      "### 2.1 A\n#### 2.1.1 A1\n#### 2.1.2 A2",
    );
  });

  it("已带编号的标题不重复编号", () => {
    const input = "### 1.1 已编号\n### 新标题";
    const out = numberSubHeadings(input, 1);
    expect(out).toContain("### 1.1 已编号");
    // 新标题保留独立计数：不重复处理已编号的第一个，但新标题编号为 1.1 还是 1.2?
    // 按实现，跳过 ALREADY_NUMBERED 不计数 → 新标题会成为 1.1（subIndex从0起）
    expect(out).toContain("### 1.1 新标题");
  });

  it("空输入或 sectionIndex<1 → 原样返回", () => {
    expect(numberSubHeadings("", 1)).toBe("");
    expect(numberSubHeadings("### A", 0)).toBe("### A");
  });

  it("includeLevel4=false 不给 #### 编号", () => {
    const input = "### A\n#### A1";
    const out = numberSubHeadings(input, 1, { includeLevel4: false });
    expect(out).toBe("### 1.1 A\n#### A1");
  });

  it("不处理 # / ## 顶级标题", () => {
    const input = "# 顶级\n## 二级\n### 三级";
    const out = numberSubHeadings(input, 1);
    expect(out).toBe("# 顶级\n## 二级\n### 1.1 三级");
  });
});

describe("stripHtmlTags", () => {
  it("剥离简单标签", () => {
    expect(stripHtmlTags("<p>hello <b>world</b></p>")).toBe("hello world");
  });

  it("<br/> → 换行", () => {
    expect(stripHtmlTags("A<br/>B")).toBe("A\nB");
  });

  it("转义实体反解", () => {
    expect(stripHtmlTags("A &amp; B &lt;c&gt; &nbsp; &quot;d&quot;")).toBe(
      'A & B <c>   "d"',
    );
  });

  it("数字实体反解", () => {
    expect(stripHtmlTags("&#65;&#x42;")).toBe("AB");
  });

  it("连续空行合并到最多 2 个换行", () => {
    const input = "A<br/><br/><br/><br/>B";
    const out = stripHtmlTags(input);
    expect(out).toBe("A\n\nB");
  });

  it("null/undefined/空字符串 → 空字符串", () => {
    expect(stripHtmlTags(null)).toBe("");
    expect(stripHtmlTags(undefined)).toBe("");
    expect(stripHtmlTags("")).toBe("");
  });
});

describe("isValidFigureUrl", () => {
  it("http/https + 图片后缀 → valid", () => {
    expect(isValidFigureUrl("https://example.com/img.png")).toBe(true);
    expect(isValidFigureUrl("http://example.com/pic.jpg?x=1")).toBe(true);
    expect(isValidFigureUrl("https://example.com/s.svg")).toBe(true);
  });

  it("query 含 format=png → valid", () => {
    expect(isValidFigureUrl("https://api.com/chart?format=png")).toBe(true);
  });

  it("无图片特征 → invalid", () => {
    expect(isValidFigureUrl("https://example.com/page.html")).toBe(false);
    expect(isValidFigureUrl("https://example.com/")).toBe(false);
  });

  it("非 http/https 协议 → invalid", () => {
    expect(isValidFigureUrl("data:image/png;base64,iVBORw")).toBe(false);
    expect(isValidFigureUrl("javascript:alert(1)")).toBe(false);
    expect(isValidFigureUrl("file:///etc/passwd")).toBe(false);
  });

  it("私有网段 → invalid", () => {
    expect(isValidFigureUrl("http://localhost/a.png")).toBe(false);
    expect(isValidFigureUrl("http://127.0.0.1/a.png")).toBe(false);
    expect(isValidFigureUrl("http://10.0.0.1/a.png")).toBe(false);
  });

  it("非字符串输入 → invalid", () => {
    expect(isValidFigureUrl(null)).toBe(false);
    expect(isValidFigureUrl(undefined)).toBe(false);
    expect(isValidFigureUrl(123)).toBe(false);
  });

  it("过长 URL → invalid", () => {
    expect(isValidFigureUrl("https://x.com/" + "a".repeat(2100))).toBe(false);
  });
});

describe("countDimensionEvidence", () => {
  it("按 dimensionId 分组聚合", () => {
    const stats = countDimensionEvidence([
      {
        dimensionId: "d1",
        credibilityScore: 80,
        url: "https://a.com/x",
      },
      {
        dimensionId: "d1",
        credibilityScore: 50,
        url: "https://a.com/y",
      },
      {
        dimensionId: "d2",
        credibilityScore: 90,
        url: "https://b.com/z",
      },
    ]);

    expect(stats).toHaveLength(2);
    const d1 = stats.find((s) => s.dimensionId === "d1");
    expect(d1).toMatchObject({
      total: 2,
      highCredibility: 1, // 只有 80 >= 70
      uniqueDomains: 1,
    });
    const d2 = stats.find((s) => s.dimensionId === "d2");
    expect(d2).toMatchObject({
      total: 1,
      highCredibility: 1,
      uniqueDomains: 1,
    });
  });

  it("自定义阈值", () => {
    const stats = countDimensionEvidence(
      [
        { dimensionId: "d1", credibilityScore: 80 },
        { dimensionId: "d1", credibilityScore: 70 },
      ],
      { highCredibilityThreshold: 90 },
    );
    expect(stats[0].highCredibility).toBe(0);
  });

  it("无效 URL/missing domain 仍统计 total", () => {
    const stats = countDimensionEvidence([
      { dimensionId: "d1", credibilityScore: 60, url: "not-a-url" },
      { dimensionId: "d1", credibilityScore: 60 },
    ]);
    expect(stats[0].total).toBe(2);
    expect(stats[0].uniqueDomains).toBe(0);
  });

  it("空数组 → 空结果", () => {
    expect(countDimensionEvidence([])).toEqual([]);
  });
});

describe("citationDensityCheck", () => {
  it("3+ 段 + 每段至少 1 citation → pass", () => {
    const content = "段落一内容 [1]。\n\n段落二内容 [2]。\n\n段落三内容 [3]。";
    const r = citationDensityCheck(content);
    expect(r.verdict).toBe("pass");
    expect(r.paragraphCount).toBe(3);
    expect(r.citationCount).toBe(3);
  });

  it("密度过低 → fail", () => {
    const content =
      "段落一。\n\n段落二。\n\n段落三。\n\n段落四。\n\n段落五 [1]。";
    const r = citationDensityCheck(content);
    expect(r.verdict).toBe("fail");
  });

  it("密度在中间区间 → warn", () => {
    const content = "段落一 [1]。\n\n段落二。\n\n段落三。\n\n段落四 [2]。";
    const r = citationDensityCheck(content);
    expect(r.verdict).toBe("warn");
  });

  it("剥离 References 段后评估", () => {
    const content =
      "段落一 [1]。\n\n段落二 [2]。\n\n段落三 [3]。\n\n## References\n\n[1] something\n[2] other";
    const r = citationDensityCheck(content);
    // References 部分不计入 paragraphs
    expect(r.verdict).toBe("pass");
  });

  it("少于 minParagraphs 直接 pass", () => {
    const content = "只有一段。";
    const r = citationDensityCheck(content);
    expect(r.verdict).toBe("pass");
    expect(r.reason).toContain("Section too short");
  });

  it("识别 [1,2,3] 和 [1-3] 形式", () => {
    const content = "段落一 [1,2]。\n\n段落二 [3-5]。\n\n段落三 [6，7]。";
    const r = citationDensityCheck(content);
    expect(r.citationCount).toBe(3);
    // 注意：uniqueCitationNumbers 只提取数字，不展开范围
    expect(r.uniqueCitationNumbers).toBeGreaterThanOrEqual(5);
  });
});
