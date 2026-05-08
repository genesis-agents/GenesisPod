# Agent Playground Agent Team Boundary Audit

**Date:** 2026-05-08  
**Scope:** `backend/src/modules/ai-app/agent-playground`  
**Goal:** Determine whether `agent-playground` has the correct sediment boundary with `ai-harness` and `ai-engine`: what should already be sunk, what must remain in the app layer, and what is still mixed.

---

## 1. Executive Summary

`agent-playground` is already a strong **full-capability reference implementation** for Agent Team business flows, but it is **not yet the cleanest benchmark template**.

The current boundary state is:

- Most core runtime substrate that should live in `ai-harness` has already moved in the right direction.
- Business semantics that must stay in `ai-app` are mostly still in the right place.
- The main remaining problem is not "over-sinking business logic", but "team-runtime glue still left in app code".

Overall verdict:

| Question                                                                  | Verdict           |
| ------------------------------------------------------------------------- | ----------------- |
| Have the major runtime foundations been sunk?                             | Yes, mostly       |
| Has business semantics been kept out of harness/engine?                   | Yes, mostly       |
| Are all sink-worthy common capabilities already sunk?                     | No                |
| Is there serious over-sinking of business semantics?                      | No, not currently |
| Can this directory already be treated as the cleanest benchmark template? | Not yet           |

---

## 2. Boundary Decision Rules

Use the following rules to decide whether a concern belongs in `ai-app`, `ai-harness`, or `ai-engine`.

| Rule                                                                                                         | If yes | Destination      |
| ------------------------------------------------------------------------------------------------------------ | ------ | ---------------- |
| Will another Agent Team likely copy more than 70% of this logic unchanged?                                   | Yes    | `ai-harness`     |
| Is this a runtime/execution/orchestration mechanism rather than product semantics?                           | Yes    | `ai-harness`     |
| Is this a single-call primitive or content/tool/model capability that does not need mission awareness?       | Yes    | `ai-engine`      |
| Does this logic encode `agent-playground` product semantics, mission schema, event names, or report meaning? | Yes    | `ai-app`         |
| Would sinking this force other teams to inherit `agent-playground`-specific semantics?                       | Yes    | Keep in `ai-app` |

In short:

- `ai-engine` answers: "what a single capability can do"
- `ai-harness` answers: "how agents and teams run"
- `ai-app` answers: "what this business team means"

---

## 3. System Classification Table

### 3.1 Should Continue Sinking

These concerns are still too reusable to remain long-term in `agent-playground`.

