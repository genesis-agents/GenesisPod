# 通知系统诊断报告

> DeepDive Engine 通知系统全面诊断分析
>
> **诊断日期**: 2026-01-18
> **完成度评估**: 20-30%
> **状态**: 严重缺失，需要重新设计

---

## 执行摘要

项目中存在**两个独立的通知系统**，但都存在重大缺陷和功能不完整的问题：

1. **前端本地通知系统** - 仅基于 localStorage，无持久化、无服务端支持
2. **实时事件推送系统** - 仅用于 AI 任务实时进度，不是通用通知系统

**关键问题**：缺少**企业级用户通知系统**，用户无法接收系统通知、事件通知或设置偏好。

---

## 1. 现有通知系统分析

### 1.1 前端本地通知系统 (settingsStore)

**文件位置**：

- `frontend/stores/settingsStore.ts`
- `frontend/app/notifications/page.tsx`

**架构特点**：

```typescript
export interface Notification {
  id: string;
  type: "system" | "feature" | "update" | "tip";
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  persistent?: boolean;
}
```

**功能完整性**：

- ✅ 标记已读/未读
- ✅ 删除单条通知
- ✅ 清空所有通知
- ✅ 所有通知页面 (`/notifications`)
- ✅ 存储到 localStorage (`deepdive-settings-storage`)
- ❌ **无持久化到数据库**
- ❌ **无通知来源（hardcoded）**
- ❌ **无实时推送**

**初始通知 (hardcoded)**：

```typescript
const INITIAL_NOTIFICATIONS = [
  {
    type: "update",
    title: "DeepDive v1.0 Released",
    message: "Welcome to DeepDive!...",
    read: false,
    actionUrl: "/",
    persistent: true,
  },
  {
    type: "tip",
    title: "Try AI Office",
    message: "Create professional documents...",
    read: false,
    actionUrl: "/ai-office",
  },
];
```

**问题**：

1. 仅初始化 2 条硬编码通知
2. 用户无法在应用中生成通知
3. 刷新页面后，未在 localStorage 中保存的通知消失
4. 没有后端通知来源

---

### 1.2 实时事件推送系统 (WebSocket Events)

**WebSocket Gateways**：

- `backend/src/modules/ai-app/research/topic-research/topic-research.gateway.ts`
- `backend/src/modules/ai-app/teams/ai-teams.gateway.ts`
- `backend/src/modules/ai-app/writing/ai-writing.gateway.ts`
- `backend/src/modules/ai-app/coding/ai-coding.gateway.ts`

**事件发射器**：

- `backend/src/modules/ai-app/research/topic-research/services/research-event-emitter.service.ts` (749行)
- `backend/src/modules/ai-app/teams/services/events/topic-event-emitter.service.ts`
- `backend/src/modules/ai-app/writing/services/events/writing-event-emitter.service.ts`

**支持的事件类型** (研究系统为例)：

```typescript
enum ResearchEventType {
  // Mission 状态
  MISSION_STARTED = "mission:started",
  MISSION_PROGRESS = "mission:progress",
  MISSION_COMPLETED = "mission:completed",
  MISSION_FAILED = "mission:failed",

  // Leader 事件
  LEADER_THINKING = "leader:thinking",
  LEADER_PLANNING = "leader:planning",
  LEADER_PLAN_READY = "leader:plan_ready",
  LEADER_RESPONSE = "leader:response",

  // Agent 工作事件
  AGENT_WORKING = "agent:working",
  AGENT_COMPLETED = "agent:completed",
  AGENT_FAILED = "agent:failed",

  // 任务事件
  TASK_STARTED = "task:started",
  TASK_PROGRESS = "task:progress",
  TASK_COMPLETED = "task:completed",
  TASK_FAILED = "task:failed",

  // 维度研究事件
  DIMENSION_RESEARCH_STARTED = "dimension:research_started",
  DIMENSION_RESEARCH_PROGRESS = "dimension:research_progress",
  DIMENSION_RESEARCH_COMPLETED = "dimension:research_completed",

  // 报告事件
  REPORT_SYNTHESIS_STARTED = "report:synthesis_started",
  REPORT_SYNTHESIS_PROGRESS = "report:synthesis_progress",
  REPORT_SYNTHESIS_COMPLETED = "report:synthesis_completed",
}
```

