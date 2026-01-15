# DeepDive Engine - CI Monitor (PowerShell)
# 监控 GitHub Actions CI 执行状态
# 用法: .\.claude\tools\monitor-ci.ps1 [branch]

param(
    [Parameter(Position=0)]
    [string]$Branch = ""
)

# 获取当前分支
if ([string]::IsNullOrWhiteSpace($Branch)) {
    $Branch = git branch --show-current 2>&1
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "CI/CD Monitor"
Write-Host "========================================="
Write-Host ""
Write-Host "Branch: $Branch"
Write-Host ""

# 检查 gh CLI 是否已安装
try {
    $ghVersion = gh --version 2>&1
    Write-Host "Using GitHub CLI: $($ghVersion[0])" -ForegroundColor Gray
} catch {
    Write-Host "✗ GitHub CLI (gh) not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install GitHub CLI:"
    Write-Host "  winget install GitHub.cli"
    Write-Host "  or visit: https://cli.github.com/"
    exit 1
}

# 检查认证状态
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Not authenticated with GitHub" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run: gh auth login"
    exit 1
}

Write-Host ""
Write-Host "▶ Fetching workflow runs..." -ForegroundColor Yellow
Write-Host ""

# 获取最近的 workflow runs
$runs = gh run list --branch $Branch --limit 5 --json status,conclusion,name,createdAt,databaseId 2>&1 | ConvertFrom-Json

if ($runs.Count -eq 0) {
    Write-Host "No workflow runs found for branch '$Branch'" -ForegroundColor Yellow
    exit 0
}

Write-Host "Recent CI Runs:" -ForegroundColor Cyan
Write-Host ""

foreach ($run in $runs) {
    $status = $run.status
    $conclusion = $run.conclusion
    $name = $run.name
    $created = [DateTime]::Parse($run.createdAt).ToString("yyyy-MM-dd HH:mm")

    if ($status -eq "completed") {
        if ($conclusion -eq "success") {
            Write-Host "  ✓ $name - $created" -ForegroundColor Green
        } elseif ($conclusion -eq "failure") {
            Write-Host "  ✗ $name - $created" -ForegroundColor Red
        } else {
            Write-Host "  ⚠ $name ($conclusion) - $created" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ⏳ $name ($status) - $created" -ForegroundColor Yellow
    }
}

# 检查是否有正在运行的
$inProgress = $runs | Where-Object { $_.status -eq "in_progress" -or $_.status -eq "queued" }

if ($inProgress.Count -gt 0) {
    Write-Host ""
    Write-Host "▶ Monitoring in-progress run..." -ForegroundColor Yellow
    Write-Host ""

    $runId = $inProgress[0].databaseId

    # 轮询状态
    $maxWait = 30  # 最多等待 30 分钟
    $waited = 0
    $pollInterval = 30  # 每 30 秒检查一次

    while ($waited -lt ($maxWait * 60)) {
        $currentRun = gh run view $runId --json status,conclusion,jobs 2>&1 | ConvertFrom-Json

        if ($currentRun.status -eq "completed") {
            Write-Host ""
            if ($currentRun.conclusion -eq "success") {
                Write-Host "✓ CI Pipeline Completed Successfully!" -ForegroundColor Green
            } else {
                Write-Host "✗ CI Pipeline Failed: $($currentRun.conclusion)" -ForegroundColor Red
            }
            break
        }

        # 显示当前 jobs 状态
        Write-Host "`r⏳ Waiting... ($waited seconds elapsed)" -NoNewline -ForegroundColor Yellow

        Start-Sleep -Seconds $pollInterval
        $waited += $pollInterval
    }

    if ($waited -ge ($maxWait * 60)) {
        Write-Host ""
        Write-Host "⚠ Timeout: CI still running after $maxWait minutes" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "For more details, run:"
Write-Host "  gh run list --branch $Branch"
Write-Host "  gh run view <run-id>"
