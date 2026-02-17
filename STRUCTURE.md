# Genesis.ai 项目结构

> 最后更新: 2026-01-23 | 维护者: Claude Code | 版本: 3.0

## 项目概览

Genesis.ai 是一个企业级 AI 深度研究和内容管理平台，采用 monorepo 结构，包含前端、后端、AI 服务和文档。

```
genesis-ai/
├── frontend/           # Next.js 14 前端应用
├── backend/            # NestJS 后端服务
├── ai-service/         # Python FastAPI 微服务
├── docs/               # 项目文档
├── scripts/            # 运维脚本
└── .claude/            # Claude Code 配置
```

---

## 前端目录 (frontend/)

Next.js 14 应用，使用 App Router、TypeScript 和 Zustand 状态管理。

```
frontend/
├── app/                        # Next.js App Router 页面
│   ├── admin/                  # 管理后台
│   │   ├── overview/           # 管理总览
│   │   ├── access/             # 访问控制
│   │   │   ├── secrets/        # 密钥管理
│   │   │   ├── security/       # 安全管理
│   │   │   └── users/          # 用户管理
│   │   ├── ai/                 # AI 管理
│   │   │   ├── models/         # AI 模型管理
│   │   │   ├── skills/         # AI 技能管理
│   │   │   ├── teams/          # AI 团队管理
│   │   │   └── tools/          # AI 工具管理
│   │   ├── data/               # 数据管理
│   │   │   ├── collection/     # 数据采集
│   │   │   ├── quality/        # 数据质量
│   │   │   └── whitelists/     # 白名单
│   │   ├── data-management/    # 数据源管理
│   │   ├── feedback/           # 用户反馈管理
│   │   ├── system/             # 系统设置
│   │   │   ├── email/          # 邮件配置
│   │   │   ├── site/           # 站点配置
│   │   │   └── storage/        # 存储配置
│   │   ├── thumbnails/         # 缩略图管理
│   │   └── workspace/          # 工作空间管理
│   │
│   ├── ai-ask/                 # AI 问答模块
│   ├── ai-coding/              # AI 编程助手
│   │   ├── [projectId]/        # 项目详情页
│   │   ├── kanban/             # 看板视图
│   │   └── new/                # 创建新项目
│   │
│   ├── ai-image/               # AI 图像生成
│   │   └── create/             # 创建图像
│   │
│   ├── ai-office/              # AI 办公套件
│   │   └── slides/             # 幻灯片生成
│   │
│   ├── ai-research/            # AI 研究平台
│   │   ├── [projectId]/        # 研究项目详情
│   │   ├── topic/              # 话题研究
│   │   │   └── [topicId]/      # 话题详情
│   │   └── topic-research/     # 话题研究页
│   │
│   ├── ai-simulation/          # AI 辩论模拟
│   │   ├── [id]/               # 模拟详情
│   │   ├── edit/[id]/          # 编辑模拟
│   │   └── run/[id]/           # 运行模拟
│   │
│   ├── ai-skills/              # AI 技能
│   ├── ai-social/              # AI 社交内容生成
│   │   ├── create/             # 创建内容
│   │   └── edit/[id]/          # 编辑内容
│   │
│   ├── ai-store/               # AI 应用商店
│   ├── ai-studio/              # AI 深度研究工作室
│   │
│   ├── ai-teams/               # AI 团队协作
│   │   └── [topicId]/          # 话题详情
│   │
│   ├── ai-writing/             # AI 写作助手
│   │   └── [id]/               # 写作项目详情
│   │
│   ├── api/                    # API Routes (BFF层)
│   │   ├── agents/             # Agent 相关 API
│   │   ├── ai/                 # AI 服务代理
│   │   ├── ai-office/          # AI Office API
│   │   ├── ai-service/         # AI 服务转发
│   │   └── feedback/           # 反馈 API
│   │
│   ├── auth/                   # 认证页面
│   │   └── callback/           # OAuth 回调
│   │
│   ├── credits/                # 积分中心
│   │
│   ├── explore/                # 内容浏览
│   │   ├── report/[id]/        # 报告详情
│   │   ├── resource/[id]/      # 资源详情
│   │   └── youtube/            # YouTube 内容
│   │
│   ├── feedback/               # 用户反馈
│   │   └── history/            # 反馈历史
│   │
│   ├── knowledge-graph/        # 知识图谱可视化
│   ├── library/                # 资源库
│   ├── notifications/          # 通知中心
│   ├── notion/[pageId]/        # Notion 集成
│   ├── profile/                # 用户资料
│   ├── rag/                    # RAG 检索增强生成
│   │
│   ├── report/[missionId]/     # 任务报告
│   │
│   └── share/                  # 分享页面
│       ├── image/[id]/         # 分享图像
│       ├── topic/[id]/         # 分享话题
│       └── writing/[id]/       # 分享写作
│
├── components/                 # React 组件库
│   ├── admin/                  # 管理后台组件
│   │   ├── data-collection/    # 数据采集组件
│   │   └── data-management/    # 数据管理组件
│   │
│   ├── ai-ask/                 # AI 问答组件
│   ├── ai-coding/              # AI 编程组件
│   │   └── DevWorkspace/       # 开发工作空间
│   │
│   ├── ai-image/               # AI 图像组件
│   │   └── components/         # 子组件
│   │
│   ├── ai-office/              # AI 办公组件
│   │   ├── ai-companion/       # AI 助手
│   │   ├── chat/               # 聊天界面
│   │   ├── core/               # 核心组件
│   │   ├── document/           # 文档组件
│   │   ├── layout/             # 布局组件
│   │   ├── ppt/                # PPT 组件
│   │   ├── resources/          # 资源组件
│   │   ├── tabs/               # 标签页
│   │   ├── task/               # 任务组件
│   │   └── visualizations/     # 可视化
│   │
│   ├── ai-research/            # AI 研究组件
│   ├── ai-simulation/          # AI 模拟组件
│   ├── ai-social/              # AI 社交组件
│   ├── ai-studio/              # AI Studio 组件
│   │   ├── citations/          # 引用组件
│   │   └── outputs/            # 输出组件
│   │
│   ├── ai-teams/               # AI 团队组件
│   ├── ai-writing/             # AI 写作组件
│   ├── common/                 # 通用业务组件
│   ├── explore/                # 浏览组件
│   │   ├── components/         # 子组件
│   │   ├── hooks/              # 浏览专用 hooks
│   │   └── youtube/            # YouTube 组件
│   │
│   ├── features/               # 功能特性组件
│   │   └── StructuredAISummary/# AI 摘要组件
│   │
│   ├── layout/                 # 布局组件 (AppShell, Header, Sidebar)
│   ├── library/                # 资源库组件
│   ├── notion/                 # Notion 组件
│   ├── shared/                 # 共享组件
│   │   ├── dialogs/            # 对话框组件
│   │   └── views/              # 视图组件
│   │
│   └── ui/                     # 基础 UI 组件 (Button, Modal, Input 等)
│
├── hooks/                      # React Hooks
│   ├── core/                   # 核心 hooks (useApi, useStream, useAsyncOperation)
│   ├── domain/                 # 业务领域 hooks (useResources, useAdminUsers 等)
│   ├── features/               # 功能 hooks (useDeepResearch, useExport)
│   └── utils/                  # 工具 hooks (useMultiSelect, useUrlDetection)
│
├── lib/                        # 工具库和配置
│   ├── ai-office/              # AI Office 工具
│   │   ├── agents/             # Agent 定义
│   │   └── multi-agents/       # 多 Agent 协作
│   │
│   ├── ai-simulation/          # AI 模拟工具
│   ├── api/                    # API 客户端配置
│   ├── cache/                  # 缓存工具
│   ├── explore/                # 浏览工具
│   ├── i18n/                   # 国际化
│   │   └── locales/            # 语言包
│   │
│   ├── notion/                 # Notion 工具
│   ├── templates/              # 模板定义
│   └── utils/                  # 通用工具函数
│
├── stores/                     # Zustand 状态管理
├── contexts/                   # React Context
├── public/                     # 静态资源
│   └── icons/                  # 图标资源
│       └── ai/                 # AI 相关图标
│
└── types/                      # TypeScript 类型定义
```

