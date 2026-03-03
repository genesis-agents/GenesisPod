# Genesis.ai 项目结构

> 最后更新: 2026-03-03 | 维护者: Claude Code | 版本: 4.0

## 项目概览

Genesis.ai 是一个企业级 AI 深度研究和内容管理平台，采用 monorepo 结构，包含前端、后端、AI 服务和文档。

```
genesis-ai/
├── frontend/           # Next.js 14 前端应用
├── backend/            # NestJS 后端服务
├── ai-service/         # Python FastAPI 微服务（遗留）
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

采用 **6 层架构**，各层职责清晰，单向依赖。

```
backend/
├── prisma/                     # Prisma ORM 配置
│   ├── schema/                 # 分拆的 schema 文件
│   │   └── models.prisma       # 数据库模型定义
│   └── migrations/             # 手写 SQL 迁移文件
│
├── src/
│   ├── main.ts                 # 应用入口
│   ├── app.module.ts           # 根模块
│   │
│   ├── assets/                 # 静态资源
│   │   └── fonts/              # 字体文件 (用于 PDF 生成)
│   │
│   ├── common/                 # 公共基础设施（跨层共享）
│   │   ├── ai-orchestration/   # AI 提供者编排
│   │   │   ├── config/         # AI 配置
│   │   │   └── providers/      # AI 提供者适配器 (OpenAI, xAI 等)
│   │   │
│   │   ├── audit/              # 审计日志服务
│   │   ├── browser/            # 无头浏览器服务 (Puppeteer)
│   │   ├── cache/              # 缓存服务 (Redis)
│   │   ├── capabilities/       # 能力注册系统
│   │   │   ├── base/           # 基础能力类
│   │   │   ├── decorators/     # 能力装饰器
│   │   │   └── interfaces/     # 能力接口定义
│   │   │
│   │   ├── config/             # 应用配置 (品牌、安全、限流)
│   │   ├── content-processing/ # 内容处理服务 (URL解析、内容提取)
│   │   ├── context/            # 请求上下文 (RequestContext)
│   │   ├── decorators/         # 通用装饰器
│   │   ├── deduplication/      # 去重服务
│   │   ├── events/             # 事件总线服务
│   │   ├── export/             # 导出编排服务
│   │   │   ├── controllers/    # 导出控制器
│   │   │   ├── services/       # 导出服务 (内容转换、渲染)
│   │   │   ├── templates/      # 导出模板
│   │   │   └── types/          # 导出类型定义
│   │   │
│   │   ├── filters/            # 异常过滤器
│   │   ├── graph/              # 图数据库工具 (PostgreSQL Recursive CTEs)
│   │   ├── guards/             # 认证守卫 (JWT, Admin, Optional)
│   │   ├── interceptors/       # 拦截器 (响应转换)
│   │   ├── observability/      # 可观测性 (指标、追踪)
│   │   ├── prisma/             # Prisma 服务 + 启动迁移
│   │   ├── rawdata/            # 原始数据服务 (PostgreSQL JSONB)
│   │   ├── services/           # 通用服务 (AdminAuthService)
│   │   ├── settings/           # 系统设置服务 (SystemSettingService)
│   │   ├── streaming/          # SSE 流式响应
│   │   ├── types/              # 全局类型定义
│   │   └── utils/              # 工具函数 (crypto, lru-map, sanitize 等)
│   │
│   ├── config/                 # 应用级配置
│   │
│   └── modules/                # 6 层业务模块
│       │
│       ├── agent-os/           # L6 Agent OS（智能编排层）
│       │   ├── agent-os.module.ts
│       │   └── intent/         # 意图网关 (IntentGatewayService)
│       │
│       ├── open-api/           # L5 Open API（开放接口层）
│       │   ├── admin/          # 管理员 API
│       │   │   ├── admin.module.ts
│       │   │   └── quota/      # 配额管理
│       │   ├── mcp-server/     # MCP Server（Genesis 作为 MCP 服务端）
│       │   │   └── mcp-server.module.ts
│       │   ├── public-api/     # Public REST API（外部消费者）
│       │   │   └── public-api.module.ts
│       │   └── webhooks/       # Webhook 事件分发
│       │       └── webhooks.module.ts
│       │
│       ├── ai-app/             # L4 AI Apps（业务应用层）
│       │   ├── admin/          # 管理功能应用
│       │   │   ├── ingestion/  # 数据采集管理
│       │   │   │   ├── crawlers/   # 爬虫管理
│       │   │   │   ├── config/     # 采集配置
│       │   │   │   ├── scheduler/  # 调度器
│       │   │   │   └── sources/    # 数据源管理
│       │   │   └── workspace/  # 工作空间管理
│       │   │
│       │   ├── ask/            # AI 问答
│       │   │   └── ai-ask.module.ts
│       │   │
│       │   ├── explore/        # 内容浏览
│       │   │   ├── explore.module.ts
│       │   │   ├── comments/   # 评论系统
│       │   │   ├── feed/       # 信息流
│       │   │   ├── reports/    # 报告系统
│       │   │   └── resources/  # 资源管理
│       │   │
│       │   ├── feedback/       # 用户反馈
│       │   │   └── feedback.module.ts
│       │   │
│       │   ├── image/          # AI 图像生成
│       │   │   ├── ai-image.module.ts
│       │   │   ├── analytics/  # 图像分析
│       │   │   ├── brand-kit/  # 品牌套件
│       │   │   ├── core/       # 核心服务
│       │   │   ├── export/     # 图像导出
│       │   │   ├── generation/ # 图像生成
│       │   │   ├── infographic/# 信息图
│       │   │   └── storage/    # 图像存储
│       │   │
│       │   ├── library/        # 资源库
│       │   │   ├── ai-file-organizer/  # AI 文件组织
│       │   │   ├── collections/        # 收藏夹
│       │   │   ├── integrations/       # 第三方集成
│       │   │   │   ├── feishu/         # 飞书集成
│       │   │   │   ├── google-drive/   # Google Drive
│       │   │   │   └── notion/         # Notion
│       │   │   ├── knowledge-graph/    # 知识图谱
│       │   │   ├── notes/              # 笔记系统
│       │   │   ├── proxy/              # 代理服务
│       │   │   └── rag/                # RAG 应用
│       │   │
│       │   ├── office/         # AI 办公套件
│       │   │   ├── ai-office.module.ts
│       │   │   ├── agents/             # Office Agent
│       │   │   ├── code-execution/     # 代码执行
│       │   │   ├── common/             # 通用模块
│       │   │   ├── content-analysis/   # 内容分析
│       │   │   ├── content-synthesis/  # 内容合成
│       │   │   ├── core/               # 核心服务
│       │   │   ├── designer/           # 设计服务
│       │   │   ├── docs/               # 文档服务
│       │   │   ├── documents/          # 文档管理
│       │   │   ├── export/             # 导出服务
│       │   │   ├── generation/         # 生成服务
│       │   │   ├── ppt/                # PPT 服务
│       │   │   ├── prompts/            # 提示词模板
│       │   │   └── slides/             # 幻灯片服务
│       │   │       ├── checkpoint/     # 检查点
│       │   │       ├── rendering/      # 渲染引擎
│       │   │       ├── skills/         # 幻灯片技能
│       │   │       └── templates/      # 幻灯片模板
│       │   │           ├── base/       # 基础模板
│       │   │           └── categories/ # 分类模板
│       │   │
│       │   ├── planning/       # AI 规划
│       │   │   └── ai-planning.module.ts
│       │   │
│       │   ├── research/       # AI 研究
│       │   │   ├── research.module.ts
│       │   │   ├── discussion/ # 研究讨论
│       │   │   └── project/    # 研究项目
│       │   │
│       │   ├── simulation/     # AI 辩论模拟
│       │   │   └── ai-simulation.module.ts
│       │   │
│       │   ├── social/         # AI 社交内容生成
│       │   │   └── ai-social.module.ts
│       │   │
│       │   ├── teams/          # AI 团队协作
│       │   │   ├── ai-teams.module.ts
│       │   │   ├── agents/     # 团队 Agent
│       │   │   ├── dto/        # DTO
│       │   │   └── services/   # 服务层
│       │   │       ├── collaboration/ # 协作服务
│       │   │       ├── events/        # 事件服务
│       │   │       ├── integration/   # 集成服务
│       │   │       └── topic/         # 话题服务
│       │   │
│       │   ├── topic-insights/ # 话题洞察（Research 衍生应用）
│       │   │   └── topic-insights.module.ts
│       │   │
│       │   └── writing/        # AI 写作
│       │       ├── ai-writing.module.ts
│       │       ├── assets/     # 写作资产（历史知识库等）
│       │       └── content-engine/ # 长文本引擎
│       │
│       ├── ai-kernel/          # L3 AI Kernel（内核层）
│       │   ├── ai-kernel.module.ts
│       │   ├── api/            # Kernel API 服务
│       │   ├── context/        # Kernel 上下文
│       │   ├── facade/         # Kernel Facade（对外统一入口）
│       │   ├── ipc/            # 进程间通信
│       │   │   ├── a2a/        # A2A 协议（Agent-to-Agent）
│       │   │   │   ├── a2a.controller.ts
│       │   │   │   ├── a2a-client.service.ts
│       │   │   │   ├── a2a-team-member-adapter.ts
│       │   │   │   └── agent-card-registry.ts
│       │   │   ├── events/     # 事件类型定义
│       │   │   ├── event-bus.service.ts
│       │   │   ├── message-bus.service.ts
│       │   │   └── progress-tracker.service.ts
│       │   │
│       │   ├── journal/        # 事件日志 & 检查点
│       │   │   ├── checkpoint-manager.ts
│       │   │   └── event-journal.service.ts
│       │   │
│       │   ├── memory/         # 内核内存管理
│       │   │   ├── kernel-memory-manager.service.ts
│       │   │   └── stores/     # 内存存储 (in-memory, persistent, working)
│       │   │
│       │   ├── mission/        # 任务执行器
│       │   │   └── mission-executor.service.ts
│       │   │
│       │   ├── observability/  # 内核可观测性
│       │   │   ├── cost-attribution.service.ts
│       │   │   ├── kernel-metrics.service.ts
│       │   │   └── process-event-log.service.ts
│       │   │
│       │   ├── process/        # 进程管理
│       │   │   └── process-manager.service.ts
│       │   │
│       │   ├── resource/       # 资源调度与约束
│       │   │   ├── circuit-breaker.service.ts
│       │   │   ├── constraint-engine.ts
│       │   │   ├── constraint-enforcement.service.ts
│       │   │   ├── cost-controller.ts
│       │   │   └── rate-limiter.ts
│       │   │
│       │   ├── scheduler/      # 任务调度器
│       │   │   └── kernel-scheduler.service.ts
│       │   │
│       │   ├── security/       # 安全能力守卫
│       │   │   └── capability-guard.service.ts
│       │   │
│       │   └── supervisor/     # 进程监督器
│       │       └── process-supervisor.service.ts
│       │
│       ├── ai-engine/          # L2 AI Engine（核心能力层）
│       │   ├── ai-engine.module.ts         # 主模块（聚合子模块）
│       │   ├── ai-engine-core.module.ts    # 核心子模块
│       │   ├── ai-engine-llm.module.ts     # LLM 子模块
│       │   ├── ai-engine-tools.module.ts   # 工具子模块
│       │   ├── ai-engine-orchestration.module.ts # 编排子模块
│       │   ├── ai-engine-memory.module.ts  # 内存子模块
│       │   ├── ai-engine-knowledge.module.ts # 知识子模块
│       │   ├── ai-engine-constraint.module.ts # 约束子模块
│       │   ├── ai-engine-skills.module.ts  # 技能子模块
│       │   │
│       │   ├── agents/         # Agent 框架
│       │   │   ├── abstractions/   # Agent 接口定义
│       │   │   ├── api/            # Agent API (controller, service, dto)
│       │   │   ├── base/           # 基础 Agent (BaseAgent, PlanAgent, ReactiveAgent)
│       │   │   ├── collaboration/  # 协作模式 (handoff, voting, review, todo)
│       │   │   ├── config/         # Agent 配置服务
│       │   │   └── registry/       # Agent 注册表 & 编排器
│       │   │
│       │   ├── content/        # 内容处理引擎
│       │   │   ├── fetch/      # 内容抓取
│       │   │   └── image/      # 图像引擎
│       │   │
│       │   ├── guardrails/     # 护栏管道（输入/输出校验）
│       │   ├── infra/          # AI 引擎基础设施
│       │   │   ├── a2a/        # A2A 协议支持
│       │   │   └── realtime/   # 实时通信 (WebSocket/SSE)
│       │   │
│       │   ├── knowledge/      # 知识库
│       │   │   └── evidence/   # 证据管理
│       │   │
│       │   ├── llm/            # LLM 集成层
│       │   │   ├── abstractions/   # LLM 接口抽象
│       │   │   ├── adapters/       # LLM 适配器
│       │   │   ├── factory/        # LLM 工厂
│       │   │   └── prompts/        # 提示词管理
│       │   │
│       │   ├── mcp/            # MCP 客户端（连接外部 MCP 服务器）
│       │   │   ├── client/     # MCP 客户端 (stdio/http/sse)
│       │   │   └── manager/    # MCP 连接管理器
│       │   │
│       │   ├── memory/         # 向量记忆
│       │   ├── observability/  # 可观测性（追踪、指标）
│       │   ├── orchestration/  # 任务编排
│       │   │   ├── abstractions/  # 编排器接口
│       │   │   └── executors/     # 执行器 (顺序执行等)
│       │   │
│       │   ├── rag/            # RAG 核心能力 (Embedding, Vector, Chunker)
│       │   ├── safety/         # 安全质量检查
│       │   │   └── quality/    # 质量模块
│       │   │
│       │   ├── skills/         # 技能系统
│       │   ├── teams/          # Teams 框架（注册表、工作流、约束）
│       │   │   ├── base/       # 基础类 (Team, Member, Role, Workflow)
│       │   │   ├── constraints/# 约束引擎接口
│       │   │   ├── controllers/# Teams 控制器
│       │   │   ├── factory/    # Team 工厂
│       │   │   ├── orchestrator/ # 编排器
│       │   │   └── registry/   # Team 注册表
│       │   │
│       │   └── tools/          # 工具系统
│       │       ├── categories/ # 工具分类
│       │       │   ├── collaboration/ # 协作工具
│       │       │   ├── execution/     # 执行工具 (OCR, Python沙箱)
│       │       │   ├── export/        # 导出工具
│       │       │   ├── generation/    # 生成工具
│       │       │   ├── information/   # 信息工具 (ArXiv, HackerNews 等)
│       │       │   ├── integration/   # 集成工具 (GitHub, Calendar)
│       │       │   ├── memory/        # 内存工具
│       │       │   └── processing/    # 处理工具
│       │       ├── middleware/ # 工具中间件 (timeout, pipeline)
│       │       └── registry/   # 工具注册表
│       │
│       └── ai-infra/           # L1 Infrastructure（基础设施层）
│           ├── auth/           # 认证授权
│           │   ├── auth.module.ts
│           │   ├── dto/        # DTO
│           │   └── strategies/ # Passport 策略
│           │
│           ├── credits/        # 积分系统（计费、用量追踪）
│           │   └── credits.module.ts
│           │
│           ├── email/          # 邮件服务
│           │   └── email.module.ts
│           │
│           ├── monitoring/     # 监控服务
│           │   └── monitoring.module.ts
│           │
│           ├── notifications/  # 通知中心
│           │   └── notification.module.ts
│           │
│           ├── release/        # 发布管理
│           │   └── release.module.ts
│           │
│           ├── secrets/        # 密钥管理（API Key 版本控制、轮转）
│           │   └── secrets.module.ts
│           │
│           ├── settings/       # 系统设置
│           │   └── settings.module.ts
│           │
│           ├── storage/        # 文件存储
│           │   └── storage.module.ts
│           │
│           ├── table-management/ # 表格管理
│           │   └── table-management.module.ts
│           │
│           └── user-api-keys/  # 用户 API Key 管理
│               └── user-api-keys.module.ts
│
├── public/                     # 公共资源
│   └── thumbnails/             # 缩略图存储
│
├── scripts/                    # 后端脚本工具
│   └── _archive/               # 归档脚本
│
└── test/                       # 测试
    └── __mocks__/              # Mock 文件
