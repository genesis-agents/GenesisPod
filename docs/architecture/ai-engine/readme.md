# AI Engine 架构文档

> **版本**: 2.1
> **最后更新**: 2026-02-05
> **维护者**: 技术架构团队

---

## 概述

AI Engine 是 Genesis.ai 的核心能力层，提供领域无关的通用 AI 能力。所有 AI Apps（AI Research、AI Teams、AI Office 等）通过统一的 `AIEngineFacade` 消费这些能力。

### 核心定位

```
AI Apps 层（业务应用）
    ↓ 通过 AIEngineFacade
AI Engine 层（核心能力）
    ↓ 调用
基础设施层（LiteLLM, Tavily, 数据库）
```

**设计原则**：

- **单一入口**：所有外部调用通过 `AIEngineFacade`
- **语义化配置**：使用 `TaskProfile` 而非硬编码参数
- **能力聚合**：LLM + Search + Agent + Team + Context + Memory
- **向下委托**：Facade 只做路由，具体实现在内部服务

---

## 文档导航

### 核心架构文档

| 文档                                             | 说明                         | 状态      |
| ------------------------------------------------ | ---------------------------- | --------- |
| [模块总览](./module-overview.md)                 | AI Engine 所有模块的功能清单 | ✅ 已更新 |
| [统一入口设计](./facade-design.md)               | AIEngineFacade 接口和使用    | ✅ 已更新 |
| [LLM 能力层](./llm-capabilities.md)              | LLM 调用、模型选择、降级容错 | ✅ 已更新 |
| [参数抽象](./ai-engine-parameter-abstraction.md) | TaskProfile 设计和映射规则   | ✅ 已有   |

### 子系统文档

| 文档                               | 说明                   | 状态      |
| ---------------------------------- | ---------------------- | --------- |
| [工具系统](./tools-system.md)      | 55+ 工具的分类和使用   | ✅ 已更新 |
| [Agent 框架](./agent-framework.md) | ReAct/Plan-Based Agent | ✅ 已更新 |
| [编排引擎](./orchestration.md)     | 任务编排和执行策略     | ✅ 已更新 |
| [团队系统](./teams-system.md)      | 多 Agent 协作框架      | ✅ 已更新 |
| [上下文管理](./ai-context.md)      | 上下文构建和资源类型   | ✅ 已有   |
| [记忆系统](./memory-system.md)     | 短期/长期记忆          | ✅ 已更新 |
| [约束引擎](./constraint-engine.md) | Schema 验证、内容过滤  | ✅ 已更新 |
| [RAG 系统](./rag-system.md)        | 向量检索和文档分块     | ✅ 已更新 |
| [图像生成](./image-generation.md)  | 多 Provider 图像生成   | ✅ 已更新 |
| [长内容处理](./long-content.md)    | 长文本处理引擎         | ✅ 已更新 |

### P2 能力模块 (2026-02 新增)

| 模块                           | 说明                   | 状态    |
| ------------------------------ | ---------------------- | ------- |
| [可观测性](./observability.md) | 监控、追踪、日志       | 🆕 新增 |
| [证据管理](./evidence.md)      | 引用溯源、证据链       | 🆕 新增 |
| [质量检测](./quality.md)       | 输出质量评估、改进建议 | 🆕 新增 |
| [协作框架](./collaboration.md) | 投票、待办、审核工作流 | 🆕 新增 |
| [实时通信](./realtime.md)      | WebSocket 实时推送     | 🆕 新增 |

### 技术决策记录

| 文档                                           | 说明                     | 状态      |
| ---------------------------------------------- | ------------------------ | --------- |
| [目标架构](./ai-engine-target-architecture.md) | 三层架构和迁移状态       | ✅ 已有   |
| [能力沉淀策略](./capability-precipitation.md)  | 从 AI Apps 沉淀到 Engine | ✅ 已更新 |

---

## 快速开始

### 1. 通过 Facade 调用 LLM

```typescript
import { AIEngineFacade } from "@/modules/ai-engine";
import { AIModelType } from "@prisma/client";

@Injectable()
export class MyService {
  constructor(private readonly aiFacade: AIEngineFacade) {}

  async analyze(input: string) {
    const response = await this.aiFacade.chat({
      messages: [{ role: "user", content: input }],
      modelType: AIModelType.CHAT,
      taskProfile: {
        creativity: "low", // 分析任务低创意
        outputLength: "medium", // 中等长度输出
        taskType: "analysis",
        outputFormat: "json",
      },
    });

    return response.content;
  }
}
```

