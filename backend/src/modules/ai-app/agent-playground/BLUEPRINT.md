# Playground = Full-Stack Blueprint Source

> **核心原则**：Genesis 全平台 agent team app 的唯一可复制源就是 `agent-playground/` 本身（**前端 + 后端**）。playground 既是 production app，又是新 team 的全栈 fork 源。

**Status**: Accepted (2026-05-26, ADR 009)
**Related**: [ADR 009](../../../../../docs/decisions/009-team-app-blueprint-and-cli.md) · [standard 23 §8](../../../../../.claude/standards/23-business-team-framework-usage.md#8-cli-复制流程) · [ADR 008 前端 canonical shell](../../../../../docs/decisions/008-agent-team-ui-unification.md)

---

## 1. 为什么用 playground 自己当全栈 blueprint

| 方案 | 痛点 |
|---|---|
| ❌ 独立的 `_blueprints/team-app-minimal/` | 一发布就开始与 playground 不同步、二度腐化；标杆和复制源是两个东西，维护翻倍 |
| ❌ 文档式 SOP（standard 23 §5 那种 13 步清单） | 人工 copy-paste 出错率高；新人花一天才能跑通 |
| ❌ 后端 + 前端各自 blueprint | 跨栈协议不一致；事件/字段名漂移；前后端复制源不同步 |
| ✅ playground 自身打标签 + CLI 复制（**全栈一体**）| 标杆 = 复制源，永远同步；CLI 一键 fork 前后端；标签是 production 代码的元数据，不腐化 |

playground 一改，blueprint 跟着改。标杆腐化 = production 腐化，**强反馈**。

## 1.05 最高原则：playground 前后台不破坏（兼容性是第一约束）

> **2026-05-26 用户拍板**：playground 所有前后台**原则上不破坏**；任何下沉能力**必须完全兼容、完全覆盖**。

具体红线：

1. **playground 用户视角的功能 100% 不变**——所有 UI 元素、交互时序、报告输出、报错文案、URL、event 命名在用户侧零变化
2. **下沉的能力必须等价**——前端 derive 的输出和后端 derive 的输出**字段级一致**（不漏字段、不改语义、不改顺序、不改 timing）
3. **平移优先于重写**——前端业务代码下沉到后端时**整体平移**（保留原逻辑），不允许借机重构内部实现（除非有等价性测试覆盖）
4. **灰度双跑验证**——下沉一个能力时：前端旧 derive **不删**，后端新 derive 并行计算，前端 dev 模式下双跑比对 → 等价证明后才删旧前端代码
5. **真机回归**——任何下沉 PR 合并前必须真机跑完整 playground mission（多 dim 多 chapter），截图 + 行为对照
6. **不允许"差不多就行"**——发现任何字段差异、时序差异、文案差异都是 P0 阻塞

### 兼容性验证机制（PR-D 起每个下沉 PR 必带）

| 验证 | 工具 | 通过标准 |
|---|---|---|
| 字段级等价 | `<team>-view-state.equivalence.spec.ts`（jest）| 前端旧 derive 输出 vs 后端新 derive 输出 deep-equal |
| event 时序 | WS event recorder + replay | 序列、interval、payload schema 完全一致 |
| 真机截图 | playwright screenshot diff | 关键页面 pixel-diff < 阈值 |
| 行为对照 | 手工跑 mission（多场景）| operator checklist 100% 通过 |
| 性能 | k6 / autocannon | 后端 derive 不引入 > 50ms p95 延迟 |

### 灰度切换协议

每个下沉能力（如 derive.ts）按 3 步：

```
Step 1 (双跑校验): 后端新 derive 上线 emit `mission:view-state` event；
                  前端旧 derive 继续运行，dev 模式下比对，记录 diff 报告
Step 2 (前端切换): dev 验证 ≥ 7 天 0 diff 后，前端 UI 改用后端 view state；
                  旧 derive 保留作 fallback（feature flag 切换）
Step 3 (清理):    feature flag 关闭 ≥ 7 天稳定运行后，删前端旧 derive
```

**禁止**：跳过任何一步直接删前端旧代码。

## 1.1 重要原则：前端薄壳 + 业务下沉到后端

**前端不允许做业务推导**。所有 "event → mission state"、"chunks → artifact"、"todo 状态机"、"verdict 计算" 都在**后端**做，前端只负责：

- **渲染**：把后端给的 view state 显示
- **交互**：用户点击/输入，发请求/事件给后端
- **本地 UI 状态**：drawer 开关、当前 tab、表单输入草稿

| 后端做（business） | 前端做（UI shell） |
|---|---|
| event stream → mission view state derive | 渲染 view state |
| chunks → artifact synthesis | 渲染 artifact markdown |
| todo state machine | 渲染 todo board |
| verdict / score 计算 | 渲染分数 |
| reference dedup / citation 排序 | 渲染 reference list |
| stage status transition | 渲染 stage pill |
| friendly error 文案 | i18n 包装 + 渲染 toast |
| 数据格式化（千分位、日期）| 展示层格式化（locale-aware）|

**复制 playground 时 = 复制前后端 + 业务全留在后端**。新 team 作者只在后端填业务，前端 0 改动（界面继承）。

---

## 2. 全栈复制流程（4 步）

### Step 1 — CLI fork（前后端一体）

```bash
npm run create:team my-team
```

CLI 自动做的事：

**后端**：
1. 复制 `backend/src/modules/ai-app/agent-playground/` 整个目录到 `backend/src/modules/ai-app/my-team/`
2. 按文件级 `@blueprint:*` 标签做分类变换（详 §3）
3. 按区段标签清空 framework-subclass 文件内的 domain 区段（详 §4）
4. 全局占位符替换（详 §5）
5. Prisma schema：复制 `AgentPlaygroundMission` model 为 `MyTeamMission`（model 名占位符替换）

**前端**：
6. 复制 `frontend/components/agent-playground/` → `frontend/components/my-team/`
7. 复制 `frontend/app/agent-playground/` → `frontend/app/my-team/`
8. 复制 `frontend/services/agent-playground/api.ts` → `frontend/services/my-team/api.ts`
9. **不复制** `frontend/lib/features/agent-playground/`（这些 derive 逻辑应已下沉到后端，前端 lib/features/ 留少量纯 UI helpers）
10. 占位符替换（含 i18n key、CSS class、API path）

**输出**：
11. 提示 "请把 `MyTeamModule` 加到 `backend/src/app.module.ts`、`<MyTeamPage>` 路由加到 `frontend/app/`"（不自动改入口）

### Step 2 — 验证骨架

```bash
# 后端
npx jest src/__tests__/architecture/agent-team-layout.spec.ts
npx jest src/__tests__/architecture/agent-team-facade-contract.spec.ts
npx jest src/__tests__/architecture/agent-team-blueprint-tags.spec.ts  # PR-A.5 后
npm run type-check

# 前端
cd frontend && npm run type-check && npm run lint
npm run audit:mission-detail-discipline  # ADR 008 canonical shell discipline
npm run audit:ui-discipline               # standard 22 UI governance
```

骨架已具备：
- §8.2 目录布局合规
- framework-subclass 文件正确 `extends *Framework`
- 前端用 canonical `MissionDetailFrame` / `DrawerShell` / `ModalShell`（ADR 008）
- TypeScript strict 全栈通过

### Step 3 — 填后端业务 domain

CLI 已把 domain 文件 body 清空、保留 method 签名 + `TODO: implement` 注释。按顺序填：

| 顺序 | 文件 | 填什么 |
|---|---|---|
| 1 | `runtime/<team>.config.ts` | `defineMissionPipeline()` 的 steps + roles |
| 2 | `mission/agents/<role>/SKILL.md` | 每个 agent 的 frontmatter + system prompt |
| 3 | `mission/skills/<skill>/SKILL.md` | domain 技能 prompt（独立于 agent）|
| 4 | `mission/pipeline/stages/s*.stage.ts` | 每个 stage 的业务实现 |
| 5 | `api/dto/run-mission.dto.ts` | mission 输入字段 |
| 6 | `events/<team>.events.ts` | DomainEvent schema |
| 7 | `api/controller/<team>.controller.ts` | 额外的扩展端点（基础 run/status/abort 已就绪）|
| 8 | `mission/lifecycle/<team>-view-state.service.ts` | **后端 derive**：把 event stream → view state（替代旧的前端 derive.ts，详 §6）|
| 9 | `mission/artifacts/<team>-artifact-composer.service.ts` | **后端合成**：把 chunks → 完整 artifact（替代旧的前端 synthesize-artifact.ts）|

### Step 4 — 前端理论上 0 改动（界面继承）

按 ADR 008 + standard 21 + standard 22，前端使用 canonical shell：
- `MissionDetailFrame` 已提供头部 + 左团队 slot + 右 tab + 内容 slot
- `DrawerShell` / `ModalShell` 已提供抽屉/弹层壳
- `StageStepper` 已提供进度条
- `useMissionStream` 已泛化（按 missionId / endpoint 接入）

**新 team 前端实际工作量**：
- ✅ 改 `api.ts` 里的 endpoint path（CLI 已替换占位符）
- ✅ 配 `useMissionStream({ teamId: 'my-team' })` 接入新后端 WS 频道
- ✅ 渲染后端给的 view state（无 derive 逻辑）
- ✅ team-specific tab panel（如果有独特业务可视化）
- ❌ 不要重写 `MissionFlowView` / `MissionDagView` / `TeamRosterPanel` / `LeaderChatModal`（用 canonical）
- ❌ 不要在前端做 event → state derive
- ❌ 不要在前端做 artifact composition

---

## 3. 文件分类（3 类）

### 3.1 Boilerplate（无脑改名复制）

只有 **1 个**文件：

```typescript
// module/<team>.module.ts
// @blueprint:boilerplate
```

CLI 动作：复制 → 改 class 名 + providers 列表里的引用名。

### 3.2 Framework-subclass（保留继承结构，改 class 名）

**13 个**文件，全部 `extends *Framework`：

| 文件 | 父类（from `@/modules/ai-harness/facade`） |
|---|---|
| `mission/pipeline/<team>.pipeline.ts` | `BusinessTeamMissionDispatcherFramework` |
| `mission/pipeline/<team>-business-orchestrator.service.ts` | `BusinessTeamOrchestratorFramework` |
| `mission/pipeline/<team>-mission-runtime-shell.service.ts` | `MissionRuntimeShellFramework` |
| `mission/pipeline/mission-stage-bindings.service.ts` | `BusinessTeamStageBindingsFramework` |
| `mission/pipeline/playground-cross-stage-state.ts` | `BusinessTeamCrossStageStateFramework` |
| `mission/pipeline/playground-mission-span.service.ts` | (uses span framework) |
| `mission/lifecycle/mission-store.service.ts` | `BusinessTeamMissionStoreFramework` |
| `mission/lifecycle/mission-event-buffer.service.ts` | `BusinessTeamEventBufferFramework` |
| `mission/lifecycle/prisma-mission-checkpoint.store.ts` | `BusinessTeamCheckpointStoreFramework` |
| `mission/rerun/stage-rerun.dispatcher.ts` | `BusinessTeamStageRerunDispatcherFramework` |
| `mission/rerun/rerun-guard.service.ts` | `BusinessTeamRerunGuardFramework` |
| `mission/rerun/ctx-hydrator.service.ts` | `BusinessTeamCtxHydratorFramework` |
| `mission/rerun/rerun-runtime-builder.service.ts` | `BusinessTeamRerunRuntimeBuilderFramework` |
| `mission/rerun/mission-rerun-orchestrator.service.ts` | `BusinessTeamRerunOrchestratorFramework` |

文件头标签：
```typescript
// @blueprint:framework-subclass
```

CLI 动作：
- 改 class 名（`Playground*` → `<Team>*`）
- 改文件名前缀
- **保留**所有 `import { ... } from "@/modules/ai-harness/facade"`
- **保留**所有 `extends *Framework`
- **保留**所有 `super.xxx()` 调用
- 用区段标签清空业务方法（详 §4）

### 3.3 Domain（body 清空，保留签名）

**其他全部文件**，包括：

- `api/controller/*` — controller 的扩展端点（导出、DAG 查询等）
- `api/dto/*` — 输入输出 DTO（字段是 team-specific）
- `api/contracts/*` — 业务契约（dimension-tool-matrix / chapter-count / word-budget 等）
- `runtime/<team>.config.ts` — `defineMissionPipeline()` 调用（steps/roles 配置是 domain）
- `events/<team>.events.ts` — DomainEvent schema
- `mission/pipeline/stages/s*.stage.ts` — 每个 stage 业务实现
- `mission/agents/<role>/` — agent 定义（SKILL.md + agent.ts）
- `mission/skills/*` — domain skill prompts
- `mission/artifacts/*` — chapter/citation/evidence-budget 等业务规则
- `mission/roles/*` — leader/steward/writer/researcher 业务服务
- `mission/chat/*` — leader chat（playground 特有）
- `mission/export/*` — 报告导出（playground 特有）
- `mission/dag-view/*` — DAG 可视化（playground 特有）
- `mission/types/*` — domain 类型
- `mission/context/*` — mission context

文件头标签：
```typescript
// @blueprint:domain
```

CLI 动作：
- 保留 class 名前缀替换（`Playground*` → `<Team>*`）
- 保留 method 签名
- body 清空成 `throw new Error("TODO: implement <method-name>")`
- 文件头加 `// TODO: implement domain logic`
- Markdown 文件（SKILL.md）：保留 frontmatter 结构，正文清空为 TODO

---

## 4. 区段标签语法

用于在 framework-subclass 文件内圈出 playground-specific 业务方法。

```typescript
export class PlaygroundMissionStore extends BusinessTeamMissionStoreFramework {
  // ↓ 通用 mission CRUD 保留（继承框架）

  async getById(id: string, userId: string) {
    return super.getById(id, userId);
  }

  // @blueprint:section-start domain
  // ↓ playground 特有：研究报告的 leader journal / dimensions / verdicts
  //   CLI 会删除标签之间的所有内容

  async appendLeaderJournal(missionId: string, entry: JournalEntry) {
    /* playground 特有的 journal 持久化 */
  }

  async saveReportVersion(missionId: string, version: ReportVersion) {
    /* playground 特有的报告版本持久化 */
  }

  async appendDimensions(missionId: string, dims: Dimension[]) {
    /* playground 特有的 dimension 持久化 */
  }

  // @blueprint:section-end
}
```

CLI 处理：
- 看到 `// @blueprint:section-start <kind>` 和 `// @blueprint:section-end`
- 删除两行之间的全部内容
- **保留标签本身**作为占位（提示读者"这里曾经有 domain 代码"）
- 之间留一行 `// TODO: add your domain methods here`

`<kind>` 当前只支持 `domain`，未来扩展可加 `experimental` / `legacy`。

---

## 5. 占位符约定

CLI 全局替换的占位符（按文件命名 + 类名 + 常量名分别处理）：

| 源 | 目标格式 | 例 |
|---|---|---|
| `Playground` | PascalCase | `Playground` → `MyTeam` |
| `playground` | kebab-case（路径/文件名）| `playground` → `my-team` |
| `playground` | snake_case（DB 模型）| `agent_playground_missions` → `my_team_missions` |
| `agent-playground` | kebab-case（顶层目录）| `agent-playground` → `my-team` |
| `AgentPlayground` | PascalCase（class 前缀）| `AgentPlaygroundMission` → `MyTeamMission` |
| `PLAYGROUND_` | UPPER_SNAKE（const）| `PLAYGROUND_PIPELINE` → `MY_TEAM_PIPELINE` |

CLI 用 AST + 正则双通道——AST 改 class/identifier/import，正则改字符串字面量 + 注释 + Prisma model 名。

---

## 6. 前端业务下沉清单（必须做到的下沉）

playground 当前在前端做了大量业务推导，**这次重构必须全部下沉到后端**。新 team 复制 playground 时，前端自动继承"薄壳"形态。

### 6.1 必须下沉的 6 类逻辑

| 旧前端文件（agent-playground 当前位置）| 业务 | 下沉目标（后端）| 后端新文件 |
|---|---|---|---|
| `lib/features/agent-playground/derive.ts` (大量 LOC) | event stream → mission view state（含 stage status / agent status / 进度 / current step）| `mission/lifecycle/<team>-view-state.service.ts` | 新增 framework-subclass + domain section |
| `lib/features/agent-playground/drawer-derive.ts` | agent / step / artifact drawer 的展示数据组装 | 同上 `<team>-view-state.service.ts` 内合并 | 同上 |
| `lib/features/agent-playground/synthesize-artifact.ts` | chunks / sections → 完整 artifact markdown | `mission/artifacts/<team>-artifact-composer.service.ts` | 新增 domain 文件 |
| `lib/features/agent-playground/todo-ledger.ts` | todo state 机（add / mark-done / dispatch / failover）| `mission/lifecycle/<team>-todo-ledger.service.ts` | 新增 framework-subclass |
| `lib/features/agent-playground/report-artifact.types.ts` | artifact shape type | 移到 `backend/.../api/contracts/<team>-artifact.contract.ts`，前端通过 codegen 镜像 | contract single source |
| `lib/features/agent-playground/stage-id-mapping.ts` | stage id → 前端友好 label | **保留前端**（i18n 是 UI concern）| — |
| `lib/features/agent-playground/formatters.ts` | 千分位 / 日期 | **保留前端**（locale-aware）| — |
| `lib/features/agent-playground/friendly-error.util.ts` | 错误码 → 友好文案 | **保留前端**（i18n 是 UI concern）| — |

### 6.2 后端 view state 推送协议（新增 framework 端口）

后端不再只 emit 原始 event，**每个 mission state 变化**都额外 emit 已 derived 的 view state：

```typescript
// ai-harness/teams/business-team/abstractions/view-state.contract.ts (待加，PR-D)
export interface MissionViewState {
  readonly missionId: string;
  readonly status: MissionStatus;
  readonly stages: ReadonlyArray<StageViewState>;
  readonly agents: ReadonlyArray<AgentLiveState>;
  readonly currentStep: string | null;
  readonly progressPercent: number;
  readonly artifact: ArtifactViewState | null;
  readonly todos: ReadonlyArray<TodoViewState>;
  // domain extension via generic
  readonly domain: TDomainExtension;
}
```

每个 team app 在 `<team>-view-state.service.ts` 里：
- 继承 framework view-state derive logic
- 在 domain section 加 team 特有的 derive（如 playground 的 dimension/verdict）

后端 emit：
- `<team>.mission:view-state` event（push 完整 view state，前端订阅渲染）
- 旧的细粒度 event（`stage:lifecycle` / `agent:invoke` 等）保留作 debug / audit 通道

### 6.3 前端只剩什么

`frontend/components/agent-playground/` 复制后，新 team 前端应只有：

- **page**：路由 + `<MissionDetailFrame>` 装配
- **tab panels**：team 独有的内容 tab（如 playground 的 References / Dimensions / Verify）。**通用 tab（Flow / Artifact / Roster / Todo / Chat）全部用 canonical**
- **service/api.ts**：REST 调用封装（占位符替换路径即可）
- **少量 ui helpers**：纯展示格式化（`formatters.ts` / `friendly-error.util.ts` / `stage-id-mapping.ts`）

**禁止前端做**：
- ❌ 任何 `derive*.ts`（event → state）
- ❌ 任何 `synthesize-*.ts`（chunks → doc）
- ❌ 任何 `*-ledger.ts`（state machine）
- ❌ 维护自己的 mission state shape（用后端推的 `MissionViewState<TDomain>`）

### 6.4 强制看护

PR-D 之后加：
- ESLint rule：`frontend/lib/features/<team>/` 下禁止出现 `derive*.ts` / `synthesize-*.ts` / `*-ledger.ts` 文件名
- frontend audit script：扫 `frontend/components/<team>/` 不允许 import `lib/features/<team>/derive*`（已下沉）
- backend spec：`<team>-view-state.service.spec.ts` 必须存在并测 view state shape contract
- **等价性 spec**：`<team>-view-state.equivalence.spec.ts` 必须存在，验证后端 derive 输出与前端旧 derive 输出 deep-equal（fixture-based）
- PR 模板新增 "兼容性验证 checklist"，未填不许 merge

### 6.5 下沉路线（playground 每个能力一步）

| 步 | 能力 | 后端目标文件 | 灰度验证周期 |
|---|---|---|---|
| D1 | mission view state derive（含 stage status / agent status）| `mission/lifecycle/playground-view-state.service.ts` | 7 天双跑 |
| D2 | drawer derive（agent / step / artifact drawer）| 同上文件合并 domain section | 同 D1 |
| D3 | artifact synthesis（chunks → markdown）| `mission/artifacts/playground-artifact-composer.service.ts` | 7 天双跑 |
| D4 | todo ledger（todo state 机）| `mission/lifecycle/playground-todo-ledger.service.ts` | 7 天双跑 |
| D5 | report-artifact.types → contract 单源 | 移到 `api/contracts/playground-artifact.contract.ts`，前端 codegen 镜像 | 1 周观察 |

**每步**：双跑校验 → 等价证明 → 灰度切换 → 删前端旧代码。**不允许并行多步**——一步一步来，错了能精准回滚。

---

## 7. 复制后验证清单

按顺序，**任一项不通过不允许提交**：

1. ✅ `npx jest src/__tests__/architecture/agent-team-layout.spec.ts` → 必须 7 个 it 通过（含新 team 加入 `AGENT_TEAM_APPS` 列表）
2. ✅ `npx jest src/__tests__/architecture/agent-team-facade-contract.spec.ts` → 12 个 it 通过
3. ✅ `npx jest src/__tests__/architecture/mission-app-conformance.spec.ts` → 必须把新 module 加进 `MISSION_APP_MODULES`
4. ✅ `npm run type-check` → 0 error
5. ✅ `npm run lint` → 0 error
6. ✅ `npx jest src/__tests__/architecture` → 全部 architecture spec 通过
7. ✅ 手工填完 §3.3 domain → 跑一个 e2e mission

---

## 8. anti-patterns（绝对不要）

### 后端

| ❌ 反模式 | 后果 |
|---|---|
| 不用 CLI，手动复制 playground | 漏掉区段清理 + 占位符替换不全 → 新 team 带 playground 业务幻影 |
| Framework-subclass 文件改 `extends *Framework` 父类 | 违反 standard 23 §3；agent-team-facade-contract.spec 拦截 |
| 把 domain 代码写到 framework-subclass 文件外部（绕过区段标签）| CLI 下次同步不到，blueprint 复制时无法清理 |
| 改 import 路径绕过 `@/modules/ai-harness/facade` | 违反 standard 23 §4；ESLint + layer-boundaries.spec 拦截 |
| 创建新顶层目录（如 `playground/services/`）| 违反 §8.2 白名单；agent-team-layout.spec 拦截 |
| 删除 `@blueprint:*` 标签 | 下次 CLI 复制会把这部分当 domain 处理，导致继承断裂 |
| 在 framework-subclass 文件**外**添加新 framework subclass（如另起 `my-helper.service.ts` 自己继承 framework）| 违反 standard 23 §6"3 处再抽象"；framework 扩展必须 3 app 同步 PR |

### 前端

| ❌ 反模式 | 后果 |
|---|---|
| 在 `frontend/lib/features/<team>/` 写 `derive*.ts` / `synthesize-*.ts` / `*-ledger.ts` | 违反 §6 业务下沉；ESLint + audit script 拦截 |
| 自写 `MissionFlowView` / `MissionDagView` / `TeamRosterPanel` / `LeaderChatModal` | 违反 ADR 008；audit:mission-detail-discipline 拦截 |
| Fork canonical shell（`MissionDetailFrame` / `DrawerShell` / `ModalShell`）改一份自己的 | 违反 ADR 008 + standard 21；audit 拦截 |
| 前端维护自己的 mission state shape（不用后端的 `MissionViewState<TDomain>`）| 跨栈协议漂移；codegen contract 校验失败 |
| 用自定义 hook 订阅 WS（不用 `useMissionStream`）| 重复造轮子；后端推协议不一致 |
| 在前端做 stage status 推导 / verdict 计算 / friendly text wrap business logic | 业务逻辑分散两端，难维护、易漂移 |

---

## 9. 维护协议

playground 是 production app，会持续演化。`@blueprint:*` 标签是协议，必须维护：

### 9.1 后端

1. **新加 .ts 文件**：作者必须在文件头加 `// @blueprint:<kind>`（boilerplate / framework-subclass / domain）
2. **改文件分类**（如把 domain 提升为 framework-subclass）：必须 PR 同步改其他两个 team app（standard 23 §6 红线）
3. **新加 framework-subclass 内的 domain 方法**：必须包在 `// @blueprint:section-start domain` ... `// @blueprint:section-end` 之内
4. **删除 `@blueprint:*` 标签**：禁止，除非该文件整体被删

### 9.2 前端

1. **新加 .tsx 文件**：作者必须在文件头加 `// @blueprint:<kind>`（canonical-shell / panel / page / api / ui-helper）
2. **新增"业务推导逻辑"**：必须放后端（不允许在前端 lib/features/ 新增 derive/synthesize/ledger）
3. **新增 team 特有 tab panel**：放 `frontend/components/<team>/panels/` + 标 `@blueprint:domain-panel`，CLI 复制时清空 content

### 9.3 自动看护（PR-A.5 + PR-D 上线后）

- `backend/src/__tests__/architecture/agent-team-blueprint-tags.spec.ts`（待加）：扫 playground/ .ts 文件，每个文件必须有且仅有一个 `@blueprint:*` 文件头标签
- `frontend/scripts/audit-blueprint-tags.ts`（待加）：扫 `components/agent-playground/` 同上
- ESLint rule（待加）：framework-subclass 文件外不许新建 `extends *Framework` 的 class
- ESLint rule（待加）：`frontend/lib/features/<team>/` 下禁止 `derive*.ts` / `synthesize-*.ts` / `*-ledger.ts`

---

## 10. 相关文档

- [ADR 009 团队 app blueprint + CLI 决策](../../../../../docs/decisions/009-team-app-blueprint-and-cli.md)
- [standard 23 business-team framework usage（§8 CLI 复制流程）](../../../../../.claude/standards/23-business-team-framework-usage.md)
- [standard 21 agent teams presentation（前端 canonical）](../../../../../.claude/standards/21-agent-teams-presentation.md)
- [ADR 008 前端 mission detail 统一](../../../../../docs/decisions/008-agent-team-ui-unification.md)
- [agent-playground 目录蓝图（§8.1 / §8.2）](../../../../../docs/architecture/ai-app/agent-playground/agent-playground-target-boundary-and-directory-blueprint-2026-05-24.md)
- [agent-app migration roadmap v2](../../../../../docs/architecture/ai-app/agent-app-mass-migration-roadmap-2026-05-24.md)

---

**Last updated**: 2026-05-26
**Maintainer**: Claude Code
**Version**: 1.0
