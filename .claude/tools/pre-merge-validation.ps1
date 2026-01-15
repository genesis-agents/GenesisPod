# DeepDive Engine - Pre-Merge Validation (PowerShell)
# 合并前验证脚本
# 用法: .\.claude\tools\pre-merge-validation.ps1 [target-branch]

param(
    [Parameter(Position=0)]
    [string]$TargetBranch = "develop"
)

$ErrorActionPreference = "Continue"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Pre-Merge Validation"
Write-Host "========================================="
Write-Host ""
Write-Host "Target branch: $TargetBranch"
Write-Host ""

$Errors = 0

# 1. Git 状态检查
Write-Host "▶ Checking git status..." -ForegroundColor Yellow
$gitStatus = git status --porcelain 2>&1
if ([string]::IsNullOrWhiteSpace($gitStatus)) {
    Write-Host "  ✓ Working directory clean" -ForegroundColor Green
} else {
    Write-Host "  ✗ Uncommitted changes detected" -ForegroundColor Red
    Write-Host "    Please commit or stash your changes first"
    $Errors++
}

# 2. 分支检查
Write-Host "▶ Checking current branch..." -ForegroundColor Yellow
$currentBranch = git branch --show-current 2>&1
if ($currentBranch -eq $TargetBranch) {
    Write-Host "  ✗ Cannot merge $TargetBranch to itself" -ForegroundColor Red
    $Errors++
} else {
    Write-Host "  ✓ Current branch: $currentBranch" -ForegroundColor Green
}

# 3. 远程同步检查
Write-Host "▶ Fetching remote..." -ForegroundColor Yellow
git fetch origin 2>&1 | Out-Null
Write-Host "  ✓ Remote fetched" -ForegroundColor Green

# 4. 合并冲突检测
Write-Host "▶ Checking for merge conflicts..." -ForegroundColor Yellow
$mergeBase = git merge-base $currentBranch "origin/$TargetBranch" 2>&1
$mergeResult = git merge-tree $mergeBase $currentBranch "origin/$TargetBranch" 2>&1
if ($mergeResult -match "<<<<<<") {
    Write-Host "  ✗ Merge conflicts detected" -ForegroundColor Red
    Write-Host "    Please resolve conflicts first"
    $Errors++
} else {
    Write-Host "  ✓ No merge conflicts" -ForegroundColor Green
}

# 5. TypeScript 类型检查
Write-Host "▶ Running TypeScript type check..." -ForegroundColor Yellow
$typeCheckResult = npm run type-check 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ TypeScript check passed" -ForegroundColor Green
} else {
    Write-Host "  ✗ TypeScript errors found" -ForegroundColor Red
    $Errors++
}

# 6. 快速测试
Write-Host "▶ Running quick tests..." -ForegroundColor Yellow
$testResult = npm run test:quick 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Quick tests passed" -ForegroundColor Green
} else {
    Write-Host "  ✗ Tests failed" -ForegroundColor Red
    $Errors++
}

# 7. 提交信息检查
Write-Host "▶ Validating commit messages..." -ForegroundColor Yellow
$commits = git log "origin/$TargetBranch..$currentBranch" --oneline 2>&1
$commitCount = ($commits | Measure-Object -Line).Lines
Write-Host "  Found $commitCount commit(s) to merge" -ForegroundColor Gray

$commitPattern = "^[a-f0-9]+\s(feat|fix|refactor|test|docs|chore|perf|ci|style|revert)(\([a-z-]+\))?:\s.+"
$invalidCommits = $commits | Where-Object { $_ -notmatch $commitPattern }

if ($invalidCommits.Count -eq 0) {
    Write-Host "  ✓ All commit messages follow convention" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Some commits don't follow convention:" -ForegroundColor Yellow
    $invalidCommits | ForEach-Object { Write-Host "    - $_" -ForegroundColor Gray }
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Validation Result"
Write-Host "========================================="
Write-Host ""

if ($Errors -eq 0) {
    Write-Host "✓ All pre-merge checks passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Ready to merge '$currentBranch' into '$TargetBranch'"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. git checkout $TargetBranch"
    Write-Host "  2. git pull origin $TargetBranch"
    Write-Host "  3. git merge --no-ff $currentBranch"
    Write-Host "  4. git push origin $TargetBranch"
    exit 0
} else {
    Write-Host "✗ Pre-merge validation failed with $Errors error(s)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please fix the issues above before merging."
    exit 1
}
