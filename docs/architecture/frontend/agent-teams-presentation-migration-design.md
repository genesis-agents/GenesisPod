# Agent Teams 呈现标准化迁移 — 设计基线（Design Baseline）

**状态：** 🟡 评审中（Draft for Review）
**强制级别：** 评审通过后转 MUST（落实标准 21 的 P3）
**日期：** 2026-05-21
**作者：** Claude Code
**关联：** [标准 21 Agent Teams 呈现](../../../.claude/standards/21-agent-teams-presentation.md)（本设计 = 其 §7 P3 的 ai-teams 落地）· [ADR-007](../../decisions/007-ai-teams-presentation-migration.md) · 模板源 `agent-playground`
**评审基线版本：** v0.1

> 一句话目标：把 `ai-teams` 的详情/执行页从 **3153 行自写 god-class** 迁到 **agent-playground 同款 canonical 呈现**（左：团队拓扑+角色卡+进度；右：任务列表/动作/报告 Tab），组件全复用，ai-teams 只贡献「阶段 step-map + 产出渲染器」。

---

## 1. 背景

- 标准 21 已钦定：agent 团队跑 mission 类功能**统一用 agent-playground 范式**（事件流 → 纯函数派生 → 只读组件渲染）。`ai-teams` 在标准 21 §5/§7 明列为 🔴 **待迁移（P3）**。
- 用户诉求：Agent Teams 后端（Harness+Engine+Infra）已实现，但**前端呈现没标准化**；要做到 Screenshot_100 那种 playground 式呈现。

## 2. 现状盘点

| 项             | 现状                                                                             |
| -------------- | -------------------------------------------------------------------------------- |
| 详情页         | `app/ai-teams/[topicId]/page.tsx` **3153 行 god-class**，自写进度/事件/面板/状态 |
| 列表页         | 已用 `PageHeaderHero` + `AssetCard`（标准 21 列表层基本对齐）                    |
| 实时通道       | 后端 `ai-teams.gateway.ts`（Socket.IO，已 polling-first 抗代理）；前端自写消费   |
| 派生层         | ❌ 无纯函数派生（逻辑散在组件/effect）                                           |
| canonical 框架 | ❌ 未用 `common/mission-detail/`、`StageStepper`、`useMissionStream`             |

## 3. 目标态架构（标准 21 §3 详情层）

```
ai-teams mission 事件（WS + replay 水合 + 轮询兜底）
        │  useMissionStream（由 useAgentPlaygroundStream 泛化；P1 of 标准21）
        ▼  events: MissionEvent[]
deriveTeamsView(events)   纯函数（lib/ai-teams/）→ { mission, stages, agents, todos, cost, artifacts }
        │  幂等可重放 + fixture 回归测试
        ▼  只读 view-model
components/common/mission-detail/  MissionDetailFrame + StageStepper + MissionActionGroup
        │  + 团队拓扑（common/team-topology）+ 右侧 Tab（任务列表/动作记录/输出报告/参考/消息）
        ▼
   TeamsArtifactRenderer（辩论/共识/报告产出，挂 ArtifactReader 插槽）
```

**ai-teams 只需贡献两样**（标准 21 §3）：

1. **step-map**：声明 ai-teams mission 的阶段拓扑（参考 `lib/ai-social/derive-social-stages.ts`）。
2. **artifact renderer**：团队辩论/共识/报告的展示组件，挂 ArtifactReader 插槽。

其余（拓扑、角色卡、阶段进度、事件流、todo 板、引用、算力、实时通道、派生引擎）**全部复用，不得各造**。

## 4. 关键设计：事件模型映射（最核心、最需评审）

迁移成败在于把 **ai-teams 后端现有事件**映射到 `MissionEvent` + `deriveTeamsView` 能消费的形状。

| 待评审点        | 说明                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| ai-teams 事件源 | 现 `ai-teams.gateway` emit 哪些事件？字段？需先盘点（P0 调研），与 `MissionEvent` 对齐或加 adapter              |
| namespace       | 复用 derive 的 namespace 机制（`derive.ts` 已规范化 `social.*/agent-playground.*/ai-radar.*`，加 `ai-teams.*`） |
| 历史水合        | 详情页进入时 replay 历史事件（DB 快照兜底），与 playground 一致                                                 |
| stages 拓扑     | ai-teams 的「Leader 拆解 → 多 Researcher 并行 → Reviewer → Writer」阶段，落 step-map                            |

