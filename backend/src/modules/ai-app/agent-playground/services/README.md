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
│   ├── workflow/                                  ← Mission 业务剧本（pipeline + stages）
│   │   ├── playground-pipeline-dispatcher.service.ts ← Mission orchestrator dispatcher（hooks + sessions）
│   │   ├── mission-context.ts                     ← 跨 stage 共享状态（ctx）
│   │   ├── mission-deps.ts                        ← stage 函数依赖包
│   │   ├── mission-runtime-shell.service.ts       ← Z3 framework adapter（billing / heartbeat / wallTimer / cleanup）
│   │   ├── mission-stage-bindings.service.ts      ← buildCtx / buildDeps（stage 函数参数装配）
│   │   ├── narrative.util.ts                      ← 人话叙事事件辅助（stage 内 narrate 入口）
│   │   ├── per-dim-pipeline.util.ts               ← per-dim chapter pipeline 子流程
│   │   ├── report-artifact-sections.util.ts       ← report section 切片归一化
│   │   ├── similarity.util.ts                     ← 文本相似度（jaccard，stuck-revision 检测）
│   │   ├── word-count-normalizer.util.ts          ← 章节字数归一化（playground 预设 wrapper）
│   │   └── stages/                                ← 14 个 stage 函数（s1 → s12，含 s8b/s9b）
│   │       ├── s1-mission-estimate-budget.stage.ts
│   │       ├── s2-leader-plan-mission.stage.ts
│   │       ├── s3-researcher-collect-findings.stage.ts
│   │       ├── s4-leader-assess-research.stage.ts
│   │       ├── s5-reconciler-cross-dim-fact-check.stage.ts
│   │       ├── s6-analyst-synthesize-insights.stage.ts
│   │       ├── s7-writer-plan-outline.stage.ts
│   │       ├── s8-writer-draft-report.stage.ts
│   │       ├── s8b-section-quality-enhancement.stage.ts
│   │       ├── s9-reviewer-critic-l4.stage.ts
│   │       ├── s9b-report-objective-evaluation.stage.ts
│   │       ├── s10-leader-foreword-and-signoff.stage.ts
│   │       ├── s11-mission-persist.stage.ts
│   │       └── s12-self-evolution.stage.ts        ← 终态后 fire-and-forget（非 pipeline.steps 一员）
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
│   ├── agent-invoker.service.ts                   ← 兼容门面（保持 role/stage 调用面稳定）
│   ├── agent-execution-support.ts                 ← 通用执行支撑（run / 并发 / DAG）
│   ├── agent-playground-event-relay.ts            ← Playground 事件映射 / cost relay
│   ├── agent-invocation-policy.ts                 ← Playground 调用策略（loop / failure learning）
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
└── __tests__/                                     ← 单元测试

跨 mission failure pattern 记忆已上提到 ai-harness/governance/learning/failure-learner.service.ts
（FailureLearnerService），通过 @/modules/ai-harness/facade 注入。
```

## 三层架构

```
Mission（业务剧本）        ← playground.config.ts + dispatcher + 14 stage
   │
   ├─ 决定调用顺序、分支、交接（pipeline DAG declarative）
   ├─ 持有 MissionContext（跨 stage 状态）
   └─ 通过 MissionDeps 注入下层依赖
        ↓
Agent（一次完整认知任务）   ← agents/<role>/<role>.agent.ts + duty.md
   │
   ├─ 单次 LLM 调用 + schema-bound input/output
   └─ 由对应 role service 包装暴露
        ↓
Harness（执行底座）         ← ai-harness sediment topology
   │
   ├─ Z3 BusinessAgentTeam framework（mission-runtime-shell / event-relay）
   ├─ Z4 MissionPipelineOrchestrator（stage 编排）
   ├─ Z1 lifecycle primitives（store / abort / liveness / ownership）
   ├─ Z2 checkpoint store / Z5 stage primitives
   └─ 业务无关，benchmark consumer 同时 import 5 个 zone（详见 docs/architecture/ai-harness/sediment-topology.md）
