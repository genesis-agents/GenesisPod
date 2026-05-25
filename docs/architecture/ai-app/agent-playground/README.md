# Agent Playground Architecture Docs

> Location: `docs/architecture/ai-app/agent-playground/`
> Baseline date: 2026-04-26

This directory contains the architecture baseline, audits, boundary design,
runtime contract material, rerun design, and cost strategy for
`agent-playground`.

---

## Core docs

| Document                                                                                                                                           | Purpose                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [mission-pipeline-baseline.md](./mission-pipeline-baseline.md)                                                                                     | Main baseline for mission pipeline architecture, contracts, and locked decisions                    |
| [mission-pipeline-sota-audit-2026-04-29.md](./mission-pipeline-sota-audit-2026-04-29.md)                                                           | System-level audit against SOTA patterns                                                            |
| [contract-single-source-audit-2026-05-22.md](./contract-single-source-audit-2026-05-22.md)                                                         | Single-source and runtime contract audit                                                            |
| [agent-team-boundary-audit-2026-05-08.md](./agent-team-boundary-audit-2026-05-08.md)                                                               | Boundary review for app vs harness responsibilities                                                 |
| [agent-playground-target-boundary-and-directory-blueprint-2026-05-24.md](./agent-playground-target-boundary-and-directory-blueprint-2026-05-24.md) | Target boundary and directory blueprint for app, harness, and frontend shells                       |
| [playground-cost-strategy-v1.md](./playground-cost-strategy-v1.md)                                                                                 | Cost strategy for `deep` and `report` execution shapes, runtime spend control, and target economics |

---

## Pipeline design docs

| Document                                                                               | Purpose                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------- |
| [mission-pipeline-reconciler.md](./mission-pipeline-reconciler.md)                     | Reconciler stage design                     |
| [mission-pipeline-writer-artifact.md](./mission-pipeline-writer-artifact.md)           | Writer output and artifact contract         |
| [mission-pipeline-runresult-schema.md](./mission-pipeline-runresult-schema.md)         | Run result schema                           |
| [mission-pipeline-exit-policy.md](./mission-pipeline-exit-policy.md)                   | Exit policy and terminal conditions         |
| [mission-pipeline-finalize-gate.md](./mission-pipeline-finalize-gate.md)               | Finalize gate and completion rules          |
| [mission-pipeline-failure-learning.md](./mission-pipeline-failure-learning.md)         | Failure learning and pattern reuse          |
| [mission-pipeline-tool-recall.md](./mission-pipeline-tool-recall.md)                   | Tool recall policy                          |
| [mission-pipeline-tool-acl.md](./mission-pipeline-tool-acl.md)                         | Tool ACL and entitlements                   |
| [mission-pipeline-tool-failure-circuit.md](./mission-pipeline-tool-failure-circuit.md) | Tool failure circuit policy                 |
| [mission-pipeline-user-profiles.md](./mission-pipeline-user-profiles.md)               | User profile and default execution settings |
| [mission-pipeline-replay-api.md](./mission-pipeline-replay-api.md)                     | Replay API design                           |
| [mission-pipeline-audit-layers.md](./mission-pipeline-audit-layers.md)                 | Audit layer model                           |

---

## Rerun and maturity docs

| Document                                                                               | Purpose                               |
| -------------------------------------------------------------------------------------- | ------------------------------------- |
| [rerun-overhaul-design-v1.md](./rerun-overhaul-design-v1.md)                           | Rerun redesign                        |
| [stage-rerun-dispatcher-classification.md](./stage-rerun-dispatcher-classification.md) | Stage rerun dispatcher classification |
| [maturity-overhaul-plan-2026-05.md](./maturity-overhaul-plan-2026-05.md)               | Maturity improvement plan             |
| [benchmark-app-plan.md](./benchmark-app-plan.md)                                       | Benchmark application planning        |
| [r3-orchestration-remaining-spec.md](./r3-orchestration-remaining-spec.md)             | Remaining orchestration work          |

---

## Suggested reading order

1. Read [mission-pipeline-baseline.md](./mission-pipeline-baseline.md).
2. Read [mission-pipeline-sota-audit-2026-04-29.md](./mission-pipeline-sota-audit-2026-04-29.md).
3. Read [contract-single-source-audit-2026-05-22.md](./contract-single-source-audit-2026-05-22.md).
4. Read [agent-playground-target-boundary-and-directory-blueprint-2026-05-24.md](./agent-playground-target-boundary-and-directory-blueprint-2026-05-24.md).
5. Read [playground-cost-strategy-v1.md](./playground-cost-strategy-v1.md).

---

## Notes

- Historical or superseded material should go under [`_archive/`](./_archive/).
- New architecture docs for `agent-playground` should be indexed here.
