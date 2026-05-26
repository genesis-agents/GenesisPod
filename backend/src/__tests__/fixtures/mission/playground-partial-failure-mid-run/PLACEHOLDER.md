# playground-partial-failure-mid-run fixture (placeholder — combined-state §6.8.1.b)

To materialize:

- `mission.status = "running"` (NOT terminal yet)
- ≥ 2 stages already `done`
- 1 stage `failed` (mid-pipeline)
- ≥ 1 stage still `running` (e.g. concurrent dim researcher)
- downstream stages `pending`
- some agents `failed`, some still `running`
- tests projector aggregation under non-trivial cross-stage state
