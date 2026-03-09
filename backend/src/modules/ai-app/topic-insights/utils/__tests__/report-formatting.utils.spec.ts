import {
  stripRawMarkdownInContent,
  numberSubHeadings,
  hierarchicalNumberBoldListItems,
  deduplicateHeadings,
  sanitizeHeadingLevels,
  stripLLMMetaNotes,
  filterJunkReferences,
  deduplicateReferencesByUrl,
  upgradeHttpToHttps,
  decodeUrlEntities,
  remapCitationIndices,
  detectAndPromoteHeadings,
  bulletifyBlockquoteItems,
  splitEnumerationToList,
  cleanupEmptyBullets,
  normalizeInformalTerms,
  normalizeSourceLabels,
  renumberHeadings,
  removeEmptyHeadings,
  mergeAdjacentMathBlocks,
} from "@/modules/ai-app/shared/report-template";

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

// ============================================================
// stripLLMMetaNotes
// ============================================================

describe("stripLLMMetaNotes", () => {
  describe("word count removal", () => {
    it("should remove （精简字数约500字）", () => {
      const input = "段落内容（精简字数约500字）继续";
      expect(stripLLMMetaNotes(input)).toBe("段落内容继续");
    });

    it("should remove （约1200字）", () => {
      const input = "报告内容（约1200字）";
      expect(stripLLMMetaNotes(input)).toBe("报告内容");
    });

    it("should remove (word count: 500) case-insensitively", () => {
      const input = "正文内容 (word count: 500) 结束";
      expect(stripLLMMetaNotes(input)).toBe("正文内容  结束");
    });

    it("should remove (Word Count: 500) with mixed case", () => {
      const input = "内容 (Word Count: 500)";
      expect(stripLLMMetaNotes(input)).toBe("内容 ");
    });

    it("should remove （当前字数：1500）", () => {
      const input = "段落（当前字数：1500）结尾";
      expect(stripLLMMetaNotes(input)).toBe("段落结尾");
    });

    it("should remove （字数：约800字）", () => {
      const input = "内容（字数：约800字）";
      expect(stripLLMMetaNotes(input)).toBe("内容");
    });
  });

  describe("agent role leakage", () => {
    it("should remove Leader分配的", () => {
      const input = "这是Leader分配的任务内容";
      expect(stripLLMMetaNotes(input)).toBe("这是任务内容");
    });

    it("should remove 研究Agent分配的", () => {
      const input = "研究Agent分配的分析结果";
      expect(stripLLMMetaNotes(input)).toBe("分析结果");
    });

    it("should remove 分析Agent分配的", () => {
      const input = "分析Agent分配的内容";
      expect(stripLLMMetaNotes(input)).toBe("内容");
    });

    it("should remove Agent生成的", () => {
      const input = "Agent生成的报告";
      expect(stripLLMMetaNotes(input)).toBe("报告");
    });
  });

  describe("LLM meta-analysis markers", () => {
    it("should strip **分析判断：** prefix", () => {
      const input = "**分析判断：**这是分析内容";
      expect(stripLLMMetaNotes(input)).toBe("这是分析内容");
    });

    it("should strip **综合分析：** prefix", () => {
      const input = "**综合分析：**综合来看，数据显示增长";
      // The **综合分析：** prefix is stripped; then '综合来看，' at line start is also stripped
      const result = stripLLMMetaNotes(input);
      expect(result).not.toContain("**综合分析：**");
    });

    it("should strip **要点：** prefix", () => {
      const input = "**要点：**本节重要信息如下";
      expect(stripLLMMetaNotes(input)).toBe("本节重要信息如下");
    });

    it("should strip **总结：** prefix", () => {
      const input = "**总结：**以上内容";
      expect(stripLLMMetaNotes(input)).toBe("以上内容");
    });

    it("should strip **结论：** prefix", () => {
      const input = "**结论：**结论是正确的";
      expect(stripLLMMetaNotes(input)).toBe("结论是正确的");
    });

    it("should strip **小结：** prefix", () => {
      const input = "**小结：**小结内容";
      expect(stripLLMMetaNotes(input)).toBe("小结内容");
    });
  });

  describe("HTML strong variants", () => {
    it("should strip <strong>总结：</strong>", () => {
      const input = "<strong>总结：</strong>总结内容";
      expect(stripLLMMetaNotes(input)).toBe("总结内容");
    });

    it("should strip <strong>结论：</strong>", () => {
      const input = "<strong>结论：</strong>结论内容";
      expect(stripLLMMetaNotes(input)).toBe("结论内容");
    });

    it("should strip <strong>分析判断：</strong>", () => {
      const input = "<strong>分析判断：</strong>分析内容";
      expect(stripLLMMetaNotes(input)).toBe("分析内容");
    });

    it("should strip <strong>要点：</strong>", () => {
      const input = "<strong>要点：</strong>要点内容";
      expect(stripLLMMetaNotes(input)).toBe("要点内容");
    });
  });

  describe("cross-reference placeholders", () => {
    it("should remove [前文]", () => {
      const input = "如[前文]所述，数据表明";
      expect(stripLLMMetaNotes(input)).toBe("如所述，数据表明");
    });

    it("should remove [上文]", () => {
      const input = "[上文]提到的内容";
      expect(stripLLMMetaNotes(input)).toBe("提到的内容");
    });

    it("should remove [前述]", () => {
      const input = "参见[前述]章节";
      expect(stripLLMMetaNotes(input)).toBe("参见章节");
    });

    it("should remove [详见前文]", () => {
      const input = "分析[详见前文]说明";
      expect(stripLLMMetaNotes(input)).toBe("分析说明");
    });

    it("should remove [见前文]", () => {
      const input = "[见前文]的数据";
      expect(stripLLMMetaNotes(input)).toBe("的数据");
    });
  });

  describe("escaped HTML fix", () => {
    // The regex /<\\\/?(tag)>/ matches tags with a literal backslash and removes the backslash.
    // <\span>  (backslash, no slash) → <span>
    // <\/span> (backslash + slash)   → </span>

    it("should fix <\\span> by removing the backslash → <span>", () => {
      const input = "<span>内容<\\span>";
      // <\span> has a backslash but no forward slash → backslash stripped → <span>
      expect(stripLLMMetaNotes(input)).toBe("<span>内容<span>");
    });

    it("should fix <\\/span> (backslash + slash) → </span>", () => {
      // In JS string: "<\\/span>" is the 5-char sequence <\/span>
      const input = "<span>内容<\\/span>";
      expect(stripLLMMetaNotes(input)).toBe("<span>内容</span>");
    });

    it("should fix <\\strong> by removing the backslash → <strong>", () => {
      const input = "<strong>文本<\\strong>";
      expect(stripLLMMetaNotes(input)).toBe("<strong>文本<strong>");
    });

    it("should fix <\\/strong> (backslash + slash) → </strong>", () => {
      const input = "<strong>文本<\\/strong>";
      expect(stripLLMMetaNotes(input)).toBe("<strong>文本</strong>");
    });

    it("should fix <\\em> by removing the backslash → <em>", () => {
      const input = "<em>斜体<\\em>";
      expect(stripLLMMetaNotes(input)).toBe("<em>斜体<em>");
    });
  });

  describe("LLM transition phrase removal", () => {
    it("should remove 综合来看， at line start", () => {
      const input = "上一段。\n综合来看，接下来的内容";
      const result = stripLLMMetaNotes(input);
      expect(result).not.toContain("综合来看，");
      expect(result).toContain("接下来的内容");
    });

    it("should remove 值得警惕的是， at line start", () => {
      const input = "上一段。\n值得警惕的是，存在风险";
      const result = stripLLMMetaNotes(input);
      expect(result).not.toContain("值得警惕的是，");
      expect(result).toContain("存在风险");
    });

    it("should remove 总体来看， at line start", () => {
      const input = "内容。\n总体来看，整体向好";
      const result = stripLLMMetaNotes(input);
      expect(result).not.toContain("总体来看，");
      expect(result).toContain("整体向好");
    });

    it("should remove transition phrase at very start of string", () => {
      // When at position 0, match does not start with '\n', so replacement is ''
      const input = "综合来看，这是结论";
      const result = stripLLMMetaNotes(input);
      expect(result).not.toContain("综合来看，");
      expect(result).toContain("这是结论");
    });

    it("should NOT remove transition phrases mid-sentence", () => {
      // "综合来看" embedded in middle of a line should not be affected
      const input = "研究表明综合来看整体趋势良好";
      const result = stripLLMMetaNotes(input);
      // No match because there's no line-start boundary before 综合来看
      expect(result).toContain("综合来看");
    });
  });

  describe("multiple blank lines", () => {
    it("should collapse 3+ newlines to double newline", () => {
      const input = "段落一\n\n\n\n段落二";
      expect(stripLLMMetaNotes(input)).toBe("段落一\n\n段落二");
    });

    it("should collapse exactly 3 newlines to double newline", () => {
      const input = "A\n\n\nB";
      expect(stripLLMMetaNotes(input)).toBe("A\n\nB");
    });

    it("should leave double newline unchanged", () => {
      const input = "A\n\nB";
      expect(stripLLMMetaNotes(input)).toBe("A\n\nB");
    });
  });

  describe("should NOT strip legitimate content", () => {
    it("should keep regular numbered citations like [1]", () => {
      const input = "证据[1]支持该结论[2]";
      expect(stripLLMMetaNotes(input)).toBe("证据[1]支持该结论[2]");
    });

    it("should keep legitimate bold headings without meta-label pattern", () => {
      const input = "**市场规模**：全球市场规模达到5000亿美元";
      expect(stripLLMMetaNotes(input)).toBe(
        "**市场规模**：全球市场规模达到5000亿美元",
      );
    });

    it("should keep 综合来看 that appears mid-sentence (not at line start)", () => {
      const input = "专家认为综合来看趋势向好";
      expect(stripLLMMetaNotes(input)).toContain("综合来看");
    });

    it("should keep regular <strong> HTML tags without meta-label content", () => {
      const input = "<strong>重要数据</strong>：增长率为15%";
      expect(stripLLMMetaNotes(input)).toBe(
        "<strong>重要数据</strong>：增长率为15%",
      );
    });
  });
});