**局限性**：

- ✅ 实时推送到连接的客户端
- ✅ WebSocket room 隔离 (按 topicId/projectId)
- ✅ 持久化到数据库 (ResearchTeamMessage, ResearchAgentActivity)
- ❌ **仅用于 AI 任务进度，非通知系统**
- ❌ **不支持通用事件通知**
- ❌ **无用户订阅管理**
- ❌ **无持久队列**

---

### 1.3 临时 Toast 通知系统

**文件位置**：

- `frontend/stores/toastStore.ts`

**功能**：

```typescript
export interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  duration?: number; // 默认 5s，错误8s
}
```

**特点**：

- ✅ 自动消失 (可配置)
- ❌ **完全临时**，刷新消失
- ❌ **无持久化**
- 用于表单提交反馈、API 错误提示

---

## 2. 数据库模型分析

### 2.1 现有通知相关表

**ResearchTeamMessage** (仅限研究模块)：

```prisma
model ResearchTeamMessage {
  id           String @id @default(uuid())
  topicId      String
  missionId    String
  messageType  ResearchMessageType
  senderRole   String?
  senderName   String?
  content      String @db.Text
  metadata     Json?
  createdAt    DateTime @default(now())

  topic        ResearchTopic @relation(...)

  @@index([topicId, missionId])
}
```

**ResearchAgentActivity** (仅限研究模块)：

```prisma
model ResearchAgentActivity {
  id              String @id @default(uuid())
  topicId         String
  missionId       String
  agentId         String
  agentName       String
  agentRole       String
  activityType    AgentActivityType
  phase           String?
  content         String @db.Text
  progress        Int @default(0)
  // ... 更多字段

  @@index([topicId, missionId, agentRole])
}
```

### 2.2 缺失的模型

- ❌ **Notification** - 通用通知表
- ❌ **NotificationPreference** - 用户通知偏好设置
- ❌ **UserNotificationSubscription** - 用户订阅管理
- ❌ **NotificationQueue** - 通知发送队列

### 2.3 User 模型

```prisma
model User {
  id                String
  email             String @unique
  username          String? @unique
  preferences       Json @default("{}")  // ← 通知设置应该在这里（未使用）
  isActive          Boolean @default(true)
  isVerified        Boolean @default(false)
  // ... 其他字段
}
```

**问题**：preferences JSON 字段存在但完全未使用于通知设置。

---

## 3. 通知流程分析

### 3.1 前端通知流程

```
加载应用
  ↓
settingsStore 初始化 → 从 localStorage 读取
  ↓
如果无缓存 → 使用 INITIAL_NOTIFICATIONS (2条hardcoded)
  ↓
用户在应用中... (无新通知来源)
  ↓
点击 /notifications 页面 → 显示本地通知
  ↓
标记已读 → 更新 localStorage
  ↓
刷新页面 → 从 localStorage 恢复状态
```

**缺陷**：

- 仅显示初始 2 条通知
- 无法从服务端拉取新通知
- 无实时推送机制
- 无通知来源控制

### 3.2 后端事件流程 (仅研究模块)

```
ResearchService 执行任务
  ↓
eventEmitter.emitToTopic(topicId, event, data)
  ↓
ResearchEventEmitterService.emitToTopic()
  ├─ 发送 WebSocket (通过 Gateway)
  └─ 保存到 ResearchTeamMessage 表
  ↓
前端订阅 WebSocket → 实时接收事件
  ↓
但不转换为通知系统的通知
```

**缺陷**：

- 事件仅推送到同房间客户端
- 无持久化队列（消息丢失可能）
- 无离线用户处理
- 事件不流向用户通知系统

---

## 4. UI 通知组件

### 4.1 通知页面

**文件**：`frontend/app/notifications/page.tsx`

**功能**：

