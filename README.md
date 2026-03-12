# Genesis.ai

> 企业级 AI 深度研究和内容管理平台 -- 从信息到洞察，重构知识探索之旅

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
L3 AI Engine（核心能力层）→ LLM、Agents、Tools、RAG、MCP Client
L2 AI Kernel（内核层）→ 进程管理、IPC、资源调度
L1 Infrastructure（基础设施层）→ Auth、Credits、Storage、Secrets
```

---

## 核心功能

### AI Research -- 深度研究平台

多 Agent 协作的自动化深度研究系统，是平台的核心模块。

- **Leader-Worker 架构**: Leader 规划研究维度和全局大纲，Worker 并发执行搜索和写作
- **多源数据采集**: 网页、学术论文、新闻、YouTube、GitHub 等 20+ 数据源
- **研究报告生成**: 自动生成带引用、图表、可信度评分的结构化研究报告
- **Mission 系统**: 任务检查点、断点恢复、实时进度推送

### AI Topic Insights -- 话题洞察

- 基于 Research 的衍生应用，聚焦话题深度分析
- 支持多轮对话式研究、RAG 增强检索
- 章节化报告生成与编辑

### AI Teams -- 多 AI 协作

- 创建研究主题，添加不同专长的 AI 成员协作讨论
- 支持 GPT-4、Claude、Gemini、Grok 等多模型混合
- 自动生成讨论摘要和关键结论

### AI Office -- 智能办公

- 富文本编辑器（TipTap）+ AI 辅助写作
- PPT 自动生成（pptxgenjs），100+ 模板
- 多格式导出：Markdown / HTML / DOCX / PDF

### AI Writing -- 长文本创作

- 章节管理、多 AI 协作、版本控制
- 支持小说、论文、报告等多种体裁

### AI Social -- 社交内容

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
│   │   ├── ai-engine/            # L3 AI 引擎
│   │   ├── ai-kernel/            # L2 AI 内核
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

## 全新部署指南（从零开始）

> 本指南覆盖两种部署方式：**本地开发部署** 和 **Railway 生产部署**。
> 每一步都写明了具体命令、预期输出和常见问题，AI Agent 也能按步骤执行。

### 目录

1. [前置要求](#1-前置要求)
2. [克隆项目与安装依赖](#2-克隆项目与安装依赖)
3. [本地开发部署](#3-本地开发部署)
4. [Railway 生产部署](#4-railway-生产部署)
5. [环境变量完整参考](#5-环境变量完整参考)
6. [自定义域名配置](#6-自定义域名配置)
7. [部署验证清单](#7-部署验证清单)
8. [故障排除](#8-故障排除)

---

### 1. 前置要求

#### 必需软件

| 软件    | 最低版本 | 用途                  | 安装方式                         |
| ------- | -------- | --------------------- | -------------------------------- |
| Node.js | 20.0.0   | 前端 + 后端运行时     | https://nodejs.org/              |
| npm     | 9.0.0    | 包管理器              | 随 Node.js 安装                  |
| Docker  | 24+      | 运行 PostgreSQL/Redis | https://docs.docker.com/install/ |
| Git     | 2.30+    | 代码版本管理          | https://git-scm.com/             |
| Python  | 3.11+    | AI Service 运行时     | https://python.org/ (可选)       |

#### 必需账号和 API Key

| 账号/Key        | 用途                          | 获取方式                               |
| --------------- | ----------------------------- | -------------------------------------- |
| OpenAI API Key  | GPT 系列模型（核心 AI 功能）  | https://platform.openai.com/api-keys   |
| Claude API Key  | Anthropic Claude 模型（可选） | https://console.anthropic.com/         |
| Google OAuth    | Google 登录（可选）           | https://console.cloud.google.com/      |
| GitHub OAuth    | GitHub 登录（可选）           | https://github.com/settings/developers |
| Railway Account | 生产部署（可选）              | https://railway.app/                   |

> AI API Key 至少需要一个（OpenAI 或 Claude），其余按需配置。

---

### 2. 克隆项目与安装依赖

#### 步骤 2.1: 克隆代码

```bash
git clone https://github.com/JUNJIE-DUAN/deepdive-engine.git
cd deepdive-engine
```

#### 步骤 2.2: 安装全部依赖

```bash
# 项目使用 npm workspaces，根目录 install 会同时安装 frontend/ 和 backend/ 的依赖
npm install
```

**预期输出**: 无报错，安装完成后 `node_modules/`、`frontend/node_modules/`、`backend/node_modules/` 都存在。

**常见问题**:

- `canvas` 编译失败 → 安装系统依赖：`apt-get install libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`
- npm 版本过低 → `npm install -g npm@latest`

#### 步骤 2.3: 安装 AI Service 依赖（可选）

```bash
cd ai-service
pip install -r requirements.txt
cd ..
```

---

### 3. 本地开发部署

#### 步骤 3.1: 启动基础设施（PostgreSQL + Redis + FlareSolverr）

```bash
docker-compose up -d
```

**启动的服务**:

| 服务         | 端口 | 说明                                                          |
| ------------ | ---- | ------------------------------------------------------------- |
| PostgreSQL   | 5432 | 用户 `genesis`，密码 `genesis_dev_password`，数据库 `genesis` |
| Redis        | 6379 | 密码 `genesis_redis_dev_password`，AOF 持久化                 |
| FlareSolverr | 8191 | Cloudflare 反爬虫绕过代理                                     |

**验证服务是否启动成功**:

```bash
# 检查容器状态（所有容器应为 running 或 healthy）
docker-compose ps

