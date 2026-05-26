# Agent Team Thinning Plan — playground / social / radar 全栈瘦身方案

**Date**: 2026-05-26
**Status**: Draft (待用户拍板进入 Wave 1)
**Author**: Claude Code
**关联文档**:
- 设计原则: [ADR 009](../../../decisions/009-team-app-blueprint-and-cli.md) (§0 兼容性红线 / §1 全栈 blueprint 源)
- 目录规范: [standard 23 §8.1 / §8.2](../../../../.claude/standards/23-business-team-framework-usage.md)
- 前端 canonical: [ADR 008](../../../decisions/008-agent-team-ui-unification.md)
- 上一波: [agent-app-mass-migration-roadmap v2](../agent-app-mass-migration-roadmap-2026-05-24.md) Wave 1b ✅
- 前端瘦身: [playground-read-model-and-frontend-thinning-plan-2026-05-25.md](./playground-read-model-and-frontend-thinning-plan-2026-05-25.md)（本地有未推送，本 plan 引用其结论）

---

## 1. 背景

5-24 完成 Wave 1b 后 (P1-P11 + Wave 4 守护)，三个 agent team app 的能力下沉到 `ai-harness/teams/business-team/`（19 个 framework class / 3454 LOC）。但三个 app 本身仍偏厚:

| App | LOC | files | 最大单文件 | 备注 |
|---|---|---|---|---|
| **agent-playground** | 27,139 | 117 | 1156 (playground.pipeline.ts) | 标杆 |
| **social** | 21,653 | 111 | 2328 (wechat.adapter.ts) | 含 wechat/xhs integrations |
| **radar** | 10,659 | 64 | 766 (refresh.scheduler) | 单源采集 |
| **合计** | 59,451 | 292 | — | — |

用户诉求 (2026-05-26):
> "我是让你对现在的 playground，radar 和 social 进行瘦身啊"
> "应该基于通用和专用的原则，看看到底什么应该下沉，什么应该保留在 app"
> "通用上提"

本 plan 按**通用 vs 专用**原则，逐文件给出归属判断 + 三 app 同步执行计划。

---

## 2. 核心原则：通用 vs 专用判断标准

| 判断维度 | 通用 (→ harness/engine) | 专用 (→ 留 app) |
|---|---|---|
| **绑定业务概念** | 不绑 (mission/agent/event/stage 一般规律) | 绑 (research / topic / chapter / dimension / publish / wechat / radar-source) |
| **形态是否可参数化** | 能用 generic / hook 注入完成 | 业务流程编排，硬编码业务步骤 |
| **跨 app 复用预期** | 未来 ≥ 2 个 team 受益 (即使现在 N=1) | 仅当前 app 形态 |
| **持久化 schema** | 通用 mission lifecycle 字段 | 业务字段 (leaderJournal/dimensions/chapterDraft/wechatArticleId/radarSignalId) |

**关键纠正**: 不能光看"两 app 共有 = 通用" — 只有 2 个样本时易误判。**应基于"形态是否绑定具体业务概念"做判断**，单 app 现存的通用形态（如 dag-view / leader-chat）也应上提（standard 23 §6 "3 处再抽象"是软约束，不阻碍明显通用能力的下沉）。

---

## 3. playground 文件归属总表

**类别标记**:
- **B** = boilerplate (改名复制即可)
- **T** = thin subclass / thin delegate (extends framework, ≤ 80 LOC)
- **D** = domain (业务专属，留 app)
- **S** = split (通用部分上提，业务部分留 app)
- **✘** = 整体上提，本 app 不再保留

### 3.1 顶层目录

