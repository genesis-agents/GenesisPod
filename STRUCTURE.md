# Genesis.ai 项目结构

> 最后更新: 2026-03-08 | 维护者: Claude Code | 版本: 5.0

## 项目概览

Genesis.ai 是一个企业级 AI 深度研究和内容管理平台，采用 monorepo 结构，包含前端、后端、AI 服务和文档。

```
deepdive-engine/
├── frontend/           # Next.js 14 前端应用
├── backend/            # NestJS 后端服务
├── ai-service/         # Python FastAPI 微服务（辅助）
├── docs/               # 项目文档
├── scripts/            # 运维脚本
├── infra/              # 部署配置
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
│   │   │   ├── research-templates/ # 研究模板
│   │   │   ├── skills/         # AI 技能管理
│   │   │   ├── teams/          # AI 团队管理
│   │   │   └── tools/          # AI 工具管理
│   │   ├── credits/            # 积分管理
│   │   ├── data/               # 数据管理
│   │   │   ├── collection/     # 数据采集
│   │   │   ├── quality/        # 数据质量
│   │   │   └── whitelists/     # 白名单
│   │   ├── data-management/    # 数据源管理
│   │   ├── feedback/           # 用户反馈管理
│   │   ├── logs/               # 日志查看
│   │   ├── system/             # 系统设置
│   │   │   ├── email/          # 邮件配置
│   │   │   ├── logs/           # 系统日志
│   │   │   ├── mcp-server/     # MCP 服务器管理
│   │   │   ├── site/           # 站点配置
│   │   │   └── storage/        # 存储配置
│   │   ├── thumbnails/         # 缩略图管理
│   │   └── workspace/          # 工作空间管理
│   │
│   ├── ai-ask/                 # AI 问答模块
│   ├── ai-image/               # AI 图像生成
│   │   └── create/             # 创建图像
│   │
│   ├── ai-insights/            # 话题洞察
│   │   ├── topic/[topicId]/    # 话题详情
│   │   └── topic-research/     # 话题研究页
│   │
│   ├── ai-office/              # AI 办公套件
│   │   └── slides/             # 幻灯片生成
│   │
│   ├── ai-planning/            # AI 规划
│   │   └── [planId]/           # 规划详情
│   │
│   ├── ai-research/            # AI 研究平台
│   │
│   ├── ai-simulation/          # AI 辩论模拟
│   │   ├── [id]/               # 模拟详情
│   │   └── edit/[id]/          # 编辑模拟
│   │
│   ├── ai-skills/              # AI 技能
│   ├── ai-social/              # AI 社交内容生成
│   │   ├── create/             # 创建内容
│   │   └── edit/[id]/          # 编辑内容
│   │
│   ├── ai-store/               # AI 应用商店
│   │
│   ├── ai-teams/               # AI 团队协作
│   │   └── [topicId]/          # 话题详情
│   │
│   ├── ai-writing/             # AI 写作助手
│   │   └── report/[missionId]/ # 报告详情
│   │
│   ├── api/                    # API Routes (BFF层)
│   │   ├── agents/             # Agent 相关 API
│   │   ├── ai/                 # AI 服务代理
│   │   ├── ai-office/          # AI Office API
│   │   ├── ai-service/         # AI 服务转发
│   │   ├── feedback/           # 反馈 API
│   │   ├── health/             # 健康检查
│   │   └── v1/                 # v1 API 路由
│   │
│   ├── auth/                   # 认证页面
│   │   └── callback/           # OAuth 回调
│   │
│   ├── changelog/              # 变更日志
│   ├── credits/                # 积分中心
│   ├── explore/                # 内容浏览
│   │   └── report/[id]/        # 报告详情
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
│   ├── report/[missionId]/     # 任务报告
│   └── share/                  # 分享页面
│       ├── image/[id]/         # 分享图像
│       ├── topic/[id]/         # 分享话题
│       └── writing/[id]/       # 分享写作
│
├── components/                 # React 组件库
│   ├── admin/                  # 管理后台组件
│   ├── ai-image/               # AI 图像组件
│   ├── ai-insights/            # 话题洞察组件
│   ├── ai-office/              # AI 办公组件
│   │   ├── core/               # 核心组件
│   │   ├── document/           # 文档组件
│   │   └── slides/             # 幻灯片组件
│   ├── ai-research/            # AI 研究组件
│   │   └── discussion/         # 讨论组件
│   ├── ai-social/              # AI 社交组件
│   ├── ai-teams/               # AI 团队组件
│   ├── ai-writing/             # AI 写作组件
│   ├── common/                 # 通用业务组件
│   ├── explore/                # 浏览组件
│   ├── features/               # 功能特性组件
│   ├── layout/                 # 布局组件 (AppShell, Header, Sidebar)
│   ├── library/                # 资源库组件
│   ├── notion/                 # Notion 组件
│   ├── shared/                 # 共享组件
│   └── ui/                     # 基础 UI 组件 (Button, Modal, Input 等)
│
├── hooks/                      # React Hooks
│   ├── core/                   # 核心 hooks (useApi, useStream, useAsyncOperation)
│   ├── domain/                 # 业务领域 hooks (useResources, useAdminUsers 等)
│   ├── features/               # 功能 hooks (useDeepResearch, useExport)
│   ├── swr/                    # SWR 数据获取 hooks
│   └── utils/                  # 工具 hooks (useMultiSelect, useUrlDetection)
│
├── lib/                        # 工具库和配置
│   ├── admin/                  # 管理后台工具
│   ├── ai-office/              # AI Office 工具
│   │   ├── agents/             # Agent 定义
│   │   └── multi-agents/       # 多 Agent 协作
│   ├── animation/              # 动画配置
│   ├── annotation/             # 文本标注
│   ├── api/                    # API 客户端配置
│   ├── cache/                  # 缓存工具
│   ├── constants/              # 常量定义
│   ├── explore/                # 浏览工具
│   ├── i18n/                   # 国际化
│   ├── markdown/               # Markdown 处理
│   ├── storage/                # 客户端存储
│   ├── swr/                    # SWR 配置
│   ├── templates/              # 模板定义
│   ├── utils/                  # 通用工具函数
│   └── workers/                # Web Workers
│
├── stores/                     # Zustand 状态管理
│   ├── aiOfficeStore.ts        # AI Office 状态
│   ├── aiPlanningStore.ts      # AI Planning 状态
│   └── topicInsightsStore.ts   # Topic Insights 状态
│
├── contexts/                   # React Context
│   └── AuthContext.tsx          # 认证上下文
│
├── types/                      # TypeScript 类型定义
│   ├── admin.ts
│   ├── ai-office.ts
│   ├── ai-teams.ts
│   ├── slides.ts
│   ├── slides-team.ts
│   └── topic-insights.ts
│
└── public/                     # 静态资源
    └── icons/ai/               # AI 提供商图标
```

