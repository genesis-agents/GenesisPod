# Business-Team Framework 使用规范

**版本：** 1.0
**强制级别：** 🔴 MUST
**状态：** 已采纳
**日期：** 2026-05-24

> **核心原则**：**新建 agent team app 必须基于 `ai-harness/teams/business-team/` framework + §8.2 目录布局；不允许 copy-paste playground 整个目录树作为模板。**
> 本文是创建新 agent team app（mission-pipeline 型）的唯一权威 SOP。

---

## 1. 适用范围

本规范覆盖以下情况：

- **创建新 mission-pipeline 型 agent team app**（如未来新增 `ai-app/<new-team>/`）
- **修改现有 3 个 agent team app 的结构**（`agent-playground` / `social` / `radar`）
- **修改 `ai-harness/teams/business-team/` framework**

不在范围：

- 非 mission-pipeline 型 app（如 `ai-app/research`、`ai-app/writing` 等纯调用型）
- engine/infra 层的能力下沉

---

## 2. §8.2 目录布局 (MUST)

每个 agent team app 必须严格遵守以下顶层目录布局：

```
ai-app/<team-name>/
├── module/         NestJS Module + onModuleInit 装配
│   └── <team>.module.ts
├── api/            HTTP 边界
│   ├── controller/   *.controller.ts
│   └── dto/          *.dto.ts
├── runtime/        运行时配置/常量/网关
│   ├── <team>.config.ts          mission pipeline 配置 (defineMissionPipeline)
│   ├── <team>-runtime.config.ts  Zod 校验的运行时 tuning
│   ├── <team>.constants.ts
│   └── <team>.gateway.ts         WebSocket gateway（如适用）
├── mission/        mission 运行时业务
│   ├── pipeline/   stages + dispatcher + orchestrator + bindings + runtime-shell
│   │   ├── stages/
│   │   ├── <team>-pipeline-dispatcher.service.ts
│   │   ├── <team>-business-orchestrator.service.ts
│   │   ├── <team>-mission-runtime-shell.service.ts
│   │   └── mission-stage-bindings.service.ts
│   ├── agents/     SKILL.md per role（每个 agent 一个目录）
│   │   ├── <role-1>/SKILL.md
│   │   └── <role-2>/SKILL.md
│   ├── lifecycle/  mission 持久化
│   │   ├── <team>-mission-store.service.ts
│   │   ├── <team>-mission-event-buffer.service.ts
│   │   └── <team>-mission-config-snapshot.ts
│   ├── services/   helper services (可选)
│   └── （per-app 可选）roles/ context/ skills/ artifacts/ types/ chat/ export/ rerun/
├── events/         DomainEventRegistry schema
│   └── <team>.events.ts
├── integrations/   外部平台适配（可选，如 wechat/xhs/sources）
└── __tests__/      per-team 单测（contract 测试归 `src/__tests__/architecture/`）
```

**禁止行为**：

- ❌ 根目录直接放 `.ts` 文件（必须落到 module/api/runtime/mission/events）
- ❌ 出现旧版顶层目录 `services/` `controllers/` `dto/` `agents/` `utils/`
- ❌ 缺少 `module/`、`api/`、`runtime/`、`mission/`、`events/` 任一顶层
- ❌ `mission/` 下缺少 `pipeline/`、`agents/`、`lifecycle/` 任一必备子目录

**自动看护**：`src/__tests__/architecture/agent-team-layout.spec.ts`（43 tests）—— 违规 jest 红 → pre-push 拒推。

---

## 3. 必须基于 `ai-harness/teams/business-team/` framework (MUST)

新 agent team app 的运行时骨架必须 **继承** 而不是 **复制** framework：