| 目录 | 类别 | 现状 | 目标态 | 备注 |
|---|---|---|---|---|
| `module/` | B | 1 file / 532 LOC | 1 file / ~200 LOC | onModuleInit 装配薄化 |
| `api/controller/` | D | 5 files | 4 files | base-mission.controller.ts 上提 harness |
| `api/dto/` | D | 1 file | 1 file | 业务输入字段 |
| `api/contracts/` | D | 5 files | 7 files | 加 playground-view-state.contract.ts (PR-D-0.5 已加) + playground-dag-view.contract.ts |
| `runtime/` | D | 5 files | 5 files | 业务配置不变 |
| `events/` | D | 2 files | 2 files | event schema 是业务 |
| `integrations/` | D | 1 file | 1 file | 业务 integration |
| `mission/pipeline/` | mixed | 见 §3.2 | thin 化 | 拆 1156 / 939 |
| `mission/agents/` | mixed | 8 dirs | 8 dirs (split) | leader/steward/verifier extends harness base |
| `mission/skills/` | D | 18 dirs | 18 dirs | 全业务 prompt |
| `mission/lifecycle/` | mixed | 9 files | 9 files (部分 thin) | mission-store 638 → 200 |
| `mission/rerun/` | mixed | 6 files | 6 files (部分 thin) | stage-rerun.dispatcher 742 → 300 |
| `mission/roles/` | mixed | 14 files | 13 files | runner-state.util shim 删除 |
| `mission/artifacts/` | D | 8 files | 8 files | 业务规则 |
| `mission/context/` | D | 2 files | 2 files | 7-phase 业务 ctx |
| `mission/types/` | D | 1 file | 1 file | 业务字面量 |
| `mission/chat/` | S | 3 files / 688 LOC | 2 files / ~280 LOC | leader-chat.service 上提 harness |
| `mission/dag-view/` | S | 3 files / 950 LOC | 2 files / ~300 LOC | DagGraphFramework 上提 |
| `mission/export/` | S | 1 file / 351 LOC | 1 file / ~100 LOC | MissionExportFramework 上提 |

### 3.2 `mission/pipeline/` 详细判断

| 文件 | 现 LOC | 目标 LOC | 类别 | 上提内容 | 留 app 内容 |
|---|---|---|---|---|---|
| `playground.pipeline.ts` | 1156 | ~100 | T | sessions Map / dedup window / cleanup / lifecycle 事件桥接 → `BusinessTeamMissionDispatcherFramework` 扩展 | 14 stage hook 闭包注入 |
| `playground-business-orchestrator.service.ts` | 939 | ~200 | T | stage instrumentation / cross-stage state 推进 → `BusinessTeamOrchestratorFramework` 扩展 | 14 stage 业务 hook |
| `mission-runtime-shell.service.ts` | 125 | ~50 | T | (已 thin delegate framework) | playground-specific session 字段 |
| `mission-stage-bindings.service.ts` | 188 | ~50 | T | (已 extends framework) | stage 绑定的业务 hook |
| `playground-cross-stage-state.ts` | (~150) | ~80 | T | (已 extends framework) | playground 跨 stage 业务字段 |
| `playground-mission-span.service.ts` | 29 | 29 | T | ✅ 已 thin | — |
| `leader-invocation.factory.ts` | (~80) | ~80 | D | — | leader invocation 业务 factory |
| `stages/s1~s12 + s8b/s9b` (14 files) | 总 ~5500 | 每个 < 300 | D | — | 14 stage 业务编排 |
| `helpers/chapter-pipeline.helper.ts` | 827 | 拆 ≤ 300 × 3 | D | — | chapter 业务 helper |
| `helpers/per-dim-pipeline.util.ts` | 844 | 拆 ≤ 300 × 3 | D | — | dimension 业务 helper |
| `helpers/chapter-batch-executor.helper.ts` | (~250) | ~200 | D | — | 业务 batch 调度 |

**pipeline/ 总瘦身**: 1156 + 939 = **2095 → ~300** LOC (-86%)

### 3.3 `mission/lifecycle/` 详细判断

| 文件 | 现 LOC | 目标 LOC | 类别 | 上提内容 | 留 app 内容 |
|---|---|---|---|---|---|
| `mission-store.service.ts` | 638 | ~200 | T+D | 通用 mission CRUD / heartbeat / query → framework 扩展 (已部分继承) | playground-specific 持久化字段 (leader-journal / dimensions / topic / reports) |
| `mission-event-buffer.service.ts` | 60 | 60 | T | ✅ 已 thin (extends framework) | — |
| `prisma-mission-checkpoint.store.ts` | 98 | ~60 | T | Prisma 实现细节 → framework | checkpoint 业务字段映射 |
| `mission-lifecycle.helper.ts` | 261 | ~150 | D | — | leader-journal/dimensions/topic 字段更新 |
| `mission-update.helper.ts` | 269 | ~150 | D | 通用 mission 字段更新 → framework helper | 业务字段更新 |
| `mission-postmortem.helper.ts` | 153 | ~100 | T+D | postmortem framework → harness | playground postmortem patterns |
| `mission-report.helper.ts` | 352 | ~150 | T+D | report version 通用 → framework (已部分) | research-result / chapter-draft 持久化 (PR-A.6 section 标签已圈出) |
| `playground-postmortem-patterns.ts` | (~80) | ~80 | D | — | playground postmortem 模式 |
| `event-categories.ts` | (~80) | ~80 | D | — | event 业务分类 |