---

## 后端目录 (backend/)

NestJS 应用，提供 RESTful API，集成 Prisma ORM 和 PostgreSQL（统一数据库架构）。

```
backend/
├── prisma/                     # Prisma ORM 配置
│   ├── schema.prisma           # 数据库模型定义
│   └── migrations/             # 数据库迁移文件
│
├── src/
│   ├── main.ts                 # 应用入口
│   ├── app.module.ts           # 根模块
│   │
│   ├── assets/                 # 静态资源
│   │   └── fonts/              # 字体文件 (用于 PDF 生成)
│   │
│   ├── common/                 # 公共模块
│   │   ├── ai-orchestration/   # AI 服务编排
│   │   │   ├── config/         # AI 配置
│   │   │   └── providers/      # AI 提供者适配器
│   │   │
│   │   ├── capabilities/       # 能力注册系统
│   │   │   ├── base/           # 基础能力类
│   │   │   ├── decorators/     # 能力装饰器
│   │   │   └── interfaces/     # 能力接口定义
│   │   │
│   │   ├── config/             # 配置服务
│   │   ├── content-processing/ # 内容处理服务
│   │   ├── deduplication/      # 去重服务
│   │   ├── filters/            # 异常过滤器
│   │   ├── graph/              # 图数据库工具 (PostgreSQL Recursive CTEs)
│   │   ├── guards/             # 认证守卫
│   │   │   └── __tests__/      # 守卫测试
│   │   │
│   │   ├── interceptors/       # 拦截器
│   │   │   └── decorators/     # 拦截器装饰器
│   │   │
│   │   ├── prisma/             # Prisma 服务
│   │   ├── rawdata/            # 原始数据服务 (PostgreSQL JSONB)
│   │   ├── streaming/          # SSE 流式响应
│   │   └── utils/              # 工具函数
│   │
│   ├── config/                 # 应用配置
│   │
│   ├── modules/                # 功能模块
│   │   ├── ai-engine/          # AI 引擎层 (领域无关的通用 AI 能力)
│   │   │   ├── ai-engine.module.ts # AI 引擎模块
│   │   │   ├── image/          # 图像引擎
│   │   │   ├── long-content/   # 长文本处理引擎
│   │   │   └── teams/          # 团队协作引擎
│   │   │
│   │   ├── ai-app/             # AI 应用层 (具体业务应用)
│   │   │   ├── ask/            # AI 问答应用
│   │   │   │   └── ai-ask.module.ts
│   │   │   │
│   │   │   ├── coding/         # AI 编程助手
│   │   │   │   ├── ai-coding.module.ts
│   │   │   │   ├── constants/  # 常量定义
│   │   │   │   ├── dto/        # DTO
│   │   │   │   ├── prompts/    # 提示词模板
│   │   │   │   └── services/   # 服务层
│   │   │   │
│   │   │   ├── image/          # AI 图像生成应用
│   │   │   │   ├── ai-image.module.ts
│   │   │   │   ├── analytics/  # 图像分析
│   │   │   │   ├── brand-kit/  # 品牌套件
│   │   │   │   ├── core/       # 核心服务
│   │   │   │   ├── export/     # 图像导出
│   │   │   │   ├── generation/ # 图像生成
│   │   │   │   ├── infographic/# 信息图
│   │   │   │   │   └── templates/ # 模板
│   │   │   │   └── storage/    # 图像存储
│   │   │   │
│   │   │   ├── office/         # AI 办公套件应用
│   │   │   │   ├── ai-office.module.ts
│   │   │   │   ├── __tests__/  # 测试
│   │   │   │   ├── agents/     # Office Agent
│   │   │   │   ├── code-execution/ # 代码执行
│   │   │   │   ├── common/     # 通用模块
│   │   │   │   │   └── common.module.ts
│   │   │   │   ├── core/       # 核心服务
│   │   │   │   ├── designer/   # 设计服务
│   │   │   │   ├── docs/       # 文档服务
│   │   │   │   ├── documents/  # 文档管理
│   │   │   │   ├── export/     # 导出服务
│   │   │   │   ├── generation/ # 生成服务
│   │   │   │   ├── ppt/        # PPT 服务
│   │   │   │   └── slides/     # 幻灯片服务
│   │   │   │       └── skills/ # 幻灯片技能
│   │   │   │           └── slides-skills.module.ts
│   │   │   │
│   │   │   ├── rag/            # RAG 应用
│   │   │   │   └── rag.module.ts
│   │   │   │
│   │   │   ├── research/       # 研究应用集合
│   │   │   │   ├── research.module.ts # 研究模块
│   │   │   │   ├── deep-research/ # 深度研究
│   │   │   │   │   └── deep-research.module.ts
│   │   │   │   ├── fast-research/ # 快速研究
│   │   │   │   │   └── fast-research.module.ts
│   │   │   │   ├── notebook-research/ # 笔记本研究
│   │   │   │   │   └── notebook-research.module.ts
│   │   │   │   └── topic-research/ # 话题研究
│   │   │   │       └── topic-research.module.ts
│   │   │   │
│   │   │   ├── simulation/     # AI 模拟应用
│   │   │   │   └── ai-simulation.module.ts
│   │   │   │
│   │   │   ├── social/         # AI 社交内容生成
│   │   │   │   └── ai-social.module.ts
│   │   │   │
│   │   │   ├── teams/          # AI 团队应用
│   │   │   │   ├── ai-teams.module.ts
│   │   │   │   ├── __tests__/  # 测试
│   │   │   │   ├── agents/     # 团队 Agent
│   │   │   │   ├── dto/        # DTO
│   │   │   │   └── services/   # 服务层
│   │   │   │       ├── ai/     # AI 服务
│   │   │   │       ├── collaboration/ # 协作服务
│   │   │   │       ├── topic/  # 话题服务
│   │   │   │       └── utils/  # 工具
│   │   │   │
│   │   │   └── writing/        # AI 写作应用
│   │   │       └── ai-writing.module.ts
│   │   │
│   │   ├── content/            # 内容层 (内容管理)
│   │   │   ├── collections/    # 收藏夹
│   │   │   │   ├── collections.module.ts
│   │   │   │   └── dto/        # DTO
│   │   │   │
│   │   │   ├── comments/       # 评论系统
│   │   │   │   ├── comments.module.ts
│   │   │   │   └── dto/        # DTO
│   │   │   │
│   │   │   ├── explore/        # 内容浏览
│   │   │   │   ├── explore.module.ts
│   │   │   │   └── dto/        # DTO
│   │   │   │
│   │   │   ├── feed/           # 信息流
│   │   │   │   └── feed.module.ts
│   │   │   │
│   │   │   ├── knowledge-graph/# 知识图谱
│   │   │   │   └── knowledge-graph.module.ts
│   │   │   │
│   │   │   ├── notes/          # 笔记系统
│   │   │   │   ├── notes.module.ts
│   │   │   │   └── dto/        # DTO
│   │   │   │
│   │   │   ├── recommendations/# 推荐系统
│   │   │   │   └── recommendations.module.ts
│   │   │   │
│   │   │   ├── reports/        # 报告系统
│   │   │   │   ├── reports.module.ts
│   │   │   │   └── dto/        # DTO
│   │   │   │
│   │   │   ├── resources/      # 资源管理
│   │   │   │   ├── resources.module.ts
│   │   │   │   ├── config/     # 资源配置
│   │   │   │   └── types/      # 类型定义
│   │   │   │
│   │   │   └── workspace/      # 工作空间
│   │   │       ├── workspace.module.ts
│   │   │       └── dto/        # DTO
│   │   │
│   │   ├── core/               # 核心层 (基础服务)
│   │   │   ├── admin/          # 管理功能
│   │   │   │   ├── admin.module.ts
│   │   │   │   └── __tests__/  # 测试
│   │   │   │
│   │   │   ├── auth/           # 认证授权
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── __tests__/  # 测试
│   │   │   │   ├── dto/        # DTO
│   │   │   │   └── strategies/ # Passport 策略
│   │   │   │
│   │   │   ├── email/          # 邮件服务
│   │   │   │   └── email.module.ts
│   │   │   │
│   │   │   ├── feedback/       # 反馈系统
│   │   │   │   ├── feedback.module.ts
│   │   │   │   └── dto/        # DTO
│   │   │   │
│   │   │   ├── notifications/  # 通知中心
│   │   │   │   └── notification.module.ts
│   │   │   │
│   │   │   ├── release/        # 发布管理
│   │   │   │   └── release.module.ts
│   │   │   │
│   │   │   ├── secrets/        # 密钥管理
│   │   │   │   └── secrets.module.ts
│   │   │   │
│   │   │   ├── settings/       # 系统设置
│   │   │   │   └── settings.module.ts
│   │   │   │
│   │   │   └── storage/        # 文件存储
│   │   │       └── storage.module.ts
│   │   │
│   │   ├── credits/            # 积分系统
│   │   │   └── credits.module.ts
│   │   │
│   │   ├── ingestion/          # 采集层 (数据采集)
│   │   │   ├── config/         # 采集配置
│   │   │   │   └── config.module.ts
│   │   │   │
│   │   │   ├── crawlers/       # 爬虫服务
│   │   │   │   └── crawlers.module.ts
│   │   │   │
│   │   │   ├── scheduler/      # 调度器
│   │   │   │   └── scheduler.module.ts
│   │   │   │
│   │   │   └── sources/        # 数据源管理
│   │   │       └── sources.module.ts
│   │   │
│   │   ├── integrations/       # 集成层 (第三方集成)
│   │   │   ├── ai-file-organizer/ # AI 文件组织器
│   │   │   │   └── ai-file-organizer.module.ts
│   │   │   │
│   │   │   ├── google-drive/   # Google Drive 集成
│   │   │   │   └── google-drive.module.ts
│   │   │   │
│   │   │   ├── notion/         # Notion 集成
│   │   │   │   ├── notion.module.ts
│   │   │   │   ├── dto/        # DTO
│   │   │   │   └── services/   # 服务
│   │   │   │
│   │   │   ├── proxy/          # 代理服务
│   │   │   │   └── proxy.module.ts
│   │   │   │
│   │   │   └── wechat-work/    # 企业微信
│   │   │       └── wechat-work.module.ts
│   │   │
│   │   └── webhooks/           # Webhooks
│   │       └── webhooks.module.ts
│   │
│   └── types/                  # 全局类型定义
│
├── public/                     # 公共资源
│   └── thumbnails/             # 缩略图存储
│
├── scripts/                    # 脚本工具
└── test/                       # 测试
    └── __mocks__/              # Mock 文件
```

