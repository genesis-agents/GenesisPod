# Raven AI Engine - Claude Code 配置

> AI 助手行为配置，指导 Claude Code 在本项目中的决策和行为。

## 项目概述

**Raven AI Engine** - 企业级 AI 深度研究和内容管理平台。

### 核心模块

| 模块        | 描述                       | 路径                                     |
| ----------- | -------------------------- | ---------------------------------------- |
| AI Research | 深度研究，多步骤规划和报告 | `backend/src/modules/ai-app/research/`   |
| AI Teams    | 多 Agent 协作，辩论碰撞    | `backend/src/modules/ai-app/teams/`      |
| AI Office   | 文档/PPT/设计生成          | `backend/src/modules/ai-app/office/`     |
| AI Ask      | 智能问答，多模型切换       | `backend/src/modules/ai-app/ask/`        |
| AI Coding   | AI 编程助手，代码生成      | `backend/src/modules/ai-app/coding/`     |
| AI Writing  | AI 写作助手，长文本创作    | `backend/src/modules/ai-app/writing/`    |
| AI Social   | AI 社交内容生成            | `backend/src/modules/ai-app/social/`     |
| Library     | 资源库，内容管理           | `backend/src/modules/content/resources/` |

### 技术栈

```
Frontend: Next.js 14 + TypeScript + Zustand + TailwindCSS
Backend:  NestJS 10 + Prisma ORM + PostgreSQL (统一数据库架构)
AI:       LiteLLM + OpenAI/Claude/Grok API
Infra:    Docker + Railway + PM2
```

### AI 架构分层

```
AI Engine（核心能力层）→ 领域无关的通用机制
     ↓
AI Teams（协作机制层）→ 多 Agent 协作框架
     ↓
AI Apps（应用层）→ AI Studio / AI Office / AI Simulation
```

> 详细文档: [skills/ai-architecture-layering/SKILL.md](skills/ai/ai-architecture-layering/SKILL.md)

### 模块依赖关系（必读）

**所有 AI App 模块只通过 `AIEngineFacade` 和 Registry 访问 AI Engine，禁止直接导入 Engine 内部服务。**

```
AI App 模块                          AI Engine 核心
─────────────                        ─────────────
Research  ──┐                        ┌── AIEngineFacade (统一入口)
Teams     ──┤                        ├── AgentRegistry (注册 Agent)
Writing   ──┤── 全部通过 ──────────→ ├── TeamRegistry (注册 Team)
Office    ──┤   Facade + Registry    ├── ToolRegistry (注册 Tool)
Ask       ──┤                        ├── AiChatService (LLM 调用)
Social    ──┤                        ├── EmbeddingService (向量化)
Image     ──┘                        └── Orchestration (执行器)
```

**关键关系（Claude 必须记住，不要猜）：**

| 关系               | 说明                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| AI App → AI Engine | 单向依赖，App 层调 Engine 层，**反过来不行**                                  |
| AI App 之间        | **极少直接依赖**，如有需要通过 AI Engine 中转                                 |
| Topic Insights     | 属于 `ai-app/`，是 Research 的衍生应用，**不是** AI Engine 核心               |
| RAG                | 核心在 `ai-engine/rag/`（Embedding/Vector/Chunker），业务逻辑在 `ai-app/rag/` |
| Teams 模块         | `ai-engine/teams/` 是框架（Registry），`ai-app/teams/` 是业务（辩论等）       |
| Image 模块         | `ai-engine/image/` 是能力，`ai-app/image/` 是应用，用 `forwardRef` 解循环依赖 |

**注册模式（onModuleInit）：**

```typescript
// AI App 模块在 onModuleInit 中向 Engine Registry 注册自己的 Agent/Team
onModuleInit() {
  this.agentRegistry.register(this.myAgent);
  this.teamRegistry.registerConfig(MY_TEAM_CONFIG);
}
```

---

## 行为红线

> **这些规则从历史 session 中提炼，Claude 必须严格遵守。**

### 分析先行，禁止猜测

- 诊断任何问题前，**必须先 Read 相关源码**，不得凭记忆或猜测给出结论
- 做架构评估/代码审查时，**必须列出实际读过的文件路径**，未读过的不评分
- 如果不确定两个模块的关系，**读 .module.ts 的 imports 确认**，不要猜

### 只改该改的