**lifecycle/ 总瘦身**: ~2050 → ~1030 LOC (-50%)

### 3.4 `mission/rerun/` 详细判断

| 文件 | 现 LOC | 目标 LOC | 类别 | 上提内容 | 留 app 内容 |
|---|---|---|---|---|---|
| `stage-rerun.dispatcher.ts` | 742 | ~300 | T+D | stage 注册 + cascade 计算 + per-stage abort → framework 扩展 | 14 stage 业务 handler |
| `local-rerun.service.ts` | (~489) | ~250 | D | — | playground rerun 业务 |
| `mission-rerun-orchestrator.service.ts` | 188 | ~80 | T | (已 extends framework) | playground policy |
| `rerun-guard.service.ts` | 109 | ~50 | T | (已 extends framework) | concurrency 业务 |
| `ctx-hydrator.service.ts` | 252 | ~120 | T | ctx schema → framework | playground ctx 业务字段 |
| `rerun-runtime-builder.service.ts` | 142 | ~80 | T | (已 extends framework) | playground runtime 业务参数 |

**rerun/ 总瘦身**: ~1922 → ~880 LOC (-54%)

### 3.5 `mission/agents/` 详细判断 (split 模式)

| 子目录 | 现 LOC | 目标 LOC | 类别 | 上提内容 | 留 app 内容 |
|---|---|---|---|---|---|
| `leader/leader.agent.ts` | 507 | ~150 | S | 通用 ReAct 循环 / mid-mission assess / signoff 骨架 → `LeaderAgentBase` | playground prompt + verdict 解析 |
| `steward/steward.agent.ts` | 79 | ~30 | S | budget-guard 通用骨架 → `StewardAgentBase` | playground budget profile |
| `verifier/verifier.agent.ts` | 91 | ~30 | S | score verifier 通用骨架 → `VerifierAgentBase` | playground score schema |
| `researcher/` | 461 (2 files) | 461 | D | — | 研究业务 agent |
| `analyst/` | 303 | 303 | D | — | 分析业务 |
| `reconciler/` | 342 | 342 | D | — | 跨 dim 校验 |
| `reviewer/` (4 files) | 396 | 396 | D | — | 报告 reviewer 业务 |
| `writer/` (7 files) | 1273 | 拆 ≤ 300 × 5+ | D | — | 章节写作业务 (拆分多文件) |
| `_shared/skill-loader.ts` | 38 | 0 | ✘ | 通用 SKILL.md loader → `harness/agents/core/` | (本地引用改 facade) |

**agents/ 总瘦身**: ~3490 → ~2882 LOC (-17%) + 三个 base 上提 harness 共 +280 LOC

### 3.6 `mission/roles/` 详细判断

| 文件 | 现 LOC | 目标 LOC | 类别 | 上提内容 | 留 app 内容 |
|---|---|---|---|---|---|
| `leader.service.ts` | 471 | ~150 | S | 通用 leader 调用模式 → `LeaderServiceFramework` | playground leader 业务 |
| `steward.service.ts` | 48 | 48 | T | ✅ 已 thin | — |
| `verifier.service.ts` | 48 | 48 | T | ✅ 已 thin | — |
| `reviewer.service.ts` | 70 | 70 | T | ✅ 已 thin | — |
| `researcher.service.ts` | (~200) | ~200 | D | — | 业务 |
| `analyst.service.ts` | (~150) | ~150 | D | — | 业务 |
| `reconciler.service.ts` | (~180) | ~180 | D | — | 业务 |
| `writer.service.ts` | (~250) | ~250 | D | — | 业务 |
| `agent-invoker.service.ts` | (~241) | ~80 | T | (已 extends framework) | playground invocation context |
| `agent-execution-support.ts` | 72 | 0 | ✘ | 通用 execution support → harness facade | (本地引用改 facade) |
| `agent-invocation-policy.ts` | (~80) | ~80 | D | — | playground invocation policy |
| `leader-failure-diagnostic.utils.ts` | (~80) | ~80 | D | — | playground 诊断 |
| `runner-state.util.ts` | 14 (shim) | 0 | ✘ | (已上提) | 删除 shim,改用 facade import |

