# Mission Runtime 契约单一真源 — Harness 平台层系统设计（权威）

**日期**: 2026-05-22
**作者**: Claude Code（综合 Codex 平台层诊断 + 本会话运行时实证 + Radar/Social 跨 app 勘探）
**状态**: 设计待评审（架构大决策；评审通过后分波次实施）
**适用范围**: 全部 mission 型 AI app — **agent-playground / AI Radar / AI Social**，以及未来任何跑在同一 harness 上的 mission app（writing / report / …）
**定位**: 本文件是 **mission runtime 平台语义的单一真源（single source of truth）**。任何 mission app 涉及"配置 / 预算 / 时间 / 状态 / 失败 / abort / rerun / 存活"的实现，以本文件契约为准；与本文件冲突的散落实现一律视为待迁移的技术债。

---

## 0. 一句话

把 **mission 的真实配置、真实预算、真实时间、真实状态、真实失败原因、真实 abort 语义、rerun 真输入、存活回收** 从"每个 app 各自发明 + 多处投影"收口为 **ai-harness 平台层的类型化 canonical 契约**，并建立**多层看护机制**强制所有 mission app 消费同一套契约——使系统**结构上不可腐朽**，而非靠人自觉。app 只声明业务语义（depth 档位 / style / leader 业务态 / UI）。

---

## 1. 背景、定级、范围

### 1.1 这是一类系统级病（不是单点 bug）

同一运行时语义在"生产方 / 消费方 / 持久化 / 前端 / 跨 app"各定义一份 → 漂移。已实证实例（见 §2 全景表）：

- 预算换算 `×1000 / ×0.002` 数学只在 harness framework 一处，但 3 个 app 又各自发明了**第二套估算**（playground 400K token 基线 / social `0.05×平台` USD / radar 静态 50）→ 单位与口径漂移，local rerun guard 甚至把 credits 当 USD 比。
- wall-time：`wallTimeMs` 字段在 **social 表=实测耗时**、**radar 表=配置上限**——**跨 app 同名异义**；playground 同表内 cap/elapsed 也曾混。
- 失败原因：真因 `budget_exhausted` 被层层改写成 `cancelled` 再成"失联/pod 重启"；social 自己 inline 4 个 failureCode **却不落库**；radar 纯 message 正则。
- abort：`MissionAbortRegistry.abort(id, reason?: string)` 裸字符串；**social 的"取消"根本不调 abort，正在跑的 mission 不真停，继续烧预算**（功能缺陷，非仅风格）。
- 配置快照：input → row+JSON → rerun 重拼 → hydrate 重拼 → 前端再拼（playground 5 处）；social retry 从 task 表重拼；radar 用 payload blob。
- 存活回收：**radar / social 都建了 `heartbeatAt/podId` 列和 `[status,heartbeatAt]` 索引，却都没注册 liveness adapter** → 心跳写了没人扫 → 孤儿 `running` 行永不回收（radar store JSDoc 甚至虚假宣称"Liveness guard 扫描"）。

> 只要 writing / radar / social / report 等都跑在同一 harness 上，这些坑必然复现。**这是平台 contract 缺口，必须在 harness 收口。**

### 1.2 关键前提：harness 平台层"半成品已在"，三 app 已复用框架

设计**不是从零建地基**：

| 已存在（harness）                                                                                       | 文件                                                                          | 三 app 复用情况                                     |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| `MissionRuntimeShellFramework`（lifecycle runtime：wallTimer/heartbeat/abort/cleanup + 建 budget pool） | `ai-harness/teams/business-team/lifecycle/mission-runtime-shell.framework.ts` | **playground / radar / social 全部经 adapter 复用** |
| `MissionBudgetPool`（`maxTokens=credits×1000`、`maxCostUsd=credits×0.002`）                             | `ai-harness/guardrails/budget/mission-budget-pool.ts`                         | 三者全用（池机制）；但**估算/换算各写一套**         |
| `MissionAbortRegistry`                                                                                  | `ai-harness/lifecycle/mission-lifecycle/abort-registry.ts`                    | reason=裸字符串；radar 真接、**social 不接**        |
| `MissionLivenessGuard`（孤儿回收）                                                                      | `ai-harness/lifecycle/mission-lifecycle/mission-liveness-guard.service.ts`    | **仅 playground 注册 adapter**；radar/social 漏注册 |
| `mission-store.interface` / lifecycle-manager / runtime-state-store / rerun primitive                   | `ai-harness/lifecycle/mission-lifecycle/*`                                    | rerun primitive **三 app 都没用**                   |

