# AI Teams - 多 Agent 协作研讨平台

> 多视角辩论 + 团队协作 + 任务编排，让 AI 团队帮你深度思考

**最后更新**: 2026-01-15
**版本**: v2.0
**状态**: 生产环境

---

## 概述

AI Teams 是 Genesis.ai 的多 Agent 协作模块，通过模拟真实团队的多视角辩论和任务协作，为用户提供更全面、更深入的分析结果。

### 核心特性

- **Topic（话题）管理**: 创建研讨话题，邀请团队成员
- **多视角辩论**: 红蓝对抗、多方观点碰撞
- **Mission（任务）编排**: 结构化任务分解和协作执行
- **实时通信**: WebSocket 实时推送团队消息和进度
- **公开分享**: 优质讨论成果可公开分享
- **书签转发**: 支持从资源库快速创建研讨话题

---

## 系统架构

### 核心概念

```
Topic（话题）
    ├── Members（成员）
    │   ├── 用户
    │   └── AI Agent
    ├── Messages（消息）
    │   ├── 用户消息
    │   ├── Agent 辩论
    │   └── 系统通知
    └── Missions（任务）
        ├── 任务分解
        ├── 并行执行
        └── 结果汇总
```

### 技术栈

| 层级     | 技术选型                 |
| -------- | ------------------------ |
| 后端     | NestJS + AI Engine       |
| 实时通信 | Socket.io                |
| 数据存储 | PostgreSQL               |
| AI 编排  | TeamCollaborationService |
| 任务执行 | MissionExecutionService  |

---

## 功能模块

### 1. Topic（话题）管理

#### 创建话题

```typescript
POST /api/v1/ai-teams/topics
{
  "name": "AI 伦理讨论",
  "description": "探讨 AI 发展的伦理边界",
  "isPublic": false
}

Response:
{
  "id": "topic-xxx",
  "name": "AI 伦理讨论",
  "memberCount": 1,
  "createdAt": "2026-01-15T10:00:00Z"
}
```

#### 添加成员

```typescript
POST /api/v1/ai-teams/topics/:id/members
{
  "agentId": "agent-xxx", // 添加 AI Agent
  "role": "CRITIC" // LEADER | SUPPORTER | CRITIC | OBSERVER
}
```

#### 获取话题列表

```typescript
GET /api/v1/ai-teams/topics?page=1&limit=20

Response:
{
  "topics": [
    {
      "id": "topic-xxx",
      "name": "AI 伦理讨论",
      "memberCount": 5,
      "messageCount": 23,
      "isPublic": false,
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ],
  "total": 50,
  "page": 1
}
```

### 2. 多视角辩论

#### 发起辩论

```typescript
POST /api/v1/ai-teams/topics/:id/messages
{
  "content": "AI 是否应该有自主决策权？",
  "triggerDebate": true // 触发 Agent 辩论
}
```

#### 辩论流程

```
1. 用户提出问题
    ↓
2. LEADER Agent 分析问题，分配角色
    ↓
3. 各 Agent 并行思考，提交观点
    ↓
4. CRITIC Agent 质疑和补充
    ↓
5. LEADER Agent 汇总共识
    ↓
6. 返回结构化结论
```

#### 消息类型

| 类型                  | 说明       | 示例                    |
| --------------------- | ---------- | ----------------------- |
| `USER_MESSAGE`        | 用户消息   | "请分析这个方案"        |
| `AGENT_RESPONSE`      | Agent 回复 | "从技术角度看..."       |
| `SYSTEM_NOTIFICATION` | 系统通知   | "任务已启动"            |
| `DEBATE_SUMMARY`      | 辩论总结   | "经过讨论，共识如下..." |

### 3. Mission（任务）编排

#### 创建任务

```typescript
POST /api/v1/ai-teams/topics/:topicId/missions
{
  "title": "竞品分析报告",
  "description": "分析三家主要竞品的优劣势",
  "context": {
    "competitors": ["A公司", "B公司", "C公司"]
  }
}

Response:
{
  "id": "mission-xxx",
  "status": "PLANNING", // PLANNING | EXECUTING | COMPLETED | FAILED
  "progress": 0
}
```

#### 启动任务

```typescript
POST /api/v1/ai-teams/missions/:id/start

# 系统自动执行:
1. 任务分解（TaskBreakdownService）
2. 分配 Agent（TeamCollaborationService）
3. 并行执行（MissionExecutionService）
4. 结果校验（MissionReviewService）
5. 汇总输出
```

