# AI Coding - 多Agent协作代码生成平台

> 通过多个AI Agent协作，实现从需求到可运行代码的完整软件开发流程

**最后更新**: 2025-12-21
**版本**: v1.0
**状态**: 已上线

---

## 概述

AI Coding 是 DeepDive Engine 的核心功能模块，通过多Agent协作流水线，自动化完成软件项目的需求分析、架构设计、任务分解、代码实现和质量保证全流程。

### 核心特性

- **多Agent协作流水线**: PM → Architect → PM Lead → Engineer → QA
- **Kanban看板管理**: 可视化项目状态，拖拽式管理
- **实时进度推送**: WebSocket实时更新执行状态
- **断点恢复**: 任务检查点持久化，支持故障恢复
- **代码下载**: 生成完整可运行的项目代码

---

## 系统架构

### Agent流水线

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  PM Agent   │ -> │  Architect   │ -> │  PM Lead    │
│  需求分析    │    │  Agent       │    │  Agent      │
│  PRD生成     │    │  系统设计     │    │  任务分解    │
└─────────────┘    └──────────────┘    └─────────────┘
                                              │
                                              v
                   ┌──────────────┐    ┌─────────────┐
                   │  QA Agent    │ <- │  Engineer   │
                   │  测试验证     │    │  Agent      │
                   │  质量保证     │    │  代码实现    │
                   └──────────────┘    └─────────────┘
```

### 技术栈

| 层级      | 技术选型                       |
| --------- | ------------------------------ |
| 后端服务  | NestJS 10 + TypeScript         |
| WebSocket | Socket.io + @nestjs/websockets |
| 数据存储  | PostgreSQL + Prisma            |
| 检查点    | PostgreSQL JSONB               |
| 前端      | Next.js 14 + React 18          |
| 状态管理  | React Hooks + Context          |

---

## 功能模块

### 1. 项目管理

#### 创建项目

- 支持文本描述需求
- 自动生成项目标题
- 选择技术栈模板

#### 项目列表

- 分页展示所有项目
- 按状态筛选（进行中/已完成/失败）
- 项目搜索和排序

#### 项目详情

- 查看PRD文档
- 查看架构设计
- 浏览生成的代码文件
- 下载完整项目

### 2. Agent协作流程

#### PM Agent (需求分析)

- 解析用户需求描述
- 生成结构化PRD文档
- 定义功能范围和验收标准
- 进度范围: 5% - 20%

#### Architect Agent (系统设计)

- 技术架构设计
- 模块划分和接口定义
- 技术选型建议
- 进度范围: 20% - 40%

#### PM Lead Agent (任务分解)

- 将设计转化为开发任务
- 优先级排序
- 依赖关系分析
- 进度范围: 40% - 50%

#### Engineer Agent (代码实现)

- 模块代码实现
- 单元测试编写
- 代码质量检查
- 进度范围: 50% - 80%

#### QA Agent (质量保证)

- 集成测试
- 功能验证
- 问题修复建议
- 进度范围: 80% - 95%

#### Document Agent (文档生成)

- README文档
- API文档
- 部署指南
- 进度范围: 95% - 100%

### 3. Kanban看板

#### 状态列

| 状态       | 说明       |
| ---------- | ---------- |
| PENDING    | 待处理项目 |
| PROCESSING | 执行中项目 |
| COMPLETED  | 已完成项目 |
| FAILED     | 失败项目   |

#### 功能特性

- 拖拽式状态变更
- Agent执行状态显示
- 实时进度更新
- 项目快速操作

### 4. 实时进度推送

#### WebSocket事件

| 事件名             | 说明          | 数据结构                             |
| ------------------ | ------------- | ------------------------------------ |
| `project:progress` | 项目进度更新  | `{phase, status, progress, message}` |
| `agent:status`     | Agent状态变更 | `{agent, status, message, output}`   |
| `project:complete` | 项目完成      | `{success, result}`                  |
| `project:error`    | 项目错误      | `{error, phase}`                     |

#### 前端Hook使用

```typescript
import { useAiCodingSocket } from '@/hooks/useAiCodingSocket';

