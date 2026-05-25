# Agent Playground Target Boundary And Directory Blueprint

**Status:** **Wave 1b + Wave 4 完成 (2026-05-24 night)**。3 个 agent team app (playground/social/radar) 已统一到 §8.2 顶层布局；§8.1 business-team framework 6 个能力切片 (invoker / dispatcher / bindings / state / span / event-relay) 已沉到 `ai-harness/teams/business-team/`；3 层看护栏 (ESLint + jest spec + pre-push) 全部锁定。
**Scope:** `backend/src/modules/ai-app/agent-playground/**`, its intended seam with `backend/src/modules/ai-harness/**`, and the corresponding frontend mission-detail structure.
**Audience:** Engineers evolving `agent-playground` into the benchmark Agent Team app, and engineers creating future MissionPipeline-based teams.

---

## Revision Log

### 2026-05-24 (night) — Wave 1b + Wave 4 完成

**已落地的 §8.2 顶层布局 (3 个 agent team app 统一)**：

```
ai-app/{playground,social,radar}/
├── module/        NestJS Module + onModuleInit
├── api/           Controllers + DTO
├── runtime/       *.config.ts + gateway + constants + tuning profile
├── mission/
│   ├── pipeline/   stages + dispatcher + orchestrator + bindings + runtime-shell
│   ├── agents/     SKILL.md per role
│   ├── lifecycle/  mission store + event buffer + config snapshot
│   ├── services/   helper services
│   └── （per-app 可选）roles/ context/ skills/ artifacts/ types/ chat/ export/ rerun/
└── events/        DomainEventRegistry 注册 schema
```

**已沉降的 §8.1 framework (`ai-harness/teams/business-team/`)**：

| 切片            | Framework class                           | LOC  | 消费方                  |
| --------------- | ----------------------------------------- | ---- | ----------------------- |
| `invocation/`   | `BusinessTeamAgentInvoker.framework`      | 155  | playground/social       |
| `dispatcher/`   | `BusinessTeamMissionDispatcher.framework` | 192  | playground/social       |
| `bindings/`     | `BusinessTeamStageBindings.framework`     | 46   | playground/social       |
| `state/`        | cross-stage-state base                    | 81   | playground/social/radar |
| `span/`         | mission-span tracking                     | 178  | playground/social       |
| `events/`       | event-relay-base                          | shim | playground/social/radar |
| `lifecycle/`    | `MissionRuntimeShellFramework`            | -    | 全 3 个                 |
| `orchestrator/` | (P7 待评估,不在 Wave 1b 范围)             | -    | -                       |

**三层看护栏 (2026-05-24 night Wave 4)**：

1. **ESLint** (IDE 实时 + lint-staged) — `backend/.eslintrc.js` SECTION 10：ai-app 不得穿透 ai-harness 内部，必须走 `ai-harness/facade`
2. **jest spec** (jest changedSince + pre-push 全量)：
   - `agent-team-layout.spec.ts` (43 tests) — §8.2 顶层 + §8.1 子目录白名单
   - `agent-team-facade-contract.spec.ts` (12 tests) — mission/{pipeline,lifecycle} 只能走 facade
   - `layer-boundaries.spec.ts` — L4→L3→L2.5→L2→L1 单向
   - `mission-app-conformance.spec.ts` — liveness adapter + config snapshot 必备
3. **pre-push hook** (`.husky/pre-push` [0/6])：跑全 `src/__tests__/architecture/` 24 suites/228 tests，违规拒推

**未做 / 推迟项 (per Roadmap §6)**：

- **Wave 1 P4-P7 (T2/T3/T4 helpers + orchestrator framework)** — grep 显示 P4 列出的 8 个 helper 只存在于 playground，社/radar 没有等价物，**违反 "3 处使用再考虑抽象" 原则**，推迟到真有第二消费方时再做
- **Wave 6 P32 (4-way collective review by architect / arch-auditor / reviewer / security-auditor)** — 需要用户授权（spawn 4 个 sub-agent 成本可观）

