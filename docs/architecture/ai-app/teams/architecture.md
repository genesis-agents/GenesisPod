# AI Teams 架构文档

> 多智能体协作平台，支持人类用户与 AI 智能体在 Topic（聊天室）中进行辩论、共识投票、任务委派和团队任务协作。

## 概述

**AI Teams** 是 Genesis.ai 的核心协作模块，实现了人机混合团队的实时协作能力。该模块将 AI Engine 的通用协作机制（投票、任务交接、工作流编排）与具体的聊天场景深度整合，提供了一个完整的多智能体协作平台。

### 核心特性

- **Topic 协作空间**：类似 Slack 的聊天室，支持人类成员和 AI 成员混合协作
- **AI 成员管理**：基于角色（researcher/analyst/writer/developer/designer/leader）的 AI 智能体
- **辩论系统**：结构化的红蓝对抗辩论，参考 MAD（Multi-Agents-Debate）架构
- **共识投票**：支持 MAJORITY/SUPERMAJORITY/UNANIMOUS 三种投票策略
- **Mission 任务系统**：Leader 驱动的多 Agent 任务分解与并行执行
- **工具调用**：基于角色自动配置可用工具（WebSearch/CodeGen/DataAnalysis 等）

### 架构定位

```
AI Engine（核心能力层）
    ↓ 提供：VotingManager, HandoffCoordinator, LLMFactory, ToolRegistry
AI Teams（应用层）
    ↓ 实现：Topic 协作、辩论、Mission 编排
用户界面（前端）
    ↓ WebSocket 实时更新
```

## 核心组件

### 1. 主服务层

#### AiTeamsService

**位置**：`ai-teams.service.ts`

主 Facade 服务，协调所有子服务：

- **Topic CRUD**：创建/查询/更新/删除 Topic
- **成员管理**：添加/移除人类成员和 AI 成员
- **消息处理**：发送消息、@提及检测、URL 解析、反应（Emoji）
- **资源管理**：关联外部资源到 Topic
- **摘要生成**：使用 AI 生成对话摘要
- **委派服务**：将具体功能委派给专门的子服务

**关键方法**：

```typescript
createTopic(userId, dto); // 创建聊天室
sendMessage(topicId, userId, dto); // 发送消息，自动检测 @mentions
generateSummary(topicId, userId); // AI 生成摘要
```

#### AiTeamsGateway

**位置**：`ai-teams.gateway.ts`

WebSocket 网关，提供实时通信：

- 消息实时推送
- 成员在线状态
- 辩论进度更新
- Mission 任务状态变化

### 2. 协作服务层

#### TeamCollaborationService

**位置**：`services/collaboration/team-collaboration.service.ts`

**职责**：桥接 AI Engine 的协作工具与 AI Teams 成员系统

**核心功能**：

1. **任务委派（Handoff）**
   - `delegateTask()`：委派任务给其他 AI 成员
   - 支持同步/异步模式（`waitForResult`）
   - 自动创建委派消息和调用目标 AI 生成响应

2. **共识投票（Consensus Voting）**
   - `createVoteProposal()`：创建投票提案（持久化到数据库）
   - `castMemberVote()`：AI 成员投票（APPROVE/REJECT/ABSTAIN）
   - `collectAIVotes()`：自动收集所有 AI 成员的投票意见
   - `getVoteResult()`：计算共识结果

**投票策略**：

```typescript
VoteStrategy.MAJORITY; // 简单多数（>50%）
VoteStrategy.SUPERMAJORITY; // 超级多数（≥66%）
VoteStrategy.UNANIMOUS; // 全票通过
```

**架构亮点**：

- 使用数据库持久化提案和投票记录（`VoteProposal`, `VoteRecord`）
- AI 自动投票：构造结构化 Prompt，解析 JSON 格式投票意见
- 支持投票理由和信心度（`confidence: 0.0-1.0`）

#### DebateService

**位置**：`services/collaboration/debate.service.ts`

**职责**：实现结构化的 AI 辩论系统

**设计原则**（参考业界最佳实践）：

