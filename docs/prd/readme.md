# PRD 文档目录

> **最后更新**: 2026-01-11
> **文档规范**: `[模块]-[类型]-v[版本].md`

---

## 目录结构

```
prd/
├── ai-studio/        # AI研究工作台
├── ai-office/        # 智能报告生成
├── ai-slides/        # 智能幻灯片
├── ai-group/         # 多AI协作社区
├── ai-coding/        # AI编程助手
├── ai-ask/           # 智能问答
├── topic-research/   # 专题洞察 (Insight Hub) [NEW]
├── knowledge-base/   # 知识库系统
├── library/          # 资源库
├── integrations/     # 第三方集成
├── data-collection/  # 数据采集
├── core/             # 核心系统
├── archive/          # 归档文档
└── readme.md         # 本索引文件
```

---

## 命名规范

| 元素 | 说明         | 示例                                              |
| ---- | ------------ | ------------------------------------------------- |
| 模块 | 功能模块名称 | `ai-studio`, `ai-group`, `data-collection`        |
| 类型 | 文档类型     | `prd`, `spec`, `plan`, `tasks`, `audit`, `design` |
| 版本 | 语义化版本号 | `v1.0`, `v2.0`, `v3.1`                            |

**规则**:

- 统一使用连字符 `-` 分隔
- 禁止使用下划线 `_`
- 版本号必须带 `v` 前缀

---

## AI Studio (AI研究工作台)

| 文件                                                           | 版本 | 状态     | 说明                        |
| -------------------------------------------------------------- | ---- | -------- | --------------------------- |
| [ai-studio-prd-v4.0.md](./ai-studio/ai-studio-prd-v4.0.md)     | v4.0 | **最新** | 全新设计PRD，对标NotebookLM |
| [ai-studio-plan-v3.1.md](./ai-studio/ai-studio-plan-v3.1.md)   | v3.1 | 当前     | 实施计划文档                |
| [ai-studio-tasks-v3.1.md](./ai-studio/ai-studio-tasks-v3.1.md) | v3.1 | 当前     | 任务跟踪清单                |

---

## AI Office (智能报告生成)

| 文件                                                                             | 版本 | 状态     | 说明                    |
| -------------------------------------------------------------------------------- | ---- | -------- | ----------------------- |
| [ai-office-prd-v2.0.md](./ai-office/ai-office-prd-v2.0.md)                       | v2.0 | **最新** | Multi-Agent报告生成系统 |
| [ai-office-redesign-v5.0.md](./ai-office/ai-office-redesign-v5.0.md)             | v5.0 | 当前     | UI/UX重新设计方案       |
| [ai-office-optimization-v2.md](./ai-office/ai-office-optimization-v2.md)         | v2   | 参考     | 优化方案                |
| [ai-office-slides-upgrade-v1.0.md](./ai-office/ai-office-slides-upgrade-v1.0.md) | v1.0 | 参考     | Genspark竞品对标分析    |

---

## AI Slides (智能幻灯片)

| 文件                                                                               | 版本 | 状态     | 说明                             |
| ---------------------------------------------------------------------------------- | ---- | -------- | -------------------------------- |
| [ai-slides-v3.1-visual-upgrade.md](./ai-slides/ai-slides-v3.1-visual-upgrade.md)   | v3.1 | **最新** | 视觉升级PRD，2周追赶Genspark方案 |
| [ai-slides-v3-optimization-plan.md](./ai-slides/ai-slides-v3-optimization-plan.md) | v3   | 参考     | 完整8周优化方案                  |
| [ai-slides-genspark-gap-closure.md](./ai-slides/ai-slides-genspark-gap-closure.md) | v1.0 | 参考     | 原始差距分析方案                 |
| [slides-gap-analysis.md](./ai-slides/slides-gap-analysis.md)                       | v1.0 | 当前     | Slides差距分析                   |
| [slides-quality-issues-v1.md](./ai-slides/slides-quality-issues-v1.md)             | v1.0 | 当前     | 质量问题清单                     |

---

## AI Group (多AI协作社区)

