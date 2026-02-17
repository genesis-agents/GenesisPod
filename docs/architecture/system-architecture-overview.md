# Genesis.ai - 系统架构总览

> **版本**: v2.0
> **创建日期**: 2026-01-24
> **最后更新**: 2026-01-24
> **状态**: 🟢 活跃
> **维护者**: DeepDive Team

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈](#2-技术栈)
3. [系统架构图](#3-系统架构图)
4. [后端架构](#4-后端架构)
5. [前端架构](#5-前端架构)
6. [AI 架构分层](#6-ai-架构分层)
7. [数据流架构](#7-数据流架构)
8. [代码质量指标](#8-代码质量指标)
9. [改进路线图](#9-改进路线图)

---

## 1. 项目概述

**Genesis.ai** 是一个企业级 AI 深度研究和内容管理平台，提供多 Agent 协作、智能问答、文档生成等功能。

### 1.1 代码规模

| 分类                | 文件数    | 总行数      | 有效代码行数 |
| ------------------- | --------- | ----------- | ------------ |
| **后端 (Backend)**  | 1,122     | 386,355     | 297,445      |
| **前端 (Frontend)** | 763       | 297,152     | 263,399      |
| **Prisma Schema**   | 2         | 7,577       | -            |
| **总计**            | **1,887** | **691,084** | **560,844**  |

### 1.2 核心模块

| 模块        | 描述                       | 后端路径             | 前端路径           |
| ----------- | -------------------------- | -------------------- | ------------------ |
| AI Research | 深度研究，多步骤规划和报告 | `ai-app/research/`   | `app/ai-research/` |
| AI Teams    | 多 Agent 协作，辩论碰撞    | `ai-app/teams/`      | `app/ai-teams/`    |
| AI Office   | 文档/PPT/设计生成          | `ai-app/office/`     | `app/ai-office/`   |
| AI Ask      | 智能问答，多模型切换       | `ai-app/ask/`        | `app/ai-ask/`      |
| AI Writing  | AI 写作助手，长文本创作    | `ai-app/writing/`    | `app/ai-writing/`  |
| Library     | 资源库，内容管理           | `content/resources/` | `app/library/`     |

---

## 2. 技术栈

### 2.1 技术选型

```
┌─────────────────────────────────────────────────────────────────┐
│                         技术栈概览                               │
├─────────────────────────────────────────────────────────────────┤
│  前端                                                            │
│  ├── Framework: Next.js 14 (App Router)                         │
│  ├── Language: TypeScript 5.x                                   │
│  ├── State: Zustand (Slice Pattern)                             │
│  ├── Styling: TailwindCSS + Radix UI                            │
│  └── API: Custom Hooks (useApi, useStream)                      │
├─────────────────────────────────────────────────────────────────┤
│  后端                                                            │
│  ├── Framework: NestJS 10                                       │
│  ├── Language: TypeScript 5.x                                   │
│  ├── ORM: Prisma (PostgreSQL)                                   │
│  ├── Auth: JWT + Passport.js + Google OAuth                     │
│  └── Validation: class-validator + class-transformer            │
├─────────────────────────────────────────────────────────────────┤
│  AI 服务                                                         │
│  ├── Gateway: LiteLLM (统一模型接口)                             │
│  ├── Models: OpenAI GPT-4o / Claude / Grok / DeepSeek          │
│  ├── Tools: 46+ 工具 (搜索/代码/SQL/导出等)                      │
│  └── Orchestration: DAG/Sequential/Parallel Executors          │
├─────────────────────────────────────────────────────────────────┤
│  基础设施                                                        │
│  ├── Database: PostgreSQL 16                                    │
│  ├── Cache: Redis / In-Memory LRU                               │
│  ├── Storage: Cloudflare R2                                     │
│  ├── Deploy: Railway + Docker                                   │
│  └── Process: PM2                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 系统架构图

### 3.1 整体架构

```mermaid
graph TB
    subgraph Client["客户端层"]
        WebApp["Web App<br/>(Next.js 14)"]
        Mobile["Mobile<br/>(Future)"]
    end

    subgraph Gateway["网关层"]
        CDN["Cloudflare CDN"]
        LB["Load Balancer"]
    end

    subgraph Backend["后端服务层"]
        subgraph Core["核心服务"]
            Auth["Auth Service<br/>(JWT + OAuth)"]
            Admin["Admin Service"]
            Storage["Storage Service<br/>(R2)"]
        end

        subgraph AIApps["AI 应用层"]
            Ask["AI Ask"]
            Research["AI Research"]
            Office["AI Office"]
            Teams["AI Teams"]
            Writing["AI Writing"]
        end

        subgraph AIEngine["AI 引擎层"]
            Facade["AI Engine Facade"]
            LLM["LLM Service"]
            Tools["Tools Registry<br/>(46+ Tools)"]
            Skills["Skills System"]
            Orchestration["Orchestration<br/>(DAG/Seq/Parallel)"]
        end

        subgraph Content["内容管理层"]
            Resources["Resources"]
            Collections["Collections"]
            Ingestion["Data Ingestion"]
        end
    end

    subgraph Data["数据层"]
        PG[("PostgreSQL<br/>(主数据库)")]
        Redis[("Redis<br/>(缓存)")]
        R2[("Cloudflare R2<br/>(文件存储)")]
    end

    subgraph External["外部服务"]
        OpenAI["OpenAI API"]
        Claude["Claude API"]
        Grok["Grok API"]
        Google["Google OAuth"]
    end

    Client --> Gateway
    Gateway --> Backend

    AIApps --> Facade
    Facade --> LLM
    Facade --> Tools
    Facade --> Skills
    LLM --> Orchestration

    Core --> PG
    Content --> PG
    AIApps --> PG

    Core --> Redis
    Storage --> R2

    LLM --> External
    Auth --> Google
```

### 3.2 请求流程图

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端 (Next.js)
    participant A as API (NestJS)
    participant S as Service
    participant AI as AI Engine
    participant DB as PostgreSQL

    U->>F: 发起请求
    F->>F: useApi Hook
    F->>A: HTTP/SSE 请求
    A->>A: JwtAuthGuard 验证
    A->>S: 调用 Service

    alt AI 相关请求
        S->>AI: AIEngineFacade.chat()
        AI->>AI: 选择模型
        AI->>AI: 执行工具链
        AI-->>S: 返回结果
    else 数据请求
        S->>DB: Prisma 查询
        DB-->>S: 返回数据
    end

    S-->>A: 返回结果
    A-->>F: HTTP 响应
    F->>F: 更新状态
    F-->>U: 渲染界面
```

---

## 4. 后端架构

### 4.1 模块结构图

```mermaid
graph LR
    subgraph AppModule["app.module.ts (70+ 模块)"]
        subgraph Infrastructure["基础设施"]
            Config["ConfigModule"]
            Prisma["PrismaModule"]
            Events["EventEmitterModule"]
            Throttle["ThrottlerModule"]
        end

        subgraph CoreModules["核心模块"]
            AuthMod["AuthModule"]
            AdminMod["AdminModule"]
            StorageMod["StorageModule"]
            SecretsMod["SecretsModule"]
        end

        subgraph AIEngineModule["AI 引擎 (全局)"]
            LLMMod["LLM Module"]
            ToolsMod["Tools Module<br/>(46+ Tools)"]
            SkillsMod["Skills Module"]
            OrchMod["Orchestration Module<br/>(12+ Services)"]
            MemoryMod["Memory Module"]
        end

        subgraph AIAppsModule["AI 应用"]
            AskMod["AI Ask"]
            ResearchMod["AI Research"]
            OfficeMod["AI Office"]
            TeamsMod["AI Teams"]
            WritingMod["AI Writing"]
        end

        subgraph ContentModule["内容管理"]
            ResourcesMod["Resources"]
            CollectionsMod["Collections"]
            WorkspaceMod["Workspace"]
        end
    end

    AIAppsModule --> AIEngineModule
    AIEngineModule --> Infrastructure
    CoreModules --> Infrastructure
    ContentModule --> Infrastructure
```

### 4.2 模块代码量分布

```mermaid
pie title 后端模块代码分布
    "ai-app (AI应用)" : 187771
    "ai-engine (AI引擎)" : 99238
    "common (公共)" : 26011
    "core (核心)" : 25965
    "ingestion (摄入)" : 17172
    "content (内容)" : 14967
    "integrations (集成)" : 11030
    "credits (积分)" : 1980
```

### 4.3 分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Controller 层 (HTTP 入口)                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │AuthController│ │AiAskController│ │ResourcesController│ ...   │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘               │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          ↓                ↓                ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Service 层 (业务逻辑)                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │AuthService  │ │AiAskService │ │ResourcesService│ ...        │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘               │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          ↓                ↓                ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Facade 层 (AI 统一入口)                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    AIEngineFacade                         │   │
│  │  chat() | search() | executeTool() | startTeamMission()  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────────────────┐
│                    数据访问层 (Prisma ORM)                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │PrismaService│ │ Models      │ │ Migrations  │               │
│  └──────┬──────┘ └─────────────┘ └─────────────┘               │
└─────────┼───────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL 数据库                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 前端架构

### 5.1 目录结构图

```mermaid
graph TB
    subgraph Frontend["frontend/"]
        subgraph App["app/ (路由层)"]
            AdminRoutes["admin/*"]
            AIRoutes["ai-*/*"]
            LibraryRoutes["library/*"]
            ExploreRoutes["explore/*"]
        end

        subgraph Components["components/ (组件层)"]
            AdminComp["admin/"]
            AIComp["ai-*/"]
            CommonComp["common/"]
            LayoutComp["layout/"]
            UIComp["ui/"]
        end

        subgraph Hooks["hooks/ (逻辑层)"]
            CoreHooks["core/<br/>useApi, useStream"]
            DomainHooks["domain/<br/>useResources"]
            FeatureHooks["features/<br/>useDeepResearch"]
        end

        subgraph Stores["stores/ (状态层)"]
            CoreStores["core/<br/>settings, theme"]
            AIStores["ai-*/<br/>slides, research"]
        end

        subgraph Lib["lib/ (工具层)"]
            APIClient["api/<br/>client, SSE"]
            Utils["utils/"]
        end
    end

    App --> Components
    Components --> Hooks
    Hooks --> Stores
    Hooks --> Lib
    Stores --> Lib
```

### 5.2 前端模块代码分布

```mermaid
pie title 前端模块代码分布
    "components (组件)" : 194480
    "app (路由)" : 52648
    "lib (工具库)" : 21710
    "hooks (自定义Hook)" : 13781
    "stores (状态管理)" : 10581
```

### 5.3 Hook 三层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Features Hooks (13个)                         │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐      │
│  │useDeepResearch │ │useSlideGeneration│ │useExport       │ ... │
│  └────────┬───────┘ └────────┬───────┘ └────────┬───────┘      │
└───────────┼──────────────────┼──────────────────┼───────────────┘
            ↓                  ↓                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Domain Hooks (18个)                           │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐      │
│  │useResources    │ │useGoogleDrive  │ │useAdminSecrets │ ...  │
│  └────────┬───────┘ └────────┬───────┘ └────────┬───────┘      │
└───────────┼──────────────────┼──────────────────┼───────────────┘
            ↓                  ↓                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Core Hooks (4个)                              │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐      │
│  │useApi          │ │useStream       │ │useAsyncOperation│     │
│  │(HTTP + Cache)  │ │(SSE)           │ │(状态管理)      │      │
│  └────────┬───────┘ └────────┬───────┘ └────────────────┘      │
└───────────┼──────────────────┼──────────────────────────────────┘
            ↓                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                    API Client Layer                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  apiClient.get() | apiClient.post() | createSSEStream()   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 状态管理架构 (Zustand Slice Pattern)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Zustand Stores                                │
├─────────────────────────────────────────────────────────────────┤
│  Core Stores (全局状态)                                          │
│  ├── settingsStore: 应用设置                                     │
│  ├── themeStore: 主题切换                                        │
│  └── toastStore: Toast 通知                                      │
├─────────────────────────────────────────────────────────────────┤
│  Feature Stores (功能模块状态 - Slice 模式)                       │
│  ├── ai-research/                                               │
│  │   ├── topicSlice: Topics, Dimensions, Stats                  │
│  │   ├── reportSlice: Reports, Evidence, Logs                   │
│  │   └── researchSlice: Refresh, Mission, Team                  │
│  ├── ai-office/                                                 │
│  │   └── slidesStore: Sessions, Pages, Progress                 │
│  ├── ai-teams/                                                  │
│  │   └── teamsStore: Topics, Messages, Members                  │
│  └── ...                                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. AI 架构分层

### 6.1 AI 三层架构模型

```mermaid
graph TB
    subgraph L3["应用层 (AI Apps)"]
        Ask["AI Ask<br/>(智能问答)"]
        Research["AI Research<br/>(深度研究)"]
        Office["AI Office<br/>(文档生成)"]
        Teams["AI Teams<br/>(多Agent协作)"]
        Writing["AI Writing<br/>(内容创作)"]
    end

    subgraph L2["协作机制层 (AI Teams)"]
        AgentComm["Agent 通信"]
        TaskDelegation["任务委派"]
        Consensus["共识机制"]
        MissionExec["任务执行"]
    end

    subgraph L1["引擎核心层 (AI Engine)"]
        subgraph LLM["LLM 适配层"]
            Chat["AiChatService"]
            ModelConfig["ModelConfigService"]
            Streaming["StreamHandler"]
        end

        subgraph Tools["工具系统 (46+)"]
            WebSearch["web-search"]
            CodeGen["code-gen"]
            SQLExec["sql-exec"]
            Export["export-*"]
        end

        subgraph Orchestration["编排引擎"]
            SeqExec["Sequential"]
            DAGExec["DAG"]
            ParallelExec["Parallel"]
            FuncCall["Function Calling"]
        end

        subgraph Support["支撑系统"]
            Memory["Memory<br/>(短期/长期)"]
            Skills["Skills"]
            CircuitBreaker["熔断器"]
            TokenBudget["Token 预算"]
        end
    end

    L3 --> L2
    L2 --> L1

    Ask --> Chat
    Research --> Tools
    Office --> Orchestration
    Teams --> AgentComm
```

### 6.2 AI Engine 内部结构

```
┌─────────────────────────────────────────────────────────────────┐
│                    AIEngineFacade (统一入口)                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ chat() | chatWithSkills() | search() | executeTool()    │   │
│  │ startTeamMission() | storeMemory() | getAvailableModels()│   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────── ┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                    LLM 服务层                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │AiChatService│ │ModelConfig  │ │TaskProfile  │               │
│  │             │ │Service      │ │Mapper       │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
│                                                                  │
│  TaskProfile 参数:                                               │
│  ├── creativity: deterministic(0.1) | low(0.3) | medium(0.7)   │
│  └── outputLength: minimal(500) | short(1500) | medium(4000)   │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                    工具注册表 (46+ 工具)                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Information: web-search, news-search, arxiv-search      │    │
│  │ Execution: sql-executor, container-executor, ocr        │    │
│  │ Generation: code-gen, text-gen, video-gen               │    │
│  │ Export: image-export, pdf-export, markdown-export       │    │
│  │ Collaboration: agent-comm, task-delegation, consensus   │    │
│  │ Processing: document-chunker, summarizer, entity-extract│    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Tool Pipeline (中间件):                                         │
│  ├── ValidationMiddleware (入参验证)                             │
│  └── TimeoutMiddleware (执行超时控制)                            │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                    编排引擎 (12+ 服务)                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │Sequential   │ │DAG Executor │ │Parallel     │               │
│  │Executor     │ │             │ │Executor     │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │Function     │ │Circuit      │ │Token Budget │               │
│  │Calling      │ │Breaker      │ │Service      │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 数据流架构

### 7.1 API 请求数据流

```mermaid
flowchart LR
    subgraph Frontend
        Component["React 组件"]
        Hook["useApi Hook"]
        Cache["LRU Cache"]
    end

    subgraph Backend
        Controller["Controller"]
        Guard["JwtAuthGuard"]
        Service["Service"]
        Prisma["Prisma ORM"]
    end

    subgraph Database
        PG[("PostgreSQL")]
    end

    Component --> Hook
    Hook --> Cache
    Cache -->|Cache Miss| Controller
    Controller --> Guard
    Guard --> Service
    Service --> Prisma
    Prisma --> PG
    PG --> Prisma
    Prisma --> Service
    Service --> Controller
    Controller --> Hook
    Hook --> Cache
    Cache --> Component
```

### 7.2 AI 对话数据流

```mermaid
flowchart TB
    subgraph Frontend
        ChatUI["Chat UI"]
        useStream["useStream Hook"]
    end

    subgraph Backend
        AskController["AiAskController"]
        AskService["AiAskService"]
        Facade["AIEngineFacade"]
        ChatService["AiChatService"]
        ToolRegistry["ToolRegistry"]
    end

    subgraph External
        LLM["LLM API<br/>(OpenAI/Claude)"]
    end

    ChatUI -->|POST /ask/sessions/:id/messages| AskController
    AskController --> AskService
    AskService --> Facade
    Facade --> ChatService

    ChatService -->|需要工具?| ToolRegistry
    ToolRegistry -->|执行工具| ToolRegistry
    ToolRegistry --> ChatService

    ChatService --> LLM
    LLM -->|SSE Stream| ChatService
    ChatService --> Facade
    Facade --> AskService
    AskService -->|SSE Events| AskController
    AskController -->|text/event-stream| useStream
    useStream --> ChatUI
```

### 7.3 数据库 ER 图 (核心表)

```mermaid
erDiagram
    User ||--o{ Topic : creates
    User ||--o{ TopicMember : joins
    User ||--o{ AskSession : owns
    User ||--o{ ResourceUpvote : upvotes
    User ||--o{ Collection : owns

    Topic ||--o{ TopicMember : has
    Topic ||--o{ TopicMessage : contains
    Topic ||--o{ Mission : runs

    AskSession ||--o{ AskMessage : contains

    Resource ||--o{ ResourceUpvote : receives
    Resource ||--o{ CollectionItem : included_in

    Collection ||--o{ CollectionItem : contains

    User {
        string id PK
        string email UK
        string username UK
        string role
        datetime createdAt
    }

    Topic {
        string id PK
        string name
        string creatorId FK
        string type
        datetime createdAt
    }

    Resource {
        string id PK
        string title
        string type
        string sourceUrl
        decimal qualityScore
        datetime publishedAt
    }

    AskSession {
        string id PK
        string userId FK
        string title
        string modelId
    }
```

---

## 8. 代码质量指标

### 8.1 质量评分总览

| 层级              | 评分       | 状态        |
| ----------------- | ---------- | ----------- |
| **L0 基础设施层** | 8.5/10     | ✅ 良好     |
| **L1 核心架构层** | 8.3/10     | ✅ 良好     |
| **L2 代码质量层** | 8.1/10     | ✅ 良好     |
| **L3 业务逻辑层** | 8.0/10     | ✅ 良好     |
| **总体评分**      | **8.2/10** | ✅ 生产就绪 |

### 8.2 关键指标

| 指标                  | 结果    | 评价      |
| --------------------- | ------- | --------- |
| TypeScript `any` 使用 | 0       | ✅ 优秀   |
| `@ts-ignore` 使用     | 0       | ✅ 优秀   |
| Try-Catch 覆盖率      | 85%     | ✅ 良好   |
| NestJS Logger 使用    | 114+ 处 | ✅ 良好   |
| console.log 残留      | 37 处   | ⚠️ 需清理 |

### 8.3 大型文件待重构

| 文件                       | 行数  | 优先级 | 建议                     |
| -------------------------- | ----- | ------ | ------------------------ |
| `AIEngineFacade.ts`        | 2000+ | 🔴 P0  | 拆分为 5-6 个专用 Facade |
| `AiAskService.ts`          | 1000+ | 🔴 P0  | 拆分为 4 个专用 Service  |
| `HomePage.tsx`             | 4000+ | 🔴 P0  | 拆分为 6-8 个子组件      |
| `WritingMissionService.ts` | 8000+ | 🟡 P1  | 拆分任务执行逻辑         |

---

## 9. 改进路线图

### 9.1 短期改进 (1-2 周)

- [ ] 拆分 AIEngineFacade（5-6 个专用 Facade）
- [ ] 拆分 AiAskService（4 个专用 Service）
- [ ] 重构 HomePage.tsx（6-8 个子组件）
- [ ] 清理 console.log（37 处）

### 9.2 中期改进 (3-4 周)

- [ ] 统一 API 响应格式
- [ ] 添加前端 API 拦截器
- [ ] 清理遗留 Store
- [ ] 添加 Repository 层（可选）

### 9.3 长期改进 (1-2 月)

- [ ] 实现分布式跟踪（OpenTelemetry）
- [ ] 完善 Function Calling 实现
- [ ] 添加更多测试覆盖
- [ ] 性能基准测试

---

## 相关文档

| 文档              | 路径                                                                               |
| ----------------- | ---------------------------------------------------------------------------------- |
| 后端 NestJS 架构  | [infra/backend/backend-nestjs.md](infra/backend/backend-nestjs.md)                 |
| 前端 Next.js 架构 | [infra/frontend/frontend-nextjs-react.md](infra/frontend/frontend-nextjs-react.md) |
| AI Engine 架构    | [ai-engine/readme.md](ai-engine/readme.md)                                         |
| AI Teams 架构     | [ai-teams/readme.md](ai-teams/readme.md)                                           |
| 数据库设计        | [infra/database/database-postgresql.md](infra/database/database-postgresql.md)     |

---

**文档版本**: v2.0
**生成时间**: 2026-01-24
**分析范围**: 完整前后端代码库（1,887 个文件，691,084 行代码）