| 组件              | Framework 类（在 harness）                                | App 子类（在 ai-app）                                                      |
| ----------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Agent 调用        | `BusinessTeamAgentInvoker.framework` (`invocation/`)      | `<Team>AgentInvoker extends BusinessTeamAgentInvoker.framework`            |
| Mission 派发      | `BusinessTeamMissionDispatcher.framework` (`dispatcher/`) | `<Team>PipelineDispatcher extends BusinessTeamMissionDispatcher.framework` |
| Stage 绑定        | `BusinessTeamStageBindings.framework` (`bindings/`)       | `<Team>StageBindings extends BusinessTeamStageBindings.framework`          |
| Cross-stage state | base class (`state/`)                                     | `<Team>CrossStageState extends ...`                                        |
| Mission span      | tracking helper (`span/`)                                 | 直接复用，无子类                                                           |
| Event relay       | shim pattern (`events/`)                                  | `<Team>EventRelay extends ...`                                             |
| Runtime shell     | `MissionRuntimeShellFramework` (`lifecycle/`)             | `<Team>MissionRuntimeShell extends ...`                                    |

**禁止行为**：

- ❌ Copy-paste playground/social/radar 整个 `mission/pipeline/` 目录作为新 app 起点
- ❌ 在 `ai-app/` 层重写已经在 `ai-harness/teams/business-team/` 提供的能力
- ❌ 不通过 framework subclass，而是直接 `import` framework 内部并 instantiate

**自动看护**：`src/__tests__/architecture/agent-team-facade-contract.spec.ts`（12 tests）—— `mission/{pipeline,lifecycle}/*.ts` 不得直接 `import` `ai-harness/teams/business-team/...`，必须走 `@/modules/ai-harness/facade`。

---

## 4. import 规则 (MUST)

`ai-app/<team>/**/*.ts` 跨层 import：

```typescript
// ✅ 正确：从 facade 拿 framework + service
import {
  defineMissionPipeline,
  MissionPipelineRegistry,
  MissionPipelineOrchestrator,
  BusinessTeamAgentInvoker,
  BusinessTeamMissionDispatcher,
  MissionLivenessGuard,
  MissionLifecycleManager,
  DomainEventRegistry,
} from "@/modules/ai-harness/facade";

import {
  SkillLoaderService,
  loadSkill,
  ToolRegistry,
} from "@/modules/ai-engine/facade";

// ❌ 错误：穿透内部子路径
import { BusinessTeamAgentInvoker } from "@/modules/ai-harness/teams/business-team/invocation/business-team-agent-invoker.framework";
import { ToolRegistry } from "@/modules/ai-engine/tools/registry/tool-registry";
```

**自动看护**（三层）：

1. **ESLint** `backend/.eslintrc.js` SECTION 10 — IDE 实时 + lint-staged pre-commit
2. **jest spec** `layer-boundaries.spec.ts` + `agent-team-facade-contract.spec.ts` — 动态 import / 注释 escape 也拦
3. **pre-push hook** `.husky/pre-push` [0/6] — push 前最后防线

---

## 5. 新建 agent team app 检查清单

按顺序：

1. **目录骨架**：建 `ai-app/<team>/{module,api,runtime,mission/{pipeline,agents,lifecycle},events}/`
2. **pipeline 配置**：`runtime/<team>.config.ts` 用 `defineMissionPipeline()` 定义 step 顺序 + DAG
3. **运行时 tuning**：`runtime/<team>-runtime.config.ts` 用 Zod schema 校验 env 注入
4. **stage 实现**：`mission/pipeline/stages/<s1>.stage.ts` 一个 step 一个文件
5. **agents (SKILL.md)**：`mission/agents/<role>/SKILL.md` 每个 agent 一个 frontmatter + instructions
6. **dispatcher / orchestrator / runtime-shell / bindings**：继承 framework 类，只填业务 hook
7. **lifecycle**：`mission/lifecycle/<team>-mission-store.service.ts` 实现 mission 持久化
8. **events schema**：`events/<team>.events.ts` 声明业务事件 + 在 module `onModuleInit` 注册
9. **liveness adapter**：module `onModuleInit` 注册 `livenessGuard.registerAdapter(...)` 防孤儿
10. **config snapshot**：runtime-shell `openSession()` 冻结 typed config snapshot
11. **app.module.ts 集成**：在 `backend/src/app.module.ts` import `<Team>Module`
12. **`MISSION_APP_MODULES` 登记**：把新 module 路径加到 `mission-app-conformance.spec.ts:23`
13. **跑全套验证**：`npm run type-check` + `npx jest src/__tests__/architecture` + `npm run build`

