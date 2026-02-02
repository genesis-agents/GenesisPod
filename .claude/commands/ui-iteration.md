Run UI Patrol inspection and review.

## Instructions

1. Run the UI patrol to collect diagnostics:
   ```
   npm run ui-patrol
   ```

2. Read the latest report from `.ui-patrol/reports/`

3. For each issue in the report:
   - Read the screenshot at the issue's screenshotPath (use the Read tool on the PNG)
   - Read the source file indicated by codeHint or by mapping the URL to `frontend/app/` route
   - Classify the issue severity and determine if auto-fixable

4. Load component specs from `.ui-patrol/specs/` for the relevant routes

5. Compare the screenshot against the spec's expected_structure and forbidden patterns

6. Output a structured review with:
   - Issue ID, severity, category
   - Evidence (screenshot observation + console error + DOM analysis)
   - Code location (file:line)
   - Fix confidence (0-100)
   - Suggested fix (if confidence >= 70)

7. For auto-fixable issues (confidence >= 70):
   - Apply the fix using Edit tool
   - Run type-check to validate
   - Re-screenshot to verify

8. Generate summary report
