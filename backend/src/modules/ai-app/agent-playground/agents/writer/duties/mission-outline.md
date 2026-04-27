# Writer Duty: MISSION-OUTLINE — 规划全 mission 章节框架（W1）

主题: `{{topic}}`
深度: `{{depth}}` → 总字数目标: `{{targetWordCount}}`
语言: `{{language}}`

## 你的任务

在 ChapterWriter 并发写章前，**先做章节级规划**:

1. 拆 mission 成 5-12 个章节（按 depth）
2. 给每章一个 thesis（一句话要点）
3. 分配 targetWords 给每章（合计 ≈ targetWordCount）

---

## 输入

- **theme**: {{themeSummary}}
- **insights**: {{insights.length}} 条核心洞察

---

## Output JSON shape

```json
{
  "mode": "mission-outline",
  "chapterOutlines": [
    {
      "index": 1,
      "heading": "<具体章节标题>",
      "thesis": "<1 句要点>",
      "targetWords": <int>
    }
  ],
  "totalTargetWords": <int>
}
```

合计 totalTargetWords 应在 `{{targetWordCount}}` ± 20% 范围内。