1. **独立会话隔离**：每个 `DebateSession` 与 Topic 消息历史完全隔离
2. **Agent 独立历史**：每个 `DebateAgent` 维护自己的 `conversationHistory`
3. **结构化轮次管理**：系统控制红蓝方发言顺序
4. **角色明确化**：通过 `stancePrompt` 明确角色身份和立场

**核心流程**：

```typescript
createDebateSession()        // 创建辩论会话
runDebate(sessionId)         // 执行完整辩论流程
  └─ 循环 maxRounds 轮：
      ├─ executeDebateRound(redAgent)   // 红方发言
      └─ executeDebateRound(blueAgent)  // 蓝方回应
completeDebate(sessionId)    // 结束辩论
syncDebateToTopic()          // 将辩论消息同步到 Topic（可选）
```

**数据模型**：

- `DebateSession`：会话元数据（topic, status, maxRounds, currentRound）
- `DebateAgent`：辩论参与者（role: RED/BLUE/JUDGE, conversationHistory）
- `DebateMessage`：辩论消息（round, content, tokensUsed, latencyMs）

#### TeamMissionService

**位置**：`services/collaboration/mission/team-mission.service.ts`

**职责**：多 Agent 任务编排的核心服务，实现 Leader 驱动的团队任务执行

**核心流程**：

```
1. 创建 Mission → 指定 Leader
2. Leader 分析需求 → 任务分解（Task Breakdown）
3. 分配给合适的 Agent（基于 expertiseAreas/capabilities）
4. 并行/串行执行任务
5. Leader 审核（Review）
6. 生成最终报告（Final Report）
```

**关键特性**：

- **任务依赖管理**：支持 `dependencies`，自动解析执行顺序
- **失败重试机制**：配置化重试次数和延迟
- **Agent 切换**：任务失败后自动寻找替代 Agent
- **健康检查**：定期检测卡住的任务并自动恢复
- **并发控制**：使用 `MissionStateManager` 管理任务锁

**子服务分工**：

- `MissionExecutionService`：任务执行核心逻辑
- `MissionReviewService`：Leader 审核逻辑
- `TaskBreakdownService`：任务分解
- `MissionContextService`：上下文管理
- `MissionStateManager`：状态锁管理
- `MissionLifecycleService`：生命周期管理（失败/暂停/恢复）
- `MissionRetryService`：重试逻辑
- `MissionHealthCheckService`：健康检查和自动恢复
- `MissionAICallerService`：AI 调用封装（Token 追踪）
- `TeamMessageService`：消息发送和日志记录
- `TeamMemberService`：团队成员管理

### 3. AI 服务层

#### AiResponseService

**位置**：`services/ai/ai-response.service.ts`

**职责**：生成 AI 成员的回复消息

**核心功能**：

- `generateAIResponse()`：根据上下文和 @mentions 生成 AI 回复
- `createAIMessage()`：创建并保存 AI 消息到数据库
- `parseAIMentionsFromContent()`：解析消息中的 @提及

#### TopicContextRetrievalService

**位置**：`services/ai/topic-context-retrieval.service.ts`

**职责**：检索 Topic 历史消息作为 AI 上下文

#### TeamsLongContentService

**位置**：`services/ai/teams-long-content.service.ts`

**职责**：处理长内容任务的 Token 预算管理和约束执行

#### LeaderModelService

**位置**：`services/ai/leader-model.service.ts`

**职责**：Leader 模型容错服务，支持重试和模型切换

### 4. Topic 领域服务层

#### TopicMembershipService

**位置**：`services/topic/topic-membership.service.ts`

**职责**：管理 Topic 成员（人类和 AI）

**核心功能**：

- 添加/移除人类成员
- 添加/更新/移除 AI 成员
- 设置辩论 AI（自动创建红蓝双方）
- 更新 AI 成员的团队角色（agentName, expertiseAreas, isLeader）

#### TopicPublicService

**位置**：`services/topic/topic-public.service.ts`

**职责**：公开 Topic 管理和加入请求

#### TopicForwardBookmarkService

**位置**：`services/topic/topic-forward-bookmark.service.ts`

**职责**：消息转发和收藏功能