- ✅ 显示通知列表
- ✅ 按类型筛选 (All/Unread)
- ✅ 标记已读
- ✅ 删除通知
- ✅ 批量操作

**显示类型**：

```
Feature (紫色)  - Sparkles 图标
Update  (绿色)  - RefreshCw 图标
Tip     (琥珀)  - Zap 图标
System  (蓝色)  - Info 图标
```

### 4.2 通知入口

**Sidebar** (`frontend/components/layout/Sidebar.tsx`):

```typescript
<Link href="/notifications" ...>
  {/* Bell 图标 */}
  {showExpanded && <span>{t('nav.notifications')}</span>}
</Link>
```

**问题**：

- 无未读通知计数徽章
- 无实时通知预览
- 无新通知提示

### 4.3 缺失的通知 UI

- ❌ 通知 bell 图标的未读计数徽章
- ❌ 通知中心下拉菜单预览
- ❌ 桌面通知 (Web Notifications API)
- ❌ 邮件通知选项
- ❌ 通知声音提示
- ❌ 通知偏好设置页面

---

## 5. 关键问题诊断

### 5.1 功能缺失

| 功能           | 状态   | 位置                      |
| -------------- | ------ | ------------------------- |
| 通用通知模型   | ❌ 无  | DB 缺失                   |
| 用户订阅管理   | ❌ 无  | DB+API 缺失               |
| 通知偏好设置   | ❌ 无  | UI+API 缺失               |
| 服务端通知 API | ❌ 无  | Controller 缺失           |
| 通知队列系统   | ❌ 无  | 无持久队列                |
| 邮件通知       | ❌ 无  | 仅有 email module，未集成 |
| 事件到通知转换 | ❌ 无  | 事件未转成通知            |
| 离线通知保存   | ❌ 无  | localStorage 仅限本地     |
| 通知历史查询   | △ 部分 | 仅研究模块有              |
| 批量通知操作   | ✅ 有  | 前端可标记全部已读        |

### 5.2 架构问题

**问题 1：两个通知系统互不关联**

```
前端 settings store ←→ localStorage ←→ 无服务端

WebSocket events ←→ ResearchTeamMessage (仅研究模块)
                 ←→ 不流向用户通知系统
```

**问题 2：事件未转换为通知**

```
ResearchEventType.MISSION_COMPLETED
  ↓
WebSocket 推送 → 前端显示在timeline
  ↓
❌ 未创建为 Notification（无法在通知中心查看）
```

**问题 3：无用户通知订阅**

```
当前：用户收到所有通知（无法定制）
应该：用户订阅感兴趣的事件类型
```

**问题 4：无实时通知推送**

```
前端仅在以下情况接收通知：
1. 页面加载时从 localStorage
2. 手动调用 addNotification()（无人调用）
3. WebSocket 任务进度（仅研究/写作/编码模块）
```

---

### 5.3 代码质量问题

**问题 1：无后端通知 API**

```
缺失的 controller 方法：
- GET /api/notifications - 获取通知列表
- POST /api/notifications/{id}/read - 标记已读
- DELETE /api/notifications/{id} - 删除通知
- GET /api/notifications/settings - 获取偏好设置
- PUT /api/notifications/settings - 更新偏好设置
```

**问题 2：无通知权限隔离**

```
settingsStore 没有用户隔离
→ 刷新页面所有用户通知消失
→ 登出后通知仍在 localStorage
```

**问题 3：WebSocket 事件无确认机制**

```
ResearchEventEmitterService.emitToTopic()
  ↓
如果没有连接的客户端 → 事件消失（无队列）
```

**问题 4：Toast 与 Notification 混淆**

```
toast.ts - 临时浮窗通知 (5-8s自动消失)
settingsStore.ts - 持久通知 (存储在localStorage)

应该明确区分：
- Toast: 操作反馈（表单提交、错误）
- Notification: 系统通知（持久化、可查看）
```

---

## 6. 建议的数据库模型

### 6.1 Notification 模型

