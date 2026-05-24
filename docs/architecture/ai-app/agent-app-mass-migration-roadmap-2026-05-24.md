# Agent App Mass Migration Roadmap

**Status:** Active execution starting 2026-05-24, driven by user directive "彻底简化 Agent,能力复用到 harness 和 engine"
**Owner:** Main agent (this session) + sub-agents per phase
**Source-of-truth doc:** [`agent-playground-target-boundary-and-directory-blueprint-2026-05-24.md`](./agent-playground/agent-playground-target-boundary-and-directory-blueprint-2026-05-24.md)

---

## 1. Mass Migration Decision

The agent-playground target-boundary blueprint is **not "future target,"** it is **the current need**.

Real grep on 2026-05-24:

| Module               | files | mission-pipeline flags | Status                                  |
| -------------------- | ----- | ---------------------- | --------------------------------------- |
| **agent-playground** | 113   | M / P / D / O / I / R  | Complete benchmark                      |
| **social**           | 112   | M / P / D / O / I / R  | Copy of playground                      |
| **radar**            | 64    | M / P / D / O / R      | Copy of playground (no invoker)         |
| **writing**          | 144   | M / P / O              | Half-set                                |
| **topic-insights**   | 200   | M / O                  | Half-set (largest module)               |
| **office**           | 109   | P / O                  | Half-set (no mission)                   |
| **research**         | 75    | O                      | Minimal                                 |
| **planning**         | 12    | O                      | Minimal                                 |
| **teams**            | 78    | M                      | Special (ai-engine/teams registry user) |

Flag legend: **M**ission dir / **P**ipeline / **D**ispatcher / **O**rchestrator / **I**nvoker / **R**untime-shell

`social/services/mission/workflow/narrative.util.ts` exists in `agent-playground/.../workflow/narrative.util.ts` too — identical utility, copy-pasted.

**Conclusion:** the BusinessTeam framework extraction is **paying for active multi-team usage**, not speculative. Mass migration starts now.

---

## 2. Migration Goals

### 2.1 Backend

- All mission-pipeline glue lives in `ai-harness/teams/business-team/` framework
- Each `ai-app/<team>/` shrinks to: business input + pipeline graph + stage handlers + role services + app adapter + report semantics
- Reusable LLM-with-prompt patterns sink to `ai-engine/skills` or `ai-harness/agents/domain`
- Cross-cutting concerns (budget / tracing / evidence) sink to `ai-harness/guardrails` and `ai-harness/tracing`

### 2.2 Frontend

- Canonical mission-detail shell (`MissionDetailFrame` / `DrawerShell` / `StageStepper` / `MissionActionGroup`) lives in `components/common/mission-detail/`
- Each feature mission page fills the shell with feature content, no bespoke page structure
- Shared mission view derivation lives in `lib/missions/derive/`

### 2.3 Guardrails

- ESLint `no-restricted-syntax` blocks new `*dispatcher* / *invoker* / *runtime-shell* / *stage-bindings*` files in `ai-app/`
- jest contract spec asserts `ai-app/*/services/` only consumes harness framework via facade
- audit baseline locks current state of `ai-app/<team>/services/mission/workflow/` directories

---

## 3. Roadmap (6 Waves / 23 Phases)

Notation: ✅ done · 🔄 running · ⏳ queued · ⏸ paused (decision pending)

### Wave 1 — Harness BusinessTeam Framework Extraction (driven by 3 complete-range teams: playground / social / radar)

**Revised 2026-05-24 evening**: per user directive "下沉 playground 的能力,推送给 radar 和 social", scope expands beyond the original 4 frameworks to **all reusable mechanism layers** in playground. Estimate: ~6500+ LOC sinks to harness; playground shrinks from 113 → ~30 files (~70% reduction); radar/social lose their copy-paste shells entirely.

#### Playground capability inventory (target sink tiers)

