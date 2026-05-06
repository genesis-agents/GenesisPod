/**
 * strip-chart-json.utils 单元测试
 */

import {
  stripChartJsonFromContent,
  extractMarkdownFromJsonString,
} from "../strip-chart-json.utils";

describe("stripChartJsonFromContent", () => {
  describe("no chart content", () => {
    it("should return text unchanged when no chart separators present", () => {
      const text = "# 报告标题\n\n这是正文内容。\n\n## 结论\n\n结束。";
      expect(stripChartJsonFromContent(text)).toBe(text.trim());
    });

    it("should return empty string for empty input", () => {
      expect(stripChartJsonFromContent("")).toBe("");
    });

    it("should not strip 'CHARTS' without any dashes", () => {
      const text = "CHARTS 这是普通文字";
      // 不满足"至少一侧有破折号"条件，应保留
      expect(stripChartJsonFromContent(text)).toContain("CHARTS");
    });
  });

  // ★ 2026-05-06 #81 regression: chapter writer 用 ```chartjs fence 包 Chart.js
  //   配置 JSON，前端 markdown renderer 不识别这种 fence 当 code block 显示 raw JSON。
  //   strip-chart-json.utils 必须删除 chartjs / chart-data / chart fence 整段。
  describe("#81 chartjs fence regression (Mission 1520783d 实证)", () => {
    it("should strip ```chartjs fence with Chart.js config", () => {
      const text = [
        "# 第 4 章 硬件基础设施",
        "",
        "推理芯片市场规模达500亿美元。",
        "",
        "```chartjs",
        '{"type": "line", "data": {"labels": ["2024", "2025", "2026"]}}',
        "```",
        "",
        "供应链依赖：NVIDIA。",
      ].join("\n");
      const result = stripChartJsonFromContent(text);
      expect(result).toContain("推理芯片市场规模");
      expect(result).toContain("供应链依赖");
      expect(result).not.toContain("```chartjs");
      expect(result).not.toContain('"labels"');
      expect(result).not.toContain('"datasets"');
    });

    it("should strip ```chart-data fence with Chart.js config", () => {
      const text = '正文。\n\n```chart-data\n{"type": "bar"}\n```\n\n后续。';
      const result = stripChartJsonFromContent(text);
      expect(result).toContain("正文");
      expect(result).toContain("后续");
      expect(result).not.toContain("chart-data");
      expect(result).not.toContain('"type"');
    });

    it("should strip ```chart fence with Chart.js config", () => {
      const text = '正文。\n\n```chart\n{"datasets": []}\n```\n\n后续。';
      const result = stripChartJsonFromContent(text);
      expect(result).toContain("正文");
      expect(result).toContain("后续");
      expect(result).not.toContain("```chart");
    });

    it("should NOT strip non-chart fences (preserve normal code blocks)", () => {
      const text = [
        "正文。",
        "",
        "```javascript",
        'const x = {"labels": ["a"]};',
        "```",
        "",
        "结尾。",
      ].join("\n");
      const result = stripChartJsonFromContent(text);
      // javascript fence 应保留（不能被误删）
      expect(result).toContain("```javascript");
      expect(result).toContain("const x =");
    });

    it("should strip multiple chart fences in same document", () => {
      const text = [
        "标题。",
        "```chartjs",
        '{"type": "line"}',
        "```",
        "中间。",
        "```chart-data",
        '{"type": "bar"}',
        "```",
        "结尾。",
      ].join("\n");
      const result = stripChartJsonFromContent(text);
      expect(result).toContain("标题");
      expect(result).toContain("中间");
      expect(result).toContain("结尾");
      expect(result).not.toContain("chartjs");
      expect(result).not.toContain("chart-data");
    });

    it("should be case-insensitive (Chartjs / CHART-DATA)", () => {
      const text = '正文。\n\n```Chartjs\n{"x": 1}\n```\n';
      expect(stripChartJsonFromContent(text)).not.toContain("Chartjs");
    });
  });

  describe("---CHARTS--- pattern", () => {
    it("should strip ---CHARTS--- block with JSON", () => {
      const text =
        '# 分析报告\n\n正文内容。\n\n---CHARTS---\n{"generatedCharts": []}\n';
      const result = stripChartJsonFromContent(text);
      expect(result).toContain("分析报告");
      expect(result).toContain("正文内容");
      expect(result).not.toContain("CHARTS");
      expect(result).not.toContain("generatedCharts");
    });

    it("should strip multiple ---CHARTS--- blocks", () => {
      const text =
        '第一段。\n\n---CHARTS---\n{"figureReferences": [1, 2]}\n\n第二段。\n\n---CHARTS---\n{"generatedCharts": [{"id": "c1"}]}\n';
      const result = stripChartJsonFromContent(text);
      expect(result).toContain("第一段");
      expect(result).toContain("第二段");
      expect(result).not.toContain("CHARTS");
      expect(result).not.toContain("figureReferences");
    });

    it("should strip ---CHARTS (no trailing dashes)", () => {
      const text = '正文\n\n---CHARTS\n{"generatedCharts": []}';
      const result = stripChartJsonFromContent(text);
      expect(result).toContain("正文");
      expect(result).not.toContain("CHARTS");
    });

    it("should strip CHARTS--- (no leading dashes)", () => {
      const text = '正文\n\nCHARTS---\n{"generatedCharts": []}';
      const result = stripChartJsonFromContent(text);
      expect(result).toContain("正文");
      expect(result).not.toContain("CHARTS");
    });
  });

  describe("nested JSON braces", () => {
    it("should handle nested JSON objects correctly", () => {
      const text =
        '报告正文内容。\n\n---CHARTS---\n{"generatedCharts": [{"id": "c1", "data": {"x": [1, 2], "y": [3, 4]}}]}';
      const result = stripChartJsonFromContent(text);
      expect(result).toBe("报告正文内容。");
    });

    it("should handle JSON with string containing escaped quotes", () => {
      const text =
        '正文。\n\n---CHARTS---\n{"generatedCharts": [{"title": "He said \\"hello\\""}]}';
      const result = stripChartJsonFromContent(text);
      expect(result).toBe("正文。");
    });
  });

  describe("bare JSON fallback", () => {
    // 需要超过100个字符（JS length）的前置文本才能触发 bareJsonPattern 中的 before.length > 100 检查
    // 以下字符串包含足够多的ASCII字符确保 length > 100
    const LONG_TEXT =
      "This is a long analysis report content that must exceed one hundred characters " +
      "in length to trigger the bare JSON fallback stripping logic in the utility.";

    it("should strip bare JSON with generatedCharts at end", () => {
      const text = LONG_TEXT + '\n{"generatedCharts": [{"id": "c1"}]}';
      const result = stripChartJsonFromContent(text);
      expect(result).not.toContain("generatedCharts");
    });

    it("should strip bare JSON with figureReferences at end", () => {
      const text = LONG_TEXT + '\n{"figureReferences": [1, 2, 3]}';
      const result = stripChartJsonFromContent(text);
      expect(result).not.toContain("figureReferences");
    });
  });

  describe("图表数据 section stripping", () => {
    it("should remove 图表数据 heading with separators", () => {
      const text = "正文内容。\n\n---\n### 图表数据\n---\n\n后续内容。";
      const result = stripChartJsonFromContent(text);
      expect(result).not.toContain("图表数据");
      expect(result).toContain("正文内容");
    });

    it("should remove standalone ### 图表数据 heading", () => {
      const text = "正文内容。\n### 图表数据\n后续内容。";
      const result = stripChartJsonFromContent(text);
      expect(result).not.toContain("图表数据");
      expect(result).toContain("正文内容");
      expect(result).toContain("后续内容");
    });

    it("should remove # 图表数据 heading", () => {
      const text = "正文内容。\n# 图表数据\n后续内容。";
      const result = stripChartJsonFromContent(text);
      expect(result).not.toContain("图表数据");
    });
  });

  describe("preserve leading/trailing whitespace stripping", () => {
    it("should trim the result", () => {
      const text = "  \n\n正文内容。\n\n  ";
      const result = stripChartJsonFromContent(text);
      expect(result).toBe("正文内容。");
    });
  });
});

