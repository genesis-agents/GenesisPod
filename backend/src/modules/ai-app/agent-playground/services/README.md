# agent-playground / services

> Mission pipeline 的工程层 —— 业务剧本 + 角色服务 + 生命周期 + 输出物 + 跨 mission 学习。
>
> **Playground 定位**：所有 Agent Team 业务的范本（template）。未来新业务（writing-team /
> debate-team / planning-team 等）直接复制这套架构，按需替换 stage 内容即可。

## 目录结构

```
services/
├── README.md                                      ← 本文档
│
├── mission/                                       ← Mission 总目录（剧本 + 生命周期）
│   ├── workflow/                                  ← Mission 业务剧本（trunk + stages）
│   │   ├── team.mission.ts                        ← Trunk 主剧本（约 680 行连贯 await）
│   │   ├── mission-context.ts                     ← 跨 stage 共享状态（ctx）
│   │   ├── mission-deps.ts                        ← stage 函数依赖包
│   │   ├── helpers/                               ← 纯函数工具（无业务依赖）
│   │   │   ├── failure-extraction.util.ts         ← agent failure code/message 抽取
│   │   │   ├── token-spend.util.ts                ← token / cost 统计
│   │   │   └── per-dim-pipeline.util.ts           ← per-dim chapter pipeline 子流程
│   │   └── stages/                                ← 11 个 stage 函数（s1 → s11）
│   │       ├── s1-mission-estimate-budget.stage.ts
│   │       ├── s2-leader-plan-mission.stage.ts
│   │       ├── s3-researcher-collect-findings.stage.ts
│   │       ├── s4-leader-assess-research.stage.ts
│   │       ├── s5-reconciler-cross-dim-fact-check.stage.ts
│   │       ├── s6-analyst-synthesize-insights.stage.ts
│   │       ├── s7-writer-plan-outline.stage.ts
│   │       ├── s8-writer-draft-report.stage.ts
│   │       ├── s9-reviewer-critic-l4.stage.ts
│   │       ├── s10-leader-foreword-and-signoff.stage.ts
│   │       └── s11-mission-persist.stage.ts
│   │
│   └── lifecycle/                                 ← Mission 生命周期 / 状态 / 持久化
│       ├── mission-store.service.ts               ← Prisma 持久化（mission row + leader_journal jsonb）
│       ├── mission-state.service.ts               ← 状态机（transitions + summarize-on-handoff）
│       ├── mission-abort.registry.ts              ← AbortController 注册表（per-mission cancel）
│       ├── mission-ownership.registry.ts          ← Mission ↔ owner socket 映射
│       └── mission-event-buffer.service.ts        ← /replay 内存事件缓冲
│
├── roles/                                         ← 8 角色 service + 共享 invoker
│   ├── index.ts                                   ← barrel export
│   ├── agent-invoker.service.ts                   ← 底座（runAndRelay / lifecycle / cost / 并发 / DAG）
│   ├── leader.service.ts                          ← Leader 跨 milestone 容器（factory）
│   ├── researcher.service.ts                      ← researcher 角色服务
│   ├── reconciler.service.ts                      ← reconciler 角色服务
│   ├── analyst.service.ts                         ← analyst 角色服务
│   ├── writer.service.ts                          ← writer 多模式服务（6 method）
│   ├── reviewer.service.ts                        ← reviewer 多模式服务（3 method）
│   ├── verifier.service.ts                        ← verifier 客观核验（4 mode）
│   └── steward.service.ts                         ← steward 资源/合规守门（4 scope）
│
├── chat/                                          ← 用户与 Agent 的对话
│   └── leader-chat.service.ts                     ← 用户 ↔ Leader 多轮聊天
│
├── artifact/                                      ← 输出物组装
│   └── report-assembler.service.ts                ← per-dim findings → ReportArtifact v2 装配
│
├── failure-learning/                              ← 跨 mission 学习
│   └── harness-failure-learner.service.ts         ← 跨 mission failure pattern 记忆
│
└── __tests__/                                     ← 单元测试
```

## 三层架构