**核心判断**：adapter 模式是对的。缺的是 **把 adapter 的输入输出做成类型化 canonical 契约**，并让 framework / pool / registry / guard 成为这些契约的唯一产出/消费点 + **强制每个 app 实现 adapter conformance**。P0 大多是"提升已有散落值为 canonical + 改消费方"，非 greenfield。

### 1.3 范围边界

- **本设计覆盖**：mission runtime 的 8 类平台契约（§4）+ 已落地的 stage-boundary 契约机制（§4.9）+ 看护机制（§7）。
- **本设计不覆盖**（留各 app 业务层，§12）：depth 档位名、budgetProfile 文案、style/audience/searchTimeRange、leader 签字业务解释、维度工具矩阵、章节/字数业务契约、页面交互。

---

## 2. 现状全景（跨 app 证据表）

> 来源：本会话 playground 实证 + Radar/Social 只读勘探（file:line 见各 app 适配清单 §6）。

| 契约域             | agent-playground                                             | AI Radar                                          | AI Social                              | 漂移程度                           |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------- | ---------------------------------- |
| Lifecycle 框架     | ✅ framework                                                 | ✅ framework                                      | ✅ framework                           | 低（已统一）                       |
| BudgetPool 机制    | ✅ pool                                                      | ✅ pool                                           | ✅ pool                                | 低（已统一）                       |
| **预算估算/换算**  | 400K token 基线 × mult                                       | 静态 50 / 10                                      | `0.05×平台×factor` USD                 | **高（三套）**                     |
| **status 值域**    | 5 态 + quality-failed + starting 占位                        | 5 态(running/completed/failed/cancelled/rejected) | 实写 3 态(注释写 4) + 并行 task 状态机 | **高（不一致）**                   |
| **failureCode**    | dispatcher 分类 + BUDGET_EXHAUSTED（本会话加，未 canonical） | 纯 message 正则                                   | inline 4 码**不落库**                  | **高（无 canonical）**             |
| **abort/cancel**   | 真停 + signal.reason 分类                                    | 真停（session.missionAbort）                      | **假停（不调 abort，不真停）**         | **高（功能缺陷）**                 |
| **wall-time 字段** | 注释澄清(本会话)                                             | `wallTimeMs`=上限 + `durationMs`=实测             | `wallTimeMs`=实测（与 radar 同名异义） | **高（二义+跨 app 冲突）**         |
| **配置快照**       | input→row+userProfile，5 处重拼                              | payload JSON blob + 启动时从 topic hydrate        | 类型化列 + retry 从 task 表重拼        | **高（无 canonical snapshot）**    |
| **rerun/resume**   | 完整子系统（自建，未用 harness primitive）                   | 业务重刷                                          | 重拼 DTO 全新跑                        | **高（都不用 harness primitive）** |
| **liveness 注册**  | ✅ 注册 adapter                                              | ❌ 漏注册（孤儿不回收）                           | ❌ 漏注册（孤儿不回收）                | **高（缺陷）**                     |

---

## 3. 分层原则

```
Harness 平台层（mission runtime 语义；所有 mission app 共享；强约束 + 看护）
  canonical 类型 + framework/pool/registry/guard 产出&消费它们
  ──────────────────────────────────────────────
        ▲ adapter（每 app 实现 + conformance 测试强制）
  ──────────────────────────────────────────────
ai-app 业务层（每 app 自己的业务语义；不上提）
  depth 档位 / budgetProfile 文案 / style / audience / searchTimeRange
  leader 签字业务解释 / 工具矩阵 / 章节字数契约 / UI 展示交互
```

**MECE 红线（看护机制强制，§7）**：

