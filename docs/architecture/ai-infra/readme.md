# Genesis 基础设施架构文档

本目录包含 Genesis.ai 项目使用的关键技术的核心原理和实现细节。

## 目录结构

```
infra/
├── readme.md                    # 本文件 - 基础设施总览
├── frontend/                    # 前端技术栈
│   ├── frontend-nextjs-react.md # Next.js 14 + React 18
│   ├── frontend-state-management.md  # TanStack Query + Zustand
│   └── frontend-ui-components.md     # UI组件库
├── backend/                     # 后端技术栈
│   ├── backend-nestjs.md        # NestJS 10 框架
│   └── backend-prisma-orm.md    # Prisma ORM
├── database/                    # 数据库技术
│   ├── database-postgresql.md   # PostgreSQL 高级特性
│   └── database-redis.md        # Redis 缓存策略
├── ai-llm/                      # AI/LLM 技术
│   ├── ai-llm-orchestration.md  # AI 编排服务
│   ├── ai-llm-multi-model.md    # 多模型架构
│   └── ai-llm-streaming.md      # 流式响应
├── realtime/                    # 实时通讯
│   ├── realtime-websocket.md    # WebSocket (Socket.io)
│   └── realtime-sse.md          # Server-Sent Events
└── data-collection/             # 数据采集
    ├── data-collection-crawler.md      # 爬虫技术
    └── data-collection-data-sources.md # 数据源集成
```

## 技术栈概览