---

## 后端目录 (backend/)

NestJS 应用，提供 RESTful API，集成 Prisma ORM 和 PostgreSQL（统一数据库架构）。

采用 **6 层架构**，各层职责清晰，单向依赖。

```
backend/
├── prisma/                     # Prisma ORM 配置
│   ├── schema/                 # 分拆的 schema 文件
│   │   ├── base.prisma         # 数据库连接配置
│   │   └── models.prisma       # 数据库模型定义（90+ models）
│   ├── migrations/             # 手写 SQL 迁移文件（120+）
│   ├── seed.ts                 # 种子数据
│   ├── deploy-migrations.ts    # 生产部署迁移
│   └── diagnose-db.ts          # 数据库诊断
│
├── src/
│   ├── main.ts                 # 应用入口
│   ├── app.module.ts           # 根模块
│   │
│   ├── common/                 # 公共基础设施（跨层共享）
│   │   ├── ai-orchestration/   # AI 提供者编排
│   │   ├── audit/              # 审计日志服务
│   │   ├── browser/            # 无头浏览器服务 (Puppeteer)
│   │   ├── cache/              # 缓存服务 (Redis)
│   │   ├── capabilities/       # 能力注册系统
│   │   ├── config/             # 应用配置 (品牌、安全、限流)
│   │   ├── content-processing/ # 内容处理服务
│   │   ├── context/            # 请求上下文
│   │   ├── deduplication/      # 去重服务
│   │   ├── events/             # 事件总线服务
│   │   ├── export/             # 导出编排服务 (PDF/Markdown)
│   │   ├── filters/            # 异常过滤器
│   │   ├── guards/             # 认证守卫 (JWT, Admin)
│   │   ├── interceptors/       # 拦截器
│   │   ├── observability/      # 可观测性
│   │   ├── prisma/             # Prisma 服务 + 启动迁移
│   │   ├── settings/           # 系统设置服务
│   │   ├── streaming/          # SSE 流式响应
│   │   └── utils/              # 工具函数 (crypto, lru-map 等)
│   │
│   ├── config/                 # 应用级配置
│   │
│   └── modules/                # 6 层业务模块
│       │
│       ├── intent-gateway/     # L6 意图网关层
│       │   ├── intent-gateway.module.ts
│       │   └── intent-gateway.service.ts
│       │
│       ├── open-api/           # L5 Open API（开放接口层）
│       │   ├── admin/          # 管理员 API
│       │   ├── mcp-server/     # MCP Server（Genesis 作为 MCP 服务端）
│       │   ├── public-api/     # Public REST API（外部消费者）
│       │   └── webhooks/       # Webhook 事件分发
│       │
│       ├── ai-app/             # L4 AI Apps（业务应用层）
│       │   ├── admin/          # 管理功能
│       │   │   ├── ingestion/  # 数据采集管理
│       │   │   └── workspace/  # 工作空间管理
│       │   ├── ask/            # AI 问答
│       │   ├── explore/        # 内容浏览
│       │   ├── feedback/       # 用户反馈
│       │   ├── image/          # AI 图像生成
│       │   ├── library/        # 资源库
│       │   │   ├── collections/        # 收藏夹
│       │   │   ├── notes/              # 笔记系统
│       │   │   ├── rag/                # RAG 应用
│       │   │   ├── knowledge-graph/    # 知识图谱
│       │   │   ├── ai-file-organizer/  # AI 文件组织
│       │   │   └── integrations/       # 第三方集成
│       │   │       ├── feishu/         # 飞书
│       │   │       ├── notion/         # Notion
│       │   │       └── google-drive/   # Google Drive
│       │   ├── office/         # AI 办公套件
│       │   │   ├── slides/     # 幻灯片服务
│       │   │   ├── content-analysis/   # 内容分析
│       │   │   ├── content-synthesis/  # 内容合成
│       │   │   └── export/     # 导出服务
│       │   ├── planning/       # AI 规划
│       │   ├── research/       # AI 研究
│       │   ├── shared/         # 共享工具（报告模板等）
│       │   ├── simulation/     # AI 辩论模拟
│       │   ├── social/         # AI 社交内容
│       │   ├── teams/          # AI 团队协作
│       │   ├── topic-insights/ # 话题洞察（Research 衍生）
│       │   └── writing/        # AI 写作
│       │
│       ├── ai-kernel/          # L3 AI Kernel（内核层）
│       │   └── ai-kernel.module.ts
│       │
│       ├── ai-engine/          # L2 AI Engine（核心能力层）
│       │   ├── agents/         # Agent 框架
│       │   ├── content/        # 内容处理引擎
│       │   ├── facade/         # 统一入口（L4 通过此访问 L2）
│       │   ├── guardrails/     # 护栏管道
│       │   ├── knowledge/      # 知识库
│       │   ├── llm/            # LLM 集成层
│       │   ├── mcp/            # MCP 客户端
│       │   ├── memory/         # 向量记忆
│       │   ├── observability/  # 可观测性
│       │   ├── orchestration/  # 任务编排
│       │   ├── rag/            # RAG 核心能力
│       │   ├── safety/         # 安全质量检查
│       │   ├── skills/         # 技能系统
│       │   ├── teams/          # Teams 框架
│       │   └── tools/          # 工具系统（200+ 工具）
│       │
│       └── ai-infra/           # L1 Infrastructure（基础设施层）
│           ├── auth/           # 认证授权
│           ├── credits/        # 积分系统
│           ├── email/          # 邮件服务
│           ├── monitoring/     # 监控服务
│           ├── notifications/  # 通知中心
│           ├── release/        # 发布管理
│           ├── secrets/        # 密钥管理
│           ├── settings/       # 系统设置
│           ├── storage/        # 文件存储
│           ├── table-management/ # 表格管理
│           └── user-api-keys/  # 用户 API Key 管理
│
├── scripts/                    # 后端脚本工具
└── test/                       # E2E 测试
```

