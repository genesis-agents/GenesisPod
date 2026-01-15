# DeepDive Engine - 全面代码检查工具 (PowerShell)
# 用法: .\.claude\tools\check-all.ps1

$ErrorActionPreference = "Continue"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "DeepDive Engine - Code Quality Check"
Write-Host "========================================="
Write-Host ""

# 检查计数器
$script:TotalChecks = 0
$script:PassedChecks = 0
$script:FailedChecks = 0

function Check-Start {
    param([string]$Message)
    Write-Host "▶ $Message" -ForegroundColor Yellow
    $script:TotalChecks++
}

function Check-Pass {
    param([string]$Message)
    Write-Host "  ✓ $Message" -ForegroundColor Green
    $script:PassedChecks++
}

function Check-Fail {
    param([string]$Message)
    Write-Host "  ✗ $Message" -ForegroundColor Red
    $script:FailedChecks++
}

# ==================== Frontend Checks ====================
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "Frontend (Next.js) Checks"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

if (Test-Path "frontend") {
    Push-Location frontend

    # ESLint检查
    Check-Start "Running ESLint..."
    $result = npm run lint 2>&1
    if ($LASTEXITCODE -eq 0) {
        Check-Pass "ESLint passed"
    } else {
        Check-Fail "ESLint failed - Run 'npm run lint' in frontend/ to see details"
    }

    # TypeScript类型检查
    Check-Start "Running TypeScript type check..."
    $result = npx tsc --noEmit 2>&1
    if ($LASTEXITCODE -eq 0) {
        Check-Pass "TypeScript type check passed"
    } else {
        Check-Fail "TypeScript errors found - Run 'npx tsc --noEmit' in frontend/ to see details"
    }

    # 测试
    Check-Start "Running tests..."
    $result = npm test -- --passWithNoTests 2>&1
    if ($LASTEXITCODE -eq 0) {
        Check-Pass "Tests passed"
    } else {
        Check-Fail "Tests failed - Run 'npm test' in frontend/ to see details"
    }

    Pop-Location
} else {
    Check-Fail "Frontend directory not found"
}

Write-Host ""

# ==================== Backend Checks ====================
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "Backend (NestJS) Checks"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

if (Test-Path "backend") {
    Push-Location backend

    # ESLint检查
    Check-Start "Running ESLint..."
    $result = npm run lint 2>&1
    if ($LASTEXITCODE -eq 0) {
        Check-Pass "ESLint passed"
    } else {
        Check-Fail "ESLint failed - Run 'npm run lint' in backend/ to see details"
    }

    # TypeScript类型检查
    Check-Start "Running TypeScript type check..."
    $result = npx tsc --noEmit 2>&1
    if ($LASTEXITCODE -eq 0) {
        Check-Pass "TypeScript type check passed"
    } else {
        Check-Fail "TypeScript errors found - Run 'npx tsc --noEmit' in backend/ to see details"
    }

    # Prisma检查
    Check-Start "Validating Prisma schema..."
    $result = npx prisma validate 2>&1
    if ($LASTEXITCODE -eq 0) {
        Check-Pass "Prisma schema valid"
    } else {
        Check-Fail "Prisma schema invalid - Run 'npx prisma validate' in backend/ to see details"
    }

    # 测试
    Check-Start "Running tests..."
    $result = npm test -- --passWithNoTests 2>&1
    if ($LASTEXITCODE -eq 0) {
        Check-Pass "Tests passed"
    } else {
        Check-Fail "Tests failed - Run 'npm test' in backend/ to see details"
    }

    Pop-Location
} else {
    Check-Fail "Backend directory not found"
}

Write-Host ""

# ==================== Git Checks ====================
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "Git Checks"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

# 检查未提交的更改
Check-Start "Checking for uncommitted changes..."
$gitStatus = git status --porcelain 2>&1
if ([string]::IsNullOrWhiteSpace($gitStatus)) {
    Check-Pass "No uncommitted changes"
} else {
    Check-Fail "Uncommitted changes detected - Commit or stash before deploying"
}

# 检查分支
Check-Start "Checking current branch..."
$currentBranch = git branch --show-current 2>&1
if ($currentBranch -eq "main" -or $currentBranch -eq "master") {
    Check-Fail "On main/master branch - Create a feature branch for development"
} else {
    Check-Pass "On feature branch: $currentBranch"
}

Write-Host ""

# ==================== 总结 ====================
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Summary"
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Total checks: $script:TotalChecks"
Write-Host "Passed: $script:PassedChecks" -ForegroundColor Green
Write-Host "Failed: $script:FailedChecks" -ForegroundColor Red
Write-Host ""

if ($script:FailedChecks -eq 0) {
    Write-Host "✓ All checks passed! Code is ready for review." -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ Some checks failed. Please fix the issues above." -ForegroundColor Red
    exit 1
}
