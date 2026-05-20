# Genesis.ai Structure

最后更新：`2026-05-03`

本文档只描述当前仓库的真实结构，不追溯历史目录命名。

## 1. 根目录

```text
genesis-agent-teams/
├─ frontend/           Next.js 前端
├─ backend/            NestJS 后端
├─ ai-service/         FastAPI 辅助服务
├─ e2e/                Playwright E2E
├─ infra/              Railway / EdgeOne 部署配置
├─ docs/               需求、设计、PRD、运维文档
├─ scripts/            根目录自动化脚本
├─ docker-compose.yml  本地基础设施
├─ README.md           项目总览
└─ STRUCTURE.md        本文档
```

补充：

- `.github/`：CI / workflow
- `.husky/`：pre-commit / pre-push hooks
- `.ui-patrol/`：UI 巡检相关资产

## 2. 前端结构

前端使用 Next.js App Router。

### 2.1 `frontend/app/`

主要业务路由：

```text
frontend/app/
├─ admin/              管理后台
├─ agent-playground/   多 Agent 研究编排与报告页
├─ ai-ask/             通用问答
├─ ai-image/           图片生成
├─ ai-insights/        话题洞察
├─ ai-office/          Office / Slides
├─ ai-planning/        AI 规划
├─ ai-research/        AI 研究
├─ ai-simulation/      AI 模拟
├─ ai-skills/          技能中心
├─ ai-social/          社媒内容
├─ ai-store/           应用市场
├─ ai-teams/           团队协作
├─ ai-writing/         写作
├─ api/                Next API Routes / BFF
├─ auth/               OAuth callback
├─ credits/            Credits
├─ explore/            资源浏览
├─ feedback/           反馈
├─ knowledge-graph/    知识图谱
├─ library/            资源库
├─ login/              登录页
├─ me/                 用户个人页
├─ notifications/      通知
├─ notion/             Notion 集成页
├─ profile/            Profile
├─ rag/                RAG 页面
├─ report/             报告页
├─ settings/           设置
└─ share/              对外分享页
```

重点说明：

- `agent-playground/team/[missionId]` 是当前多 Agent mission 详情主页面
- `login/` 是统一登录入口
- `admin/ai/tools`、`admin/access/*`、`admin/system/*` 是当前运维与配置核心入口

### 2.2 `frontend/components/`

按业务域拆分：

```text
frontend/components/
├─ admin/
├─ agent-playground/
├─ ai-image/
├─ ai-insights/
├─ ai-office/
├─ ai-research/
├─ ai-social/
├─ ai-writing/
├─ common/
├─ layout/
├─ playground-ui/
├─ shared/
└─ ui/
```

重点：

- `agent-playground/`：mission timeline、todo board、artifact reader、compute usage 等
- `playground-ui/`：Playground 专用设计系统 primitives
- `layout/`：全局 shell、侧边栏、顶部导航

### 2.3 `frontend/lib/`

```text
frontend/lib/
├─ agent-playground/   Playground 派生逻辑、状态转换、报告工具
├─ ai-office/
├─ api/
├─ generated/
├─ i18n/
├─ markdown/
├─ swr/
├─ templates/
└─ utils/
```

重点：

- `agent-playground/derive.ts`：事件流到 UI 视图的派生核心
- `agent-playground/todo-ledger.ts`：mission todo 状态聚合

### 2.4 其他前端目录

```text
frontend/
├─ hooks/              通用与领域 hooks
├─ contexts/           React Context
├─ stores/             Zustand stores
├─ services/           API client / service wrappers
├─ types/              TS 类型
├─ public/             静态资源
└─ scripts/            changelog 生成等前端脚本
```

## 3. 后端结构

后端当前不再按旧文档里的 `intent-gateway / ai-kernel` 六层描述维护，而是以下 5 个顶层模块。

```text
backend/src/modules/
├─ ai-app/
├─ ai-engine/
├─ ai-harness/
├─ ai-infra/
└─ open-api/
```

### 3.1 `ai-app/`

面向产品能力。

```text
backend/src/modules/ai-app/
├─ agent-playground/
├─ ask/
├─ byok/
├─ contracts/
├─ explore/
├─ feedback/
├─ image/
├─ library/
├─ management/
├─ office/
├─ planning/
├─ research/
├─ simulation/
├─ social/
├─ teams/
├─ topic-insights/
└─ writing/
```

重点：