---

## AI 服务目录 (ai-service/)

Python FastAPI 微服务，提供辅助 AI 推理和编排能力。

```
ai-service/
├── main.py                     # 应用入口
├── configs/templates/          # 模板配置
├── models/                     # Pydantic 模型
├── routers/                    # API 路由
├── services/                   # 业务服务
└── utils/                      # 工具函数
```

---

## 文档目录 (docs/)

```
docs/
├── analysis/                   # 架构评估
├── api/                        # API 文档
├── features/                   # 功能特性文档
├── guides/                     # 开发指南
│   ├── ai-calling-standards.md # AI 调用规范
│   ├── authentication/         # 认证指南
│   ├── deployment/             # 部署指南
│   └── testing/                # 测试指南
├── prd/                        # 产品需求文档
├── research/                   # 研究文档
├── system/                     # 系统架构
├── tasks/                      # 任务规范
└── _archive/                   # 历史归档
```

---

## 部署配置 (infra/)

```
infra/
├── railway/
│   ├── DEPLOY.md               # Railway 部署指南
│   ├── TROUBLESHOOTING.md      # 故障排查
│   ├── deploy.sh               # 部署脚本
│   ├── frontend.env.example    # 前端环境变量示例
│   └── backend.env.example     # 后端环境变量示例
└── edgeone/                    # EdgeOne CDN 配置
```