```

## Stage 命名规则

每个 stage 文件名：`s{序号}-{agent}-{职责}.stage.ts`

- 序号：阶段顺序（1..12，含 s8b / s9b 子阶段）
- agent：执行该 stage 的角色名（leader / researcher / writer / reviewer / mission 等）
- 职责：动词短语描述实际在做什么（plan-mission / collect-findings / draft-report 等）

每个 stage 文件头部按统一格式说明：reads ctx / writes ctx / deps / failure modes。

## Stage 调用图

```
PlaygroundPipelineDispatcher.runMission()
  ├─ 通过 MissionRuntimeShellService（Z3 adapter）开 session
  ├─ MissionPipelineOrchestrator（Z4）按 playground.config.ts 跑 13 step
  │   ├─ s1   mission     estimate-budget          预算闸门 + mission:started
  │   ├─ s2   leader      plan-mission             Leader 维度规划 + 声明 goals
  │   ├─ s3   researcher  collect-findings         researcher×N + per-dim pipeline
  │   ├─ s4   leader      assess-research          Leader 看 researcher 产出做 retry/abort
  │   ├─ s5   reconciler  cross-dim-fact-check     跨 dim 对账
  │   ├─ s6   analyst     synthesize-insights      综合 insights / themeSummary
  │   ├─ s7   writer      plan-outline             mission 级章节大纲（thorough+ 档位）
  │   ├─ s8   writer      draft-report             起草 + L3 三路评分 + memory + assemble
  │   ├─ s8b  reviewer    section-quality-enhance  分章节质量增强
  │   ├─ s9   reviewer    critic-l4                独立 meta-review
  │   ├─ s9b  reviewer    objective-eval           客观核验
  │   ├─ s10  leader      foreword-and-signoff     综合摘要 + 签字
  │   └─ s11  mission     persist                  markCompleted / markFailed
  └─ s12 mission：fire-and-forget postlude（self-evolution，非 pipeline.steps 一员）
```

## 设计原则

### 1. Mission 是"剧本"，不是"实现"

`playground.config.ts` + `playground-pipeline-dispatcher.service.ts` 应只串调度 ——
stage A → stage B → stage C，每个 stage 委托给对应 role service 执行。

不应在 Mission 里写：

- 单 agent 的 self-heal 重试逻辑（属于 stage 文件 + role service）
- prompt 拼装 / schema 解析（属于 agent class）
- 跨 mission 失败学习（属于 `FailureLearnerService` @ ai-harness/governance/learning）

### 2. Role service = agent class 的 NestJS 包装

每个 role service：

- 注入 `AgentInvoker` 作为底座
- 暴露语义化方法（如 `WriterService.writeChapter()`）
- **不**自己重新实现 runAndRelay / lifecycle / tickCost
- 失败学习 / 自愈 / 重试等横切关注由 stage 文件持有

### 3. AgentInvoker 是兼容门面，不再承担所有职责

`AgentInvoker` 仍然是 role service / mission stage 的统一入口，但内部已经拆成三块：

- `AgentExecutionSupport`
  - `invoke(spec, input, ctx)` → 跑 agent
  - `runWithConcurrency / runDagConcurrency` → 池化并发
- `AgentPlaygroundEventRelay`
  - `emitEvent / emitLifecycle / tickCost` → Playground 事件语义
  - `relayAgentEvents()` → IAgentEvent → agent-playground.\* 的映射
- `AgentInvocationPolicy`
  - `preDisableKnownFailingModels` → 跨 mission failure pattern 预查
  - `resolveLoopOverride` → auditLayers 切 reflexion

这样做的原则是：

- 通用执行支撑与产品事件语义分开
- Playground 专有 event type 仍留在 app 层，不混入 harness
- 对上层 role services / stages 先保持稳定接口，控制重构扩散面

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
