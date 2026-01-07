---
name: AI Architecture Layering
description: Decide where AI capabilities should be placed in DeepDive Engine's layered architecture (AI Engine vs AI Teams vs Custom Teams)
allowed-tools:
  - Read
  - Grep
  - Glob
tags:
  - architecture
  - ai-engine
  - ai-teams
  - decision
  - layering
---

# AI Architecture Layering

You are an expert at deciding where AI capabilities should be placed in DeepDive Engine's layered architecture.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Engine（核心能力层）                                         │
│  领域无关的通用机制，可被所有 AI Apps 复用                        │
│  Orchestration / LLM / Search / Context / Constraint            │
└─────────────────────────────────────────────────────────────────┘
                              ↓ 提供能力
┌─────────────────────────────────────────────────────────────────┐
│  AI Teams（协作机制层）                                          │
│  多 Agent 协作的运作方式（Leader-Member 模式）                    │
│  Mission / Task / Review / Execution                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓ 承载
┌─────────────────────────────────────────────────────────────────┐
│  预定义 AI Teams（官方应用层）                                    │
│  针对常见场景优化的配置，开箱即用                                  │
│  AI Studio / AI Office / AI Simulation                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓ 或者
┌─────────────────────────────────────────────────────────────────┐
│  自定义 AI Teams（用户配置层）                                    │
│  用户根据需求自己配置的团队                                       │
│  小说创作 / 技术文档 / 个性化场景                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Decision Framework

### Step 1: Is it Domain-Agnostic?

Ask: **"如果明天做一个完全不同的 AI App（如 AI 客服），这个能力还能复用吗？"**

| 答案        | 归属              | 示例                          |
| ----------- | ----------------- | ----------------------------- |
| ✅ 能复用   | AI Engine         | LLM调用、搜索增强、上下文演进 |
| ❌ 不能复用 | 继续判断 → Step 2 | 小说提示词模板、研究报告格式  |

### Step 2: Is it an Official Optimized Scenario?

Ask: **"这是官方针对常见场景优化的配置吗？"**

| 答案            | 归属              | 示例                               |
| --------------- | ----------------- | ---------------------------------- |
| ✅ 是官方场景   | 预定义 AI Teams   | 研究报告(Studio)、商务文档(Office) |
| ❌ 不是官方场景 | 继续判断 → Step 3 | 用户自己的小说团队配置             |

### Step 3: Does User Need to Configure It?

Ask: **"这需要用户自己配置吗？"**

| 答案        | 归属               | 示例                       |
| ----------- | ------------------ | -------------------------- |
| ✅ 用户配置 | 自定义 AI Teams    | 自定义角色、协作规则、约束 |
| ❌ 不需要   | 可能不需要单独抽象 | -                          |

## AI Engine Capabilities (核心能力层)

### Characteristics

- ✅ 领域无关（小说、技术文档、研究报告都能用）
- ✅ 可被多种 AI Apps 复用
- ✅ 不依赖具体业务上下文
- ✅ 是"机制"而非"策略"

### Current Capabilities

| 能力         | 服务                         | 路径                       | 说明                 |
| ------------ | ---------------------------- | -------------------------- | -------------------- |
| LLM 调用     | AiChatService                | `ai-engine/llm/`           | 统一的 LLM 调用接口  |
| 搜索增强     | SearchService                | `ai-engine/search/`        | Web 搜索能力         |
| 任务分解     | TaskDecomposerService        | `ai-engine/orchestration/` | 解析任务分解文本     |
| Agent 执行   | AgentExecutorService         | `ai-engine/orchestration/` | 执行单个任务         |
| 输出审核     | OutputReviewerService        | `ai-engine/orchestration/` | 审核任务输出         |
| 熔断器       | CircuitBreakerService        | `ai-engine/orchestration/` | 保护失败的 Agent     |
| Token 预算   | TokenBudgetService           | `ai-engine/orchestration/` | 管理 Token 分配      |
| 上下文初始化 | ContextInitializationService | `ai-engine/orchestration/` | 任务前生成世界观设定 |
| 上下文演进   | ContextEvolutionService      | `ai-engine/orchestration/` | 任务后提取事实       |

### Should Be Migrated to AI Engine

| 能力                         | 当前位置     | 理由                |
| ---------------------------- | ------------ | ------------------- |
| ConstraintEnforcementService | ai-app/teams | 约束强制是通用机制  |
| 长内容分块                   | ai-app/teams | 分块/合并是通用能力 |

## Predefined AI Teams (官方应用层)

### Characteristics

- ✅ 针对**特定场景**优化
- ✅ 封装了**最佳实践**（提示词、质量标准、输出格式）
- ✅ 用户**开箱即用**
- ✅ 是"策略"而非"机制"

### Configuration Structure

