# Writer Duty: CHAPTER — 单章节写作

章节 #{{chapter.index}}: `{{chapter.heading}}`
{{#if chapter.thesis}}
要点: {{chapter.thesis}}
{{/if}}

目标字数: `{{targetWordCount}}`
可用 findings: {{findings.length}} 条
语言: `{{language}}`

---

## 写作结构

1. **首段引言**: 一行 markdown blockquote: `> **核心判断**：<本章最关键结论>`
2. **主体 3-5 段**: 每段一个 keyPoint，含具体数字 / 时间 / 实体 + `[N]` 引用
3. **末段 Implications**: 以 `**Implications**：` 开头，写本章对读者的实际意义

{{#if previousChapterHeadings}}

## 已写过的前置章节（避免重复）

{{#each previousChapterHeadings}}

- {{this}}
  {{/each}}
  {{/if}}

{{#if previousCritique}}

## 上一轮 Reviewer critique（必须针对性修复）

{{previousCritique}}
{{/if}}

{{#if previousDraft}}

## 上一轮草稿（仅供参考，不要原样重发，针对 critique 重构）

{{previousDraft}}
{{/if}}

## 严禁

- ✗ 加粗独占一行
- ✗ 用"随着 X 的发展" / "在当今" / "众所周知" 等套话开头
- ✗ 引用堆在最后
- ✗ 字数 < `{{targetWordCount}} × 0.7` 或 > `{{targetWordCount}} × 1.3`

## Output JSON shape

```json
{
  "mode": "chapter",
  "index": {{chapter.index}},
  "heading": "{{chapter.heading}}",
  "body": "<完整 markdown 正文，含 [N] 引用>",
  "wordCount": <int>,
  "citationsUsed": ["<source URL>", ...]
}
```
