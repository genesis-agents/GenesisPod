# System Containers

> 系统容器图回答“系统由哪些主要运行单元组成，以及它们怎么分层”。

## 代码信息源

- `backend/src/__tests__/architecture/layer-boundaries.spec.ts`
- `backend/src/app.module.ts`
- `backend/src/modules/ai-app/teams/ai-teams.module.ts`
- `backend/src/modules/ai-app/agent-playground/agent-playground.module.ts`

## 仓库级容器

```mermaid
flowchart LR
    Frontend[frontend]
    Backend[backend]
    AIService[ai-service]
    Infra[infra]
    DB[(PostgreSQL)]
    Cache[(Redis)]
    Blob[(Object Storage)]

    Frontend --> Backend
    Backend --> DB
    Backend --> Cache
    Backend --> Blob
    Backend --> AIService
    Infra -.-> Frontend
    Infra -.-> Backend
    Infra -.-> AIService
```

## 后端五层结构

```mermaid
flowchart TB
    L4[L4 open-api]
    L3[L3 ai-app]
    L25[L2.5 ai-harness]
    L2[L2 ai-engine]
    L1[L1 ai-infra]

    L4 --> L3
    L3 --> L25
    L3 --> L2
    L3 --> L1
    L25 --> L2
    L25 --> L1
    L2 --> L1
```

## 当前活跃多 Agent 系统

| 系统             | 代码目录                                       | 职责                                                        |
| ---------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| AI Teams         | `backend/src/modules/ai-app/teams/`            | Topic 协作、AI 成员、Debate、Team Mission                   |
| Agent Playground | `backend/src/modules/ai-app/agent-playground/` | 结构化 mission pipeline、replay、rerun、leader chat、export |

## 说明

- `ai-app` 承载产品能力，不等于单一多 Agent 引擎。
- `AI Teams` 和 `Agent Playground` 都是活跃系统，但边界不同。
- 公共能力继续下沉到 `ai-harness`、`ai-engine`、`ai-infra`。

## 下钻

- 完整总览见 [../architecture/system-overview.md](../architecture/system-overview.md)
- 数据流见 [data-flows.md](data-flows.md)
