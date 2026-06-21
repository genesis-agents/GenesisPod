# 我的专家团 vs Playground —— UI 差距清单

> **基线**：Agent Playground（`/agent-playground`）
> **对象**：我的专家团（`/agents`、`/me/agents`，`MyTeamView`）
> **目的**：以 Playground 为标杆，定位"我的专家团"的真实差距，区分前端 UI 债与后端数据债。
> **约束**：纯诊断，不改任何代码；**不得影响 Playground**。
> **核实日期**：2026-06-20（基于实际源码 file:line）

---

## 实施状态（2026-06-20 更新）

本轮已按"以 Playground 为基线、不影响 Playground"完成三块改进。所有改动通过两端 `tsc --noEmit` + ESLint（0 error）。

| 差距                          | 状态                | 改动文件                                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 一 · roster loading/error     | ✅ 完成             | `companyStore.ts`（+ `loadingHeroes`/`heroesError`/`loadingMissions`/`missionsError`）、`HeroRosterView.tsx`（LoadingState / ErrorState+重试 / EmptyState 三态分流）                                                                                                                |
| 三 · 错误反馈 + 轮询退避      | ✅ 完成             | `MissionRunView.tsx`（轮询：终态即停 + 40min 上限 + 连续失败熔断）；下发/加载失败 toast 本就有，`loadMissions` 现补 `missionsError` 供熔断判定                                                                                                                                      |
| 二 · byStage 算力明细         | ✅ 完成             | 后端 `company-mission.service.ts`（从 `dimensionPipelines` 派生 `result.usage.byStage`）；前端 `contract.ts`（`cost.byStage` 放开硬编码、映射真实数据）                                                                                                                             |
| 二 · 终态 14-chip             | ✅ 完成（纯前端）   | `contract.ts`：终态优先从 `result.collab` 回放派生带 `systemStageId` 的 steps → 点亮 14-chip（live 本就已点亮，因 runner 发 `telemetry.systemStageId`）                                                                                                                             |
| 二 · reportArtifact V2 富报告 | ✅ 完成（第二轮）   | 后端 `company-mission.service.ts` 落 `result.reportArtifact = result.stageOutputs.reportArtifact`（runner 早已产好，此前被丢弃）；前端 `contract.ts` 映射 + `DeepInsightMissionDetail.tsx` 修 `canonicalView` 守卫。**一招同时解决报告三视图 / 图文 / 引用 / factTable / 质量评分** |
| 二 · 图文并茂 withFigures     | ✅ 完成（第二轮）   | figures 内嵌于 reportArtifact，富报告落库后 ArtifactReader 自动渲染图（此前 company 即使开图也只显示"图占位 未找到"）。前端开关默认仍 false（开图增 60-120s 耗时，留产品决策）                                                                                                      |
| 二 · 终态章节视图             | ✅ 完成（随富报告） | ArtifactReader 终态从 `reportArtifact.sections` 渲染章节视图（不依赖 dimensionPipelines）                                                                                                                                                                                           |
| 二 · roster 搜索/筛选/排序    | ✅ 完成（第二轮）   | `HeroRosterView.tsx` 加搜索（名称/人设/职能）+ 职能筛选 + 排序（最近招募/名称）；`companyStore` adaptHero 补 `createdAt`                                                                                                                                                            |
| 二 · live 章节进度投影        | ⛔ 暂不做           | 运行中逐章进度（dimensionPipelines chapters/grade）需事件投影，company 无 event-store；终态章节已由 reportArtifact.sections 覆盖，运行中价值低                                                                                                                                      |
| 二 · 报告版本化               | ⛔ 暂不做           | 需后端版本表/字段；company "复跑=新建 mission" 已天然充当历史，收益低                                                                                                                                                                                                               |

### 关键发现（第二轮，推翻第一轮"hard/blocked"判断）

