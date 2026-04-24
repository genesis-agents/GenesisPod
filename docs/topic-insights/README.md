# Topic Insights · Documentation Index

模块路径：`backend/src/modules/ai-app/topic-insights/`

---

## 🚨 当前状态：功能补回中

> **上一 session 完成了目录架构 SOTA 重构（84/100），但审计发现 H6 legacy sweep 造成严重功能丢失。**
> **下一 session 必须按 `functional-restoration-plan.md` 分 F1-F8 批次完整补回。**

### ⚡ 下一 session 起步指引

1. 读 `HANDOFF-2026-04-23.md`（5 分钟了解上下文）
2. 读 `functional-restoration-plan.md`（30 分钟了解路线图）
3. 读 `debug/topic-insights-functional-loss-audit-2026-04-23.md`（丢失清单证据）
4. 按 F1 开始

---

## 📚 文档索引

### 规划 / 执行

| 文档 | 用途 |
|---|---|
| [HANDOFF-2026-04-23.md](./HANDOFF-2026-04-23.md) | ★ Session 交接文档 |
| [functional-restoration-plan.md](./functional-restoration-plan.md) | ★ F1-F8 执行路线图 |

### 审计

| 文档 | 用途 |
|---|---|
| `../../debug/topic-insights-functional-loss-audit-2026-04-23.md` | 功能丢失审计（P0-P2 证据） |
| `../../debug/topic-insights-current-state-audit.md` | 目录结构 + SOTA 评分 |

---

## 🎯 模块简介

Topic Insights 是 Genesis.ai 平台的**专题深度研究 AI App**，面向企业级用户产出多维度研究报告。

### 核心概念

- **Mission**：一次研究任务（用户发起的洞察请求）
- **Agents**：17 个声明式 IAgentSpec（leader-planner / fact-checker / quality-reviewer / ...）
- **Skills**：47 个 `.skill.md` 资产（分析 / 辩论 / 框架 / 质量 / 报告 / 研究）
- **Knowledge**：数据源 + 搜索 + 证据图谱
- **Memory**：事件流 + 实时推送 + 健康监测
- **Artifacts**：产出物（Topic / Report / Strategy / Collaboration）

### 目录结构

```
topic-insights/
├── topic-insights.module.ts
├── topic-insights.service.ts           # Facade (待瘦身到 < 500 行)
├── services.ts                         # ⚠ Compat barrel（F8 删除）
├── index.ts
│
├── mission/     pipeline + control + observation
├── agents/      specs (17) + capability + activity
├── skills/      47 个 .skill.md（6 个领域）
├── knowledge/   sources + search + evidence + graph
├── memory/      events + store + mission-health + refresh.scheduler
├── artifacts/   topic + report/{core,enhancement,editing,quality} + strategy + collaboration
├── api/         controllers + gateways + dto + guards + interceptors
├── shared/      types + utils + telemetry + baseline + compute-usage
├── prompts/     6 个 .prompt.ts
└── intent/      dispatcher + agent + team config
```

---

## 📊 关键数字

| 指标 | 值 |
|---|---|
| 非测试 .ts 文件 | 230 |
| 非测试 LOC | 64,897 |
| 测试 suites | 145 |
| 测试 tests | 4,311 |
| SOTA 评分 | 84/100 |

---

## 🔗 相关

- CLAUDE.md: `.claude/CLAUDE.md`
- 开发规范: `standards/00-overview.md`
- 架构分层: 5 层（Intent Gateway / Open API / AI Apps / AI Engine / AI Infrastructure）
- Harness primitives: H1 cancel / H2 checkpoint / H3 single-dim scope / H4 decision emission

---

**最后更新**：2026-04-23