- **不得修改任务范围外的文件**。发现无关问题可以记录，但不要擅自改
- 不做"顺手优化"——不加 docstring、不重命名变量、不"改善"未涉及的代码

### 架构决策必须确认

- 涉及新增依赖、模块间关系变更、接口设计时，**先说方案等我确认**
- 在"快速修复"和"正确抽象"之间，**永远选正确抽象**，除非我明确说"临时方案"
- 不得用 provider-specific 硬编码（如 `model: "gpt-4o"`），必须走 TaskProfile

### Sub-Agent 管控（血的教训）

> **2026-02-10 事故**: Sub-Agent 越权创建 planning 模块、修改 Sidebar 等无关文件；主 Agent 用 `git checkout -- .` 回退时误删其他 session 的工作；`rm -rf` 删除未跟踪文件导致不可恢复的数据丢失。

**规则（绝对不允许违反）：**

1. **Agent prompt 必须包含白名单**：明确列出允许修改的文件路径列表，prompt 中写 "只允许修改以下文件：xxx"，禁止 Agent 触碰白名单外的任何文件
2. **Agent 完成后必须逐文件 diff 审查**：用 `git diff {file}` 逐个检查每个被修改的文件，确认变更内容在任务范围内。发现越权修改时，只 `git checkout -- {具体文件}` 回退该文件，**绝不使用 `git checkout -- .`**
3. **禁止全局回退命令**：**永远不用** `git checkout -- .`、`git restore .`、`git reset --hard`。只允许针对具体文件的回退：`git checkout -- path/to/specific/file`
4. **禁止删除未跟踪文件**：**永远不用** `rm -rf` 删除可能属于其他 session/Agent 的文件。如果需要清理，先 `git status` 列出，逐个确认后只删除确定是本次 Agent 创建的文件
5. **Agent 禁止创建新模块**：Sub-Agent 不得创建新的 .module.ts、新的页面路由（page.tsx）、新的 store 文件。如需新建模块，必须由主 Agent 确认后手动创建
6. **Agent 禁止修改入口文件**：Sub-Agent 不得修改 `app.module.ts`、`layout.tsx`、`Sidebar.tsx`、`MobileNav.tsx`、路由配置等全局入口文件

### Git 安全操作

> **核心原则：工作目录可能有其他 session/Agent 的未提交工作，任何全局操作都可能造成不可恢复的损失。**

**禁止的命令（绝对不用）：**

- `git checkout -- .`（回退全部修改）
- `git restore .`（同上）
- `git reset --hard`（丢弃所有变更）
- `git clean -fd`（删除未跟踪文件）
- `rm -rf` 对未确认归属的文件/目录

**正确做法：**

- 回退单个文件：`git checkout -- path/to/file`
- 回退前先看：`git diff path/to/file` 确认内容
- 删除文件前先问：这个文件是不是我这个 session 创建的？不确定就不删

### Git 规范

- Commit message: 小写 type，header < 100 字符，无句号结尾
- Push 失败时：`git pull --rebase` 然后重试，不要 force push
- 一个 commit 只做一件事，不要混合无关变更

---

## 代码规范

> 完整规范: [standards/00-overview.md](standards/00-overview.md)

### 命名规范

| 类型        | 规范                  | 示例                   |
| ----------- | --------------------- | ---------------------- |
| 目录        | kebab-case            | `ai-office`            |
| React 组件  | PascalCase            | `ResourceCard.tsx`     |
| Hooks       | camelCase + use       | `useResources.ts`      |
| NestJS 服务 | kebab-case + .service | `ai-core.service.ts`   |
| DTO         | PascalCase + Dto      | `CreateResourceDto.ts` |

### 代码风格

1. **TypeScript 优先**: 禁止 `any` 类型
2. **函数式组件**: React 使用函数组件 + Hooks
3. **错误处理**: 所有异步操作必须 try-catch
4. **日志**: 使用 NestJS Logger，禁止 console.log
5. **图标**: 禁止使用 emoji，必须使用 SVG 图标（Lucide React）

### 导入顺序

```typescript
// 1. 外部库
import { useState } from "react";
// 2. 内部模块 (@/)
import { useApiGet } from "@/hooks/core";
// 3. 相对导入
import { formatDate } from "./utils";
```

---

## Bug 修复原则

> 核心：**用户视角优先，追踪确认，不假设问题位置**