### 2026-05-24 (evening) — Reviewed and revised

The original document was reviewed by main agent. Conclusions:

- **§3 boundary rules / §4 layer contracts / §10 app-layer white list / §12 guardrails** — accepted as-is, these are the target state.
- **§5 / §8 / §13 framework extraction proposals** — **accepted in full direction, but originally judged as "wait for trigger" by the reviewer; this judgment was wrong**. Real grep on 2026-05-24:

  | Module           | Files | Mission-pipeline flags                     |
  | ---------------- | ----- | ------------------------------------------ |
  | agent-playground | 113   | M / P / D / O / I / R (complete benchmark) |
  | social           | 112   | M / P / D / O / I / R (copy of playground) |
  | radar            | 64    | M / P / D / O / R (copy, no invoker)       |
  | writing          | 144   | M / P / O                                  |
  | topic-insights   | 200   | M / O (largest module)                     |
  | office           | 109   | P / O                                      |
  | research         | 75    | O                                          |
  | planning         | 12    | O                                          |
  | teams            | 78    | M only                                     |

  Flag legend: **M**ission dir / **P**ipeline / **D**ispatcher / **O**rchestrator / **I**nvoker / **R**untime-shell.

  Concrete copy evidence: `social/services/mission/workflow/narrative.util.ts` is the same file (by name) as `agent-playground/services/mission/workflow/narrative.util.ts`.

  Conclusion: framework extraction is **paying for active multi-team usage**, not speculative. The §13 migration must start **now**, not "after a future trigger".

- **§13 phase order revised** from **A (dispatcher) → B (invoker) → C (bindings)** to **B (invoker) → A (dispatcher) → C (bindings) → D (orchestrator framework)**, because invoker is the smallest and lowest-risk extraction (stateless retry/abort/backoff), and validates the framework pattern before tackling the stateful dispatcher.

- **Wave 2 added beyond the original §13:** all 5 half-set teams (writing / topic-insights / office / research / planning) must also migrate; teams module needs a separate boundary decision vs `ai-engine/teams/`.

- **Wave 3 added:** lift shared prompts / tool invocations / budget-tracing-evidence / event-relay base from app layer up to engine / harness.

- **Wave 4–6:** guardrails + frontend canonical shell + closeout review, mirroring the v3.1 epic three-layer guardrail pattern that just landed.

Full execution plan (23 phases across 6 waves) tracked in:

- [`agent-app-mass-migration-roadmap-2026-05-24.md`](../agent-app-mass-migration-roadmap-2026-05-24.md)

The document below remains the authoritative **boundary and contract** reference; the roadmap is the **how-and-when** companion.

---

## 1. Purpose

This document answers one specific question:

> If `agent-playground` is the benchmark Agent Team app, what should stay in the app, what should sink into `ai-harness`, and what directory shape should future teams follow?

The goal is not to make `agent-playground` larger or more generic.

The goal is to make it:

- a thin business app
- on top of a strong business-team runtime framework
- with a boundary that is easy for both humans and coding agents to understand

---

## 2. Executive Summary

Current state is directionally good, but not yet the cleanest benchmark.

The important split is:

- `ai-harness` owns how missions run
- `ai-app/*` owns what this business means

Today, `agent-playground` already keeps most business semantics in the right place, and `MissionRuntimeShellFramework` has already been correctly sunk into `ai-harness`.

The remaining issue is narrower:

- some reusable mission runtime glue still lives in `agent-playground`
- the app is still partly acting as a template to copy, instead of a reference implementation over a reusable framework

Target state:

- future teams do not copy `agent-playground` wholesale
- future teams compose a harness-level `business-team` framework and only provide:
  - business input schema
  - pipeline graph
  - stage handlers
  - app adapter

---

