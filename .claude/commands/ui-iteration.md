Automated UI Iteration: End-to-end test verification with iterative fix loop.

## Context

You have access to browser automation tools (Playwright MCP and/or Chrome DevTools MCP) for interacting with the production site. You also have access to the full codebase for fixing issues.

## Test Environment

- **Local URL**: http://localhost:3000
- **Production URL**: https://raven-ai-engine.up.railway.app
- **Reference test plan**: `docs/guides/testing/test-cases/comprehensive-combination-test-2026-01-25.md`
- **Test output directory**: `docs/guides/testing/test-results/`

> Default to **Production URL** unless the user specifies local testing.

## Automated Iteration Loop

Execute the following loop **fully autonomously** until all discovered issues are resolved. The human only starts the process and receives the final report.

### Phase A: Generate Test Plan

1. Read the reference test plan at `docs/guides/testing/test-cases/comprehensive-combination-test-2026-01-25.md`
2. Scan the codebase for any new pages/features not covered in the plan
3. Generate a **dated test plan** at `docs/guides/testing/test-results/ui-iteration-{date}.md`
4. The plan must include:
   - Test environment info (URL, date, commit hash)
   - Prioritized test cases (P0 first, then P1, P2)
   - Clear pass/fail criteria for each test case
   - A tracking table for results

### Phase B: Execute Tests

For each test case in priority order:

1. **Navigate** to the target page using browser automation
2. **Take a snapshot** (accessibility tree preferred over screenshots)
3. **Verify** the page loads correctly:
   - No console errors (check via browser console tools)
   - Expected UI elements are present
   - No blank/white screens
   - Loading states resolve properly
4. **Interact** with the page as the test case requires:
   - Click buttons, fill forms, switch modes
   - Verify responses and state changes
5. **Record** the result in the test document:
   - Status: PASS / FAIL / BLOCKED / SKIP
   - Evidence: what was observed
   - If FAIL: exact error description and reproduction steps
6. **Continue** to the next test case

### Phase C: Triage and Fix Issues

For each FAIL result:

1. **Analyze** the root cause by reading relevant source code
2. **Classify** severity: P0 (blocking), P1 (degraded), P2 (cosmetic)
3. **Fix** the issue:
   - Edit the relevant source files
   - Run type checks (`npx tsc --noEmit --project frontend/tsconfig.json` and backend)
   - Run tests (`npm run test:quick`)
4. **Record** the fix in the test document with:
   - Issue ID, description, root cause
   - Files changed, lines modified
   - Fix verification status

### Phase D: Regression & Refresh

1. **Re-test** all previously-failed test cases to confirm fixes
2. **Re-test** a sample of previously-passed cases to check for regressions
3. **Update** the test document with regression results
4. If any new failures found, go back to Phase C
5. If all clean, proceed to Phase E

### Phase E: Final Report

Update the test document with:

1. **Executive Summary**: Total tests, pass rate, issues found and fixed
2. **Test Execution Log**: Every test case with timestamped results
3. **Issues Found**: Full list with severity, description, fix status
4. **Code Changes**: Git diff summary of all fixes made
5. **Conclusion**: Overall quality assessment and remaining known issues

## Important Rules

- **Do NOT ask the user for input** during execution. Run fully autonomously.
- **Do NOT skip tests** unless technically impossible (e.g., requires payment).
- **Record EVERYTHING** - every navigation, every observation, every decision.
- **Fix issues immediately** when found - don't just report them.
- **Iterate until clean** - the loop must continue until regression passes.
- **Use parallel agents** (Task tool) for independent test groups when possible.
- **Commit fixes** only at the end after all iterations pass.
- Use **browser snapshot** (accessibility tree) as primary verification, screenshots as backup.
- If a page requires authentication, navigate to login first and authenticate.
- If browser tools are unavailable, fall back to code-level analysis with API testing via curl/fetch.

## Test Categories (Priority Order)

### P0 - Must Pass (Blocking)

- All main pages load without errors
- AI Ask: send message, receive response
- AI Ask: model switching works
- AI Ask: Mixture mode works
- Knowledge base selection and RAG query
- AI Teams: page loads, teams visible
- AI Research: page loads, projects visible
- AI Writing: page loads, projects visible

### P1 - Important (UX Impact)

- Web search toggle
- File upload and processing
- Session management (create, switch, delete)
- Cross-module navigation
- Error states and recovery
- Responsive design at common breakpoints

### P2 - Nice to Have

- Boundary conditions (empty input, long text)
- Performance benchmarks
- Accessibility compliance
- Dark mode / theme switching
