# DeepDive Engine - Claude Code 配置

> 这是 DeepDive Engine 项目的 AI 助手配置文件，用于指导 Claude Code 的行为和决策。

---

## 项目概述

**DeepDive Engine** 是一个企业级 AI 驱动的深度研究和内容管理平台，核心价值是帮助用户高效获取、整理、分析和生成高质量内容。

### 核心功能模块

| 模块                | 描述                                     | 关键路径                                 |
| ------------------- | ---------------------------------------- | ---------------------------------------- |
| **AI Studio**       | 深度研究工作室，多步骤研究规划和报告生成 | `backend/src/modules/ai/ai-studio/`      |
| **AI Teams**        | AI 团队协作，多 Agent 辩论和观点碰撞     | `backend/src/modules/ai/ai-teams/`       |
| **AI Office**       | AI 办公套件，文档/PPT/设计生成           | `backend/src/modules/ai/ai-office/`      |
| **AI Ask**          | 智能问答，支持多模型切换                 | `backend/src/modules/ai/ai-ask/`         |
| **AI Coding**       | AI 编程助手，代码生成和分析              | `backend/src/modules/ai/ai-coding/`      |
| **AI Simulation**   | 辩论模拟器，红蓝对抗模拟                 | `backend/src/modules/ai/ai-simulation/`  |
| **Library**         | 资源库，统一内容管理                     | `backend/src/modules/content/resources/` |
| **Data Collection** | 数据采集，多源数据爬取                   | `backend/src/modules/data-services/`     |

### 技术栈

```
Frontend: Next.js 14 (App Router) + TypeScript + Zustand + TailwindCSS
Backend:  NestJS 10 + Prisma ORM + PostgreSQL + MongoDB + Neo4j
AI:       LiteLLM (多模型统一接口) + OpenAI/Claude/Grok API
Infra:    Docker + Railway + PM2
```

### AI 架构分层

> 详细文档: [.claude/skills/ai-architecture-layering/SKILL.md](skills/ai-architecture-layering/SKILL.md)

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Engine（核心能力层）                                         │
│  领域无关的通用机制：LLM / Search / Context / Constraint         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  AI Teams（协作机制层）                                          │
│  多 Agent 协作：Mission / Task / Review / Execution              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  预定义 AI Teams → AI Studio / AI Office / AI Simulation        │
│  自定义 AI Teams → 用户配置的个性化团队                          │
└─────────────────────────────────────────────────────────────────┘
```

**架构决策原则**：

- 问自己："如果做一个完全不同的 AI App，这个能力还能复用吗？"
- 能复用 → AI Engine
- 不能复用但是常见场景 → 预定义 AI Teams
- 用户自己配置 → 自定义 AI Teams

---

## 代码规范

### 目录结构约定

```
frontend/
├── hooks/
│   ├── core/           # 基础 hooks (useApi, useStream)
│   ├── domain/         # 业务领域 hooks (useResources, useAdminUsers)
│   ├── features/       # 功能 hooks (useDeepResearch, useExport)
│   └── utils/          # 工具 hooks (useMultiSelect)
├── components/
│   ├── ui/             # 基础 UI 组件
│   ├── layout/         # 布局组件 (AppShell)
│   ├── shared/         # 共享业务组件
│   └── {module}/       # 模块专用组件

