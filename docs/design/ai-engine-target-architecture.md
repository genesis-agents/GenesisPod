# AI Engine 目标架构方案

> **目标**: 将 AI Engine 作为唯一底座，所有 AI Apps 通过统一 API 消费 AI 能力

---

## 1. 三层架构总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Layer 3: AI Apps (业务层)                          │
│                                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │AI Studio │ │AI Teams  │ │AI Office │ │AI Writing│ │AI Coding │ ...      │
│  │(深度研究)│ │(团队协作)│ │(办公套件)│ │(智能写作)│ │(编程助手)│          │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │
│       │            │            │            │            │                 │
│       └────────────┴────────────┴────────────┴────────────┘                 │
│                                   │                                         │
│                                   ▼                                         │
│                        ╔═════════════════════╗                              │
│                        ║   AIEngineFacade    ║ ← 统一入口                   │
│                        ╚══════════╤══════════╝                              │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │
┌───────────────────────────────────┼─────────────────────────────────────────┐
│                          Layer 2: AI Engine (能力层)                        │
│                                    │                                         │
│  ┌─────────────────────────────────┴─────────────────────────────────────┐  │
│  │                        Core Capabilities                              │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │    LLM      │ │   Search    │ │  Context    │ │ Constraint  │     │  │
│  │  │  Service    │ │   Service   │ │  Manager    │ │  Checker    │     │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │   Agent     │ │    Team     │ │   Tools     │ │   Skills    │     │  │
│  │  │ Framework   │ │ Orchestrator│ │   Registry  │ │  Registry   │     │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │   Memory    │ │  Embedding  │ │   Vector    │ │   Stream    │     │  │
│  │  │   Store     │ │   Service   │ │    Store    │ │   Handler   │     │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────┼─────────────────────────────────────────┐
│                       Layer 1: Infrastructure (基础设施层)                   │
│                                    │                                         │
│  ┌─────────────────────────────────┴─────────────────────────────────────┐  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │  LiteLLM    │ │  Tavily     │ │ PostgreSQL  │ │   Redis     │     │  │
│  │  │  (多模型)   │ │  (搜索)     │ │  (持久化)   │ │  (缓存)     │     │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │  MongoDB    │ │   Neo4j     │ │ EventEmitter│ │   Prisma    │     │  │
│  │  │  (文档)     │ │  (知识图谱) │ │  (事件)     │ │   (ORM)     │     │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. AI Engine 核心能力清单

### 2.1 LLM 能力 (llm/)

| 能力     | 服务                   | 职责                                      |
| -------- | ---------------------- | ----------------------------------------- |
| 统一对话 | `AiChatService`        | 所有 LLM 调用的唯一入口                   |
| 模型选择 | `ModelSelectorService` | 根据 modelType + TaskProfile 选择最优模型 |
| 流式输出 | `StreamingService`     | 统一流式响应处理                          |
| 配额管理 | `QuotaService`         | Token 使用量统计与限制                    |
| 缓存管理 | `CacheService`         | LLM 响应缓存                              |

**核心 API**:

```typescript
interface LLMCapability {
  // 统一对话入口
  chat(request: ChatRequest): Promise<ChatResponse>;

  // 流式对话
  chatStream(request: ChatRequest): AsyncIterable<StreamChunk>;

  // 获取可用模型
  getAvailableModels(modelType: AIModelType): Promise<ModelInfo[]>;
}
```

### 2.2 搜索能力 (search/)

| 能力     | 服务                    | 职责            |
| -------- | ----------------------- | --------------- |
| 统一搜索 | `SearchService`         | 多源搜索聚合    |
| Web 搜索 | `TavilySearchService`   | Tavily API 集成 |
| 学术搜索 | `AcademicSearchService` | 学术论文检索    |
| 本地搜索 | `LocalSearchService`    | 知识库检索      |

**核心 API**:

```typescript
interface SearchCapability {
  // 智能搜索（自动选择最佳数据源）
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  // 指定数据源搜索
  searchWithSource(query: string, source: DataSource): Promise<SearchResult[]>;

  // 多源并行搜索
  searchParallel(
    query: string,
    sources: DataSource[],
  ): Promise<AggregatedResults>;
}
```

### 2.3 Agent 框架 (agents/)

| 能力       | 服务            | 职责                 |
| ---------- | --------------- | -------------------- |
| Agent 注册 | `AgentRegistry` | Agent 类型注册与管理 |
| Agent 执行 | `AgentExecutor` | Agent 任务执行引擎   |
| 工具调用   | `ToolRegistry`  | 工具注册与调用       |

**核心 API**:

