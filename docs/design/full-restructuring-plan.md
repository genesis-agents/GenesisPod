# DeepDive Engine 全面目录重构方案

> 版本: 1.0 | 创建日期: 2025-12-28 | 状态: 待执行

---

## 一、项目现状分析

### 1.1 后端目录现状

```
backend/src/
├── common/                      # ✅ 良好，需增强
│   ├── ai-orchestration/        # ✅ AI 编排服务
│   ├── streaming/               # ✅ 流式响应
│   ├── deduplication/           # ✅ 去重服务
│   ├── capabilities/            # ✅ 能力系统
│   ├── content-processing/      # ✅ 内容处理
│   ├── filters/                 # ✅ 异常过滤器
│   ├── guards/                  # ✅ 认证守卫
│   ├── interceptors/            # ✅ 拦截器
│   ├── prisma/                  # ✅ Prisma 服务
│   ├── mongodb/                 # ✅ MongoDB 服务
│   ├── neo4j/                   # ✅ Neo4j 服务
│   ├── graph/                   # ✅ 图服务
│   ├── rawdata/                 # ✅ 原始数据
│   ├── config/                  # ✅ 配置
│   └── utils/                   # ✅ 工具函数
│   # ❌ 缺少: dtos/, errors/, interfaces/, decorators/
│
├── modules/
│   ├── ai/                      # ⚠️ 需要统一内部结构
│   │   ├── ai-agents/           # 有 core, dto, implementations, tools
│   │   ├── ai-ask/              # 有 adapters
│   │   ├── ai-coding/           # 有 constants, dto, prompts, services
│   │   ├── ai-core/             # ⚠️ 应该是所有 AI 模块的核心，需增强
│   │   ├── ai-image/            # 结构良好
│   │   ├── ai-office/           # 有 agents, common, core, docs, prompts
│   │   ├── ai-simulation/       # 扁平结构
│   │   ├── ai-studio/           # 有 deep-research, dto, services
│   │   ├── ai-teams/            # 有 agents, dto, services
│   │   └── rag/                 # 有 dto, interfaces, services
│   │
│   ├── content/                 # ✅ 结构良好
│   │   ├── collections/
│   │   ├── comments/
│   │   ├── explore/
│   │   ├── feed/
│   │   ├── notes/
│   │   ├── reports/
│   │   ├── resources/
│   │   └── workspace/
│   │
│   ├── core/                    # ✅ 结构良好
│   │   ├── admin/
│   │   ├── auth/
│   │   ├── email/
│   │   ├── feedback/
│   │   ├── settings/
│   │   └── storage/
│   │
│   ├── credits/                 # ✅ 结构良好
│   ├── data-services/           # ⚠️ 需要整理
│   ├── export/                  # ✅ 结构良好
│   └── integrations/            # ✅ 结构良好
```

### 1.2 前端目录现状

```
frontend/
├── components/
│   ├── admin/                   # ✅ 管理后台组件
│   ├── ai-ask/                  # ✅ AI 问答组件
│   ├── ai-coding/               # ✅ AI 编程组件
│   ├── ai-image/                # ✅ AI 图像组件
│   ├── ai-office/               # ✅ AI 办公组件（结构良好）
│   ├── ai-simulation/           # ✅ AI 模拟组件
│   ├── ai-studio/               # ✅ AI 工作室组件
│   ├── ai-teams/                # ✅ AI 团队组件
│   ├── common/                  # ⚠️ 与 shared 重复
│   ├── credits/                 # ✅ 积分组件
│   ├── explore/                 # ⚠️ 内含 hooks/，应移出
│   ├── features/                # ✅ 功能组件
│   ├── google-drive/            # ⚠️ 应移入 integrations/
│   ├── layout/                  # ✅ 布局组件
│   ├── library/                 # ✅ 资源库组件
│   ├── notion/                  # ⚠️ 应移入 integrations/
│   ├── shared/                  # ⚠️ 与 common 重复
│   └── ui/                      # ✅ UI 基础组件
│
├── hooks/
│   ├── core/                    # ✅ 核心 hooks
│   ├── domain/                  # ✅ 领域 hooks
│   ├── features/                # ✅ 功能 hooks
│   └── utils/                   # ✅ 工具 hooks
```