## 3. Boundary Rules

Use these rules when deciding ownership.

### 3.1 Keep in `ai-app`

Code stays in app if it encodes any of the following:

- business input meaning
- stage topology and stage order
- domain-specific context fields
- report semantics or product artifacts
- role semantics and prompts
- app-specific event namespace and UI payload meaning

In short:

> If another team would need to rewrite the semantics, it belongs in the app.

### 3.2 Sink into `ai-harness`

Code should move into harness if it answers any of the following:

- how a mission session is opened and cleaned up
- how stage progress is tracked
- how checkpoints are saved and resumed
- how agent invocation retries, degrades, aborts, and spans are handled
- how common team-stage bindings are assembled
- how a generic business-team mission dispatcher should work

In short:

> If another MissionPipeline team would keep more than 70% unchanged, it belongs in the harness runtime.

### 3.3 Do not sink business semantics by accident

The following must not be platformized:

- report-domain context fields such as `reconciliationReport`, `reportArtifact`, `leaderSignOff`
- `agent-playground.*` event meaning
- playground-specific rerun business patch rules
- playground stage ids and their business interpretation

---

## 4. Layer Contracts

Directory shape alone is not enough. The target state also needs strict layer contracts so both human developers and coding agents can tell what each layer is allowed to do.

### 4.1 Agent contract

An `Agent` is a pure cognitive unit.

It may own:

- input schema
- output schema
- prompt and duty text
- tool declaration
- role-specific reasoning semantics

It must not own:

- mission lifecycle
- retry loops
- checkpoint logic
- rerun logic
- heartbeat
- finalize or terminal state writes
- frontend event semantics

Rule:

> an agent answers "how this role thinks", not "how the mission runtime works".

### 4.2 Role-service contract

A `RoleService` is the NestJS business wrapper around one or more agents.

It may own:

- semantic methods such as `writeChapter()` or `assessResearch()`
- light business argument shaping
- choosing which agent or spec to call
- app-local role behavior composition

It must not own:

- generic retry shell
- mission progress tracking
- generic degraded reporting machinery
- generic span lifecycle shell
- checkpoint writes

Rule:

> a role service expresses business intent, but does not reimplement runtime execution policy.

### 4.3 Stage contract

A `Stage` is a business workflow step.

It may own:

- stage-local business branching
- reading and writing business context
- deciding which role service to call
- emitting stage-local soft-failure intent through approved helpers

It must not own:

- direct terminal state writes outside lifecycle manager
- generic runtime cleanup
- generic mission orchestration
- generic event transport plumbing

Rule:

> a stage owns business workflow decisions, not reusable runtime machinery.

### 4.4 Dispatcher contract

A `BusinessTeamMissionDispatcher` owns mission runtime execution shell.

It may own:

- `runMission(...)` shell
- session lifecycle
- hook wrapping
- progress tracking
- checkpoint orchestration
- common mission failure shell

It must not own:

- app-specific report semantics
- app-specific artifact meaning
- stage business logic

### 4.5 Binding contract

A `BusinessTeamStageBindings` layer owns assembly mechanism, not business payload shape.

It may own:

- common deps assembly skeleton
- common helper injection
- standard hook seams

It must not own:

- playground-only context fields
- playground-only domain data model

---

## 5. BusinessTeam Framework Contract

The `business-team` layer in harness should be treated as a formal framework, not just a convenient folder for shared code.

### 5.1 App must provide

Each app should provide a small explicit adapter surface:

- `eventNamespace`
- mission persistence adapter
- business input snapshot and rebuilder
- pipeline config
- business orchestrator or stage hook builders
- feature event relay mapping

### 5.2 Framework must provide

The harness framework should provide defaults for:

- mission session open and cleanup
- retry, abort, and degrade shell
- checkpoint and progress shell
- stage-binding assembly skeleton
- common event transport shell
- contract-testable default behaviors

