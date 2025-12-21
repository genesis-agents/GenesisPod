# PRD 文档目录

> **最后更新**: 2024-12-02
> **文档规范**: `[模块]-[类型]-v[版本].md`

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

## 当前有效文档

### AI Studio (AI研究工作台)

| 文件                                                 | 版本 | 状态     | 说明                        |
| ---------------------------------------------------- | ---- | -------- | --------------------------- |
| [ai-studio-prd-v4.0.md](./ai-studio-prd-v4.0.md)     | v4.0 | **最新** | 全新设计PRD，对标NotebookLM |
| [ai-studio-plan-v3.1.md](./ai-studio-plan-v3.1.md)   | v3.1 | 当前     | 实施计划文档                |
| [ai-studio-tasks-v3.1.md](./ai-studio-tasks-v3.1.md) | v3.1 | 当前     | 任务跟踪清单                |

### AI Office (智能报告生成)

| 文件                                             | 版本 | 状态     | 说明                    |
| ------------------------------------------------ | ---- | -------- | ----------------------- |
| [ai-office-prd-v2.0.md](./ai-office-prd-v2.0.md) | v2.0 | **最新** | Multi-Agent报告生成系统 |

### AI Group (多AI协作社区)

| 文件                                               | 版本 | 状态     | 说明         |
| -------------------------------------------------- | ---- | -------- | ------------ |
| [ai-group-prd-v1.0.md](./ai-group-prd-v1.0.md)     | v1.0 | **最新** | 产品需求文档 |
| [ai-group-spec-v2.0.md](./ai-group-spec-v2.0.md)   | v2.0 | 当前     | AI交互规范   |
| [ai-group-audit-v1.0.md](./ai-group-audit-v1.0.md) | v1.0 | 当前     | 实现审计报告 |

### 数据采集系统

| 文件                                                                               | 版本 | 状态     | 说明             |
| ---------------------------------------------------------------------------------- | ---- | -------- | ---------------- |
| [data-collection-prd-v3.0.md](./data-collection-prd-v3.0.md)                       | v3.0 | **最新** | 数据采集系统PRD  |
| [data-collection-monitor-design-v1.0.md](./data-collection-monitor-design-v1.0.md) | v1.0 | 当前     | 批量采集监控设计 |

### YouTube 功能

| 文件                                                           | 版本 | 状态     | 说明            |
| -------------------------------------------------------------- | ---- | -------- | --------------- |
| [youtube-subtitle-prd-v1.0.md](./youtube-subtitle-prd-v1.0.md) | v1.0 | **最新** | 字幕导出功能PRD |

### DeepDive Engine (AI视觉内容生成)

| 文件                                                                 | 版本 | 状态     | 说明                                      |
| -------------------------------------------------------------------- | ---- | -------- | ----------------------------------------- |
| [deepdive-engine-prd-v2.0.md](./deepdive-engine-prd-v2.0.md)         | v2.0 | **最新** | 文本模型+图像模型+HTML+SVG组合渲染引擎PRD |
| [resource-to-image-generation.md](./resource-to-image-generation.md) | v1.0 | 参考     | 资源转图片生成需求                        |

### Notes + Notion Integration

| 文件                                                                   | 版本 | 状态     | 说明                     |
| ---------------------------------------------------------------------- | ---- | -------- | ------------------------ |
| [notes-notion-integration-v1.0.md](./notes-notion-integration-v1.0.md) | v1.0 | **最新** | Notes与Notion集成系统PRD |

---

## 归档文档

旧版本文档存放于 `archive/` 目录，仅供历史参考。

| 文件                                                                                         | 原版本 | 归档原因              |
| -------------------------------------------------------------------------------------------- | ------ | --------------------- |
| [deepdive-prd-v2.0-archived.md](./archive/deepdive-prd-v2.0-archived.md)                     | v2.0   | 已拆分为各模块独立PRD |
| [ai-studio-prd-v3.0-archived.md](./archive/ai-studio-prd-v3.0-archived.md)                   | v3.0   | 已升级到v4.0          |
| [ai-studio-prd-v3.1-archived.md](./archive/ai-studio-prd-v3.1-archived.md)                   | v3.1   | 已升级到v4.0          |
| [data-collection-design-v2.0-archived.md](./archive/data-collection-design-v2.0-archived.md) | v2.0   | 已升级到v3.0          |

---

## 文档更新流程

1. **新建文档**: 按命名规范创建，版本从 `v1.0` 开始
2. **小更新**: 版本号小版本递增 (v1.0 → v1.1)
3. **大更新**: 创建新版本文件，旧版本移入 `archive/` 并添加 `-archived` 后缀
4. **更新索引**: 每次变更后更新本文件

---

## 模块状态总览

| 模块            | PRD版本 | 开发状态 | 文档完整度 |
| --------------- | ------- | -------- | ---------- |
| AI Studio       | v4.0    | 开发中   | 90%        |
| AI Office       | v2.0    | 已完成   | 95%        |
| AI Group        | v1.0    | 开发中   | 85%        |
| 数据采集        | v3.0    | 已修复   | 90%        |
| YouTube字幕     | v1.0    | 已完成   | 80%        |
| DeepDive Engine | v2.0    | 规划中   | 95%        |