| 文件                                                                                  | 版本 | 状态     | 说明         |
| ------------------------------------------------------------------------------------- | ---- | -------- | ------------ |
| [ai-group-prd-v1.0.md](./ai-group/ai-group-prd-v1.0.md)                               | v1.0 | **最新** | 产品需求文档 |
| [ai-group-spec-v2.0.md](./ai-group/ai-group-spec-v2.0.md)                             | v2.0 | 当前     | AI交互规范   |
| [ai-group-team-collaboration-v1.0.md](./ai-group/ai-group-team-collaboration-v1.0.md) | v1.0 | 当前     | 团队协作功能 |
| [ai-group-content-parsing-v1.0.md](./ai-group/ai-group-content-parsing-v1.0.md)       | v1.0 | 当前     | 内容解析功能 |
| [ai-group-optimization-v1.1.md](./ai-group/ai-group-optimization-v1.1.md)             | v1.1 | 当前     | 优化方案     |
| [ai-group-audit-v1.0.md](./ai-group/ai-group-audit-v1.0.md)                           | v1.0 | 参考     | 实现审计报告 |

---

## AI Coding (AI编程助手)

| 文件                                                                                         | 版本 | 状态     | 说明                    |
| -------------------------------------------------------------------------------------------- | ---- | -------- | ----------------------- |
| [ai-coding-feature.md](./ai-coding/ai-coding-feature.md)                                     | v1.0 | **最新** | 多智能体协作编程平台PRD |
| [ai-coding-refactor-prd-v1.0.md](./ai-coding/ai-coding-refactor-prd-v1.0.md)                 | v1.0 | 当前     | 重构方案PRD             |
| [ai-coding-visualization-enhancement.md](./ai-coding/ai-coding-visualization-enhancement.md) | v1.0 | 当前     | 可视化增强方案          |

---

## AI Ask (智能问答)

| 文件                                                                            | 版本 | 状态     | 说明            |
| ------------------------------------------------------------------------------- | ---- | -------- | --------------- |
| [ask-ai-session-management-v1.0.md](./ai-ask/ask-ai-session-management-v1.0.md) | v1.0 | **最新** | 会话管理功能PRD |

---

## Topic Research / Insight Hub (专题洞察) [NEW]

| 文件                                                                      | 版本 | 状态     | 说明                                    |
| ------------------------------------------------------------------------- | ---- | -------- | --------------------------------------- |
| [topic-research-prd-v1.0.md](./topic-research/topic-research-prd-v1.0.md) | v1.0 | **最新** | 专题洞察完整PRD，支持宏观/技术/企业洞察 |

---

## Knowledge Base (知识库系统)

| 文件                                                                                      | 版本 | 状态     | 说明           |
| ----------------------------------------------------------------------------------------- | ---- | -------- | -------------- |
| [library-knowledge-base-system.md](./knowledge-base/library-knowledge-base-system.md)     | v1.0 | **最新** | 知识库系统设计 |
| [knowledge-base-enhancement-prd.md](./knowledge-base/knowledge-base-enhancement-prd.md)   | v1.0 | 当前     | 知识库增强PRD  |
| [knowledge-base-data-sources-prd.md](./knowledge-base/knowledge-base-data-sources-prd.md) | v1.0 | 当前     | 数据源管理PRD  |
| [knowledge-ux-improvements.md](./knowledge-base/knowledge-ux-improvements.md)             | v1.0 | 当前     | UX改进方案     |

---

## Library (资源库)

| 文件                                                               | 版本 | 状态     | 说明           |
| ------------------------------------------------------------------ | ---- | -------- | -------------- |
| [library-optimization-v2.md](./library/library-optimization-v2.md) | v2   | **最新** | 资源库优化方案 |

---

## Integrations (第三方集成)

| 文件                                                                                              | 版本 | 状态     | 说明                     |
| ------------------------------------------------------------------------------------------------- | ---- | -------- | ------------------------ |
| [google-drive-rag-knowledge-base-v2.0.md](./integrations/google-drive-rag-knowledge-base-v2.0.md) | v2.0 | **最新** | Google Drive RAG知识库   |
| [google-drive-integration-v1.0.md](./integrations/google-drive-integration-v1.0.md)               | v1.0 | 当前     | Google Drive集成         |
| [notes-notion-integration-v1.0.md](./integrations/notes-notion-integration-v1.0.md)               | v1.0 | **最新** | Notes与Notion集成系统PRD |

