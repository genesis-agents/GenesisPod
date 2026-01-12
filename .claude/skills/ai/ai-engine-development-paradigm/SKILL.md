---
name: AI Engine Development Paradigm
description: Comprehensive guide for developing AI Apps based on AI Engine team mode - covering patterns, anti-patterns, and best practices
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash
tags:
  - ai-engine
  - ai-teams
  - development
  - paradigm
  - best-practices
---

# AI Engine Development Paradigm

> **目标**：建立基于 AI Engine 团队模式开发 AI Apps 的统一范式，解决目前开发混乱、复用不清的问题。

## 核心原则

### 1. 委托优先原则 (Delegation First)

**AI App 应该委托 AI Engine 执行核心能力，而不是自己实现。**

```typescript
// ❌ 错误：在 AI App 中直接实现模型选择逻辑
async getReasoningModel(): Promise<ModelInfo | null> {
  // 100+ 行的模型选择代码
  const models = await this.prisma.aIModel.findMany({...});
  const detectedModel = models.find(m => this.isReasoningModel(m));
  // ...
}

// ✅ 正确：委托给 AI Engine
async getReasoningModel(): Promise<ModelInfo | null> {
  const modelConfig = await this.aiChatService.getReasoningModelConfig();
  if (!modelConfig) return null;
  return {
    modelId: modelConfig.modelId,
    provider: modelConfig.provider,
    isReasoning: modelConfig.isReasoning ?? false,
  };
}
```

### 2. 语义化配置原则 (Semantic Configuration)

**使用 `modelType` + `TaskProfile` 描述意图，让 AI Engine 决定具体实现。**

```typescript
// ❌ 错误：硬编码模型和参数
const response = await this.aiService.chat({
  model: "gpt-4o",
  temperature: 0.7,
  maxTokens: 4096,
  messages: [...],
});

// ✅ 正确：语义化描述任务需求
const response = await this.aiChatService.chat({
  modelType: AIModelType.CHAT,
  taskProfile: {
    creativity: "medium",
    outputLength: "long",
  },
  messages: [...],
});
```

### 3. 单一职责原则 (Single Responsibility)

**每个服务只做一件事，避免 God Service。**

| 服务类型          | 职责范围       | 示例                  |
| ----------------- | -------------- | --------------------- |
| Leader Service    | 任务规划和分配 | ResearchLeaderService |
| Execution Service | 任务执行       | TaskExecutionService  |
| Context Service   | 上下文管理     | MissionContextService |
| Review Service    | 质量审核       | OutputReviewerService |

### 4. 事件驱动原则 (Event-Driven)

**使用事件进行跨服务通信，避免紧耦合。**

```typescript
// ❌ 错误：直接调用其他服务更新状态
await this.uiService.updateProgress(taskId, 50);
await this.dbService.updateTask(taskId, { status: "running" });

// ✅ 正确：发布事件，让订阅者处理
this.eventEmitter.emit("task:progress", {
  taskId,
  progress: 50,
  status: "running",
});
```

---

## 架构分层详解

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Engine（核心能力层）                                         │
│  ● LLM 调用（chat, getReasoningModelConfig）                     │
│  ● 搜索增强（search, context enrichment）                        │
│  ● 编排服务（task decomposition, circuit breaker）               │
│  ● Token 管理（budget, allocation）                              │
│  ● 上下文演进（fact extraction, context evolution）              │
└─────────────────────────────────────────────────────────────────┘
                              ↓ 提供能力
┌─────────────────────────────────────────────────────────────────┐
│  AI Teams（协作机制层）                                          │
│  ● Mission 管理（create, execute, retry）                        │
│  ● Task 分解（decompose, assign, track）                         │
│  ● 协作模式（Leader-Member, parallel, sequential）               │
│  ● 进度追踪（events, SSE streaming）                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓ 承载
┌─────────────────────────────────────────────────────────────────┐
│  AI Apps（应用层）                                               │
│  ● Topic Research: 深度研究、报告生成                            │
│  ● Writing: 长文写作、章节协作                                   │
│  ● Teams: 多 Agent 协作、观点碰撞                                │
│  ● (Future) Simulation: 红蓝对抗、辩论模拟                       │
└─────────────────────────────────────────────────────────────────┘
```

### 能力归属判断

```
问自己："如果明天做一个完全不同的 AI App，这个能力还能复用吗？"