### 5.3 Framework seams

Recommended top-level seams:

- `BusinessTeamAppAdapter`
- `BusinessTeamMissionDispatcher`
- `BusinessTeamAgentInvoker`
- `BusinessTeamStageBindings`
- `MissionInputRebuilder`
- `BusinessTeamEventRelay`

Rule:

> the app injects business policy; the framework owns execution mechanics.

---

## 6. Current Ownership Assessment

This section reflects the local code reviewed on 2026-05-24.

### 6.1 Already in the right place

#### A. Correctly sunk into `ai-harness`

`MissionRuntimeShellFramework` is already where it should be:

- `backend/src/modules/ai-harness/teams/business-team/lifecycle/mission-runtime-shell.framework.ts`

`agent-playground` now only keeps a thin business adapter:

- `backend/src/modules/ai-app/agent-playground/services/mission/workflow/mission-runtime-shell.service.ts`

This is the right split:

- harness owns lifecycle skeleton
- app injects namespace, store schema, input rebuilding, budget and wall-time resolution

#### B. Correctly kept in `agent-playground`

The following are app-local by nature and should stay there:

- `playground-business-orchestrator.service.ts`
- `mission-context.ts`
- `mission-deps.ts`
- `playground-mission-input-rebuilder.service.ts`
- all playground stages
- all playground role services
- `agent-playground.event-schemas.ts`

Reason:

- they encode playground's report-generation semantics, not reusable runtime behavior

### 6.2 Still too framework-like inside the app

#### A. `PlaygroundPipelineDispatcher`

Current file:

- `backend/src/modules/ai-app/agent-playground/services/mission/workflow/playground-pipeline-dispatcher.service.ts`

What is still generic enough to sink:

- per-mission `sessions` lifecycle
- `runMission(...)` runtime shell orchestration
- progress wrapper around stage hooks
- checkpoint save pattern
- orphan cleanup
- fire-and-forget postlude framing
- generic mission failure handling shell

What should remain app-local:

- playground business hook construction
- app-specific event mapping details
- business-specific pipeline config

Assessment:

> This file has already been improved by extracting `PlaygroundBusinessOrchestrator`, but the remaining dispatcher shell is still benchmark-framework material, not app business logic.

#### B. `AgentInvoker`

Current file:

- `backend/src/modules/ai-app/agent-playground/services/roles/agent-invoker.service.ts`

What is generic enough to sink:

- retry loop
- transient error handling
- backoff logic
- abort short-circuit
- degraded reporting shell
- agent span lifecycle shell

What should remain app-local:

- playground event relay semantics
- app-specific invocation policy extensions

Assessment:

> The file already separates execution support, relay, and policy, but the main invocation shell is still a reusable business-team runtime concern.

#### C. `MissionStageBindingsService`

Current file:

- `backend/src/modules/ai-app/agent-playground/services/mission/workflow/mission-stage-bindings.service.ts`

What is generic enough to sink:

- the mechanism for assembling common deps
- standard stage helpers such as degraded reporting hook
- common binding skeleton for context and deps factories

What should remain app-local:

- actual `MissionContext` fields
- actual `MissionDeps` surface
- business field mapping

Assessment:

> The mechanism is reusable; the payload shape is not.

---

## 7. Target Ownership Model

### 7.1 `ai-harness` owns

- mission lifecycle primitives
- runtime shell framework
- business-team mission dispatcher framework
- business-team agent invoker framework
- business-team stage-binding framework
- checkpoint, progress, and resume mechanics
- common event protocol

### 7.2 `agent-playground` owns

- `RunMissionInput` and business input schema
- pipeline graph and stage order
- stage handlers
- role services
- context and deps types
- business artifacts
- app event schemas and payload semantics
- app adapter wiring

---

## 8. Recommended Target Directory Design

### 8.1 `ai-harness`