# 验证 PostgreSQL 连接
docker exec genesis-postgres pg_isready -U genesis
# 预期输出: /var/run/postgresql:5432 - accepting connections

# 验证 Redis 连接
docker exec genesis-redis redis-cli -a genesis_redis_dev_password ping
# 预期输出: PONG
```

#### 步骤 3.2: 配置本地环境变量

创建 `backend/.env` 文件:

```bash
# ============ 数据库 ============
DATABASE_URL=postgresql://genesis:genesis_dev_password@localhost:5432/genesis

# ============ Redis ============
REDIS_URL=redis://:genesis_redis_dev_password@localhost:6379

# ============ JWT 认证 ============
JWT_SECRET=local-dev-secret-change-in-production
JWT_EXPIRES_IN=7d

# ============ AI API Keys（至少配一个）============
OPENAI_API_KEY=sk-your-openai-api-key
# ANTHROPIC_API_KEY=sk-ant-your-claude-key
# GEMINI_API_KEY=your-gemini-key
# GROK_API_KEY=your-grok-key
# DEEPSEEK_API_KEY=your-deepseek-key

# ============ 应用配置 ============
NODE_ENV=development
PORT=4000
LOG_LEVEL=debug

# ============ FlareSolverr ============
FLARESOLVERR_URL=http://localhost:8191

# ============ CORS ============
CORS_ORIGINS=http://localhost:3000

# ============ 文件上传 ============
MAX_FILE_SIZE=10485760
UPLOAD_DIR=/tmp/uploads
```

创建 `frontend/.env.local` 文件:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

> **注意**: `.env` 文件不要提交到 Git（已在 `.gitignore` 中排除）。

#### 步骤 3.3: 初始化数据库

```bash
cd backend

# 第一步：生成 Prisma Client（生成 TypeScript 类型定义）
npx prisma generate --schema=prisma/schema

# 第二步：执行数据库迁移（应用所有 SQL 迁移脚本）
npx prisma migrate deploy --schema=prisma/schema

# 第三步：（可选）填充种子数据
npx prisma db seed