1. **deep-insight runner 早已产出完整 `reportArtifact`（ReportArtifactV2）** 并放进 `CapabilityRunResult.stageOutputs.reportArtifact`（runner `collectStageOutputs` L1198）——company 只是在落库时没读它。所以富报告**零 runner/port 改动**，只需"读出来落库 + 适配器映射"。
2. harness `ReportArtifact`（dto L314）顶层 `content/sections/citations/figures/quickView/factTable/metadata/quality` 与前端 `isReportArtifact` 守卫**逐一对齐**，校验直接通过；非法/缺失时优雅降级 markdown。
3. **`DeepInsightMissionDetail` 实际只被 company 使用**——playground 真实详情页是 `app/agent-playground/.../page.tsx` 自带的 `MissionDetailFrame`，`fromPlaygroundMissionView` 是无消费方的死代码。故改 `DeepInsightMissionDetail` 对真实 Playground 页**零影响**。

> **仅剩未做项**：live 逐章进度投影 + 报告版本化。两者都需后端 event-store / 版本表基建，收益已被"终态富报告"大幅覆盖，明确划为后续单独立项。

---

## TL;DR

> **专家团任务详情页其实就是 Playground 那套（同组件、同 6 Tab），不存在"详情范式差距"。**
> 真实差距集中在三处，性质完全不同：
>
> 1. **「我的专家」roster Tab 自己太薄**，缺 loading/error 态 —— 纯前端 UI 债。
> 2. **详情面板因 company mission 数据降级**（无 DAG / by-stage 算力 / 图谱）而显空 —— 后端数据契约债，改 UI 无用。
> 3. **专家团自有的下发/失败路径缺错误反馈** —— 轻量前端 UI 债。
>
> 性价比排序：差距一、三是纯前端、可独立做、不碰 Playground；差距二需后端补结构化产物，工作量最大。

---

## 关键前提：详情页是共享套件，不是两套

专家团任务详情用的 `DeepInsightMissionDetail`（`frontend/components/me/team/views/MissionRunView.tsx:426`）**复用 Playground 同一套 `MissionDetailFrame` + 同样 6 个 Tab + 同样面板组件**（`MissionTodoBoard` / `MissionFlowView` / `ArtifactReader` / `ReferencesPanel` / `MissionGraphTab` / `ComputeUsagePanel`）。

Tab 定义逐字一致：

| 文件                                                                     | 行号    | Tab 集合                                            |
| ------------------------------------------------------------------------ | ------- | --------------------------------------------------- |
| `frontend/components/missions/deep-insight/DeepInsightMissionDetail.tsx` | 74-80   | tasks / collab / report / references / graph / cost |
| `frontend/app/agent-playground/team/[missionId]/page.tsx`                | 168-175 | tasks / collab / report / references / graph / cost |

> 因此"详情页观感差"不是组件差距，而是**喂进去的数据**差距（见差距二）。

列表页同理：两边都用 canonical `MissionGalleryView`（专家团：`MissionRunView.tsx:679`），列表体验基本一致。

---

## 差距一：「我的专家」roster Tab 是真·UI 债

`frontend/components/me/hero/HeroRosterView.tsx`（489 行）是真正落后 Playground 的地方。Playground 侧的 roster 能力体现在任务详情内的 `TeamRosterPanel`（955 行）+ `AgentLiveGrid`（461 行）+ 拓扑画布。

| 维度           | Playground 基线                                           | 我的专家团现状                              | 证据                                                |
| -------------- | --------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| Loading 态     | 面板级 loading 完整                                       | **完全没有**——`loadHeroes()` 无任何加载指示 | `HeroRosterView.tsx:105-107`                        |
| Error 态       | 有 `ErrorState` + 重试                                    | **完全没有**——API 失败静默、页面空白        | 全文件无 `ErrorState` 导入（:23 仅导 `EmptyState`） |
| 角色深度       | `TeamRosterPanel` + `AgentLiveGrid` + 拓扑 + Agent 实时态 | 仅 `AssetCard` 网格 + 配置 Modal            | `HeroRosterView.tsx:133-144`                        |
| 搜索/筛选/排序 | 有                                                        | 无                                          | 全文件无搜索逻辑                                    |

> roster 这一 Tab Playground 侧无等价独立页，所以这里不是"对齐"而是"专家团自己的核心页太薄"。

**建议（纯前端，不碰 Playground）**：

