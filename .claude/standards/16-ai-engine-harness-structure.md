# AI Engine + AI Harness 目录结构规范

**版本：** 1.0
**强制级别：** MUST
**生效日期：** 2026-05-02
**维护者：** Claude Code

> 本规范定义 `ai-engine` / `ai-harness` 的 MECE 结构边界。  
> 扩展契约、定制代码归位、memory/plugin 治理，必须同时遵守
> [17-extension-governance.md](17-extension-governance.md)。

---

## 一、定位与边界（架构唯一判别标准）

| 层                  | 定位                                | 判别口诀                                               |
| ------------------- | ----------------------------------- | ------------------------------------------------------ |
| **L2 ai-engine**    | LLM 原子能力（无 agent 状态）       | **不需要知道 agent / mission 是谁就能做的事** → engine |
| **L2.5 ai-harness** | Agent 运行时脚手架（含 agent 状态） | **必须知道 agent / mission 才有意义的事** → harness    |

依赖方向严格单向：`L4 ai-app → L2.5 ai-harness → L2 ai-engine → L1 ai-infra`，反向禁止。

---

## 一·补、Agent OS 心智模型（为什么边界在这里）

> 一句话记住这套分层：**harness 是 Agent OS（操作系统），engine 是它驱动的机器（计算引擎——CPU / 存储 / IO 一应俱全）。**
> OS 不"变成"CPU——它**调度**CPU；同理 harness 不实现 LLM 能力，它**编排**engine 的能力。
>
> **关于 "engine" 这个名字**：`engine` 在此是**复数语义**——engine 层是**一族专用引擎**（compute / storage / network / safety），不是单个马达。`storage engine`（如 InnoDB）、`compute engine`（GCE）、`inference engine` 都是业界标准词，正因如此 `engine` 比 `hardware` / `machine` / `compute` 更适合做这一层的名字，保留不改。

### 映射：engine = 一族引擎，每个聚合各自是一台 Engine

关键认识：engine 不是单一"马达"，而是**一族各司其职的引擎**——`ai-engine` 这个名字 = "引擎家族"。**现有 12 个扁平聚合，每一个本身就是一台 Engine**（`tool engine` / `skill engine` / `retrieval engine` / `inference engine` 全是业界标准词）。harness（OS）调度并驱动它们：

| engine 聚合    | 作为引擎             | OS-硬件类比               | 职责                                           |
| -------------- | -------------------- | ------------------------- | ---------------------------------------------- |
| **llm**        | 推理引擎 Inference   | CPU / 计算核心            | prompt/completion；selection 选核、pricing 预算 |
| **rag**        | 检索引擎 Retrieval   | 磁盘 / 索引               | embedding / vector / retriever / reranker      |
| **knowledge**  | 知识引擎 Knowledge   | 文件系统语义              | fact / entity / relation 抽取                  |
| **tools**      | 工具引擎 Tool        | IO 设备 + 驱动            | function/mcp/openapi 执行（项目唯一 tools）     |
| **skills**     | 技能引擎 Skill       | 指令集 / ISA              | SkillRegistry（项目唯一）                       |
| **routing**    | 路由引擎 Routing     | 指令译码 / 调度提示       | 无状态语义打分选 model/skill/tool              |
| **planning**   | 规划引擎 Planning    | 微码 / 指令展开           | 任务分解（不含 agent loop）                    |
| **content**    | 内容引擎 Content     | IO 控制器                 | fetch / cleaner / markdown                      |
| **safety**     | 安全引擎 Safety      | MMU / 保护环              | pii / moderation / injection / tripwire        |
| **reliability**| 韧性引擎 Reliability | 温控 / 健康监测           | rate-limit / entity-health                      |
| **evaluation** | 评估引擎 Evaluation  | ECC / 奇偶校验            | 无状态启发式质检（无 LLM、无 agent 状态）       |
| **facade**     | （ABI / 引脚）       | 对外门面                  | 仅 re-export，**本身不是引擎**                  |

