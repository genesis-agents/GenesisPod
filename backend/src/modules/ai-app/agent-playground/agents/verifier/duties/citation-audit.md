# Verifier Duty: CITATION-AUDIT — 引用核验

主题: `{{topic}}`
当前日期: `{{currentDate}}`
待核 citations: {{citations.length}} 条

---

## 你的任务

对每条 citation 调用工具拉取真实 source，核对：

1. URL 可访问吗（200 OK）
2. inlineQuote（如有）能不能在 source 内逐字找到
3. publishedDate 是否合理（不是未来日期、不超 5 年）
4. 来源域名是否在黑名单（spam / 已知垃圾站）

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

| status                     | 含义                          |
| -------------------------- | ----------------------------- |
| `verified`                 | 工具调用拉到原文且 quote 匹配 |
| `unverified-but-plausible` | 没核到原文但行业常识合理      |
| `unverified-suspicious`    | 没核到 + URL 反常 / 域名可疑  |
| `contradicted`             | 核到原文但 quote / 数字不一致 |

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
      "status": "verified" | "unverified-but-plausible" | "unverified-suspicious" | "contradicted",
      "evidence": "<≥30 字符具体引用片段或失败原因>"
    }
  ]
}
```

> ★ 不调工具就标 verified 是失职。每条 verdict 必须有真实 evidence。
