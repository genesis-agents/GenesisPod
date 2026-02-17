# UI Iteration Skill - Full-Spectrum Test Orchestrator

Fully autonomous test-fix-retest cycle covering **all 8 testing dimensions**: unit tests, integration, combination matrix, performance, DFX quality, security, browser E2E, and best practices. **100% coverage** of master test plan (~630 cases).

## What This Skill Does

Executes a complete **autonomous full-spectrum test cycle** against the master test plan (~630 cases):

```
┌─────────────────────────────────────────────────────┐
│  Phase A0: Environment Auto-Detection               │
│  - Verify local services (ports 3000, 4000)         │
│  - Discover frontend routes and API endpoints       │
│  - Record environment snapshot                      │
├─────────────────────────────────────────────────────┤
│  Phase A1: Authentication Setup              [NEW]  │
│  - Obtain test auth token (env / API / browser)     │
│  - Validate token, store for all subsequent phases  │
│  - Fallback: mark auth-required tests as SKIP       │
├─────────────────────────────────────────────────────┤
│  Phase A2: Test Data Setup                   [NEW]  │
│  - Seed test data via npm run db:seed:ui-patrol     │
├─────────────────────────────────────────────────────┤
│  Phase A: Initialize & Plan                         │
│  - Read master test plan (2026-02-06, ~630 cases)   │
│  - Initialize coverage tracker with all test IDs    │
│  - Create dated report                              │
├─────────────────────────────────────────────────────┤
│  *** Circuit Breaker active from here ***           │
│  - tsc errors >10 → ABORT to Phase H               │
│  - Unit test failure >30% → SKIP D/E/F             │
│  - Homepage white screen → SKIP all E2E            │
├─────────────────────────────────────────────────────┤
│  Phase B: Backend Automated Tests                   │
│  B1: Jest unit tests (with known failures registry) │
│  B2: Quick test suite                               │
│  B3: Static analysis (TypeScript, Lint)             │
│  B4: Database schema validation              [NEW]  │
├─────────────────────────────────────────────────────┤
│  Phase C: Frontend Automated Tests                  │
│  C1: Vitest component/hook/store tests              │
│  C2: Frontend coverage gap analysis          [NEW]  │
├─────────────────────────────────────────────────────┤
│  Phase D: API Integration Tests                     │
│  D0: API route discovery                            │
│  D1: Health & auth chain validation                 │
│  D2: Core AI API endpoint verification              │
│  D3: Security probes (XSS, injection, CSRF, SSRF)  │
├─────────────────────────────────────────────────────┤
│  Phase E: Browser E2E Tests                         │
│  E0: UI Patrol runner (preferred path)       [NEW]  │
│  E1: Page loading patrol (73 routes, fallback)      │
│  E2: Functional journey tests (19 journeys)         │
│  E3: Boundary & edge case tests (14 scenarios)      │
│  E4: Responsive design tests (5 viewports)          │
│  E5: i18n verification (zh-CN / en-US)       [NEW]  │
├─────────────────────────────────────────────────────┤
│  Phase F: Performance Tests                         │
│  F1: Page load metrics (FCP, TTI)                   │
│  F2: API response time (16 endpoints)               │
│  F3: Concurrent request testing                     │
│  F4: Throughput & stress tests                      │
│  F5: Resource monitoring                            │
│  F6: Large data volume tests                        │
├─────────────────────────────────────────────────────┤
│  Phase G: DFX Quality Tests                         │
│  G1: Reliability (refresh, back, reconnect)         │
│  G2: Security audit (npm audit, HTTPS, data leak)   │
│  G3: Maintainability (coverage, lint, hardcoding)   │
│  G4: Observability (health, logging, tracing)       │
│  G5: Usability (8 DFX-U checks)                    │
│  G6: Best practices (OWASP, 12-Factor, pyramid)    │
│  G7: Browser compatibility (7 browsers/devices)     │
├─────────────────────────────────────────────────────┤
│  Phase H: Triage & Fix                              │
│  - Analyze root cause, classify severity            │
│  - Apply fixes + type check + test                  │
│  - Safety guardrails (max 10 fixes, 50 lines each)  │
│  - Forbidden: changing assertions, @ts-ignore  [NEW]│
├─────────────────────────────────────────────────────┤
│  Phase I: Regression & Refresh                      │
│  - Re-test failed cases, spot-check passed cases    │
│  - Loop back to H if new failures (max 3 rounds)   │
├─────────────────────────────────────────────────────┤
│  Phase J: Final Report                              │
│  - Multi-run trend analysis (not just prev)    [NEW]│
│  - Executive summary with known failures split [NEW]│
│  - ROI-prioritized recommendations            [NEW]│
│  - Change archival (git diff)                  [NEW]│
│  - Test data cleanup                           [NEW]│
│  - Quality gate (with regression check)        [NEW]│
└─────────────────────────────────────────────────────┘
```