| Tier                               | Capability                                                                                                                                                                                            | Files (playground) | Sink target                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| **T1 pure mechanism**              | invoker / dispatcher / bindings / runtime-shell / span / cross-stage-state / execution-support / runner-state-util / event-relay base                                                                 | 9 files, ~2400 LOC | `ai-harness/teams/business-team/{invocation,dispatcher,bindings,lifecycle,span,state,events}/` |
| **T2 generic helper** (策略参数化) | chapter-pipeline-helper / per-dim-pipeline / batch-executor / evidence-budget / narrative-util / word-count-normalizer / grade-grounding / segment-extractors                                         | 8 files, ~2150 LOC | `ai-harness/teams/business-team/helpers/`                                                      |
| **T3 rerun mechanism**             | stage-rerun-dispatcher / local-rerun / rerun-orchestrator / rerun-guard / ctx-hydrator / rerun-runtime-builder + input-rebuilder abstraction                                                          | 7 files, ~2600 LOC | `ai-harness/teams/business-team/rerun/`                                                        |
| **T4 lifecycle mechanism**         | mission-store / lifecycle-helper / update-helper / postmortem-helper / event-buffer / checkpoint-store / event-categories + report-helper abstract                                                    | 8 files, ~2050 LOC | `ai-harness/teams/business-team/lifecycle/` (extend existing)                                  |
| **T5 stay in app**                 | role services (4) / leader-chat / mission-export / chapter-integrity / report-artifact-sections / mission-context+deps (business fields) / business-orchestrator (business assembly) / pipeline graph | 13 files           | `ai-app/agent-playground/` only                                                                |

#### Phase schedule (revised)

| Phase  | Scope                                                                                                                                               | Targets migrated                                                           | Status                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------ |
| **P1** | T1.1 `BusinessTeamAgentInvoker.framework` + execution-support + runner-state-util                                                                   | playground + social (radar has no invoker)                                 | 🔄 `ae00151b66465ad91` running |
| **P2** | T1.2 `BusinessTeamMissionDispatcher.framework` + T1.3 `BusinessTeamStageBindings.framework` (bundled — they are tightly coupled)                    | playground + social + radar                                                | ⏳                             |
| **P3** | T1.4 cross-stage-state + T1.5 mission-span + T1.6 event-relay base                                                                                  | playground + social + radar                                                | ⏳                             |
| **P4** | T2 helpers (chapter-pipeline / per-dim-pipeline / batch-executor / evidence-budget / narrative / word-count / grade-grounding / segment-extractors) | playground + social + radar where applicable                               | ⏳                             |
| **P5** | T3 rerun framework (all 6 services + input-rebuilder abstraction)                                                                                   | playground first; social + radar may not need rerun yet — verify with grep | ⏳                             |
| **P6** | T4 lifecycle (mission-store / helpers / event-buffer / checkpoint-store / event-categories / report-helper abstraction)                             | playground + social + radar                                                | ⏳                             |
| **P7** | `BusinessTeamOrchestrator.framework` (skeleton only; business event emit + report semantics stay app)                                               | playground + social + radar                                                | ⏳                             |

Exit criteria for Wave 1: playground services/ dir contains only T5 files (~30 files, down from 113); social and radar likewise consume harness frameworks and have no `*-dispatcher* / *-invoker* / *-bindings* / *-runtime-shell* / *-cross-stage-state* / *-span* / *-helper* / *-rerun*` files of their own.

### Wave 1b — Directory Reorganization (per blueprint §8.1 / §8.2)

Once T1-T4 sink phases land, the resulting file placements need to match blueprint §8.1 (harness side) and §8.2 (app side). Doing this _as a separate phase_ avoids mixing semantic-extraction conflicts with rename/import-update churn.