> ⚠️ 若 ai-teams 后端事件与 `MissionEvent` 差异大，P1 需要一层 **events adapter**（`lib/ai-teams/adapt-events.ts`），把后端事件规范化后再喂 deriveTeamsView——这是工作量的关键不确定项，**P0 调研先定**。

## 5. 组件复用清单（标准 21 §8）

| 层         | 复用文件                                                                           |
| ---------- | ---------------------------------------------------------------------------------- |
| 实时       | `hooks/features/useAgentPlaygroundStream.ts` →（P1 泛化）`useMissionStream`        |
| 纯派生参考 | `lib/agent-playground/derive.ts` · `todo-ledger.ts`                                |
| 共享框架   | `components/common/mission-detail/`（Frame/StageStepper/MissionActionGroup/Shell） |
| 拓扑       | `components/common/team-topology/`                                                 |
| 列表层     | 已用（`PageHeaderHero`/`AssetCard`/`MissionGalleryView`）                          |

## 6. 拆 god-class（3153 行 → 薄页 + 派生 + 复用组件）

- `page.tsx` 降为 < 100 行（路由+取参+渲染 `components/ai-teams/AiTeamsMissionPage.tsx`）。
- 业务逻辑 → `lib/ai-teams/`（deriveTeamsView + step-map + events adapter，纯函数 + 测试）。
- UI → 复用 `common/mission-detail/` + ai-teams 专属 artifact renderer。
- 现有 god-class 的功能逐块映射到上述，**不丢功能**（取消任务/重试/分享等 → MissionActionGroup）。

## 7. 分阶段交付 + 验收标准

| 阶段                     | 内容                                                                                               | 验收                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **P0 调研**（先做）      | 盘点 ai-teams 后端事件模型 + 与 MissionEvent 差异 → 定 adapter 方案                                | 产出事件映射表，更新本设计 §4                            |
| **P1 派生引擎泛化**      | `useAgentPlaygroundStream`→`useMissionStream`；通用 derive 提 `lib/missions/`（与标准 21 P1 协同） | playground 回归不破；新 hook 有测试                      |
| **P2 ai-teams 派生层**   | `lib/ai-teams/`：events adapter + deriveTeamsView + step-map + **fixture 回归测试**                | 纯函数测试：生产事件快照 → 期望 view-model               |
| **P3 详情页迁移**        | 新 `AiTeamsMissionPage` 用 mission-detail Frame + 拓扑 + Tab；page.tsx 瘦身                        | 真机：跑一个 team mission，呈现 = playground；旧功能不丢 |
| **P4 旧 god-class 下线** | 删 3153 行旧详情，import 全切                                                                      | 无残留引用；audit/lint/tsc 0                             |

> 与 #1（对话整理）的顺序：用户已定 **#1 先做**；本迁移在 #1 后启动，P0 调研可并行准备。

## 8. 架构铁律（标准 21 §4，迁移必须遵守）

- 事件→视图必须纯函数派生，幂等可重放，**带 fixture 回归测试**。
- 实时统一 `useMissionStream`，不自写轮询。
- 状态来源 = 原始 events[]（+DB 快照）→ useMemo 派生 → 组件只读。
- 不 fork `StageStepper` / 不复制 `common/mission-detail/`。

## 9. 风险与缓解

| 风险                                | 缓解                                                  |
| ----------------------------------- | ----------------------------------------------------- |
| ai-teams 事件与 MissionEvent 差异大 | P0 调研先定 adapter；差异表进设计再开工 P2            |
| 3153 行 god-class 拆解遗漏功能      | 逐功能映射清单（取消/重试/分享/加入/编辑…）→ 对照验收 |
| 与并发会话/本轮 UI 治理冲突         | 迁移期避开他人正动文件；分波小步 commit               |
| 大重构回归                          | 派生层 fixture 回归 + 真机跑通才下线旧页              |

## 10. 评审清单 / 待确认

- [ ] P0 事件调研结论（最关键）：ai-teams 后端事件是否够喂 deriveTeamsView？adapter 工作量？
- [ ] artifact：team mission 的核心产出是什么（辩论记录 / 共识报告 / 最终报告）？渲染器范围？
- [ ] 是否与标准 21 P1（泛化 useMissionStream）合并做，还是 ai-teams 内先局部用 useAgentPlaygroundStream？
- [ ] 旧 god-class 下线节奏（灰度并存 vs 一次切换）。

```

```