```typescript
interface PredefinedTeamConfig {
  // 团队角色模板
  leaderRole: {
    persona: string; // "你是一位资深研究主管..."
    systemPrompt: string; // 系统提示词
  };
  memberRoles: Array<{
    name: string; // "研究员", "分析师"
    persona: string;
    systemPrompt: string;
    expertiseAreas: string[];
  }>;

  // 场景特定提示词模板
  planningPromptTemplate: string;
  executionPromptTemplate: string;
  reviewPromptTemplate: string;

  // 质量标准
  qualityStandards: Array<{
    dimension: string; // "准确性", "完整性"
    requirement: string;
    passThreshold: number;
  }>;

  // 输出格式
  outputFormat: "markdown" | "structured" | "slides";
  outputTemplate?: string;
}
```

### Current Predefined Teams

| Team          | 场景     | 包含内容                                         |
| ------------- | -------- | ------------------------------------------------ |
| AI Studio     | 研究报告 | Leader=研究主管, Members=研究员/分析师, 报告模板 |
| AI Office     | 商务文档 | Leader=项目经理, Members=文案/设计, 商务风格     |
| AI Simulation | 辩论推演 | 正方/反方角色, 辩论规则, 共识投票                |

## Custom AI Teams (用户配置层)

### Characteristics

- ✅ 用户根据**自己需求**配置
- ✅ 基于 AI Engine 能力**组合**
- ✅ 需要一定的**理解成本**

### User Configurable Items

| 配置项     | 说明             | 示例                       |
| ---------- | ---------------- | -------------------------- |
| 团队成员   | 自定义角色和能力 | "创意总监"、"文案编辑"     |
| 协作模式   | 串行/并行/DAG    | 按章节并行写作             |
| 硬性约束   | 必须遵守的规则   | "主角不能死"、"时代为明朝" |
| 世界观设定 | 初始化配置       | 时代、人物、阵营           |
| 质量标准   | 审核通过条件     | 字数、风格、一致性         |
| 输出格式   | 最终产出形式     | 小说章节、技术文档         |

## Red Flags (Anti-Patterns)

### 🚫 Don't Put in AI Engine

- 场景特定的提示词模板（如：研究报告开头模板）
- 特定领域的质量标准（如：小说情节连贯性检查）
- 特定输出格式（如：PPT 大纲结构）

### 🚫 Don't Put in AI Teams

- 通用的 LLM 调用逻辑
- 领域无关的错误处理机制
- 通用的 Token 管理策略

## Decision Examples

### Example 1: "事实提取" 能力

```
Q: 如果做 AI 客服，能复用吗？
A: 能。客服对话中也需要提取关键事实（客户问题、订单号等）

结论：放在 AI Engine (ContextEvolutionService)
```

### Example 2: "小说人物一致性检查" 能力

```
Q: 如果做 AI 客服，能复用吗？
A: 不能。这是小说特有的检查逻辑

Q: 是官方场景吗？
A: 不是。小说创作不是预定义场景

结论：放在 自定义 AI Teams 的配置中
```

### Example 3: "研究报告引用格式" 能力

```
Q: 如果做 AI 客服，能复用吗？
A: 不能。客服不需要引用格式

Q: 是官方场景吗？
A: 是。AI Studio 专门做研究报告

结论：放在 预定义 AI Teams (AI Studio) 的配置中
```

## File Locations

### AI Engine

```
backend/src/modules/ai-engine/
├── orchestration/services/     # 编排服务
│   ├── context-initialization.service.ts
│   ├── context-evolution.service.ts
│   ├── circuit-breaker.service.ts
│   └── ...
├── llm/services/              # LLM 服务
├── search/                    # 搜索服务
└── ...
```

### AI Teams (Mechanism)

```
backend/src/modules/ai-app/teams/
├── services/collaboration/    # 协作机制
│   ├── mission/              # 任务管理
│   └── context/              # 上下文管理 (部分应下沉)
└── ...
```

### Predefined AI Teams

```
backend/src/modules/ai-app/teams/
├── presets/                   # 预定义配置
│   ├── studio.preset.ts      # AI Studio 配置
│   ├── office.preset.ts      # AI Office 配置
│   └── simulation.preset.ts  # AI Simulation 配置
└── ...
```

## Your Responsibilities

When a new AI capability is proposed:

1. **Ask the three questions** in the decision framework
2. **Check the red flags** to avoid anti-patterns
3. **Propose the correct layer** with reasoning
4. **If uncertain, default to higher layer** (AI Engine) - it's easier to move up than down
5. **Document the decision** for future reference

## Related Skills

- [ai-teams-expert](../ai-teams-expert/SKILL.md) - AI Teams implementation details
- [ai-service-expert](../ai-service-expert/SKILL.md) - AI service patterns
- [schema-architect](../schema-architect/SKILL.md) - Data model design
