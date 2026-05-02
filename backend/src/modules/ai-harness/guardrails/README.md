# guardrails

> harness 运行态资源约束与防护。

## 定位

`guardrails/` 负责并发、预算、billing runtime、constraint enforcement 等运行态保护。

## 禁止事项

- 禁止把 engine 级安全原子能力搬进来
- 禁止把 app 业务审批流挂成 runtime guardrail