cd ..
```

**预期输出**:

- `prisma generate`: 输出 "Generated Prisma Client"
- `prisma migrate deploy`: 输出已应用的迁移数量（100+ 个迁移文件）

**重要**: 本项目使用**手写 SQL 迁移脚本**（位于 `backend/prisma/migrations/`），不要使用 `npx prisma migrate dev` 自动生成迁移。

**常见问题**:

- `P1001: Can't reach database server` → 确认 Docker PostgreSQL 容器已启动
- `prisma generate` 报错 → 检查 `backend/prisma/schema/base.prisma` 中 `binaryTargets` 是否包含当前平台

#### 步骤 3.4: 启动开发服务

```bash
# 方式一：一键启动全部服务（前端 + 后端 + AI Service）
npm run dev

# 方式二：分别启动（推荐，便于查看各自日志）
npm run dev:frontend    # 终端 1 → http://localhost:3000
npm run dev:backend     # 终端 2 → http://localhost:4000
npm run dev:ai          # 终端 3 → http://localhost:5000（可选）
```

**各服务端口**:

| 服务          | URL                   | 说明                     |
| ------------- | --------------------- | ------------------------ |
| Frontend      | http://localhost:3000 | Next.js 开发服务器       |
| Backend       | http://localhost:4000 | NestJS API 服务          |
| AI Service    | http://localhost:5000 | Python FastAPI 服务      |
| Prisma Studio | http://localhost:5555 | `npx prisma studio` 启动 |

**验证服务启动成功**:

```bash
# 验证后端健康检查
curl http://localhost:4000/api/v1/health
# 预期输出: {"status":"ok",...}

# 验证前端页面
curl -s http://localhost:3000 | head -20
# 预期输出: HTML 内容
```

#### 步骤 3.5: 访问应用

打开浏览器访问 http://localhost:3000 即可使用。

---

### 4. Railway 生产部署

Railway 是本项目的主要生产部署平台。部署架构为 3 个独立服务 + 2 个数据库插件。

#### 部署架构图

```
                    ┌──────────────────────────────┐
                    │        Railway Project        │
                    └──────────────────────────────┘
                                 │
        ┌────────────────────────┼─────────────────────────┐
        │                        │                         │
   ┌────▼────┐            ┌──────▼──────┐           ┌──────▼──────┐
   │Frontend │            │  Backend    │           │ AI Service  │
   │(Next.js)│            │  (NestJS)   │           │ (FastAPI)   │
   │Port 3000│            │ Port 4000   │           │ Port 8000   │
   └────┬────┘            └──────┬──────┘           └─────────────┘
        │                        │
        │                 ┌──────┼──────┐
        │                 │             │
        │            ┌────▼────┐  ┌─────▼────┐
        └───────────►│PostgreSQL│  │  Redis   │
        (API 调用)   │  16     │  │    7     │
                     └─────────┘  └──────────┘
```

#### 步骤 4.1: 创建 Railway 项目

1. 登录 https://railway.app/
2. 点击 **New Project** → **Deploy from GitHub repo**
3. 选择 `JUNJIE-DUAN/deepdive-engine` 仓库
4. Railway 会自动检测到项目结构

#### 步骤 4.2: 添加数据库插件

在 Railway Dashboard 中:

1. 点击 **+ New** → **Database** → **Add PostgreSQL**
   - Railway 会自动创建 PostgreSQL 16 实例
   - 自动注入 `DATABASE_URL` 环境变量

2. 点击 **+ New** → **Database** → **Add Redis**
   - Railway 会自动创建 Redis 实例
   - 自动注入 `REDIS_URL` 环境变量

#### 步骤 4.3: 创建 Backend 服务

1. 点击 **+ New** → **GitHub Repo** → 选择同一仓库
2. 在服务设置中:
   - **Service Name**: `backend`
   - **Root Directory**: `/backend`（Railway 会自动检测 `backend/railway.toml` 和 `backend/Dockerfile`）

3. **配置环境变量**（在 Railway Dashboard → backend 服务 → Variables）:

