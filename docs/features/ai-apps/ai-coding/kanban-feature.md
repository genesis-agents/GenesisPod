# AI Coding Kanban 看板功能

> 可视化项目管理，拖拽式状态变更

**最后更新**: 2025-12-21
**版本**: v1.0
**参考设计**: [vibe-kanban](https://github.com/BloopAI/vibe-kanban)

---

## 概述

Kanban 看板提供 AI Coding 项目的可视化管理界面，支持拖拽式状态变更、实时进度显示和快速操作。

---

## 功能特性

### 1. 四列状态看板

| 列名   | 状态值     | 说明               | 颜色 |
| ------ | ---------- | ------------------ | ---- |
| 待处理 | PENDING    | 新创建未启动的项目 | 灰色 |
| 进行中 | PROCESSING | 正在执行的项目     | 蓝色 |
| 已完成 | COMPLETED  | 成功完成的项目     | 绿色 |
| 失败   | FAILED     | 执行失败的项目     | 红色 |

### 2. 项目卡片

每个项目以卡片形式展示，包含：

- **项目标题**: 项目名称
- **项目描述**: 需求描述（截断显示）
- **进度条**: 执行进度百分比
- **Agent状态**: 各Agent执行状态图标
- **时间信息**: 创建时间/完成时间
- **操作按钮**: 查看详情/启动/恢复

### 3. 拖拽交互

- 支持将卡片拖拽到不同状态列
- 拖拽时显示视觉反馈
- 放置时自动更新项目状态
- 支持同列内排序

### 4. 实时更新

- WebSocket 实时接收进度更新
- 自动刷新卡片进度条
- Agent 状态图标实时变化
- 项目完成自动移动到对应列

---

## 组件结构

```
KanbanBoard
├── KanbanColumn (PENDING)
│   └── KanbanCard
├── KanbanColumn (PROCESSING)
│   └── KanbanCard
├── KanbanColumn (COMPLETED)
│   └── KanbanCard
└── KanbanColumn (FAILED)
    └── KanbanCard
```

### KanbanBoard

主看板组件，管理整体布局和数据。

**Props**:

```typescript
interface KanbanBoardProps {
  projects: CodingProject[];
  onProjectClick: (project: CodingProject) => void;
  onStatusChange: (projectId: string, newStatus: ProjectStatus) => void;
}
```

### KanbanColumn

状态列组件，接收拖拽放置。

**Props**:

```typescript
interface KanbanColumnProps {
  status: ProjectStatus;
  title: string;
  projects: CodingProject[];
  onDrop: (projectId: string) => void;
}
```

### KanbanCard

项目卡片组件，可拖拽。

**Props**:

```typescript
interface KanbanCardProps {
  project: CodingProject;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}
```

---

## 拖拽实现

使用 HTML5 原生 Drag and Drop API：

```typescript
// 开始拖拽
const handleDragStart = (e: DragEvent, projectId: string) => {
  e.dataTransfer.setData("projectId", projectId);
  e.dataTransfer.effectAllowed = "move";
};

// 放置目标
const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
};

// 放置
const handleDrop = (e: DragEvent, targetStatus: ProjectStatus) => {
  e.preventDefault();
  const projectId = e.dataTransfer.getData("projectId");
  onStatusChange(projectId, targetStatus);
};
```

---

## Agent 状态图标

| Agent     | 图标 | 待处理 | 运行中   | 已完成 | 失败 |
| --------- | ---- | ------ | -------- | ------ | ---- |
| PM        | 📋   | 灰色   | 蓝色动画 | 绿色   | 红色 |
| Architect | 🏗️   | 灰色   | 蓝色动画 | 绿色   | 红色 |
| PM Lead   | 📊   | 灰色   | 蓝色动画 | 绿色   | 红色 |
| Engineer  | 💻   | 灰色   | 蓝色动画 | 绿色   | 红色 |
| QA        | ✅   | 灰色   | 蓝色动画 | 绿色   | 红色 |

---

## 样式设计

### 颜色方案

```css
:root {
  --kanban-pending: #6b7280; /* 灰色 */
  --kanban-processing: #3b82f6; /* 蓝色 */
  --kanban-completed: #10b981; /* 绿色 */
  --kanban-failed: #ef4444; /* 红色 */
}
```

### 卡片样式

```css
.kanban-card {
  @apply bg-white rounded-lg shadow-sm p-4;
  @apply border border-gray-200;
  @apply hover:shadow-md transition-shadow;
  @apply cursor-grab active:cursor-grabbing;
}

.kanban-card.dragging {
  @apply opacity-50 shadow-lg;
}
```

### 列样式

```css
.kanban-column {
  @apply bg-gray-50 rounded-lg p-4;
  @apply min-h-[500px] w-[300px];
}

.kanban-column.drag-over {
  @apply bg-blue-50 border-2 border-blue-300 border-dashed;
}
```

---

## 快捷操作

### 卡片悬停菜单

- **查看详情**: 跳转到项目详情页
- **启动/恢复**: 启动执行或恢复中断的项目
- **删除**: 删除项目（需确认）

### 列头操作

- **刷新**: 刷新该状态的项目列表
- **排序**: 按时间/进度排序

---

## 页面路由

```
/ai-coding/kanban - Kanban看板视图
/ai-coding         - 列表视图（默认）
```

### 视图切换

提供列表视图和看板视图的切换按钮：

```typescript
<div className="flex gap-2">
  <Button onClick={() => router.push('/ai-coding')}>
    列表视图
  </Button>
  <Button onClick={() => router.push('/ai-coding/kanban')}>
    看板视图
  </Button>
</div>
```

---

## 相关文档

- [AI Coding 功能概览](ai-coding-overview.md)
- [WebSocket API](websocket-api.md)