#### 任务进度查询

```typescript
GET /api/v1/ai-teams/missions/:id

Response:
{
  "id": "mission-xxx",
  "status": "EXECUTING",
  "progress": 60,
  "tasks": [
    {
      "id": "task-1",
      "title": "分析 A 公司",
      "status": "COMPLETED",
      "assignedTo": "agent-xxx",
      "result": "..."
    },
    {
      "id": "task-2",
      "title": "分析 B 公司",
      "status": "EXECUTING",
      "assignedTo": "agent-yyy",
      "progress": 70
    }
  ]
}
```

### 4. 实时通信（WebSocket）

#### 连接

```typescript
import { io } from "socket.io-client";

const socket = io("wss://api.genesis.ai/ai-teams", {
  auth: { token: "YOUR_TOKEN" },
});

// 加入话题房间
socket.emit("joinTopic", { topicId: "topic-xxx" });
```

#### 监听事件

```typescript
// 新消息
socket.on("topic:message", (message) => {
  console.log("新消息:", message);
});

// 任务进度
socket.on("mission:progress", (event) => {
  console.log("任务进度:", event.progress);
});

// Agent 状态
socket.on("agent:status", (event) => {
  console.log("Agent 状态:", event.status);
});
```

### 5. 公开分享

#### 设为公开

```typescript
PATCH /api/v1/ai-teams/topics/:id
{
  "isPublic": true
}
```

#### 访问公开话题

```typescript
GET /api/v1/ai-teams/public/topics/:id

# 无需认证即可访问
# 可嵌入到博客、文章中展示 AI 团队的讨论成果
```

### 6. 书签转发

从资源库快速创建研讨话题：

```typescript
POST /api/v1/ai-teams/topics/from-bookmark
{
  "resourceId": "resource-xxx", // 资源库条目
  "question": "请分析这篇文章的核心观点"
}

# 系统自动:
1. 提取资源内容
2. 创建话题
3. 添加默认 Agent 团队
4. 启动分析任务
```

---

## API 接口

### Topic 管理

| 方法   | 路径                          | 说明         |
| ------ | ----------------------------- | ------------ |
| POST   | `/api/v1/ai-teams/topics`     | 创建话题     |
| GET    | `/api/v1/ai-teams/topics`     | 获取话题列表 |
| GET    | `/api/v1/ai-teams/topics/:id` | 获取话题详情 |
| PATCH  | `/api/v1/ai-teams/topics/:id` | 更新话题     |
| DELETE | `/api/v1/ai-teams/topics/:id` | 删除话题     |

### 成员管理

| 方法   | 路径                                            | 说明         |
| ------ | ----------------------------------------------- | ------------ |
| POST   | `/api/v1/ai-teams/topics/:id/members`           | 添加成员     |
| DELETE | `/api/v1/ai-teams/topics/:id/members/:memberId` | 移除成员     |
| GET    | `/api/v1/ai-teams/topics/:id/members`           | 获取成员列表 |

### 消息管理

| 方法 | 路径                                   | 说明         |
| ---- | -------------------------------------- | ------------ |
| POST | `/api/v1/ai-teams/topics/:id/messages` | 发送消息     |
| GET  | `/api/v1/ai-teams/topics/:id/messages` | 获取消息历史 |

### Mission 管理

| 方法 | 路径                                        | 说明         |
| ---- | ------------------------------------------- | ------------ |
| POST | `/api/v1/ai-teams/topics/:topicId/missions` | 创建任务     |
| POST | `/api/v1/ai-teams/missions/:id/start`       | 启动任务     |
| POST | `/api/v1/ai-teams/missions/:id/retry`       | 重试任务     |
| GET  | `/api/v1/ai-teams/missions/:id`             | 获取任务详情 |

### 公开分享

| 方法 | 路径                                 | 说明             |
| ---- | ------------------------------------ | ---------------- |
| GET  | `/api/v1/ai-teams/public/topics/:id` | 访问公开话题     |
| GET  | `/api/v1/ai-teams/public/topics`     | 浏览公开话题列表 |

---

## 数据模型

### AiTeamsTopic

```prisma
model AiTeamsTopic {
  id          String   @id @default(cuid())
  userId      String
  name        String
  description String?
  isPublic    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members     TopicMember[]
  messages    TopicMessage[]
  missions    TeamMission[]
}
```