---

## Data Collection (数据采集)

| 文件                                                                                               | 版本 | 状态     | 说明             |
| -------------------------------------------------------------------------------------------------- | ---- | -------- | ---------------- |
| [data-collection-prd-v3.0.md](./data-collection/data-collection-prd-v3.0.md)                       | v3.0 | **最新** | 数据采集系统PRD  |
| [data-collection-monitor-design-v1.0.md](./data-collection/data-collection-monitor-design-v1.0.md) | v1.0 | 当前     | 批量采集监控设计 |

---

## Core (核心系统)

| 文件                                                                        | 版本 | 状态     | 说明                        |
| --------------------------------------------------------------------------- | ---- | -------- | --------------------------- |
| [deepdive-engine-prd-v2.0.md](./core/deepdive-engine-prd-v2.0.md)           | v2.0 | **最新** | DeepDive Engine核心PRD      |
| [credits-system-prd-v1.0.md](./core/credits-system-prd-v1.0.md)             | v1.0 | **最新** | 积分系统PRD，AI功能计费管控 |
| [admin-storage-enhancement.md](./core/admin-storage-enhancement.md)         | v1.0 | 当前     | 管理后台存储增强            |
| [auto-feedback-resolution-v1.0.md](./core/auto-feedback-resolution-v1.0.md) | v1.0 | 当前     | 自动反馈处理系统            |
| [youtube-subtitle-prd-v1.0.md](./core/youtube-subtitle-prd-v1.0.md)         | v1.0 | 当前     | YouTube字幕导出功能PRD      |
| [ai-strategic-simulation-prd.md](./core/ai-strategic-simulation-prd.md)     | v1.0 | 当前     | AI战略模拟PRD               |
| [resource-to-image-generation.md](./core/resource-to-image-generation.md)   | v1.0 | 参考     | 资源转图片生成需求          |

---

## 归档文档

旧版本文档存放于 `archive/` 目录，仅供历史参考。

| 文件                                                                                                           | 原版本 | 归档原因              |
| -------------------------------------------------------------------------------------------------------------- | ------ | --------------------- |
| [deepdive-prd-v2.0-archived.md](./archive/deepdive-prd-v2.0-archived.md)                                       | v2.0   | 已拆分为各模块独立PRD |
| [ai-studio-prd-v3.0-archived.md](./archive/ai-studio-prd-v3.0-archived.md)                                     | v3.0   | 已升级到v4.0          |
| [ai-studio-prd-v3.1-archived.md](./archive/ai-studio-prd-v3.1-archived.md)                                     | v3.1   | 已升级到v4.0          |
| [data-collection-design-v2.0-archived.md](./archive/data-collection-design-v2.0-archived.md)                   | v2.0   | 已升级到v3.0          |
| [google-drive-rag-knowledge-base-v1.0-archived.md](./archive/google-drive-rag-knowledge-base-v1.0-archived.md) | v1.0   | 已升级到v2.0          |

---

## 文档更新流程

1. **新建文档**: 按命名规范创建，版本从 `v1.0` 开始
2. **小更新**: 版本号小版本递增 (v1.0 -> v1.1)
3. **大更新**: 创建新版本文件，旧版本移入 `archive/` 并添加 `-archived` 后缀
4. **更新索引**: 每次变更后更新本文件

---

## 模块状态总览

| 模块            | PRD版本 | 开发状态 | 文档完整度 |
| --------------- | ------- | -------- | ---------- |
| AI Studio       | v4.0    | 开发中   | 90%        |
| AI Office       | v2.0    | 已完成   | 95%        |
| AI Slides       | v3.1    | 待开发   | 95%        |
| AI Group        | v1.0    | 开发中   | 85%        |
| AI Coding       | v1.0    | 开发中   | 95%        |
| AI Ask          | v1.0    | 开发中   | 80%        |
| Topic Research  | v1.0    | 规划中   | 95%        |
| Knowledge Base  | v1.0    | 开发中   | 85%        |
| Library         | v2      | 已完成   | 80%        |
| Integrations    | v2.0    | 开发中   | 90%        |
| Data Collection | v3.0    | 已修复   | 90%        |
| Core            | v2.0    | 规划中   | 95%        |
