# Architecture

> 与 `backend/src/modules/` 实际代码 1:1 镜像。每个目录对应一个真实代码模块；模块内部细节以代码内 `README.md` 为准，本目录保存设计文档、迁移记录、子能力说明。

## 五层结构

| 层   | 目录                                  | 代码路径                          | 子模块数 | 索引                                    |
| ---- | ------------------------------------- | --------------------------------- | -------: | --------------------------------------- |
| L4   | [`open-api/`](open-api/README.md)     | `backend/src/modules/open-api/`   |       11 | 对外 MCP / A2A / Public API / Webhooks  |
| L3   | [`ai-app/`](ai-app/README.md)         | `backend/src/modules/ai-app/`     |       17 | 业务应用模块                            |
| L2.5 | [`ai-harness/`](ai-harness/README.md) | `backend/src/modules/ai-harness/` |       11 | Agent 运行时与编排                      |
| L2   | [`ai-engine/`](ai-engine/README.md)   | `backend/src/modules/ai-engine/`  |        9 | 原子能力（LLM / tools / rag / skills…） |
| L1   | [`ai-infra/`](ai-infra/README.md)     | `backend/src/modules/ai-infra/`   |       14 | 基础设施底座                            |
| 前端 | [`frontend/`](frontend/README.md)     | `frontend/`                       |        - | Next.js 14 应用                         |

## 依赖方向（强约束）

```
L4 open-api → L3 ai-app → L2.5 ai-harness → L2 ai-engine → L1 ai-infra
```

- `ai-engine` 不知道 agent / mission 概念；这些是 `ai-harness` 的事
- `ai-app` 必须通过 `ai-engine/facade` 与 `ai-harness/facade` 消费下层，禁止穿透内部路径
- 反向 import 由 ESLint `no-restricted-imports` + `verify:arch` jest spec + pre-push hook 三层看护
- 详见 [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) 中 "AI 架构分层" 一节

## 历史演进

- 2026-05-02 (W17 / W20)：`ai-engine` 顶层 `core/` 与 `abstractions/` 解散，补齐 `rag/` `planning/`，撤销重复 `credentials/`
- 2026-05-01 (PR-X-Q ~ PR-X-U)：内部颗粒度统一，子 module 收敛到子目录
- 早期 `ai-kernel/`（PR-7 删除）+ `ai-engine/runtime/`（PR-X4~X10 迁出）+ `intent-gateway/`（PR-X29 删除）：早期分层尝试，相关历史文档见 [`_archive/2026-q2/`](../_archive/2026-q2/)

## 当前架构合规度

**9.85/10**（详见 `backend/src/modules/ai-engine/README.md`）。
