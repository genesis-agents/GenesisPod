# AI Teams Multi-Agent System Design

## 系统架构设计文档

**版本**: v1.0
**创建日期**: 2025-12-17
**状态**: 已实现

---

## 一、系统概述

AI Teams 是一个多智能体协作系统，支持多个 AI Agent 在一个 Topic（话题）中进行协作、辩论和任务执行。系统采用 Leader-Member 架构，支持任务分解、并行执行、审核反馈等复杂协作模式。

### 1.1 核心能力

| 能力           | 描述                                             |
| -------------- | ------------------------------------------------ |
| **多 AI 协作** | 支持在同一话题中添加多个不同模型的 AI 成员       |
| **@提及系统**  | 支持 @单个AI、@All AIs、@Everyone 等多种提及方式 |
| **辩论模式**   | 独立的辩论会话，AI 之间自动轮流发言              |
| **团队任务**   | Leader 规划任务，成员并行执行，Leader 审核       |
| **实时通信**   | WebSocket 实时消息推送和状态同步                 |
| **智能上下文** | 根据场景自动选择最相关的历史消息                 |

### 1.2 技术栈

- **后端**: NestJS + Prisma + PostgreSQL + Socket.io
- **前端**: Next.js 13+ + TypeScript + Socket.io-client
- **AI 调用**: 支持 OpenAI、Claude、Gemini、Grok 等多模型

---

## 二、系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Topic Page │  │ Canvas View │  │   Mission Progress     │  │
│  │  (Chat UI)  │  │(Team Graph) │  │      Panel             │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          │                                       │
│  ┌───────────────────────┴───────────────────────────────────┐  │
│  │              AI Teams Store (Zustand)                      │  │
│  │  - Topics, Messages, Missions, AI Members                  │  │
│  └───────────────────────┬───────────────────────────────────┘  │
│                          │                                       │
│  ┌───────────────────────┴───────────────────────────────────┐  │
│  │              API Client + WebSocket Client                 │  │
│  └───────────────────────┬───────────────────────────────────┘  │
└──────────────────────────┼───────────────────────────────────────┘
                           │
          ─────────────────┼─────────────────
                    HTTP / WebSocket
          ─────────────────┼─────────────────
                           │
┌──────────────────────────┼───────────────────────────────────────┐
│                    Backend (NestJS)                              │
├──────────────────────────┴───────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                   AiTeamsController                          │ │
│  │  REST API: Topics, Members, Messages, Missions               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│  ┌───────────────────────────┴────────────────────────────────┐  │
│  │                    Core Services                            │  │
│  │  ┌──────────────────┐  ┌──────────────────┐                │  │
│  │  │ AiTeamsService   │  │ TeamMissionSvc   │                │  │
│  │  │ - Topic CRUD     │  │ - Mission Exec   │                │  │
│  │  │ - Message Mgmt   │  │ - Task Assign    │                │  │
│  │  │ - AI Response    │  │ - Leader Review  │                │  │
│  │  └──────────────────┘  └──────────────────┘                │  │
│  │  ┌──────────────────┐  ┌──────────────────┐                │  │
│  │  │ DebateService    │  │ AiResponseSvc    │                │  │
│  │  │ - Session Mgmt   │  │ - Smart Context  │                │  │
│  │  │ - Turn Control   │  │ - Response Gen   │                │  │
│  │  └──────────────────┘  └──────────────────┘                │  │
│  │  ┌──────────────────┐  ┌──────────────────┐                │  │
│  │  │ ContextRouterSvc │  │ UrlParserSvc     │                │  │
│  │  │ - Intent Detect  │  │ - URL Extract    │                │  │
│  │  │ - Strategy Route │  │ - Link Preview   │                │  │
│  │  └──────────────────┘  └──────────────────┘                │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│  ┌───────────────────────────┴────────────────────────────────┐  │
│  │                AiTeamsGateway (WebSocket)                   │  │
│  │  - Real-time message broadcasting                           │  │
│  │  - AI typing indicators                                     │  │
│  │  - Mission status updates                                   │  │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│  ┌───────────────────────────┴────────────────────────────────┐  │
│  │                    Prisma ORM                               │  │
│  │  PostgreSQL: Topics, Messages, Missions, Tasks              │  │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 核心模块