describe("extractMarkdownFromJsonString", () => {
  describe("non-JSON input", () => {
    it("should return plain markdown unchanged", () => {
      const text = "# 标题\n\n正文内容。";
      expect(extractMarkdownFromJsonString(text)).toBe(text);
    });

    it("should return text that starts with non-brace unchanged", () => {
      const text = "普通文字 {not json}";
      expect(extractMarkdownFromJsonString(text)).toBe(text);
    });
  });

  describe("JSON with fullText field", () => {
    it("should extract fullText from top-level JSON", () => {
      const markdown = "# 分析报告\n\n内容正文。";
      const json = JSON.stringify({ fullText: markdown, charts: [] });
      expect(extractMarkdownFromJsonString(json)).toBe(markdown);
    });

    it("should extract fullText from executiveSummary", () => {
      const markdown = "# 执行摘要\n\n内容。";
      const json = JSON.stringify({
        executiveSummary: { fullText: markdown },
      });
      expect(extractMarkdownFromJsonString(json)).toBe(markdown);
    });

    it("should extract string executiveSummary directly", () => {
      const markdown = "# 摘要\n\n内容。";
      const json = JSON.stringify({ executiveSummary: markdown });
      expect(extractMarkdownFromJsonString(json)).toBe(markdown);
    });
  });

  describe("JSON without fullText", () => {
    it("should return original text when JSON has no fullText", () => {
      const text = '{"charts": [{"id": "c1"}], "title": "test"}';
      expect(extractMarkdownFromJsonString(text)).toBe(text);
    });
  });

  describe("invalid JSON fallback", () => {
    it("should fallback to regex for malformed JSON with fullText", () => {
      // 构造一段包含 fullText 键的"损坏"JSON（无法被 JSON.parse 解析）
      const content =
        "有效的正文内容，超过50个字符的文本，用于触发 regex fallback 路径。";
      const malformedJson = `{"fullText": "${content}", broken: true`;
      const result = extractMarkdownFromJsonString(malformedJson);
      expect(result).toContain("有效的正文内容");
    });

    it("should return original text when regex finds too-short fullText", () => {
      // fullText 内容少于50字符时，regex 回退不应提取
      const malformedJson = '{"fullText": "短", broken: true}';
      const result = extractMarkdownFromJsonString(malformedJson);
      expect(result).toBe(malformedJson);
    });
  });
});