**roles/ 总瘦身**: ~1900 → ~1336 LOC (-30%)

### 3.7 `mission/{chat,dag-view,export}/` 详细判断 (整体上提)

#### `mission/chat/` (688 LOC → ~280 LOC)

| 文件 | 现 LOC | 目标 LOC | 类别 | 上提内容 |
|---|---|---|---|---|
| `leader-chat.service.ts` | 409 | 0 | ✘ | 整体上提 `LeaderChatFramework` |
| `leader-chat-prompt.ts` | 146 | 146 | D | playground prompt 留 app |
| `leader-decision-parser.util.ts` | 133 | ~130 | D | playground decision 解析留 app (修改 import) |

#### `mission/dag-view/` (950 LOC → ~300 LOC)

| 文件 | 现 LOC | 目标 LOC | 类别 | 上提内容 |
|---|---|---|---|---|
| `mission-dag.service.ts` | 695 | ~250 | S | DAG 图结构 / cascade walk / status 投影 → `DagGraphFramework` |
| `mission-dag.controller.ts` | 96 | 0 | ✘ | 通用 controller → harness (用户 ownership 校验 hook 留) |
| `mission-dag.types.ts` | 159 | ~50 | S | 通用 node/edge type → harness; playground 节点扩展 type 留 |

#### `mission/export/` (351 LOC → ~100 LOC)

| 文件 | 现 LOC | 目标 LOC | 类别 | 上提内容 |
|---|---|---|---|---|
| `mission-export.service.ts` | 351 | ~100 | S | artifact → markdown/pdf/json 通用 → `MissionExportFramework` |

**chat + dag-view + export 总瘦身**: 1989 → 676 LOC (**-66%**)，harness 增 ~900 LOC (一次性)

### 3.8 `runtime/` 详细判断

| 文件 | 现 LOC | 目标 LOC | 类别 | 备注 |
|---|---|---|---|---|
| `playground.config.ts` | (~270) | ~270 | D | pipeline 定义业务 |
| `playground-runtime.config.ts` | (~150) | ~150 | D | Zod tuning 业务 |
| `playground-tuning-profile.ts` | (~100) | ~100 | D | 档位映射业务 |
| `agent-playground.event-relay.ts` | 26 | 26 | T | ✅ 已 thin |
| `agent-playground.input-rebuilder.ts` | (~200) | ~200 | D | rerun input 还原业务 |

### 3.9 顶层 boilerplate

| 文件 | 现 LOC | 目标 LOC | 类别 | 备注 |
|---|---|---|---|---|
| `module/agent-playground.module.ts` | 532 | ~200 | B | DI 装配薄化 (减少 framework class wiring 重复) |
| `api/controller/base-mission.controller.ts` | (~120) | 0 | ✘ | 上提 harness 作通用基类 |

---

## 4. 上提到 `ai-harness/teams/business-team/` 的新增内容

§8.1 子目录白名单: **12 → 16 项**（同步更新 `agent-team-layout.spec.ts` ALLOWED_HARNESS_BUSINESS_TEAM_DIRS + standard 23 §8.1 文档）。

### 4.1 新增 `chat/` 子目录

```
chat/
├── leader-chat.framework.ts         (~280 LOC) — turn 管理 / context 装配 / decision dispatch 通用
├── leader-chat-prompt.template.ts   (~50 LOC)  — prompt template slot (业务 prompt 注入)
├── leader-chat.types.ts             (~80 LOC)
└── abstractions/
    └── leader-chat-port.interface.ts
```

业务 hook 注入点:
- `interpretDecision(text): Decision` — playground 解析"是否 rerun / 是否 signoff"
- `loadMissionContext(missionId): ContextSnapshot` — playground 拼 leader journal + verdict
- `persistTurn(turn): Promise<void>` — 业务侧持久化 chat history

