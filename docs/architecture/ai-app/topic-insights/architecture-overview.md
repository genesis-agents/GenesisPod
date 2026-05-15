# AI Insights 架构总览

> **模块**: `backend/src/modules/ai-app/topic-insights/`
> **分层**: L3 AI App (依赖 L2.5 AI Harness + L2 AI Engine)
> **入口 Facade**: `TopicInsightsService` (协调 70+ 子服务)

---

## 1. 分层架构总览

按 Genesis.ai 4 层 + L2.5 Harness 的标准分层，AI Insights 落在 L3 AI App 层。

```mermaid
flowchart TB
    subgraph L4["L4 · Open API"]
        REST["REST Controllers<br/>topic / report / mission /<br/>todo / collaboration"]
        WS["WebSocket Gateway<br/>(topic-insights.gateway.ts)"]
        SSE["SSE Endpoint<br/>/refresh/progress"]
    end

    subgraph L3["L3 · AI App — Topic Insights"]
        FACADE["TopicInsightsService<br/>(Facade)"]

        subgraph CRUD["CRUD & 调度"]
            C1["TopicCrudService"]
            C2["TopicDimensionService"]
            C3["TopicScheduleService"]
            C4["TopicRefreshScheduler"]
            C5["TopicCollaboratorService"]
        end

        subgraph ORCH["Mission 编排"]
            O1["TopicTeamOrchestratorService"]
            O2["MissionLifecycleService<br/>(FSM)"]
            O3["MissionExecutionService"]
            O4["ResearchEventEmitterService"]
        end

        subgraph LEADER["Leader 规划与审核"]
            L1["LeaderPlanningService"]
            L2["LeaderIntentService"]
            L3a["LeaderAgentSelectionService"]
            L4a["LeaderReviewService"]
            L5["ResearchLeaderService"]
        end

        subgraph EXECUTORS["Task Executors"]
            E1["DimensionResearchExecutor"]
            E2["ReviewDimensionExecutor"]
            E3["SynthesisReportExecutor"]
            E4["GenericTaskExecutor"]
        end

        subgraph SEARCH["搜索与数据源"]
            S1["SearchOrchestratorService"]
            S2["QueryStrategyService"]
            S3["ResultFusionService"]
            S4["LlmRerankerAdapter"]
            S5["DataSourceConnectorRegistry"]
            S6["RAGFusionService"]
        end

        subgraph QUALITY["报告与质量"]
            Q1["ReportSynthesisService"]
            Q2["ReportGeneratorService"]
            Q3["ReportEditorService"]
            Q4["ReportQualityGateService<br/>(10 维度)"]
            Q5["CredibilityReportService"]
            Q6["EvidenceManagementService"]
            Q7["CitationFormatterService"]
        end

        subgraph REGISTRY["注册项 (onModuleInit)"]
            R1["TopicInsightsAgent<br/>→ AgentRegistry"]
            R2["TOPIC_INSIGHTS_TEAM_CONFIG<br/>→ TeamRegistry"]
            R3["RESEARCH_LEAD_ROLE<br/>→ RoleRegistry"]
            R4["35+ Skills (.md)<br/>→ SkillRegistry"]
        end
    end

    subgraph L25["L2.5 · AI Harness"]
        H1["AgentRegistry"]
        H2["TeamRegistry"]
        H3["RoleRegistry"]
        H4["SkillRegistry / SkillLoader"]
        H5["Mission / Lifecycle hooks"]
    end

    subgraph L2["L2 · AI Engine"]
        EN1["ChatFacade<br/>(LLM 调用)"]
        EN2["EmbeddingService"]
        EN3["RAG / Vector"]
        EN4["TaskProfile<br/>(creativity/outputLength)"]
    end

    subgraph L1["L1 · Infra"]
        I1["PrismaModule<br/>(PostgreSQL)"]
        I2["StorageModule<br/>(R2 对象存储)"]
        I3["CreditsModule"]
        I4["NotificationModule"]
        I5["SecretsModule"]
    end

    REST --> FACADE
    WS --> FACADE
    SSE --> FACADE

    FACADE --> CRUD
    FACADE --> ORCH

    ORCH --> LEADER
    ORCH --> EXECUTORS
    ORCH --> O4

    EXECUTORS --> SEARCH
    EXECUTORS --> QUALITY
    LEADER --> EN1
    EXECUTORS --> EN1
    QUALITY --> EN1

    REGISTRY -.注册.-> H1
    REGISTRY -.注册.-> H2
    REGISTRY -.注册.-> H3
    REGISTRY -.注册.-> H4

    SEARCH --> EN2
    SEARCH --> EN3
    QUALITY --> I2
    CRUD --> I1
    ORCH --> I1
    FACADE --> I3
    ORCH --> I4

    classDef l4 fill:#fef3c7,stroke:#d97706
    classDef l3 fill:#dbeafe,stroke:#2563eb
    classDef l25 fill:#e0e7ff,stroke:#4f46e5
    classDef l2 fill:#dcfce7,stroke:#16a34a
    classDef l1 fill:#f3f4f6,stroke:#6b7280
    class L4,REST,WS,SSE l4
    class L3,FACADE,CRUD,ORCH,LEADER,EXECUTORS,SEARCH,QUALITY,REGISTRY l3
    class L25,H1,H2,H3,H4,H5 l25
    class L2,EN1,EN2,EN3,EN4 l2
    class L1,I1,I2,I3,I4,I5 l1
```

