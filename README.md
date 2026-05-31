# Genesis.ai

企业级 AI 研究、内容生产与多 Agent 协作平台。

当前版本：`50.6.1`

## 项目概览

Genesis.ai 是一个 monorepo，包含：

- `frontend/`：Next.js 14 前端
- `backend/`：NestJS 10 后端
- `ai-service/`：FastAPI 辅助服务
- `infra/`：Railway / EdgeOne 部署脚本与配置
- `e2e/`：Playwright 端到端测试

核心产品面：

- `AI Ask`：通用问答
- `AI Insights`：话题洞察
- `AI Research`：深度研究
- `Agent Playground`：多 Agent 研究编排与报告生成
- `AI Office / Slides`：报告与演示文稿生产
- `AI Writing`：长文写作
- `AI Social`：社媒内容生成
- `Library / RAG / Knowledge Graph`：知识沉淀与检索
- `Admin`：模型、工具、Secrets、数据源、系统管理

## 技术栈

| 层       | 技术                                                                     |
| -------- | ------------------------------------------------------------------------ |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind, Zustand, SWR, TanStack Query |
| Backend  | NestJS 10, Prisma, PostgreSQL 16, Redis 7, Socket.IO, EventEmitter       |
| AI       | OpenAI, Anthropic, Gemini, Grok, DeepSeek, LiteLLM-compatible providers  |
| Infra    | Docker Compose, Railway, EdgeOne, Playwright, Husky                      |

## 当前架构

后端当前按 5 个顶层模块分层：

- `ai-app`：业务应用层
- `ai-engine`：通用 AI 能力
- `ai-harness`：多 Agent 运行时、生命周期、评测、协议
- `ai-infra`：认证、存储、密钥、通知等基础设施
- `open-api`：对外 API / MCP / Admin 接口

这比旧文档里的 `intent-gateway / ai-kernel` 六层说法更接近当前真实代码。

## 快速开始

### 1. 环境要求

- Node.js `>= 20`
- npm `>= 9`
- Docker / Docker Compose
- PostgreSQL 与 Redis 通过本地容器启动

### 2. 安装依赖

```bash
npm install
```

### 3. 启动基础设施

```bash
npm run db:setup
```

这会启动：

- `postgres`：`localhost:5432`
- `redis`：`localhost:6379`
- `flaresolverr`：`localhost:8191`

### 4. 初始化数据库

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### 5. 启动开发环境

在仓库根目录：

```bash
npm run dev
```

默认端口：

- Frontend：`http://localhost:3000`
- Backend：`http://localhost:3001` 或项目当前配置端口
- AI Service：`http://localhost:5000`

如果只启动单端：

```bash
npm run dev:frontend
npm run dev:backend
npm run dev:ai
```

## 常用命令

### 根目录

```bash
npm run dev
npm run build
npm run test
npm run lint
npm run type-check
npm run verify:quick
npm run verify:full
npm run e2e
```

### 前端

```bash
cd frontend
npm run dev
npm run build
npm run test
npm run type-check
```

### 后端

```bash
cd backend
npm run dev
npm run build
npm run test
npm run test:quick
npm run type-check
npm run diagnose
```

### 数据库

```bash
npm run db:setup
npm run db:migrate
npm run db:seed
npm run db:studio
```

## 本地容器化运行

仓库支持把前后端分别构建后放进本地容器验证。当前常见本地联调链路：

- 前端容器：`localhost:3000`
- 后端容器：`localhost:4000`

适合验证：

- 登录页与 OAuth 入口
- Agent Playground mission 流程
- 报告三视图
- 容器环境下的 Prisma / dist / alias / bootstrap 问题

## 近期关键约束

### 1. 登录入口

当前登录入口已经统一为先进入 `/login`，不应再由首页通用“登录”按钮直接跳 Google OAuth。

### 2. Agent Playground 报告完整性

近期修复重点包括：

- 章节 pipeline 完整性约束
- `reportArtifact` section offset 修复
- `S8B / S9B / S11` 完整性闭环
- 历史坏 `sections` 的前端读取兜底

### 3. Playground token 统计

近期修复了 live token 聚合问题：

- 支持 `cost:tick.deltaTokens` 记入总 token
- 页面会使用持久化 cost 兜底覆盖 live 低值
- 算力面板模型分布在 trace 无 token 时按调用占比分摊

## 环境变量

最小本地开发通常至少需要：

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY` 或其他任一模型提供方 Key

若启用登录、对象存储、第三方集成，还需要：

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`
- `STORAGE_*`
- `RESEND_API_KEY` 或其他邮件服务配置

请以仓库内现有 `.env` 模板和 Railway 环境配置为准，不要只依赖历史文档。

## 部署

生产部署以 `infra/railway/` 为主：

- Railway service 构建与发布脚本
- release notify
- 环境变量注入
- 数据库迁移流程

相关目录：

- `infra/railway/`
- `backend/prisma/`
- `backend/prisma/deploy-migrations.ts`

## 测试与质量门禁

提交前常用：

```bash
npm run type-check
npm run test:quick
npm run build:backend
```

仓库还包含：

- Husky pre-commit
- pre-push 验证
- 架构边界检查
- Playwright E2E

## 文档导航

- 项目结构：[`STRUCTURE.md`](STRUCTURE.md)
- 变更记录：[GitHub Releases](https://github.com/junjie-duan/genesis-agent-teams/releases)
- 部署与环境：`infra/railway/`
- 需求与设计：`docs/`

## 当前维护建议

- 更新文档时，优先以真实目录和脚本为准，不要沿用旧项目名 `deepdive-engine`
- 描述后端分层时，优先使用当前真实模块：`ai-app / ai-engine / ai-harness / ai-infra / open-api`
- 对 Agent Playground、登录、报告完整性相关说明，要跟最近线上修复保持同步