```typescript
interface AgentCapability {
  // 创建 Agent 实例
  createAgent(type: string, config: AgentConfig): Agent;

  // 执行 Agent 任务
  executeAgent(agent: Agent, input: AgentInput): Promise<AgentOutput>;

  // 注册自定义 Agent
  registerAgent(type: string, factory: AgentFactory): void;
}
```

### 2.4 团队协作 (teams/)

| 能力     | 服务                    | 职责                   |
| -------- | ----------------------- | ---------------------- |
| 团队定义 | `TeamDefinitionService` | 团队配置管理           |
| 任务编排 | `TeamOrchestrator`      | Leader-Member 协作编排 |
| 进度追踪 | `TeamProgressService`   | 任务进度与状态管理     |

**核心 API**:

```typescript
interface TeamCapability {
  // 创建团队
  createTeam(definition: TeamDefinition): Team;

  // 启动团队任务
  startMission(team: Team, mission: MissionInput): Promise<string>;

  // 监听进度
  onProgress(missionId: string, callback: ProgressCallback): Unsubscribe;

  // 取消任务
  cancelMission(missionId: string): Promise<void>;
}
```

### 2.5 上下文管理 (context/)

| 能力       | 服务                  | 职责           |
| ---------- | --------------------- | -------------- |
| 上下文构建 | `ContextBuilder`      | 统一上下文组装 |
| 上下文压缩 | `ContextCompressor`   | Token 优化压缩 |
| 历史管理   | `ConversationHistory` | 对话历史管理   |

**核心 API**:

```typescript
interface ContextCapability {
  // 构建上下文
  buildContext(sources: ContextSource[]): Promise<string>;

  // 压缩上下文
  compressContext(context: string, maxTokens: number): Promise<string>;

  // 获取对话历史
  getHistory(sessionId: string, limit?: number): Promise<Message[]>;
}
```

### 2.6 约束检查 (constraint/)

| 能力       | 服务                     | 职责             |
| ---------- | ------------------------ | ---------------- |
| Token 检查 | `TokenConstraintChecker` | Token 限制检查   |
| 内容过滤   | `ContentFilterService`   | 敏感内容过滤     |
| 输出验证   | `OutputValidator`        | JSON Schema 验证 |

**核心 API**:

```typescript
interface ConstraintCapability {
  // 检查 Token 限制
  checkTokenLimit(content: string, limit: number): TokenCheckResult;

  // 验证输出格式
  validateOutput(output: string, schema: JSONSchema): ValidationResult;

  // 过滤敏感内容
  filterContent(content: string): FilteredContent;
}
```

### 2.7 记忆系统 (memory/)

| 能力     | 服务              | 职责         |
| -------- | ----------------- | ------------ |
| 短期记忆 | `ShortTermMemory` | 会话级记忆   |
| 长期记忆 | `LongTermMemory`  | 持久化记忆   |
| 记忆检索 | `MemoryRetriever` | 相关记忆检索 |

**核心 API**:

```typescript
interface MemoryCapability {
  // 存储记忆
  store(key: string, content: string, metadata?: object): Promise<void>;

  // 检索相关记忆
  retrieve(query: string, topK?: number): Promise<Memory[]>;

  // 清除记忆
  clear(sessionId: string): Promise<void>;
}
```

---

## 3. 统一 API 设计 (AIEngineFacade)

### 3.1 Facade 接口定义

```typescript
// backend/src/modules/ai-engine/ai-engine.facade.ts

import { Injectable } from "@nestjs/common";
import { AIModelType } from "@prisma/client";

/**
 * AI Engine 统一入口
 *
 * 所有 AI Apps 通过此 Facade 消费 AI 能力，禁止直接依赖内部服务
 */
@Injectable()
export class AIEngineFacade {
  // ==================== LLM 能力 ====================

  /**
   * 统一对话入口
   */
  async chat(request: {
    messages: ChatMessage[];
    modelType: AIModelType;
    taskProfile: TaskProfile;
    stream?: boolean;
  }): Promise<ChatResponse> {}

  /**
   * 流式对话
   */
  chatStream(request: ChatRequest): AsyncIterable<StreamChunk> {}

  // ==================== 搜索能力 ====================

  /**
   * 智能搜索
   */
  async search(request: {
    query: string;
    sources?: DataSource[];
    maxResults?: number;
  }): Promise<SearchResult[]> {}

  // ==================== Agent 能力 ====================

  /**
   * 执行单个 Agent 任务
   */
  async executeAgent(request: {
    agentType: string;
    input: AgentInput;
    tools?: string[];
  }): Promise<AgentOutput> {}

  // ==================== 团队协作能力 ====================

  /**
   * 创建并启动团队任务
   */
  async startTeamMission(request: {
    teamType: string; // 'research' | 'debate' | 'review' | 'custom'
    teamConfig?: TeamConfig;
    missionInput: MissionInput;
    progressCallback?: ProgressCallback;
  }): Promise<MissionResult> {}

  /**
   * 取消团队任务
   */
  async cancelMission(missionId: string): Promise<void> {}

  /**
   * 重试团队任务
   */
  async retryMission(missionId: string): Promise<MissionResult> {}

  // ==================== 上下文能力 ====================

  /**
   * 构建上下文
   */
  async buildContext(request: {
    sources: ContextSource[];
    maxTokens?: number;
    compress?: boolean;
  }): Promise<string> {}

  // ==================== 约束检查能力 ====================

  /**
   * 检查并调整内容
   */
  async checkConstraints(request: {
    content: string;
    constraints: Constraint[];
  }): Promise<ConstraintResult> {}

  // ==================== 记忆能力 ====================

  /**
   * 存储记忆
   */
  async storeMemory(request: {
    sessionId: string;
    content: string;
    type: "short" | "long";
    metadata?: object;
  }): Promise<void> {}

  /**
   * 检索记忆
   */
  async retrieveMemory(request: {
    sessionId: string;
    query?: string;
    topK?: number;
  }): Promise<Memory[]> {}
}
```

