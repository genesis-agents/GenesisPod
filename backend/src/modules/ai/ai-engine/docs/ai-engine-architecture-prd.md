# AI Engine 架构重构 PRD

> **版本**: v1.0
> **创建日期**: 2026-01-02
> **状态**: 已完成

## 1. 概述

将现有 `ai-agents` 模块重构为分层的 `ai-engine` 架构：**AI Application → AI Engine → AI Core**

### 1.1 决策确认
| 决策项 | 选择 |
|--------|------|
| 迁移策略 | 一次性迁移（直接重构，不保留兼容层） |
| 应用层处理 | 提取通用能力到 ai-engine |
| Skill 动态性 | 静态注册 |
| 交付阶段 | 6 个阶段 |

### 1.2 设计原则
- **SOLID 原则**: 单一职责、开闭原则、依赖倒置
- **可扩展性**: 使用字符串 ID 替代枚举，支持动态注册
- **职责分离**: 工具中间件模式，BaseTool 精简化
- **统一执行**: 合并 Plan-Based 和 ReAct 两套执行模式

---

## 2. 目标架构

```
backend/src/modules/ai/
├── ai-engine/                    # 基座层（通用多Agent引擎）
│   ├── core/                     # 核心抽象
│   │   ├── types/                # 基础类型
│   │   ├── errors/               # 统一错误系统
│   │   └── interfaces/           # 核心接口
│   │
│   ├── tools/                    # 工具系统
│   │   ├── abstractions/         # 工具抽象
│   │   ├── base/                 # 基类
│   │   ├── middleware/           # 中间件
│   │   ├── registry/             # 注册表
│   │   └── categories/           # 48个工具分类
│   │
│   ├── skills/                   # 技能系统
│   │   ├── abstractions/         # 技能抽象
│   │   ├── base/                 # 基类
│   │   ├── registry/             # 注册表
│   │   └── builtin/              # 内置技能
│   │
│   ├── agents/                   # Agent 框架
│   │   ├── abstractions/         # Agent 抽象
│   │   ├── base/                 # 基类
│   │   ├── registry/             # 注册表
│   │   └── routing/              # 路由
│   │
│   ├── orchestration/            # 编排引擎
│   │   ├── abstractions/         # 编排接口
│   │   ├── executors/            # 执行器
│   │   └── checkpoints/          # 检查点
│   │
│   ├── collaboration/            # 协作框架
│   │   ├── abstractions/         # 协作接口
│   │   └── patterns/             # 协作模式
│   │
│   ├── constraint/               # 约束引擎
│   │   ├── validators/           # 验证器
│   │   └── guardrails/           # 安全护栏
│   │
│   ├── llm/                      # LLM 适配层
│   │   ├── abstractions/         # 适配器接口
│   │   ├── adapters/             # 适配器实现
│   │   └── factory/              # 工厂
│   │
│   ├── memory/                   # 记忆系统
│   │   ├── abstractions/         # 记忆接口
│   │   └── stores/               # 存储实现
│   │
│   └── docs/                     # 文档
│
├── ai-teams/                     # 应用：AI Teams
├── ai-studio/                    # 应用：深度研究
├── ai-simulation/                # 应用：辩论模拟
├── ai-coding/                    # 应用：AI 编程
└── ai-office/                    # 应用：办公套件
```

---

## 3. 核心接口设计

### 3.1 IExecutable - 统一执行接口

```typescript
interface IExecutable<TInput, TOutput, TContext = BaseContext> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  execute(input: TInput, context: TContext): Promise<ExecutionResult<TOutput>>;
  validateInput?(input: TInput): ValidationResult;
  getCapabilities?(): CapabilityDescriptor;
}
```

### 3.2 ITool - 工具接口

```typescript
interface ITool<TInput = unknown, TOutput = unknown>
  extends IExecutable<TInput, TOutput, ToolContext> {
  readonly category: ToolCategory;
  readonly inputSchema: JSONSchema;
  readonly outputSchema: JSONSchema;
  toFunctionDefinition(): FunctionDefinition;
}
```

### 3.3 ISkill - 技能接口

```typescript
interface ISkill<TInput, TOutput>
  extends IExecutable<TInput, TOutput, SkillContext> {
  readonly layer: SkillLayer;
  readonly domain: string;
  readonly requiredTools?: string[];
  readonly requiredSkills?: string[];
  checkPreconditions?(context: SkillContext): Promise<PreconditionResult>;
  getFallback?(): ISkill<TInput, TOutput> | null;
}
```

### 3.4 IAgent - Agent 接口

```typescript
interface IAgent<TInput = AgentInput, TOutput = AgentResult>
  extends IExecutable<TInput, TOutput, AgentContext> {
  readonly capabilities: AgentCapability[];
  readonly supportedModes: ExecutionMode[];
  plan?(input: TInput, context: AgentContext): Promise<ExecutionPlan>;
  executeStream?(plan: ExecutionPlan, context: AgentContext): AsyncGenerator<AgentEvent>;
}
```