---

## AI 服务目录 (ai-service/)

Python FastAPI 微服务，提供 AI 推理和编排能力。

```
ai-service/
├── main.py                     # 应用入口
│
├── models/                     # 数据模型
│   ├── schemas.py              # Pydantic 模型
│   └── __init__.py
│
├── routers/                    # API 路由
│   ├── add_options.py          # 添加选项
│   ├── ai.py                   # AI 服务路由
│   ├── quick_generate.py       # 快速生成
│   ├── report.py               # 报告生成
│   ├── trend.py                # 趋势分析
│   ├── workspace.py            # 工作空间
│   └── __init__.py
│
├── services/                   # 业务服务
│   ├── ai_orchestrator.py      # AI 服务编排
│   ├── grok_client.py          # Grok API 客户端
│   ├── openai_client.py        # OpenAI API 客户端
│   ├── precise_citation.py     # 精确引用
│   ├── template_loader.py      # 模板加载器
│   ├── trend_analysis.py       # 趋势分析
│   ├── workspace_pipeline.py   # 工作空间流水线
│   ├── workspace_task_manager.py # 任务管理器
│   └── __init__.py
│
└── utils/                      # 工具函数
    ├── cors_fix.py             # CORS 修复
    ├── feature_flags.py        # 功能开关
    ├── secret_manager.py       # 密钥管理
    └── __init__.py
```