### 1.3 问题汇总

| 问题                                 | 严重程度 | 影响范围            |
| ------------------------------------ | -------- | ------------------- |
| 前端 `common/` 和 `shared/` 重复     | 🔴 高    | 组件复用混乱        |
| 后端 `ai-core/` 未充分利用           | 🔴 高    | AI 模块代码重复     |
| 后端缺少 `common/dtos/`              | 🟠 中    | DTO 分散            |
| 后端缺少 `common/errors/`            | 🟠 中    | 错误处理不统一      |
| 前端 `explore/hooks/` 位置错误       | 🟡 低    | 违反目录约定        |
| 前端 `google-drive/`, `notion/` 位置 | 🟡 低    | 应归入 integrations |
| AI 模块内部结构不统一                | 🟠 中    | 维护困难            |

---

## 二、目标架构设计

### 2.1 后端目标架构

```
backend/src/
├── common/                          # 🔑 项目级公共层
│   ├── ai-orchestration/            # ✅ 保持
│   ├── streaming/                   # ✅ 保持
│   ├── deduplication/               # ✅ 保持
│   ├── capabilities/                # ✅ 保持
│   ├── content-processing/          # ✅ 保持
│   │
│   ├── dtos/                        # 🆕 新增：公共 DTO
│   │   ├── base/
│   │   │   ├── pagination.dto.ts
│   │   │   ├── response.dto.ts
│   │   │   └── index.ts
│   │   ├── ai/
│   │   │   ├── chat.dto.ts
│   │   │   ├── stream.dto.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── errors/                      # 🆕 新增：统一错误
│   │   ├── error.types.ts
│   │   ├── error.factory.ts
│   │   ├── error.codes.ts
│   │   └── index.ts
│   │
│   ├── interfaces/                  # 🆕 新增：公共接口
│   │   ├── crud.interface.ts
│   │   ├── pagination.interface.ts
│   │   └── index.ts
│   │
│   ├── decorators/                  # 🆕 新增：公共装饰器
│   │   ├── api-response.decorator.ts
│   │   ├── current-user.decorator.ts
│   │   └── index.ts
│   │
│   ├── filters/                     # ✅ 保持
│   ├── guards/                      # ✅ 保持
│   ├── interceptors/                # ✅ 保持
│   ├── prisma/                      # ✅ 保持
│   ├── mongodb/                     # ✅ 保持
│   ├── neo4j/                       # ✅ 保持
│   ├── graph/                       # ✅ 保持
│   ├── rawdata/                     # ✅ 保持
│   ├── config/                      # ✅ 保持
│   └── utils/                       # ✅ 保持
│
├── modules/
│   ├── ai/                          # AI 模块群
│   │   ├── ai-core/                 # 🔑 AI 核心（所有 AI 模块的基础）
│   │   │   ├── ai-core.module.ts
│   │   │   ├── services/
│   │   │   │   ├── base-ai-chat.service.ts      # 🆕 聊天基类
│   │   │   │   ├── base-ai-stream.service.ts    # 🆕 流式基类
│   │   │   │   ├── ai-chat.service.ts           # ✅ 现有
│   │   │   │   ├── ai-core.service.ts           # ✅ 现有
│   │   │   │   └── index.ts
│   │   │   ├── controllers/
│   │   │   │   ├── base-stream.controller.ts    # 🆕 流式控制器基类
│   │   │   │   └── ai-core.controller.ts        # ✅ 现有
│   │   │   ├── prompts/                         # 🆕 统一提示词库
│   │   │   │   ├── system/
│   │   │   │   │   ├── researcher.prompt.ts
│   │   │   │   │   ├── writer.prompt.ts
│   │   │   │   │   ├── analyst.prompt.ts
│   │   │   │   │   └── index.ts
│   │   │   │   ├── templates/
│   │   │   │   │   ├── prompt.template.ts
│   │   │   │   │   └── prompt.builder.ts
│   │   │   │   └── index.ts
│   │   │   ├── agents/                          # 🆕 Agent 框架
│   │   │   │   ├── base-agent.ts
│   │   │   │   ├── agent-orchestrator.ts
│   │   │   │   ├── agent-registry.ts
│   │   │   │   └── index.ts
│   │   │   ├── types/
│   │   │   │   ├── chat.types.ts
│   │   │   │   ├── stream.types.ts
│   │   │   │   ├── agent.types.ts
│   │   │   │   └── index.ts
│   │   │   ├── exceptions/                      # ✅ 现有
│   │   │   └── index.ts
│   │   │
│   │   ├── ai-agents/               # 🔀 考虑合并到 ai-core/agents
│   │   ├── ai-ask/                  # ✅ 保持，继承 ai-core
│   │   ├── ai-coding/               # ✅ 保持，继承 ai-core
│   │   ├── ai-image/                # ✅ 保持
│   │   ├── ai-office/               # ✅ 保持
│   │   ├── ai-simulation/           # ✅ 保持
│   │   ├── ai-studio/               # ✅ 保持
│   │   ├── ai-teams/                # ✅ 保持
│   │   └── rag/                     # ✅ 保持
│   │
│   ├── content/                     # ✅ 保持现有结构
│   ├── core/                        # ✅ 保持现有结构
│   ├── credits/                     # ✅ 保持现有结构
│   ├── data-services/               # ✅ 保持现有结构
│   ├── export/                      # ✅ 保持现有结构
│   └── integrations/                # ✅ 保持现有结构
```