---

## 4. 关键改进

### 4.1 工具中间件模式

```typescript
const pipeline = new ToolPipeline()
  .use(new ValidationMiddleware(validator))
  .use(new TimeoutMiddleware(30000))
  .use(new RetryMiddleware({ maxRetries: 3 }));

const result = await pipeline.execute(tool, input, context);
```

### 4.2 字符串 ID 替代枚举

```typescript
export const BUILTIN_AGENTS = {
  SLIDES: 'slides',
  DOCS: 'docs',
} as const;

registry.register({ id: 'my-custom-agent', ... });
```

### 4.3 统一执行模式

- **PlanAgent**: Plan-Based 执行模式
- **ReactiveAgent**: ReAct 循环执行模式
- **BaseAgent**: 支持两种模式的切换

---

## 5. 完成状态

| 阶段 | 内容 | 状态 |
|------|------|------|
| 阶段 1 | Core 核心层 | ✅ 完成 |
| 阶段 2 | Tools 工具系统 | ✅ 完成 |
| 阶段 3 | Skills 技能系统 | ✅ 完成 |
| 阶段 4 | Agents 框架 + LLM + Memory | ✅ 完成 |
| 阶段 5 | Orchestration 编排引擎 | ✅ 完成 |
| 阶段 6 | Collaboration + Constraint | ✅ 完成 |

---

## 6. 文件清单

### 已创建文件

**Core (~15 files)**
- `core/types/common.types.ts`
- `core/types/context.types.ts`
- `core/types/event.types.ts`
- `core/errors/error-codes.ts`
- `core/errors/base-error.ts`
- `core/errors/tool-error.ts`
- `core/errors/skill-error.ts`
- `core/errors/agent-error.ts`
- `core/interfaces/executable.interface.ts`
- `core/interfaces/registry.interface.ts`
- `core/interfaces/lifecycle.interface.ts`

**Tools (~12 files)**
- `tools/abstractions/tool.interface.ts`
- `tools/base/base-tool.ts`
- `tools/middleware/middleware.interface.ts`
- `tools/middleware/validation.middleware.ts`
- `tools/middleware/timeout.middleware.ts`
- `tools/middleware/tool-pipeline.ts`
- `tools/registry/tool-registry.ts`

**Skills (~6 files)**
- `skills/abstractions/skill.interface.ts`
- `skills/base/base-skill.ts`
- `skills/registry/skill-registry.ts`

**Agents (~8 files)**
- `agents/abstractions/agent.interface.ts`
- `agents/base/base-agent.ts`
- `agents/base/reactive-agent.ts`
- `agents/base/plan-agent.ts`
- `agents/registry/agent-registry.ts`

**LLM (~4 files)**
- `llm/abstractions/llm-adapter.interface.ts`
- `llm/adapters/base-llm-adapter.ts`
- `llm/factory/llm-factory.ts`

**Memory (~4 files)**
- `memory/abstractions/memory.interface.ts`
- `memory/stores/in-memory-store.ts`

**Orchestration (~8 files)**
- `orchestration/abstractions/orchestrator.interface.ts`
- `orchestration/executors/base-executor.ts`
- `orchestration/executors/sequential-executor.ts`
- `orchestration/executors/parallel-executor.ts`
- `orchestration/executors/dag-executor.ts`
- `orchestration/checkpoints/checkpoint-manager.ts`

**Collaboration (~4 files)**
- `collaboration/abstractions/collaborator.interface.ts`
- `collaboration/patterns/handoff-pattern.ts`
- `collaboration/patterns/voting-pattern.ts`

**Constraint (~4 files)**
- `constraint/validators/schema-validator.ts`
- `constraint/guardrails/content-filter.ts`
- `constraint/guardrails/rate-limiter.ts`
- `constraint/guardrails/cost-controller.ts`

---

## 7. 模块依赖关系

```
core ─────┬──────────────────────────────────────────┐
          │                                          │
          ▼                                          │
       tools ◄── llm      memory                     │
          │       ▲          ▲                       │
          ▼       │          │                       │
       skills ────┴──────────┘                       │
          │                                          │
          ▼                                          │
       agents                                        │
          │                                          │
          ▼                                          │
    orchestration ──► collaboration                  │
          │                                          │
          ▼                                          │
     constraint ◄────────────────────────────────────┘
```

---

## 8. 下一步

1. **迁移现有工具**: 将 `ai-agents/tools/` 下的 48 个工具迁移到 `ai-engine/tools/categories/`
2. **迁移现有技能**: 将 `ai-office/slides/skills/` 中的通用技能迁移
3. **集成测试**: 确保应用层可以正常使用新的 ai-engine
4. **删除旧代码**: 完成迁移后删除 `ai-agents/core/`