**红线**：任一项缺失，jest 自动看护会红，pre-push 拒推。

### 5.1 安全控制（MUST，2026-05-24 P32 security 审计补）

新 agent team app 的 HTTP / WS / 外部抓取边界**必须**实现以下安全控制（现有 3 个 app 已遵守，新 app 缺则视为安全回归）：

1. **controller 类级别 `@UseGuards(JwtAuthGuard)`** —— 默认所有端点认证，无显式公开理由不得省略。需公开端点用 `@Public()` 显式标注 + PR 说明
2. **写操作配 `@UseGuards(JwtAuthGuard, RateLimitGuard)`** —— POST / PATCH / DELETE 必须限流。⚠️ 当前 `RateLimitGuard` 是单 pod in-memory（多 pod 实际限额翻倍），跨 pod 强限额用 `DistributedRateLimitGuard`
3. **ownership 校验在 service 层** —— 用户资源（mission / topic / run）的归属校验必须在 service 内完成（`getOwnedById(id, userId)` 模式），不能只靠 controller 传 userId
4. **UUID 路径参数走 `ParseUUIDPipe`** —— `@Param("xxxId", new ParseUUIDPipe({ version: "4" }))`，防非法格式无谓触及 DB
5. **外部 URL 抓取必过 SSRF 校验** —— 调 `assertSafeHttpUrl(url)` 后再 fetch。⚠️ 已知局限：仅 host-string 黑名单，不防 DNS rebinding / redirect-follow（生产应在出站层加 IP 解析校验 + 逐跳重定向校验，见 radar `ssrf-util.ts` 注释）
6. **WebSocket 鉴权要查 blocklist** —— gateway 不能只 `JwtService.verify`（不查 Redis 禁用名单），被禁用户旧 socket 会持续收事件直到 token 过期。需校验 token 是否在 blocklist
7. **禁硬编码 secret / model 名** —— 走 `APP_CONFIG` / TaskProfile（见 CLAUDE.md 行为红线）

**自动看护现状**：上述第 1/2/4 项可静态扫（controller decorator），但目前 `agent-team-layout.spec` 只锁目录结构，**未锁安全 decorator**。新 app 评审时人工核对本清单。后续如加 security decorator AST spec，更新此节。

---

## 6. 修改 `ai-harness/teams/business-team/` framework 的红线

修改 framework 前必须满足：

1. **至少 2 个消费方需要这个改动**（避免 over-engineering for single consumer）
2. **3 个 app 同步迁移**：framework 提取必须 playground + social + radar 同 PR 落地，**不允许 1-of-3**
3. **不破坏向后兼容**：现有子类继承点（hook 签名）保持稳定，新增 hook 必须 optional + 有 default

**自动看护**：`agent-team-layout.spec.ts` 锁 §8.1 子目录白名单（abstractions/invocation/dispatcher/bindings/lifecycle/orchestrator/state/span/events/helpers/rerun），加新顶层子目录会红。

---

## 8. CLI 复制流程（playground 作为全栈 blueprint）

> **2026-05-26 ADR 009 落地**：新建 agent team app 的**首选方式**不再是按 §5 手工 13 步 SOP，而是用 CLI 一键 fork `agent-playground/`。详见 [ADR 009](../docs/decisions/009-team-app-blueprint-and-cli.md) + [BLUEPRINT.md](../backend/src/modules/ai-app/agent-playground/BLUEPRINT.md)。
> §5 SOP 保留作为"理解 playground 内部结构"的参考文档。

### 8.1 CLI 命令

```bash
npm run create:team <team-name>
# 例：npm run create:team market-research
```

参数（CLI 会交互式询问，或通过 flag 传）：
- `--agents=<roles>`：要保留的 agent 角色（默认全部）
- `--stages=<count>`：保留的 stage 数（默认全部 14 个，CLI 删除多余）
- `--skip-frontend`：只复制后端（默认前后端一起）