---

## 文档目录 (docs/)

项目文档、架构设计和产品需求文档。

```
docs/
├── api/                        # API 文档
│   ├── data-collection-api.md  # 数据采集 API
│   └── readme.md               # API 文档总览
│
├── architecture/               # 架构设计文档
│   ├── ai-apps/                # AI 应用架构
│   │   ├── ai-office/          # AI Office 架构
│   │   └── ai-writing/         # AI Writing 架构
│   ├── ai-engine/              # AI 引擎架构
│   │   ├── ai-engine-parameter-abstraction.md
│   │   └── ai-engine-target-architecture.md
│   ├── ai-teams/               # AI Teams 架构
│   │   ├── ai-teams-long-content-e2e-design.md
│   │   └── ai-teams-long-text-processing.md
│   └── system/                 # 系统架构
│       ├── integrations/       # 集成架构
│       └── unified-secrets-management-design.md
│
├── features/                   # 功能特性文档
│   ├── ai-apps/                # AI 应用功能
│   │   ├── blog-collection/    # 博客采集
│   │   └── image-generator/    # 图像生成
│   └── ai-teams/               # AI Teams 功能
│       ├── ai-teams-product-vision.md
│       ├── code-review-report.md
│       ├── debate-system.md
│       ├── gap-analysis.md
│       ├── mission-execution.md
│       └── system-design.md
│
├── guides/                     # 开发指南
│   ├── authentication/         # 认证指南
│   │   └── google-oauth-setup.md
│   ├── claude-code/            # Claude Code 使用指南
│   │   ├── claude-skills-ecosystem.md
│   │   └── claude-skills-guide.md
│   ├── deployment/             # 部署指南
│   │   ├── deployment-guide.md
│   │   └── railway-env-config.md
│   ├── development/            # 开发指南
│   │   └── ai-calling-standards.md
│   └── testing/                # 测试指南
│       └── test-coverage-analysis.md
│
├── prd/                        # 产品需求文档
│   ├── ai-apps/                # AI 应用 PRD
│   │   ├── ai-ask/             # AI Ask PRD
│   │   ├── ai-coding/          # AI Coding PRD
│   │   ├── ai-office/          # AI Office PRD
│   │   ├── ai-slides/          # AI Slides PRD
│   │   └── ai-writing/         # AI Writing PRD
│   ├── ai-teams/               # AI Teams PRD
│   │   ├── ai-group-*.md       # AI 群组 PRD
│   │   └── topic-research/     # 话题研究 PRD
│   └── infra/                  # 基础设施 PRD
│       ├── core/               # 核心功能 PRD
│       ├── data-collection/    # 数据采集 PRD
│       ├── integrations/       # 集成 PRD
│       ├── knowledge-base/     # 知识库 PRD
│       └── library/            # 资源库 PRD
│
└── _archive/                   # 历史归档
    ├── _CLEANUP_README.md      # 清理说明
    ├── _CLEANUP_TASK_COMPLETION.md
    ├── architecture-old/       # 旧架构文档
    └── old-structure/          # 旧结构文档
        ├── archive/            # 历史归档
        │   └── 2025-q1/        # 2025 Q1 归档
        ├── improvement/        # 改进计划
        └── tasks/              # 任务记录
```