```prisma
model Notification {
  id            String @id @default(uuid())
  userId        String

  // 通知内容
  type          String  // system, feature, update, tip, event
  category      String  // research, writing, teams, admin
  title         String
  message       String @db.Text
  actionUrl     String?
  actionLabel   String?

  // 状态
  read          Boolean @default(false)
  readAt        DateTime?
  archived      Boolean @default(false)

  // 数据
  metadata      Json?

  // 时间
  createdAt     DateTime @default(now())
  expiresAt     DateTime?

  // 关系
  user          User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, read, createdAt])
  @@index([userId, expiresAt])
  @@map("notifications")
}
```

### 6.2 NotificationPreference 模型

```prisma
model NotificationPreference {
  id        String @id @default(uuid())
  userId    String @unique

  // 推送通道偏好
  emailEnabled      Boolean @default(false)
  pushEnabled       Boolean @default(true)
  smsEnabled        Boolean @default(false)

  // 类型偏好
  researchEnabled   Boolean @default(true)
  writingEnabled    Boolean @default(true)
  teamsEnabled      Boolean @default(true)
  adminEnabled      Boolean @default(true)

  // 时间设置
  quietHoursStart   Int?
  quietHoursEnd     Int?
  timezone          String @default("UTC")

  user              User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("notification_preferences")
}
```

### 6.3 NotificationQueue 模型

```prisma
model NotificationQueue {
  id             String @id @default(uuid())
  notificationId String
  userId         String

  // 发送状态
  status     String @default("pending") // pending, sent, failed, retried
  channel    String @default("ui")      // ui, email, push, sms

  // 重试信息
  retryCount Int @default(0)
  maxRetries Int @default(3)
  nextRetry  DateTime?

  // 错误信息
  error      String?

  createdAt  DateTime @default(now())
  sentAt     DateTime?

  @@index([userId, status])
  @@index([status, nextRetry])
  @@map("notification_queue")
}
```

---

## 7. 建议的后端服务

### 7.1 缺失模块

应在 `backend/src/modules/core/notifications/` 创建：

```
backend/src/modules/core/notifications/
├─ notification.service.ts
├─ notification.controller.ts
├─ notification-preference.service.ts
├─ dto/
│  ├─ create-notification.dto.ts
│  └─ notification-preference.dto.ts
└─ notification.module.ts
```

### 7.2 NotificationService

```typescript
@Injectable()
export class NotificationService {
  // 创建通知
  async createNotification(userId: string, data: CreateNotificationDto);

  // 发送通知（可能触发邮件、推送等）
  async sendNotification(notificationId: string);

  // 批量发送
  async broadcastNotification(data: BroadcastDto);

  // 获取用户通知
  async getUserNotifications(userId: string, options?: QueryOptions);

  // 标记已读
  async markAsRead(notificationId: string);

  // 标记全部已读
  async markAllAsRead(userId: string);

  // 获取偏好设置
  async getPreferences(userId: string);

  // 更新偏好设置
  async updatePreferences(userId: string, data: PreferenceDto);

  // 删除通知
  async deleteNotification(notificationId: string);
}
```

### 7.3 NotificationController

```typescript
@Controller('notifications')
export class NotificationController {
  @Get('/')
  getNotifications() // 获取用户通知列表

  @Patch('/:id/read')
  markAsRead() // 标记单条已读

  @Post('/mark-all-read')
  markAllAsRead() // 标记全部已读

  @Delete('/:id')
  delete() // 删除通知

  @Get('/preferences')
  getPreferences() // 获取偏好设置

  @Put('/preferences')
  updatePreferences() // 更新偏好设置
}
```

---

## 8. 改进建议（优先级）

### P0 - 关键功能缺失

1. 创建 NotificationService + Controller
2. 添加 Notification Prisma 模型
3. 实现通知 CRUD API
4. 事件到通知转换
5. 后端通知存储和查询

### P1 - 核心特性

6. 用户通知偏好设置
7. NotificationPreference Prisma 模型
8. 通知过滤和订阅系统
9. 前端 API 集成
10. 通知列表/中心页面改进