1. harness 不认识 `depth=quick|deep`，只接收解析后的 `ResolvedRuntimeLimits` / `ResolvedBudgetCaps`。
2. 任何地方禁止 `credits×0.002` / `credits×1000` / `×0.05` 等估算换算散落 —— 只能读 `ResolvedBudgetCaps` / 调 canonical estimator。
3. 歧义字段 `wallTimeMs` 全栈禁用；拆 `wallTimeCapMs`（上限）/ `elapsedWallTimeMs`（耗时）。
4. failure/abort 只认 canonical enum；app 仅可在"映射到平台终态"处扩展业务态。
5. 每个 mission app **必须**注册 liveness adapter + 实现 abort 真停 + 实现 rerun policy（缺一者 conformance 测试红）。

---

## 4. 完整 canonical 契约清单（平台单一真源）

> 9 类。每类给：**现状 → 目标 → 产出方 → 消费方 → 落点 → 红线**。命名/字段为建议，评审定稿。

### C1 `MissionAbortReason`（enum）— P0

- 现状：`abort(id, reason?: string)` 裸串；radar 传 `"user_cancelled"`，social 不传，playground dispatcher 字符串比对。
- 目标：`enum MissionAbortReason { user_cancelled, budget_exhausted, wall_time_exceeded, mission_row_missing, superseded, orchestrator_shutdown }`
- 产出：所有 abort 调用方（s\*预算 stage / framework wallTimer / controller cancel）传 enum。
- 消费：dispatcher 按 enum→终态映射；不再字符串 if。
- 落点：`abort-registry.ts` 改签名 `abort(id, reason: MissionAbortReason)`。
- 红线：禁止裸字符串 abort reason（看护 §7-L3）。

### C2 `MissionFailure`（failureCode + category + source，enum 组）— P0

- 现状：失败原因来自 abort reason / markFailed message / liveness 兜底 / 前端 banner / app 手拼；无 canonical；social inline 4 码不落库；radar 纯 message。harness 已有**agent 级** taxonomy（`tracing/observability/failure-extraction.utils.ts`）但未升 mission 级。
- 目标：
  ```ts
  enum MissionFailureCode {
    user_cancelled,
    budget_exhausted,
    wall_time_exceeded,
    mission_row_missing,
    leader_signoff_rejected,
    provider_error,
    runtime_crashed,
    unknown,
  }
  enum FailureCategory {
    cancellation,
    budget,
    time,
    quality,
    infra,
    provider,
    unknown,
  }
  enum FailureSource {
    runtime,
    liveness,
    business_gate,
    persistence,
    provider,
  }
  interface MissionFailure {
    code: MissionFailureCode;
    category: FailureCategory;
    source: FailureSource;
    message: string; /*human*/
  }
  ```
- 产出：dispatcher 写 canonical；liveness-guard **仅在 failureCode 尚空时**兜底（不得覆盖已有 code）。
- 消费：DB 落 `failure_code/category/source`（三 app 表都加列）；前端**永远优先**按 code 出文案。
- 落点：`ai-harness/lifecycle/mission-lifecycle/abstractions/mission-failure.ts`（新）；复用既有 agent 级 taxonomy 做映射。
- 红线：app 不得用裸 message 表达失败类别；liveness 不得覆盖已有 code。

### C3 `ResolvedBudgetCaps` + `MissionCostEstimator`（值对象 + 端口）— P0

- 现状：换算 `×1000/×0.002` 只在 framework；但 3 app 各发明估算（400K / 0.05×平台 / 静态）。
- 目标：
  ```ts
  interface ResolvedBudgetCaps {
    maxCredits;
    maxTokens;
    maxCostUsd;
    budgetMultiplier;
    source: "default" | "override" | "inherited";
    resolvedAt: ISO;
  }
  // 唯一换算常量 + 估算端口
  const CREDITS_TO_TOKENS = 1000;
  const CREDITS_TO_USD = 0.002;
  interface MissionCostEstimator {
    estimate(businessSignals): { credits: number };
  }
  ```
- 产出：harness 唯一 `resolveBudgetCaps(credits, multiplier, source)`（含唯一换算数学）；各 app 实现 `MissionCostEstimator`（业务信号→credits），但**换算→caps 一律走 harness**。
- 消费：budget pool / rerun guard / UI DTO（`GET /budget-tiers` 的 capUsd）/ event payload / diagnostics 全读 caps。
- 落点：`ai-harness/guardrails/budget/resolved-budget-caps.ts`（新）；`MissionBudgetPool` 改消费它。
- 红线：删全栈 `×0.002 / ×1000 / ×0.05` 散落；禁止把 credits 当 USD。