┌────────────────────────────────────────────────────────────────┐
│                          能复用？                               │
│                            │                                    │
│              ┌─────────────┼─────────────┐                      │
│              ↓ Yes                       ↓ No                   │
│       ┌─────────────┐           ┌─────────────────────┐        │
│       │  AI Engine  │           │   是常见场景模板？    │        │
│       └─────────────┘           └─────────────────────┘        │
│                                         │                       │
│                           ┌─────────────┼─────────────┐        │
│                           ↓ Yes                       ↓ No     │
│                    ┌─────────────┐              ┌──────────┐   │
│                    │ Predefined  │              │  Custom  │   │
│                    │  AI Teams   │              │ AI Teams │   │
│                    └─────────────┘              └──────────┘   │
└────────────────────────────────────────────────────────────────┘
```

---

## 开发模式

### 模式 1：LLM 调用

```typescript
import { AiChatService } from "@/modules/ai-engine/llm/services/ai-chat.service";
import { AIModelType } from "@prisma/client";

@Injectable()
export class MyService {
  constructor(private aiChatService: AiChatService) {}

  async analyze(content: string): Promise<string> {
    const response = await this.aiChatService.chat({
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content },
      ],
      modelType: AIModelType.CHAT,
      taskProfile: {
        creativity: "low", // 分析任务需要低创造性
        outputLength: "medium", // 中等长度输出
      },
    });

    return response.content;
  }
}
```

**TaskProfile 快速参考：**

| creativity    | temperature | 适用场景               |
| ------------- | ----------- | ---------------------- |
| deterministic | 0.1         | 分类、提取、JSON 解析  |
| low           | 0.3         | 分析、总结、结构化输出 |
| medium        | 0.7         | 对话、研究、一般任务   |
| high          | 0.9         | 创意写作、头脑风暴     |

| outputLength | maxTokens | 适用场景           |
| ------------ | --------- | ------------------ |
| minimal      | 500       | 分类标签、简短回答 |
| short        | 1500      | 摘要、简介         |
| medium       | 4000      | 标准分析、段落     |
| standard     | 6000      | 编辑任务、详细分析 |
| long         | 8000      | 报告章节、长文     |
| extended     | 16000     | 超长内容、完整文档 |

### 模式 2：搜索增强

```typescript
import { SearchService } from "@/modules/ai-engine/search/search.service";

@Injectable()
export class ResearchService {
  constructor(private searchService: SearchService) {}

  async research(query: string): Promise<SearchResults> {
    // 使用 AI Engine 的搜索能力
    const results = await this.searchService.search({
      query,
      maxResults: 10,
      searchDepth: "advanced",
      includeAnswer: true,
    });

    return results;
  }
}
```

### 模式 3：事件驱动进度

```typescript
import { EventEmitter2 } from "@nestjs/event-emitter";

@Injectable()
export class TaskExecutionService {
  constructor(private eventEmitter: EventEmitter2) {}

  async executeTask(task: Task): Promise<void> {
    // 开始执行
    this.eventEmitter.emit("task:started", { taskId: task.id });

    try {
      // 执行过程中发送进度
      this.eventEmitter.emit("task:progress", {
        taskId: task.id,
        progress: 50,
        message: "Processing...",
      });

      const result = await this.doWork(task);

      // 完成
      this.eventEmitter.emit("task:completed", {
        taskId: task.id,
        result,
      });
    } catch (error) {
      // 失败
      this.eventEmitter.emit("task:failed", {
        taskId: task.id,
        error: error.message,
      });
    }
  }
}
```

### 模式 4：Leader-Member 协作

```typescript
// Leader Service - 负责规划和分配
@Injectable()
export class LeaderService {
  async planMission(mission: Mission): Promise<TaskPlan[]> {
    // 1. 获取推理模型
    const modelConfig = await this.aiChatService.getReasoningModelConfig();

    // 2. 使用推理模型进行规划
    const plan = await this.aiChatService.chat({
      model: modelConfig?.modelId,
      messages: [
        { role: "system", content: LEADER_PLANNING_PROMPT },
        { role: "user", content: this.buildPlanningInput(mission) },
      ],
      taskProfile: {
        creativity: "medium",
        outputLength: "long",
      },
    });

    // 3. 解析规划结果
    return this.parsePlan(plan.content);
  }
}