- 给 `HeroRosterView` 补 `LoadingState` / `ErrorState`（store 暴露 loading/error 态）。
- 视需要补搜索/筛选。
- 角色丰富度（实时态/拓扑）属增量，按产品优先级评估。

---

## 差距二：详情面板「同代码、跑降级数据」→ 看起来空（数据债，非 UI 债）

详情组件与 Playground 相同，但 `fromCompanyMissionResult` 适配器喂入的是降级数据，面板渲染出"最小子集/空态"。**改 UI 无用，须补后端 company mission 的结构化产物**。

| Tab / 面板                | Playground 数据源             | 专家团喂的数据                  | 证据                                                                           |
| ------------------------- | ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| 任务列表（TodoBoard）     | 完整 `MissionTodo[]`          | 只有 `steps` → 派生最小子集     | `DeepInsightMissionDetail.tsx:223`「company 仅有 steps → 派生最小子集」        |
| 算力（ComputeUsagePanel） | by-stage 明细                 | **空数组**                      | `contract.ts:102`「company 无 → 空数组」                                       |
| 图谱分析（graph）         | 完整实体图                    | 取决于 result 是否带图数据      | `DeepInsightMissionDetail.tsx:614`                                             |
| DAG 流程                  | 完整 DAG ledger + nodeId 映射 | company mission 无 DAG → 不点亮 | playground `page.tsx:181-195` 的 `BACKEND_TO_FRONTEND_STEP` 映射专家团侧无对应 |

> 实时事件专家团**已接入**（`MissionRunView.tsx:185-308` 处理 `company.*` WS 事件 + live cost），所以"协作动态 / 报告"两个 Tab 体验已接近；空的是依赖结构化产物的 DAG / 算力明细 / 图谱。

**建议（后端为主）**：在 company mission 执行链补齐 todoLedger / by-stage usage / 实体图等结构化产物，前端面板无需改动即可自动变丰富。

---

## 差距三：专家团自有代码的状态态/反馈缺口（轻量 UI 债）

`MissionRunView.tsx` 中属于专家团自写的部分有几处吞错/缺反馈：

| 问题                                                                                  | 证据                         | Playground 基线                              |
| ------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------- |
| **下发失败静默**：`createHeroMission` 返回空时只 `setRunning(false)`，无 Toast/无提示 | `MissionRunView.tsx:339-343` | 下发有失败 banner                            |
| **运行中失败无 banner**：`company.mission:failed` 只置进度状态                        | `MissionRunView.tsx:274-279` | failed / quality-failed / WS 失联三类 banner |
| **3s 轮询无上限/退避**                                                                | `MissionRunView.tsx:205-221` | 三连轮询兜底 + race 处理                     |

**建议（纯前端，不碰 Playground）**：下发失败/运行失败补 Toast 或 banner；轮询加超时/失败退避。

---

## 开发时间线对照（解释差距成因）

| 模块       | 集中迭代期                      | 阶段性质                                                        |
| ---------- | ------------------------------- | --------------------------------------------------------------- |
| Playground | 2026-04-30 ~ 05-29（约 1 个月） | 专项精雕（canonical 数据源、报告版本化、全生命周期状态）        |
| 我的专家团 | 2026-06-08 ~ 06-11（约 4 天）   | 业务闭环优先（hero 模型、下发任务、双页头修复），尚未进入打磨期 |

---

## 改动性价比排序

1. **差距一（roster loading/error + 丰富度）** —— 纯前端，独立可做，不碰 Playground。
2. **差距三（下发/失败错误反馈）** —— 纯前端，轻量，不碰 Playground。
3. **差距二（详情面板数据降级）** —— 后端补 company mission 结构化产物，工作量最大，前端零改动自动受益。

---

## 实际核实过的文件

- `frontend/components/me/team/views/MyTeamView.tsx`
- `frontend/components/me/hero/HeroRosterView.tsx`
- `frontend/components/me/team/views/MissionRunView.tsx`
- `frontend/components/missions/deep-insight/DeepInsightMissionDetail.tsx`
- `frontend/components/missions/deep-insight/contract.ts`
- `frontend/app/agent-playground/team/[missionId]/page.tsx`
- `frontend/lib/constants/nav-config.ts`