### 3.2 类型定义

```typescript
// backend/src/modules/ai-engine/types/facade.types.ts

/**
 * 任务画像 - 语义化配置
 */
export interface TaskProfile {
  /** 创造性: deterministic | low | medium | high */
  creativity: "deterministic" | "low" | "medium" | "high";

  /** 输出长度: minimal | short | medium | standard | long | extended */
  outputLength:
    | "minimal"
    | "short"
    | "medium"
    | "standard"
    | "long"
    | "extended";

  /** 可选：响应格式 */
  responseFormat?: "text" | "json" | "markdown";
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 搜索选项
 */
export interface SearchOptions {
  sources?: DataSource[];
  maxResults?: number;
  timeRange?: "day" | "week" | "month" | "year" | "all";
  language?: string;
}

/**
 * 数据源类型
 */
export type DataSource = "web" | "academic" | "news" | "local" | "github";

/**
 * 团队配置
 */
export interface TeamConfig {
  leader?: AgentConfig;
  members?: AgentConfig[];
  collaborationMode?: "sequential" | "parallel" | "debate";
}

/**
 * 进度回调
 */
export type ProgressCallback = (progress: {
  phase: string;
  progress: number;
  message: string;
  data?: any;
}) => void;

/**
 * 约束类型
 */
export interface Constraint {
  type: "token_limit" | "content_filter" | "json_schema";
  config: object;
}
```

### 3.3 使用示例

```typescript
// AI App 使用 AIEngineFacade 的示例

@Injectable()
export class TopicResearchService {
  constructor(
    private readonly aiEngine: AIEngineFacade, // ★ 只依赖 Facade
    private readonly prisma: PrismaService,
  ) {}

  async startResearch(topicId: string, userInput: string) {
    // 1. 启动研究团队任务
    const result = await this.aiEngine.startTeamMission({
      teamType: "research",
      missionInput: {
        topic: await this.getTopic(topicId),
        userInstructions: userInput,
      },
      progressCallback: (progress) => {
        // 保存进度到数据库
        this.saveProgress(topicId, progress);
        // 发送 SSE 事件
        this.emitProgress(topicId, progress);
      },
    });

    return result;
  }

  async askQuestion(topicId: string, question: string) {
    // 2. 简单对话 - 直接使用 chat
    const context = await this.aiEngine.buildContext({
      sources: [
        { type: "topic", id: topicId },
        { type: "memory", sessionId: topicId },
      ],
      maxTokens: 4000,
    });

    const response = await this.aiEngine.chat({
      messages: [
        { role: "system", content: context },
        { role: "user", content: question },
      ],
      modelType: AIModelType.CHAT,
      taskProfile: {
        creativity: "medium",
        outputLength: "medium",
      },
    });

    return response.content;
  }
}
```

---

## 4. 当前状态 vs 目标状态差距分析

### 4.1 架构层面差距

| 差距项   | 当前状态                               | 目标状态                           | 优先级 |
| -------- | -------------------------------------- | ---------------------------------- | ------ |
| 统一入口 | 无 Facade，各 App 直接依赖内部服务     | AIEngineFacade 作为唯一入口        | **P0** |
| 模型选择 | 硬编码模型名 (48+ 处)                  | modelType + TaskProfile 语义化配置 | **P0** |
| 参数配置 | 硬编码 temperature/maxTokens (100+ 处) | TaskProfile 自动映射               | **P0** |
| 依赖注入 | @Optional() 导致运行时不确定 (38+ 处)  | 强依赖，编译时检查                 | **P1** |
| 服务边界 | God Service 超大类 (11 个)             | 单一职责，<500 行                  | **P1** |

### 4.2 能力层面差距

