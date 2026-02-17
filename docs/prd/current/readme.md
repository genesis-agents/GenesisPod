# PRD 文档目录 (当前版本)

> **最后更新**: 2026-01-15
> **维护原则**: 每个模块仅保留当前有效的 PRD，历史版本归档至 `archive/`

---

## 目录结构

```
prd/
├── current/              # 当前有效 PRD (本目录)
│   ├── ai-apps/          # AI 应用层
│   ├── ai-teams/         # AI Teams 协作系统
│   └── infra/            # 基础设施层
├── archive/              # 历史版本归档
└── readme.md             # 总索引 (向上兼容)
```

---

## Platform Evolution (平台演进)

> **说明**: 跨模块平台级演进计划，包括 MCP 生态深化、A2A 协议、Skills Marketplace 等。

| 文件                                                                                          | 版本 | 状态     | 说明           |
| --------------------------------------------------------------------------------------------- | ---- | -------- | -------------- |
| [platform-evolution-roadmap-v1.0.md](./platform-evolution/platform-evolution-roadmap-v1.0.md) | v1.0 | **当前** | 平台演进路线图 |

**相关文档**:

- [Architecture Design](../../architecture/platform-evolution/architecture-design.md) - 架构设计
- [ADR-001: MCP Transport Extension](../../decisions/001-mcp-transport-extension.md)
- [ADR-002: Raven as MCP Server](../../decisions/002-raven-as-mcp-server.md)
- [ADR-003: A2A Protocol Adoption](../../decisions/003-a2a-protocol-adoption.md)

---

## AI Apps (AI 应用层)

### AI Studio (AI 研究工作台)

| 文件                                                               | 版本 | 状态     | 说明                      |
| ------------------------------------------------------------------ | ---- | -------- | ------------------------- |
| [ai-studio-prd-v4.0.md](./ai-apps/ai-studio/ai-studio-prd-v4.0.md) | v4.0 | **当前** | 全新设计，对标 NotebookLM |

**子文档**:

- [ai-studio-plan-v3.1.md](./ai-apps/ai-studio/ai-studio-plan-v3.1.md) - 实施计划
- [ai-studio-tasks-v3.1.md](./ai-apps/ai-studio/ai-studio-tasks-v3.1.md) - 任务跟踪

### AI Office (智能报告生成)

| 文件                                                               | 版本 | 状态     | 说明                     |
| ------------------------------------------------------------------ | ---- | -------- | ------------------------ |
| [ai-office-prd-v2.0.md](./ai-apps/ai-office/ai-office-prd-v2.0.md) | v2.0 | **当前** | Multi-Agent 报告生成系统 |

**子文档**:

- [ai-office-redesign-v5.0.md](./ai-apps/ai-office/ai-office-redesign-v5.0.md) - UI/UX 重新设计

### AI Slides (智能幻灯片)

| 文件                                                                                     | 版本 | 状态     | 说明         |
| ---------------------------------------------------------------------------------------- | ---- | -------- | ------------ |
| [ai-slides-v3.1-visual-upgrade.md](./ai-apps/ai-slides/ai-slides-v3.1-visual-upgrade.md) | v3.1 | **当前** | 视觉升级方案 |

**子文档**:

- [slides-gap-analysis.md](./ai-apps/ai-slides/slides-gap-analysis.md) - 竞品差距分析
- [slides-quality-issues-v1.md](./ai-apps/ai-slides/slides-quality-issues-v1.md) - 质量问题清单

### AI Coding (AI 编程助手)

| 文件                                                             | 版本 | 状态     | 说明                 |
| ---------------------------------------------------------------- | ---- | -------- | -------------------- |
| [ai-coding-feature.md](./ai-apps/ai-coding/ai-coding-feature.md) | v1.0 | **当前** | 多智能体协作编程平台 |

**子文档**:

- [ai-coding-refactor-prd-v1.0.md](./ai-apps/ai-coding/ai-coding-refactor-prd-v1.0.md) - 重构方案
- [ai-coding-visualization-enhancement.md](./ai-apps/ai-coding/ai-coding-visualization-enhancement.md) - 可视化增强