### 2.2 前端目标架构

```
frontend/
├── components/
│   ├── ui/                          # 🔑 基础 UI 组件（Atomic）
│   │   ├── primitives/              # 🆕 原语组件
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   └── index.ts
│   │   ├── feedback/                # 🆕 反馈组件
│   │   │   ├── Modal.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── Alert.tsx
│   │   │   └── index.ts
│   │   ├── data-display/            # 🆕 数据展示
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Avatar.tsx
│   │   │   └── index.ts
│   │   ├── data-entry/              # 🆕 数据录入
│   │   │   ├── FormField.tsx
│   │   │   ├── SearchInput.tsx
│   │   │   └── index.ts
│   │   ├── navigation/              # 🆕 导航
│   │   │   ├── Tabs.tsx
│   │   │   ├── Pagination.tsx
│   │   │   └── index.ts
│   │   ├── states/                  # 🆕 状态组件
│   │   │   ├── LoadingState.tsx
│   │   │   ├── ErrorState.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── composed/                    # 🆕 组合组件（Molecules）
│   │   ├── dialogs/
│   │   │   ├── BaseDialog.tsx
│   │   │   ├── FormDialog.tsx
│   │   │   ├── ConfirmDialog.tsx
│   │   │   └── index.ts
│   │   ├── cards/
│   │   │   ├── BaseCard.tsx
│   │   │   ├── ResourceCard.tsx
│   │   │   └── index.ts
│   │   ├── forms/
│   │   │   ├── BaseForm.tsx
│   │   │   ├── SearchForm.tsx
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── business/                    # 🆕 业务组件（Organisms）
│   │   ├── import-export/           # 🔀 从 shared 移入
│   │   │   ├── ImportDialog.tsx
│   │   │   ├── ExportDialog.tsx
│   │   │   ├── ImportSelector.tsx
│   │   │   └── index.ts
│   │   ├── knowledge-base/          # 🆕 知识库相关
│   │   │   ├── KnowledgeBaseSelector.tsx
│   │   │   ├── AddToKnowledgeBaseDialog.tsx
│   │   │   └── index.ts
│   │   ├── resource/                # 🆕 资源相关
│   │   │   ├── ResourceGrid.tsx
│   │   │   ├── ResourceDetail.tsx
│   │   │   └── index.ts
│   │   ├── ai-organize/             # 🔀 从 shared 移入
│   │   │   ├── AiOrganizeButton.tsx
│   │   │   ├── AiOrganizePanel.tsx
│   │   │   └── index.ts
│   │   ├── sync/                    # 🔀 从 shared 移入
│   │   │   ├── SyncControls.tsx
│   │   │   ├── SyncStatusIndicator.tsx
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── features/                    # ✅ 保持：功能模块组件
│   │   ├── ai-ask/                  # 🔀 从根目录移入
│   │   ├── ai-coding/               # 🔀 从根目录移入
│   │   ├── ai-image/                # 🔀 从根目录移入
│   │   ├── ai-office/               # 🔀 从根目录移入
│   │   ├── ai-simulation/           # 🔀 从根目录移入
│   │   ├── ai-studio/               # 🔀 从根目录移入
│   │   ├── ai-teams/                # 🔀 从根目录移入
│   │   ├── explore/                 # 🔀 从根目录移入
│   │   ├── library/                 # 🔀 从根目录移入
│   │   ├── admin/                   # 🔀 从根目录移入
│   │   └── credits/                 # 🔀 从根目录移入
│   │
│   ├── integrations/                # 🆕 第三方集成组件
│   │   ├── google-drive/            # 🔀 从根目录移入
│   │   ├── notion/                  # 🔀 从根目录移入
│   │   └── index.ts
│   │
│   ├── layout/                      # ✅ 保持
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── index.ts
│   │
│   ├── common/                      # 🔀 合并 shared 到这里，然后逐步迁移
│   │   └── ... (临时保留，逐步清空)
│   │
│   └── shared/                      # ❌ 废弃，合并到 common，最终删除
│
├── hooks/                           # ✅ 保持现有结构
│   ├── core/                        # 基础 hooks
│   ├── domain/                      # 领域 hooks
│   ├── features/                    # 功能 hooks
│   └── utils/                       # 工具 hooks
│   # 🆕 从 explore/hooks 移入
│
├── types/                           # 🆕 统一类型定义
│   ├── components/
│   ├── domain/
│   └── index.ts
│
└── lib/                             # ✅ 保持
    ├── api/
    ├── utils/
    └── constants/
```