```text
backend/src/modules/ai-harness/
├── lifecycle/
│   ├── mission-lifecycle/
│   ├── rerun/
│   ├── liveness/
│   └── ownership/
│
├── guardrails/
│   ├── budget/
│   ├── billing/
│   ├── runtime/
│   └── constraints/
│
├── runner/
│   ├── agent-runner/
│   ├── executor/
│   └── tracing/
│
├── protocols/
│   ├── events/
│   ├── stage/
│   └── contracts/
│
├── teams/
│   ├── orchestrator/
│   │   ├── pipeline/
│   │   ├── checkpoint/
│   │   └── progress/
│   │
│   ├── business-team/
│   │   ├── abstractions/
│   │   │   ├── business-team-app.adapter.ts
│   │   │   ├── business-team-stage.contract.ts
│   │   │   ├── business-team-context.contract.ts
│   │   │   └── business-team-event-relay.contract.ts
│   │   │
│   │   ├── lifecycle/
│   │   │   ├── mission-runtime-shell.framework.ts
│   │   │   └── business-team-session.store.ts
│   │   │
│   │   ├── dispatcher/
│   │   │   └── business-team-mission-dispatcher.framework.ts
│   │   │
│   │   ├── invocation/
│   │   │   ├── business-team-agent-invoker.framework.ts
│   │   │   ├── retry-policy.ts
│   │   │   ├── invoke-span-support.ts
│   │   │   └── degrade-reporter.ts
│   │   │
│   │   ├── bindings/
│   │   │   └── business-team-stage-bindings.framework.ts
│   │   │
│   │   ├── rerun/
│   │   │   ├── mission-input-rebuilder.contract.ts
│   │   │   └── snapshot-codec.framework.ts
│   │   │
│   │   └── events/
│   │       ├── business-team-event-relay.base.ts
│   │       └── business-team-event-types.ts
│   │
│   └── shared/
│       ├── report-artifact/
│       ├── handoff/
│       └── evaluation/
│
└── facade/
```

### 8.2 `agent-playground`

```text
backend/src/modules/ai-app/agent-playground/
├── module/
│   └── agent-playground.module.ts
│
├── api/
│   ├── controller/
│   ├── dto/
│   └── contracts/
│
├── runtime/
│   ├── agent-playground.adapter.ts
│   ├── agent-playground.event-relay.ts
│   ├── agent-playground.snapshot.ts
│   └── agent-playground.input-rebuilder.ts
│
├── mission/
│   ├── pipeline/
│   │   ├── playground.pipeline.ts
│   │   ├── playground-business-orchestrator.service.ts
│   │   └── stages/
│   │
│   ├── context/
│   │   ├── mission-context.ts
│   │   └── mission-deps.ts
│   │
│   ├── roles/
│   │   ├── leader.service.ts
│   │   ├── researcher.service.ts
│   │   ├── writer.service.ts
│   │   └── ...
│   │
│   ├── artifacts/
│   └── lifecycle/
│       └── mission-store.service.ts
│
├── events/
│   ├── agent-playground.events.ts
│   └── agent-playground.event-schemas.ts
│
└── __tests__/
```

---

## 9. Frontend And Cross-Layer Contract

The benchmark app needs not only backend boundaries, but a stable cross-layer contract between backend mission runtime and frontend mission presentation.

### 9.1 Shared feature contract

Every mission feature should be able to derive the following minimum view model from backend events and mission reads:

- mission summary
- stage progression
- role progression
- todo or task list
- artifact summary
- references and citations
- terminal outcome

This model should be standardized at the shape level, even if the content remains feature-specific.

Recommended shared contract areas:

- event namespace and event family taxonomy
- mission summary view shape
- stage view shape
- role-card view shape
- drawer payload shape
- artifact-reader input shape

Rule:

> backend may remain app-specific internally, but frontend should not need to rediscover mission semantics from scratch for every feature.

### 9.2 Frontend target design

Frontend should follow the same ownership split as backend:

