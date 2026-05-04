# L2.5 AI Harness

> Agent 运行时与编排层。负责"agent 怎么跑"，不负责"agent 能做什么"。
> 单一信息源：[`backend/src/modules/ai-harness/README.md`](../../../backend/src/modules/ai-harness/README.md)

## 11 个顶层聚合

| 聚合          | 代码路径                 | 职责                                                                |
| ------------- | ------------------------ | ------------------------------------------------------------------- |
| `agents/`     | `ai-harness/agents/`     | agent 定义、registry、subagent、builtin skills、learning            |
| `runner/`     | `ai-harness/runner/`     | loop / executor / context / prompt / env / plan execution           |
| `teams/`      | `ai-harness/teams/`      | multi-agent team / orchestrator / collaboration（含投票/辩论/审核） |
| `handoffs/`   | `ai-harness/handoffs/`   | agent handoff（OpenAI 标准）+ registry                              |
| `memory/`     | `ai-harness/memory/`     | working / vector / checkpoint / event-store / consolidation         |
| `protocols/`  | `ai-harness/protocols/`  | a2a / ipc / events / realtime / journal                             |
| `evaluation/` | `ai-harness/evaluation/` | critique / judge / quality gate / figure evaluation                 |
| `guardrails/` | `ai-harness/guardrails/` | budget / billing / rate-limit / concurrency / constraint            |
| `tracing/`    | `ai-harness/tracing/`    | otel / eval / latency / llm-events / attribution                    |
| `lifecycle/`  | `ai-harness/lifecycle/`  | hooks / supervisor / mission lifecycle / learning                   |
| `facade/`     | `ai-harness/facade/`     | 对外门面（仅 re-export + thin delegation）                          |

## 边界规则

- **不承载 engine 原子能力**：单次 LLM、单次 tool、单 skill execute 都在 L2 ai-engine
- **不承载 app 业务流程**：mission 业务脚本归 L3 ai-app
- 一切对外消费走 `ai-harness/facade`
- 依赖方向：`ai-app → ai-harness → ai-engine → ai-infra`，禁止反向

## L2 vs L2.5 速查

| 概念                       | 归属         |
| -------------------------- | ------------ |
| 调一次 LLM                 | L2 ai-engine |
| 跑一次 ReAct loop          | L2.5 harness |
| 一个 SKILL.md 的 execute   | L2 ai-engine |
| Agent 怎么造 / 怎么跑      | L2.5 harness |
| Mission / multi-agent team | L2.5 harness |
| Tool 调用                  | L2 ai-engine |
| ToolInvoker（agent 视角）  | L2.5 harness |

## 子目录说明

`protocols/` 已收纳 SSE / WebSocket 实时通信文档（旧 `ai-infra/realtime/` 已并入）。
