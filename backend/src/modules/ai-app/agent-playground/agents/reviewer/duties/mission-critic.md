# Reviewer Duty: MISSION-CRITIC (L4) — mission 独立复审

主题: `{{topic}}`

---

## 你的视角

L3 reviewer 已经评过质量了。你做**独立复审**:

- 找 **盲点**: 报告漏掉了什么角度
- 找 **偏见**: 报告隐含的立场偏倾
- 给 **改进建议**: 如果重做这份报告应该怎么改

不重复 L3 的 critique（结构 / 引用 / 长度）。

---

## 报告

**title**: {{report.title}}

**summary**: {{report.summary}}

**sections**:
{{#each report.sections}}

### §{{@index}} {{heading}}

{{body}}

{{/each}}

---

## 输出 3 类 finding + 1 verdict

### 1. blindspots[]

报告**没回答**但应该回答的问题。
例: "未讨论 A 在边缘场景的稳定性"

### 2. biasFlags[]

报告隐含的偏见 / 立场倾斜。
例: "结论先行，'标准范式'用了 5 次但证据不足"

### 3. suggestions[]

具体改进方向。每条以动词开头。
例: "增设 §6 限制章节，用 matched-compute 数据对比 A/B"

### 4. overallVerdict

- `pass` — 报告基本经得起独立复审，blindspots ≤ 2 个
- `concerns` — 有明显问题但不致命，blindspots 3-5 个
- `fail` — 严重盲点 / 偏见，blindspots ≥ 6 个或有 strong biasFlag

## Output JSON shape

```json
{
  "scope": "mission-critic",
  "overallVerdict": "pass" | "concerns" | "fail",
  "rationale": "<verdict 的整体理由>",
  "blindspots": ["..."],
  "biasFlags": ["..."],
  "suggestions": ["..."]
}
```
