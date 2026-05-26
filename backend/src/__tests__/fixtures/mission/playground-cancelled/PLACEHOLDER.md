# playground-cancelled fixture (placeholder)

To materialize:

- `mission.status = "cancelled"` (§6.4.1 rule 4, only explicit user/system cancel)
- `mission.failureCode` should be a cancel-canonical code (not generic failure)
- stages running at the time of cancel transition to `failed` or remain `running`-ended with `endedAt` aligned to cancel timestamp
- `resumable` may be true if checkpoint exists and policy permits; default false
- ensure `POST /agent-playground/missions/:id/cancel` is the originating write path
