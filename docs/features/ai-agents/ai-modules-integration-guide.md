# AI 模块整合指南

**技术实施文档**

---

## 文档信息

| 属性     | 内容                                                     |
| -------- | -------------------------------------------------------- |
| 版本     | v1.0                                                     |
| 作者     | Architecture Team                                        |
| 创建日期 | 2025-12-19                                               |
| 状态     | 已发布                                                   |
| 前置文档 | [AI-Agents 能力概览](./ai-agents-capability-overview.md) |

---

## 目录

1. [概述](#1-概述)
2. [模块现状分析](#2-模块现状分析)
3. [整合优先级矩阵](#3-整合优先级矩阵)
4. [ai-ask 模块整合方案](#4-ai-ask-模块整合方案)
5. [ai-teams 模块整合方案](#5-ai-teams-模块整合方案)
6. [ai-office 模块整合方案](#6-ai-office-模块整合方案)
7. [ai-studio 模块整合方案](#7-ai-studio-模块整合方案)
8. [ai-simulation 模块整合方案](#8-ai-simulation-模块整合方案)
9. [ai-image 模块整合方案](#9-ai-image-模块整合方案)
10. [整合路线图](#10-整合路线图)
11. [通用整合模式](#11-通用整合模式)

---

## 1. 概述

### 1.1 目标

本文档旨在指导 DeepDive Engine 中各 AI 模块如何充分利用 `ai-agents` 模块提供的核心能力，实现：

- **统一的 Agent 抽象**：所有 AI 功能通过 Agent 框架统一管理
- **复用工具系统**：共享 48 种工具能力，避免重复实现
- **标准化执行流程**：统一的任务管理、流式事件、错误处理
- **可观测性增强**：统一的指标收集和监控

### 1.2 AI 模块总览

```
backend/src/modules/ai/
├── ai-agents/      # 核心基础设施（本文档的能力提供方）
├── ai-ask/         # 对话式问答
├── ai-core/        # AI 核心能力层（LLM 适配）
├── ai-image/       # 图像生成和处理
├── ai-office/      # 办公文档生成（PPT/DOCX）
├── ai-simulation/  # AI 推演和模拟
├── ai-studio/      # 研究工作室
└── ai-teams/       # 多 Agent 协作团队
```

### 1.3 整合收益

| 收益类别     | 具体收益                         |
| ------------ | -------------------------------- |
| **代码复用** | 减少 50%+ 重复代码，统一工具实现 |
| **能力增强** | 所有模块获得 48 种工具能力       |
| **可维护性** | 统一的错误处理、重试、监控       |
| **扩展性**   | 新增工具自动对所有模块可用       |
| **用户体验** | 统一的流式事件、进度报告         |

---

## 2. 模块现状分析

### 2.1 各模块 AI 能力处理方式

| 模块              | 当前方式             | 工具能力 | Agent 能力 | 记忆能力   |
| ----------------- | -------------------- | -------- | ---------- | ---------- |
| **ai-ask**        | 直接 LLM 调用        | 无       | 无         | 简单上下文 |
| **ai-teams**      | AI 成员直接 LLM 调用 | 无       | 无         | 消息历史   |
| **ai-office**     | 多服务流水线         | 部分     | 部分       | 无         |
| **ai-studio**     | 松散服务组合         | 无       | 无         | 项目级     |
| **ai-simulation** | 自定义推演引擎       | 无       | 自定义     | 推演上下文 |
| **ai-image**      | 成熟流式管道         | 专用     | 无         | 无         |

### 2.2 整合前后对比

```
整合前:
┌─────────────┐     ┌─────────────┐
│   ai-ask    │     │  ai-teams   │
│  ┌───────┐  │     │  ┌───────┐  │
│  │  LLM  │  │     │  │  LLM  │  │
│  └───────┘  │     │  └───────┘  │
└─────────────┘     └─────────────┘
      ↓                    ↓
  独立调用              独立调用
  无工具能力            无工具能力

整合后:
┌─────────────┐     ┌─────────────┐
│   ai-ask    │     │  ai-teams   │
│  ┌───────┐  │     │  ┌───────┐  │
│  │ Agent │  │     │  │ Agent │  │
│  └───┬───┘  │     │  └───┬───┘  │
└──────┼──────┘     └──────┼──────┘
       │                   │
       └───────┬───────────┘
               ↓
    ┌─────────────────────┐
    │     ai-agents       │
    │  ┌─────┐ ┌───────┐  │
    │  │Tools│ │ Memory│  │
    │  └─────┘ └───────┘  │
    │  ┌─────┐ ┌───────┐  │
    │  │ LLM │ │Guardrails│
    │  └─────┘ └───────┘  │
    └─────────────────────┘
```

---

## 3. 整合优先级矩阵

### 3.1 优先级评估维度

| 维度         | 权重 | 说明                        |
| ------------ | ---- | --------------------------- |
| **用户价值** | 40%  | 对终端用户体验的提升程度    |
| **技术难度** | 30%  | 实施复杂度和风险            |
| **复用程度** | 20%  | 可复用 ai-agents 能力的比例 |
| **依赖关系** | 10%  | 与其他模块的依赖和影响      |

### 3.2 优先级排序

| 优先级 | 模块          | 评分 | 理由                              |
| ------ | ------------- | ---- | --------------------------------- |
| **P0** | ai-ask        | 92   | 高频使用、工具需求强、整合难度低  |
| **P0** | ai-teams      | 88   | AI 成员急需工具能力、协作场景明确 |
| **P1** | ai-office     | 75   | 已有编排器、主要是标准化改造      |
| **P2** | ai-studio     | 68   | 需求明确但使用频率中等            |
| **P2** | ai-simulation | 65   | 专业场景、改造收益高但复杂度也高  |
| **P3** | ai-image      | 45   | 已成熟、主要是工具化封装          |

---

## 4. ai-ask 模块整合方案

### 4.1 现状分析

**当前架构**：

```typescript
// ai-ask.service.ts
async sendMessage(sessionId: string, message: string) {
  const context = await this.buildContext(sessionId);
  const response = await this.aiChatService.generateChatCompletionWithKey({
    messages: [...context, { role: 'user', content: message }],
    model: this.getModel(),
  });
  return response;
}
```

**问题**：

- 无法调用工具（搜索、计算、代码执行）
- 无法处理复杂多步骤问题
- 上下文管理简单，缺乏语义记忆

### 4.2 目标架构

```typescript
// ai-ask.service.ts (整合后)
async sendMessageWithTools(sessionId: string, message: string) {
  // 使用 AgentOrchestrator 执行
  const events = this.orchestrator.executeAutonomous(
    this.llmAdapter,
    {
      prompt: message,
      context: await this.buildContext(sessionId),
      availableTools: this.getSessionTools(sessionId),
    }
  );

  for await (const event of events) {
    // 流式返回事件
    await this.publishEvent(sessionId, event);
    yield event;
  }
}
```

### 4.3 实施步骤

#### 步骤 1: 引入依赖

```typescript
// ai-ask.module.ts
import { AiAgentsModule } from "../ai-agents/ai-agents.module";

@Module({
  imports: [
    AiAgentsModule, // 新增
    // ...existing imports
  ],
})
export class AiAskModule {}
```

#### 步骤 2: 注入服务

```typescript
// ai-ask.service.ts
import { AgentOrchestrator } from "../ai-agents/core/execution/agent.orchestrator";
import { ToolRegistry } from "../ai-agents/core/tool/tool.registry";
import { ShortTermMemory } from "../ai-agents/core/memory/short-term.memory";

@Injectable()
export class AiAskService {
  constructor(
    private readonly orchestrator: AgentOrchestrator,
    private readonly toolRegistry: ToolRegistry,
    private readonly shortTermMemory: ShortTermMemory,
    // ...existing dependencies
  ) {}
}
```

#### 步骤 3: 实现工具调用模式

```typescript
// ai-ask.service.ts

// 会话级工具配置
private readonly defaultTools: ToolType[] = [
  ToolType.WEB_SEARCH,
  ToolType.RAG_SEARCH,
  ToolType.PYTHON_EXECUTOR,
  ToolType.DATA_ANALYSIS,
];

async sendMessageWithTools(
  sessionId: string,
  message: string,
  options?: { enableTools?: boolean; tools?: ToolType[] }
): Promise<AsyncGenerator<AskEvent>> {
  const tools = options?.enableTools !== false
    ? (options?.tools ?? this.defaultTools)
    : [];

  // 构建上下文
  const context = await this.buildEnhancedContext(sessionId);

  // 使用 Autonomous 模式执行
  const events = this.orchestrator.executeAutonomous(
    this.llmAdapter,
    {
      prompt: message,
      context,
      availableTools: tools,
    }
  );

  // 转换并持久化事件
  for await (const event of events) {
    const askEvent = this.convertToAskEvent(event);
    await this.saveMessage(sessionId, askEvent);
    yield askEvent;
  }
}

private async buildEnhancedContext(sessionId: string): Promise<Context> {
  // 1. 获取消息历史
  const messages = await this.getSessionMessages(sessionId);

  // 2. 从短期记忆获取会话变量
  const sessionVars = await this.shortTermMemory.get(`session:${sessionId}:vars`);

  // 3. 构建增强上下文
  return {
    messages: this.truncateToLimit(messages, 100_000),
    variables: sessionVars,
    systemPrompt: this.buildSystemPrompt(sessionVars),
  };
}
```

#### 步骤 4: 支持流式工具调用事件

```typescript
// ai-ask.controller.ts

@Sse('sessions/:sessionId/chat-stream')
async chatStream(
  @Param('sessionId') sessionId: string,
  @Body() body: SendMessageDto,
): Promise<Observable<MessageEvent>> {
  return new Observable(subscriber => {
    (async () => {
      const events = this.aiAskService.sendMessageWithTools(
        sessionId,
        body.message,
        { enableTools: body.enableTools, tools: body.tools }
      );

      for await (const event of events) {
        subscriber.next({
          type: event.type,
          data: JSON.stringify(event),
        });
      }

      subscriber.complete();
    })();
  });
}
```

### 4.4 新增 API

| 端点                                | 变更         | 说明                   |
| ----------------------------------- | ------------ | ---------------------- |
| `POST /ask/sessions/:id/chat`       | 新增参数     | enableTools, tools     |
| `SSE /ask/sessions/:id/chat-stream` | 新增事件类型 | tool_call, tool_result |

### 4.5 收益

| 指标         | 整合前   | 整合后               |
| ------------ | -------- | -------------------- |
| **工具能力** | 0 种     | 48 种可选            |
| **复杂问题** | 无法处理 | 多步骤自动分解       |
| **实时搜索** | 不支持   | WEB_SEARCH 工具      |
| **代码执行** | 不支持   | PYTHON_EXECUTOR 工具 |
| **数据分析** | 不支持   | DATA_ANALYSIS 工具   |

---

## 5. ai-teams 模块整合方案

### 5.1 现状分析

**当前架构**：

```typescript
// AI 成员定义
interface AIMember {
  id: string;
  name: string;
  avatar: string;
  role: string;
  systemPrompt: string;
  model: string;
}

// AI 响应生成
async generateAIResponse(member: AIMember, context: MessageContext) {
  return this.aiChatService.generateChatCompletion({
    messages: this.buildPrompt(member.systemPrompt, context),
    model: member.model,
  });
}
```

**问题**：

- AI 成员无工具能力
- 角色定义简单，缺乏专业能力
- 成员间无法协作委派任务

### 5.2 目标架构

```typescript
// AI 成员升级为 Agent
class TeamMemberAgent extends BaseAgent {
  type: AgentType;
  config: AgentConfig;

  constructor(member: AIMember, toolRegistry: ToolRegistry) {
    super();
    this.type = this.resolveAgentType(member.role);
    this.config = this.buildAgentConfig(member);
  }

  // 根据角色分配工具
  getRequiredTools(): ToolType[] {
    return this.roleToolMapping[this.member.role] ?? [];
  }
}
```

### 5.3 实施步骤

#### 步骤 1: 创建 TeamMemberAgent

```typescript
// team-member.agent.ts
import { BaseAgent } from "../ai-agents/core/agent/base.agent";
import {
  AgentType,
  AgentConfig,
  ToolType,
} from "../ai-agents/core/agent/agent.types";

export class TeamMemberAgent extends BaseAgent {
  // 角色到工具的映射
  private static readonly roleToolMapping: Record<string, ToolType[]> = {
    researcher: [
      ToolType.WEB_SEARCH,
      ToolType.RAG_SEARCH,
      ToolType.KNOWLEDGE_GRAPH,
    ],
    analyst: [
      ToolType.DATA_ANALYSIS,
      ToolType.PYTHON_EXECUTOR,
      ToolType.DATA_FETCH,
    ],
    writer: [
      ToolType.TEXT_GENERATION,
      ToolType.EXPORT_DOCX,
      ToolType.TEMPLATE_RENDER,
    ],
    developer: [
      ToolType.CODE_GENERATION,
      ToolType.PYTHON_EXECUTOR,
      ToolType.JAVASCRIPT_EXECUTOR,
    ],
    designer: [ToolType.IMAGE_GENERATION, ToolType.EXPORT_IMAGE],
    moderator: [
      ToolType.TEXT_GENERATION,
      ToolType.AGENT_HANDOFF,
      ToolType.CONSENSUS_MECHANISM,
    ],
  };

  constructor(
    private readonly member: AIMember,
    private readonly toolRegistry: ToolRegistry,
  ) {
    super();
    this.type = AgentType.TEAM_MEMBER;
    this.config = this.buildConfig();
  }

  private buildConfig(): AgentConfig {
    return {
      name: this.member.name,
      description: `${this.member.role} - ${this.member.name}`,
      systemPrompt: this.member.systemPrompt,
      capabilities: this.resolveCapabilities(this.member.role),
      requiredTools: TeamMemberAgent.roleToolMapping[this.member.role] ?? [],
      supportedModels: [this.member.model],
      maxSteps: 10,
      timeout: 120000,
    };
  }

  async plan(input: AgentInput): Promise<AgentPlan> {
    // 根据角色生成计划
    return this.generatePlan(input);
  }

  async *execute(plan: AgentPlan): AsyncGenerator<AgentEvent> {
    // 使用 FunctionCallingExecutor 执行
    const executor = new FunctionCallingExecutor(
      this.llmAdapter,
      this.toolRegistry,
      { maxIterations: plan.steps.length },
    );

    for await (const event of executor.run(plan)) {
      yield event;
    }
  }
}
```

#### 步骤 2: 改造 AI 响应服务

```typescript
// ai-response.service.ts
import { AgentOrchestrator } from "../ai-agents/core/execution/agent.orchestrator";
import { TeamMemberAgent } from "./team-member.agent";

@Injectable()
export class AIResponseService {
  // 成员 Agent 缓存
  private memberAgents = new Map<string, TeamMemberAgent>();

  constructor(
    private readonly orchestrator: AgentOrchestrator,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  async generateAIResponse(
    member: AIMember,
    context: MessageContext,
    options?: { useTools?: boolean },
  ): Promise<AsyncGenerator<TeamMessageEvent>> {
    // 获取或创建成员 Agent
    const agent = this.getOrCreateAgent(member);

    // 使用 Orchestrator 执行
    const events = this.orchestrator.execute(
      {
        prompt: context.latestMessage,
        context: this.buildAgentContext(context),
      },
      agent.type,
    );

    // 转换为团队消息事件
    for await (const event of events) {
      yield this.convertToTeamEvent(event, member);
    }
  }

  private getOrCreateAgent(member: AIMember): TeamMemberAgent {
    if (!this.memberAgents.has(member.id)) {
      this.memberAgents.set(
        member.id,
        new TeamMemberAgent(member, this.toolRegistry),
      );
    }
    return this.memberAgents.get(member.id)!;
  }
}
```

#### 步骤 3: 支持成员间协作

```typescript
// topic-collaboration.service.ts

@Injectable()
export class TopicCollaborationService {
  constructor(private readonly toolRegistry: ToolRegistry) {}

  // 任务委派给其他成员
  async delegateTask(
    fromMember: AIMember,
    toMember: AIMember,
    task: string,
    context: MessageContext,
  ): Promise<DelegationResult> {
    const handoffTool = this.toolRegistry.get(ToolType.AGENT_HANDOFF);

    return handoffTool.execute({
      targetAgent: toMember.id,
      task,
      context: {
        topicId: context.topicId,
        previousMessages: context.messages.slice(-10),
      },
    });
  }

  // 多成员投票决策
  async collectVotes(
    members: AIMember[],
    proposal: string,
    context: MessageContext,
  ): Promise<ConsensusResult> {
    const consensusTool = this.toolRegistry.get(ToolType.CONSENSUS_MECHANISM);

    return consensusTool.execute({
      proposal,
      voters: members.map((m) => m.id),
      rules: {
        quorum: 0.5,
        threshold: 0.6,
        timeout: 60000,
      },
    });
  }
}
```

### 5.4 数据模型扩展

```typescript
// 扩展 AIMember 模型
interface AIMember {
  id: string;
  name: string;
  avatar: string;
  role: string;
  systemPrompt: string;
  model: string;

  // 新增字段
  capabilities?: string[]; // 能力列表
  tools?: ToolType[]; // 可用工具
  agentConfig?: Partial<AgentConfig>; // Agent 配置
}
```

### 5.5 收益

| 指标         | 整合前     | 整合后               |
| ------------ | ---------- | -------------------- |
| **工具能力** | 0 种       | 按角色分配           |
| **成员协作** | 无         | AGENT_HANDOFF 工具   |
| **决策机制** | 无         | CONSENSUS_MECHANISM  |
| **专业能力** | 仅文本回复 | 搜索、分析、代码执行 |

---

## 6. ai-office 模块整合方案

### 6.1 现状分析

**当前架构**（PPT 3.0）：

```
PPTOrchestratorService
├── SlidePlanningService
├── SlideContentService
├── SlideImageService
└── SlideRendererService
```

**特点**：

- 已有编排器，但与 ai-agents 独立
- 工具调用内嵌在各 Service 中
- 无统一的事件流和指标

### 6.2 目标架构

```
AgentOrchestrator
├── SlidesAgent (复用 ai-agents 实现)
│   ├── TEXT_GENERATION 工具
│   ├── IMAGE_GENERATION 工具
│   └── EXPORT_PPTX 工具
└── DocsAgent (复用 ai-agents 实现)
    ├── WEB_SEARCH 工具
    ├── TEXT_GENERATION 工具
    └── EXPORT_DOCX 工具
```

### 6.3 实施步骤

#### 步骤 1: 统一入口

```typescript
// ai-office.service.ts
import { AgentOrchestrator } from "../ai-agents/core/execution/agent.orchestrator";
import { AgentType } from "../ai-agents/core/agent/agent.types";

@Injectable()
export class AiOfficeService {
  constructor(private readonly orchestrator: AgentOrchestrator) {}

  // PPT 生成统一入口
  async generatePPT(input: PPTInput): Promise<AsyncGenerator<OfficeEvent>> {
    const events = this.orchestrator.execute(
      {
        prompt: input.prompt,
        options: {
          template: input.template,
          pageCount: input.pageCount,
          style: input.style,
        },
      },
      AgentType.SLIDES,
    );

    for await (const event of events) {
      yield this.convertToOfficeEvent(event);
    }
  }

  // 文档生成统一入口
  async generateDocument(
    input: DocInput,
  ): Promise<AsyncGenerator<OfficeEvent>> {
    const events = this.orchestrator.execute(
      {
        prompt: input.prompt,
        options: {
          template: input.template,
          format: input.format,
        },
      },
      AgentType.DOCS,
    );

    for await (const event of events) {
      yield this.convertToOfficeEvent(event);
    }
  }
}
```

#### 步骤 2: 保留现有服务作为工具实现

```typescript
// 将现有服务封装为工具
// tools/export/pptx-export.tool.ts
import { SlideRendererService } from "../../ai-office/ppt/slide-renderer.service";

export class PPTXExportTool extends BaseTool<PPTXInput, PPTXOutput> {
  type = ToolType.EXPORT_PPTX;
  category = ToolCategory.EXPORT;

  constructor(private readonly renderer: SlideRendererService) {
    super();
  }

  protected async doExecute(input: PPTXInput): Promise<PPTXOutput> {
    // 复用现有渲染逻辑
    const html = await this.renderer.renderSlides(input.slides);
    const pptxBuffer = await this.renderer.exportToPPTX(html);

    return {
      buffer: pptxBuffer,
      filename: `${input.title}.pptx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
  }
}
```

### 6.4 收益

| 指标         | 整合前     | 整合后                |
| ------------ | ---------- | --------------------- |
| **编排统一** | 独立编排器 | AgentOrchestrator     |
| **事件标准** | 自定义     | AgentEvent 标准       |
| **指标收集** | 无         | ExecutionMetrics      |
| **工具复用** | 内嵌实现   | ToolRegistry 统一管理 |

---

## 7. ai-studio 模块整合方案

### 7.1 现状分析

**当前架构**：

```
AiStudioService (项目管理)
├── AiStudioChatService (对话)
├── AiStudioSourceService (资料管理)
├── AiStudioOutputService (输出管理)
└── AiStudioTtsService (语音合成)
```

**问题**：

- 缺乏 Agent 编排能力
- 服务间协作松散
- 无智能研究辅助

### 7.2 目标架构：创建 ResearcherAgent

```typescript
// researcher.agent.ts
export class ResearcherAgent extends BaseAgent {
  type = AgentType.RESEARCHER;

  capabilities = [
    "自动调研资料",
    "知识图谱构建",
    "内容摘要生成",
    "研究报告撰写",
  ];

  requiredTools = [
    ToolType.WEB_SEARCH,
    ToolType.RAG_SEARCH,
    ToolType.KNOWLEDGE_GRAPH,
    ToolType.DATA_ANALYSIS,
    ToolType.TEXT_GENERATION,
    ToolType.LONG_TERM_MEMORY,
  ];
}
```

### 7.3 实施步骤

#### 步骤 1: 创建研究助手 Agent

```typescript
// researcher.agent.ts
import { BaseAgent } from "../ai-agents/core/agent/base.agent";

export class ResearcherAgent extends BaseAgent {
  type = AgentType.RESEARCHER;

  config: AgentConfig = {
    name: "Research Assistant",
    description: "智能研究助手，帮助用户进行资料调研和知识整理",
    systemPrompt: `你是一个专业的研究助手。你的职责是：
1. 根据用户需求搜索和整理资料
2. 分析和总结关键信息
3. 构建知识关联图谱
4. 生成结构化的研究报告

在执行任务时，请：
- 优先使用 RAG_SEARCH 查询已有知识库
- 使用 WEB_SEARCH 补充最新信息
- 使用 KNOWLEDGE_GRAPH 建立知识关联
- 使用 LONG_TERM_MEMORY 保存研究成果`,
    capabilities: this.capabilities,
    requiredTools: this.requiredTools,
    supportedModels: ["gpt-4", "claude-3-opus"],
    maxSteps: 15,
    timeout: 300000,
  };

  async plan(input: AgentInput): Promise<AgentPlan> {
    // 根据研究任务生成计划
    const taskType = this.classifyTask(input.prompt);

    switch (taskType) {
      case "literature_review":
        return this.planLiteratureReview(input);
      case "data_analysis":
        return this.planDataAnalysis(input);
      case "report_generation":
        return this.planReportGeneration(input);
      default:
        return this.planGeneralResearch(input);
    }
  }
}
```

#### 步骤 2: 整合到 Studio 服务

```typescript
// ai-studio.service.ts
import { AgentOrchestrator } from "../ai-agents/core/execution/agent.orchestrator";
import { LongTermMemory } from "../ai-agents/core/memory/long-term.memory";

@Injectable()
export class AiStudioService {
  constructor(
    private readonly orchestrator: AgentOrchestrator,
    private readonly longTermMemory: LongTermMemory,
  ) {}

  // 智能研究助手
  async conductResearch(
    projectId: string,
    query: string,
    options?: ResearchOptions,
  ): Promise<AsyncGenerator<ResearchEvent>> {
    // 加载项目上下文
    const projectContext = await this.loadProjectContext(projectId);

    const events = this.orchestrator.execute(
      {
        prompt: query,
        context: projectContext,
        options: {
          saveToProject: true,
          buildKnowledgeGraph: options?.buildGraph,
        },
      },
      AgentType.RESEARCHER,
    );

    for await (const event of events) {
      // 保存研究成果到项目
      if (event.type === "artifact") {
        await this.saveToProject(projectId, event.artifact);
      }
      yield this.convertToResearchEvent(event);
    }
  }

  // 知识图谱查询
  async queryKnowledgeGraph(
    projectId: string,
    query: string,
  ): Promise<KnowledgeGraphResult> {
    const tool = this.toolRegistry.get(ToolType.KNOWLEDGE_GRAPH);
    return tool.execute({
      query,
      projectId,
      depth: 2,
    });
  }
}
```

### 7.4 收益

| 指标           | 整合前     | 整合后              |
| -------------- | ---------- | ------------------- |
| **研究辅助**   | 无         | ResearcherAgent     |
| **知识管理**   | 简单存储   | 知识图谱 + 语义搜索 |
| **自动调研**   | 手动       | WEB_SEARCH + RAG    |
| **记忆持久化** | 项目级文件 | LongTermMemory      |

---

## 8. ai-simulation 模块整合方案

### 8.1 现状分析

**当前架构**：

```
AiSimulationService (场景管理)
└── AiSimulationEngine (推演引擎)
    ├── runTurn() - 执行单轮
    ├── applyRules() - 应用规则
    └── collectActions() - 收集行动
```

### 8.2 整合方案

```typescript
// simulation-agent.ts
export class SimulationAgent extends BaseAgent {
  constructor(
    private readonly agentConfig: SimulationAgentConfig,
    private readonly scenario: SimulationScenario,
  ) {
    super();
  }

  // 使用 Agent 框架管理推演 Agent
  async plan(input: AgentInput): Promise<AgentPlan> {
    return {
      id: generateId(),
      agentType: AgentType.SIMULATION,
      objective: `在场景 "${this.scenario.name}" 中执行角色 "${this.agentConfig.role}"`,
      steps: this.generateTurnSteps(input),
    };
  }

  // 使用工具系统进行 Agent 间通信
  async *execute(plan: AgentPlan): AsyncGenerator<AgentEvent> {
    for (const step of plan.steps) {
      // 使用 AGENT_COMMUNICATION 工具与其他 Agent 通信
      if (step.requiresCommunication) {
        const commTool = this.toolRegistry.get(ToolType.AGENT_COMMUNICATION);
        const result = await commTool.execute({
          targetAgent: step.targetAgentId,
          message: step.message,
        });
        yield { type: "tool_result", result };
      }

      // 使用 TEXT_GENERATION 生成行动
      const actionTool = this.toolRegistry.get(ToolType.TEXT_GENERATION);
      const action = await actionTool.execute({
        prompt: this.buildActionPrompt(step),
      });
      yield { type: "step_complete", output: action };
    }
  }
}
```

### 8.3 收益

| 指标           | 整合前 | 整合后              |
| -------------- | ------ | ------------------- |
| **Agent 管理** | 自定义 | AgentRegistry       |
| **通信机制**   | 自定义 | AGENT_COMMUNICATION |
| **执行追踪**   | 日志   | ExecutionMetrics    |

---

## 9. ai-image 模块整合方案

### 9.1 现状分析

ai-image 模块已有成熟的流式管道，主要整合方向是将关键能力封装为工具。

### 9.2 工具化封装

```typescript
// 将 ai-image 能力封装为工具

// 1. Prompt 增强工具
export class PromptEnhancementTool extends BaseTool {
  type = ToolType.PROMPT_ENHANCEMENT;

  constructor(private readonly promptService: PromptEnhancementService) {
    super();
  }

  protected async doExecute(input: { prompt: string; style?: string }) {
    return this.promptService.enhance(input.prompt, input.style);
  }
}

// 2. 信息图表生成工具
export class InfographicTool extends BaseTool {
  type = ToolType.INFOGRAPHIC_GENERATION;

  constructor(private readonly infographicService: InfographicTemplateService) {
    super();
  }

  protected async doExecute(input: InfographicInput) {
    return this.infographicService.generate(input);
  }
}

// 3. 注册到 ToolRegistry
toolRegistry.registerMany([
  new PromptEnhancementTool(promptService),
  new InfographicTool(infographicService),
]);
```

### 9.3 收益

| 指标         | 整合前   | 整合后          |
| ------------ | -------- | --------------- |
| **能力复用** | 模块内部 | 全局可用工具    |
| **编排支持** | 独立管道 | 可被 Agent 调用 |

---

## 10. 整合路线图

### 10.1 阶段规划

```
Phase 1: 基础整合 (2-3 周)
├── Week 1: ai-ask 接入 FunctionCallingExecutor
├── Week 2: ai-teams AI成员升级为 Agent
└── Week 3: 共享 ToolRegistry 和 Memory

Phase 2: 办公整合 (2 周)
├── Week 4: 统一 PPT/DOCX 到 Agent 框架
└── Week 5: 复用 SlidesAgent/DocsAgent，标准化事件流

Phase 3: 专项整合 (2-3 周)
├── Week 6: 创建 ResearcherAgent for ai-studio
├── Week 7: 推演引擎适配 Agent 框架
└── Week 8: 统一监控和指标

Phase 4: 工具扩展 (1-2 周)
├── Week 9: ai-image 能力工具化
└── Week 10: 扩展外部集成工具
```

### 10.2 里程碑

| 里程碑 | 目标                       | 验收标准                    |
| ------ | -------------------------- | --------------------------- |
| **M1** | ai-ask + ai-teams 完成整合 | 工具调用正常，流式事件正确  |
| **M2** | ai-office 迁移完成         | PPT/DOCX 生成通过标准流程   |
| **M3** | 全模块整合完成             | 所有模块通过 ai-agents 编排 |
| **M4** | 监控体系建立               | 统一指标面板上线            |

---

## 11. 通用整合模式

### 11.1 模式 1: 直接使用 AgentOrchestrator

适用于：需要完整 Agent 能力的场景

```typescript
import { AgentOrchestrator } from "../ai-agents/core/execution/agent.orchestrator";

@Injectable()
export class YourService {
  constructor(private readonly orchestrator: AgentOrchestrator) {}

  async executeTask(input: TaskInput) {
    const events = this.orchestrator.execute(
      { prompt: input.prompt },
      AgentType.YOUR_AGENT,
    );

    for await (const event of events) {
      // 处理事件
    }
  }
}
```

### 11.2 模式 2: 使用 FunctionCallingExecutor

适用于：LLM 自主工具选择场景

```typescript
import { FunctionCallingExecutor } from "../ai-agents/core/execution/function-calling-executor";

@Injectable()
export class YourService {
  constructor(
    private readonly llmAdapter: ILLMAdapter,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  async executeWithTools(prompt: string, tools: ToolType[]) {
    const executor = new FunctionCallingExecutor(
      this.llmAdapter,
      this.toolRegistry,
      { maxIterations: 10 },
    );

    for await (const event of executor.run({ prompt, availableTools: tools })) {
      yield event;
    }
  }
}
```

### 11.3 模式 3: 直接使用工具

适用于：明确知道需要哪个工具的场景

```typescript
import { ToolRegistry } from "../ai-agents/core/tool/tool.registry";

@Injectable()
export class YourService {
  constructor(private readonly toolRegistry: ToolRegistry) {}

  async search(query: string) {
    const searchTool = this.toolRegistry.get(ToolType.WEB_SEARCH);
    return searchTool.execute({ query, maxResults: 10 });
  }
}
```

### 11.4 模式 4: 创建自定义 Agent

适用于：需要定制化 Agent 行为的场景

```typescript
import { BaseAgent } from "../ai-agents/core/agent/base.agent";

export class CustomAgent extends BaseAgent {
  type = AgentType.CUSTOM;

  config: AgentConfig = {
    name: "Custom Agent",
    requiredTools: [ToolType.X, ToolType.Y],
    // ...
  };

  async plan(input: AgentInput): Promise<AgentPlan> {
    // 自定义规划逻辑
  }

  async *execute(plan: AgentPlan): AsyncGenerator<AgentEvent> {
    // 自定义执行逻辑
  }
}

// 注册到 AgentRegistry
agentRegistry.register(new CustomAgent());
```

---

## 附录 A: 导入路径速查

```typescript
// Agent 核心
import { AgentOrchestrator } from "@/modules/ai/ai-agents/core/execution/agent.orchestrator";
import { AgentRegistry } from "@/modules/ai/ai-agents/core/agent/agent.registry";
import { BaseAgent } from "@/modules/ai/ai-agents/core/agent/base.agent";
import {
  AgentType,
  AgentConfig,
  AgentInput,
  AgentEvent,
} from "@/modules/ai/ai-agents/core/agent/agent.types";

// 工具系统
import { ToolRegistry } from "@/modules/ai/ai-agents/core/tool/tool.registry";
import { BaseTool } from "@/modules/ai/ai-agents/core/tool/base.tool";
import {
  ToolType,
  ToolCategory,
} from "@/modules/ai/ai-agents/core/tool/tool.types";

// 执行引擎
import { FunctionCallingExecutor } from "@/modules/ai/ai-agents/core/execution/function-calling-executor";
import { RetryStrategy } from "@/modules/ai/ai-agents/core/execution/retry-strategy";
import { ExecutionMetricsCollector } from "@/modules/ai/ai-agents/core/execution/execution-metrics";

// 记忆系统
import { ShortTermMemory } from "@/modules/ai/ai-agents/core/memory/short-term.memory";
import { LongTermMemory } from "@/modules/ai/ai-agents/core/memory/long-term.memory";

// 安全护栏
import { GuardrailService } from "@/modules/ai/ai-agents/core/guardrails/guardrail.service";

// 验证
import { SchemaValidator } from "@/modules/ai/ai-agents/core/validation/schema-validator";

// 错误
import { ToolError, AgentError } from "@/modules/ai/ai-agents/core/errors";
```

---

## 附录 B: 检查清单

### 整合前检查

- [ ] 确认模块已导入 `AiAgentsModule`
- [ ] 确认需要的工具已在 `ToolRegistry` 注册
- [ ] 确认 LLM 适配器配置正确

### 整合后验证

- [ ] 工具调用正常执行
- [ ] 流式事件正确推送
- [ ] 错误被正确捕获和处理
- [ ] 指标被正确收集
- [ ] 安全护栏生效

---

## 版本历史

| 版本 | 日期       | 作者              | 变更说明     |
| ---- | ---------- | ----------------- | ------------ |
| v1.0 | 2025-12-19 | Architecture Team | 初始版本发布 |