// ============================================================
// filterJunkReferences
// ============================================================

describe("filterJunkReferences", () => {
  it("should filter out references with dollskill.com domain", () => {
    const refs = [
      { domain: "dollskill.com", url: "https://dollskill.com/product" },
    ];
    expect(filterJunkReferences(refs)).toHaveLength(0);
  });

  it("should filter out references with tiktok.com domain", () => {
    const refs = [
      { domain: "tiktok.com", url: "https://tiktok.com/video/123" },
    ];
    expect(filterJunkReferences(refs)).toHaveLength(0);
  });

  it("should filter out references with instagram.com domain", () => {
    const refs = [
      { domain: "instagram.com", url: "https://instagram.com/post/abc" },
    ];
    expect(filterJunkReferences(refs)).toHaveLength(0);
  });

  it("should keep references with academic/news domains", () => {
    const refs = [
      { domain: "nature.com", url: "https://nature.com/article/1234" },
      { domain: "reuters.com", url: "https://reuters.com/article/abc" },
    ];
    expect(filterJunkReferences(refs)).toHaveLength(2);
  });

  it("should handle www prefix — www.dollskill.com matches dollskill.com", () => {
    const refs = [
      { domain: "www.dollskill.com", url: "https://www.dollskill.com/item" },
    ];
    expect(filterJunkReferences(refs)).toHaveLength(0);
  });

  it("should handle missing domain by falling back to URL extraction", () => {
    const refs = [
      { url: "https://tiktok.com/video/456" },
      { url: "https://arxiv.org/abs/2301.00001" },
    ];
    const result = filterJunkReferences(refs);
    expect(result).toHaveLength(1);
    expect(result[0].url).toContain("arxiv.org");
  });

  it("should keep reference when no domain and no URL", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refs = [{ domain: null, url: undefined }];
    expect(filterJunkReferences(refs)).toHaveLength(1);
  });

  it("should filter taobao.com references", () => {
    const refs = [{ domain: "taobao.com", url: "https://taobao.com/item/1" }];
    expect(filterJunkReferences(refs)).toHaveLength(0);
  });

  it("should filter zhihu.com references", () => {
    const refs = [{ domain: "zhihu.com", url: "https://zhihu.com/question/1" }];
    expect(filterJunkReferences(refs)).toHaveLength(0);
  });

  it("should keep mixed valid and invalid references, returning only valid ones", () => {
    const refs = [
      { domain: "science.org", url: "https://science.org/article/1" },
      { domain: "amazon.com", url: "https://amazon.com/product/xyz" },
      { domain: "ft.com", url: "https://ft.com/news/abc" },
    ];
    const result = filterJunkReferences(refs);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.domain)).toEqual(["science.org", "ft.com"]);
  });
});

