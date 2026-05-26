# playground-resumable fixture (placeholder)

To materialize:

- mission `status` is failed or interrupted (e.g. crashed mid s5 / s8)
- `configSnapshot` non-null on `mission-row.json`
- ResumeRerunPolicyService inputs (per §5.3) sufficient to compute `resumable = true`
- expected `mission.resumable = true`
- one of the §6.5.1.b matrix yes-stages must be the failure locus
- `checkpoint.json` should be `{ kind: "config-snapshot", snapshot: {...} }`, not legacy-null

Negative companion: a sibling fixture variant where `configSnapshot = null` MUST yield `resumable = false` with reason citing legacy snapshot absence (per §5.3 rule 4). Either add as separate fixture or document inside this directory.