## Usage

Invoke via Claude Code slash command:

```
/ui-iteration
```

The skill runs **fully autonomously** - no human input needed during execution.

## Test Plan Coverage Mapping

### Master Test Plan: `comprehensive-test-plan-2026-02-06.md` (~630 cases)

| Test Plan Section           | Cases    | Covered By Phase                               | Coverage |
| --------------------------- | -------- | ---------------------------------------------- | -------- |
| 2.1 AI Engine (Unit)        | ~60      | Phase B (Jest) - 35+ spec file mappings        | 100%     |
| 2.2 AI Apps (Integration)   | ~80      | Phase B + D + E (18 journey files)             | 100%     |
| 2.3 Content (Integration)   | ~10      | Phase D + E (search-library, explore journeys) | 100%     |
| 2.4 Core (Unit/Integration) | ~15      | Phase B + D (auth, credits, admin)             | 100%     |
| 2.5 Frontend (Unit)         | ~20      | Phase C (Vitest)                               | 100%     |
| 3.1 Ask Combinations        | ~25      | Phase E (ask-combinations scenarios)           | 100%     |
| 3.2 Cross-Module            | ~25      | Phase E (cross-module-integration scenarios)   | 100%     |
| 3.3 E2E Scenarios           | ~8       | Phase E (8 E2E journeys)                       | 100%     |
| 3.1.2 File Types            | ~8       | Phase E (ask-combination-matrix journey)       | 100%     |
| 3.1.3 Context Switching     | ~7       | Phase E (ask-conversation journey)             | 100%     |
| 3.2.5 Auth Chain            | ~3       | Phase D (D1 auth chain)                        | 100%     |
| 4.1 Response Time           | ~16      | Phase F2 (16 API endpoints)                    | 100%     |
| 4.2 Concurrency             | ~8       | Phase F3 + F4                                  | 100%     |
| 4.3 Throughput              | ~4       | Phase F4 (throughput scenarios)                | 100%     |
| 4.4 Large Data              | ~6       | Phase F6 (data volume scenarios)               | 100%     |
| 4.5 Resource Monitoring     | ~6       | Phase F5 (resource scenarios)                  | 100%     |
| 5.1 Usability               | ~8       | Phase G5 (usability-walkthrough scenarios)     | 100%     |
| 5.2 Reliability             | ~12      | Phase G1                                       | 100%     |
| 5.3 Security                | ~15      | Phase G2 + D3 (security-checks scenarios)      | 100%     |
| 5.4 Maintainability         | ~8       | Phase G3                                       | 100%     |
| 5.5 Observability           | ~6       | Phase G4                                       | 100%     |
| 5.6 Responsive              | ~7       | Phase E4 + G7 (compatibility scenarios)        | 100%     |
| 5.7 Compatibility           | ~6       | Phase G7 (compatibility-browser scenarios)     | 100%     |
| 6. Best Practices           | ~30      | Phase G6 (23 audit items)                      | 100%     |
| **Total**                   | **~630** | **Phases B-G**                                 | **100%** |

## Key Files