// ============================================================
// deduplicateReferencesByUrl
// ============================================================

describe("deduplicateReferencesByUrl", () => {
  it("should remove exact duplicate URLs and keep the first occurrence", () => {
    const refs = [
      { index: 1, url: "https://example.com/page" },
      { index: 2, url: "https://example.com/page" },
    ];
    const { deduplicated } = deduplicateReferencesByUrl(refs);
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].index).toBe(1);
  });

  it("should renumber remaining references starting from 1", () => {
    const refs = [
      { index: 3, url: "https://alpha.com" },
      { index: 7, url: "https://beta.com" },
    ];
    const { deduplicated } = deduplicateReferencesByUrl(refs);
    expect(deduplicated[0].index).toBe(1);
    expect(deduplicated[1].index).toBe(2);
  });

  it("should return correct indexMapping old→new for unique refs", () => {
    const refs = [
      { index: 3, url: "https://alpha.com" },
      { index: 7, url: "https://beta.com" },
    ];
    const { indexMapping } = deduplicateReferencesByUrl(refs);
    expect(indexMapping.get(3)).toBe(1);
    expect(indexMapping.get(7)).toBe(2);
  });

  it("should map duplicate old index to first occurrence's new index", () => {
    const refs = [
      { index: 1, url: "https://example.com/page" },
      { index: 2, url: "https://other.com" },
      { index: 5, url: "https://example.com/page" }, // duplicate of index 1
    ];
    const { indexMapping } = deduplicateReferencesByUrl(refs);
    expect(indexMapping.get(1)).toBe(1);
    expect(indexMapping.get(2)).toBe(2);
    expect(indexMapping.get(5)).toBe(1); // mapped to the new index of the first occurrence
  });

  it("should normalize trailing slashes — treat /page/ same as /page", () => {
    const refs = [
      { index: 1, url: "https://example.com/page/" },
      { index: 2, url: "https://example.com/page" },
    ];
    const { deduplicated } = deduplicateReferencesByUrl(refs);
    expect(deduplicated).toHaveLength(1);
  });

  it("should normalize www prefix — www.example.com same as example.com", () => {
    const refs = [
      { index: 1, url: "https://www.example.com/page" },
      { index: 2, url: "https://example.com/page" },
    ];
    const { deduplicated } = deduplicateReferencesByUrl(refs);
    expect(deduplicated).toHaveLength(1);
  });

  it("should normalize &amp; in URLs before comparing", () => {
    const refs = [
      { index: 1, url: "https://example.com/search?a=1&amp;b=2" },
      { index: 2, url: "https://example.com/search?a=1&b=2" },
    ];
    const { deduplicated } = deduplicateReferencesByUrl(refs);
    expect(deduplicated).toHaveLength(1);
  });

  it("should handle refs without index field", () => {
    const refs = [
      { url: "https://alpha.com" },
      { url: "https://beta.com" },
      { url: "https://alpha.com" },
    ];
    const { deduplicated, indexMapping } = deduplicateReferencesByUrl(refs);
    expect(deduplicated).toHaveLength(2);
    expect(indexMapping.size).toBe(0); // no indices to map
  });

  it("should return empty arrays and empty map for empty input", () => {
    const { deduplicated, indexMapping } = deduplicateReferencesByUrl([]);
    expect(deduplicated).toHaveLength(0);
    expect(indexMapping.size).toBe(0);
  });
});

