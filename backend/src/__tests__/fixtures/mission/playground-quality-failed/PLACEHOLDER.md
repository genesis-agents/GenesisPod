# playground-quality-failed fixture (placeholder)

To materialize:

- persisted `AgentPlaygroundMission.status = "rejected"` → outward `mission.status = "quality-failed"` (§6.4.1.a rule 4)
- `reportArtifactVersion` non-null (terminal artifact exists but signoff failed)
- `mission.leaderSigned = false`, `leaderVerdict` non-null with rejection text
- `resumable = false` (terminal)
- stages should all be `done` or `failed`; at least s10-leader-signoff `failed`
