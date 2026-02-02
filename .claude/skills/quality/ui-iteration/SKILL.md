# UI Iteration Skill

Automated UI quality inspection and iterative improvement for DeepDive Engine.

## What This Skill Does

1. **Patrol**: Visits all frontend pages, captures screenshots, collects console errors, network failures, DOM snapshots, CSS issues, and accessibility problems
2. **Review**: Compares captured data against component specs (`.ui-patrol/specs/`) to identify real issues vs false positives
3. **Fix**: For high-confidence issues, generates and applies code fixes with validation
4. **Evaluate**: Tracks precision/recall metrics to improve detection accuracy over time

## Commands

```bash
npm run ui-patrol              # Full patrol
npm run ui-patrol:critical     # Critical pages only
npm run ui-patrol -- --routes "/ai-research"  # Specific routes
npm run db:seed:ui-patrol      # Seed test data
npm run db:clean:ui-patrol     # Clean test data
```

## Workflow

1. Ensure dev server is running: `npm run dev`
2. Seed test data: `npm run db:seed:ui-patrol`
3. Run patrol: `npm run ui-patrol`
4. Review report in `.ui-patrol/reports/`
5. Use `/ui-iteration` command for AI-assisted review and fix

## Fix Strategies

| Strategy | Use Case |
|----------|----------|
| null-check | Data undefined/null causing crash |
| empty-state | Missing empty state component |
| css-overflow | Text/content overflow |
| api-path | Wrong API endpoint (404) |
| loading-state | Missing loading indicator |

## Quality Metrics

- Precision >= 70% (issues found are real)
- Recall >= 50% (real issues are found)
- Fix success rate >= 60%
