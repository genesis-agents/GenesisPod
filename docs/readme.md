# DeepDive Engine - 项目文档

> AI 驱动的深度研究和内容管理平台

---

## 分层架构

```
┌─────────────────────────────────────────────────────────┐
│  system    → 系统整体架构                                │
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
├── api/                        # API 接口文档
├── architecture/               # 架构设计
│   ├── system/                # 系统架构
│   ├── infra/                 # 基础设施
│   │   ├── frontend/
│   │   ├── backend/
│   │   ├── database/
│   │   └── ai-llm/
│   ├── ai-engine/             # AI Engine 核心能力
│   ├── ai-teams/              # AI Teams 协作机制
│   ├── ai-apps/               # AI 应用
│   │   ├── ai-office/
│   │   ├── ai-coding/
│   │   └── ...
│   └── api/                   # 对外 API
├── features/                   # 功能文档
│   ├── ai-engine/
│   ├── ai-teams/
│   └── ai-apps/
│       ├── ai-office/
│       ├── ai-studio/
│       └── ...
├── guides/                     # 开发指南
│   ├── deployment/
│   ├── development/
│   └── testing/
├── prd/                        # 产品需求
│   ├── infra/
│   ├── ai-engine/
│   ├── ai-teams/
│   └── ai-apps/
└── _archive/                   # 归档
```

---

## 文档与代码对照

| 文档路径                           | 代码路径                               |
| ---------------------------------- | -------------------------------------- |
| `architecture/ai-engine/`          | `backend/src/modules/ai-engine/`       |
| `architecture/ai-apps/ai-office/`  | `backend/src/modules/ai-app/office/`   |
| `architecture/ai-apps/ai-studio/`  | `backend/src/modules/ai-app/research/` |
| `architecture/ai-apps/ai-coding/`  | `backend/src/modules/ai-app/coding/`   |
| `architecture/ai-apps/ai-writing/` | `backend/src/modules/ai-app/writing/`  |
| `prd/infra/data-collection/`       | `backend/src/modules/ingestion/`       |
| `prd/infra/integrations/`          | `backend/src/modules/integrations/`    |

---

## 快速导航

### 架构

- [系统架构](architecture/system/)
- [AI Engine](architecture/ai-engine/)
- [AI Teams](architecture/ai-teams/)
- [AI Apps](architecture/ai-apps/)

### PRD

- [PRD 索引](prd/readme.md)

### 指南

- [开发指南](guides/development/)
- [部署指南](guides/deployment/)

---

## 文档规范

1. **按分层架构组织** — 同一模块的文档放在对应层级目录
2. **更新而非新建** — 已有文档直接更新，不创建版本后缀
3. **kebab-case 命名** — 全小写，连字符分隔
4. **以代码为准** — 文档必须与代码实现保持一致

---

**最后更新**: 2026-01-15