backend/
├── src/
│   ├── common/         # 公共服务和工具
│   └── modules/
│       ├── ai/         # AI 相关模块
│       ├── content/    # 内容管理模块
│       ├── core/       # 核心模块 (auth, admin)
│       ├── data-services/ # 数据服务
│       ├── export/     # 统一导出
│       └── integrations/ # 第三方集成
```

### 命名规范

| 类型          | 规范                     | 示例                         |
| ------------- | ------------------------ | ---------------------------- |
| 目录          | kebab-case               | `ai-office`, `deep-research` |
| React 组件    | PascalCase               | `ResourceCard.tsx`           |
| Hooks         | camelCase + use 前缀     | `useResources.ts`            |
| NestJS 服务   | kebab-case + .service    | `ai-core.service.ts`         |
| NestJS 控制器 | kebab-case + .controller | `resources.controller.ts`    |
| DTO           | PascalCase + Dto         | `CreateResourceDto.ts`       |
| 接口          | PascalCase + I 前缀      | `ICapability`                |

### 代码风格

1. **TypeScript 优先**: 所有代码必须使用 TypeScript，禁止 `any` 类型
2. **函数式组件**: React 组件使用函数式组件 + Hooks
3. **单一职责**: 每个模块/组件只做一件事
4. **错误处理**: 所有异步操作必须有 try-catch
5. **日志记录**: 使用 NestJS Logger，禁止 console.log

### 导入顺序

```typescript
// 1. 外部库
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// 2. 内部模块 (@/ 别名)
import { useApiGet } from "@/hooks/core";
import { Button } from "@/components/ui";

// 3. 相对导入
import { formatDate } from "./utils";
import type { Resource } from "./types";
```

---

## 开发模式

### 新增功能流程

1. **需求分析**: 阅读相关 PRD (`docs/prd/`)
2. **架构设计**: 确定模块划分和数据流
3. **后端优先**: 先实现 API，再做前端
4. **单元测试**: 关键逻辑需要测试覆盖
5. **文档更新**: 更新相关文档

### 前端开发模式

```typescript
// 使用 domain hooks 封装 API 调用
const { resources, loading, error, refresh } = useResources({
  filter: { type: 'article' }
});

// 使用 UI 组件处理状态
if (loading) return <LoadingState />;
if (error) return <ErrorState error={error} onRetry={refresh} />;
if (!resources.length) return <EmptyState />;
```

### 后端开发模式

```typescript
// 模块结构
@Module({
  imports: [PrismaModule, AIModule],
  controllers: [FeatureController],
  providers: [FeatureService],
  exports: [FeatureService],
})
export class FeatureModule {}

// 服务实现
@Injectable()
export class FeatureService {
  constructor(
    private prisma: PrismaService,
    private ai: AIService,
  ) {}