### C4 `ResolvedRuntimeLimits` + `MissionLifecycleMetrics`（值对象，含 wall-time 拆字段）— P0

- 现状：`wallTimeMs` 二义且跨 app 同名异义。
- 目标：`interface ResolvedRuntimeLimits { wallTimeCapMs; maxIterations?; maxConcurrentAgents? }` / `interface MissionLifecycleMetrics { elapsedWallTimeMs; iterations? }`
- 落点：harness abstractions；**三 app DB 手写迁移**：明确区分 cap 列与 elapsed 列（radar `wallTimeMs`→`wallTimeCapMs`、`durationMs`→`elapsedWallTimeMs`；social `wallTimeMs`(实测)→`elapsedWallTimeMs` + 新增 `wallTimeCapMs`）；event/DTO/UI 跟改名。
- 红线：全栈禁用裸 `wallTimeMs`。

### C5 `MissionConfigSnapshot`（值对象）— P1

- 现状：playground 5 处重拼；social retry 从 task 表重拼；radar payload blob。
- 目标：
  ```ts
  interface MissionConfigSnapshot {
    schemaVersion;
    resolvedAt;
    topic;
    language;
    businessInput /*app 不透明*/;
    budget: ResolvedBudgetCaps;
    runtimeLimits: ResolvedRuntimeLimits;
    sourceMissionId?;
  }
  ```
- 产出：`openSession()` 解析一次 + 持久化（三 app 行加 `config_snapshot` JSONB + version）。
- 消费：run/rerun/resume/hydrate **一律只读 snapshot**。
- 落点：harness abstractions + store interface 扩 `config_snapshot`。

### C6 `MissionInputRebuilder`（service）— P1

- 现状：playground 自建 rerun 子系统；social 重拼 DTO；radar 业务重刷；**都不用 harness rerun primitive**。
- 目标：`buildForFreshRun / buildForFullRerun(snapshot,patch?) / buildForIncrementalRerun(snapshot,checkpoint,patch?) / buildForLocalRerun(snapshot,targetStage,patch?)`，全部从 `MissionConfigSnapshot` 还原。
- 落点：`ai-harness/lifecycle/mission-lifecycle/rerun/`（已有目录，扩 rebuilder）。
- 红线：app 不得自己拼 budget/time/status 敏感字段。

### C7 `CanonicalMissionState`（三层状态）— P2

- 现状：DB 状态值域三 app 不一（radar 5/social 3）；playground `starting` 占位 + `quality-failed` 当可读完成；其它模块 legacy 全大写。
- 目标三层：
  ```ts
  enum MissionLifecycleStatus { starting, running, succeeded, failed, cancelled } // 平台状态机
  enum MissionTerminalOutcome { success, failure, cancelled, quality_rejected }   // 终态业务映射
  interface MissionPresentationState { ... }                                      // 前端聚合
  ```
- 红线：平台 lifecycle 不掺业务语义（quality-failed 是 outcome 不污染基础状态机）。

### C8 `MissionLivenessContract`（强制注册）— P0（缺陷修复）

- 现状：radar/social 建了 heartbeat 列却没注册 liveness adapter → 孤儿行永不回收。
- 目标：harness 提供 `registerMissionLiveness(adapter)`；**conformance 测试要求每个 mission app 必须注册**（否则红）。
- 落点：`ai-harness/lifecycle/mission-lifecycle/mission-liveness-guard.service.ts` + 看护 §7-L5。

### C9 Stage-boundary 契约机制（已落地，纳入单一真源）— DONE

- 本会话已建：`assertNumberProducerWithinSchema` + `STAGE_NUMBER_CONTRACTS` 注册表（playground）。
- 纳入本文件：作为"生产方范围 ⊆ 消费方 schema"的平台测试基元；后续 radar/social 的 stage→agent 数值边界也登记同一机制。
- 落点：`ai-harness/agents/dev-tools/contract-assertions.ts`（已在 harness）。

---

## 5. canonical 契约详表（产出/消费/落点速查）