> 关键约束: **AI App 只通过 ChatFacade / Registry 访问 AI Engine 与 Harness, 禁止穿透内部路径**。

---

## 2. Mission 执行流程 (Leader-Driven)

用户点击「开始研究」后, Mission 在 `PLANNING → PLAN_READY → EXECUTING → REVIEWING → COMPLETED` 五态间推进, 每一步都通过 `ResearchEventEmitterService` 向 WebSocket 推流。

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend<br/>(TopicResearchTab)
    participant API as REST API
    participant ORCH as TopicTeamOrchestrator
    participant LEAD as LeaderPlanning
    participant EXEC as MissionExecution
    participant DR as DimensionResearchExecutor
    participant SO as SearchOrchestrator
    participant LLM as ChatFacade<br/>(AI Engine)
    participant SYN as SynthesisReportExecutor
    participant DB as PostgreSQL
    participant R2 as R2 Storage
    participant WS as WebSocket Gateway

    User->>FE: 点击「开始研究」
    FE->>API: POST /topics/:id/refresh
    API->>ORCH: orchestrate(topicId)

    ORCH->>DB: 创建 ResearchMission (PLANNING)
    ORCH-->>WS: emit mission:started
    WS-->>FE: mission:started

    ORCH->>LEAD: planResearch(topic)
    LEAD->>LLM: 维度规划 prompt
    LLM-->>LEAD: leaderPlan (JSON)
    LEAD->>DB: 写入 leaderPlan + 维度
    ORCH-->>WS: emit leader:plan_ready

    ORCH->>EXEC: execute(missionId)

    par 并行维度研究 × N
        EXEC->>DR: research(dimension)
        DR->>SO: search(queries)
        SO->>SO: 12 个适配器并行调用<br/>(WebSearch / Academic / GitHub / ...)
        SO->>LLM: rerank top-K
        LLM-->>SO: ranked sources
        SO-->>DR: 融合后的证据集
        DR->>LLM: 维度写作 prompt
        LLM-->>DR: DimensionAnalysis
        DR->>DB: TopicEvidence + DimensionAnalysis
        DR-->>WS: emit dimension:completed
    end

    EXEC->>LEAD: reviewDimensions()
    LEAD->>LLM: 审核 prompt
    alt 需修订
        LEAD-->>DR: NEEDS_REVISION (循环)
    else 通过
        LEAD-->>EXEC: APPROVED
    end

    EXEC->>SYN: synthesize()
    SYN->>LLM: 综合报告 prompt (long output)
    LLM-->>SYN: fullReport (Markdown)
    SYN->>R2: 上传 fullReport
    R2-->>SYN: fullReportUri
    SYN->>DB: TopicReport (status=COMPLETED)
    SYN-->>WS: emit report:completed
    WS-->>FE: report:completed
    FE->>API: GET /reports/latest
    API-->>FE: TopicReport
    FE->>User: 渲染报告