### TeamMission

```prisma
model TeamMission {
  id          String   @id @default(cuid())
  topicId     String
  title       String
  description String?
  status      MissionStatus @default(PLANNING)
  progress    Int      @default(0)
  context     Json?
  result      Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tasks       MissionTask[]
}

enum MissionStatus {
  PLANNING
  EXECUTING
  COMPLETED
  FAILED
}
```

---

## 核心服务说明

### TeamCollaborationService

团队协作服务，负责：

- 任务分解和分配
- Agent 协调和调度
- 结果汇总和冲突解决

### MissionExecutionService

任务执行服务，负责：

- 执行具体任务
- 管理任务状态
- 处理超时和重试

### DebateService

辩论服务，负责：

- 组织多视角辩论
- 收集 Agent 观点
- 生成共识总结

### TopicContextRetrievalService

上下文检索服务，负责：

- 从话题历史提取相关信息
- 构建任务上下文
- 优化 token 使用

---

## 前端集成

### Hook 使用

```typescript
import { useTopics, useTopicMessages, useTopicWebSocket } from '@/hooks/domain';

function TopicPage({ topicId }) {
  const { topic, loading } = useTopic(topicId);
  const { messages, sendMessage } = useTopicMessages(topicId);
  const { connected } = useTopicWebSocket(topicId, {
    onMessage: (msg) => console.log('新消息:', msg),
    onProgress: (event) => console.log('进度:', event),
  });

  return (
    <div>
      <h1>{topic?.name}</h1>
      <MessageList messages={messages} />
      <MessageInput onSend={sendMessage} />
    </div>
  );
}
```

### 路由结构

```
/ai-teams
  ├── /                         # 话题列表
  ├── /new                      # 创建话题
  ├── /[topicId]                # 话题详情
  │   ├── /                     # 消息流
  │   ├── /members              # 成员管理
  │   └── /missions             # 任务列表
  └── /public/[topicId]         # 公开话题（无需登录）
```

---

## 使用指南

### 1. 创建话题并邀请 Agent

```bash
# 1. 创建话题
curl -X POST https://api.genesis.ai/api/v1/ai-teams/topics \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "产品方案讨论"}'

# 2. 添加 Agent
curl -X POST https://api.genesis.ai/api/v1/ai-teams/topics/TOPIC_ID/members \
  -d '{"agentId": "agent-critic", "role": "CRITIC"}'
```

### 2. 发起辩论

```bash
curl -X POST https://api.genesis.ai/api/v1/ai-teams/topics/TOPIC_ID/messages \
  -d '{
    "content": "我们应该优先开发哪个功能？",
    "triggerDebate": true
  }'

# Agent 会自动:
# 1. LEADER 分析问题
# 2. 各成员提出观点
# 3. CRITIC 质疑
# 4. LEADER 汇总共识
```

### 3. 创建并执行任务

```bash
# 创建任务
curl -X POST https://api.genesis.ai/api/v1/ai-teams/topics/TOPIC_ID/missions \
  -d '{
    "title": "竞品分析",
    "description": "对比三家竞品的功能和定价"
  }'

# 启动任务
curl -X POST https://api.genesis.ai/api/v1/ai-teams/missions/MISSION_ID/start
```

---

## 最佳实践

### 1. 合理配置团队

- **LEADER**: 必须有，负责协调
- **SUPPORTER**: 1-2 个，提供正向观点
- **CRITIC**: 1-2 个，挑战和质疑
- **OBSERVER**: 可选，客观总结

### 2. 任务拆分建议

- 每个任务聚焦单一目标
- 避免过于复杂的依赖关系
- 合理估计任务规模（建议 3-10 个子任务）

### 3. 上下文管理

- 定期清理无关消息
- 重要结论固定到话题描述
- 使用 Mission 管理复杂任务

---

## 相关文档

- [AI Engine 团队能力](../../../architecture/ai-engine.md)
- [自定义 AI 团队配置](../ai-agents/ai-teams-integration-complete.md)
- [WebSocket API 详细文档](../ai-coding/websocket-api.md)

---

## 更新日志

### v2.0 (2026-01-15)

- 新增 Mission 任务编排机制
- 优化辩论流程，支持多轮对话
- 增强上下文检索能力
- 添加公开分享功能

### v1.0 (2025-12-01)

- 初始版本发布
- 基础 Topic 和消息管理
- 简单辩论功能
