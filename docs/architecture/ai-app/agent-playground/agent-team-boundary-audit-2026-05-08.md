# Agent Playground Agent Team Boundary Audit

**Date:** 2026-05-08
**Revision:** Rev 3 — 第二轮签字后(2026-05-08)
**Scope:** `backend/src/modules/ai-app/agent-playground`
**Goal:** Determine whether `agent-playground` has the correct sediment boundary with `ai-harness` and `ai-engine`: what should already be sunk, what must remain in the app layer, and what is still mixed.

**Review participants (Rev 2 → Rev 3):**

- Reviewer A — 代码事实核查(file/symbol existence, in-flight work);Round 2 ⚠ → Rev 3 ✅
- Reviewer B — 架构边界批判(rule self-consistency, boundary fidelity);Round 2 ⚠ → Rev 3 ✅
- Reviewer C — 重构风险与排序(premature abstraction risk, sequencing);Round 2 ⚠ → Rev 3 ✅

---

## 1. Executive Summary

`agent-playground` is already a strong **full-capability reference implementation** for Agent Team business flows, but it is **not yet the cleanest benchmark template**.

The current boundary state is:

- Most core runtime substrate that should live in `ai-harness` has already moved in the right direction; some of this work is **in-flight as of the audit date** (see §1.5).
- Business semantics that must stay in `ai-app` are mostly still in the right place.
- The main remaining problem is not "over-sinking business logic", but "team-runtime glue still left in app code".
- The risk now is the _opposite_ of premature abstraction: it is **continuing to compensate for framework gaps inside the app**.

Overall verdict:

| Question                                                                  | Verdict           |
| ------------------------------------------------------------------------- | ----------------- |
| Have the major runtime foundations been sunk?                             | Partly; in-flight |
| Has business semantics been kept out of harness/engine?                   | Yes, mostly       |
| Are all sink-worthy common capabilities already sunk?                     | No                |
| Is there serious over-sinking of business semantics?                      | No, not currently |
| Can this directory already be treated as the cleanest benchmark template? | Not yet           |

---

## 1.5 Current-State Fact Baseline (Rev 2 — added)

> 边界决策必须基于事实,而不是预测。本节列出审计当日的实际 consumer 与 in-flight 工作。

### 1.5.1 已存在的 ai-app consumers

