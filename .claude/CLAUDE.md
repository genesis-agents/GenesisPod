# Genesis.ai - Claude Code 配置

> AI 助手行为配置，指导 Claude Code 在本项目中的决策和行为。

## 项目概述

**Genesis.ai** - 企业级 AI 深度研究和内容管理平台。

### 核心模块

| 模块           | 描述                       | 路径                                         |
| -------------- | -------------------------- | -------------------------------------------- |
| AI Research    | 深度研究，多步骤规划和报告 | `backend/src/modules/ai-app/research/`       |
| Topic Insights | 话题洞察，Research 衍生    | `backend/src/modules/ai-app/topic-insights/` |
| AI Teams       | 多 Agent 协作，辩论碰撞    | `backend/src/modules/ai-app/teams/`          |
| AI Office      | 文档/PPT/设计生成          | `backend/src/modules/ai-app/office/`         |
| AI Writing     | AI 写作助手，长文本创作    | `backend/src/modules/ai-app/writing/`        |
| AI Ask         | 智能问答，多模型切换       | `backend/src/modules/ai-app/ask/`            |
| AI Image       | AI 图像生成                | `backend/src/modules/ai-app/image/`          |
| AI Social      | AI 社交内容生成            | `backend/src/modules/ai-app/social/`         |
| AI Simulation  | 多角色模拟辩论             | `backend/src/modules/ai-app/simulation/`     |
| AI Planning    | AI 辅助规划                | `backend/src/modules/ai-app/planning/`       |
| Library        | 资源库，内容管理           | `backend/src/modules/ai-app/library/`        |
| Explore        | 内容浏览与发现             | `backend/src/modules/ai-app/explore/`        |

### 技术栈

```
Frontend: Next.js 14 + TypeScript + Zustand + TailwindCSS
Backend:  NestJS 10 + Prisma ORM + PostgreSQL 16 (统一数据库)
AI:       LiteLLM + OpenAI/Claude/Grok API
Infra:    Docker + Railway + PM2 + Redis 7
```

### 数据库架构

- **PostgreSQL 16**: 唯一数据库（结构化 + JSONB + 图关系）
- **Redis 7**: 缓存和会话管理
- 已移除 MongoDB、Neo4j、Qdrant（成本优化 70-75%）

### AI 架构分层（5 层）

```
L5 Intent Gateway（意图网关层）→ 意图识别、路由分发          → modules/intent-gateway/
L4 Open API（开放接口层）→ MCP Server、Public API、Webhooks  → modules/open-api/
L3 AI Apps（业务应用层）→ Research、Teams、Writing、Office    → modules/ai-app/
L2 AI Engine（核心能力层）→ LLM / Agents / Tools / RAG / Runtime → modules/ai-engine/
      ├── facade/       对外统一入口
      ├── llm/ tools/ agents/ teams/ skills/ mcp/ safety/ knowledge/ ...
      └── runtime/      平台能力（memory/journal/ipc/resource/observability/
                        a2a/realtime/process/scheduler/supervisor/mission/
                        security/api/context）
L1 Infrastructure（基础设施层）→ Auth、Credits、Storage       → modules/ai-infra/
```

> 原 `modules/ai-kernel/` 目录已彻底删除，全部能力归并到 `ai-engine/runtime/`（PR 7）。

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

| 关系               | 说明                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- |
| AI App → AI Engine | 单向依赖，App 层调 Engine 层，**反过来不行**                                          |
| AI App 之间        | **极少直接依赖**，如有需要通过 AI Engine 中转                                         |
| Topic Insights     | 属于 `ai-app/`，是 Research 的衍生应用，**不是** AI Engine 核心                       |
| Library            | 属于 `ai-app/library/`，含 collections/notes/rag/knowledge-graph/integrations         |
| RAG                | 核心在 `ai-engine/rag/`（Embedding/Vector/Chunker），业务逻辑在 `ai-app/library/rag/` |
| Teams 模块         | `ai-engine/teams/` 是框架（Registry），`ai-app/teams/` 是业务（辩论等）               |
| Image 模块         | `ai-engine/image/` 是能力，`ai-app/image/` 是应用，用 `forwardRef` 解循环依赖         |

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

### Facade 边界守护（2026-02-25 提炼）

> **背景**：两次架构审计（83/100 → 86/100）发现的系统性问题。

**Facade 导入三条规则：**

1. **所有 `ai-app` 模块导入 `ai-engine` 内部符号，必须从 `ai-engine/facade` 导入，不得穿透内部路径**
   - 违规：`import { ToolRegistry } from "../../ai-engine/tools/registry/tool-registry"`
   - 正确：`import { ToolRegistry } from "../../ai-engine/facade"`