```
┌───────────────────────────────────────────────────────────────┐
│                   Genesis Architecture                        │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                  Frontend Layer                       │    │
│  │  Next.js 14.2.35 + React 18.3 + TypeScript 5.3       │    │
│  │  State: TanStack Query 5.28 + Zustand 4.5            │    │
│  │  UI: Radix UI + Mantine + TipTap + BlockNote         │    │
│  │  Charts: D3.js + Recharts + Mermaid                  │    │
│  └──────────────────────────────────────────────────────┘    │
│                          │                                     │
│                   REST API / SSE / WebSocket                  │
│                          │                                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                  Backend Layer                        │    │
│  │  NestJS 10.3 + Express + Prisma ORM 5.10             │    │
│  │  Auth: Passport.js + JWT + OAuth2 (Google)           │    │
│  │  Security: Helmet + Throttler + CORS                 │    │
│  │  Real-time: Socket.io 4.8.1 + Server-Sent Events     │    │
│  └──────────────────────────────────────────────────────┘    │
│                          │                                     │
│       ┌──────────────────┼──────────────────┐                 │
│       │                  │                  │                 │
│  ┌────┴────┐      ┌──────┴──────┐    ┌─────┴─────┐           │
│  │PostgreSQL│      │  MongoDB    │    │  Neo4j    │           │
│  │   16     │      │   (文档)    │    │  (图谱)   │           │
│  │ 主数据库 │      │   可选      │    │   可选    │           │
│  └─────────┘      └─────────────┘    └───────────┘           │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                  AI Engine Layer                      │    │
│  │  • Database-driven Model Configuration                │    │
│  │  • Multi-model Support (OpenAI/Anthropic/Google/xAI) │    │
│  │  • Task Profile Mapper (语义化参数配置)                │    │
│  │  • Model Fallback & Error Handling                    │    │
│  └──────────────────────────────────────────────────────┘    │
│                          │                                     │
│       ┌──────────────────┼──────────────────┐                 │
│       │                  │                  │                 │
│  ┌────┴────┐      ┌──────┴──────┐    ┌─────┴─────┐           │
│  │ OpenAI  │      │ Anthropic   │    │  Google   │           │
│  │ GPT-4o  │      │  Claude     │    │  Gemini   │           │
│  │ GPT-5.1 │      │ Sonnet 4.5  │    │  2.0 Flash│           │
│  └─────────┘      └─────────────┘    └───────────┘           │
│       │                  │                  │                 │
│  ┌────┴────┐      ┌──────┴──────┐                             │
│  │   xAI   │      │   Custom    │                             │
│  │  Grok   │      │   Models    │                             │
│  └─────────┘      └─────────────┘                             │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

## 核心技术版本

| 类别         | 技术           | 版本      | 用途           |
| ------------ | -------------- | --------- | -------------- |
| **前端框架** | Next.js        | 14.2.35   | SSR/SSG/路由   |
| **UI 库**    | React          | 18.3.0    | 组件化 UI      |
| **类型系统** | TypeScript     | 5.3.0     | 静态类型       |
| **样式**     | Tailwind CSS   | 3.4.0     | 原子化 CSS     |
| **状态管理** | TanStack Query | 5.28.0    | 服务端状态     |
| **状态管理** | Zustand        | 4.5.0     | 客户端状态     |
| **后端框架** | NestJS         | 10.3.0    | 企业级 Node.js |
| **ORM**      | Prisma         | 5.10.0    | 数据库访问     |
| **数据库**   | PostgreSQL     | 16        | 关系型数据库   |
| **缓存**     | Redis          | (可选)    | 内存缓存       |
| **实时通讯** | Socket.io      | 4.8.1     | WebSocket      |
| **AI SDK**   | OpenAI         | 6.14.0    | GPT 模型访问   |
| **AI SDK**   | Anthropic      | (via API) | Claude 访问    |
| **编辑器**   | TipTap         | 3.10.7    | 富文本编辑     |
| **编辑器**   | BlockNote      | 0.45.0    | 块状编辑器     |
| **编辑器**   | Monaco Editor  | 4.6.0     | 代码编辑器     |
| **图表**     | D3.js          | 7.9.0     | 数据可视化     |
| **图表**     | Recharts       | 3.4.1     | React 图表库   |
| **图表**     | Mermaid        | 11.12.2   | 流程图/时序图  |
| **文档处理** | docx           | 9.5.1     | Word 文档生成  |
| **文档处理** | pptxgenjs      | 4.0.1     | PPT 生成       |
| **文档处理** | jsPDF          | 3.0.3     | PDF 生成       |
| **爬虫**     | Puppeteer      | 24.30.0   | 浏览器自动化   |
| **爬虫**     | Cheerio        | 1.1.2     | HTML 解析      |
| **文件处理** | Sharp          | 0.34.5    | 图像处理       |
| **文件处理** | Tesseract.js   | 7.0.0     | OCR 文字识别   |
| **部署**     | Docker         | latest    | 容器化部署     |
| **部署**     | Railway        | (PaaS)    | 云平台         |

## 设计原则

### 1. PostgreSQL-First 设计

- **主数据库**: 使用 Prisma ORM 访问 PostgreSQL
- **递归 CTE**: 替代 Neo4j 实现知识图谱遍历
- **JSONB 字段**: 存储灵活的元数据和配置
- **全文搜索**: 使用 PostgreSQL tsvector 替代专用搜索引擎
- **数组类型**: 存储标签、关键词等多值数据

### 2. 数据库驱动的 AI 配置

- **零硬编码**: 所有模型配置存储在 `AIModel` 表
- **动态能力**: 通过数据库字段定义模型特性（推理模型、支持流式等）
- **灵活切换**: 管理员可以通过 UI 启用/禁用模型
- **自动适配**: Task Profile Mapper 根据任务需求自动选择参数

### 3. 统一 AI 编排

- **多 Provider 支持**: OpenAI / Anthropic / Google / xAI
- **自动故障转移**: Model Fallback Service 处理 API 失败
- **调用追踪**: 记录所有 AI 调用的 token 使用和成本
- **流式响应**: 统一的 SSE 接口处理实时输出

### 4. 模块化架构

- **59 个独立模块**: 明确的职责划分
- **清晰的依赖关系**: Common → Core → AI Engine → AI Apps
- **可独立测试**: 每个模块有独立的测试套件
- **可独立部署**: 模块可以单独打包和部署

### 5. 安全设计

- **API 限流保护**: 60 req/min (可配置)
- **JWT + OAuth2 认证**: 支持 Google OAuth
- **Helmet 安全头**: 防止常见 Web 攻击
- **严格 CORS 配置**: 仅允许白名单域名
- **输入验证**: class-validator + DTO 验证

## 模块架构

```
backend/src/
├── common/                      # 公共服务层
│   ├── prisma/                  # 数据库访问
│   ├── ai-orchestration/        # AI 编排
│   ├── streaming/               # SSE 流式响应
│   ├── content-processing/      # 内容处理
│   ├── observability/           # 监控日志
│   ├── audit/                   # 审计日志
│   ├── capabilities/            # 能力管理
│   ├── export/                  # 统一导出
│   └── ...
├── modules/
│   ├── core/                    # 核心模块
│   │   ├── auth/                # 认证授权
│   │   ├── admin/               # 管理后台
│   │   ├── settings/            # 系统设置
│   │   ├── storage/             # 文件存储
│   │   ├── email/               # 邮件服务
│   │   └── feedback/            # 用户反馈
│   ├── ai-engine/               # AI 引擎层（领域无关）
│   │   ├── llm/                 # LLM 核心服务
│   │   │   ├── services/
│   │   │   │   ├── ai-chat.service.ts           # 统一聊天接口
│   │   │   │   └── task-profile.types-mapper.service.ts # 任务参数映射
│   │   │   ├── adapters/        # LLM 适配器
│   │   │   ├── model-fallback/  # 模型降级
│   │   │   └── types/           # TaskProfile 定义
│   │   ├── teams/               # 多 Agent 协作机制
│   │   ├── image/               # 图像生成
│   │   └── long-content/        # 长文本处理
│   ├── ai-app/                  # AI 应用层（预定义 Teams）
│   │   ├── ask/                 # AI 问答
│   │   ├── office/              # AI Office
│   │   ├── simulation/          # 辩论模拟器
│   │   ├── teams/               # AI Teams
│   │   ├── coding/              # AI 编程助手
│   │   ├── writing/             # AI 写作助手
│   │   ├── image/               # AI 图像生成
│   │   ├── rag/                 # 检索增强生成
│   │   └── research/            # 研究套件
│   │       ├── topic-research/  # 主题研究
│   │       ├── deep-research/   # 深度研究
│   │       ├── notebook-research/ # 笔记本研究
│   │       └── fast-research/   # 快速研究
│   ├── content/                 # 内容管理模块
│   │   ├── resources/           # 资源库
│   │   ├── collections/         # 收藏集
│   │   ├── notes/               # 笔记
│   │   ├── reports/             # 报告
│   │   ├── workspace/           # 工作空间
│   │   ├── explore/             # 探索
│   │   ├── feed/                # 动态流
│   │   ├── comments/            # 评论
│   │   ├── knowledge-graph/     # 知识图谱
│   │   └── recommendations/     # 推荐系统
│   ├── ingestion/               # 数据采集模块
│   │   ├── crawlers/            # 爬虫服务
│   │   ├── sources/             # 数据源
│   │   └── config/              # 采集配置
│   ├── integrations/            # 第三方集成
│   │   ├── google-drive/        # Google Drive
│   │   ├── notion/              # Notion
│   │   ├── proxy/               # 代理服务
│   │   ├── wechat-work/         # 企业微信
│   │   └── ai-file-organizer/   # AI 文件整理
│   ├── credits/                 # 积分系统
│   └── webhooks/                # Webhooks
└── app.module.ts                # 根模块
```

## 前端架构

```
frontend/
├── app/                         # Next.js 14 App Router
│   ├── layout.tsx               # 根布局
│   ├── page.tsx                 # 首页
│   ├── providers.tsx            # 全局 Provider
│   ├── ai-ask/                  # AI 问答
│   ├── ai-office/               # AI Office
│   ├── ai-simulation/           # 辩论模拟器
│   ├── ai-teams/                # AI Teams
│   ├── ai-coding/               # AI 编程
│   ├── ai-writing/              # AI 写作
│   ├── ai-image/                # AI 图像
│   ├── ai-studio/               # AI Studio (研究)
│   ├── library/                 # 资源库
│   ├── explore/                 # 探索
│   ├── admin/                   # 管理后台
│   └── ...
├── components/
│   ├── ui/                      # 基础 UI 组件
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Toast.tsx
│   │   └── ...
│   ├── layout/                  # 布局组件
│   │   ├── AppShell.tsx         # 应用外壳
│   │   └── Sidebar.tsx
│   ├── shared/                  # 共享组件
│   │   ├── ResourceCard.tsx
│   │   ├── LoadingState.tsx
│   │   └── ...
│   ├── ai-research/             # AI 研究组件
│   ├── ai-teams/                # AI Teams 组件
│   └── ...
├── hooks/
│   ├── core/                    # 核心 Hooks
│   │   ├── useApi.ts            # API 调用
│   │   └── useStream.ts         # SSE 流式
│   ├── domain/                  # 领域 Hooks
│   │   ├── useResources.ts      # 资源管理
│   │   ├── useAdminUsers.ts     # 用户管理
│   │   └── ...
│   ├── features/                # 功能 Hooks
│   │   ├── useDeepResearch.ts   # 深度研究
│   │   ├── useExport.ts         # 导出功能
│   │   └── ...
│   └── utils/                   # 工具 Hooks
│       ├── useMultiSelect.ts
│       └── ...
├── stores/                      # Zustand 状态管理
│   ├── toastStore.ts            # Toast 通知
│   ├── themeStore.ts            # 主题设置
│   ├── aiTeamsStore.ts          # AI Teams 状态
│   ├── aiOfficeStore.ts         # AI Office 状态
│   └── ...
├── lib/
│   ├── api/                     # API 客户端
│   │   ├── topic-research.ts
│   │   └── ...
│   ├── i18n/                    # 国际化
│   └── utils.ts                 # 工具函数
└── types/                       # TypeScript 类型定义
```

## 数据流架构

### 服务端状态 (TanStack Query)

```typescript
// 查询数据
const { data, isLoading } = useQuery({
  queryKey: ["resources", { type: "article" }],
  queryFn: () => api.getResources({ type: "article" }),
  staleTime: 30 * 1000, // 30秒内数据新鲜
});

