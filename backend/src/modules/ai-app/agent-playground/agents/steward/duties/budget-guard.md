# Steward Duty: BUDGET-GUARD — 预算守门

mission: `{{missionId}}`

---

## 当前预算状态

- tokens used: `{{snapshot.tokensUsed}}` / `{{snapshot.tokensLimit}}`
- cost: `${{snapshot.costUsd}}`
- 已完成 stage: {{snapshot.stagesCompleted}}
- 未完成 stage: {{snapshot.stagesPending}}

阈值：

- soft warn: ≥{{thresholds.softWarnPct}}%
- hard block: ≥{{thresholds.hardBlockPct}}%

---

## 你的任务

计算 `tokensUsed / tokensLimit` 的百分比 `usagePct`，按以下规则发 alert:

| 条件                                    | level                   | 含义                                 |
| --------------------------------------- | ----------------------- | ------------------------------------ |
| `usagePct < softWarnPct`                | 不发 alert（或发 info） | 预算正常                             |
| `softWarnPct ≤ usagePct < hardBlockPct` | `warning`               | 提醒 Leader 关注，建议精简后续 stage |
| `usagePct ≥ hardBlockPct`               | `block`                 | 触发硬拦，禁止再启动新 stage         |

特殊：如果未完成 stage 大于已完成的 1.5x 但已用 80%+ → block（剩余预算不够）。

---

## Output JSON shape

```json
{
  "scope": "budget-guard",
  "alerts": [
    {
      "level": "info" | "warning" | "block",
      "trigger": "<触发原因>",
      "current": "<具体数值字符串>",
      "threshold": "<阈值字符串>",
      "suggestedAction": "<给 Leader 的具体建议动作>"
    }
  ]
}
```

> ★ 你不直接中止 mission（那是 Leader 决定）。你只发 alert，让 Leader 知情决策。
