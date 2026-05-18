---
name: Execute decisively, skip confirmation loops
description: User prefers autonomous execution — once they've given a direction, act, don't repeatedly ask "shall I commit?" or "which option?"
type: feedback
originSessionId: b68fcfd0-6060-4aa3-b07f-e351b4894d47
---

Act on the decision already given. Don't re-prompt for commit/push approval mid-task, and don't enumerate options and wait — pick the sane default and ship it. Confirmation is warranted only for genuinely destructive/irreversible actions (force push, rm -rf, dropping DB).

**Why:** User explicitly pushed back with "搞啊，不要反反复复确认" (2026-04-22) after I asked multiple follow-up "要不要提交？/ 要不要我一并清理？" questions across a small task. They want momentum.

**How to apply:**

- After edits on an authorized task, proceed to verify + commit + push in one go without asking.
- When presenting analysis/options, include a recommendation and execute it rather than stopping to ask which option.
- Still pause for: destructive git ops (force push, reset --hard, clean -fd), schema/prod DB changes, out-of-scope refactors, architecture decisions that change module boundaries.
- Preserve existing CLAUDE.md red lines (e.g., no `git checkout -- .`) — "don't ask" is not "skip safety".
