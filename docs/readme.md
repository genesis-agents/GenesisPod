# Genesis.ai - 项目文档

> AI 驱动的深度研究和内容管理平台

---

## 分层架构

```
┌─────────────────────────────────────────────────────────┐
│  system    → 系统整体架构、诊断、决策                     │
│  infra     → 基础设施（frontend/backend/database/llm）   │
│  ai-engine → AI 核心能力层                               │
│  ai-teams  → AI 协作机制层                               │
│  ai-apps   → AI 应用层（office/studio/coding/...）       │
│  api       → 对外 API 层                                 │
└─────────────────────────────────────────────────────────┘
```

---

## 目录结构

```
docs/
├── system/                        # 系统级文档
│   ├── diagnosis/                # 系统诊断报告
│   └── decisions/                # 架构决策记录 (ADR)
│
├── architecture/                  # 架构设计
│   ├── system/                   # 系统架构
│   ├── infra/                    # 基础设施
│   │   ├── plans/               # 基础设施改进计划
│   │   ├── frontend/
│   │   ├── backend/
│   │   ├── database/
│   │   └── ai-llm/
│   ├── ai-engine/                # AI Engine 核心能力
│   │   └── plans/               # AI Engine 计划
│   ├── ai-teams/                 # AI Teams 协作机制
│   │   └── plans/               # AI Teams 计划
│   ├── ai-apps/                  # AI 应用
│   │   ├── ai-office/
│   │   │   └── plans/           # AI Office 计划
│   │   ├── ai-studio/
│   │   │   └── plans/           # AI Studio 计划
│   │   ├── ai-writing/
│   │   │   └── plans/           # AI Writing 计划
│   │   ├── ai-social/
│   │   │   └── plans/           # AI Social 计划
│   │   └── ai-image/
│   │       └── plans/           # AI Image 计划
│   └── api/                      # 对外 API
│
├── prd/                           # 产品需求
│   ├── current/                  # 当前有效版本
│   │   ├── ai-apps/
│   │   ├── ai-teams/
│   │   ├── ai-engine/
│   │   ├── ai-research/
│   │   ├── infra/
│   │   └── features/
│   └── archive/                  # 历史版本
│
├── features/                      # 功能文档
│   ├── ai-engine/
│   ├── ai-teams/
│   └── ai-apps/
│
├── guides/                        # 开发指南
│   ├── deployment/
│   ├── development/
│   └── testing/
│
├── api/                           # API 接口文档
├── analysis/                      # 分析报告
│
└── _archive/                      # 历史归档
    ├── 2025-q4/
    └── 2026-q1/
```

---

## 文档与代码对照

| 文档路径                              | 代码路径                                 | 状态   |
| ------------------------------------- | ---------------------------------------- | ------ |
| `architecture/ai-engine/`             | `backend/src/modules/ai-engine/`         | 已更新 |
| `architecture/ai-apps/ai-office/`     | `backend/src/modules/ai-app/office/`     | OK     |
| `architecture/ai-apps/ai-research/`   | `backend/src/modules/ai-app/research/`   | 新增   |
| `architecture/ai-apps/ai-teams/`      | `backend/src/modules/ai-app/teams/`      | OK     |
| `architecture/ai-apps/ai-writing/`    | `backend/src/modules/ai-app/writing/`    | 已更新 |
| `architecture/ai-apps/ai-social/`     | `backend/src/modules/ai-app/social/`     | OK     |
| `architecture/ai-apps/ai-image/`      | `backend/src/modules/ai-app/image/`      | OK     |
| `architecture/ai-apps/ai-simulation/` | `backend/src/modules/ai-app/simulation/` | OK     |
| `prd/current/infra/data-collection/`  | `backend/src/modules/ingestion/`         | OK     |
| `prd/current/infra/integrations/`     | `backend/src/modules/integrations/`      | OK     |

---

## 快速导航

### 系统

- [系统诊断](system/diagnosis/)
- [架构决策](system/decisions/)

### 架构

- [系统架构](architecture/system/)
- [基础设施](architecture/infra/)
- [AI Engine](architecture/ai-engine/)
- [AI Teams](architecture/ai-teams/)
- [AI Apps](architecture/ai-apps/)

### PRD

- [当前 PRD](prd/current/)
- [历史 PRD](prd/archive/)

### 分析报告

- [分析报告索引](analysis/readme.md)
- [Claude Code 架构评估](analysis/claude-code-architecture-evaluation.md)
- [前端架构评估](analysis/frontend-architecture-evaluation.md)
- [后端架构评估](analysis/backend-architecture-evaluation.md)

### 指南

- [开发指南](guides/development/)
- [部署指南](guides/deployment/)
- [测试指南](guides/testing/)

---

## 文档规范

1. **按分层架构组织** — 同一模块的文档放在对应层级目录
2. **计划文档就近放置** — 各架构层的 `plans/` 目录存放改进计划
3. **PRD 版本管理** — 当前版本在 `current/`，历史版本在 `archive/`
4. **更新而非新建** — 已有文档直接更新，不创建版本后缀
5. **kebab-case 命名** — 全小写，连字符分隔
6. **以代码为准** — 文档必须与代码实现保持一致

---

**最后更新**: 2026-02-05
**文档一致性检查**: [system/diagnosis/docs-code-consistency-check-2026-02-05.md](system/diagnosis/docs-code-consistency-check-2026-02-05.md)