2. **新增符号时，先在 `facade/index.ts` 补充 export，再在 App 层使用**
   - 不得因"facade 没有导出"就改用直接路径绕过
   - 补充 export 的优先级高于直接路径

3. **禁止内联动态 `import()` 绑过 Facade**
   - 违规：`plan: import("../../ai-engine/orchestration/services/task-planner.service").TaskPlan`
   - 正确：在 `facade/index.ts` 补充 `export type { TaskPlan }`，然后顶层导入

**Fire-and-forget Promise 处理规则：**

- WebSocket emit / 后台生成任务属于 fire-and-forget，必须显式声明：`void this.something()`
- 不能留 unhandled floating promise（会被 ESLint `@typescript-eslint/no-floating-promises` 捕获）
- 区分：Socket.IO 的 `socket.join/leave` 是异步的（要 `await`）；`socket.emit` 是同步的（不需要）

**LLM 模型名硬编码规则（强化）：**

- 任何 fallback/default 场景，**永远用 `""` 空字符串，不用具体模型名**
- `dto.model || "gpt-4"` → `dto.model || ""`
- `modelId = "gpt-4o"` 参数默认值 → `modelId = ""`
- 原因：空字符串由下游 `AiChatService` 走 `TaskProfile` 自动解析，不会 break

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
2. **Agent prompt 必须包含上下文**：涉及数据库操作时，必须在 prompt 中附上相关 Prisma model 定义；涉及前后端对接时，必须附上接口/DTO 类型定义。**不允许 Agent 凭猜测写表名、字段名、接口格式**
3. **Agent 完成后必须逐文件 diff 审查**：用 `git diff {file}` 逐个检查每个被修改的文件，确认变更内容在任务范围内。发现越权修改时，只 `git checkout -- {具体文件}` 回退该文件，**绝不使用 `git checkout -- .`**
4. **禁止全局回退命令**：**永远不用** `git checkout -- .`、`git restore .`、`git reset --hard`。只允许针对具体文件的回退：`git checkout -- path/to/specific/file`
5. **禁止删除未跟踪文件**：**永远不用** `rm -rf` 删除可能属于其他 session/Agent 的文件。如果需要清理，先 `git status` 列出，逐个确认后只删除确定是本次 Agent 创建的文件
6. **Agent 禁止创建新模块**：Sub-Agent 不得创建新的 .module.ts、新的页面路由（page.tsx）、新的 store 文件。如需新建模块，必须由主 Agent 确认后手动创建
7. **Agent 禁止修改入口文件**：Sub-Agent 不得修改 `app.module.ts`、`layout.tsx`、`Sidebar.tsx`、`MobileNav.tsx`、路由配置等全局入口文件

### 交付前自检清单（必须执行）

> **2026-02-13 教训**: 统一导出系统首次交付时遗漏了数据库迁移脚本、前后端协议不匹配（Content-Disposition 格式）、下载错误状态未设置、AbortController 竞态条件等问题，经过两轮检视才全部发现。

**每次功能完成后、提交前，主 Agent 必须逐项过以下清单：**

1. **数据库配套**：修改了 Prisma schema 的 enum/model → 是否创建了对应的手写 SQL 迁移脚本？（本项目用手写迁移，不用 `npx prisma migrate dev`）
2. **前后端协议对齐**：新增/修改了后端 API 响应格式 → 前端解析逻辑是否匹配？（重点检查 header 格式、JSON 字段名、枚举值）
3. **错误路径完整**：try-catch 中 catch 分支 → 是否正确设置了错误状态让 UI 能展示？不允许静默吞掉错误（`.catch(() => {})` / `.catch(() => [])`)
4. **资源清理**：用了定时器/轮询/AbortController/WebSocket → 组件卸载时是否正确清理？是否处理了重入（连续触发）场景？
5. **安全边界**：接受外部输入（用户内容、文件名、URL）→ 是否做了 sanitize/escape/校验？Puppeteer 渲染用户内容 → JS 是否禁用？外部请求是否拦截？
6. **旧代码清理**：新组件替换了旧组件 → 旧文件是否删除？旧的 import 是否全部替换？
7. **项目规范**：禁止 emoji（用 Lucide 图标）、禁止 `console.log`（用 Logger/logger）、禁止 `any` 类型、`t()` 函数签名是否正确？

**以上任何一项未通过，不允许提交。**

### 每次修改必须深度代码检视

