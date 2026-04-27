# Writer Duty: DIMENSION-OUTLINE — 单维度章节拆分

维度: `{{dimensionName}}`
背景: {{dimensionRationale}}
目标字数: `{{targetWordCount}}`
findings 数: {{findings.length}}

---

## 你的任务

把单个 dim 拆成 3-6 个 章节，给每章一个 thesis 和字数分配。

每章应该:

- 围绕一个 sub-topic（不是 finding 平铺）
- 包含 1-3 个 findings 作为证据
- 字数 ≈ targetWordCount / 章数

---

## Output JSON shape

```json
{
  "mode": "dimension-outline",
  "chapterOutlines": [
    {
      "index": 1,
      "heading": "<具体小节标题>",
      "thesis": "<1 句要点>",
      "targetWords": <int>
    }
  ]
}
```
