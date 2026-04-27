# ai-harness

> Agent 执行底座 —— 与 ai-engine 平级的第一公民模块。

## 定位

```
ai-app/      ← 业务（Mission 剧本）
   │
   ↓
ai-harness/  ← Agent 怎么跑（loop / runner / spec / event / schema / budget）
   │
   ↓
ai-engine/   ← Agent 能干什么（LLM / tools / RAG / knowledge / mcp / safety）
   │
   ↓
ai-infra/    ← 平台基础设施（auth / credits / storage）
```

**依赖方向强制单向**：ai-engine 永远不能 import ai-harness（已加 eslint 规则，
`backend/.eslintrc.js` 内 `Phase H1` 区块）。

## 当前结构（PR-R0 重整后 —— 7 大聚合）

```
ai-harness/
├── README.md
├── harness.module.ts          ← NestJS module 定义
├── index.ts                   ← top-level barrel
├── facade/                    ← 外部消费者唯一入口（HarnessFacade + types re-export）
│
├── kernel/                    ★ Agent kernel —— "agent 是什么、怎么造"
│   ├── abstractions/          IAgent / IAgentEvent / IAgentSpec / IContextEnvelope ...
│   ├── core/                  AgentFactory / SpecAgentRegistry / HarnessedAgent / HookRegistry
│   ├── dx/                    DefineAgent / AgentSpec / AgentRunner / FixtureStore / Inspector
│   ├── domain/                DomainConceptRegistry / DomainAdapterRegistry
│   ├── skills/                SkillRegistry / Loader / Activator
│   └── learning/              SkillLearner / SkillLearningCoordinator
│
├── execution/                 ★ Agent execution —— "agent 怎么跑一次"
│   ├── loop/                  react / reflexion / plan-act / leader-worker / loop-registry
│   ├── executor/              LlmExecutor / ToolInvoker / ToolCircuitBreaker
│   ├── context/               ContextManager / Compactor / Pruner / TokenEstimator / CacheControlPlanner
│   ├── prompt/                PromptRegistry / PromptTemplate
│   └── tools-selector/        ToolSelectorRegistry / ResultFusion
│
├── process/                   ★ Agent process management
│   ├── manager/               ProcessManagerService（agent_processes 表）+ ProcessTree
│   ├── scheduler/             KernelSchedulerService（PG FOR UPDATE SKIP LOCKED priority queue）
│   ├── supervisor/            ProcessSupervisorService（mission/agent task 生命周期 supervisor）
│   ├── subagent/              SubagentSpawner + isolation strategies
│   └── handoff/               AgentRegistry / HandoffService
│
├── memory/                    ★ Agent memory（多种形态）
│   ├── checkpoint/            AgentEventStore / CheckpointService / Stores
│   ├── vector/                EmbeddingProvider / InMemoryVectorStore / PrismaVectorStore
│   └── auto-index/            MemoryAutoIndexer / MemoryBridge
│
├── protocol/                  ★ Agent protocols —— "agent 跟外界 / 跟其它 agent 通信"
│   ├── events/                DomainEventBus + DomainEventRegistry + Adapters
│   └── mcp/                   MCPRelay + MCP tool adapter
│
├── governance/                ★ Agent governance
│   └── verify/                JudgeService + 内置 verifiers
│
├── runtime/                   ★ Mission runtime —— "整个 mission 怎么活"
│   ├── mission/               MissionOrchestrator / MissionBudgetPool / AgentExecutionContext
│   ├── budget/                BudgetAccountant / ModelPricingRegistry
│   ├── billing/               BillingRuntimeEnvAdapter
│   ├── tracer/                OtelTracer / SpanExporter / OtelSemanticConventions
│   ├── env/                   NoopRuntimeEnvironment / ReactRunner / ToolRegistry / Stores /
│   │                          DynamicReplanner / ProtocolRegistry / TaskQueue / Types
│   └── verification/          Consensus / SelfJudge / ExternalJudge / MetaJudge
│
└── __tests__/                 ← harness-level integration tests
    ├── identity.interface.ts
    ├── agent.interface.ts             IAgent / IAgentTask / IAgentResult
    ├── agent-event.interface.ts       IAgentEvent（thinking/action/observation/...）
    ├── agent-loop.interface.ts        IAgentLoop / AgentLoopKind
    ├── action.interface.ts            IAction / IActionResult / IThinkAction / ...
    ├── context-envelope.interface.ts  IContextEnvelope / IContextMessage / ...
    ├── harness.interface.ts           IAgentSpec / IHarness
    ├── hook.interface.ts              IHook / IHookBinding / HookEvent
    ├── runtime-env.interface.ts       IRuntimeEnvironment / 失败码 HarnessFailureCode
    ├── skill.interface.ts             ISkill
    └── subagent.interface.ts          ISubagentHandle / ISubagentSpec
```

`ai-engine/harness/abstractions/*` 现在只是 re-export 兼容 shim，等 PR-H3+ 把
core/loop/executor 也搬过来后整体删除。

## 后续 PR 路线

| PR        | 内容                                                     | 状态    |
| --------- | -------------------------------------------------------- | ------- |
| **H1+H2** | scaffold + abstractions 搬迁                             | ✅ 完成 |
| **H3**    | 整个 harness/ 子树搬入 ai-harness（18 个子目录）         | ✅ 完成 |
| **H4**    | runtime/resource 通过 DI token 与 ai-harness 解耦        | ✅ 完成 |
| **H5**    | BillingRuntimeEnvAdapter 从 ai-app 抽到 ai-harness/runtime | ✅ 完成 |
| **H6a**   | 删除 ai-engine/harness/ shim 目录（无 external 引用）     | ✅ 完成 |
| **H6b**   | ai-app 全部从 ai-harness/facade 直接导入；ai-engine/facade 剥离 Harness* re-export；eslint 单向依赖在所有 ai-engine/** 文件无例外强制执行 | ✅ 完成 |
| **R0..R3** | ai-engine/runtime/* 子树（journal / ipc / resource / memory / observability / mission / a2a / realtime / api / security / process / abstractions / runtime.module）整体搬入 ai-harness 各聚合，ai-engine/runtime/ 目录删除 | ✅ 完成 |
| **X1**    | 消除 ai-engine.module.ts / ai-engine-core.module.ts / ai-engine-constraint.module.ts / ai-engine/index.ts 全部反向 import；HarnessModule + RuntimeModule + RealtimeModule 由 app.module.ts 直接装配；AiEngineTracingService + EvalPipelineService + CostController + RateLimiter 不再 engine 注册（@Global harness 模块自动可见） | ✅ 完成 |
| **X2**    | ai-app + open-api ~60 文件从 ai-engine/facade 切换到 ai-harness/facade；ai-harness/facade 扩充 ~80 个 harness 符号；ai-engine/facade 删除全部 harness re-export shim | ✅ 完成 |

每个 PR 单独 mergeable + tsc EXIT=0。

## 使用方式（外部消费者）

```typescript
// ✅ 正确
import type {
  IAgent,
  IAgentEvent,
  IAgentSpec,
  IRuntimeEnvironment,
} from "@/modules/ai-harness/facade";

// ❌ 错误（穿透内部路径）
import type { IAgent } from "@/modules/ai-harness/abstractions/agent.interface";
```

ai-engine/facade 当前仍 re-export 这些类型（前缀 `Harness*`）作为兼容；
新代码请直接从 ai-harness/facade 引入，不要再走 ai-engine。