### 4.2 新增 `dag-view/` 子目录

```
dag-view/
├── dag-graph.framework.ts           (~300 LOC) — 节点/边抽象 + cascade walk + status 投影
├── dag-controller.framework.ts      (~80 LOC)  — HTTP 读端点骨架
├── dag-graph.types.ts               (~80 LOC)  — 通用 type
└── abstractions/
    ├── dag-node.contract.ts         — INodeRegistry hook (business expand: dim / stage / agent)
    └── dag-cascade.contract.ts      — cascade walker hook
```

业务 hook 注入点:
- `expandNodes(missionId): Node[]` — 业务侧产出 dim/stage/agent 节点
- `computeCascade(startNode, missionState): NodeId[]` — 业务侧 cascade 规则

### 4.3 新增 `export/` 子目录

```
export/
├── mission-export.framework.ts      (~200 LOC) — artifact 渲染 + 格式选择 (markdown/pdf/json/csv)
├── format-renderers/
│   ├── markdown.renderer.ts
│   ├── pdf.renderer.ts
│   └── json.renderer.ts
└── abstractions/
    └── export-port.interface.ts     — IArtifactSourcePort (业务侧提供 artifact data)
```

业务 hook 注入点:
- `loadArtifact(missionId): ArtifactData` — 业务侧拼 report sections / chapters / citations
- `customRendering(data, format): string` — 业务 override 默认渲染 (如 chapter heading 编号样式)

### 4.4 新增 `agents/` 子目录 (Base 类)

```
agents/
├── leader-agent.base.ts             (~250 LOC) — 通用 ReAct 循环 + mid-mission assess + signoff 骨架
├── steward-agent.base.ts            (~50 LOC)  — budget-guard 通用骨架
├── verifier-agent.base.ts           (~50 LOC)  — score verifier 通用骨架
└── abstractions/
    └── role-agent.contract.ts       — IRoleAgent interface
```

业务 prompt 注入点: 各 app 的 `<team>-{leader,steward,verifier}.agent.ts` extends Base，仅注入 prompt + verdict schema。

### 4.5 扩展现有 framework class

| Framework | 现 LOC | 目标 LOC | 扩展内容 |
|---|---|---|---|
| `BusinessTeamMissionDispatcherFramework` | 192 | ~400 | 接管 sessions Map / dedup window / cleanup / lifecycle 事件桥接 |
| `BusinessTeamOrchestratorFramework` | 197 | ~350 | 接管 stage instrumentation / cross-stage state 推进 |
| `BusinessTeamMissionStoreFramework` | 138 | ~280 | 接管更多通用 CRUD (mission row update / status transition) |
| `BusinessTeamStageRerunDispatcherFramework` | 235 | ~400 | 接管 stage 注册 + cascade 计算 + per-stage abort |
| `BusinessTeamReportHelperFramework` | 112 | ~180 | 接管 report version 完整 lifecycle |
| `BusinessTeamUpdateHelperFramework` | 84 | ~150 | 接管通用 mission 字段更新 |

### 4.6 harness LOC 影响

| 项 | LOC |
|---|---|
| 现有 framework 总 | 3,454 |
| 4 个新子目录新增 | +1,420 |
| 6 个现 framework 扩展 | +830 (净增) |
| **harness 目标态** | **~5,700** (一次性 +2,250) |

---

## 5. 三 app 同步影响

按 standard 23 §6 红线: **"3 app 同步迁移"** —— 任何 framework 变更必须 playground + social + radar 同 PR 落地。

### 5.1 playground 瘦身

| 维度 | 现状 | 目标 | 减少 |
|---|---|---|---|
| 总 LOC | 27,139 | **~17,800** | **-34%** |
| files | 117 | ~115 | ≈ |
| 最大单文件 | 1156 | < 300 | **从巨石到细颗粒** |
| > 500 LOC 文件数 | 11 | 0 | |

### 5.2 social 瘦身（同等下沉受益）

social 当前 `social-pipeline-dispatcher.service.ts` 792 / `social-business-orchestrator` 122 / `social-runtime-shell` 167 等：