---

## 三、命名约定总结

### 3.1 目录命名

| 层级       | 命名规则                          | 示例                           |
| ---------- | --------------------------------- | ------------------------------ |
| 项目级公共 | `common/`                         | `backend/src/common/`          |
| 模块级公共 | `{domain}-core/`                  | `ai-core/`, `data-core/`       |
| 子模块公共 | `{module}-common/` 或直接放入核心 | `office-common/`               |
| 功能目录   | `kebab-case`                      | `ai-office/`, `deep-research/` |

### 3.2 文件命名

| 类型   | 后端                       | 前端                      |
| ------ | -------------------------- | ------------------------- |
| 模块   | `{name}.module.ts`         | -                         |
| 服务   | `{name}.service.ts`        | -                         |
| 控制器 | `{name}.controller.ts`     | -                         |
| 组件   | -                          | `{Name}.tsx` (PascalCase) |
| Hook   | -                          | `use{Name}.ts`            |
| DTO    | `{action}-{entity}.dto.ts` | -                         |
| 类型   | `{name}.types.ts`          | `{name}.types.ts`         |
| 接口   | `{name}.interface.ts`      | -                         |
| 工具   | `{name}.utils.ts`          | `{name}.utils.ts`         |

### 3.3 禁止使用

- ❌ `shared/` - 统一用 `common/` 或 `*-core/`
- ❌ 组件目录内放 hooks（如 `explore/hooks/`）
- ❌ 混合命名风格（如 `myComponent.tsx` vs `MyComponent.tsx`）

---

## 四、执行计划

### 4.1 分阶段执行