### 8.2 CLI 行为（按 `@blueprint:*` 元数据变换）

**后端**（`backend/src/modules/ai-app/agent-playground/` → `<team>/`）：

| 文件元数据 | CLI 动作 |
|---|---|
| `// @blueprint:boilerplate` | 改名复制（class 名 + import 引用名替换）|
| `// @blueprint:framework-subclass` | 保留 `extends *Framework` + import + super() 调用；改 class 名前缀；按 §8.3 区段标签清空 domain 方法 |
| `// @blueprint:domain` | 保留 class/method 签名；body 清空为 `throw new Error("TODO: implement <method-name>")`；文件头加 `// TODO: implement domain logic` |

**前端**（`frontend/components/agent-playground/` + `frontend/app/agent-playground/` + `frontend/services/agent-playground/` → 同名 `<team>` 路径）：

| 文件元数据 | CLI 动作 |
|---|---|
| `// @blueprint:canonical-shell` | **不复制**——前端用 canonical shell（`MissionDetailFrame` / `DrawerShell` 等），新 team 直接引用，0 改动 |
| `// @blueprint:panel` | 复制 + 改名；panel content body 清空为 `<div>TODO: render team-specific content</div>` |
| `// @blueprint:page` | 复制 + 改名 + 替换 endpoint path 占位符 |
| `// @blueprint:api` | 复制 + 改名 + 替换 endpoint path |
| `// @blueprint:ui-helper` | 复制 + 改名（保留 formatters/friendly-error 等纯展示 helper）|

**不复制**：
- `frontend/lib/features/agent-playground/derive*.ts` / `synthesize-*.ts` / `*-ledger.ts` —— 这些业务推导逻辑已下沉到后端（ADR 009 决策），前端不需要

**Prisma schema**：
- `AgentPlaygroundMission` model → `<TeamName>Mission`
- 生成 `prisma/migrations/YYYYMMDD_create_<team_name>_missions/migration.sql`

### 8.3 区段标签语法（framework-subclass 内）

```typescript
export class PlaygroundMissionStore extends BusinessTeamMissionStoreFramework {
  // ↓ 框架继承能力保留

  // @blueprint:section-start domain
  // ↓ playground 特有业务方法（CLI 删除标签之间内容）
  async appendLeaderJournal(...) { /* ... */ }
  async saveReportVersion(...) { /* ... */ }
  // @blueprint:section-end
}
```

CLI 删除两行之间内容，保留标签作占位 + 加一行 `// TODO: add your domain methods here`。

### 8.4 占位符替换约定

| 源（playground 里出现的形式）| CLI 替换为（按 case 转）|
|---|---|
| `Playground` (PascalCase) | `<TeamName>` |
| `playground` (kebab/lower) | `<team-name>` 或 `<team_name>` |
| `AgentPlayground` | `<TeamName>` |
| `agent-playground` (路径) | `<team-name>` |
| `agent_playground` (snake, DB)| `<team_name>` |
| `PLAYGROUND_` (UPPER_SNAKE) | `<TEAM_NAME>_` |

AST 改 class/identifier/import；正则改字符串字面量 + 注释 + Prisma model 名 + i18n key。

### 8.5 复制后强制验证清单

```bash
# 1. 后端目录布局
npx jest backend/src/__tests__/architecture/agent-team-layout.spec.ts
# 2. 后端 facade contract
npx jest backend/src/__tests__/architecture/agent-team-facade-contract.spec.ts
# 3. 后端 blueprint tag 完整性（PR-A.5 后）
npx jest backend/src/__tests__/architecture/agent-team-blueprint-tags.spec.ts
# 4. 后端 mission app 注册
npx jest backend/src/__tests__/architecture/mission-app-conformance.spec.ts
# 5. 后端类型
cd backend && npm run type-check
# 6. 前端 canonical shell 合规
cd frontend && npm run audit:mission-detail-discipline
# 7. 前端 UI 规范
npm run audit:ui-discipline
# 8. 前端类型
npm run type-check
# 9. 整体 lint
cd .. && npm run lint
```

