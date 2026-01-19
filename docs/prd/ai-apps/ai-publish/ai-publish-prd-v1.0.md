# AI Publish 模块 PRD v1.0

> 将平台内容一键发布到社交平台

## 概述

### 功能定位

```
AI Research (研究报告) ──┐
AI Writing (写作)      ──┼──→ AI Publish ──→ 小红书/微信公众号/YouTube/X
AI Office (文档)       ──┘
```

### 数据源

| 数据源          | 模型                                               | 可发布内容 |
| --------------- | -------------------------------------------------- | ---------- |
| **AI Research** | `ResearchTopic` → `ResearchHistory.reportMarkdown` | 研究报告   |
| **AI Office**   | `OfficeDocument.content`                           | 文档内容   |
| **AI Writing**  | `WritingChapter.content`                           | 小说章节   |
| **手动输入**    | -                                                  | 自定义内容 |

### 核心价值

- **内容分发自动化**：一键将研究报告、文章发布到多平台
- **AI 内容适配**：根据目标平台特点自动转换内容格式
- **定时发布**：支持预约发布时间
- **状态追踪**：发布进度实时可见

### 访问权限

仅 `isAdmin` 用户可见和使用。

---

## 技术方案

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Backend Service (NestJS)                  │
├─────────────────────────────────────────────────────────────┤
│  Scheduler (Bull Queue)                                     │
│       │                                                     │
│       ▼                                                     │
│  PublishExecutor Service                                    │
│       │                                                     │
│       ├──→ Xiaohongshu Adapter (Playwright 自动化)          │
│       ├──→ WeChat MP Adapter (官方 API)                     │
│       ├──→ YouTube Adapter (官方 API)                       │
│       └──→ Twitter/X Adapter (官方 API)                     │
│                      │                                      │
│                      ▼                                      │
│              Playwright Service (Headless Chromium)         │
└─────────────────────────────────────────────────────────────┘
```

### 平台支持策略

| 平台            | 实现方式          | 优先级 | 说明                       |
| --------------- | ----------------- | ------ | -------------------------- |
| **小红书**      | Playwright 自动化 | P0     | 无官方 API，需浏览器自动化 |
| **微信公众号**  | 官方 API          | P1     | 需申请开发者权限           |
| **YouTube**     | YouTube Data API  | P2     | 官方 API                   |
| **X (Twitter)** | 官方 API          | P2     | 官方 API                   |

---

## 数据模型

### Prisma Schema

```prisma
enum PlatformType {
  WECHAT_MP      // 微信公众号
  XIAOHONGSHU    // 小红书
  YOUTUBE        // YouTube
  TWITTER_X      // X (Twitter)
}

enum PublishTaskStatus {
  DRAFT          // 草稿
  PENDING        // 待发布
  SCHEDULED      // 已排期
  PUBLISHING     // 发布中
  PUBLISHED      // 已发布
  FAILED         // 发布失败
}

// 平台连接
model PlatformConnection {
  id           String       @id @default(uuid())
  userId       String
  platformType PlatformType
  accessToken  String?      // OAuth token 或 session
  refreshToken String?
  accountName  String?      // 账号名称/昵称
  accountId    String?      // 平台账号 ID
  isActive     Boolean      @default(true)
  expiresAt    DateTime?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, platformType])
  @@index([userId])
}

// 发布任务
model PublishTask {
  id                 String            @id @default(uuid())
  userId             String
  status             PublishTaskStatus @default(DRAFT)
  platformType       PlatformType

  // 内容来源
  sourceType         String            // RESEARCH_REPORT | WRITING_PROJECT | MANUAL
  sourceId           String?           // 关联的源内容 ID

  // 原始内容
  originalTitle      String
  originalContent    String            @db.Text

  // 转换后内容（适配平台格式）
  transformedTitle   String?
  transformedContent String?           @db.Text

  // 发布配置
  scheduledAt        DateTime?         // 定时发布时间
  publishedAt        DateTime?         // 实际发布时间
  externalUrl        String?           // 发布后的链接
  externalId         String?           // 平台内容 ID

  // 错误信息
  errorMessage       String?
  retryCount         Int               @default(0)

  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt

  user               User              @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, status])
  @@index([status, scheduledAt])
}
```

---

## API 设计

### 端点列表

| Method | Endpoint                               | 描述                   |
| ------ | -------------------------------------- | ---------------------- |
| GET    | `/api/v1/ai-publish/platforms`         | 获取支持的平台列表     |
| GET    | `/api/v1/ai-publish/connections`       | 获取用户的平台连接状态 |
| POST   | `/api/v1/ai-publish/connections/:type` | 配置/更新平台连接      |
| DELETE | `/api/v1/ai-publish/connections/:type` | 断开平台连接           |
| POST   | `/api/v1/ai-publish/transform`         | AI 转换内容格式        |
| GET    | `/api/v1/ai-publish/tasks`             | 获取发布任务列表       |
| POST   | `/api/v1/ai-publish/tasks`             | 创建发布任务           |
| GET    | `/api/v1/ai-publish/tasks/:id`         | 获取任务详情           |
| PATCH  | `/api/v1/ai-publish/tasks/:id`         | 更新任务               |
| DELETE | `/api/v1/ai-publish/tasks/:id`         | 删除任务               |
| POST   | `/api/v1/ai-publish/tasks/:id/execute` | 立即执行发布           |

### 请求/响应示例

#### 创建发布任务

```typescript
// POST /api/v1/ai-publish/tasks
// Request
{
  "platformType": "XIAOHONGSHU",
  "sourceType": "RESEARCH_REPORT",
  "sourceId": "report-uuid",
  "originalTitle": "2024年AI发展趋势分析",
  "originalContent": "...",
  "scheduledAt": "2024-01-20T10:00:00Z"  // 可选，定时发布
}

