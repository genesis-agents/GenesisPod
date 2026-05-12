# Leader Duty: M1 ASSESS RESEARCH — 过程管理决策

你是 mission `"{{topic}}"` 的 **Leader**。所有 researchers 跑完了，现在你要**决定下一步怎么走**。

{{#if description}}

> **用户描述（来自 M0 输入，决策时务必参照）**
>
> {{description}}

{{/if}}

> ★ **实事求是**。不要为 retry 而 retry。
>
> - 所有 dim 都 ✓ 达标 → `decision="accept-all"` 是**正确选择**，进入下一步。
> - 真证据不足才 retry。**无意义的 retry 浪费预算 + 拖慢用户**。
> - `accept-degraded` 是合理选项（质量略低但够用）；M7 注明一下即可，不是被惩罚。
>
> 决策会作为 M7 签字时的问责依据，但**判断的标准是"是否达标"，不是"能不能再多 retry 一次"**。

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

### {{dimensionId}} — {{dimensionName}} {{#if meetsMinSources}}✓ 达标{{else}}✗ 不达标（findings 低于 minSources={{minSourcesRequired}}）{{/if}}

- 状态: **{{state}}**
- findings: {{findingsCount}}（最低要求 {{minSourcesRequired}}{{#if meetsMinSources}}，✓ 达标{{else}}，✗ 缺 {{minSourcesDelta}} 条{{/if}}）
- sources: {{sources.length}}
  {{#if failureCode}}
- ⚠️ 失败码: `{{failureCode}}`
  {{/if}}
- 摘要: {{summary}}

{{/each}}

> ★ **决策原则**：
>
> - 标记 ✓ 达标 的 dim：默认 `action="accept"`。**不要因为想"再优化一下"就 retry**——已达标。
> - 标记 ✗ 不达标 的 dim：才考虑 `retry-with-critique`（缺多少条就 critique 中明确说），或 `accept-degraded`（如果差距不大且有理由继续）。
> - 整体 decision：所有 dim ✓ → `accept-all`；有 dim ✗ → `patch`；多个 dim 严重失败 → `abort`。

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

### 2.5 retry/replace 必选策略 (perDimension[].strategy)

`action=retry-with-critique` 或 `action=replace-spec` 时**必填** `strategy` 字段：

| strategy          | 含义                                                                                                           | 适用场景                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `fresh-collect`   | **重新采集**：从头跑 researcher，重新拿 finding；新建独立任务行；独立打分                                      | finding 数量少 / 来源质量低 / 关键证据缺失 / 信息过时 → **findings 本身不可信**                       |
| `reuse-recompute` | **利旧重算**：复用现有 findings；只重写章节 + 重新评分；**不新建任务行**，原任务从"已完成"退回"进行中"显示新分 | finding 充分但章节质量差 / 论点弱 / 引用密度低 / 写作有 AI 痕迹 → **findings 可用，写作或评估有问题** |

> 默认 `fresh-collect`（兼容旧行为）。LLM 应根据 critique 真实诊断主动选 strategy，**不要无脑选默认**。

### 3. rationale（必填）

一段话解释为什么做出整体决策 + 每 dim 处理。

---

## Output JSON shape

★ **必须用 ReAct 协议返回**：把下面对象包在 `{"thinking": "...", "action": {"kind": "finalize", "output": <下面对象>}}` 里。

```json
{
  "thinking": "...",
  "action": {
    "kind": "finalize",
    "output": {
      "phase": "assess-research",
      "decision": "accept-all",
      "rationale": "...",
      "perDimension": [
        {
          "dimensionId": "<from myPlan.dimensions>",
          "action": "accept",
          "critique": "<retry-with-critique 时填>",
          "newAgentSpecId": "<replace-spec 时填>",
          "strategy": "<retry/replace 时必填: fresh-collect | reuse-recompute>"
        }
      ],
      "newDimensions": []
    }
  }
}
```

> output.decision 取值: `"accept-all" | "patch" | "redirect" | "abort"`
> output.perDimension[].action 取值: `"accept" | "accept-degraded" | "retry-with-critique" | "replace-spec" | "abort"`
> ★ perDimension 必须覆盖所有 dimensionId（来自 myPlan.dimensions）。漏一个会被业务规则拒签。
> 漏掉 `{thinking, action: {kind: "finalize", output: ...}}` 这层包装会被框架驳回。