- platform defines the shell
- feature defines the content

This section does not replace the existing frontend baseline. It integrates it into the benchmark app boundary model.

Companion:

- `docs/architecture/frontend/agent-team-ui-unification.md`

### 9.3 Frontend ownership split

#### Platform-owned frontend concerns

These should be canonical and shared:

- mission detail page shell
- left team panel shell
- right tab-strip shell
- drawer shell
- modal shell
- stage stepper shell
- mission action group shell
- mission streaming transport hook
- shared mission-view derivation primitives

In short:

> frontend platform owns how an agent-team mission page looks and behaves structurally.

#### Feature-owned frontend concerns

These should stay inside each app feature:

- which tabs exist
- what each tab renders
- what a role card means
- what appears in drawers and modals
- feature-specific report and artifact readers
- feature-specific event-to-view-model derivation

In short:

> frontend feature owns what the mission page is about.

### 9.4 Frontend benchmark decision

The benchmark source should be:

- the current `agent-playground` experience

But the reusable target should be:

- a canonical mission-detail shell extracted from that experience

That means future features should not build bespoke mission pages, and they should not copy playground page structure manually.

They should fill a canonical shell with feature content.

### 9.5 Recommended frontend directory design

```text
frontend/
├── app/
│   ├── agent-playground/
│   │   └── team/[missionId]/page.tsx
│   ├── ai-social/
│   ├── ai-radar/
│   └── ...
│
├── components/
│   ├── common/
│   │   ├── mission-detail/
│   │   │   ├── MissionDetailFrame.tsx
│   │   │   ├── DrawerShell.tsx
│   │   │   ├── ModalShell.tsx
│   │   │   ├── StageStepper.tsx
│   │   │   ├── MissionActionGroup.tsx
│   │   │   └── tabs/
│   │   │       ├── MissionReferencesTab.tsx
│   │   │       ├── MissionTaskListTab.tsx
│   │   │       └── MissionReportTab.tsx
│   │   │
│   │   └── team-topology/
│   │       ├── TeamTopology.tsx
│   │       └── role-cards/
│   │
│   ├── agent-playground/
│   │   ├── mission-detail/
│   │   │   ├── AgentPlaygroundMissionPage.tsx
│   │   │   ├── AgentPlaygroundLeftPanel.tsx
│   │   │   ├── AgentPlaygroundTabs.tsx
│   │   │   ├── drawers/
│   │   │   └── artifacts/
│   │   │
│   │   └── ...
│   │
│   ├── ai-social/
│   ├── ai-radar/
│   └── ...
│
├── hooks/
│   ├── features/
│   │   ├── useMissionStream.ts
│   │   ├── useAgentPlaygroundStream.ts
│   │   ├── useSocialMissionStream.ts
│   │   └── ...
│   │
│   └── missions/
│       ├── useMissionDetailTabs.ts
│       └── useMissionDrawerState.ts
│
├── lib/
│   ├── missions/
│   │   ├── derive/
│   │   │   ├── deriveMissionView.ts
│   │   │   ├── deriveStageView.ts
│   │   │   └── deriveAgentView.ts
│   │   ├── topology/
│   │   └── step-mapping/
│   │
│   └── features/
│       ├── agent-playground/
│       ├── ai-social/
│       ├── ai-radar/
│       └── ...
│
└── scripts/
    └── audit/
        └── audit-mission-detail-discipline.ts
```

### 9.6 Frontend page contract

Each mission feature page should follow this shape:

1. consume mission stream
2. derive feature view model
3. render `MissionDetailFrame`
4. provide feature left-panel content
5. provide feature tab config
6. render feature tab content
7. render feature drawer and modal content inside canonical shells

That means a feature page should look conceptually like:

```tsx
<MissionDetailFrame
  header={...}
  leftPanel={<FeatureTeamPanel ... />}
  tabs={featureTabs}
  activeTab={activeTab}
  onTabChange={setActiveTab}
  actions={<MissionActionGroup ... />}
>
  <FeatureTabContent activeTab={activeTab} view={view} />
</MissionDetailFrame>
```

And should not hand-roll:

- bespoke page header shell
- bespoke tab bar shell
- bespoke drawer shell
- bespoke stepper shell

### 9.7 Frontend app-layer white list

Per feature, frontend app code should normally be limited to:

- page wiring
- stream adapter hook
- feature view derivation
- left-panel content
- tab content
- drawer content
- artifact readers
- feature event mapping

If a feature starts reintroducing any of the following, it is a platform smell:

- custom mission-page shell
- custom tab-strip frame
- custom full-screen drawer frame
- custom stepper frame
- custom mission action bar shell

### 9.8 Frontend benchmark migration rule

Future feature migration should follow this rule:

- do not copy `agent-playground` page markup
- do not import feature-specific derive code from another feature
- do reuse:
  - canonical shell
  - shared stream transport
  - shared mission derivation helpers

This is especially important for coding agents.

If shared frontend semantics stay in `components/common/mission-detail/` and `lib/missions/`, an agent can safely modify one feature without re-cloning another feature's page structure.

---

## 10. App-Layer White List

To keep boundaries stable, app code should normally be limited to:

- `api/`
- `runtime/`
- `mission/pipeline/`
- `mission/context/`
- `mission/roles/`
- `mission/artifacts/`
- `mission/lifecycle/`
- `events/`
- `__tests__/`

If a new app file primarily deals with any of the following, challenge its placement first:

- session lifecycle
- generic retry loop
- abort cleanup
- checkpoint orchestration
- progress tracking
- span lifecycle orchestration
- generic event transport
- rerun framework mechanics

These are harness smells.

---

## 11. Team Creation Workflow

Future teams should not be created by copying all of `agent-playground`.

They should be created by composing the business-team framework and only implementing:

```text
ai-app/<new-team>/
├── runtime/
│   ├── <new-team>.adapter.ts
│   ├── <new-team>.snapshot.ts
│   └── <new-team>.input-rebuilder.ts
├── mission/
│   ├── pipeline/
│   │   ├── <new-team>.pipeline.ts
│   │   ├── <new-team>-business-orchestrator.service.ts
│   │   └── stages/
│   ├── context/
│   │   ├── mission-context.ts
│   │   └── mission-deps.ts
│   ├── roles/
│   └── artifacts/
├── events/
└── api/
```

This is the desired benchmark workflow:

1. define business input schema
2. define mission context
3. define pipeline config
4. implement stage handlers
5. register app adapter

Not:

1. copy a large dispatcher
2. rename strings
3. inherit old runtime glue by accident

### 11.1 Full creation checklist

For a new team, the expected order should be:

1. define `BusinessInputSchema`
2. define snapshot and input rebuilder
3. define `MissionContext`
4. define `MissionDeps`
5. define `PipelineConfig`
6. implement `StageHandlers`
7. implement `RoleServices`
8. register `BusinessTeamAppAdapter`
9. wire frontend mission detail page to `MissionDetailFrame`
10. add architecture and contract tests

This should become the canonical "how to create a team" workflow.

---

## 12. Guardrails And Mechanical Enforcement

Without guardrails, the boundary will drift back.

### 12.1 Backend guards

Recommended backend rules:

- forbid app-local reimplementation of generic dispatcher runtime shell
- forbid agents and stages from importing harness internals outside approved surfaces
- require terminal-state writes to go through lifecycle manager
- require new business-team apps to register through explicit adapters

### 12.2 Frontend guards

Recommended frontend rules:

- forbid bespoke mission-page shells in feature pages
- forbid bespoke drawer shell implementations for mission detail flows
- require canonical `MissionDetailFrame` usage for mission-detail class features
- require shared derivation utilities to live in `lib/missions/`, not feature-to-feature imports