---

## Claude Code 配置 (.claude/)

Claude Code AI 助手配置、技能和编码标准。

```
.claude/
├── CLAUDE.md                   # 全局配置
├── settings.json               # VS Code 设置
├── README.md                   # 配置总览
│
├── adrs/                       # 架构决策记录 (ADR)
│   ├── 0001-monorepo-architecture.md
│   ├── 0002-typescript-strict-mode.md
│   ├── 0003-dual-database-strategy.md
│   ├── README.md
│   └── template.md
│
├── agents/                     # Agent 配置 (9 个)
│   ├── architect.md            # 架构师
│   ├── coder.md                # 编码者
│   ├── docs-specialist.md      # 文档专家
│   ├── merge-to-main.md        # 合并管理
│   ├── monitoring.md           # 监控
│   ├── pm.md                   # 产品经理
│   ├── reviewer.md             # 审查者
│   ├── scripts-guardian.md     # 脚本守护者
│   └── tester.md               # 测试者
│
├── analysis/                   # 分析报告
│   └── documentation-analysis-report.md # 文档分析报告 (本次生成)
│
├── commands/                   # 快捷命令 (13 个)
│   ├── ai-teams.md             # AI Teams 命令
│   ├── ai-writing.md           # AI Writing 命令
│   ├── debug.md                # 调试命令
│   ├── deploy.md               # 部署命令
│   ├── docs.md                 # 文档命令
│   ├── fix.md                  # 修复命令
│   ├── perf.md                 # 性能命令
│   ├── prompt.md               # 提示词命令
│   ├── review.md               # 审查命令
│   ├── schema.md               # Schema 命令
│   ├── tdd.md                  # TDD 命令
│   ├── test.md                 # 测试命令
│   └── verify.md               # 验证命令
│
├── config/                     # 配置文件
│   ├── merge-to-main.yml       # 合并配置
│   ├── monitoring.yml          # 监控配置
│   └── README.md
│
├── prompts/                    # 提示词模板
│   ├── system/                 # 系统提示词
│   │   ├── researcher-agent.md
│   │   ├── reviewer-agent.md
│   │   └── writer-agent.md
│   └── README.md
│
├── skills/                     # 技能定义 (33 个)
│   ├── ai/                     # AI 技能 (7 个)
│   │   ├── ai-app-developer/
│   │   ├── ai-architecture-layering/
│   │   ├── ai-engine-development-paradigm/
│   │   ├── ai-service-expert/
│   │   ├── ai-teams-expert/
│   │   ├── document-generation/
│   │   ├── prompt-engineering/
│   │   └── writing-quality/
│   │
│   ├── architecture/           # 架构技能 (4 个)
│   │   ├── document-processor/
│   │   ├── mcp-builder/
│   │   ├── schema-architect/
│   │   └── security-specialist/
│   │
│   ├── data/                   # 数据技能 (2 个)
│   │   ├── data-pipeline-expert/
│   │   └── knowledge-graph-expert/
│   │
│   ├── development/            # 开发技能 (8 个)
│   │   ├── api-developer/
│   │   ├── complex-feature-implementation/
│   │   ├── database-manager/
│   │   ├── database-migration/
│   │   ├── frontend-expert/
│   │   ├── git-automation/
│   │   ├── realtime-communication-expert/
│   │   ├── state-management-expert/
│   │   └── webapp-testing/
│   │
│   ├── frontend/               # 前端技能 (3 个)
│   │   ├── admin-config-layout.skill.md
│   │   ├── defect-patterns.skill.md
│   │   └── page-layout-standard.skill.md
│   │
│   ├── operations/             # 运维技能 (4 个)
│   │   ├── debug-ops/
│   │   ├── dev-environment/
│   │   ├── devops-platform/
│   │   └── git-workflow/
│   │
│   ├── quality/                # 质量技能 (3 个)
│   │   ├── code-reviewer/
│   │   ├── performance-optimizer/
│   │   └── testing-suite/
│   │
│   └── README.md
│
├── standards/                  # 编码标准 (15 个)
│   ├── 00-overview.md          # 规范总览
│   ├── 02-directory-structure.md
│   ├── 03-naming-conventions.md
│   ├── 04-code-style.md
│   ├── 05-api-design.md
│   ├── 06-database-design.md
│   ├── 07-testing-standards.md
│   ├── 08-git-workflow.md
│   ├── 09-documentation.md
│   ├── 10-documentation-organization.md
│   ├── 10-security.md
│   ├── 11-logging-standards.md
│   ├── 12-scripts-management.md
│   ├── 13-module-dependencies.md
│   └── 99-quick-reference.md
│
├── templates/                  # 模板 (4 个)
│   ├── commit-template.md
│   ├── issue-template.md
│   ├── pr-template.md
│   └── README.md
│
└── tools/                      # 工具脚本 (6 个)
    ├── check-all.ps1           # Windows 检查脚本
    ├── check-all.sh            # Linux/Mac 检查脚本
    ├── monitor-ci.ps1
    ├── monitor-ci.sh
    ├── pre-merge-validation.ps1
    ├── pre-merge-validation.sh
    ├── rollback-merge.sh
    ├── validate-commit.ps1
    └── validate-commit.sh
```