| Component                                         | Current file                                                                                           | Current role                                            | Why it should sink                                                           | Target layer                     | Priority |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------- | -------- |
| Mission runtime shell framework                   | `services/mission/workflow/mission-runtime-shell.service.ts`                                           | Business adapter over shared runtime session open/close | Already adapter-shaped; other teams will need the same lifecycle substrate   | `ai-harness`                     | P0       |
| Event relay framework                             | `services/roles/agent-playground-event-relay.ts`                                                       | Namespace wrapper over shared relay logic               | Already mostly sunk; should remain a thin team adapter only                  | `ai-harness`                     | P0       |
| Stage progress tracking                           | `services/mission/workflow/playground-pipeline-dispatcher.service.ts` (`STAGE_NUMBER`)                 | Maps step completion to DB progress                     | Runtime progress contract, not product semantics                             | `ai-harness`                     | P0       |
| Checkpoint timing wrapper                         | `services/mission/workflow/playground-pipeline-dispatcher.service.ts` (`CHECKPOINT_AT`)                | Saves resumability snapshots at stage boundaries        | Common team-runtime pattern                                                  | `ai-harness`                     | P0       |
| Progress-on-success wrapper                       | `services/mission/workflow/playground-pipeline-dispatcher.service.ts` (`withProgressTracking`)         | Wraps hooks to mark progress and save checkpoints       | Pure orchestration glue                                                      | `ai-harness`                     | P0       |
| Orphan/zombie running mission cleanup             | `services/mission/workflow/playground-pipeline-dispatcher.service.ts` (`cleanupOrphanRunningMissions`) | Recovers runtime rows after pod/session loss            | Common runtime governance concern                                            | `ai-harness`                     | P0       |
| Hook wrapping and standard stage lifecycle bridge | `services/mission/workflow/playground-pipeline-dispatcher.service.ts`                                  | Converts pipeline steps to shared orchestrator hooks    | If reused by future teams, should not stay app-local                         | `ai-harness`                     | P1       |
| Rerun runtime builder                             | `services/mission/rerun/rerun-runtime-builder.service.ts`                                              | Rebuilds billing/pool/runtime context for reruns        | Team rerun execution substrate                                               | `ai-harness`                     | P1       |
| Rerun guard/common in-flight governance           | `services/mission/rerun/rerun-guard.service.ts`                                                        | Protects concurrent rerun state and zombie cleanup      | Cross-team rerun governance                                                  | `ai-harness`                     | P1       |
| Event replay/buffer framework contract            | `services/mission/lifecycle/mission-event-buffer.service.ts`                                           | In-memory replay + persisted fallback                   | Buffer contract is common even if storage remains business-specific          | `ai-harness` interface/framework | P1       |
| Mission store minimum lifecycle contract          | `services/mission/lifecycle/mission-store.service.ts`                                                  | Business store with reusable lifecycle methods          | Refresh heartbeat, mark failed, reopen, orphan cleanup are runtime contracts | `ai-harness` interface           | P1       |

### 3.2 Must Stay in `ai-app`

These are business semantics and should not sink into harness or engine.

| Component                                  | Current file                                          | Why it must stay in app                                    |
| ------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------- |
| Event type namespace and payload semantics | `agent-playground.events.ts`                          | Product-level protocol consumed by frontend and mission UX |
| Event schemas                              | `agent-playground.event-schemas.ts`                   | Business payload shape and validation rules                |
| Pipeline roles/steps/DAG/rerunability      | `playground.config.ts`                                | Business workflow definition                               |
| REST interface                             | `agent-playground.controller.ts`                      | Product API surface                                        |
| WebSocket namespace/join semantics         | `agent-playground.gateway.ts`                         | Product realtime boundary                                  |
| Mission data model fields                  | `services/mission/lifecycle/mission-store.service.ts` | Business persistence schema                                |
| Stage logic                                | `services/mission/workflow/stages/*`                  | Business script, not runtime substrate                     |
| Role service semantics                     | `services/roles/*.service.ts`                         | Business role meaning and method vocabulary                |
| Agents, duties, soul, skills               | `agents/*`, `skills/*`                                | Product-specific mission behavior                          |
| Leader chat semantics                      | `services/chat/leader-chat.service.ts`                | Business conversational contract                           |
| Mission export semantics                   | `services/export/mission-export.service.ts`           | Product output contract                                    |

### 3.3 Boundary-Mixed / Needs Refactoring

These are the highest-risk mixed-boundary files.

| Component                      | Current file                                                          | Mixed concerns                                                                                                      | Decision                                                          |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Pipeline dispatcher            | `services/mission/workflow/playground-pipeline-dispatcher.service.ts` | Session registry, progress tracking, checkpointing, frontend mapping, cleanup, hook building, legacy stage wrapping | Split; sink common runtime glue, keep business orchestration      |
| Stage bindings                 | `services/mission/workflow/mission-stage-bindings.service.ts`         | Giant dependency assembly plus app-specific ctx mapping                                                             | Narrow stage dependency contracts; keep only app-specific mapping |
| Mission deps                   | `services/mission/workflow/mission-deps.ts`                           | Declares reusable phase groups but still exposes oversized aggregate deps                                           | Keep in app, but shrink signatures by phase/stage                 |
| Stage rerun dispatcher         | `services/mission/rerun/stage-rerun.dispatcher.ts`                    | Likely mixes runtime rerun dispatch with business rerun patch logic                                                 | Split runtime rerun substrate from business rerun semantics       |
| Skill registration path wiring | `agent-playground.module.ts`                                          | Two registration mechanisms with one invalid path                                                                   | Collapse to a single source of truth                              |

