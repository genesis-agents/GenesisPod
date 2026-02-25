#!/usr/bin/env pwsh
# 性能优化提交推送脚本 — 执行完自动删除自身
Set-Location $PSScriptRoot

$files = @(
    "backend/src/modules/integrations/google-drive/services/google-drive-auth.service.ts",
    "backend/src/modules/content/collections/collections.service.ts",
    "backend/src/modules/ai-app/topic-insights/services/core/topic-crud.service.ts",
    "backend/prisma/schema/models.prisma",
    "backend/prisma/migrations/20260224_add_performance_indexes/migration.sql",
    "frontend/stores/user/creditsStore.ts"
)

Write-Host "=== Staging files ===" -ForegroundColor Cyan
foreach ($f in $files) { git add $f; Write-Host "  + $f" }

Write-Host "`n=== Committing ===" -ForegroundColor Cyan
$msg = @"
perf(api): fix slow page load - 6 api endpoints optimized

- google-drive: non-blocking token refresh (fire-and-forget), add
  tokenExpired flag so frontend can detect refresh-in-progress state
- collections/tags: replace full JS aggregation with PostgreSQL
  jsonb_array_elements_text(), filter empty arrays at DB level
- collections/list: use _count for itemCount, limit items preview
  to 10 rows to eliminate full eager load
- topic-insights: consolidate 3-step permission query into single
  Prisma OR clause, eliminating 2 extra db round-trips per request
- credits: add in-flight deduplication in fetchBalance and
  fetchCheckinStatus to prevent duplicate concurrent requests
- db: add compound indexes on collections/collection_items, remove
  ineffective TopicCollaborator(userId,isActive) index

Co-Authored-By: Jason Duan <hello.junjie.duan@gmail.com>
"@
git commit -m $msg
if ($LASTEXITCODE -ne 0) { Write-Host "Commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Pulling rebase ===" -ForegroundColor Cyan
git pull --rebase origin main
if ($LASTEXITCODE -ne 0) { Write-Host "Rebase failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Pushing ===" -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) { Write-Host "Push failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Done! ===" -ForegroundColor Green
Remove-Item $PSScriptRoot/push-perf-fix.ps1
