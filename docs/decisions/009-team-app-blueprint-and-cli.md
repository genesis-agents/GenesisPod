# 009. 全栈 Agent Team App Blueprint —— playground 自身作为复制源 + 前端业务下沉到后端

**Date**: 2026-05-26
**Status**: ✅ Accepted (用户拍板 2026-05-26 — "你来专业决策" + "前后端一起重构，前端实现挪到后端，界面继承 playground")
**关联标准**: [23-business-team-framework-usage.md](../../.claude/standards/23-business-team-framework-usage.md)（本 ADR 落地为 §8 CLI 复制流程）· [21-agent-teams-presentation.md](../../.claude/standards/21-agent-teams-presentation.md) · [22-frontend-ui-component-governance.md](../../.claude/standards/22-frontend-ui-component-governance.md)
**关联 ADR**: [008 前端 mission detail 统一](./008-agent-team-ui-unification.md)（前端 canonical shell；本 ADR 复用，不重做）
**关联设计文档**: [agent-playground BLUEPRINT.md](../../backend/src/modules/ai-app/agent-playground/BLUEPRINT.md)（落地源）

## 背景

Standard 23（2026-05-24）已规定"新建 agent team app 必须基于 `ai-harness/teams/business-team/` framework + §8.2 目录布局"，并提供了 13 步人工 SOP。但实际操作中：

1. **没有可一键复制的源**——人工按 13 步 SOP 起一个新 team app 至少要 1 天，且容易漏 framework subclass 继承点 / facade import / liveness adapter 注册 / spec 登记
2. **前端业务逻辑严重泄漏到前端**——playground 当前在 `frontend/lib/features/agent-playground/` 有 ~6.7K LOC 的 `derive.ts` / `drawer-derive.ts` / `synthesize-artifact.ts` / `todo-ledger.ts`，做 event → state derive + chunks → artifact 合成。新 team 复制时这些逻辑无法直接继承，每个 team 重写一遍 → N=3 重复
3. **前端组件巨石化**——`TodoDetailDrawer 1721` / `MissionTodoBoard 1062` / `TeamRosterPanel 928` 等单文件巨石，复制后难改造
4. **复制源不统一**——后端 standard 23 已立，前端 ADR 008 已立 canonical shell，但两者没有"统一的复制源 + 复制 SOP"——新 team 作者要分别学两份规范，跨栈协议易漂移

用户诉求：**playground 就是标杆，复制源也是 playground 本身（不造独立 blueprint 包），前后端一体复制，前端业务下沉到后端，界面继承 playground**。后续活动自驱执行。

## 决策

### 0. 最高原则：playground 前后台不破坏（兼容性是第一约束）

> 2026-05-26 用户拍板："playground 所有前后台原则上不要去做破坏，下沉能力必须完全兼容、完全覆盖"

任何下沉、重构、CLI 复制都必须满足：

1. **playground 用户视角功能 100% 不变**——UI、交互、报告、报错、URL、event 命名零变化
2. **下沉的能力必须等价**——字段级 deep-equal、event 时序一致、性能不退化
3. **平移优先于重写**——前端业务下沉时整体平移逻辑，不借机重构（除非等价性测试覆盖）
4. **灰度双跑验证**——前端旧 derive 不删，后端新 derive 并行，dev 模式比对 → 等价证明 → 灰度切换 → 删旧
5. **真机回归**——下沉 PR 合并前必须真机跑完整 playground mission，截图 + 行为对照
6. **零容忍**——任何字段差异、时序差异、文案差异都是 P0 阻塞

这是**所有其他决策的前置约束**——下面 §1~§5 的方案设计必须以此为底线。

### 1. playground 自身作为全栈 blueprint 源（不造独立模板包）

否决"独立 `_blueprints/team-app-minimal/`"方案。理由：
- 独立 blueprint 一发布就开始与 playground 不同步、二度腐化
- 标杆和复制源是两个东西 → 维护翻倍
- playground 改一行，blueprint 就过时

改用 **playground 自身打元数据标签 + CLI 复制**：
- playground 既是 production app，又是 fork 源
- 标杆 = 复制源，永远同步
- 标杆腐化 = production 腐化，**强反馈**

### 2. 三层元数据协议（嵌入在 playground 代码里）

#### 2.1 文件级标签（每个 .ts/.tsx 文件头）

