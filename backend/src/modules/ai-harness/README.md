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

## 当前已搬迁（PR-H1 → H3）

```
ai-harness/
├── README.md
├── harness.module.ts                  ← NestJS module 定义
├── index.ts                           ← top-level barrel
├── facade/                            ← 外部消费者唯一入口（含 HarnessFacade）
├── abstractions/                      ← agent 执行模型核心接口（PR-H2）
├── core/                              ← AgentFactory + Registry + HarnessedAgent + ContextEnvelope
├── loop/                              ← react / reflexion / plan-act / leader-worker loops
├── executor/                          ← LlmExecutor + ToolInvoker + circuit-breaker
├── dx/                                ← AgentRunner + AgentSpec.base + DefineAgent 装饰器
├── events/                            ← DomainEventBus + adapters
├── verify/                            ← JudgeService + 内置 verifiers
├── runtime/                           ← BudgetAccountant + MissionBudgetPool + AgentExecutionContext
├── checkpoint/                        ← AgentEventStore + CheckpointService
├── context/                           ← ContextManager + Compactor + Pruner
├── domain/                            ← Concept registry + DomainAdapter
├── prompt/                            ← Prompt registry + templates
├── skills/                            ← SkillRegistry + Loader + Activator
├── subagent/                          ← Subagent spawner + isolation
├── tools-selector/                    ← Tool selector + result fusion
├── handoff/                           ← AgentRegistry + HandoffService
├── learning/                          ← SkillLearner + sandbox replayer
├── memory-bridge/                     ← MemoryAutoIndexer + InMemoryVectorStore + PrismaVectorStore
├── mcp/                               ← MCP relay + adapter
└── __tests__/                         ← harness-level integration tests
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
| H4        | runtime/resource 与 ai-harness 解耦                      | 待做    |
| H5        | billing 上下文从 ai-infra 抽到 ai-harness                | 待做    |
| H6        | 删 ai-engine 兼容 shim + 严格化 eslint（移除 excludedFiles） | 待做    |

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