// ============================================================
// upgradeHttpToHttps
// ============================================================

describe("upgradeHttpToHttps", () => {
  it("should convert http:// to https://", () => {
    const refs = [{ url: "http://example.com/page" }];
    const result = upgradeHttpToHttps(refs);
    expect(result[0].url).toBe("https://example.com/page");
  });

  it("should keep https:// unchanged", () => {
    const refs = [{ url: "https://example.com/page" }];
    const result = upgradeHttpToHttps(refs);
    expect(result[0].url).toBe("https://example.com/page");
  });

  it("should skip localhost URLs", () => {
    const refs = [{ url: "http://localhost:3000/api" }];
    const result = upgradeHttpToHttps(refs);
    expect(result[0].url).toBe("http://localhost:3000/api");
  });

  it("should skip http://127.x.x.x addresses", () => {
    const refs = [{ url: "http://127.0.0.1:8080/page" }];
    const result = upgradeHttpToHttps(refs);
    expect(result[0].url).toBe("http://127.0.0.1:8080/page");
  });

  it("should skip http://192.168.x.x addresses", () => {
    const refs = [{ url: "http://192.168.1.100/api" }];
    const result = upgradeHttpToHttps(refs);
    expect(result[0].url).toBe("http://192.168.1.100/api");
  });

  it("should skip http://10.x.x.x addresses", () => {
    const refs = [{ url: "http://10.0.0.1/internal" }];
    const result = upgradeHttpToHttps(refs);
    expect(result[0].url).toBe("http://10.0.0.1/internal");
  });

  it("should handle refs without url field", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refs = [{ title: "No URL" }];
    const result = upgradeHttpToHttps(refs);
    expect(result[0]).toEqual({ title: "No URL" });
  });

  it("should upgrade multiple refs and preserve non-url fields", () => {
    const refs = [
      { index: 1, url: "http://alpha.com/a" },
      { index: 2, url: "https://beta.com/b" },
    ];
    const result = upgradeHttpToHttps(refs);
    expect(result[0]).toEqual({ index: 1, url: "https://alpha.com/a" });
    expect(result[1]).toEqual({ index: 2, url: "https://beta.com/b" });
  });
});

