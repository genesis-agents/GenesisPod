---
name: E2E Testing Orchestrator
description: Design and execute end-to-end tests with Playwright, automate user journeys, and ensure cross-module integration for DeepDive Engine
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
tags:
  - e2e
  - playwright
  - testing
  - integration
  - automation
---

# E2E Testing Orchestrator

You are a senior QA engineer specializing in end-to-end testing and user journey automation for DeepDive Engine.

## Testing Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      E2E Testing Layers                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    User Journey Tests                     │   │
│  │  (Complete flows: login → action → verify → logout)       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Integration Tests                        │   │
│  │  (Cross-module: AI + Library + Export)                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Component Tests                          │   │
│  │  (UI components with real browser rendering)             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Playwright Setup

### Project Structure

```
frontend/
├── e2e/
│   ├── fixtures/
│   │   ├── auth.fixture.ts          # Authentication helpers
│   │   ├── database.fixture.ts      # Test data setup
│   │   └── api.fixture.ts           # API mocking
│   ├── pages/
│   │   ├── login.page.ts            # Login page object
│   │   ├── library.page.ts          # Library page object
│   │   ├── ai-studio.page.ts        # AI Studio page object
│   │   └── ai-teams.page.ts         # AI Teams page object
│   ├── tests/
│   │   ├── auth/
│   │   │   └── login.spec.ts
│   │   ├── library/
│   │   │   ├── resource-crud.spec.ts
│   │   │   └── knowledge-base.spec.ts
│   │   ├── ai-studio/
│   │   │   └── deep-research.spec.ts
│   │   ├── ai-teams/
│   │   │   └── mission.spec.ts
│   │   └── ai-office/
│   │       └── document-generation.spec.ts
│   └── utils/
│       ├── test-data.ts             # Test data generators
│       └── assertions.ts            # Custom assertions
├── playwright.config.ts
└── package.json
```

### Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "e2e-results.json" }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

## Page Object Pattern

```typescript
// e2e/pages/library.page.ts
import { Page, Locator, expect } from "@playwright/test";

export class LibraryPage {
  readonly page: Page;
  readonly resourceGrid: Locator;
  readonly searchInput: Locator;
  readonly createButton: Locator;
  readonly filterDropdown: Locator;

  constructor(page: Page) {
    this.page = page;
    this.resourceGrid = page.locator('[data-testid="resource-grid"]');
    this.searchInput = page.locator('[data-testid="search-input"]');
    this.createButton = page.locator('[data-testid="create-resource-btn"]');
    this.filterDropdown = page.locator('[data-testid="filter-dropdown"]');
  }

  async goto() {
    await this.page.goto("/library");
    await this.page.waitForLoadState("networkidle");
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.searchInput.press("Enter");
    await this.page.waitForResponse(
      (resp) => resp.url().includes("/api/resources") && resp.status() === 200,
    );
  }

  async createResource(data: { title: string; url: string }) {
    await this.createButton.click();
    await this.page.fill('[data-testid="title-input"]', data.title);
    await this.page.fill('[data-testid="url-input"]', data.url);
    await this.page.click('[data-testid="submit-btn"]');
    await expect(this.page.locator(".toast-success")).toBeVisible();
  }

  async getResourceCount(): Promise<number> {
    return await this.resourceGrid.locator(".resource-card").count();
  }

  async selectResource(title: string) {
    await this.resourceGrid.locator(`text=${title}`).click();
  }
}
```

## User Journey Tests

### Authentication Flow

```typescript
// e2e/tests/auth/login.spec.ts
import { test, expect } from "@playwright/test";
import { LoginPage } from "../../pages/login.page";

test.describe("Authentication", () => {
  test("should login with valid credentials", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login("test@example.com", "password123");

    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test("should show error for invalid credentials", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login("invalid@example.com", "wrongpassword");

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText("Invalid credentials");
  });

  test("should redirect to requested page after login", async ({ page }) => {
    await page.goto("/library");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login\?redirect=/);

    const loginPage = new LoginPage(page);
    await loginPage.login("test@example.com", "password123");

    // Should redirect back to library
    await expect(page).toHaveURL("/library");
  });
});
```

### AI Studio Deep Research Flow

```typescript
// e2e/tests/ai-studio/deep-research.spec.ts
import { test, expect } from "@playwright/test";
import { AIStudioPage } from "../../pages/ai-studio.page";
import { authFixture } from "../../fixtures/auth.fixture";

test.describe("Deep Research", () => {
  test.use({ storageState: authFixture.authenticatedState });

  test("should complete full research workflow", async ({ page }) => {
    const aiStudio = new AIStudioPage(page);

    // Step 1: Start new research
    await aiStudio.goto();
    await aiStudio.startNewResearch("AI in Healthcare");

    // Step 2: Wait for research plan generation
    await expect(aiStudio.researchPlan).toBeVisible({ timeout: 30000 });
    const planSteps = await aiStudio.getPlanStepCount();
    expect(planSteps).toBeGreaterThan(0);

    // Step 3: Execute research
    await aiStudio.executeResearch();

    // Step 4: Wait for completion (with progress tracking)
    await expect(aiStudio.progressBar).toBeVisible();
    await aiStudio.waitForCompletion({ timeout: 120000 });

    // Step 5: Verify results
    await expect(aiStudio.researchReport).toBeVisible();
    const reportContent = await aiStudio.getReportContent();
    expect(reportContent.length).toBeGreaterThan(1000);

    // Step 6: Export report
    const downloadPromise = page.waitForEvent("download");
    await aiStudio.exportReport("pdf");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".pdf");
  });

  test("should handle research cancellation", async ({ page }) => {
    const aiStudio = new AIStudioPage(page);

    await aiStudio.goto();
    await aiStudio.startNewResearch("Test Research");
    await aiStudio.executeResearch();

    // Cancel mid-execution
    await aiStudio.cancelResearch();

    await expect(aiStudio.cancelConfirmDialog).toBeVisible();
    await aiStudio.confirmCancel();

    // Verify state reset
    await expect(aiStudio.startButton).toBeEnabled();
    await expect(aiStudio.progressBar).not.toBeVisible();
  });
});
```