---

## 脚本目录 (scripts/)

运维和开发脚本。

```
scripts/
├── start-all.bat               # 启动所有服务 (Windows)
├── stop-all.bat                # 停止所有服务 (Windows)
└── test-data-management-api.sh # 测试 API
```

---

## 配置文件 (根目录)

```
deepdive/
├── package.json                # 项目配置和脚本
├── pnpm-workspace.yaml         # pnpm 工作空间
├── docker-compose.yml          # Docker 配置
├── .env.example                # 环境变量示例
├── .gitignore                  # Git 忽略规则
├── .prettierrc                 # Prettier 配置
├── .eslintrc.js                # ESLint 配置
├── turbo.json                  # Turborepo 配置
├── readme.md                   # 项目说明
└── STRUCTURE.md                # 本文件
```

---

## 快速导航

| 需求          | 位置                                              |
| ------------- | ------------------------------------------------- |
| 添加新页面    | `frontend/app/`                                   |
| 添加 UI 组件  | `frontend/components/ui/`                         |
| 添加业务组件  | `frontend/components/{module}/`                   |
| 添加 Hook     | `frontend/hooks/{core\|domain\|features\|utils}/` |
| 添加 API 端点 | `backend/src/modules/{module}/`                   |
| 添加 AI 功能  | `backend/src/modules/ai/`                         |
| 添加数据模型  | `backend/prisma/schema.prisma`                    |
| 添加文档      | `docs/`                                           |
| 添加脚本      | `scripts/`                                        |