| 模块                 | 文件                        | 职责                    |
| -------------------- | --------------------------- | ----------------------- |
| **Controller**       | `ai-teams.controller.ts`    | REST API 路由，请求验证 |
| **Main Service**     | `ai-teams.service.ts`       | Topic/消息/资源管理     |
| **Mission Service**  | `team-mission.service.ts`   | 任务生命周期管理        |
| **Response Service** | `ai-response.service.ts`    | 智能上下文构建          |
| **Debate Service**   | `debate.service.ts`         | 辩论会话管理            |
| **Context Router**   | `context-router.service.ts` | 意图识别与路由          |
| **URL Parser**       | `url-parser.service.ts`     | URL 解析与预览          |
| **Gateway**          | `ai-teams.gateway.ts`       | WebSocket 实时通信      |

---

## 三、数据模型

### 3.1 核心实体关系

```
┌─────────────┐      1:N      ┌─────────────────┐
│   Topic     │───────────────│  TopicMember    │
│             │               │  (Human Users)  │
└─────────────┘               └─────────────────┘
      │
      │ 1:N
      ▼
┌─────────────────┐      1:N      ┌─────────────────┐
│  TopicAIMember  │───────────────│  TopicMessage   │
│  (AI Agents)    │               │                 │
└─────────────────┘               └─────────────────┘
      │                                  │
      │ 1:1 (Leader)                     │ 1:N
      ▼                                  ▼
┌─────────────────┐      1:N      ┌─────────────────┐
│  TeamMission    │───────────────│   AgentTask     │
│                 │               │                 │
└─────────────────┘               └─────────────────┘
      │
      │ 1:N
      ▼
┌─────────────────┐
│   MissionLog    │
│                 │
└─────────────────┘
```

### 3.2 关键数据模型

#### TopicAIMember (AI Agent)

```typescript
model TopicAIMember {
  id              String   @id @default(cuid())
  topicId         String
  aiModel         String              // 底层模型: gpt-4, claude-3, etc.
  displayName     String              // 显示名称: AI-ChatGPT
  avatar          String?             // 头像 URL
  roleDescription String?             // 角色描述
  systemPrompt    String?             // 系统提示词
  contextWindow   Int      @default(10)  // 上下文窗口大小
  responseStyle   String?             // 响应风格
  autoRespond     Boolean  @default(false)  // 自动响应
  capabilities    AICapability[]      // 能力标签

  // Team Role 扩展
  agentName       String?             // Agent 角色名
  agentIdentity   String?             // Agent 身份描述
  isLeader        Boolean  @default(false)  // 是否为 Leader
  expertiseAreas  String[]            // 专业领域
  workStyle       AgentWorkStyle?     // 工作风格

  // Relations
  topic           Topic     @relation(...)
  messages        TopicMessage[]
  assignedTasks   AgentTask[]
  ledMissions     TeamMission[]
}
```

#### TeamMission (团队任务)

```typescript
model TeamMission {
  id              String   @id @default(cuid())
  topicId         String
  title           String              // 任务标题
  description     String              // 任务描述
  objectives      String[]            // 目标列表
  constraints     String[]            // 约束条件
  deliverables    String[]            // 交付物

  // Status
  status          MissionStatus       // 任务状态
  leaderId        String              // Leader AI ID
  taskBreakdown   Json?               // 任务分解方案 (JSON)

  // Progress
  totalTasks      Int      @default(0)
  completedTasks  Int      @default(0)
  progressPercent Float    @default(0)

  // Timeline
  createdById     String
  startedAt       DateTime?
  completedAt     DateTime?

  // Results
  finalResult     String?
  summary         String?

  // Relations
  leader          TopicAIMember @relation(...)
  tasks           AgentTask[]
  logs            MissionLog[]
}
```

#### AgentTask (Agent 任务)

```typescript
model AgentTask {
  id              String   @id @default(cuid())
  missionId       String
  title           String              // 任务标题
  description     String              // 任务描述
  priority        TaskPriority        // 优先级
  taskType        TaskType            // 任务类型

  // Assignment
  assignedToId    String              // 分配给的 AI
  assignedReason  String?             // 分配理由
  dependsOnIds    String[]            // 依赖的任务 ID

  // Status
  status          AgentTaskStatus     // 任务状态

  // Execution
  startedAt       DateTime?
  completedAt     DateTime?
  result          String?             // 执行结果
  resultMessageId String?             // 结果消息 ID

  // Review
  leaderFeedback  String?             // Leader 反馈
  feedbackMessageId String?           // 反馈消息 ID
  needsRevision   Boolean @default(false)
  revisionCount   Int     @default(0)
  maxRevisions    Int     @default(2)

  // Relations
  mission         TeamMission @relation(...)
  assignedTo      TopicAIMember @relation(...)
}
```

