# playground-reopened fixture (placeholder)

To materialize:

- a mission that was terminal then re-entered execution
- outward `mission.status = "running"` (§6.4.1 additional rule 2: `reopened` is not a public status)
- reopen history surfaces via event timeline, not via status enum
- `resumable` may be true depending on checkpoint state
- exercises `mission-rerun-orchestrator.service.ts` reopen path