### 2. 执行智能搜索

```typescript
const results = await this.aiFacade.search({
  query: "量子计算最新进展",
  maxResults: 5,
  provider: "tavily", // 可选: tavily, serper, duckduckgo
});

// 格式化为上下文
const context = this.aiFacade.formatSearchResultsForContext(results.results);
```

### 3. 启动团队任务

```typescript
const mission = await this.aiFacade.startTeamMission({
  teamType: "research-team",
  input: {
    topic: "AI Agent 架构设计",
    requirements: "分析主流 Agent 框架的设计模式",
  },
  onProgress: (progress) => {
    console.log(`进度: ${progress.percentage}%`);
  },
});
```

### 4. 执行 Agent 任务

```typescript
const result = await this.aiFacade.executeAgent({
  agentId: "researcher",
  input: {
    task: "总结这篇论文的核心贡献",
    context: paperContent,
  },
  taskProfile: {
    creativity: "medium",
    outputLength: "standard",
  },
});
```

---

## 模块组织

### 代码位置

```
backend/src/modules/ai-engine/
├── facade/                  # 统一入口 (1315 行)
├── llm/                     # LLM 能力层
│   ├── services/            # AiChatService, TaskProfileMapper
│   ├── adapters/            # 多模型适配器
│   ├── model-fallback/      # 模型降级容错 (574 行)
│   └── types/               # TaskProfile 定义
├── search/                  # 搜索服务
├── tools/                   # 工具系统 (55+ 工具)
│   ├── categories/          # 8 个分类
│   ├── registry/            # 工具注册表
│   └── middleware/          # 工具中间件
├── agents/                  # Agent 框架
│   ├── base/                # ReAct/Plan-Based 基类
│   ├── implementations/     # 5 个内置 Agent
│   └── registry/            # Agent 注册表
├── orchestration/           # 编排引擎
│   ├── executors/           # 4 个执行器
│   ├── services/            # 11 个编排服务
│   └── state-machine/       # 状态机 (436 行)
├── teams/                   # 团队系统
│   ├── base/                # Team/Role/Member 基类
│   ├── templates/           # 3 个预定义团队
│   ├── services/            # TeamsService
│   └── constraints/         # 约束引擎
├── memory/                  # 记忆系统
├── constraint/              # 约束验证
├── rag/                     # RAG 系统
├── image/                   # 图像生成
├── long-content/            # 长内容处理
├── mcp/                     # MCP 协议
├── skills/                  # 技能系统
├── collaboration/           # 协作框架 (P2)
│   ├── voting-pattern.ts    # 投票机制
│   ├── todo/                # 待办事项
│   └── review/              # 审核工作流
├── evidence/                # 证据管理 (P2)
├── quality/                 # 质量检测 (P2)
│   └── services/
│       └── quality-gate.service.ts
├── realtime/                # 实时通信 (P2)
├── observability/           # 可观测性 (P2)
│   ├── tracing/             # 分布式追踪
│   └── metrics/             # 指标采集
└── prompts/                 # 提示词管理
```

### 模块统计

| 模块              | 文件数 | 核心服务                     | 状态      |
| ----------------- | ------ | ---------------------------- | --------- |
| **facade**        | 4      | AIEngineFacade (1315 行)     | ✅ 已实现 |
| **llm**           | 35     | AiChatService, ModelFallback | ✅ 已实现 |
| **tools**         | 55+    | ToolRegistry, 55+ 工具       | ✅ 已实现 |
| **agents**        | 27     | AgentOrchestrator, 5 agents  | ✅ 已实现 |
| **orchestration** | 30     | 4 executors, 11 services     | ✅ 已实现 |
| **teams**         | 37     | TeamsService, 3 templates    | ✅ 已实现 |
| **search**        | 8      | SearchService, 3 providers   | ✅ 已实现 |
| **memory**        | 4      | Short/Long-term Memory       | ✅ 已实现 |
| **constraint**    | 4      | ContentFilter, CostControl   | ✅ 已实现 |
| **rag**           | 7      | Embedding, Vector, Chunker   | ✅ 已实现 |
| **image**         | 12     | ImageFactory, 4 providers    | ✅ 已实现 |
| **long-content**  | 16     | LongContentEngine            | ✅ 已实现 |
| **collaboration** | 8      | VotingManager, TodoService   | ✅ P2     |
| **evidence**      | 5      | EvidenceTracker              | ✅ P2     |
| **quality**       | 6      | QualityGateService           | ✅ P2     |
| **realtime**      | 4      | RealtimeService              | ✅ P2     |
| **observability** | 6      | TracingService, Metrics      | ✅ P2     |
| **总计**          | 320+   | -                            | -         |