| 契约                       | 产出方(唯一)                              | 消费方                    | harness 落点                              | 波次 |
| -------------------------- | ----------------------------------------- | ------------------------- | ----------------------------------------- | ---- |
| C1 AbortReason             | abort 调用方                              | dispatcher 映射           | abort-registry.ts                         | P0   |
| C2 MissionFailure          | dispatcher / liveness 兜底                | DB / 前端文案 / metrics   | abstractions/mission-failure.ts           | P0   |
| C3 BudgetCaps + Estimator  | harness resolveBudgetCaps + app estimator | pool / guard / UI / event | guardrails/budget/resolved-budget-caps.ts | P0   |
| C4 RuntimeLimits + Metrics | framework / lifecycle.helper              | wallTimer / DB / UI       | abstractions/runtime-limits.ts            | P0   |
| C8 Liveness 强制           | framework heartbeat                       | liveness guard 扫描       | mission-liveness-guard.ts                 | P0   |
| C5 ConfigSnapshot          | openSession                               | run/rerun/resume/hydrate  | abstractions/mission-config-snapshot.ts   | P1   |
| C6 InputRebuilder          | harness rebuilder                         | app rerun/hydrate         | lifecycle/mission-lifecycle/rerun/        | P1   |
| C7 CanonicalState          | lifecycle-manager                         | controller / UI / metrics | abstractions/mission-state.ts             | P2   |
| C9 Stage 契约              | 注册表                                    | 契约测试                  | agents/dev-tools/contract-assertions.ts   | DONE |

---

## 6. 全 app 落地（adapter 改造清单）

> 原则：先 playground 落地 + 跑稳 → radar → social，每 app 一个 PR；adapter conformance 测试随之绿。

### 6.1 agent-playground

本会话已落地的 app 层单一源（DEPTH_BUDGET_TIERS / dispatcher abort 分类 / wallTimeMs 注释 / maxCredits 列）→ **提升为消费 C1–C4 canonical**；rerun 子系统 → 迁到 C6 rebuilder。

### 6.2 AI Radar（`ai-app/radar`）

1. C3：`run-radar-refresh-mission.dto.ts:68-89` resolve\* 静态值 → canonical estimator；补 per-mission estimate。
2. C2：`radar-pipeline-dispatcher.service.ts:91-103 / 298-362` message 正则 → canonical taxonomy；`models.prisma:10602` 旁加 `failure_code`。
3. C4：`models.prisma:10587-10588` `durationMs/wallTimeMs` → `elapsedWallTimeMs/wallTimeCapMs`。
4. C1：`radar-pipeline-dispatcher.service.ts:447-459 abortMission` → `AbortRegistry.abort(id, reason)` 统一接口。
5. C8：`radar.module.ts` 注册 `MissionLivenessGuard.registerAdapter`（当前完全缺失）。
6. C5：`radar-mission-store.service.ts:112-121 payload` blob → 结构化 snapshot。
7. C7：`radar-mission-store.service.ts:21-26`（已 5 态，迁移成本最低）→ canonical enum。

### 6.3 AI Social（`ai-app/social`）

1. **C1（功能缺陷优先）**：`social-task.service.ts:222-252 cancelTask` 增加 `dispatcher.abortMission()/abortRegistry.abort()` **真停**（当前假停继续烧预算）。
2. C3：删 `social-pipeline-dispatcher.service.ts:418-438`（depthFactor/0.05 估算）+ `social-runtime-shell.service.ts:33-69` 散表 → canonical estimator/caps。
3. C2：`social-pipeline-dispatcher.service.ts:640-647` inline 4 码 → canonical taxonomy + 落 `failure_code` 列（`models.prisma:8883` 旁）。
4. C4：`models.prisma:8878 wallTimeMs`(实测) → `elapsedWallTimeMs` + 新增 `wallTimeCapMs`。
5. C7：`social-mission-store.service.ts:66,98,119` → canonical enum；补 `markCancelled/markRejected`；对齐 `models.prisma:8875` 注释。
6. C8：`ai-social.module.ts` 注册 liveness adapter（仿 `agent-playground.module.ts:257`）。
7. C6：`social-task.service.ts:260-299 retryTask` → harness rebuilder + `IMissionRerunPolicy`。