> **可选的子系统透镜**（仅叙事，非目录层）：这些引擎可松散归为 计算{llm,routing,planning,evaluation}、存储{rag,knowledge}、IO{tools,content}、能力{skills}、安全{safety,reliability} 四五个子系统——就像硬件分计算复合体/存储子系统/网络子系统/安全协处理器。但**每台引擎独立成立**，不强制按子系统建目录。
>
> 对照 **harness/memory = RAM**（OS 管理的工作态）：**检索/存储引擎（engine/rag）= 持久磁盘**。一静一动，正是"无状态基元 vs 有状态运行时"的硬件版。
>
> **结论：无需重构**。"engine = 一族引擎"恰好印证当前 12 个扁平聚合就是对的——每个聚合即一台引擎，名字与结构都不用动；4 桶子系统仅作助记，不落地为 `engine/{compute,storage,...}/` 目录层。

### 映射：harness = 操作系统

| harness 聚合   | OS 子系统                   | 含义                                                                  |
| -------------- | --------------------------- | --------------------------------------------------------------------- |
| **runner**     | 调度器 / 取指-译码-执行环   | observe→reason→act 就是 OS 主循环                                     |
| **agents**     | 进程表（PCB）               | 每个 agent/mission = 一个进程                                         |
| **memory**     | 内存管理                    | working=RAM、checkpoint=swap/快照、event-store=WAL、consolidation=GC |
| **guardrails** | 资源限额（cgroups/ulimit）  | budget/quota/rate-limit/concurrency = 进程资源配额                   |
| **protocols**  | IPC + 系统调用              | a2a/ipc/events/realtime/journal = 管道 / 信号 / socket               |
| **handoffs**   | 上下文切换                  | agent→agent = 进程上下文切换                                         |
| **teams**      | 多进程编排 / 进程组         | collaboration（voting/debate/review）= 进程组共识                    |
| **lifecycle**  | init / supervisor           | hooks/manager/supervisor/mission-lifecycle = systemd + 故障恢复     |
| **tracing**    | 可观测（dtrace/perf）       | otel/latency/llm-events = 系统级追踪                                 |
| **evaluation** | 带进程上下文的运行时 QA     | critique/verify 知道"哪个 mission 在跑"                              |
| **facade**     | 系统调用接口 / ABI          | 上层 app 链接的公共入口                                              |

### 上下游

- **L1 platform / ai-infra** = 固件 / BIOS / 物理基座（db、secrets、encryption、key-health = TPM / 存储控制器）——机器之下。
- **L3 ai-app** = 用户态应用程序；**L4 open-api** = shell / 对外公共 ABI。

### 为什么这个比喻能"证明"我们的铁律

| 现有铁律                                | OS 版表述（更直觉）                                              |
| --------------------------------------- | --------------------------------------------------------------- |
| engine 无 agent/mission 状态            | **硬件不知道是哪个进程在用它**——CPU 不记得调用方是谁           |
| 依赖方向 harness → engine，反向禁止     | **OS 驱动硬件，硬件从不回调 OS**                                |
| 无状态基元 vs 有状态运行时              | **持久硬件（engine/rag=磁盘）vs OS 管理的工作态（harness/memory=RAM）** |
| 同名概念全项目唯一（tools 只在 engine） | **一台机器只有一套硬件**；OS 不自带第二块 CPU                   |

### 边界声明：这是叙事，不是改名令

OS 心智模型用来**解释和记忆**边界，**不**改变它，也**不**触发重命名。顶层目录仍用 agent 框架的**业界标准词**（runner/agents/memory/...），**禁止**按 OS 词汇自造 `kernel/process/syscall/governance/runtime`（见 §五 互斥性原则；历史：`ai-kernel/`、`ai-engine/runtime/` 曾用此类命名，已删除并整合进 harness）。判别仍以**第一节"有没有 agent/mission 状态"**为唯一标准；OS 类比只是它的助记层。

---

## 二、ai-engine 顶层（10 个聚合，业界标准词）

```
agents 域之外的"原子能力"，全部放 engine：
llm · tools · rag · knowledge · skills · planning · safety · content · routing · facade
```