### 3.3 状态枚举

```typescript
// 任务状态流转
enum MissionStatus {
  PENDING       // 待启动
  PLANNING      // 规划中 (Leader 分析任务)
  IN_PROGRESS   // 执行中
  PAUSED        // 已暂停
  REVIEW        // 审核中
  COMPLETED     // 已完成
  FAILED        // 失败
  CANCELLED     // 已取消
}

// Agent 任务状态
enum AgentTaskStatus {
  PENDING          // 待执行
  IN_PROGRESS      // 执行中
  BLOCKED          // 阻塞 (依赖未完成)
  AWAITING_REVIEW  // 等待审核
  REVISION_NEEDED  // 需要修改
  COMPLETED        // 已完成
  CANCELLED        // 已取消
}

// 任务类型
enum TaskType {
  RESEARCH        // 研究调研
  DESIGN          // 设计方案
  IMPLEMENTATION  // 实现编码
  REVIEW          // 代码/文档审核
  DOCUMENTATION   // 文档编写
  COORDINATION    // 协调沟通
  CREATIVE        // 创意内容
  SYNTHESIS       // 综合整理
}

// 工作风格
enum AgentWorkStyle {
  ANALYTICAL      // 分析型
  CREATIVE        // 创意型
  COLLABORATIVE   // 协作型
  INDEPENDENT     // 独立型
  SUPPORTIVE      // 支持型
}
```

---

## 四、核心流程

### 4.1 消息处理流程

```
用户发送消息 @AI-Grok @AI-Claude
          │
          ▼
┌─────────────────────────────────────┐
│    Controller.sendMessage()         │
│    1. 验证用户权限                   │
│    2. 保存消息到数据库               │
│    3. WebSocket 广播消息             │
└─────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│    解析 @mentions                    │
│    - MentionType.AI → 单个 AI       │
│    - MentionType.ALL_AI → 所有 AI   │
│    - MentionType.ALL → 所有人+AI    │
└─────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│    检测特殊模式                      │
│    - 辩论关键词 + 2个AI? → 辩论模式  │
│    - @Leader + 控制关键词? → 任务控制│
└─────────────────────────────────────┘
          │
          ├──────────────────┐
          │                  │
    [普通模式]          [辩论模式]
          │                  │
          ▼                  ▼
┌──────────────────┐  ┌──────────────────┐
│ 并行触发 AI 响应  │  │ 启动辩论会话      │
│ generateAIResponse│  │ runDebate()      │
└──────────────────┘  └──────────────────┘
```

### 4.2 智能上下文构建

```typescript
// ai-response.service.ts
async buildSmartContext(
  topicId: string,
  aiMemberId: string,
  options: ContextOptions
): Promise<SmartContext> {
  // 1. 获取最近 30 条消息
  const messages = await this.getRecentMessages(topicId, 30);

  // 2. 过滤任务系统消息
  const filtered = messages.filter(msg =>
    !this.isMissionSystemMessage(msg.content)
  );

  // 3. 相关性打分
  const scored = filtered.map(msg => ({
    ...msg,
    score: this.calculateRelevance(msg, aiMemberId, options)
  }));

  // 4. 选择 Top N 消息
  const selected = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, options.maxMessages || 10);

  // 5. 附加 URL 解析内容
  if (options.includeUrlContent) {
    for (const msg of selected) {
      if (msg.parsedUrls?.length) {
        msg.urlContext = await this.getUrlContext(msg.parsedUrls);
      }
    }
  }

  return { messages: selected, metadata: {...} };
}

// 过滤的系统消息模式
private isMissionSystemMessage(content: string): boolean {
  const patterns = [
    '[任务分解]', '[工作汇报]', '[任务分配]',
    '[开始工作]', '[Leader 审核]', '📋 [任务分配]'
  ];
  return patterns.some(p => content.includes(p));
}
```

### 4.3 辩论模式流程

