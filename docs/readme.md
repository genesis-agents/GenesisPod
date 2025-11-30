# DeepDive Engine - 项目文档

> AI驱动的知识发现平台 - 完整技术文档

**最后更新**: 2025-11-30
**文档版本**: v2.1
**项目状态**: 生产就绪度 9.0/10

---

## 📚 文档导航

### 🏗️ 架构设计

深入了解系统架构、技术选型和设计决策

| 文档                                                 | 说明             | 关键内容                                   |
| ---------------------------------------------------- | ---------------- | ------------------------------------------ |
| [架构总览](architecture/overview.md)                 | 系统整体架构设计 | Monorepo结构、5数据库架构、模块划分        |
| [AI上下文架构](architecture/ai-context.md)           | AI功能架构设计   | AI服务集成、Grok/OpenAI切换、容错机制      |
| [架构改进总结](architecture/improvements-summary.md) | 最新架构优化     | 安全防护、错误处理、测试体系（2025-11-15） |

### 🔌 API参考

完整的API端点文档和使用示例

| 文档                         | 说明            | 关键端点                                       |
| ---------------------------- | --------------- | ---------------------------------------------- |
| [API完整参考](api/readme.md) | 所有API端点文档 | Feed流、资源管理、AI增强、数据采集、笔记、评论 |

### 📖 开发指南

开发、部署和测试的实践指南

| 文档                                     | 说明                 | 目标读者         |
| ---------------------------------------- | -------------------- | ---------------- |
| [开发指南](guides/development.md)        | 本地开发环境搭建     | 新加入的开发者   |
| [部署指南](guides/deployment.md)         | 生产环境部署流程     | DevOps工程师     |
| [测试指南](guides/testing.md)            | 测试策略和实践       | QA工程师、开发者 |
| [访问指南](guides/access.md)             | 服务地址和快速测试   | 所有开发者       |
| [服务管理](guides/service-management.md) | 服务启停脚本使用说明 | 所有开发者       |

### 📋 产品文档

产品定位、需求和规划

| 文档                   | 说明                         |
| ---------------------- | ---------------------------- |
| [产品需求文档](prd.md) | 产品愿景、核心功能、商业模式 |

### ✨ 功能文档

各核心功能的详细设计和使用说明

#### 数据采集系统 ✅ 已修复

| 文档                                                                     | 说明                           | 状态                 |
| ------------------------------------------------------------------------ | ------------------------------ | -------------------- |
| [数据采集PRD v3.0](prd/data-collection-system-v3.0.md)                   | 完整产品需求和功能设计         | 📋 产品规格          |
| [数据采集API](api/data-collection-api.md)                                | API接口完整参考                | 📖 API文档           |
| [数据采集验证报告](data-management/data-collection-validation-report.md) | 问题修复验证报告（2025-11-30） | ✅ 4个致命问题已修复 |
| [数据管理中心](data-management/readme.md)                                | 数据采集系统文档导航           | 📚 文档中心          |

#### AI Office 功能

| 文档                                                            | 说明                        | 状态        |
| --------------------------------------------------------------- | --------------------------- | ----------- |
| [产品方案](features/ai-office/product-spec.md)                  | AI Office产品设计（正式版） | 📋 产品规格 |
| [系统设计](features/ai-office/system-design.md)                 | 系统架构与任务划分          | 🏗️ 技术设计 |
| [UI设计-三栏布局](features/ai-office/ui-design-three-column.md) | 三栏布局UI设计方案          | 🎨 UI方案A  |
| [UI设计-实时协作](features/ai-office/ui-design-realtime.md)     | 实时协作式UI设计方案        | 🎨 UI方案B  |
| [文档生成](features/ai-office/document-generation.md)           | 文档生成功能设计            | 📝 核心功能 |
| [PPT模板系统](features/ai-office/ppt-template-system.md)        | PPT模板系统设计             | 🎭 模板设计 |

#### AI Studio 研究平台 🆕

| 文档   | 说明                     | 状态          |
| ------ | ------------------------ | ------------- |
| 待创建 | 研究项目管理和多文件分析 | 🚧 文档待补充 |

#### AI Image 图像生成 🆕

| 文档   | 说明                 | 状态          |
| ------ | -------------------- | ------------- |
| 待创建 | AI绘图功能和使用指南 | 🚧 文档待补充 |

#### AI Group 多AI协作 🆕

| 文档   | 说明               | 状态          |
| ------ | ------------------ | ------------- |
| 待创建 | 多AI协作和主题管理 | 🚧 文档待补充 |

#### Workspace报告功能

| 文档                                                 | 说明                 |
| ---------------------------------------------------- | -------------------- |
| [功能概览](features/workspace-reporting/overview.md) | Workspace AI报告功能 |
| [任务清单](features/workspace-reporting/tasks.md)    | 开发任务列表         |

#### 其他功能

| 文档                                | 说明                   |
| ----------------------------------- | ---------------------- |
| [报告功能指南](features/reports.md) | AI报告生成功能使用指南 |

