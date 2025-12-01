# .claude Workspace Guide

Last updated: 2025-12-01

The `.claude` directory stores lightweight hand-off material for engineers and AI copilots.  
Keep the content short, ASCII-only, and in sync with the actual project state.

---

## Start Here

1. **`RESUME.md`** – one-paragraph status + immediate next steps.
2. **`TODO.md`** – current scoped task list with owners and priority.
3. **`PROJECT_STATUS.md`** – longer context, architecture decisions, and history.

If any of these files feel outdated, update them before continuing work.

---

## File Overview

| File                           | Purpose                                               | Update Rhythm          |
| ------------------------------ | ----------------------------------------------------- | ---------------------- |
| `RESUME.md`                    | Quick resume note for the next engineer/agent         | Whenever focus changes |
| `TODO.md`                      | Active tasks (≤10) with status and owner              | Daily or per PR        |
| `PROJECT_STATUS.md`            | Phase summary, key decisions, outstanding risks       | End of each milestone  |
| `TODO.archive.md` _(optional)_ | Completed worklog (keep outside this folder if large) | As needed              |
| `config/monitoring.yml`        | Monitoring template (sync with infra repo)            | When infra changes     |
| `standards/*.md`               | Coding/documentation standards reference              | Review quarterly       |

---

## Update Checklist

- [ ] Confirm timestamps (“Last updated”) reflect the latest edit.
- [ ] Ensure instructions match the current directory structure (`D:\projects\deepdive\`).
- [ ] Remove or archive obsolete task lists instead of keeping crossed-out items.
- [ ] Keep status sections factual; avoid speculative or stale statements.
- [ ] Run `git status` to verify the documentation change is captured.

---

## Conventions

- **Encoding**: UTF-8, ASCII characters preferred to avoid mojibake.
- **Links**: Use repository-relative paths (e.g. `docs/architecture/...`).
- **Source of truth**: Detailed specs live under `/docs`; `.claude` hosts resumés and live tasks only.
- **Role clarity**: Note whether an item targets engineers, PMs, or agents.

---

## Maintainers

- Primary: Platform Architecture Team
- Secondary: On-call engineer (rotate weekly)
- Automation: Future integration with CI can update timestamps automatically.

If you add new files under `.claude`, document them in the table above.