| 能力       | 当前状态                         | 目标状态         | 差距                   |
| ---------- | -------------------------------- | ---------------- | ---------------------- |
| LLM        | AiChatService 存在，但未强制使用 | 唯一入口         | 48+ 处直接调用         |
| Search     | SearchService 存在               | 统一搜索入口     | 部分 App 直接调 Tavily |
| Agent      | AgentRegistry 存在但分散         | 统一注册         | 无统一执行器           |
| Team       | 各 App 自己实现团队逻辑          | TeamOrchestrator | 核心缺失               |
| Context    | 各 App 重复构建上下文            | ContextBuilder   | 重复代码               |
| Constraint | 部分实现                         | 统一约束检查     | 缺失                   |
| Memory     | 无                               | 记忆系统         | 完全缺失               |

### 4.3 代码质量差距

| 问题                  | 数量 | 示例文件                      |
| --------------------- | ---- | ----------------------------- |
| God Service (>1000行) | 11   | `writing.service.ts` (7948行) |
| 硬编码模型            | 48+  | `model: "gpt-4o"`             |
| 硬编码参数            | 100+ | `temperature: 0.7`            |
| @Optional() 依赖      | 38+  | 多个 service                  |
| 重复上下文构建        | 15+  | 各 App 重复实现               |

---

## 5. 迁移路线图

### Phase 1: 建立统一入口 (Week 1-2)

```
目标：创建 AIEngineFacade，不破坏现有功能

1. 创建 AIEngineFacade 类
2. 实现 chat() 方法，包装 AiChatService
3. 实现 search() 方法，包装 SearchService
4. 添加 TaskProfile → 参数映射逻辑
5. 单元测试覆盖
```

### Phase 2: 迁移 LLM 调用 (Week 3-4)

```
目标：所有 LLM 调用走 AIEngineFacade.chat()

1. 识别所有直接 LLM 调用 (48+ 处)
2. 按 App 分批迁移：
   - AI Writing (优先，问题最多)
   - AI Teams
   - AI Office
   - Topic Research
   - 其他
3. 移除硬编码模型名和参数
4. 验证功能不受影响
```

### Phase 3: 迁移搜索能力 (Week 5)

```
目标：所有搜索调用走 AIEngineFacade.search()

1. 识别所有直接搜索调用
2. 统一迁移到 Facade
3. 添加数据源智能选择逻辑
```

### Phase 4: 实现团队协作能力 (Week 6-8)

```
目标：提取通用团队协作机制

1. 分析各 App 的团队协作模式
2. 抽取共性到 TeamOrchestrator
3. 实现 Leader-Member 协作框架
4. 迁移 Topic Research 使用新框架
5. 迁移其他 App
```

### Phase 5: 拆分 God Service (Week 9-10)

```
目标：每个 Service < 500 行

1. writing.service.ts (7948行) → 拆分为 8+ 个服务
2. ai-teams.service.ts (5991行) → 拆分为 6+ 个服务
3. 其他 God Service
```

### Phase 6: 移除 @Optional() (Week 11)

```
目标：所有依赖编译时确定

1. 识别所有 @Optional() 使用
2. 重构为强依赖或条件模块
3. 添加编译时检查
```

---

## 6. 验收标准

### 6.1 架构验收

- [ ] AIEngineFacade 是所有 AI 能力的唯一入口
- [ ] 无直接 LLM 调用 (grep 验证)
- [ ] 无硬编码模型名 (grep 验证)
- [ ] 无硬编码 temperature/maxTokens (grep 验证)
- [ ] 无 @Optional() AI 依赖 (grep 验证)

### 6.2 代码质量验收

- [ ] 所有 Service < 500 行
- [ ] 测试覆盖率 > 80%
- [ ] TypeScript strict 模式通过
- [ ] 无 any 类型

### 6.3 功能验收

- [ ] 所有现有功能正常工作
- [ ] 性能不下降 (响应时间对比)
- [ ] 错误率不上升 (监控对比)

---

## 7. 附录：grep 验证命令

```bash
# 检查直接模型调用
grep -r "model:\s*['\"]" backend/src/modules/ai-app --include="*.ts" | grep -v "modelType"

# 检查硬编码 temperature
grep -r "temperature:\s*[0-9]" backend/src/modules/ai-app --include="*.ts"

# 检查硬编码 maxTokens
grep -r "maxTokens:\s*[0-9]" backend/src/modules/ai-app --include="*.ts"

# 检查 @Optional() 依赖
grep -r "@Optional()" backend/src/modules/ai --include="*.ts"

# 检查 God Service
find backend/src/modules -name "*.service.ts" -exec wc -l {} \; | sort -rn | head -20
```

---

**文档版本**: 1.0
**创建日期**: 2025-01-12
**作者**: Claude Code