| File                                                                          | Purpose                                                    |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `.claude/commands/ui-iteration.md`                                            | Slash command prompt (full instructions)                   |
| `docs/guides/testing/test-cases/comprehensive-test-plan-2026-02-06.md`        | Master test plan (~630 cases)                              |
| `docs/guides/testing/test-cases/comprehensive-combination-test-2026-01-25.md` | Previous baseline                                          |
| `docs/guides/testing/test-results/ui-iteration-{date}.md`                     | Output test reports                                        |
| `.ui-patrol/config.yaml`                                                      | UI patrol config (73 routes, 11-level quality + baselines) |
| `.ui-patrol/specs/*.yaml`                                                     | Page structure specs (25 specs)                            |
| `.ui-patrol/journeys/*.yaml`                                                  | User journey definitions (19 journeys)                     |
| `.ui-patrol/scenarios/*.yaml`                                                 | Test scenarios (11 scenario files)                         |

## Test Environment

- **Local**: Unit/integration tests, static analysis
- **Production**: Browser E2E, API integration, performance
- **URL**: http://localhost:3000 (local) / https://genesis-ai-engine.up.railway.app (prod)
- **Backend Port**: 4000 (local)
- **Browser**: Playwright MCP (primary), Chrome DevTools MCP (fallback)
- **Fallback**: Code-level analysis + API testing via curl

## Journey & Scenario Inventory

### 19 Journey Files

| Journey                                   | Covers                           |
| ----------------------------------------- | -------------------------------- |
| `ai-ask-conversation.journey.yaml`        | ASK-001~020, CMB-CTX-001~007     |
| `ai-ask-combination-matrix.journey.yaml`  | CMB-ASK-001~010, CMB-FT-001~008  |
| `ai-ask-mixture.journey.yaml`             | ASK-007, CMB-ASK-007/010         |
| `create-research-topic.journey.yaml`      | RES-001~006, E2E-001             |
| `ai-teams-collaboration.journey.yaml`     | TMS-001~008, E2E-003             |
| `ai-writing-workflow.journey.yaml`        | WRT-001~006, E2E-004             |
| `ai-office-slides.journey.yaml`           | OFC-001~007, E2E-005             |
| `ai-image-generation.journey.yaml`        | IMG-001~006                      |
| `ai-social-content.journey.yaml`          | SOC-001~003                      |
| `ai-rag-knowledge.journey.yaml`           | RAG-001~005                      |
| `knowledge-base-to-ask.journey.yaml`      | INT-KA-001~005, E2E-002          |
| `explore-to-library-to-ask.journey.yaml`  | INT-ELA-001~003, E2E-DF-001      |
| `cross-module-data-flow.journey.yaml`     | INT-RLA-001~003, INT-TRW-001~003 |
| `e2e-new-user-onboarding.journey.yaml`    | E2E-007                          |
| `e2e-image-writing-workflow.journey.yaml` | E2E-008                          |
| `search-library.journey.yaml`             | RES-R-002~006                    |
| `research-topic-all-tabs.journey.yaml`    | RES-007~009                      |
| `admin-monitoring-check.journey.yaml`     | ADM-001~003                      |
| `full-site-i18n-check.journey.yaml`       | i18n coverage                    |

### 11 Scenario Files

| Scenario                                  | Covers                                            |
| ----------------------------------------- | ------------------------------------------------- |
| `ask-combinations.scenarios.yaml`         | CMB-ASK, CMB-FT, CMB-CTX                          |
| `boundary-conditions.scenarios.yaml`      | BND-001~006, BND-F, BND-C, BND-N                  |
| `security-checks.scenarios.yaml`          | DFX-S-001~015                                     |
| `performance-benchmarks.scenarios.yaml`   | PERF-RT, PERF-CC, PERF-BD-001~003                 |
| `cross-module-integration.scenarios.yaml` | INT-_, E2E-_                                      |
| `usability-walkthrough.scenarios.yaml`    | DFX-U-001~008                                     |
| `compatibility-browser.scenarios.yaml`    | DFX-CP-001~006, DFX-RD-007                        |
| `throughput-resource.scenarios.yaml`      | PERF-TP-001~004, PERF-RS-001~006, PERF-BD-004~006 |
| `ai-research.scenarios.yaml`              | Research page scenarios                           |
| `ai-teams.scenarios.yaml`                 | Teams page scenarios                              |
| `library.scenarios.yaml`                  | Library page scenarios                            |