```

---

## AI 服务目录 (ai-service/)

Python FastAPI 微服务，提供遗留 AI 推理和编排能力（部分功能已迁移至 NestJS backend）。

```
ai-service/
├── main.py                     # 应用入口
│
├── configs/                    # 配置
│   └── templates/              # 模板配置 (comparison, insights, relationship, summary)
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
│   │   ├── ai-social/          # AI Social 架构
│   │   └── ai-writing/         # AI Writing 架构
│   ├── ai-engine/              # AI 引擎架构
│   └── system/                 # 系统架构
│       ├── integrations/       # 集成架构
│       └── unified-secrets-management-design.md
│
├── decisions/                  # 架构决策记录 (ADR)
│
├── features/                   # 功能特性文档
│   ├── ai-apps/                # AI 应用功能
│   └── ai-teams/               # AI Teams 功能
│
├── guides/                     # 开发指南
│   ├── ai-calling-standards.md # AI 调用规范
│   ├── authentication/         # 认证指南
│   ├── deployment/             # 部署指南
│   ├── development/            # 开发指南
│   └── testing/                # 测试指南
│
├── prd/                        # 产品需求文档
│   ├── ai-apps/                # AI 应用 PRD
│   ├── ai-teams/               # AI Teams PRD
│   └── infra/                  # 基础设施 PRD
│
└── _archive/                   # 历史归档
```

---

## Claude Code 配置 (.claude/)

Claude Code AI 助手配置、技能和编码标准。

```
.claude/
├── CLAUDE.md                   # 全局配置
├── settings.local.json         # 本地设置
│
├── agents/                     # Agent 配置
│   ├── architect.md            # 架构师
│   ├── coder.md                # 编码者
│   ├── docs-specialist.md      # 文档专家
│   ├── explorer.md             # 探索者
│   ├── merge-to-main.md        # 合并管理
│   ├── pm.md                   # 产品经理
│   ├── reviewer.md             # 审查者
│   ├── scripts-guardian.md     # 脚本守护者
│   └── security-auditor.md     # 安全审计
│
├── config/                     # 配置文件
│   ├── merge-to-main.yml       # 合并配置
│   └── README.md
│
├── rules/                      # 规则文件
│   ├── ai-engine.md            # AI 引擎规则
│   ├── security.md             # 安全规则
│   ├── testing.md              # 测试规则
│   └── typescript.md           # TypeScript 规则
│
├── skills/                     # 技能定义
│   ├── ai/                     # AI 技能
│   ├── architecture/           # 架构技能
│   ├── data/                   # 数据技能
│   ├── development/            # 开发技能
│   ├── frontend/               # 前端技能
│   ├── operations/             # 运维技能
│   ├── quality/                # 质量技能
│   └── README.md
│
└── standards/                  # 编码标准
    ├── 00-overview.md          # 规范总览
    ├── 03-naming-conventions.md
    ├── 04-code-style.md
    ├── 05-api-design.md
    ├── 08-git-workflow.md
    ├── 11-logging-standards.md
    ├── 12-scripts-management.md
    └── 13-module-dependencies.md