function ProjectDetail({ projectId }) {
  const { isConnected, progress } = useAiCodingSocket({
    projectId,
    onProgress: (event) => console.log('进度:', event),
    onAgentStatus: (event) => console.log('Agent:', event),
    onComplete: (event) => console.log('完成:', event),
  });

  return <div>进度: {progress}%</div>;
}
```

### 5. 任务检查点

#### 检查点数据结构

```typescript
interface TaskCheckpoint {
  phase: CodingTaskPhase; // 当前阶段
  progress: number; // 进度百分比
  outputs: Record<string, unknown>; // 阶段输出
  agentStatus: Record<string, unknown>; // Agent状态
  timestamp: string; // 检查点时间
}
```

#### 断点恢复流程

1. 检查项目状态（PROCESSING/FAILED）
2. 验证检查点有效性（24小时内）
3. 从最后检查点恢复执行
4. 继续后续阶段

---

## API接口

### REST API

#### 项目管理

| 方法 | 路径                                        | 说明         |
| ---- | ------------------------------------------- | ------------ |
| POST | `/api/v1/ai-coding/projects`                | 创建项目     |
| GET  | `/api/v1/ai-coding/projects`                | 获取项目列表 |
| GET  | `/api/v1/ai-coding/projects/:id`            | 获取项目详情 |
| POST | `/api/v1/ai-coding/projects/:id/start`      | 启动项目     |
| POST | `/api/v1/ai-coding/projects/:id/iterate`    | 迭代优化     |
| GET  | `/api/v1/ai-coding/projects/:id/can-resume` | 检查可恢复性 |
| POST | `/api/v1/ai-coding/projects/:id/resume`     | 恢复执行     |
| GET  | `/api/v1/ai-coding/projects/:id/download`   | 下载代码     |

### WebSocket API

#### 连接

```
wss://api.deepdive.com/ai-coding
```

#### 加入项目房间

```typescript
socket.emit("joinProject", { projectId: "xxx" });
```

#### 离开项目房间

```typescript
socket.emit("leaveProject", { projectId: "xxx" });
```

---

## 数据模型

### AiCodingProject

```prisma
model AiCodingProject {
  id           String   @id @default(cuid())
  title        String
  description  String
  status       AiCodingProjectStatus @default(PENDING)
  progress     Int      @default(0)
  outputs      Json?    // 各阶段输出
  agentStatus  Json?    // Agent执行状态
  checkpoint   Json?    // 任务检查点
  errorMessage String?
  userId       String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  completedAt  DateTime?
}

enum AiCodingProjectStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

---

## 部署配置

### 环境变量

```bash
# WebSocket配置
WEBSOCKET_CORS_ORIGIN=http://localhost:3000

# AI服务配置
AI_MODEL_PROVIDER=grok  # grok | openai | claude
```

### 前端配置

```typescript
// next.config.js
module.exports = {
  env: {
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000",
  },
};
```

---

## 使用指南

### 1. 创建项目

1. 进入 AI Coding 页面
2. 点击"新建项目"
3. 输入项目需求描述
4. 选择技术栈（可选）
5. 点击"创建"

### 2. 启动执行

1. 在项目详情页点击"开始生成"
2. 观察实时进度更新
3. 等待Agent依次执行

### 3. 查看结果

1. 查看PRD文档（PM Agent输出）
2. 查看架构设计（Architect Agent输出）
3. 浏览代码文件（Engineer Agent输出）
4. 下载完整项目

### 4. 迭代优化

1. 在项目详情页输入优化建议
2. 点击"迭代优化"
3. Agent根据反馈调整输出

---

## 相关文档

- [WebSocket API详细文档](websocket-api.md)
- [Kanban功能设计](kanban-feature.md)
- [AI Agents能力概览](../ai-agents/ai-agents-capability-overview.md)
- [AI模块整合指南](../ai-agents/ai-modules-integration-guide.md)

---

## 更新日志

### v1.0 (2025-12-21)

- 初始版本发布
- 多Agent协作流水线
- Kanban看板管理
- WebSocket实时进度
- 任务检查点持久化