---

## Claude Code 配置 (.claude/)

```
.claude/
├── CLAUDE.md                   # 全局配置
├── CLAUDE.local.md             # 本地覆盖配置
├── settings.json               # 设置
│
├── agents/                     # Agent 配置（14 个）
│   ├── arch-auditor.md         # 架构审计
│   ├── arch-guardian.md        # 架构看护
│   ├── architect.md            # 架构师
│   ├── coder.md                # 编码者
│   ├── docs-specialist.md      # 文档专家
│   ├── explorer.md             # 探索者
│   ├── merge-to-main.md        # 合并管理
│   ├── monitoring.md           # 监控
│   ├── pm.md                   # 产品经理
│   ├── reviewer.md             # 审查者
│   ├── scripts-guardian.md     # 脚本守护者
│   ├── security-auditor.md     # 安全审计
│   └── tester.md               # 测试
│
├── adrs/                       # 架构决策记录
├── commands/                   # 自定义命令
│
├── config/                     # 配置文件
│   ├── merge-to-main.yml
│   └── monitoring.yml
│
├── rules/                      # 规则文件
│   ├── ai-engine.md
│   ├── security.md
│   ├── testing.md
│   └── typescript.md
│
├── skills/                     # 技能定义
│   ├── ai/                     # AI 技能
│   ├── architecture/           # 架构技能
│   ├── collaboration/          # 协作技能
│   ├── data/                   # 数据技能
│   ├── development/            # 开发技能
│   ├── frontend/               # 前端技能
│   ├── operations/             # 运维技能
│   ├── quality/                # 质量技能
│   └── workflow/               # 工作流技能
│
├── standards/                  # 编码标准（17 个文件）
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
│   ├── 14-skills-development.md
│   ├── 15-report-template.md
│   └── 99-quick-reference.md
│
└── worktrees/                  # Git Worktree 隔离目录
```

---

## 脚本目录 (scripts/)

```
scripts/
├── devops/                     # DevOps 脚本
│   └── sync-github-releases.ts
│
├── docs-specialist/            # 文档规范脚本
│
├── local-server/               # 本地服务器脚本
│   ├── start-all.bat
│   └── stop-all.bat
│
├── merge-to-main/              # 合并流程脚本
│   ├── monitor-ci.sh
│   ├── pre-merge-validation.sh
│   └── rollback-merge.sh
│
├── monitoring/                 # 监控脚本
│
├── release-notification/       # 发布通知
│
├── ui-iteration/               # UI 巡查脚本
│
├── utils/                      # 通用工具脚本
│
├── quality-metrics.js          # 质量指标统计
└── _archive/                   # 归档脚本
```

