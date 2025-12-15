# DeepDive 技术栈文档

本目录包含 DeepDive 项目使用的关键技术的核心原理和实现细节。

## 目录结构

```
tech-stack/
├── README.md                    # 本文件 - 技术栈总览
├── frontend/                    # 前端技术
│   ├── nextjs-react.md         # Next.js 14 + React 18
│   ├── state-management.md     # 状态管理 (TanStack Query + Zustand)
│   └── ui-components.md        # UI组件库 (Radix UI + TipTap)
├── backend/                     # 后端技术
│   ├── nestjs.md               # NestJS 框架
│   └── prisma-orm.md           # Prisma ORM
├── database/                    # 数据库技术
│   ├── postgresql.md           # PostgreSQL 高级特性
│   └── redis.md                # Redis 缓存策略
├── ai-llm/                      # AI/LLM 技术
│   ├── orchestration.md        # AI 编排服务
│   ├── multi-model.md          # 多模型架构
│   └── streaming.md            # 流式响应
├── realtime/                    # 实时通讯
│   ├── websocket.md            # WebSocket (Socket.io)
│   └── sse.md                  # Server-Sent Events
├── data-collection/             # 数据采集
│   ├── crawler.md              # 爬虫技术
│   └── data-sources.md         # 数据源集成
└── architecture/                # 架构设计
    ├── module-design.md        # 模块化设计
    └── security.md             # 安全架构
```

## 技术栈概览

```
┌─────────────────────────────────────────────────────────────┐
│                     DeepDive Architecture                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Frontend Layer                     │   │
│  │  Next.js 14 + React 18 + TypeScript + Tailwind CSS  │   │
│  │  State: TanStack Query + Zustand                     │   │
│  │  UI: Radix UI + TipTap + D3.js + Recharts           │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                 │
│                       REST API / WebSocket                  │
│                            │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Backend Layer                      │   │
│  │  NestJS 10 + Express + Prisma ORM                    │   │
│  │  Auth: Passport.js + JWT + OAuth2                    │   │
│  │  Security: Helmet + Throttler + CORS                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                 │
│         ┌──────────────────┼──────────────────┐             │
│         │                  │                  │             │
│  ┌──────┴──────┐   ┌──────┴──────┐   ┌──────┴──────┐      │
│  │ PostgreSQL  │   │    Redis    │   │   LiteLLM   │      │
│  │   16-alpine │   │   7-alpine  │   │    Proxy    │      │
│  │  主数据库    │   │    缓存     │   │  AI 路由    │      │
│  └─────────────┘   └─────────────┘   └─────────────┘      │
│                                              │              │
│                    ┌─────────────────────────┼───────┐     │
│                    │                         │       │     │
│             ┌──────┴──────┐   ┌──────────────┴───┐   │     │
│             │   OpenAI    │   │   Anthropic      │   │     │
│             │  GPT-5.1    │   │   Claude         │   │     │
│             └─────────────┘   └──────────────────┘   │     │
│                                                      │     │
│             ┌─────────────┐   ┌──────────────────┐   │     │
│             │   Google    │   │      xAI         │   │     │
│             │   Gemini    │   │      Grok        │   │     │
│             └─────────────┘   └──────────────────┘   │     │
│                                                            │
└─────────────────────────────────────────────────────────────┘
```

## 核心技术版本

| 类别         | 技术         | 版本   | 用途           |
| ------------ | ------------ | ------ | -------------- |
| **前端框架** | Next.js      | 14.2.0 | SSR/SSG/路由   |
| **UI 库**    | React        | 18.3.0 | 组件化 UI      |
| **类型系统** | TypeScript   | 5.3.0  | 静态类型       |
| **样式**     | Tailwind CSS | 3.4.0  | 原子化 CSS     |
| **后端框架** | NestJS       | 10.3.0 | 企业级 Node.js |
| **ORM**      | Prisma       | 5.10.0 | 数据库访问     |
| **数据库**   | PostgreSQL   | 16     | 关系型数据库   |
| **缓存**     | Redis        | 7      | 内存缓存       |
| **实时通讯** | Socket.io    | 4.8.1  | WebSocket      |
| **AI SDK**   | OpenAI       | 1.54.4 | GPT 模型访问   |
| **AI SDK**   | Anthropic    | 0.39.0 | Claude 访问    |

## 设计原则

### 1. PostgreSQL-First 设计

- 使用递归 CTE 替代 Neo4j 图数据库
- 使用 JSONB 替代 MongoDB 文档存储
- 使用 PostgreSQL 数组替代 Qdrant 向量存储

### 2. 统一 AI 编排

- 多 Provider 支持 (OpenAI/Anthropic/Google/xAI)
- 自动故障转移和降级
- 调用追踪与监控

### 3. 模块化架构

- 28 个独立功能模块
- 清晰的依赖关系
- 可独立测试和部署

### 4. 安全设计

- API 限流保护 (60 req/min)
- JWT + OAuth2 认证
- Helmet 安全头
- 严格 CORS 配置

## 快速导航

- [Next.js 与 React 核心原理](./frontend/nextjs-react.md)
- [状态管理架构](./frontend/state-management.md)
- [NestJS 框架原理](./backend/nestjs.md)
- [Prisma ORM 使用指南](./backend/prisma-orm.md)
- [PostgreSQL 高级特性](./database/postgresql.md)
- [AI 编排服务](./ai-llm/orchestration.md)
- [WebSocket 实时通讯](./realtime/websocket.md)
- [数据采集技术](./data-collection/crawler.md)