```

---

## 3. 数据模型关系

PostgreSQL 单库存储, JSON 字段承担灵活配置, 大字段 (fullReport / dataPoints) 离线到 R2 仅存 URI。

```mermaid
erDiagram
    User ||--o{ ResearchTopic : owns
    ResearchTopic ||--o{ TopicDimension : has
    ResearchTopic ||--o{ TopicReport : generates
    ResearchTopic ||--o{ ResearchMission : drives
    ResearchTopic ||--o{ TopicCollaborator : shares
    ResearchTopic ||--|| TopicSchedule : schedules
    ResearchTopic ||--o{ TopicRefreshLog : logs

    ResearchMission ||--o{ ResearchTask : breakdown
    ResearchMission ||--o{ TopicDimension : assigns
    ResearchTask ||--o{ AgentStep : traces

    TopicReport ||--o{ DimensionAnalysis : aggregates
    TopicDimension ||--o{ DimensionAnalysis : analyzed_by
    DimensionAnalysis ||--o{ TopicEvidence : cites

    ResearchTopic {
        string id PK
        string userId FK
        string name
        enum type "MACRO/TECHNOLOGY/COMPANY/EVENT"
        enum visibility "PRIVATE/SHARED/PUBLIC"
        json topicConfig
        enum refreshFrequency
        datetime lastRefreshAt
        int totalReports
    }

    ResearchMission {
        string id PK
        string topicId FK
        enum status "PLANNING/PLAN_READY/EXECUTING/REVIEWING/COMPLETED"
        json leaderPlan
        string userPrompt
        int totalTasks
        int completedTasks
        int progressPercent
    }

    ResearchTask {
        string id PK
        string missionId FK
        string taskType
        string assignedAgent
        string modelId
        string[] skills
        string[] tools
        enum status
        json result
        int tokensUsed
        decimal costUsd
    }

    TopicReport {
        string id PK
        string topicId FK
        int version
        string executiveSummary
        text fullReport
        string fullReportUri "R2 URL"
        json highlights
        json charts
        int totalSources
        int totalTokens
        json qualityScores
    }

    TopicDimension {
        string id PK
        string topicId FK
        string missionId FK
        string name
        json searchQueries
        enum status
        int sortOrder
    }

    DimensionAnalysis {
        string id PK
        string dimensionId FK
        string reportId FK
        string summary
        json keyFindings
        json dataPoints
        string dataPointsUri "R2 URL"
        string modelUsed
    }

    TopicEvidence {
        string id PK
        string analysisId FK
        string source "URL"
        string type
        float confidence
        float relevanceScore
    }

    AgentStep {
        string id PK
        string taskId FK
        enum stepType "OBSERVE/THINK/PLAN/TOOL_CALL/..."
        text content
        string toolUsed
        json result
    }
```

---

## 4. 前后端实时通信

Zustand store 接 REST + WebSocket 双通道, REST 走「请求-响应」, WebSocket 走「Mission 进度流」。

```mermaid
flowchart LR
    subgraph FE["Frontend"]
        UI["app/ai-insights/<br/>topic / topic-research"]
        ZS["topicInsightsStore<br/>(Zustand)"]
        REST_C["services/topic-insights/api.ts<br/>(fetchWithAuth)"]
        WS_HOOK["useResearchWebSocket"]
        SSE_HOOK["useSSE (refresh)"]
    end

    subgraph BE["Backend"]
        CTRL["Controllers (7)"]
        GW["topic-insights.gateway"]
        SVC["TopicInsightsService"]
        EMIT["ResearchEventEmitter"]
    end

    UI --> ZS
    ZS --> REST_C
    ZS --> WS_HOOK
    ZS --> SSE_HOOK

    REST_C -- "GET/POST/PATCH<br/>JWT Bearer" --> CTRL
    WS_HOOK -- "socket.io<br/>+ JWT" --> GW
    SSE_HOOK -- "EventSource" --> CTRL

    CTRL --> SVC
    GW --> SVC
    SVC --> EMIT
    EMIT -. "mission:* / leader:* /<br/>agent:* / task:* /<br/>dimension:* / report:*" .-> GW
    GW -. push .-> WS_HOOK
    WS_HOOK -. "更新<br/>refreshProgress<br/>teamMessages<br/>agentActivities" .-> ZS
    ZS --> UI

    classDef fe fill:#dbeafe,stroke:#2563eb
    classDef be fill:#fef3c7,stroke:#d97706
    class FE,UI,ZS,REST_C,WS_HOOK,SSE_HOOK fe
    class BE,CTRL,GW,SVC,EMIT be
```

**WebSocket 事件分类**:

| 命名空间      | 事件                                                          | 触发点                       |
| ------------- | ------------------------------------------------------------- | ---------------------------- |
| `mission:*`   | started / progress / completed / failed                       | MissionLifecycleService      |
| `leader:*`    | thinking / planning / plan_ready                              | LeaderPlanningService        |
| `agent:*`     | working / completed / failed                                  | AgentActivityService         |
| `task:*`      | started / progress / completed / failed                       | MissionExecutionService      |
| `dimension:*` | research_started / progress / completed                       | DimensionResearchExecutor    |
| `report:*`    | synthesis_started / progress / completed                      | SynthesisReportExecutor      |
| `todo:*`      | created / status_changed / reviewing / reviewed               | ResearchTodoService          |

---

## 5. 关键架构亮点

| 亮点               | 实现                                                                        |
| ------------------ | --------------------------------------------------------------------------- |
| **Facade 单入口**  | `TopicInsightsService` 协调 70+ 子服务, 控制器只看到 1 个对外 API           |
| **Leader 闭环**    | 规划 → 派发 → 维度执行 → 审核 → 综合, Leader 可要求 NEEDS_REVISION 再循环   |
| **多源融合**       | 12 个搜索适配器 (Web/学术/GitHub/社交/金融/政策/天气/PubMed/RAG) 并行召回   |
| **质量门禁**       | `ReportQualityGateService` 按 10 维度评分, 不合格触发 `SectionRemediation`  |
| **实时可观测性**   | WebSocket 推 Leader 思考、Agent 活动、维度进度; SSE 推刷新进度              |
| **大字段离线存储** | `fullReport` / `dataPoints` 写 R2, DB 仅存 URI, 单库不爆                    |
| **跨模块导出**     | `TOPIC_INSIGHTS_DATA_EXPORT` token 供 Office/Slides 模块消费                |
| **声明式 Agent**   | `TopicInsightsAgent` 带 capabilities/templates, 注册到 AgentRegistry 供路由 |

---

## 6. 关键文件路径速查

```
backend/src/modules/ai-app/topic-insights/
├── topic-insights.module.ts          ← 70+ 服务的依赖注入
├── topic-insights.service.ts         ← Facade 入口
├── topic-insights.gateway.ts         ← WebSocket
├── controllers/                      ← 7 个 REST 控制器
├── services/
│   ├── topic-team-orchestrator.service.ts
│   ├── mission-lifecycle.service.ts
│   ├── leader-planning.service.ts
│   ├── leader-review.service.ts
│   ├── executors/
│   │   ├── dimension-research.executor.ts
│   │   ├── review-dimension.executor.ts
│   │   └── synthesis-report.executor.ts
│   ├── search/
│   │   ├── search-orchestrator.service.ts
│   │   ├── adapters/  (12 个数据源适配器)
│   │   └── data-source-connector-registry.ts
│   └── report/
│       ├── report-synthesis.service.ts
│       ├── report-quality-gate.service.ts
│       └── credibility-report.service.ts
├── agents/topic-insights.agent.ts    ← 注册到 AgentRegistry
├── teams/topic-insights-team.config.ts
└── skills/                           ← 35+ 个 .md skill 定义

frontend/
├── app/ai-insights/                  ← 页面入口
├── components/ai-insights/           ← UI 组件树
├── stores/topicInsightsStore.ts      ← Zustand
├── services/topic-insights/api.ts    ← REST 客户端
├── hooks/useResearchWebSocket.ts     ← WebSocket
└── types/topic-insights.ts

backend/prisma/schema/
└── models.prisma                     ← ResearchTopic / TopicReport /
                                          ResearchMission / ResearchTask /
                                          TopicDimension / TopicEvidence /
                                          DimensionAnalysis / AgentStep
```
