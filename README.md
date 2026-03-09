# Genesis.ai

> 企业级 AI 深度研究和内容管理平台 — 从信息到洞察，重构知识探索之旅

[![Version](https://img.shields.io/badge/version-29.0.1-blue.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-完整文档-green.svg)](docs/readme.md)

## 项目简介

Genesis.ai 是一个企业级 AI 深度研究和内容管理平台，集成了多 Agent 协作研究、智能办公、知识管理等功能。

### 技术栈

| 层       | 技术                                                 |
| -------- | ---------------------------------------------------- |
| Frontend | Next.js 14 + TypeScript + Zustand + TailwindCSS      |
| Backend  | NestJS 10 + Prisma ORM + PostgreSQL 16               |
| AI       | LiteLLM + OpenAI / Claude / Gemini / Grok / DeepSeek |
| Infra    | Docker + Railway + PM2 + Redis 7                     |

### 数据库架构

- **PostgreSQL 16**: 统一数据库（结构化数据 + JSONB + 知识图谱 Recursive CTEs）
- **Redis 7**: 缓存和会话管理
- **FlareSolverr**: Cloudflare 反爬虫绕过

> 已移除 MongoDB、Neo4j、Qdrant，统一使用 PostgreSQL 降低运维成本 70-75%

### 架构分层（6 层）

```
L6 Intent Gateway（意图网关层）→ 意图识别、路由分发
L5 Open API（开放接口层）→ MCP Server、Public API、Webhooks、Admin API
L4 AI Apps（业务应用层）→ Research、Teams、Writing、Office、Social 等
L3 AI Kernel（内核层）→ 进程管理、IPC、资源调度
L2 AI Engine（核心能力层）→ LLM、Agents、Tools、RAG、MCP Client
L1 Infrastructure（基础设施层）→ Auth、Credits、Storage、Secrets
```

---

## 核心功能

### AI Research — 深度研究平台

多 Agent 协作的自动化深度研究系统，是平台的核心模块。

- **Leader-Worker 架构**: Leader 规划研究维度和全局大纲，Worker 并发执行搜索和写作
- **多源数据采集**: 网页、学术论文、新闻、YouTube、GitHub 等 20+ 数据源
- **研究报告生成**: 自动生成带引用、图表、可信度评分的结构化研究报告
- **Mission 系统**: 任务检查点、断点恢复、实时进度推送

### AI Topic Insights — 话题洞察

- 基于 Research 的衍生应用，聚焦话题深度分析
- 支持多轮对话式研究、RAG 增强检索
- 章节化报告生成与编辑

### AI Teams — 多 AI 协作

- 创建研究主题，添加不同专长的 AI 成员协作讨论
- 支持 GPT-4、Claude、Gemini、Grok 等多模型混合
- 自动生成讨论摘要和关键结论

### AI Office — 智能办公

- 富文本编辑器（TipTap）+ AI 辅助写作
- PPT 自动生成（pptxgenjs），100+ 模板
- 多格式导出：Markdown / HTML / DOCX / PDF

### AI Writing — 长文本创作

- 章节管理、多 AI 协作、版本控制
- 支持小说、论文、报告等多种体裁

### AI Social — 社交内容

- 微信公众号、小红书等多平台内容生成
- 自动适配不同平台格式

### 其他功能

- **AI Ask**: 多模型切换的多轮对话
- **AI Image**: 集成 Flux Pro 等 AI 绘图模型
- **AI Simulation**: 多角色 AI 模拟辩论
- **AI Planning**: AI 辅助规划
- **Library**: 资源库，智能标签，Markdown 笔记，集成飞书/Notion/Google Drive
- **Knowledge Graph**: 知识图谱可视化（D3.js）
- **Credits**: 积分计费系统
- **Admin**: 模型管理、数据源管理、用户管理、MCP 服务器管理

---

## 快速开始

### 前置要求

- Node.js 20+
- PostgreSQL 16
- Docker（可选，用于本地数据库）

### 安装

```bash
git clone https://github.com/JUNJIE-DUAN/deepdive-engine.git
cd deepdive-engine
npm install
```

### 启动数据库

```bash
docker-compose up -d   # 启动 PostgreSQL + Redis + FlareSolverr
```

### 数据库迁移

```bash
cd backend
npx prisma generate    # 生成 Prisma Client
# 迁移使用手写 SQL 脚本，见 backend/prisma/migrations/
```

> **注意**: 本项目使用手写 SQL 迁移脚本，不使用 `npx prisma migrate dev`

### 配置环境变量

部署环境变量参考：`infra/railway/frontend.env.example` 和 `infra/railway/backend.env.example`

### 启动开发服务

```bash
# 方式一：一键启动（根目录）
npm run dev

# 方式二：分别启动
npm run dev:frontend    # http://localhost:3000
npm run dev:backend     # http://localhost:4000
```

---

## 项目结构

```
deepdive-engine/
├── frontend/                     # Next.js 14 前端
│   ├── app/                      # App Router 页面
│   │   ├── admin/                # 管理后台（27+ 页面）
│   │   ├── ai-ask/               # 智能问答
│   │   ├── ai-image/             # 图像生成
│   │   ├── ai-insights/          # 话题洞察
│   │   ├── ai-office/            # 智能办公
│   │   ├── ai-planning/          # AI 规划
│   │   ├── ai-research/          # 深度研究
│   │   ├── ai-simulation/        # 模拟辩论
│   │   ├── ai-social/            # 社交内容
│   │   ├── ai-teams/             # 多 AI 协作
│   │   ├── ai-writing/           # AI 写作
│   │   ├── library/              # 资源库
│   │   └── ...
│   ├── components/               # React 组件
│   ├── hooks/                    # React Hooks
│   ├── stores/                   # Zustand 状态管理
│   └── lib/                      # 工具库
│
├── backend/                      # NestJS 后端
│   ├── src/modules/
│   │   ├── intent-gateway/       # L6 意图网关
│   │   ├── open-api/             # L5 开放接口
│   │   ├── ai-app/               # L4 AI 应用层
│   │   │   ├── research/         # 研究模块
│   │   │   ├── topic-insights/   # 话题洞察
│   │   │   ├── teams/            # 团队协作
│   │   │   ├── writing/          # 写作助手
│   │   │   ├── office/           # 办公套件
│   │   │   ├── image/            # 图像生成
│   │   │   ├── social/           # 社交内容
│   │   │   ├── ask/              # 问答
│   │   │   ├── simulation/       # 模拟
│   │   │   ├── planning/         # 规划
│   │   │   ├── library/          # 资源库
│   │   │   ├── explore/          # 内容浏览
│   │   │   └── ...
│   │   ├── ai-kernel/            # L3 AI 内核
│   │   ├── ai-engine/            # L2 AI 引擎
│   │   └── ai-infra/             # L1 基础设施
│   └── prisma/                   # Prisma Schema + 手写迁移
│
├── ai-service/                   # Python AI 服务（FastAPI）
├── docs/                         # 项目文档
├── scripts/                      # 运维脚本
├── infra/                        # 部署配置
└── .claude/                      # Claude Code 配置
```

详细结构: [STRUCTURE.md](STRUCTURE.md)

---

## 开发命令

| 命令                   | 说明                                  |
| ---------------------- | ------------------------------------- |
| `npm run dev`          | 全栈开发启动                          |
| `npm run type-check`   | TypeScript 类型检查                   |
| `npm run verify:quick` | 快速验证（类型 + 测试）               |
| `npm run verify:full`  | 完整验证（Lint + 类型 + 测试 + 构建） |
| `npm run test:quick`   | 快速测试                              |
| `npm run lint`         | 代码检查                              |
| `npm run build`        | 前后端构建                            |

### Git 提交规范

```bash
git commit -m "feat(research): add dimension planning"
git commit -m "fix(ai-engine): correct apiFormat validation"
# 类型: feat, fix, refactor, docs, style, test, chore
```

---

## 文档

- [完整文档导航](docs/readme.md)
- [项目结构](STRUCTURE.md)
- [开发规范](.claude/standards/00-overview.md)
- [部署指南](infra/railway/DEPLOY.md)

---

## 许可证

[MIT License](LICENSE)

---

**当前版本**: v29.0.1 | **最后更新**: 2026-03-08
