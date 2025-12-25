# DeepDive Engine 项目结构

> 最后更新: 2024-12-25 | 维护者: Claude Code | 版本: 2.0

## 项目概览

DeepDive Engine 是一个基于 AI 的深度研究和内容管理平台，采用 monorepo 结构，包含前端、后端、AI 服务和文档。

```
deepdive/
├── frontend/           # Next.js 14 前端应用
├── backend/            # NestJS 后端服务
├── ai-service/         # Python AI 微服务
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
│   │   ├── ai-models/          # AI 模型管理
│   │   ├── collection/         # 数据采集任务管理
│   │   ├── dashboard/          # 管理仪表板
│   │   ├── data-management/    # 数据源管理
│   │   ├── external-api/       # 外部 API 密钥管理
│   │   ├── feedback/           # 用户反馈管理
│   │   ├── settings/           # 系统设置
│   │   ├── storage/            # 存储管理
│   │   ├── thumbnails/         # 缩略图管理
│   │   ├── users/              # 用户管理
│   │   ├── whitelists/         # 白名单管理
│   │   └── workspace/          # 工作空间管理
│   │
│   ├── ai-ask/                 # AI 问答模块
│   ├── ai-coding/              # AI 编程助手
│   │   ├── [projectId]/        # 项目详情页
│   │   ├── kanban/             # 看板视图
│   │   └── new/                # 创建新项目
│   │
│   ├── ai-office/              # AI 办公套件
│   │   ├── designer/           # 设计工具
│   │   ├── docs/               # 文档生成
│   │   └── slides/             # 幻灯片生成
│   │
│   ├── ai-simulation/          # AI 辩论模拟
│   │   ├── [id]/               # 模拟详情
│   │   ├── components/         # 模拟专用组件
│   │   ├── edit/               # 编辑模拟
│   │   └── run/                # 运行模拟
│   │
│   ├── ai-store/               # AI 应用商店
│   ├── ai-studio/              # AI 深度研究工作室
│   │   └── [projectId]/        # 项目详情
│   │
│   ├── ai-teams/               # AI 团队协作
│   │   └── [topicId]/          # 话题详情
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
│   ├── explore/                # 内容浏览
│   │   ├── report/             # 报告详情
│   │   ├── resource/           # 资源详情
│   │   └── youtube/            # YouTube 内容
│   │
│   ├── feedback/               # 用户反馈
│   │   └── history/            # 反馈历史
│   │
│   ├── knowledge-graph/        # 知识图谱可视化
│   ├── labs/                   # 实验性功能
│   ├── library/                # 资源库
│   ├── notifications/          # 通知中心
│   ├── notion/                 # Notion 集成
│   │   └── [pageId]/           # Notion 页面
│   │
│   ├── profile/                # 用户资料
│   ├── studio/                 # 内容工作室
│   │   └── [id]/               # 内容详情
│   │
│   └── whats-new/              # 更新日志
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
│   ├── ai-simulation/          # AI 模拟组件
│   ├── ai-studio/              # AI Studio 组件
│   │   ├── citations/          # 引用组件
│   │   └── outputs/            # 输出组件
│   │
│   ├── ai-teams/               # AI 团队组件
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

NestJS 应用，提供 RESTful API，集成 Prisma ORM、MongoDB 和 Neo4j。

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
│   │   ├── graph/              # 图数据库工具
│   │   ├── guards/             # 认证守卫
│   │   │   └── __tests__/      # 守卫测试
│   │   │
│   │   ├── interceptors/       # 拦截器
│   │   │   └── decorators/     # 拦截器装饰器
│   │   │
│   │   ├── mongodb/            # MongoDB 服务
│   │   ├── neo4j/              # Neo4j 服务
│   │   ├── prisma/             # Prisma 服务
│   │   ├── rawdata/            # 原始数据服务
│   │   ├── streaming/          # SSE 流式响应
│   │   └── utils/              # 工具函数
│   │
│   ├── config/                 # 应用配置
│   │
│   ├── modules/                # 功能模块
│   │   ├── ai/                 # AI 模块群
│   │   │   ├── ai-agents/      # Agent 框架
│   │   │   │   ├── core/       # 核心功能
│   │   │   │   │   ├── agent/      # Agent 基类
│   │   │   │   │   ├── errors/     # 错误处理
│   │   │   │   │   ├── execution/  # 执行引擎
│   │   │   │   │   ├── guardrails/ # 安全护栏
│   │   │   │   │   ├── llm/        # LLM 适配器
│   │   │   │   │   ├── mcp/        # MCP 协议
│   │   │   │   │   ├── memory/     # 记忆系统
│   │   │   │   │   ├── tool/       # 工具系统
│   │   │   │   │   └── validation/ # 验证
│   │   │   │   │
│   │   │   │   ├── dto/            # 数据传输对象
│   │   │   │   ├── implementations/# Agent 实现
│   │   │   │   │   ├── designer/   # 设计 Agent
│   │   │   │   │   ├── developer/  # 开发 Agent
│   │   │   │   │   ├── docs/       # 文档 Agent
│   │   │   │   │   ├── image-designer/ # 图像设计
│   │   │   │   │   ├── researcher/ # 研究 Agent
│   │   │   │   │   ├── simulator/  # 模拟 Agent
│   │   │   │   │   ├── slides/     # 幻灯片 Agent
│   │   │   │   │   └── team-collaboration/ # 团队协作
│   │   │   │   │
│   │   │   │   └── tools/          # Agent 工具
│   │   │   │       ├── collaboration/  # 协作工具
│   │   │   │       ├── execution/      # 执行工具
│   │   │   │       ├── export/         # 导出工具
│   │   │   │       ├── generation/     # 生成工具
│   │   │   │       ├── information/    # 信息工具
│   │   │   │       ├── integration/    # 集成工具
│   │   │   │       ├── memory/         # 记忆工具
│   │   │   │       └── processing/     # 处理工具
│   │   │   │
│   │   │   ├── ai-ask/         # AI 问答服务
│   │   │   │   └── adapters/   # 模型适配器
│   │   │   │
│   │   │   ├── ai-coding/      # AI 编程服务
│   │   │   │   ├── constants/  # 常量定义
│   │   │   │   ├── dto/        # DTO
│   │   │   │   ├── prompts/    # 提示词模板
│   │   │   │   └── services/   # 服务层
│   │   │   │
│   │   │   ├── ai-core/        # AI 核心服务
│   │   │   │   └── exceptions/ # AI 异常
│   │   │   │
│   │   │   ├── ai-image/       # AI 图像服务
│   │   │   │   ├── analytics/      # 图像分析
│   │   │   │   ├── brand-kit/      # 品牌套件
│   │   │   │   ├── core/           # 核心服务
│   │   │   │   ├── export/         # 图像导出
│   │   │   │   ├── generation/     # 图像生成
│   │   │   │   ├── infographic/    # 信息图
│   │   │   │   │   └── templates/  # 模板
│   │   │   │   └── storage/        # 图像存储
│   │   │   │
│   │   │   ├── ai-office/      # AI 办公服务
│   │   │   │   ├── __tests__/      # 测试
│   │   │   │   ├── agents/         # Office Agent
│   │   │   │   ├── code-execution/ # 代码执行
│   │   │   │   ├── core/           # 核心服务
│   │   │   │   ├── designer/       # 设计服务
│   │   │   │   ├── docs/           # 文档服务
│   │   │   │   ├── documents/      # 文档管理
│   │   │   │   ├── export/         # 导出服务
│   │   │   │   ├── generation/     # 生成服务
│   │   │   │   └── ppt/            # PPT 服务
│   │   │   │
│   │   │   ├── ai-simulation/  # AI 辩论模拟
│   │   │   │
│   │   │   ├── ai-studio/      # AI 深度研究
│   │   │   │   ├── deep-research/  # 深度研究引擎
│   │   │   │   ├── dto/            # DTO
│   │   │   │   └── services/       # 服务层
│   │   │   │
│   │   │   └── ai-teams/       # AI 团队服务
│   │   │       ├── __tests__/      # 测试
│   │   │       ├── agents/         # 团队 Agent
│   │   │       ├── dto/            # DTO
│   │   │       └── services/       # 服务层
│   │   │           ├── ai/         # AI 服务
│   │   │           ├── collaboration/ # 协作服务
│   │   │           ├── topic/      # 话题服务
│   │   │           └── utils/      # 工具
│   │   │
│   │   ├── content/            # 内容模块
│   │   │   ├── collections/    # 收藏夹
│   │   │   │   └── dto/        # DTO
│   │   │   │
│   │   │   ├── comments/       # 评论系统
│   │   │   │   └── dto/        # DTO
│   │   │   │
│   │   │   ├── explore/        # 内容浏览
│   │   │   │   └── dto/        # DTO
│   │   │   │
│   │   │   ├── feed/           # 信息流
│   │   │   ├── notes/          # 笔记系统
│   │   │   │   └── dto/        # DTO
│   │   │   │
│   │   │   ├── reports/        # 报告系统
│   │   │   │   └── dto/        # DTO
│   │   │   │
│   │   │   ├── resources/      # 资源管理
│   │   │   │   ├── config/     # 资源配置
│   │   │   │   └── types/      # 类型定义
│   │   │   │
│   │   │   └── workspace/      # 工作空间
│   │   │       └── dto/        # DTO
│   │   │
│   │   ├── core/               # 核心模块
│   │   │   ├── admin/          # 管理功能
│   │   │   │   └── __tests__/  # 测试
│   │   │   │
│   │   │   ├── auth/           # 认证授权
│   │   │   │   ├── __tests__/  # 测试
│   │   │   │   ├── dto/        # DTO
│   │   │   │   └── strategies/ # Passport 策略
│   │   │   │
│   │   │   ├── email/          # 邮件服务
│   │   │   ├── feedback/       # 反馈系统
│   │   │   │   └── dto/        # DTO
│   │   │   │
│   │   │   ├── settings/       # 系统设置
│   │   │   └── storage/        # 文件存储
│   │   │
│   │   ├── data-services/      # 数据服务
│   │   │   ├── blog-collection/# 博客采集
│   │   │   │   ├── controllers/# 控制器
│   │   │   │   ├── services/   # 服务
│   │   │   │   └── types/      # 类型
│   │   │   │
│   │   │   ├── crawler/        # 爬虫服务
│   │   │   ├── data-collection/# 数据采集
│   │   │   ├── data-management/# 数据管理
│   │   │   │   ├── controllers/# 控制器
│   │   │   │   └── services/   # 服务
│   │   │   │
│   │   │   ├── knowledge-graph/# 知识图谱
│   │   │   └── recommendations/# 推荐系统
│   │   │
│   │   ├── export/             # 统一导出模块
│   │   │   ├── controllers/    # 导出控制器
│   │   │   ├── renderers/      # 格式渲染器
│   │   │   ├── services/       # 导出服务
│   │   │   ├── templates/      # 导出模板
│   │   │   └── types/          # 类型定义
│   │   │
│   │   └── integrations/       # 第三方集成
│   │       ├── notion/         # Notion 集成
│   │       │   ├── dto/        # DTO
│   │       │   └── services/   # 服务
│   │       │
│   │       ├── proxy/          # 代理服务
│   │       └── wechat-work/    # 企业微信
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

Python FastAPI 微服务，提供 AI 推理能力。

```
ai-service/
├── main.py                     # 应用入口
├── configs/                    # 配置文件
│   └── templates/              # 提示词模板
│
├── models/                     # 数据模型
├── routers/                    # API 路由
├── services/                   # 业务服务
├── scripts/                    # 工具脚本
└── utils/                      # 工具函数
```

---

## 文档目录 (docs/)

项目文档、架构设计和功能规格。

```
docs/
├── ai-trends/                  # AI 趋势研究
│   ├── agentic-ai/             # Agent AI
│   ├── agi/                    # 通用人工智能
│   ├── ai4science/             # AI for Science
│   ├── ai-medicine/            # AI 医疗
│   ├── code-agents/            # 代码 Agent
│   ├── hardware/               # AI 硬件
│   ├── inference/              # 推理优化
│   ├── model-evolution/        # 模型演进
│   ├── multimodal/             # 多模态
│   └── spatial-intelligence/   # 空间智能
│
├── api/                        # API 文档
├── architecture/               # 架构设计文档
├── archive/                    # 归档文档
│   ├── 2025-q1/                # 2025 Q1 归档
│   │   ├── audits/             # 审计报告
│   │   ├── execution-logs/     # 执行日志
│   │   ├── issues/             # 问题记录
│   │   ├── planning/           # 规划文档
│   │   ├── reports/            # 报告
│   │   └── summaries/          # 摘要
│   │
│   ├── planning/               # 历史规划
│   └── weekly-reports/         # 周报
│
├── data-management/            # 数据管理文档
├── decisions/                  # 技术决策记录 (ADR)
├── design/                     # UI/UX 设计规范
├── features/                   # 功能特性文档
│   ├── ai-agents/              # Agent 功能
│   ├── ai-coding/              # AI 编程功能
│   ├── ai-office/              # AI 办公功能
│   ├── ai-studio/              # AI Studio 功能
│   ├── ai-teams/               # AI 团队功能
│   ├── blog-collection/        # 博客采集
│   ├── image-generator/        # 图像生成
│   └── workspace-reporting/    # 工作空间报告
│
├── guides/                     # 开发指南
│   ├── authentication/         # 认证指南
│   └── deployment/             # 部署指南
│
├── implementation/             # 实现文档
├── operations/                 # 运维文档
├── prd/                        # 产品需求文档
│   └── archive/                # 归档 PRD
│
├── product-reviews/            # 产品评审
├── project-reports/            # 项目报告
├── releases/                   # 发布说明
├── tech-stack/                 # 技术栈文档
│   ├── ai-llm/                 # AI/LLM 技术
│   ├── backend/                # 后端技术
│   ├── database/               # 数据库
│   ├── data-collection/        # 数据采集
│   ├── frontend/               # 前端技术
│   └── realtime/               # 实时通信
│
└── testing/                    # 测试文档
```

---

## Claude Code 配置 (.claude/)

Claude Code AI 助手配置和 Skills。

```
.claude/
├── CLAUDE.md                   # 全局指令
├── adrs/                       # 架构决策记录
├── agents/                     # Agent 配置
├── config/                     # 配置文件
├── logs/                       # 日志
├── orchestrator/               # 任务编排
├── skills/                     # 技能定义
│   ├── ai-service-expert/      # AI 服务专家
│   ├── ai-teams-expert/        # AI 团队专家
│   ├── api-developer/          # API 开发者
│   ├── code-reviewer/          # 代码审查
│   ├── data-collection-expert/ # 数据采集专家
│   ├── database-manager/       # 数据库管理
│   ├── deployment-ops/         # 部署运维
│   ├── dev-environment/        # 开发环境
│   ├── document-processor/     # 文档处理
│   ├── frontend-builder/       # 前端构建
│   ├── git-workflow/           # Git 工作流
│   ├── i18n-localization/      # 国际化
│   ├── knowledge-graph-expert/ # 知识图谱专家
│   ├── monitoring-ops/         # 监控运维
│   ├── performance-optimizer/  # 性能优化
│   ├── security-specialist/    # 安全专家
│   └── testing-expert/         # 测试专家
│
├── standards/                  # 编码标准
└── tools/                      # 工具配置
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

**最后更新**: 2024-12-25
**维护者**: Claude Code
**版本**: 2.0