| 维度 | 现状 | 目标 | 减少 |
|---|---|---|---|
| 总 LOC | 21,653 | **~14,500** | **-33%** |
| `social-pipeline-dispatcher.service.ts` | 792 | ~150 | -81% |
| `social-mission-store.service.ts` | (~620) | ~200 | -68% |
| 业务 wechat/xhs integrations | 不变 | 不变 | 0% |

### 5.3 radar 瘦身（同等下沉受益）

radar 当前 `radar-pipeline-dispatcher.service.ts` 543 / `radar-business-orchestrator` 190 / `radar-mission-runtime-shell` 167：

| 维度 | 现状 | 目标 | 减少 |
|---|---|---|---|
| 总 LOC | 10,659 | **~7,500** | **-30%** |
| `radar-pipeline-dispatcher.service.ts` | 543 | ~120 | -78% |
| `radar-mission-store.service.ts` | 318 | ~150 | -53% |
| 业务 collectors (rss/yt/x/custom) | 不变 | 不变 | 0% |

### 5.4 总瘦身效益

| 维度 | 现状 | 目标 | 净变化 |
|---|---|---|---|
| **3 app 合计 LOC** | 59,451 | **~39,800** | **-19,651 (-33%)** |
| harness LOC | 3,454 | 5,700 | +2,246 |
| **整体净瘦身** | — | — | **-17,405 (-29%)** |
| 跨 N team 净收益 | — | — | (N-1) × ~6,500 LOC (新 team 起步即享) |

---

## 6. Wave 执行计划

按"先底层、后上层 / 先低风险、后高风险"排序。每 Wave 三 app 同步落地 (standard 23 §6)。

### Wave T1 — 文档奠基 (本周) ✅

| Item | 状态 |
|---|---|
| ADR 009 (本 plan 的决策依据) | ✅ Done |
| BLUEPRINT.md (复制源 SOP) | ✅ Done |
| standard 23 §8 / §8.8 (CLI + 兼容性红线) | ✅ Done |
| 本 plan (agent-team-thinning-plan-2026-05-26.md) | 🔄 本提交 |
| `@blueprint:` 元数据 (161 文件) | ✅ Done |
| CLI scaffold + smoke test | ✅ Done |

### Wave T2 — 低风险瘦身 (1-2 周)

无需 framework 接口变化，单文件内部清理 + shim 删除:

| PR | 范围 | LOC 减少 | 风险 | 验证 |
|---|---|---|---|---|
| T2.1 | 删 `runner-state.util.ts` shim (pg+social 同步改 facade import) | -28 (双 app) | 低 | type-check + spec |
| T2.2 | 删 `agent-execution-support.ts` 通用部分上提 (pg+social 同步) | -120 (双 app) | 低 | 同上 |
| T2.3 | 删 `_shared/skill-loader.ts` 改用 harness facade | -38 (单 app) | 低 | 同上 |
| T2.4 | playground.pipeline.ts 内 dead code 清理 + 拆 helper (无 framework 改) | -200 | 低 | spec + 真机 |
| T2.5 | s3-researcher / s8-writer / s4-leader stage 拆 helper (单 stage 内拆) | 0 (每文件 < 300) | 低 | spec |
| **T2 合计** | | **-386 LOC** | | |

### Wave T3 — Framework 扩展 (2-3 周)

扩展现有 framework class 接管更多通用骨架。每个 framework 改动必须 3 app 同步:

| PR | 扩展 framework | 接管内容 | 三 app 影响 | LOC 减少 (3 app 合计) |
|---|---|---|---|---|
| T3.1 | `BusinessTeamMissionStoreFramework` | 通用 mission CRUD / heartbeat / query | pg 638→200, social 620→200, radar 318→150 | **-1,026** |
| T3.2 | `BusinessTeamMissionDispatcherFramework` | sessions Map / dedup window / cleanup / 桥接事件 | pg 1156→100, social 792→150, radar 543→120 | **-2,121** |
| T3.3 | `BusinessTeamOrchestratorFramework` | stage instrumentation / cross-stage 推进 | pg 939→200, social 122→80, radar 190→100 | **-871** |
| T3.4 | `BusinessTeamStageRerunDispatcherFramework` | stage 注册 + cascade + per-stage abort | pg 742→300, social ~, radar ~ | **-442** |
| T3.5 | `BusinessTeamReportHelperFramework` | report version 完整 lifecycle | pg 352→150 (其他 app 无 report 业务) | **-202** |
| T3.6 | `BusinessTeamUpdateHelperFramework` | 通用 mission 字段更新 | pg 269→150, social ~80→40, radar ~50→30 | **-179** |
| **T3 合计** | | | | **-4,841 LOC** |