### 5. Agent 层

#### TeamMemberAgent

**位置**：`agents/team-member.agent.ts`

**职责**：将 `TopicAIMember` 转换为具备工具调用能力的 Agent

**角色体系**：

```typescript
type TeamMemberRole =
  | "researcher" // 研究员：WebSearch, RAG, KnowledgeGraph
  | "analyst" // 分析师：DataAnalysis, PythonExecutor
  | "writer" // 作家：TextGeneration, ExportDocx, ExportPdf
  | "developer" // 开发者：CodeGeneration, PythonExecutor, GitHub
  | "designer" // 设计师：ImageGeneration, ExportPptx
  | "moderator" // 主持人：AgentHandoff, ConsensusMechanism
  | "leader" // Leader：TaskDelegation, WorkflowOrchestration
  | "general"; // 通用：基础能力
```

**工具映射机制**：

1. **基于角色**：每个角色有默认工具集（`ROLE_TOOL_MAPPING`）
2. **基于 AICapability**：根据 Prisma 枚举映射工具（`CAPABILITY_TOOL_MAPPING`）
3. **基于专业领域**：模糊匹配 `expertiseAreas` 添加工具（`EXPERTISE_TOOL_MAPPING`）
4. **Leader 增强**：Leader 自动获得协作工具
5. **自定义工具**：支持手动配置 `customTools`
6. **MCP 工具支持**：支持外部 MCP 工具（`mcpTools`）

**核心方法**：

```typescript
resolveTools(config); // 解析可用工具列表
executeTool(toolType, input); // 执行单个工具
buildToolsSystemPrompt(tools); // 生成工具能力描述（加入 System Prompt）
```

### 6. 事件服务

#### TopicEventEmitterService

**位置**：`services/events/topic-event-emitter.service.ts`

**职责**：发送 Webhook 事件通知

**事件类型**：

- `topic.created`, `topic.updated`, `topic.archived`, `topic.deleted`
- `message.created`

### 7. 整合服务

#### AiTeamsIntegrationService

**位置**：`services/integration/ai-teams-integration.service.ts`

**职责**：与 AI Engine 的整合桥接

## 关键流程

### Topic 协作流程

```
1. User sends message
    ↓
2. AiTeamsService.sendMessage()
    ↓ 检测 @mentions
    ↓ 解析 URL（UrlParserService）
    ↓ 创建消息到数据库
    ↓
3. 触发 AI 响应
    ├─ 检测辩论关键词 → DebateService.createDebateSession()
    └─ 普通 @mention → AiResponseService.generateAIResponse()
    ↓
4. AI-AI 协作（可选）
    ├─ 任务委派 → TeamCollaborationService.delegateTask()
    └─ 共识投票 → TeamCollaborationService.createVoteProposal()
    ↓
5. WebSocket 推送更新（AiTeamsGateway）
```

### Mission 执行流程

```
1. User creates mission
    ↓ CreateMissionDto (title, description, deliverables)
    ↓
2. TeamMissionService.createMission()
    ├─ 选择 Leader（isLeader=true 的 AI 成员）
    └─ 状态：PENDING
    ↓
3. startMissionPlanning()
    ├─ Leader 分析需求
    ├─ 任务分解（Task Breakdown）
    │   ├─ 识别子任务（title, description, type）
    │   └─ 分配 Agent（基于 expertiseAreas）
    └─ 创建 AgentTask（status: PENDING, dependencies）
    ↓
4. executeNextTasks()
    ├─ 查找可执行任务（无未完成的依赖）
    ├─ 并发执行（mapWithConcurrency）
    ├─ 调用 Agent AI 生成任务结果
    ├─ 保存结果到 AgentTask.result
    └─ 递归执行下一批任务
    ↓
5. leaderReviewTask()（可选）
    ├─ Leader 审核任务结果
    ├─ 判断：APPROVED / NEEDS_REVISION
    └─ 如需修订 → reviseTask()
    ↓
6. completeMission()
    ├─ 生成最终报告（汇总所有任务结果）
    ├─ 保存到 TeamMission.finalReport
    └─ 状态：COMPLETED
```

