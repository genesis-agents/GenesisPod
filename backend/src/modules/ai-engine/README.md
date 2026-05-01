# AI Engine — L2 核心能力层

> Genesis 五层架构 (L4 → L3 → L2.5 → L2 → L1) 中的 **L2 引擎层**：
> 提供"原子能力"。无 Agent 概念、无 mission 概念、无 process 概念。
> 上层 (L2.5 ai-harness) 编排这些原子能力组装出 agent 运行时。
>
> **依赖方向**：ai-engine → ai-infra（L1）。**禁止反向 import** ai-harness / ai-app / open-api。
> 唯一例外：`skills/runtime/engine-skill-provider.ts` 实现 harness `ISkillProvider`
> 端口（Dependency Inversion 模式 — adapter 必然 import 它实现的端口接口）。

## 目录结构

```
ai-engine/
├── README.md
├── ai-engine.module.ts           ← 顶层聚合 module（imports 所有子 module）
├── index.ts                       ← top-level barrel
├── facade/                        ★ 外部消费者唯一入口（103 export，6 文件）
│
├── llm/                           ★ LLM 适配层 ——「调一次模型」
│   ├── ai-engine-llm.module.ts    NestJS 装配
│   ├── ai-engine-planning.module.ts  Reflection / IntentDetection / Context Mgmt
│   ├── abstractions/              ILLMAdapter / Message / TaskProfile
│   ├── adapters/                  AiChat / FunctionCalling / Universal LLM Adapter
│   ├── budget/                    TokenBudgetService
│   ├── context/                   ContextCompression
│   ├── factory/                   LLMFactory（按 modelType 选 adapter）
│   ├── intent/                    IntentDetectionService
│   ├── output-parsing/            sanitize-output（13 fix funcs）+ extract-json
│   ├── prompt-adaptation/         按 model tier 适配 prompt
│   ├── prompts/                   公共 prompt 常量
│   ├── reflection/                Reflection / Self-critique
│   ├── selection/                 ModelFallback / ModelElection / ModelRecommendations
│   ├── services/                  AiChat / AiModelConfig / AiApiCaller / AiStreamHandler
│   └── types/                     ChatMessage / TaskProfile / Creativity / OutputLength
│
├── tools/                         ★ Tool 系统 ——「一个工具怎么调一次」
│   ├── ai-engine-tools.module.ts
│   ├── abstractions/              ITool / ToolContext / ToolResult / JSONSchema
│   ├── base/                      BaseTool
│   ├── categories/                40+ built-in tools（按 category 组织）
│   ├── concurrency/               ToolConcurrencyService
│   ├── middleware/                Pipeline + Validation/Timeout/Permission/Progress
│   ├── registry/                  ToolRegistry
│   └── search-fusion/             多源搜索结果 dedup / rerank / fusion
│
├── skills/                        ★ Skill 系统 ——「一个 SKILL.md 怎么 execute」
│   ├── ai-engine-skills.module.ts
│   ├── abstractions/              ISkill / SkillContext / SkillResult / SkillPermissions
│   ├── analytics/                 SkillAnalytics（usage logs）
│   ├── base/                      BaseSkill
│   ├── builder/                   SkillPromptBuilder
│   ├── content/                   SkillContentService（DB CRUD）
│   ├── ecosystem/                 SkillsMP client（外部 skill 市场）
│   ├── loader/                    SkillLoader / SkillCache（DB → Registry）
│   ├── output-manager/            SkillOutputManager
│   ├── registry/                  SkillRegistry（含 PromptSkillAdapter）
│   ├── runtime/                   PromptSkillAdapter / EngineSkillProvider (★ ISkillProvider 端口实现)
│   ├── sandbox/                   SkillSandboxService
│   └── types/                     SkillMdDefinition
│
├── knowledge/                     ★ 知识检索 ——「RAG / Search / Rerank」
│   ├── ai-engine-knowledge.module.ts
│   ├── evidence/                  Evidence 抽取 + 指纹
│   ├── extraction/                ContextEvolution / EntityExtraction
│   ├── rag/                       Embedding / Vector / Chunking / RAGPipeline
│   ├── rerank/                    Rerank adapters
│   ├── search/                    SearchService（多源融合）
│   ├── synthesis/                 Cross-source synthesis
│   └── world-building/            ContextInitialization
│
├── content/                       ★ 内容处理 ——「URL → Markdown / 报告格式化」
│   ├── abstractions/              IContentEngine / IContinuationProtocol
│   ├── citation/                  Citation extraction + dedup
│   ├── fetch/                     ContentFetch / Youtube / PDF
│   ├── figure/                    FigureExtractor
│   ├── image/                     Image 处理
│   └── report-template/           13 类报告格式化标准（constants + pipeline）
│
├── safety/                        ★ 安全 ——「Guardrails / CircuitBreaker / 内容过滤」
│   ├── ai-engine-constraint.module.ts
│   ├── constraint/                SchemaValidator / ContentFilter
│   ├── guardrails/                Input/Output 双向 guardrails pipeline
│   ├── quality/                   Quality gate primitives
│   ├── resilience/                CircuitBreaker
│   └── security/                  CapabilityGuard / URLSanitizer
│
├── core/                          ★ 通用类型 + 错误码（无 service）
│   ├── errors/                    ErrorCodes / 业务异常类
│   ├── exceptions/                AiServiceUnavailable / 等
│   ├── interfaces/                通用工厂 / 解析器接口
│   ├── types/                     agent.types / common.types / event.types
│   └── utils/                     纯函数工具
│
└── abstractions/                  顶层公共抽象（runtime-deps tokens）
```