### Wave T4 — 新 framework 子目录 (2-3 周)

新增 4 个子目录到 `business-team/`，每个先做 framework + 测试，再迁移 playground，最后 social/radar 适配（即使不用也要继承占位）:

| PR | 新 framework 子目录 | playground 减少 | social/radar 适配 | 新 harness LOC |
|---|---|---|---|---|
| T4.1 | `business-team/chat/` | -310 (leader-chat) | placeholder hook | +280 |
| T4.2 | `business-team/dag-view/` | -550 (dag-view) | placeholder hook | +400 |
| T4.3 | `business-team/export/` | -250 (export) | placeholder hook | +200 |
| T4.4 | `business-team/agents/` (Base 类) | -467 (leader/steward/verifier 通用部分) | social leader/steward 也用 Base | +280 |
| **T4 合计** | | **-1,577 (pg) + 双 app 部分** | | **+1,160** |

§8.1 子目录白名单从 12 项更新到 16 项 (同步改 spec + standard 23 §8.1)。

### Wave T5 — 前端业务下沉 (高风险, ≥ 2 个月, 灰度)

按 ADR 009 §3 / §0 红线，每步必按双跑 ≥ 7 天 0 diff:

| PR | 内容 | 兼容性验证 |
|---|---|---|
| T5.1 | 后端 `playground-view-state.service.ts` 实现 (PR-D-1) | equivalence spec vs 前端 derive.ts deep-equal |
| T5.2 | 前端 dev 模式双跑 ≥ 7 天 | 0 diff |
| T5.3 | 灰度切换 (feature flag) | 0 user-visible regression |
| T5.4 | 删前端 `lib/features/agent-playground/derive.ts` (1031 LOC) | 视觉/行为零变化 |
| T5.5 | 同上对 drawer-derive / synthesize-artifact / todo-ledger | -3828 前端 LOC |

### 总 Wave LOC 估算

| Wave | playground | social | radar | harness | 净 |
|---|---|---|---|---|---|
| T1 文档 | 0 | 0 | 0 | 0 | 0 |
| T2 低风险 | -250 | -100 | -36 | 0 | -386 |
| T3 framework 扩展 | -3,250 | -1,150 | -441 | +830 | **-4,011** |
| T4 新 framework 子目录 | -1,577 | -300 | -150 | +1,160 | **-867** |
| T5 前端业务下沉 | -3,828 (FE) | (后续 PR) | (后续 PR) | (FE 框架包) | **-3,828+** |
| **合计** | **-8,905** | **-1,550** | **-627** | **+1,990** | **-9,092** |

---

## 7. 兼容性约束 (ADR 009 §0 最高红线)

每个 Wave 的每个 PR **必须**满足:

1. **playground 用户视角功能 100% 不变** — UI / 交互 / 报告 / event 命名零变化
2. **下沉能力等价** — 字段级 deep-equal、event 时序一致、性能不退化
3. **平移优先于重写** — 下沉时整体平移逻辑，不借机重构
4. **灰度双跑** — 旧实现不删，新实现并行 dev ≥ 7 天 0 diff
5. **真机回归** — 每个 PR 必须真机跑 playground 多场景 mission
6. **零容忍** — 任何字段差异、时序差异、文案差异都是 P0 阻塞

### 每 PR 必带 6 类验证

| 验证 | 工具 | 通过标准 |
|---|---|---|
| 字段级等价 | `*.equivalence.spec.ts` (jest fixture) | deep-equal |
| event 时序 | WS event recorder + replay | 序列/interval/payload 一致 |
| 真机截图 | playwright | pixel-diff < 阈值 |
| 行为对照 | operator checklist | 100% pass |
| 性能 | k6 / autocannon | p95 延迟不增 > 50ms |
| 灰度双跑 | dev 比对 ≥ 7 天 | 0 diff |