```
检测到辩论意图
(@2个AI + 辩论/对决/PK 关键词)
          │
          ▼
┌─────────────────────────────────────┐
│  debateService.createDebateSession()│
│  - 创建独立 DebateSession          │
│  - 为每个 AI 创建 DebateAgent       │
│  - 初始化独立 conversationHistory   │
└─────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  Round 1: RED Agent 发言            │
│  - buildAgentPrompt(RED)            │
│  - 调用 AI API                      │
│  - 保存到 DebateMessage             │
│  - 更新 conversationHistory         │
│  - 同步到 TopicMessage (可选)       │
└─────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  Round 1: BLUE Agent 发言           │
│  - 接收 RED 的上一条消息作为输入    │
│  - buildAgentPrompt(BLUE)           │
│  - 调用 AI API                      │
│  - 保存并同步                       │
└─────────────────────────────────────┘
          │
          ▼
    重复直到 maxRounds
          │
          ▼
┌─────────────────────────────────────┐
│  completeDebate()                   │
│  - 标记 session 完成                │
│  - 可选：生成总结                   │
└─────────────────────────────────────┘
```

### 4.4 团队任务执行流程

```
用户创建 Mission
(指定 Leader + 任务描述)
          │
          ▼
┌─────────────────────────────────────┐
│  teamMissionService.createMission() │
│  - 创建 TeamMission 记录            │
│  - 状态: PENDING                    │
│  - 自动启动 (autoStart=true)        │
└─────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  startMission() → PLANNING          │
│  - 状态更新为 PLANNING              │
│  - Leader 开始分析任务              │
└─────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  executeLeaderPlanning()            │
│  1. 构建规划提示词                   │
│  2. 调用 Leader AI                  │
│  3. 解析任务分解 JSON               │
│  4. 创建 AgentTask 记录             │
│  5. 状态更新为 IN_PROGRESS          │
└─────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  executeNextTasks()                 │
│  1. 找出依赖已满足的 PENDING 任务   │
│  2. 并行执行 (限制并发数)           │
│  3. 每个任务:                       │
│     - 调用对应 AI                   │
│     - 保存结果                      │
│     - 状态更新为 AWAITING_REVIEW    │
└─────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  leaderReviewTask()                 │
│  - Leader 审核任务结果              │
│  - 通过 → COMPLETED                 │
│  - 不通过 → REVISION_NEEDED         │
│     (revisionCount++)               │
│  - 超过 maxRevisions → 强制通过     │
└─────────────────────────────────────┘
          │
          ▼
    所有任务完成?
          │
    ┌─────┴─────┐
    │ Yes       │ No
    ▼           ▼
┌──────────┐  回到 executeNextTasks()
│completeMission()
│- 状态: COMPLETED
│- 生成总结
│- 通知用户
└──────────┘
```

---

## 五、@提及系统

### 5.1 提及类型

| 类型     | 语法      | 行为                      |
| -------- | --------- | ------------------------- |
| `USER`   | @用户名   | 通知该用户                |
| `AI`     | @AI-名称  | 触发该 AI 响应            |
| `ALL_AI` | @All AIs  | 所有 AI 依次响应          |
| `ALL`    | @Everyone | 通知所有人 + 所有 AI 响应 |

### 5.2 检测逻辑

```typescript
// Controller 层检测
for (const mention of dto.mentions) {
  if (mention.mentionType === MentionType.AI) {
    // 单个 AI
    aiMembersToRespond.push(mention.aiMemberId);
  } else if (mention.mentionType === MentionType.ALL_AI) {
    // 所有 AI
    aiMembersToRespond.push(...allAIMembers.map((a) => a.id));
  } else if (mention.mentionType === MentionType.ALL) {
    // 通知人类 + 所有 AI
    notifyHumans();
    aiMembersToRespond.push(...allAIMembers.map((a) => a.id));
  }
}
```

### 5.3 Leader 命令检测

```typescript
// team-mission.service.ts
async handleLeaderMentionCommand(
  topicId: string,
  userId: string,
  content: string
): Promise<{ handled: boolean; action?: string }> {

  // 重试/继续关键词
  const retryKeywords = [
    "继续执行", "继续", "重试", "再试",
    "重新执行", "重新开始", "restart", "retry", "continue"
  ];

  // 组织/分配关键词 (用于 IN_PROGRESS 状态)
  const organizeKeywords = [
    "组织", "完成任务", "继续组织", "系统组织",
    "分配任务", "委派", "delegate", "organize"
  ];

  // 1. 检查 IN_PROGRESS 任务
  const inProgressMission = await this.findInProgressMission(topicId);
  if (inProgressMission && hasOrganizeKeyword) {
    // 继续执行待处理任务
    await this.executeNextTasks(inProgressMission.id);
    return { handled: true, action: "continue_organizing" };
  }

  // 2. 检查 FAILED/PAUSED 任务
  const stoppedMission = await this.findStoppedMission(topicId);
  if (stoppedMission && hasRetryKeyword) {
    await this.retryMission(stoppedMission.id, userId);
    return { handled: true, action: "retry" };
  }

  return { handled: false };
}
```

