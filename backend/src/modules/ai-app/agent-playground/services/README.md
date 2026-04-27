# agent-playground / services

> 整个 mission pipeline 的工程层（业务逻辑 + 状态 + 调度），不含 LLM agent 本身（agent 在 ../agents/ ）。

## 目录结构

```
services/
├── README.md                           ← 本文档
├── research-team.orchestrator.ts       ← Mission 主剧本（顶层入口）
│
├── roles/                              ← 8 角色 service + 共享 invoker
│   ├── index.ts                        ← barrel export
│   ├── agent-invoker.service.ts        ← 底座：runAndRelay / lifecycle / cost / 并发 / DAG
│   ├── leader.service.ts               ← M0/M1/M6/M7 跨 milestone 容器
│   ├── researcher.service.ts           ← 单 dim 数据采集
│   ├── reconciler.service.ts           ← 跨 dim 对账（[3.5]）
│   ├── analyst.service.ts              ← 跨 dim 综合分析
│   ├── writer.service.ts               ← 6 模式写作
│   ├── reviewer.service.ts             ← 主观质量 / L4 critic / dim judge
│   ├── verifier.service.ts             ← 客观事实核验（4 mode，未接入）
│   └── steward.service.ts              ← 资源 / 合规守门（4 scope，未接入）
│
├── mission-store.service.ts            ← Prisma 持久化（mission row + leader_journal jsonb）
├── mission-state.service.ts            ← Mission 状态机
├── mission-abort.registry.ts           ← AbortController 注册表（per-mission cancel）
├── mission-ownership.registry.ts       ← Mission ↔ owner socket 映射
├── mission-event-buffer.service.ts     ← In-memory 事件缓冲（给 /replay 用）
│
├── leader-chat.service.ts              ← 用户与 Leader 的多轮聊天（M0 前的 clarify / append dim）
├── report-assembler.service.ts         ← 多 dim findings → ReportArtifact v2 组装
├── harness-failure-learner.service.ts  ← 跨 mission 失败模式记忆（model fallback 学习）
│
└── __tests__/                          ← 单元测试
```

## 设计原则

### 1. orchestrator 是"剧本"，不是"实现"

`research-team.orchestrator.ts` 应只串调度 —— stage A → stage B → stage C，每个 stage 委托给对应 role service 执行。

不应在 orchestrator 里写：

- 单 agent 的 self-heal 重试逻辑（属于 role service）
- prompt 拼装 / schema 解析（属于 agent class）
- 跨 mission 失败学习（属于 `HarnessFailureLearner`）

### 2. Role service = agent class 的 NestJS 包装

每个 role service：

- 注入 `AgentInvoker` 作为底座
- 暴露语义化方法（如 `WriterService.writeChapter()`）
- **不**自己重新实现 `runAndRelay` / `lifecycle` / `cost-tick`
- 失败学习 / 自愈 / 重试等横切关注由各 service 自己持有

### 3. AgentInvoker 是共享底座

`AgentInvoker` 是无状态 helper，承载：

- `invoke(spec, input, ctx)` → 跑 agent + 实时 relay 事件
- `emitLifecycle / emitEvent / tickCost` → 通用事件
- `runWithConcurrency / runDagConcurrency` → 池化并发
- `preDisableKnownFailingModels` → 跨 mission failure pattern 预查
- `resolveLoopOverride` → auditLayers 切 reflexion

业务流程一概不感知。

### 4. mission-\* 服务是状态层

`mission-store / mission-state / mission-abort / mission-ownership /
mission-event-buffer` 是 mission 生命周期的 5 个面，应保持各司其职。

- store: DB 持久化（CRUD）
- state: 状态机（transitions 校验）
- abort: 控制信号（cancel 传播）
- ownership: socket 映射
- event-buffer: replay 用 in-memory cache

### 5. Leader 是特殊的 service

`LeaderService` 与其它 7 个 role service 的不同：

- 它是 **factory**：每个 mission `create()` 一个 `SupervisedMission` 实例
- `SupervisedMission` 持有跨 4 个 milestone 的 `missionContext`，让 LeaderAgent 在 M7 看到自己 M0/M1/M6 的历史决策
- 其它 service 是无状态的（每次方法调用独立）

## 落地状态

| Service           | 落地        | orchestrator 使用 | 备注                               |
| ----------------- | ----------- | ----------------- | ---------------------------------- |
| AgentInvoker      | ✅          | 部分              | 与 orchestrator 私有 helper 并存   |
| LeaderService     | ✅          | ✅ M0/M1/M6/M7    | M1 dispatch 已闭环                 |
| ResearcherService | ✅ skeleton | 未使用            | 主 dispatch 仍在 orchestrator 闭包 |
| ReconcilerService | ✅ skeleton | 未使用            | 留作 PR-S6                         |
| AnalystService    | ✅ skeleton | 未使用            | 留作 PR-S6                         |
| WriterService     | ✅ skeleton | 未使用            | 6 mode 包装，14 调用点切换留 PR-S6 |
| ReviewerService   | ✅ skeleton | 未使用            | 留作 PR-S6                         |
| VerifierService   | ✅ skeleton | 未使用（未激活）  | 留作 PR-S5                         |
| StewardService    | ✅ skeleton | 未使用（未激活）  | 留作 PR-S5                         |

> 当前 PR 的目标是建立架构形态。深度搬迁 orchestrator 内现有逻辑到 service 留作后续小步迭代。

## 落地后预期

orchestrator 收缩到 ~800 行，每个 role service 持有自己的：

- agent class 引用
- 失败重试 / self-heal 策略
- 业务事件 emit
- 单元测试