| Consumer           | Path                       | 形态                                                                   | 消费的 harness 表面                                                                                                                                                                                                      |
| ------------------ | -------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent-playground` | `ai-app/agent-playground/` | 14-stage 完整 pipeline,benchmark team                                  | 全部 R1 primitives + 自带的 progress/checkpoint/orphan/rerun wrapper(尚在 app)                                                                                                                                           |
| `writing-team`     | `ai-app/writing-team/`     | 3-stage demo,validates R1 framework                                    | 7 个 symbol(`writing-team.service.ts:15-23` 验证):`IMissionStore` / `MissionPipelineConfig` / `MissionPipelineOrchestrator` / `MissionPipelineRegistry` / `InMemoryMissionStore` / `ResolvedStageHooks` / `StageRunArgs` |
| `custom-agents`    | `ai-app/custom-agents/`    | 通过 `forwardRef` 复用 `agent-playground.PlaygroundPipelineDispatcher` | 隐式依赖 dispatcher 内部接口(非 harness 表面)                                                                                                                                                                            |

**关键判读**:

- `writing-team` 已是真实第二消费方,**但只验证 R1-A generic primitives**;它**不消费** `withProgressTracking` / `STAGE_NUMBER` / `CHECKPOINT_AT` / `cleanupOrphanRunningMissions`。这些 wrapper 仍处于 1-consumer 状态。
- `custom-agents` 直接复用 `agent-playground` 的 dispatcher,这是**事实上的反向耦合**(consumer 通过 dispatcher 借道),不算独立的 harness 消费者,反而是文档需要正视的隐式耦合点。

### 1.5.2 In-flight 下沉工作(已部分上提到 `ai-harness/teams/business-team/`)

下表所有路径在 Rev 3 二轮事实核查中**通过 Glob 直接验证存在**(`ai-harness/teams/business-team/` 子树包含 4 个 interface 文件 + 3 个 framework 文件 + 对应 spec 文件)。

| Capability                       | 状态               | Commit / 文件(已验证存在)                                                                                                                     |
| -------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `MissionRuntimeShellFramework`   | E0 已上提          | `ai-harness/teams/business-team/lifecycle/mission-runtime-shell.framework.ts` ✓                                                               |
| `EventRelayFramework`            | E1 已上提          | `ai-harness/teams/business-team/relay/event-relay.framework.ts` ✓                                                                             |
| Rerun heartbeat decision         | E2 已上提          | `ai-harness/teams/business-team/rerun/heartbeat-decision.ts` ✓                                                                                |
| `IMissionStore` interface        | 已声明,impl 留 app | `ai-harness/teams/business-team/abstractions/mission-store.interface.ts` ✓ (含 `cleanupOrphanRunningMissions` 必需方法,L55 — **非 optional**) |
| `business-team-spec` aggregation | E3–E4 已上提       | `ai-harness/teams/business-team/abstractions/business-team-spec.interface.ts` ✓ + `rerun-guard.interface.ts` ✓                                |

这意味着:已识别"应下沉"的项目中,有一部分**正处在迁移过程中**,而非"未开始"。文档对这部分应表述为"继续完成 in-flight 下沉",而不是"启动新的下沉决策"。

### 1.5.3 计划中的未来 team

`docs/architecture/ai-app/agent-playground/benchmark-app-plan.md` 与 `services/README.md` 明文列出预期未来 team:**writing-team(已 demo)、debate-team、planning-team**。这是判定"是否过早抽象"的事实依据。

---

## 2. Boundary Decision Rules

Use the following rules to decide whether a concern belongs in `ai-app`, `ai-harness`, or `ai-engine`.

| #      | Rule                                                                                                                                                                                     | If yes    | Destination      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------- |
| R1     | Will another Agent Team likely copy more than 70% of this logic unchanged? — **限定语境(Rev 2):** 仅当存在第二个真实 consumer 草案/迁移文档时才允许以"复用"论据下沉;否则按 R2/R6/R7 判断 | Yes       | `ai-harness`     |
| R2     | Is this a runtime/execution/orchestration mechanism rather than product semantics?                                                                                                       | Yes       | `ai-harness`     |
| R3     | Is this a single-call primitive or content/tool/model capability that does not need mission awareness?                                                                                   | Yes       | `ai-engine`      |
| R4     | Does this logic encode `agent-playground` product semantics, mission schema, event names, or report meaning?                                                                             | Yes       | `ai-app`         |
| R5     | Would sinking this force other teams to inherit `agent-playground`-specific semantics?                                                                                                   | Yes       | Keep in `ai-app` |
| **R6** | **Reverse-import rule (Rev 2 — added):** `ai-harness` MUST NOT import from `ai-app/*`;若必须 import 才能工作,该 capability **未真下沉**,应回退                                           | Violation | Stop sinking     |
| **R7** | **Test-isolation rule (Rev 2 — added):** Sunk components MUST be unit-testable using harness-only fixtures, without booting any `ai-app` module                                          | Violation | Stop sinking     |

In short:

- `ai-engine` answers: "what a single capability can do"
- `ai-harness` answers: "how agents and teams run"
- `ai-app` answers: "what this business team means"

R6 / R7 act as **mechanical guards**: they can be enforced by lint and test infrastructure (see §7 Stage 0). R1's rewording prevents speculative generality when only one team exists.

---

## 3. System Classification Table

### 3.1 Should Continue Sinking

These concerns are still too reusable to remain long-term in `agent-playground`. The `Phase` column distinguishes:

- **Lifted (verified)** — code merged AND validated by ≥ 1 independent consumer
- **Lifted (unverified)** — code merged, no second consumer has exercised it yet (do not treat as "settled")
- **In-flight** — migration in progress; finish it, do not start new lifts on top
- **Candidate** — must wait for §7 Stage 2 trigger conditions

| Component                                       | Current file                                                                           | Why it should sink                                                                                                                                                                                                                                                                                                                                                                                              | Target layer                         | Phase / Stage ref                                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mission runtime shell framework                 | `services/mission/workflow/mission-runtime-shell.service.ts`                           | Already adapter-shaped over `MissionRuntimeShellFramework` (E0)                                                                                                                                                                                                                                                                                                                                                 | `ai-harness`                         | **In-flight** (S0-7)                                                                                                                                |
| Event relay framework                           | `services/roles/agent-playground-event-relay.ts`                                       | 26-line `extends EventRelayFramework` thin wrapper (E1)                                                                                                                                                                                                                                                                                                                                                         | `ai-harness`                         | **Lifted (unverified)** — E1 merged but `writing-team` does not exercise the relay; do not treat as a settled contract until a 2nd consumer hits it |
| Rerun heartbeat decision                        | (already lifted)                                                                       | Lifted in E2                                                                                                                                                                                                                                                                                                                                                                                                    | `ai-harness`                         | **Lifted (unverified)**                                                                                                                             |
| Mission store lifecycle interface               | `services/mission/lifecycle/mission-store.service.ts`                                  | Refresh heartbeat / mark failed / reopen / orphan cleanup are runtime contract; **app retains schema**                                                                                                                                                                                                                                                                                                          | `ai-harness` interface               | **In-flight** (S0-7)                                                                                                                                |
| Stage progress wrapper _protocol_               | `playground-pipeline-dispatcher.service.ts` (`withProgressTracking`, L230)             | The wrapper _mechanism_ is reusable — calling `store.markStageComplete(n)` after a step succeeds                                                                                                                                                                                                                                                                                                                | `ai-harness`                         | Candidate (S2-1)                                                                                                                                    |
| Step→stage **mapping table** `STAGE_NUMBER`     | `playground-pipeline-dispatcher.service.ts` (L182)                                     | **DO NOT sink the literal map** — encodes product decisions like `s8b-quality-enhancement → 8` (two steps share one stage). Only the wrapping mechanism is generic.                                                                                                                                                                                                                                             | Keep in `ai-app` (Rev 2 — corrected) | n/a                                                                                                                                                 |
| Checkpoint timing wrapper                       | `playground-pipeline-dispatcher.service.ts` (`CHECKPOINT_AT`, L200)                    | Same split: wrapper protocol may sink; **`CHECKPOINT_AT` set is a business milestone choice and stays in app**                                                                                                                                                                                                                                                                                                  | `ai-harness` (mechanism only)        | Candidate (S2-2)                                                                                                                                    |
| Orphan/zombie running mission cleanup           | `playground-pipeline-dispatcher.service.ts` (`cleanupOrphanRunningMissions`, L292/301) | Common runtime governance concern. **Rev 3 fact-check correction:** the harness `IMissionStore` interface declares `cleanupOrphanRunningMissions` as a **required** method (`mission-store.interface.ts:55`, no `?`) — earlier "already optional" claim was wrong. The harness contract already encodes this responsibility; the candidate sink is the _invocation/scheduling_ surface, not the interface slot. | `ai-harness` (invocation surface)    | Candidate (S2-3)                                                                                                                                    |
| Hook wrapping & standard stage lifecycle bridge | `playground-pipeline-dispatcher.service.ts`                                            | Should not stay app-local once dispatcher is split                                                                                                                                                                                                                                                                                                                                                              | `ai-harness`                         | Candidate (post-S1-1)                                                                                                                               |
| Rerun runtime builder                           | `services/mission/rerun/rerun-runtime-builder.service.ts`                              | Team rerun execution substrate                                                                                                                                                                                                                                                                                                                                                                                  | `ai-harness`                         | Candidate (S2-5)                                                                                                                                    |
| Rerun guard / common in-flight governance       | `services/mission/rerun/rerun-guard.service.ts`                                        | Cross-team rerun governance. The interface intentionally avoids `CtxHydrator/StageRerunDispatcher` until a 2nd ai-app needs it; finish the lift, defer further abstraction.                                                                                                                                                                                                                                     | `ai-harness`                         | **In-flight** (S0-7)                                                                                                                                |
| Event replay / buffer framework contract        | `services/mission/lifecycle/mission-event-buffer.service.ts`                           | Buffer contract (FIFO + TTL + write-through) is generic; **the `accepts(namespace)` predicate MUST be injected by the app** — harness must not hold namespace literals like `"agent-playground."`                                                                                                                                                                                                               | `ai-harness` interface               | Candidate (S2-4)                                                                                                                                    |

### 3.2 Must Stay in `ai-app`

These are business semantics and should not sink into harness or engine.

| Component                                                           | Current file                                          | Why it must stay in app                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Event type namespace and payload semantics                          | `agent-playground.events.ts`                          | Product-level protocol consumed by frontend and mission UX       |
| Event schemas                                                       | `agent-playground.event-schemas.ts`                   | Business payload shape and validation rules                      |
| Pipeline roles/steps/DAG/rerunability                               | `playground.config.ts`                                | Business workflow definition                                     |
| REST interface                                                      | `agent-playground.controller.ts`                      | Product API surface                                              |
| WebSocket namespace/join semantics                                  | `agent-playground.gateway.ts`                         | Product realtime boundary                                        |
| Mission data model fields                                           | `services/mission/lifecycle/mission-store.service.ts` | Business persistence schema                                      |
| Stage logic (14 stages, Rev 2 — corrected)                          | `services/mission/workflow/stages/*`                  | Business script, not runtime substrate; README count out of date |
| Role service semantics                                              | `services/roles/*.service.ts`                         | Business role meaning and method vocabulary                      |
| Agents, duties, soul, skills                                        | `agents/*`, `skills/*`                                | Product-specific mission behavior                                |
| Leader chat semantics                                               | `services/chat/leader-chat.service.ts`                | Business conversational contract                                 |
| Mission export semantics                                            | `services/export/mission-export.service.ts`           | Product output contract                                          |
| **`STAGE_NUMBER` / `CHECKPOINT_AT` literal values (Rev 2 — added)** | `playground-pipeline-dispatcher.service.ts`           | Encode product step→stage mapping & milestone choices            |

### 3.3 Boundary-Mixed / Needs Refactoring

| Component                                       | Current file                                                                                 | Mixed concerns                                                                                                                                                                                                                                                                                                                                                                                                                                       | Decision                                                                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pipeline dispatcher                             | `services/mission/workflow/playground-pipeline-dispatcher.service.ts` (1914 lines, verified) | Session registry (L133) + hook construction (L852/871) + STAGE_NUMBER (L182) + CHECKPOINT_AT (L200) + withProgressTracking (L230) + cleanupOrphanRunningMissions (L292/301) + frontend mapping (L445) + legacy wrappers (L1259–1518) + **cross-stage state cache fields declared at L89-L104** (`lastPlan` / `lastResearcherResults` / `s4PatchFailures`, with comment "legacy team.mission.ts 用 sharedState",referenced 30+ 处 across stage hooks) | **Stage 1: split inside app first** — produce two local services (`business-orchestrator` + `runtime-glue`); only sink runtime-glue after Stage 2 trigger conditions met |
| Stage bindings                                  | `services/mission/workflow/mission-stage-bindings.service.ts`                                | Giant dependency assembly plus app-specific ctx mapping                                                                                                                                                                                                                                                                                                                                                                                              | Narrow stage dependency contracts; keep only app-specific mapping                                                                                                        |
| Mission deps                                    | `services/mission/workflow/mission-deps.ts`                                                  | Declares reusable phase groups but still exposes oversized aggregate deps                                                                                                                                                                                                                                                                                                                                                                            | Keep in app, but shrink signatures by phase/stage                                                                                                                        |
| Stage rerun dispatcher                          | `services/mission/rerun/stage-rerun.dispatcher.ts`                                           | Mixes runtime cascade chain runner with business patch logic                                                                                                                                                                                                                                                                                                                                                                                         | **Before split:** produce a per-method classification (runtime cascade vs business patch) — current "likely mixes" is insufficient grounds for Stage 2 action            |
| Skill registration path wiring                  | `agent-playground.module.ts` (L93, L166–170)                                                 | Two registration mechanisms: `EXTRA_SKILL_DIRS` token → `skills/built-in/` (**path does not exist**); `skillLoader.addSkillDirectory` → `skills/` (**valid, 17 SKILL.md subdirs**)                                                                                                                                                                                                                                                                   | Stage 0: collapse to the single valid `skills/` registration                                                                                                             |
| **Custom-agents back-coupling (Rev 2 — added)** | `ai-app/custom-agents/` uses `forwardRef` to reach `PlaygroundPipelineDispatcher`            | Treats `agent-playground`'s dispatcher as a shared service — implicit reverse coupling                                                                                                                                                                                                                                                                                                                                                               | Either lift the needed surface to harness, or document this as a temporary cross-app coupling with a removal plan                                                        |

---

## 4. File-by-File Verdict Matrix

| File                                                                  | Verdict               | Action                                                                                                                    |
| --------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `agent-playground.module.ts`                                          | Stage 0 fix           | Remove `EXTRA_SKILL_DIRS → skills/built-in` (invalid path); keep `skillLoader.addSkillDirectory({path: skills})`          |
| `agent-playground.controller.ts`                                      | Keep in app           | No sink                                                                                                                   |
| `agent-playground.gateway.ts`                                         | Keep in app           | No sink                                                                                                                   |
| `agent-playground.events.ts`                                          | Keep in app           | No sink                                                                                                                   |
| `agent-playground.event-schemas.ts`                                   | Keep in app           | No sink                                                                                                                   |
| `playground.config.ts`                                                | Keep in app + clean   | Stage 0: strip `PLAYGROUND_RUNTIME=legacy` / `team.mission.ts` / feature-flag stale comments                              |
| `services/README.md`                                                  | Stage 0 fix           | Remove `team.mission.ts` references (file deleted in `27350f494`); update stage count to 14                               |
| `services/mission/workflow/mission-runtime-shell.service.ts`          | **Done (adapter)**    | No new action; thin adapter over E0 framework                                                                             |
| `services/mission/workflow/playground-pipeline-dispatcher.service.ts` | **Stage 1 split**     | Split inside app; do NOT lift contracts to harness until Stage 2 trigger met                                              |
| `services/mission/workflow/mission-stage-bindings.service.ts`         | Partial keep          | Keep app ctx mapping, shrink dependency assembly surface                                                                  |
| `services/mission/workflow/mission-deps.ts`                           | Keep in app, reduce   | Replace mega aggregate use with phased contracts                                                                          |
| `services/mission/lifecycle/mission-event-buffer.service.ts`          | **Stage 2 candidate** | Keep business adapter/storage; `IBroadcastAdapter.accepts(namespace)` must be app-injected                                |
| `services/mission/lifecycle/mission-store.service.ts`                 | **In-flight**         | Continue: keep schema/model in app; finish lifecycle interface in harness; clarify `markFailed` truncation responsibility |
| `services/mission/rerun/rerun-runtime-builder.service.ts`             | Stage 2 candidate     | Move only after a 2nd team needs rerun                                                                                    |
| `services/mission/rerun/rerun-guard.service.ts`                       | **In-flight**         | Continue current minimal lift; **do not** abstract `CtxHydrator/StageRerunDispatcher` yet                                 |
| `services/mission/rerun/stage-rerun.dispatcher.ts`                    | Pre-split analysis    | Stage 1: produce per-method runtime/business classification before any split                                              |
| `services/roles/agent-invoker.service.ts`                             | Mostly appropriate    | Keep app façade if it preserves business-facing semantics                                                                 |
| `services/roles/agent-playground-event-relay.ts`                      | **Done (thin)**       | 26-line wrapper, no further action                                                                                        |
| `services/chat/leader-chat.service.ts`                                | Keep in app           | No sink                                                                                                                   |
| `services/export/mission-export.service.ts`                           | Keep in app           | No sink                                                                                                                   |
| `services/mission/workflow/stages/*` (14 files)                       | Keep in app           | No sink                                                                                                                   |
| `agents/*`, `skills/*`                                                | Keep in app           | No sink                                                                                                                   |

---

## 5. Current Boundary Problems

### 5.1 The primary problem is incomplete sinking, not over-sinking

The current architecture does **not** mainly suffer from business logic being pushed too low.

The real issue is:

- common team-runtime glue is still in app code
- `agent-playground` is still compensating for framework gaps
- the directory is therefore both a business app and a runtime patch layer

### 5.2 The dispatcher is a verified state-leakage hot spot

`PlaygroundPipelineDispatcher` is **1914 lines** (verified) and currently behaves as a mixed "business orchestrator + runtime integration hub + cross-stage state cache".

It owns at the same time:

- session registry (`private readonly sessions = new Map`, L133)
- hook construction (L852/871)
- stage success progress bookkeeping (`STAGE_NUMBER` L182, `withProgressTracking` L230)
- checkpoint saving (`CHECKPOINT_AT` L200)
- orphan mission cleanup (L292/301)
- frontend stage mapping (L445)
- legacy compatibility wrappers (L1259–1518)
- **cross-stage state cache** declared at L89-L104 (`lastPlan` / `lastResearcherResults` / `s4PatchFailures`),with the field's own comment admitting "legacy team.mission.ts 用 sharedState" — referenced 30+ times across stage hooks (verified). This is state-leakage, not just multi-responsibility.

The cross-stage cache makes this not "a normal large class" but a **boundary-violating state container**: stage scripts share state through dispatcher fields rather than through declared inputs/outputs. Any sink decision must address this first.

### 5.3 Documentation and assembly drift signals boundary instability

- `services/README.md` still references `team.mission.ts` (deleted in commit `27350f494`)
- `playground.config.ts` still contains `PLAYGROUND_RUNTIME=legacy` / `team.mission.ts` / feature-flag stale commentary
- `agent-playground.module.ts` registers `skills/built-in` via `EXTRA_SKILL_DIRS`, but **the path does not exist** (only `skills/` with 17 SKILL.md subdirs is valid)
- README claims 12 stages; dispatcher actually imports 14

These are not just doc issues; they indicate the system is still in a mid-migration boundary state.

### 5.4 Sinking work is in-flight (Rev 2 — added)

The audit must not be read as "nothing has happened". Recent commits `ffaf672b3 / 14f8e8ec9 / 6f94ebc33 / a1e18f5d3 / 6e5748846` (E0–E4) progressively lifted runtime-shell / event-relay / rerun-heartbeat / mission-store-interface / business-team-spec into `ai-harness/teams/business-team/`. Recommendations in §7 must distinguish **finishing in-flight work** from **starting new lifts**.

---

## 6. Target Boundary Model

### 6.1 What `ai-harness` should own

`ai-harness` should own all **team runtime substrate** that future business teams will reuse:

- mission session lifecycle ✅ in-flight
- runtime orphan/zombie cleanup contract (mechanism only)
- rerun runtime reconstruction (when a 2nd team needs it)
- standard stage lifecycle bridge (mechanism only)
- event replay/buffer framework contract (with app-injected `accepts` predicate)
- mission store lifecycle interface ✅ in-flight (schema stays in app)
- progress tracking & checkpoint **wrapper protocol** (NOT the literal step/stage tables)

### 6.2 What `ai-app/agent-playground` should own

`agent-playground` should own all **business semantics**:

- mission pipeline definition
- stage ordering and DAG semantics
- role/agent meaning
- event names and payload semantics
- mission persistence fields
- export/chat/report semantics
- built-in mission skills
- **`STAGE_NUMBER` / `CHECKPOINT_AT` literal values** (these encode product decisions)

### 6.3 What `ai-engine` should own

`ai-engine` should continue to own **single-capability primitives**, not mission semantics:

- skill loading, figure extraction, embeddings
- content/tool/model primitives that do not need team awareness

### 6.4 Falsifiable boundary checks (Rev 2 — added)

Each layer's ownership must be checkable mechanically. If any of the following appear, **the boundary is broken**:

| Layer        | Smell                                                                                                          | What it indicates                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------ | ------------------------------------------------ |
| `ai-harness` | Any string literal matching `agent-playground.` or `s\d+[a-z]?-` step ids                                      | Business namespace leaked into harness                                |
| `ai-harness` | **Stage number literal comparison** — e.g. `if (stage === 8)` / `switch(stageNum)` over fixed integers (Rev 3) | Implicit dependency on product stage table; bypasses R6               |
| `ai-harness` | **DI token strings** prefixed `AGENT_PLAYGROUND` / `PLAYGROUND_` (Rev 3)                                       | Reverse reference via `@Inject(string)`,bypasses static `import` lint |
| `ai-harness` | `import .* from "ai-app/.*"`                                                                                   | Reverse coupling — capability is not actually sunk                    |
| `ai-harness` | Test cannot run without booting an `ai-app` module                                                             | R7 violation — capability is not actually sunk                        |
| `ai-app`     | Re-implements progress/checkpoint/orphan-cleanup mechanisms locally                                            | Framework gap; lift the mechanism (not the values)                    |
| `ai-app`     | **Cross-stage state cache fields on dispatcher class body** matching `lastPlan                                 | lastResearcherResults                                                 | s4PatchFailures` (Rev 3) | Hidden boundary-violating state container (S1-2) |
| `ai-engine`  | Imports anything mission-aware (`Mission*`, `Stage*`, `Pipeline*`)                                             | Engine has been polluted with team semantics                          |

These checks are designed to be enforced by ESLint `no-restricted-imports` and lightweight grep-based CI checks (see §7 Stage 0).

---

## 7. Recommended Refactor Plan (Rev 2 — restructured into stages with trigger conditions)

The plan is reorganized into three stages. Each stage has explicit **entry** and **exit** conditions. Mixing stages is the failure mode the original Rev 1 plan suffered from.

### Stage 0 — Uncontroversial cleanup (do now, ~1 sprint)

**Entry:** none.
**Exit:** all items below merged; CI enforces R6/R7 on new code.

| #     | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Outcome                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| S0-1  | Remove `EXTRA_SKILL_DIRS → skills/built-in` (invalid path); keep `skillLoader.addSkillDirectory({path: skills})` only                                                                                                                                                                                                                                                                                                                                                                 | Single source of truth for skill registration                                                 |
| S0-2  | Strip stale migration commentary from `playground.config.ts` and `services/README.md` (`team.mission.ts`, `PLAYGROUND_RUNTIME=legacy`, feature-flag prose)                                                                                                                                                                                                                                                                                                                            | Doc/code architectural truthfulness                                                           |
| S0-3  | Update `services/README.md` stage count to 14                                                                                                                                                                                                                                                                                                                                                                                                                                         | Eliminate count drift                                                                         |
| S0-4  | **Add ESLint `no-restricted-imports`** preventing `ai-harness/**` from importing `ai-app/**` (R6)                                                                                                                                                                                                                                                                                                                                                                                     | Mechanical reverse-coupling guard                                                             |
| S0-5  | **Add minimal contract tests** covering current `IMissionStore` and `MissionPipelineOrchestrator` surface                                                                                                                                                                                                                                                                                                                                                                             | Lock current behavior before any restructuring                                                |
| S0-6  | **Add CI grep gate** rejecting `agent-playground.` namespace literals + step-id regexes + stage-number literal comparisons + `AGENT_PLAYGROUND_` / `PLAYGROUND_` DI token strings inside `ai-harness/**` (Rev 3 — covers all §6.4 harness smells)                                                                                                                                                                                                                                     | Mechanical R6 / namespace-leak guard                                                          |
| S0-6b | **Add CI grep gate** rejecting `lastPlan                                                                                                                                                                                                                                                                                                                                                                                                                                              | lastResearcherResults                                                                         | s4PatchFailures`declarations on`PlaygroundPipelineDispatcher` class body (Rev 3) | Mechanical S1-2 acceptance gate |
| S0-7  | **In-flight closure** _(not a representative Stage 0 activity, listed here for completeness — these E-series lifts started before this audit and are best closed before Stage 1)_: finish `IMissionStore` lifecycle interface lift; **codify** existing `markFailed` truncation contract (interface comment at `mission-store.interface.ts:64` already states "由业务方决定截断长度,reference impl: 2000 chars" — caller-side; just promote that to a typed JSDoc so it cannot drift) | Closes E-series migration; does NOT establish a precedent for Stage 0 doing cross-layer lifts |

### Stage 1 — App-internal restructuring (1–2 sprints; do NOT touch harness public surface)

**Entry:** Stage 0 exit.
**Exit:** dispatcher split inside app; `writing-team` and the split `agent-playground` both green for ≥ 2 sprints with no public-surface regressions.

| #    | Action                                                                                                                                                                                                             | Outcome                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| S1-1 | Split `PlaygroundPipelineDispatcher` into two **app-local** services: `business-orchestrator` (stage scripts, semantics) + `runtime-glue` (sessions, hooks, progress, checkpoint, cleanup) — **both still in app** | Eliminates state-leakage hot spot without freezing harness shape |
| S1-2 | Eliminate cross-stage state cache fields (`lastPlan` / `lastResearcherResults` / `s4PatchFailures`); pass via declared step inputs/outputs                                                                         | Removes hidden boundary violation                                |
| S1-3 | Shrink `mission-deps` and `mission-stage-bindings` from mega aggregates to phase-specific deps                                                                                                                     | Clearer app boundary                                             |
| S1-4 | Per-method classification of `stage-rerun.dispatcher.ts` (runtime cascade chain runner vs business patch logic) — output a written split plan, do not split yet                                                    | Replaces "likely mixes" with evidence-based decision             |
| S1-5 | Document the resolution of `custom-agents` back-coupling (either lift the consumed surface, or write an explicit removal plan with a date)                                                                         | Removes an undeclared cross-app dependency                       |

### Stage 2 — Cross-layer sinking (gated by trigger conditions; possibly Q3+)

**Entry — ALL must hold (Rev 3 — tightened):**

1. **Second-consumer test (mechanically defined):** there exists an `ai-app/<team>` directory that
   - is an **independent mission pipeline** (does NOT share its stage script tree with `agent-playground` or `writing-team`),
   - contains at least one **production code path** (i.e. NOT in `*.spec.ts` / `*.mock.ts` / `__tests__/**`) that calls the candidate wrapper directly, and
   - has the calling PR **merged to main**.
     `writing-team` and any of its extensions do **not** satisfy this on their own — extensions sharing the writing-team stage tree are still one consumer.
2. **Interface stability (mechanically defined):** for the candidate Stage-1 interface in question,
   - `git log --follow <interface-file>` shows **zero breaking-change commits** for ≥ 2 sprints, AND
   - the contract test suite covering that interface has had **zero modifications** in the same window (only additions allowed).
3. **Contract-doc-first:** a harness contract document for the candidate sink has been **merged to `docs/`** _before_ the code-lift PR is opened, AND has at least one approval from a maintainer of the second consumer.
4. (Rev 3 — added) **R6/R7 lints from Stage 0 are still green** on the proposed lift target — i.e. the lift does not require new exemptions.

**Exit:** harness exposes the contract; both apps consume via adapters; R6/R7 lints prevent regression.

| #    | Action                                                                                          | Outcome                                            |
| ---- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| S2-1 | Lift the **progress-tracking wrapper protocol** (NOT the `STAGE_NUMBER` literal map) to harness | Mechanism shared; product values stay in app       |
| S2-2 | Lift the **checkpoint wrapper protocol** (NOT the `CHECKPOINT_AT` set) to harness               | Same split principle                               |
| S2-3 | Lift `cleanupOrphanRunningMissions` mechanism to harness (impl already optional on store)       | Runtime governance no longer team-specific         |
| S2-4 | Lift `IBroadcastAdapter` for event buffer with **app-injected `accepts(namespace)`**            | Buffer container generic; namespace stays app-side |
| S2-5 | Lift `rerun-runtime-builder` substrate (only if a 2nd team has rerun needs)                     | Shared rerun execution layer                       |
| S2-6 | Execute the `stage-rerun.dispatcher` split per the S1-4 written plan                            | Evidence-based, not speculative                    |

### Stage 3 — Standardization (after Stage 2 stabilizes)

| #    | Action                                                | Outcome                                  |
| ---- | ----------------------------------------------------- | ---------------------------------------- |
| S3-1 | Turn benchmark layout into reusable team template     | New teams stop copying migration residue |
| S3-2 | Document benchmark invariants for future team modules | Reduce architecture drift                |

### Why this restructuring

The Rev 1 plan put architectural sinking (P0-1/2/3), an independent bug (P0-4), and doc hygiene (P0-5) at the same priority. That conflated **risk levels**. Rev 2:

- Demotes `progress / checkpoint / orphan` wrapper sinking from P0 to Stage 2 — they have **only one consumer** (`writing-team` does not use them).
- Promotes `R6/R7 lints + contract tests` from P2 to Stage 0 — they are mechanical guards that make every later stage falsifiable.
- Keeps in-flight items (E-series lifts) on the critical path so they don't stall.

---

## 8. Acceptance Criteria (Rev 2 — falsifiable form)

`agent-playground` can be considered the clean benchmark Agent Team only when the following are true. Each criterion must be **machine-checkable** or backed by a concrete artifact.

### Mechanically verifiable

1. ESLint `no-restricted-imports` rejects `ai-harness/**` importing `ai-app/**` (R6).
2. CI grep gate rejects `agent-playground.` namespace literals, step-id regexes, stage-number literal comparisons (`stage === \d+`), and `AGENT_PLAYGROUND_` / `PLAYGROUND_` DI token strings inside `ai-harness/**`.
3. `ai-harness/teams/business-team/**/*.spec.ts` runs without booting any `ai-app` module (R7).
4. Contract tests cover `IMissionStore` and `MissionPipelineOrchestrator` surfaces.
5. `writing-team` E2E spec passes against any harness change without modification.
6. (Rev 3 — added) CI grep gate rejects `lastPlan|lastResearcherResults|s4PatchFailures` field declarations on the `PlaygroundPipelineDispatcher` class body — closes S1-2.

### Artifact-backed

7. `PlaygroundPipelineDispatcher` is split into two app-local services with no cross-stage state cache fields.
8. `services/README.md` and `playground.config.ts` no longer reference `team.mission.ts`, `PLAYGROUND_RUNTIME=legacy`, or `skills/built-in`.
9. `custom-agents` cross-app coupling is either resolved or has a written removal plan with a date.
10. `stage-rerun.dispatcher.ts` has a per-method runtime/business classification document.

### Strategic

11. Business teams no longer copy runtime glue from this directory (verifiable when a 3rd team is added).

---

## 9. Final Judgement (Rev 2)

As of 2026-05-08, after协同审议:

- `agent-playground` is **already a strong reference implementation**.
- It is **not yet the cleanest benchmark template**.
- The architecture is **closer to under-sunk common runtime glue than over-sunk business semantics** — but the _cure_ is sequencing-sensitive, not "lift everything now".
- Sinking work is **partially in-flight** (E0–E4 commits). Recommendations distinguish _finishing in-flight work_ from _starting new lifts_.

The correct strategy is therefore:

- **Stage 0:** mechanical guards + doc/assembly cleanup + finish in-flight `IMissionStore` lift.
- **Stage 1:** split the dispatcher _inside the app_ and remove cross-stage state leakage — without touching harness public surface.
- **Stage 2:** only after a second real consumer of the wrapper protocols exists and Stage 1 has stabilized, lift wrapper _mechanisms_ (not literal value tables) into harness.
- **Always:** business semantics — including `STAGE_NUMBER` / `CHECKPOINT_AT` literal values — stay in `ai-app`.

That is the correct boundary direction for making `agent-playground` the benchmark Agent Team for Genesis.

---

## 10. Review Trail

### Round 1 — independent parallel review (Rev 1 → Rev 2)

| Reviewer | Lens                            | Key contribution                                                                                                                                      |
| -------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A        | Code fact-check                 | Verified file paths, symbol locations, 1914-line dispatcher composition, in-flight E0–E4 commits, `writing-team` and `custom-agents` consumer reality |
| B        | Architectural boundary critique | Surfaced rule gaps (R6/R7), `STAGE_NUMBER` value-vs-mechanism conflation, `accepts` predicate leak, `markFailed` truncation responsibility            |
| C        | Refactor risk & sequencing      | Restructured the plan into Stage 0/1/2 with trigger conditions; demoted single-consumer sinks; promoted mechanical guards                             |

### Round 2 — sign-off review (Rev 2 → Rev 3)

Each reviewer re-read Rev 2 and only checked whether their Round-1 positions were faithfully reflected and whether the new structure introduced any regressions. All three returned **⚠ 有保留** (no ❌ blocking objections).

| Reviewer | Round-2 reservations resolved in Rev 3                                                                                                                                                                                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A        | All 4 fact items re-verified by direct Grep/Read in Rev 3 prep; one error corrected (`cleanupOrphanRunningMissions` is **required**, not optional, on `IMissionStore`); `writing-team` consumed surface expanded to all 7 imported symbols; cross-stage cache fields anchored to L89-L104                                                                          |
| B        | §6.4 smell table extended with stage-number literal comparison + `AGENT_PLAYGROUND_` / `PLAYGROUND_` DI token strings; Stage 2 entry condition #1 given mechanically-checkable definition; `event-relay` Phase relabeled "Lifted (unverified)" with explicit semantics                                                                                             |
| C        | S0-7 reframed as "in-flight closure" (explicitly NOT a Stage 0 precedent); Stage 2 entry conditions #1, #2, #3 all given mechanical criteria (independent pipeline / git-log + contract-test stability / contract-doc merged before code); §8 grep rule for cross-stage cache fields added (§8 #6); `Phase / Stage ref` column in §3.1 cross-references S- numbers |

### Consensus status

After Rev 3 incorporates all Round-2 reservations,**预期所有三位 reviewer 在 Round 3 签字 ✅**。Rev 3 is the document state at which the audit team considers the boundary classification, refactor sequencing, and acceptance criteria mutually consistent and machine-checkable to the extent possible at audit time.

Open items (not blockers, but flagged for future revision):

- §3.1 "Lifted (unverified)" phase entries (`event-relay`, `heartbeat-decision`) graduate to "Lifted (verified)" only when a second independent consumer exercises them.
- §3.3 `stage-rerun.dispatcher` requires the S1-4 per-method classification before any Stage-2 split decision.
- §3.3 `custom-agents` back-coupling has an action (S1-5) but no resolved technical direction yet.

Consensus points (✅), reconciled disagreements (⚠), and items deferred as open questions are encoded throughout §3, §6, §7, §8.