// 变更数据
const mutation = useMutation({
  mutationFn: (resource) => api.createResource(resource),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["resources"] });
  },
});
```

### 客户端状态 (Zustand)

```typescript
// 定义 Store
const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

// 使用 Store
const { addToast } = useToastStore();
addToast({ type: "success", message: "操作成功！" });
```

## 实时通讯架构

### Server-Sent Events (SSE)

用于 AI 流式响应、进度追踪：

```typescript
// 后端
@Sse()
streamChat(@Body() request: ChatRequest): Observable<MessageEvent> {
  return new Observable((subscriber) => {
    const stream = this.aiService.streamChat(request);
    for await (const chunk of stream) {
      subscriber.next({ data: JSON.stringify(chunk) });
    }
  });
}

// 前端
const { content, isStreaming } = useStream('/api/ai/chat/stream');
```

### WebSocket (Socket.io)

用于多人协作、实时编辑：

```typescript
// 后端
@WebSocketGateway()
export class CollaborationGateway {
  @SubscribeMessage("joinRoom")
  handleJoinRoom(client: Socket, payload: { roomId: string }) {
    client.join(payload.roomId);
  }
}

// 前端
const socket = io("/api/collaboration");
socket.emit("joinRoom", { roomId: "123" });
```

## 部署架构

### Docker Compose 本地开发

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: genesis
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/genesis
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    ports:
      - "3001:3001"
    depends_on:
      - postgres

  frontend:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

### Railway 生产部署

- **Backend**: NestJS 服务部署为 Railway Service
- **Frontend**: Next.js 部署为独立 Service
- **Database**: Railway PostgreSQL Plugin
- **环境变量**: 通过 Railway 管理

## 快速导航

### 前端技术

- [Next.js 与 React 核心原理](./frontend/frontend-nextjs-react.md)
- [状态管理架构](./frontend/frontend-state-management.md)
- [UI 组件库](./frontend/frontend-ui-components.md)

### 后端技术

- [NestJS 框架原理](./backend/backend-nestjs.md)
- [Prisma ORM 使用指南](./backend/backend-prisma-orm.md)

### 数据库技术

- [PostgreSQL 高级特性](./database/database-postgresql.md)
- [Redis 缓存策略](./database/database-redis.md)

### AI/LLM 技术

- [AI 编排服务](./ai-llm/ai-llm-orchestration.md)
- [多模型架构](./ai-llm/ai-llm-multi-model.md)
- [流式响应](./ai-llm/ai-llm-streaming.md)

### 实时通讯

- [WebSocket 实时通讯](./realtime/realtime-websocket.md)
- [Server-Sent Events](./realtime/realtime-sse.md)

### 数据采集

- [爬虫技术](./data-collection/data-collection-crawler.md)
- [数据源集成](./data-collection/data-collection-data-sources.md)

---

**最后更新**: 2026-01-15
**维护者**: Genesis Team
**版本**: 2.0