```
┌────────────────────────────────────────────────────────────────┐
│                     重构执行路线图                              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Phase 1: 后端基础增强 (Day 1-2)                               │
│  ─────────────────────────────────                             │
│  • 创建 common/dtos/                                           │
│  • 创建 common/errors/                                         │
│  • 创建 common/interfaces/                                     │
│  • 创建 common/decorators/                                     │
│                                                                │
│  Phase 2: AI Core 增强 (Day 3-5)                               │
│  ─────────────────────────────────                             │
│  • 创建 ai-core/services/ 基类                                 │
│  • 创建 ai-core/prompts/ 提示词库                              │
│  • 创建 ai-core/agents/ Agent 框架                             │
│  • 创建 ai-core/types/ 类型定义                                │
│                                                                │
│  Phase 3: 前端 UI 层重组 (Day 6-8)                             │
│  ─────────────────────────────────                             │
│  • 创建 ui/ 子目录结构                                         │
│  • 创建 composed/ 组合组件目录                                 │
│  • 合并 shared/ 到 common/                                     │
│                                                                │
│  Phase 4: 前端 Features 重组 (Day 9-11)                        │
│  ─────────────────────────────────                             │
│  • 移动 ai-* 到 features/                                      │
│  • 移动 google-drive/, notion/ 到 integrations/                │
│  • 创建 business/ 业务组件目录                                 │
│                                                                │
│  Phase 5: 清理与验证 (Day 12-13)                               │
│  ─────────────────────────────────                             │
│  • 删除废弃目录                                                │
│  • 更新所有导入路径                                            │
│  • 全面验证                                                    │
│  • 更新文档                                                    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 Phase 1: 后端基础增强 (Day 1-2)

#### 4.2.1 创建 common/dtos/

```bash
# 创建目录
mkdir -p backend/src/common/dtos/{base,ai}

# 创建文件 (详细内容见附录)
touch backend/src/common/dtos/base/pagination.dto.ts
touch backend/src/common/dtos/base/response.dto.ts
touch backend/src/common/dtos/ai/chat.dto.ts
touch backend/src/common/dtos/index.ts

# 验证
cd backend && npm run type-check
```

#### 4.2.2 创建 common/errors/

```bash
mkdir -p backend/src/common/errors

touch backend/src/common/errors/error.types.ts
touch backend/src/common/errors/error.factory.ts
touch backend/src/common/errors/error.codes.ts
touch backend/src/common/errors/index.ts

cd backend && npm run type-check
```

#### 4.2.3 创建 common/interfaces/

```bash
mkdir -p backend/src/common/interfaces

touch backend/src/common/interfaces/crud.interface.ts
touch backend/src/common/interfaces/pagination.interface.ts
touch backend/src/common/interfaces/index.ts

cd backend && npm run type-check
```

#### 4.2.4 创建 common/decorators/

```bash
mkdir -p backend/src/common/decorators

touch backend/src/common/decorators/api-response.decorator.ts
touch backend/src/common/decorators/current-user.decorator.ts
touch backend/src/common/decorators/index.ts

cd backend && npm run type-check
```

#### 4.2.5 Phase 1 验证与提交

```bash
cd backend && npm run type-check && npm run test:quick

git add backend/src/common/{dtos,errors,interfaces,decorators}
git commit -m "feat(common): add unified DTOs, errors, interfaces, decorators"
```

---

### 4.3 Phase 2: AI Core 增强 (Day 3-5)

#### 4.3.1 创建目录结构

```bash
mkdir -p backend/src/modules/ai/ai-core/{services,controllers,prompts,agents,types}
mkdir -p backend/src/modules/ai/ai-core/prompts/{system,templates}
```

#### 4.3.2 创建服务基类

```bash
# 创建基类文件
touch backend/src/modules/ai/ai-core/services/base-ai-chat.service.ts
touch backend/src/modules/ai/ai-core/services/base-ai-stream.service.ts
touch backend/src/modules/ai/ai-core/services/index.ts

