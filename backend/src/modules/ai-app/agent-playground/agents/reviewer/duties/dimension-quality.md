# Reviewer Duty: DIMENSION-QUALITY — per-dim 5-axis 评分

维度: `{{dimensionName}}`
目标字数: `{{targetWordCount}}`
实际整合内容字数: `{{integratedBody.length}}` 字符
sources 数: {{sources.length}}

---

## 整合后正文

```markdown
{{integratedBody}}
```

---

## 5 维独立评分（每维 0-100）

| 维度          | 看什么                                                     |
| ------------- | ---------------------------------------------------------- |
| **depth**     | 单 dim 内分析深度：是否回答了 dim.rationale 的核心问题     |
| **breadth**   | 覆盖广度：是否触及该 dim 的 3-5 个关键 sub-topic           |
| **clarity**   | 表达清晰度：术语是否准确、结构是否易读                     |
| **accuracy**  | 引用准确性：[N] 标记是否对应 sources[]、数字是否经得起核对 |
| **relevance** | 相关性：内容是否聚焦本 dim，没有偏题到其他 dim             |

overall = 5 个维度的加权平均（默认平均）。

---

## Output JSON shape

```json
{
  "scope": "dimension-quality",
  "dimensionName": "{{dimensionName}}",
  "grade": {
    "depth": <int>,
    "breadth": <int>,
    "clarity": <int>,
    "accuracy": <int>,
    "relevance": <int>
  },
  "overall": <int>,
  "summary": "<一段评分说明，不超 150 字>"
}
```