// Response
{
  "id": "task-uuid",
  "status": "DRAFT",
  "platformType": "XIAOHONGSHU",
  "transformedTitle": "2024年AI发展趋势",  // AI 自动转换
  "transformedContent": "...",
  "scheduledAt": "2024-01-20T10:00:00Z"
}
```

#### AI 内容转换

```typescript
// POST /api/v1/ai-publish/transform
// Request
{
  "platformType": "XIAOHONGSHU",
  "title": "2024年AI发展趋势分析报告",
  "content": "..."
}

// Response
{
  "title": "2024年AI发展趋势",  // 简化标题
  "content": "...",             // 适配平台格式
  "suggestions": [
    "标题已缩短至20字以内",
    "内容已转换为小红书风格"
  ]
}
```

---

## 文件结构

### 后端 (NestJS)

```
backend/src/modules/ai-app/publish/
├── ai-publish.module.ts
├── ai-publish.controller.ts
├── ai-publish.service.ts
├── dto/
│   ├── index.ts
│   ├── create-publish-task.dto.ts
│   ├── update-publish-task.dto.ts
│   ├── transform-content.dto.ts
│   └── platform-connection.dto.ts
├── services/
│   ├── content-transformer.service.ts   # AI 内容转换
│   ├── publish-executor.service.ts      # 发布执行调度
│   ├── publish-scheduler.service.ts     # 定时任务管理
│   └── playwright.service.ts            # Playwright 浏览器控制
├── adapters/
│   ├── base-platform.adapter.ts         # 抽象基类
│   ├── xiaohongshu.adapter.ts           # 小红书适配器
│   ├── wechat-mp.adapter.ts             # 微信公众号适配器
│   ├── youtube.adapter.ts               # YouTube 适配器
│   └── twitter-x.adapter.ts             # X/Twitter 适配器
└── interfaces/
    ├── publish.interface.ts
    └── platform-adapter.interface.ts
```

### 前端 (Next.js)

```
frontend/
├── app/ai-publish/
│   ├── page.tsx                         # 主页面
│   └── [taskId]/page.tsx                # 任务详情页
├── components/ai-publish/
│   ├── index.ts
│   ├── PublishTaskList.tsx              # 任务列表
│   ├── PublishTaskCard.tsx              # 任务卡片
│   ├── PlatformConnectionCard.tsx       # 平台连接卡片
│   ├── ContentSourcePicker.tsx          # 内容源选择器
│   ├── ContentTransformEditor.tsx       # 内容转换编辑器
│   └── CreateTaskDialog.tsx             # 创建任务弹窗
└── hooks/domain/
    └── useAIPublish.ts                  # API hooks
```

---

## UI 设计

### 主页面布局

```
┌─────────────────────────────────────────────────────────────┐
│  AI 发布                                        [创建任务]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  平台连接                                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 小红书   │ │ 微信公众号│ │ YouTube │ │    X    │        │
│  │ ✓ 已连接 │ │ 未连接   │ │ 未连接  │ │ 未连接  │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
│  发布任务                                    筛选: [全部 ▼]  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ AI趋势分析        小红书    已发布    2024-01-15 10:00 ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ 深度研究报告      微信公众号  待发布   定时: 1-20 10:00 ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ 技术文章          小红书    草稿      -                 ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 创建任务流程

```
1. 选择内容来源
   ├── 从 AI Studio 选择研究报告
   ├── 从 AI Writing 选择文章
   └── 手动输入内容

2. 选择目标平台
   └── 小红书 / 微信公众号 / YouTube / X

3. AI 自动转换
   └── 根据平台特点优化标题、格式、长度

4. 预览和编辑
   └── 支持手动调整转换后的内容

5. 设置发布时间
   ├── 立即发布
   └── 定时发布

6. 确认发布
```

---

## 导航集成

### Sidebar.tsx

在 AI 工具分类、管理后台之前添加：