# 详细实现见附录
```

#### 4.3.3 创建提示词库

```bash
touch backend/src/modules/ai/ai-core/prompts/templates/prompt.template.ts
touch backend/src/modules/ai/ai-core/prompts/templates/prompt.builder.ts
touch backend/src/modules/ai/ai-core/prompts/system/researcher.prompt.ts
touch backend/src/modules/ai/ai-core/prompts/system/index.ts
touch backend/src/modules/ai/ai-core/prompts/index.ts
```

#### 4.3.4 创建 Agent 框架

```bash
touch backend/src/modules/ai/ai-core/agents/base-agent.ts
touch backend/src/modules/ai/ai-core/agents/agent-orchestrator.ts
touch backend/src/modules/ai/ai-core/agents/index.ts
```

#### 4.3.5 Phase 2 验证与提交

```bash
cd backend && npm run type-check && npm run test:quick

git add backend/src/modules/ai/ai-core/
git commit -m "feat(ai-core): add base services, prompts library, agent framework"
```

---

### 4.4 Phase 3: 前端 UI 层重组 (Day 6-8)

#### 4.4.1 创建 UI 子目录

```bash
mkdir -p frontend/components/ui/{primitives,feedback,data-display,data-entry,navigation,states}
```

#### 4.4.2 创建 composed 目录

```bash
mkdir -p frontend/components/composed/{dialogs,cards,forms}
```

#### 4.4.3 合并 shared 到 common（临时）

```bash
# 创建 re-export 保持兼容
# frontend/components/shared/index.ts
# 逐步从 shared 移动到正确位置，shared 保持 re-export
```

#### 4.4.4 迁移状态组件

```bash
# 移动 ErrorBoundary, ChunkErrorHandler, SignInPrompt 到 ui/states/
git mv frontend/components/shared/ErrorBoundary.tsx frontend/components/ui/states/
git mv frontend/components/shared/ChunkErrorHandler.tsx frontend/components/ui/states/
git mv frontend/components/shared/SignInPrompt.tsx frontend/components/ui/states/

# 更新 shared/index.ts re-export
```

#### 4.4.5 Phase 3 验证与提交

```bash
cd frontend && npm run type-check && npm run build

git add frontend/components/
git commit -m "refactor(frontend): reorganize UI and composed components"
```

---

### 4.5 Phase 4: 前端 Features 重组 (Day 9-11)

#### 4.5.1 创建目录结构

```bash
mkdir -p frontend/components/features
mkdir -p frontend/components/integrations
mkdir -p frontend/components/business/{import-export,knowledge-base,resource,ai-organize,sync}
```

#### 4.5.2 移动 AI 组件到 features

```bash
# 保持原目录，创建 re-export
# 或直接移动（取决于影响范围）