**任一项不通过不允许 PR 合并**。

### 8.6 复制后必填的 5 项

CLI 把所有 domain body 清空。新 team 作者必须按顺序填：

1. `runtime/<team>.config.ts` — `defineMissionPipeline()` steps + roles
2. `mission/agents/<role>/SKILL.md` — agent prompt
3. `mission/pipeline/stages/s*.stage.ts` — stage 业务实现
4. `mission/lifecycle/<team>-view-state.service.ts` — 后端 derive logic（domain section）
5. `api/dto/run-mission.dto.ts` — mission 输入字段

### 8.7 维护协议

- playground 后续演化（add/remove 文件、改 framework 继承点）必须维护 `@blueprint:*` 标签 → BLUEPRINT.md §9 维护协议
- 修改 BLUEPRINT.md 等价于修改 §8 本节 → 必须 PR 同步两处
- CLI 实现位于 `scripts/create-team.ts`（PR-B 落地）

### 8.8 兼容性原则（最高红线，ADR 009 §0）

playground 作为活标杆，**任何下沉、重构、CLI 改造都不允许破坏其用户视角功能**：

1. **playground UI / 交互 / 报告输出 / event 命名 / URL** 在用户侧零变化
2. **业务下沉到后端**时必须**完全等价**——前后端 derive 输出 deep-equal、event 时序一致、性能不退化
3. **平移优先**——下沉时整体平移逻辑，不借机重构内部实现
4. **灰度双跑**——前端旧 derive 不删，后端新 derive 并行 dev 比对 ≥ 7 天 0 diff → 灰度切换 → 再 7 天稳定 → 删旧
5. **真机回归**——每个下沉 PR 必须真机跑 playground 多场景 mission，截图 + 行为对照
6. **零容忍**——任何字段差异、时序差异、文案差异都是 P0 阻塞，**禁止"差不多就行"**

**每个下沉 PR 必带 6 类验证**：
- `*.equivalence.spec.ts` 字段级 deep-equal
- WS event recorder + replay 时序一致性
- playwright screenshot diff
- 手工 operator checklist
- 性能 baseline 对比（k6/autocannon）
- 灰度双跑 dev 报告

任一项不通过，PR 拒。CLI 实现也必须保证"复制 playground → 跑 mission 行为与原 playground 一致"——CLI 自身有 e2e 测试。

---

## 9. 例外审批流程

如果 §2-§6 任一规则无法满足：

1. **停下来问用户**：说明哪条规则不适配 + 为什么 + 建议替代方案
2. **获批后留痕**：在对应 spec 的 allowlist 加例外 + PR 描述注释原因
3. **基线只能减不能增**：例外即"被批准一次"，下次 PR 再增即被锁

**禁止行为**：

- ❌ 未经批准在 spec 加 `it.skip(...)` 跳过
- ❌ 未经批准用 `// eslint-disable-next-line` 绕过
- ❌ 把 spec 的 forbidden 列表删一项就提交

---

## 相关文档

- [agent-playground 边界 + 目录蓝图](../docs/architecture/ai-app/agent-playground/agent-playground-target-boundary-and-directory-blueprint-2026-05-24.md) — §8.2 目录 + §8.1 framework 设计原始来源
- [agent app 迁移路线图 v2](../docs/architecture/ai-app/agent-app-mass-migration-roadmap-2026-05-24.md) — Wave 1b + Wave 4 完成状态
- [`16-ai-engine-harness-structure.md`](16-ai-engine-harness-structure.md) — ai-engine / ai-harness 11 顶层聚合（MECE）
- [`02-directory-structure.md`](02-directory-structure.md) — 项目整体目录规范
- [架构边界 jest spec](../backend/src/__tests__/architecture/) —— 自动看护源码

---

**最后更新**: 2026-05-24
**维护者**: Claude Code (Wave 6 P31)