**并发控制**：

- 使用 `MissionStateManager` 管理任务执行锁
- 避免多次并发调用导致重复执行
- 支持待执行队列（`pendingExecutions`）

**失败恢复**：

- 可重试错误（Rate Limit, Network）→ 指数退避重试
- 永久错误 → 寻找替代 Agent 或标记失败
- 健康检查（`MissionHealthCheckService`）定期检测卡住任务

### 共识投票流程

```
1. AI creates proposal
    ↓ TeamCollaborationService.createVoteProposal()
    ↓ 创建 VoteProposal（strategy, voterIds, options）
    ↓
2. Members vote
    ├─ 手动投票：castMemberVote(proposalId, memberId, value, reason)
    └─ 自动收集：collectAIVotes(proposalId, voterIds)
        ├─ 为每个 AI 生成投票 Prompt
        ├─ 调用 AI 获取投票意见（JSON 格式）
        ├─ 解析投票意见（tryParseJsonVote + fallback 文本解析）
        └─ 保存到 VoteRecord
    ↓
3. Strategy evaluation
    ├─ MAJORITY：>50% 赞成
    ├─ SUPERMAJORITY：≥66% 赞成
    └─ UNANIMOUS：100% 赞成
    ↓
4. Decision
    ├─ 更新 VoteProposal（status: CLOSED, decision）
    └─ 生成投票摘要（generateVoteSummary）
```

### 辩论流程

```
1. User mentions 2+ AIs with debate keywords
    ↓ 检测关键词（"辩论", "debate"）
    ↓
2. DebateService.createDebateSession()
    ├─ 创建 DebateSession（topic, maxRounds）
    ├─ 创建 DebateAgent（RED, BLUE）
    └─ 初始化 conversationHistory: []
    ↓
3. runDebate(sessionId)
    ├─ Loop: for round in 1..maxRounds
    │   ├─ executeDebateRound(redAgent)
    │   │   ├─ 构建独立上下文（stancePrompt + conversationHistory）
    │   │   ├─ 调用 AI 生成回复
    │   │   ├─ 更新 conversationHistory
    │   │   └─ 保存 DebateMessage
    │   └─ executeDebateRound(blueAgent)
    │       └─ 传入对手的最新消息
    └─ 状态：COMPLETED
    ↓
4. 实时流式输出（WebSocket）
    ↓
5. 可选：syncDebateToTopic()
    └─ 将辩论消息同步到 Topic 聊天界面
```

**架构亮点**：

- **完全隔离**：辩论会话不读取 Topic 历史，避免上下文污染
- **独立历史**：每个 Agent 维护自己的 `conversationHistory`，防止角色混乱
- **结构化 Prompt**：明确角色、立场、对手信息
- **可扩展性**：支持 JUDGE 角色（未实现）

## 数据模型

### Topic 聊天室

```prisma
Topic
  ├─ id, name, description, type (TEAM/PROJECT/DEBATE/PUBLIC/PRIVATE/ARCHIVED)
  ├─ createdById, createdBy (User)
  ├─ members: TopicMember[]
  ├─ aiMembers: TopicAIMember[]
  ├─ messages: TopicMessage[]
  ├─ resources: TopicResource[]
  ├─ summaries: TopicSummary[]
  └─ missions: TeamMission[]
```

### TopicMember（人类成员）

```prisma
TopicMember
  ├─ userId, user (User)
  ├─ topicId, topic (Topic)
  ├─ role (OWNER/ADMIN/MEMBER)
  ├─ lastReadAt
  └─ joinedAt
```

### TopicAIMember（AI 成员）

```prisma
TopicAIMember
  ├─ id, displayName, avatar
  ├─ aiModel (模型 ID，如 "gpt-4o", "claude-3.5-sonnet")
  ├─ roleDescription (角色描述)
  ├─ systemPrompt (系统提示词)
  ├─ isLeader (是否为 Leader)
  ├─ agentName (Agent 名称)
  ├─ agentIdentity (身份描述)
  ├─ expertiseAreas (专业领域，如 ["数据分析", "Python"])
  ├─ workStyle (AUTONOMOUS/COLLABORATIVE/ANALYTICAL/CREATIVE/SUPPORTIVE)
  ├─ capabilities (AICapability[])
  └─ addedById, addedBy (User)
```