```
Mission（业务剧本）        ← team.mission.ts + 11 个 stage
   │
   ├─ 决定调用顺序、分支、交接
   ├─ 持有 MissionContext（跨 stage 状态）
   └─ 通过 MissionDeps 注入下层依赖
        ↓
Agent（一次完整认知任务）   ← agents/<role>/<role>.agent.ts + duty.md
   │
   ├─ 单次 LLM 调用 + schema-bound input/output
   └─ 由对应 role service 包装暴露
        ↓
Harness（执行底座）         ← ai-engine/runtime/*
   │
   ├─ react / reflexion loop
   ├─ tool catalog / billing / budget guard
   └─ 业务无关，完全通用
```

## Stage 命名规则

每个 stage 文件名：`s{序号}-{agent}-{职责}.stage.ts`

- 序号：阶段顺序（1..11）
- agent：执行该 stage 的角色名（leader / researcher / writer / reviewer / mission 等）
- 职责：动词短语描述实际在做什么（plan-mission / collect-findings / draft-report 等）

每个 stage 文件头部按统一格式说明：reads ctx / writes ctx / deps / failure modes。

## Stage 调用图

```
runMission()
  ├─ 装配 MissionContext + MissionDeps
  ├─ s1  mission     estimate-budget         预算闸门 + mission:started
  ├─ s2  leader      plan-mission            Leader 维度规划 + 声明 goals
  ├─ s3  researcher  collect-findings        researcher×N + per-dim pipeline
  ├─ s4  leader      assess-research         Leader 看 researcher 产出做 retry/abort
  ├─ s5  reconciler  cross-dim-fact-check    跨 dim 对账
  ├─ s6  analyst     synthesize-insights     综合 insights / themeSummary
  ├─ s7  writer      plan-outline            mission 级章节大纲（thorough+ 档位）
  ├─ s8  writer      draft-report            起草 + L3 三路评分 + memory + assemble
  ├─ s9  reviewer    critic-l4               独立 meta-review
  ├─ s10 leader      foreword-and-signoff    综合摘要 + 签字
  └─ s11 mission     persist                 markCompleted / markFailed
```

## 设计原则

### 1. Mission 是"剧本"，不是"实现"

`team.mission.ts` 应只串调度 —— stage A → stage B → stage C，每个 stage 委托给对应
role service 执行。

不应在 Mission 里写：

- 单 agent 的 self-heal 重试逻辑（属于 stage 文件 + role service）
- prompt 拼装 / schema 解析（属于 agent class）
- 跨 mission 失败学习（属于 `HarnessFailureLearner`）

### 2. Role service = agent class 的 NestJS 包装

每个 role service：

- 注入 `AgentInvoker` 作为底座
- 暴露语义化方法（如 `WriterService.writeChapter()`）
- **不**自己重新实现 runAndRelay / lifecycle / tickCost
- 失败学习 / 自愈 / 重试等横切关注由 stage 文件持有

### 3. AgentInvoker 是共享底座

`AgentInvoker` 是无状态 helper，承载：

- `invoke(spec, input, ctx)` → 跑 agent + 实时 relay 事件
- `emitEvent / emitLifecycle / tickCost` → 通用事件
- `runWithConcurrency / runDagConcurrency` → 池化并发
- `preDisableKnownFailingModels` → 跨 mission failure pattern 预查
- `resolveLoopOverride` → auditLayers 切 reflexion

业务流程一概不感知。

### 4. mission/lifecycle 是状态层

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
- `SupervisedMission` 持有跨 4 个 milestone 的 `missionContext`，让 Leader 在签字时
  能引用自己历史决策做问责（accountabilityNote）
- 其它 service 是无状态的（每次方法调用独立）

## 复制做新业务的步骤

1. 复制整个 `agent-playground/` 目录到 `your-new-team/`
2. 文件 + 类全局 sed 改名：`agent-playground` → `your-new-team`
3. 控制器 endpoint：`/api/v1/your-new-team/team/run`
4. 删/改不需要的 stage（比如不需要 reconciler 就删 s5）
5. 改 stage 内 prompt / agent input / output schema 到自己业务
6. 改 `agents/<role>/duty.md` 描述到自己业务
7. 模块注册到 `app.module.ts`

每个 stage 的"写什么"由你的业务决定；"怎么走、谁先谁后、何时交接"
是这套 Mission 框架已经定好的 11 步流程。