---

## 核心能力清单

### LLM 能力

- ✅ 统一对话入口 (`chat()`)
- ✅ 流式输出 (`chatStream()`)
- ✅ 模型选择 (`selectModel()`)
- ✅ TaskProfile 参数映射
- ✅ 模型降级容错 (ModelFallbackService)
- ✅ 推理模型支持 (o1, o3, DeepSeek-R1)
- ✅ 数据库驱动模型配置

### 搜索能力

- ✅ 多源搜索聚合 (Tavily, Serper, DuckDuckGo)
- ✅ 结果格式化为上下文
- ✅ 自动 Provider 选择

### Agent 能力

- ✅ ReAct Agent (推理-行动循环)
- ✅ Plan-Based Agent (规划-执行)
- ✅ Agent 注册表
- ✅ 5 个内置 Agent (developer, researcher, simulator, image-designer, team-collaboration)

### 编排能力

- ✅ 顺序执行 (SequentialExecutor)
- ✅ 并行执行 (ParallelExecutor)
- ✅ DAG 执行 (依赖图)
- ✅ 函数调用编排 (FunctionCallingExecutor)
- ✅ 11 个编排服务 (任务分解、输出审查、迭代管理等)
- ✅ 熔断器和重试策略
- ✅ 自我反思机制 (ReflectionService, 406 行)
- ✅ 状态机管理 (ExecutionStateManager, 436 行)

### 团队能力

- ✅ Leader-Member 协作模式
- ✅ 角色注册表
- ✅ 任务编排 (MissionOrchestrator)
- ✅ 约束引擎 (ConstraintEngine)
- ✅ 投票共识机制
- ✅ 3 个预定义团队 (research, debate, report)

### 工具系统

- ✅ 8 个工具分类
- ✅ 55+ 内置工具
- ✅ 工具注册表
- ✅ 工具中间件

### 其他能力

- ✅ 短期/长期记忆
- ✅ RAG (向量检索、文档分块)
- ✅ 约束验证 (Schema, 内容过滤, 成本控制)
- ✅ 图像生成 (多 Provider)
- ✅ 长内容处理
- ✅ MCP 协议支持

---

## 最佳实践

### 1. 始终通过 Facade

```typescript
// ✅ 正确
constructor(private readonly aiFacade: AIEngineFacade) {}

// ❌ 错误：直接依赖内部服务
constructor(private readonly aiChatService: AiChatService) {}
```

### 2. 使用 TaskProfile 而非硬编码参数

```typescript
// ✅ 正确
taskProfile: {
  creativity: 'medium',
  outputLength: 'standard',
}

// ❌ 错误
temperature: 0.7,
maxTokens: 6000,
```

### 3. 指定 modelType 而非具体模型

```typescript
// ✅ 正确
modelType: AIModelType.CHAT;

// ❌ 错误
model: "gpt-4o";
```

### 4. 利用熔断器自动保护

```typescript
// Facade 内置熔断器，无需额外处理
const response = await this.aiFacade.chat(request);
// 自动处理模型故障和降级
```

---

## 版本历史

| 版本 | 日期       | 变更内容                           |
| ---- | ---------- | ---------------------------------- |
| 1.0  | 2025-01-12 | 初始版本，基于目标架构文档         |
| 2.0  | 2026-01-15 | 基于代码重新生成，反映实际实现状态 |

---

## 相关资源

- **项目规范**: [D:\projects\codes\genesis-ai\.claude\CLAUDE.md](../../../.claude/CLAUDE.md)
- **代码位置**: `backend/src/modules/ai-engine/`
- **前端调用**: `frontend/lib/api/` 中的 API 客户端
- **数据库**: AIModel 表配置模型行为

---

**维护者**: 技术架构团队
**反馈**: 请在 GitHub Issues 中提出架构相关问题