// ============================================================
// decodeUrlEntities
// ============================================================

describe("decodeUrlEntities", () => {
  it("should decode &amp; to &", () => {
    const refs = [{ url: "https://example.com/search?a=1&amp;b=2" }];
    const result = decodeUrlEntities(refs);
    expect(result[0].url).toBe("https://example.com/search?a=1&b=2");
  });

  it("should decode &lt; to <", () => {
    const refs = [{ url: "https://example.com/?q=a&lt;b" }];
    const result = decodeUrlEntities(refs);
    expect(result[0].url).toBe("https://example.com/?q=a<b");
  });

  it("should decode &gt; to >", () => {
    const refs = [{ url: "https://example.com/?q=a&gt;b" }];
    const result = decodeUrlEntities(refs);
    expect(result[0].url).toBe("https://example.com/?q=a>b");
  });

  it("should decode &quot; to double-quote", () => {
    const refs = [{ url: "https://example.com/?q=&quot;hello&quot;" }];
    const result = decodeUrlEntities(refs);
    expect(result[0].url).toBe('https://example.com/?q="hello"');
  });

  it("should decode &#39; to single-quote", () => {
    const refs = [{ url: "https://example.com/?q=it&#39;s" }];
    const result = decodeUrlEntities(refs);
    expect(result[0].url).toBe("https://example.com/?q=it's");
  });

  it("should keep clean URLs unchanged (returns same object reference for unchanged url)", () => {
    const refs = [{ url: "https://example.com/page" }];
    const result = decodeUrlEntities(refs);
    expect(result[0].url).toBe("https://example.com/page");
  });

  it("should handle refs without url field", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refs = [{ title: "No URL" }];
    const result = decodeUrlEntities(refs);
    expect(result[0]).toEqual({ title: "No URL" });
  });

  it("should decode multiple entities in the same URL", () => {
    const refs = [{ url: "https://example.com/?a=1&amp;b=&lt;2&gt;" }];
    const result = decodeUrlEntities(refs);
    expect(result[0].url).toBe("https://example.com/?a=1&b=<2>");
  });
});

// ============================================================
// remapCitationIndices
// ============================================================

describe("remapCitationIndices", () => {
  it("should remap [1] to [5] when mapping says 1→5", () => {
    const mapping = new Map([[1, 5]]);
    expect(remapCitationIndices("参见[1]说明", mapping)).toBe("参见[5]说明");
  });

  it("should handle multiple remaps in one string", () => {
    const mapping = new Map([
      [1, 3],
      [2, 4],
    ]);
    const result = remapCitationIndices("来源[1]和[2]都支持", mapping);
    expect(result).toBe("来源[3]和[4]都支持");
  });

  it("should not affect unmapped indices", () => {
    const mapping = new Map([[1, 5]]);
    const result = remapCitationIndices("来源[1][3][7]", mapping);
    expect(result).toBe("来源[5][3][7]");
  });

  it("should return content unchanged when mapping is empty", () => {
    const mapping = new Map();
    const input = "来源[1][2][3]";
    expect(remapCitationIndices(input, mapping)).toBe(input);
  });

  it("should remap same index appearing multiple times", () => {
    const mapping = new Map([[2, 9]]);
    const result = remapCitationIndices("参见[2]，另见[2]", mapping);
    expect(result).toBe("参见[9]，另见[9]");
  });

  it("should handle citation at start and end of string", () => {
    const mapping = new Map([[1, 2]]);
    expect(remapCitationIndices("[1]内容[1]", mapping)).toBe("[2]内容[2]");
  });

  it("should not remap text that looks like citation but is not a number", () => {
    // [abc] should not be matched since the regex only matches digits
    const mapping = new Map([[1, 5]]);
    const result = remapCitationIndices("参见[abc]说明[1]", mapping);
    expect(result).toBe("参见[abc]说明[5]");
  });
});

// ============================================================
// detectAndPromoteHeadings
// ============================================================