### TopicMessage（消息）

```prisma
TopicMessage
  ├─ id, content, contentType (TEXT/IMAGE/FILE/SYSTEM)
  ├─ senderId, sender (User) [可空]
  ├─ aiMemberId, aiMember (TopicAIMember) [可空]
  ├─ topicId, topic (Topic)
  ├─ replyToId, replyTo (TopicMessage) [可空]
  ├─ mentions: TopicMessageMention[]
  ├─ attachments: TopicMessageAttachment[]
  ├─ reactions: TopicMessageReaction[]
  ├─ parsedUrls (JSON，URL 元数据)
  ├─ modelUsed (AI 模型)
  ├─ tokensUsed (Token 消耗)
  └─ deletedAt
```

### TeamMission（团队任务）

```prisma
TeamMission
  ├─ id, title, description
  ├─ topicId, topic (Topic)
  ├─ createdById, createdBy (User)
  ├─ leaderId, leader (TopicAIMember)
  ├─ status (PENDING/PLANNING/IN_PROGRESS/REVIEWING/COMPLETED/FAILED/PAUSED)
  ├─ deliverables (交付物要求)
  ├─ finalReport (最终报告)
  ├─ tasks: AgentTask[]
  ├─ logs: MissionLog[]
  ├─ completedAt
  └─ failedAt
```

### AgentTask（子任务）

```prisma
AgentTask
  ├─ id, title, description
  ├─ missionId, mission (TeamMission)
  ├─ assigneeId, assignee (TopicAIMember)
  ├─ type (RESEARCH/ANALYSIS/WRITING/CODE/DESIGN/REVIEW/OTHER)
  ├─ priority (LOW/MEDIUM/HIGH/CRITICAL)
  ├─ status (PENDING/IN_PROGRESS/COMPLETED/FAILED/SKIPPED/REVISION)
  ├─ dependencies (依赖任务 ID 列表)
  ├─ result (任务结果)
  ├─ reviewFeedback (Leader 审核反馈)
  ├─ isApproved (是否通过审核)
  ├─ retryCount (重试次数)
  ├─ tokensUsed
  ├─ completedAt
  └─ failedAt
```

### VoteProposal（投票提案）

```prisma
VoteProposal
  ├─ id, title, description
  ├─ topicId, topic (Topic)
  ├─ initiatorId, initiator (TopicAIMember)
  ├─ strategy (MAJORITY/SUPERMAJORITY/UNANIMOUS)
  ├─ options (选项列表)
  ├─ status (OPEN/CLOSED)
  ├─ decision (APPROVE/REJECT)
  ├─ summary (投票摘要)
  ├─ votes: VoteRecord[]
  └─ closedAt
```

### VoteRecord（投票记录）

```prisma
VoteRecord
  ├─ id
  ├─ proposalId, proposal (VoteProposal)
  ├─ voterId, voter (TopicAIMember)
  ├─ value (APPROVE/REJECT/ABSTAIN)
  ├─ reason (投票理由)
  ├─ confidence (信心度 0.0-1.0)
  └─ votedAt
```

### DebateSession（辩论会话）

```prisma
DebateSession
  ├─ id, topic (辩论主题)
  ├─ topicId, topic (Topic)
  ├─ status (ACTIVE/PAUSED/COMPLETED/CANCELLED)
  ├─ maxRounds (最大轮次)
  ├─ currentRound (当前轮次)
  ├─ roundTimeoutMs (轮次超时)
  ├─ initiatedById (发起者)
  ├─ agents: DebateAgent[]
  ├─ messages: DebateMessage[]
  └─ completedAt
```

### DebateAgent（辩论参与者）

```prisma
DebateAgent
  ├─ id
  ├─ sessionId, session (DebateSession)
  ├─ aiMemberId, aiMember (TopicAIMember)
  ├─ role (RED/BLUE/JUDGE)
  ├─ stance (立场描述)
  ├─ stancePrompt (角色 Prompt)
  ├─ conversationHistory (独立对话历史)
  ├─ messageCount
  └─ totalTokens
```