```typescript
// @blueprint:boilerplate          // 无脑改名复制
// @blueprint:framework-subclass   // 保留继承，改 class 名
// @blueprint:domain               // body 清空 + TODO
// @blueprint:canonical-shell      // 前端：用 canonical 壳，不复制
// @blueprint:panel                // 前端：team 独有 tab panel
// @blueprint:ui-helper            // 前端：保留前端的纯展示 helper
```

#### 2.2 区段标签（framework-subclass 文件内圈出 domain 方法）

```typescript
// @blueprint:section-start domain
async appendLeaderJournal(...) { /* playground 特有 */ }
// @blueprint:section-end
```

CLI 删除两行之间内容，保留标签作占位。

#### 2.3 占位符约定

`Playground` / `playground` / `AgentPlayground` / `PLAYGROUND_` / `agent-playground` 等按 PascalCase / kebab-case / snake_case / UPPER_SNAKE 分别处理，AST + 正则双通道替换。

### 3. 前端业务逻辑强制下沉到后端

新增协议（详见 BLUEPRINT.md §6）：

**必须下沉的 6 类**：
- event stream → mission view state derive
- chunks → artifact synthesis
- todo state machine
- verdict / score 计算
- reference dedup / citation 排序
- stage status transition

**后端新增 framework 端口**：`MissionViewState<TDomainExtension>` 由后端 emit，前端只渲染。

**前端保留**：
- 渲染 + 交互
- 本地 UI 状态（drawer 开关、当前 tab）
- i18n + locale-aware formatting

**强制看护**：ESLint + frontend audit script 禁止 `frontend/lib/features/<team>/` 出现 `derive*.ts` / `synthesize-*.ts` / `*-ledger.ts`。

### 4. 前端界面 100% 继承 playground

按 ADR 008 + standard 21，新 team 前端使用 canonical shell：
- `MissionDetailFrame` / `DrawerShell` / `ModalShell` / `StageStepper` / `MissionActionGroup`
- `useMissionStream` (泛化的 WS 订阅)

新 team 前端**理论上 0 改动**——CLI 替换占位符 + endpoint path 即可。team-specific 工作量仅限于 panel 内容（如有独特业务可视化）。

### 5. CLI scaffold = playground 全栈 fork

```bash
npm run create:team my-team
```

CLI 行为（详 BLUEPRINT.md §2）：
1. 复制 `backend/.../agent-playground/` → `backend/.../my-team/`，按文件标签 + 区段标签 + 占位符变换
2. 复制 `frontend/components/agent-playground/` / `frontend/app/agent-playground/` / `frontend/services/agent-playground/` → 同名 my-team 路径
3. **不复制** `frontend/lib/features/agent-playground/derive*.ts` 等（已下沉到后端，复制 = 引入回归）
4. 复制 Prisma schema 中的 `AgentPlaygroundMission` model 为 `MyTeamMission`
5. 输出"请把 module 加到 `app.module.ts` / 页面路由加到 `frontend/app/`"提示（不自动改入口，安全）

## 落地路线

### Phase 1 — 文档奠基（本 ADR + PR-A）
- ✅ ADR 009（本文件）
- ✅ `agent-playground/BLUEPRINT.md`（完整 SOP）
- ✅ standard 23 §8 增补（CLI 复制流程）

### Phase 2 — 元数据落地（PR-A.5）
- 给 playground 后端 ~117 个 .ts 文件加 `// @blueprint:<kind>` 文件头标签
- 给 playground 前端 ~46 个 .tsx 文件加同上
- 用区段标签圈出 framework-subclass 内的 domain 方法
- 加 `backend/src/__tests__/architecture/agent-team-blueprint-tags.spec.ts` 看护

### Phase 3 — 前端业务下沉（PR-D，多波）
- 后端新增 `MissionViewState<T>` framework 端口（`ai-harness/teams/business-team/abstractions/`）
- playground 后端新增 `view-state.service.ts` 实现，emit `mission:view-state` event
- playground 前端 `lib/features/agent-playground/derive.ts` 等 6 类逻辑删除
- 加 ESLint + audit 看护

### Phase 4 — 前端组件标杆化（PR-E）
- 把 playground 前端的"通用部分"提升到 `frontend/components/team-app-kit/` 或扩展现有 `components/common/mission-detail/`
- 拆解 5 个巨石组件（TodoDetailDrawer 1721 / MissionTodoBoard 1062 / TeamRosterPanel 928 / ArtifactReader 818 / MissionDagView 797）