describe("detectAndPromoteHeadings", () => {
  it("should NOT promote bold line (guard regex skips lines starting with *)", () => {
    // Bold lines start with *, which is caught by the guard regex on line 2099.
    // This is expected: bold formatting serves as emphasis, not heading promotion.
    const input =
      "**多模态融合技术架构演进**\n\n详细内容在这里描述该技术架构的演进路线。";
    const result = detectAndPromoteHeadings(input);
    expect(result).not.toContain("###");
    expect(result).toContain("**多模态融合技术架构演进**");
  });

  it("should promote short line ending with colon to heading", () => {
    const input = "核心技术路线：\n\n详细内容段落在这里描述主要技术路线。";
    const result = detectAndPromoteHeadings(input);
    expect(result).toContain("### 核心技术路线");
  });

  it("should NOT promote line ending with colon when next line is a list item (dash)", () => {
    const input =
      "开源带来的影响主要体现在三点：\n- 降低了构建自有基础模型的门槛";
    const result = detectAndPromoteHeadings(input);
    expect(result).not.toContain("###");
    expect(result).toContain("开源带来的影响主要体现在三点：");
  });

  it("should NOT promote line ending with colon when next line is ordered list", () => {
    const input = "关键创新方向：\n1. 自注意力机制优化\n2. 稀疏化计算";
    const result = detectAndPromoteHeadings(input);
    expect(result).not.toContain("###");
    expect(result).toContain("关键创新方向：");
  });

  it("should NOT promote line ending with colon when next line is bullet asterisk", () => {
    const input = "技术挑战包括：\n* 计算效率瓶颈\n* 数据质量问题";
    const result = detectAndPromoteHeadings(input);
    expect(result).not.toContain("###");
  });

  it("should skip lines that are already headings", () => {
    const input = "### 已有标题\n\n内容";
    const result = detectAndPromoteHeadings(input);
    expect(result).toBe(input);
  });

  it("should skip lines with sentence punctuation (not headings)", () => {
    const input = "这是一段，包含逗号的长句子：\n\n后续内容";
    const result = detectAndPromoteHeadings(input);
    expect(result).not.toContain("###");
  });

  it("should skip very short bold labels (2-4 chars)", () => {
    const input = "**反馈**\n\n内容段落";
    const result = detectAndPromoteHeadings(input);
    expect(result).not.toContain("###");
  });

  it("should NOT promote when next content is blockquote", () => {
    const input = "总结评价：\n> 引用内容在这里";
    const result = detectAndPromoteHeadings(input);
    expect(result).not.toContain("###");
  });
});

// ============================================================
// bulletifyBlockquoteItems
// ============================================================

describe("bulletifyBlockquoteItems", () => {
  it("should add bullet markers to consecutive blockquote lines", () => {
    const input = "> 第一条内容\n> 第二条内容\n> 第三条内容";
    const result = bulletifyBlockquoteItems(input);
    expect(result).toBe("> - 第一条内容\n> - 第二条内容\n> - 第三条内容");
  });

  it("should NOT bulletify empty blockquote lines", () => {
    const input = "> \n> 有内容的行";
    const result = bulletifyBlockquoteItems(input);
    // Empty line should remain as-is, single content line should not be bulletified
    expect(result).not.toContain("> - ");
    expect(result).toContain("> ");
  });

  it("should NOT bulletify single blockquote line", () => {
    const input = "> 只有一行内容";
    const result = bulletifyBlockquoteItems(input);
    expect(result).toBe("> 只有一行内容");
  });

  it("should NOT bulletify lines that already have bullet markers", () => {
    const input = "> - 已有bullet\n> - 另一个bullet";
    const result = bulletifyBlockquoteItems(input);
    expect(result).toBe(input);
  });

  it("should NOT bulletify lines with bold markers", () => {
    const input = "> **标题行**\n> 内容行";
    const result = bulletifyBlockquoteItems(input);
    // Bold line should not match; only 1 non-bold line so no bulletification
    expect(result).toBe(input);
  });

  it("should handle mixed empty and content blockquote lines", () => {
    const input = "> 内容一\n> \n> 内容二\n> 内容三";
    const result = bulletifyBlockquoteItems(input);
    // Empty line breaks the run: "内容一" is alone (no bullet), then "内容二"+"内容三" = run of 2
    expect(result).toContain("> 内容一");
    expect(result).toContain("> - 内容二");
    expect(result).toContain("> - 内容三");
  });
});

// ============================================================
// splitEnumerationToList
// ============================================================