# 示例：逐步迁移
git mv frontend/components/ai-ask frontend/components/features/ai-ask
# 在原位置创建 re-export 保持兼容
```

#### 4.5.3 移动集成组件

```bash
git mv frontend/components/google-drive frontend/components/integrations/google-drive
git mv frontend/components/notion frontend/components/integrations/notion
```

#### 4.5.4 移动业务组件

```bash
# 从 shared 移动到 business
git mv frontend/components/shared/ImportSelector.tsx frontend/components/business/import-export/
git mv frontend/components/shared/AddToKnowledgeBaseDialog.tsx frontend/components/business/knowledge-base/
git mv frontend/components/shared/AiOrganizeButton.tsx frontend/components/business/ai-organize/
git mv frontend/components/shared/AiOrganizePanel.tsx frontend/components/business/ai-organize/
git mv frontend/components/shared/SyncControls.tsx frontend/components/business/sync/
git mv frontend/components/shared/SyncStatusIndicator.tsx frontend/components/business/sync/
```

#### 4.5.5 移动 explore/hooks

```bash
git mv frontend/components/explore/hooks/* frontend/hooks/features/explore/
```

#### 4.5.6 Phase 4 验证与提交

```bash
cd frontend && npm run type-check && npm run build

git add frontend/
git commit -m "refactor(frontend): reorganize features, integrations, business components"
```

---

### 4.6 Phase 5: 清理与验证 (Day 12-13)

#### 4.6.1 清理废弃目录

```bash
# 确认所有旧路径的 re-export 可以删除
grep -r "from.*shared" frontend/ --include="*.ts" --include="*.tsx"

# 如果没有直接引用，删除 shared 目录
rm -rf frontend/components/shared
```

#### 4.6.2 更新文档

- [ ] 更新 `.claude/CLAUDE.md` 目录结构说明
- [ ] 更新 `component-reuse-improvement-plan.md` 标记完成
- [ ] 创建 `ARCHITECTURE.md` 架构说明

#### 4.6.3 全面验证

```bash
# 后端
cd backend && npm run type-check && npm run test && npm run build

# 前端
cd frontend && npm run type-check && npm run test && npm run build

# 全栈
npm run verify:full
```

#### 4.6.4 最终提交

```bash
git add .
git commit -m "chore: complete directory restructuring

- Backend: enhanced common/ with dtos, errors, interfaces, decorators
- Backend: enhanced ai-core/ with base services, prompts, agents
- Frontend: reorganized into ui/, composed/, business/, features/, integrations/
- Frontend: merged shared/ into appropriate directories
- Updated documentation"
```

---

## 五、文件模板附录

### 5.1 common/dtos/base/pagination.dto.ts

```typescript
import { IsOptional, IsInt, Min, Max, IsString, IsEnum } from "class-validator";
import { Transform } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value))
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ["asc", "desc"], default: "desc" })
  @IsOptional()
  @IsEnum(["asc", "desc"])
  sortOrder?: "asc" | "desc" = "desc";
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export class PaginatedResponseDto<T> {
  data: T[];
  meta: PaginationMeta;

  static create<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResponseDto<T> {
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }
}
```

### 5.2 common/errors/error.types.ts

```typescript
export enum ErrorCode {
  // 通用错误 (1xxx)
  UNKNOWN = 1000,
  VALIDATION = 1001,
  NOT_FOUND = 1002,
  UNAUTHORIZED = 1003,
  FORBIDDEN = 1004,
  CONFLICT = 1005,
  RATE_LIMITED = 1006,

  // AI 错误 (2xxx)
  AI_SERVICE_UNAVAILABLE = 2000,
  AI_RATE_LIMIT = 2001,
  AI_TIMEOUT = 2002,
  AI_INVALID_RESPONSE = 2003,
  AI_MODEL_NOT_FOUND = 2004,
  AI_INSUFFICIENT_CREDITS = 2005,
  AI_CONTENT_FILTERED = 2006,

  // 数据错误 (3xxx)
  DATA_DUPLICATE = 3000,
  DATA_INTEGRITY = 3001,
  DATA_IMPORT_FAILED = 3002,
  DATA_EXPORT_FAILED = 3003,

  // 外部服务错误 (4xxx)
  EXTERNAL_SERVICE = 4000,
  GOOGLE_DRIVE_ERROR = 4001,
  NOTION_ERROR = 4002,
  DATABASE_ERROR = 4003,
}

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: Error;
}

export class AppException extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "AppException";
  }

  toJSON(): AppError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}
```

### 5.3 ai-core/prompts/templates/prompt.template.ts

```typescript
export interface PromptTemplateConfig {
  id: string;
  version: string;
  name: string;
  description?: string;
  template: string;
  variables: string[];
  modelAdaptations?: Record<string, ModelAdaptation>;
}

export interface ModelAdaptation {
  systemSuffix?: string;
  temperature?: number;
  maxTokens?: number;
}

export class PromptTemplate {
  constructor(private readonly config: PromptTemplateConfig) {}

  get id(): string {
    return this.config.id;
  }

  get version(): string {
    return this.config.version;
  }

  get name(): string {
    return this.config.name;
  }

  render(variables: Record<string, unknown>): string {
    let result = this.config.template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      result = result.replaceAll(placeholder, String(value ?? ""));
    }

    // 检查未替换的变量
    const unreplaced = result.match(/\{\{(\w+)\}\}/g);
    if (unreplaced) {
      console.warn(
        `[PromptTemplate] Missing variables: ${unreplaced.join(", ")}`,
      );
    }

    return result;
  }

  validate(variables: Record<string, unknown>): {
    valid: boolean;
    missing: string[];
  } {
    const missing = this.config.variables.filter((v) => !(v in variables));
    return { valid: missing.length === 0, missing };
  }

  getAdaptation(model: string): ModelAdaptation | undefined {
    return this.config.modelAdaptations?.[model];
  }
}
```

### 5.4 ai-core/agents/base-agent.ts

```typescript
import { Logger } from "@nestjs/common";
import { AIOrchestrationService } from "@/common/ai-orchestration";
import { PromptTemplate } from "../prompts";

export interface AgentInput {
  task: string;
  context?: Record<string, unknown>;
  history?: AgentMessage[];
}

export interface AgentOutput {
  result: string;
  reasoning?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

export interface AgentConfig {
  name: string;
  description: string;
  model?: string;
  temperature?: number;
  maxIterations?: number;
}

export abstract class BaseAgent {
  protected readonly logger: Logger;
  protected readonly config: AgentConfig;

  constructor(
    protected readonly aiOrchestration: AIOrchestrationService,
    config: Partial<AgentConfig>,
  ) {
    this.config = {
      name: this.constructor.name,
      description: "",
      model: "gpt-4o",
      temperature: 0.7,
      maxIterations: 10,
      ...config,
    };
    this.logger = new Logger(this.config.name);
  }

  protected abstract getSystemPrompt(): string | PromptTemplate;

  async execute(input: AgentInput): Promise<AgentOutput> {
    this.logger.log(`Executing: ${input.task.substring(0, 100)}...`);

    const systemPrompt = this.resolvePrompt(
      this.getSystemPrompt(),
      input.context,
    );

    const response = await this.aiOrchestration.chat({
      model: this.config.model!,
      messages: [
        { role: "system", content: systemPrompt },
        ...(input.history || []),
        { role: "user", content: input.task },
      ],
      temperature: this.config.temperature,
    });

    return {
      result: response.content,
      metadata: {
        model: response.model,
        tokensUsed: response.usage?.totalTokens,
      },
    };
  }

  private resolvePrompt(
    prompt: string | PromptTemplate,
    context?: Record<string, unknown>,
  ): string {
    if (typeof prompt === "string") return prompt;
    return prompt.render(context || {});
  }
}
```

---

## 六、验收标准

### 6.1 代码质量

- [ ] 所有目录遵循命名约定
- [ ] 无 `shared/` 目录（已合并）
- [ ] 无组件内 hooks 目录
- [ ] TypeScript 严格模式通过
- [ ] ESLint 零错误

### 6.2 功能验证

- [ ] 后端 API 正常工作
- [ ] 前端页面正常渲染
- [ ] 所有测试通过
- [ ] 构建成功

### 6.3 文档完整

- [ ] CLAUDE.md 已更新
- [ ] 架构文档已创建
- [ ] 迁移指南已创建

---

## 七、风险与回滚

### 7.1 风险矩阵

| 风险             | 概率 | 影响 | 缓解措施                |
| ---------------- | ---- | ---- | ----------------------- |
| 导入路径大量报错 | 中   | 高   | 使用 re-export 保持兼容 |
| 构建失败         | 低   | 高   | 每步验证，独立提交      |
| 功能回归         | 低   | 高   | 运行完整测试套件        |
| 团队冲突         | 中   | 中   | 在独立分支进行          |

### 7.2 回滚策略

```bash
# 创建重构分支
git checkout -b refactor/directory-restructure

# 每阶段完成后打标签
git tag phase-1-complete
git tag phase-2-complete
# ...

# 如需回滚到某阶段
git reset --hard phase-X-complete

# 完全回滚
git checkout main
git branch -D refactor/directory-restructure
```

---

**文档版本**: 1.0
**创建日期**: 2025-12-28
**状态**: 待执行
**预计工期**: 13 天
**执行负责人**: Claude Code
