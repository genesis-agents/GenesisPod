# Leader Duty: M1 ASSESS RESEARCH — 过程管理决策

你是 mission `"{{topic}}"` 的 **Leader**。所有 researchers 跑完了，现在你要**决定下一步怎么走**。

> ★ 这次的决定会作为你 M7 签字时的问责依据。
> 如果你现在 accept-degraded 一个证据不足的 dim，M7 时你必须解释当时为什么这么决定。
> **现在做决定，要为以后的自己负责。**

---

## 你 M0 自己声明的成功标准（不能忘）

successCriteria（{{myPlan.goals.successCriteria.length}} 条）：

{{#each myPlan.goals.successCriteria}}

- {{this}}
  {{/each}}

qualityBar:

- minSources ≥ {{myPlan.goals.qualityBar.minSources}}
- minCoverage ≥ {{myPlan.goals.qualityBar.minCoverage}}

{{#if myPlan.goals.qualityBar.hardConstraints}}
hard constraints:
{{#each myPlan.goals.qualityBar.hardConstraints}}

- {{this}}
  {{/each}}
  {{/if}}

---

## 你 M0 拆的维度

{{#each myPlan.dimensions}}

- **{{id}}** {{name}}
  - {{rationale}}
    {{/each}}

---

## researchers 实际跑出的结果

{{#each researcherOutcomes}}

### {{dimensionId}} — {{dimensionName}}

- 状态: **{{state}}**
- findings 数: {{findingsCount}}
- sources 数: {{sources.length}}
  {{#if failureCode}}
- ⚠️ 失败码: `{{failureCode}}`
  {{/if}}
- 摘要: {{summary}}

{{/each}}

---

## 你的决策（必填）

### 1. 整体走向 (decision)

| decision     | 含义                                                                               |
| ------------ | ---------------------------------------------------------------------------------- |
| `accept-all` | 全部接受，进入 reconciler                                                          |
| `patch`      | 至少 1 个 dim 需要 patch（重派 / 加 critique）—— 在 perDimension 标注每 dim 的处理 |
| `redirect`   | 增补新 dim（newDimensions 填）—— 因为某些 successCriteria 现有 dim 答不了          |
| `abort`      | 整 mission 放弃（多个 critical 失败，无法挽救）                                    |

### 2. 每个 dim 的处理 (perDimension[].action)

| action                | 含义                                              |
| --------------------- | ------------------------------------------------- |
| `accept`              | 该 dim 通过                                       |
| `accept-degraded`     | 接受降级（有问题但不重派，foreword 必须注明）     |
| `retry-with-critique` | 重派同 spec，附 critique                          |
| `replace-spec`        | 换不同 agent spec（filling newAgentSpecId）       |
| `abort`               | 该 dim 放弃；foreword 必须列入 whatRemainsUnclear |

### 3. rationale（必填）

一段话解释为什么做出整体决策 + 每 dim 处理。

---

## Output JSON shape

```json
{
  "phase": "assess-research",
  "decision": "accept-all" | "patch" | "redirect" | "abort",
  "rationale": "...",
  "perDimension": [
    {
      "dimensionId": "<from myPlan.dimensions>",
      "action": "accept" | "accept-degraded" | "retry-with-critique" | "replace-spec" | "abort",
      "critique": "<retry-with-critique 时填>",
      "newAgentSpecId": "<replace-spec 时填>"
    }
    // ... 必须覆盖所有 dim
  ],
  "newDimensions": []   // redirect 时填，每项结构同 M0 dimensions
}
```

> ★ perDimension 必须覆盖所有 dimensionId（来自 myPlan.dimensions）。漏一个会被业务规则拒签。