```bash
# === 数据库（Railway 自动注入，通常不需手动设置）===
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# === 应用配置 ===
NODE_ENV=production
PORT=3001

# === JWT 认证（必须修改！）===
JWT_SECRET=<生成一个 64 位随机字符串>
JWT_EXPIRES_IN=7d

# === AI API Keys（至少一个）===
OPENAI_API_KEY=sk-xxx
# ANTHROPIC_API_KEY=sk-ant-xxx

# === CORS（设为前端 Railway URL）===
CORS_ORIGINS=https://<your-frontend>.up.railway.app

# === 日志 ===
LOG_LEVEL=info

# === 文件上传 ===
MAX_FILE_SIZE=10485760
UPLOAD_DIR=/tmp/uploads
```

**Backend Railway 配置**（`backend/railway.toml` 已存在）:

```toml
[build]
builder = "dockerfile"        # 使用 backend/Dockerfile 构建
useMetal = false

[deploy]
# 启动命令：诊断 → 迁移 → 启动
startCommand = "sh -c 'set -e; export NODE_ENV=production; export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium; npm run diagnose || true; npm run deploy || exit 1; exec node --max-old-space-size=1536 dist/main'"
healthcheckPath = "/api/v1/health"
healthcheckTimeout = 600      # 10 分钟（迁移可能需要较长时间）
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 5
```

**Backend 启动流程详解**:

```
docker-entrypoint.sh 执行顺序:
│
├─ Step 0: fix-enum-values.js
│  └─ 在 Prisma 事务外添加 PostgreSQL enum 值（ALTER TYPE 不支持事务）
│
├─ Step 0.5: fix-export-tables.js
│  └─ 创建导出相关的表（如果不存在）
│
├─ Step 1: prisma migrate resolve
│  └─ 解决历史遗留的失败迁移记录
│
├─ Step 2: prisma migrate deploy
│  └─ 执行所有待应用的 SQL 迁移脚本（backend/prisma/migrations/）
│
├─ Step 2.5: prisma generate
│  └─ 重新生成 Prisma Client（确保与当前 schema 一致）
│
└─ Step 3: node --max-old-space-size=1536 dist/main
   └─ 启动 NestJS 应用（1536MB 堆内存）
```

此外，`npm run deploy` 命令会执行 `deploy-migrations.ts`，进行更完整的迁移流程:

1. 连接数据库（带重试，最多 10 次，每次间隔 3 秒）
2. 解决失败迁移（标记为已应用）
3. 清理回滚的迁移记录
4. 执行 `prisma migrate deploy`
5. 确保关键表和列存在（fallback 创建）
6. 重新生成 Prisma Client
7. 修复 enum 值（PLAN_READY、CANCELLED 等）
8. 修复 MCP 服务器包名（@anthropics → @modelcontextprotocol）
9. 验证关键表存在性（users、resources 等）

#### 步骤 4.4: 创建 Frontend 服务

1. 点击 **+ New** → **GitHub Repo** → 选择同一仓库
2. 在服务设置中:
   - **Service Name**: `frontend`
   - **Root Directory**: `/frontend`

3. **配置环境变量**:

```bash
# === 应用配置 ===
NODE_ENV=production
PORT=3000

# === API 地址（指向 Backend 服务）===
# 方式一：使用 Railway 变量引用
NEXT_PUBLIC_API_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}
# 方式二：直接填后端 URL
# NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app

# === 浏览器直连后端（可选，绕过 CDN）===
# NEXT_PUBLIC_BACKEND_URL=https://your-backend.up.railway.app

# === 品牌配置（可选）===
# NEXT_PUBLIC_BRAND_NAME=Genesis

# === 关闭遥测 ===
NEXT_TELEMETRY_DISABLED=1
```

**Frontend Dockerfile 构建流程**:

```
多阶段构建:
│
├─ Builder 阶段 (node:20-alpine)
│  ├─ 接收构建时参数: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_AI_URL
│  ├─ npm install
│  └─ npm run build → 生成 .next/standalone 模式
│
└─ Runtime 阶段 (node:20-alpine)
   ├─ 复制 .next/standalone + .next/static + public/
   ├─ 非 root 用户 (nextjs:1001)
   ├─ dumb-init 进程管理
   └─ node server.js（standalone 模式，无需 npm install）
```

