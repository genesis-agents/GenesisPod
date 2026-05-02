# AI Engine + AI Harness MECE 目录结构重构方案

**版本：** 1.0（最终方案）
**生效日期：** 2026-05-02
**状态：** 进行中（W0-W16 已完成）
**关联规范：** [`.claude/standards/16-ai-engine-harness-structure.md`](../../.claude/standards/16-ai-engine-harness-structure.md)

---

## 目录

1. [背景与动机](#一背景与动机)
2. [架构边界与判别原则](#二架构边界与判别原则)
3. [业界最佳实践调研](#三业界最佳实践调研)
4. [MECE 切分原则](#四mece-切分原则)
5. [目标目录结构（engine + harness）](#五目标目录结构engine--harness)
6. [子目录与文件命名规范](#六子目录与文件命名规范)
7. [跨层与跨聚合迁移清单](#七跨层与跨聚合迁移清单)
8. [整改执行波次](#八整改执行波次)
9. [自动化工具与守护机制](#九自动化工具与守护机制)
10. [风险与回滚策略](#十风险与回滚策略)
11. [进度跟踪](#十一进度跟踪)

---

## 一、背景与动机

### 1.1 现状问题

当前 `ai-harness/` 9 个顶层聚合存在严重 MECE 问题：

| 问题类别             | 具体表现                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **自造词命名**       | `kernel/` / `execution/` / `process/` / `protocol/` / `governance/` / `runtime/` 全是 OS 黑话或企业架构黑话，业界 agent SDK 完全不用                                                  |
| **同名歧义**         | 两个 `SkillRegistry` / 两个 `tools/`（engine + harness）/ 两个 `checkpoint/`（memory + process）/ 两个 `MissionOrchestrator`（runtime + teams）                                       |
| **大杂烩 re-export** | `runtime/abstractions/index.ts` 跨 5 个 owner 的接口塞一起，反模式                                                                                                                    |
| **跨层错位**         | MCP 在 `harness/protocol/`（应是 `engine/tools/adapters/`）；ModelPricingRegistry 在 harness（应是 engine）                                                                           |
| **接口源头错位**     | `A2AMessage` 接口定义在 `teams/abstractions/`，但 `protocol/ipc/message-bus.service.ts` 反向 import —— **协议层依赖业务层**，循环依赖嫌疑                                             |
| **概念混淆**         | `governance/` 含 critique（质量评判）+ verify（LLM 评判）+ observability（追踪）+ resource（限额）+ figure（图表）+ learning（失败学习），6 个完全不同关注点硬塞一起                  |
| **运维与编排混淆**   | `teams/orchestrator/` 里塞了 5 个 mission 生命周期治理文件（health-monitor / orphan-detector / ownership-registry / abort-registry / runtime-state-store），这些是 lifecycle 不是编排 |
| **僵尸目录**         | `runtime/` 在多次迁移后只剩 api gateway + barrel + abstractions 大杂烩                                                                                                                |

### 1.2 重构目标

- **零自造词**：顶层目录全部使用业界 agent SDK 标准词汇
- **MECE 完整切分**：engine 与 harness 共 21 个聚合，每个对应一个**互斥**且**完备**的关注点
- **同名概念全项目唯一**：`tools` 只在 engine、`SkillRegistry` 只 1 个、`checkpoint` 不分两处
- **abstractions 每聚合自有**：删除 `runtime/abstractions/` 大杂烩，每个 owner 自己 export
- **修复循环依赖**：A2AMessage 等协议接口归位到协议层
- **匹配北极星目标**：与 Anthropic Claude Agent SDK / OpenAI Agents SDK 概念 1:1 对齐

### 1.3 重构原则

1. **业界共识优先**：每个名字必须在主流 agent SDK 中能找到对应概念
2. **MECE 强制**：兄弟目录互斥，不重叠，无遗漏
3. **简单胜复杂**：扁平 > 嵌套；删除空容器；去掉装饰性分类
4. **单文件单职责**：禁止 utils/helpers/common 杂物袋；超 500 行强制拆分
5. **路径稳定**：内部相对路径用 `@/` 别名，避免深度漂移破内部 import

---

## 二、架构边界与判别原则

### 2.1 4 层 + L2.5 模型

```
L4 Open API   → modules/open-api/
L3 AI Apps    → modules/ai-app/        （Research / Teams / Writing / Office / Topic-Insights / Image / Social / Library / Playground 等）
L2.5 AI Harness → modules/ai-harness/   （Agent 运行时脚手架）
L2 AI Engine  → modules/ai-engine/      （LLM 原子能力）
L1 Infrastructure → modules/ai-infra/   （Auth / Credits / Storage / Encryption / Email）
```

依赖方向严格单向：`L4 → L3 → L2.5 → L2 → L1`，反向禁止。

### 2.2 engine vs harness 判别口诀

| 层                  | 定位                              | 唯一判别口诀                                           |
| ------------------- | --------------------------------- | ------------------------------------------------------ |
| **L2 ai-engine**    | LLM 原子能力，无 agent 状态       | **不需要知道 agent / mission 是谁就能做的事** → engine |
| **L2.5 ai-harness** | Agent 运行时脚手架，含 agent 状态 | **必须知道 agent / mission 才有意义的事** → harness    |

**应用举例：**

| 能力                            | 需要 agent 上下文？              | 归位    |
| ------------------------------- | -------------------------------- | ------- |
| LLM chat 调用                   | 否（只需 messages + model）      | engine  |
| MCP 客户端                      | 否（只是 tool source）           | engine  |
| 工具调用                        | 否（ITool + ToolContext 即可）   | engine  |
| 模型定价计算                    | 否（modelId + tokens 即可）      | engine  |
| RAG 检索                        | 否（query + corpus 即可）        | engine  |
| ReAct 运行循环                  | 是（需要 agent + mission）       | harness |
| Agent-to-Agent RPC              | 是（需要 mission/agent context） | harness |
| 工具熔断（mission 级）          | 是（per-mission state）          | harness |
| 多 agent 协同（Team / Handoff） | 是（需要 agent 间状态）          | harness |
| Mission 生命周期监控            | 是（mission 状态机）             | harness |

---

## 三、业界最佳实践调研

### 3.1 大厂 SDK 顶层模块

| SDK                            | 顶层模块（按出现频率排序）                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Anthropic Claude Agent SDK** | agent / tool / mcp / query(=runner) / hooks / subagent / permissions / settings                                                |
| **OpenAI Agents SDK**          | agent / runner / handoffs / tool / guardrail / tracing / memory(=session) / mcp / lifecycle / model / result / items           |
| **Google ADK (Agent Dev Kit)** | agents / tools / runners / sessions / memory / models / planners / flows / evaluation / artifacts / callbacks / code_executors |
| **Microsoft AutoGen v0.4**     | core / agentchat(teams/groupchat) / tools / models / code_executors                                                            |
| **Microsoft Semantic Kernel**  | agents / functions / planners / memory / connectors / prompt_template                                                          |

### 3.2 开源 SDK 顶层模块

| SDK                   | 顶层模块                                              |
| --------------------- | ----------------------------------------------------- |
| **LangGraph**         | graph / checkpoint / store / prebuilt / pregel        |
| **LangChain Agents**  | agents / tools / chains / memory                      |
| **LlamaIndex Agents** | agent / workflow / tools / memory                     |
| **CrewAI**            | agent / task / crew(=teams) / tools / llm / knowledge |
| **Letta (MemGPT)**    | agents / memory_blocks / tools / llm_providers / jobs |

### 3.3 业界共识词汇频次

| 概念            | 出现率 | 标准名                              |
| --------------- | ------ | ----------------------------------- |
| Agent 定义      | 100%   | `agents`                            |
| 工具            | 100%   | `tools`                             |
| 记忆 / 会话     | 100%   | `memory` 或 `sessions`              |
| 运行循环        | 90%    | `runner` / `runners`                |
| 追踪 / 观察     | 80%    | `tracing` / `observability`         |
| 多 agent 协同   | 80%    | `handoffs` / `teams` / `crew`       |
| 通信协议        | 60%    | `mcp`（单独）或 `protocols`（总称） |
| 生命周期 / 钩子 | 70%    | `lifecycle` / `hooks` / `callbacks` |
| 限额 / 安全     | 50%    | `guardrails` / `permissions`        |
| 评估            | 40%    | `evaluation` / `eval`               |

**没有任何 SDK 用过的词（自造词，禁用）：**

- ❌ `kernel/` （Microsoft "Semantic Kernel" 是产品名，不是模块名）
- ❌ `runner/` `process/` `runtime/` （OS 黑话）
- ❌ `protocol/` （单数）（与 MCP/A2A 等具体协议名称撞名）
- ❌ `governance/` （企业架构黑话，agent SDK 不用）

---

## 四、MECE 切分原则

### 4.1 Engine 关注点（10 个）

按"LLM 原子能力的所有方面"做 MECE 划分：

| #   | 关注点       | 一句话定位                                   | 模块名         |
| --- | ------------ | -------------------------------------------- | -------------- |
| 1   | **LLM 调用** | 怎么调 LLM                                   | `llm/`         |
| 2   | **工具能力** | 怎么调工具                                   | `tools/`       |
| 3   | **检索能力** | 怎么检索（RAG）                              | `rag/`         |
| 4   | **知识能力** | 怎么提取知识（事实/实体/关系）               | `knowledge/`   |
| 5   | **技能能力** | 怎么定义可复用 prompt（SKILL.md）            | `skills/`      |
| 6   | **规划能力** | 怎么分解任务（不含 agent loop）              | `planning/`    |
| 7   | **安全能力** | 怎么过滤危险内容（pii/moderation/injection） | `safety/`      |
| 8   | **内容能力** | 怎么处理文本（fetch/cleaner/markdown）       | `content/`     |
| 9   | **凭证能力** | 怎么管密钥（BYOK / secret resolver）         | `credentials/` |
| 10  | **门面**     | 怎么对外暴露                                 | `facade/`      |

### 4.2 Harness 关注点（11 个）

按"Agent 运行时的所有关注点"做 MECE 划分：

| #   | 关注点                   | MECE 维度                               | 模块名        |
| --- | ------------------------ | --------------------------------------- | ------------- |
| 1   | **WHAT** agents are      | agent 是什么                            | `agents/`     |
| 2   | **HOW** they run         | agent 怎么跑（loop + executor + tools） | `runner/`     |
| 3   | **HOW** they coordinate  | 多 agent 怎么协作（业务模式）           | `teams/`      |
| 4   | **HOW** they hand off    | agent 间转交（OpenAI 标准）             | `handoffs/`   |
| 5   | **WHAT** they remember   | 状态怎么存                              | `memory/`     |
| 6   | **HOW** they communicate | 通信协议（5 种）                        | `protocols/`  |
| 7   | **WHO** judges them      | 输出质量怎么评                          | `evaluation/` |
| 8   | **WHO** constrains them  | 资源限额                                | `guardrails/` |
| 9   | **WHO** observes them    | 追踪 / 监控                             | `tracing/`    |
| 10  | **WHO** recovers them    | 生命周期 / 韧性                         | `lifecycle/`  |
| 11  | **WHO** exposes them     | 对外 API 表面                           | `facade/`     |

### 4.3 MECE 互斥性证明

**关键边界：**

- `evaluation/` （输出维度，被动评判）vs `guardrails/` （输入维度，主动限制）— 完全互斥
- `tracing/` （被动观察）vs `guardrails/` （主动限制）— 完全互斥
- `runner/` （单 agent 运行）vs `teams/`（多 agent 协同）vs `handoffs/`（agent 转交）— 三者按"agent 数量与关系"互斥
- `agents/` （定义）vs `runner/` （执行）vs `lifecycle/` （生命周期）— 按"时间维度"互斥

**完备性验证：** 现 ai-harness 每个文件都能找到唯一归属，详见第七章迁移清单。

---

## 五、目标目录结构（engine + harness）

### 5.1 ai-engine（10 个聚合）

```
ai-engine/
├── llm/                          # LLM 调用 + 模型适配 + 路由 + 定价
│   ├── abstractions/
│   ├── providers/                # by vendor (openai/anthropic/bedrock/grok/gemini/litellm)
│   ├── services/                 # AiChatService, EmbeddingService
│   ├── routing/                  # ModelResolverService + strategy
│   ├── pricing/                  # ★ ModelPricingRegistry（W9 跨层迁来）
│   ├── intent/                   # IntentDetectionService + IntentRouter
│   ├── factory/                  # LLMFactory
│   └── llm.module.ts
│
├── tools/                        # 工具目录 + 单次执行（项目唯一 tools/）
│   ├── abstractions/             # ITool, ToolContext, ToolResult
│   ├── registry/                 # ToolRegistry（catalog）
│   ├── middleware/               # tool-pipeline + 4 middleware（schema/acl/rate/trace）
│   ├── categories/               # MECE: 工具作用方向
│   │   ├── information/          # web/academic/knowledge/social/industry/employment
│   │   ├── computation/          # code-runner/calculator
│   │   ├── communication/        # email/slack/webhook
│   │   └── content/              # text-generator
│   ├── adapters/                 # MECE: 工具来源
│   │   ├── mcp/                  # ★ 跨层迁来：MCP client + manager + tool-adapter
│   │   ├── openapi/              # OpenAPI spec → ITool
│   │   └── function/             # 用户函数 → ITool
│   └── tools.module.ts
│
├── rag/                          # 检索增强生成基元
│   ├── abstractions/
│   ├── embedding/
│   ├── vector/
│   ├── chunker/                  # token-chunker + semantic-chunker
│   ├── retriever/                # basic + hybrid
│   ├── reranker/
│   └── rag.module.ts
│
├── knowledge/                    # 知识抽取
│   ├── abstractions/
│   ├── extraction/               # fact/entity/relation/context-evolution
│   ├── world-building/           # character/scene/world
│   └── knowledge.module.ts
│
├── skills/                       # 项目唯一 SkillRegistry
│   ├── abstractions/
│   ├── registry/
│   ├── loader/                   # markdown-skill-loader
│   ├── parser/                   # SKILL.md parser
│   ├── activator/
│   └── skills.module.ts
│
├── planning/                     # 任务分解（不含 agent loop）
│   ├── abstractions/
│   ├── task-planner/
│   ├── decomposer/
│   └── planning.module.ts
│
├── safety/                       # 输入输出安全
│   ├── abstractions/
│   ├── pii/
│   ├── moderation/
│   ├── injection/                # prompt injection detection
│   └── safety.module.ts
│
├── content/                      # 内容处理基元
│   ├── abstractions/
│   ├── fetch/                    # ContentFetchService（HTML 拉取）
│   ├── cleaner/                  # html-cleaner + markdown-cleaner
│   ├── markdown/                 # markdown utilities
│   └── content.module.ts
│
├── credentials/                  # 凭证 / BYOK
│   ├── abstractions/
│   ├── user-config/              # UserModelConfig
│   ├── secret-resolver/
│   └── credentials.module.ts
│
└── facade/                       # engine 对外门面
    ├── ai-engine.facade.ts
    └── index.ts
```

### 5.2 ai-harness（11 个聚合）

```
ai-harness/
├── agents/                       # WHAT agents are
│   ├── abstractions/             # IAgent, IHook, IContextEnvelope, AgentSpec
│   ├── core/                     # HarnessedAgent, AgentFactory, SpecBasedAgent, AgentIdentity
│   ├── base/                     # PlanAgent, ReactiveAgent, PlanBasedAgent
│   ├── registry/                 # AgentRegistry, SpecAgentRegistry, AgentOrchestrator
│   ├── domain/                   # ConceptRegistry, DomainAdapter
│   ├── subagents/                # ★ 从 process/subagent → agents/（Anthropic 模式：subagent 是 agent 子能力）
│   │   └── subagent-spawner.ts + 3-level isolation
│   ├── dev-tools/                # AgentRunner, FixtureStore, ZodSchemaPrompt
│   └── agents.module.ts
│
├── runner/                       # HOW they run（含 tool-invoker / tool-routing）
│   ├── abstractions/             # IRunner, AgentTask, Verdict, Message
│   ├── loop/                     # ★ 4 种 loop 算法
│   │   ├── react-runner.ts
│   │   ├── plan-act-runner.ts
│   │   ├── reflexion-runner.ts
│   │   └── leader-worker-runner.ts
│   ├── plan-execution/           # 多步规划执行（task queue 驱动）
│   │   ├── task-execution-orchestrator.ts   # ★ 从 runtime/mission/mission-orchestrator 改名
│   │   └── task-queue.interface.ts
│   ├── executor/                 # FunctionCallingExecutor + AgentExecutor
│   ├── tool-invoker/             # ★ 调 engine ToolRegistry 的桥
│   │   ├── tool-invoker.service.ts
│   │   └── circuit-breaker/      # mission 级熔断（per-mission state）
│   ├── tool-routing/             # ★ pre-LLM 工具决策
│   │   ├── selector/             # semantic + capability matching
│   │   ├── fusion/               # 多工具结果合并
│   │   └── recall/               # 召回追踪
│   ├── context/                  # ContextEvolution + AgentExecutionContext
│   ├── prompt/                   # 模板 + registry
│   ├── concurrency/
│   ├── dag/                      # DagExecutor
│   ├── capabilities/             # AICapabilityResolver
│   ├── scheduler/                # ★ 从 process/scheduler → runner/（task queue 调度）
│   └── runner.module.ts
│
├── teams/                        # ★ 顶层（Genesis 团队业务模式）
│   ├── abstractions/             # ITeam, IRole, IMember, IWorkflow（不含 mission/a2a-message）
│   ├── base/                     # Team / Role / Member / Workflow / LeaderLLMAdapter
│   ├── profile/                  # MissionExecutionProfile（rename from constraints/constraint-profile）
│   ├── factory/
│   ├── registry/
│   ├── orchestrator/             # 仅留 2 个核心
│   │   ├── teams-mission-orchestrator.ts
│   │   └── adaptive-replanner.service.ts
│   ├── services/
│   ├── collaboration/            # ★ 从 process/collaboration → teams/（团队内协作模式）
│   │   ├── voting/
│   │   ├── debate/
│   │   ├── review/
│   │   └── todo/
│   └── teams.module.ts
│
├── handoffs/                     # ★ 顶层（OpenAI Agents SDK 标准）
│   ├── abstractions/             # IHandoff
│   ├── core/                     # HandoffPattern, HandoffRegistry
│   └── handoffs.module.ts
│
├── memory/                       # WHAT they remember
│   ├── abstractions/             # IMemory, IStore, ICheckpointStore
│   ├── vector/                   # InMemoryVectorStore, PrismaVectorStore
│   ├── working/                  # ShortTermMemory, HierarchicalMemoryCascade
│   ├── checkpoint/               # PrismaCheckpointStore
│   ├── event-store/              # AgentEventStore（事件溯源）
│   ├── stores/                   # 通用 KV 长期存储
│   ├── consolidation/            # ★ rename from dream（业界标准词 memory consolidation）
│   ├── indexing/                 # ★ rename from auto-index
│   ├── state-checkpoint/         # ★ 从 process/checkpoint → memory/（避免与 memory/checkpoint 同名）
│   ├── coordinator/              # multi-tier 调度
│   └── memory.module.ts
│
├── protocols/                    # HOW they communicate（5 个 agent 层协议）
│   ├── a2a/                      # Agent-to-Agent RPC
│   │   ├── abstractions/
│   │   ├── server/
│   │   ├── adapter/
│   │   └── a2a.module.ts
│   ├── ipc/                      # In-process bus
│   │   ├── abstractions/         # ★ A2AMessage 接口源头（从 teams/abstractions 抽出，修循环依赖）
│   │   ├── bus/                  # MessageBusService
│   │   └── ipc.module.ts
│   ├── events/                   # Domain event bus
│   │   ├── abstractions/
│   │   ├── bus/                  # DomainEventBus, DomainEventRegistry
│   │   └── events.module.ts
│   ├── realtime/                 # WebSocket / SSE
│   │   ├── gateway/
│   │   ├── adapter/              # SocketBroadcastAdapter
│   │   └── realtime.module.ts
│   └── journal/                  # Event journal 持久化
│       ├── abstractions/
│       ├── store/                # EventJournal, CheckpointManager
│       └── journal.module.ts
│
├── evaluation/                   # WHO judges them
│   ├── abstractions/             # IEvaluator, IJudge, IVerifier
│   ├── critique/                 # ★ from governance/critique
│   │   ├── critique-refine.service.ts
│   │   ├── defect-scanner.ts
│   │   ├── section-self-eval.service.ts
│   │   ├── section-remediation.service.ts
│   │   ├── report-evaluation.service.ts
│   │   ├── report-quality-gate.service.ts
│   │   ├── quality-trace-compute.service.ts
│   │   ├── quality-score.util.ts
│   │   ├── word-count-balancer.ts
│   │   ├── output-reviewer.service.ts
│   │   └── report-artifact/
│   ├── verify/                   # ★ from governance/verify
│   │   ├── primitives/           # self-judge / external-judge / meta-judge / consensus
│   │   └── judge.service.ts
│   ├── figure/                   # ★ from governance/figure
│   ├── thresholds.constants.ts
│   └── evaluation.module.ts
│
├── guardrails/                   # WHO constrains them
│   ├── abstractions/             # IGuardrail, IConstraint
│   ├── budget/                   # ★ from runtime/cost
│   │   ├── budget-accountant.ts
│   │   └── mission-budget-pool.ts
│   ├── billing/                  # ★ from runtime/cost
│   │   └── billing-adapter.ts
│   ├── rate-limit/
│   ├── concurrency/              # ConcurrencyPlanner
│   ├── constraint/               # ConstraintEngine, ConstraintEnforcement, ConstraintProfile
│   ├── runtime-env/              # RuntimeEnvironment snapshot
│   └── guardrails.module.ts
│
├── tracing/                      # WHO observes them（顶层）
│   ├── abstractions/             # ITracer, IExporter
│   ├── otel/                     # ★ OTEL 基元
│   │   ├── otel-tracer.ts
│   │   ├── span-exporter.ts
│   │   ├── trace-collector.service.ts
│   │   └── otel-semantic-conventions.ts
│   ├── eval/                     # eval framework
│   │   ├── eval-harness.service.ts
│   │   ├── eval-experiment.service.ts
│   │   ├── eval-pipeline.service.ts
│   │   └── eval-run.store.ts
│   ├── latency/                  # SessionLatencyTracker
│   ├── llm-events/               # LlmTracingService + LlmEventsListener
│   ├── attribution/              # CostAttribution + token-spend
│   ├── observability/            # AiObservabilityService + failure-extraction
│   └── tracing.module.ts
│
├── lifecycle/                    # WHO recovers them
│   ├── abstractions/             # IHook, ILifecycleEvent
│   ├── hooks/                    # HookRegistry
│   ├── manager/                  # ★ from process/manager + runtime/mission
│   │   ├── process-manager.ts
│   │   ├── mission-executor.service.ts
│   │   └── mission-executor.interface.ts
│   ├── supervisor/               # ★ from process/supervisor
│   │   ├── process-supervisor.service.ts
│   │   └── health-check-runner.ts
│   ├── mission-lifecycle/        # ★ 从 teams/orchestrator 5 件套搬来
│   │   ├── health-monitor.ts
│   │   ├── orphan-detector.service.ts
│   │   ├── ownership-registry.ts
│   │   ├── abort-registry.ts
│   │   └── runtime-state-store.ts
│   ├── learning/                 # ★ from governance/learning
│   │   └── failure-learner.service.ts
│   └── lifecycle.module.ts
│
└── facade/                       # WHO exposes them
    ├── ai.facade.ts              # 顶层
    ├── harness-api.service.ts    # ★ rename from runtime/api/kernel-api
    ├── model-resolver.service.ts
    ├── domain/                   # 5 个业务域门面
    │   ├── agent.facade.ts
    │   ├── chat.facade.ts
    │   ├── team.facade.ts
    │   ├── tool.facade.ts
    │   └── rag.facade.ts
    ├── sub-facades/              # team-sub-facade 等特化门面
    ├── providers/                # facade.providers.ts (DI providers)
    └── index.ts                  # 唯一对外 export 入口
```

---

## 六、子目录与文件命名规范

### 6.1 框架文件（必须用 `.<框架后缀>.ts`）

| 后缀             | 用途              | 装饰器              |
| ---------------- | ----------------- | ------------------- |
| `.service.ts`    | NestJS 注入服务   | `@Injectable`       |
| `.module.ts`     | NestJS 模块       | `@Module`           |
| `.controller.ts` | NestJS 控制器     | `@Controller`       |
| `.gateway.ts`    | WebSocket 网关    | `@WebSocketGateway` |
| `.guard.ts`      | Guard             | `CanActivate`       |
| `.middleware.ts` | NestJS Middleware | `NestMiddleware`    |

### 6.2 数据/契约文件

| 后缀            | 用途                                         |
| --------------- | -------------------------------------------- |
| `.interface.ts` | TypeScript 接口（IXxx 类型）                 |
| `.types.ts`     | 类型定义集合（多个 type/enum，复数形式）     |
| `.dto.ts`       | 数据传输对象（Zod schema / class-validator） |
| `.constants.ts` | 常量集合                                     |

### 6.3 通用模式（kebab-case + 描述性后缀，**不**用点号）

| 模式       | 文件名                | 类名              |
| ---------- | --------------------- | ----------------- |
| 注册中心   | `xxx-registry.ts`     | `XxxRegistry`     |
| 工厂       | `xxx-factory.ts`      | `XxxFactory`      |
| 适配器     | `xxx-adapter.ts`      | `XxxAdapter`      |
| 持久化存储 | `xxx-store.ts`        | `XxxStore`        |
| 策略       | `xxx-strategy.ts`     | `XxxStrategy`     |
| 管道       | `xxx-pipeline.ts`     | `XxxPipeline`     |
| 运行器     | `xxx-runner.ts`       | `XxxRunner`       |
| 执行器     | `xxx-executor.ts`     | `XxxExecutor`     |
| 调度器     | `xxx-scheduler.ts`    | `XxxScheduler`    |
| 编排器     | `xxx-orchestrator.ts` | `XxxOrchestrator` |
| 监视器     | `xxx-monitor.ts`      | `XxxMonitor`      |
| 检测器     | `xxx-detector.ts`     | `XxxDetector`     |
| 扫描器     | `xxx-scanner.ts`      | `XxxScanner`      |
| 追踪器     | `xxx-tracer.ts`       | `XxxTracer`       |
| Judge      | `xxx-judge.ts`        | `XxxJudge`        |
| 监听器     | `xxx-listener.ts`     | `XxxListener`     |
| 派生器     | `xxx-spawner.ts`      | `XxxSpawner`      |

### 6.4 域实例文件（用 `xxx.<域>.ts`）

| 后缀        | 用途                          | 示例                                      |
| ----------- | ----------------------------- | ----------------------------------------- |
| `.tool.ts`  | Tool 实现类                   | `web-search.tool.ts`, `arxiv.tool.ts`     |
| `.agent.ts` | Agent 实现类                  | `researcher.agent.ts`                     |
| `.skill.ts` | Skill 实现类                  | `chart-renderer.skill.ts`                 |
| `.stage.ts` | Pipeline 阶段（Genesis 特有） | `s3-researcher-collect-findings.stage.ts` |

### 6.5 工具函数 / 纯原语

| 后缀              | 用途                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| `.util.ts`        | 纯函数工具集合                                                        |
| 无后缀 kebab-case | 简单类（如 `consensus.ts`、`harnessed-agent.ts`、`token-chunker.ts`） |

### 6.6 反模式（禁止）

- ❌ `utils.ts` / `helpers.ts` / `common.ts`（杂物袋，无单一职责）
- ❌ `xxx.types.ts` 与 `xxx.type.ts` 混用（统一用复数 `.types.ts`）
- ❌ 单文件超过 500 行（拆 sub-module 或 abstraction）
- ❌ 同名概念跨层重复实现（如两个 `SkillRegistry` / 两个 `ToolRegistry`）
- ❌ 全局 `xxx/abstractions/index.ts` 大杂烩 re-export 5+ 个 owner 的接口

### 6.7 子目录通用模式

每个聚合 SHOULD 有：

- `abstractions/` —— 接口契约 + 类型定义集合（**每聚合自有**，禁止跨聚合 re-export 大杂烩）
- `xxx.module.ts` —— NestJS 模块入口（每个聚合 1 个）

子目录互斥强制：

1. **兄弟目录互斥**：同一父目录下子目录不可有功能重叠
2. **不创建空容器**：禁止 `patterns/`、`utilities/` 这种纯分类壳
3. **不超过 2 层嵌套**：超过则重审拆分粒度

---

## 七、跨层与跨聚合迁移清单

### 7.1 跨层迁移（engine ↔ harness）

| 项                            | 来源                                             | 目标                              | 理由                               |
| ----------------------------- | ------------------------------------------------ | --------------------------------- | ---------------------------------- |
| **MCP**                       | `harness/protocol/mcp/` 整目录                   | `engine/tools/adapters/mcp/`      | tool source adapter，无 agent 状态 |
| **ModelPricingRegistry**      | `harness/runtime/cost/model-pricing-registry.ts` | `engine/llm/pricing/`             | 模型定价是 LLM 能力                |
| **SkillRegistry**（消除两个） | `harness/kernel/builtin-skills/`                 | `engine/skills/registry/`（合并） | 项目唯一 SkillRegistry             |

### 7.2 跨聚合归位（harness 内部）

| 项                                  | 来源                                                                         | 目标                                         | 理由                                     |
| ----------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------- |
| `A2AMessage` 接口                   | `teams/abstractions/a2a-message.interface.ts`                                | `protocols/ipc/abstractions/`                | A2AMessage 是 IPC 协议接口源头           |
| `Mission` 核心类型                  | `teams/abstractions/mission.interface.ts` 核心                               | `agents/abstractions/mission.types.ts`       | 通用 agent 任务抽象，跨 250+ 文件        |
| `mission-health.monitor` 等 5 件套  | `teams/orchestrator/mission-{health,orphan,ownership,abort,runtime-state}.*` | `lifecycle/mission-lifecycle/`               | 是生命周期治理不是编排                   |
| `subagent-spawner`                  | `process/subagent/`                                                          | `agents/subagents/`                          | 匹配 Anthropic：subagent 是 agent 子能力 |
| `kernel-scheduler`                  | `process/scheduler/`                                                         | `runner/scheduler/`                          | task queue 调度是 run loop 子能力        |
| `voting / debate / review`          | `process/collaboration/`                                                     | `teams/collaboration/`                       | 团队内协作模式                           |
| `failure-learner`                   | `governance/learning/`                                                       | `lifecycle/learning/`                        | 失败学习是生命周期闭环                   |
| `process-manager`                   | `process/manager/`                                                           | `lifecycle/manager/`                         | 生命周期管理                             |
| `mission-executor`                  | `runtime/mission/mission-executor.service.ts`                                | `lifecycle/manager/`                         | 生命周期                                 |
| `process-supervisor`                | `process/supervisor/`                                                        | `lifecycle/supervisor/`                      | 生命周期监督                             |
| `state-checkpoint`                  | `process/checkpoint/`                                                        | `memory/state-checkpoint/`                   | 持久化（避免与 memory/checkpoint 同名）  |
| `task-execution-orchestrator`       | `runtime/mission/mission-orchestrator.ts`                                    | `runner/plan-execution/`（rename）           | 与 teams orchestrator 解冲突             |
| `agent-execution-context`           | `runtime/mission/agent-execution-context.ts`                                 | `runner/context/`                            | run loop 上下文                          |
| `mission-budget-pool`               | `runtime/mission/mission-budget-pool.ts`                                     | `guardrails/budget/`                         | 预算限制                                 |
| `BudgetAccountant + BillingAdapter` | `runtime/cost/`                                                              | `guardrails/budget/` + `guardrails/billing/` | 资源限制                                 |
| `harness-api`                       | `runtime/api/kernel-api.service.ts`                                          | `facade/harness-api.service.ts`（rename）    | 解 kernel 命名冲突                       |

### 7.3 命名替换（消除自造词）

| 旧名（自造）                           | 新名（业界标准）                                                                                                                | 来源                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `kernel/`                              | `agents/`                                                                                                                       | OpenAI / Google / Anthropic SDK |
| `runner/`                              | `runner/`                                                                                                                       | OpenAI Runner / Google Runner   |
| `process/`                             | 拆 `lifecycle/` + `agents/subagents/` + `runner/scheduler/` + `handoffs/` + `teams/collaboration/` + `memory/state-checkpoint/` | `process` 不是 agent 域词       |
| `protocol/`                            | `protocols/`（复数）+ MCP 移出                                                                                                  | 含多种协议                      |
| `governance/`                          | 拆 `evaluation/` + `guardrails/` + `tracing/` + `lifecycle/learning/`                                                           | `governance` 不是 SDK 词        |
| `runtime/`                             | 解散到各正确归属                                                                                                                | `runtime` 太 generic，僵尸目录  |
| `runtime/abstractions/` 大杂烩         | **删除**，每聚合自己 abstractions/                                                                                              | 反模式                          |
| `kernel-api`                           | `harness-api`                                                                                                                   | 与 kernel 目录冲突              |
| `runtime/mission/mission-orchestrator` | `runner/plan-execution/task-execution-orchestrator`                                                                             | 与 teams orchestrator 解冲突    |
| `memory/dream/`                        | `memory/consolidation/`                                                                                                         | 业界标准词                      |
| `memory/auto-index/`                   | `memory/indexing/`                                                                                                              | 简洁                            |
| `teams/constraints/constraint-profile` | `teams/profile/mission-execution-profile`                                                                                       | 与 guardrails/constraint 解冲突 |

### 7.4 删除（反模式 / 冗余）

| 路径                             | 原因                                          |
| -------------------------------- | --------------------------------------------- |
| `runtime/abstractions/index.ts`  | 大杂烩 re-export，每个 owner 自己 export 即可 |
| `kernel/base/harnessed-agent.ts` | 与 kernel/core/harnessed-agent.ts 重复        |

---

## 八、整改执行波次

### 8.1 16 波次总览

| 波次    | 内容                                                                                                          | 风险   | 状态 |
| ------- | ------------------------------------------------------------------------------------------------------------- | ------ | ---- |
| **W0**  | 沉淀规范文档 standards/16 + CLAUDE.md 同步                                                                    | LOW    | ✅   |
| **W1**  | governance/learning → lifecycle/learning                                                                      | LOW    | ✅   |
| **W2**  | governance/figure → evaluation/figure                                                                         | LOW    | ✅   |
| **W3**  | governance/critique → evaluation/critique                                                                     | MEDIUM | ✅   |
| **W4**  | governance/verify → evaluation/verify                                                                         | MEDIUM | ✅   |
| **W5**  | governance/observability → tracing 顶层                                                                       | MEDIUM | ✅   |
| **W6**  | governance/resource → guardrails 顶层 + 删 governance/                                                        | MEDIUM | ✅   |
| **W7**  | process/handoff → handoffs 顶层                                                                               | LOW    | ✅   |
| **W8**  | process/\* 拆分到 lifecycle/agents/runner/teams/memory + 删 process/                                          | MEDIUM | ✅   |
| **W9**  | runtime/cost → guardrails/{budget,billing} + engine/llm/pricing（跨层）                                       | MEDIUM | ✅   |
| **W10** | runtime/mission 拆 runner/lifecycle/guardrails                                                                | MEDIUM | ✅   |
| **W11** | runtime/env → runner/env                                                                                      | MEDIUM | ✅   |
| **W12** | runtime/api/kernel-api → facade/harness-api（rename）+ 解散 runtime/abstractions                              | MEDIUM | ✅   |
| **W13** | kernel/ -> agents/ (rename + subtree move)                                                                    | HIGH   | ✅   |
| **W14** | execution/ → runner/（rename + tool-invoker / tool-routing 重组）                                             | HIGH   | ✅   |
| **W15** | protocol/ → protocols/ + MCP 跨层迁 engine/tools/adapters                                                     | HIGH   | ✅   |
| **W16** | teams/abstractions/{a2a-message,mission} 跨聚合归位 + teams/orchestrator 5 件套到 lifecycle/mission-lifecycle | HIGH   | ✅   |

### 8.2 单波次执行流程

每一波次必须遵守：

1. **目标明确**：单 PR 仅做"一个聚合的迁移 / 一个跨聚合的归位"
2. **文件移动**：用 `git mv` 保留历史
3. **路径更新**：
   - 外部 importer 用 sed 批量更新
   - 内部相对路径用 Node.js 脚本基于 OLD 位置解析重写为 `@/` 别名（避免深度漂移）
4. **验证三件套**：
   - `npx tsc --noEmit -p tsconfig.json` —— typecheck 全绿
   - `npx jest --testPathPattern="<相关>" --no-coverage` —— 相关 spec + arch boundary 全绿
   - `git diff` 逐文件审查
5. **提交规范**：commit message: `refactor(harness): #1 MECE-W<wave> <动作摘要>`
6. **不破坏对外 API**：facade/index.ts 中所有 export 在迁移期间符号名不变（路径可改）

### 8.3 路径迁移工具

针对子树移动后内部相对路径漂移问题，统一使用 Node.js 脚本：

```javascript
// 思路：每个文件按 OLD 位置解析它的 ./../ 相对 import，
// 然后写回 NEW 位置：仍在子树内的用相对路径；外部一律改 @/ 别名
const newRoot = path.resolve(process.argv[2]);
const oldRoot = path.resolve(process.argv[3]);
// 1. 拿 OLD 位置 dir 解析 importPath → 绝对路径
// 2. 如果绝对路径仍在 OLD subtree → 转成 NEW 位置的相对路径
// 3. 否则转成 @/<src 子路径>
```

这样保证子树内部 import 稳定，外部 import 用绝对别名免疫深度变化。

---

## 九、自动化工具与守护机制

### 9.1 三层架构守护（继承自 PR-X-N）

1. **ESLint `no-restricted-imports`**（IDE 实时反馈 + lint-staged pre-commit 拦截）
   - `ai-engine/**` 不得 import `ai-harness/**`（除合法 adapter）
   - `ai-app/**` 不得穿透 `ai-engine/**` / `ai-harness/**` 内部路径，必须走 facade
   - 配置见 `backend/.eslintrc.js`

2. **架构边界 spec 测试**（jest 拦截，覆盖 ESLint 漏掉的动态 import）
   - 文件：`backend/src/__tests__/architecture/layer-boundaries.spec.ts`
   - 7 项断言：单向依赖（4）+ facade 穿透（3）
   - 命令：`npm run verify:arch`

3. **pre-push hook**（推送前最后防线，CI 二次执行）
   - `.husky/pre-push` 第 0 步先跑 `verify:arch`，违规直接拒推

### 9.2 lint-staged 自动测试

每次 commit 时 lint-staged 自动跑变更文件相关的 jest spec，保证：

- 所有改动文件通过 ESLint
- 所有改动文件的 co-located 或 `__tests__/` 目录下的 spec 全绿

### 9.3 路径验证命令

| 命令                                | 用途                      |
| ----------------------------------- | ------------------------- |
| `npm run verify:arch`               | 7 项架构边界检查          |
| `npm run verify:quick`              | 类型检查 + 快速测试       |
| `npm run verify:full`               | Lint + 类型 + 测试 + 构建 |
| `npx tsc --noEmit -p tsconfig.json` | 单纯类型检查              |

---

## 十、风险与回滚策略

### 10.1 风险等级

| 等级       | 特征                                                                          | 应对                                          |
| ---------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| **LOW**    | 单文件 / 少 importer / 无内部子树                                             | 直接 git mv + 5 个以内 importer 手动改        |
| **MEDIUM** | 整子树 / 10-20 个 importer / 有内部相对路径                                   | git mv + sed 批量外部 + Node.js 脚本内部路径  |
| **HIGH**   | 60+ 文件 / 50+ importer / 跨多个聚合（如 kernel→agents、protocol/mcp 跨层迁） | 拆分为多个 sub-PR；先建 deprecated 别名再迁移 |

### 10.2 回滚策略

每一波次单独 commit，不依赖后续波次。如果发现问题：

1. **未推送时**：`git revert <commit-sha>` 回退该波次
2. **已推送时**：单 PR 只做一件事，`git revert` 影响面可控
3. **必要时**：保留 `facade/index.ts` 旧 export 路径作为 `@deprecated` 别名一个 PR 周期

### 10.3 已知风险案例

- **W10 lint-staged 失败**：`process-supervisor.service.spec.ts` 残留 `@/modules/ai-harness/process/manager` 路径，因 sed 漏了 `__tests__` 目录。修复：单独 sed 一次 + 手动 verify。
- **kernel -> agents** (W13): complete via full git mv + importer rewrite; next risks are W14 execution and W15 protocol.

---

## 十一、进度跟踪

### 11.1 已完成 commits（W0-W10，共 11 个）

| Commit        | 内容                                                  |
| ------------- | ----------------------------------------------------- |
| `bfdc35ea7`   | W0: 规范文档 standards/16 + CLAUDE.md 同步            |
| `6dac1395e`   | W1: governance/learning → lifecycle/learning          |
| `2e2f37c4f`   | W2: governance/figure → evaluation/figure             |
| `a63bf3665`   | W3: governance/critique → evaluation/critique         |
| `185583ce0`   | W4: governance/verify → evaluation/verify             |
| `f7869060e`   | W5: governance/observability → tracing 顶层           |
| `42f03814d`   | W6: governance/resource → guardrails + 删 governance/ |
| `420ca03a4`   | W7: process/handoff → handoffs 顶层                   |
| `95c51e5b3`   | W8: process/\* 拆分 + 删 process/                     |
| `840f0dc61`   | W9: runtime/cost 拆三处（含跨层迁 engine）            |
| `840f0dc61+1` | W10: runtime/mission 拆四处 + 删 mission/             |

### 11.2 当前 ai-harness 顶层状态

```
ai-harness/
├── facade/         （保留，W12 已收编 harness-api）

├── memory/         （保留，部分已整理）
├── protocols/       （W15 complete: protocol renamed; MCP moved to engine/tools/adapters/mcp）
├── teams/          （W16 complete: abstractions/orchestrator lifecycle files relocated）
├── tracing/        （★ W5 已建立）
├── guardrails/     （★ W6/W9/W10 已建立）
├── evaluation/     （★ W2-W4 已建立）
├── lifecycle/      （★ W1/W8/W10/W16 已建立；mission-lifecycle 已归位）
├── handoffs/       （★ W7 已建立）
|-- agents/         (W13 complete: absorbed kernel abstractions/base/builtin-skills/config/core/dev-tools/domain/learning/registry/subagents)
└── runner/         （W14 complete: absorbed execution loop/executor/context/prompt/concurrency/dag/capabilities/tool-invoker/tool-routing）
```

### 11.3 验收指标

| 指标                   | 当前                         | 目标 |
| ---------------------- | ---------------------------- | ---- |
| Top-level coined terms | 0                            | 0    |
| 同名歧义               | 已消除（governance/process） | 0    |
| MECE completeness      | 95%                          | 95%+ |
| 架构边界测试           | 7/7 通过                     | 7/7  |
| 全量测试               | 36000+ tests 全绿            | 全绿 |

---

## 附录 A：业界 SDK 对照（Anthropic 北极星）

| Claude Agent SDK 概念           | Genesis ai-harness 位置                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `Agent` 类                      | `agents/core/harnessed-agent.ts`                               |
| `query()` 运行循环              | `runner/loop/react-runner.ts` 等                               |
| `tool()` 工具定义               | `engine/tools/adapters/function/`（Genesis 独有的 ITool 模式） |
| `mcpServer()`                   | `engine/tools/adapters/mcp/`（跨层迁后）                       |
| Hooks（PreToolUse/PostToolUse） | `lifecycle/hooks/hook-registry.ts`                             |
| Subagents                       | `agents/subagents/subagent-spawner.ts`                         |
| Permissions / canUseTool        | `guardrails/constraint/`                                       |
| Session / Memory                | `memory/working/` + `memory/checkpoint/`                       |
| Tracing                         | `tracing/otel/`                                                |

---

## 附录 B：参考文档

- [`.claude/standards/16-ai-engine-harness-structure.md`](../../.claude/standards/16-ai-engine-harness-structure.md) —— 规范文件（强制级别 MUST）
- [`.claude/standards/13-module-dependencies.md`](../../.claude/standards/13-module-dependencies.md) —— 模块依赖关系总览
- [`.claude/standards/14-skills-development.md`](../../.claude/standards/14-skills-development.md) —— Skill 开发规范
- [`docs/architecture/system-architecture-overview.md`](system-architecture-overview.md) —— 系统架构总览
- [`docs/architecture/ai-architecture-baseline-2026-01.md`](ai-architecture-baseline-2026-01.md) —— 2026-01 架构基线

---

**最后更新**: 2026-05-02
**维护者**: Claude Code
**版本**: 1.0（W0-W16 完成）