```

---

## 脚本目录 (scripts/)

运维和开发脚本，按职责分类组织。

```
scripts/
├── devops/                     # DevOps 脚本
│   └── sync-github-releases.ts # 同步 GitHub Releases
│
├── docs-specialist/            # 文档规范脚本
│   ├── check-file-naming.js    # 文件命名检查
│   ├── docs-validation.sh      # 文档验证
│   └── rename-docs-lowercase.sh# 文档重命名
│
├── local-server/               # 本地服务器脚本
│   ├── start-all.bat           # 启动所有服务 (Windows)
│   └── stop-all.bat            # 停止所有服务 (Windows)
│
├── merge-to-main/              # 合并流程脚本
│   ├── monitor-ci.sh           # CI 监控
│   ├── pre-merge-validation.sh # 合并前校验
│   └── rollback-merge.sh       # 合并回滚
│
├── monitoring/                 # 监控脚本
│   ├── health-check.sh         # 健康检查
│   └── setup-prometheus.sh     # Prometheus 配置
│
├── ui-iteration/               # UI 巡查脚本
│   ├── index.ts                # 主入口
│   ├── evaluator.ts            # 评估器
│   └── journey-cli.ts          # Journey CLI
│
├── utils/                      # 通用工具脚本
│   ├── verify-changed.js       # 变更验证
│   └── test-data-management-api.sh
│
├── quality-metrics.js          # 质量指标统计
└── _archive/                   # 归档脚本
    ├── fixes/                  # 历史修复脚本
    └── migrations/             # 历史迁移脚本
