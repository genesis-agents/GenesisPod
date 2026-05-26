# playground-failed fixture (placeholder)

To materialize:

- `mission.status = "failed"` (per §6.4.1 rule 3)
- `mission.failureCode` non-null with canonical fail enum
- `reportArtifactVersion` typically null (no terminal artifact)
- `resumable = false` (terminal failure)
- a stage in the middle of the sequence must have `status = "failed"`; downstream stages remain `pending`
- agents under the failed stage have `phase = "failed"`

Replace this placeholder with `meta.json / mission-row.json / events.json / checkpoint.json (legacy-null acceptable) / expected-view.json`.
