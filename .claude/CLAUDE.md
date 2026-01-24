# DeepDive Engine - Claude Code 配置

> AI 助手行为配置，指导 Claude Code 在本项目中的决策和行为。

## 项目概述

**DeepDive Engine** - 企业级 AI 深度研究和内容管理平台。

### 核心模块

| 模块          | 描述                       | 路径                                          |
| ------------- | -------------------------- | --------------------------------------------- |
| AI Research   | 深度研究，多步骤规划和报告 | `backend/src/modules/ai-app/research/`        |
| AI Teams      | 多 Agent 协作，辩论碰撞    | `backend/src/modules/ai-app/teams/`           |
| AI Office     | 文档/PPT/设计生成          | `backend/src/modules/ai-app/office/`          |
| AI Ask        | 智能问答，多模型切换       | `backend/src/modules/ai-app/ask/`             |
| AI Coding     | AI 编程助手，代码生成      | `backend/src/modules/ai-app/coding/`          |
| AI Writing    | AI 写作助手，长文本创作    | `backend/src/modules/ai-app/writing/`         |
| AI Social     | AI 社交内容生成            | `backend/src/modules/ai-app/social/`          |
| Library       | 资源库，内容管理           | `backend/src/modules/content/resources/`      |

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