describe("splitEnumerationToList", () => {
  it("should split 一是/二是/三是 patterns into bullet list", () => {
    const input =
      "在技术栈层面，可观察到三条路线：一是以通用语言模型为核心构建应用，二是以世界模型为代表进行预测，三是以多模态融合为基础";
    const result = splitEnumerationToList(input);
    expect(result).toContain("- 以通用语言模型为核心构建应用");
    expect(result).toContain("- 以世界模型为代表进行预测");
    expect(result).toContain("- 以多模态融合为基础");
  });

  it("should split 首先/其次/最后 patterns", () => {
    const input =
      "需要关注以下方面：首先是计算效率的优化，其次是数据质量的保障，最后是安全对齐的强化";
    const result = splitEnumerationToList(input);
    expect(result).toContain("- ");
    expect(result.match(/^- /gm)?.length).toBeGreaterThanOrEqual(3);
  });

  it("should NOT split when fewer than 2 markers found", () => {
    const input = "首先我们需要了解基础架构的演进趋势。";
    const result = splitEnumerationToList(input);
    expect(result).toBe(input);
  });

  it("should skip headings", () => {
    const input = "### 一是核心架构，二是训练方法";
    const result = splitEnumerationToList(input);
    expect(result).toBe(input);
  });

  it("should skip short paragraphs", () => {
    const input = "一是好，二是坏";
    const result = splitEnumerationToList(input);
    expect(result).toBe(input);
  });

  it("should NOT produce empty bullet items when marker has no content", () => {
    const input = "关键要素包括以下几点，一是模型架构的优化方向，二是";
    const result = splitEnumerationToList(input);
    // Second item has no content — should be skipped
    const bullets = result.match(/^- .+$/gm) || [];
    for (const bullet of bullets) {
      // Each bullet should have actual content after "- "
      expect(bullet.replace(/^- /, "").trim().length).toBeGreaterThan(0);
    }
  });

  it("should preserve leading sentence before first marker", () => {
    const input =
      "在技术栈层面，可观察到两条路线：一是以通用语言模型为核心，二是以世界模型为代表";
    const result = splitEnumerationToList(input);
    expect(result).toContain("在技术栈层面，可观察到两条路线：");
  });
});

// ============================================================
// cleanupEmptyBullets
// ============================================================

describe("cleanupEmptyBullets", () => {
  it("should remove empty dash bullet items", () => {
    const input = "- 有内容\n- \n- 也有内容";
    const result = cleanupEmptyBullets(input);
    expect(result).toContain("- 有内容");
    expect(result).toContain("- 也有内容");
    expect(result).not.toMatch(/^-\s*$/m);
  });

  it("should remove empty asterisk bullet items", () => {
    const input = "* 有内容\n* \n* 也有内容";
    const result = cleanupEmptyBullets(input);
    expect(result).not.toMatch(/^\*\s*$/m);
  });

  it("should remove empty blockquote bullet items", () => {
    const input = "> - 有内容\n> - \n> - 也有内容";
    const result = cleanupEmptyBullets(input);
    expect(result).not.toMatch(/^>\s*-\s*$/m);
  });

  it("should collapse triple newlines after removal", () => {
    const input = "段落一\n\n- \n\n段落二";
    const result = cleanupEmptyBullets(input);
    expect(result).not.toContain("\n\n\n");
  });

  it("should preserve non-empty bullets", () => {
    const input = "- 第一项\n- 第二项\n- 第三项";
    const result = cleanupEmptyBullets(input);
    expect(result).toBe(input);
  });
});

// ============================================================
// normalizeInformalTerms
// ============================================================

describe("normalizeInformalTerms", () => {
  it("should replace standalone 'hype' with 炒作", () => {
    const input = "忽略hype如AGI即将来临的说法";
    const result = normalizeInformalTerms(input);
    expect(result).not.toContain("hype");
    expect(result).toContain("炒作");
  });

  it("should replace 'hype宣传' with 过度宣传", () => {
    const input = "hype宣传忽略训练开销";
    const result = normalizeInformalTerms(input);
    expect(result).toBe("过度宣传忽略训练开销");
  });

  it("should replace 'hype曲线' with 技术炒作周期曲线", () => {
    const input = "参考Gartner的hype曲线";
    const result = normalizeInformalTerms(input);
    expect(result).toContain("技术炒作周期曲线");
  });

  it("should not modify English words containing 'hype' as substring", () => {
    const input = "hyperparameter tuning is important";
    const result = normalizeInformalTerms(input);
    expect(result).toBe(input);
  });

  it("should handle case-insensitive 'Hype'", () => {
    const input = "Hype现象值得警惕";
    const result = normalizeInformalTerms(input);
    expect(result).toContain("炒作");
  });
});

