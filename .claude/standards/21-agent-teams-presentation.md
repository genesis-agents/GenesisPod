# Agent Teams 呈现标准（前端统一模板）

**版本：** 1.0
**强制级别：** 🔴 MUST
**状态：** 已采纳（ADR + 标准合一）
**日期：** 2026-05-20

> 本文是前端「agent 团队跑 mission」类功能呈现的**唯一权威**。新功能强制遵守；存量按 §7 分波迁移。

---

## 1. 决策记录（ADR）

### 背景

平台约 **10 个菜单**本质是同一种东西——「一个 agent 团队跑多阶段 mission → 流式展示进度 → 产出报告/产物」，但每个 feature 各自造了详情/执行页（进度条、事件流、面板、状态管理都不复用）。场上存在两种互斥的呈现"流派"：

- **playground 派**：事件流 → 纯函数派生 → 只读组件渲染（`agent-playground`、已扩散到 `ai-social`/`ai-radar`）
- **insights 派**：1403 行 Zustand store + 轮询 + 2000 行 god 组件（`ai-insights`/`topic-insights`）

### 决策

**以 agent-playground 的架构为唯一呈现模板。** `ai-insights` 的富渲染能力（章节化报告、引用、批注、版本历史、协作）**不丢弃**，降级为挂在模板上的**可插拔产出面板（artifact renderer）**。

### 理由（模板视角看复用性，不是功能丰富度）

| 维度             | agent-playground                                   | ai-insights                         | 胜         |
| ---------------- | -------------------------------------------------- | ----------------------------------- | ---------- |
| 事件→视图 派生层 | 纯函数 `deriveView`+`deriveTodoLedger`，幂等可重放 | 无；逻辑散在 store(1403)+组件(2000) | playground |
| 实时模型         | 双通道 WS+replay+轮询兜底，去重/补洞               | 5s 轮询 + WS 仅触发 refetch         | playground |
| 跨域通用性       | derive 已显式 namespace 通用                       | 死绑 topic/report/dimension         | playground |
| 测试成熟度       | ~2182 行 + 5 生产 fixture + 回归套件               | store 仅测 CRUD，实时 0 覆盖        | playground |
| 产出渲染丰富度   | 报告/引用基础                                      | 章节报告+引用+批注+版本+协作        | insights   |
| 页面体量         | page 1749 行（待拆）                               | 组件 2000+ / store 1403（待拆）     | 平手       |

### 既成事实（选 playground = 把正在发生的收敛正式化）

- `frontend/lib/features/agent-playground/derive.ts:408` 已规范化 `social.* / agent-playground.* / ai-radar.*` namespace，"剥离 namespace 让 derive 跨 domain 通用"
- `frontend/components/common/mission-detail/`（StageStepper 等）**已被** `ai-social` + `agent-playground` 消费
- `frontend/lib/features/ai-social/derive-social-stages.ts`——social 已采用 playground 式纯派生

---

## 2. 适用范围

| 类别                    | feature                                                                                                                     | 是否适用本标准 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Agent Teams mission** | `ai-teams` `ai-social` `ai-radar` `ai-research` `ai-insights` `agent-playground` `ai-simulation` `ai-planning` `ai-writing` | 🔴 MUST 遵守   |
| 半适用                  | `ai-office`（文档编辑器范式；列表层适用，编辑器主体例外）                                                                   | 列表层 MUST    |
| 不适用（另一范式）      | `ai-ask`（纯 chat）、`library`/`explore`（gallery 浏览）                                                                    | 不强制         |

---

## 3. 标准呈现栈（MUST）

### 列表层（mission 列表/落地页）

```
PageHeaderHero        components/common/page-header-hero/   渐变图标+标题+副标题+右侧操作+搜索/筛选
  + AssetCard         components/common/asset-card/         统一卡片：图标/徽章/可见性/统计/操作菜单
  + MissionGalleryView components/common/missions/          列表加载 + 网格 + 新建弹窗 + rerun/cancel/edit/delete
```

### 详情/执行层（mission 执行页）

```
事件流 ──→ 纯派生层（无副作用、可重放）──→ 只读组件（共享框架 + 面板）

useMissionStream                  实时：WS + replay 水合 + 轮询兜底 + 去重/补洞 + 上限
   （由 hooks/features/useAgentPlaygroundStream.ts 泛化）
        │ events: MissionEvent[]
        ▼
deriveMissionView(events)         纯函数：events → { mission, stages, agents, cost, todos, artifacts }
   （参考 lib/features/agent-playground/derive.ts + todo-ledger.ts；通用部分提到 lib/missions/）
        │ 只读 view-model
        ▼
common/mission-detail/ Frame      MissionDetailFrame + StageStepper + MissionActionGroup + Modal/Drawer Shell
        │ + 共享面板
        ▼
   TodoBoard · Flow/Timeline · ArtifactReader · References · Cost
```