---

## 六、WebSocket 实时通信

### 6.1 事件列表

| 事件                     | 方向 | 描述           |
| ------------------------ | ---- | -------------- |
| `topic:join`             | C→S  | 加入话题房间   |
| `topic:leave`            | C→S  | 离开话题房间   |
| `message:new`            | S→C  | 新消息广播     |
| `ai:typing`              | S→C  | AI 正在输入    |
| `ai:response`            | S→C  | AI 响应完成    |
| `mission:status_changed` | S→C  | 任务状态变更   |
| `agent:working`          | S→C  | Agent 工作状态 |
| `member:online`          | S→C  | 成员上线       |
| `member:offline`         | S→C  | 成员离线       |

### 6.2 Gateway 实现

```typescript
@WebSocketGateway({
  namespace: "/ai-teams",
  cors: { origin: "*" },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
})
export class AiTeamsGateway {
  @SubscribeMessage("topic:join")
  async handleJoin(client: Socket, data: { topicId: string }) {
    // 验证权限
    await this.validateAccess(client, data.topicId);

    // 加入房间
    client.join(`topic:${data.topicId}`);

    // 广播在线状态
    this.emitToTopic(data.topicId, "member:online", {
      userId: client.data.userId,
      timestamp: new Date(),
    });
  }

  // 广播到话题房间
  emitToTopic(topicId: string, event: string, data: any) {
    this.server.to(`topic:${topicId}`).emit(event, data);
  }
}
```

---

## 七、文件结构

### 7.1 后端文件

```
backend/src/modules/ai/ai-teams/
├── ai-teams.module.ts           # 模块定义
├── ai-teams.controller.ts       # REST API (1200+ lines)
├── ai-teams.service.ts          # 主服务 (700+ lines)
├── ai-teams.gateway.ts          # WebSocket (450 lines)
├── team-mission.service.ts      # 任务服务 (2000+ lines)
├── ai-response.service.ts       # 响应服务 (500+ lines)
├── debate.service.ts            # 辩论服务 (546 lines)
├── context-router.service.ts    # 上下文路由 (491 lines)
├── url-parser.service.ts        # URL 解析 (400+ lines)
├── content-extraction.service.ts # 内容提取 (300+ lines)
├── topic-membership.service.ts  # 成员权限
├── topic-public.service.ts      # 公开话题
├── topic-forward-bookmark.service.ts # 转发/收藏
├── topic-resources.service.ts   # 资源管理
├── topic-summaries.service.ts   # 摘要管理
└── dto/                         # 数据传输对象
    ├── create-topic.dto.ts
    ├── create-mission.dto.ts
    ├── send-message.dto.ts
    └── ...
```

### 7.2 前端文件

```
frontend/
├── app/ai-teams/
│   ├── page.tsx                 # 列表页
│   └── [topicId]/
│       └── page.tsx             # 详情页
├── components/ai-teams/
│   ├── TeamCanvasView.tsx       # Canvas 可视化
│   ├── CreateMissionDialog.tsx  # 创建任务对话框
│   ├── MissionProgressPanel.tsx # 任务进度面板
│   ├── LinkPreviewCard.tsx      # 链接预览卡片
│   └── ...
├── stores/
│   └── aiTeamsStore.ts          # Zustand 状态管理
├── lib/api/
│   └── ai-teams.ts              # API 客户端
└── types/
    └── ai-teams.ts              # TypeScript 类型定义
```

---

## 八、API 端点

### 8.1 Topic 管理

| 方法   | 路径               | 描述         |
| ------ | ------------------ | ------------ |
| POST   | `/topics`          | 创建话题     |
| GET    | `/topics`          | 获取我的话题 |
| GET    | `/topics/public`   | 公开话题     |
| GET    | `/topics/:topicId` | 话题详情     |
| PATCH  | `/topics/:topicId` | 更新话题     |
| DELETE | `/topics/:topicId` | 删除话题     |