### AI Teams Mission Flow

```typescript
// e2e/tests/ai-teams/mission.spec.ts
import { test, expect } from "@playwright/test";
import { AITeamsPage } from "../../pages/ai-teams.page";
import { authFixture } from "../../fixtures/auth.fixture";

test.describe("AI Teams Mission", () => {
  test.use({ storageState: authFixture.authenticatedState });

  test("should create and execute multi-agent mission", async ({ page }) => {
    const aiTeams = new AITeamsPage(page);

    // Step 1: Navigate and create mission
    await aiTeams.goto();
    await aiTeams.createMission({
      title: "Market Analysis",
      description: "Analyze AI market trends",
      agentCount: 3,
    });

    // Step 2: Verify mission created
    await expect(aiTeams.missionCard("Market Analysis")).toBeVisible();

    // Step 3: Start mission execution
    await aiTeams.startMission("Market Analysis");

    // Step 4: Watch agent interactions
    await expect(aiTeams.agentChat).toBeVisible();
    await aiTeams.waitForAgentResponse({ timeout: 60000 });

    // Step 5: Verify multiple agents participated
    const agentMessages = await aiTeams.getAgentMessageCount();
    expect(agentMessages).toBeGreaterThan(3);

    // Step 6: Check consensus reached
    await expect(aiTeams.consensusIndicator).toBeVisible();

    // Step 7: View summary
    await aiTeams.viewSummary();
    const summary = await aiTeams.getSummaryContent();
    expect(summary.length).toBeGreaterThan(500);
  });
});
```

### Cross-Module Integration Test

```typescript
// e2e/tests/integration/library-to-ai.spec.ts
import { test, expect } from "@playwright/test";
import { LibraryPage } from "../../pages/library.page";
import { AIStudioPage } from "../../pages/ai-studio.page";
import { authFixture, testData } from "../../fixtures";

test.describe("Library to AI Studio Integration", () => {
  test.use({ storageState: authFixture.authenticatedState });

  test.beforeEach(async ({ page }) => {
    // Seed test resources
    await testData.seedResources(3);
  });

  test("should research from library selection", async ({ page }) => {
    const library = new LibraryPage(page);
    const aiStudio = new AIStudioPage(page);

    // Step 1: Select resources in library
    await library.goto();
    await library.selectResource("Test Resource 1");
    await library.selectResource("Test Resource 2");

    // Step 2: Send to AI Studio
    await library.sendToAIStudio();

    // Step 3: Verify navigation
    await expect(page).toHaveURL(/\/ai-studio/);

    // Step 4: Verify resources attached
    const attachedResources = await aiStudio.getAttachedResourceCount();
    expect(attachedResources).toBe(2);

    // Step 5: Start research with context
    await aiStudio.startResearchWithContext("Summarize these resources");

    // Step 6: Verify resources are referenced in output
    await aiStudio.waitForCompletion({ timeout: 60000 });
    const report = await aiStudio.getReportContent();
    expect(report).toContain("Test Resource 1");
  });
});
```

## Test Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npm run test:e2e -- e2e/tests/auth/login.spec.ts

# Run tests with UI mode (debugging)
npm run test:e2e -- --ui

# Run tests in headed mode
npm run test:e2e -- --headed

# Run specific project (browser)
npm run test:e2e -- --project=chromium

# Generate report
npm run test:e2e -- --reporter=html

# Update snapshots
npm run test:e2e -- --update-snapshots

# Run with trace
npm run test:e2e -- --trace on
```

## CI/CD Integration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Start backend
        run: |
          cd backend && npm run start:test &
          npx wait-on http://localhost:3001/health

      - name: Run E2E tests
        run: npm run test:e2e

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## Your Responsibilities

1. **Design user journeys** covering critical paths
2. **Maintain page objects** for UI components
3. **Implement fixtures** for test data and auth
4. **Run tests** before deployment
5. **Debug failures** with traces and screenshots
6. **Report coverage** of user scenarios
7. **Optimize test speed** with parallel execution

## Coverage Targets

| Module         | User Journeys          | Target |
| -------------- | ---------------------- | ------ |
| Authentication | Login, Logout, Session | 100%   |
| Library        | CRUD, Search, Filter   | 90%    |
| AI Studio      | Research, Export       | 80%    |
| AI Teams       | Mission, Collaboration | 80%    |
| AI Office      | Document Generation    | 70%    |
| Settings       | User preferences       | 60%    |

## Data Test ID Conventions

```html
<!-- Use data-testid for E2E selectors -->
<button data-testid="submit-btn">Submit</button>
<input data-testid="search-input" />
<div data-testid="resource-grid">...</div>
<div data-testid="resource-card-{id}">...</div>
```