// Member Service - 负责执行具体任务
@Injectable()
export class MemberService {
  async executeTask(task: Task, context: Context): Promise<TaskResult> {
    const response = await this.aiChatService.chat({
      modelType: AIModelType.CHAT,
      messages: [
        { role: "system", content: this.buildMemberPrompt(task.role) },
        { role: "user", content: this.buildTaskInput(task, context) },
      ],
      taskProfile: {
        creativity: task.requiresCreativity ? "high" : "medium",
        outputLength: "long",
      },
    });

    return { content: response.content };
  }
}
```

---

## 反模式与修正

### 反模式 1：直接模型选择

```typescript
// ❌ 反模式：在 AI App 中硬编码模型选择逻辑
const REASONING_MODELS = ["o1", "o3", "deepseek-r1"];
const model = models.find((m) =>
  REASONING_MODELS.some((r) => m.modelId.includes(r)),
);

// ✅ 修正：使用 AI Engine API
const modelConfig = await this.aiChatService.getReasoningModelConfig();
```

### 反模式 2：重复上下文构建

```typescript
// ❌ 反模式：每个服务都自己构建上下文
// service-a.ts
const context = this.buildContext(mission); // 100 行代码

// service-b.ts
const context = this.buildContext(mission); // 相似的 100 行代码

// ✅ 修正：使用统一的上下文服务
const context = await this.contextService.buildMissionContext(mission);
```

### 反模式 3：可选依赖检查

```typescript
// ❌ 反模式：@Optional() 然后在运行时检查
constructor(
  @Optional() private searchService?: SearchService,
) {}

async search(query: string) {
  if (!this.searchService) {
    throw new Error('SearchService not available');
  }
  return this.searchService.search(query);
}

// ✅ 修正：明确依赖，在模块配置中处理
constructor(private searchService: SearchService) {}
```

### 反模式 4：硬编码 TaskProfile

```typescript
// ❌ 反模式：到处散落硬编码的 TaskProfile
// file1.ts
taskProfile: { creativity: 'medium', outputLength: 'long' }
// file2.ts
taskProfile: { creativity: 'medium', outputLength: 'long' }

// ✅ 修正：定义预设，集中管理
// task-profiles.ts
export const TaskProfiles = {
  ANALYSIS: { creativity: 'low', outputLength: 'medium' },
  RESEARCH: { creativity: 'medium', outputLength: 'long' },
  CREATIVE_WRITING: { creativity: 'high', outputLength: 'extended' },
  CLASSIFICATION: { creativity: 'deterministic', outputLength: 'minimal' },
} as const;

// 使用时
taskProfile: TaskProfiles.RESEARCH
```

### 反模式 5：God Service

```typescript
// ❌ 反模式：一个服务做所有事情
@Injectable()
export class ResearchService {
  async createResearch() {
    /* ... */
  }
  async planTasks() {
    /* ... */
  }
  async executeTasks() {
    /* ... */
  }
  async reviewResults() {
    /* ... */
  }
  async generateReport() {
    /* ... */
  }
  async exportToPDF() {
    /* ... */
  }
  async sendEmail() {
    /* ... */
  }
}

// ✅ 修正：按职责拆分
@Injectable()
class ResearchPlanningService {
  /* 规划 */
}
@Injectable()
class ResearchExecutionService {
  /* 执行 */
}
@Injectable()
class ResearchReviewService {
  /* 审核 */
}
@Injectable()
class ReportGenerationService {
  /* 报告 */
}
```

---

## 优化建议

### 1. 统一 TaskProfile 预设

**问题**：TaskProfile 值散落在代码各处，难以维护。

**建议**：创建集中的预设文件：

```typescript
// backend/src/modules/ai-engine/llm/task-profiles.ts
export const TaskProfiles = {
  // 分析类任务
  ANALYSIS: { creativity: "low", outputLength: "medium" },
  DEEP_ANALYSIS: { creativity: "low", outputLength: "long" },

  // 研究类任务
  RESEARCH_PLANNING: { creativity: "medium", outputLength: "long" },
  RESEARCH_EXECUTION: { creativity: "medium", outputLength: "extended" },

  // 创作类任务
  CREATIVE_WRITING: { creativity: "high", outputLength: "extended" },

  // 结构化输出
  JSON_EXTRACTION: { creativity: "deterministic", outputLength: "medium" },
  CLASSIFICATION: { creativity: "deterministic", outputLength: "minimal" },
} as const;
```

### 2. 统一上下文构建

**问题**：多个服务有重复的上下文构建逻辑。

**建议**：创建 ContextBuilderService：

```typescript
// backend/src/modules/ai-engine/context/context-builder.service.ts
@Injectable()
export class ContextBuilderService {
  // 构建任务上下文
  async buildTaskContext(task: Task): Promise<TaskContext> {
    /* ... */
  }