| 聚合          | 职责                                                                    | 关键边界                                                                            |
| ------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **llm**       | LLM 调用 + 模型适配 + 路由 + 定价 + user-config + key-health + 意图识别 | 无 agent 状态；含 model pricing                                                     |
| **tools**     | 工具目录 + 单次执行 + 来源适配（含 MCP）                                | **项目唯一的 tools/**；含 mcp/openapi/function adapter                              |
| **rag**       | 检索增强生成基元                                                        | embedding / vector / chunker / retriever / reranker                                 |
| **knowledge** | 知识抽取                                                                | fact / entity / relation / context-evolution / world-building                       |
| **skills**    | Skill 定义 + 注册（SKILL.md 风格）                                      | **项目唯一的 SkillRegistry**                                                        |
| **planning**  | 任务分解（不含 agent loop）                                             | task-planner / decomposer                                                           |
| **safety**    | 输入输出安全                                                            | pii / moderation / injection                                                        |
| **content**   | 内容处理基元                                                            | fetch / cleaner / markdown                                                          |
| **routing**   | 通用语义打分路由 core（LLM/Tools/Skills 共用）                          | scored-router / semantic-retrieval / signal-scorers；无 agent 状态；2026-06-02 新增 |
| **facade**    | engine 对外门面                                                         | 仅 re-export，无业务逻辑                                                            |

---

## 三、ai-harness 顶层（11 个聚合，业界标准词）

```
agents · runner · teams · handoffs · memory · protocols · evaluation · guardrails · tracing · lifecycle · facade
```

| 聚合           | MECE 关注点                                      | 关键边界                                                                                         |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **agents**     | WHAT agents are                                  | core / base / registry / domain / **subagents** / dev-tools                                      |
| **runner**     | HOW they run                                     | loop / executor / tool-invoker / tool-routing / context / **scheduler**                          |
| **teams**      | GenesisPod 团队业务模式                          | abstractions / base / profile / factory / registry / orchestrator / services / **collaboration** |
| **handoffs**   | Agent 切换（OpenAI 标准词）                      | pattern + registry                                                                               |
| **memory**     | WHAT they remember                               | vector / working / checkpoint / event-store / stores / consolidation / indexing                  |
| **protocols**  | HOW they communicate（**仅 5 个 agent 层协议**） | a2a / ipc / events / realtime / journal（**MCP 不在此**）                                        |
| **evaluation** | WHO judges them                                  | critique / verify / figure                                                                       |
| **guardrails** | WHO constrains them                              | budget / billing / rate-limit / concurrency / constraint / runtime-env                           |
| **tracing**    | WHO observes them                                | otel / eval / latency / llm-events / attribution / observability                                 |
| **lifecycle**  | WHO recovers them                                | hooks / manager / supervisor / mission-lifecycle / learning                                      |
| **facade**     | WHO exposes them                                 | ai.facade / domain / sub-facades / api / providers                                               |

---

## 三·补、OS 视角目录再审计（2026-06-03，roadmap）

> 用 §一·补 的 Agent-OS 逻辑重审 engine + harness 目录。四个动作：**下沉**（→L1 platform/固件）、**上提**（→L3 ai-app/用户态）、**收口**（同名概念合一）、**补缺**（gap）。⚠️ 标"看似散落实为有意分层、勿动"。**结论：行为敏感的合并先核实边界再动，不盲目执行。**

### 收口（同名概念多处——优先级最高）

| 概念              | 散落位置                                                                        | 置信 | 性质                                                                                     |
| ----------------- | ------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------- |
| **checkpoint**    | `harness/memory/checkpoint` + `harness/memory/mission-checkpoint`（各有 checkpoint.service + in-memory-store） | 高   | 同聚合两套；违"checkpoint 不分两处"。**先核实 agent 级 vs mission 级作用域**再合并/重命名 |
| **prompt registry** | `engine/llm/prompts`（PromptRegistryService）+ `harness/runner/prompt`（PromptRegistry）；均做版本+A/B | 高   | 两套 PromptRegistry、数据模型不同 → **设计级合并**（非移动）；engine 侧=无状态定义、harness 侧=按 userId 运行时路由，先定谁留 |
| **image/媒体引擎**| `engine/llm/image` + `engine/content/image` + `engine/tools/.../image-search`   | 高   | GPU 引擎散三处                                                                            |
| **code 执行**     | `engine/skills/sandbox` + `engine/tools/.../execution`                          | 中   | 沙箱/解释器散两处                                                                        |
| **learning**      | `harness/agents/learning`（技能习得）+ `harness/lifecycle/learning`（失败复盘） | 中   | 两类不同 learning，归属待统一                                                            |
| **memory tools**  | `harness/memory/tools/*.tool.ts`                                                | 中   | tools 出现在 engine 外；但属**有状态**记忆工具，不能沉 engine → 裁决"定义入 registry、实现留 harness" |

### 下沉 L1 platform

- billing 主体已在 `platform/credits`；`harness/guardrails/billing` 仅 1 个 adapter（端口），低优先。

### 上提 L3 ai-app

- **暂无**。最像的 `harness/agents/domain`、`harness/teams/business-team` 经核实均为**通用框架**（domain-adapter / `.framework.ts`），**留 harness**。

### 补缺（gap，产品 roadmap，非重构）

- **Audio/Speech 引擎**（声卡 ASR/TTS）：全树无。
- **权限/能力授权**（OS access-control：agent × tool 授权）：待确认 `guardrails/constraints` 是否覆盖。

### ⚠️ 勿动（有意分层，非散落）

- `engine/evaluation`（无状态启发式）/ `harness/evaluation`（agent 感知评判）/ `harness/tracing/evaluation`（评估追踪）：三者职责不同。
- `engine/skills`（定义）vs `harness/agents/skill-runtime`（运行）：def/runtime 分工，正确。

### HTTP 接口面（controller 归属）

> OS 类比：HTTP 入口属 **L4 open-api（公共 API 网关/daemon）** 与 **L3 ai-app（用户态应用各开各的 socket）**；**engine（硬件）/ harness（内核）不开 HTTP 口**。

实测（2026-06-03）：`@Controller` 数 = open-api **39** · ai-app **91** · **engine 0** · **harness 0** · platform 9。

- ✅ **engine / harness = 0 controller** —— 最关键的不变量已满足，无需动。
- ✅ **两个 HTTP 面有意区分，勿合并**：`ai-app` = 一方前端 feature API（ask/explore/byok）；`open-api` = 对外/协议/管理面（a2a / mcp-server / admin / public-api / agents-api·skills-api·teams-api / webhooks）。把 ai-app 的 91 个 feature controller 灌进 open-api 会搅混两个面、破坏内聚 → **不做**。
- 🔎 **小项（可选上提）**：`platform` 9 个里偏 admin 的（`db-ops` / `storage-governance` / `secrets`）理论上更适合 `open-api/admin/`；`auth` 回调 / `notifications/unsubscribe` / `credits` 属基础设施端点留 platform 合理。逐个确认是否纯内部 admin 后再定，低优先。

### 执行优先级

1. **高置信纯结构**：image 收口、checkpoint 收口（先核实作用域）。
2. **设计级**：prompt registry 边界裁决后合并。
3. **中**：code-exec、learning、memory-tools 逐个核 import 面排期。
4. **gap**（语音/权限）：产品定，非重构。

---

## 四、关键归位规则（消除当前歧义）

### 跨层归位（engine ↔ harness）

| 项                       | 归位                         | 理由                                                                   |
| ------------------------ | ---------------------------- | ---------------------------------------------------------------------- |
| **MCP**                  | `engine/tools/adapters/mcp/` | tool source adapter，无 agent 状态。与 OpenAPI / function adapter 同层 |
| **ModelPricingRegistry** | `engine/llm/pricing/`        | 模型定价是 LLM 能力                                                    |
| **SkillRegistry**        | `engine/skills/registry/`    | 项目唯一，禁止 harness 再有第二个                                      |

### 跨聚合归位（harness 内部）

| 项                                                                             | 归位                                   | 理由                                               |
| ------------------------------------------------------------------------------ | -------------------------------------- | -------------------------------------------------- |
| `A2AMessage` 接口                                                              | `protocols/ipc/abstractions/`          | A2AMessage 是 IPC 协议接口源头，**禁止再放 teams** |
| `Mission` 核心类型                                                             | `agents/abstractions/mission.types.ts` | 通用 agent 任务抽象，跨 250+ 文件                  |
| `mission-health.monitor / orphan-detector / ownership / abort / runtime-state` | `lifecycle/mission-lifecycle/`         | 是生命周期治理不是编排                             |
| `subagent-spawner`                                                             | `agents/subagents/`                    | 匹配 Anthropic：subagent 是 agent 子能力           |
| `kernel-scheduler`                                                             | `runner/scheduler/`                    | task queue 调度是 run loop 子能力                  |
| `voting / debate / review`                                                     | `teams/collaboration/`                 | 团队内协作模式                                     |
| `failure-learner`                                                              | `lifecycle/learning/`                  | 失败学习是生命周期闭环                             |

### 命名替换（消除自造词）

| 旧名（自造）                           | 新名（业界标准）                                                          | 来源                            |
| -------------------------------------- | ------------------------------------------------------------------------- | ------------------------------- |
| `kernel/`                              | `agents/`                                                                 | OpenAI / Google / Anthropic SDK |
| `execution/`                           | `runner/`                                                                 | OpenAI Runner / Google Runner   |
| `process/`                             | 拆 `lifecycle/` + `agents/subagents/` + `runner/scheduler/` + `handoffs/` | `process` 不是 agent 域词       |
| `protocol/`                            | `protocols/`（复数）                                                      | 含多种协议；MCP 移出            |
| `governance/`                          | 拆 `evaluation/` + `guardrails/` + `tracing/` + `lifecycle/learning/`     | `governance` 不是 SDK 词        |
| `runtime/`                             | 解散到各正确归属                                                          | `runtime` 太 generic，僵尸目录  |
| `runtime/abstractions/` 大杂烩         | **删除**，每个聚合自己 abstractions/                                      | 反模式                          |
| `kernel-api`                           | `harness-api`                                                             | 与 kernel 目录冲突              |
| `runtime/mission/mission-orchestrator` | `runner/plan-execution/task-execution-orchestrator`                       | 与 teams orchestrator 解冲突    |
| `memory/dream/`                        | `memory/consolidation/`                                                   | 业界标准词 memory consolidation |
| `memory/auto-index/`                   | `memory/indexing/`                                                        | 简洁                            |
| `teams/constraints/constraint-profile` | `teams/profile/mission-execution-profile`                                 | 与 guardrails/constraint 解冲突 |

---

## 五、子目录 MECE 规则

### 通用模式（每个聚合 SHOULD 有）

- `abstractions/` —— 接口契约 + 类型定义集合（**每个聚合自己拥有，禁止跨聚合 re-export 大杂烩**）
- `xxx.module.ts` —— NestJS 模块入口（每个聚合 1 个）

### 互斥性强制原则

1. **兄弟目录互斥**：同一父目录下子目录不可有功能重叠
2. **不创建空容器**：禁止 `patterns/`、`utilities/` 这种纯分类壳
3. **不超过 2 层嵌套**：超过则需重新审视拆分粒度

---

## 六、文件命名规范（强制）

### 框架文件（必须用 `.<框架后缀>.ts`）

```
.service.ts          NestJS 注入服务（@Injectable）
.module.ts           NestJS 模块（@Module）
.controller.ts       NestJS 控制器（@Controller）
.gateway.ts          WebSocket 网关
.guard.ts            Guard
.middleware.ts       NestJS Middleware
```

### 数据/契约文件

```
.interface.ts        TypeScript 接口（IXxx 类型）
.types.ts            类型定义集合（多个 type/enum）
.dto.ts              DTO（Zod schema / class-validator）
.constants.ts        常量集合
```

### 通用模式（kebab-case + 描述性后缀，**不**用点号）

```
xxx-registry.ts      注册中心
xxx-factory.ts       工厂
xxx-adapter.ts       适配器
xxx-store.ts         持久化存储
xxx-strategy.ts      策略
xxx-pipeline.ts      管道
xxx-runner.ts        运行器（loop 算法）
xxx-executor.ts      执行器
xxx-scheduler.ts     调度器
xxx-orchestrator.ts  编排器
xxx-monitor.ts       监视器
xxx-detector.ts      检测器
xxx-scanner.ts       扫描器
xxx-tracer.ts        追踪器
xxx-judge.ts         judge 实现
xxx-listener.ts      事件监听
xxx-spawner.ts       派生器
```

### 域实例文件（用 `xxx.<域>.ts`）

```
.tool.ts             Tool 实现类
.agent.ts            Agent 实现类
.skill.ts            Skill 实现类
.stage.ts            Pipeline 阶段（GenesisPod 特有）
```

### 工具/原语

```
.util.ts             纯函数工具
无后缀 kebab-case    简单类（如 consensus.ts、harnessed-agent.ts、token-chunker.ts）
```

### 反模式（禁止）

- ❌ `utils.ts` / `helpers.ts` / `common.ts`（杂物袋，无单一职责）
- ❌ `xxx.types.ts` 与 `xxx.type.ts` 混用（统一用复数 `.types.ts`）
- ❌ 单文件超过 500 行（拆 sub-module）
- ❌ 同名概念跨层重复实现（如两个 SkillRegistry / 两个 ToolRegistry）

---

## 七、Facade 边界守护（继承自 14-skills-development）

### 三条铁律

1. **ai-app 必须从 `ai-engine/facade` / `ai-harness/facade` 导入**，禁止穿透内部路径
2. **新增符号先在 facade index 补 export**，再在 app 层使用
3. **禁止动态 `import()` 绕过 facade**

### 跨层 import 白名单

- `ai-app/**` → `ai-harness/facade/**`、`ai-engine/facade/**`
- `ai-harness/**` → `ai-engine/facade/**` + 合法 adapter（如 engine-skill-provider）
- `ai-engine/**` → 不得 import `ai-harness/**`、`ai-app/**`
- `ai-infra/**` → 不得 import 上层

由 ESLint `no-restricted-imports` + jest 架构边界 spec + pre-push hook **三层看护**。

---

## 八、对外 SDK 标准词对照（参考）

| 概念          | Anthropic Claude Agent SDK | OpenAI Agents SDK | Google ADK      | Microsoft AutoGen | CrewAI |
| ------------- | -------------------------- | ----------------- | --------------- | ----------------- | ------ |
| Agent 定义    | agent                      | agents            | agents          | agents            | agent  |
| 运行循环      | query                      | runner            | runners         | core.runtime      | crew   |
| 工具          | tool                       | tool              | tools           | tools             | tools  |
| 多 agent 协同 | subagents                  | handoffs          | flows           | teams             | crew   |
| 记忆          | memory                     | memory/session    | memory/sessions | state             | memory |
| 追踪          | (none)                     | tracing           | (built-in)      | (built-in)        | (none) |
| 限额          | permissions                | guardrail         | (built-in)      | (built-in)        | (none) |
| 协议          | mcp                        | mcp               | (built-in)      | (built-in)        | (none) |
| 生命周期      | hooks                      | lifecycle         | callbacks       | (built-in)        | (none) |

GenesisPod 选词：取业界共识的最常见词，且每个名字单一概念，杜绝同名歧义。

---

## 九、整改执行规则（开工时遵守）

### 单 PR 范围

1. 一个 PR 仅做**一个聚合的迁移 / 一个跨聚合的归位**
2. 必须包含：源文件移动 + 所有 importer 路径更新 + 测试更新 + facade re-export 更新
3. 必须通过 `npm run verify:arch` + 相关 spec
4. commit message: `refactor(harness): #1 MECE-W<wave>X <动作摘要>`

### 路径迁移工具

- 跨子树移动用 `git mv` 保留历史
- 子树内部相对 import 改 `@/` 别名（避免深度漂移）
- 已有 ESLint `no-restricted-imports` 配置必须**先**更新，再移文件（否则规则会暂时漏跑）

### 不破坏对外 API

- `facade/index.ts` 中的所有 export 在迁移期间**必须保持**（路径可改，符号名不动）
- 标记 `@deprecated` 给一个 PR 的过渡期，再删除

---

## 十、参考文档

- [13-module-dependencies.md](13-module-dependencies.md) —— 模块依赖关系总览
- [17-extension-governance.md](17-extension-governance.md) —— 扩展治理、定制代码归位、memory/plugin 边界
- [14-skills-development.md](14-skills-development.md) —— Skill 开发规范
- [02-directory-structure.md](02-directory-structure.md) —— 项目级目录规范
- [skills/ai/ai-architecture-layering/SKILL.md](../skills/ai/ai-architecture-layering/SKILL.md) —— 详细分层文档
