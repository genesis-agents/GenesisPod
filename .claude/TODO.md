# Platform Refactor Task List

Last updated: 2025-12-01 11:35 (UTC+8)

Legend: **Status** → `DONE` · `IN_PROGRESS` · `PENDING` · `BLOCKED`

| ID  | Task                                                                                           | Owner         | Priority | Status  | Notes                                                                             |
| --- | ---------------------------------------------------------------------------------------------- | ------------- | -------- | ------- | --------------------------------------------------------------------------------- |
| T1  | Refresh `.claude` workspace docs (README/RESUME/TODO)                                          | Platform Arch | P0       | DONE    | Completed 2025-12-01; keep timestamps current on future edits.                    |
| T2  | Create `platform-refactor` feature branch and migration plan (AI-first)                        | Backend Lead  | P0       | PENDING | Branch should host AI orchestration extraction and shared services.               |
| T3  | Extract AI orchestration service (model registry, prompt insight API, structured parser)       | Backend + AI  | P0       | PENDING | Deliver shared service + TypeScript/TS client; keep existing behaviour unchanged. |
| T4  | Define content ingestion platform module (YouTube, articles, papers) with fallback strategy    | Backend       | P1       | PENDING | After T3; reuse logging + error metrics.                                          |
| T5  | Build shared frontend UI kit (layout shell, gallery rail, insights cards, prompt suite)        | Frontend      | P1       | PENDING | Storybook coverage + responsive specs; target Image Generator first.              |
| T6  | Align monitoring/configuration assets with infra repo & update `.claude/config/monitoring.yml` | DevOps        | P2       | PENDING | Replace placeholders with actual endpoints or move to infra repo.                 |

## Upcoming Milestones

1. **Milestone A** – AI orchestration service live behind feature flag (targets T2-T3).
2. **Milestone B** – Content ingestion + monitoring unified (T4 & T6).
3. **Milestone C** – Frontend UI kit adopted by Image Generator (T5).

Update this table whenever a task changes status or new items are added.