  // 构建 Mission 上下文
  async buildMissionContext(mission: Mission): Promise<MissionContext> {
    /* ... */
  }

  // 构建历史上下文
  async buildHistoricalContext(history: Message[]): Promise<string> {
    /* ... */
  }
}
```

### 3. 模型能力注册机制

**问题**：目前通过 ID 模式匹配识别推理模型，不够灵活。

**建议**：在数据库中增加模型能力标签：

```prisma
model AIModel {
  // ... existing fields
  capabilities  String[]  // ["reasoning", "vision", "code", "long-context"]
  isReasoning   Boolean   @default(false)  // 已有字段
  isVision      Boolean   @default(false)
  isCode        Boolean   @default(false)
}
```

### 4. 服务依赖清理

**问题**：@Optional() 依赖导致运行时不确定性。

**建议**：

1. 移除所有 @Optional() 装饰器
2. 在模块配置中明确处理可选依赖
3. 使用 Feature Flags 控制功能可用性

### 5. 事件规范化

**问题**：事件名称和 payload 格式不统一。

**建议**：创建事件类型定义：

```typescript
// backend/src/modules/ai-engine/events/types.ts
export interface TaskStartedEvent {
  taskId: string;
  missionId: string;
  timestamp: Date;
}

export interface TaskProgressEvent {
  taskId: string;
  progress: number; // 0-100
  message?: string;
  timestamp: Date;
}

export interface TaskCompletedEvent {
  taskId: string;
  result: unknown;
  duration: number; // ms
  timestamp: Date;
}

export const TaskEvents = {
  STARTED: "task:started",
  PROGRESS: "task:progress",
  COMPLETED: "task:completed",
  FAILED: "task:failed",
} as const;
```

---

## 新 AI App 开发清单

当开发新的 AI App 时，遵循以下清单：

### 规划阶段

- [ ] 明确 App 的核心功能和用户场景
- [ ] 识别需要的 AI Engine 能力（LLM、搜索、编排等）
- [ ] 确定是否需要 Leader-Member 协作模式
- [ ] 设计数据模型（Mission、Task、Result）

### 实现阶段

- [ ] 使用 `modelType` + `TaskProfile` 调用 LLM
- [ ] 使用 AI Engine 的搜索服务而非自己实现
- [ ] 使用事件驱动进度通信
- [ ] 委托 AI Engine 处理模型选择
- [ ] 使用统一的 TaskProfile 预设

### 代码审查

- [ ] 无硬编码的模型 ID
- [ ] 无硬编码的 temperature/maxTokens
- [ ] 无 @Optional() 服务依赖
- [ ] 无重复的上下文构建逻辑
- [ ] 服务职责单一，无 God Service

### 测试验证

- [ ] 验证 LLM 调用使用正确的 taskProfile
- [ ] 验证事件正确发布
- [ ] 验证与 AI Engine 的集成正常

---

## 相关文档

- [AI Architecture Layering](../ai-architecture-layering/SKILL.md) - 架构分层决策
- [AI Teams Expert](../ai-teams-expert/SKILL.md) - AI Teams 实现细节
- [AI App Developer](../ai-app-developer/SKILL.md) - AI App 开发模式
- [docs/guides/ai-calling-standards.md](../../../../docs/guides/ai-calling-standards.md) - AI 调用规范

---

## 版本历史

| 版本 | 日期       | 变更                                                   |
| ---- | ---------- | ------------------------------------------------------ |
| 1.0  | 2025-01-12 | 初始版本，基于 Topic Research、Writing、Teams 实践总结 |

---

**维护者**: Claude Code
**最后更新**: 2025-01-12
