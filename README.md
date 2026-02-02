# DeepDive Engine

> 企业级 AI 深度研究和内容管理平台 — 从信息到洞察，重构知识探索之旅

[![Version](https://img.shields.io/badge/version-3.3.14-blue.svg)](CHANGELOG.md)
[![Changelog](https://img.shields.io/badge/changelog-What's_New-orange.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-完整文档-green.svg)](docs/readme.md)

## 项目简介

DeepDive Engine 是一个企业级 AI 深度研究和内容管理平台，集成了多 Agent 协作研究、智能办公、知识管理等功能。

### 技术栈

| 层       | 技术                                                 |
| -------- | ---------------------------------------------------- |
| Frontend | Next.js 14 + TypeScript + Zustand + TailwindCSS      |
| Backend  | NestJS 10 + Prisma ORM + PostgreSQL                  |
| AI       | LiteLLM + OpenAI / Claude / Gemini / Grok / DeepSeek |
| Infra    | Docker + Railway + PM2                               |

### 架构分层

```
AI Engine（核心能力层）→ 领域无关的通用 LLM 调用、模型管理、积分计费
     ↓
AI Apps（应用层）→ Research / Teams / Office / Coding / Writing / Social / Ask / Image / Simulation
```

---

## 核心功能

### AI Research — 深度研究平台

多 Agent 协作的自动化深度研究系统，是平台的核心模块。

- **Leader-Worker 架构**: Leader 规划研究维度和全局大纲，Worker 并发执行搜索和写作
- **多源数据采集**: 网页、学术论文、新闻、YouTube、GitHub 等 20+ 数据源
- **研究报告生成**: 自动生成带引用、图表、可信度评分的结构化研究报告
- **Mission 系统**: 任务检查点、断点恢复、实时进度推送
- **协作审阅**: 报告评审、批注、待办事项

### AI Teams — 多 AI 协作

- 创建研究主题，添加不同专长的 AI 成员协作讨论
- 支持 GPT-4、Claude、Gemini、Grok 等多模型混合
- 自动生成讨论摘要和关键结论

### AI Office — 智能办公

- 富文本编辑器（TipTap）+ AI 辅助写作
- PPT 自动生成（pptxgenjs）
- 多格式导出：Markdown / HTML / DOCX / PDF

### AI Coding — 代码生成

- PM → 架构师 → PM Lead → 工程师 → QA 多 Agent 流水线
- Kanban 看板 + WebSocket 实时进度
- 任务检查点持久化，支持断点恢复

### AI Writing — 长文本创作

- 章节管理、多 AI 协作、版本控制
- 支持小说、论文、报告等多种体裁

### AI Social — 社交内容

- 微信公众号、小红书等多平台内容生成
- 自动适配不同平台格式

### AI Ask — 智能问答

- 多模型切换的多轮对话
- 会话管理和历史记录

### AI Image — 图像生成

- 集成 Flux Pro 等 AI 绘图模型
- 支持直接 Prompt、URL 参考图、多文件分析等输入模式

### AI Simulation — 模拟辩论

- 多角色 AI 模拟辩论和观点碰撞

### 其他功能

- **Library**: 资源库，智能标签，Markdown 笔记
- **Knowledge Graph**: 知识图谱可视化（D3.js）
- **Credits**: 积分计费系统
- **Admin**: 模型管理、数据源管理、用户管理

---

## 快速开始

### 前置要求

- Node.js 20+
- PostgreSQL 16
- Docker（可选，用于本地数据库）

### 安装

```bash
git clone https://github.com/JUNJIE-DUAN/ai-teams-engine.git
cd ai-teams-engine
npm install
```

### 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，配置：
# - DATABASE_URL: PostgreSQL 连接字符串
# - OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY 等
```

### 启动数据库

```bash
docker-compose up -d   # 启动 PostgreSQL + Redis + FlareSolverr
```

### 数据库迁移

```bash
cd backend
npx prisma migrate dev
npx prisma db seed      # 可选：填充初始数据
```

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
│   │   ├── ai-research/          # 深度研究
│   │   ├── ai-teams/             # 多 AI 协作
│   │   ├── ai-office/            # 智能办公
│   │   ├── ai-coding/            # 代码生成
│   │   ├── ai-writing/           # AI 写作
│   │   ├── ai-social/            # 社交内容
│   │   ├── ai-ask/               # 智能问答
│   │   ├── ai-image/             # 图像生成
│   │   ├── ai-simulation/        # 模拟辩论
│   │   ├── library/              # 资源库
│   │   ├── admin/                # 管理后台
│   │   └── ...
│   ├── components/               # React 组件
│   ├── hooks/                    # React Hooks
│   └── stores/                   # Zustand 状态管理
│
├── backend/                      # NestJS 后端
│   ├── src/modules/
│   │   ├── ai-engine/            # AI 引擎层（LLM 调用、模型管理）
│   │   ├── ai-app/               # AI 应用层
│   │   │   ├── research/         # 研究模块（topic-research 核心）
│   │   │   ├── teams/            # 团队协作
│   │   │   ├── office/           # 办公套件
│   │   │   ├── coding/           # 代码生成
│   │   │   ├── writing/          # 写作助手
│   │   │   ├── social/           # 社交内容
│   │   │   ├── ask/              # 问答
│   │   │   └── image/            # 图像
│   │   ├── content/              # 内容管理
│   │   ├── ingestion/            # 数据采集
│   │   ├── integrations/         # 第三方集成
│   │   └── credits/              # 积分系统
│   └── prisma/                   # Prisma Schema + Migrations
│
├── ai-service/                   # Python AI 服务（FastAPI，辅助）
├── docs/                         # 项目文档
├── scripts/                      # 运维脚本
└── docker-compose.yml            # Docker 配置
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

### 发布流程

```bash
npm run release:patch   # 补丁版本
npm run release:minor   # 次版本
npm run release:major   # 主版本
npm run release:push    # 推送 tag 到远程
```

---

## 文档

- [完整文档导航](docs/readme.md)
- [变更日志](CHANGELOG.md)
- [项目结构](STRUCTURE.md)
- [开发规范](.claude/standards/00-overview.md)

---

## 许可证

[MIT License](LICENSE)

---

**当前版本**: v3.3.14 | **最后更新**: 2026-02-02