## 设计原则

1. **0 Agent 概念**：本层不知道什么是 agent / mission / process —— 那都是 L2.5 的事。
2. **0 反向依赖**：通过 verify:arch + ESLint no-restricted-imports 双重看护。
3. **facade 为唯一公共入口**：ai-app / ai-harness 必须从 `@/modules/ai-engine/facade` import。
4. **TaskProfile 优先**：所有 LLM 调用走 `aiChatService.chat({ taskProfile, modelType })`，禁止硬编码 modelId / temperature / maxTokens（CLAUDE.md 红线）。
5. **NestJS module 按子目录就近**：每个能力子域有自己的 `*.module.ts`，集中在 `ai-engine.module.ts` 聚合。

## 与 L2.5 ai-harness 的边界

| 概念                       | 归属         | 原因                              |
| -------------------------- | ------------ | --------------------------------- |
| 调一次 LLM                 | L2 ai-engine | 原子能力                          |
| 跑一次 ReAct loop          | L2.5 harness | 多次 LLM + 多次 tool 的编排       |
| 一个 SKILL.md 的 execute   | L2 ai-engine | 单 skill 的运行                   |
| Agent 怎么造 / 怎么跑      | L2.5 harness | agent / loop / spec / hook        |
| Mission / multi-agent team | L2.5 harness | mission orchestrator + teams      |
| Tool 调用                  | L2 ai-engine | 单 tool（含 middleware pipeline） |
| ToolInvoker（agent 视角）  | L2.5 harness | 有 agent context 的工具调用包装   |

## 看护机制

- **verify:arch**：jest spec 锁定单向依赖（`backend/src/__tests__/architecture/layer-boundaries.spec.ts`）
- **ESLint no-restricted-imports**：`.eslintrc.js` 拦截 ai-engine → ai-harness 反向 import（K-adapter 唯一例外已 allowlist）
- **pre-push hook**：`.husky/pre-push` 第 0 步先跑 verify:arch

## 历史演进

- 早期 `modules/ai-kernel/`（已删，PR-7）：第一代 agent 运行时尝试，能力混进 engine
- `modules/ai-engine/runtime/`（已迁出，PR-X4 ~ PR-X10）：所有 agent 运行时下沉到 ai-harness
- 2026-05-01 (PR-X-Q ~ PR-X-U)：内部颗粒度统一 + 子 module 收到子目录
- 当前架构合规度 **9.85/10**（详见 [CLAUDE.md L4→L3→L2.5→L2→L1 规则](../../../.claude/CLAUDE.md)）