### DebateMessage（辩论消息）

```prisma
DebateMessage
  ├─ id, content
  ├─ sessionId, session (DebateSession)
  ├─ agentId, agent (DebateAgent)
  ├─ round (轮次)
  ├─ modelUsed
  ├─ tokensUsed
  ├─ latencyMs
  ├─ topicMessageId [可空，同步到 Topic 后]
  └─ createdAt
```

## 文件结构

```
teams/
├── ai-teams.module.ts               # NestJS 模块定义
├── ai-teams.service.ts              # 主 Facade 服务
├── ai-teams.controller.ts           # HTTP 控制器
├── ai-teams.gateway.ts              # WebSocket 网关
├── teams.repository.ts              # 数据访问层
│
├── agents/
│   ├── index.ts
│   └── team-member.agent.ts         # Agent 工具映射和执行
│
├── services/
│   ├── ai/                          # AI 相关服务
│   │   ├── ai-response.service.ts
│   │   ├── topic-context-retrieval.service.ts
│   │   ├── teams-long-content.service.ts
│   │   ├── context-compression.service.ts
│   │   ├── context-router.service.ts
│   │   └── leader-model.service.ts
│   │
│   ├── collaboration/               # 协作功能
│   │   ├── team-collaboration.service.ts  # 投票 + 任务委派
│   │   ├── debate.service.ts              # 辩论系统
│   │   └── mission/                       # Mission 任务系统
│   │       ├── team-mission.service.ts            # Mission 主服务
│   │       ├── mission-execution.service.ts       # 任务执行
│   │       ├── mission-review.service.ts          # Leader 审核
│   │       ├── task-breakdown.service.ts          # 任务分解
│   │       ├── mission-context.service.ts         # 上下文管理
│   │       ├── mission-state.manager.ts           # 状态锁管理
│   │       ├── mission-lifecycle.service.ts       # 生命周期
│   │       ├── mission-retry.service.ts           # 重试逻辑
│   │       ├── mission-health-check.service.ts    # 健康检查
│   │       ├── mission-ai-caller.service.ts       # AI 调用封装
│   │       ├── team-message.service.ts            # 消息服务
│   │       ├── team-member.service.ts             # 成员服务
│   │       ├── mission-query.service.ts           # 查询服务
│   │       ├── mission-prompt.service.ts          # Prompt 生成
│   │       └── mission-input.service.ts           # 输入处理
│   │
│   ├── topic/                       # Topic 领域服务
│   │   ├── topic-crud.service.ts
│   │   ├── topic-membership.service.ts
│   │   ├── topic-public.service.ts
│   │   ├── topic-forward-bookmark.service.ts
│   │   ├── topic-invitation.service.ts
│   │   ├── topic-join-request.service.ts
│   │   └── topic-summaries.service.ts
│   │
│   ├── events/
│   │   └── topic-event-emitter.service.ts
│   │
│   └── integration/
│       └── ai-teams-integration.service.ts
│
├── dto/
│   ├── create-topic.dto.ts
│   ├── update-topic.dto.ts
│   ├── add-member.dto.ts
│   ├── add-ai-member.dto.ts
│   ├── send-message.dto.ts
│   ├── create-mission.dto.ts
│   ├── generate-summary.dto.ts
│   └── ...
│
└── controllers/
    ├── ai-teams.controller.ts       # Topic 和消息
    ├── users.controller.ts          # 用户查询
    ├── bookmarks.controller.ts      # 收藏功能
    ├── custom-teams.controller.ts   # 自定义团队
    └── public-reports.controller.ts # 公开报告
```

## 关键技术决策

### 1. 辩论系统的完全隔离设计

**问题**：AI 辩论需要角色明确，不能混入 Topic 历史上下文
**解决方案**：

- 每个 `DebateSession` 完全独立，不读取 Topic 历史
- 每个 `DebateAgent` 维护自己的 `conversationHistory`
- 使用结构化的 `stancePrompt` 明确角色和立场