// ============================================================
// normalizeSourceLabels
// ============================================================

describe("normalizeSourceLabels", () => {
  it("should add space after Source: when missing", () => {
    const input = "Source:[94]";
    const result = normalizeSourceLabels(input);
    expect(result).toBe("Source: [94]");
  });

  it("should keep correct format unchanged", () => {
    const input = "Source: [94]";
    const result = normalizeSourceLabels(input);
    expect(result).toBe("Source: [94]");
  });

  it("should convert Chinese 来源 to English Source", () => {
    const input = "来源：[42]";
    const result = normalizeSourceLabels(input);
    expect(result).toBe("Source: [42]");
  });

  it("should strip 证据 from source labels", () => {
    const input = "来源: 证据 [7]";
    const result = normalizeSourceLabels(input);
    expect(result).toBe("Source: [7]");
  });
});

// ============================================================
// renumberHeadings + removeEmptyHeadings integration
// ============================================================

describe("renumberHeadings after removeEmptyHeadings", () => {
  it("should close numbering gaps when empty heading is removed", () => {
    const input = [
      "## 1. 维度一",
      "",
      "### 1.1. 第一节",
      "内容A",
      "",
      "### 1.2. 空节",
      "",
      "### 1.3. 第三节",
      "内容B",
    ].join("\n");

    // Remove empty heading then renumber
    let result = removeEmptyHeadings(input);
    result = renumberHeadings(result);

    expect(result).toContain("### 1.1. 第一节");
    expect(result).toContain("### 1.2. 第三节");
    expect(result).not.toContain("1.3.");
  });

  it("should maintain correct numbering when no headings removed", () => {
    const input = [
      "## 1. 维度一",
      "",
      "### 1.1. 第一节",
      "内容A",
      "",
      "### 1.2. 第二节",
      "内容B",
    ].join("\n");

    const result = renumberHeadings(input);
    expect(result).toContain("### 1.1. 第一节");
    expect(result).toContain("### 1.2. 第二节");
  });
});

// ============================================================
// stripLLMMetaNotes — new variant coverage
// ============================================================

describe("stripLLMMetaNotes — internal note leak variants", () => {
  it("should strip bare '字数约1250字（内部统计，不输出）'", () => {
    const input = "正文内容字数约1250字（内部统计，不输出）后续内容";
    const result = stripLLMMetaNotes(input);
    expect(result).toBe("正文内容后续内容");
    expect(result).not.toContain("内部统计");
  });

  it("should strip '字数约：1520字（内部计算，不输出）'", () => {
    const input = "段落末尾字数约：1520字（内部计算，不输出）";
    const result = stripLLMMetaNotes(input);
    expect(result).not.toContain("内部计算");
    expect(result).not.toContain("不输出");
  });

  it("should strip '字数1800字（内部统计）'", () => {
    const input = "内容字数1800字（内部统计）结尾";
    // This should match via existing (字数...) or new bare pattern
    const result = stripLLMMetaNotes(input);
    expect(result).not.toContain("内部统计");
  });
});

// ============================================================
// mergeAdjacentMathBlocks — asymmetric delimiter fix
// ============================================================

describe("mergeAdjacentMathBlocks — asymmetric delimiters", () => {
  it("should fix $$formula$ to $$formula$$", () => {
    const input = "$$\\text{FFN}(x)=W_2\\sigma(W_1 x)$";
    const result = mergeAdjacentMathBlocks(input);
    // Should have matching $$ on both sides
    expect(result).toMatch(/^\$\$.*\$\$$/);
    expect(result).not.toMatch(/[^$]\$$/);
  });

  it("should fix $formula$$ to $$formula$$", () => {
    const input = "$\\text{Attention}(Q,K,V)$$";
    const result = mergeAdjacentMathBlocks(input);
    expect(result).toMatch(/^\$\$.*\$\$$/);
  });

  it("should not alter correctly paired $$formula$$", () => {
    const input = "$$E = mc^2$$";
    const result = mergeAdjacentMathBlocks(input);
    expect(result).toBe("$$E = mc^2$$");
  });

  it("should not alter correctly paired $formula$", () => {
    const input = "inline $x^2$ formula";
    const result = mergeAdjacentMathBlocks(input);
    expect(result).toContain("$x^2$");
  });

  it("should merge adjacent inline blocks: $A$ $B$ → $A B$", () => {
    const input = "$\\alpha$ $\\beta$";
    const result = mergeAdjacentMathBlocks(input);
    expect(result).toBe("$\\alpha \\beta$");
  });
});