> **重要**: `NEXT_PUBLIC_*` 变量是构建时嵌入的，修改后需要重新构建（重新部署）。

#### 步骤 4.5: 创建 AI Service（可选）

1. 点击 **+ New** → **GitHub Repo** → 选择同一仓库
2. 在服务设置中:
   - **Service Name**: `ai-service`
   - **Root Directory**: `/ai-service`

3. **环境变量**:

```bash
PORT=8000
OPENAI_API_KEY=sk-xxx
```

**AI Service Dockerfile**:

- 基于 `python:3.11-slim`
- 非 root 用户 (appuser:1001)
- 入口: `python main.py`

#### 步骤 4.6: 触发部署

```bash
# 方式一：推送到 main 分支（自动触发 Railway 部署）
git push origin main

# 方式二：使用 Railway CLI 手动部署
npm install -g @railway/cli
railway login
railway link
railway up --service backend --detach
railway up --service frontend --detach
```

**部署时间预估**:

- Backend 构建: 5-8 分钟（Docker 多阶段构建 + native 依赖编译）
- Frontend 构建: 3-5 分钟
- 数据库迁移: 1-3 分钟（首次部署 100+ 迁移文件）
- 总计首次部署: 约 10-15 分钟

#### 步骤 4.7: 验证部署

```bash
# 查看后端日志
railway logs --service backend --lines 200

# 检查后端健康状态
curl https://<your-backend>.up.railway.app/api/v1/health

# 检查前端
curl -s https://<your-frontend>.up.railway.app | head -5
```

---

### 5. 环境变量完整参考

> 完整的 `.env.example` 文件位于:
>
> - `infra/railway/backend.env.example` -- 后端
> - `infra/railway/frontend.env.example` -- 前端

#### Backend 环境变量

| 变量名                       | 必需  | 默认值           | 说明                                  |
| ---------------------------- | ----- | ---------------- | ------------------------------------- |
| `DATABASE_URL`               | Yes   | -                | PostgreSQL 连接字符串                 |
| `REDIS_URL`                  | No    | -                | Redis 连接字符串（不配则不使用缓存）  |
| `JWT_SECRET`                 | Yes   | -                | JWT 签名密钥（生产必须使用强随机值）  |
| `JWT_EXPIRES_IN`             | No    | `7d`             | JWT 过期时间                          |
| `NODE_ENV`                   | No    | `development`    | 环境标识：development / production    |
| `PORT`                       | No    | `4000`           | 后端监听端口（Railway 上设为 3001）   |
| `LOG_LEVEL`                  | No    | `info`           | 日志级别：error / warn / info / debug |
| `OPENAI_API_KEY`             | Yes\* | -                | OpenAI API Key                        |
| `ANTHROPIC_API_KEY`          | No    | -                | Claude API Key                        |
| `GEMINI_API_KEY`             | No    | -                | Google Gemini API Key                 |
| `GROK_API_KEY`               | No    | -                | xAI Grok API Key                      |
| `DEEPSEEK_API_KEY`           | No    | -                | DeepSeek API Key                      |
| `CORS_ORIGINS`               | Yes   | -                | 允许的前端域名（逗号分隔）            |
| `FRONTEND_URL`               | No    | Railway 自动推导 | 前端 URL                              |
| `BACKEND_URL`                | No    | Railway 自动推导 | 后端 URL                              |
| `BRAND_NAME`                 | No    | `Genesis`        | 品牌名称                              |
| `BRAND_FULL_NAME`            | No    | `Genesis.ai`     | 品牌全称                              |
| `RAILWAY_DOMAIN`             | No    | `genesis-ai`     | Railway 域名前缀                      |
| `FLARESOLVERR_URL`           | No    | -                | FlareSolverr 服务地址                 |
| `GUARDRAILS_ENABLED`         | No    | `false`          | 是否启用 AI 输入/输出防护             |
| `CACHE_MAX_ITEMS`            | No    | `10000`          | 缓存最大条目数（LRU 淘汰）            |
| `DB_POOL_SIZE`               | No    | `5`              | 数据库连接池大小                      |
| `DB_POOL_TIMEOUT`            | No    | -                | 连接池超时（秒）                      |
| `PRISMA_TRANSACTION_TIMEOUT` | No    | `60000`          | Prisma 事务超时（毫秒）               |
| `MAX_FILE_SIZE`              | No    | `10485760`       | 文件上传大小限制（字节，默认 10MB）   |
| `UPLOAD_DIR`                 | No    | `/tmp/uploads`   | 文件上传临时目录                      |
| `GOOGLE_CLIENT_ID`           | No    | -                | Google OAuth Client ID                |
| `GOOGLE_CLIENT_SECRET`       | No    | -                | Google OAuth Client Secret            |
| `GITHUB_CLIENT_ID`           | No    | -                | GitHub OAuth Client ID                |
| `GITHUB_CLIENT_SECRET`       | No    | -                | GitHub OAuth Client Secret            |

