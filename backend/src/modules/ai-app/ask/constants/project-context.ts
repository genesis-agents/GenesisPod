/**
 * DeepDive Engine 项目上下文
 * 内置项目信息，让 AI Ask 能够回答关于本项目的问题
 */

export const DEEPDIVE_ENGINE_CONTEXT = `
## DeepDive Engine 项目概述

**DeepDive Engine** 是一个企业级 AI 驱动的深度研究和内容管理平台，核心价值是帮助用户高效获取、整理、分析和生成高质量内容。

### 技术栈
- **前端**: Next.js 14 (App Router) + TypeScript + Zustand + TailwindCSS + shadcn/ui
- **后端**: NestJS 10 + Prisma ORM + PostgreSQL + MongoDB + Neo4j
- **AI**: LiteLLM (多模型统一接口) + OpenAI/Claude/Grok/Gemini/DeepSeek
- **基础设施**: Docker + Railway + PM2

### 核心功能模块

| 模块 | 功能描述 | 技术路径 |
|------|----------|----------|
| **AI Studio** | 深度研究工作室，支持多步骤研究规划和报告生成 | \`ai-studio/\` |
| **AI Teams** | AI 团队协作，多 Agent 辩论和观点碰撞 | \`ai-teams/\` |
| **AI Office** | AI 办公套件，PPT/文档/设计生成 | \`ai-office/\` |
| **AI Ask** | 智能问答，支持多模型切换和 RAG | \`ai-ask/\` |
| **Library** | 资源库，统一内容管理和知识库 | \`resources/\` |
| **Data Collection** | 数据采集，多源数据爬取 | \`data-services/\` |

### 项目结构

\`\`\`
deepdive-engine/
├── frontend/                 # Next.js 前端
│   ├── app/                  # App Router 页面
│   ├── components/           # React 组件
│   │   ├── ui/               # 基础 UI 组件 (shadcn/ui)
│   │   ├── layout/           # 布局组件
│   │   └── {module}/         # 模块专用组件
│   ├── hooks/                # React Hooks
│   │   ├── core/             # 基础 hooks (useApi, useStream)
│   │   ├── domain/           # 业务 hooks
│   │   └── features/         # 功能 hooks
│   ├── stores/               # Zustand 状态管理
│   └── lib/                  # 工具库
│
├── backend/                  # NestJS 后端
│   └── src/
│       ├── common/           # 公共服务 (Prisma, AI Orchestration)
│       └── modules/
│           ├── ai-engine/    # AI 引擎核心 (LLM, Tools, Agents, Teams)
│           ├── ai-app/       # AI 应用模块
│           │   ├── ask/      # AI Ask
│           │   ├── office/   # AI Office (Slides, Docs)
│           │   ├── studio/   # AI Studio
│           │   └── teams/    # AI Teams
│           ├── content/      # 内容管理
│           │   ├── resources/ # 资源库
│           │   └── knowledge-base/ # 知识库
│           ├── core/         # 核心模块 (auth, admin)
│           ├── credits/      # 积分系统
│           └── export/       # 导出功能
│
├── docs/                     # 文档
│   ├── prd/                  # 产品需求文档
│   └── guides/               # 开发指南
│
└── prisma/                   # 数据库 Schema
\`\`\`

### 关键技术组件

#### AI Engine (ai-engine/)
AI 引擎是整个系统的核心，提供：
- **LLM 适配器**: 统一接口调用 OpenAI/Claude/Gemini/Grok/DeepSeek
- **Function Calling**: 支持工具调用的执行器
- **Agent 框架**: 基础 Agent 类和 Agent Registry
- **Teams 框架**: 多 Agent 协作，支持角色、任务分解
- **RAG 管道**: 文档分块、向量化、检索增强生成
- **Skills 系统**: 可复用的技能模块

#### AI Office - Slides (ai-office/slides/)
PPT 生成模块，采用团队协作模式：
- **SlidesTeamOrchestrator**: 任务编排器
- **SlidesLeader**: 任务规划和分配
- **SlidesTeamMember**: 执行具体任务
- **Skills**: task-decomposition, outline-planning, page-pipeline, quality-audit
- **实时流式输出**: SSE 推送生成进度

#### AI Ask (ai-ask/)
智能问答模块：
- 支持多轮对话
- RAG 知识库检索增强
- 可选工具调用能力
- 支持多模型切换

### 开发规范

#### 命名规范
- **目录**: kebab-case (如 \`ai-office\`, \`deep-research\`)
- **React 组件**: PascalCase (如 \`ResourceCard.tsx\`)
- **Hooks**: camelCase + use 前缀 (如 \`useResources.ts\`)
- **NestJS 服务**: kebab-case + .service (如 \`ai-core.service.ts\`)
- **DTO**: PascalCase + Dto (如 \`CreateResourceDto.ts\`)

#### 代码风格
- TypeScript 优先，禁止 \`any\` 类型
- React 使用函数式组件 + Hooks
- NestJS 使用依赖注入
- 错误处理使用 try-catch
- 日志使用 NestJS Logger

### 常用命令

| 命令 | 描述 |
|------|------|
| \`npm run dev\` | 启动全栈开发服务 |
| \`npm run dev:frontend\` | 启动前端 |
| \`npm run dev:backend\` | 启动后端 |
| \`npm run verify:quick\` | 快速验证 (类型+测试) |
| \`npm run type-check\` | 类型检查 |
| \`npx prisma studio\` | 数据库管理 |

### 环境变量

\`\`\`env
# 数据库
DATABASE_URL=postgresql://...
MONGODB_URI=mongodb://...
NEO4J_URI=bolt://...

# AI 服务
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
XAI_API_KEY=xai-...
GOOGLE_AI_API_KEY=...

# 认证
NEXTAUTH_SECRET=...
\`\`\`

### 项目特色

1. **多模型支持**: 通过 AI Engine 统一接入多种 LLM
2. **团队协作 AI**: 多 Agent 协同完成复杂任务
3. **知识库增强**: RAG 技术让 AI 基于私有知识回答
4. **实时流式输出**: SSE 技术实现打字机效果
5. **积分系统**: 用量计费和配额管理
6. **企业级架构**: 模块化、可扩展、可维护
`;

/**
 * 项目相关问题的关键词
 */
export const PROJECT_KEYWORDS = [
  "deepdive",
  "deep dive",
  "engine",
  "项目",
  "代码",
  "代码库",
  "codebase",
  "架构",
  "技术栈",
  "模块",
  "ai-engine",
  "ai engine",
  "ai-office",
  "ai office",
  "ai-ask",
  "ai ask",
  "ai-studio",
  "ai studio",
  "ai-teams",
  "ai teams",
  "slides",
  "ppt",
  "知识库",
  "knowledge base",
  "rag",
  "nestjs",
  "next.js",
  "nextjs",
  "prisma",
  "zustand",
  "前端",
  "后端",
  "frontend",
  "backend",
];

/**
 * 检查问题是否与项目相关
 */
export function isProjectRelatedQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return PROJECT_KEYWORDS.some((keyword) =>
    lowerQuery.includes(keyword.toLowerCase()),
  );
}