---

## 4. File-by-File Verdict Matrix

The table below maps the most important files to final ownership decisions.

| File                                                                  | Verdict             | Action                                                                                       |
| --------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| `agent-playground.module.ts`                                          | Split/clean         | Keep module assembly in app; remove duplicate/invalid skill registration wiring              |
| `agent-playground.controller.ts`                                      | Keep in app         | No sink                                                                                      |
| `agent-playground.gateway.ts`                                         | Keep in app         | No sink                                                                                      |
| `agent-playground.events.ts`                                          | Keep in app         | No sink                                                                                      |
| `agent-playground.event-schemas.ts`                                   | Keep in app         | No sink                                                                                      |
| `playground.config.ts`                                                | Keep in app         | No sink; clean stale migration comments                                                      |
| `services/mission/workflow/mission-runtime-shell.service.ts`          | Mostly sunk already | Keep only business adapter shape                                                             |
| `services/mission/workflow/playground-pipeline-dispatcher.service.ts` | Partially sink      | Split and migrate runtime glue to harness                                                    |
| `services/mission/workflow/mission-stage-bindings.service.ts`         | Partial keep        | Keep app ctx mapping, shrink dependency assembly surface                                     |
| `services/mission/workflow/mission-deps.ts`                           | Keep in app, reduce | Replace mega aggregate use with phased contracts                                             |
| `services/mission/lifecycle/mission-event-buffer.service.ts`          | Partial sink        | Keep business adapter/storage specifics; extract common replay/buffer contract               |
| `services/mission/lifecycle/mission-store.service.ts`                 | Partial sink        | Keep schema/model; formalize lifecycle interface in harness                                  |
| `services/mission/rerun/rerun-runtime-builder.service.ts`             | Sink-worthy         | Move rerun runtime substrate into harness                                                    |
| `services/mission/rerun/rerun-guard.service.ts`                       | Sink-worthy         | Move common rerun governance into harness                                                    |
| `services/mission/rerun/stage-rerun.dispatcher.ts`                    | Split               | Separate runtime rerun dispatch from business patch logic                                    |
| `services/roles/agent-invoker.service.ts`                             | Mostly appropriate  | Keep app façade if it preserves business-facing semantics; do not duplicate runtime behavior |
| `services/roles/agent-playground-event-relay.ts`                      | Mostly sunk already | Keep only namespace specialization                                                           |
| `services/chat/leader-chat.service.ts`                                | Keep in app         | No sink                                                                                      |
| `services/export/mission-export.service.ts`                           | Keep in app         | No sink                                                                                      |
| `services/mission/workflow/stages/*`                                  | Keep in app         | No sink                                                                                      |
| `agents/*`                                                            | Keep in app         | No sink                                                                                      |
| `skills/*`                                                            | Keep in app         | No sink                                                                                      |

---

## 5. Current Boundary Problems

### 5.1 The primary problem is incomplete sinking, not over-sinking

The current architecture does **not** mainly suffer from business logic being pushed too low.

The real issue is:

- common team-runtime glue is still in app code
- `agent-playground` is still compensating for framework gaps
- the directory is therefore both a business app and a runtime patch layer

### 5.2 The most obvious symptom is the oversized dispatcher

`PlaygroundPipelineDispatcher` currently behaves as a mixed "business orchestrator + runtime integration hub".

It should not permanently own all of the following at once:

- session registry
- hook construction
- stage success progress bookkeeping
- checkpoint saving
- orphan mission cleanup
- frontend stage mapping
- legacy compatibility wrappers

### 5.3 Documentation and assembly drift signals boundary instability

There are also drift signals showing the boundary is not yet fully settled:

- comments still describe earlier dual-track / legacy migration states
- `services/README.md` still references `team.mission.ts`
- `playground.config.ts` still contains stale migration-era commentary
- `agent-playground.module.ts` registers `skills/built-in`, but the path does not exist

These are not just doc issues; they indicate the system is still in a mid-migration boundary state.

---

## 6. Target Boundary Model

### 6.1 What `ai-harness` should own

`ai-harness` should own all **team runtime substrate** that future business teams will reuse:

- mission session lifecycle
- progress tracking contract
- checkpoint timing and save/restore wrappers
- runtime orphan/zombie cleanup contract
- rerun runtime reconstruction
- standard stage lifecycle bridge
- event replay/buffer framework contract
- mission store lifecycle interface

### 6.2 What `ai-app/agent-playground` should own

`agent-playground` should own all **business semantics**:

- mission pipeline definition
- stage ordering and DAG semantics
- role/agent meaning
- event names and payload semantics
- mission persistence fields
- export/chat/report semantics
- built-in mission skills

### 6.3 What `ai-engine` should own

`ai-engine` should continue to own **single-capability primitives**, not mission semantics:

- skill loading
- figure extraction
- embeddings
- content/tool/model primitives that do not need team awareness

---

## 7. Recommended Refactor Plan

### P0: Required to make `agent-playground` a benchmark template

| Item | Action                                                                            | Outcome                                     |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------- |
| P0-1 | Split `PlaygroundPipelineDispatcher` into business orchestration and runtime glue | Remove mixed ownership hot spot             |
| P0-2 | Formalize shared stage progress/checkpoint wrapper in harness                     | Prevent every team from recreating it       |
| P0-3 | Formalize orphan running mission cleanup contract in harness                      | Runtime recovery stops being app-specific   |
| P0-4 | Collapse skill registration to one valid source of truth                          | Remove assembly ambiguity                   |
| P0-5 | Clean stale migration comments/docs                                               | Restore code/doc architectural truthfulness |

### P1: Should do next

| Item | Action                                                                   | Outcome                                     |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------- |
| P1-1 | Move rerun runtime builder/guard substrate into harness                  | Shared rerun execution layer                |
| P1-2 | Introduce explicit mission store lifecycle interface in harness          | Clarify business schema vs runtime contract |
| P1-3 | Shrink stage dependency signatures from mega deps to phase-specific deps | Clearer app boundary                        |
| P1-4 | Separate event replay contract from business persistence adapter         | Cleaner memory/event-store layering         |

### P2: Follow-up standardization

| Item | Action                                                     | Outcome                                   |
| ---- | ---------------------------------------------------------- | ----------------------------------------- |
| P2-1 | Turn benchmark layout into reusable team template/scaffold | New teams stop copying migration residue  |
| P2-2 | Add contract tests for benchmark teams                     | Enforce boundary discipline automatically |
| P2-3 | Document benchmark invariants for future team modules      | Reduce architecture drift                 |

---

## 8. Acceptance Criteria

`agent-playground` can be considered the clean benchmark Agent Team only when the following are true:

1. Business teams no longer need to copy runtime glue from this directory.
2. The dispatcher no longer acts as a multi-responsibility runtime hub.
3. Stage success/progress/checkpoint behavior is provided by harness contract rather than app-local wrappers.
4. Rerun runtime substrate is no longer business-app-specific.
5. Business semantics remain fully outside harness and engine.
6. Documentation and module assembly match the real runtime state.

---

## 9. Final Judgement

As of 2026-05-08:

- `agent-playground` is **already a strong reference implementation**
- it is **not yet the cleanest benchmark template**
- the architecture is **closer to under-sunk common runtime glue than over-sunk business semantics**

Therefore the correct strategy is:

- **continue sinking shared runtime/team substrate**
- **do not sink business semantics**
- **split mixed files before moving anything further**

That is the correct boundary direction for making `agent-playground` the benchmark Agent Team for Genesis.