**参考架构**：

- AutoGen（Microsoft）：独立 Agent 历史
- MAD（Multi-Agents-Debate）：Devil/Angel 对抗模式

### 2. 共识投票的持久化设计

**问题**：内存状态在服务重启后丢失
**解决方案**：

- 使用数据库持久化 `VoteProposal` 和 `VoteRecord`
- 支持投票进度查询和断点续投
- 投票结果可审计和溯源

### 3. Mission 任务系统的并发控制

**问题**：多次并发调用导致任务重复执行
**解决方案**：

- 使用 `MissionStateManager` 管理任务执行锁
- 支持待执行队列（`pendingExecutions`）
- 失败重试和健康检查机制

### 4. Agent 工具映射的三层机制

**问题**：如何为每个 AI 成员配置合适的工具？
**解决方案**：

1. **基于角色**：研究员 → WebSearch, RAG
2. **基于 AICapability**：CODE_GENERATION → CodeGen, PythonExecutor
3. **基于专业领域**：模糊匹配 `expertiseAreas`
4. **Leader 增强**：自动添加协作工具
5. **自定义工具**：支持手动配置

### 5. 长内容任务的 Token 预算管理

**问题**：生成长文档（如 10 万字报告）容易超出 Token 限制
**解决方案**：

- `TeamsLongContentService` 管理 Token 预算
- `ConstraintEnforcementService` 执行硬约束
- 分章节生成，避免单次调用过大

## 依赖关系

### 外部依赖

- **AI Engine**：提供核心 AI 能力
  - `AIEngineFacade`：LLM 调用
  - `ToolRegistry`：工具注册和调用
  - `VotingManager`, `HandoffCoordinator`（通过 AIEngineFacade）
  - `CircuitBreakerService`：熔断器
  - `AgentExecutorService`：Agent 执行器

- **Prisma ORM**：数据库访问
- **WebSocket**：实时通信
- **Credits Module**：积分扣费（通过 `BillingContext`）

### 内部分层

```
Controller → Service (Facade) → Domain Services → Repository → Prisma
                ↓
            AI Engine (Tools, LLM, Orchestration)
```

## 性能优化

### 1. 并发控制

- 使用 `mapWithConcurrency` 限制并发数量
- 默认并发限制：`ConcurrencyLimits.AGENTS = 3`

### 2. Token 优化

- 上下文压缩（`ContextCompressionService`）
- 消息历史限制（默认 50 条）
- 长内容任务预算管理

### 3. 数据库查询优化

- 批量查询未读消息数（避免 N+1）
- 使用 `include` 减少数据库往返
- 索引优化（`topicId`, `userId`, `aiMemberId`）

### 4. 缓存策略

- AI 成员信息缓存（避免重复查询）
- Topic 元数据缓存

## 测试策略

### 单元测试

- 各个 Service 的独立逻辑测试
- Mock Prisma 和 AI Engine 依赖

### 集成测试

- 完整 Mission 流程测试
- 辩论流程测试
- 投票流程测试

### E2E 测试

- WebSocket 实时通信测试
- 多 Agent 协作测试

## 未来扩展

### 1. 高级辩论功能

- 支持 JUDGE 角色
- 多轮深度辩论（动态调整轮次）
- 辩论结果评分和排名

### 2. 复杂 Mission 编排

- 支持 DAG（有向无环图）任务依赖
- 并行任务组和串行任务组
- 条件分支和循环

### 3. Agent 学习和进化

- 基于历史任务表现优化 Agent 选择
- 动态调整工具配置
- Agent 能力评分系统

### 4. 跨 Topic 协作

- Topic 联邦（Topic Federation）
- 跨 Topic 资源共享
- 全局 AI 成员池

---

**最后更新**：2026-02-01
**版本**：v1.0
**维护者**：Genesis.ai Team

**相关文档**：

- [AI Engine 架构](../../ai-engine/ai-engine-architecture.md)
- [AI 调用规范](../../../guides/ai-calling-standards.md)
- [WebSocket 实时通信](../../../guides/websocket-guide.md)