```tsx
{
  isAdmin && (
    <Link href="/ai-publish" className={linkClassName}>
      <Share2 className="h-5 w-5" />
      {showExpanded && <span>{t("nav.aiPublish")}</span>}
    </Link>
  );
}
```

### MobileNav.tsx

同样添加 AI Publish 入口。

---

## i18n 翻译

### zh.json

```json
{
  "nav": {
    "aiPublish": "AI 发布"
  },
  "aiPublish": {
    "title": "AI 发布",
    "subtitle": "将内容发布到社交平台",
    "createTask": "创建任务",
    "platformConnection": "平台连接",
    "publishTasks": "发布任务",
    "connected": "已连接",
    "notConnected": "未连接",
    "connect": "连接",
    "disconnect": "断开",
    "status": {
      "draft": "草稿",
      "pending": "待发布",
      "scheduled": "已排期",
      "publishing": "发布中",
      "published": "已发布",
      "failed": "发布失败"
    },
    "platform": {
      "xiaohongshu": "小红书",
      "wechatMp": "微信公众号",
      "youtube": "YouTube",
      "twitterX": "X"
    },
    "sourceType": {
      "researchReport": "研究报告",
      "writingProject": "写作项目",
      "manual": "手动输入"
    },
    "transform": {
      "title": "内容转换",
      "original": "原始内容",
      "transformed": "转换后内容",
      "regenerate": "重新生成"
    },
    "schedule": {
      "now": "立即发布",
      "scheduled": "定时发布",
      "selectTime": "选择时间"
    }
  }
}
```

### en.json

```json
{
  "nav": {
    "aiPublish": "AI Publish"
  },
  "aiPublish": {
    "title": "AI Publish",
    "subtitle": "Publish content to social platforms",
    "createTask": "Create Task",
    "platformConnection": "Platform Connections",
    "publishTasks": "Publish Tasks",
    "connected": "Connected",
    "notConnected": "Not Connected",
    "connect": "Connect",
    "disconnect": "Disconnect",
    "status": {
      "draft": "Draft",
      "pending": "Pending",
      "scheduled": "Scheduled",
      "publishing": "Publishing",
      "published": "Published",
      "failed": "Failed"
    },
    "platform": {
      "xiaohongshu": "Xiaohongshu",
      "wechatMp": "WeChat Official Account",
      "youtube": "YouTube",
      "twitterX": "X"
    },
    "sourceType": {
      "researchReport": "Research Report",
      "writingProject": "Writing Project",
      "manual": "Manual Input"
    },
    "transform": {
      "title": "Content Transform",
      "original": "Original Content",
      "transformed": "Transformed Content",
      "regenerate": "Regenerate"
    },
    "schedule": {
      "now": "Publish Now",
      "scheduled": "Schedule",
      "selectTime": "Select Time"
    }
  }
}
```

---

## 实施步骤

### 阶段 1: 基础设置 (1-2)

1. 重命名"我的团队"为"自建团队"（修改 i18n）
2. 添加 Prisma 数据模型，执行迁移
3. 创建后端模块骨架
4. 注册模块到 app.module.ts
5. 安装 `playwright-core` 依赖

### 阶段 2: 前端页面 (3-4)

6. 创建 /ai-publish 路由和主页面
7. 添加侧边栏导航入口
8. 添加 i18n 翻译
9. 创建基础组件

### 阶段 3: 核心后端服务 (5-6)

10. 实现 PlaywrightService
11. 实现 ContentTransformerService
12. 实现 BasePlatformAdapter 抽象类
13. 实现 XiaohongshuAdapter (P0)
14. 实现 PublishExecutorService
15. 实现 PublishSchedulerService

### 阶段 4: API 与集成 (7-8)

16. 实现平台连接管理 API
17. 实现发布任务 CRUD API
18. 实现内容转换 API
19. 前端对接 API

### 阶段 5: 部署配置 (9-10)

20. 配置 Railway/Docker Playwright 环境
21. 配置定时任务
22. 端到端测试

---

## 验证清单

- [ ] `npm run type-check` 类型检查通过
- [ ] `npx prisma migrate dev` 数据库迁移成功
- [ ] `npm run dev` 启动正常
- [ ] 管理员登录可见"AI 发布"菜单
- [ ] 非管理员登录不可见"AI 发布"菜单
- [ ] /ai-publish 页面正常渲染
- [ ] 平台连接功能正常
- [ ] 创建发布任务功能正常
- [ ] AI 内容转换功能正常
- [ ] 小红书 Playwright 发布测试通过

---

## 未来扩展

当 MVP 稳定后，可考虑：

- **Claude Code SDK 智能重试**：发布失败时使用 AI 智能处理验证码、页面变化
- **更多平台支持**：抖音、B 站、LinkedIn 等
- **批量发布**：一次发布到多个平台
- **数据分析**：发布内容的阅读量、互动量追踪

---

**版本**: v1.0
**创建日期**: 2025-01-18
**状态**: 待实施