### 修复前必答

1. 用户在哪个页面？
2. 执行什么操作？
3. 期望 vs 实际结果？
4. 代码确切位置？

### 端到端追踪

```
UI组件 → 事件处理 → Store/API → 后端Controller → Service → 返回 → 渲染
```

### 禁止行为

- ❌ 搜索关键词，修改第一个找到的
- ❌ 只修前端或只修后端
- ❌ 假设问题原因不读代码
- ✅ 从 UI 追踪到确切位置
- ✅ 追踪完整链路，两端一致

---

## AI 开发指南

> 完整规范: [docs/guides/ai-calling-standards.md](../docs/guides/ai-calling-standards.md)

### LLM 调用

**必须使用 `AiChatService.chat()` + `TaskProfile` + `modelType`**

```typescript
const response = await this.aiChatService.chat({
  messages: [{ role: "system", content: prompt }],
  modelType: AIModelType.CHAT,
  taskProfile: { creativity: "medium", outputLength: "medium" },
});
```

**禁止**: 硬编码 `model: "gpt-4o"` 或 `temperature: 0.7`

### TaskProfile 参考

| creativity    | temperature | 场景             |
| ------------- | ----------- | ---------------- |
| deterministic | 0.1         | 分类、提取、JSON |
| low           | 0.3         | 分析、总结       |
| medium        | 0.7         | 对话、研究       |
| high          | 0.9         | 创意写作         |

| outputLength | maxTokens | 场景       |
| ------------ | --------- | ---------- |
| minimal      | 500       | 分类标签   |
| short        | 1500      | 摘要       |
| medium       | 4000      | 标准分析   |
| long         | 8000      | 报告、章节 |

---

## 验证命令

| 命令                     | 用途                                  |
| ------------------------ | ------------------------------------- |
| `npm run verify:quick`   | 快速验证（类型 + 测试）               |
| `npm run verify:full`    | 完整验证（Lint + 类型 + 测试 + 构建） |
| `npm run verify:changed` | 智能变更验证                          |
| `npm run type-check`     | 类型检查                              |
| `npm run test:quick`     | 快速测试                              |

### 自愈规则

验证失败时：分析错误 → 修复 → 重新验证 → 循环直到通过

**禁止**: 询问用户是否继续、使用 `@ts-ignore`、注释掉测试

---

## 常见任务

### 新增 API

```bash
1. backend/src/modules/{module}/dto/create-xxx.dto.ts
2. backend/src/modules/{module}/{module}.service.ts
3. backend/src/modules/{module}/{module}.controller.ts
4. frontend/hooks/domain/useXxx.ts
```

### 新增页面

```bash
1. frontend/app/{route}/page.tsx
2. frontend/components/{module}/XxxPage.tsx
```

### 数据库变更

```bash
1. backend/prisma/schema.prisma
2. npx prisma migrate dev --name xxx
3. npx prisma generate
```

---

## 快速参考

| 命令                     | 描述         |
| ------------------------ | ------------ |
| `npm run dev`            | 启动全栈开发 |
| `npm run dev:frontend`   | 启动前端     |
| `npm run dev:backend`    | 启动后端     |
| `npx prisma studio`      | 数据库管理   |
| `npx prisma migrate dev` | 数据库迁移   |

### Git 工作流

```bash
git checkout -b feat/feature-name
git commit -m "feat(module): description"
# 类型: feat, fix, refactor, docs, style, test, chore
```

---

## 文档规范

> 详细规范: [standards/10-documentation-organization.md](standards/10-documentation-organization.md)

### 核心原则

- **按模块聚合**: 同一模块文档放一起
- **更新而非新建**: 不创建 v2.md
- **kebab-case**: 全小写，连字符分隔

---

## 相关文档

| 文档         | 路径                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| 开发规范总览 | [standards/00-overview.md](standards/00-overview.md)                          |
| 代码风格     | [standards/04-code-style.md](standards/04-code-style.md)                      |
| API 设计     | [standards/05-api-design.md](standards/05-api-design.md)                      |
| Git 工作流   | [standards/08-git-workflow.md](standards/08-git-workflow.md)                  |
| AI 调用规范  | [docs/guides/ai-calling-standards.md](../docs/guides/ai-calling-standards.md) |

---

**最后更新**: 2025-01-15
**维护者**: Claude Code
**版本**: 2.0
