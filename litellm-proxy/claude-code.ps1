<#
.SYNOPSIS
    Claude Code Mode Switcher
.DESCRIPTION
    - Default: Use Claude Pro/Max subscription
    - API Mode (-api): Use Gemini 3 Pro when subscription quota is exhausted
.EXAMPLE
    .\claude-code.ps1           # Subscription mode
    .\claude-code.ps1 -api      # API mode (Gemini 3 Pro)
#>

param(
    [switch]$api
)

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

function Load-EnvFile {
    $envFile = Join-Path $scriptPath ".env"
    if (Test-Path $envFile) {
        Get-Content $envFile -Encoding UTF8 | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim()
                [Environment]::SetEnvironmentVariable($name, $value, "Process")
            }
        }
        return $true
    }
    return $false
}

function Show-Banner {
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host "       Claude Code Mode Switcher" -ForegroundColor Cyan
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host ""
}

function Start-SubscriptionMode {
    Write-Host "  [MODE] Subscription (Claude Pro/Max)" -ForegroundColor Green
    Write-Host ""

    Remove-Item Env:ANTHROPIC_BASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:ANTHROPIC_AUTH_TOKEN -ErrorAction SilentlyContinue

    claude
}

function Start-ApiMode {
    # Load .env
    if (-not (Load-EnvFile)) {
        Write-Host "  [ERROR] .env file not found!" -ForegroundColor Red
        exit 1
    }

    # Check if LiteLLM is running
    $litellmRunning = $false
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:4000/v1/models" -Method GET -TimeoutSec 2 -Headers @{"Authorization"="Bearer $env:LITELLM_MASTER_KEY"} -ErrorAction Stop
        $litellmRunning = $true
    } catch {}

    if (-not $litellmRunning) {
        Write-Host "  [WARN] Starting LiteLLM proxy..." -ForegroundColor Yellow

        $startScript = Join-Path $scriptPath "start.ps1"
        Start-Process powershell -ArgumentList "-NoExit", "-File", $startScript

        Write-Host "  Waiting..." -ForegroundColor Gray
        Start-Sleep -Seconds 8
    }

    $env:ANTHROPIC_BASE_URL = "http://localhost:4000"
    $env:ANTHROPIC_AUTH_TOKEN = $env:LITELLM_MASTER_KEY

    Write-Host "  [MODE] API (Gemini 3 Pro)" -ForegroundColor Magenta
    Write-Host "  [PROXY] http://localhost:4000" -ForegroundColor Gray
    Write-Host ""

    claude
}

# Main
Show-Banner

if ($api) {
    Start-ApiMode
} else {
    Start-SubscriptionMode
}
