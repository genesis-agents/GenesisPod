# UI Iteration Skill

Fully automated end-to-end UI testing with iterative fix loop for DeepDive Engine.

## What This Skill Does

Executes a complete **autonomous test-fix-retest cycle**:

```
┌─────────────────────────────────────────────┐
│  Phase A: Generate Test Plan                │
│  - Read reference test cases                │
│  - Scan codebase for new features           │
│  - Output dated test document               │
├─────────────────────────────────────────────┤
│  Phase B: Execute Tests                     │
│  - Navigate pages via browser automation    │
│  - Verify UI, console, network              │
│  - Record PASS/FAIL with evidence           │
├─────────────────────────────────────────────┤
│  Phase C: Triage & Fix                      │
│  - Analyze root cause in source code        │
│  - Apply fixes + type check + unit tests    │
│  - Record fix details                       │
├─────────────────────────────────────────────┤
│  Phase D: Regression & Refresh              │
│  - Re-test failed cases                     │
│  - Check for regressions                    │
│  - Loop back to C if new failures found     │
├─────────────────────────────────────────────┤
│  Phase E: Final Report                      │
│  - Executive summary                        │
│  - Full test log with timestamps            │
│  - Issues found/fixed                       │
│  - Code changes summary                     │
└─────────────────────────────────────────────┘
```

## Usage

Invoke via Claude Code slash command:

```
/ui-iteration
```

The skill runs **fully autonomously** - no human input needed during execution.

## Key Files

| File                                                                          | Purpose                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------- |
| `.claude/commands/ui-iteration.md`                                            | Slash command prompt (full instructions) |
| `docs/guides/testing/test-cases/comprehensive-combination-test-2026-01-25.md` | Reference test plan                      |
| `docs/guides/testing/test-results/ui-iteration-{date}.md`                     | Output test reports                      |

## Test Environment

- **Local URL**: http://localhost:3000
- **Production URL**: https://raven-ai-engine.up.railway.app
- **Browser**: Playwright MCP or Chrome DevTools MCP
- **Fallback**: Code-level analysis + API testing via curl

## Test Scope

### P0 - Blocking (Must Pass)

- Page loading (no white screens, no console errors)
- AI Ask: send/receive messages, model switching, Mixture mode
- Knowledge base integration (RAG queries)
- AI Teams, Research, Writing page loads

### P1 - Important

- Web search, file upload, session management
- Cross-module navigation, error recovery
- Responsive design

### P2 - Nice to Have

- Boundary conditions, performance, accessibility

## Automation Principles

1. **Zero human intervention** - runs start-to-finish autonomously
2. **Fix immediately** - don't just report issues, fix them in code
3. **Iterate until clean** - loop until regression passes
4. **Record everything** - every action, observation, decision logged
5. **Parallel execution** - use Task tool for independent test groups
6. **Commit at the end** - only after all iterations pass

## Output Format

The test report (`docs/guides/testing/test-results/ui-iteration-{date}.md`) contains:

1. **Header**: Date, environment, commit hash, execution time
2. **Summary Table**: Tests executed, passed, failed, fixed
3. **Detailed Results**: Per-test evidence and status
4. **Issues Log**: Every bug found with root cause and fix
5. **Code Changes**: Files modified with descriptions
6. **Conclusion**: Quality assessment and remaining gaps
