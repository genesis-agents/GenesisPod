# Skills Directory

> DeepDive Engine 的 Claude Code 技能库，按功能领域分类组织。

## Skills vs Commands

| 特性         | Skills (本目录)       | Commands                 |
| ------------ | --------------------- | ------------------------ |
| **位置**     | `.claude/skills/`     | `.claude/commands/`      |
| **调用方式** | AI 自动根据上下文使用 | 用户输入 `/command` 触发 |
| **用途**     | 领域知识库、专业指导  | 快捷指令、工作流         |

## 目录结构

```
skills/
├── ai/                          # AI 相关技能
│   ├── ai-app-developer/        # AI App 开发（Writing/Image/Research）
│   ├── ai-architecture-layering/# AI 架构分层设计
│   ├── ai-service-expert/       # AI 服务实现
│   ├── ai-teams-expert/         # 多 Agent 团队协作
│   ├── prompt-engineering/      # 提示词工程
│   ├── writing-quality/         # 写作质量
│   └── document-generation/     # 文档生成 (DOCX/PDF/PPTX/XLSX)
│
├── development/                 # 开发技能
│   ├── api-developer/           # REST API 开发 (NestJS)
│   ├── database-manager/        # 多数据库管理
│   ├── database-migration/      # 数据库迁移 (Prisma)
│   ├── frontend-expert/         # 前端开发与调试 (Next.js + React)
│   ├── realtime-communication-expert/ # WebSocket/实时通信
│   ├── state-management-expert/ # 状态管理 (Zustand)
│   ├── webapp-testing/          # Web 应用测试 (Playwright)
│   ├── git-automation/          # Git 自动化工作流
│   └── complex-feature-implementation/ # 复杂功能实现
│
├── quality/                     # 质量保证技能
│   ├── code-reviewer/           # 代码审查
│   ├── performance-optimizer/   # 性能优化
│   └── testing-suite/           # 测试套件 (Jest/Vitest/Playwright)
│
├── operations/                  # 运维技能
│   ├── debug-ops/               # 调试运维
│   ├── dev-environment/         # 开发环境配置
│   ├── devops-platform/         # DevOps 平台 (Railway/Docker/PM2)
│   └── git-workflow/            # Git 工作流
│
├── data/                        # 数据技能
│   ├── data-pipeline-expert/    # 数据管道与质量
│   └── knowledge-graph-expert/  # 知识图谱 (Neo4j)
│
└── architecture/                # 架构技能
    ├── document-processor/      # 文档处理
    ├── schema-architect/        # 系统架构设计
    ├── security-specialist/     # 安全专家
    └── mcp-builder/             # MCP 服务器构建
```

## 技能统计

| 分类         | 技能数量 | 主要用途                          |
| ------------ | -------- | --------------------------------- |
| AI           | 7        | AI 应用开发、多 Agent 协作        |
| Development  | 9        | 前后端开发、数据库迁移、测试、Git |
| Quality      | 3        | 测试、代码审查、性能优化          |
| Operations   | 4        | 部署、调试、环境配置              |
| Data         | 2        | 数据管道、知识图谱                |
| Architecture | 4        | 系统设计、安全、MCP               |
| **总计**     | **29**   | -                                 |

## 最近更新 (2025-01)

### 合并的技能

- `testing-suite` ← testing-expert + e2e-testing-orchestrator + verification-automation
- `devops-platform` ← deployment-ops + iac-manager + monitoring-ops
- `frontend-expert` ← frontend-builder + frontend-ui-debugger
- `data-pipeline-expert` ← data-collection-expert + data-quality-manager

### 新增的技能

- `realtime-communication-expert` - WebSocket/Socket.io Gateway 开发
- `ai-app-developer` - AI App 模块开发（Writing/Image/Research）
- `state-management-expert` - Zustand 状态管理

### 移除的技能

- `i18n-localization` - 当前项目无国际化需求

## 技能边界设计

每个技能文件 (SKILL.md) 现在包含 `boundaries` 字段：

```yaml
boundaries:
  includes:
    - "明确包含的职责"
  excludes:
    - "明确排除的职责"
  handoff:
    - skill: "other-skill"
      when: "何时移交给其他技能"
```

## 使用说明

1. **选择技能**：根据任务类型选择对应分类下的技能
2. **查看边界**：阅读 `boundaries` 了解技能范围
3. **技能移交**：当任务超出当前技能范围时，参考 `handoff` 切换技能

## 技能依赖图

```
                    ┌─────────────────────┐
                    │  schema-architect   │
                    │   (架构设计入口)      │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │ api-developer│   │frontend-expert│  │ai-app-developer│
    └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
           │                   │                   │
           └───────────────────┼───────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   testing-suite     │
                    │   (质量保证层)       │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   devops-platform   │
                    │   (部署运维层)       │
                    └─────────────────────┘
```