- `agent-playground/`：当前多 Agent mission 编排、阶段执行、事件流、报告产物
- `topic-insights/`：洞察专题、章节化报告、来源配置
- `office/`：Slides / export / synthesis
- `management/`：后台配置、摄取、workspace 管理

### 3.2 `ai-engine/`

通用 AI 能力层。

```text
backend/src/modules/ai-engine/
├─ content/
├─ facade/
├─ knowledge/
├─ llm/
├─ planning/
├─ rag/
├─ safety/
├─ skills/
└─ tools/
```

职责：

- 模型接入与路由
- 工具注册与执行
- RAG / 知识处理
- 内容与安全能力
- 对上提供 facade

### 3.3 `ai-harness/`

多 Agent 运行时与编排底座。

```text
backend/src/modules/ai-harness/
├─ agents/
├─ evaluation/
├─ facade/
├─ guardrails/
├─ handoffs/
├─ lifecycle/
├─ memory/
├─ protocols/
├─ runner/
├─ teams/
└─ tracing/
```

职责：

- mission 生命周期
- agent runtime / runner
- 评测与质量 gate
- tracing / token / protocol
- handoff / team collaboration

### 3.4 `ai-infra/`

平台基础设施。

常见子域通常包括：

- `auth/`
- `storage/`
- `secrets/`
- `settings/`
- `notifications/`
- `credits/`
- `email/`

职责：

- 认证与授权
- 对象存储
- 系统设置
- 外部密钥管理
- 计费与通知

### 3.5 `open-api/`

对外访问面：

- Admin API
- Public API
- MCP server
- 其他外部集成入口

## 4. 后端公共层

`backend/src/common/` 是跨模块通用设施，不属于单一业务层。

常见内容：

- `prisma/`
- `cache/`
- `guards/`
- `interceptors/`
- `filters/`
- `streaming/`
- `events/`
- `observability/`
- `utils/`

## 5. 数据与 Prisma

```text
backend/prisma/
├─ schema/                 Prisma schema 目录入口
├─ migrations/             手写迁移
├─ seed.ts                 主 seed
├─ diagnose-db.ts          数据库诊断
├─ deploy-migrations.ts    生产迁移入口
└─ seed-*.ts / scripts/    各类 seed / 维护脚本
```

当前特点：

- 使用 PostgreSQL 作为主数据库
- Prisma schema 使用目录模式，而不是单文件
- 生产部署依赖显式迁移与 seed

## 6. AI Service

```text
ai-service/
├─ main.py
├─ requirements.txt
└─ ... 其他 FastAPI 相关模块
```

它是辅助服务，不是主业务后端。

常见职责：

- AI 辅助推理
- 特定 Python 生态能力
- 与前后端解耦的辅助计算

## 7. Infra

```text
infra/
├─ edgeone/
└─ railway/
```

重点使用：

- `infra/railway/`：线上部署脚本、发布通知、环境相关自动化

## 8. E2E 与脚本

```text
e2e/       Playwright 用例
scripts/   根目录工程脚本、质量检查、UI 巡检、发布辅助
```

根目录常见命令与这些目录直接相关：

- `npm run e2e`
- `npm run ui-patrol`
- `npm run verify:changed`
- `npm run release:*`

## 9. 当前应特别关注的代码区域

如果你在维护近期高频问题，优先看这些位置：

### 登录链路

```text
frontend/app/login/page.tsx
frontend/components/layout/UserProfileButton.tsx
frontend/components/common/SignInPrompt.tsx
frontend/app/page.tsx
backend/src/modules/ai-infra/auth/
```

### Agent Playground

```text
frontend/app/agent-playground/team/[missionId]/page.tsx
frontend/components/agent-playground/
frontend/lib/agent-playground/
backend/src/modules/ai-app/agent-playground/
backend/src/modules/ai-harness/
```

### 报告完整性

```text
backend/src/modules/ai-app/agent-playground/services/mission/workflow/
frontend/components/agent-playground/artifact/
frontend/lib/agent-playground/
```

### 工具与来源配置

```text
backend/src/modules/ai-engine/tools/
backend/src/modules/ai-app/topic-insights/
frontend/app/admin/ai/tools/
frontend/components/admin/
```

## 10. 文档维护规则

更新本文件时，遵守这几个规则：

- 以真实目录为准，不复用历史项目名 `deepdive-engine`
- 不再写已经失真的旧分层说明
- 只记录稳定结构，不把一次性排障临时文件写成正式架构
- 若顶层模块新增或迁移，优先同步本文件与 `README.md`