> **2026-02-15 规则新增**: 每次代码修改后、提交前，必须进行深度代码检视。

**检视流程：**

1. **逐文件 diff 审查**：`git diff {file}` 逐个检查每个被修改的文件
2. **逻辑正确性**：修改的逻辑是否正确？是否有边界条件遗漏？（如本次 Prisma JSON null 过滤 bug）
3. **影响范围分析**：改动是否会影响其他模块？搜索被修改的函数/变量的调用方
4. **运行时验证**：改动涉及用户可见功能时，必须通过远程环境（Railway URL）实际访问验证，不能只靠本地类型检查
5. **回归风险**：是否可能引入回归？特别关注 nullable 字段、JSON 过滤、条件逻辑的边界情况

**禁止**: 只做类型检查就提交、修改后不验证实际效果、假设"逻辑正确不需要验证"

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

### Git Worktree 多会话最佳实践

**核心原则：每个并行会话必须在独立 Worktree 中工作，不允许多个 Claude 会话共享同一工作目录。**

**启动并行会话：**

```bash
# 每个功能/任务开一个独立 worktree
claude --worktree feat/oauth          # 终端 1
claude --worktree fix/session-timeout # 终端 2
claude --worktree test/ai-research    # 终端 3
```

**Sub-Agent 隔离（Task 工具必须加 isolation）：**

```typescript
// 让 Sub-Agent 在独立 worktree 中工作，防止越权污染主工作区
Task({
  subagent_type: "coder",
  isolation: "worktree", // ← 必须加
  prompt: "只允许修改以下文件：xxx\n...",
});
```

**安全合并流程（合并前必须执行）：**

```bash
# 1. 查看所有活跃 worktree
git worktree list

# 2. 逐文件审查变更
git diff main..worktree-feat-oauth

# 3. 确认无越权修改后合并
git checkout main
git merge worktree-feat-oauth

# 4. 合并后立即清理
git worktree remove .claude/worktrees/feat-oauth
git branch -d worktree-feat-oauth
```

**使用场景决策：**

| 场景                   | 方式                          |
| ---------------------- | ----------------------------- |
| 两个独立功能并行开发   | 两个终端，各自 `--worktree`   |
| 主线 + Sub-Agent 辅助  | `Task(isolation: "worktree")` |
| 实验性改动不影响主分支 | `EnterWorktree` 工具          |
| 多 Agent 需要互相协调  | Agent Teams                   |

**注意事项：**

- 新建 worktree 后需手动安装依赖：`npm install && npx prisma generate`
- worktree 内的 git 操作（checkout、reset）只影响该目录，不影响其他 worktree
- 退出会话时 Claude 会提示是否保留 worktree，有未合并提交时选择保留

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
6. **品牌名称**: 禁止硬编码品牌名（"Genesis"/"Raven"/"DeepDive"等），前端用 `config.brand.*`（from `@/lib/utils/config`），后端用 `APP_CONFIG.brand.*`（from `common/config/app.config`）。Logo 用前端 `<BrandLogo />` 组件或后端 `BrandLogoService`

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

本项目使用**手写 SQL 迁移脚本**，不用 `npx prisma migrate dev` 自动生成。

```bash
1. backend/prisma/schema/models.prisma          # 修改 schema
2. backend/prisma/migrations/YYYYMMDD_描述/migration.sql  # 手写迁移 SQL
3. npx prisma generate                          # 更新 Prisma Client 类型
```

迁移脚本示例（添加 enum 值）：

```sql
-- 正确：直接使用 IF NOT EXISTS，不要 DO $$ EXCEPTION 包装
ALTER TYPE "MyEnum" ADD VALUE IF NOT EXISTS 'NEW_VALUE';
```

**禁止**：

- 使用 `npx prisma migrate dev`（会与手写迁移冲突）
- 使用 `DO $$ BEGIN ... EXCEPTION ... END $$` 包装 ALTER TYPE（EXCEPTION 子句创建 PostgreSQL 子事务，ALTER TYPE ADD VALUE 不能在子事务中执行，导致 `prisma migrate deploy` 必然失败）

---

## 快速参考

| 命令                   | 描述               |
| ---------------------- | ------------------ |
| `npm run dev`          | 启动全栈开发       |
| `npm run dev:frontend` | 启动前端           |
| `npm run dev:backend`  | 启动后端           |
| `npx prisma studio`    | 数据库管理         |
| `npx prisma generate`  | 更新 Prisma Client |

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

**最后更新**: 2026-03-08
**维护者**: Claude Code
**版本**: 2.3