### Phase 5 — Social / Radar 同步迁移（PR-F）
- standard 23 §6 红线："3 app 同步迁移"——任何 framework 变化必须 playground + social + radar 一起改
- social / radar 前端切到 canonical shell（ADR 008 P28 复活）

### Phase 6 — CLI scaffold + 复制验证（PR-B）
- 实现 `npm run create:team` CLI
- 真实跑一遍：复制 playground → 起一个 demo team → 验证可跑通 mission

### Phase 7 — 治理收口
- standard 23 §8 增补 CLI usage 章节（PR-A 已含）
- ESLint + jest spec + audit script 全部就位
- 4 路评审

## 影响

### 正向

- **新 team 起步时间**：从 standard 23 §5 的 1 天 → CLI 一键 < 5 分钟 + 仅填业务
- **前后端协议一致**：`MissionViewState<T>` 单一 contract，codegen 镜像，禁止漂移
- **前端 LOC 大幅下降**：playground 前端从 14K → 预计 ≤ 4K（业务下沉到后端 + 巨石拆解）
- **playground 后端 LOC 不增反降**：业务下沉的部分是新增 framework 端口（一次性，跨 team 共享），不重复
- **标杆永远同步**：playground 改一行，blueprint 跟着改，**零漂移**

### 风险

- **playground 前端重构是高风险动作**：现有用户在用，必须真机验证不回归（ADR 008 W0 "playground 零改"约束需要复议——本 ADR 实质上修订 ADR 008 W0 范围：playground 前端从"零改保活标杆"改为"在 §0 兼容性约束下内部重构成薄壳"）
- **前端业务下沉到后端的 6 类逻辑**：需要后端新增能力 + 测试覆盖 + 性能验证（WS 推送频次、payload 大小）；每步必须按 §0 灰度协议（双跑 → 等价证明 → 切换 → 删旧），不许跳步
- **CLI 实现复杂度**：AST + 正则双通道改写，需要 babel/typescript-eslint 工具链；Prisma model rename 需要 DSL parser
- **等价性验证负担**：每个下沉 PR 必须带 `*.equivalence.spec.ts`，前端旧 derive 输出 vs 后端新 derive 输出 deep-equal——增加 dev 成本，但是 §0 红线必须执行

### 兼容性验证机制（每个下沉 PR 必带）

| 验证 | 工具 | 通过标准 | 不通过后果 |
|---|---|---|---|
| 字段级等价 | `*.equivalence.spec.ts`（jest fixture）| deep-equal | PR 拒 |
| event 时序 | WS event recorder + replay | 序列、interval、payload 一致 | PR 拒 |
| 真机截图 | playwright screenshot diff | 关键页面 pixel-diff < 阈值 | PR 拒 |
| 行为对照 | 手工 mission run（多场景）| operator checklist 100% | PR 拒 |
| 性能 | k6 / autocannon | 后端 derive 不引入 > 50ms p95 延迟 | 调优后再合 |
| 灰度双跑 | dev 模式比对 ≥ 7 天 | 0 diff | 延灰度 |

### ADR 008 修订

本 ADR 修订 ADR 008 第 5 条 "地基先行 + 逐 feature 迁移" 中的 W0：

- **原**：W0 走 B 路（playground 零改，反向把外壳抽成 canonical）
- **新**：playground 后端继续作为活标杆 + 元数据源；**playground 前端**主动重构成"薄壳"形态（业务下沉到后端 + 巨石拆解 + 用 canonical shell）

理由：用户 2026-05-26 拍板"前端实现要挪到后端，整体上能够创建一个类似 playground 的 agent team"。"playground 0 改"不能与"业务下沉 + 巨石拆解"共存。

## 待评审

- ADR 008 W0 范围修订是否需要单独 ADR 008.1 或并入本 ADR
- `MissionViewState<T>` framework 端口设计需要 architect / arch-auditor 评审
- CLI 实现选 babel vs ts-morph vs jscodeshift（待 PR-B 决策）
- Prisma model rename 的 migration 策略（CLI 是否生成 migration / 还是仅生成 schema diff 提示）
- 前端巨石拆解的视觉回归验证策略（人工 vs 自动截图对比 vs storybook visual diff）

---

**最后更新**: 2026-05-26
**维护者**: Claude Code
**版本**: 1.0