---

## 命名规范

- **目录**: 小写，连字符分隔 (`ai-office`, `data-management`)
- **React 组件**: PascalCase (`UserProfile.tsx`)
- **Hooks**: camelCase，use 前缀 (`useResources.ts`)
- **服务**: kebab-case + .service 后缀 (`ai-core.service.ts`)
- **控制器**: kebab-case + .controller 后缀 (`resources.controller.ts`)
- **DTO**: PascalCase + Dto 后缀 (`CreateResourceDto.ts`)

---

---

## 架构分层说明

Genesis.ai 采用清晰的分层架构：

```
AI Engine (ai-engine/)
    ├── 核心能力层 - 领域无关的通用 AI 能力
    ├── image/           # 图像处理引擎
    ├── long-content/    # 长文本处理引擎
    └── teams/           # 团队协作引擎

AI Apps (ai-app/)
    ├── 应用层 - 具体业务应用
    ├── ask/             # AI 问答应用
    ├── coding/          # AI 编程助手
    ├── image/           # AI 图像生成
    ├── office/          # AI 办公套件
    ├── research/        # AI 研究平台
    ├── simulation/      # AI 模拟
    ├── social/          # AI 社交内容生成
    ├── teams/           # AI 团队
    └── writing/         # AI 写作

Content (content/)
    ├── 内容层 - 内容管理
    ├── collections/     # 收藏夹
    ├── resources/       # 资源管理
    ├── notes/           # 笔记系统
    ├── knowledge-graph/ # 知识图谱
    └── workspace/       # 工作空间

Ingestion (ingestion/)
    ├── 采集层 - 数据采集
    ├── crawlers/        # 爬虫服务
    ├── sources/         # 数据源管理
    └── scheduler/       # 调度器

Integrations (integrations/)
    ├── 集成层 - 第三方集成
    ├── notion/          # Notion 集成
    ├── google-drive/    # Google Drive 集成
    └── wechat-work/     # 企业微信集成

Core (core/)
    ├── 核心层 - 基础服务
    ├── auth/            # 认证授权
    ├── admin/           # 管理功能
    ├── secrets/         # 密钥管理
    └── storage/         # 文件存储
```

---

## 数据库架构

**统一 PostgreSQL 架构** - 成本优化 70-75%

- **PostgreSQL 16**: 唯一数据库
  - 结构化数据（用户、资源、笔记等）
  - 原始数据存储（JSONB 字段）
  - 知识图谱（Recursive CTEs）
- **Redis 7**: 缓存、会话管理
- **FlareSolverr**: Cloudflare 绕过代理服务

**架构优势**:

- 单点数据管理，备份简化
- JSONB GIN 索引，查询性能优异
- 递归 CTE 实现图关系，无需 Neo4j
- 运维成本降低，数据一致性保证

---

**最后更新**: 2026-01-23
**维护者**: Claude Code
**版本**: 3.0