---

## 快速导航

| 需求             | 位置                                                    |
| ---------------- | ------------------------------------------------------- |
| 添加新页面       | `frontend/app/`                                         |
| 添加 UI 组件     | `frontend/components/ui/`                               |
| 添加业务组件     | `frontend/components/{module}/`                         |
| 添加 Hook        | `frontend/hooks/{core\|domain\|features\|utils}/`       |
| 添加 AI 应用功能 | `backend/src/modules/ai-app/{module}/`                  |
| 添加 AI 引擎能力 | `backend/src/modules/ai-engine/`                        |
| 添加内核功能     | `backend/src/modules/ai-kernel/`                        |
| 添加开放接口     | `backend/src/modules/open-api/`                         |
| 添加基础设施服务 | `backend/src/modules/ai-infra/`                         |
| 添加数据模型     | `backend/prisma/schema/models.prisma`                   |
| 添加手写迁移     | `backend/prisma/migrations/YYYYMMDD_描述/migration.sql` |
| 添加文档         | `docs/`                                                 |
| 添加运维脚本     | `scripts/{category}/`                                   |
| 部署配置         | `infra/railway/`                                        |

---

## 架构分层说明

Genesis.ai 采用 **6 层架构**，层间单向依赖（高层依赖低层，反向禁止）：

```
L6  Intent Gateway（意图网关层）
    └── modules/intent-gateway/
        意图识别、功能路由、请求预处理

L5  Open API（开放接口层）
    └── modules/open-api/
        MCP Server、Public REST API、Webhooks、Admin API

L4  AI Apps（业务应用层）
    └── modules/ai-app/
        Research、Teams、Writing、Office、Social、Image
        Ask、Simulation、Planning、Topic Insights、Library、Explore

L3  AI Kernel（内核层）
    └── modules/ai-kernel/
        进程管理、IPC、资源调度

L2  AI Engine（核心能力层）
    └── modules/ai-engine/
        LLM 集成、Agents 框架、Teams 框架、Tools 系统
        RAG、MCP Client、Guardrails、Observability

L1  Infrastructure（基础设施层）
    └── modules/ai-infra/
        Auth、Credits、Secrets、Storage、Email
        Notifications、Monitoring、Settings
```

**关键约束**：

- `ai-app` 模块只通过 `ai-engine/facade` 访问 Engine 内部能力，禁止穿透内部路径
- `ai-engine` 不依赖 `ai-app`（单向）
- `ai-kernel` 提供运行时基础，供 `ai-engine` 和 `ai-app` 使用
- `open-api` 是对外暴露层，依赖 `ai-app` 和 `ai-infra`
- `common/` 目录中的模块可被所有层使用

---

## 数据库架构

**统一 PostgreSQL 架构** - 成本优化 70-75%

| 数据库            | 用途       | 说明                                                    |
| ----------------- | ---------- | ------------------------------------------------------- |
| **PostgreSQL 16** | 唯一数据库 | 结构化数据 + JSONB 原始数据 + 知识图谱 (Recursive CTEs) |
| **Redis 7**       | 缓存/会话  | 会话管理、API 缓存（cache-manager-ioredis-yet）         |

> 已移除 MongoDB、Neo4j、Qdrant。知识图谱使用 PostgreSQL 递归 CTE，向量存储使用 JSONB。
> 数据库迁移使用**手写 SQL 脚本**，禁止使用 `npx prisma migrate dev`。

---

## 命名规范

- **目录**: 小写，连字符分隔 (`ai-office`, `data-management`)
- **React 组件**: PascalCase (`UserProfile.tsx`)
- **Hooks**: camelCase，use 前缀 (`useResources.ts`)
- **服务**: kebab-case + .service 后缀 (`ai-core.service.ts`)
- **控制器**: kebab-case + .controller 后缀 (`resources.controller.ts`)
- **DTO**: PascalCase + Dto 后缀 (`CreateResourceDto.ts`)
- **文档文件**: kebab-case（全小写 + 连字符），如 `data-collection-api.md`

---

**最后更新**: 2026-03-08
**维护者**: Claude Code
**版本**: 5.0