---

## 7. 看护机制（防腐朽 — 本设计的核心要求）

> 目标：让违反契约**编译期/CI 期必红，合不进主干**，而不是靠人自觉。七层防御，层层独立。

### L1 类型契约（编译期）

canonical 全为 TS 类型/枚举/值对象；adapter 接口强类型。app 传错类型 → tsc 红。

### L2 契约单测（每 canonical 对象）

- enum 全覆盖；值对象不变量：`maxTokens===maxCredits×CREDITS_TO_TOKENS`、`maxCostUsd===maxCredits×CREDITS_TO_USD`、`wallTimeCapMs≠elapsedWallTimeMs`（语义不同字段）。
- 沿用本会话 `assertNumberProducerWithinSchema`（C9）：stage→agent 数值边界 producer ⊆ consumer。

### L3 架构守护 spec（`verify:arch` 扩展，jest 拦截）

新增断言（grep 源码 + AST）：

1. 除 `resolved-budget-caps.ts` 外，全仓**禁止** `× 0.002` / `× 1000` / `× 0.05`（预算换算散落）。
2. 全仓**禁止**裸标识符 `wallTimeMs`（只允许 `wallTimeCapMs`/`elapsedWallTimeMs`）。
3. **禁止** `abortRegistry.abort(` 第二参为字符串字面量（必须 `MissionAbortReason.*`）。
4. mission app 的 markFailed/失败路径**禁止**只写 message 不写 `failureCode`。

### L4 ESLint `no-restricted-syntax` / `no-restricted-imports`（IDE 实时 + lint-staged）

- 禁 `ai-app/**` 直接 import harness 内部 budget/lifecycle 路径（必走 facade）。
- 禁字面量 `0.002 / 1000` 用于 credits 上下文（自定义 rule 或 restricted-syntax）。

### L5 跨 app **Adapter Conformance 测试**（强制每个 mission app 实现契约）

harness 提供 `assertMissionAppConformance(appModule)`，对每个注册的 mission app 断言：

1. 实现了 `IMissionRuntimeAdapter`（budget/limits resolve）。
2. **注册了 liveness adapter**（治 radar/social 漏注册）。
3. cancel 路径真调 `abortRegistry.abort`（治 social 假停）。
4. 失败路径写 canonical `MissionFailure`。
5. rerun（若支持）走 `MissionInputRebuilder`。
   > 新增 mission app 不实现这些 → conformance 测试红，无法合并。这是"新 app 接入清单"的可执行版。

### L6 pre-push + CI 二次执行

`.husky/pre-push` 第 0 步跑 `verify:arch`（含 L3）+ conformance（L5）+ 变更测试；CI 复跑全量。违规拒推。

### L7 注册表 + schemaVersion + 文档回链

- `MissionConfigSnapshot.schemaVersion`：契约演进有版本，跨版本回退有据。
- 本文件为单一真源；每个 canonical 文件头注释回链本文件路径；新增 mission app 的 PR 模板要求勾选"已过 conformance"。

---

## 8. 分波次迁移（× 全 app）

| 波次   | 内容                                                                                                           | 全 app 落地                            |
| ------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **P0** | C1 AbortReason / C2 MissionFailure / C3 BudgetCaps+Estimator / C4 wall-time 拆 / C8 liveness 强制 + L1–L6 看护 | playground→radar→social 各一 PR        |
| **P1** | C5 ConfigSnapshot / C6 InputRebuilder                                                                          | 各 app 接 rebuilder                    |
| **P2** | C7 CanonicalState 三层 / starting 占位平台化                                                                   | controller/前端/store                  |
| DONE   | C9 stage 契约机制                                                                                              | playground 已落，radar/social 后补登记 |

P0 内顺序建议：**C3 + C4 先行**（有 DB/前端协议改动，早暴露）→ C1/C2/C8 紧随（enum + 缺陷修复）。

---

## 9. 兼容策略