### P2 - 用户体验

11. NotificationBell 组件（带计数）
12. 通知下拉预览
13. 未读徽章
14. 新通知提示动画
15. 批量操作（标记全部已读）

### P3 - 高级特性

16. 邮件通知集成
17. 推送通知 (Web Push API)
18. 通知声音/振动
19. 离线通知队列
20. 通知搜索和过滤

---

## 9. 关键文件位置总结

### 前端

| 文件                                     | 行数 | 功能         | 问题         |
| ---------------------------------------- | ---- | ------------ | ------------ |
| `frontend/stores/settingsStore.ts`       | 230  | 本地通知存储 | 无服务端支持 |
| `frontend/stores/toastStore.ts`          | 66   | 临时通知     | 仅UI反馈     |
| `frontend/app/notifications/page.tsx`    | 269  | 通知页面     | 无API集成    |
| `frontend/components/layout/Sidebar.tsx` | 832  | 导航栏       | 无通知badge  |
| `frontend/lib/api.ts`                    | 300+ | API工具      | 无通知API    |

### 后端

| 文件                                                                        | 行数   | 功能      | 问题               |
| --------------------------------------------------------------------------- | ------ | --------- | ------------------ |
| `backend/src/common/events/event-bus.service.ts`                            | 153    | 事件总线  | 仅限内部事件       |
| `backend/src/modules/ai-app/research/.../research-event-emitter.service.ts` | 749    | 研究事件  | 模块化，不通用     |
| `backend/src/modules/ai-app/.../...gateway.ts`                              | 多个   | WebSocket | 仅任务进度         |
| `backend/prisma/schema/models.prisma`                                       | 11000+ | DB模型    | 缺Notification模型 |

### 缺失模块

```
backend/src/modules/core/notifications/
  ├─ notification.service.ts          [完全缺失]
  ├─ notification.controller.ts       [完全缺失]
  ├─ notification-preference.service.ts [完全缺失]
  ├─ dto/
  │  ├─ create-notification.dto.ts    [完全缺失]
  │  └─ notification-preference.dto.ts [完全缺失]
  └─ notification.module.ts           [完全缺失]
```

---

## 10. 现状总结

| 方面         | 评分 | 说明                                  |
| ------------ | ---- | ------------------------------------- |
| **数据模型** | 1/10 | 完全缺失，仅有本地 Zustand store      |
| **后端API**  | 0/10 | 无任何通知API端点                     |
| **前端UI**   | 3/10 | 有通知页面，但无实时更新，无徽章      |
| **实时推送** | 5/10 | WebSocket系统只用于AI任务，未服务通知 |
| **用户偏好** | 1/10 | User.preferences JSON未使用           |
| **事件集成** | 1/10 | 事件未转化为通知                      |
| **持久化**   | 2/10 | 仅localStorage，无DB支持              |
| **离线支持** | 0/10 | 完全无离线通知                        |

**总体评估**：项目缺少企业级通知系统，目前仅有玩具式本地通知实现。

---

## 11. 建议的实现路线图

**第1阶段（1-2周）**：创建通知基础设施

- [ ] 创建 Notification Prisma 模型
- [ ] 创建 NotificationService
- [ ] 创建 NotificationController (CRUD APIs)
- [ ] 添加后端数据库迁移

**第2阶段（1周）**：前端集成

- [ ] 创建 `useNotifications()` hook
- [ ] 更新 `/notifications` 页面从API拉取
- [ ] 添加通知badge到 Sidebar

**第3阶段（1周）**：事件转换

- [ ] 创建 EventToNotificationConverter
- [ ] 集成研究/写作/Teams事件
- [ ] 实现自动通知创建

**第4阶段（1周）**：用户偏好

- [ ] 创建 NotificationPreference 模型
- [ ] 创建偏好设置UI
- [ ] 实现过滤和订阅逻辑

**第5阶段（可选）**：高级特性

- [ ] 邮件通知
- [ ] Web推送通知
- [ ] 离线队列

---

**最后更新**: 2026-01-18
**诊断人**: Claude Code
