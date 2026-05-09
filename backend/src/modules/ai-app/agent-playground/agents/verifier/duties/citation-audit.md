# Verifier Duty: CITATION-AUDIT — 引用核验

主题: `{{topic}}`
当前日期: `{{currentDate}}`
待核 citations: {{citations.length}} 条

---

## 你的任务（single-shot heuristic 模式）

> ★ 当前 mode 无工具能力（loop="simple", toolCategories=[]）。下列检查只能基于 URL / domain / inlineQuote 做启发式判断，**不能**真的访问网络。

逐条 citation 启发式检核：

1. URL 形态是否合法（scheme / host 完整、无明显畸形）
2. inlineQuote（如有）与 topic 是否表面一致（同领域 / 同主体），有无明显矛盾
3. publishedDate（如可从 URL 推断）是否合理（不是未来日期、不超 5 年）
4. 来源域名信誉：政府 / 权威媒体 → 偏 plausible；blogspot / medium 个人页 / 内容农场 → suspicious

判定规则：

- `unverified-but-plausible` —— URL 形态合法 + 域名可信 + inlineQuote 与 topic 一致
- `unverified-suspicious` —— URL 异常 / 域名不可信 / inlineQuote 与 topic 不搭
- `contradicted` —— inlineQuote 与 topic 直接矛盾（数字相反、立场冲突）
- `verified` —— **本 mode 禁用**（结构上做不到，必须切 ReAct loop 才能用）

---

## 待核 citations

{{#each citations}}
**[{{index}}]** {{url}}
{{#if inlineQuote}}
inlineQuote: "{{inlineQuote}}"
{{/if}}

{{/each}}

---

## 核验状态

| status                     | 含义                                      | 当前 mode 可用 |
| -------------------------- | ----------------------------------------- | -------------- |
| `verified`                 | 工具调用拉到原文且 quote 匹配             | ✗ 禁用         |
| `unverified-but-plausible` | URL/域名/quote 启发式判断合理             | ✓              |
| `unverified-suspicious`    | URL 反常 / 域名可疑 / quote 与 topic 不搭 | ✓              |
| `contradicted`             | inlineQuote 与 topic 直接矛盾             | ✓              |

---

## Output JSON shape

```json
{
  "mode": "citation-audit",
  "summary": {
    "total": <int>,
    "verified": <int>,
    "unverified": <int>,
    "contradicted": <int>
  },
  "verdicts": [
    {
      "index": <int>,
      "url": "<source URL>",
      "status": "unverified-but-plausible" | "unverified-suspicious" | "contradicted",
      "evidence": "<≥30 字符启发式判断依据，明确写出未调工具>"
    }
  ]
}
```

> ★ summary.verified 在本 mode 下永远为 0。每条 verdict 的 evidence 必须明确写"未调工具，仅启发式"+ 具体判断依据。