### 每个 feature 只需提供两样东西

1. **「事件→阶段」step-map**：声明本域 mission 的阶段拓扑（参考 `derive.ts` 的 `STAGE_STEPS` / `lib/features/ai-social/derive-social-stages.ts`），配置化，不复制派生引擎。
2. **产出渲染器（artifact renderer）**：本域产物的展示组件（report / social-post / radar-signal / slides…），挂到 ArtifactReader 插槽。

其余（列表卡片、头部、阶段进度、事件流、todo 板、引用、算力、实时通道、状态派生）**全部共享，不得各造一份**。

---

## 4. 架构铁律

### MUST

- 事件→视图必须是**纯函数派生层**（`lib/{feature}/` 或通用 `lib/missions/`），幂等可重放，**带 fixture 回归测试**（参考 `lib/features/agent-playground/__tests__/`：5 个生产快照 + 回归 spec）
- 实时统一走 `useMissionStream`（WS + replay + 轮询兜底 + 去重）
- 状态来源 = 原始 `events[]`（+ DB 快照兜底）→ `useMemo` 派生 → 组件只读消费
- `page.tsx` 只做路由+取参+渲染 `components/{feature}/XxxPage.tsx`（见标准 02 §App Router）

### MUST NOT

- ❌ 再造 store 中心化 + 轮询的详情页（`ai-insights` 旧法，1403 行 store 反面教材）
- ❌ fork `StageStepper` / 复制 `common/mission-detail/` 任何组件
- ❌ 把派生/业务逻辑写进组件 `useEffect` 或 page.tsx
- ❌ feature 间互相 import 详情组件（要复用就上提 `common/`，见标准 02）

---

## 5. 当前采纳状态（现状快照 2026-05-20）

| feature                                                             | 列表层(AssetCard/Hero) | 纯派生引擎                | mission-detail 框架 | 状态       |
| ------------------------------------------------------------------- | ---------------------- | ------------------------- | ------------------- | ---------- |
| `agent-playground`                                                  | ✓                      | ✓（源/参考）              | ✓                   | **模板源** |
| `ai-social`                                                         | ✓                      | ✓（derive-social-stages） | ✓                   | 基本对齐   |
| `ai-radar`                                                          | ✓                      | 部分                      | 部分                | 半程       |
| `ai-insights`                                                       | 部分（Hero）           | ✗（store/轮询）           | ✗（自造 Layout）    | 🔴 待迁移  |
| `ai-writing` `ai-research` `ai-planning` `ai-simulation` `ai-teams` | ✓（列表）              | ✗                         | ✗（详情 bespoke）   | 🔴 待迁移  |

---

## 6. 新 feature 接入清单（MUST 逐项过）

- [ ] 列表页用 `PageHeaderHero` + `AssetCard`(+ `MissionGalleryView`)，未自造卡片/头部
- [ ] 详情页用 `common/mission-detail/` 框架 + `StageStepper`，未自造
- [ ] 实时用 `useMissionStream`，未自造轮询
- [ ] 有纯函数 `deriveXxxView()` 派生层，且有 fixture 回归测试
- [ ] 只贡献了 step-map + artifact renderer 两样域特定代码
- [ ] `page.tsx` 是薄页（< 100 行）

---

## 7. 迁移路线（分波，避开并行重构高峰）

- **P0（本文）** 立标准/ADR，新 feature 强制照此
- **P1** 泛化引擎：`useAgentPlaygroundStream`→`useMissionStream`；`deriveView` 通用部分提到 `lib/missions/` + 每域 step-map（并入 `derive-social-stages`）
- **P2** `ai-insights` 迁到 Frame，章节报告/引用/批注/版本作为可插拔 artifact 面板移植（保留 richness）
- **P3** 其余依次：`ai-radar`（半程）→ `ai-writing` → `ai-planning` → `ai-simulation` → `ai-teams`

---

## 8. Canonical 参考实现（文件锚点）

| 层               | 文件                                                                             |
| ---------------- | -------------------------------------------------------------------------------- |
| 实时通道         | `frontend/hooks/features/useAgentPlaygroundStream.ts`（待泛化 useMissionStream） |
| 纯派生           | `frontend/lib/features/agent-playground/derive.ts` · `todo-ledger.ts`            |
| 派生测试         | `frontend/lib/features/agent-playground/__tests__/`（fixtures + 回归）           |
| 共享框架         | `frontend/components/common/mission-detail/`                                     |
| 列表层           | `frontend/components/common/{page-header-hero,asset-card,missions}/`             |
| 域 step-map 范例 | `frontend/lib/features/ai-social/derive-social-stages.ts`                        |

---

**维护者**: Claude Code · 关联标准: [02-directory-structure.md](02-directory-structure.md)