| Phase   | Scope                                                           | Action                                                                                                                                                                                                                        |
| ------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P8**  | `ai-harness/teams/business-team/` reorganization to §8.1 layout | Group extracted framework files under `abstractions/`, `lifecycle/`, `dispatcher/`, `invocation/`, `bindings/`, `rerun/`, `events/`; update all imports + facade re-exports                                                   |
| **P9**  | `ai-app/agent-playground/` reorganization to §8.2 layout        | Promote out of `services/` subtree: `module/` `api/` `runtime/` `mission/{pipeline,context,roles,artifacts,lifecycle}/` `events/` `__tests__/` are the new top-level dirs. Old `services/mission/workflow/` etc. are deleted. |
| **P10** | `ai-app/social/` same reorganization                            | Mirror §8.2 layout; same dir scheme as playground                                                                                                                                                                             |
| **P11** | `ai-app/radar/` same reorganization                             | Mirror §8.2 layout; same dir scheme as playground                                                                                                                                                                             |

Rename-heavy work uses `git mv` to preserve blame; per-file import-path updates must happen atomically with the move (no stale paths between phases). Each P8-P11 phase ends with full tsc + jest green, no commit half-way.

### Wave 2 — Half-Set Teams Migration + Reorganization

Wave 2 phases include both **framework consumption** (each team now uses harness frameworks) and **§8.2 directory reorganization** (each team adopts the canonical layout).

| Phase   | Module                                    | Current flags | Action                                                                                                                      |
| ------- | ----------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **P12** | writing (144 files)                       | M / P / O     | Inject all 7 frameworks; reorganize to §8.2                                                                                 |
| **P13** | topic-insights (200 files, **largest**)   | M / O         | Decompose into pre-tasks first: catalog all mission-\* files; phased migration in 2-3 sub-phases; final §8.2 reorganization |
| **P14** | office (109 files)                        | P / O         | Add mission/ dir; migrate to framework; §8.2 reorganization                                                                 |
| **P15** | research (75 files) + planning (12 files) | O             | Evaluate whether to promote to mission-pipeline or keep simpler `BusinessTeamSimpleOrchestrator` track                      |
| **P16** | teams (78 files)                          | M only        | Boundary check: clarify boundary with `ai-engine/teams/` registry                                                           |

### Wave 3 — Engine-Level Shared Capability Lifting

| Phase   | Scope                                                                                                                                              | Driver                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **P17** | Prompt templates: grep all `prompts/` dirs across ai-app modules, lift reusable ones to `ai-engine/skills/` or `ai-harness/agents/domain/prompts/` | Stop duplicate prompt growth                                                  |
| **P18** | Tool invocation: grep direct external-API calls in services, route through `ai-engine/tools/`                                                      | Single tools registry                                                         |
| **P19** | Budget / tracing / evidence: lift cross-cutting to `ai-harness/guardrails/` and `ai-harness/tracing/`                                              | Single observability layer                                                    |
| **P20** | Event relay: lift common `BusinessTeamEventRelay.base`                                                                                             | Already in Wave 1 P3; this phase finalizes per-team namespace adapter pattern |

### Wave 4 — Guardrails (enforce, prevent regression)

| Phase   | Scope                                                                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P21** | ESLint `no-restricted-syntax` + filename rules: `ai-app/*/` may not contain `*-dispatcher*` / `*-invoker*` / `*-runtime-shell*` / `*-stage-bindings*` / `*-cross-stage-state*` / `*-mission-span*` / `*-rerun-dispatcher*` filenames |
| **P22** | jest contract spec (AST-level): `ai-app/*` mission-pipeline files only consume `ai-harness/teams/business-team/*` via facade                                                                                                         |
| **P23** | audit baseline lock: snapshot of `ai-app/*/mission/` directories per §8.2 layout; new files outside white list → audit:fail                                                                                                          |
| **P24** | pre-push hook integrates `audit:agent-team-discipline`                                                                                                                                                                               |

### Wave 5 — Frontend Canonical Mission Shell