> `*` AI API Key 至少配置一个。

#### Frontend 环境变量

| 变量名                    | 必需 | 默认值        | 说明                                     |
| ------------------------- | ---- | ------------- | ---------------------------------------- |
| `NEXT_PUBLIC_API_URL`     | Yes  | -             | 后端 API 地址（构建时嵌入）              |
| `NEXT_PUBLIC_BACKEND_URL` | No   | -             | 浏览器直连后端地址（绕过 CDN，生产推荐） |
| `NEXT_PUBLIC_AI_URL`      | No   | -             | AI Service 地址                          |
| `NEXT_PUBLIC_BRAND_NAME`  | No   | `Genesis`     | 品牌名称                                 |
| `NODE_ENV`                | No   | `development` | 环境标识                                 |
| `PORT`                    | No   | `3000`        | 前端监听端口                             |
| `NEXT_TELEMETRY_DISABLED` | No   | -             | 设为 `1` 关闭 Next.js 遥测               |

---

### 6. 自定义域名配置

如果需要使用自定义域名替代 Railway 默认的 `*.up.railway.app`:

#### 步骤 6.1: DNS 配置

在 DNS 提供商（如 Cloudflare）添加 CNAME 记录:

```
api.yourdomain.com  → your-backend.up.railway.app   (灰云/DNS Only)
app.yourdomain.com  → your-frontend.up.railway.app  (灰云/DNS Only)
```

> **注意**: 必须关闭 Cloudflare 代理（灰云），让 Railway 处理 SSL。

#### 步骤 6.2: Railway 绑定域名

在 Railway Dashboard → 对应服务 → Settings → Domains:

- Backend: 添加 `api.yourdomain.com`
- Frontend: 添加 `app.yourdomain.com`

#### 步骤 6.3: 更新环境变量

```bash
# Backend
FRONTEND_URL=https://app.yourdomain.com
BACKEND_URL=https://api.yourdomain.com
CORS_ORIGINS=https://app.yourdomain.com

# Frontend
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com
```

#### 步骤 6.4: 更新 OAuth 回调地址

- **Google OAuth Console**: 添加 `https://api.yourdomain.com/api/v1/auth/google/callback`
- **GitHub OAuth App**: 添加 `https://api.yourdomain.com/api/v1/ai-coding/github/callback`

---

### 7. 部署验证清单

部署完成后逐项检查:

#### 基础设施

- [ ] PostgreSQL 连接正常：后端日志无 `P1001` 错误
- [ ] Redis 连接正常：后端日志无 `ECONNREFUSED` 错误
- [ ] 数据库迁移全部应用：日志显示 "Migration deployment completed!"
- [ ] 关键表存在：users、resources、knowledge_bases 等

