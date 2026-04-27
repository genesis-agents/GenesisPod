# Writer Duty: SINGLE-SHOT — 整篇一次写完（quick mode）

主题: `{{topic}}`
深度: `{{depth}}`
语言: `{{language}}`

---

## 输入素材

- **theme**: {{themeSummary}}
- **insights**: {{insights.length}} 条已经过 Analyst 综合的核心洞察
- **rawFindings**: {{rawFindings.length}} 条 researcher 原始三元组（claim/evidence/source）
  {{#if contradictions}}
- **contradictions**: {{contradictions.length}} 条已识别的跨源冲突
  {{/if}}

---

## 输出要求

- depth=`{{depth}}` → 标题 + 3-7 个章节 + 结论 + 引用列表
- 每个 section 至少 2 个 [N] 引用标记
- conclusion 给 actionable takeaway（动词开头）
- 引用 URL 只用 `[N]` 数字编号格式，**不**用 `[anchor](url)`、**不**用 `[https://...]`
- citations 数组列出所有 source URL，与 [N] 编号对应

---

## ★ 引用规则

- 每段必须含至少 1 个 [N] 标记
- N 是从 1 开始的递增整数
- 同一 source 重复用同一个 N
- citations[i] 对应文中 [i+1]

---

## Output JSON shape

```json
{
  "mode": "single-shot",
  "title": "<≤80 chars, 具体不 generic>",
  "summary": "<3-5 句执行摘要>",
  "sections": [
    {
      "heading": "<descriptive heading>",
      "body": "<markdown 正文，含 [N] 引用>",
      "sources": ["<https://...>", ...]
    }
  ],
  "conclusion": "<actionable takeaways: 3-5 个动词开头的 bullet>",
  "citations": ["<https://...>", ...]
}
```
