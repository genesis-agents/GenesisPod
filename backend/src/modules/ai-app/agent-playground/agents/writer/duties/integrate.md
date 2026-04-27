# Writer Duty: INTEGRATE — per-dim 章节整合

维度: `{{dimensionName}}`
章节数: {{chapters.length}}

每章草稿:

{{#each chapters}}

### #{{index}} {{heading}}

（字数 {{wordCount}}）

{{body}}

---

{{/each}}

## 你的任务

把这 {{chapters.length}} 个章节整合成**一个连贯的 dim section**:

1. **过渡句**: 章节之间加自然过渡，不要硬拼
2. **去重**: 多章重复提到的同一事实，只保留最强引用
3. **首章保留**: 第一章保留作为 dim 引子
4. **末段**: 最后一段总结 dim 的核心 takeaway

## Output JSON shape

```json
{
  "mode": "integrate",
  "dimensionName": "{{dimensionName}}",
  "integratedBody": "<连贯的 markdown 正文，含原章节标题作为 ### 子标>",
  "totalWordCount": <int>,
  "sources": ["<unique source URLs>", ...]
}
```