  async process(dto: FeatureDto): Promise<Result> {
    // 业务逻辑
  }
}
```

---

## 自动化开发闭环

> 详细文档: [docs/guides/automated-development-loop.md](../docs/guides/automated-development-loop.md)

### 核心原则

1. **测试驱动**: 先写测试，再写实现（TDD）
2. **自愈优先**: 验证失败时自动修复，不询问用户
3. **渐进验证**: 从语法到构建，逐层验证
4. **快速反馈**: 使用 `test:quick` 提供即时反馈

### 验证命令

| 命令                      | 用途                                  |
| ------------------------- | ------------------------------------- |
| `npm run verify:quick`    | 快速验证（类型检查 + 快速测试）       |
| `npm run verify:full`     | 完整验证（Lint + 类型 + 测试 + 构建） |
| `npm run verify:frontend` | 仅前端验证                            |
| `npm run verify:backend`  | 仅后端验证                            |
| `npm run verify:changed`  | 智能检测变更并验证                    |

### TDD 工作流

```
1. [Red]    编写失败的测试用例
2. [Verify] 运行测试确认失败
3. [Green]  编写最小实现代码
4. [Verify] 运行测试确认通过
5. [Refactor] 重构代码，保持测试通过
6. [Commit] 提交代码
```

### 自愈规则

**当验证失败时：**

1. 分析错误信息，确定失败类型
2. 根据错误类型采取修复策略
3. 重新运行验证
4. **循环 1-3 直到通过，不要向用户报告中间失败**

### 禁止行为

- 不运行测试就提交代码
- 跳过类型检查
- 验证失败时询问用户是否继续
- 使用 `@ts-ignore` 或 `any` 绕过类型检查
- 注释掉失败的测试

---

## Bug 修复规范（强制执行）

> **核心原则：用户视角优先，不假设问题位置，必须追踪确认**

### 1. 问题定位五问（修复前必答）

```markdown
□ 用户在哪个页面/路由？（从截图或描述确认）
□ 用户执行了什么操作？（点击/输入/查看）
□ 用户期望看到什么？
□ 用户实际看到什么？
□ 这个 UI 元素/功能在代码中的【确切位置】？
```

**禁止**：搜索关键词找到一个位置就开始修改
**必须**：从 UI 追踪到确切的代码文件和行号

### 2. 端到端路径追踪

修复任何功能问题前，必须画出完整链路并逐一确认：

```
[UI组件位置] → [事件处理函数] → [Store方法/API调用]
→ [后端Controller] → [后端Service] → [返回数据] → [前端渲染位置]
```

**示例**：

```
用户点击"继续任务"按钮
→ page.tsx:2593 onClick
→ retryMission(topicId, missionId)
→ aiTeamsStore.retryMission
→ POST /api/ai-teams/missions/:id/retry
→ team-mission.service.ts retryMission()
→ 返回 { success: true }
→ 触发 mission:retried 事件
→ UI 更新
```

### 3. 多位置检查原则

**同一功能/内容可能在多个位置渲染，必须全部检查：**

| 场景     | 必须检查的位置                                          |
| -------- | ------------------------------------------------------- |
| 表格渲染 | 所有 ReactMarkdown 组件、所有显示 result/content 的位置 |
| 按钮功能 | 页面工具栏、侧边栏、弹窗中的同名按钮                    |
| 状态显示 | 列表项、详情页、弹窗、Canvas 中的状态展示               |

```bash
# 搜索示例：找所有可能渲染任务结果的位置
grep -r "task\.result" --include="*.tsx"
grep -r "ReactMarkdown" --include="*.tsx"
```

### 4. 修复验证走查

修改代码后，必须在脑中模拟用户操作路径：

```markdown
1. 用户从哪里开始？（哪个页面）
2. 执行什么操作？（点击哪个按钮）
3. 这个操作触发哪段代码？（确认是我修改的代码）
4. 代码执行后用户会看到什么？（确认符合预期）
```

**如果无法确认修改的代码在用户操作路径上，不要提交。**

### 5. 常见错误模式（自查）

| 错误模式                     | 正确做法                   |
| ---------------------------- | -------------------------- |
| 搜索关键词，修改第一个找到的 | 从 UI 追踪到确切位置       |
| 只修前端或只修后端           | 追踪完整链路，确认两端一致 |
| 修改后直接提交               | 走查用户操作路径验证       |
| 假设问题原因                 | 先读代码确认实际逻辑       |
| 只改一个位置                 | 搜索所有相关位置           |

### 6. 截图驱动定位流程

用户提供截图时：

```
1. 识别截图中的 UI 特征（按钮文字、布局、颜色、上下文）
2. 确定是哪个组件（不是猜，是根据特征定位）
3. 找到组件文件和具体代码行
4. 追踪事件处理函数
5. 追踪完整调用链
6. 然后才开始修复
```

---

## 质量标准

### 代码审查检查项

- [ ] TypeScript 类型正确，无 any
- [ ] 错误处理完整，用户友好的错误信息
- [ ] 无 console.log，使用 Logger
- [ ] 组件拆分合理，无超大组件
- [ ] Hooks 依赖数组正确
- [ ] API 响应格式统一
- [ ] 无硬编码的魔法数字/字符串
- [ ] 敏感信息使用环境变量

### 性能标准

- 页面首屏加载 < 2s
- API 响应时间 < 500ms (非 AI 调用)
- 组件渲染无不必要的 re-render
- 大列表使用虚拟滚动

### 安全标准

- 所有 API 需要认证
- 用户输入必须验证
- SQL 注入防护 (Prisma ORM)
- XSS 防护 (React 默认转义)
- CORS 配置正确

---

## AI 开发指南

### LLM 调用规范

```typescript
// 使用 AIOrchestrationService 统一调用
const response = await this.aiService.chat({
  model: "gpt-4o", // 或 claude-3-5-sonnet
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ],
  temperature: 0.7,
  max_tokens: 4096,
});
```

### Agent 开发模式

```typescript
// 继承 BaseAgent
export class ResearcherAgent extends BaseAgent {
  readonly name = "researcher";
  readonly description = "深度研究 Agent";