---

## 🚀 快速开始

### 1. 新开发者入门

```
1. 阅读 架构总览 了解系统设计
2. 参考 开发指南 搭建本地环境
3. 查看 API参考 了解接口使用
4. 运行 访问指南 中的测试命令
```

### 2. 查找特定功能文档

```
- 数据采集问题？      → features/data-collection/
- AI Office功能？      → features/ai-office/
- API端点不清楚？      → api/readme.md
- 部署相关问题？       → guides/deployment.md
```

### 3. 了解最新改进

```
查看 architecture/improvements-summary.md
包含2025-11-15的最新架构优化：
- 安全防护加固（限流、Helmet）
- 错误处理标准化
- 测试体系建立
```

---

## 📊 项目概览

### 技术栈

**前端**: Next.js 14 + React 18 + TypeScript + TailwindCSS
**后端**: NestJS 10 + Prisma + GraphQL
**AI服务**: FastAPI + Grok API + OpenAI GPT-4
**数据库**: PostgreSQL + MongoDB + Neo4j + Redis + Qdrant

### 目录结构

```
docs/
├── readme.md                     # 📍 当前文件 - 文档导航
├── architecture/                 # 🏗️ 架构设计
│   ├── overview.md
│   ├── ai-context.md
│   └── improvements-summary.md
├── api/                          # 🔌 API文档
│   └── readme.md
├── guides/                       # 📖 开发指南
│   ├── development.md
│   ├── deployment.md
│   ├── testing.md
│   └── access.md
├── features/                     # ✨ 功能文档
│   ├── data-collection/
│   ├── ai-office/
│   ├── workspace-reporting/
│   └── reports.md
└── archive/                      # 📦 历史文档
    ├── weekly-reports/
    └── ...
```

---

## 🔗 相关资源

### 项目管理

- [项目规则](../project-rules.md) - 编码规范、Git工作流
- [TODO清单](../.claude/TODO.md) - 任务追踪
- [项目状态](../.claude/PROJECT_STATUS.md) - 完成度报告

### 代码仓库

- 前端代码: `frontend/`
- 后端代码: `backend/`
- AI服务: `ai-service/`

### 配置文件

- Prisma Schema: `backend/prisma/schema.prisma`
- 环境变量示例: `.env.example`
- Docker配置: `docker-compose.yml`

---

## 📝 文档贡献

### 文档命名规范 ⚠️

**重要：所有文件名必须使用小写字母**（项目规范 v2.1）

```bash
✅ 正确示例
architecture/overview.md
api/readme.md
guides/deployment-guide.md
features/ai-office/product-spec.md

❌ 错误示例
Architecture/Overview.md        # 目录和文件都不应大写
api/readme.md                   # 文件名不应大写
guides/Deployment_Guide.md      # 不使用下划线或大写
features/AI Office/产品方案.md  # 避免空格和中文文件名
```

详见：[项目规则 - 文件命名规范](../project-rules.md#1-文件与目录命名规范-)

### 文档结构指南

```markdown
# 文档标题

**元信息**: 日期、版本、状态等

## 概述

简要说明文档内容

## 主要内容

详细的技术内容

## 相关文档

链接到相关文档
```

### 更新流程

1. 修改文档内容
2. 更新文档顶部的"最后更新"日期
3. 如有重大改动，更新本README的版本号
4. 提交时使用描述性commit message

---

## 📦 归档说明

`archive/` 目录包含历史文档，仅供参考：

- **周报**: 项目开发过程中的周进度报告（week1-4）
- **历史报告**: 早期的实现状态和总结文档
- **草稿**: 已废弃的设计方案和技术探索
- **产品规划**: 早期的MVP实施计划（archive/planning/）

**注意**: 归档文档可能已过时，请优先参考主文档。

---

## ❓ 常见问题

### Q: 找不到某个功能的文档？

A: 1. 检查本README的功能文档部分 2. 使用文件搜索（Ctrl+P）查找关键词 3. 查看归档目录是否有历史版本

### Q: API文档在哪里？

A: 所有API文档已合并到 [api/readme.md](api/readme.md)

### Q: 如何了解最新的架构改进？

A: 查看 [architecture/improvements-summary.md](architecture/improvements-summary.md)

### Q: 部署时遇到问题怎么办？

A: 1. 查看 [guides/deployment.md](guides/deployment.md) 2. 检查 [guides/access.md](guides/access.md) 确认服务状态 3. 参考项目根目录的 readme.md

---

## 📞 支持与反馈

**技术问题**: 查看相关文档或提Issue
**文档改进建议**: 欢迎PR
**紧急问题**: 联系技术负责人

---

**维护者**: DeepDive Team
**文档仓库**: `docs/`
**最后重组**: 2025-11-15（清理重复文件，优化目录结构）
**命名规范**: v2.1（所有文件名强制小写）

---

<p align="center">
  <strong>DeepDive Engine - AI驱动的知识发现平台</strong><br>
  让知识获取更智能、更高效
</p>