### AI Ask (智能问答)

| 文件                                                                                    | 版本 | 状态     | 说明         |
| --------------------------------------------------------------------------------------- | ---- | -------- | ------------ |
| [ask-ai-session-management-v1.0.md](./ai-apps/ai-ask/ask-ai-session-management-v1.0.md) | v1.0 | **当前** | 会话管理功能 |

### AI Writing (智能写作)

| 文件                                                       | 版本 | 状态     | 说明             |
| ---------------------------------------------------------- | ---- | -------- | ---------------- |
| [ai-writing-redesign.md](./ai-apps/ai-writing/redesign.md) | v2.0 | **当前** | 模块重新设计 PRD |

**备注**: 此模块需要从零重构，当前 v3-user-first.md 为设计草稿。

---

## AI Teams (AI 团队协作系统)

> **说明**: AI Teams 是核心协作机制层，支持预定义团队和自定义团队。

### 核心功能

| 文件                                                      | 版本 | 状态     | 说明                  |
| --------------------------------------------------------- | ---- | -------- | --------------------- |
| [ai-teams-prd-v1.0.md](./ai-teams/ai-teams-prd-v1.0.md)   | v1.0 | **当前** | AI Teams 核心产品需求 |
| [ai-teams-spec-v2.0.md](./ai-teams/ai-teams-spec-v2.0.md) | v2.0 | **当前** | AI 交互规范           |

**子文档**:

- [ai-teams-team-collaboration-v1.0.md](./ai-teams/ai-teams-team-collaboration-v1.0.md) - 团队协作功能
- [ai-teams-content-parsing-v1.0.md](./ai-teams/ai-teams-content-parsing-v1.0.md) - 内容解析功能
- [ai-teams-optimization-v1.1.md](./ai-teams/ai-teams-optimization-v1.1.md) - 优化方案

### Topic Research (专题研究)

> 基于 AI Teams 的预定义研究团队

| 文件                                                                               | 版本 | 状态     | 说明             |
| ---------------------------------------------------------------------------------- | ---- | -------- | ---------------- |
| [topic-research-prd-v1.0.md](./ai-teams/topic-research/topic-research-prd-v1.0.md) | v1.0 | **当前** | 专题洞察完整 PRD |

**子文档**:

- [topic-research-ux-enhancement-v1.0.md](./ai-teams/topic-research/topic-research-ux-enhancement-v1.0.md) - UX 增强方案
- [ui-optimization.md](./ai-teams/topic-research/ui-optimization.md) - UI 优化
- [report-editing.md](./ai-teams/topic-research/report-editing.md) - 报告编辑功能
- [leader-interaction.md](./ai-teams/topic-research/leader-interaction.md) - Leader 交互设计

---

## Infra (基础设施层)

### Core (核心系统)

| 文件                                                                    | 版本 | 状态     | 说明                |
| ----------------------------------------------------------------------- | ---- | -------- | ------------------- |
| [deepdive-engine-prd-v2.0.md](./infra/core/deepdive-engine-prd-v2.0.md) | v2.0 | **当前** | Genesis.ai 核心 PRD |
| [credits-system-prd-v1.0.md](./infra/core/credits-system-prd-v1.0.md)   | v1.0 | **当前** | 积分系统 PRD        |

**子文档**:

- [admin-storage-enhancement.md](./infra/core/admin-storage-enhancement.md) - 管理后台存储增强
- [auto-feedback-resolution-v1.0.md](./infra/core/auto-feedback-resolution-v1.0.md) - 自动反馈处理系统
- [youtube-subtitle-prd-v1.0.md](./infra/core/youtube-subtitle-prd-v1.0.md) - YouTube 字幕导出功能
- [ai-strategic-simulation-prd.md](./infra/core/ai-strategic-simulation-prd.md) - AI 战略模拟

### Knowledge Base (知识库系统)

| 文件                                                                                        | 版本 | 状态     | 说明           |
| ------------------------------------------------------------------------------------------- | ---- | -------- | -------------- |
| [library-knowledge-base-system.md](./infra/knowledge-base/library-knowledge-base-system.md) | v1.0 | **当前** | 知识库系统设计 |