| Phase   | Scope                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P25** | Extract `MissionDetailFrame` / `DrawerShell` / `ModalShell` / `StageStepper` / `MissionActionGroup` to `components/common/mission-detail/` per blueprint §9.5 |
| **P26** | Extract shared derive primitives to `lib/missions/derive/` (`deriveMissionView` / `deriveStageView` / `deriveAgentView` per §9.5)                             |
| **P27** | agent-playground page wires canonical shell (validates shell completeness)                                                                                    |
| **P28** | 5 remaining teams (social / radar / writing / topic-insights / office) mission pages migrate to canonical shell                                               |
| **P29** | `audit:mission-detail-discipline` script: new feature mission pages must use `<MissionDetailFrame>`                                                           |

### Wave 6 — Closeout

| Phase   | Scope                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P30** | Update `agent-playground-target-boundary-and-directory-blueprint-2026-05-24.md` with actual extracted framework paths + completion status         |
| **P31** | New `standards/23-business-team-framework-usage.md` — SOP for creating a new team via the framework                                               |
| **P32** | Final 4-way collective review (architect / arch-auditor / reviewer / security-auditor); audit baseline confirmed; three-layer guardrail confirmed |

---

## 4. Execution Rules

1. **Phases run strictly serial:** P1 → P2 → P3 → ... — no parallel phases, because each phase depends on the previous framework being in place.
2. **Each phase:** sub-agent in worktree → main agent copies → tsc + jest verify → commit → push → next phase.
3. **No per-phase review** (per user batch-review-at-end preference). Reviews happen at P24.
4. **Three-team batch principle in Wave 1:** playground + social + radar migrate in **one phase**, not three; halting at 1-of-3 leaves dual-source.
5. **god-class budget for `ai-api-caller.service.ts` is closed:** Wave 1 extracts cleanly, ai-api-caller untouched.
6. **Stuck on real ambiguity:** main agent decides per `feedback_grep_before_yagni_judgment` (grep first, then choose), unless user-visible architectural decision (e.g. P8 simple-orchestrator track vs upgrade) — then halt and ask.

---

## 5. Worktree And Failure Recovery

- Each phase uses `isolation: "worktree"`. Worktree path: `.claude/worktrees/agent-<id>/`.
- If a phase worktree dies: re-extract from agent report's `git diff` summary using main worktree, replay; do **not** `git checkout -- .` (per `feedback_no_global_revert_even_single_file`).
- If a phase blocks on git push (lint-staged ESLint OOM): `NODE_OPTIONS=--max-old-space-size=12288 git commit ...` (per `feedback_parallel_agent_integration_2026_05_23`).
- If pre-push hook trips on someone else's commit regression: fix it inline as a carrier commit (per `feedback_push_must_fix_gates_not_wait`); do not skip the gate.

---

## 6. Status Tracker (updated as phases land)

| Phase           | Commit    | Test count delta | Notes                        |
| --------------- | --------- | ---------------- | ---------------------------- |
| P1 (invoker)    | _running_ | _TBD_            | Worktree `ae00151b66465ad91` |
| P2 (dispatcher) | _queued_  |                  |                              |
| P3 (bindings)   | _queued_  |                  |                              |
| ...             |           |                  |                              |

---

## 7. Decision Points That Require User Input

These are the **only places** I will halt and ask for direction; everything else I decide per `feedback_grep_before_yagni_judgment`:

- **P6 topic-insights phasing decision** (200 files; do we accept "1 mega phase" or split into 2-3 sub-phases by sub-domain?)
- **P8 research/planning track decision** (upgrade to mission-pipeline range OR introduce `BusinessTeamSimpleOrchestrator` lite track?)
- **P9 teams boundary decision** (ai-app/teams business code: which parts stay app, which sink to ai-engine/teams registry?)
- **P10/P11 prompt + tool lifting scope** (one mega lift OR per-team lift; depends on what grep reveals about overlap)

When each of those phases arrives I will produce a grep-backed evidence package and present 2-3 options. Until then, full speed ahead.