## Test Scope by Priority

### P0 - Blocking (Must Pass for Release) ~170 cases

**Backend (~55)**: AI Engine core (LLM, TaskProfile, Fallback, CircuitBreaker, Memory, Orchestration, Constraints, Tools, Skills, Facade), Auth, Credits, Research/Teams/Writing core services
**Frontend (~10)**: Core hooks, P0 components (ResearchTimeline, TopicContentPanel null safety)
**API (~10)**: Auth chain, health endpoint, core AI API responses
**Browser (~35)**: All page loads, Ask core flow, Knowledge base integration, Mixture mode
**Combinations (~18)**: Model x feature matrix (top 3), context switching, KB→Ask, file types
**E2E (~3)**: Research→Report, KB workflow, Teams decision
**Security (~12)**: XSS, SQL injection, Prompt injection, CSRF, file upload, data leak
**Reliability (~8)**: Refresh, back, network disconnect, data persistence, WebSocket
**Maintainability (~5)**: Type check, lint, build, no hardcoded config
**Usability (~2)**: Loading states, error recovery
**Performance (~14)**: FCP, TTI, TTFB, concurrency
**Responsive (~2)**: Desktop 1080p, 768p
**Compatibility (~1)**: Chrome latest

### P1 - Important (UX Impact) ~280 cases

All remaining test IDs from sections 2-5 not listed in P0 or P2.

### P2 - Nice to Have ~80 cases

Section 6 best practices audits, mobile responsive, visual regression, accessibility deep audit, chaos engineering, low-priority file types, rare edge cases.

## Automation Principles

1. **Zero human intervention** - runs start-to-finish autonomously
2. **Full-spectrum coverage** - not just UI, covers unit/integration/API/performance/DFX/security
3. **Fix immediately** - don't just report issues, fix them in code
4. **Map to test plan** - every result maps to a test plan ID
5. **Iterate until clean** - loop until regression passes (max 3 rounds)
6. **Parallel execution** - 4 parallel groups with explicit agent assignment and file whitelists
7. **Safety guardrails** - max 10 fixes, 50 lines each, type-check required, forbidden fix patterns enforced
8. **Record everything** - every action, observation, decision logged
9. **100% ID coverage** - every test plan ID assigned to a phase, journey, or scenario
10. **Environment-aware** - auto-detect running services, discover routes and API endpoints before testing
11. **Circuit breaker** - early termination when fundamental problems exist (tsc errors, >30% unit test failure, white screen)
12. **Timeout controls** - strict per-phase and per-test timeouts prevent infinite hangs (60min total)
13. **Known failures registry** - separate pre-existing failures from new regressions for clean signal
14. **Leverage existing infra** - use UI Patrol runners before falling back to manual Playwright MCP
15. **Trend analysis** - compare across all historical runs, not just the previous one

## Output Format

The test report (`docs/guides/testing/test-results/ui-iteration-{date}.md`) contains:

1. **Trend & Comparison**: Multi-run trend table + diff vs previous (new regressions, newly passing)
2. **Executive Summary**: Executed, passed, new failures, known failures, fixed, skipped, circuit breaker status
3. **Coverage by Section**: Progress against each test plan section
4. **Test ID Tracking Table**: Every test plan ID with PASS/FAIL/KNOWN_FAIL/SKIP status
5. **Issues Log**: Every bug found with root cause, severity, fix, persistent/chronic flag
6. **Code Changes**: Files modified + archived diff file
7. **Quality Gate Assessment**: Release readiness checklist (with regression + known failures checks)
8. **Prioritized Recommendations**: ROI-ranked action items with impact, effort, and blocked test count
