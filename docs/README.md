# Genesis.ai 文档

> 企业级 AI 深度研究和内容管理平台。本目录的结构与 `backend/src/modules/` 实际代码 1:1 对应；模块内部细节以代码内 `README.md` 为单一信息源。

---

## 顶层目录

| 目录            | 内容                                             |
| --------------- | ------------------------------------------------ |
| `architecture/` | 与代码 1:1 对齐的架构文档，按 4+1 层组织         |
| `guides/`       | 开发、部署、测试、运维指南                       |
| `decisions/`    | 架构决策记录（ADR）                              |
| `api/`          | 对外 API 接口文档                                |
| `research/`     | 行业调研、SOTA 对标资料                          |
| `demo/`         | 演示样例文档                                     |
| `slides/`       | 内部分享 HTML / 资料                             |
| `_archive/`     | 历史快照、旧 PRD、已完成的迁移计划、阶段性 audit |

---

## 五层架构（与代码完全一致）

依赖方向严格单向：`L4 → L3 → L2.5 → L2 → L1`

```
┌────────────────────────────────────────────────────────────────────┐
│  L4  Open API           backend/src/modules/open-api/              │
│      对外 MCP / A2A / Public API / Webhooks                        │
├────────────────────────────────────────────────────────────────────┤
│  L3  AI Apps            backend/src/modules/ai-app/                │
│      17 个业务模块（agent-playground / research / writing / ...）  │
├────────────────────────────────────────────────────────────────────┤
│  L2.5 AI Harness        backend/src/modules/ai-harness/            │
│      11 个 agent 运行时聚合（runner / agents / teams / memory …）  │
├────────────────────────────────────────────────────────────────────┤
│  L2  AI Engine          backend/src/modules/ai-engine/             │
│      9 个原子能力聚合（llm / tools / rag / skills / planning …）   │
├────────────────────────────────────────────────────────────────────┤
│  L1  AI Infrastructure  backend/src/modules/ai-infra/              │
│      14 个底座（auth / credits / storage / monitoring / …）        │
└────────────────────────────────────────────────────────────────────┘

前端  Frontend           frontend/app/              页面与组件
```

详细规则见 [`.claude/CLAUDE.md`](../.claude/CLAUDE.md)。

---

## 快速导航

### 按层定位

- [架构总览](architecture/README.md)
- [L3 AI Apps](architecture/ai-app/README.md) — 业务模块
- [L2.5 AI Harness](architecture/ai-harness/README.md) — Agent 运行时
- [L2 AI Engine](architecture/ai-engine/README.md) — 原子能力
- [L1 AI Infrastructure](architecture/ai-infra/README.md) — 基础设施
- [L4 Open API](architecture/open-api/README.md) — 对外接口
- [Frontend](architecture/frontend/README.md) — 前端

### 跨层指南

- [开发规范](guides/development/) — AI 调用规范、环境变量、自动化循环
- [部署](guides/deployment/) — Railway / 多环境管理 / 发布流程
- [测试](guides/testing/) — 测试策略
- [运维](guides/operations/) — 服务管理、功能公告流程
- [认证](guides/authentication/) — Google OAuth
- [Claude Code 使用](guides/claude-code/) — Skills 生态

### 决策与变更

- [ADR](decisions/) — 已落地的架构决策
- [CHANGELOG](guides/CHANGELOG.md)
- [基础设施变更日志](architecture/ai-infra/CHANGELOG.md)

---

## 文档维护原则

1. **代码是唯一信息源**：模块结构变更，先改代码 README，再补本目录的链接索引
2. **结构镜像代码**：新增模块时 `architecture/{layer}/{module}/` 同步建立
3. **历史快照入 `_archive/`**：已落地的迁移计划、过期 audit、旧 PRD 不删，按季度归档
4. **kebab-case 命名**：全小写、连字符分隔
5. **不创建 v2.md**：原地更新，不留 `-v2` `-v3` 文件

---

**目录结构版本**：v4.0（与代码 1:1 镜像）
**最后更新**：2026-05-04