---

## 8. 看护机制

### 现有 (已就位)

- `agent-team-layout.spec.ts` (43 tests) — §8.2 + §8.1 目录白名单
- `agent-team-facade-contract.spec.ts` (12 tests) — ai-app 只走 facade
- `agent-team-blueprint-tags.spec.ts` (12 tests) — @blueprint 标签完整性 (PR-A.5)
- `mission-app-conformance.spec.ts` — mission app 注册 + config snapshot 真断言 (P0-3 修)
- `audit:blueprint-tags` — 前端标签 audit
- `audit:mission-detail-discipline` — 前端 canonical shell
- pre-push hook → 全 architecture spec

### Wave T2-T4 新增

- T3 framework 扩展后: 加 `*-framework.spec.ts` 测每个 framework 的 hook 接口契约
- T4 新子目录: 加到 `ALLOWED_HARNESS_BUSINESS_TEAM_DIRS` 白名单 (12 → 16) + 大小锁
- T5 业务下沉: 加 `*.equivalence.spec.ts` (后端 derive == 前端 derive) + ESLint 禁前端 derive*.ts/synthesize-*.ts/*-ledger.ts

---

## 9. 验收标准 (强成功标准, Karpathy 原则)

完整方案验收:

1. ✅ `npm run create:team my-team` 跑通 + 251 architecture tests 全绿 (已达成 by PR-B.2)
2. ⏳ playground 总 LOC ≤ 18,000 (现 27,139)
3. ⏳ playground 最大单文件 ≤ 300 LOC
4. ⏳ social 总 LOC ≤ 15,000
5. ⏳ radar 总 LOC ≤ 8,000
6. ⏳ harness/teams/business-team/ 接管所有"通用 mission/agent/event"基础设施
7. ⏳ 每个下沉 PR 的 equivalence spec 全绿
8. ⏳ 真机回归 playground 多场景 mission 0 regression
9. ⏳ ADR 009 §0 兼容性红线 100% 遵守

---

## 10. 待评审项

1. **chat/dag-view/export framework 边界**: 我判断 dag-view 通用部分可上提 (节点 + 边 + cascade walk)，但 playground 当前 950 LOC 内部深度耦合 PIPELINE / dimensions。剥离边界需要架构师评审。
2. **§8.1 白名单从 12 扩到 16** 需要架构师 + arch-auditor 评审，避免再增 →"什么都往 framework 塞"。
3. **leader-chat 在其他 team 形态**: 假设未来 social/radar 也会有"leader 与用户对话"模式，但具体形态可能差异大。需 social/radar 团队确认形态契合。
4. **Wave T3 中 dispatcher / orchestrator 扩展**: 涉及 3 app 同步改造，工作量大风险高。是否能分子 PR（如先 dispatcher 一项，再 orchestrator 一项）？
5. **Wave T5 前端业务下沉**: ADR 009 §0 灰度协议要求 ≥ 7 天 0 diff。三个 team 总共 5 类逻辑 (derive / drawer-derive / synthesize-artifact / todo-ledger / report-artifact contract)，每类 1-2 周，全部完成预计 2-3 个月。

---

## 11. 相关文档

- [ADR 009 全栈 blueprint 决策](../../../decisions/009-team-app-blueprint-and-cli.md)
- [BLUEPRINT.md 全栈复制 SOP](../../../../backend/src/modules/ai-app/agent-playground/BLUEPRINT.md)
- [standard 23 business-team framework usage](../../../../.claude/standards/23-business-team-framework-usage.md)
- [ADR 008 前端 canonical shell](../../../decisions/008-agent-team-ui-unification.md)
- [agent-app migration roadmap v2 (Wave 1b ✅)](../agent-app-mass-migration-roadmap-2026-05-24.md)
- [agent-playground-target-boundary-and-directory-blueprint](./agent-playground-target-boundary-and-directory-blueprint-2026-05-24.md)
- [playground-read-model-and-frontend-thinning-plan-2026-05-25.md](./playground-read-model-and-frontend-thinning-plan-2026-05-25.md) (本地, 待 push)

---

**Last updated**: 2026-05-26
**Maintainer**: Claude Code
**Version**: 1.0 (Draft)
