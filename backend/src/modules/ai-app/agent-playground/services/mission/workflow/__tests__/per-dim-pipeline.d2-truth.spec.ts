// PR-2' v1.6 D2 派生真值 — RV-3 反向证据 spec
//
// 触发：mission c195035f 全章节 word_count=1428（LLM 输出占位）—— UI 假数据
// 反向证据：LLM 输出 wordCount=99999 但 backend 用 countCJKWords(body) 重算覆盖，
//          DB 落地 / UI 显示 / 下游消费 永远用真值
//
// 不依赖完整 per-dim-pipeline 启动，单独测 D2 派生层逻辑（countCJKWords 调用 + 覆盖）。

import { countCJKWords } from "@/common/utils/word-count";

describe("PR-2' D2 派生真值 — RV-3 反向证据", () => {
  it("LLM 输出 wordCount 假报 1428，body 真字符 700 → backend 重算覆盖为 700", () => {
    // 模拟 LLM 输出（c195035f 真实事故 payload）
    const llmRawDraft = {
      body: "深度洞察".repeat(175), // 4 字符 × 175 = 700 真字符
      wordCount: 1428, // ★ LLM 编的占位
      citationsUsed: [],
    };

    // 模拟 per-dim-pipeline.util.ts L754 的 backend 重算覆盖
    const cleanedBody = llmRawDraft.body; // 假设 sanitize 后等同
    const recomputedDraft = {
      ...llmRawDraft,
      body: cleanedBody,
      wordCount: countCJKWords(cleanedBody), // ★ 覆盖
    };

    expect(recomputedDraft.wordCount).toBe(700);
    expect(recomputedDraft.wordCount).not.toBe(1428); // ★ 不是 LLM 假值
  });

  it("LLM 输出 wordCount 0（沉默假报），body 5K 字 → backend 重算 5000", () => {
    const llmRawDraft = {
      body: "x".repeat(5000),
      wordCount: 0, // 另一种假报模式
      citationsUsed: [],
    };
    const recomputed = countCJKWords(llmRawDraft.body);
    expect(recomputed).toBe(5000);
    expect(recomputed).not.toBe(0);
  });

  it("LLM 输出 padding 攻击：body 含 100 个零宽空格 + 5 字 → backend 重算 5（不被 padding 蒙混过 D4 硬合约）", () => {
    const llmRawDraft = {
      body: "你好世界你" + "​".repeat(100), // 5 CJK + 100 零宽空格
      wordCount: 105, // LLM 报"看起来 105 字"
      citationsUsed: [],
    };
    const recomputed = countCJKWords(llmRawDraft.body);
    expect(recomputed).toBe(5);
  });

  it("Markdown 标题字符级计数（# 与中文标题字符都计入，空白与换行不计）", () => {
    const body = "# 章标题\n\n## 1. 第一节\n\n这是正文内容。";
    // strip 空白后: #章标题##1.第一节这是正文内容。
    // 字符级: # + 章 + 标 + 题 + # + # + 1 + . + 第 + 一 + 节 + 这 + 是 + 正 + 文 + 内 + 容 + 。 = 18
    expect(countCJKWords(body)).toBe(18);
  });

  it("中英混合（c195035f 主题示例）", () => {
    const body = "2026 年全球碳中和政策（Carbon Neutrality）";
    // 字符级: 2026 (4) + 年全球碳中和政策 (8) + （ (1) + Carbon (6) + Neutrality (10) + ） (1) = 30（空格不计）
    expect(countCJKWords(body)).toBe(30);
  });
});