### 12.3 Test guards

Recommended architecture tests:

- app-to-harness import boundary tests
- business-team adapter conformance tests
- mission page shell discipline audit
- event-schema contract tests

Rule:

> the target architecture must be enforced mechanically, not only described narratively.

---

## 13. Migration And Exit Strategy

Do not rewrite everything in one pass.

### 13.1 Phase order (revised 2026-05-24)

The original phase order was A → B → C. **Revised to B → A → C → D** because invoker is stateless (retry/abort/backoff) and lowest risk, and validates the framework pattern before tackling stateful dispatcher.

**Each phase migrates ALL teams in the same change-set** (agent-playground + social + radar in Wave 1; writing + topic-insights + office + research + planning in Wave 2). Stopping at 1-of-N leaves dual-source.

### 13.2 Phase B (now first) — BusinessTeamAgentInvoker.framework

Extract a harness-level:

- `BusinessTeamAgentInvoker.framework`

This absorbs the reusable shell from:

- `agent-playground/services/roles/agent-invoker.service.ts`
- equivalent invoker shells in social and radar (grep on launch)

Subclasses only implement `invokeOnce()`, business event emit, and business-specific span naming.

### 13.3 Phase A (now second) — BusinessTeamMissionDispatcher.framework

Extract a harness-level:

- `BusinessTeamMissionDispatcher.framework`

This absorbs the reusable shell from:

- `playground-pipeline-dispatcher.service.ts`
- `social-pipeline-dispatcher.service.ts`
- `radar-pipeline-dispatcher.service.ts`

### 13.4 Phase C (now third) — BusinessTeamStageBindings.framework

Extract a harness-level:

- `BusinessTeamStageBindings.framework`

This absorbs the reusable mechanism from:

- `mission-stage-bindings.service.ts` (agent-playground)
- equivalents in social/radar (none today; bindings only appear when stages are formalised)

while leaving:

- `MissionContext`
- `MissionDeps`
- business field mapping

inside the app.

### 13.5 Phase D (new, fourth) — BusinessTeamOrchestrator.framework

Extract a harness-level:

- `BusinessTeamOrchestrator.framework` (skeleton only; business event semantics and report shape stay in app)

This was implicit in the original §6.1.A but not enumerated as a migration phase. Adding it now so the playground/social/radar `*-business-orchestrator.service.ts` files all become thin subclasses, not 200-line copies.

### 13.4 Compatibility policy

Not every legacy path needs to disappear immediately.

The migration should explicitly classify paths as:

- long-lived canonical
- short-lived compatibility wrapper
- forbidden new usage
- removal candidate after adoption

This avoids the worst outcome:

- new framework exists
- old app-local framework shells keep living forever
- new teams use one path while old teams keep teaching the wrong path

### 13.5 Exit criteria

The migration is complete only when:

- a new team can be created without copying playground runtime glue
- agent invocation shell is reusable through harness
- mission dispatcher shell is reusable through harness
- stage-binding mechanism is reusable through harness
- frontend mission pages consume canonical shell instead of bespoke page structure

---

## 14. Ownership

The target model also needs explicit ownership.

Recommended ownership split:

- harness framework: platform architecture owner
- app adapters and app business runtime: feature owner
- frontend canonical mission shell: frontend platform owner
- feature-specific mission content: feature frontend owner
- event contract: shared contract owner with joint review

Rule:

> every boundary should have a technical seam and an ownership seam.

---

## 15. Decision

`agent-playground` should remain the benchmark app, but its role must change.

It should no longer be treated as:

- a directory tree to clone

It should be treated as:

- the first reference implementation of a reusable `business-team` harness framework

That is the architecture that is friendlier to:

- human developers
- coding agents
- future MissionPipeline-based apps

because it makes ownership obvious:

- harness = runtime mechanism
- app = business meaning