### 8.2 消息管理

| 方法   | 路径                                             | 描述            |
| ------ | ------------------------------------------------ | --------------- |
| GET    | `/topics/:topicId/messages`                      | 获取消息 (分页) |
| POST   | `/topics/:topicId/messages`                      | 发送消息        |
| DELETE | `/topics/:topicId/messages/:messageId`           | 删除消息        |
| POST   | `/topics/:topicId/messages/:messageId/reactions` | 添加表情        |

### 8.3 AI 成员管理

| 方法   | 路径                                         | 描述         |
| ------ | -------------------------------------------- | ------------ |
| GET    | `/topics/:topicId/ai-members`                | 获取 AI 成员 |
| POST   | `/topics/:topicId/ai-members`                | 添加 AI 成员 |
| PATCH  | `/topics/:topicId/ai-members/:id`            | 更新 AI 成员 |
| DELETE | `/topics/:topicId/ai-members/:id`            | 移除 AI 成员 |
| POST   | `/topics/:topicId/ai-members/:id/set-leader` | 设为 Leader  |

### 8.4 团队任务

| 方法 | 路径                                          | 描述     |
| ---- | --------------------------------------------- | -------- |
| POST | `/topics/:topicId/missions`                   | 创建任务 |
| GET  | `/topics/:topicId/missions`                   | 任务列表 |
| GET  | `/topics/:topicId/missions/:missionId`        | 任务详情 |
| POST | `/topics/:topicId/missions/:missionId/cancel` | 取消任务 |
| POST | `/topics/:topicId/missions/:missionId/pause`  | 暂停任务 |
| POST | `/topics/:topicId/missions/:missionId/resume` | 恢复任务 |
| POST | `/topics/:topicId/missions/:missionId/retry`  | 重试任务 |
| GET  | `/topics/:topicId/missions/:missionId/logs`   | 任务日志 |

---

## 九、最佳实践

### 9.1 AI 成员配置建议

```typescript
// Leader 配置
{
  aiModel: "gpt-4",           // 使用强模型
  displayName: "AI-Leader",
  roleDescription: "团队协调者，负责任务分解和审核",
  systemPrompt: `你是一个经验丰富的项目经理...`,
  isLeader: true,
  expertiseAreas: ["项目管理", "任务分解", "质量把控"],
  workStyle: "COLLABORATIVE"
}

// 专家成员配置
{
  aiModel: "claude-3-sonnet",
  displayName: "AI-Coder",
  roleDescription: "代码专家，擅长实现和调试",
  systemPrompt: `你是一个资深程序员...`,
  expertiseAreas: ["编程", "架构设计", "代码优化"],
  workStyle: "ANALYTICAL"
}
```

### 9.2 任务分解原则

1. **原子性**: 每个子任务应该独立可执行
2. **明确依赖**: 清晰定义任务间的依赖关系
3. **合理分配**: 根据 AI 专长分配任务
4. **可审核性**: 每个任务结果应该可评估

### 9.3 上下文优化

1. **过滤系统消息**: 任务执行的系统消息不应混入普通对话上下文
2. **相关性排序**: 优先包含最相关的历史消息
3. **URL 增强**: 自动解析并包含链接内容
4. **辩论隔离**: 辩论模式使用独立的会话历史

---

## 十、扩展点

### 10.1 可扩展模块

| 模块             | 扩展方向                  |
| ---------------- | ------------------------- |
| AI Provider      | 添加新的 AI 模型支持      |
| Task Type        | 新增任务类型 (如 Testing) |
| Work Style       | 新增工作风格              |
| Context Strategy | 新增上下文选择策略        |
| URL Parser       | 支持更多平台解析          |

### 10.2 未来规划

- [ ] 支持 Agent 间直接通信 (不经过 Topic)
- [ ] 任务执行的并行度动态调整
- [ ] 基于历史表现的 AI 任务分配优化
- [ ] 支持外部工具调用 (Function Calling)
- [ ] 任务模板库

---

## 十一、相关文档

- [AI Group PRD v1.0](../../../prd/ai-group-prd.md)
- [AI Group Spec v2.0](../../../prd/ai-group-spec.md)
- [AI Group Team Collaboration](../../../prd/ai-group-team-collaboration.md)
- [AI Group Content Parsing](../../../prd/ai-group-content-parsing.md)