  protected async executeCore(input: AgentInput): Promise<AgentOutput> {
    // 1. 解析输入
    // 2. 调用工具
    // 3. 整合结果
  }
}
```

### 提示词管理

- 系统提示词放在 `prompts/` 目录
- 使用模板变量 `{{variable}}`
- 中文提示词，保持专业术语准确

---

## 常见任务模式

### 1. 添加新 API 端点

```bash
# 1. 创建 DTO
backend/src/modules/{module}/dto/create-feature.dto.ts

# 2. 添加服务方法
backend/src/modules/{module}/{module}.service.ts

# 3. 添加控制器路由
backend/src/modules/{module}/{module}.controller.ts

# 4. 创建前端 hook
frontend/hooks/domain/useFeature.ts
```

### 2. 添加新页面

```bash
# 1. 创建页面目录
frontend/app/{route}/page.tsx

# 2. 创建页面组件
frontend/components/{module}/FeaturePage.tsx

# 3. 使用 AppShell 布局
<AppShell title="页面标题" breadcrumbs={[...]}>
  <PageContent />
</AppShell>
```

### 3. 数据库变更

```bash
# 1. 修改 schema
backend/prisma/schema.prisma

# 2. 创建迁移
npx prisma migrate dev --name add_feature_table

# 3. 生成客户端
npx prisma generate
```

---

## 已知问题和注意事项

### 技术债务

- [ ] 部分组件仍使用旧的 import 路径
- [ ] 某些 API 响应格式未统一
- [ ] 部分服务逻辑分散，需要合并

---

## 团队协作

### Git 工作流

```bash
# 功能分支
git checkout -b feat/feature-name

# 提交格式
git commit -m "feat(module): 描述"
# 类型: feat, fix, refactor, docs, style, test, chore

# 合并到 main
git checkout main && git merge feat/feature-name
```

### 代码评审

- 每次 PR 必须有代码评审
- 关注安全、性能、可维护性
- 及时回复评审意见

---

## 调试技巧

### 后端调试

```bash
# 启动开发模式
cd backend && npm run start:dev

# 查看日志
# NestJS Logger 自动输出到控制台
```

### 前端调试

```bash
# 启动开发模式
cd frontend && npm run dev

# React DevTools + Zustand DevTools
```

### 数据库调试

```bash
# Prisma Studio
npx prisma studio

# 查询日志
# 在 schema.prisma 中添加 log: ['query']
```

---

## 环境变量

```env
# 必需
DATABASE_URL=postgresql://...
MONGODB_URI=mongodb://...
NEO4J_URI=bolt://...

# AI 服务
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
XAI_API_KEY=xai-...

# 认证
NEXTAUTH_SECRET=...
GOOGLE_CLIENT_ID=...

# 可选
REDIS_URL=redis://...
```

---

## 快速参考

| 命令                     | 描述               |
| ------------------------ | ------------------ |
| `npm run dev`            | 启动全栈开发服务   |
| `npm run dev:frontend`   | 启动前端开发服务   |
| `npm run dev:backend`    | 启动后端开发服务   |
| `npm run verify:quick`   | 快速验证（推荐）   |
| `npm run verify:changed` | 智能变更验证       |
| `npm run verify:full`    | 完整验证           |
| `npm run type-check`     | 类型检查           |
| `npm run test:quick`     | 快速测试           |
| `npx prisma studio`      | 打开数据库管理界面 |
| `npx prisma migrate dev` | 运行数据库迁移     |

---

## 持续改进

本配置文件应该随项目发展持续更新：

1. **新模块添加时**: 更新模块列表和关键路径
2. **架构变更时**: 更新目录结构约定
3. **发现问题时**: 记录到"已知问题"部分
4. **解决问题时**: 从"已知问题"中移除并记录解决方案
5. **新规范确立时**: 添加到相应规范部分

---

**最后更新**: 2025-12-28
**维护者**: Claude Code
**版本**: 1.1
