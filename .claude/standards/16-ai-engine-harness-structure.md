# AI Engine + AI Harness 目录结构规范

**版本：** 1.0
**强制级别：** MUST
**生效日期：** 2026-05-02
**维护者：** Claude Code

---

## 一、定位与边界（架构唯一判别标准）

| 层                  | 定位                                | 判别口诀                                               |
| ------------------- | ----------------------------------- | ------------------------------------------------------ |
| **L2 ai-engine**    | LLM 原子能力（无 agent 状态）       | **不需要知道 agent / mission 是谁就能做的事** → engine |
| **L2.5 ai-harness** | Agent 运行时脚手架（含 agent 状态） | **必须知道 agent / mission 才有意义的事** → harness    |

依赖方向严格单向：`L4 ai-app → L2.5 ai-harness → L2 ai-engine → L1 ai-infra`，反向禁止。

---

## 二、ai-engine 顶层（10 个聚合，业界标准词）

```
agents 域之外的"原子能力"，全部放 engine：
llm · tools · rag · knowledge · skills · planning · safety · content · credentials · facade
```

| 聚合            | 职责                                         | 关键边界                                                      |
| --------------- | -------------------------------------------- | ------------------------------------------------------------- |
| **llm**         | LLM 调用 + 模型适配 + 路由 + 定价 + 意图识别 | 无 agent 状态；含 model pricing                               |
| **tools**       | 工具目录 + 单次执行 + 来源适配（含 MCP）     | **项目唯一的 tools/**；含 mcp/openapi/function adapter        |
| **rag**         | 检索增强生成基元                             | embedding / vector / chunker / retriever / reranker           |
| **knowledge**   | 知识抽取                                     | fact / entity / relation / context-evolution / world-building |
| **skills**      | Skill 定义 + 注册（SKILL.md 风格）           | **项目唯一的 SkillRegistry**                                  |
| **planning**    | 任务分解（不含 agent loop）                  | task-planner / decomposer                                     |
| **safety**      | 输入输出安全                                 | pii / moderation / injection                                  |
| **content**     | 内容处理基元                                 | fetch / cleaner / markdown                                    |
| **credentials** | 凭证 / BYOK                                  | user-config / secret-resolver                                 |
| **facade**      | engine 对外门面                              | 仅 re-export，无业务逻辑                                      |

---

## 三、ai-harness 顶层（11 个聚合，业界标准词）

```
agents · runner · teams · handoffs · memory · protocols · evaluation · guardrails · tracing · lifecycle · facade
```

| 聚合           | MECE 关注点                                      | 关键边界                                                                                         |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **agents**     | WHAT agents are                                  | core / base / registry / domain / **subagents** / dev-tools                                      |
| **runner**     | HOW they run                                     | loop / executor / tool-invoker / tool-routing / context / **scheduler**                          |
| **teams**      | Genesis 团队业务模式                             | abstractions / base / profile / factory / registry / orchestrator / services / **collaboration** |
| **handoffs**   | Agent 切换（OpenAI 标准词）                      | pattern + registry                                                                               |
| **memory**     | WHAT they remember                               | vector / working / checkpoint / event-store / stores / consolidation / indexing                  |
| **protocols**  | HOW they communicate（**仅 5 个 agent 层协议**） | a2a / ipc / events / realtime / journal（**MCP 不在此**）                                        |
| **evaluation** | WHO judges them                                  | critique / verify / figure                                                                       |
| **guardrails** | WHO constrains them                              | budget / billing / rate-limit / concurrency / constraint / runtime-env                           |
| **tracing**    | WHO observes them                                | otel / eval / latency / llm-events / attribution / observability                                 |
| **lifecycle**  | WHO recovers them                                | hooks / manager / supervisor / mission-lifecycle / learning                                      |
| **facade**     | WHO exposes them                                 | ai.facade / domain / sub-facades / api / providers                                               |

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
.stage.ts            Pipeline 阶段（Genesis 特有）
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

Genesis 选词：取业界共识的最常见词，且每个名字单一概念，杜绝同名歧义。

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
- [14-skills-development.md](14-skills-development.md) —— Skill 开发规范
- [02-directory-structure.md](02-directory-structure.md) —— 项目级目录规范
- [skills/ai/ai-architecture-layering/SKILL.md](../skills/ai/ai-architecture-layering/SKILL.md) —— 详细分层文档
