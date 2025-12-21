# AI Coding WebSocket API

> 实时进度推送接口文档

**最后更新**: 2025-12-21
**版本**: v1.0

---

## 概述

AI Coding 使用 WebSocket 实现项目执行进度的实时推送，基于 Socket.io 协议。

---

## 连接配置

### 端点

```
生产环境: wss://api.deepdive.com/ai-coding
开发环境: ws://localhost:4000/ai-coding
```

### 认证

连接时需要在 `auth` 参数中传入访问令牌：

```typescript
const socket = io("/ai-coding", {
  auth: {
    token: accessToken,
  },
});
```

---

## 客户端事件

### joinProject

加入项目房间，开始接收该项目的事件推送。

**参数**:

```typescript
{
  projectId: string;
}
```

**示例**:

```typescript
socket.emit("joinProject", { projectId: "clx123..." });
```

### leaveProject

离开项目房间，停止接收该项目的事件推送。

**参数**:

```typescript
{
  projectId: string;
}
```

**示例**:

```typescript
socket.emit("leaveProject", { projectId: "clx123..." });
```

---

## 服务端事件

### project:progress

项目进度更新事件。

**数据结构**:

```typescript
interface ProjectProgressEvent {
  projectId: string;
  phase:
    | "init"
    | "pm"
    | "architect"
    | "pm_lead"
    | "engineer"
    | "qa"
    | "document"
    | "complete";
  status: "started" | "progress" | "completed" | "failed";
  progress: number; // 0-100
  message: string;
  data?: unknown;
}
```

**示例**:

```typescript
socket.on("project:progress", (event) => {
  console.log(`阶段: ${event.phase}, 进度: ${event.progress}%`);
});
```

### agent:status

Agent 状态变更事件。

**数据结构**:

```typescript
interface AgentStatusEvent {
  projectId: string;
  agent: "pm" | "architect" | "pmLead" | "engineer" | "qa";
  status: "pending" | "running" | "completed" | "failed";
  message?: string;
  output?: unknown;
}
```

**示例**:

```typescript
socket.on("agent:status", (event) => {
  console.log(`Agent ${event.agent}: ${event.status}`);
});
```

### project:complete

项目完成事件。

**数据结构**:

```typescript
{
  projectId: string;
  success: boolean;
  result?: unknown;
  timestamp: string;
}
```

### project:error

项目错误事件。

**数据结构**:

```typescript
{
  projectId: string;
  error: string;
  phase?: string;
  timestamp: string;
}
```

---

## 前端 Hook

### useAiCodingSocket

封装的 React Hook，简化 WebSocket 连接管理。

**导入**:

```typescript
import { useAiCodingSocket } from "@/hooks/useAiCodingSocket";
```

**参数**:

```typescript
interface UseAiCodingSocketOptions {
  projectId?: string;
  autoConnect?: boolean;
  onProgress?: (event: ProjectProgressEvent) => void;
  onAgentStatus?: (event: AgentStatusEvent) => void;
  onComplete?: (event: CompleteEvent) => void;
  onError?: (event: ErrorEvent) => void;
}
```

**返回值**:

```typescript
interface UseAiCodingSocketReturn {
  isConnected: boolean;
  progress: number;
  currentPhase: string | null;
  connect: () => void;
  disconnect: () => void;
  joinProject: (projectId: string) => void;
  leaveProject: (projectId: string) => void;
}
```

**使用示例**:

```typescript
function ProjectDetail({ projectId }) {
  const {
    isConnected,
    progress,
    currentPhase,
  } = useAiCodingSocket({
    projectId,
    onProgress: (event) => {
      setProgressMessage(event.message);
    },
    onComplete: (event) => {
      if (event.success) {
        toast.success('项目生成完成！');
        refetchProject();
      }
    },
  });

  return (
    <div>
      <div>连接状态: {isConnected ? '已连接' : '未连接'}</div>
      <div>当前阶段: {currentPhase}</div>
      <div>进度: {progress}%</div>
    </div>
  );
}
```

---

## 进度阶段

| 阶段    | Phase值     | 进度范围 | 说明       |
| ------- | ----------- | -------- | ---------- |
| 初始化  | `init`      | 0-5%     | 项目初始化 |
| PM      | `pm`        | 5-20%    | 需求分析   |
| 架构师  | `architect` | 20-40%   | 系统设计   |
| PM Lead | `pm_lead`   | 40-50%   | 任务分解   |
| 工程师  | `engineer`  | 50-80%   | 代码实现   |
| QA      | `qa`        | 80-95%   | 质量保证   |
| 文档    | `document`  | 95-100%  | 文档生成   |
| 完成    | `complete`  | 100%     | 项目完成   |

---

## 错误处理

### 连接断开重连

Hook 内置自动重连机制：

```typescript
const socket = io("/ai-coding", {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
```

### 认证失败

如果 token 无效，服务端会断开连接并返回错误：

```typescript
socket.on("connect_error", (error) => {
  if (error.message === "Authentication failed") {
    // 刷新 token 或重新登录
  }
});
```

---

## 相关文档

- [AI Coding 功能概览](ai-coding-overview.md)
- [Kanban 功能设计](kanban-feature.md)