**子文档**:

- [knowledge-base-enhancement-prd.md](./infra/knowledge-base/knowledge-base-enhancement-prd.md) - 知识库增强
- [knowledge-base-data-sources-prd.md](./infra/knowledge-base/knowledge-base-data-sources-prd.md) - 数据源管理
- [knowledge-ux-improvements.md](./infra/knowledge-base/knowledge-ux-improvements.md) - UX 改进

### Library (资源库)

| 文件                                                                     | 版本 | 状态     | 说明           |
| ------------------------------------------------------------------------ | ---- | -------- | -------------- |
| [library-optimization-v2.md](./infra/library/library-optimization-v2.md) | v2.0 | **当前** | 资源库优化方案 |

### Integrations (第三方集成)

| 文件                                                                                                    | 版本 | 状态     | 说明                     |
| ------------------------------------------------------------------------------------------------------- | ---- | -------- | ------------------------ |
| [google-drive-rag-knowledge-base-v2.0.md](./infra/integrations/google-drive-rag-knowledge-base-v2.0.md) | v2.0 | **当前** | Google Drive RAG 知识库  |
| [notes-notion-integration-v1.0.md](./infra/integrations/notes-notion-integration-v1.0.md)               | v1.0 | **当前** | Notes 与 Notion 集成系统 |

**子文档**:

- [google-drive-integration-v1.0.md](./infra/integrations/google-drive-integration-v1.0.md) - Google Drive 集成

### Data Collection (数据采集)

| 文件                                                                               | 版本 | 状态     | 说明             |
| ---------------------------------------------------------------------------------- | ---- | -------- | ---------------- |
| [data-collection-prd-v3.0.md](./infra/data-collection/data-collection-prd-v3.0.md) | v3.0 | **当前** | 数据采集系统 PRD |

**子文档**:

- [data-collection-monitor-design-v1.0.md](./infra/data-collection/data-collection-monitor-design-v1.0.md) - 批量采集监控设计

---

## 命名规范

| 元素 | 说明         | 示例                                              |
| ---- | ------------ | ------------------------------------------------- |
| 模块 | 功能模块名称 | `ai-studio`, `ai-teams`, `data-collection`        |
| 类型 | 文档类型     | `prd`, `spec`, `plan`, `tasks`, `audit`, `design` |
| 版本 | 语义化版本号 | `v1.0`, `v2.0`, `v3.1`                            |

**规则**:

- 统一使用连字符 `-` 分隔
- 禁止使用下划线 `_`
- 版本号必须带 `v` 前缀
- 所有文件名小写 (kebab-case)

---

## 文档更新流程

1. **新建文档**: 按命名规范创建，版本从 `v1.0` 开始
2. **小更新**: 版本号小版本递增 (v1.0 → v1.1)
3. **大更新**: 创建新版本文件，旧版本移入 `archive/` 并添加 `-archived` 后缀
4. **更新索引**: 每次变更后更新本文件

---

## 模块状态总览

| 模块               | PRD 版本 | 开发状态 | 文档完整度 |
| ------------------ | -------- | -------- | ---------- |
| AI Studio          | v4.0     | 开发中   | 90%        |
| AI Office          | v2.0     | 已完成   | 95%        |
| AI Slides          | v3.1     | 待开发   | 95%        |
| AI Teams           | v2.0     | 开发中   | 90%        |
| Topic Research     | v1.0     | 开发中   | 95%        |
| AI Coding          | v1.0     | 开发中   | 95%        |
| AI Ask             | v1.0     | 开发中   | 80%        |
| AI Writing         | v2.0     | 待重构   | 60%        |
| Knowledge Base     | v1.0     | 开发中   | 85%        |
| Library            | v2.0     | 已完成   | 80%        |
| Integrations       | v2.0     | 开发中   | 90%        |
| Data Collection    | v3.0     | 已修复   | 90%        |
| Core               | v2.0     | 规划中   | 95%        |
| Platform Evolution | v1.0     | 规划中   | 100%       |