- **双写过渡**：P0 期新 canonical 字段与旧并存，写两份、读优先 canonical，灰度 N 天后删旧。
- **in-flight / 历史 mission**：无 `config_snapshot` → rebuilder 回退 `legacy` 分支（旧 row+JSON 拼装，仅历史用）。
- **DB 迁移**：手写 SQL（项目规范，禁 `prisma migrate dev`）；先加列→回填→切读→弃旧；三 app 各自迁移脚本。
- **跨 app 节奏**：先 playground 验证 + adapter 边界稳定 → radar → social，每 app 一 PR；canonical 加 `schemaVersion`。
- **event/前端协议改名**：走 `playground-frontend-contract.spec` byte-equal 基线（radar/social 补各自基线），改名同步基线 + 前端 client。
- **prompt cache / 在跑任务**：合并节奏避开在跑任务；P0 不动 agent prompt。

## 10. 风险点

| 风险                                                     | 缓解                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| 跨 app blast radius（3+ app 同 harness）                 | 先 playground 验证；adapter 边界稳定后逐 app；canonical schemaVersion |
| DB 迁移（wall-time/config_snapshot/failure_code × 3 表） | 手写迁移 + 双写 + 回填 + 灰度切读                                     |
| in-flight / 历史无 snapshot                              | rebuilder legacy 回退分支                                             |
| social 真停上线后行为变化（之前假停）                    | 灰度 + 明确 changelog；cancel 后 budget 立停是预期改进                |
| event/前端协议改名                                       | byte-equal 基线 + 前端 client 同步 PR                                 |
| 看护 L3/L4 误伤合法用法                                  | 白名单（如 `resolved-budget-caps.ts` 允许换算常量）                   |

## 11. 测试矩阵（全 app × 全域 × 全分支）

- **契约单测**：每 canonical（C1–C9）值对象不变量 + enum 全覆盖。
- **adapter conformance**（L5）：playground / radar / social 各跑 `assertMissionAppConformance`。
- **业务分支矩阵**（每 app）：fresh run / full rerun / incremental / local rerun / cancel(真停) / budget-exhaust / wall-time-exceed / quality-reject / 孤儿回收 / 历史无 snapshot 回退。
- **架构守护**（L3）：禁 `×0.002`/裸 `wallTimeMs`/字符串 abort reason/裸 message 失败。
- **回归基线**：`playground-no-regression` + 三 app `*-frontend-contract` byte-equal。

## 12. 不上提（留 ai-app 业务层）

- `depth=quick|standard|deep` 档位、`budgetProfile` 文案标签。
- `styleProfile/audienceProfile/auditLayers/searchTimeRange` 业务输入。
- leader 签字业务解释（映射到平台 `failureCode=leader_signoff_rejected` 走 C2）。
- 维度工具矩阵 `dimension-tool-matrix`、章节/字数业务契约。
- 详情页 budget meters / 设置弹窗回填 / 布局交互。

## 13. 与本会话已落地工作的衔接

本会话已在 **app 层** 单一源化若干项；本设计 P0 把它们**提升为 harness canonical 并令 radar/social 共同消费**——多为"提升 + 改消费方"，非全新建：

| 本会话已做（app 层）                                      | 提升为（harness canonical）                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `DEPTH_BUDGET_TIERS` + `resolveMissionCredits/Multiplier` | C3 `ResolvedBudgetCaps` + `MissionCostEstimator`（换算搬进 harness 唯一处） |
| dispatcher `budget_exhausted/user_cancelled` 分类         | C1 `MissionAbortReason` + C2 `MissionFailureCode` enum                      |
| `wallTimeMs` 注释澄清 + maxCredits 列权威                 | C4 字段拆分 + C5 snapshot                                                   |
| `assertNumberProducerWithinSchema` + 注册表               | C9（已在 harness，作为看护 L2 基元）                                        |
| dimension-tool-matrix / chapter/word 契约                 | 留 app 业务层（§12）                                                        |

---

## 14. 评审决策点（待确认后实施）

1. P0 范围确认：C1–C4 + C8 + L1–L6 看护，认可？
2. 顺序：C3/C4 先行（DB/协议早暴露）→ C1/C2/C8。认可？
3. 粒度：每 canonical × 每 app 一 PR（小步可回退）。认可？
4. social 真停（C1）会改变其取消行为（从"假停继续烧"变"真停立省"）——确认这是期望改进？

> 评审通过后，按 §8 波次实施；每步过 §7 看护 + §11 测试矩阵。