```

---

## 配置文件 (根目录)

```
genesis-ai/
├── package.json                # 项目配置和脚本 (npm workspaces)
├── package-lock.json           # npm 锁文件
├── docker-compose.yml          # Docker 配置
├── .env.example                # 环境变量示例
├── .gitignore                  # Git 忽略规则
├── .prettierrc                 # Prettier 配置
├── readme.md                   # 项目说明
└── STRUCTURE.md                # 本文件
```

> **注意**: 项目使用 `npm workspaces`（`package.json` + `package-lock.json`），不使用 pnpm 或 Turborepo。

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

## 架构分层说明

Genesis.ai 采用 **6 层架构**，层间单向依赖（高层依赖低层，反向禁止）：

```
L6  Agent OS（智能编排层）
    └── modules/agent-os/
        意图路由、用户入口、追踪

L5  Open API（开放接口层）
    └── modules/open-api/
        MCP Server、Public REST API、Webhooks、Admin API

L4  AI Apps（业务应用层）
    └── modules/ai-app/
        Research、Teams、Writing、Office、Social、Image
        Ask、Coding、Simulation、Topic Insights、Library

L3  AI Kernel（内核层）
    └── modules/ai-kernel/
        进程管理、IPC（A2A/消息总线）、记忆、资源调度
        任务执行、检查点、安全能力守卫

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

> **注意**: 已移除 MongoDB、Neo4j、Qdrant。知识图谱使用 PostgreSQL 递归 CTE，向量存储使用 JSONB。
> 数据库迁移使用**手写 SQL 脚本**，禁止使用 `npx prisma migrate dev`。

---

**最后更新**: 2026-03-03
**维护者**: Claude Code
**版本**: 4.0