#### 后端

- [ ] 健康检查通过：`GET /api/v1/health` 返回 200
- [ ] JWT 认证正常：注册/登录流程可用
- [ ] AI API 连通：创建对话可获得 AI 回复
- [ ] WebSocket 连通：实时功能正常（研究进度推送等）
- [ ] Puppeteer 正常：PDF 导出功能可用（需要 Chromium）

#### 前端

- [ ] 页面正常加载：无白屏
- [ ] API 请求正常：浏览器 Network 面板无 CORS 错误
- [ ] 静态资源正常：CSS/JS/图片加载无 404
- [ ] 路由正常：各页面可正常跳转

#### 安全

- [ ] JWT_SECRET 已使用强随机值（非默认值）
- [ ] CORS_ORIGINS 仅包含前端域名（不是 `*`）
- [ ] `.env` 文件未提交到 Git
- [ ] 生产环境 LOG_LEVEL 不是 `debug`

---

### 8. 故障排除

#### 数据库迁移失败

```
问题: "Migration X failed to apply cleanly"
原因: 之前的迁移部分执行，留下了不一致状态

解决方案:
1. deploy-migrations.ts 会自动处理失败迁移（标记为 applied）
2. docker-entrypoint.sh 会 resolve 已知的问题迁移
3. 如果仍然失败，手动连接数据库:
   npx prisma studio  # 或直接用 psql 连接
   # 检查 _prisma_migrations 表中的失败记录
```

#### Railway 健康检查超时

```
问题: 服务不断重启，日志显示 "health check timeout"
原因: 首次部署迁移耗时过长

解决方案:
1. backend/railway.toml 的 healthcheckTimeout 已设为 600（10 分钟）
2. 如果仍然超时，可临时增大:
   healthcheckTimeout = 900  # 15 分钟
3. 检查数据库连接是否正常（Railway 私有网络可能需要几秒连通）
```

#### CORS 错误

```
问题: 浏览器 Console 显示 "Access-Control-Allow-Origin" 错误
原因: CORS_ORIGINS 配置不正确

解决方案:
1. 确保 CORS_ORIGINS 包含前端完整域名（含 https://）
2. 多个域名用逗号分隔: https://app.example.com,http://localhost:3000
3. 注意不要有尾部斜杠
```

#### Redis 连接失败 (ECONNREFUSED ::1:6379)

```
问题: 后端日志显示 "ECONNREFUSED ::1:6379"
原因: cache-manager-ioredis-yet 不支持 URL 字符串

解决方案:
代码已修复 — REDIS_URL 会被解析为 host/port/password 分别传入。
确保 REDIS_URL 格式正确: redis://[:password]@host:port
```

#### Puppeteer/Chromium 错误

```
问题: PDF 导出失败，"Could not find Chromium"
原因: 系统没有安装 Chromium

解决方案:
1. Docker 环境: backend/Dockerfile 已安装 chromium + fonts-noto-cjk
2. 本地开发: 安装 Chromium 并设置环境变量:
   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
   PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

#### Node.js OOM (Out of Memory)

```
问题: "FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory"
原因: 默认堆内存不够

解决方案:
1. Railway startCommand 已设置 --max-old-space-size=1536
2. 如果仍然 OOM，增大到 2048 或 2560
3. 建议 Railway 服务内存 >= 2GB
```

#### 前端 NEXT*PUBLIC*\* 变量不生效

```
问题: 修改了 NEXT_PUBLIC_API_URL 但前端仍请求旧地址
原因: NEXT_PUBLIC_* 是构建时嵌入的，不是运行时读取

解决方案:
修改 NEXT_PUBLIC_* 变量后，必须重新构建（重新部署）前端服务。
在 Railway Dashboard 中点击 "Redeploy" 即可。
```

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
- [部署环境变量参考](infra/railway/)

---

## 许可证

[MIT License](LICENSE)

---

**当前版本**: v29.0.1 | **最后更新**: 2026-03-12
